# services/workers/app/pii/analyzer.py

from __future__ import annotations
import logging
from dataclasses import dataclass, field
from functools import lru_cache
from typing import Any

from presidio_analyzer import AnalyzerEngine, RecognizerRegistry
from presidio_analyzer.nlp_engine import NlpEngineProvider

from app.config import settings
from app.pii.recognizers.indian_recognizers import get_all_recognizers

logger = logging.getLogger(__name__)


@dataclass
class PIIMatch:
    pii_type: str
    field_name: str
    start: int
    end: int
    score: float
    sample: str = ""


@dataclass
class RecordAnalysis:
    record_id: Any
    matches: list[PIIMatch] = field(default_factory=list)
    has_pii: bool = False

    def pii_types(self) -> list[str]:
        return list({m.pii_type for m in self.matches})


@lru_cache(maxsize=1)
def _build_engine() -> AnalyzerEngine:
    logger.info("Loading Presidio analyzer (spaCy: %s)", settings.spacy_model)
    provider = NlpEngineProvider(nlp_configuration={
        "nlp_engine_name": "spacy",
        "models": [{"lang_code": "en", "model_name": settings.spacy_model}],
    })
    nlp_engine = provider.create_engine()
    registry = RecognizerRegistry()
    registry.load_predefined_recognizers(nlp_engine=nlp_engine)
    for recognizer in get_all_recognizers():
        registry.add_recognizer(recognizer)
    engine = AnalyzerEngine(
        nlp_engine=nlp_engine,
        registry=registry,
        supported_languages=["en"],
    )
    logger.info("Presidio ready with %d recognizers", len(registry.recognizers))
    return engine


ENTITIES = [
    "AADHAAR_NUMBER", "IN_PAN", "IN_GSTIN", "IN_VOTER_ID",
    "IN_DRIVING_LICENSE", "IN_UPI_ID", "IN_IFSC", "IN_PASSPORT",
    "IN_BANK_ACCOUNT", "EMAIL_ADDRESS", "PHONE_NUMBER", "CREDIT_CARD",
    "IBAN_CODE", "IP_ADDRESS", "PERSON", "LOCATION", "DATE_TIME",
]


