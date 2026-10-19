"""Structured user messages (pasted images) are logged as block types and sizes only."""

import asyncio
import json

from backend.api import messages as messages_api
from backend.api.sessions import get_session_history
from backend.core.message_log import summarize_message
from backend.core.session import AgentSession
from backend.models.schemas import SendMessageRequest

IMAGE_DATA = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk" * 50
SECRET_TEXT = "describe this screenshot please"


def image_message():
    return {
        "role": "user",
        "content": [
            {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": IMAGE_DATA}},
            {"type": "text", "text": SECRET_TEXT},
        ],
    }


def run(coro):
    return asyncio.run(coro)


def test_summary_has_block_types_and_sizes_only():
    summary = summarize_message(image_message())

    assert summary == f"role=user content=[image({len(IMAGE_DATA)} bytes), text({len(SECRET_TEXT)} bytes)]"
    assert IMAGE_DATA[:16] not in summary
    assert SECRET_TEXT not in summary


def test_summary_handles_other_shapes():
    assert summarize_message({"role": "user", "content": "héllo"}) == "role=user content=text(6 bytes)"
    assert summarize_message({"role": "user"}) == "role=user content=none"
    tool_result = {"type": "tool_result", "tool_use_id": "t1", "content": IMAGE_DATA}
    summary = summarize_message({"role": "user", "content": [tool_result, "plain"]})
    assert summary == f"role=user content=[tool_result({len(json.dumps(tool_result))} bytes), text(5 bytes)]"
    assert IMAGE_DATA[:16] not in summary
    assert summarize_message("hello") == "str(5 bytes)"
    assert summarize_message(None) == "NoneType"


class StubClient:
    def __init__(self):
        self.sent = []

    async def query(self, prompt):
        if isinstance(prompt, str):
            self.sent.append(prompt)
        else:
            async for item in prompt:
                self.sent.append(item)

    def receive_response(self):
        async def empty():
            return
            yield  # pragma: no cover - makes this an async generator

        return empty()


def connected_session():
    session = object.__new__(AgentSession)
    session.session_id = "s1"
    session.user_id = "brc-key-0000000000000001"
    session.model = "claude-sonnet"
    session.mcp_server_ids = []
    session.client = StubClient()
    session.status = "connected"
    session.message_count = 0
    session.permission_queue = asyncio.Queue()
    return session


def test_session_stream_logs_no_image_data(capsys, monkeypatch):
    monkeypatch.setenv("ENABLE_S3_SYNC", "false")
    session = connected_session()

    async def drain():
        return [event async for event in session.send_message_stream(image_message())]

    events = run(drain())
    out = capsys.readouterr().out

    assert [e["type"] for e in events] == ["start", "done"]
    # The CLI still receives the full message
    assert session.client.sent == [
        {"type": "user", "message": image_message(), "parent_tool_use_id": None, "session_id": "default"}
    ]
    assert IMAGE_DATA[:16] not in out
    assert SECRET_TEXT not in out
    assert f"image({len(IMAGE_DATA)} bytes)" in out


def test_session_non_streaming_logs_no_image_data(capsys):
    session = connected_session()

    run(session.send_message(image_message()))
    out = capsys.readouterr().out

    assert session.client.sent[0]["message"] == image_message()
    assert IMAGE_DATA[:16] not in out
    assert f"image({len(IMAGE_DATA)} bytes)" in out


def test_api_stream_logs_no_image_data(capsys, monkeypatch):
    class StubManager:
        async def get_or_ensure_session(self, session_id, model=None, mcp_server_ids=None):
            return connected_session()

    monkeypatch.setattr(messages_api, "get_session_manager", lambda: StubManager())

    run(messages_api.send_message_stream("s1", SendMessageRequest(message=image_message())))
    out = capsys.readouterr().out

    assert IMAGE_DATA[:16] not in out
    assert f"image({len(IMAGE_DATA)} bytes)" in out


def test_history_keeps_image_blocks_of_a_user_message(tmp_path, monkeypatch):
    monkeypatch.setenv("HOME", str(tmp_path))
    project = tmp_path / ".claude" / "projects" / "-workspace"
    project.mkdir(parents=True)
    entries = [
        {"type": "user", "cwd": "/workspace", "message": {"role": "user", "content": "plain question"}},
        {"type": "user", "message": image_message()},
        {"type": "assistant", "message": {"role": "assistant", "content": [
            {"type": "text", "text": "Looks like a chart."},
            {"type": "tool_use", "id": "t1", "name": "Read", "input": {"path": "a"}},
        ]}},
        {"type": "user", "message": {"role": "user", "content": [
            {"type": "tool_result", "tool_use_id": "t1", "content": "ok"},
        ]}},
    ]
    (project / "s1.jsonl").write_text("\n".join(json.dumps(e) for e in entries) + "\n")

    history = run(get_session_history("s1", cwd="/workspace"))
    msgs = [{k: v for k, v in m.items() if k not in ("timestamp", "uuid")} for m in history["messages"]]

    assert msgs == [
        {"role": "user", "content": "plain question"},
        {"role": "user", "content": image_message()["content"]},
        {"role": "assistant", "content": "Looks like a chart."},
        {"type": "tool_use", "role": "assistant", "tool_name": "Read", "tool_input": {"path": "a"}, "tool_use_id": "t1"},
        {"type": "tool_result", "role": "user", "tool_use_id": "t1", "content": "ok", "is_error": False},
    ]
