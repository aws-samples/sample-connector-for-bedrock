"""
Session Management Endpoints.

Provides REST API endpoints for session CRUD operations including
creating, listing, and closing sessions.
"""

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException

from ..core import SessionManager
from ..models import (
    CreateSessionRequest,
    CreateSessionResponse,
    ListSessionsResponse,
)

router = APIRouter()


def get_session_manager() -> SessionManager:
    """Get the global session manager instance."""
    from ..server import session_manager

    return session_manager


@router.post("/sessions", response_model=CreateSessionResponse)
async def create_session(request: CreateSessionRequest):
    """
    Create a new session or resume an existing one.

    Args:
        request: Session creation request

    Returns:
        Session information with placeholder session_id for new sessions
    """
    manager = get_session_manager()
    internal_session_id = await manager.create_session(
        user_id=request.user_id,
        resume_session_id=request.resume_session_id,
        model=request.model,
        background_model=request.background_model,
        enable_proxy=request.enable_proxy,
        server_port=8080,  # Using hardcoded port from uvicorn.run
        cwd=request.cwd,
        mcp_server_ids=request.mcp_server_ids,
    )

    # Return internal session ID (UUID for new sessions, actual ID for resumed)
    # Client can immediately use this for API calls
    # When SDK provides real session_id, both backend and frontend will update
    return CreateSessionResponse(
        session_id=internal_session_id,
        created_at=datetime.now(timezone.utc).isoformat(),
        status="connected",
    )


@router.get("/sessions", response_model=ListSessionsResponse)
async def list_sessions(cwd: Optional[str] = None):
    """
    List all active sessions, optionally filtered by cwd.

    Args:
        cwd: Optional working directory to filter by

    Returns:
        List of active sessions
    """
    manager = get_session_manager()
    sessions = manager.list_sessions(cwd=cwd)
    return ListSessionsResponse(sessions=sessions)


@router.get("/sessions/available")
async def list_available_sessions(
    cwd: Optional[str] = None,
    limit: int = 20,
    offset: int = 0,
    group_timelines: bool = True,
):
    """
    List all available sessions from disk, optionally filtered by cwd.

    Supports pagination and timeline grouping (merging resumed sessions).

    Args:
        cwd: Optional working directory to filter by.
        limit: Maximum number of sessions to return (default: 20).
        offset: Number of sessions to skip for pagination (default: 0).
        group_timelines: Whether to group resumed sessions by timeline (default: True).
            When True, multiple sessions that share the same first user message
            (i.e., sessions resumed from the same conversation) are merged into
            a single entry showing only the most recent one.

    Returns:
        Dict with:
            - sessions: List of session information
            - has_more: Whether there are more sessions available
            - total: Total number of sessions (after grouping)
            - offset: Current offset
            - limit: Current limit

        Each session includes:
            - session_id: Unique session identifier
            - modified: Last activity timestamp (ISO format)
            - preview: Session summary or first message preview
            - project: Project directory key
            - message_count: Number of messages in session
            - first_message: First user message (truncated)
            - active: Whether session is currently active in-memory
            - cwd: Working directory path
            - is_grouped: (optional) True if this session represents a group
            - group_size: (optional) Number of sessions in the group
            - group_sessions: (optional) List of all session IDs in the group
    """
    manager = get_session_manager()
    return manager.list_available_sessions(
        cwd=cwd,
        limit=limit,
        offset=offset,
        group_timelines=group_timelines,
    )


