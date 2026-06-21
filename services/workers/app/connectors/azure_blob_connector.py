# services/workers/app/connectors/azure_blob_connector.py

from __future__ import annotations
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


@register_connector("azure_blob")
class AzureBlobConnector(BaseConnector):
    """Samples blobs from an Azure Blob Storage container for PII scanning.

    Connection config keys:
      account           (required unless connection_string) storage account name
      container         (required) blob container name
      prefix            (optional) blob name prefix to scope the scan
      connection_string (optional) full account connection string
      account_key       (optional) shared-key credential for the account
      sas_token         (optional) SAS token credential
      (falls back to AZURE_STORAGE_CONNECTION_STRING, then managed identity)
    """

    def __init__(self, asset_id: str, tenant_id: str, config: dict[str, Any]):
        super().__init__(asset_id, tenant_id, config)
        self._service = None

    def _get_service(self):
        if self._service is None:
            # Lazy import so the worker starts even without the Azure SDK.
            from azure.storage.blob import BlobServiceClient  # type: ignore

            conn_str = self.config.get("connection_string") or settings.azure_storage_connection_string
            if conn_str:
                self._service = BlobServiceClient.from_connection_string(conn_str)
            else:
                account = self.config.get("account")
                if not account:
                    raise ValueError("account or connection_string is required for Azure Blob")
                account_url = f"https://{account}.blob.core.windows.net"
                credential: Any = (
                    self.config.get("account_key")
                    or self.config.get("sas_token")
                )
                if credential is None:
                    # Managed identity / workload identity as a last resort.
                    from azure.identity import DefaultAzureCredential  # type: ignore

                    credential = DefaultAzureCredential()
                self._service = BlobServiceClient(account_url=account_url, credential=credential)
        return self._service

    def _container_client(self):
        container = self.config.get("container")
        if not container:
            raise ValueError("container is required for Azure Blob")
        return self._get_service().get_container_client(container)

    def test_connection(self) -> ConnectionTestResult:
        if not self.config.get("container"):
            return ConnectionTestResult(success=False, message="container required")
        start = time.monotonic()
        try:
            cc = self._container_client()
            # Touch the container; raises if missing or unauthorized.
            cc.get_container_properties()
            return ConnectionTestResult(
                success=True,
                message=f"Container '{self.config['container']}' is accessible",
                latency_ms=(time.monotonic() - start) * 1000,
            )
        except Exception as exc:  # noqa: BLE001
            return ConnectionTestResult(success=False, message=str(exc))

    def list_sources(self) -> list[dict[str, Any]]:
        cc = self._container_client()
        prefix = self.config.get("prefix", "")
        supported = 0
        for blob in cc.list_blobs(name_starts_with=prefix):
            if is_sampleable(blob.name, blob.size or 0):
                supported += 1
        return [{"name": prefix or "/", "type": "container", "estimated_rows": supported}]

    def stream_batches(
        self,
        source_name: str,
        batch_size: int = 500,
        max_records: int | None = None,
    ) -> Generator[list[dict[str, Any]], None, None]:
        cc = self._container_client()
        cap = settings.azure_max_blobs_per_scan
        max_objects = min(max_records or cap, cap)
        prefix = source_name.lstrip("/") if source_name not in ("", "/") else self.config.get("prefix", "")

        batch: list[dict[str, Any]] = []
        processed = 0
        for blob in cc.list_blobs(name_starts_with=prefix):
            if processed >= max_objects:
                break
            size = blob.size or 0
            if not is_sampleable(blob.name, size):
                continue
            ext = get_ext(blob.name)
            try:
                downloader = cc.download_blob(blob.name, offset=0, length=min(size, MAX_OBJECT_SIZE))
                raw = downloader.readall()
                batch.extend(extract_records(blob.name, raw, ext))
                processed += 1
            except Exception as exc:  # noqa: BLE001
                self.log.warning("Failed to read azure blob %s: %s", blob.name, exc)

            while len(batch) >= batch_size:
                yield batch[:batch_size]
                batch = batch[batch_size:]

        if batch:
            yield batch

    def posture_check(self) -> list[PostureFinding]:
        """Audit Azure Blob container security controls (public access)."""
        container = self.config.get("container")
        if not container:
            return []
        findings: list[PostureFinding] = []
        try:
            props = self._container_client().get_container_properties()
        except Exception as exc:  # noqa: BLE001
            self.log.debug("posture get_container_properties failed: %s", exc)
            return []

        # public_access: None = private; 'blob' / 'container' = anonymous access.
        public_access = getattr(props, "public_access", None)
        if public_access:
            findings.append(PostureFinding(
                check_id="AZURE_BLOB_PUBLIC_ACCESS",
                title="Azure Blob container allows anonymous public access",
                severity="critical",
                description=(
                    f"Container public access level is '{public_access}'. "
                    "Blobs may be readable without authentication."
                ),
                resource=container,
                remediation="Set the container public access level to 'Private (no anonymous access)'.",
            ))

        return findings

    def close(self) -> None:
        if self._service is not None:
            try:
                self._service.close()
            except Exception:  # noqa: BLE001
                pass
            self._service = None
