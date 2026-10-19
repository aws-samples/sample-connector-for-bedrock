"""Tests for BRConnector identity parsing and per-request env injection."""

import logging
from types import SimpleNamespace

from backend.api.invocations import (
    BRC_ENV_HEADERS,
    apply_brc_request_env,
    parse_session_and_user_from_headers,
)

PREFIX = "x-amzn-bedrock-agentcore-runtime-custom-brc-"
SESSION_HEADER = "x-amzn-bedrock-agentcore-runtime-session-id"
# Looks like a JWT whose "sub" must be ignored
FAKE_JWT = "eyJhbGciOiJub25lIn0.eyJzdWIiOiJvdGhlci11c2VyIn0.sig"


def make_request(headers):
    return SimpleNamespace(headers=headers)


def test_user_id_comes_from_session_id():
    request = make_request({
        SESSION_HEADER: "brc-key-0000000000000042@workspace",
        "authorization": f"Bearer {FAKE_JWT}",
    })
    session_id, user_id, project = parse_session_and_user_from_headers(request)
    assert session_id == "brc-key-0000000000000042@workspace"
    assert user_id == "brc-key-0000000000000042"
    assert project is None


def test_project_suffix_still_parsed():
    request = make_request({SESSION_HEADER: "brc-key-0000000000000042@workspace/demo"})
    _, user_id, project = parse_session_and_user_from_headers(request)
    assert user_id == "brc-key-0000000000000042"
    assert project == "demo"


def test_missing_session_header_gives_no_user():
    request = make_request({"authorization": f"Bearer {FAKE_JWT}"})
    assert parse_session_and_user_from_headers(request) == (None, None, None)


def test_apply_env_sets_only_present_headers(monkeypatch):
    for name in BRC_ENV_HEADERS.values():
        monkeypatch.setenv(name, "original")
    written = apply_brc_request_env({PREFIX + "api-key": "key-value"})
    assert written == ["ANTHROPIC_AUTH_TOKEN"]
    import os
    assert os.environ["ANTHROPIC_AUTH_TOKEN"] == "key-value"
    assert os.environ["AWS_ACCESS_KEY_ID"] == "original"


def test_apply_env_overwrites_on_next_request(monkeypatch):
    import os
    monkeypatch.delenv("ANTHROPIC_AUTH_TOKEN", raising=False)
    apply_brc_request_env({PREFIX + "api-key": "first"})
    apply_brc_request_env({PREFIX + "api-key": "second"})
    assert os.environ["ANTHROPIC_AUTH_TOKEN"] == "second"


def test_secret_values_never_logged(monkeypatch, capsys, caplog):
    for name in BRC_ENV_HEADERS.values():
        monkeypatch.delenv(name, raising=False)
    secrets = ["sekrit-api-key", "sekrit-access-key-id", "sekrit-secret-key", "sekrit-session-token"]
    headers = dict(zip(
        [PREFIX + "api-key", PREFIX + "aws-access-key-id",
         PREFIX + "aws-secret-access-key", PREFIX + "aws-session-token"],
        secrets,
    ))
    headers[SESSION_HEADER] = "brc-key-0000000000000042@workspace"
    with caplog.at_level(logging.DEBUG):
        apply_brc_request_env(headers)
        parse_session_and_user_from_headers(make_request(headers))
    captured = capsys.readouterr()
    output = captured.out + captured.err + caplog.text
    for secret in secrets:
        assert secret not in output
