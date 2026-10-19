"""API endpoint routers."""

from .agentcore import router as agentcore_router
from .env_vars import router as env_vars_router
from .files import router as files_router
from .git import router as git_router
from .invocations import router as invocations_router
from .mcp_servers import router as mcp_servers_router
from .messages import router as messages_router
from .oauth import router as oauth_router
from .permissions import router as permissions_router
from .plugins import router as plugins_router
from .sessions import router as sessions_router
from .shell import router as shell_router
from .terminal import router as terminal_router
from .workspace import router as workspace_router

__all__ = [
    "agentcore_router",
    "sessions_router",
    "messages_router",
    "permissions_router",
    "invocations_router",
    "files_router",
    "git_router",
    "shell_router",
    "terminal_router",
    "workspace_router",
    "oauth_router",
    "mcp_servers_router",
    "plugins_router",
    "env_vars_router",
]
