# services/workers/app/tasks/reports.py

from __future__ import annotations
import json
import logging
from datetime import datetime, timezone
from typing import Any

from app.celery_app import app
from app.config import settings
from app.db.client import get_db
from app.db.models import Asset, ConsentRecord, Finding, Policy, Report, RightsRequest, Scan, Tenant
from app.tasks.report_html import render_report_html

logger = logging.getLogger(__name__)


@app.task(
    name="app.tasks.reports.generate_report",
    queue="reports",
    bind=True,
    max_retries=1,
)
def generate_report(self, report_id: str, tenant_id: str) -> dict[str, Any]:
    """
    Generate a compliance report and persist the result.
    Content is assembled from PostgreSQL; the JSON blob is uploaded to S3.
    """
    logger.info("Generating report %s for tenant %s", report_id, tenant_id)

    with get_db(tenant_id=tenant_id) as db:
        report = db.query(Report).filter(
            Report.id == report_id,
            Report.tenant_id == tenant_id,
        ).first()
        if not report:
            logger.error("Report %s not found", report_id)
            return {"status": "failed", "error": "report not found"}

        try:
            content = _build_content(db, report, tenant_id)
            content_json = json.dumps(content, indent=2, default=str)
            content_html = render_report_html(content, report)
            file_size = len(content_json.encode("utf-8"))
            file_url = _upload(content_json, report, tenant_id)

            report.status = "ready"
            report.content = content_json
            report.content_html = content_html
            report.file_url = file_url
            report.file_size_bytes = file_size
            db.commit()

            logger.info("Report %s ready: %s (%d bytes)", report_id, file_url or "db", file_size)
            return {"status": "ready", "report_id": report_id, "file_url": file_url}

        except Exception as exc:
            logger.exception("Report %s failed: %s", report_id, exc)
            report.status = "failed"
            db.commit()
            return {"status": "failed", "report_id": report_id, "error": str(exc)}


# ---------------------------------------------------------------------------
# Content builders
# ---------------------------------------------------------------------------

def _build_content(db, report: Report, tenant_id: str) -> dict[str, Any]:
    rtype = report.report_type
    content: dict[str, Any] = {
        "report_id":    report.id,
        "report_type":  rtype,
        "title":        report.title,
        "tenant_id":    tenant_id,
        "organisation": _tenant_name(db, tenant_id),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "period":       _period(report.parameters or {}),
        "parameters":   report.parameters or {},
    }

    if rtype == "dpdp_compliance":
        assets   = _assets(db, tenant_id)
        findings = _findings_summary(db, tenant_id)
        checks   = _compliance_checks(db, tenant_id)
        content["overview"]          = _overview(assets, findings)
        content["compliance_rating"] = _overall_rating(checks)
        content["compliance_checks"] = checks
        content["asset_breakdown"]   = _asset_breakdown(assets)
        content["assets"]            = assets
        content["findings"]          = findings
        content["rights_requests"]   = _rights_summary(db, tenant_id)
        content["consent_summary"]   = _consent_summary(db, tenant_id)
        content["remediation"]       = _remediation(checks, findings)

    elif rtype == "executive_summary":
        assets   = _assets(db, tenant_id)
        findings = _findings_summary(db, tenant_id)
        checks   = _compliance_checks(db, tenant_id)
        rights   = _rights_summary(db, tenant_id)
        content["metrics"]           = _executive_metrics(db, tenant_id)
        content["overview"]          = _overview(assets, findings)
        content["compliance_rating"] = _overall_rating(checks)
        content["asset_breakdown"]   = _asset_breakdown(assets)
        content["findings"]          = findings
        content["top_risk_assets"]   = _top_risk_assets(assets)
        content["rights_requests"]   = rights
        content["consent_summary"]   = _consent_summary(db, tenant_id)
        content["recommendations"]   = _recommendations(checks, findings, rights)

    elif rtype == "asset_inventory":
        assets   = _assets(db, tenant_id, detailed=True)
        findings = _findings_summary(db, tenant_id)
        content["overview"]        = _overview(assets, findings)
        content["asset_breakdown"] = _asset_breakdown(assets)
        content["pii_categories"]  = findings.get("by_pii_type", {})
        content["assets"]          = assets

    elif rtype == "incident_report":
        assets   = _assets(db, tenant_id)
        findings = _findings_summary(db, tenant_id)
        content["overview"]            = _overview(assets, findings)
        content["affected_assets"]     = _affected_assets(assets)
        content["findings"]            = findings
        content["scans"]               = _scan_history(db, tenant_id, limit=50)
        content["breach_notification"] = _breach_checklist(findings)

    elif rtype == "dpia":
        assets   = _assets(db, tenant_id)
        findings = _findings_summary(db, tenant_id)
        content["overview"]        = _overview(assets, findings)
        content["asset_breakdown"] = _asset_breakdown(assets)
        content["assets"]          = assets
        content["findings"]        = findings
        content["consent_summary"] = _consent_summary(db, tenant_id)
        content["risk_register"]   = _risk_register(findings)
        content["mitigations"]     = _mitigations(db, tenant_id)

    elif rtype == "audit_evidence":
        assets   = _assets(db, tenant_id)
        findings = _findings_summary(db, tenant_id)
        content["overview"]        = _overview(assets, findings)
        content["scans"]           = _scan_history(db, tenant_id)
        content["findings"]        = findings
        content["rights_requests"] = _rights_summary(db, tenant_id)
        content["consent_summary"] = _consent_summary(db, tenant_id)
        content["policies"]        = _policy_summary(db, tenant_id)

    return content


