# services/workers/app/tasks/discovery.py

from __future__ import annotations
import logging
import time
import uuid
from datetime import datetime, timezone
from typing import Any

from celery import Task
from celery.exceptions import SoftTimeLimitExceeded
from sqlalchemy import text

from app.celery_app import app
from app.config import settings
from app.connectors.base import get_connector
from app.db.client import get_db
from app.db.models import Asset, Finding, Scan
from app.pii.analyzer import PIIAnalyzer

logger = logging.getLogger(__name__)

_analyzer: PIIAnalyzer | None = None


def _get_analyzer() -> PIIAnalyzer:
    global _analyzer
    if _analyzer is None:
        _analyzer = PIIAnalyzer()
    return _analyzer


class ScanTask(Task):
    abstract = True
    max_retries = settings.celery_task_max_retries
    default_retry_delay = settings.celery_task_default_retry_delay

    def on_failure(self, exc, task_id, args, kwargs, einfo):
        logger.error("Task %s failed: %s (task_id=%s)", self.name, exc, task_id)

    def on_retry(self, exc, task_id, args, kwargs, einfo):
        logger.warning("Task %s retrying (attempt %d): %s", self.name, self.request.retries + 1, exc)


@app.task(bind=True, base=ScanTask, name="app.tasks.discovery.run_scan", queue="discovery")
def run_scan(self, scan_id: str, asset_id: str, tenant_id: str, scan_type: str) -> dict[str, Any]:
    """
    Run a PII scan against a connected asset.
    1. Loads and decrypts asset connection config.
    2. Instantiates the appropriate connector.
    3. Streams records in batches through the PII analyzer.
    4. Persists findings to PostgreSQL.
    5. Updates scan status and asset risk metrics.
    """
    logger.info("Starting scan %s (asset=%s, type=%s)", scan_id, asset_id, scan_type)
    start = time.monotonic()
    now = datetime.now(timezone.utc)

    with get_db(tenant_id=tenant_id) as db:
        db.query(Scan).filter(Scan.id == scan_id).update({
            "status": "running",
            "started_at": now,
            "celery_task_id": self.request.id,
        })
        db.commit()

        try:
            asset = db.query(Asset).filter(
                Asset.id == asset_id, Asset.tenant_id == tenant_id
            ).first()
            if not asset:
                raise ValueError(f"Asset {asset_id} not found for tenant {tenant_id}")

            conn_config = _decrypt_config(asset, tenant_id)
            summary, findings = _execute_scan(asset, conn_config, tenant_id, scan_id, scan_type)

            if findings:
                db.bulk_save_objects(findings)

            pii_count = sum(f.sample_count for f in findings)
            db.query(Scan).filter(Scan.id == scan_id).update({
                "status": "completed",
                "completed_at": datetime.now(timezone.utc),
                "records_scanned": summary.get("records_scanned", 0),
                "pii_records_found": pii_count,
                "summary": summary,
            })
            db.query(Asset).filter(Asset.id == asset_id).update({
                "status": "connected",
                "last_scanned_at": datetime.now(timezone.utc),
                "pii_record_count": pii_count,
                "risk_score": _risk_score(pii_count, findings),
            })
            db.commit()

            elapsed = time.monotonic() - start
            logger.info(
                "Scan %s done in %.1fs: %d records, %d PII, %d findings",
                scan_id, elapsed, summary.get("records_scanned", 0), pii_count, len(findings),
            )
            return {**summary, "scan_id": scan_id, "status": "completed"}

        except SoftTimeLimitExceeded:
            _fail_scan(db, scan_id, asset_id, "scan exceeded time limit")
            db.commit()
            raise

        except Exception as exc:
            logger.exception("Scan %s failed: %s", scan_id, exc)
            _fail_scan(db, scan_id, asset_id, str(exc))
            db.commit()
            try:
                raise self.retry(exc=exc, countdown=60)
            except self.MaxRetriesExceededError:
                return {"scan_id": scan_id, "status": "failed", "error": str(exc)}


def _execute_scan(
    asset: Asset, conn_config: dict, tenant_id: str, scan_id: str, scan_type: str
) -> tuple[dict[str, Any], list[Finding]]:
    analyzer = _get_analyzer()
    all_findings: list[Finding] = []
    summary: dict[str, Any] = {
        "records_scanned": 0,
        "pii_records_found": 0,
        "sources_scanned": 0,
        "pii_by_type": {},
    }

    with get_connector(asset.asset_type, asset.id, tenant_id, conn_config) as connector:
        sources = connector.list_sources()
        logger.info("Scan %s: %d sources in asset %s", scan_id, len(sources), asset.id)

        for source in sources:
            source_name = source["name"]
            source_pii: dict[str, int] = {}

            try:
                for batch in connector.stream_batches(
                    source_name=source_name,
                    batch_size=settings.scan_batch_size,
                ):
                    analyses = analyzer.analyze_batch(batch)
                    summary["records_scanned"] += len(batch)
                    for a in analyses:
                        for m in a.matches:
                            source_pii[m.pii_type] = source_pii.get(m.pii_type, 0) + 1
            except Exception as exc:
                logger.warning("Scan %s: error in source %s: %s", scan_id, source_name, exc)
                continue

            for pii_type, count in source_pii.items():
                all_findings.append(Finding(
                    id=str(uuid.uuid4()),
                    tenant_id=tenant_id,
                    scan_id=scan_id,
                    asset_id=asset.id,
                    finding_type="pii_exposure",
                    severity=_severity(pii_type),
                    title=f"{pii_type.replace('_',' ').title()} detected in {source_name}",
                    description=(
                        f"Found {count} records containing {pii_type} in {source_name}. "
                        "Review and apply appropriate masking or access controls."
                    ),
                    pii_types=[pii_type],
                    location={"source": source_name},
                    sample_count=count,
                    is_resolved=False,
                    evidence={"detected_by": "presidio", "scan_id": scan_id},
                ))
                summary["pii_by_type"][pii_type] = summary["pii_by_type"].get(pii_type, 0) + count

            summary["sources_scanned"] += 1

    summary["pii_records_found"] = sum(summary["pii_by_type"].values())
    return summary, all_findings


