"""Chat turn loop. Given a conversation_id and history, runs one user turn
through the model, dispatches any tool calls, and returns the final assistant
message. Voice transport doesn't use this — it talks to OpenAI Realtime
directly with the same tool schemas registered in the session."""
from __future__ import annotations

import json
import os
from dataclasses import dataclass
from functools import lru_cache
from typing import Any

from openai import OpenAI

from agent_core import guardrails
from agent_core.prompts import SYSTEM_PROMPT
from agent_core.tools import HANDLERS, OPENAI_TOOL_SCHEMAS, ToolContext
from persistence import conversations as persistence

MAX_TOOL_ITERATIONS = 6  # Hard cap so a misbehaving model can't loop forever.


@lru_cache(maxsize=1)
def get_openai() -> OpenAI:
    return OpenAI(api_key=os.environ["OPENAI_API_KEY"])


@dataclass
class RunnerResult:
    assistant_message: str
    tool_calls: list[dict[str, Any]]
    completed: bool  # True iff complete_screening fired


def _refusal_reply() -> str:
    return "Vamos a mantenernos en el tema. ¿Continuamos con el proceso?"


def run_turn(
    *,
    conversation_id: str,
    history: list[dict[str, Any]],
) -> RunnerResult:
    """Run one user turn end to end. `history` must end with the user's latest
    message. Persists user turn, model turn(s), and any tool calls."""
    if not history or history[-1].get("role") != "user":
        raise ValueError("history must end with a user message")

    user_message = history[-1]["content"] or ""

    # Persist the user turn first so we have it even if downstream fails.
    persistence.append_turn(
        conversation_id=conversation_id,
        role="user",
        content=user_message,
        tool_calls=None,
    )

    # Input guardrail
    decision = guardrails.check_input(user_message)
    if not decision.allowed:
        reply = _refusal_reply()
        persistence.append_turn(
            conversation_id=conversation_id,
            role="assistant",
            content=reply,
            tool_calls=[{"guardrail_block": decision.reason}],
        )
        return RunnerResult(assistant_message=reply, tool_calls=[], completed=False)

    client = get_openai()
    model = os.getenv("OPENAI_CHAT_MODEL", "gpt-5-mini")

    messages: list[dict[str, Any]] = [{"role": "system", "content": SYSTEM_PROMPT}]
    messages.extend(history)

    ctx = ToolContext(conversation_id=conversation_id)
    aggregated_tool_calls: list[dict[str, Any]] = []
    completed = False

    for _ in range(MAX_TOOL_ITERATIONS):
        completion = client.chat.completions.create(
            model=model,
            messages=messages,
            tools=OPENAI_TOOL_SCHEMAS,
            tool_choice="auto",
        )
        msg = completion.choices[0].message

        if msg.tool_calls:
            # Append the assistant message that requested tools (OpenAI requires this).
            messages.append({
                "role": "assistant",
                "content": msg.content,
                "tool_calls": [
                    {
                        "id": tc.id,
                        "type": "function",
                        "function": {
                            "name": tc.function.name,
                            "arguments": tc.function.arguments,
                        },
                    }
                    for tc in msg.tool_calls
                ],
            })
            for tc in msg.tool_calls:
                name = tc.function.name
                args = json.loads(tc.function.arguments or "{}")
                handler = HANDLERS.get(name)
                if handler is None:
                    result = {"ok": False, "error": f"unknown tool {name}"}
                else:
                    try:
                        result = handler(ctx, args)
                    except Exception as exc:  # noqa: BLE001 — surface to model
                        result = {"ok": False, "error": str(exc)}

                aggregated_tool_calls.append({
                    "name": name, "args": args, "result": result
                })
                if name == "complete_screening" and result.get("ok"):
                    completed = True

                messages.append({
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "content": json.dumps(result),
                })
            # Loop again so the model can react to tool results
            continue

        # No tool call — this is the final assistant text.
        final_text = guardrails.sanitize_output(msg.content or "")
        persistence.append_turn(
            conversation_id=conversation_id,
            role="assistant",
            content=final_text,
            tool_calls=aggregated_tool_calls or None,
        )
        return RunnerResult(
            assistant_message=final_text,
            tool_calls=aggregated_tool_calls,
            completed=completed,
        )

    # Hit the iteration cap — graceful fallback
    fallback = "Disculpa, tuve un problema técnico. ¿Puedes repetirlo?"
    persistence.append_turn(
        conversation_id=conversation_id,
        role="assistant",
        content=fallback,
        tool_calls=aggregated_tool_calls or None,
    )
    return RunnerResult(
        assistant_message=fallback,
        tool_calls=aggregated_tool_calls,
        completed=False,
    )
