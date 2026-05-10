"""The four tools — defined once, used by both transports.

Each tool has:
- An OpenAI function schema (in OPENAI_TOOL_SCHEMAS) for tool registration.
- A handler taking (ctx, raw_args) → result dict.

Validation lives inside the handlers: tools the model couldn't validate on
its own (e.g. "is this city in service?") return {"ok": False,
"validation_error": "..."} so the agent can re-ask."""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from pydantic import ValidationError

from agent_core import service_areas
from agent_core.schemas import (
    CompleteScreeningArgs,
    DisqualifyArgs,
    ExtractedFields,
    FlagInvalidArgs,
    RecordFieldArgs,
)
from persistence import conversations as persistence


# ── Tool execution context ─────────────────────────────────────────────────────


@dataclass
class ToolContext:
    """Per-turn context the runner threads into each tool call."""

    conversation_id: str
    current_extracted: dict[str, Any] = field(default_factory=dict)

    def merge_field(self, field_name: str, value: Any) -> dict[str, Any]:
        self.current_extracted[field_name] = value
        return dict(self.current_extracted)


# ── OpenAI function schemas ────────────────────────────────────────────────────

OPENAI_TOOL_SCHEMAS: list[dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "record_field",
            "description": (
                "Record an extracted screening field. Server validates the value; "
                "if invalid, the response will include a validation_error and you "
                "should re-ask the candidate."
            ),
            "parameters": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "field": {
                        "type": "string",
                        "enum": [
                            "full_name",
                            "has_driver_license",
                            "city",
                            "availability",
                            "preferred_schedule",
                            "prior_experience",
                            "start_date",
                        ],
                    },
                    "value": {"type": "string", "minLength": 1},
                    "confidence": {"type": "number", "minimum": 0, "maximum": 1},
                },
                "required": ["field", "value", "confidence"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "flag_invalid",
            "description": (
                "Log a problematic answer that you couldn't extract a clean value "
                "from. Use this before asking the candidate to clarify."
            ),
            "parameters": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "field": {"type": "string"},
                    "user_value": {"type": "string"},
                    "reason": {"type": "string"},
                },
                "required": ["field", "user_value", "reason"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "disqualify",
            "description": (
                "Mark the candidate as not qualified. Only valid reasons are "
                "no_license and out_of_service_area (use 'other' sparingly). "
                "After calling this, give the candidate a polite closing message."
            ),
            "parameters": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "reason": {
                        "type": "string",
                        "enum": ["no_license", "out_of_service_area", "other"],
                    },
                    "detail": {"type": "string"},
                },
                "required": ["reason", "detail"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "complete_screening",
            "description": (
                "End the screening with a 2-3 sentence summary for the recruiter. "
                "Call this only after all fields are collected (or after a "
                "disqualification + final goodbye)."
            ),
            "parameters": {
                "type": "object",
                "additionalProperties": False,
                "properties": {"summary": {"type": "string"}},
                "required": ["summary"],
            },
        },
    },
]


# ── Handlers ───────────────────────────────────────────────────────────────────


