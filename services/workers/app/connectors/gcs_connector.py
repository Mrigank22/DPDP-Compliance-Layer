# services/workers/app/connectors/gcs_connector.py

from __future__ import annotations
import json
import time
from typing import Any, Generator

from app.connectors._objstore import (
    MAX_OBJECT_SIZE,
    extract_records,
    get_ext,
    is_sampleable,
)
from app.connectors.base import (
    BaseConnector,
    ConnectionTestResult,
    PostureFinding,
    register_connector,
)
from app.config import settings


@register_connector("gcs_bucket")
class GCSConnector(BaseConnector):
    """Samples objects from a Google Cloud Storage bucket for PII scanning.

    Connection config keys:
      bucket_name      (required) GCS bucket name
      prefix           (optional) object name prefix to scope the scan
      project          (optional) GCP project id
      credentials_json (optional) inline service-account JSON; falls back to
                       GOOGLE_APPLICATION_CREDENTIALS / workload identity
    """

    def __init__(self, asset_id: str, tenant_id: str, config: dict[str, Any]):
        super().__init__(asset_id, tenant_id, config)
        self._client = None

    def _get_client(self):
        if self._client is None:
            # Lazy import so a worker without the GCP SDK still starts and only
            # fails when a GCS asset is actually scanned.
            from google.cloud import storage  # type: ignore

            project = self.config.get("project")
            creds_json = self.config.get("credentials_json")
            if creds_json:
                info = creds_json if isinstance(creds_json, dict) else json.loads(creds_json)
                self._client = storage.Client.from_service_account_info(
                    info, project=project or info.get("project_id")
                )
            elif settings.google_application_credentials:
                self._client = storage.Client.from_service_account_json(
                    settings.google_application_credentials, project=project
                )
            else:
                # Application Default Credentials (workload identity / metadata).
                self._client = storage.Client(project=project)
        return self._client

    def test_connection(self) -> ConnectionTestResult:
        bucket = self.config.get("bucket_name")
        if not bucket:
            return ConnectionTestResult(success=False, message="bucket_name required")
        start = time.monotonic()
        try:
            exists = self._get_client().bucket(bucket).exists()
            if not exists:
                return ConnectionTestResult(
                    success=False, message=f"Bucket '{bucket}' not found or not accessible"
                )
            return ConnectionTestResult(
                success=True,
                message=f"Bucket '{bucket}' is accessible",
                latency_ms=(time.monotonic() - start) * 1000,
            )
        except Exception as exc:  # noqa: BLE001 — surface any SDK/auth error to the UI
            return ConnectionTestResult(success=False, message=str(exc))

    def list_sources(self) -> list[dict[str, Any]]:
        client = self._get_client()
        bucket = self.config["bucket_name"]
        prefix = self.config.get("prefix", "")
        supported = 0
        for blob in client.list_blobs(bucket, prefix=prefix):
            if is_sampleable(blob.name, blob.size or 0):
                supported += 1
        return [{"name": prefix or "/", "type": "bucket", "estimated_rows": supported}]

    def stream_batches(
        self,
        source_name: str,
        batch_size: int = 500,
        max_records: int | None = None,
    ) -> Generator[list[dict[str, Any]], None, None]:
        client = self._get_client()
        bucket = self.config["bucket_name"]
        cap = settings.gcs_max_objects_per_scan
        max_objects = min(max_records or cap, cap)
        prefix = source_name.lstrip("/") if source_name not in ("", "/") else self.config.get("prefix", "")

        batch: list[dict[str, Any]] = []
        processed = 0
        for blob in client.list_blobs(bucket, prefix=prefix):
            if processed >= max_objects:
                break
            size = blob.size or 0
            if not is_sampleable(blob.name, size):
                continue
            ext = get_ext(blob.name)
            try:
                raw = blob.download_as_bytes(end=MAX_OBJECT_SIZE - 1)
                batch.extend(extract_records(blob.name, raw, ext))
                processed += 1
            except Exception as exc:  # noqa: BLE001
                self.log.warning("Failed to read gs://%s/%s: %s", bucket, blob.name, exc)

            while len(batch) >= batch_size:
                yield batch[:batch_size]
                batch = batch[batch_size:]

        if batch:
            yield batch

    def posture_check(self) -> list[PostureFinding]:
        """Audit GCS bucket security controls (public access, encryption, ...)."""
        bucket_name = self.config.get("bucket_name")
        if not bucket_name:
            return []
        findings: list[PostureFinding] = []
        try:
            bucket = self._get_client().get_bucket(bucket_name)
        except Exception as exc:  # noqa: BLE001
            self.log.debug("posture get_bucket failed: %s", exc)
            return []

        # 1. Public Access Prevention — must be 'enforced'.
        try:
            iam_cfg = bucket.iam_configuration
            if (iam_cfg.public_access_prevention or "").lower() != "enforced":
                findings.append(PostureFinding(
                    check_id="GCS_PUBLIC_ACCESS_NOT_PREVENTED",
                    title="GCS bucket does not enforce Public Access Prevention",
                    severity="critical",
                    description="Public Access Prevention is not 'enforced'; the bucket may be made public.",
                    resource=bucket_name,
                    remediation="Set Public Access Prevention to 'enforced' on the bucket.",
                ))
            # 2. Uniform bucket-level access (disables legacy object ACLs).
            if not iam_cfg.uniform_bucket_level_access_enabled:
                findings.append(PostureFinding(
                    check_id="GCS_UNIFORM_ACCESS_DISABLED",
                    title="GCS bucket uniform bucket-level access is disabled",
                    severity="medium",
                    description="Legacy per-object ACLs are allowed, making access hard to reason about.",
                    resource=bucket_name,
                    remediation="Enable uniform bucket-level access on the bucket.",
                ))
        except Exception as exc:  # noqa: BLE001
            self.log.debug("posture iam_configuration failed: %s", exc)

        # 3. IAM policy granting allUsers / allAuthenticatedUsers.
        try:
            policy = bucket.get_iam_policy(requested_policy_version=3)
            public_members = {"allUsers", "allAuthenticatedUsers"}
            for binding in policy.bindings:
                if public_members & set(binding.get("members", [])):
                    findings.append(PostureFinding(
                        check_id="GCS_PUBLIC_IAM_BINDING",
                        title="GCS bucket IAM grants public access",
                        severity="critical",
                        description="An IAM binding grants allUsers/allAuthenticatedUsers; data is internet-accessible.",
                        resource=bucket_name,
                        remediation="Remove allUsers/allAuthenticatedUsers from the bucket IAM policy.",
                    ))
                    break
        except Exception as exc:  # noqa: BLE001
            self.log.debug("posture get_iam_policy failed: %s", exc)

        # 4. Versioning.
        try:
            if not bucket.versioning_enabled:
                findings.append(PostureFinding(
                    check_id="GCS_VERSIONING_DISABLED",
                    title="GCS bucket versioning is not enabled",
                    severity="medium",
                    description="Without object versioning, deleted/overwritten data cannot be recovered.",
                    resource=bucket_name,
                    remediation="Enable object versioning on the bucket.",
                ))
        except Exception as exc:  # noqa: BLE001
            self.log.debug("posture versioning check failed: %s", exc)

        return findings

    def close(self) -> None:
        if self._client is not None:
            try:
                self._client.close()
            except Exception:  # noqa: BLE001
                pass
            self._client = None
