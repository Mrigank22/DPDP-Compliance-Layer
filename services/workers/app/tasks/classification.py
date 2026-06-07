# services/workers/app/tasks/classification.py

from __future__ import annotations
import logging
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any

from sqlalchemy import text

from app.celery_app import app
from app.db.client import get_db
from app.db.models import Alert, Asset, Finding, Policy

logger = logging.getLogger(__name__)


@app.task(
    name="app.tasks.classification.enforce_retention_policies",
    queue="classification",
)
def enforce_retention_policies() -> dict[str, Any]:
    """
    Daily: scan for retention policy violations.
    Checks assets against active retention policies and creates findings
    when data is held beyond the configured retention period.
    """
    violations = 0
    checked = 0

    with get_db() as db:
        db.execute(text("RESET app.current_tenant_id"))

        retention_policies = db.query(Policy).filter(
            Policy.policy_type == "retention",
            Policy.status == "active",
        ).all()

        for policy in retention_policies:
            rules = policy.rules or {}
            max_days = int(rules.get("max_retention_days", 365))
            cutoff = datetime.now(timezone.utc) - timedelta(days=max_days)

            applies_to = policy.applies_to or {}
            asset_ids  = applies_to.get("asset_ids", [])
            asset_types = applies_to.get("asset_types", [])

            q = db.query(Asset).filter(Asset.tenant_id == policy.tenant_id)
            if asset_ids:
                q = q.filter(Asset.id.in_(asset_ids))
            elif asset_types:
                q = q.filter(Asset.asset_type.in_(asset_types))

            for asset in q.all():
                checked += 1
                # Check if the asset has PII records older than the retention window
                old_findings = db.query(Finding).filter(
                    Finding.asset_id == asset.id,
                    Finding.tenant_id == policy.tenant_id,
                    Finding.created_at < cutoff,
                    Finding.is_resolved == False,
                ).count()

                if old_findings > 0:
                    existing = db.query(Finding).filter(
                        Finding.asset_id == asset.id,
                        Finding.tenant_id == policy.tenant_id,
                        Finding.finding_type == "retention_violation",
                        Finding.is_resolved == False,
                    ).first()

                    if not existing:
                        db.add(Finding(
                            id=str(uuid.uuid4()),
                            tenant_id=policy.tenant_id,
                            asset_id=asset.id,
                            finding_type="retention_violation",
                            severity="high",
                            title=f"Retention violation in {asset.name}",
                            description=(
                                f"Asset '{asset.name}' contains PII records older than "
                                f"{max_days} days, violating retention policy '{policy.name}'."
                            ),
                            pii_types=[],
                            location={"asset_name": asset.name},
                            sample_count=old_findings,
                            is_resolved=False,
                            evidence={"policy_id": policy.id, "max_days": max_days},
                        ))
                        # Also create an alert
                        db.add(Alert(
                            id=str(uuid.uuid4()),
                            tenant_id=policy.tenant_id,
                            alert_type="retention_due",
                            severity="high",
                            title=f"Retention violation: {asset.name}",
                            body=(
                                f"Data in '{asset.name}' exceeds the {max_days}-day "
                                f"retention limit set by policy '{policy.name}'."
                            ),
                            is_acknowledged=False,
                        ))
                        violations += 1

        db.commit()

    logger.info("Retention check: %d assets checked, %d violations found", checked, violations)
    return {"assets_checked": checked, "violations_found": violations}


@app.task(
    name="app.tasks.classification.classify_finding",
    queue="classification",
)
def classify_finding(finding_id: str, tenant_id: str) -> dict[str, Any]:
    """
    Re-classify a single finding after a scan update.
    Used when a finding's evidence is enriched by a subsequent incremental scan.
    """
    with get_db(tenant_id=tenant_id) as db:
        finding = db.query(Finding).filter(
            Finding.id == finding_id,
            Finding.tenant_id == tenant_id,
        ).first()
        if not finding:
            return {"status": "not_found"}

        # Recalculate severity based on current PII types
        new_severity = _recalculate_severity(finding.pii_types or [], finding.sample_count)
        if new_severity != finding.severity:
            old_severity = finding.severity
            finding.severity = new_severity
            db.commit()
            logger.info(
                "Finding %s severity updated: %s → %s",
                finding_id, old_severity, new_severity,
            )
            return {"status": "updated", "old_severity": old_severity, "new_severity": new_severity}

        return {"status": "unchanged", "severity": finding.severity}


def _recalculate_severity(pii_types: list[str], sample_count: int) -> str:
    critical_types = {"AADHAAR_NUMBER", "IN_PAN", "CREDIT_CARD", "IN_BANK_ACCOUNT"}
    high_types     = {"IN_GSTIN", "IN_DRIVING_LICENSE", "IN_PASSPORT", "IN_VOTER_ID"}

    has_critical = any(pt in critical_types for pt in pii_types)
    has_high     = any(pt in high_types     for pt in pii_types)

    if has_critical or sample_count > 10_000:
        return "critical"
    if has_high or sample_count > 1_000:
        return "high"
    if sample_count > 100:
        return "medium"
    return "low"
