"""OAuth endpoints take the user from the BRConnector session id, never from a JWT."""

import asyncio
import base64
import json
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from backend.api import oauth

SESSION_HEADER = "x-amzn-bedrock-agentcore-runtime-session-id"
WORKLOAD_HEADER = "x-amzn-bedrock-agentcore-runtime-workload-accesstoken"


def _b64(obj):
    return base64.urlsafe_b64encode(json.dumps(obj).encode()).rstrip(b"=").decode()


# Forged unsigned token whose "sub" must not be used; built at runtime so no JWT literal sits in the repo
FORGED_AUTH = "Bearer " + ".".join([_b64({"alg": "none"}), _b64({"sub": "other-user"}), "sig"])


def make_request(headers):
    return SimpleNamespace(headers=headers)


@pytest.fixture
def captured(monkeypatch):
    seen = {}

    async def fake_token(workload_token, force_authentication=False):
        return {"accessToken": "tok"}

    async def fake_gh(access_token):
        return {"status": "success"}

    monkeypatch.setattr(oauth, "get_github_resource_token", fake_token)
    monkeypatch.setattr(oauth, "initialize_gh_auth", fake_gh)

    class FakeLogger:
        def info(self, msg, *a, **k):
            seen.setdefault("logs", []).append(str(msg))

        def __getattr__(self, name):
            return lambda *a, **k: None

    monkeypatch.setattr(oauth, "logger", FakeLogger())

    class FakeClient:
        def complete_resource_token_auth(self, **kwargs):
            seen["complete"] = kwargs

    monkeypatch.setattr(oauth, "get_bedrock_agentcore_client", lambda: FakeClient())
    return seen


def test_token_endpoint_uses_session_user_not_forged_jwt(captured):
    req = make_request({
        SESSION_HEADER: "brc-key-0000000000000042@workspace",
        WORKLOAD_HEADER: "w",
        "authorization": FORGED_AUTH,
    })
    asyncio.run(oauth.get_github_oauth_token(req))
    logs = " ".join(captured["logs"])
    assert "brc-key-0000000000000042" in logs
    assert "other-user" not in logs


def test_token_endpoint_rejects_forged_jwt_without_session_user(captured):
    req = make_request({WORKLOAD_HEADER: "w", "authorization": FORGED_AUTH})
    with pytest.raises(HTTPException) as exc:
        asyncio.run(oauth.get_github_oauth_token(req))
    assert exc.value.status_code == 400


def test_callback_uses_session_user_not_forged_jwt(captured):
    req = make_request({
        SESSION_HEADER: "brc-key-0000000000000042@workspace",
        "authorization": FORGED_AUTH,
    })
    asyncio.run(oauth.github_oauth_callback(req, "sess-uri"))
    assert captured["complete"]["userIdentifier"] == {"userId": "brc-key-0000000000000042"}


def test_callback_rejects_forged_jwt_without_session_user(captured):
    req = make_request({"authorization": FORGED_AUTH})
    with pytest.raises(HTTPException) as exc:
        asyncio.run(oauth.github_oauth_callback(req, "sess-uri"))
    assert exc.value.status_code == 400
    assert "complete" not in captured
