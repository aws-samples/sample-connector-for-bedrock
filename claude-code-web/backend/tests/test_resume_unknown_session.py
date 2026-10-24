"""Resuming a session id without a transcript answers 404 before the CLI starts."""

import asyncio

import pytest
from fastapi import HTTPException

from backend.core import session_manager as session_manager_module
from backend.core.session_manager import SessionManager

SESSION_ID = "16417aa7-ed14-4934-9de9-5b16c5847456"


@pytest.fixture
def manager(tmp_path, monkeypatch):
    monkeypatch.setenv("HOME", str(tmp_path))
    connects = []

    class FakeSession:
        def __init__(self, session_id, *args):
            self.session_id = session_id

        async def connect(self, resume_session_id=None):
            connects.append(resume_session_id)

    monkeypatch.setattr(session_manager_module, "AgentSession", FakeSession)
    m = SessionManager()
    return m, tmp_path, connects


def write_transcript(home, session_id, project="-workspace"):
    project_dir = home / ".claude" / "projects" / project
    project_dir.mkdir(parents=True, exist_ok=True)
    (project_dir / f"{session_id}.jsonl").write_text('{"type":"user"}\n')


def create(m, resume_session_id=None):
    return asyncio.run(m.create_session(resume_session_id=resume_session_id))


def test_unknown_resume_id_is_404_without_connecting(manager):
    m, _, connects = manager
    with pytest.raises(HTTPException) as e:
        create(m, SESSION_ID)
    assert e.value.status_code == 404
    assert connects == []
    assert m.sessions == {}


def test_resume_id_with_path_characters_is_404(manager):
    m, home, connects = manager
    write_transcript(home, "x")
    for bad in ("../-workspace/x", "-workspace/x", "x.jsonl", "."):
        with pytest.raises(HTTPException) as e:
            create(m, bad)
        assert e.value.status_code == 404
    assert connects == []


def test_known_resume_id_connects(manager):
    m, home, connects = manager
    write_transcript(home, SESSION_ID)
    assert create(m, SESSION_ID) == SESSION_ID
    assert connects == [SESSION_ID]
    assert SESSION_ID in m.sessions


def test_new_session_does_not_need_a_transcript(manager):
    m, _, connects = manager
    session_id = create(m)
    assert connects == [None]
    assert session_id in m.sessions
