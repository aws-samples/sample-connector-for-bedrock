"""~/.claude must be resolved from HOME at call time, never hardcoded to /root."""

import asyncio
import json

import pytest

from backend.api import mcp_servers, plugins
from backend.core.paths import claude_dir
from backend.core.session import AgentSession
from backend.models.schemas import AddMCPServerRequest


@pytest.fixture
def home(tmp_path, monkeypatch):
    monkeypatch.setenv("HOME", str(tmp_path))
    return tmp_path


def run(coro):
    return asyncio.run(coro)


def test_claude_dir_follows_home(home):
    assert claude_dir() == home / ".claude"


def test_mcp_servers_list_add_delete_use_home(home):
    mcp_json = home / ".claude" / "mcp.json"

    listed = run(mcp_servers.list_mcp_servers())
    assert listed.servers == {}
    assert listed.mcp_config_path == str(mcp_json)

    run(mcp_servers.add_mcp_server(
        AddMCPServerRequest(name="demo", type="http", url="https://example.invalid/mcp")
    ))
    assert mcp_json.is_file()
    assert "demo" in json.loads(mcp_json.read_text())["mcpServers"]
    assert "demo" in run(mcp_servers.list_mcp_servers()).servers

    run(mcp_servers.delete_mcp_server("demo"))
    assert "demo" not in json.loads(mcp_json.read_text())["mcpServers"]


def test_plugins_use_home(home):
    marketplaces = home / ".claude" / "plugins" / "known_marketplaces.json"
    marketplaces.parent.mkdir(parents=True)
    marketplaces.write_text("{}")

    assert plugins._known_marketplaces_path() == marketplaces
    assert plugins._settings_path() == home / ".claude" / "settings.json"
    assert plugins._installed_plugins_path().parent == marketplaces.parent
    assert plugins._marketplaces_dir() == marketplaces.parent / "marketplaces"
    plugins._enable_plugin_in_settings("p@m")
    settings = json.loads((home / ".claude" / "settings.json").read_text())
    assert settings["enabledPlugins"]["p@m"] is True
    run(plugins.list_plugins())


def test_session_loads_mcp_config_from_home(home):
    mcp_json = home / ".claude" / "mcp.json"
    mcp_json.parent.mkdir(parents=True)
    mcp_json.write_text(json.dumps({"mcpServers": {
        "demo": {"type": "http", "url": "https://example.invalid/mcp"},
    }}))
    session = object.__new__(AgentSession)
    session.mcp_server_ids = ["demo"]

    loaded = run(session._load_mcp_servers())
    assert loaded == {"demo": {"type": "http", "url": "https://example.invalid/mcp"}}
