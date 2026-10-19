"""
Session Manager.

This module contains the SessionManager class which manages multiple
concurrent Claude Agent sessions, handling creation, restoration,
and cleanup operations.
"""

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from fastapi import HTTPException

from ..models import SessionInfo
from .session import AgentSession


# System message patterns to filter out from previews
SYSTEM_MESSAGE_PATTERNS = [
    r"^<command-name>",
    r"^<command-message>",
    r"^<command-args>",
    r"^<local-command-stdout>",
    r"^<system-reminder>",
    r"^Caveat:",
    r"^This session is being continued from a previous",
    r"^Invalid API key",
    r'^\{"subtasks":',
    r"CRITICAL: You MUST respond with ONLY a JSON",
    r"^Warmup$",
]

# Compiled regex for performance
SYSTEM_MESSAGE_REGEX = re.compile("|".join(SYSTEM_MESSAGE_PATTERNS))


def _is_system_message(content: str) -> bool:
    """Check if a message content is a system message that should be filtered."""
    if not content:
        return False
    return bool(SYSTEM_MESSAGE_REGEX.search(content))


def _extract_text_content(content: Any) -> Optional[str]:
    """Extract text content from various message content formats."""
    if isinstance(content, str):
        return content
    if isinstance(content, list) and len(content) > 0:
        first_block = content[0]
        if isinstance(first_block, dict):
            return first_block.get("text", "")
        if isinstance(first_block, str):
            return first_block
    return None


