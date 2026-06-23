# services/workers/app/pii/settings_loader.py
#
# Loads a tenant's PII-detection tuning (confidence threshold, custom regex
# detectors, ignore/allow-lists) from the database and compiles it into a ready
# to use config for the analyzer.
#
# Safety: regular expressions are validated on write by the control plane using
# Go's RE2 engine (linear-time, ReDoS-safe). They are re-validated here, and the
# analyzer additionally length-caps every value before running a custom pattern,
# so a pathological expression can never stall a scan.

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field

from app.db.models import DetectionSetting

logger = logging.getLogger(__name__)

# Defensive caps — mirror the control plane so the worker is protected even if a
# row is written out-of-band.
_MAX_CUSTOM = 100
_MAX_IGNORE = 200
_MAX_REGEX_LEN = 500


@dataclass(frozen=True)
class CustomDetector:
    key: str
    label: str
    score: float
    pattern: re.Pattern


@dataclass
class DetectionConfig:
    threshold: float | None = None
    custom: list[CustomDetector] = field(default_factory=list)
    ignore: list[re.Pattern] = field(default_factory=list)

    @property
    def is_default(self) -> bool:
        return self.threshold is None and not self.custom and not self.ignore


_DEFAULT = DetectionConfig()


def _compile(pattern: str) -> re.Pattern | None:
    if not pattern or len(pattern) > _MAX_REGEX_LEN:
        return None
    try:
        return re.compile(pattern)
    except re.error as exc:
        logger.warning("skipping invalid detection regex %r: %s", pattern[:64], exc)
        return None


def _coerce_score(value, fallback: float = 0.85) -> float:
    try:
        return max(0.0, min(1.0, float(value)))
    except (TypeError, ValueError):
        return fallback


def load_detection_config(db, tenant_id: str) -> DetectionConfig:
    """Return the tenant's compiled detection config, or defaults when unset."""
    try:
        row = db.query(DetectionSetting).filter(
            DetectionSetting.tenant_id == tenant_id
        ).first()
    except Exception as exc:  # pragma: no cover - defensive; never fail a scan
        logger.warning("detection settings unavailable for tenant %s: %s", tenant_id, exc)
        return _DEFAULT
    if row is None:
        return _DEFAULT

    threshold: float | None = None
    if row.confidence_threshold is not None:
        try:
            threshold = max(0.0, min(1.0, float(row.confidence_threshold)))
        except (TypeError, ValueError):
            threshold = None

    custom: list[CustomDetector] = []
    for item in (row.custom_pii_types or [])[:_MAX_CUSTOM]:
        if not isinstance(item, dict) or not item.get("enabled", False):
            continue
        compiled = _compile(str(item.get("regex", "")))
        if compiled is None:
            continue
        key = (str(item.get("key") or "CUSTOM")).upper()
        custom.append(CustomDetector(
            key=key,
            label=str(item.get("label") or key),
            score=_coerce_score(item.get("score")),
            pattern=compiled,
        ))

    ignore: list[re.Pattern] = []
    for item in (row.ignore_patterns or [])[:_MAX_IGNORE]:
        pat = item.get("pattern") if isinstance(item, dict) else None
        compiled = _compile(str(pat or ""))
        if compiled is not None:
            ignore.append(compiled)

    return DetectionConfig(threshold=threshold, custom=custom, ignore=ignore)
