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
