# services/workers/app/tasks/report_html.py
#
# Renders the structured report content (the same dict that is serialised to
# JSON) into a self-contained, print-ready HTML compliance document.
#
# Design goals:
#   * Light, paper-style pages (white background, dark ink) so it prints cleanly
#     and reads like a corporate deliverable, while using the DataSentinel brand
#     accent (signal-mint) and the product's severity colour spectrum.
#   * Fully self-contained: one <style> block, no JavaScript, brand web-fonts
#     with robust system fallbacks. Renders identically from a blob URL.
#   * Print fidelity: A4 @page, repeating running header/footer + "CONFIDENTIAL"
#     watermark, table headers that repeat across page breaks, no overlap.
#   * Security: every dynamic value is HTML-escaped and a strict CSP meta blocks
#     script execution, so untrusted asset/tenant names can never inject markup.

from __future__ import annotations

import html
from datetime import datetime, timezone
from typing import Any

# ── Labels & palette ─────────────────────────────────────────────────────────

REPORT_TYPE_LABELS = {
    "dpdp_compliance":   "DPDP Compliance Report",
    "executive_summary": "Executive Summary",
    "asset_inventory":   "Data Asset Inventory",
    "incident_report":   "Data Incident Report",
    "dpia":              "Data Protection Impact Assessment",
    "audit_evidence":    "Audit Evidence Pack",
    "ai_governance":     "AI Governance Report",
}

REPORT_TYPE_TAGLINE = {
    "dpdp_compliance":   "Compliance posture under the Digital Personal Data Protection Act, 2023",
    "executive_summary": "Leadership-level privacy risk and posture overview",
    "asset_inventory":   "Register of connected data assets and the personal data they hold",
    "incident_report":   "Detection, exposure and response record for a data incident",
    "dpia":              "Assessment of risks to data principals under the DPDP Act / Article 35 GDPR",
    "audit_evidence":    "Bundled evidence of controls, scans, rights handling and consent",
    "ai_governance":     "AI system inventory, framework risk posture and oversight evidence",
}

# Print-legible variants of the product severity spectrum.
SEV_COLORS = {
    "critical": "#e11d48",
    "high":     "#f97316",
    "medium":   "#d9a406",
    "low":      "#2563eb",
    "info":     "#64748b",
}
SEV_ORDER = ["critical", "high", "medium", "low", "info"]

BRAND = "#06b482"          # signal-mint, darkened for ink-on-white legibility
BRAND_2 = "#0891b2"        # cyan secondary
INK = "#0e1320"
MUTED = "#5a6680"

_ACRONYMS = {"pan", "upi", "gstin", "ifsc", "cin", "epfic", "id", "aws", "gcp", "rds", "gcs", "s3", "kyc"}


def humanize(key: Any) -> str:
    """Turn an enum key (e.g. 'driving_license', 'AADHAAR') into a label."""
    s = str(key).replace("_", " ").replace("-", " ").strip()
    if not s:
        return "—"
    out = []
    for w in s.split():
        out.append(w.upper() if w.lower() in _ACRONYMS else w.capitalize())
    return " ".join(out)


def esc(v: Any) -> str:
    if v is None or v == "":
        return "—"
    return html.escape(str(v))


def _num(v: Any) -> str:
    try:
        return f"{int(v):,}"
    except (TypeError, ValueError):
        try:
            return f"{float(v):,.1f}"
        except (TypeError, ValueError):
            return esc(v)


# ── Reusable HTML fragments ──────────────────────────────────────────────────

def _kpi(label: str, value: Any, *, accent: bool = False, tone: str | None = None) -> str:
    color = ""
    if tone and tone in SEV_COLORS:
        color = f"color:{SEV_COLORS[tone]};"
    elif accent:
        color = f"color:{BRAND};"
    return (
        '<div class="kpi">'
        f'<div class="kpi-value" style="{color}">{esc(value)}</div>'
        f'<div class="kpi-label">{esc(label)}</div>'
        "</div>"
    )


def _kpi_grid(cards: list[str]) -> str:
    return f'<div class="kpi-grid">{"".join(cards)}</div>'


def _sev_chip(sev: str) -> str:
    sev = (sev or "info").lower()
    color = SEV_COLORS.get(sev, SEV_COLORS["info"])
    text = "#ffffff" if sev in ("critical", "high") else "#1b2233"
    bg = color if sev in ("critical", "high") else f"{color}33"
    border = color
    txt = text if sev in ("critical", "high") else color
    return (
        f'<span class="chip" style="background:{bg};color:{txt};border-color:{border};">'
        f"{esc(humanize(sev))}</span>"
    )


def _status_pill(status: str) -> str:
    s = (status or "").lower()
    green = {"compliant", "complete", "completed", "given", "resolved", "ready", "active", "yes"}
    red = {"gap", "action", "action_required", "overdue", "failed", "rejected", "no"}
    amber = {"partial", "in_progress", "pending", "received", "generating", "not_required"}
    if s in green:
        color, bg = "#0a7d54", "#06b48222"
    elif s in red:
        color, bg = "#b3123a", "#e11d4822"
    elif s in amber:
        color, bg = "#9a6b00", "#d9a40622"
    else:
        color, bg = MUTED, "#5a668022"
    return f'<span class="pill" style="color:{color};background:{bg};">{esc(humanize(status))}</span>'


