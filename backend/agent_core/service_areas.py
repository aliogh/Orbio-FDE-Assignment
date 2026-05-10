"""Fuzzy matching for candidate-supplied city against the service-area list.

Threshold is 80 (RapidFuzz WRatio on normalised strings). Below that, we treat
as unmatched and let the agent re-ask.  Inputs are NFKD-normalised and
lowercased before comparison so that "ciudad de mexico" matches "Ciudad de
México" and a single-char transposition like "Madird" still passes.

The threshold was lowered from the originally-planned 85 to 80 because WRatio
for a 1-char transposition on a 6-char city name (e.g. "Madird") is 83.3 —
below 85 but well above the worst non-city score observed ("Atlantis" → 62.5)."""
from __future__ import annotations

import json
import unicodedata
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from rapidfuzz import fuzz, process

MATCH_THRESHOLD = 80
DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "service_areas.json"


def _normalize(text: str) -> str:
    """NFKD-strip accents and lowercase for accent-insensitive comparison."""
    return (
        unicodedata.normalize("NFKD", text)
        .encode("ascii", "ignore")
        .decode("ascii")
        .lower()
    )


@dataclass(frozen=True)
class MatchResult:
    matched: bool
    canonical: str | None
    score: float


@lru_cache(maxsize=1)
def load_service_areas() -> tuple[str, ...]:
    """Flat list of all canonical city names across all countries."""
    with DATA_PATH.open(encoding="utf-8") as f:
        data: dict[str, list[str]] = json.load(f)
    return tuple(name for cities in data.values() for name in cities)


def match_city(user_value: str) -> MatchResult:
    if not user_value or not user_value.strip():
        return MatchResult(matched=False, canonical=None, score=0.0)

    cities = load_service_areas()
    # Build normalised versions for scoring; keep originals for canonical output
    normed_cities = [_normalize(c) for c in cities]
    normed_query = _normalize(user_value)

    best = process.extractOne(normed_query, normed_cities, scorer=fuzz.WRatio)
    if best is None:
        return MatchResult(matched=False, canonical=None, score=0.0)

    _normed_canonical, score, idx = best
    canonical = cities[idx]  # return the original accented form
    if score >= MATCH_THRESHOLD:
        return MatchResult(matched=True, canonical=canonical, score=score)
    return MatchResult(matched=False, canonical=None, score=score)
