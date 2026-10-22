"""AGENTCORE_WEB_SEARCH_GATEWAY_URL adds a web-search MCP server to every session."""

import asyncio
import json
import os
from pathlib import Path

import pytest
from botocore.credentials import EnvProvider

from backend.core import session as session_module
from backend.core.session import AgentSession

GATEWAY_URL = "https://gw-abc123.gateway.bedrock-agentcore.us-east-1.amazonaws.com/mcp"
PER_KEY = {
    "AWS_ACCESS_KEY_ID": "ASIAPERKEYEXAMPLE",
    "AWS_SECRET_ACCESS_KEY": "per-key-secret",
    "AWS_SESSION_TOKEN": "per-key-token",
}
BLANK_CREDENTIALS = {"AWS_ACCESS_KEY_ID": "", "AWS_SECRET_ACCESS_KEY": "", "AWS_SESSION_TOKEN": ""}


@pytest.fixture
def home(tmp_path, monkeypatch):
    monkeypatch.setenv("HOME", str(tmp_path))
    monkeypatch.delenv("AGENTCORE_WEB_SEARCH_GATEWAY_URL", raising=False)
    # As apply_brc_request_env leaves them after an invocation
    for name, value in PER_KEY.items():
        monkeypatch.setenv(name, value)
    return tmp_path


@pytest.fixture
def captured(monkeypatch):
    seen = {}

    class FakeClient:
        def __init__(self, options):
            seen["options"] = options

        async def connect(self):
            pass

    monkeypatch.setattr(session_module, "ClaudeSDKClient", FakeClient)
    return seen


def write_user_mcp(home: Path, servers: dict) -> None:
    path = home / ".claude" / "mcp.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"mcpServers": servers}))


def connect(captured, mcp_server_ids=None):
    session = AgentSession("s1", "u1", None, None, False, 8080, None, mcp_server_ids)
    asyncio.run(session.connect())
    return captured["options"].mcp_servers


def test_gateway_url_adds_web_search_server(home, captured, monkeypatch):
    monkeypatch.setenv("AGENTCORE_WEB_SEARCH_GATEWAY_URL", GATEWAY_URL)
    servers = connect(captured)
    server = servers["web-search"]
    assert server["type"] == "stdio"
    assert Path(server["command"]).name == "mcp-proxy-for-aws"
    assert os.access(server["command"], os.X_OK), "console script must be installed with the backend"
    assert server["args"] == [GATEWAY_URL, "--service", "bedrock-agentcore", "--region", "us-east-1"]


@pytest.mark.parametrize("region", ["us-west-2", "eu-west-1", "ap-northeast-1"])
def test_region_comes_from_the_gateway_host(home, captured, monkeypatch, region):
    url = f"https://gw-x.gateway.bedrock-agentcore.{region}.amazonaws.com/mcp"
    monkeypatch.setenv("AGENTCORE_WEB_SEARCH_GATEWAY_URL", url)
    assert connect(captured)["web-search"]["args"] == [url, "--service", "bedrock-agentcore", "--region", region]


@pytest.mark.parametrize("value", [None, "", "   "])
def test_unset_adds_nothing(home, captured, monkeypatch, value):
    if value is not None:
        monkeypatch.setenv("AGENTCORE_WEB_SEARCH_GATEWAY_URL", value)
    assert connect(captured) == {}


def test_unset_leaves_user_servers_as_they_were(home, captured):
    write_user_mcp(home, {"docs": {"type": "http", "url": "https://docs.example.com/mcp"}})
    assert connect(captured, ["docs"]) == {"docs": {"type": "http", "url": "https://docs.example.com/mcp"}}


@pytest.mark.parametrize(
    "url",
    [
        "http://gw-x.gateway.bedrock-agentcore.us-east-1.amazonaws.com/mcp",
        "https://search.example.com/mcp",
        "not a url",
    ],
)
def test_url_that_is_not_a_gateway_adds_nothing(home, captured, monkeypatch, capsys, url):
    monkeypatch.setenv("AGENTCORE_WEB_SEARCH_GATEWAY_URL", url)
    assert connect(captured) == {}
    assert "AGENTCORE_WEB_SEARCH_GATEWAY_URL" in capsys.readouterr().out


def test_merged_with_user_servers(home, captured, monkeypatch):
    monkeypatch.setenv("AGENTCORE_WEB_SEARCH_GATEWAY_URL", GATEWAY_URL)
    write_user_mcp(home, {"docs": {"type": "http", "url": "https://docs.example.com/mcp"}})
    servers = connect(captured, ["docs"])
    assert set(servers) == {"web-search", "docs"}
    assert servers["docs"] == {"type": "http", "url": "https://docs.example.com/mcp"}


def test_user_server_named_web_search_wins(home, captured, monkeypatch):
    monkeypatch.setenv("AGENTCORE_WEB_SEARCH_GATEWAY_URL", GATEWAY_URL)
    write_user_mcp(
        home,
        {"web-search": {"type": "stdio", "command": "my-search", "args": ["--fast"], "env": {"K": "v"}}},
    )
    servers = connect(captured, ["web-search"])
    assert servers == {
        "web-search": {"type": "stdio", "command": "my-search", "args": ["--fast"], "env": {"K": "v"}}
    }


def test_web_search_is_not_written_to_the_user_config(home, captured, monkeypatch):
    monkeypatch.setenv("AGENTCORE_WEB_SEARCH_GATEWAY_URL", GATEWAY_URL)
    write_user_mcp(home, {"docs": {"type": "http", "url": "https://docs.example.com/mcp"}})
    before = (home / ".claude" / "mcp.json").read_text()
    connect(captured, ["docs"])
    assert (home / ".claude" / "mcp.json").read_text() == before


def test_child_does_not_get_the_per_key_credentials(home, captured, monkeypatch):
    monkeypatch.setenv("AGENTCORE_WEB_SEARCH_GATEWAY_URL", GATEWAY_URL)
    server = connect(captured)["web-search"]
    # The CLI starts the child with its own env plus this one, so blank values replace the
    # per-key credentials and boto3 moves on to the runtime role from the metadata service.
    assert server["env"] == BLANK_CREDENTIALS
    assert not any(value in json.dumps(server) for value in PER_KEY.values())
    assert EnvProvider(environ={**os.environ, **server["env"]}).load() is None
    assert EnvProvider(environ=dict(os.environ)).load().access_key == PER_KEY["AWS_ACCESS_KEY_ID"]
