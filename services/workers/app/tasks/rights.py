# services/workers/app/tasks/rights.py

from __future__ import annotations
import logging
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any

from sqlalchemy import text

from app.celery_app import app
from app.connectors.base import get_connector
from app.db.client import get_db
from app.db.models import Alert, Asset, RightsRequest
from app.pii.analyzer import PIIAnalyzer
from app.tasks.discovery import _decrypt_config

logger = logging.getLogger(__name__)

# Asset types whose records can be erased natively through the connector. Others
# (object stores, API/LLM endpoints) are flagged for manual handling.
_ERASABLE_TYPES = frozenset({"postgresql", "rds_instance", "mysql"})


@app.task(
    name="app.tasks.rights.search_data_principal",
    queue="rights",
    bind=True,
    max_retries=2,
)
def search_data_principal(
    self,
    request_id: str,
    principal_email: str,
    tenant_id: str,
) -> dict[str, Any]:
    """
    Search all connected assets for records belonging to a data principal.
    Stores results in rights_request.response_data.
    """
    logger.info("DSR search: request=%s principal=%s", request_id, principal_email)
    analyzer = PIIAnalyzer()
    found_locations: list[dict] = []
    errors: list[str] = []
    assets_searched = 0

    with get_db(tenant_id=tenant_id) as db:
        assets = db.query(Asset).filter(
            Asset.tenant_id == tenant_id,
            Asset.status == "connected",
        ).all()
        assets_searched = len(assets)

        for asset in assets:
            try:
                locs = _search_asset(asset, tenant_id, principal_email)
                found_locations.extend(locs)
            except Exception as exc:
                msg = f"Asset {asset.id} ({asset.name}): {exc}"
                logger.warning("DSR search error: %s", msg)
                errors.append(msg)

        response_data = {
            "search_completed_at": datetime.now(timezone.utc).isoformat(),
            "principal_email": principal_email,
            "locations_found": found_locations,
            "assets_searched": assets_searched,
            "errors": errors,
        }

        rr = db.query(RightsRequest).filter(
            RightsRequest.id == request_id,
            RightsRequest.tenant_id == tenant_id,
        ).first()
        if rr:
            rr.response_data = response_data
            rr.discovery_completed_at = datetime.now(timezone.utc)
            if rr.request_type == "erasure":
                # Build the erasure plan and hand off to a human approval gate;
                # destructive deletion never runs automatically.
                rr.erasure_plan = {
                    "built_at": datetime.now(timezone.utc).isoformat(),
                    "locations": found_locations,
                }
                rr.status = "pending_approval"
            elif rr.status in ("received", "in_progress"):
                rr.status = "in_progress"
        db.commit()

    logger.info(
        "DSR search done: request=%s locations=%d errors=%d",
        request_id, len(found_locations), len(errors),
    )
    return {
        "request_id": request_id,
        "locations_found": len(found_locations),
        "assets_searched": assets_searched,
        "errors": len(errors),
    }


def _search_asset(asset: Asset, tenant_id: str, email: str) -> list[dict]:
    conn_config = _decrypt_config(asset, tenant_id)
    locations: list[dict] = []

    with get_connector(asset.asset_type, asset.id, tenant_id, conn_config) as connector:
        for source in connector.list_sources():
            source_name = source["name"]

            # Prefer native push-down (e.g. SQL WHERE ILIKE) — bounded and fast.
            native = connector.search_records(source_name, email)
            if native is not None:
                matches = native
            else:
                # Fallback: stream the source and match in-process (e.g. S3).
                matches = 0
                for batch in connector.stream_batches(source_name=source_name, batch_size=500):
                    for record in batch:
                        for val in record.values():
                            if isinstance(val, str) and email.lower() in val.lower():
                                matches += 1
                                break

            if matches > 0:
                locations.append({
                    "asset_id": asset.id,
                    "asset_name": asset.name,
                    "asset_type": asset.asset_type,
                    "source": source_name,
                    "record_count": matches,
                    "erasable": asset.asset_type in _ERASABLE_TYPES,
                })
    return locations