# ---------------------------------------------------------------------------
# Derived / aggregate builders (shared across report types)
# ---------------------------------------------------------------------------

def _tenant_name(db, tenant_id: str) -> str:
    try:
        t = db.query(Tenant).filter(Tenant.id == tenant_id).first()
        name = getattr(t, "name", None) if t else None
        return name or "Your Organisation"
    except Exception:  # pragma: no cover - defensive
        return "Your Organisation"


def _period(params: dict) -> str:
    days = params.get("days")
    if days:
        try:
            return f"Trailing {int(days)} days"
        except (TypeError, ValueError):
            pass
    start, end = params.get("start_date"), params.get("end_date")
    if start or end:
        return f"{start or '—'} to {end or '—'}"
    return "As of report date"


def _overview(assets: list[dict], findings: dict) -> dict[str, Any]:
    n = len(assets)
    by_sev = findings.get("by_severity", {})
    return {
        "total_assets":        n,
        "total_pii_records":   sum(a.get("pii_record_count", 0) for a in assets),
        "avg_risk_score":      round(sum(a.get("risk_score", 0) for a in assets) / max(n, 1), 1),
        "open_critical":       by_sev.get("critical", 0),
        "open_high":           by_sev.get("high", 0),
        "total_findings":      findings.get("total", 0),
        "unresolved_findings": findings.get("unresolved", 0),
    }


def _asset_breakdown(assets: list[dict]) -> dict[str, dict]:
    by_type: dict[str, int] = {}
    by_provider: dict[str, int] = {}
    for a in assets:
        t = a.get("type", "unknown")
        p = a.get("provider", "unknown")
        by_type[t] = by_type.get(t, 0) + 1
        by_provider[p] = by_provider.get(p, 0) + 1
    return {"by_type": by_type, "by_provider": by_provider}


def _top_risk_assets(assets: list[dict], n: int = 8) -> list[dict]:
    return sorted(assets, key=lambda a: a.get("risk_score", 0), reverse=True)[:n]


def _overall_rating(checks: list[dict]) -> dict[str, Any]:
    total = len(checks) or 1
    compliant = sum(1 for c in checks if c.get("status") == "compliant")
    gaps = total - compliant
    pct = round(compliant / total * 100)
    if pct >= 80:
        rating = "Substantially compliant"
    elif pct >= 50:
        rating = "Partially compliant"
    else:
        rating = "Action required"
    return {"rating": rating, "compliant": compliant, "gaps": gaps, "total": total, "score_pct": pct}


def _remediation(checks: list[dict], findings: dict) -> list[dict]:
    items: list[dict] = []
    for c in checks:
        if c.get("status") != "compliant":
            items.append({"priority": "High", "item": f"Close gap: {c.get('title')}", "basis": c.get("details", "")})
    by_sev = findings.get("by_severity", {})
    if by_sev.get("critical"):
        items.append({"priority": "Critical", "item": f"Remediate {by_sev['critical']} critical finding(s)",
                      "basis": "Unresolved critical-severity findings increase breach exposure"})
    if by_sev.get("high"):
        items.append({"priority": "High", "item": f"Remediate {by_sev['high']} high-severity finding(s)",
                      "basis": "Unresolved high-severity findings"})
    if not items:
        items.append({"priority": "Maintain", "item": "No material gaps detected — maintain controls and re-scan on schedule",
                      "basis": "All tracked checks compliant"})
    return items


def _recommendations(checks: list[dict], findings: dict, rights: dict) -> list[str]:
    recs: list[str] = []
    for c in checks:
        if c.get("status") != "compliant":
            recs.append(f"Establish {c.get('title')} to close the identified control gap.")
    if findings.get("by_severity", {}).get("critical"):
        recs.append("Prioritise remediation of critical findings to reduce breach exposure.")
    if rights.get("overdue"):
        recs.append(f"Resolve {rights['overdue']} overdue data-principal request(s) within statutory timelines.")
    if not recs:
        recs.append("Posture is healthy; continue scheduled scanning and quarterly evidence generation.")
    return recs


