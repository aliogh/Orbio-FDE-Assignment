"""Chat turn loop. Given a conversation_id and history, runs one user turn
through the model, dispatches any tool calls, and returns the final assistant
message. Voice transport doesn't use this — it talks to OpenAI Realtime
directly with the same tool schemas registered in the session."""
from __future__ import annotations

import json
import logging
import os
import time
from dataclasses import dataclass
from functools import lru_cache
from typing import Any

from openai import OpenAI

from agent_core import guardrails
from agent_core.prompts import SYSTEM_PROMPT
from agent_core.tools import HANDLERS, OPENAI_TOOL_SCHEMAS, ToolContext
from persistence import conversations as persistence

MAX_TOOL_ITERATIONS = 6  # Hard cap so a misbehaving model can't loop forever.

logger = logging.getLogger("agent_core.runner")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")


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


_NARRATED_CALL_RE = __import__("re").compile(
    r"complete_screening\s*\(\s*summary\s*=\s*['\"](?P<summary>[^'\"]+)['\"]\s*\)",
    flags=__import__("re").IGNORECASE,
)


def _extract_narrated_summary(text: str) -> str | None:
    """Detect when the model wrote `complete_screening(summary='...')` as text
    instead of invoking the tool. Returns the captured summary or None."""
    match = _NARRATED_CALL_RE.search(text or "")
    return match.group("summary").strip() if match else None


def _strip_narrated_call(text: str) -> str:
    return _NARRATED_CALL_RE.sub("", text or "")


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

    turn_start = time.perf_counter()
    logger.info("turn.start cid=%s model=%s history_len=%d", conversation_id, model, len(history))

    for iteration in range(MAX_TOOL_ITERATIONS):
        oai_start = time.perf_counter()
        completion = client.chat.completions.create(
            model=model,
            messages=messages,
            tools=OPENAI_TOOL_SCHEMAS,
            tool_choice="auto",
        )
        oai_elapsed = time.perf_counter() - oai_start
        msg = completion.choices[0].message
        tool_count = len(msg.tool_calls) if msg.tool_calls else 0
        logger.info(
            "turn.iter=%d openai_ms=%d tool_calls=%d",
            iteration, int(oai_elapsed * 1000), tool_count,
        )

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
            tools_start = time.perf_counter()
            for tc in msg.tool_calls:
                name = tc.function.name
                args = json.loads(tc.function.arguments or "{}")
                handler = HANDLERS.get(name)
                if handler is None:
                    result = {"ok": False, "error": f"unknown tool {name}"}
                else:
                    try:
                        result = handler(ctx, args)
                    except Exception as exc:
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
            tools_elapsed = time.perf_counter() - tools_start
            logger.info("turn.tools_ms=%d count=%d", int(tools_elapsed * 1000), tool_count)
            # Loop again so the model can react to tool results
            continue

        # No tool call — this is the final assistant text.
        final_text = guardrails.sanitize_output(msg.content or "")

        # Safety net: some models occasionally narrate `complete_screening(summary='...')`
        # in text instead of invoking the tool. If we detect that and the screening
        # hasn't been finalised yet, force-invoke the tool server-side using the
        # extracted summary text so the conversation actually closes out.
        if not completed:
            forced_summary = _extract_narrated_summary(final_text)
            if forced_summary is not None:
                handler = HANDLERS.get("complete_screening")
                if handler is not None:
                    forced_result = handler(ctx, {"summary": forced_summary})
                    aggregated_tool_calls.append({
                        "name": "complete_screening",
                        "args": {"summary": forced_summary},
                        "result": forced_result,
                        "synthesized": True,
                    })
                    if forced_result.get("ok"):
                        completed = True
                    # Strip the narrated tool-call text from the user-visible reply
                    final_text = _strip_narrated_call(final_text).strip()

        persistence.append_turn(
            conversation_id=conversation_id,
            role="assistant",
            content=final_text,
            tool_calls=aggregated_tool_calls or None,
        )
        total_ms = int((time.perf_counter() - turn_start) * 1000)
        logger.info(
            "turn.done cid=%s total_ms=%d iters=%d tool_calls=%d completed=%s",
            conversation_id, total_ms, iteration + 1, len(aggregated_tool_calls), completed,
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
