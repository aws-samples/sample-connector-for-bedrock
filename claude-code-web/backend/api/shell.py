"""
Shell Terminal Endpoints.

Provides REST API endpoints for executing shell commands with streaming output.
"""

import asyncio
import os
import re
from typing import Dict
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel


class ShellExecuteRequest(BaseModel):
    """Request to execute a shell command."""
    command: str
    cwd: str = None


class ShellCwdResponse(BaseModel):
    """Response for current working directory."""
    cwd: str


router = APIRouter()

# Store current directory per session (in production, use session management)
_cwd_store: Dict[str, str] = {}


def get_cwd(session_id: str = "default") -> str:
    """Get current working directory for a session."""
    if session_id not in _cwd_store:
        _cwd_store[session_id] = os.getcwd()
    return _cwd_store[session_id]


def set_cwd(session_id: str, path: str):
    """Set current working directory for a session."""
    _cwd_store[session_id] = path


def parse_cd_command(command: str):
    """Parse cd command and return the target path."""
    match = re.match(r'^\s*cd\s+(.+?)\s*$', command)
    if match:
        return match.group(1)
    return None


async def execute_command_stream(command: str, cwd: str):
    """
    Execute a shell command and stream the output.

    Args:
        command: Shell command to execute
        cwd: Current working directory

    Yields:
        Output lines from the command
    """
    try:
        # Handle cd command specially
        cd_path = parse_cd_command(command)
        if cd_path:
            try:
                if cd_path == '-':
                    yield b"[cd - not supported in this shell]\n"
                    return

                new_path = os.path.expanduser(cd_path)
                if not os.path.isabs(new_path):
                    new_path = os.path.join(cwd, new_path)

                new_path = os.path.normpath(new_path)

                if os.path.isdir(new_path):
                    # Update cwd in store
                    set_cwd("default", new_path)
                    yield f"{new_path}\n".encode('utf-8')
                else:
                    yield f"cd: {cd_path}: No such directory\n".encode('utf-8')
                return
            except Exception as e:
                yield f"cd: {str(e)}\n".encode('utf-8')
                return

        # Execute regular command
        process = await asyncio.create_subprocess_shell(
            command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            shell=True,
            cwd=cwd
        )

        # Stream output line by line
        while True:
            line = await process.stdout.readline()
            if not line:
                break
            yield line

        # Wait for process to complete
        await process.wait()

        # Report non-zero exit codes
        if process.returncode != 0:
            yield f"\n[Exit Code: {process.returncode}]\n".encode('utf-8')

    except Exception as e:
        yield f"\n[Error: {str(e)}]\n".encode('utf-8')


@router.post("/shell/execute")
async def execute_command(request: ShellExecuteRequest):
    """
    Execute a shell command with streaming output.

    Args:
        request: Command and optional working directory

    Returns:
        Streaming response with command output
    """
    if not request.command or not request.command.strip():
        raise HTTPException(status_code=400, detail="Command cannot be empty")

    # Get current working directory
    cwd = request.cwd if request.cwd else get_cwd()

    return StreamingResponse(
        execute_command_stream(request.command, cwd),
        media_type="text/plain"
    )


@router.get("/shell/cwd", response_model=ShellCwdResponse)
async def get_current_directory():
    """
    Get the current working directory.

    Returns:
        Current working directory path
    """
    return ShellCwdResponse(cwd=get_cwd())


@router.post("/shell/cwd")
async def set_current_directory(cwd: str):
    """
    Set the current working directory.

    Args:
        cwd: New working directory path

    Returns:
        Success status
    """
    if not os.path.isdir(cwd):
        raise HTTPException(status_code=400, detail="Directory does not exist")

    set_cwd("default", cwd)
    return {"success": True, "cwd": cwd}
