"""
Git Operations Endpoints.

Provides REST API endpoints for Git operations including viewing logs,
checking status, and creating commits.
"""

import asyncio
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()


class GitLogRequest(BaseModel):
    """Request to get git log."""

    cwd: str
    limit: int = 10


class GitStatusRequest(BaseModel):
    """Request to get git status."""

    cwd: str


class GitCommitRequest(BaseModel):
    """Request to create a git commit."""

    cwd: str
    message: str
    files: Optional[list[str]] = None  # If None, commit all changes


class GitPushRequest(BaseModel):
    """Request to push commits."""

    cwd: str
    remote: str = "origin"
    branch: Optional[str] = None  # If None, push current branch


@router.post("/git/log")
async def get_git_log(request: GitLogRequest):
    """
    Get git commit history.

    Args:
        request: Git log request with cwd and limit

    Returns:
        List of commits with hash, message, author, date, and files changed
    """
    try:
        # Get commit log with format: hash|author|date|message
        log_cmd = [
            "git",
            "-C",
            request.cwd,
            "log",
            f"-{request.limit}",
            "--pretty=format:%H|%an|%ar|%s",
        ]

        process = await asyncio.create_subprocess_exec(
            *log_cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
        )
        stdout, stderr = await process.communicate()

        if process.returncode != 0:
            error_msg = stderr.decode() if stderr else "Git log failed"
            raise HTTPException(status_code=400, detail=error_msg)

        commits = []
        lines = stdout.decode().strip().split("\n")

        for line in lines:
            if not line:
                continue

            parts = line.split("|", 3)
            if len(parts) != 4:
                continue

            commit_hash, author, date, message = parts

            # Get files changed in this commit
            files_cmd = [
                "git",
                "-C",
                request.cwd,
                "diff-tree",
                "--no-commit-id",
                "--name-status",
                "-r",
                commit_hash,
            ]

            files_process = await asyncio.create_subprocess_exec(
                *files_cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            files_stdout, _ = await files_process.communicate()

            files_changed = []
            if files_process.returncode == 0:
                for file_line in files_stdout.decode().strip().split("\n"):
                    if not file_line:
                        continue
                    parts = file_line.split("\t", 1)
                    if len(parts) == 2:
                        status, filepath = parts
                        files_changed.append({"status": status, "path": filepath})

            commits.append(
                {
                    "hash": commit_hash,
                    "short_hash": commit_hash[:7],
                    "author": author,
                    "date": date,
                    "message": message,
                    "files_changed": files_changed,
                }
            )

        return {"commits": commits}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get git log: {str(e)}")


@router.post("/git/status")
async def get_git_status(request: GitStatusRequest):
    """
    Get git working tree status.

    Args:
        request: Git status request with cwd

    Returns:
        Git status including branch, staged, unstaged, and untracked files
    """
    try:
        # Get current branch
        branch_cmd = ["git", "-C", request.cwd, "rev-parse", "--abbrev-ref", "HEAD"]
        process = await asyncio.create_subprocess_exec(
            *branch_cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
        )
        stdout, _ = await process.communicate()
        current_branch = stdout.decode().strip() if process.returncode == 0 else "unknown"

        # Get status with porcelain format
        status_cmd = ["git", "-C", request.cwd, "status", "--porcelain"]
        process = await asyncio.create_subprocess_exec(
            *status_cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
        )
        stdout, stderr = await process.communicate()

        if process.returncode != 0:
            error_msg = stderr.decode() if stderr else "Git status failed"
            raise HTTPException(status_code=400, detail=error_msg)

        staged = []
        unstaged = []
        untracked = []

        for line in stdout.decode().strip().split("\n"):
            if not line or len(line) < 3:
                continue

            status = line[:2]
            filepath = line[3:]

            # First character: staged status
            # Second character: unstaged status
            staged_char = status[0]
            unstaged_char = status[1]

            if staged_char != " " and staged_char != "?":
                staged.append({"status": staged_char, "path": filepath})

            if unstaged_char != " " and unstaged_char != "?":
                unstaged.append({"status": unstaged_char, "path": filepath})

            if status == "??":
                untracked.append({"path": filepath})

        return {
            "branch": current_branch,
            "staged": staged,
            "unstaged": unstaged,
            "untracked": untracked,
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to get git status: {str(e)}"
        )


@router.post("/git/commit")
async def create_git_commit(request: GitCommitRequest):
    """
    Create a git commit.

    Args:
        request: Git commit request with cwd, message, and optional files

    Returns:
        Commit result with hash and message
    """
    try:
        # Stage files
        if request.files:
            # Stage specific files
            for filepath in request.files:
                add_cmd = ["git", "-C", request.cwd, "add", filepath]
                process = await asyncio.create_subprocess_exec(
                    *add_cmd,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                )
                await process.communicate()
                if process.returncode != 0:
                    raise HTTPException(
                        status_code=400, detail=f"Failed to stage file: {filepath}"
                    )
        else:
            # Stage all changes
            add_cmd = ["git", "-C", request.cwd, "add", "-A"]
            process = await asyncio.create_subprocess_exec(
                *add_cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            await process.communicate()
            if process.returncode != 0:
                raise HTTPException(status_code=400, detail="Failed to stage files")

        # Create commit
        commit_cmd = ["git", "-C", request.cwd, "commit", "-m", request.message]
        process = await asyncio.create_subprocess_exec(
            *commit_cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
        )
        stdout, stderr = await process.communicate()

        if process.returncode != 0:
            error_msg = stderr.decode() if stderr else "Git commit failed"
            raise HTTPException(status_code=400, detail=error_msg)

        # Get commit hash
        hash_cmd = ["git", "-C", request.cwd, "rev-parse", "HEAD"]
        process = await asyncio.create_subprocess_exec(
            *hash_cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
        )
        stdout, _ = await process.communicate()
        commit_hash = stdout.decode().strip() if process.returncode == 0 else "unknown"

        return {
            "status": "success",
            "hash": commit_hash,
            "short_hash": commit_hash[:7],
            "message": request.message,
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to create commit: {str(e)}"
        )


@router.post("/git/push")
async def push_commits(request: GitPushRequest):
    """
    Push commits to remote repository.

    Args:
        request: Git push request with cwd, remote, and optional branch

    Returns:
        Push result with status and output
    """
    try:
        # Build push command
        if request.branch:
            push_cmd = ["git", "-C", request.cwd, "push", request.remote, request.branch]
        else:
            # Push current branch
            push_cmd = ["git", "-C", request.cwd, "push"]

        process = await asyncio.create_subprocess_exec(
            *push_cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
        )
        stdout, stderr = await process.communicate()

        if process.returncode != 0:
            error_msg = stderr.decode() if stderr else "Git push failed"
            raise HTTPException(status_code=400, detail=error_msg)

        output = stdout.decode() + stderr.decode()

        return {"status": "success", "output": output.strip()}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to push commits: {str(e)}")
