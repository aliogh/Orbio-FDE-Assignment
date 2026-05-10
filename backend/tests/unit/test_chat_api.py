"""Tests for POST /api/chat endpoint."""
from __future__ import annotations

from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from main import create_app


@pytest.fixture
def client(mocker) -> TestClient:
    # Mock the runner + persistence so the endpoint runs in isolation
    runner_result = MagicMock(
        assistant_message="Hola Ana",
        tool_calls=[],
        completed=False,
    )
    mocker.patch("transports.chat_api.run_turn", return_value=runner_result)
    mocker.patch("transports.chat_api.start_conversation", return_value="conv-1")
    return TestClient(create_app())


class TestChatEndpoint:
    def test_first_turn_creates_conversation(self, client: TestClient) -> None:
        r = client.post("/api/chat", json={"message": "hola"})
        assert r.status_code == 200
        body = r.json()
        assert body["conversation_id"] == "conv-1"
        assert body["assistant_message"] == "Hola Ana"
        assert body["completed"] is False

    def test_subsequent_turn_uses_existing_id(self, client: TestClient) -> None:
        r = client.post(
            "/api/chat",
            json={"message": "soy ana", "conversation_id": "conv-existing", "history": []},
        )
        assert r.status_code == 200
        assert r.json()["conversation_id"] == "conv-existing"

    def test_empty_message_rejected(self, client: TestClient) -> None:
        r = client.post("/api/chat", json={"message": ""})
        assert r.status_code == 422
