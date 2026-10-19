"""
Agent Session Management.

This module contains the AgentSession class which represents a single
interactive session with the Claude Agent SDK, managing the client
connection, permission callbacks, and conversation state.
"""

import asyncio
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from fastapi import HTTPException

from claude_agent_sdk import (
    AssistantMessage,
    ClaudeAgentOptions,
    ClaudeSDKClient,
    CLIConnectionError,
    CLINotFoundError,
    PermissionResultAllow,
    PermissionResultDeny,
    ResultMessage,
    SystemMessage,
    TextBlock,
    ToolPermissionContext,
    ToolUseBlock,
    UserMessage,
)

from ..models import MessageBlock, PermissionRequest, SendMessageResponse, SessionStatus


def load_custom_system_prompt() -> Optional[str]:
    """
    Load custom system prompt from backend/claude_system_prompt.md.

    Returns:
        The content of the file if it exists, None otherwise.
    """
    try:
        # Get the backend directory path
        backend_dir = Path(__file__).parent.parent
        prompt_file = backend_dir / "claude_system_prompt.md"

        if prompt_file.exists():
            with open(prompt_file, encoding="utf-8") as f:
                content = f.read().strip()
                if content:
                    return content
    except Exception as e:
        # Log error but don't fail session creation
        import logging
        logging.warning(f"Failed to load custom system prompt: {e}")

    return None