class PIIAnalyzer:
    """Thread-safe PII analysis interface for scan workers.

    Optionally applies per-tenant tuning:
      * ``score_threshold`` overrides the global Presidio confidence threshold.
      * ``custom_detectors`` are tenant-defined ``(key, score, compiled_regex)``
        tuples that add bespoke PII categories (e.g. EMPLOYEE_ID).
      * ``ignore_patterns`` are compiled regexes; any match whose text matches one
        is suppressed (allow-list of known false positives).
    """

    # Never run a (user-supplied) custom regex over a value longer than this.
    _CUSTOM_MAX_LEN = 4096

    def __init__(
        self,
        score_threshold: float | None = None,
        custom_detectors: list[tuple[str, float, Any]] | None = None,
        ignore_patterns: list[Any] | None = None,
    ):
        self._engine = _build_engine()
        self._threshold = score_threshold if score_threshold is not None else settings.presidio_score_threshold
        self._custom = custom_detectors or []
        self._ignore = ignore_patterns or []

    def analyze_text(self, text: str, field_name: str = "text", entities: list[str] | None = None) -> list[PIIMatch]:
        if not text or not text.strip():
            return []

        matches: list[PIIMatch] = []

        # Cheap pre-filter gates only the expensive spaCy/Presidio pipeline.
        # Structured identifiers always contain a digit or '@'; free-text
        # names/locations contain a capitalised alphabetic token. Boolean/enum/
        # short codes are skipped outright.
        if _maybe_pii(text):
            try:
                results = self._engine.analyze(
                    text=text,
                    entities=entities or ENTITIES,
                    language="en",
                    score_threshold=self._threshold,
                )
                matches.extend(
                    PIIMatch(
                        pii_type=r.entity_type,
                        field_name=field_name,
                        start=r.start,
                        end=r.end,
                        score=r.score,
                        sample=_safe_sample(text[r.start:r.end]),
                    )
                    for r in results
                )
            except Exception as exc:
                logger.warning("Presidio error for field %s: %s", field_name, exc)

        # Tenant-defined custom detectors. Validated as RE2 on write and
        # length-capped here, so matching is always bounded.
        if self._custom and len(text) <= self._CUSTOM_MAX_LEN:
            for key, score, pattern in self._custom:
                for m in pattern.finditer(text):
                    if m.end() > m.start():
                        matches.append(PIIMatch(
                            pii_type=key,
                            field_name=field_name,
                            start=m.start(),
                            end=m.end(),
                            score=score,
                            sample=_safe_sample(text[m.start():m.end()]),
                        ))

        # Allow-list / ignore patterns: drop matches that are known false positives.
        if self._ignore and matches:
            matches = [
                mm for mm in matches
                if not _is_ignored(text[mm.start:mm.end], self._ignore)
            ]

        return matches

    def analyze_record(self, record: dict[str, Any], record_id: Any = None, entities: list[str] | None = None) -> RecordAnalysis:
        analysis = RecordAnalysis(record_id=record_id)
        self._walk(record, "", analysis, entities)
        analysis.has_pii = bool(analysis.matches)
        return analysis

    def analyze_batch(self, records: list[dict[str, Any]], id_field: str = "id", entities: list[str] | None = None) -> list[RecordAnalysis]:
        return [self.analyze_record(r, record_id=r.get(id_field), entities=entities) for r in records]

    def pii_summary(self, analyses: list[RecordAnalysis]) -> dict[str, int]:
        counts: dict[str, int] = {}
        for a in analyses:
            for m in a.matches:
                counts[m.pii_type] = counts.get(m.pii_type, 0) + 1
        return counts

    def _walk(self, node: Any, path: str, analysis: RecordAnalysis, entities: list[str] | None = None) -> None:
        if isinstance(node, dict):
            for key, val in node.items():
                child = f"{path}.{key}" if path else key
                self._walk(val, child, analysis, entities)
        elif isinstance(node, list):
            for item in node:
                self._walk(item, path, analysis, entities)
        elif isinstance(node, str):
            analysis.matches.extend(self.analyze_text(node, field_name=path, entities=entities))
        elif isinstance(node, (int, float)):
            analysis.matches.extend(self.analyze_text(str(node), field_name=path, entities=entities))


def _safe_sample(text: str) -> str:
    n = len(text)
    if n <= 8:
        return "*" * n
    return text[:4] + "****" + text[n - 4:]


def _is_ignored(value: str, patterns: list[Any]) -> bool:
    """True when the matched value should be suppressed (allow-list hit)."""
    for pattern in patterns:
        try:
            if pattern.search(value):
                return True
        except Exception:  # noqa: BLE001 - never let a bad pattern break a scan
            continue
    return False


def _maybe_pii(text: str) -> bool:
    """
    Fast heuristic gate deciding whether a value is worth running through the
    Presidio/spaCy pipeline. Returns True when the text could plausibly contain
    a supported entity:

    * contains ``@``                         → EMAIL_ADDRESS / IN_UPI_ID
    * contains a digit                       → Aadhaar/PAN/GSTIN/phone/IFSC/
                                               passport/DL/voter/bank/card/IP/IBAN
    * contains a capitalised alphabetic token → PERSON / LOCATION

    Boolean flags, enum codes and short lowercase tokens are skipped, avoiding
    NLP work on the overwhelming majority of non-PII database/object values.
    """
    if len(text) < 2:
        return False
    if "@" in text:
        return True
    for ch in text:
        if ch.isdigit():
            return True
    for tok in text.split():
        if len(tok) >= 2 and tok[0].isupper() and tok[1].islower():
            return True
    return False