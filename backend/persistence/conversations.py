"""CRUD for `conversations` and `turns`. All writes go through the service-role
client. Reads for the dashboard go through `recruiter_query.py` (separate)."""
from __future__ import annotations

from typing import Any, Literal

from persistence.db import get_client


def start_conversation(source: Literal["chat", "voice"]) -> str:
    """Insert a new in-progress conversation row, return its UUID."""
    client = get_client()
    result = (
        client.table("conversations")
        .insert({"source": source, "status": "in_progress"})
        .execute()
    )
    return result.data[0]["id"]


def append_turn(
    *,
    conversation_id: str,
    role: Literal["user", "assistant", "tool"],
    content: str | None,
    tool_calls: list[dict[str, Any]] | None,
) -> None:
    """Append a turn. tool_calls is the array stored in the JSONB column."""
    client = get_client()
    client.table("turns").insert(
        {
            "conversation_id": conversation_id,
            "role": role,
            "content": content,
            "tool_calls": tool_calls,
        }
    ).execute()


def update_conversation(*, conversation_id: str, patch: dict[str, Any]) -> None:
    """Patch arbitrary columns on the conversation. Caller passes a dict of
    column → value; we don't filter, so misuse is on the caller."""
    client = get_client()
    client.table("conversations").update(patch).eq("id", conversation_id).execute()