def _table(headers: list[str], rows: list[list[str]], aligns: list[str] | None = None,
           empty: str = "No records.") -> str:
    if not rows:
        return f'<p class="empty">{esc(empty)}</p>'
    aligns = aligns or ["left"] * len(headers)
    head = "".join(f'<th style="text-align:{aligns[i]}">{esc(h)}</th>' for i, h in enumerate(headers))
    body = []
    for r in rows:
        tds = "".join(
            f'<td style="text-align:{aligns[i] if i < len(aligns) else "left"}">{cell}</td>'
            for i, cell in enumerate(r)
        )
        body.append(f"<tr>{tds}</tr>")
    return (
        '<table class="data"><thead><tr>'
        f"{head}</tr></thead><tbody>{''.join(body)}</tbody></table>"
    )


def _bars(rows: list[tuple[str, int, str]], *, unit: str = "") -> str:
    """rows = list of (label, value, color)."""
    rows = [r for r in rows]
    if not rows:
        return '<p class="empty">No data.</p>'
    mx = max((v for _, v, _ in rows), default=0) or 1
    out = ['<div class="chart">']
    for label, value, color in rows:
        pct = (value / mx) * 100 if value else 0
        if 0 < pct < 3:
            pct = 3
        out.append(
            '<div class="bar-row">'
            f'<div class="bar-label">{esc(label)}</div>'
            '<div class="bar-track">'
            f'<div class="bar-fill" style="width:{pct:.1f}%;background:{color};"></div>'
            "</div>"
            f'<div class="bar-value">{_num(value)}{html.escape(unit)}</div>'
            "</div>"
        )
    out.append("</div>")
    return "".join(out)


def _legend(items: list[tuple[str, str]]) -> str:
    """items = list of (label, color)."""
    chips = "".join(
        f'<span class="lg-item"><span class="lg-dot" style="background:{c};"></span>{esc(l)}</span>'
        for l, c in items
    )
    return f'<div class="legend">{chips}</div>'


def _section(title: str, inner: str, *, subtitle: str | None = None,
             page_break: bool = False, num: str | None = None) -> str:
    cls = "section page-break" if page_break else "section"
    sub = f'<p class="sec-sub">{esc(subtitle)}</p>' if subtitle else ""
    label = f'<span class="sec-num">{esc(num)}</span>' if num else ""
    return (
        f'<section class="{cls}">'
        f'<h2 class="sec-title">{label}{esc(title)}</h2>{sub}{inner}</section>'
    )


def _callout(text: str, tone: str = "info") -> str:
    color = {"info": BRAND_2, "warn": "#d9a406", "danger": "#e11d48", "ok": BRAND}.get(tone, BRAND_2)
    return f'<div class="callout" style="border-color:{color};"><div class="callout-bar" style="background:{color};"></div><div>{text}</div></div>'


# ── Severity / breakdown helpers shared by several report bodies ─────────────

def _severity_bars(findings: dict) -> str:
    by_sev = findings.get("by_severity", {}) if findings else {}
    rows = [(humanize(s), int(by_sev.get(s, 0)), SEV_COLORS[s]) for s in SEV_ORDER if by_sev.get(s)]
    if not rows:
        return '<p class="empty">No findings recorded.</p>'
    return _bars(rows)


def _pii_bars(findings: dict) -> str:
    by_pii = findings.get("by_pii_type", {}) if findings else {}
    items = sorted(by_pii.items(), key=lambda kv: kv[1], reverse=True)[:12]
    rows = [(humanize(k), int(v), BRAND) for k, v in items]
    return _bars(rows)


def _breakdown_table(breakdown: dict, key: str, header: str) -> str:
    data = (breakdown or {}).get(key, {})
    rows = [[esc(humanize(k)), _num(v)] for k, v in sorted(data.items(), key=lambda kv: kv[1], reverse=True)]
    return _table([header, "Assets"], rows, ["left", "right"], empty="No assets connected.")


def _asset_rows(assets: list[dict], detailed: bool = False) -> list[list[str]]:
    rows = []
    for a in assets:
        cells = [
            esc(a.get("name")),
            esc(humanize(a.get("type"))),
            esc(humanize(a.get("provider"))),
        ]
        if detailed:
            cells.append(esc(a.get("region")))
        cells += [
            _status_pill(a.get("status", "")),
            _num(a.get("pii_record_count", 0)),
            _risk_badge(a.get("risk_score", 0)),
            esc(_short_date(a.get("last_scanned_at"))),
        ]
        rows.append(cells)
    return rows


def _risk_badge(score: Any) -> str:
    try:
        s = int(score)
    except (TypeError, ValueError):
        s = 0
    if s >= 75:
        c = SEV_COLORS["critical"]
    elif s >= 50:
        c = SEV_COLORS["high"]
    elif s >= 25:
        c = SEV_COLORS["medium"]
    else:
        c = SEV_COLORS["low"]
    return f'<span class="risk" style="color:{c};">{s}</span>'


