"""Tests that the backend trusts only the session-derived user id."""

import copy

from backend.api.invocations import build_session_payload, enforce_session_user

USER = "brc-key-0000000000000042"


def test_path_param_user_overridden():
    request = {
        "path": "/workspace/projects/{user_id}",
        "method": "GET",
        "path_params": {"user_id": "me"},
    }
    result = enforce_session_user(request, USER)
    assert result["path_params"]["user_id"] == USER


def test_payload_and_query_user_overridden():
    request = {
        "path": "/x",
        "payload": {"user_id": "me", "x": 1},
        "query_params": {"user_id": "other"},
    }
    result = enforce_session_user(request, USER)
    assert result["payload"] == {"user_id": USER, "x": 1}
    assert result["query_params"] == {"user_id": USER}


def test_no_user_key_not_added():
    request = {"path": "/x", "payload": {"x": 1}, "path_params": {"a": "b"}, "query_params": {}}
    original = copy.deepcopy(request)
    assert enforce_session_user(request, USER) == original


def test_missing_or_null_dicts_tolerated():
    request = {"path": "/x", "payload": None}
    assert enforce_session_user(request, USER) == {"path": "/x", "payload": None}


def test_no_session_user_leaves_request_unchanged():
    request = {
        "path": "/x",
        "payload": {"user_id": "me"},
        "path_params": {"user_id": "me"},
        "query_params": {"user_id": "me"},
    }
    original = copy.deepcopy(request)
    assert enforce_session_user(request, None) == original


def test_session_creation_uses_session_user():
    assert build_session_payload({"user_id": "me"}, USER)["user_id"] == USER


def test_session_creation_injects_when_absent_and_copies():
    payload = {"cwd": "/w"}
    result = build_session_payload(payload, USER)
    assert result == {"cwd": "/w", "user_id": USER}
    assert payload == {"cwd": "/w"}


def test_session_creation_without_session_user_keeps_payload():
    assert build_session_payload({"user_id": "me"}, None) == {"user_id": "me"}
    assert build_session_payload(None, None) == {}


# --- dispatcher: fail closed without a session user ---

import asyncio
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from backend.api import invocations as inv

SESSION_HEADER = "x-amzn-bedrock-agentcore-runtime-session-id"
NO_USER_HEADERS = [
    {},
    {SESSION_HEADER: "no-workspace-suffix"},
    {SESSION_HEADER: "@workspace"},
]


@pytest.fixture
def spies(monkeypatch):
    """Replace every user-scoped downstream function with a recording spy."""
    from backend.api import oauth, workspace

    calls = []

    def make(name):
        async def spy(*args, **kwargs):
            calls.append((name, args, kwargs))
            return {"ok": True}
        return spy

    monkeypatch.setattr(inv, "create_session", make("create_session"))
    monkeypatch.setattr(workspace, "list_projects", make("list_projects"))
    monkeypatch.setattr(workspace, "create_project", make("create_project"))
    monkeypatch.setattr(workspace, "backup_project", make("backup_project"))
    monkeypatch.setattr(oauth, "create_project_from_github", make("create_project_from_github"))
    return calls


def call(headers, body):
    http_request = SimpleNamespace(headers=headers)
    return asyncio.run(inv.invocations(http_request, body))


USER_SCOPED = [
    {"path": "/sessions", "method": "POST", "payload": {"user_id": "me"}},
    {"path": "/workspace/projects/{user_id}", "method": "GET", "path_params": {"user_id": "me"}},
    {"path": "/workspace/projects", "method": "POST", "payload": {"user_id": "me", "project_name": "p"}},
    {"path": "/workspace/projects/backup", "method": "POST", "payload": {"user_id": "me", "project_name": "p"}},
    {"path": "/github/create-project", "method": "POST",
     "path_params": {"user_id": "me", "repository_url": "https://example.com/r.git"}},
]


@pytest.mark.parametrize("headers", NO_USER_HEADERS)
@pytest.mark.parametrize("body", USER_SCOPED, ids=[b["path"] for b in USER_SCOPED])
def test_user_scoped_branches_reject_without_session_user(spies, headers, body):
    with pytest.raises(HTTPException) as exc:
        call(headers, dict(body))
    assert exc.value.status_code == 400
    assert exc.value.detail == "missing BRConnector session user"
    assert spies == []


def test_projects_payload_without_user_id_gets_session_user(spies):
    headers = {SESSION_HEADER: f"{USER}@workspace"}
    for path, name in (("/workspace/projects", "create_project"),
                       ("/workspace/projects/backup", "backup_project")):
        spies.clear()
        call(headers, {"path": path, "method": "POST", "payload": {"project_name": "p"}})
        assert spies[0][0] == name
        assert spies[0][1][0].user_id == USER


def test_list_projects_uses_session_user(spies):
    headers = {SESSION_HEADER: f"{USER}@workspace"}
    call(headers, {"path": "/workspace/projects/{user_id}", "method": "GET",
                   "path_params": {"user_id": "me"}})
    assert spies == [("list_projects", (USER,), {})]
