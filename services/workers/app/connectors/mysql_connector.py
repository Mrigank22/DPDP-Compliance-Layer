# services/workers/app/connectors/mysql_connector.py

from __future__ import annotations
import time
from typing import Any, Generator

from app.connectors.base import (
    BaseConnector,
    ConnectionTestResult,
    PostureFinding,
    register_connector,
)

# Columns that are structural / non-PII and not worth scanning.
_SKIP_COLUMNS = frozenset({
    "id", "created_at", "updated_at", "deleted_at",
    "tenant_id", "user_id", "is_active", "is_deleted", "version",
})

# MySQL data types that can plausibly hold PII.
_PII_TYPES = frozenset({
    "char", "varchar", "tinytext", "text", "mediumtext", "longtext",
    "json", "enum", "set", "int", "bigint", "decimal",
})


def _bq(identifier: str) -> str:
    """Backtick-quote a MySQL identifier, escaping embedded backticks."""
    return "`" + identifier.replace("`", "``") + "`"


@register_connector("mysql")
class MySQLConnector(BaseConnector):
    """Streams records from MySQL-compatible tables for PII scanning.

    Works with self-hosted MySQL/MariaDB and managed offerings on every major
    cloud — AWS RDS / Aurora MySQL, GCP Cloud SQL for MySQL, and Azure Database
    for MySQL — since all speak the MySQL wire protocol.

    Connection config keys:
      host (required), port (3306), database (required),
      username, password, ssl (bool) | ssl_mode, ssl_ca, schema
    """

    def __init__(self, asset_id: str, tenant_id: str, config: dict[str, Any]):
        super().__init__(asset_id, tenant_id, config)
        self._conn = None

    def _want_ssl(self) -> bool:
        if self.config.get("ssl") is True:
            return True
        return (self.config.get("ssl_mode") or "").lower() in (
            "require", "required", "verify-ca", "verify_ca", "verify-full", "verify_identity",
        )

    def _get_conn(self):
        import pymysql  # lazy import — worker starts without the driver installed
        import pymysql.cursors

        if self._conn is None or not self._conn.open:
            kwargs: dict[str, Any] = dict(
                host=self.config.get("host", "localhost"),
                port=int(self.config.get("port", 3306)),
                user=self.config.get("username"),
                password=self.config.get("password"),
                database=self.config.get("database"),
                connect_timeout=10,
                charset="utf8mb4",
                autocommit=True,
                cursorclass=pymysql.cursors.DictCursor,
            )
            if self._want_ssl():
                import ssl as ssl_lib

                ctx = ssl_lib.create_default_context()
                if self.config.get("ssl_ca"):
                    ctx.load_verify_locations(self.config["ssl_ca"])
                else:
                    # Encrypt in transit even when no CA is pinned.
                    ctx.check_hostname = False
                    ctx.verify_mode = ssl_lib.CERT_NONE
                kwargs["ssl"] = ctx
            self._conn = pymysql.connect(**kwargs)
        return self._conn

    def _database(self) -> str:
        return self.config.get("database") or self.config.get("schema") or ""

    def test_connection(self) -> ConnectionTestResult:
        start = time.monotonic()
        try:
            with self._get_conn().cursor() as cur:
                cur.execute("SELECT VERSION() AS v")
                version = cur.fetchone()["v"]
            return ConnectionTestResult(
                success=True,
                message="Connected successfully",
                latency_ms=(time.monotonic() - start) * 1000,
                details={"version": version},
            )
        except Exception as exc:  # noqa: BLE001
            return ConnectionTestResult(success=False, message=str(exc))

    def list_sources(self) -> list[dict[str, Any]]:
        db = self._database()
        conn = self._get_conn()
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT TABLE_NAME AS table_name, COALESCE(TABLE_ROWS, 0) AS estimated_rows
                FROM information_schema.TABLES
                WHERE TABLE_SCHEMA = %s AND TABLE_TYPE = 'BASE TABLE'
                ORDER BY estimated_rows DESC
                """,
                (db,),
            )
            tables = cur.fetchall()

            cur.execute(
                """
                SELECT COLUMN_NAME AS column_name, TABLE_NAME AS table_name, DATA_TYPE AS data_type
                FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = %s AND DATA_TYPE IN %s
                ORDER BY TABLE_NAME, ORDINAL_POSITION
                """,
                (db, tuple(_PII_TYPES)),
            )
            all_cols = cur.fetchall()

        col_map: dict[str, list] = {}
        for col in all_cols:
            col_map.setdefault(col["table_name"], []).append(
                {"name": col["column_name"], "type": col["data_type"]}
            )

        sources = []
        for tbl in tables:
            tname = tbl["table_name"]
            cols = [c for c in col_map.get(tname, []) if c["name"] not in _SKIP_COLUMNS]
            if cols:
                sources.append({
                    "name": tname,
                    "type": "table",
                    "schema": db,
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
        import pymysql.cursors

        db = self._database()
        source = next((s for s in self.list_sources() if s["name"] == source_name), None)
        if source is None:
            return
        cols = [c["name"] for c in source.get("columns", [])]
        if not cols:
            return

        quoted = ", ".join(_bq(c) for c in cols)
        limit = f"LIMIT {int(max_records)}" if max_records else ""
        sql = f"SELECT {quoted} FROM {_bq(db)}.{_bq(source_name)} {limit}"

        # Unbuffered server-side cursor so large tables stream row-by-row.
        conn = self._get_conn()
        with conn.cursor(pymysql.cursors.SSDictCursor) as cur:
            cur.execute(sql)
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
        """Push the data-principal search down to MySQL via a single LIKE query."""
        db = self._database()
        source = next((s for s in self.list_sources() if s["name"] == source_name), None)
        if source is None:
            return 0
        cols = [c["name"] for c in source.get("columns", [])]
        if not cols:
            return 0

        # Escape LIKE wildcards in the term; values stay bound as parameters.
        safe_term = term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        pattern = f"%{safe_term}%"
        clauses = " OR ".join(f"CAST({_bq(c)} AS CHAR) LIKE %s" for c in cols)
        sql = (
            f"SELECT COUNT(*) AS n FROM "
            f"(SELECT 1 FROM {_bq(db)}.{_bq(source_name)} WHERE {clauses} LIMIT %s) AS sub"
        )
        params = [pattern] * len(cols) + [int(max_matches)]

        with self._get_conn().cursor() as cur:
            cur.execute(sql, params)
            row = cur.fetchone()
            return int(row["n"]) if row else 0

    def erase_records(self, source_name: str, term: str, max_deletes: int = 100000) -> int | None:
        """Delete rows in ``source_name`` containing ``term`` (capped). Returns count."""
        db = self._database()
        source = next((s for s in self.list_sources() if s["name"] == source_name), None)
        if source is None:
            return 0
        cols = [c["name"] for c in source.get("columns", [])]
        if not cols:
            return 0

        safe_term = term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        pattern = f"%{safe_term}%"
        clauses = " OR ".join(f"CAST({_bq(c)} AS CHAR) LIKE %s" for c in cols)
        # MySQL supports a direct row cap on DELETE.
        sql = f"DELETE FROM {_bq(db)}.{_bq(source_name)} WHERE {clauses} LIMIT %s"
        params = [pattern] * len(cols) + [int(max_deletes)]

        conn = self._get_conn()  # autocommit=True
        with conn.cursor() as cur:
            cur.execute(sql, params)
            return int(cur.rowcount)

    def posture_check(self) -> list[PostureFinding]:
        """Inspect transport security posture of the database connection."""
        findings: list[PostureFinding] = []
        resource = self._database() or "mysql"

        if not self._want_ssl():
            findings.append(PostureFinding(
                check_id="MYSQL_SSL_NOT_ENFORCED",
                title="Database connection does not require TLS",
                severity="high",
                description=(
                    "Asset is not configured to require TLS, permitting unencrypted "
                    "connections. PII in transit may be exposed."
                ),
                resource=resource,
                remediation="Enable 'ssl' (or set ssl_mode to 'require') for this asset.",
            ))

        try:
            with self._get_conn().cursor() as cur:
                cur.execute("SHOW SESSION STATUS LIKE 'Ssl_cipher'")
                row = cur.fetchone()
                cipher = (row or {}).get("Value", "")
                if not cipher:
                    findings.append(PostureFinding(
                        check_id="MYSQL_CONNECTION_UNENCRYPTED",
                        title="MySQL connection is not encrypted",
                        severity="high",
                        description="The active session reports no SSL cipher; traffic is in plaintext.",
                        resource=resource,
                        remediation="Require TLS on the server and connect with SSL enabled.",
                    ))
        except Exception as exc:  # noqa: BLE001
            self.log.debug("posture Ssl_cipher check failed (non-fatal): %s", exc)

        return findings

    def close(self) -> None:
        if self._conn is not None and self._conn.open:
            self._conn.close()
        self._conn = None