def _short_date(iso: Any) -> str:
    if not iso:
        return "—"
    try:
        return datetime.fromisoformat(str(iso).replace("Z", "+00:00")).strftime("%d %b %Y")
    except (ValueError, TypeError):
        return str(iso)[:10]


# ── Per-report-type bodies ───────────────────────────────────────────────────

def _body_executive(c: dict) -> str:
    ov = c.get("overview", {})
    m = c.get("metrics", {})
    rating = c.get("compliance_rating", {})
    parts = [
        _section(
            "At a glance",
            _kpi_grid([
                _kpi("Data assets", _num(ov.get("total_assets", 0)), accent=True),
                _kpi("Personal-data records", _num(ov.get("total_pii_records", 0)), accent=True),
                _kpi("Average risk score", ov.get("avg_risk_score", 0)),
                _kpi("Open critical", ov.get("open_critical", 0), tone="critical"),
                _kpi("Open high", ov.get("open_high", 0), tone="high"),
                _kpi("Compliance score", f"{rating.get('score_pct', 0)}%", accent=True),
            ]),
            subtitle="Key indicators of your current data-privacy posture.",
        ),
        _section(
            "Risk posture",
            _callout(
                f"Overall assessment: <strong>{esc(rating.get('rating', 'Not assessed'))}</strong>. "
                f"{esc(rating.get('compliant', 0))} of {esc(rating.get('total', 0))} tracked DPDP control "
                f"areas are satisfied; {esc(rating.get('gaps', 0))} require attention.",
                tone="ok" if rating.get("score_pct", 0) >= 80 else "warn",
            )
            + "<h3>Open findings by severity</h3>"
            + _severity_bars(c.get("findings", {})),
        ),
        _section(
            "Highest-risk assets",
            _table(
                ["Asset", "Type", "Provider", "Status", "PII records", "Risk", "Last scanned"],
                _asset_rows(c.get("top_risk_assets", [])),
                ["left", "left", "left", "left", "right", "right", "left"],
                empty="No assets connected yet.",
            ),
        ),
        _section(
            "Recommendations",
            "<ol class='recs'>" + "".join(f"<li>{esc(r)}</li>" for r in c.get("recommendations", [])) + "</ol>",
        ),
    ]
    return "".join(parts)


def _body_dpdp(c: dict) -> str:
    ov = c.get("overview", {})
    rating = c.get("compliance_rating", {})
    checks = c.get("compliance_checks", [])
    rights = c.get("rights_requests", {})
    consent = c.get("consent_summary", {})

    check_rows = [
        [esc(ch.get("id")), esc(ch.get("title")), _status_pill(ch.get("status", "")), esc(ch.get("details"))]
        for ch in checks
    ]
    rights_rows = [[esc(humanize(k)), _num(v)] for k, v in (rights.get("by_status", {}) or {}).items()]

    parts = [
        _section(
            "Executive summary",
            _callout(
                f"<strong>{esc(c.get('organisation'))}</strong> is rated "
                f"<strong>{esc(rating.get('rating', 'Not assessed'))}</strong> "
                f"({esc(rating.get('score_pct', 0))}%) against the tracked obligations of the "
                "Digital Personal Data Protection Act, 2023. This report summarises the personal-data "
                "estate, control coverage, outstanding findings and the remediation roadmap.",
                tone="ok" if rating.get("score_pct", 0) >= 80 else "warn",
            )
            + _kpi_grid([
                _kpi("Data assets", _num(ov.get("total_assets", 0)), accent=True),
                _kpi("PII records", _num(ov.get("total_pii_records", 0)), accent=True),
                _kpi("Controls met", f"{rating.get('compliant', 0)}/{rating.get('total', 0)}"),
                _kpi("Open critical", ov.get("open_critical", 0), tone="critical"),
            ]),
            num="1",
        ),
        _section(
            "Scope & methodology",
            "<p>This assessment covers all data assets connected to DataSentinel for "
            f"<strong>{esc(c.get('organisation'))}</strong> over the period "
            f"<strong>{esc(c.get('period'))}</strong>. Personal data is discovered through automated "
            "scanning and classification; control coverage is evaluated from active platform policies "
            "and consent records. Findings are risk-rated by severity.</p>",
            num="2",
        ),
        _section(
            "DPDP obligations matrix",
            _table(["Ref", "Obligation", "Status", "Evidence"], check_rows,
                   ["left", "left", "left", "left"], empty="No control checks evaluated."),
            subtitle="Section-by-section status mapped to the DPDP Act, 2023.",
            num="3",
        ),
        _section(
            "Personal-data inventory",
            _breakdown_table(c.get("asset_breakdown", {}), "by_type", "Asset type")
            + "<h3>Personal-data categories detected</h3>"
            + _pii_bars(c.get("findings", {})),
            num="4",
        ),
        _section(
            "Findings",
            "<h3>By severity</h3>" + _severity_bars(c.get("findings", {})),
            num="5",
        ),
        _section(
            "Data-principal rights",
            _kpi_grid([
                _kpi("Total requests", _num(rights.get("total", 0))),
                _kpi("Overdue", rights.get("overdue", 0), tone="critical" if rights.get("overdue") else None),
            ])
            + _table(["Status", "Count"], rights_rows, ["left", "right"], empty="No rights requests received."),
            subtitle="Handling of access, correction and erasure requests (DPDP §11–§13).",
            num="6",
        ),
        _section(
            "Consent management",
            _kpi_grid([
                _kpi("Consent records", _num(consent.get("total", 0))),
                _kpi("Active consents", _num(consent.get("given", 0)), accent=True),
                _kpi("Withdrawn", _num(consent.get("withdrawn", 0))),
            ]),
            subtitle="Consent captured and withdrawn under DPDP §6.",
            num="7",
        ),
        _section(
            "Gaps & remediation roadmap",
            _table(["Priority", "Action", "Basis"],
                   [[_status_pill("action" if r.get("priority") in ("Critical", "High") else "in_progress")
                     + f' <strong>{esc(r.get("priority"))}</strong>', esc(r.get("item")), esc(r.get("basis"))]
                    for r in c.get("remediation", [])],
                   ["left", "left", "left"], empty="No outstanding gaps."),
            num="8",
        ),
        _attestation(c),
    ]
    return "".join(parts)


