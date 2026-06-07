# services/workers/app/tasks/notifications.py

from __future__ import annotations
import logging
from datetime import datetime, timezone, timedelta
from typing import Any

import requests
from sqlalchemy import text

from app.celery_app import app
from app.config import settings
from app.db.client import get_db
from app.db.models import Alert

logger = logging.getLogger(__name__)


@app.task(
    name="app.tasks.notifications.send_alert_notification",
    queue="notifications",
)
def send_alert_notification(alert_id: str, tenant_id: str) -> dict[str, Any]:
    """
    Send email/webhook notifications for a newly created alert.
    Reads notification prefs from tenant settings via the control plane API.
    """
    with get_db(tenant_id=tenant_id) as db:
        alert = db.query(Alert).filter(
            Alert.id == alert_id,
            Alert.tenant_id == tenant_id,
        ).first()
        if not alert:
            return {"status": "not_found"}
        if alert.notification_sent:
            return {"status": "already_sent"}

        # Load notification prefs from control plane
        prefs = _get_notification_prefs(tenant_id)
        min_severity = prefs.get("min_severity", "high")
        if not _meets_threshold(alert.severity, min_severity):
            return {"status": "below_threshold", "severity": alert.severity}

        # Deliver via control plane webhook endpoint
        delivered = _deliver_to_control_plane(alert, tenant_id)

        if delivered:
            alert.notification_sent = True
            db.commit()
            return {"status": "delivered", "alert_id": alert_id}

        return {"status": "delivery_failed", "alert_id": alert_id}


@app.task(
    name="app.tasks.notifications.cleanup_expired_data",
    queue="notifications",
)
def cleanup_expired_data() -> dict[str, Any]:
    """
    Hourly: clean up expired tokens, old acknowledged alerts, and stale scan records.
    """
    now = datetime.now(timezone.utc)
    deleted_alerts = 0
    deleted_scans  = 0

    with get_db() as db:
        db.execute(text("RESET app.current_tenant_id"))

        # Delete alerts acknowledged > 90 days ago
        cutoff_alerts = now - timedelta(days=90)
        result = db.execute(text(
            "DELETE FROM alerts WHERE is_acknowledged = TRUE "
            "AND acknowledged_at < :cutoff",
        ), {"cutoff": cutoff_alerts})
        deleted_alerts = result.rowcount

        # Delete failed/cancelled scans older than 30 days
        cutoff_scans = now - timedelta(days=30)
        result = db.execute(text(
            "DELETE FROM scans WHERE status IN ('failed','cancelled') "
            "AND created_at < :cutoff",
        ), {"cutoff": cutoff_scans})
        deleted_scans = result.rowcount

        # Delete expired password reset tokens
        db.execute(text(
            "DELETE FROM password_reset_tokens WHERE expires_at < :now AND used = TRUE"
        ), {"now": now})

        # Delete expired refresh tokens
        db.execute(text(
            "DELETE FROM refresh_tokens WHERE expires_at < :cutoff OR revoked = TRUE",
        ), {"cutoff": now - timedelta(days=7)})

        db.commit()

    logger.info(
        "Cleanup: %d alerts deleted, %d scans deleted",
        deleted_alerts, deleted_scans,
    )
    return {"alerts_deleted": deleted_alerts, "scans_deleted": deleted_scans}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_SEVERITY_RANK = {"info": 0, "low": 1, "medium": 2, "high": 3, "critical": 4}


def _meets_threshold(severity: str, minimum: str) -> bool:
    return _SEVERITY_RANK.get(severity, 0) >= _SEVERITY_RANK.get(minimum, 0)


def _get_notification_prefs(tenant_id: str) -> dict:
    try:
        resp = requests.get(
            f"{settings.control_plane_url}/api/v1/alerts/config",
            headers={
                "X-API-Key":   settings.control_plane_api_key,
                "X-Tenant-ID": tenant_id,
            },
            timeout=5,
        )
        if resp.ok:
            return resp.json().get("data", {})
    except Exception as exc:
        logger.warning("Failed to fetch notification prefs for %s: %s", tenant_id, exc)
    return {"min_severity": "high"}


def _deliver_to_control_plane(alert: Alert, tenant_id: str) -> bool:
    """
    POST alert details to the control plane's internal webhook delivery endpoint.
    The control plane then fans out to configured Slack/email/PagerDuty channels.
    """
    try:
        resp = requests.post(
            f"{settings.control_plane_url}/api/v1/internal/alerts/{alert.id}/notify",
            headers={
                "X-API-Key":     settings.control_plane_api_key,
                "X-Tenant-ID":   tenant_id,
                "Content-Type":  "application/json",
            },
            json={
                "alert_id":   alert.id,
                "alert_type": alert.alert_type,
                "severity":   alert.severity,
                "title":      alert.title,
                "body":       alert.body,
                "tenant_id":  tenant_id,
            },
            timeout=10,
        )
        return resp.ok
    except Exception as exc:
        logger.error("Alert delivery failed for %s: %s", alert.id, exc)
        return False
