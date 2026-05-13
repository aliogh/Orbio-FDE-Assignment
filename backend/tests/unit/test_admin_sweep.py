"""Tests for POST /api/admin/sweep-stale."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from main import create_app


@pytest.fixture
def client(mocker, monkeypatch) -> TestClient:
    monkeypatch.setenv("SWEEP_SECRET", "shh")
    mocker.patch("transports.admin.persistence.sweep_stale", return_value=3)
    return TestClient(create_app())


class TestSweepStaleEndpoint:
    def test_default_minutes_with_correct_secret(self, client: TestClient) -> None:
        r = client.post("/api/admin/sweep-stale", headers={"X-Admin-Secret": "shh"})
        assert r.status_code == 200
        assert r.json() == {"swept": 3, "threshold_minutes": "5"}

    def test_custom_minutes_query(self, client: TestClient, mocker) -> None:
        sweep = mocker.patch("transports.admin.persistence.sweep_stale", return_value=1)
        r = client.post(
            "/api/admin/sweep-stale?minutes=30",
            headers={"X-Admin-Secret": "shh"},
        )
        assert r.status_code == 200
        sweep.assert_called_once_with(minutes=30)

    def test_missing_secret_unauthorized(self, client: TestClient) -> None:
        r = client.post("/api/admin/sweep-stale")
        assert r.status_code == 401

    def test_wrong_secret_unauthorized(self, client: TestClient) -> None:
        r = client.post("/api/admin/sweep-stale", headers={"X-Admin-Secret": "nope"})
        assert r.status_code == 401

    def test_invalid_minutes_rejected(self, client: TestClient) -> None:
        r = client.post(
            "/api/admin/sweep-stale?minutes=0",
            headers={"X-Admin-Secret": "shh"},
        )
        assert r.status_code == 422


class TestEndpointDisabledWithoutSecret:
    def test_503_when_sweep_secret_unset(self, mocker, monkeypatch) -> None:
        monkeypatch.delenv("SWEEP_SECRET", raising=False)
        mocker.patch("transports.admin.persistence.sweep_stale", return_value=0)
        c = TestClient(create_app())
        r = c.post("/api/admin/sweep-stale", headers={"X-Admin-Secret": "anything"})
        assert r.status_code == 503
