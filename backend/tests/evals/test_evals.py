"""Conversation evals — these hit real OpenAI and cost a few cents per run.

Run with: uv run pytest -m eval -v
Run a single one: uv run pytest -m eval -k happy_path_es -v
Skipped by default in unit-only runs (the marker excludes them)."""
from __future__ import annotations

import json
import os
from pathlib import Path

import pytest
from supabase import create_client

from agent_core.runner import run_turn
from persistence.conversations import start_conversation
from tests.evals.scenarios import SCENARIOS, Scenario

pytestmark = pytest.mark.eval

SAMPLE_DIR = Path(__file__).resolve().parent.parent.parent.parent / "docs" / "sample-conversations"


@pytest.fixture
def supabase():
    if not os.getenv("SUPABASE_URL"):
        pytest.skip("SUPABASE_URL not set; evals require real Supabase")
    return create_client(
        os.environ["SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )


@pytest.mark.parametrize("scenario", SCENARIOS, ids=lambda s: s.name)
def test_scenario(scenario: Scenario, supabase) -> None:
    if not os.getenv("OPENAI_API_KEY"):
        pytest.skip("OPENAI_API_KEY not set")

    cid = start_conversation(source="chat")
    history: list[dict] = []
    for user_msg in scenario.user_turns:
        history.append({"role": "user", "content": user_msg})
        result = run_turn(conversation_id=cid, history=history)
        history.append({"role": "assistant", "content": result.assistant_message})
        if result.completed:
            break

    conv = supabase.table("conversations").select("*").eq("id", cid).execute().data[0]
    extracted = conv["extracted_fields"]

    # Persist the transcript as a sample conversation
    SAMPLE_DIR.mkdir(parents=True, exist_ok=True)
    (SAMPLE_DIR / f"{scenario.name}.json").write_text(
        json.dumps(
            {
                "scenario": scenario.name,
                "transcript": history,
                "extracted_fields": extracted,
                "qualified": conv["qualified"],
                "disqualification_reason": conv["disqualification_reason"],
                "summary": conv["summary"],
            },
            indent=2,
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )

    # Assertions
    if scenario.expected_qualified is not None:
        assert conv["qualified"] == scenario.expected_qualified, \
            f"{scenario.name}: expected qualified={scenario.expected_qualified}, got {conv['qualified']}"
    if scenario.expected_disqualification is not None:
        assert conv["disqualification_reason"] == scenario.expected_disqualification

    for field, expected_value in scenario.expect_fields.items():
        assert field in extracted, f"{scenario.name}: missing field {field}"
        if isinstance(expected_value, str):
            # For free-form fields we accept partial match
            actual = str(extracted[field]).lower()
            assert expected_value.lower() in actual or actual in expected_value.lower(), \
                f"{scenario.name}: field {field} expected ~{expected_value}, got {extracted[field]}"
        else:
            assert extracted[field] == expected_value, \
                f"{scenario.name}: field {field} expected {expected_value}, got {extracted[field]}"
