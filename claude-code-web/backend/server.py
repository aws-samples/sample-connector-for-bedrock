#!/usr/bin/env python3
"""
Claude Agent API Server

A stateful API server that wraps the Claude Agent SDK and provides
RESTful endpoints for client applications. Manages multiple concurrent
sessions with full support for conversation history, permission control,
and session lifecycle management.

Key Features:
- Session-based state management
- Permission callback system
- Multi-turn conversation support
- Session history and restoration
- Graceful error handling
"""

import logging
import os
import sys
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# ============================================================================
# Logging Configuration
# ============================================================================

# Get log level from environment variable (default: INFO)
LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO").upper()

# Configure root logger
logging.basicConfig(
    level=LOG_LEVEL,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)

# Set specific log levels for noisy libraries
logging.getLogger("urllib3").setLevel(logging.WARNING)
logging.getLogger("botocore").setLevel(logging.WARNING)
logging.getLogger("boto3").setLevel(logging.WARNING)

logger = logging.getLogger(__name__)

from .api import (
    agentcore_router,
    env_vars_router,
    files_router,
    git_router,
    invocations_router,
    mcp_servers_router,
    messages_router,
    oauth_router,
    permissions_router,
    plugins_router,
    sessions_router,
    shell_router,
    terminal_router,
    workspace_router,
)
from .core import SessionManager
from .core.pty_manager import PTYManager
from .core.claude_sync_manager import initialize_claude_sync_manager, get_claude_sync_manager
from .proxy import router as proxy_router

# ============================================================================
# Global Session Manager
# ============================================================================

session_manager = SessionManager()
pty_manager = PTYManager()
claude_sync_manager = None  # Will be initialized in lifespan


# ============================================================================
# FastAPI Application
# ============================================================================


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager."""
    # Startup
    print("=" * 80)
    print("🚀 Claude Agent API Server Starting...")
    print(f"📝 Log Level: {LOG_LEVEL}")
    print("=" * 80)

    logger.info("Starting Claude Agent API Server")
    logger.info(f"Log level set to: {LOG_LEVEL}")

    await pty_manager.start()

    # Initialize Claude sync manager and start backup task
    import os
    global claude_sync_manager

    # Check if S3 sync is enabled (default: true for backward compatibility)
    s3_sync_enabled = os.environ.get("ENABLE_S3_SYNC", "true").lower() in ["true", "1", "yes"]
    s3_bucket = os.environ.get("S3_WORKSPACE_BUCKET")

    if not s3_sync_enabled:
        print("⚠️  S3 sync disabled (ENABLE_S3_SYNC=false)")
    elif s3_bucket:
        print(f"📦 S3 Workspace Bucket: {s3_bucket}")
        print(f"🔄 S3 Sync: Enabled")
        claude_sync_manager = initialize_claude_sync_manager()
        if claude_sync_manager:
            claude_sync_manager.start_backup_task()
        else:
            print("⚠️  Claude sync manager initialization failed")
    else:
        print("⚠️  S3_WORKSPACE_BUCKET not configured, .claude sync/backup disabled")

    print("=" * 80)
    print("✅ Server startup complete")
    print("=" * 80)

    yield

    # Shutdown - close all sessions
    print("🛑 Shutting down server...")
    for session_id in list(session_manager.sessions.keys()):
        await session_manager.close_session(session_id)
    await pty_manager.stop()

    # Stop Claude sync manager backup task
    if claude_sync_manager:
        await claude_sync_manager.stop_backup_task()

    print("✅ Server shutdown complete")


app = FastAPI(
    title="Claude Agent API Server",
    description="Stateful API server for Claude Agent SDK",
    version="1.0.0",
    lifespan=lifespan,
)

# Add CORS middleware to allow web client access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for development
    allow_credentials=True,
    allow_methods=["*"],  # Allow all methods
    allow_headers=["*"],  # Allow all headers
)

# ============================================================================
# Register Routers
# ============================================================================

# Session management endpoints
app.include_router(sessions_router, tags=["sessions"])

# Message and status endpoints
app.include_router(messages_router, tags=["messages"])

# Permission endpoints
app.include_router(permissions_router, tags=["permissions"])

# File browser endpoints
app.include_router(files_router, tags=["files"])

# Git operations endpoints
app.include_router(git_router, tags=["git"])

# Shell terminal endpoints
app.include_router(shell_router, tags=["shell"])

# PTY terminal endpoints
app.include_router(terminal_router, tags=["terminal"])

# Workspace sync endpoints
app.include_router(workspace_router, tags=["workspace"])

# OAuth endpoints
app.include_router(oauth_router, tags=["oauth"])

# MCP servers endpoints
app.include_router(mcp_servers_router, tags=["mcp-servers"])

# Plugins management endpoints
app.include_router(plugins_router, tags=["plugins"])

# Environment variables endpoints
app.include_router(env_vars_router, tags=["env-vars"])

# AgentCore session management endpoints
app.include_router(agentcore_router, tags=["agentcore"])

# Unified invocations endpoint
app.include_router(invocations_router, tags=["invocations"])

# LiteLLM proxy endpoint
app.include_router(proxy_router, tags=["proxy"])


# ============================================================================
# Health Check
# ============================================================================


@app.get("/health")
async def health_check():
    """Health check endpoint with GitHub auth status."""
    from backend.api.oauth import check_gh_auth_status

    gh_status = await check_gh_auth_status()

    return {
        "status": "healthy",
        "active_sessions": len(session_manager.sessions),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "github_auth": gh_status
    }


@app.get("/ping")
async def ping():
    """Ping endpoint for health monitoring."""
    import time
    return {
        "status": "Healthy",
        "time_of_last_update": int(time.time())
    }


# ============================================================================
# Main Entry Point
# ============================================================================

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8000, log_level="info")
