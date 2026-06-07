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


class BaseConnector(abc.ABC):
    """
    Abstract connector that all asset connectors must implement.
    Provides: test_connection, list_sources, stream_batches.
    """

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