class AgentSession:
    """
    Represents a single Claude Agent session.

    Manages the SDK client, permission callbacks, and conversation state
    for one interactive session.
    """

    def __init__(
        self,
        session_id: str,
        user_id: Optional[str] = None,
        model: Optional[str] = None,
        background_model: Optional[str] = None,
        enable_proxy: bool = False,
        server_port: int = 8080,
        cwd: Optional[str] = None,
        mcp_server_ids: Optional[list[str]] = None,
    ):
        """
        Initialize an agent session.

        Args:
            session_id: Unique session identifier
            user_id: User ID for S3 sync tracking
            model: Optional model name (defaults to ANTHROPIC_MODEL env var)
            background_model: Optional background model for agents
            enable_proxy: Enable LiteLLM proxy mode (sets ANTHROPIC_BASE_URL)
            server_port: Server port for proxy mode (default: 8000)
            cwd: Working directory for the session
            mcp_server_ids: List of MCP server names to enable
        """
        self.session_id = session_id
        self.user_id = user_id
        self.client: Optional[ClaudeSDKClient] = None
        self.created_at = datetime.now(timezone.utc)
        self.last_activity = datetime.now(timezone.utc)
        self.status = "initializing"
        self.message_count = 0

        # Permission management
        self.pending_permission: Optional[dict[str, Any]] = None
        self.permission_event: Optional[asyncio.Event] = None
        self.permission_result: Optional[Any] = None
        self.permission_queue: asyncio.Queue = asyncio.Queue()  # Queue for permission events

        # Session configuration
        self.cwd = cwd
        # Model: use provided, or env var, or None (SDK default)
        self.model = model or os.environ.get("ANTHROPIC_MODEL")
        self.background_model = background_model  # Background model for agents
        self.current_model = self.model  # Track current model for status

        # Proxy configuration
        self.enable_proxy = enable_proxy
        self.server_port = server_port

        # MCP servers configuration
        self.mcp_server_ids = mcp_server_ids or []

        # Server info cache
        self.server_info: Optional[dict[str, Any]] = None

    async def connect(self, resume_session_id: Optional[str] = None):
        """
        Connect the SDK client and initialize the session.

        Args:
            resume_session_id: Optional session ID to resume from
        """
        print(f"\n[Session] {'Resuming' if resume_session_id else 'Creating'} session {self.session_id}")
        print(f"[Session] user_id: {self.user_id}")
        print(f"[Session] cwd: {self.cwd}")
        print(f"[Session] model: {self.model}")
        print(f"[Session] background_model: {self.background_model}")
        print(f"[Session] enable_proxy: {self.enable_proxy}")
        if resume_session_id:
            print(f"[Session] resume_session_id: {resume_session_id}")

        # Load custom system prompt from file
        custom_prompt = load_custom_system_prompt()

        # Build system prompt configuration
        # Use preset (Claude Code default) with custom append if available
        if custom_prompt:
            system_prompt_config = {
                "type": "preset",
                "preset": "claude_code",
                "append": custom_prompt,
            }
        else:
            # Use preset without custom append
            system_prompt_config = {
                "type": "preset",
                "preset": "claude_code",
            }

        # Configure allowed tools from environment variable
        # Default: all tools enabled
        default_tools = [
            # Core file operations
            "Read", "Write", "Edit",
            # Code search and navigation
            "Glob", "Grep",
            # Shell execution
            "Bash",
            # Notebook editing
            "NotebookEdit",
            # Web fetching
            "WebFetch",
            # Task management
            "Task", "TodoWrite",
            # Bash output and shell management
            "BashOutput", "KillShell",
            # User interaction
            "AskUserQuestion",
            # Skills and commands
            "Skill", "SlashCommand",
            # Plan mode
            "ExitPlanMode",
            # MCP resources
            "ListMcpResourcesTool", "ReadMcpResourceTool",
            # Note: MCP tools (mcp__*) are auto-allowed in permission_callback
        ]

        # Read from environment variable (comma-separated list)
        allowed_tools_env = os.environ.get("ALLOWED_TOOLS", "").strip()
        if allowed_tools_env:
            allowed_tools = [tool.strip() for tool in allowed_tools_env.split(",") if tool.strip()]
        else:
            allowed_tools = default_tools

        options_dict = {
            "allowed_tools": allowed_tools,
            "system_prompt": system_prompt_config,
            "max_turns": 0,
            "can_use_tool": self.permission_callback,
            "permission_mode": "default",
        }

        if resume_session_id:
            # SDK expects just the session ID, not the full path
            options_dict["resume"] = resume_session_id

        if self.model:
            options_dict["model"] = self.model

        if self.cwd:
            options_dict["cwd"] = self.cwd

        # Build environment variables
        env_vars = {}

        # Enable proxy mode by setting ANTHROPIC_BASE_URL
        if self.enable_proxy:
            env_vars["ANTHROPIC_BASE_URL"] = f"http://127.0.0.1:{self.server_port}"
            # Disable Bedrock when using proxy mode
            env_vars["CLAUDE_CODE_USE_BEDROCK"] = "0"
            # Add placeholder API key (not actually used, just a placeholder)
            env_vars["ANTHROPIC_AUTH_TOKEN"] = "placeholder"

            # Set main model if specified
            if self.model:
                env_vars["ANTHROPIC_MODEL"] = self.model

            # If a background model is specified, set it as the default Haiku model for agents
            if self.background_model:
                env_vars["ANTHROPIC_DEFAULT_HAIKU_MODEL"] = self.background_model

        # Add env vars if any were set
        if env_vars:
            options_dict["env"] = env_vars
            print(f"[Session] Environment variables set:")
            for key, value in env_vars.items():
                print(f"[Session]   {key}={value}")
        else:
            print(f"[Session] No custom environment variables")

        # Load MCP servers if specified
        mcp_servers = {}
        if self.mcp_server_ids:
            print(f"[Session] Loading MCP servers: {self.mcp_server_ids}")
            mcp_servers = await self._load_mcp_servers()
            if mcp_servers:
                options_dict["mcp_servers"] = mcp_servers
                print(f"[Session] Loaded {len(mcp_servers)} MCP server(s)")
            else:
                print(f"[Session] No MCP servers loaded (config not found or invalid)")

        # Print SDK options for debugging
        print(f"[Session] ========== SDK Connection Options ==========")
        print(f"[Session] allowed_tools: {options_dict.get('allowed_tools', [])}")
        print(f"[Session] model: {options_dict.get('model', 'default')}")
        print(f"[Session] cwd: {options_dict.get('cwd', 'None')}")
        print(f"[Session] resume: {options_dict.get('resume', 'None (new session)')}")
        print(f"[Session] permission_mode: {options_dict.get('permission_mode', 'default')}")
        print(f"[Session] max_turns: {options_dict.get('max_turns', 0)}")
        print(f"[Session] system_prompt: {options_dict.get('system_prompt', {})}")
        if mcp_servers:
            print(f"[Session] mcp_servers count: {len(mcp_servers)}")
            print(f"[Session] mcp_servers names: {list(mcp_servers.keys())}")
            print(f"[Session] mcp_servers full config:")
            import json
            for name, config in mcp_servers.items():
                print(f"[Session]   {name}: {json.dumps(config, indent=4)}")
        else:
            print(f"[Session] mcp_servers: None")
        if env_vars:
            print(f"[Session] env vars: {list(env_vars.keys())}")
            for key, value in env_vars.items():
                # Mask sensitive values
                masked_value = value if len(value) < 20 else value[:10] + "..." + value[-5:]
                print(f"[Session]   {key}={masked_value}")
        else:
            print(f"[Session] env vars: None")
        print(f"[Session] setting_sources: ['user']")
        print(f"[Session] ===============================================")

        # Add setting_sources to load user plugins
        options_dict["setting_sources"] = ["user"]

        options = ClaudeAgentOptions(**options_dict)

        try:
            print(f"[Session] Connecting to Claude SDK...")
            self.client = ClaudeSDKClient(options=options)
            await self.client.connect()
            self.status = "connected"
            print(f"[Session] ✓ Connected successfully")
        except (CLINotFoundError, CLIConnectionError) as e:
            self.status = "error"
            raise HTTPException(status_code=500, detail=f"Failed to connect: {str(e)}")

    async def _load_mcp_servers(self) -> dict[str, Any]:
        """
        Load MCP servers configuration from /root/.claude/mcp.json.

        Returns:
            Dictionary of MCP server configurations keyed by server name
        """
        import json
        from pathlib import Path

        mcp_config_path = "/root/.claude/mcp.json"
        config_file = Path(mcp_config_path)

        if not config_file.exists():
            print(f"[Session] MCP config file not found: {mcp_config_path}")
            return {}

        try:
            with open(config_file, 'r') as f:
                config_data = json.load(f)

            all_servers = config_data.get('mcpServers', {})
            mcp_servers = {}

            # Build MCP servers dict for selected server IDs
            for server_name in self.mcp_server_ids:
                if server_name not in all_servers:
                    print(f"[Session] Warning: MCP server '{server_name}' not found in config")
                    continue

                server_config = all_servers[server_name]
                connection_type = server_config.get('type', 'stdio')

                if connection_type == 'stdio':
                    command = server_config.get('command')
                    args = server_config.get('args', [])
                    env = server_config.get('env', {})

                    mcp_servers[server_name] = {
                        "type": "stdio",
                        "command": command,
                        "args": args,
                        "env": env,
                    }

                    print(f"[Session] Configured MCP server '{server_name}':")
                    print(f"[Session]   Type: stdio")
                    print(f"[Session]   Command: {command}")
                    print(f"[Session]   Args: {args}")
                    if env:
                        print(f"[Session]   Env vars: {list(env.keys())}")

                elif connection_type == 'sse':
                    url = server_config.get('url')
                    mcp_servers[server_name] = {
                        "type": "sse",
                        "url": url,
                    }
                    print(f"[Session] Configured MCP server '{server_name}' (sse): {url}")

                elif connection_type == 'http':
                    url = server_config.get('url')
                    mcp_servers[server_name] = {
                        "type": "http",
                        "url": url,
                    }
                    print(f"[Session] Configured MCP server '{server_name}' (http): {url}")

                else:
                    print(f"[Session] Warning: Unknown MCP server type '{connection_type}' for '{server_name}'")

            return mcp_servers

        except json.JSONDecodeError as e:
            print(f"[Session] Error: Invalid JSON in MCP config file: {str(e)}")
            return {}
        except Exception as e:
            print(f"[Session] Error loading MCP servers: {str(e)}")
            return {}

    async def disconnect(self):
        """Disconnect the SDK client and cleanup."""
        if self.client:
            try:
                await self.client.disconnect()
            except RuntimeError as e:
                # Handle anyio TaskGroup exit in different task error
                # This can happen when closing sessions due to asyncio event loop differences
                if "cancel scope" in str(e) or "different task" in str(e):
                    # Log the error but don't fail - the session is being closed anyway
                    import logging

                    logging.warning(
                        f"Session {self.session_id}: Disconnect cleanup error (non-fatal): {e}"
                    )
                else:
                    raise
            finally:
                self.status = "disconnected"

    async def permission_callback(
        self, tool_name: str, input_data: dict, context: ToolPermissionContext
    ) -> PermissionResultAllow | PermissionResultDeny:
        """
        Permission callback for tool usage.

        This method is called by the SDK when a tool needs permission.
        It creates a pending permission request and waits for the client
        to respond via the API.

        Args:
            tool_name: Name of the tool requesting permission
            input_data: Tool input parameters
            context: Permission context with suggestions

        Returns:
            Permission result (allow or deny)
        """
        print(f"\n[Permission] ========== permission_callback ==========")
        print(f"[Permission] tool_name: {tool_name}")
        print(f"[Permission] input_data: {input_data}")
        print(f"[Permission] suggestions count: {len(context.suggestions)}")

        # Auto-allow all MCP tools (tools from MCP servers)
        if tool_name.startswith("mcp__"):
            print(f"[Permission] ✓ Auto-allow MCP tool: {tool_name}")
            return PermissionResultAllow()

        # Auto-allow operations based on environment variable
        # Default: auto-allow most tools (only require permission for destructive operations)
        auto_allow_tools_env = os.environ.get("AUTO_ALLOW_TOOLS", "").strip()
        if auto_allow_tools_env:
            auto_allow_tools = [tool.strip() for tool in auto_allow_tools_env.split(",") if tool.strip()]
        else:
            # Default auto-allow list (most common tools)
            auto_allow_tools = [
                # File operations
                "Read", "Write", "Edit", "NotebookEdit",
                # Search operations
                "Glob", "Grep",
                # Shell execution
                "Bash", "KillShell",
                # Read-only external tools
                "WebSearch", "WebFetch",
                # Task management
                "Task", "TaskOutput", "TodoWrite",
                # User interaction
                "AskUserQuestion",
                # Plan mode
                "EnterPlanMode", "ExitPlanMode",
                # Skills
                "Skill",
            ]

        if tool_name in auto_allow_tools:
            print(f"[Permission] ✓ Auto-allow core tool: {tool_name}")
            return PermissionResultAllow()

        # Create permission request
        print(f"[Permission] ⚠ Requesting user approval for: {tool_name}")
        request_id = str(uuid.uuid4())
        self.pending_permission = {
            "request_id": request_id,
            "tool_name": tool_name,
            "tool_input": input_data,
            "suggestions": [
                s.__dict__ if hasattr(s, "__dict__") else s for s in context.suggestions
            ],
        }

        # Create event to wait for response
        self.permission_event = asyncio.Event()
        self.permission_result = None

        # Put permission request in queue for streaming
        print(f"[Permission] Putting permission request in queue")
        try:
            self.permission_queue.put_nowait(self.pending_permission)
        except Exception as e:
            print(f"[Permission] Warning: Failed to queue permission: {e}")

        # Wait for client to respond (with timeout)
        print(f"[Permission] Waiting for user response (timeout: 5 minutes)...")
        try:
            await asyncio.wait_for(
                self.permission_event.wait(), timeout=300
            )  # 5 minute timeout
        except asyncio.TimeoutError:
            print(f"[Permission] ✗ Permission request timed out for: {tool_name}")
            self.pending_permission = None
            return PermissionResultDeny(message="Permission request timed out")

        # Get result
        result = self.permission_result
        self.pending_permission = None
        self.permission_event = None
        self.permission_result = None

        if isinstance(result, PermissionResultAllow):
            print(f"[Permission] ✓ User allowed: {tool_name}")
            if hasattr(result, 'updated_permissions') and result.updated_permissions:
                print(f"[Permission]   Applied {len(result.updated_permissions)} suggestions")
        else:
            print(f"[Permission] ✗ User denied: {tool_name}")

        return result

    def respond_to_permission(
        self, request_id: str, allowed: bool, apply_suggestions: bool = False
    ):
        """
        Respond to a pending permission request.

        Args:
            request_id: The permission request ID
            allowed: Whether to allow the operation
            apply_suggestions: Whether to apply permission suggestions

        Raises:
            HTTPException: If no matching pending permission
        """
        print(f"\n[Permission] ========== respond_to_permission ==========")
        print(f"[Permission] request_id: {request_id}")
        print(f"[Permission] allowed: {allowed}")
        print(f"[Permission] apply_suggestions: {apply_suggestions}")

        if (
            not self.pending_permission
            or self.pending_permission["request_id"] != request_id
        ):
            print(f"[Permission] ✗ No matching permission request found")
            raise HTTPException(
                status_code=404, detail="No matching permission request"
            )

        tool_name = self.pending_permission.get("tool_name", "unknown")
        print(f"[Permission] Processing response for tool: {tool_name}")

        if allowed:
            if apply_suggestions and self.pending_permission["suggestions"]:
                # Apply suggestions by converting them back to PermissionUpdate objects
                from claude_agent_sdk import PermissionUpdate

                suggestions = []
                for s in self.pending_permission["suggestions"]:
                    suggestions.append(PermissionUpdate(**s))

                print(f"[Permission] ✓ Allowing with {len(suggestions)} suggestions applied")
                self.permission_result = PermissionResultAllow(
                    updated_permissions=suggestions
                )
            else:
                print(f"[Permission] ✓ Allowing without suggestions")
                self.permission_result = PermissionResultAllow()
        else:
            print(f"[Permission] ✗ Denying request")
            self.permission_result = PermissionResultDeny(message="User denied")

        # Signal that response is ready
        print(f"[Permission] Signaling permission_event to resume execution")
        if self.permission_event:
            self.permission_event.set()

    async def send_message(self, message: str | dict) -> SendMessageResponse:
        """
        Send a message and get the response.

        Args:
            message: The user's message (string or structured UserMessage dict)

        Returns:
            SendMessageResponse with assistant's reply

        Raises:
            HTTPException: If session not connected
        """
        if not self.client or self.status != "connected":
            raise HTTPException(status_code=400, detail="Session not connected")

        self.last_activity = datetime.now(timezone.utc)
        self.message_count += 1

        # Send message - SDK query() accepts Union[str, AsyncIterable[dict]]
        # For AskUserQuestion answers, we now send them as plain text messages
        if isinstance(message, dict):
            # Structured message format - convert to CLI wire format
            # Format: {"type": "user", "message": {...}, "parent_tool_use_id": None, "session_id": "..."}
            wire_message = {
                "type": "user",
                "message": message,  # The message dict already has role and content
                "parent_tool_use_id": None,
                "session_id": "default"
            }

            print(f"[Session] send_message: Sending structured message to SDK (session: {self.session_id})")
            print(f"[Session] send_message: Wire message: {wire_message}")

            # Create an async iterable that yields this single message
            async def message_stream():
                yield wire_message

            await self.client.query(message_stream())
            print(f"[Session] send_message: SDK query() call completed")
        else:
            # Simple string message (including AskUserQuestion answers)
            print(f"[Session] send_message: Sending string message to SDK (session: {self.session_id}): {message[:100]}...")
            await self.client.query(message)
            print(f"[Session] send_message: SDK query() call completed")

        # Collect response
        messages = []
        cost_usd = None
        num_turns = None

        print(f"[Session] send_message: Starting to receive response...")
        async for msg in self.client.receive_response():
            # Print raw message details BEFORE type checking
            print(f"\n[Session] ========== SDK MESSAGE RECEIVED (non-streaming) ==========")
            print(f"[Session] Message type: {type(msg).__name__}")
            print(f"[Session] Message full type: {type(msg)}")
            print(f"[Session] Message repr: {repr(msg)}")
            print(f"[Session] Message str: {str(msg)}")
            print(f"[Session] Message attributes: {dir(msg)}")

            # Try to print common attributes
            if hasattr(msg, '__dict__'):
                print(f"[Session] Message __dict__: {msg.__dict__}")
            if hasattr(msg, 'content'):
                print(f"[Session] Message.content: {msg.content}")
            if hasattr(msg, 'role'):
                print(f"[Session] Message.role: {msg.role}")
            if hasattr(msg, 'model'):
                print(f"[Session] Message.model: {msg.model}")
            if hasattr(msg, 'text'):
                print(f"[Session] Message.text: {msg.text}")
            print(f"[Session] ===============================================\n")

            if isinstance(msg, SystemMessage):
                # Skip system messages
                print(f"[Session] send_message: Skipping SystemMessage")
                pass
            elif isinstance(msg, UserMessage):
                # Skip user messages in response
                print(f"[Session] send_message: Skipping UserMessage")
                pass
            elif isinstance(msg, AssistantMessage):
                print(f"[Session] send_message: Processing AssistantMessage with {len(msg.content)} blocks")
                for block in msg.content:
                    if isinstance(block, TextBlock):
                        messages.append(MessageBlock(type="text", content=block.text))
                    elif isinstance(block, ToolUseBlock):
                        messages.append(
                            MessageBlock(
                                type="tool_use",
                                tool_name=block.name,
                                tool_input=block.input,
                            )
                        )
            elif isinstance(msg, ResultMessage):
                print(f"[Session] send_message: Received ResultMessage")
                cost_usd = msg.total_cost_usd
                num_turns = msg.num_turns

        return SendMessageResponse(
            messages=messages,
            session_id=self.session_id,
            cost_usd=cost_usd,
            num_turns=num_turns,
        )

    async def send_message_stream(self, message: str | dict):
        """
        Send a message and stream the response in real-time.

        Args:
            message: The user's message (string or structured UserMessage dict)

        Yields:
            Dictionary events with type and data for each step

        Raises:
            HTTPException: If session not connected
        """
        print(f"\n[Session] ========== send_message_stream START ==========")
        print(f"[Session] session_id: {self.session_id}")
        print(f"[Session] message type: {type(message)}")
        if isinstance(message, str):
            print(f"[Session] message (string): {message[:200]}...")
        else:
            print(f"[Session] message (dict): {message}")
        print(f"[Session] current model: {self.model}")
        print(f"[Session] current mcp_server_ids: {self.mcp_server_ids}")

        if not self.client or self.status != "connected":
            raise HTTPException(status_code=400, detail="Session not connected")

        self.last_activity = datetime.now(timezone.utc)
        self.message_count += 1

        # Send initial event
        print(f"[Session] Yielding 'start' event")
        yield {
            "type": "start",
            "session_id": self.session_id,
            "message": message
        }

        # Send message - SDK query() accepts Union[str, AsyncIterable[dict]]
        # For AskUserQuestion answers, we now send them as plain text messages
        if isinstance(message, dict):
            # Structured message format - convert to CLI wire format
            # Format: {"type": "user", "message": {...}, "parent_tool_use_id": None, "session_id": "..."}
            wire_message = {
                "type": "user",
                "message": message,  # The message dict already has role and content
                "parent_tool_use_id": None,
                "session_id": "default"
            }

            print(f"[Session] send_message_stream: Sending structured message to SDK (session: {self.session_id})")
            print(f"[Session] send_message_stream: Wire message: {wire_message}")

            # Create an async iterable that yields this single message
            async def message_stream():
                yield wire_message

            await self.client.query(message_stream())
            print(f"[Session] send_message_stream: SDK query() call completed")
        else:
            # Simple string message (including AskUserQuestion answers)
            print(f"[Session] send_message_stream: Sending string message to SDK (session: {self.session_id}): {message[:100]}...")
            await self.client.query(message)
            print(f"[Session] send_message_stream: SDK query() call completed")

        # Track last reported permission to avoid duplicates
        last_permission_id = None

        # Create a task to receive SDK responses
        response_iterator = self.client.receive_response()

        # Stream response - interleave SDK messages and permission requests
        print(f"[Session] send_message_stream: Starting to stream response...")

        # Flag to track if we're done
        sdk_done = False

        while not sdk_done:
            # Check permission queue first (non-blocking)
            try:
                permission = self.permission_queue.get_nowait()
                permission_id = permission.get("request_id")
                if permission_id != last_permission_id:
                    print(f"[Session] send_message_stream: Got permission from queue, sending event")
                    yield {
                        "type": "permission",
                        "permission": permission
                    }
                    last_permission_id = permission_id
            except asyncio.QueueEmpty:
                pass

            # Try to get next SDK message with a short timeout
            # This allows us to periodically check the permission queue
            try:
                msg = await anext(response_iterator)

                # Helper function to truncate large content for logging
                def truncate_for_log(content, max_length=500):
                    """Truncate content to max_length for logging to prevent BlockingIOError"""
                    content_str = str(content)
                    if len(content_str) > max_length:
                        return content_str[:max_length] + f"... (truncated, total length: {len(content_str)})"
                    return content_str

                # Print raw message details BEFORE type checking (with truncation)
                print(f"\n[Session] ========== SDK MESSAGE RECEIVED ==========")
                print(f"[Session] Message type: {type(msg).__name__}")
                print(f"[Session] Message full type: {type(msg)}")
                print(f"[Session] Message repr: {truncate_for_log(repr(msg))}")
                print(f"[Session] Message str: {truncate_for_log(str(msg))}")
                # Skip printing all attributes (dir() can be very long)
                # print(f"[Session] Message attributes: {dir(msg)}")

                # Try to print common attributes (with truncation)
                if hasattr(msg, '__dict__'):
                    print(f"[Session] Message __dict__: {truncate_for_log(msg.__dict__)}")
                if hasattr(msg, 'content'):
                    print(f"[Session] Message.content: {truncate_for_log(msg.content)}")
                if hasattr(msg, 'role'):
                    print(f"[Session] Message.role: {msg.role}")
                if hasattr(msg, 'model'):
                    print(f"[Session] Message.model: {msg.model}")
                if hasattr(msg, 'text'):
                    print(f"[Session] Message.text: {truncate_for_log(msg.text)}")
                print(f"[Session] ===============================================\n")

            except asyncio.TimeoutError:
                # No message yet, continue to check permission queue
                continue
            except StopAsyncIteration:
                # SDK response stream is done
                print(f"[Session] send_message_stream: SDK response stream completed")
                sdk_done = True
                break

            if isinstance(msg, SystemMessage):
                # System message - typically informational, log but don't send to client
                print(f"[Session] send_message_stream: Received SystemMessage (skipping)")
                print(f"[Session]   SystemMessage content: {msg}")
                print(f"[Session]   SystemMessage attributes: {dir(msg)}")
                if hasattr(msg, 'content'):
                    print(f"[Session]   SystemMessage.content: {msg.content}")
                if hasattr(msg, 'text'):
                    print(f"[Session]   SystemMessage.text: {msg.text}")
                # Continue to next message
                continue
            elif isinstance(msg, UserMessage):
                # User message event
                print(f"[Session] send_message_stream: Sending user_message event")
                print(f"[Session]   UserMessage.content: {msg.content}")
                print(f"[Session]   UserMessage.role: {msg.role if hasattr(msg, 'role') else 'N/A'}")
                yield {
                    "type": "user_message",
                    "content": msg.content
                }
            elif isinstance(msg, AssistantMessage):
                # Assistant message with content blocks
                print(f"[Session] send_message_stream: Processing AssistantMessage with {len(msg.content)} blocks")
                print(f"[Session]   AssistantMessage.role: {msg.role if hasattr(msg, 'role') else 'N/A'}")
                print(f"[Session]   AssistantMessage.model: {msg.model if hasattr(msg, 'model') else 'N/A'}")
                print(f"[Session]   Full message object: {msg}")

                for i, block in enumerate(msg.content):
                    print(f"[Session]   Block #{i+1} type: {type(block).__name__}")
                    if isinstance(block, TextBlock):
                        text_preview = block.text[:100] if block.text else ""
                        print(f"[Session]   Block #{i+1}: TextBlock")
                        print(f"[Session]     Text (preview): {text_preview}...")
                        print(f"[Session]     Text (length): {len(block.text) if block.text else 0}")
                        yield {
                            "type": "text",
                            "content": block.text
                        }
                    elif isinstance(block, ToolUseBlock):
                        print(f"[Session]   Block #{i+1}: ToolUseBlock")
                        print(f"[Session]     Tool name: {block.name}")
                        print(f"[Session]     Tool ID: {block.id}")
                        print(f"[Session]     Tool input: {block.input}")
                        print(f"[Session]     Tool input type: {type(block.input)}")
                        yield {
                            "type": "tool_use",
                            "tool_name": block.name,
                            "tool_input": block.input,
                            "tool_use_id": block.id
                        }
                    else:
                        print(f"[Session]   Block #{i+1}: Unknown block type: {type(block)}")
                        print(f"[Session]     Block content: {block}")
            elif isinstance(msg, ResultMessage):
                print(f"[Session] send_message_stream: Received ResultMessage")
                print(f"[Session]   total_cost_usd: {msg.total_cost_usd}")
                print(f"[Session]   num_turns: {msg.num_turns}")
                print(f"[Session]   session_id: {msg.session_id if hasattr(msg, 'session_id') else 'N/A'}")
                # Final result with metadata
                # Extract real session_id from SDK's ResultMessage
                real_session_id = msg.session_id if hasattr(msg, 'session_id') else self.session_id

                # Update SessionManager if we got a different session_id from SDK
                if real_session_id != self.session_id:
                    print(f"[Session]   Session ID changed: {self.session_id} -> {real_session_id}")
                    from ..core.session_manager import SessionManager
                    from ..server import session_manager
                    session_manager.update_session_id(self.session_id, real_session_id)

                print(f"[Session] Yielding 'result' event")
                yield {
                    "type": "result",
                    "cost_usd": msg.total_cost_usd,
                    "num_turns": msg.num_turns,
                    "session_id": real_session_id
                }

        # Check for any remaining permissions in queue before finishing
        print(f"[Session] Checking for remaining permissions in queue...")
        while True:
            try:
                permission = self.permission_queue.get_nowait()
                permission_id = permission.get("request_id")
                if permission_id != last_permission_id:
                    print(f"[Session] send_message_stream: Got final permission from queue, sending event")
                    yield {
                        "type": "permission",
                        "permission": permission
                    }
                    last_permission_id = permission_id
            except asyncio.QueueEmpty:
                break

        # Send completion event with real session_id
        print(f"[Session] Yielding 'done' event")
        yield {
            "type": "done",
            "session_id": real_session_id if 'real_session_id' in locals() else self.session_id
        }
        print(f"[Session] ========== send_message_stream END ==========\n")

        # Backup to S3 after task completion (if S3 sync is enabled)
        s3_sync_enabled = os.environ.get("ENABLE_S3_SYNC", "true").lower() in ["true", "1", "yes"]
        if s3_sync_enabled:
            from .claude_sync_manager import get_claude_sync_manager
            sync_manager = get_claude_sync_manager()
            if sync_manager:
                asyncio.create_task(sync_manager.backup_after_task(self.user_id))

    async def interrupt(self):
        """
        Interrupt the current operation.

        Raises:
            HTTPException: If session not connected or SDK call fails
        """
        if not self.client or self.status != "connected":
            raise HTTPException(status_code=400, detail="Session not connected")

        try:
            await self.client.interrupt()
            self.last_activity = datetime.now(timezone.utc)
        except Exception as e:
            raise HTTPException(
                status_code=500, detail=f"Failed to interrupt: {str(e)}"
            )

    async def set_permission_mode(self, mode: str):
        """
        Change the permission mode for this session.

        Args:
            mode: Permission mode ("default", "acceptEdits", "plan", "bypassPermissions")

        Raises:
            HTTPException: If session not connected or SDK call fails
        """
        if not self.client or self.status != "connected":
            raise HTTPException(status_code=400, detail="Session not connected")

        try:
            await self.client.set_permission_mode(mode)
            self.last_activity = datetime.now(timezone.utc)
        except Exception as e:
            raise HTTPException(
                status_code=500, detail=f"Failed to set permission mode: {str(e)}"
            )

    async def get_server_info(self) -> dict[str, Any]:
        """
        Get server initialization info.

        Returns:
            Dictionary with server info (commands, output styles, etc.)

        Raises:
            HTTPException: If session not connected or info not available
        """
        if not self.client or self.status != "connected":
            raise HTTPException(status_code=400, detail="Session not connected")

        try:
            # Cache server info if not already cached
            if self.server_info is None:
                self.server_info = await self.client.get_server_info()

            if self.server_info is None:
                # Return empty dict if not available
                return {}

            return self.server_info
        except Exception as e:
            raise HTTPException(
                status_code=500, detail=f"Failed to get server info: {str(e)}"
            )

    def get_status(self) -> SessionStatus:
        """
        Get current session status.

        Returns:
            SessionStatus object
        """
        pending_perm = None
        if self.pending_permission:
            pending_perm = PermissionRequest(**self.pending_permission)

        return SessionStatus(
            session_id=self.session_id,
            status=self.status,
            pending_permission=pending_perm,
            current_model=self.current_model,
        )
