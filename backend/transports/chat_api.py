"""POST /api/chat — single turn endpoint. Stateless: client passes the full
history with each request. Backend persists every turn, but the source of
truth for the in-progress UI is what the client holds."""
from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from agent_core.runner import run_nudge_turn, run_turn
from persistence.conversations import start_conversation

MAX_NUDGES = 2

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
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"agent error: {exc}") from exc

    return ChatResponse(
        conversation_id=cid,
        assistant_message=result.assistant_message,
        tool_calls=result.tool_calls,
        completed=result.completed,
    )


class NudgeRequest(BaseModel):
    conversation_id: str = Field(..., min_length=1)
    history: list[HistoryTurn] = Field(default_factory=list)
    nudge_count: int = Field(..., ge=1, le=MAX_NUDGES)


class NudgeResponse(BaseModel):
    conversation_id: str
    assistant_message: str
    nudge_count: int


@router.post("/api/chat/nudge", response_model=NudgeResponse)
def chat_nudge(req: NudgeRequest) -> NudgeResponse:
    """Soft re-engagement after the candidate has been idle. The client tracks
    the timer + the running `nudge_count`; this endpoint just runs the nudge
    turn through the model with tools disabled and persists the assistant
    reply flagged as a nudge. After `MAX_NUDGES` the client should stop
    calling and let the 5-min sweep close the conversation."""
    history = [t.model_dump() for t in req.history]
    try:
        result = run_nudge_turn(
            conversation_id=req.conversation_id,
            history=history,
            nudge_count=req.nudge_count,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"nudge error: {exc}") from exc

    return NudgeResponse(
        conversation_id=req.conversation_id,
        assistant_message=result.assistant_message,
        nudge_count=req.nudge_count,
    )
