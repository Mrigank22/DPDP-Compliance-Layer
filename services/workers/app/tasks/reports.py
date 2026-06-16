# services/workers/app/tasks/reports.py

from __future__ import annotations
import json
import logging
from datetime import datetime, timezone
from typing import Any

from app.celery_app import app
from app.config import settings
from app.db.client import get_db
from app.db.models import Asset, ConsentRecord, Finding, Policy, Report, RightsRequest, Scan

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
            file_url, file_size = _upload(content, report, tenant_id)

            report.status = "ready"
            report.file_url = file_url
            report.file_size_bytes = file_size
            db.commit()

            logger.info("Report %s ready: %s (%d bytes)", report_id, file_url, file_size)
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
    content: dict[str, Any] = {
        "report_id":    report.id,
        "report_type":  report.report_type,
        "title":        report.title,
        "tenant_id":    tenant_id,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "parameters":   report.parameters or {},
    }

    rtype = report.report_type

    if rtype == "dpdp_compliance":
        content["assets"]             = _assets(db, tenant_id)
        content["findings"]           = _findings_summary(db, tenant_id)
        content["rights_requests"]    = _rights_summary(db, tenant_id)
        content["compliance_checks"]  = _compliance_checks(db, tenant_id)

    elif rtype == "asset_inventory":
        content["assets"] = _assets(db, tenant_id, detailed=True)

    elif rtype == "executive_summary":
        content["metrics"] = _executive_metrics(db, tenant_id)

    elif rtype == "incident_report":
        content["findings"]  = _findings_summary(db, tenant_id)
        content["scans"]     = _scan_history(db, tenant_id, limit=50)

    elif rtype == "dpia":
        content["assets"]         = _assets(db, tenant_id)
        content["findings"]       = _findings_summary(db, tenant_id)
        content["consent_summary"] = _consent_summary(db, tenant_id)

    elif rtype == "audit_evidence":
        content["scans"]           = _scan_history(db, tenant_id)
        content["findings"]        = _findings_summary(db, tenant_id)
        content["rights_requests"] = _rights_summary(db, tenant_id)
        content["consent_summary"] = _consent_summary(db, tenant_id)

    return content


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

def _upload(content: dict, report: Report, tenant_id: str) -> tuple[str, int]:
    """
    Persist the report JSON to S3 and return a browser-downloadable URL.

    When ``s3_reports_bucket`` is configured the object is uploaded with
    server-side encryption and a time-limited presigned GET URL is returned so
    the frontend ``<a href>`` link works directly. When S3 is not configured
    (e.g. local development) a non-resolvable ``internal://`` placeholder is
    returned so callers can still see that generation succeeded.
    """
    data      = json.dumps(content, indent=2, default=str).encode("utf-8")
    file_size = len(data)
    key       = f"reports/{tenant_id}/{report.id}.json"

    bucket = settings.s3_reports_bucket
    if not bucket:
        logger.warning("S3_REPORTS_BUCKET not configured — report stored as placeholder only")
        return f"internal://{key}", file_size

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
        url = s3.generate_presigned_url(
            "get_object",
            Params={"Bucket": bucket, "Key": key},
            ExpiresIn=settings.report_url_ttl_seconds,
        )
        return url, file_size
    except Exception as exc:
        logger.warning("S3 upload failed (%s) — using placeholder URL", exc)
        return f"internal://{key}", file_size