def _normalize_record_value(field_name: str, raw_value: str) -> Any | None:
    """Coerce raw model strings into typed values. Returns None if the value
    can't be normalized (caller treats this as a validation error)."""
    v = raw_value.strip()
    if field_name == "has_driver_license":
        lower = v.strip().lower()
        # Negative tokens first (more specific in Spanish — must precede positive
        # check so "No tengo carnet" doesn't accidentally match "tengo" → True)
        if any(tok in lower for tok in ["no ", "no,", "false", "0", "ningun", "no tengo"]) or lower in {
            "no",
            "false",
            "0",
        }:
            return False
        if any(tok in lower for tok in ["sí", "si ", "si,", "yes", "true", "tengo", "claro", "por supuesto"]) or lower in {
            "si",
            "yes",
            "true",
            "1",
        }:
            return True
        return None
    if field_name == "city":
        result = service_areas.match_city(v)
        return result.canonical if result.matched else None
    if field_name == "start_date":
        # Try ISO first via Pydantic, then fall back to dateutil for natural-language
        # dates (e.g. "1 de junio de 2026", "June 15th 2026", "el lunes").
        import re as _re
        from datetime import date as _date  # local import to avoid top-level pollution

        try:
            from dateutil.parser import parse as _parse_date  # type: ignore[import-untyped]
            from dateutil.parser import parserinfo as _parserinfo

            class _SpanishParserInfo(_parserinfo):
                MONTHS = [
                    ("enero", "ene"),
                    ("febrero", "feb"),
                    ("marzo", "mar"),
                    ("abril", "abr"),
                    ("mayo", "may"),
                    ("junio", "jun"),
                    ("julio", "jul"),
                    ("agosto", "ago"),
                    ("septiembre", "sep", "sept"),
                    ("octubre", "oct"),
                    ("noviembre", "nov"),
                    ("diciembre", "dic"),
                ]

            _ISO_RE = _re.compile(r"^\d{4}-\d{2}-\d{2}$")
            # Strip English ordinal suffixes ("June 1st" → "June 1") so dateutil can parse them
            v_clean = _re.sub(r"(\d+)(st|nd|rd|th)\b", r"\1", v, flags=_re.IGNORECASE)
            if _ISO_RE.match(v_clean):
                # Pure ISO 8601 — parse without dayfirst to avoid day/month swap
                parsed = _parse_date(v_clean).date()
            elif _re.search(r"\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\b", v_clean, flags=_re.IGNORECASE):
                # Spanish month name present — use Spanish parser
                parsed = _parse_date(v_clean, parserinfo=_SpanishParserInfo(dayfirst=True), fuzzy=True).date()
            else:
                # English / numeric — default parser, dayfirst still on for "1/6/2026" → June 1
                parsed = _parse_date(v_clean, dayfirst=True, fuzzy=True).date()
        except (ValueError, TypeError, OverflowError):
            return None
        if parsed < _date.today():
            return None
        return parsed.isoformat()
    if field_name == "prior_experience":
        # Free-form for the JSON column; no normalization
        return v
    return v  # full_name, availability, preferred_schedule pass through as strings


def handle_record_field(ctx: ToolContext, raw_args: dict[str, Any]) -> dict[str, Any]:
    args = RecordFieldArgs.model_validate(raw_args)
    normalized = _normalize_record_value(args.field, args.value)
    if normalized is None:
        if args.field == "city":
            err = "City not in service area."
        elif args.field == "start_date":
            err = "Start date must be today or in the future."
        elif args.field == "has_driver_license":
            err = "Could not interpret yes/no."
        else:
            err = "Invalid value."
        return {"ok": False, "validation_error": err}

    extracted = ctx.merge_field(args.field, normalized)
    patch: dict[str, Any] = {"extracted_fields": extracted}
    # Mirror common columns for cheap recruiter-query reads
    if args.field == "full_name":
        patch["candidate_name"] = normalized
    persistence.update_conversation(
        conversation_id=ctx.conversation_id,
        patch=patch,
    )
    return {"ok": True, "validation_error": None}


def handle_flag_invalid(ctx: ToolContext, raw_args: dict[str, Any]) -> dict[str, Any]:
    FlagInvalidArgs.model_validate(raw_args)  # validates only
    return {"ok": True}


def handle_disqualify(ctx: ToolContext, raw_args: dict[str, Any]) -> dict[str, Any]:
    args = DisqualifyArgs.model_validate(raw_args)
    ctx.current_extracted["_disqualified"] = True
    ctx.current_extracted["_disqualification_reason"] = args.reason
    persistence.update_conversation(
        conversation_id=ctx.conversation_id,
        patch={
            "qualified": False,
            "disqualification_reason": args.reason,
        },
    )
    return {"ok": True}


def handle_complete_screening(
    ctx: ToolContext, raw_args: dict[str, Any]
) -> dict[str, Any]:
    args = CompleteScreeningArgs.model_validate(raw_args)
    if ctx.current_extracted.get("_disqualified"):
        qualified_flag = False
    else:
        # Use `is True` so a missing license defaults to NOT qualified
        qualified_flag = ctx.current_extracted.get("has_driver_license") is True
    persistence.update_conversation(
        conversation_id=ctx.conversation_id,
        patch={
            "qualified": qualified_flag,
            "summary": args.summary,
            "status": "completed",
            "ended_at": datetime.now(timezone.utc).isoformat(),
        },
    )
    return {"ok": True}


HANDLERS: dict[str, Any] = {
    "record_field": handle_record_field,
    "flag_invalid": handle_flag_invalid,
    "disqualify": handle_disqualify,
    "complete_screening": handle_complete_screening,
}
