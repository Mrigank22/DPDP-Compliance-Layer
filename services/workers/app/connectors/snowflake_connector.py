# services/workers/app/connectors/snowflake_connector.py

from __future__ import annotations
import time
from typing import Any, Generator

from app.connectors.base import BaseConnector, ConnectionTestResult, register_connector

# Structural columns not worth scanning.
_SKIP_COLUMNS = frozenset({
    "id", "created_at", "updated_at", "deleted_at",
    "tenant_id", "user_id", "is_active", "is_deleted", "version",
})


@register_connector("snowflake")
class SnowflakeConnector(BaseConnector):
    """Streams records from Snowflake tables for PII scanning.

    Connection config keys:
      account (required), user/username, password, warehouse,
      database (required), schema (default PUBLIC), role
    """

    def __init__(self, asset_id: str, tenant_id: str, config: dict[str, Any]):
        super().__init__(asset_id, tenant_id, config)
        self._conn = None

    def _get_conn(self):
        if self._conn is None:
            import snowflake.connector  # lazy import — worker starts without the SDK

            self._conn = snowflake.connector.connect(
                account=self.config.get("account"),
                user=self.config.get("user") or self.config.get("username"),
                password=self.config.get("password"),
                warehouse=self.config.get("warehouse"),
                database=self.config.get("database"),
                schema=self._schema(),
                role=self.config.get("role"),
                login_timeout=15,
                network_timeout=30,
            )
        return self._conn

    def _schema(self) -> str:
        return (self.config.get("schema") or "PUBLIC")

    def _database(self) -> str:
        return self.config.get("database") or ""

    def test_connection(self) -> ConnectionTestResult:
        start = time.monotonic()
        try:
            cur = self._get_conn().cursor()
            try:
                cur.execute("SELECT CURRENT_VERSION()")
                version = cur.fetchone()[0]
            finally:
                cur.close()
            return ConnectionTestResult(
                success=True, message="Connected successfully",
                latency_ms=(time.monotonic() - start) * 1000,
                details={"version": str(version)},
            )
        except Exception as exc:  # noqa: BLE001
            return ConnectionTestResult(success=False, message=str(exc))

    def list_sources(self) -> list[dict[str, Any]]:
        conn = self._get_conn()
        schema = self._schema().upper()
        cur = conn.cursor()
        try:
            cur.execute(
                """
                SELECT table_name, COALESCE(row_count, 0)
                FROM information_schema.tables
                WHERE table_schema = %s AND table_type = 'BASE TABLE'
                """,
                (schema,),
            )
            tables = cur.fetchall()
            cur.execute(
                """
                SELECT table_name, column_name
                FROM information_schema.columns
                WHERE table_schema = %s
                ORDER BY table_name, ordinal_position
                """,
                (schema,),
            )
            cols = cur.fetchall()
        finally:
            cur.close()

        colmap: dict[str, list] = {}
        for t, c in cols:
            colmap.setdefault(t, []).append(c)

        out = []
        for name, rc in tables:
            columns = [{"name": c} for c in colmap.get(name, []) if c.lower() not in _SKIP_COLUMNS]
            if columns:
                out.append({
                    "name": name, "type": "table", "schema": self._schema(),
                    "estimated_rows": int(rc or 0), "columns": columns,
                })
        return out

    def stream_batches(
        self, source_name: str, batch_size: int = 500, max_records: int | None = None
    ) -> Generator[list[dict[str, Any]], None, None]:
        conn = self._get_conn()
        schema, db = self._schema(), self._database()
        limit = f" LIMIT {int(max_records)}" if max_records else ""
        cur = conn.cursor()
        try:
            cur.execute(f'SELECT * FROM "{db}"."{schema}"."{source_name}"{limit}')
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
        finally:
            cur.close()

    def search_records(self, source_name: str, term: str, max_matches: int = 1000) -> int | None:
        source = next((s for s in self.list_sources() if s["name"] == source_name), None)
        if source is None:
            return 0
        cols = [c["name"] for c in source.get("columns", [])]
        if not cols:
            return 0
        schema, db = self._schema(), self._database()
        pattern = f"%{term}%"
        clauses = " OR ".join(f'TO_VARCHAR("{c}") ILIKE %s' for c in cols)
        sql = (
            f'SELECT COUNT(*) FROM '
            f'(SELECT 1 FROM "{db}"."{schema}"."{source_name}" WHERE {clauses} LIMIT %s)'
        )
        params = [pattern] * len(cols) + [int(max_matches)]
        cur = self._get_conn().cursor()
        try:
            cur.execute(sql, params)
            return int(cur.fetchone()[0])
        finally:
            cur.close()

    def close(self) -> None:
        if self._conn is not None:
            try:
                self._conn.close()
            except Exception:  # noqa: BLE001
                pass
            self._conn = None