@router.get("/sessions/{session_id}/history")
async def get_session_history(session_id: str, cwd: Optional[str] = None):
    """
    Get the conversation history for a session from disk.

    Args:
        session_id: The session ID
        cwd: Optional current working directory to locate the session file

    Returns:
        Session history with messages and metadata
    """
    base_dir = Path.home() / ".claude" / "projects"

    # Find the session file
    session_file = None

    # If cwd is provided, try to find it directly
    if cwd:
        path_key = cwd.replace("/", "-").replace("_", "-")
        potential_file = base_dir / path_key / f"{session_id}.jsonl"
        if potential_file.exists():
            session_file = potential_file

    # If not found, search all project directories
    if not session_file:
        for project_dir in base_dir.iterdir():
            if not project_dir.is_dir():
                continue
            potential_file = project_dir / f"{session_id}.jsonl"
            if potential_file.exists():
                session_file = potential_file
                break

    if not session_file:
        raise HTTPException(status_code=404, detail="Session history not found")

    try:
        messages = []
        metadata = {
            "session_id": session_id,
            "cwd": None,
            "git_branch": None,
            "version": None,
        }

        with open(session_file, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue

                try:
                    entry = json.loads(line)
                    entry_type = entry.get("type")

                    # Extract metadata from first entry
                    if not metadata["cwd"]:
                        metadata["cwd"] = entry.get("cwd")
                        metadata["git_branch"] = entry.get("gitBranch")
                        metadata["version"] = entry.get("version")

                    # Process user and assistant messages
                    if entry_type in ["user", "assistant"]:
                        msg_data = entry.get("message", {})
                        role = msg_data.get("role")
                        content = msg_data.get("content")

                        # Handle different content formats
                        if isinstance(content, str):
                            # Simple text message
                            messages.append(
                                {
                                    "role": role,
                                    "content": content,
                                    "timestamp": entry.get("timestamp"),
                                    "uuid": entry.get("uuid"),
                                }
                            )
                        elif isinstance(content, list):
                            # Content blocks - process each separately
                            for block in content:
                                if isinstance(block, dict):
                                    block_type = block.get("type")

                                    if block_type == "text":
                                        # Regular text block
                                        messages.append(
                                            {
                                                "role": role,
                                                "content": block.get("text", ""),
                                                "timestamp": entry.get("timestamp"),
                                                "uuid": entry.get("uuid"),
                                            }
                                        )
                                    elif block_type == "tool_use":
                                        # Tool use block
                                        messages.append(
                                            {
                                                "type": "tool_use",
                                                "role": role,
                                                "tool_name": block.get("name"),
                                                "tool_input": block.get("input"),
                                                "tool_use_id": block.get("id"),
                                                "timestamp": entry.get("timestamp"),
                                                "uuid": entry.get("uuid"),
                                            }
                                        )
                                    elif block_type == "tool_result":
                                        # Tool result block
                                        messages.append(
                                            {
                                                "type": "tool_result",
                                                "role": role,
                                                "tool_use_id": block.get("tool_use_id"),
                                                "content": block.get("content"),
                                                "is_error": block.get("is_error", False),
                                                "timestamp": entry.get("timestamp"),
                                                "uuid": entry.get("uuid"),
                                            }
                                        )
                                elif isinstance(block, str):
                                    # String block
                                    messages.append(
                                        {
                                            "role": role,
                                            "content": block,
                                            "timestamp": entry.get("timestamp"),
                                            "uuid": entry.get("uuid"),
                                        }
                                    )
                        else:
                            # Unknown format, convert to string
                            messages.append(
                                {
                                    "role": role,
                                    "content": str(content),
                                    "timestamp": entry.get("timestamp"),
                                    "uuid": entry.get("uuid"),
                                }
                            )

                except json.JSONDecodeError:
                    continue

        return {
            "metadata": metadata,
            "messages": messages,
            "message_count": len(messages),
        }

    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to read session history: {str(e)}"
        )


@router.get("/sessions/{session_id}/server_info")
async def get_server_info(session_id: str):
    """
    Get server initialization info for a session.

    Args:
        session_id: The session ID

    Returns:
        Server info dictionary with commands, output styles, etc.
    """
    manager = get_session_manager()
    session = await manager.get_session(session_id)
    info = await session.get_server_info()
    return info


@router.delete("/sessions/{session_id}")
async def close_session(session_id: str):
    """
    Close a session.

    Args:
        session_id: The session ID

    Returns:
        Success message
    """
    manager = get_session_manager()
    await manager.close_session(session_id)
    return {"status": "closed"}


@router.post("/sessions/close_all")
async def close_all_sessions(cwd: Optional[str] = None):
    """
    Close all active sessions, optionally filtered by cwd.

    Args:
        cwd: Optional working directory to filter sessions

    Returns:
        Number of sessions closed
    """
    manager = get_session_manager()

    # Get all sessions (filtered by cwd if provided)
    sessions = manager.list_sessions(cwd=cwd)

    # Close each session
    closed_count = 0
    for session_info in sessions:
        try:
            await manager.close_session(session_info.session_id)
            closed_count += 1
        except Exception as e:
            # Log error but continue closing other sessions
            print(f"Failed to close session {session_info.session_id}: {e}")

    return {"status": "success", "closed_count": closed_count}
