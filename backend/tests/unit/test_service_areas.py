"""Tests for the service-area fuzzy matcher."""
from __future__ import annotations

from agent_core.service_areas import MatchResult, match_city, load_service_areas


class TestLoadServiceAreas:
    def test_loads_es_and_mx(self) -> None:
        areas = load_service_areas()
        assert "Madrid" in areas
        assert "Ciudad de México" in areas
        assert len(areas) >= 30


class TestMatchCity:
    def test_exact_match(self) -> None:
        result = match_city("Madrid")
        assert result.matched is True
        assert result.canonical == "Madrid"
        assert result.score >= 99

    def test_typo_within_threshold(self) -> None:
        result = match_city("Madird")
        assert result.matched is True
        assert result.canonical == "Madrid"

    def test_accent_insensitive(self) -> None:
        result = match_city("ciudad de mexico")
        assert result.matched is True
        assert result.canonical == "Ciudad de México"

    def test_unknown_city(self) -> None:
        result = match_city("Atlantis")
        assert result.matched is False
        assert result.canonical is None
        assert result.score < 85

    def test_empty_string(self) -> None:
        result = match_city("")
        assert result.matched is False

    def test_returns_match_result_type(self) -> None:
        assert isinstance(match_city("Madrid"), MatchResult)
