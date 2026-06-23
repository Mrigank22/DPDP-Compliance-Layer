# services/workers/app/connectors/databricks_connector.py

from __future__ import annotations
import re
import time
from typing import Any, Generator

from app.connectors.base import BaseConnector, ConnectionTestResult, register_connector

_SKIP_COLUMNS = frozenset({
    "id", "created_at", "updated_at", "deleted_at",
    "tenant_id", "user_id", "is_active", "is_deleted", "version",
})

_IDENT = re.compile(r"^[A-Za-z0-9_]+$")


def _safe_ident(name: str, default: str) -> str:
    """Allow only simple identifiers for catalog/schema (interpolated, not bound)."""
    name = (name or "").strip()
    return name if _IDENT.match(name) else default


def _bq(identifier: str) -> str:
    return "`" + str(identifier).replace("`", "``") + "`"


@register_connector("databricks")
class DatabricksConnector(BaseConnector):
    """Streams records from Databricks (Unity Catalog) tables for PII scanning.

    Connection config keys:
      server_hostname (required), http_path (required), access_token (required),
      catalog (default main), schema (default default)
    """

    def __init__(self, asset_id: str, tenant_id: str, config: dict[str, Any]):
        super().__init__(asset_id, tenant_id, config)
        self._conn = None

    def _get_conn(self):
        if self._conn is None:
            from databricks import sql as dbsql  # lazy import

            self._conn = dbsql.connect(
                server_hostname=self.config.get("server_hostname"),
                http_path=self.config.get("http_path"),
                access_token=self.config.get("access_token"),
            )
        return self._conn

    def _catalog(self) -> str:
        return _safe_ident(self.config.get("catalog"), "main")

    def _schema(self) -> str:
        return _safe_ident(self.config.get("schema"), "default")

    def test_connection(self) -> ConnectionTestResult:
        start = time.monotonic()
        try:
            with self._get_conn().cursor() as cur:
                cur.execute("SELECT 1")
                cur.fetchone()
            return ConnectionTestResult(
                success=True, message="Connected successfully",
                latency_ms=(time.monotonic() - start) * 1000,
            )
        except Exception as exc:  # noqa: BLE001
            return ConnectionTestResult(success=False, message=str(exc))

    def list_sources(self) -> list[dict[str, Any]]:
        catalog, schema = self._catalog(), self._schema()
        with self._get_conn().cursor() as cur:
            cur.execute(
                f"SELECT table_name FROM {_bq(catalog)}.information_schema.tables "
                f"WHERE table_schema = %(schema)s AND table_type IN ('MANAGED', 'EXTERNAL')",
                {"schema": schema},
            )
            tables = [r[0] for r in cur.fetchall()]
            cur.execute(
                f"SELECT table_name, column_name FROM {_bq(catalog)}.information_schema.columns "
                f"WHERE table_schema = %(schema)s ORDER BY table_name, ordinal_position",
                {"schema": schema},
            )
            cols = cur.fetchall()

        colmap: dict[str, list] = {}
        for t, c in cols:
            colmap.setdefault(t, []).append(c)

        out = []
        for name in tables:
            columns = [{"name": c} for c in colmap.get(name, []) if c.lower() not in _SKIP_COLUMNS]
            if columns:
                out.append({"name": name, "type": "table", "schema": schema, "columns": columns})
        return out

    def stream_batches(
        self, source_name: str, batch_size: int = 500, max_records: int | None = None
    ) -> Generator[list[dict[str, Any]], None, None]:
        catalog, schema = self._catalog(), self._schema()
        limit = f" LIMIT {int(max_records)}" if max_records else ""
        with self._get_conn().cursor() as cur:
            cur.execute(f"SELECT * FROM {_bq(catalog)}.{_bq(schema)}.{_bq(source_name)}{limit}")
            names = [d[0] for d in cur.description]
            fetched = 0
            while True:
                rows = cur.fetchmany(batch_size)
                if not rows:
                    break
                yield [dict(zip(names, r)) for r in rows]
                fetched += len(rows)
                if max_records and fetched >= max_records:
                    break

    def search_records(self, source_name: str, term: str, max_matches: int = 1000) -> int | None:
        catalog, schema = self._catalog(), self._schema()
        source = next((s for s in self.list_sources() if s["name"] == source_name), None)
        if source is None:
            return 0
        cols = [c["name"] for c in source.get("columns", [])]
        if not cols:
            return 0
        pattern = f"%{term.lower()}%"
        clauses = " OR ".join(f"LOWER(CAST({_bq(c)} AS STRING)) LIKE %(term)s" for c in cols)
        sql = (
            f"SELECT COUNT(*) FROM "
            f"(SELECT 1 FROM {_bq(catalog)}.{_bq(schema)}.{_bq(source_name)} "
            f"WHERE {clauses} LIMIT %(lim)s)"
        )
        with self._get_conn().cursor() as cur:
            cur.execute(sql, {"term": pattern, "lim": int(max_matches)})
            return int(cur.fetchone()[0])

    def close(self) -> None:
        if self._conn is not None:
            try:
                self._conn.close()
            except Exception:  # noqa: BLE001
                pass
            self._conn = None
