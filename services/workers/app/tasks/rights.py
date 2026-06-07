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
            if rr.status == "received":
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
