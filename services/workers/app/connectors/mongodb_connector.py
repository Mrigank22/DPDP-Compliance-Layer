# services/workers/app/connectors/mongodb_connector.py

from __future__ import annotations
import json
import time
from typing import Any, Generator

from app.connectors.base import BaseConnector, ConnectionTestResult, register_connector

_MAX_DOC_SAMPLE = 5  # docs sampled to infer fields for list_sources


def _flatten_doc(value: Any, prefix: str, out: dict[str, Any]) -> None:
    """Flatten a (possibly nested, BSON-typed) document into scalar dotted keys."""
    if isinstance(value, dict):
        for k, v in value.items():
            _flatten_doc(v, f"{prefix}.{k}" if prefix else str(k), out)
    elif isinstance(value, list):
        out[prefix] = json.dumps(value, default=str)
    elif isinstance(value, (str, int, float, bool)) or value is None:
        out[prefix] = value
    else:
        out[prefix] = str(value)  # ObjectId, datetime, Decimal128, ...


@register_connector("mongodb")
class MongoDBConnector(BaseConnector):
    """Streams documents from MongoDB collections for PII scanning.

    Connection config keys:
      uri (preferred full connection string) OR host/port/username/password,
      database (required), tls (bool)
    """

    def __init__(self, asset_id: str, tenant_id: str, config: dict[str, Any]):
        super().__init__(asset_id, tenant_id, config)
        self._client = None

    def _get_client(self):
        if self._client is None:
            from pymongo import MongoClient  # lazy import

            uri = self.config.get("uri")
            if uri:
                self._client = MongoClient(uri, serverSelectionTimeoutMS=10000)
            else:
                self._client = MongoClient(
                    host=self.config.get("host", "localhost"),
                    port=int(self.config.get("port", 27017)),
                    username=self.config.get("username"),
                    password=self.config.get("password"),
                    tls=bool(self.config.get("tls", False)),
                    serverSelectionTimeoutMS=10000,
                )
        return self._client

    def _db(self):
        name = self.config.get("database")
        if not name:
            raise ValueError("database is required for MongoDB")
        return self._get_client()[name]

    def test_connection(self) -> ConnectionTestResult:
        start = time.monotonic()
        try:
            self._get_client().admin.command("ping")
            return ConnectionTestResult(
                success=True, message="Connected successfully",
                latency_ms=(time.monotonic() - start) * 1000,
            )
        except Exception as exc:  # noqa: BLE001
            return ConnectionTestResult(success=False, message=str(exc))

    def list_sources(self) -> list[dict[str, Any]]:
        db = self._db()
        out = []
        for name in db.list_collection_names():
            if name.startswith("system."):
                continue
            coll = db[name]
            try:
                count = coll.estimated_document_count()
            except Exception:  # noqa: BLE001
                count = 0
            fields: set[str] = set()
            for doc in coll.find({}, limit=_MAX_DOC_SAMPLE):
                flat: dict[str, Any] = {}
                _flatten_doc(doc, "", flat)
                fields.update(flat.keys())
            out.append({
                "name": name, "type": "collection",
                "estimated_rows": int(count),
                "columns": [{"name": f} for f in sorted(fields)],
            })
        return out

    def stream_batches(
        self, source_name: str, batch_size: int = 500, max_records: int | None = None
    ) -> Generator[list[dict[str, Any]], None, None]:
        coll = self._db()[source_name]
        cursor = coll.find({}, batch_size=batch_size)
        if max_records:
            cursor = cursor.limit(int(max_records))
        batch: list[dict[str, Any]] = []
        for doc in cursor:
            flat: dict[str, Any] = {}
            _flatten_doc(doc, "", flat)
            batch.append(flat)
            if len(batch) >= batch_size:
                yield batch
                batch = []
        if batch:
            yield batch

    def close(self) -> None:
        if self._client is not None:
            try:
                self._client.close()
            except Exception:  # noqa: BLE001
                pass
            self._client = None
