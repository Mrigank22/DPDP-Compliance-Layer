# services/workers/app/connectors/postgresql_connector.py

from __future__ import annotations
import time
from typing import Any, Generator

import psycopg2
import psycopg2.extras

from app.connectors.base import BaseConnector, ConnectionTestResult, PostureFinding, register_connector

_SKIP_COLUMNS = frozenset({
    "id", "created_at", "updated_at", "deleted_at",
    "tenant_id", "user_id", "is_active", "is_deleted", "version",
})

_PII_TYPES = frozenset({
    "text", "varchar", "character varying", "char",
    "bpchar", "json", "jsonb", "integer", "bigint", "numeric",
})


@register_connector("postgresql")
@register_connector("rds_instance")
class PostgreSQLConnector(BaseConnector):
    """Streams records from PostgreSQL tables for PII scanning."""

    def __init__(self, asset_id: str, tenant_id: str, config: dict[str, Any]):
        super().__init__(asset_id, tenant_id, config)
        self._conn = None

    def _get_conn(self):
        if self._conn is None or self._conn.closed:
            self._conn = psycopg2.connect(
                host=self.config.get("host", "localhost"),
                port=int(self.config.get("port", 5432)),
                dbname=self.config.get("database", "postgres"),
                user=self.config.get("username"),
                password=self.config.get("password"),
                sslmode=self.config.get("ssl_mode", "prefer"),
                connect_timeout=10,
                application_name="datasentinel-scanner",
            )
            self._conn.set_session(readonly=True, autocommit=True)
        return self._conn

    def test_connection(self) -> ConnectionTestResult:
        start = time.monotonic()
        try:
            with self._get_conn().cursor() as cur:
                cur.execute("SELECT version()")
                version = cur.fetchone()[0]
            return ConnectionTestResult(
                success=True,
                message="Connected successfully",
                latency_ms=(time.monotonic() - start) * 1000,
                details={"version": version},
            )
        except Exception as exc:
            return ConnectionTestResult(success=False, message=str(exc))

    def list_sources(self) -> list[dict[str, Any]]:
        conn = self._get_conn()
        schema = self.config.get("schema", "public")
        with conn.cursor(cursor_factory=psycopg2.extras.DictCursor) as cur:
            cur.execute("""
                SELECT t.table_name, COALESCE(s.n_live_tup, 0) AS estimated_rows
                FROM information_schema.tables t
                LEFT JOIN pg_stat_user_tables s
                    ON s.schemaname = t.table_schema AND s.relname = t.table_name
                WHERE t.table_schema = %s AND t.table_type = 'BASE TABLE'
                ORDER BY estimated_rows DESC
            """, (schema,))
            tables = cur.fetchall()

            cur.execute("""
                SELECT column_name, table_name, data_type
                FROM information_schema.columns
                WHERE table_schema = %s AND data_type = ANY(%s)
                ORDER BY table_name, ordinal_position
            """, (schema, list(_PII_TYPES)))
            all_cols = cur.fetchall()

        col_map: dict[str, list] = {}
        for col in all_cols:
            tname = col["table_name"]
            if tname not in col_map:
                col_map[tname] = []
            col_map[tname].append({"name": col["column_name"], "type": col["data_type"]})

        sources = []
        for tbl in tables:
            tname = tbl["table_name"]
            cols = [c for c in col_map.get(tname, []) if c["name"] not in _SKIP_COLUMNS]
            if cols:
                sources.append({
                    "name": tname,
                    "type": "table",
                    "schema": schema,
                    "estimated_rows": tbl["estimated_rows"],
                    "columns": cols,
                })
        return sources

    def stream_batches(
        self,
        source_name: str,
        batch_size: int = 500,
        max_records: int | None = None,
    ) -> Generator[list[dict[str, Any]], None, None]:
        conn = self._get_conn()
        schema = self.config.get("schema", "public")
        sources = self.list_sources()
        source = next((s for s in sources if s["name"] == source_name), None)
        if source is None:
            return

        cols = [c["name"] for c in source.get("columns", [])]
        if not cols:
            return

        quoted = ", ".join(f'"{c}"' for c in cols)
        limit = f"LIMIT {max_records}" if max_records else ""
        cursor_name = f"ds_{self.asset_id.replace('-','_')[:16]}"

        with conn.cursor(name=cursor_name, cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(f'SELECT {quoted} FROM "{schema}"."{source_name}" {limit}')
            fetched = 0
            while True:
                rows = cur.fetchmany(batch_size)
                if not rows:
                    break
                yield [dict(r) for r in rows]
                fetched += len(rows)
                if max_records and fetched >= max_records:
                    break

    def search_records(self, source_name: str, term: str, max_matches: int = 1000) -> int | None:
        """
        Push the data-principal search down to PostgreSQL using a single
        ``WHERE col::text ILIKE %s OR ...`` query, capped via a LIMIT subquery so
        the database never scans more than ``max_matches`` matching rows. Far
        cheaper than streaming the entire table into the worker.
        """
        conn = self._get_conn()
        schema = self.config.get("schema", "public")
        source = next((s for s in self.list_sources() if s["name"] == source_name), None)
        if source is None:
            return 0
        cols = [c["name"] for c in source.get("columns", [])]
        if not cols:
            return 0

        # Escape LIKE wildcards in the user-supplied term; values are still bound
        # as parameters so this is not an injection vector — the escaping only
        # prevents '%'/'_' in the term from acting as wildcards.
        safe_term = term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        pattern = f"%{safe_term}%"

        clauses = " OR ".join(f'"{c}"::text ILIKE %s ESCAPE \'\\\'' for c in cols)
        sql = (
            f'SELECT COUNT(*) FROM '
            f'(SELECT 1 FROM "{schema}"."{source_name}" WHERE {clauses} LIMIT %s) AS sub'
        )
        params = [pattern] * len(cols) + [max_matches]

        with conn.cursor() as cur:
            cur.execute(sql, params)
            return int(cur.fetchone()[0])

    def erase_records(self, source_name: str, term: str, max_deletes: int = 100000) -> int | None:
        """
        Delete rows in ``source_name`` whose text columns contain ``term`` (e.g. a
        data-principal email), capped at ``max_deletes``. Uses a dedicated
        read-write connection (the scanning connection is read-only) and commits
        atomically. Returns the number of rows deleted.
        """
        schema = self.config.get("schema", "public")
        source = next((s for s in self.list_sources() if s["name"] == source_name), None)
        if source is None:
            return 0
        cols = [c["name"] for c in source.get("columns", [])]
        if not cols:
            return 0

        safe_term = term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        pattern = f"%{safe_term}%"
        clauses = " OR ".join(f'"{c}"::text ILIKE %s ESCAPE \'\\\'' for c in cols)
        # ctid sub-select caps the delete so a single call can never wipe an
        # unbounded number of rows.
        sql = (
            f'DELETE FROM "{schema}"."{source_name}" '
            f'WHERE ctid IN (SELECT ctid FROM "{schema}"."{source_name}" '
            f'WHERE {clauses} LIMIT %s)'
        )
        params = [pattern] * len(cols) + [int(max_deletes)]

        conn = psycopg2.connect(
            host=self.config.get("host", "localhost"),
            port=int(self.config.get("port", 5432)),
            dbname=self.config.get("database", "postgres"),
            user=self.config.get("username"),
            password=self.config.get("password"),
            sslmode=self.config.get("ssl_mode", "prefer"),
            connect_timeout=10,
            application_name="datasentinel-erasure",
        )
        try:
            conn.autocommit = False
            with conn.cursor() as cur:
                cur.execute(sql, params)
                deleted = cur.rowcount
            conn.commit()
            return int(deleted)
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def posture_check(self) -> list[PostureFinding]:
        """Inspect transport security posture of the database connection."""
        findings: list[PostureFinding] = []
        resource = self.config.get("database", "postgres")

        ssl_mode = (self.config.get("ssl_mode") or "prefer").lower()
        if ssl_mode in ("disable", "allow", "prefer"):
            findings.append(PostureFinding(
                check_id="PG_SSL_NOT_ENFORCED",
                title="Database connection does not require TLS",
                severity="high",
                description=(
                    f"Asset is configured with ssl_mode='{ssl_mode}', which permits "
                    "unencrypted connections. PII in transit may be exposed."
                ),
                resource=resource,
                remediation="Set ssl_mode to 'require' (or 'verify-full') for this asset.",
            ))

        try:
            with self._get_conn().cursor() as cur:
                cur.execute("SHOW ssl")
                row = cur.fetchone()
                if row and str(row[0]).lower() == "off":
                    findings.append(PostureFinding(
                        check_id="PG_SSL_DISABLED",
                        title="PostgreSQL server has TLS disabled",
                        severity="high",
                        description="The server reports ssl=off; all connections are unencrypted.",
                        resource=resource,
                        remediation="Enable SSL on the PostgreSQL server / RDS parameter group.",
                    ))
        except Exception as exc:
            self.log.debug("posture SHOW ssl failed (non-fatal): %s", exc)

        return findings

    def close(self) -> None:
        if self._conn and not self._conn.closed:
            self._conn.close()
            self._conn = None
