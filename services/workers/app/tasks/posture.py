# services/workers/app/tasks/posture.py
"""
Security-posture scanning.

Inspects connected cloud assets for misconfigurations (public buckets, missing
encryption, weak transport security, …) and records them as ``misconfiguration``
findings. Findings are reconciled idempotently so rescans update existing open
findings instead of creating duplicates.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import text

from app.celery_app import app
from app.db.client import get_db
from app.db.models import Asset, Finding
from app.tasks.discovery import ScanTask, _decrypt_config, _reconcile_findings

logger = logging.getLogger(__name__)

# Asset types that support a posture check (have a connector override).
POSTURE_ASSET_TYPES = ("s3_bucket", "postgresql", "rds_instance")


@app.task(
    bind=True,
    base=ScanTask,
    name="app.tasks.posture.run_posture_scan",
    queue="discovery",
)
def run_posture_scan(self, asset_id: str, tenant_id: str) -> dict[str, Any]:
    """Run posture checks for a single asset and persist misconfiguration findings."""
    logger.info("Posture scan: asset=%s tenant=%s", asset_id, tenant_id)

    with get_db(tenant_id=tenant_id) as db:
        asset = db.query(Asset).filter(
            Asset.id == asset_id, Asset.tenant_id == tenant_id
        ).first()
        if not asset:
            logger.warning("Posture scan: asset %s not found", asset_id)
            return {"asset_id": asset_id, "status": "not_found"}

        try:
            from app.connectors.base import get_connector

            conn_config = _decrypt_config(asset, tenant_id)
            with get_connector(asset.asset_type, asset.id, tenant_id, conn_config) as connector:
                posture = connector.posture_check()
        except Exception as exc:
            logger.exception("Posture scan failed for asset %s: %s", asset_id, exc)
            return {"asset_id": asset_id, "status": "failed", "error": str(exc)}

        new_findings = [
            Finding(
                id=str(uuid.uuid4()),
                tenant_id=tenant_id,
                scan_id=None,
                asset_id=asset_id,
                finding_type="misconfiguration",
                severity=p.severity,
                title=p.title,
                description=p.description,
                pii_types=[],
                location={"resource": p.resource, "check_id": p.check_id},
                sample_count=0,
                is_resolved=False,
                evidence={
                    "check_id": p.check_id,
                    "remediation": p.remediation,
                    "detected_by": "posture",
                },
            )
            for p in posture
        ]

        _reconcile_findings(
            db, asset_id, "misconfiguration", None, new_findings,
            key_fn=lambda f: (f.evidence or {}).get("check_id"),
        )
        db.commit()

    logger.info("Posture scan done: asset=%s misconfigurations=%d", asset_id, len(new_findings))
    return {
        "asset_id": asset_id,
        "status": "completed",
        "misconfigurations": len(new_findings),
    }


@app.task(name="app.tasks.posture.run_scheduled_posture_checks", queue="discovery")
def run_scheduled_posture_checks() -> dict[str, Any]:
    """Periodic: dispatch a posture scan for every connected, posture-capable asset."""
    dispatched = 0

    with get_db() as db:
        db.execute(text("RESET app.current_tenant_id"))
        assets = db.query(Asset).filter(
            Asset.status == "connected",
            Asset.asset_type.in_(POSTURE_ASSET_TYPES),
        ).all()

        for asset in assets:
            run_posture_scan.apply_async(
                kwargs={"asset_id": asset.id, "tenant_id": asset.tenant_id},
                queue="discovery",
            )
            dispatched += 1

    logger.info("Scheduled posture checks: dispatched %d", dispatched)
    return {"dispatched": dispatched, "checked_at": datetime.now(timezone.utc).isoformat()}