def _affected_assets(assets: list[dict]) -> list[dict]:
    return [a for a in assets if a.get("pii_record_count", 0) > 0 or a.get("risk_score", 0) >= 50]


def _breach_checklist(findings: dict) -> list[dict]:
    has_crit = bool(findings.get("by_severity", {}).get("critical"))
    return [
        {"step": "Detect and assess breach severity", "status": "complete"},
        {"step": "Intimate the Data Protection Board of India (DPDP §8(6))", "status": "action" if has_crit else "not_required"},
        {"step": "Notify affected Data Principals", "status": "action" if has_crit else "not_required"},
        {"step": "Contain and remediate root cause", "status": "in_progress" if findings.get("unresolved") else "complete"},
        {"step": "Document incident and retain evidence", "status": "complete"},
    ]


def _risk_register(findings: dict) -> list[dict]:
    by_sev = findings.get("by_severity", {})
    names = {
        "critical": "Exposure of sensitive personal data",
        "high":     "Inadequate safeguards on personal data",
        "medium":   "Residual misconfigurations",
        "low":      "Minor data-hygiene issues",
    }
    rating = {
        "critical": ("Likely", "Severe"),
        "high":     ("Possible", "Major"),
        "medium":   ("Possible", "Moderate"),
        "low":      ("Unlikely", "Minor"),
    }
    reg: list[dict] = []
    for sev in ("critical", "high", "medium", "low"):
        count = by_sev.get(sev, 0)
        if count:
            likelihood, impact = rating[sev]
            reg.append({"risk": names[sev], "count": count, "likelihood": likelihood, "impact": impact, "level": sev})
    if not reg:
        reg.append({"risk": "No material risks identified at time of assessment", "count": 0,
                    "likelihood": "Unlikely", "impact": "Minor", "level": "low"})
    return reg


def _mitigations(db, tenant_id: str) -> dict[str, int]:
    def cnt(ptype: str) -> int:
        return db.query(Policy).filter(
            Policy.tenant_id == tenant_id, Policy.policy_type == ptype, Policy.status == "active"
        ).count()
    return {
        "data_masking":     cnt("data_masking"),
        "transfer_control": cnt("transfer_control"),
        "llm_guard":        cnt("llm_guard"),
        "consent_records":  db.query(ConsentRecord).filter(ConsentRecord.tenant_id == tenant_id).count(),
    }


def _policy_summary(db, tenant_id: str) -> dict[str, Any]:
    rows = db.query(Policy).filter(Policy.tenant_id == tenant_id).all()
    by_type: dict[str, int] = {}
    active = 0
    for p in rows:
        by_type[p.policy_type] = by_type.get(p.policy_type, 0) + 1
        if p.status == "active":
            active += 1
    return {"total": len(rows), "active": active, "by_type": by_type}



def _assets(db, tenant_id: str, detailed: bool = False) -> list[dict]:
    rows = db.query(Asset).filter(Asset.tenant_id == tenant_id).all()
    result = []
    for a in rows:
        row: dict[str, Any] = {
            "id":               a.id,
            "name":             a.name,
            "type":             a.asset_type,
            "provider":         a.provider,
            "status":           a.status,
            "pii_record_count": a.pii_record_count,
            "risk_score":       a.risk_score,
            "last_scanned_at":  a.last_scanned_at.isoformat() if a.last_scanned_at else None,
        }
        if detailed:
            row["tags"]   = a.tags
            row["region"] = a.region
        result.append(row)
    return result


def _findings_summary(db, tenant_id: str) -> dict[str, Any]:
    findings = db.query(Finding).filter(Finding.tenant_id == tenant_id).all()
    by_severity: dict[str, int] = {}
    by_type:     dict[str, int] = {}
    by_pii:      dict[str, int] = {}
    for f in findings:
        by_severity[f.severity]     = by_severity.get(f.severity, 0) + 1
        by_type[f.finding_type]     = by_type.get(f.finding_type, 0) + 1
        for pt in (f.pii_types or []):
            by_pii[pt]              = by_pii.get(pt, 0) + 1
    return {
        "total":        len(findings),
        "unresolved":   sum(1 for f in findings if not f.is_resolved),
        "by_severity":  by_severity,
        "by_type":      by_type,
        "by_pii_type":  by_pii,
    }


def _rights_summary(db, tenant_id: str) -> dict[str, Any]:
    reqs = db.query(RightsRequest).filter(RightsRequest.tenant_id == tenant_id).all()
    now  = datetime.now(timezone.utc)
    return {
        "total":     len(reqs),
        "by_status": {
            s: sum(1 for r in reqs if r.status == s)
            for s in ["received", "in_progress", "completed", "rejected"]
        },
        "overdue":   sum(
            1 for r in reqs
            if r.due_date < now and r.status not in ("completed", "rejected")
        ),
    }


