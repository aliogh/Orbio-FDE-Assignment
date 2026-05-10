"""Input/output guardrails. Lightweight by design — heavier filtering belongs
in the system prompt."""
from __future__ import annotations

import re
from dataclasses import dataclass

# Minimal, illustrative blocklist. In production this'd be a real moderation
# pipeline (OpenAI Moderation API, etc.); here we keep the take-home small.
_BAD_WORDS = re.compile(
    r"\b(f\*+(?:king|ing)|sh\*+t|stupid bot|idiot bot|hijo de pu)",
    re.IGNORECASE,
)
_PROMPT_INJECTION = re.compile(
    r"\b(ignore (?:previous|all) instructions?|disregard the system|"
    r"you are now|act as a)",
    re.IGNORECASE,
)
_PHONE_RE = re.compile(r"(?:\+\d{1,3}[\s-]?)?(?:\(?\d{2,4}\)?[\s-]?){2,4}\d{2,4}")


@dataclass(frozen=True)
class GuardrailDecision:
    allowed: bool
    reason: str | None = None


def check_input(message: str) -> GuardrailDecision:
    if _BAD_WORDS.search(message):
        return GuardrailDecision(allowed=False, reason="inappropriate language")
    if _PROMPT_INJECTION.search(message):
        return GuardrailDecision(
            allowed=False, reason="off-topic / prompt injection attempt"
        )
    return GuardrailDecision(allowed=True)


def sanitize_output(text: str) -> str:
    """Strip phone-number patterns from agent output. The agent shouldn't be
    emitting these anyway; this is a belt-and-braces filter."""
    return _PHONE_RE.sub("[redacted]", text)
