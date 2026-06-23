# services/workers/app/connectors/salesforce_connector.py

from __future__ import annotations
import re
import time
from typing import Any, Generator

from app.connectors.base import BaseConnector, ConnectionTestResult, register_connector

# PII-bearing standard objects scanned by default. Override with config "objects".
_DEFAULT_OBJECTS = ["Contact", "Lead", "Account", "Case", "User"]

# Field types that are not directly SOQL-selectable / not useful to scan.
_SKIP_FIELD_TYPES = frozenset({"address", "location", "base64", "encryptedstring"})

_MAX_FIELDS = 120  # bound SOQL SELECT length
_SOSL_ALLOWED = re.compile(r"[^A-Za-z0-9@._\- ]")


@register_connector("salesforce")
class SalesforceConnector(BaseConnector):
    """Scans Salesforce SObjects for PII.

    Connection config keys (either username flow or session flow):
      username, password, security_token, domain (login|test)
      OR instance_url, access_token
      objects (optional list of SObject names; default Contact/Lead/Account/Case/User)
    """

    def __init__(self, asset_id: str, tenant_id: str, config: dict[str, Any]):
        super().__init__(asset_id, tenant_id, config)
        self._sf = None

    def _get_sf(self):
        if self._sf is None:
            from simple_salesforce import Salesforce  # lazy import

            if self.config.get("access_token") and self.config.get("instance_url"):
                self._sf = Salesforce(
                    instance_url=self.config["instance_url"],
                    session_id=self.config["access_token"],
                )
            else:
                self._sf = Salesforce(
                    username=self.config.get("username"),
                    password=self.config.get("password"),
                    security_token=self.config.get("security_token", ""),
                    domain=self.config.get("domain", "login"),
                )
        return self._sf

    def _objects(self) -> list[str]:
        objs = self.config.get("objects")
        if isinstance(objs, list) and objs:
            return [str(o) for o in objs]
        return _DEFAULT_OBJECTS

    def _fields_for(self, obj: str) -> list[str]:
        meta = getattr(self._get_sf(), obj).describe()
        fields = []
        for f in meta.get("fields", []):
            if f.get("type") in _SKIP_FIELD_TYPES:
                continue
            fields.append(f["name"])
            if len(fields) >= _MAX_FIELDS:
                break
        return fields

    def test_connection(self) -> ConnectionTestResult:
        start = time.monotonic()
        try:
            self._get_sf().query("SELECT Id FROM Organization LIMIT 1")
            return ConnectionTestResult(
                success=True, message="Connected successfully",
                latency_ms=(time.monotonic() - start) * 1000,
            )
        except Exception as exc:  # noqa: BLE001
            return ConnectionTestResult(success=False, message=str(exc))

    def list_sources(self) -> list[dict[str, Any]]:
        out = []
        for obj in self._objects():
            try:
                fields = self._fields_for(obj)
            except Exception as exc:  # noqa: BLE001
                self.log.warning("Salesforce describe %s failed: %s", obj, exc)
                continue
            if fields:
                out.append({
                    "name": obj, "type": "sobject",
                    "columns": [{"name": f} for f in fields],
                })
        return out

    def stream_batches(
        self, source_name: str, batch_size: int = 500, max_records: int | None = None
    ) -> Generator[list[dict[str, Any]], None, None]:
        sf = self._get_sf()
        fields = self._fields_for(source_name)
        if not fields:
            return
        limit = f" LIMIT {int(max_records)}" if max_records else ""
        soql = f"SELECT {', '.join(fields)} FROM {source_name}{limit}"

        batch: list[dict[str, Any]] = []
        for rec in sf.query_all_iter(soql):
            row = {k: v for k, v in rec.items() if k != "attributes"}
            batch.append(row)
            if len(batch) >= batch_size:
                yield batch
                batch = []
        if batch:
            yield batch

    def search_records(self, source_name: str, term: str, max_matches: int = 1000) -> int | None:
        safe = _SOSL_ALLOWED.sub("", term).strip()
        if not safe:
            return 0
        try:
            res = self._get_sf().search(f"FIND {{{safe}}} IN ALL FIELDS RETURNING {source_name}(Id)")
        except Exception as exc:  # noqa: BLE001
            self.log.warning("Salesforce SOSL search failed: %s", exc)
            return None
        records = (res or {}).get("searchRecords", []) if isinstance(res, dict) else (res or [])
        return min(len(records), int(max_matches))

    def close(self) -> None:
        self._sf = None
