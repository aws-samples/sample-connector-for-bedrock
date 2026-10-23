"""skipWebFetchPreflight defaults to true in the user's settings.json; other content is kept."""

import asyncio
import json
import logging

import pytest

from backend.core import session as session_module
from backend.core.session import AgentSession
from backend.core.user_settings import apply_default_user_settings


@pytest.fixture
def settings_path(tmp_path, monkeypatch):
    monkeypatch.setenv("HOME", str(tmp_path))
    return tmp_path / ".claude" / "settings.json"


def test_missing_file_is_created(settings_path):
    apply_default_user_settings()
    assert json.loads(settings_path.read_text()) == {"skipWebFetchPreflight": True}


def test_other_keys_are_kept(settings_path):
    settings_path.parent.mkdir(parents=True)
    settings_path.write_text(json.dumps({"enabledPlugins": {"a": True}}))
    apply_default_user_settings()
    assert json.loads(settings_path.read_text()) == {
        "enabledPlugins": {"a": True},
        "skipWebFetchPreflight": True,
    }


@pytest.mark.parametrize("value", [False, True])
def test_explicit_value_is_kept(settings_path, value):
    settings_path.parent.mkdir(parents=True)
    original = '{"skipWebFetchPreflight": %s, "env": {"X": "1"}}' % json.dumps(value)
    settings_path.write_text(original)
    apply_default_user_settings()
    assert settings_path.read_text() == original


@pytest.mark.parametrize("content", ["{not json", "[1, 2]", ""])
def test_unreadable_file_is_left_alone_and_logged(settings_path, caplog, content):
    settings_path.parent.mkdir(parents=True)
    settings_path.write_text(content)
    with caplog.at_level(logging.WARNING):
        apply_default_user_settings()
    assert settings_path.read_text() == content
    assert "settings.json" in caplog.text


def test_non_ascii_and_compact_array_survive(settings_path):
    settings_path.parent.mkdir(parents=True)
    settings_path.write_text('{"name": "é 中文", "list": [1,2,3]}', encoding="utf-8")
    apply_default_user_settings()
    text = settings_path.read_text(encoding="utf-8")
    assert "é 中文" in text and "\\u" not in text
    assert "[1, 2, 3]" in text
    assert json.loads(text) == {"name": "é 中文", "list": [1, 2, 3], "skipWebFetchPreflight": True}
    assert list(json.loads(text)) == ["name", "list", "skipWebFetchPreflight"]


def test_detected_indent_is_reused(settings_path):
    settings_path.parent.mkdir(parents=True)
    settings_path.write_text('{\n    "a": "é"\n}\n', encoding="utf-8")
    apply_default_user_settings()
    assert settings_path.read_text(encoding="utf-8").startswith('{\n    "a": "é",\n    "skip')


def test_no_temp_file_left_behind(settings_path):
    apply_default_user_settings()
    assert [p.name for p in settings_path.parent.iterdir()] == ["settings.json"]


def test_connect_applies_default_before_sdk_starts(settings_path, monkeypatch):
    seen = {}

    class FakeClient:
        def __init__(self, options):
            seen["at_init"] = json.loads(settings_path.read_text())

        async def connect(self):
            pass

    monkeypatch.setattr(session_module, "ClaudeSDKClient", FakeClient)
    session = AgentSession("s1", "u1", None, None, False, 8080, None)
    asyncio.run(session.connect())
    assert seen["at_init"]["skipWebFetchPreflight"] is True
