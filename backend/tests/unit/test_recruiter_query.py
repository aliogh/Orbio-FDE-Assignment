"""Tests for recruiter read-helpers."""
from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from persistence import recruiter_query as rq


@pytest.fixture
def fake_client(mocker) -> MagicMock:
    c = MagicMock()
    mocker.patch("persistence.recruiter_query.get_client", return_value=c)
    return c


class TestStats:
    def test_compute_stats_aggregates_basic_counts(self, fake_client: MagicMock) -> None:
        fake_client.rpc.return_value.execute.return_value.data = [
            {"total": 10, "qualified": 6, "abandoned": 2, "avg_duration_seconds": 312.5},
        ]
        s = rq.compute_stats()
        assert s["total"] == 10
        assert s["qualified"] == 6
        assert s["qualified_rate"] == 0.6


class TestList:
    def test_list_conversations_filters(self, fake_client: MagicMock) -> None:
        fake_client.table.return_value.select.return_value.order.return_value.limit.return_value.execute.return_value.data = []
        rq.list_conversations(limit=20)
        fake_client.table.assert_called_with("conversations")