def _body_asset_inventory(c: dict) -> str:
    ov = c.get("overview", {})
    parts = [
        _section(
            "Inventory summary",
            _kpi_grid([
                _kpi("Total assets", _num(ov.get("total_assets", 0)), accent=True),
                _kpi("Personal-data records", _num(ov.get("total_pii_records", 0)), accent=True),
                _kpi("Average risk", ov.get("avg_risk_score", 0)),
            ])
            + "<div class='two-col'>"
            + "<div><h3>By asset type</h3>" + _breakdown_table(c.get("asset_breakdown", {}), "by_type", "Type") + "</div>"
            + "<div><h3>By cloud provider</h3>" + _breakdown_table(c.get("asset_breakdown", {}), "by_provider", "Provider") + "</div>"
            + "</div>",
            subtitle="A register of processing activities (RoPA) derived from connected assets.",
        ),
        _section(
            "Asset register",
            _table(
                ["Asset", "Type", "Provider", "Region", "Status", "PII records", "Risk", "Last scanned"],
                _asset_rows(c.get("assets", []), detailed=True),
                ["left", "left", "left", "left", "left", "right", "right", "left"],
                empty="No assets connected yet.",
            ),
            subtitle="Each asset is a discrete processing location for personal data.",
            page_break=True,
        ),
        _section(
            "Personal-data categories",
            _pii_bars({"by_pii_type": c.get("pii_categories", {})}),
            subtitle="Categories of personal data discovered across the estate.",
        ),
    ]
    return "".join(parts)


def _body_incident(c: dict) -> str:
    ov = c.get("overview", {})
    findings = c.get("findings", {})
    scans = c.get("scans", [])
    scan_rows = [
        [esc(_short_date(s.get("started_at"))), esc(humanize(s.get("type"))), _status_pill(s.get("status", "")),
         _num(s.get("records_scanned", 0)), _num(s.get("pii_records_found", 0))]
        for s in scans[:25]
    ]
    breach_rows = [[esc(b.get("step")), _status_pill(b.get("status", ""))] for b in c.get("breach_notification", [])]
    parts = [
        _section(
            "Incident overview",
            _kpi_grid([
                _kpi("Affected assets", _num(len(c.get("affected_assets", [])))),
                _kpi("Open critical", ov.get("open_critical", 0), tone="critical"),
                _kpi("Open high", ov.get("open_high", 0), tone="high"),
                _kpi("Unresolved findings", _num(ov.get("unresolved_findings", 0))),
            ]),
            subtitle="Summary of the detected exposure and current response status.",
        ),
        _section("Exposure by severity", _severity_bars(findings)),
        _section(
            "Affected assets",
            _table(["Asset", "Type", "Provider", "Status", "PII records", "Risk", "Last scanned"],
                   _asset_rows(c.get("affected_assets", [])),
                   ["left", "left", "left", "left", "right", "right", "left"],
                   empty="No affected assets identified."),
        ),
        _section(
            "Personal-data categories exposed",
            _pii_bars(findings),
        ),
        _section(
            "Detection timeline",
            _table(["Date", "Scan type", "Status", "Records", "PII found"], scan_rows,
                   ["left", "left", "left", "right", "right"], empty="No scan activity in range."),
        ),
        _section(
            "Regulatory notification (DPDP §8(6))",
            _table(["Step", "Status"], breach_rows, ["left", "left"]),
            subtitle="Breach-intimation obligations to the Data Protection Board and affected Data Principals.",
        ),
    ]
    return "".join(parts)