def _severity(pii_type: str) -> str:
    if pii_type in {"AADHAAR_NUMBER", "IN_PAN", "CREDIT_CARD", "IN_BANK_ACCOUNT"}:
        return "critical"
    if pii_type in {"IN_GSTIN", "IN_DRIVING_LICENSE", "IN_PASSPORT", "IN_VOTER_ID"}:
        return "high"
    return "medium"


def _risk_score(pii_count: int, findings: list[Finding]) -> int:
    if not pii_count:
        return 0
    score = (
        sum(1 for f in findings if f.severity == "critical") * 25 +
        sum(1 for f in findings if f.severity == "high") * 10 +
        sum(1 for f in findings if f.severity == "medium") * 3
    )
    if pii_count > 100_000:
        score += 20
    elif pii_count > 10_000:
        score += 10
    return min(score, 100)


def _fail_scan(db, scan_id: str, asset_id: str, error: str) -> None:
    db.query(Scan).filter(Scan.id == scan_id).update({
        "status": "failed",
        "completed_at": datetime.now(timezone.utc),
        "error_message": error[:2000],
    })
    db.query(Asset).filter(Asset.id == asset_id).update({"status": "error"})


def _decrypt_config(asset: Asset, tenant_id: str) -> dict:
    cc = asset.connection_config
    if not cc:
        return {}
    encrypted = cc.get("_encrypted")
    if not encrypted:
        return dict(cc)
    return _aes_gcm_decrypt(encrypted, settings.master_encryption_key, tenant_id)


def _aes_gcm_decrypt(ciphertext_b64: str, master_hex: str, tenant_id: str) -> dict:
    import base64, json
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.kdf.hkdf import HKDF
    from cryptography.hazmat.backends import default_backend

    master = bytes.fromhex(master_hex)
    key = HKDF(
        algorithm=hashes.SHA256(), length=32,
        salt=b"datasentinel-v1", info=tenant_id.encode(),
        backend=default_backend(),
    ).derive(master)
    data = base64.b64decode(ciphertext_b64)
    plaintext = AESGCM(key).decrypt(data[:12], data[12:], None)
    return json.loads(plaintext)


@app.task(name="app.tasks.discovery.run_scheduled_scans", queue="discovery")
def run_scheduled_scans() -> dict[str, Any]:
    """Dispatch incremental scans for all assets not scanned in 24h."""
    from datetime import timedelta
    cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
    dispatched = 0

    with get_db() as db:
        db.execute(text("RESET app.current_tenant_id"))
        assets = db.query(Asset).filter(
            Asset.status == "connected",
            Asset.last_scanned_at < cutoff,
        ).all()

        for asset in assets:
            sid = str(uuid.uuid4())
            db.add(Scan(
                id=sid, tenant_id=asset.tenant_id, asset_id=asset.id,
                scan_type="incremental", status="queued", triggered_by="schedule",
            ))
            db.flush()
            run_scan.apply_async(
                kwargs={"scan_id": sid, "asset_id": asset.id,
                        "tenant_id": asset.tenant_id, "scan_type": "incremental"},
                queue="discovery",
            )
            dispatched += 1
        db.commit()

    logger.info("Scheduled scans: dispatched %d", dispatched)
    return {"dispatched": dispatched}


@app.task(name="app.tasks.discovery.test_connection", queue="discovery")
def test_connection(asset_id: str, tenant_id: str) -> dict[str, Any]:
    """Test connectivity to an asset and update its status."""
    with get_db(tenant_id=tenant_id) as db:
        asset = db.query(Asset).filter(
            Asset.id == asset_id, Asset.tenant_id == tenant_id
        ).first()
        if not asset:
            return {"success": False, "message": "Asset not found"}
        conn_config = _decrypt_config(asset, tenant_id)
        with get_connector(asset.asset_type, asset.id, tenant_id, conn_config) as c:
            result = c.test_connection()
        db.query(Asset).filter(Asset.id == asset_id).update({
            "status": "connected" if result.success else "error"
        })
        db.commit()
        return {"success": result.success, "message": result.message, "latency_ms": result.latency_ms}
