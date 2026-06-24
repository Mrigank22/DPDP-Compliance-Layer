# services/workers/app/connectors/base.py

from __future__ import annotations
import abc
import logging
from dataclasses import dataclass
from typing import Any, Generator


@dataclass
class ConnectionTestResult:
    success: bool
    message: str
    latency_ms: float = 0.0
    details: dict[str, Any] | None = None


@dataclass
class PostureFinding:
    """A single security misconfiguration discovered for an asset."""
    check_id: str
    title: str
    severity: str          # critical | high | medium | low
    description: str
    resource: str          # bucket name, table, instance, etc.
    remediation: str = ""


class BaseConnector(abc.ABC):
    """
    Abstract connector that all asset connectors must implement.
    Provides: test_connection, list_sources, stream_batches.
    Optional: search_records (native push-down), erase_records (DSR erasure),
    profile_columns (in-database structured-PII detection), posture_check.
    """

    # True when stream_batches yields one record per row, so the scan may apply a
    # row sampling cap. Object-store connectors (which sample by object) set this
    # to False and rely on their own object caps.
    RECORD_SAMPLING: bool = True

    def __init__(self, asset_id: str, tenant_id: str, config: dict[str, Any]):
        self.asset_id = asset_id
        self.tenant_id = tenant_id
        self.config = config
        self.log = logging.getLogger(f"{__name__}.{self.__class__.__name__}")

    @abc.abstractmethod
    def test_connection(self) -> ConnectionTestResult: ...

    @abc.abstractmethod
    def list_sources(self) -> list[dict[str, Any]]: ...

    @abc.abstractmethod
    def stream_batches(
        self,
        source_name: str,
        batch_size: int = 500,
        max_records: int | None = None,
    ) -> Generator[list[dict[str, Any]], None, None]: ...

    def search_records(self, source_name: str, term: str, max_matches: int = 1000) -> int | None:
        """
        Optionally push a substring search down to the data source and return the
        number of matching records (capped at ``max_matches``).

        Returns ``None`` when the connector cannot search natively, signalling the
        caller to fall back to streaming + in-process matching.
        """
        return None

    def erase_records(self, source_name: str, term: str, max_deletes: int = 100000) -> int | None:
        """
        Optionally delete records matching ``term`` in the data source (e.g. a
        data-principal identifier) and return the number of rows removed.

        Returns ``None`` when the connector cannot erase natively (e.g. object
        stores), signalling the caller to handle erasure manually. Implementations
        MUST cap deletions at ``max_deletes`` and commit atomically.
        """
        return None

    def profile_columns(self, source_name: str) -> dict[str, dict[str, int]] | None:
        """
        Optionally detect structured (regex-based) PII across ALL rows of a source
        inside the data store with a single read-only pass, returning
        ``{column: {entity_type: match_count}}``.

        This gives full-coverage detection of structured identifiers without
        streaming rows into the worker. Returns ``None`` when the connector cannot
        push the regex down (object stores, NoSQL, SaaS), signalling the caller to
        fall back to sampled Python classification.
        """
        return None

    def posture_check(self) -> list[PostureFinding]:
        """
        Return security misconfigurations for this asset. Connectors that can
        inspect their backing resource (e.g. S3 bucket settings) override this.
        Default: no posture checks.
        """
        return []

    def close(self) -> None:
        pass

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()
        return False


_REGISTRY: dict[str, type[BaseConnector]] = {}


def register_connector(asset_type: str):
    def decorator(cls: type[BaseConnector]) -> type[BaseConnector]:
        _REGISTRY[asset_type] = cls
        return cls
    return decorator


def get_connector(
    asset_type: str,
    asset_id: str,
    tenant_id: str,
    config: dict[str, Any],
) -> BaseConnector:
    cls = _REGISTRY.get(asset_type)
    if cls is None:
        raise ValueError(
            f"No connector for asset type '{asset_type}'. "
            f"Available: {list(_REGISTRY.keys())}"
        )
    return cls(asset_id=asset_id, tenant_id=tenant_id, config=config)
