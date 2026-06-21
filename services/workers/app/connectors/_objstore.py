# services/workers/app/connectors/_objstore.py
#
# Shared helpers for object/blob storage connectors (GCS, Azure Blob, ...).
# Keeps the file-sampling and flattening logic in one place so every
# blob connector samples the same supported formats with identical semantics.

from __future__ import annotations

import csv
import io
import json
from typing import Any

# File extensions we know how to sample for PII. Anything else is skipped.
SUPPORTED_EXT: frozenset[str] = frozenset(
    {".json", ".csv", ".txt", ".log", ".ndjson", ".jsonl"}
)

# Never download an object larger than this for sampling (5 MB).
MAX_OBJECT_SIZE: int = 5 * 1024 * 1024


def get_ext(key: str) -> str:
    """Return the supported extension for ``key`` (with leading dot) or ''."""
    lower = key.lower()
    for ext in SUPPORTED_EXT:
        if lower.endswith(ext):
            return ext
    return ""


def is_sampleable(key: str, size: int) -> bool:
    """True when the object is a supported type within the size cap."""
    return 0 < size <= MAX_OBJECT_SIZE and get_ext(key) in SUPPORTED_EXT


def flat(d: dict, prefix: str = "") -> dict:
    """Flatten a nested dict to dotted keys; lists are JSON-encoded."""
    out: dict[str, Any] = {}
    for k, v in d.items():
        nk = f"{prefix}.{k}" if prefix else k
        if isinstance(v, dict):
            out.update(flat(v, nk))
        elif isinstance(v, list):
            out[nk] = json.dumps(v)
        else:
            out[nk] = v
    return out


def extract_records(key: str, raw: bytes, ext: str) -> list[dict[str, Any]]:
    """
    Parse the raw bytes of a blob into a list of flat record dicts suitable for
    the PII analyzer. Each record carries the originating ``_key`` for lineage.
    """
    if ext == ".json":
        data = json.loads(raw)
        if isinstance(data, list):
            return [
                {"_key": key, **(flat(r) if isinstance(r, dict) else {"v": r})}
                for r in data
            ]
        if isinstance(data, dict):
            return [{"_key": key, **flat(data)}]
        return [{"_key": key, "value": str(data)}]

    if ext in {".ndjson", ".jsonl"}:
        out: list[dict[str, Any]] = []
        for line in raw.decode("utf-8", errors="replace").splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
                out.append(
                    {"_key": key, **(flat(obj) if isinstance(obj, dict) else {"v": obj})}
                )
            except json.JSONDecodeError:
                out.append({"_key": key, "raw": line})
        return out

    if ext == ".csv":
        text = raw.decode("utf-8", errors="replace")
        return [{"_key": key, **dict(row)} for row in csv.DictReader(io.StringIO(text))]

    # .txt / .log — one record per non-empty line.
    return [
        {"_key": key, "line": ln}
        for ln in raw.decode("utf-8", errors="replace").splitlines()
        if ln.strip()
    ]
