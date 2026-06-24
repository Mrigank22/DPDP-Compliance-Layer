# services/workers/app/connectors/bigquery_connector.py

from __future__ import annotations
import json
import time
from typing import Any, Generator

from app.connectors.base import BaseConnector, ConnectionTestResult, register_connector
from app.config import settings

_SKIP_COLUMNS = frozenset({
    "id", "created_at", "updated_at", "deleted_at",
    "tenant_id", "user_id", "is_active", "is_deleted", "version",
})

# BigQuery field types that may hold PII.
_PII_FIELD_TYPES = frozenset({"STRING", "BYTES", "INTEGER", "INT64", "NUMERIC", "BIGNUMERIC"})


@register_connector("bigquery")
class BigQueryConnector(BaseConnector):
    """Streams rows from Google BigQuery tables for PII scanning.

    Connection config keys:
      project (required), dataset (required),
      credentials_json (optional inline service-account JSON; else ADC /
      GOOGLE_APPLICATION_CREDENTIALS)
    """

    def __init__(self, asset_id: str, tenant_id: str, config: dict[str, Any]):
        super().__init__(asset_id, tenant_id, config)
        self._client = None

    def _get_client(self):
        if self._client is None:
            from google.cloud import bigquery  # lazy import

            project = self.config.get("project")
            creds_json = self.config.get("credentials_json")
            if creds_json:
                info = creds_json if isinstance(creds_json, dict) else json.loads(creds_json)
                self._client = bigquery.Client.from_service_account_info(
                    info, project=project or info.get("project_id")
                )
            elif settings.google_application_credentials:
                self._client = bigquery.Client.from_service_account_json(
                    settings.google_application_credentials, project=project
                )
            else:
                self._client = bigquery.Client(project=project)
        return self._client

    def _dataset(self) -> str:
        return self.config.get("dataset") or ""

    def _project(self) -> str:
        return self.config.get("project") or self._get_client().project

    def test_connection(self) -> ConnectionTestResult:
        start = time.monotonic()
        try:
            list(self._get_client().query("SELECT 1 AS ok").result())
            return ConnectionTestResult(
                success=True, message="Connected successfully",
                latency_ms=(time.monotonic() - start) * 1000,
            )
        except Exception as exc:  # noqa: BLE001
            return ConnectionTestResult(success=False, message=str(exc))

    def list_sources(self) -> list[dict[str, Any]]:
        client = self._get_client()
        dataset_ref = f"{self._project()}.{self._dataset()}"
        out = []
        for tbl in client.list_tables(dataset_ref):
            table = client.get_table(tbl.reference)
            columns = [
                {"name": f.name}
                for f in table.schema
                if f.field_type in _PII_FIELD_TYPES and f.name.lower() not in _SKIP_COLUMNS
            ]
            if columns:
                out.append({
                    "name": table.table_id, "type": "table",
                    "estimated_rows": int(table.num_rows or 0), "columns": columns,
                })
        return out

    def stream_batches(
        self, source_name: str, batch_size: int = 500, max_records: int | None = None
    ) -> Generator[list[dict[str, Any]], None, None]:
        client = self._get_client()
        table_ref = f"{self._project()}.{self._dataset()}.{source_name}"
        table = client.get_table(table_ref)
        rows_iter = client.list_rows(table, max_results=max_records, page_size=batch_size)
        batch: list[dict[str, Any]] = []
        for row in rows_iter:
            batch.append(dict(row))
            if len(batch) >= batch_size:
                yield batch
                batch = []
        if batch:
            yield batch

    def search_records(self, source_name: str, term: str, max_matches: int = 1000) -> int | None:
        from google.cloud import bigquery  # lazy import

        source = next((s for s in self.list_sources() if s["name"] == source_name), None)
        if source is None:
            return 0
        cols = [c["name"] for c in source.get("columns", [])]
        if not cols:
            return 0
        table_ref = f"{self._project()}.{self._dataset()}.{source_name}"
        pattern = f"%{term.lower()}%"
        clauses = " OR ".join(f"LOWER(CAST(`{c}` AS STRING)) LIKE @term" for c in cols)
        sql = (
            f"SELECT COUNT(*) AS n FROM "
            f"(SELECT 1 FROM `{table_ref}` WHERE {clauses} LIMIT @lim)"
        )
        job_config = bigquery.QueryJobConfig(query_parameters=[
            bigquery.ScalarQueryParameter("term", "STRING", pattern),
            bigquery.ScalarQueryParameter("lim", "INT64", int(max_matches)),
        ])
        result = self._get_client().query(sql, job_config=job_config).result()
        for r in result:
            return int(r["n"])
        return 0

    def profile_columns(self, source_name: str) -> dict[str, dict[str, int]] | None:
        """Full-coverage structured-PII detection pushed down to BigQuery (REGEXP_CONTAINS)."""
        from app.pii.structured_patterns import build_profile_selects, map_profile_row, quote_lit

        source = next((s for s in self.list_sources() if s["name"] == source_name), None)
        if source is None:
            return None
        cols = [c["name"] for c in source.get("columns", [])]
        if not cols:
            return None

        table_ref = f"{self._project()}.{self._dataset()}.{source_name}"
        selects, meta = build_profile_selects(
            cols, lambda c, p: f"REGEXP_CONTAINS(CAST(`{c}` AS STRING), {quote_lit(p)})"
        )
        if not selects:
            return None

        sql = f"SELECT {selects} FROM `{table_ref}`"
        rows = list(self._get_client().query(sql).result())
        if not rows:
            return {}
        row = rows[0]
        values = [row[i] for i in range(len(meta))]
        return map_profile_row(meta, values)

    def close(self) -> None:
        if self._client is not None:
            try:
                self._client.close()
            except Exception:  # noqa: BLE001
                pass
            self._client = None
