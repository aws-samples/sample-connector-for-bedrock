"""
Environment variables management endpoints.

Provides API endpoints for reading and managing environment variables
stored in ~/.claude/settings.json under the "env" key.
"""

import json
import logging
import os
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException

from ..models.schemas import (
    GetEnvVarsResponse,
    SetEnvVarRequest,
    SetEnvVarResponse,
    DeleteEnvVarResponse,
    SetAllEnvVarsRequest,
    SetAllEnvVarsResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter()

# Default path to Claude settings file
CLAUDE_SETTINGS_PATH = os.path.expanduser("~/.claude/settings.json")


def _get_settings_path() -> Path:
    """Get the path to the Claude settings file."""
    return Path(CLAUDE_SETTINGS_PATH)


def _read_settings() -> dict:
    """Read the Claude settings file."""
    settings_path = _get_settings_path()

    if not settings_path.exists():
        return {}

    try:
        with open(settings_path, 'r') as f:
            return json.load(f)
    except json.JSONDecodeError as e:
        logger.error(f"Invalid JSON in settings file: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Invalid JSON in settings file: {e}"
        )
    except Exception as e:
        logger.error(f"Error reading settings file: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to read settings file: {e}"
        )


def _write_settings(settings: dict) -> None:
    """Write the Claude settings file."""
    settings_path = _get_settings_path()

    try:
        # Ensure parent directory exists
        settings_path.parent.mkdir(parents=True, exist_ok=True)

        with open(settings_path, 'w') as f:
            json.dump(settings, f, indent=2)
    except Exception as e:
        logger.error(f"Error writing settings file: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to write settings file: {e}"
        )


@router.get("/env-vars", response_model=GetEnvVarsResponse)
async def get_env_vars():
    """
    Get all environment variables from ~/.claude/settings.json.

    Reads the environment variables from the "env" section of the settings file.

    Returns:
        GetEnvVarsResponse with environment variables and settings path
    """
    logger.info(f"Reading environment variables from {CLAUDE_SETTINGS_PATH}")

    settings_path = _get_settings_path()

    if not settings_path.exists():
        logger.warning(f"Settings file not found at {CLAUDE_SETTINGS_PATH}")
        return GetEnvVarsResponse(
            env_vars={},
            settings_path=CLAUDE_SETTINGS_PATH,
            exists=False
        )

    settings = _read_settings()
    env_vars = settings.get("env", {})

    logger.info(f"Found {len(env_vars)} environment variables")
    return GetEnvVarsResponse(
        env_vars=env_vars,
        settings_path=CLAUDE_SETTINGS_PATH,
        exists=True
    )


@router.post("/env-vars", response_model=SetEnvVarResponse)
async def set_env_var(request: SetEnvVarRequest):
    """
    Set a single environment variable in ~/.claude/settings.json.

    Creates the settings file and "env" section if they don't exist.

    Args:
        request: SetEnvVarRequest containing key and value

    Returns:
        SetEnvVarResponse with operation status
    """
    logger.info(f"Setting environment variable '{request.key}' in {CLAUDE_SETTINGS_PATH}")

    # Validate key
    if not request.key or not request.key.strip():
        raise HTTPException(
            status_code=400,
            detail="Environment variable key cannot be empty"
        )

    settings = _read_settings()

    # Ensure env section exists
    if "env" not in settings:
        settings["env"] = {}

    # Set the variable
    settings["env"][request.key] = request.value

    _write_settings(settings)

    logger.info(f"Successfully set environment variable '{request.key}'")
    return SetEnvVarResponse(
        status="success",
        message=f"Environment variable '{request.key}' set successfully",
        key=request.key
    )


@router.delete("/env-vars/{key}", response_model=DeleteEnvVarResponse)
async def delete_env_var(key: str):
    """
    Delete an environment variable from ~/.claude/settings.json.

    Args:
        key: The environment variable key to delete

    Returns:
        DeleteEnvVarResponse with operation status

    Raises:
        HTTPException: If settings file doesn't exist or key not found
    """
    logger.info(f"Deleting environment variable '{key}' from {CLAUDE_SETTINGS_PATH}")

    settings_path = _get_settings_path()

    if not settings_path.exists():
        raise HTTPException(
            status_code=404,
            detail="Settings file not found"
        )

    settings = _read_settings()

    if "env" not in settings or key not in settings["env"]:
        raise HTTPException(
            status_code=404,
            detail=f"Environment variable '{key}' not found"
        )

    # Delete the variable
    del settings["env"][key]

    _write_settings(settings)

    logger.info(f"Successfully deleted environment variable '{key}'")
    return DeleteEnvVarResponse(
        status="success",
        message=f"Environment variable '{key}' deleted successfully",
        key=key
    )


@router.put("/env-vars", response_model=SetAllEnvVarsResponse)
async def set_all_env_vars(request: SetAllEnvVarsRequest):
    """
    Replace all environment variables in ~/.claude/settings.json.

    This will completely replace the "env" section with the provided variables.
    Other settings in the file will be preserved.

    Args:
        request: SetAllEnvVarsRequest containing all environment variables

    Returns:
        SetAllEnvVarsResponse with operation status
    """
    logger.info(f"Replacing all environment variables in {CLAUDE_SETTINGS_PATH}")

    settings = _read_settings()

    # Replace the env section
    settings["env"] = request.env_vars

    _write_settings(settings)

    logger.info(f"Successfully replaced environment variables ({len(request.env_vars)} variables)")
    return SetAllEnvVarsResponse(
        status="success",
        message=f"Successfully set {len(request.env_vars)} environment variables",
        count=len(request.env_vars)
    )
