"""Tests for the conversations persistence module — Supabase client mocked."""
from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from persistence import conversations as conv


@pytest.fixture
def fake_client(mocker) -> MagicMock:
    client = MagicMock()
    mocker.patch("persistence.conversations.get_client", return_value=client)
    return client


class TestStartConversation:
    def test_inserts_with_source_and_returns_id(self, fake_client: MagicMock) -> None:
        fake_client.table.return_value.insert.return_value.execute.return_value.data = [
            {"id": "abc-123"}
        ]
        cid = conv.start_conversation(source="chat")
        assert cid == "abc-123"
        fake_client.table.assert_called_once_with("conversations")


class TestAppendTurn:
    def test_inserts_user_turn(self, fake_client: MagicMock) -> None:
        conv.append_turn(
            conversation_id="abc",
            role="user",
            content="Hola",
            tool_calls=None,
        )
        fake_client.table.assert_called_once_with("turns")


class TestUpdateConversation:
    def test_patches_only_provided_fields(self, fake_client: MagicMock) -> None:
        conv.update_conversation(
            conversation_id="abc",
            patch={"qualified": True, "summary": "Looks good"},
        )
        update_call = fake_client.table.return_value.update
        assert update_call.called
        args, _ = update_call.call_args
        assert args[0] == {"qualified": True, "summary": "Looks good"}