def _body_dpia(c: dict) -> str:
    findings = c.get("findings", {})
    mit = c.get("mitigations", {})
    risk_rows = [
        [esc(r.get("risk")), _num(r.get("count", 0)), esc(r.get("likelihood")), esc(r.get("impact")), _sev_chip(r.get("level", "info"))]
        for r in c.get("risk_register", [])
    ]
    parts = [
        _section(
            "1 · Description of processing",
            "<p>This Data Protection Impact Assessment evaluates the personal-data processing carried out "
            f"across <strong>{esc(c.get('overview', {}).get('total_assets', 0))}</strong> connected assets, "
            f"holding approximately <strong>{_num(c.get('overview', {}).get('total_pii_records', 0))}</strong> "
            "personal-data records. It follows the structure required by Article 35 GDPR and the DPDP Act, 2023.</p>"
            + "<div class='two-col'>"
            + "<div><h3>Processing locations by type</h3>" + _breakdown_table(c.get("asset_breakdown", {}), "by_type", "Type") + "</div>"
            + "<div><h3>By provider</h3>" + _breakdown_table(c.get("asset_breakdown", {}), "by_provider", "Provider") + "</div>"
            + "</div>"
            + "<h3>Categories of personal data</h3>" + _pii_bars(findings),
        ),
        _section(
            "2 · Necessity & proportionality",
            _callout(
                "Processing is assessed against the principle of data minimisation. Active masking, "
                "transfer-control and consent mechanisms are evaluated as proportionality safeguards below.",
                tone="info",
            )
            + _kpi_grid([
                _kpi("Masking policies", _num(mit.get("data_masking", 0)), accent=True),
                _kpi("Transfer controls", _num(mit.get("transfer_control", 0)), accent=True),
                _kpi("LLM guards", _num(mit.get("llm_guard", 0)), accent=True),
                _kpi("Consent records", _num(mit.get("consent_records", 0))),
            ]),
        ),
        _section(
            "3 · Risks to data principals",
            _table(["Risk", "Findings", "Likelihood", "Impact", "Level"], risk_rows,
                   ["left", "right", "left", "left", "left"],
                   empty="No material risks identified."),
            subtitle="Each risk is rated by likelihood and impact on the rights of data principals.",
        ),
        _section(
            "4 · Measures to mitigate risk",
            "<ul class='recs'>"
            "<li>Enforce field-level masking and tokenisation on personal data in transit via the gateway.</li>"
            "<li>Restrict cross-border transfers in line with DPDP §16 using active transfer-control policies.</li>"
            "<li>Apply LLM data-guard policies to prevent personal data leaving via AI endpoints.</li>"
            "<li>Remediate outstanding critical and high findings on a prioritised schedule.</li>"
            "</ul>",
        ),
        _section(
            "5 · Residual risk & sign-off",
            _callout(
                "After applying the measures above, residual risk should be re-assessed and formally "
                "accepted by the Data Protection Officer. This assessment must be reviewed whenever the "
                "nature, scope or purpose of processing materially changes.",
                tone="warn",
            )
            + _signoff_block(),
        ),
    ]
    return "".join(parts)


def _body_audit(c: dict) -> str:
    findings = c.get("findings", {})
    scans = c.get("scans", [])
    policies = c.get("policies", {})
    rights = c.get("rights_requests", {})
    consent = c.get("consent_summary", {})
    scan_rows = [
        [esc(_short_date(s.get("started_at"))), esc(humanize(s.get("type"))), _status_pill(s.get("status", "")),
         _num(s.get("records_scanned", 0)), _num(s.get("pii_records_found", 0))]
        for s in scans[:40]
    ]
    pol_rows = [[esc(humanize(k)), _num(v)] for k, v in (policies.get("by_type", {}) or {}).items()]
    parts = [
        _section(
            "Evidence scope",
            _callout(
                f"This evidence pack was generated for <strong>{esc(c.get('organisation'))}</strong> "
                f"on <strong>{esc(_short_date(c.get('generated_at')))}</strong>. Report identifier "
                f"<code>{esc(c.get('report_id'))}</code> serves as the evidence reference.",
                tone="info",
            )
            + _kpi_grid([
                _kpi("Scans on record", _num(len(scans))),
                _kpi("Active policies", _num(policies.get("active", 0)), accent=True),
                _kpi("Rights requests", _num(rights.get("total", 0))),
                _kpi("Consent records", _num(consent.get("total", 0))),
            ]),
        ),
        _section(
            "Control evidence — policies",
            _table(["Policy type", "Count"], pol_rows, ["left", "right"], empty="No policies configured."),
        ),
        _section(
            "Scan history",
            _table(["Date", "Type", "Status", "Records", "PII found"], scan_rows,
                   ["left", "left", "left", "right", "right"], empty="No scans on record."),
            page_break=True,
        ),
        _section("Findings register", _severity_bars(findings)),
        _section(
            "Rights-handling evidence",
            _table(["Status", "Count"],
                   [[esc(humanize(k)), _num(v)] for k, v in (rights.get("by_status", {}) or {}).items()],
                   ["left", "right"], empty="No rights requests."),
        ),
        _section(
            "Consent evidence",
            _kpi_grid([
                _kpi("Total", _num(consent.get("total", 0))),
                _kpi("Given", _num(consent.get("given", 0)), accent=True),
                _kpi("Withdrawn", _num(consent.get("withdrawn", 0))),
            ]),
        ),
        _attestation(c),
    ]
    return "".join(parts)


