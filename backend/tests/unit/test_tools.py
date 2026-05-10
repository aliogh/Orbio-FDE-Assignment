"""Tests for the four tool handlers."""
from __future__ import annotations

from datetime import date, timedelta
from unittest.mock import MagicMock

import pytest

from agent_core.tools import (
    OPENAI_TOOL_SCHEMAS,
    ToolContext,
    handle_complete_screening,
    handle_disqualify,
    handle_flag_invalid,
    handle_record_field,
)


@pytest.fixture
def fake_persistence(mocker) -> MagicMock:
    p = MagicMock()
    mocker.patch("agent_core.tools.persistence", p)
    return p


@pytest.fixture
def ctx() -> ToolContext:
    return ToolContext(conversation_id="conv-1", current_extracted={})


class TestSchemas:
    def test_exposes_four_tools(self) -> None:
        names = {t["function"]["name"] for t in OPENAI_TOOL_SCHEMAS}
        assert names == {"record_field", "flag_invalid", "disqualify", "complete_screening"}


class TestRecordField:
    def test_simple_field_persists_and_returns_ok(
        self, ctx: ToolContext, fake_persistence: MagicMock
    ) -> None:
        result = handle_record_field(
            ctx, {"field": "full_name", "value": "Ana Pérez", "confidence": 0.95}
        )
        assert result == {"ok": True, "validation_error": None}
        fake_persistence.update_conversation.assert_called_once()

    def test_city_in_service_area_normalizes(
        self, ctx: ToolContext, fake_persistence: MagicMock
    ) -> None:
        result = handle_record_field(
            ctx, {"field": "city", "value": "madird", "confidence": 0.9}
        )
        assert result["ok"] is True
        # The patch should have stored the canonical "Madrid"
        patch = fake_persistence.update_conversation.call_args.kwargs["patch"]
        assert patch["extracted_fields"]["city"] == "Madrid"

    def test_city_not_in_service_area_returns_validation_error(
        self, ctx: ToolContext, fake_persistence: MagicMock
    ) -> None:
        result = handle_record_field(
            ctx, {"field": "city", "value": "Atlantis", "confidence": 0.9}
        )
        assert result["ok"] is False
        assert "service area" in result["validation_error"].lower()
        # We do NOT persist invalid values
        fake_persistence.update_conversation.assert_not_called()

    def test_start_date_in_past_rejected(
        self, ctx: ToolContext, fake_persistence: MagicMock
    ) -> None:
        past = (date.today() - timedelta(days=1)).isoformat()
        result = handle_record_field(
            ctx, {"field": "start_date", "value": past, "confidence": 0.9}
        )
        assert result["ok"] is False
        fake_persistence.update_conversation.assert_not_called()

    def test_has_driver_license_false_triggers_disqualify_hint(
        self, ctx: ToolContext, fake_persistence: MagicMock
    ) -> None:
        result = handle_record_field(
            ctx, {"field": "has_driver_license", "value": "no", "confidence": 0.99}
        )
        assert result["ok"] is True
        # Field is persisted; agent will follow up with disqualify on its own.
        patch = fake_persistence.update_conversation.call_args.kwargs["patch"]
        assert patch["extracted_fields"]["has_driver_license"] is False


class TestFlagInvalid:
    def test_returns_ok(self, ctx: ToolContext) -> None:
        result = handle_flag_invalid(
            ctx, {"field": "city", "user_value": "??", "reason": "noise"}
        )
        assert result == {"ok": True}


class TestDisqualify:
    def test_persists_disqualification(
        self, ctx: ToolContext, fake_persistence: MagicMock
    ) -> None:
        result = handle_disqualify(
            ctx, {"reason": "no_license", "detail": "Candidate has no license"}
        )
        assert result == {"ok": True}
        patch = fake_persistence.update_conversation.call_args.kwargs["patch"]
        assert patch["qualified"] is False
        assert patch["disqualification_reason"] == "no_license"


class TestCompleteScreening:
    def test_finalizes_qualified_when_no_disqualification(
        self, ctx: ToolContext, fake_persistence: MagicMock
    ) -> None:
        ctx.current_extracted["has_driver_license"] = True
        result = handle_complete_screening(ctx, {"summary": "Looks good"})
        assert result == {"ok": True}
        patch = fake_persistence.update_conversation.call_args.kwargs["patch"]
        assert patch["qualified"] is True
        assert patch["status"] == "completed"
        assert patch["summary"] == "Looks good"
        assert patch.get("ended_at") is not None

    def test_disqualify_then_complete_preserves_qualified_false(
        self, ctx: ToolContext, fake_persistence: MagicMock
    ) -> None:
        # Simulate: agent calls disqualify, then complete_screening
        handle_disqualify(
            ctx, {"reason": "no_license", "detail": "no license"}
        )
        result = handle_complete_screening(ctx, {"summary": "Disqualified."})
        assert result == {"ok": True}
        # The LAST update_conversation call (from complete_screening) should
        # still have qualified=False, not True
        last_patch = fake_persistence.update_conversation.call_args.kwargs["patch"]
        assert last_patch["qualified"] is False
        assert last_patch["status"] == "completed"

    def test_complete_with_missing_license_marks_unqualified(
        self, ctx: ToolContext, fake_persistence: MagicMock
    ) -> None:
        # has_driver_license never recorded — should default to qualified=False
        result = handle_complete_screening(ctx, {"summary": "Incomplete."})
        assert result == {"ok": True}
        patch = fake_persistence.update_conversation.call_args.kwargs["patch"]
        assert patch["qualified"] is False
