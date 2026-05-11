"""POST /api/voice/session — mints an ephemeral OpenAI Realtime client key
for the browser to use over WebRTC. Audio never touches our backend.

The browser reads the returned `client_secret`, opens a WebRTC peer connection
to OpenAI's Realtime endpoint, and registers our 4 tools client-side using
the same schemas. Tool calls fire HTTPS to our backend (separate route, future
work) so persistence still flows through us — for the take-home, we keep the
voice path self-contained and rely on a post-call persistence write to keep
the demo simple. The chat surface remains the canonical persistence path."""
from __future__ import annotations

import os

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from agent_core.prompts import SYSTEM_PROMPT
from agent_core.tools import OPENAI_TOOL_SCHEMAS
from persistence.conversations import start_conversation

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