def _body_ai_governance(c: dict) -> str:
    ov = c.get("ai_overview", {}) or {}
    systems = c.get("ai_systems", []) or []
    models = c.get("ai_models", []) or []
    readiness = c.get("framework_readiness", {}) or {}

    sys_rows = [
        [
            esc(s.get("name")),
            _status_pill(s.get("lifecycle_stage", "")),
            esc(humanize(s.get("risk_tier"))),
            _risk_badge(s.get("inherent", 0)),
            f'{int(s.get("readiness", 0))}%',
            _risk_badge(s.get("residual", 0)),
            _num(s.get("frameworks_assessed", 0)),
        ]
        for s in systems
    ]
    model_rows = [
        [esc(m.get("model")), esc(humanize(m.get("provider"))), esc(humanize(m.get("source"))), _num(m.get("call_count", 0))]
        for m in models
    ]
    read_rows = [(k, int(v), BRAND) for k, v in readiness.items()]

    parts = [
        _section(
            "AI governance overview",
            _callout(
                f"Inventory and risk posture of AI systems for <strong>{esc(c.get('organisation'))}</strong> "
                f"as of <strong>{esc(_short_date(c.get('generated_at')))}</strong>.",
                tone="info",
            )
            + _kpi_grid([
                _kpi("AI systems", _num(ov.get("total_systems", 0))),
                _kpi("Approved", _num(ov.get("approved", 0)), accent=True),
                _kpi("Assessed", _num(ov.get("assessed", 0))),
                _kpi("High residual risk", _num(ov.get("high_risk", 0)),
                     tone="critical" if ov.get("high_risk") else None),
            ]),
        ),
        _section(
            "AI systems & residual risk",
            _table(
                ["System", "Stage", "Risk tier", "Inherent", "Readiness", "Residual", "Frameworks"],
                sys_rows,
                ["left", "left", "left", "right", "right", "right", "right"],
                empty="No AI systems registered.",
            ),
            subtitle="Residual risk is the inherent (tier) risk after applying assessed control readiness.",
            page_break=True,
        ),
        _section(
            "Framework readiness",
            _bars(read_rows, unit="%") if read_rows else '<p class="empty">No assessments completed.</p>',
            subtitle="Average control readiness across assessed systems, by framework.",
        ),
        _section(
            "Model catalogue",
            _table(
                ["Model", "Provider", "Source", "Calls"],
                model_rows,
                ["left", "left", "left", "right"],
                empty="No models catalogued.",
            ),
        ),
        _attestation(c),
    ]
    return "".join(parts)


def _attestation(c: dict) -> str:
    return _section(
        "Attestation",
        _callout(
            "This report was generated automatically by DataSentinel from the organisation's live data "
            "posture at the time of generation. It is intended as compliance evidence and decision support; "
            "it does not constitute legal advice.",
            tone="info",
        )
        + _signoff_block(),
    )


def _signoff_block() -> str:
    return (
        '<div class="signoff">'
        '<div class="sign"><div class="sign-line"></div><div class="sign-label">Data Protection Officer</div></div>'
        '<div class="sign"><div class="sign-line"></div><div class="sign-label">Date</div></div>'
        "</div>"
    )


_BODIES = {
    "executive_summary": _body_executive,
    "dpdp_compliance":   _body_dpdp,
    "asset_inventory":   _body_asset_inventory,
    "incident_report":   _body_incident,
    "dpia":              _body_dpia,
    "audit_evidence":    _body_audit,
    "ai_governance":     _body_ai_governance,
}


# ── Cover, chrome & document shell ───────────────────────────────────────────

def _cover(c: dict, type_label: str) -> str:
    tagline = REPORT_TYPE_TAGLINE.get(c.get("report_type"), "")
    return (
        '<div class="cover">'
        '<div class="cover-top">'
        '<div class="brand">DATA<span>SENTINEL</span></div>'
        '<div class="cover-class">CONFIDENTIAL</div>'
        "</div>"
        '<div class="cover-main">'
        f'<div class="cover-kicker">{esc(type_label)}</div>'
        f'<h1 class="cover-title">{esc(c.get("title"))}</h1>'
        f'<p class="cover-tag">{esc(tagline)}</p>'
        "</div>"
        '<table class="cover-meta">'
        f'<tr><td>Organisation</td><td>{esc(c.get("organisation"))}</td></tr>'
        f'<tr><td>Reporting period</td><td>{esc(c.get("period"))}</td></tr>'
        f'<tr><td>Generated</td><td>{esc(_long_date(c.get("generated_at")))}</td></tr>'
        f'<tr><td>Report ID</td><td><code>{esc(c.get("report_id"))}</code></td></tr>'
        '<tr><td>Prepared by</td><td>DataSentinel · DPDP Compliance Platform</td></tr>'
        "</table>"
        '<div class="cover-note">This document contains confidential information about the personal-data '
        "processing of the named organisation. It is intended solely for authorised recipients. "
        "Unauthorised disclosure, copying or distribution is prohibited.</div>"
        "</div>"
    )


def _long_date(iso: Any) -> str:
    if not iso:
        iso = datetime.now(timezone.utc).isoformat()
    try:
        return datetime.fromisoformat(str(iso).replace("Z", "+00:00")).strftime("%d %B %Y, %H:%M UTC")
    except (ValueError, TypeError):
        return str(iso)


