"""
Pydantic models for request/response validation.

Contains all the data models used by the API endpoints for
request validation, response serialization, and documentation.
"""

from typing import Any, Optional

from pydantic import BaseModel


class CreateSessionRequest(BaseModel):
    """Request to create a new session or resume an existing one."""

    user_id: Optional[str] = None  # User ID for S3 sync tracking
    resume_session_id: Optional[str] = None
    model: Optional[str] = None  # e.g., "claude-3-5-sonnet-20241022"
    background_model: Optional[
        str
    ] = None  # Background model for agents (sets ANTHROPIC_DEFAULT_HAIKU_MODEL)
    enable_proxy: bool = False  # Enable LiteLLM proxy mode
    cwd: Optional[str] = None  # Working directory for the session
    mcp_server_ids: Optional[list[str]] = None  # List of MCP server names to enable


class CreateSessionResponse(BaseModel):
    """Response containing new session information."""

    session_id: str
    created_at: str
    status: str


class SendMessageRequest(BaseModel):
    """Request to send a message in a session."""

    message: str | dict[str, Any]  # Can be string or structured message (e.g., with tool_result)
    model: Optional[str] = None  # Optional model to use for this message (updates session model if different)
    mcp_server_ids: Optional[list[str]] = None  # Optional MCP server IDs (updates session MCP servers if different)


class MessageBlock(BaseModel):
    """Represents a single content block in a message."""

    type: str  # "text", "tool_use", "thinking"
    content: Optional[str] = None
    tool_name: Optional[str] = None
    tool_input: Optional[dict[str, Any]] = None


class SendMessageResponse(BaseModel):
    """Response containing assistant's reply."""

    messages: list[MessageBlock]
    session_id: str
    cost_usd: Optional[float] = None
    num_turns: Optional[int] = None


class SessionInfo(BaseModel):
    """Information about a session."""

    session_id: str
    created_at: str
    last_activity: str
    status: str
    message_count: int
    cwd: Optional[str] = None


class ListSessionsResponse(BaseModel):
    """Response containing list of sessions."""

    sessions: list[SessionInfo]


class PermissionRequest(BaseModel):
    """Pending permission request."""

    request_id: str
    tool_name: str
    tool_input: dict[str, Any]
    suggestions: list[dict[str, Any]]


class PermissionResponse(BaseModel):
    """User's response to permission request."""

    request_id: str
    allowed: bool
    apply_suggestions: bool = False


class SessionStatus(BaseModel):
    """Current status of a session."""

    session_id: str
    status: str
    pending_permission: Optional[PermissionRequest] = None
    current_model: Optional[str] = None


class SetPermissionModeRequest(BaseModel):
    """Request to change the permission mode for a session."""

    mode: str  # "default", "acceptEdits", "plan", "bypassPermissions"


class InitWorkspaceRequest(BaseModel):
    """Request to initialize/sync a user's workspace from S3."""

    user_id: str
    workspace_name: str = "workspace"
    dry_run: bool = False


class InitWorkspaceResponse(BaseModel):
    """Response from workspace initialization."""

    status: str
    user_id: str
    s3_path: str
    local_path: str
    files_synced: int
    dry_run: bool
    message: str
    output: Optional[str] = None


class SyncWorkspaceToS3Request(BaseModel):
    """Request to sync a user's workspace to S3."""

    user_id: str
    workspace_name: str = "workspace"
    dry_run: bool = False


class SyncWorkspaceToS3Response(BaseModel):
    """Response from workspace sync to S3."""

    status: str
    user_id: str
    local_path: str
    s3_path: str
    files_synced: int
    dry_run: bool
    message: str
    output: Optional[str] = None


class WorkspaceInfoResponse(BaseModel):
    """Information about a user's workspace."""

    exists: bool
    path: str
    size_bytes: Optional[int] = None
    size_mb: Optional[float] = None
    file_count: Optional[int] = None
    dir_count: Optional[int] = None
    message: Optional[str] = None


class CloneGitRepositoryRequest(BaseModel):
    """Request to clone a Git repository into workspace."""

    user_id: str
    git_url: str
    branch: Optional[str] = None
    repo_name: Optional[str] = None
    shallow: bool = False


class CloneGitRepositoryResponse(BaseModel):
    """Response from Git repository clone."""

    status: str
    user_id: str
    git_url: str
    local_path: str
    workspace_path: str
    repo_name: str
    branch: str
    commit_hash: str
    shallow: bool
    size_bytes: int
    size_mb: float
    message: str
    output: Optional[str] = None


class ListProjectsResponse(BaseModel):
    """Response containing list of projects."""

    user_id: str
    projects: list[str]
    message: Optional[str] = None


class CreateProjectRequest(BaseModel):
    """Request to create a new project."""

    user_id: str
    project_name: str


class CreateProjectResponse(BaseModel):
    """Response from project creation."""

    status: str
    user_id: str
    project_name: str
    local_path: str
    message: str


class MCPServer(BaseModel):
    """MCP server configuration.

    Three connection types:
    - stdio: Local process via stdin/stdout (requires command, args, env)
    - sse: Server-Sent Events remote service (requires url)
    - http: HTTP remote service (requires url)
    """

    type: str  # "stdio", "sse", or "http"
    command: Optional[str] = None  # Required for stdio
    args: Optional[list[str]] = None  # Required for stdio
    env: Optional[dict[str, str]] = None  # Optional for stdio
    url: Optional[str] = None  # Required for sse and http


class ListMCPServersResponse(BaseModel):
    """Response containing list of MCP servers."""

    servers: dict[str, MCPServer]
    mcp_config_path: str
    exists: bool


class AddMCPServerRequest(BaseModel):
    """Request to add a new MCP server.

    Field requirements by type:
    - stdio: name, type, command, args (optional: env)
    - sse: name, type, url
    - http: name, type, url
    """

    name: str
    type: str
    command: Optional[str] = None
    args: Optional[list[str]] = None
    env: Optional[dict[str, str]] = None
    url: Optional[str] = None


class AddMCPServerResponse(BaseModel):
    """Response from adding MCP server."""

    status: str
    message: str
    server_name: str


class DeleteMCPServerResponse(BaseModel):
    """Response from deleting MCP server."""

    status: str
    message: str
    server_name: str


# ============================================================================
# Environment Variables Schemas
# ============================================================================


class GetEnvVarsResponse(BaseModel):
    """Response containing environment variables from settings.json."""

    env_vars: dict[str, str]
    settings_path: str
    exists: bool


class SetEnvVarRequest(BaseModel):
    """Request to set a single environment variable."""

    key: str
    value: str


class SetEnvVarResponse(BaseModel):
    """Response from setting an environment variable."""

    status: str
    message: str
    key: str


class DeleteEnvVarResponse(BaseModel):
    """Response from deleting an environment variable."""

    status: str
    message: str
    key: str


class SetAllEnvVarsRequest(BaseModel):
    """Request to set all environment variables at once."""

    env_vars: dict[str, str]


class SetAllEnvVarsResponse(BaseModel):
    """Response from setting all environment variables."""

    status: str
    message: str
    count: int
