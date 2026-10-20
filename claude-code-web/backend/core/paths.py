"""Filesystem locations that depend on the runtime user's home directory."""

import os
from pathlib import Path


def claude_dir() -> Path:
    """Return ``~/.claude`` for the current user.

    Resolved at call time from ``HOME`` (falling back to the passwd entry), so the
    container's non-root ``node`` user gets ``/home/node/.claude`` and tests can
    monkeypatch ``HOME``.
    """
    return Path(os.path.expanduser("~")) / ".claude"


def mcp_config_path() -> Path:
    """Return the path of the MCP servers config file, ``~/.claude/mcp.json``."""
    return claude_dir() / "mcp.json"
