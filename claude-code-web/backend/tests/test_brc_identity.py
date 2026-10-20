"""Tests for BRConnector identity parsing and per-request env injection."""

import logging
import os
import pytest
from types import SimpleNamespace

from backend.api.invocations import (
    BRC_ENV_HEADERS,
    apply_brc_request_env,
    parse_session_and_user_from_headers,
)
from backend.tests.forged_jwt import forged_jwt

PREFIX = "x-amzn-bedrock-agentcore-runtime-custom-brc-"
SESSION_HEADER = "x-amzn-bedrock-agentcore-runtime-session-id"
# Forged unsigned JWT whose "sub" (another user) must be ignored
FAKE_JWT = forged_jwt()


ENV_NAMES = list(BRC_ENV_HEADERS.values())
# Snapshot at import time, before any test mutates the environment
ENV_SNAPSHOT = {name: os.environ.get(name) for name in ENV_NAMES}


@pytest.fixture(autouse=True)
def isolated_env(monkeypatch):
    # setenv then delenv makes monkeypatch record the original state, so it is
    # restored even for variables that were absent before the test
    for name in ENV_NAMES:
        monkeypatch.setenv(name, "placeholder")
        monkeypatch.delenv(name)


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
    for name in ENV_NAMES:
        monkeypatch.setenv(name, "original")
    written = apply_brc_request_env({PREFIX + "api-key": "key-value"})
    assert written == ["ANTHROPIC_AUTH_TOKEN"]
    assert os.environ["ANTHROPIC_AUTH_TOKEN"] == "key-value"
    assert os.environ["AWS_ACCESS_KEY_ID"] == "original"


def test_apply_env_overwrites_on_next_request(monkeypatch):
    apply_brc_request_env({PREFIX + "api-key": "first"})
    apply_brc_request_env({PREFIX + "api-key": "second"})
    assert os.environ["ANTHROPIC_AUTH_TOKEN"] == "second"


def test_secret_values_never_logged(monkeypatch, capsys, caplog):
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


def test_zz_env_restored_after_previous_tests():
    # Runs last (file order): earlier tests wrote env vars, none may leak
    assert {name: os.environ.get(name) for name in ENV_NAMES} == ENV_SNAPSHOT
