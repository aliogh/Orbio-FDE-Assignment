"""Tests for the ES/EN language detector used to override the agent's
reply language per turn."""
from __future__ import annotations

import pytest

from agent_core.language import detect, detect_for_turn


class TestDetect:
    @pytest.mark.parametrize("text", [
        "Hola, soy Ana y vivo en Madrid",
        "Sí tengo carnet de conducir",
        "Quiero trabajar fines de semana",
        "Tengo dos años de experiencia conduciendo moto",
    ])
    def test_obvious_spanish(self, text: str) -> None:
        assert detect(text) == "es"

    @pytest.mark.parametrize("text", [
        "Hi, my name is John and I live in Barcelona",
        "Yes I have a driving license",
        "I want to work weekends",
        "I have two years of experience driving",
    ])
    def test_obvious_english(self, text: str) -> None:
        assert detect(text) == "en"

    def test_one_word_yes_is_ambiguous(self) -> None:
        # "yes" is decisive (English-only token), but a bare "no" or "ok"
        # should NOT flip the agent's language by itself.
        assert detect("no") is None
        assert detect("ok") is None

    def test_empty_or_whitespace_is_none(self) -> None:
        assert detect("") is None
        assert detect("   ") is None
        assert detect("123 456") is None  # only numbers — no tokens

    def test_mixed_message_picks_dominant_language(self) -> None:
        # "Hola, my name is Maria" — "my", "is", "name" win over "hola".
        assert detect("Hola, my name is Maria") == "en"
        # Spanish-dominant code-switch.
        assert detect("My licencia de conducir está vigente, sí") == "es"


class TestDetectForTurn:
    def test_uses_last_user_turn(self) -> None:
        history = [
            {"role": "user", "content": "Hola, soy Ana"},
            {"role": "assistant", "content": "Hola Ana, ¿en qué ciudad vives?"},
            {"role": "user", "content": "Actually let's continue in English"},
        ]
        assert detect_for_turn(history) == "en"

    def test_walks_back_past_ambiguous_short_replies(self) -> None:
        # The most recent user message is just "yes" — decisive enough on its
        # own (yes is en-only). But if it were "ok"/"sí", we'd walk further.
        history = [
            {"role": "user", "content": "Hola, soy Ana y vivo en Madrid"},
            {"role": "assistant", "content": "¿Tienes carnet?"},
            {"role": "user", "content": "ok"},
        ]
        assert detect_for_turn(history) == "es"

    def test_falls_back_to_default_when_nothing_decisive(self) -> None:
        history = [
            {"role": "user", "content": "ok"},
            {"role": "user", "content": "no"},
        ]
        assert detect_for_turn(history) == "es"  # default
        assert detect_for_turn(history, default="en") == "en"

    def test_empty_history_returns_default(self) -> None:
        assert detect_for_turn([]) == "es"

    def test_skips_assistant_turns(self) -> None:
        history = [
            {"role": "assistant", "content": "Hi, what's your name? In English."},
            {"role": "user", "content": "Soy Pedro y tengo carnet"},
        ]
        assert detect_for_turn(history) == "es"
