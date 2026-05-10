"""Pydantic schemas — the typed contract shared by the agent and persistence."""
from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

# ── Enums ──────────────────────────────────────────────────────────────────────

FieldName = Literal[
    "full_name",
    "has_driver_license",
    "city",
    "availability",
    "preferred_schedule",
    "prior_experience",
    "start_date",
]

Availability = Literal["full_time", "part_time", "weekends"]
PreferredSchedule = Literal["morning", "afternoon", "evening", "flexible"]
DisqualificationReason = Literal["no_license", "out_of_service_area", "other"]
Language = Literal["es", "en"]


# ── Tool argument models ───────────────────────────────────────────────────────


class RecordFieldArgs(BaseModel):
    """Args for the record_field tool. The value is a canonical string;
    structured fields are parsed server-side by the tool handler."""

    model_config = ConfigDict(extra="forbid")
    field: FieldName
    value: str = Field(..., min_length=1)
    confidence: float = Field(..., ge=0.0, le=1.0)


class FlagInvalidArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    field: str = Field(..., min_length=1)
    user_value: str = Field(..., min_length=1)
    reason: str = Field(..., min_length=1)


class DisqualifyArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    reason: DisqualificationReason
    detail: str = Field(..., min_length=1)


class CompleteScreeningArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    summary: str = Field(..., min_length=1)


# ── Persistence-side models ────────────────────────────────────────────────────


class PriorExperience(BaseModel):
    """Sub-model: years on prior delivery platforms."""

    model_config = ConfigDict(extra="forbid")
    years: float = Field(..., ge=0)
    platforms: list[str] = Field(default_factory=list)


class ExtractedFields(BaseModel):
    """Canonical snapshot of all 7 screening fields. All optional; partials are
    valid because conversations may end mid-flow."""

    model_config = ConfigDict(extra="forbid")
    full_name: str | None = None
    has_driver_license: bool | None = None
    city: str | None = None
    availability: Availability | None = None
    preferred_schedule: PreferredSchedule | None = None
    prior_experience: PriorExperience | None = None
    start_date: date | None = None

    @field_validator("start_date")
    @classmethod
    def reject_past_dates(cls, v: date | None) -> date | None:
        if v is not None and v < date.today():
            raise ValueError("start_date cannot be in the past")
        return v