@app.task(name="app.tasks.rights.check_overdue_requests", queue="rights")
def check_overdue_requests() -> dict[str, Any]:
    """
    Periodic: create/escalate alerts for overdue and near-deadline rights requests.
    """
    now = datetime.now(timezone.utc)
    warn_at = now + timedelta(days=7)
    escalated = 0
    warned = 0

    with get_db() as db:
        db.execute(text("RESET app.current_tenant_id"))

        # Overdue
        for rr in db.query(RightsRequest).filter(
            RightsRequest.due_date < now,
            RightsRequest.status.notin_(["completed", "rejected"]),
        ).all():
            exists = db.query(Alert).filter(
                Alert.tenant_id == rr.tenant_id,
                Alert.alert_type == "rights_deadline",
                Alert.body.contains(rr.id),
                Alert.is_acknowledged == False,
            ).first()
            if not exists:
                db.add(Alert(
                    id=str(uuid.uuid4()),
                    tenant_id=rr.tenant_id,
                    alert_type="rights_deadline",
                    severity="critical",
                    title=f"Overdue DSR: {rr.request_type.upper()} request past 90-day deadline",
                    body=(
                        f"Rights request {rr.id} for {rr.data_principal_email} "
                        f"was due {rr.due_date.strftime('%Y-%m-%d')}. "
                        "Immediate action required under DPDP Act §12."
                    ),
                    is_acknowledged=False,
                ))
                escalated += 1

        # Upcoming deadline
        for rr in db.query(RightsRequest).filter(
            RightsRequest.due_date >= now,
            RightsRequest.due_date <= warn_at,
            RightsRequest.status.notin_(["completed", "rejected"]),
        ).all():
            exists = db.query(Alert).filter(
                Alert.tenant_id == rr.tenant_id,
                Alert.alert_type == "rights_deadline",
                Alert.body.contains(rr.id),
            ).first()
            if not exists:
                days_left = (rr.due_date - now).days
                db.add(Alert(
                    id=str(uuid.uuid4()),
                    tenant_id=rr.tenant_id,
                    alert_type="rights_deadline",
                    severity="high",
                    title=f"DSR deadline approaching: {days_left} day(s) remaining",
                    body=(
                        f"Rights request {rr.id} for {rr.data_principal_email} "
                        f"is due in {days_left} day(s) on {rr.due_date.strftime('%Y-%m-%d')}. "
                        f"Current status: {rr.status}."
                    ),
                    is_acknowledged=False,
                ))
                warned += 1

        db.commit()

    logger.info("DSR check: %d overdue escalated, %d upcoming warned", escalated, warned)
    return {"overdue_escalated": escalated, "upcoming_warned": warned}


@app.task(
    name="app.tasks.rights.execute_erasure",
    queue="rights",
    bind=True,
    max_retries=1,
)
def execute_erasure(self, request_id: str, tenant_id: str) -> dict[str, Any]:
    """
    Execute an APPROVED erasure request: delete the data principal's records from
    every auto-erasable source in the discovery plan. Non-erasable assets (object
    stores, APIs) are flagged for manual handling. Refuses to run unless the
    request was explicitly approved, and records a full per-source audit trail.
    """
    logger.info("DSR erasure: request=%s", request_id)
    with get_db(tenant_id=tenant_id) as db:
        rr = db.query(RightsRequest).filter(
            RightsRequest.id == request_id,
            RightsRequest.tenant_id == tenant_id,
        ).first()
        if not rr:
            return {"request_id": request_id, "status": "failed", "error": "not found"}
        if rr.request_type != "erasure":
            return {"request_id": request_id, "status": "skipped", "error": "not an erasure request"}
        # Safety gate: never delete without an explicit approval.
        if rr.approved_at is None:
            logger.warning("erasure %s is not approved — refusing to execute", request_id)
            return {"request_id": request_id, "status": "rejected", "error": "not approved"}

        plan = rr.erasure_plan or {}
        locations = plan.get("locations", [])
        email = rr.data_principal_email

        assets = {
            a.id: a for a in db.query(Asset).filter(
                Asset.tenant_id == tenant_id, Asset.status == "connected"
            ).all()
        }

        results: list[dict] = []
        total_deleted = 0
        manual = 0
        for loc in locations:
            asset = assets.get(loc.get("asset_id"))
            if asset is None or not loc.get("erasable"):
                manual += 1
                results.append({**loc, "outcome": "manual_required", "deleted": 0})
                continue
            try:
                conn_config = _decrypt_config(asset, tenant_id)
                with get_connector(asset.asset_type, asset.id, tenant_id, conn_config) as connector:
                    deleted = connector.erase_records(loc["source"], email)
                if deleted is None:
                    manual += 1
                    results.append({**loc, "outcome": "manual_required", "deleted": 0})
                else:
                    total_deleted += int(deleted)
                    results.append({**loc, "outcome": "erased", "deleted": int(deleted)})
            except Exception as exc:
                logger.warning("erasure error %s/%s: %s", loc.get("asset_id"), loc.get("source"), exc)
                results.append({**loc, "outcome": "error", "deleted": 0, "error": str(exc)})

        rr.fulfillment_result = {
            "executed_at": datetime.now(timezone.utc).isoformat(),
            "total_deleted": total_deleted,
            "manual_required": manual,
            "results": results,
        }
        rr.status = "completed"
        db.add(Alert(
            id=str(uuid.uuid4()),
            tenant_id=tenant_id,
            alert_type="dsr_erasure_completed",
            severity="medium",
            title=f"Erasure completed for {email}",
            body=(
                f"Deleted {total_deleted} record(s) across {len(locations)} location(s); "
                f"{manual} location(s) require manual handling."
            ),
            is_acknowledged=False,
        ))
        db.commit()

    logger.info("DSR erasure done: request=%s deleted=%d manual=%d", request_id, total_deleted, manual)
    return {
        "request_id": request_id,
        "status": "completed",
        "total_deleted": total_deleted,
        "manual_required": manual,
    }
