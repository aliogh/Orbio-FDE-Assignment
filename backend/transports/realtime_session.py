"""Voice transport: mints an ephemeral OpenAI Realtime client key for the
browser to use over WebRTC, plus bridges tool calls from the browser to the
same handlers the chat path uses, so voice conversations persist identically
to chat conversations."""
from __future__ import annotations

import contextlib
import os
from datetime import UTC, datetime
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from agent_core.prompts import SYSTEM_PROMPT
from agent_core.tools import HANDLERS, OPENAI_TOOL_SCHEMAS, ToolContext
from persistence import conversations as persistence
from persistence.conversations import start_conversation
from persistence.db import get_client

router = APIRouter()


class VoiceSessionResponse(BaseModel):
    conversation_id: str
    client_secret: str
    model: str


@router.post("/api/voice/session", response_model=VoiceSessionResponse)
def voice_session() -> VoiceSessionResponse:
    api_key = os.environ["OPENAI_API_KEY"]
    model = os.getenv("OPENAI_REALTIME_MODEL", "gpt-realtime-mini")

    # Realtime function-tool format differs slightly from chat format
    realtime_tools = [
        {
            "type": "function",
            "name": t["function"]["name"],
            "description": t["function"]["description"],
            "parameters": t["function"]["parameters"],
        }
        for t in OPENAI_TOOL_SCHEMAS
    ]

    payload = {
        "model": model,
        "instructions": SYSTEM_PROMPT,
        "voice": "alloy",
        "tools": realtime_tools,
        "tool_choice": "auto",
        # Server VAD lets OpenAI detect end-of-utterance instead of waiting
        # for an explicit signal. `create_response: true` is REQUIRED for the
        # model to auto-reply after the user stops speaking (default was true
        # in older API versions, false in newer; setting explicitly is safer).
        # `interrupt_response: true` lets the candidate speak over the agent
        # to interrupt its current reply. Threshold 0.4 catches softer speech
        # onset; silence 800ms tolerates natural mid-sentence pauses.
        "turn_detection": {
            "type": "server_vad",
            "threshold": 0.4,
            "prefix_padding_ms": 300,
            "silence_duration_ms": 800,
            "create_response": True,
            "interrupt_response": True,
        },
        # No "language" lock — agent must support ES↔EN code-switching natively.
        # The audio model handles language directly over WebRTC; this transcription
        # is only used for diagnostics + the recruiter transcript view.
        "input_audio_transcription": {"model": "whisper-1"},
    }

    response = httpx.post(
        "https://api.openai.com/v1/realtime/sessions",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "OpenAI-Beta": "realtime=v1",
        },
        json=payload,
        timeout=10.0,
    )
    if response.status_code != 200:
        raise HTTPException(
            status_code=502,
            detail=f"openai realtime session error: {response.text}",
        )

    data = response.json()
    cid = start_conversation(source="voice")
    return VoiceSessionResponse(
        conversation_id=cid,
        client_secret=data["client_secret"]["value"],
        model=model,
    )


# ── Voice tool bridge ─────────────────────────────────────────────────────────


class VoiceToolRequest(BaseModel):
    conversation_id: str
    name: str = Field(..., min_length=1)
    args: dict[str, Any] = Field(default_factory=dict)


@router.post("/api/voice/tool")
def voice_tool(req: VoiceToolRequest) -> dict[str, Any]:
    """Dispatch a voice-side tool call through the same handlers chat uses.

    The browser receives `response.function_call_arguments.done` events from
    OpenAI Realtime, POSTs them here, and we return the result for the browser
    to relay back to the model via `function_call_output`. This keeps voice and
    chat conversations indistinguishable from the recruiter dashboard's POV."""
    client = get_client()
    rows = (
        client.table("conversations").select("*").eq("id", req.conversation_id).execute().data
    )
    if not rows:
        raise HTTPException(status_code=404, detail="conversation not found")
    conv = rows[0]

    extracted = dict(conv.get("extracted_fields") or {})
    # If a prior disqualify already fired, inject the sentinel so
    # complete_screening doesn't overwrite qualified=False (same protection
    # the chat runner provides via in-memory ToolContext).
    if conv.get("qualified") is False:
        extracted["_disqualified"] = True

    ctx = ToolContext(conversation_id=req.conversation_id, current_extracted=extracted)
    handler = HANDLERS.get(req.name)
    if handler is None:
        return {"ok": False, "error": f"unknown tool {req.name}"}
    try:
        result = handler(ctx, req.args)
    except Exception as exc:
        return {"ok": False, "error": str(exc)}

    # Mirror the voice tool call into the turns table for the recruiter
    # transcript view (best-effort — don't fail the request if logging breaks).
    with contextlib.suppress(Exception):
        persistence.append_turn(
            conversation_id=req.conversation_id,
            role="tool",
            content=None,
            tool_calls=[{"name": req.name, "args": req.args, "result": result}],
        )

    return result


# ── End-of-call endpoint ──────────────────────────────────────────────────────


class VoiceEndRequest(BaseModel):
    conversation_id: str


@router.post("/api/voice/end")
def voice_end(req: VoiceEndRequest) -> dict[str, Any]:
    """Called by the browser when the user clicks 'Terminar'. Marks the
    conversation as `abandoned` unless `complete_screening` already moved it
    to `completed`."""
    client = get_client()
    rows = (
        client.table("conversations")
        .select("status")
        .eq("id", req.conversation_id)
        .execute()
        .data
    )
    if not rows:
        raise HTTPException(status_code=404, detail="conversation not found")
    if rows[0]["status"] == "in_progress":
        persistence.update_conversation(
            conversation_id=req.conversation_id,
            patch={
                "status": "abandoned",
                "ended_at": datetime.now(UTC).isoformat(),
            },
        )
    return {"ok": True}
