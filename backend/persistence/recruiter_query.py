"""Read helpers for the recruiter dashboard (used server-side for any
admin-facing analytics; the Next.js dashboard queries Supabase JS directly)."""
from __future__ import annotations

from typing import Any

from persistence.db import get_client


def compute_stats() -> dict[str, Any]:
    """Aggregate conversation stats. We use a Postgres RPC so the math runs
    in the database. The RPC is defined in `migrations/0003_stats_rpc.sql`
    if/when we deploy the dashboard backend; for the take-home the frontend
    runs equivalent queries directly."""
    client = get_client()
    try:
        result = client.rpc("conversations_stats", {}).execute()
        row = (result.data or [{}])[0]
    except Exception:  # noqa: BLE001 — RPC absent in some environments
        row = {"total": 0, "qualified": 0, "abandoned": 0, "avg_duration_seconds": 0}

    total = row.get("total") or 0
    qualified = row.get("qualified") or 0
    return {
        "total": total,
        "qualified": qualified,
        "abandoned": row.get("abandoned") or 0,
        "qualified_rate": (qualified / total) if total else 0.0,
        "avg_duration_seconds": row.get("avg_duration_seconds") or 0,
    }


def list_conversations(limit: int = 50) -> list[dict[str, Any]]:
    client = get_client()
    return (
        client.table("conversations")
        .select("*")
        .order("started_at", desc=True)
        .limit(limit)
        .execute()
        .data
        or []
    )


def get_conversation(conversation_id: str) -> dict[str, Any] | None:
    client = get_client()
    rows = (
        client.table("conversations")
        .select("*")
        .eq("id", conversation_id)
        .execute()
        .data
        or []
    )
    return rows[0] if rows else None


def list_turns(conversation_id: str) -> list[dict[str, Any]]:
    client = get_client()
    return (
        client.table("turns")
        .select("*")
        .eq("conversation_id", conversation_id)
        .order("created_at")
        .execute()
        .data
        or []
    )
