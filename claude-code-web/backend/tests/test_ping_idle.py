"""/ping reports the last real activity, not the current time."""

import asyncio
import time

from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from fastapi.testclient import TestClient

from backend import server
from backend.api import invocations as inv
from backend.core import activity


def _client(monkeypatch, handler):
    monkeypatch.setattr(inv, "get_current_directory", handler)
    app = FastAPI()
    app.include_router(inv.router)
    return TestClient(app)


def _invoke(client, path="/shell/cwd", method="GET"):
    return client.post("/invocations", json={"path": path, "method": method})


def test_ping_does_not_advance_on_its_own(monkeypatch):
    monkeypatch.setattr(time, "time", lambda: 1000.0)
    first = asyncio.run(server.ping())
    monkeypatch.setattr(time, "time", lambda: 2000.0)
    second = asyncio.run(server.ping())
    assert first["time_of_last_update"] == second["time_of_last_update"]
    assert first["status"] == second["status"] == "Healthy"


def test_an_invocation_moves_the_timestamp(monkeypatch):
    async def handler():
        return {"cwd": "/"}

    activity.mark_activity(100.0)
    client = _client(monkeypatch, handler)
    monkeypatch.setattr(time, "time", lambda: 1500.0)
    assert _invoke(client).status_code == 200
    assert activity.last_activity() == 1500
    assert asyncio.run(server.ping())["time_of_last_update"] == 1500


def test_ping_and_health_invocations_do_not_count(monkeypatch):
    async def handler():
        return {"cwd": "/"}

    activity.mark_activity(100.0)
    client = _client(monkeypatch, handler)
    monkeypatch.setattr(time, "time", lambda: 1500.0)
    _invoke(client, "/ping")
    _invoke(client, "/health")
    assert activity.last_activity() == 100


def test_a_streamed_invocation_counts_when_it_ends(monkeypatch):
    seen = []

    async def body():
        seen.append(activity.last_activity())
        monkeypatch.setattr(time, "time", lambda: 1800.0)
        yield b"data: x\n\n"

    async def handler():
        return StreamingResponse(body(), media_type="text/event-stream")

    activity.mark_activity(100.0)
    client = _client(monkeypatch, handler)
    monkeypatch.setattr(time, "time", lambda: 1500.0)
    assert _invoke(client).status_code == 200
    assert seen == [1500]
    assert activity.last_activity() == 1800
