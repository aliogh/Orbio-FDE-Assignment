"""Cheap, dependency-free ES/EN language detector for one user message.

Why we need this when models can technically detect language themselves:
gpt-5-mini and friends over-anchor on whichever language the conversation
*started* in. Telling them in the system prompt to mirror the candidate's
language is necessary but not sufficient — they'll keep replying in the
original language even after the candidate switches mid-flow. The fix is
to detect the language of the LAST user turn ourselves and inject a
per-turn override system message, the same pattern we use for the nudge.

The detection itself is intentionally tiny: a stop-word lookup biased
toward Spanish on ambiguity (the candidate market is es-MX/es-ES). We
don't need linguistic precision — we need to know whether the next
agent reply should be in English or Spanish, and most candidate messages
are unambiguous once short fillers like "ok"/"no" are ignored.
"""
from __future__ import annotations

import re
from typing import Literal

Lang = Literal["es", "en"]

# Function words distinctive to one language. Picked to be (a) common in
# casual/agent-bot text and (b) NOT shared between the two languages.
# "no", "a", "y", "ok", "okay" are intentionally excluded — they exist in
# both, or are too common as fillers.
_ES_TOKENS = frozenset({
    "soy", "estoy", "tengo", "vivo", "llamo", "quiero", "puedo", "trabajo",
    "hola", "sí", "buenas", "gracias", "por", "favor", "que", "qué", "cómo",
    "dónde", "cuándo", "porque", "para", "con", "sin", "mi", "tu", "su",
    "los", "las", "del", "una", "uno", "esto", "esta", "este", "muy", "más",
    "ciudad", "estado", "días", "horas", "horarios", "mañana",
    "tarde", "noche", "semana", "año", "meses", "fines", "experiencia",
    "conducir", "carnet", "licencia", "moto", "motocicleta", "bici",
    "pero", "también", "además", "luego", "entonces", "aquí", "ahora",
    "algún", "alguna", "ningún", "todos", "todo", "es", "son",
    # Language-switch meta-signals (candidate explicitly asks to switch).
    "en", "inglés", "español", "cambiar", "vamos", "déjame", "entiendo",
    "claro", "vale", "perdón", "perdona",
})
_EN_TOKENS = frozenset({
    "i'm", "im", "i", "i'll", "ill", "i've", "ive", "am", "have", "live",
    "want", "can", "work", "hi", "hello", "yes", "please", "thanks", "thank",
    "you", "your", "what", "how", "where", "when", "because", "for", "with",
    "without", "my", "the", "this", "that", "very", "more", "city", "state",
    "days", "hours", "schedule", "morning", "afternoon", "evening", "night",
    "week", "year", "months", "weekends", "experience", "drive", "driving",
    "license", "motorcycle", "bike", "but", "also", "then", "here", "now",
    "any", "some", "none", "all", "is", "are", "was", "were", "do", "does",
    # Language-switch meta-signals (candidate explicitly asks to switch).
    "in", "english", "spanish", "let's", "lets", "let", "actually",
    "switch", "continue", "sorry", "sure",
})

_TOKEN_RE = re.compile(r"[a-záéíóúüñ']+", re.IGNORECASE)


def detect(text: str) -> Lang | None:
    """Classify `text` as 'es' or 'en'. Returns None on ambiguity (no
    decisive markers, or scores tied) so callers can choose how to fall
    back — usually by walking further back in the conversation history."""
    if not text:
        return None
    tokens = [t.lower() for t in _TOKEN_RE.findall(text)]
    if not tokens:
        return None

    es_hits = sum(1 for t in tokens if t in _ES_TOKENS)
    en_hits = sum(1 for t in tokens if t in _EN_TOKENS)

    if es_hits == en_hits:
        return None
    return "es" if es_hits > en_hits else "en"


def detect_for_turn(history: list[dict], default: Lang = "es") -> Lang:
    """Decide what language the agent should reply in.

    Walks the user turns in `history` from most recent backward, returning
    the first decisive language. Falls back to `default` if nothing in the
    transcript is decisive. This stops a one-word "yes" or "ok" from
    flipping the agent's language by itself — we look until we find a
    message with real signal."""
    for turn in reversed(history):
        if turn.get("role") != "user":
            continue
        content = (turn.get("content") or "").strip()
        lang = detect(content)
        if lang is not None:
            return lang
    return default