def _parse_jsonl_sessions(file_path: Path) -> dict[str, Any]:
    """
    Parse a JSONL session file and extract session metadata.

    Returns a dict with:
        - session_id: str
        - summary: str
        - message_count: int
        - last_activity: datetime
        - cwd: str
        - last_user_message: str
        - last_assistant_message: str
        - first_user_msg_uuid: str (for timeline grouping)
        - entries: list (raw entries for grouping)
    """
    sessions: dict[str, dict] = {}
    entries: list[dict] = []
    pending_summaries: dict[str, str] = {}  # leafUuid -> summary

    try:
        with open(file_path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue

                try:
                    entry = json.loads(line)
                    entries.append(entry)

                    # Handle summary entries without sessionId
                    if entry.get("type") == "summary" and entry.get("summary") and not entry.get("sessionId") and entry.get("leafUuid"):
                        pending_summaries[entry["leafUuid"]] = entry["summary"]

                    session_id = entry.get("sessionId")
                    if not session_id:
                        continue

                    if session_id not in sessions:
                        sessions[session_id] = {
                            "id": session_id,
                            "summary": "New Session",
                            "message_count": 0,
                            "last_activity": datetime.now(timezone.utc),
                            "cwd": entry.get("cwd", ""),
                            "last_user_message": None,
                            "last_assistant_message": None,
                            "first_user_msg_uuid": None,
                            "parent_uuid": None,
                        }

                    session = sessions[session_id]

                    # Apply pending summary if parentUuid matches
                    if session["summary"] == "New Session" and entry.get("parentUuid") and entry["parentUuid"] in pending_summaries:
                        session["summary"] = pending_summaries[entry["parentUuid"]]

                    # Update summary from summary entries
                    if entry.get("type") == "summary" and entry.get("summary"):
                        session["summary"] = entry["summary"]

                    # Track messages
                    msg = entry.get("message", {})
                    role = msg.get("role")
                    content = msg.get("content")

                    if role == "user" and content:
                        text_content = _extract_text_content(content)
                        if text_content and not _is_system_message(text_content):
                            session["last_user_message"] = text_content
                            # Track first user message UUID for timeline grouping
                            if entry.get("parentUuid") is None and entry.get("uuid"):
                                if not session["first_user_msg_uuid"]:
                                    session["first_user_msg_uuid"] = entry["uuid"]

                    elif role == "assistant" and content:
                        # Skip API error messages
                        if entry.get("isApiErrorMessage"):
                            continue
                        text_content = _extract_text_content(content)
                        if text_content and not _is_system_message(text_content):
                            session["last_assistant_message"] = text_content

                    session["message_count"] += 1

                    if entry.get("timestamp"):
                        try:
                            session["last_activity"] = datetime.fromisoformat(
                                entry["timestamp"].replace("Z", "+00:00")
                            )
                        except (ValueError, AttributeError):
                            pass

                except json.JSONDecodeError:
                    continue

        # Set final summary based on messages if no summary exists
        for session in sessions.values():
            if session["summary"] == "New Session":
                last_msg = session["last_user_message"] or session["last_assistant_message"]
                if last_msg:
                    session["summary"] = last_msg[:50] + "..." if len(last_msg) > 50 else last_msg

        return {
            "sessions": list(sessions.values()),
            "entries": entries,
        }

    except Exception:
        return {"sessions": [], "entries": []}


class SessionManager:
    """
    Manages multiple concurrent Claude Agent sessions.

    Each session maintains its own SDK client, conversation history,
    and permission state. Supports session creation, restoration,
    and cleanup.
    """

    def __init__(self):
        """Initialize the session manager."""
        self.sessions: dict[str, AgentSession] = {}
        self.session_dir = Path.home() / ".claude" / "projects"

    @staticmethod
    def _is_anthropic_model(model: Optional[str]) -> bool:
        """
        Check if a model is from Anthropic/Claude.

        Args:
            model: Model name to check

        Returns:
            True if model is Anthropic/Claude, False otherwise
        """
        if not model:
            return True  # Default to Anthropic if no model specified
        model_lower = model.lower()
        return "anthropic" in model_lower or "claude" in model_lower

    async def create_session(
        self,
        user_id: Optional[str] = None,
        resume_session_id: Optional[str] = None,
        model: Optional[str] = None,
        background_model: Optional[str] = None,
        enable_proxy: bool = False,
        server_port: int = 8080,
        cwd: Optional[str] = None,
        mcp_server_ids: Optional[list[str]] = None,
    ) -> str:
        """
        Create a new session or resume an existing one.

        Args:
            user_id: User ID for S3 sync tracking
            resume_session_id: Optional session ID to resume
            model: Optional model name override
            background_model: Optional background model for agents
            enable_proxy: Enable LiteLLM proxy mode (deprecated - auto-detected from model)
            server_port: Server port for proxy mode
            cwd: Working directory for the session
            mcp_server_ids: List of MCP server names to enable

        Returns:
            The session ID (new or resumed)
        """
        session_id = resume_session_id or str(__import__("uuid").uuid4())

        if session_id in self.sessions:
            raise HTTPException(status_code=400, detail="Session already active")

        # Auto-detect if proxy is needed based on model names
        auto_enable_proxy = (
            not self._is_anthropic_model(model) or
            not self._is_anthropic_model(background_model)
        )

        # Use auto-detected value if enable_proxy is False (default)
        # Allow explicit True to override
        final_enable_proxy = enable_proxy or auto_enable_proxy

        print(f"[SessionManager] Model: {model}, Background: {background_model}")
        print(f"[SessionManager] Auto-detected proxy need: {auto_enable_proxy}")
        print(f"[SessionManager] Final enable_proxy: {final_enable_proxy}")

        session = AgentSession(
            session_id,
            user_id,
            model,
            background_model,
            final_enable_proxy,
            server_port,
            cwd,
            mcp_server_ids,
        )
        await session.connect(resume_session_id)

        self.sessions[session_id] = session

        if user_id:
            from .claude_sync_manager import get_claude_sync_manager
            sync_manager = get_claude_sync_manager()
            if sync_manager:
                sync_manager._synced_users.add(user_id)

                if cwd and cwd.startswith("/workspace/") and cwd != "/workspace":
                    project_name = cwd.replace("/workspace/", "")
                    if "/" not in project_name:
                        sync_manager.set_user_project(user_id, project_name)

        return session_id

    async def get_session(
        self,
        session_id: str,
        auto_resume: bool = True,
        user_id: Optional[str] = None,
        cwd: Optional[str] = None,
    ) -> AgentSession:
        """
        Get an active session by ID, optionally auto-resuming or creating if not in memory.

        Args:
            session_id: The session ID
            auto_resume: Whether to automatically resume/create session if not active (default: True)
            user_id: User ID for session creation (used when auto-resuming/creating)
            cwd: Working directory (used when creating new session)

        Returns:
            The AgentSession instance

        Raises:
            HTTPException: If session not found and auto_resume is disabled
        """
        # Check if session is already active in memory
        if session_id in self.sessions:
            return self.sessions[session_id]

        # Session not in memory
        if not auto_resume:
            raise HTTPException(status_code=404, detail="Session not found")

        # Try to find session file on disk for resumption
        print(f"[SessionManager] Session {session_id} not in memory, checking for session file...")

        session_file = None
        session_cwd = None

        if self.session_dir.exists():
            for project_dir in self.session_dir.iterdir():
                if not project_dir.is_dir():
                    continue

                potential_file = project_dir / f"{session_id}.jsonl"
                if potential_file.exists():
                    session_file = potential_file

                    # Try to extract cwd from session file
                    try:
                        parsed = _parse_jsonl_sessions(potential_file)
                        if parsed["sessions"]:
                            session_cwd = parsed["sessions"][0].get("cwd", "")
                    except Exception:
                        pass

                    break

        # If session file found, resume it
        if session_file:
            print(f"[SessionManager] ========== Auto-Resume Session ==========")
            print(f"[SessionManager] Found session file: {session_file}")
            print(f"[SessionManager] Session ID: {session_id}")
            print(f"[SessionManager] Extracted cwd from file: {session_cwd}")
            print(f"[SessionManager] Provided cwd parameter: {cwd}")
            print(f"[SessionManager] User ID: {user_id}")

            # Use cwd from session file, fallback to provided cwd parameter
            # If both are empty, infer cwd from session file path (project directory name)
            # Priority: session_cwd > provided cwd parameter > inferred from path
            resume_cwd = session_cwd if session_cwd else cwd

            if not resume_cwd:
                # Infer cwd from project directory name
                # Path format: ~/.claude/projects/{path_key}/{session_id}.jsonl
                # path_key format: cwd with "/" and "_" replaced by "-"
                # Example: -workspace-my-project -> /workspace/my-project
                project_dir_name = session_file.parent.name
                # Reverse the path_key transformation
                inferred_cwd = project_dir_name.replace("-", "/")
                resume_cwd = inferred_cwd
                print(f"[SessionManager] Inferred cwd from path: {inferred_cwd} (from project dir: {project_dir_name})")

            print(f"[SessionManager] Final cwd for resume: {resume_cwd}")

            # Calculate expected path_key for verification
            if resume_cwd:
                expected_path_key = resume_cwd.replace("/", "-").replace("_", "-")
                print(f"[SessionManager] Expected path_key: {expected_path_key}")
                print(f"[SessionManager] Actual project dir: {session_file.parent.name}")

            # Resume the session with minimal configuration
            import os
            print(f"[SessionManager] Calling create_session with resume_session_id={session_id}")
            resumed_session_id = await self.create_session(
                user_id=user_id,
                resume_session_id=session_id,
                model=os.environ.get("ANTHROPIC_MODEL"),
                background_model=None,
                enable_proxy=False,  # Default to no proxy
                server_port=8080,
                cwd=resume_cwd,
            )

            print(f"[SessionManager] ✓ Auto-resumed session: {resumed_session_id}")
            print(f"[SessionManager] ==========================================")
            return self.sessions[resumed_session_id]

        # No session file found, create new session with provided session_id
        print(f"[SessionManager] No session file found, creating new session with ID: {session_id}")

        # Create new AgentSession directly (not resuming, so don't use create_session with resume_session_id)
        import os

        # Check if session_id already in sessions (shouldn't happen, but safety check)
        if session_id in self.sessions:
            return self.sessions[session_id]

        session = AgentSession(
            session_id,
            user_id,
            os.environ.get("ANTHROPIC_MODEL"),
            None,  # background_model
            False,  # enable_proxy
            8080,  # server_port
            cwd,
        )

        # Connect without resume_session_id (creates new session)
        await session.connect(resume_session_id=None)

        self.sessions[session_id] = session

        # Track user sync
        if user_id:
            from .claude_sync_manager import get_claude_sync_manager
            sync_manager = get_claude_sync_manager()
            if sync_manager:
                sync_manager._synced_users.add(user_id)

                if cwd and cwd.startswith("/workspace/") and cwd != "/workspace":
                    project_name = cwd.replace("/workspace/", "")
                    if "/" not in project_name:
                        sync_manager.set_user_project(user_id, project_name)

        print(f"[SessionManager] ✓ Created new session: {session_id}")
        return self.sessions[session_id]

    def update_session_id(self, old_session_id: str, new_session_id: str):
        """
        Update session ID after SDK provides real session_id.

        Args:
            old_session_id: Old/temporary session ID
            new_session_id: New/real session ID from SDK

        Raises:
            HTTPException: If old session not found
        """
        if old_session_id not in self.sessions:
            raise HTTPException(status_code=404, detail=f"Session {old_session_id} not found")

        if new_session_id in self.sessions:
            # Already exists, nothing to do
            return

        # Move session from old key to new key
        session = self.sessions.pop(old_session_id)
        session.session_id = new_session_id  # Update session object's ID
        self.sessions[new_session_id] = session
        print(f"[SessionManager] Updated session ID: {old_session_id} → {new_session_id}")

    async def get_or_ensure_session(
        self,
        session_id: str,
        model: Optional[str] = None,
        mcp_server_ids: Optional[list[str]] = None,
    ) -> AgentSession:
        """
        Get session and ensure model and MCP servers match the request.

        If model or mcp_server_ids are provided and differ from current session,
        the session will be disconnected and reconnected with new configuration.
        Also checks if proxy mode needs to change based on model.

        Args:
            session_id: The session ID
            model: Optional model to ensure
            mcp_server_ids: Optional MCP server IDs to ensure

        Returns:
            The AgentSession instance with correct configuration

        Raises:
            HTTPException: If session not found
        """
        print(f"[SessionManager] ========== Session Config Check ==========")
        print(f"[SessionManager] Session ID: {session_id}")
        print(f"[SessionManager] Requested model: {model}")
        print(f"[SessionManager] Requested mcp_server_ids: {mcp_server_ids}")

        # Get the session (may auto-resume if not in memory)
        session = await self.get_session(session_id)

        print(f"[SessionManager] Current session model: {session.model}")
        print(f"[SessionManager] Current session background_model: {session.background_model}")
        print(f"[SessionManager] Current session enable_proxy: {session.enable_proxy}")
        print(f"[SessionManager] Current session mcp_server_ids: {session.mcp_server_ids}")

        needs_reconnect = False
        config_changes = []

        # Determine new model and background_model
        new_model = model if model else session.model
        new_background_model = session.background_model

        # Check if proxy mode needs to change based on new models
        new_proxy_needed = (
            not self._is_anthropic_model(new_model) or
            not self._is_anthropic_model(new_background_model)
        )

        if new_proxy_needed != session.enable_proxy:
            print(f"[SessionManager] ✗ Proxy mode change detected")
            config_changes.append(f"enable_proxy: {session.enable_proxy} → {new_proxy_needed}")
            session.enable_proxy = new_proxy_needed
            needs_reconnect = True

        # Check if model needs to be updated
        if model:
            if model != session.model:
                print(f"[SessionManager] ✗ Model mismatch detected")
                config_changes.append(f"model: {session.model} → {model}")
                session.model = model
                needs_reconnect = True
            else:
                print(f"[SessionManager] ✓ Model matches: {session.model}")
        else:
            print(f"[SessionManager] ○ No model specified in request (keeping current: {session.model})")

        # Check if MCP servers need to be updated
        if mcp_server_ids is not None:
            if mcp_server_ids != session.mcp_server_ids:
                print(f"[SessionManager] ✗ MCP servers mismatch detected")
                config_changes.append(f"mcp_servers: {session.mcp_server_ids} → {mcp_server_ids}")
                session.mcp_server_ids = mcp_server_ids
                needs_reconnect = True
            else:
                print(f"[SessionManager] ✓ MCP servers match: {session.mcp_server_ids}")
        else:
            print(f"[SessionManager] ○ No MCP servers specified in request (keeping current: {session.mcp_server_ids})")

        # Reconnect if configuration changed
        if needs_reconnect:
            print(f"[SessionManager] ⚠️  Configuration changed - reconnection required")
            print(f"[SessionManager] Changes:")
            for change in config_changes:
                print(f"[SessionManager]   - {change}")
            print(f"[SessionManager] Disconnecting old client...")

            # Disconnect old client
            await session.disconnect()

            print(f"[SessionManager] Reconnecting with new configuration...")

            # Reconnect with new configuration
            await session.connect(resume_session_id=session_id)

            print(f"[SessionManager] ✓ Session {session_id} reconnected successfully")
        else:
            print(f"[SessionManager] ✓ Configuration unchanged - using existing session")

        print(f"[SessionManager] ===============================================")

        return session

    async def update_mcp_servers(self, session_id: str, mcp_server_ids: list[str]) -> str:
        """
        Update MCP servers for an active session by recreating the SDK client.

        Args:
            session_id: The session ID to update
            mcp_server_ids: New list of MCP server names to enable

        Returns:
            The session ID

        Raises:
            HTTPException: If session not found
        """
        if session_id not in self.sessions:
            raise HTTPException(status_code=404, detail="Session not found")

        session = self.sessions[session_id]

        # Update MCP server IDs
        session.mcp_server_ids = mcp_server_ids

        # Disconnect old client
        await session.disconnect()

        # Reconnect with new MCP servers (this will reload MCP config and recreate client)
        await session.connect(resume_session_id=session_id)

        print(f"[SessionManager] Updated MCP servers for session {session_id}: {mcp_server_ids}")

        return session_id

    async def close_session(self, session_id: str):
        """
        Close and cleanup a session.

        Args:
            session_id: The session ID to close
        """
        if session_id in self.sessions:
            session = self.sessions[session_id]
            await session.disconnect()
            del self.sessions[session_id]

    def list_sessions(self, cwd: Optional[str] = None) -> list[SessionInfo]:
        """
        List all active sessions, optionally filtered by cwd.

        Args:
            cwd: Optional working directory to filter by

        Returns:
            List of SessionInfo objects
        """
        result = []
        for session_id, session in self.sessions.items():
            # Filter by cwd if provided
            if cwd and session.cwd != cwd:
                continue

            result.append(
                SessionInfo(
                    session_id=session_id,
                    created_at=session.created_at.isoformat(),
                    last_activity=session.last_activity.isoformat(),
                    status=session.status,
                    message_count=session.message_count,
                    cwd=session.cwd,
                )
            )
        return result

    def list_available_sessions(
        self,
        cwd: Optional[str] = None,
        limit: int = 20,
        offset: int = 0,
        group_timelines: bool = True,
    ) -> dict[str, Any]:
        """
        List all available sessions (both active in-memory and persisted on disk),
        optionally filtered by cwd, with pagination and timeline grouping support.

        Timeline grouping merges multiple sessions that share the same first user message
        (i.e., sessions that were resumed from the same conversation) into a single entry,
        showing only the most recent one.

        Args:
            cwd: Optional working directory to filter by.
            limit: Maximum number of sessions to return (default: 20).
            offset: Number of sessions to skip for pagination (default: 0).
            group_timelines: Whether to group sessions by timeline (default: True).

        Returns:
            Dict with:
                - sessions: List of session information dictionaries
                - has_more: Whether there are more sessions available
                - total: Total number of sessions (after grouping)
                - offset: Current offset
                - limit: Current limit
        """
        all_sessions: dict[str, dict] = {}  # session_id -> session data
        all_entries: list[dict] = []
        session_ids_seen: set[str] = set()

        # First, add active in-memory sessions
        for session_id, session in self.sessions.items():
            if cwd and session.cwd != cwd:
                continue

            if session_id.startswith("agent-"):
                continue

            path_key = session.cwd.replace("/", "-").replace("_", "-") if session.cwd else "default"

            # Try to parse session file for metadata
            session_file_path = self.session_dir / path_key / f"{session_id}.jsonl"
            session_data = {
                "id": session_id,
                "summary": "Active session",
                "message_count": session.message_count,
                "last_activity": session.last_activity,
                "cwd": session.cwd or "",
                "last_user_message": None,
                "last_assistant_message": None,
                "first_user_msg_uuid": None,
                "project": path_key,
                "active": True,
            }

            if session_file_path.exists():
                parsed = _parse_jsonl_sessions(session_file_path)
                for s in parsed["sessions"]:
                    if s["id"] == session_id:
                        session_data.update({
                            "summary": s["summary"],
                            "message_count": s["message_count"],
                            "last_activity": s["last_activity"],
                            "last_user_message": s["last_user_message"],
                            "last_assistant_message": s["last_assistant_message"],
                            "first_user_msg_uuid": s["first_user_msg_uuid"],
                        })
                        break
                all_entries.extend(parsed["entries"])

            all_sessions[session_id] = session_data
            session_ids_seen.add(session_id)

        # Then, scan persisted sessions from disk
        if self.session_dir.exists():
            if cwd:
                path_key = cwd.replace("/", "-").replace("_", "-")
                project_dirs = [self.session_dir / path_key]
            else:
                project_dirs = list(self.session_dir.iterdir())

            # Sort by modification time (newest first) for early exit optimization
            project_dirs_with_mtime = []
            for pd in project_dirs:
                if pd.exists() and pd.is_dir():
                    try:
                        mtime = pd.stat().st_mtime
                        project_dirs_with_mtime.append((pd, mtime))
                    except Exception:
                        project_dirs_with_mtime.append((pd, 0))

            project_dirs_with_mtime.sort(key=lambda x: x[1], reverse=True)

            for project_dir, _ in project_dirs_with_mtime:
                # Get all jsonl files sorted by mtime
                session_files = []
                for sf in project_dir.glob("*.jsonl"):
                    try:
                        session_files.append((sf, sf.stat().st_mtime))
                    except Exception:
                        continue

                session_files.sort(key=lambda x: x[1], reverse=True)

                for session_file, _ in session_files:
                    session_id = session_file.stem

                    if session_id in session_ids_seen:
                        continue

                    if session_id.startswith("agent-"):
                        continue

                    parsed = _parse_jsonl_sessions(session_file)
                    all_entries.extend(parsed["entries"])

                    for s in parsed["sessions"]:
                        if s["id"] not in all_sessions:
                            all_sessions[s["id"]] = {
                                **s,
                                "project": project_dir.name,
                                "active": False,
                            }

                    session_ids_seen.add(session_id)

                    # Early exit optimization
                    if len(all_sessions) >= (limit + offset) * 2:
                        break

        # Timeline grouping: group sessions by first user message UUID
        if group_timelines:
            session_groups: dict[str, dict] = {}  # first_user_msg_uuid -> group data
            session_to_group: dict[str, str] = {}  # session_id -> first_user_msg_uuid

            for session_id, session in all_sessions.items():
                first_uuid = session.get("first_user_msg_uuid")
                if not first_uuid:
                    # No first user message UUID, treat as standalone
                    continue

                if first_uuid not in session_groups:
                    session_groups[first_uuid] = {
                        "latest_session": session,
                        "all_sessions": [session],
                    }
                else:
                    group = session_groups[first_uuid]
                    group["all_sessions"].append(session)

                    # Update latest if this session is more recent
                    if session["last_activity"] > group["latest_session"]["last_activity"]:
                        group["latest_session"] = session

                session_to_group[session_id] = first_uuid

            # Build final session list
            grouped_session_ids: set[str] = set()
            for group in session_groups.values():
                for s in group["all_sessions"]:
                    grouped_session_ids.add(s["id"])

            # Sessions from groups (only show latest)
            visible_sessions = []
            for first_uuid, group in session_groups.items():
                session = {**group["latest_session"]}
                if len(group["all_sessions"]) > 1:
                    session["is_grouped"] = True
                    session["group_size"] = len(group["all_sessions"])
                    session["group_sessions"] = [s["id"] for s in group["all_sessions"]]
                visible_sessions.append(session)

            # Add standalone sessions (not in any group)
            for session_id, session in all_sessions.items():
                if session_id not in grouped_session_ids:
                    visible_sessions.append(session)
        else:
            visible_sessions = list(all_sessions.values())

        # Filter out sessions with JSON-like summaries (Task Master errors)
        visible_sessions = [
            s for s in visible_sessions
            if not s.get("summary", "").startswith('{ "')
        ]

        # Sort by last activity (newest first)
        visible_sessions.sort(
            key=lambda x: x["last_activity"] if isinstance(x["last_activity"], datetime)
            else datetime.fromisoformat(str(x["last_activity"]).replace("Z", "+00:00")),
            reverse=True
        )

        total = len(visible_sessions)
        paginated = visible_sessions[offset:offset + limit]
        has_more = offset + limit < total

        # Format output
        result_sessions = []
        for s in paginated:
            last_activity = s["last_activity"]
            if isinstance(last_activity, datetime):
                modified = last_activity.isoformat()
            else:
                modified = str(last_activity)

            result = {
                "session_id": s["id"],
                "modified": modified,
                "preview": s.get("summary", "No preview")[:100],
                "project": s.get("project", ""),
                "message_count": s.get("message_count", 0),
                "first_message": (s.get("last_user_message") or "")[:100] if s.get("last_user_message") else None,
                "active": s.get("active", False),
                "cwd": s.get("cwd", ""),
            }

            # Add grouping metadata if present
            if s.get("is_grouped"):
                result["is_grouped"] = True
                result["group_size"] = s["group_size"]
                result["group_sessions"] = s["group_sessions"]

            result_sessions.append(result)

        return {
            "sessions": result_sessions,
            "has_more": has_more,
            "total": total,
            "offset": offset,
            "limit": limit,
        }
