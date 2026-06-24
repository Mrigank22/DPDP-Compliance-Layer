# services/workers/app/connectors/redshift_connector.py

from __future__ import annotations
import time
from typing import Any, Generator

from app.connectors.base import BaseConnector, ConnectionTestResult, register_connector

_SKIP_COLUMNS = frozenset({
    "id", "created_at", "updated_at", "deleted_at",
    "tenant_id", "user_id", "is_active", "is_deleted", "version",
})

# Redshift column types that may hold PII.
_PII_TYPES = frozenset({
    "character varying", "varchar", "char", "character", "text",
    "bpchar", "super", "integer", "bigint", "numeric",
})


@register_connector("redshift")
class RedshiftConnector(BaseConnector):
    """Streams records from Amazon Redshift for PII scanning.

    Redshift speaks the PostgreSQL wire protocol, so the already-bundled
    psycopg2 driver is reused. Queries use portable ``information_schema`` views.

    Connection config keys:
      host (required), port (5439), database (required),
      username, password, ssl_mode (default require), schema (default public)
    """

    def __init__(self, asset_id: str, tenant_id: str, config: dict[str, Any]):
        super().__init__(asset_id, tenant_id, config)
        self._conn = None

    def _get_conn(self):
        import psycopg2  # lazy (bundled, but keeps imports uniform)

        if self._conn is None or self._conn.closed:
            self._conn = psycopg2.connect(
                host=self.config.get("host"),
                port=int(self.config.get("port", 5439)),
                dbname=self.config.get("database"),
                user=self.config.get("username"),
                password=self.config.get("password"),
                sslmode=self.config.get("ssl_mode", "require"),
                connect_timeout=15,
                application_name="datasentinel-scanner",
            )
            self._conn.set_session(readonly=True, autocommit=True)
        return self._conn

    def _schema(self) -> str:
        return self.config.get("schema", "public")

    def test_connection(self) -> ConnectionTestResult:
        start = time.monotonic()
        try:
            with self._get_conn().cursor() as cur:
                cur.execute("SELECT version()")
                version = cur.fetchone()[0]
            return ConnectionTestResult(
                success=True, message="Connected successfully",
                latency_ms=(time.monotonic() - start) * 1000,
                details={"version": str(version)[:120]},
            )
        except Exception as exc:  # noqa: BLE001
            return ConnectionTestResult(success=False, message=str(exc))

    def list_sources(self) -> list[dict[str, Any]]:
        schema = self._schema()
        with self._get_conn().cursor() as cur:
            cur.execute(
                """
                SELECT table_name
                FROM information_schema.tables
                WHERE table_schema = %s AND table_type = 'BASE TABLE'
                ORDER BY table_name
                """,
                (schema,),
            )
            tables = [r[0] for r in cur.fetchall()]
            cur.execute(
                """
                SELECT table_name, column_name
                FROM information_schema.columns
                WHERE table_schema = %s AND data_type = ANY(%s)
                ORDER BY table_name, ordinal_position
                """,
                (schema, list(_PII_TYPES)),
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
        schema = self._schema()
        source = next((s for s in self.list_sources() if s["name"] == source_name), None)
        if source is None:
            return
        cols = [c["name"] for c in source.get("columns", [])]
        if not cols:
            return
        quoted = ", ".join(f'"{c}"' for c in cols)
        limit = f" LIMIT {int(max_records)}" if max_records else ""
        with self._get_conn().cursor() as cur:
            cur.execute(f'SELECT {quoted} FROM "{schema}"."{source_name}"{limit}')
            fetched = 0
            while True:
                rows = cur.fetchmany(batch_size)
                if not rows:
                    break
                yield [dict(zip(cols, r)) for r in rows]
                fetched += len(rows)
                if max_records and fetched >= max_records:
                    break

    def search_records(self, source_name: str, term: str, max_matches: int = 1000) -> int | None:
        schema = self._schema()
        source = next((s for s in self.list_sources() if s["name"] == source_name), None)
        if source is None:
            return 0
        cols = [c["name"] for c in source.get("columns", [])]
        if not cols:
            return 0
        pattern = f"%{term}%"
        clauses = " OR ".join(f'CAST("{c}" AS VARCHAR) ILIKE %s' for c in cols)
        sql = (
            f'SELECT COUNT(*) FROM '
            f'(SELECT 1 FROM "{schema}"."{source_name}" WHERE {clauses} LIMIT %s) AS sub'
        )
        params = [pattern] * len(cols) + [int(max_matches)]
        with self._get_conn().cursor() as cur:
            cur.execute(sql, params)
            return int(cur.fetchone()[0])

    def profile_columns(self, source_name: str) -> dict[str, dict[str, int]] | None:
        """Full-coverage structured-PII detection pushed down to Redshift (~ operator)."""
        from app.pii.structured_patterns import build_profile_selects, map_profile_row, quote_lit

        schema = self._schema()
        source = next((s for s in self.list_sources() if s["name"] == source_name), None)
        if source is None:
            return None
        cols = [c["name"] for c in source.get("columns", [])]
        if not cols:
            return None

        selects, meta = build_profile_selects(
            cols, lambda c, p: f'CAST("{c}" AS VARCHAR) ~ {quote_lit(p)}'
        )
        if not selects:
            return None

        sql = f'SELECT {selects} FROM "{schema}"."{source_name}"'
        with self._get_conn().cursor() as cur:
            cur.execute(sql)
            row = cur.fetchone()
        if row is None:
            return {}
        return map_profile_row(meta, list(row))

    def close(self) -> None:
        if self._conn is not None and not self._conn.closed:
            self._conn.close()
        self._conn = None
