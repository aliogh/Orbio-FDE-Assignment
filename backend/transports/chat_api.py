"""POST /api/chat — single turn endpoint. Stateless: client passes the full
history with each request. Backend persists every turn, but the source of
truth for the in-progress UI is what the client holds."""
from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from agent_core.runner import run_turn
from persistence.conversations import start_conversation

router = APIRouter()


class HistoryTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1)
    conversation_id: str | None = None
    history: list[HistoryTurn] = Field(default_factory=list)


class ChatResponse(BaseModel):
    conversation_id: str
    assistant_message: str
    tool_calls: list[dict]
    completed: bool


@router.post("/api/chat", response_model=ChatResponse)
def chat(req: ChatRequest) -> ChatResponse:
    cid = req.conversation_id or start_conversation(source="chat")
    history = [t.model_dump() for t in req.history]
    history.append({"role": "user", "content": req.message})

    try:
        result = run_turn(conversation_id=cid, history=history)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"agent error: {exc}") from exc

    return ChatResponse(
        conversation_id=cid,
        assistant_message=result.assistant_message,
        tool_calls=result.tool_calls,
        completed=result.completed,
    )