def _compliance_checks(db, tenant_id: str) -> list[dict]:
    checks = []

    masking = db.query(Policy).filter(
        Policy.tenant_id == tenant_id,
        Policy.policy_type == "data_masking",
        Policy.status == "active",
    ).count()
    checks.append({
        "id":      "DPDP-S8",
        "title":   "Data Minimisation (§8)",
        "status":  "compliant" if masking > 0 else "gap",
        "details": f"{masking} active data masking policies",
    })

    xborder = db.query(Policy).filter(
        Policy.tenant_id == tenant_id,
        Policy.policy_type == "transfer_control",
        Policy.status == "active",
    ).count()
    checks.append({
        "id":      "DPDP-S16",
        "title":   "Cross-Border Transfer Control (§16)",
        "status":  "compliant" if xborder > 0 else "gap",
        "details": f"{xborder} active transfer control policies",
    })

    consent = db.query(ConsentRecord).filter(
        ConsentRecord.tenant_id == tenant_id
    ).count()
    checks.append({
        "id":      "DPDP-S6",
        "title":   "Consent Management (§6)",
        "status":  "compliant" if consent > 0 else "gap",
        "details": f"{consent} consent records",
    })

    llm = db.query(Policy).filter(
        Policy.tenant_id == tenant_id,
        Policy.policy_type == "llm_guard",
        Policy.status == "active",
    ).count()
    checks.append({
        "id":      "DPDP-LLM",
        "title":   "LLM Data Guard",
        "status":  "compliant" if llm > 0 else "gap",
        "details": f"{llm} active LLM guard policies",
    })

    return checks


def _executive_metrics(db, tenant_id: str) -> dict[str, Any]:
    assets   = db.query(Asset).filter(Asset.tenant_id == tenant_id).all()
    findings = db.query(Finding).filter(
        Finding.tenant_id == tenant_id, Finding.is_resolved == False
    ).all()
    return {
        "total_assets":           len(assets),
        "total_pii_records":      sum(a.pii_record_count for a in assets),
        "avg_risk_score":         sum(a.risk_score for a in assets) / max(len(assets), 1),
        "open_critical_findings": sum(1 for f in findings if f.severity == "critical"),
        "open_high_findings":     sum(1 for f in findings if f.severity == "high"),
        "open_medium_findings":   sum(1 for f in findings if f.severity == "medium"),
    }


def _consent_summary(db, tenant_id: str) -> dict[str, Any]:
    records = db.query(ConsentRecord).filter(
        ConsentRecord.tenant_id == tenant_id
    ).all()
    return {
        "total":         len(records),
        "given":         sum(1 for r in records if r.consent_given),
        "withdrawn":     sum(1 for r in records if r.withdrawal_timestamp is not None),
    }


def _scan_history(db, tenant_id: str, limit: int = 100) -> list[dict]:
    scans = (
        db.query(Scan)
        .filter(Scan.tenant_id == tenant_id)
        .order_by(Scan.created_at.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "id":                s.id,
            "asset_id":          s.asset_id,
            "type":              s.scan_type,
            "status":            s.status,
            "records_scanned":   s.records_scanned,
            "pii_records_found": s.pii_records_found,
            "started_at":        s.started_at.isoformat()   if s.started_at   else None,
            "completed_at":      s.completed_at.isoformat() if s.completed_at else None,
        }
        for s in scans
    ]


# ---------------------------------------------------------------------------
# S3 upload
# ---------------------------------------------------------------------------

def _upload(content_json: str, report: Report, tenant_id: str) -> str | None:
    """
    Optionally mirror the report JSON to S3 and return a browser-downloadable URL.

    When ``s3_reports_bucket`` is configured the object is uploaded with
    server-side encryption and a time-limited presigned GET URL is returned. When
    S3 is not configured (or the upload fails) ``None`` is returned and the report
    is served directly from the database by the control plane — so downloads work
    in every deployment without external object storage.
    """
    bucket = settings.s3_reports_bucket
    if not bucket:
        logger.info("S3_REPORTS_BUCKET not configured — report will be served from the database")
        return None

    data = content_json.encode("utf-8")
    key  = f"reports/{tenant_id}/{report.id}.json"
    try:
        import boto3

        s3 = boto3.client("s3", region_name=settings.aws_region)
        s3.put_object(
            Bucket=bucket,
            Key=key,
            Body=data,
            ContentType="application/json",
            ContentDisposition=f'attachment; filename="{report.id}.json"',
            ServerSideEncryption="AES256",
        )
        return s3.generate_presigned_url(
            "get_object",
            Params={"Bucket": bucket, "Key": key},
            ExpiresIn=settings.report_url_ttl_seconds,
        )
    except Exception as exc:
        logger.warning("S3 upload failed (%s) — report will be served from the database", exc)
        return None