def render_report_html(content: dict[str, Any], report: Any) -> str:
    c = dict(content or {})
    rtype = c.get("report_type") or getattr(report, "report_type", "")
    type_label = REPORT_TYPE_LABELS.get(rtype, "Compliance Report")
    body_fn = _BODIES.get(rtype, _body_executive)
    body = body_fn(c)
    gen = esc(_long_date(c.get("generated_at")))
    title = esc(c.get("title") or type_label)

    return (
        "<!doctype html><html lang=\"en\"><head>"
        '<meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width, initial-scale=1">'
        "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; "
        "style-src 'unsafe-inline' https://fonts.googleapis.com; "
        "font-src https://fonts.gstatic.com; img-src data:;\">"
        f"<title>{title} — DataSentinel</title>"
        f"<style>{_CSS}</style>"
        "</head><body>"
        '<div class="watermark">CONFIDENTIAL</div>'
        '<div class="running-header"><div class="rh-inner">'
        '<span class="rh-brand">DATA<span>SENTINEL</span></span>'
        f'<span class="rh-title">{type_label}</span>'
        '<span class="rh-class">CONFIDENTIAL</span>'
        "</div></div>"
        '<div class="running-footer"><div class="rf-inner">'
        f"<span>{title}</span><span>Generated {gen}</span>"
        "<span>Confidential — DataSentinel</span>"
        "</div></div>"
        '<main class="report">'
        + _cover(c, type_label)
        + '<div class="pages">' + body + "</div>"
        "</main></body></html>"
    )


# ── Stylesheet (no f-string: contains literal CSS braces) ────────────────────

