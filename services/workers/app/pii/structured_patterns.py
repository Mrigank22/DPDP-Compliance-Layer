# services/workers/app/pii/structured_patterns.py
#
# Regex-detectable ("structured") PII patterns and a helper to build a
# conditional-aggregation SELECT that runs them INSIDE the database. This lets a
# scan get full-coverage detection of structured identifiers across every row of
# a table in a single read-only pass, returning only per-column counts — instead
# of streaming billions of rows into Python.
#
# Patterns are keyed by the same entity-type names the Presidio analyzer emits,
# so findings from the pushdown path and the Python path are named identically.
#
# IMPORTANT: patterns are written backslash-free using POSIX bracket classes so
# they are portable across PostgreSQL (~), Redshift (~), MySQL (REGEXP),
# Snowflake (REGEXP_COUNT), BigQuery (REGEXP_CONTAINS) and Databricks (rlike),
# and need no escaping inside a SQL string literal.

from __future__ import annotations

from typing import Any, Callable

# entity_type -> portable regular expression (substring match semantics).
STRUCTURED_PATTERNS: dict[str, str] = {
    "AADHAAR_NUMBER": "[2-9][0-9]{3}[ -]?[0-9]{4}[ -]?[0-9]{4}",
    "IN_PAN":         "[A-Za-z]{5}[0-9]{4}[A-Za-z]",
    "IN_GSTIN":       "[0-9]{2}[A-Za-z]{5}[0-9]{4}[A-Za-z][0-9A-Za-z][Zz][0-9A-Za-z]",
    "IN_IFSC":        "[A-Za-z]{4}0[A-Za-z0-9]{6}",
    "IN_VOTER_ID":    "[A-Za-z]{3}[0-9]{7}",
    "EMAIL_ADDRESS":  "[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+[.][A-Za-z]{2,}",
    "PHONE_NUMBER":   "[+]?(91[ -]?)?[6-9][0-9]{9}",
    "CREDIT_CARD":    "[0-9]{4}[ -]?[0-9]{4}[ -]?[0-9]{4}[ -]?[0-9]{1,4}",
}

# Max columns profiled per table; beyond this the connector falls back to the
# sampled path to keep the generated query bounded.
MAX_PROFILE_COLUMNS = 40


def quote_lit(value: str) -> str:
    """Wrap a (trusted, constant) regex pattern as a SQL string literal."""
    return "'" + value.replace("'", "''") + "'"


def build_profile_selects(
    columns: list[str],
    predicate: Callable[[str, str], str],
) -> tuple[str, list[tuple[str, str]]]:
    """
    Build the SELECT list of ``SUM(CASE WHEN <predicate> THEN 1 ELSE 0 END)``
    expressions plus an ordered ``meta`` list of (column, entity_type) describing
    each expression. ``predicate(column, pattern)`` returns the dialect-specific
    boolean SQL for "column matches pattern".
    """
    cols = columns[:MAX_PROFILE_COLUMNS]
    selects: list[str] = []
    meta: list[tuple[str, str]] = []
    for col in cols:
        for ptype, pat in STRUCTURED_PATTERNS.items():
            alias = f"m{len(meta)}"
            selects.append(f"SUM(CASE WHEN {predicate(col, pat)} THEN 1 ELSE 0 END) AS {alias}")
            meta.append((col, ptype))
    return ", ".join(selects), meta


def map_profile_row(meta: list[tuple[str, str]], values: list[Any]) -> dict[str, dict[str, int]]:
    """Map a single result row (positional counts) into {column: {entity_type: count}}."""
    out: dict[str, dict[str, int]] = {}
    for (col, ptype), val in zip(meta, values):
        try:
            cnt = int(val or 0)
        except (TypeError, ValueError):
            cnt = 0
        if cnt > 0:
            out.setdefault(col, {})[ptype] = cnt
    return out
