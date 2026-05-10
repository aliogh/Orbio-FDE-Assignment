"""Tests for the Pydantic schemas covering screening fields and tool args."""
from __future__ import annotations

from datetime import date, timedelta

import pytest
from pydantic import ValidationError

from agent_core.schemas import (
    Availability,
    CompleteScreeningArgs,
    DisqualificationReason,
    DisqualifyArgs,
    ExtractedFields,
    FieldName,
    FlagInvalidArgs,
    Language,
    PreferredSchedule,
    PriorExperience,
    RecordFieldArgs,
)


class TestRecordFieldArgs:
    def test_accepts_known_field(self) -> None:
        args = RecordFieldArgs(field="full_name", value="Ana Pérez", confidence=0.95)
        assert args.field == "full_name"
        assert args.confidence == 0.95

    def test_rejects_unknown_field(self) -> None:
        with pytest.raises(ValidationError):
            RecordFieldArgs(field="favorite_color", value="blue", confidence=0.9)

    def test_rejects_confidence_out_of_range(self) -> None:
        with pytest.raises(ValidationError):
            RecordFieldArgs(field="full_name", value="x", confidence=1.5)


class TestDisqualifyArgs:
    def test_accepts_known_reason(self) -> None:
        args = DisqualifyArgs(reason="no_license", detail="Candidate has no driver's license")
        assert args.reason == "no_license"

    def test_rejects_unknown_reason(self) -> None:
        with pytest.raises(ValidationError):
            DisqualifyArgs(reason="too_tall", detail="...")


class TestFlagInvalidArgs:
    def test_accepts_minimal(self) -> None:
        args = FlagInvalidArgs(field="city", user_value="asdfg", reason="not in service areas")
        assert args.field == "city"


class TestCompleteScreeningArgs:
    def test_summary_required(self) -> None:
        with pytest.raises(ValidationError):
            CompleteScreeningArgs()


class TestExtractedFields:
    def test_partial_is_valid(self) -> None:
        ef = ExtractedFields(full_name="Ana", has_driver_license=True)
        assert ef.full_name == "Ana"
        assert ef.city is None

    def test_start_date_in_past_is_rejected(self) -> None:
        yesterday = (date.today() - timedelta(days=1)).isoformat()
        with pytest.raises(ValidationError):
            ExtractedFields(start_date=yesterday)

    def test_start_date_today_or_future_is_accepted(self) -> None:
        today = date.today().isoformat()
        ef = ExtractedFields(start_date=today)
        assert ef.start_date == date.today()