_CSS = """
@import url('https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@500;600;700&family=Hanken+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');

:root{
  --brand:#06b482; --brand2:#0891b2; --ink:#0e1320; --muted:#5a6680;
  --line:#dfe4ec; --line2:#eef1f6; --bg:#f4f6fa; --paper:#ffffff;
  --font-display:'Chakra Petch','Segoe UI',Arial,sans-serif;
  --font-sans:'Hanken Grotesk','Segoe UI',Arial,sans-serif;
  --font-mono:'JetBrains Mono',Consolas,monospace;
}
*{box-sizing:border-box;}
html,body{margin:0;padding:0;}
body{
  font-family:var(--font-sans); color:var(--ink); background:var(--bg);
  font-size:10.5pt; line-height:1.5; -webkit-print-color-adjust:exact; print-color-adjust:exact;
}
code{font-family:var(--font-mono); font-size:0.92em;}
h1,h2,h3{font-family:var(--font-display); font-weight:600; color:var(--ink); margin:0 0 .4em;}
p{margin:0 0 .7em;}

/* Running chrome + watermark (repeat on every printed page) */
.running-header,.running-footer{position:fixed; left:0; right:0; z-index:5;}
.running-header{top:0; height:14mm; background:var(--paper); border-bottom:2px solid var(--brand);}
.running-footer{bottom:0; height:12mm; background:var(--paper); border-top:1px solid var(--line);}
.rh-inner,.rf-inner{max-width:190mm; margin:0 auto; height:100%; padding:0 4mm;
  display:flex; align-items:center; justify-content:space-between;
  font-family:var(--font-mono); font-size:7.5pt; letter-spacing:.06em; color:var(--muted); text-transform:uppercase;}
.rh-brand{font-family:var(--font-display); font-weight:700; letter-spacing:.12em; color:var(--ink);}
.rh-brand span{color:var(--brand);}
.rh-class,.rh-title{color:var(--muted);}
.watermark{position:fixed; top:48%; left:0; right:0; text-align:center; z-index:0;
  font-family:var(--font-display); font-weight:700; font-size:64pt; letter-spacing:.2em;
  color:rgba(14,19,32,0.045); transform:rotate(-30deg); pointer-events:none;}

.report{max-width:210mm; margin:0 auto; background:var(--paper); position:relative; z-index:1;}
.pages{padding:18mm 16mm 16mm; padding-top:20mm;}

/* Cover */
.cover{min-height:247mm; padding:18mm 16mm; display:flex; flex-direction:column;
  page-break-after:always; break-after:page; position:relative;}
.cover-top{display:flex; align-items:center; justify-content:space-between; padding-top:6mm;}
.brand{font-family:var(--font-display); font-weight:700; font-size:18pt; letter-spacing:.18em; color:var(--ink);}
.brand span{color:var(--brand);}
.cover-class{font-family:var(--font-mono); font-size:8pt; letter-spacing:.18em; color:#b3123a;
  border:1px solid #b3123a; padding:3px 10px; border-radius:4px;}
.cover-main{margin-top:auto; margin-bottom:18mm; border-left:4px solid var(--brand); padding-left:10mm;}
.cover-kicker{font-family:var(--font-mono); text-transform:uppercase; letter-spacing:.18em;
  color:var(--brand); font-size:9pt; margin-bottom:8px;}
.cover-title{font-size:30pt; line-height:1.12; margin:0 0 10px; max-width:150mm;}
.cover-tag{color:var(--muted); font-size:12pt; max-width:150mm; margin:0;}
.cover-meta{width:100%; border-collapse:collapse; margin-bottom:14mm;}
.cover-meta td{padding:7px 0; border-bottom:1px solid var(--line); vertical-align:top; font-size:10pt;}
.cover-meta td:first-child{width:42mm; color:var(--muted); font-family:var(--font-mono);
  font-size:8.5pt; text-transform:uppercase; letter-spacing:.06em;}
.cover-note{font-size:8.5pt; color:var(--muted); border-top:1px solid var(--line); padding-top:8px; max-width:165mm;}

/* Sections */
.section{margin:0 0 9mm; break-inside:avoid;}
.section.page-break{break-before:page;}
.sec-title{font-size:15pt; padding-bottom:6px; border-bottom:2px solid var(--line);
  margin-bottom:10px; display:flex; align-items:baseline; gap:10px;}
.sec-num{font-family:var(--font-mono); font-size:11pt; color:var(--brand); font-weight:500;}
.sec-sub{color:var(--muted); font-size:9.5pt; margin:-4px 0 12px;}
h3{font-size:11.5pt; margin:14px 0 8px;}

/* KPI cards */
.kpi-grid{display:flex; flex-wrap:wrap; gap:8px; margin:6px 0 4px;}
.kpi{flex:1 1 120px; min-width:120px; border:1px solid var(--line); border-radius:10px;
  padding:11px 13px; background:var(--paper);}
.kpi-value{font-family:var(--font-display); font-weight:700; font-size:19pt; line-height:1; color:var(--ink);}
.kpi-label{font-family:var(--font-mono); text-transform:uppercase; letter-spacing:.05em;
  font-size:7.5pt; color:var(--muted); margin-top:6px;}

/* Tables */
table.data{width:100%; border-collapse:collapse; margin:6px 0 4px; font-size:9.3pt;}
table.data thead{display:table-header-group;}
table.data th{background:#eef1f6; color:#2a3550; text-align:left; font-family:var(--font-mono);
  font-size:7.6pt; text-transform:uppercase; letter-spacing:.05em; padding:7px 9px; border-bottom:2px solid var(--line);}
table.data td{padding:7px 9px; border-bottom:1px solid var(--line2); vertical-align:top;}
table.data tbody tr:nth-child(even){background:#f8fafc;}
.empty{color:var(--muted); font-style:italic; font-size:9.5pt; padding:6px 0;}

/* Chips / pills / risk */
.chip{display:inline-block; padding:1px 8px; border-radius:20px; border:1px solid;
  font-family:var(--font-mono); font-size:7.4pt; text-transform:uppercase; letter-spacing:.04em; font-weight:500;}
.pill{display:inline-block; padding:1px 9px; border-radius:20px; font-family:var(--font-mono);
  font-size:7.6pt; text-transform:uppercase; letter-spacing:.04em; font-weight:500;}
.risk{font-family:var(--font-display); font-weight:700; font-size:11pt;}

/* Bar charts */
.chart{margin:8px 0 4px;}
.bar-row{display:flex; align-items:center; gap:10px; margin:5px 0;}
.bar-label{flex:0 0 42mm; font-size:9pt; color:#2a3550; text-align:right; overflow:hidden;
  white-space:nowrap; text-overflow:ellipsis;}
.bar-track{flex:1 1 auto; height:14px; background:var(--line2); border-radius:7px; overflow:hidden;}
.bar-fill{height:100%; border-radius:7px; min-width:2px;}
.bar-value{flex:0 0 22mm; font-family:var(--font-mono); font-size:8.4pt; color:var(--ink);}
.legend{display:flex; flex-wrap:wrap; gap:14px; margin:8px 0; font-size:8.4pt; color:var(--muted);}
.lg-item{display:flex; align-items:center; gap:6px;}
.lg-dot{width:10px; height:10px; border-radius:3px; display:inline-block;}

/* Callouts, lists, layout */
.callout{display:flex; gap:0; border:1px solid; border-radius:10px; overflow:hidden;
  background:#fbfdff; margin:6px 0 12px; font-size:9.6pt;}
.callout-bar{flex:0 0 5px;}
.callout > div:last-child{padding:11px 13px;}
.recs{margin:6px 0 4px; padding-left:20px;}
.recs li{margin:5px 0; font-size:10pt;}
.two-col{display:flex; gap:18px; flex-wrap:wrap;}
.two-col > div{flex:1 1 240px;}

/* Sign-off */
.signoff{display:flex; gap:30px; margin-top:18px;}
.sign{flex:1 1 0;}
.sign-line{height:0; border-bottom:1px solid var(--ink); margin-top:26px;}
.sign-label{font-family:var(--font-mono); font-size:8pt; text-transform:uppercase;
  letter-spacing:.06em; color:var(--muted); margin-top:6px;}

@page{ size:A4; margin:20mm 0 16mm; }
@media print{
  body{background:var(--paper);}
  .report{max-width:none; box-shadow:none;}
  .pages{padding:4mm 16mm;}
  .cover{min-height:auto; height:233mm;}
}
@media screen{
  body{ padding:0; background:#e9edf3; }
  .report{ margin:0 auto; box-shadow:0 4px 30px rgba(14,19,32,0.14); }
}
"""
