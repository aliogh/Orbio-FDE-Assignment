# backend/tests/integration/test_chat_flow.py
"""Integration test: full chat turn round-trip writes to real Supabase."""
from __future__ import annotations

import os
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from main import create_app
from persistence.db import get_client

pytestmark = pytest.mark.integration


@pytest.fixture
def client(mocker) -> TestClient:
    if not os.getenv("SUPABASE_URL"):
        pytest.skip("SUPABASE_URL not set")

    fake_openai = MagicMock()
    msg = MagicMock()
    msg.role = "assistant"
    msg.content = "Hola, ¿cómo te llamas?"
    msg.tool_calls = None
    fake_openai.chat.completions.create.return_value.choices = [MagicMock(message=msg)]
    mocker.patch("agent_core.runner.get_openai", return_value=fake_openai)

    return TestClient(create_app())


def test_chat_turn_persists_user_and_assistant_rows(client: TestClient) -> None:
    r = client.post("/api/chat", json={"message": "hola"})
    assert r.status_code == 200
    cid = r.json()["conversation_id"]

    sb = get_client()
    conv = sb.table("conversations").select("*").eq("id", cid).execute().data[0]
    assert conv["source"] == "chat"
    assert conv["status"] == "in_progress"

    turns = sb.table("turns").select("*").eq("conversation_id", cid).execute().data
    roles = sorted(t["role"] for t in turns)
    assert roles == ["assistant", "user"]

    # Cleanup
    sb.table("conversations").delete().eq("id", cid).execute()
