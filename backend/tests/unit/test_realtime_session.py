"""Tests for POST /api/voice/session — ephemeral-key minting."""
from __future__ import annotations

from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from main import create_app


@pytest.fixture
def client(mocker, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    fake_response = MagicMock()
    fake_response.json.return_value = {
        "client_secret": {"value": "ek_abc123", "expires_at": 1234567890},
        "id": "sess_123",
    }
    fake_response.status_code = 200
    mocker.patch(
        "transports.realtime_session.httpx.post",
        return_value=fake_response,
    )
    mocker.patch(
        "transports.realtime_session.start_conversation",
        return_value="conv-voice-1",
    )
    return TestClient(create_app())


class TestVoiceSession:
    def test_returns_ephemeral_key_and_conversation_id(self, client: TestClient) -> None:
        r = client.post("/api/voice/session")
        assert r.status_code == 200
        body = r.json()
        assert body["client_secret"] == "ek_abc123"
        assert body["conversation_id"] == "conv-voice-1"
        assert body["model"]  # whatever's configured
