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
    """Thread-safe PII analysis interface for scan workers."""

    def __init__(self, score_threshold: float | None = None):
        self._engine = _build_engine()
        self._threshold = score_threshold if score_threshold is not None else settings.presidio_score_threshold

    def analyze_text(self, text: str, field_name: str = "text") -> list[PIIMatch]:
        if not text or not text.strip():
            return []
        try:
            results = self._engine.analyze(
                text=text,
                entities=ENTITIES,
                language="en",
                score_threshold=self._threshold,
            )
        except Exception as exc:
            logger.warning("Presidio error for field %s: %s", field_name, exc)
            return []
        return [
            PIIMatch(
                pii_type=r.entity_type,
                field_name=field_name,
                start=r.start,
                end=r.end,
                score=r.score,
                sample=_safe_sample(text[r.start:r.end]),
            )
            for r in results
        ]

    def analyze_record(self, record: dict[str, Any], record_id: Any = None) -> RecordAnalysis:
        analysis = RecordAnalysis(record_id=record_id)
        self._walk(record, "", analysis)
        analysis.has_pii = bool(analysis.matches)
        return analysis

    def analyze_batch(self, records: list[dict[str, Any]], id_field: str = "id") -> list[RecordAnalysis]:
        return [self.analyze_record(r, record_id=r.get(id_field)) for r in records]

    def pii_summary(self, analyses: list[RecordAnalysis]) -> dict[str, int]:
        counts: dict[str, int] = {}
        for a in analyses:
            for m in a.matches:
                counts[m.pii_type] = counts.get(m.pii_type, 0) + 1
        return counts

    def _walk(self, node: Any, path: str, analysis: RecordAnalysis) -> None:
        if isinstance(node, dict):
            for key, val in node.items():
                child = f"{path}.{key}" if path else key
                self._walk(val, child, analysis)
        elif isinstance(node, list):
            for item in node:
                self._walk(item, path, analysis)
        elif isinstance(node, str):
            analysis.matches.extend(self.analyze_text(node, field_name=path))
        elif isinstance(node, (int, float)):
            analysis.matches.extend(self.analyze_text(str(node), field_name=path))


def _safe_sample(text: str) -> str:
    n = len(text)
    if n <= 8:
        return "*" * n
    return text[:4] + "****" + text[n - 4:]