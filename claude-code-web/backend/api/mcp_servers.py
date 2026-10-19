"""
MCP servers management endpoints.

Provides API endpoints for reading and managing MCP server configurations.
"""

import json
import logging
import os
from pathlib import Path

from fastapi import APIRouter, HTTPException

from ..models.schemas import (
    AddMCPServerRequest,
    AddMCPServerResponse,
    DeleteMCPServerResponse,
    ListMCPServersResponse,
    MCPServer,
)

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/mcp-servers", response_model=ListMCPServersResponse)
async def list_mcp_servers():
    """
    List all MCP servers from /root/.claude/mcp.json configuration file.

    Reads the MCP server configuration from /root/.claude/mcp.json and returns
    the list of configured servers with their settings.

    Returns:
        ListMCPServersResponse with server configurations

    Raises:
        HTTPException: If config file cannot be read
    """
    mcp_config_path = "/root/.claude/mcp.json"
    logger.info(f"Reading MCP servers from {mcp_config_path}")

    # Check if file exists
    config_file = Path(mcp_config_path)
    if not config_file.exists():
        logger.warning(f"MCP config file not found at {mcp_config_path}")
        return ListMCPServersResponse(
            servers={},
            mcp_config_path=mcp_config_path,
            exists=False
        )

    try:
        # Read and parse JSON
        with open(config_file, 'r') as f:
            config_data = json.load(f)

        # Extract mcpServers section
        mcp_servers_raw = config_data.get('mcpServers', {})

        # Convert to MCPServer models
        servers = {}
        for name, config in mcp_servers_raw.items():
            try:
                server_type = config.get('type', 'stdio')
                servers[name] = MCPServer(
                    type=server_type,
                    command=config.get('command'),
                    args=config.get('args'),
                    env=config.get('env'),
                    url=config.get('url')
                )
            except Exception as e:
                logger.error(f"Failed to parse MCP server '{name}': {str(e)}")
                # Continue with other servers

        logger.info(f"Found {len(servers)} MCP servers")
        return ListMCPServersResponse(
            servers=servers,
            mcp_config_path=mcp_config_path,
            exists=True
        )

    except json.JSONDecodeError as e:
        logger.error(f"Invalid JSON in MCP config file: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Invalid JSON in MCP config file: {str(e)}"
        )
    except Exception as e:
        logger.error(f"Error reading MCP config: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to read MCP config: {str(e)}"
        )


@router.post("/mcp-servers", response_model=AddMCPServerResponse)
async def add_mcp_server(request: AddMCPServerRequest):
    """
    Add a new MCP server to /root/.claude/mcp.json configuration file.

    Creates the config file if it doesn't exist, then adds the new server
    configuration.

    Supports three connection types:
    - stdio: Local process (requires command, args optional, env optional)
    - sse: Server-Sent Events remote service (requires url)
    - http: HTTP remote service (requires url)

    Args:
        request: AddMCPServerRequest containing server configuration

    Returns:
        AddMCPServerResponse with operation status

    Raises:
        HTTPException: If server name already exists, validation fails, or operation fails
    """
    mcp_config_path = "/root/.claude/mcp.json"
    logger.info(f"Adding MCP server '{request.name}' (type: {request.type}) to {mcp_config_path}")

    # Validate required fields based on type
    if request.type == "stdio":
        if not request.command:
            raise HTTPException(
                status_code=400,
                detail="'command' is required for stdio type"
            )
    elif request.type in ["sse", "http"]:
        if not request.url:
            raise HTTPException(
                status_code=400,
                detail=f"'url' is required for {request.type} type"
            )
    else:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid type '{request.type}'. Must be 'stdio', 'sse', or 'http'"
        )

    config_file = Path(mcp_config_path)

    try:
        # Read existing config or create new one
        if config_file.exists():
            with open(config_file, 'r') as f:
                config_data = json.load(f)
        else:
            config_data = {"mcpServers": {}}

        # Ensure mcpServers section exists
        if "mcpServers" not in config_data:
            config_data["mcpServers"] = {}

        # Check if server name already exists
        if request.name in config_data["mcpServers"]:
            raise HTTPException(
                status_code=400,
                detail=f"MCP server '{request.name}' already exists"
            )

        # Build server config based on type
        server_config = {"type": request.type}

        if request.type == "stdio":
            server_config["command"] = request.command
            server_config["args"] = request.args if request.args else []
            server_config["env"] = request.env if request.env else {}
        elif request.type in ["sse", "http"]:
            server_config["url"] = request.url

        # Add new server
        config_data["mcpServers"][request.name] = server_config

        # Ensure parent directory exists
        config_file.parent.mkdir(parents=True, exist_ok=True)

        # Write updated config
        with open(config_file, 'w') as f:
            json.dump(config_data, f, indent=2)

        logger.info(f"Successfully added MCP server '{request.name}'")
        return AddMCPServerResponse(
            status="success",
            message=f"MCP server '{request.name}' added successfully",
            server_name=request.name
        )

    except HTTPException:
        raise
    except json.JSONDecodeError as e:
        logger.error(f"Invalid JSON in MCP config file: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Invalid JSON in MCP config file: {str(e)}"
        )
    except Exception as e:
        logger.error(f"Error adding MCP server: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to add MCP server: {str(e)}"
        )


@router.delete("/mcp-servers/{server_name}", response_model=DeleteMCPServerResponse)
async def delete_mcp_server(server_name: str):
    """
    Delete an MCP server from /root/.claude/mcp.json configuration file.

    Removes the specified server from the configuration.

    Args:
        server_name: Name of the server to delete

    Returns:
        DeleteMCPServerResponse with operation status

    Raises:
        HTTPException: If config file doesn't exist, server not found, or operation fails
    """
    mcp_config_path = "/root/.claude/mcp.json"
    logger.info(f"Deleting MCP server '{server_name}' from {mcp_config_path}")

    config_file = Path(mcp_config_path)

    if not config_file.exists():
        raise HTTPException(
            status_code=404,
            detail="MCP config file not found"
        )

    try:
        # Read existing config
        with open(config_file, 'r') as f:
            config_data = json.load(f)

        # Check if server exists
        if "mcpServers" not in config_data or server_name not in config_data["mcpServers"]:
            raise HTTPException(
                status_code=404,
                detail=f"MCP server '{server_name}' not found"
            )

        # Delete server
        del config_data["mcpServers"][server_name]

        # Write updated config
        with open(config_file, 'w') as f:
            json.dump(config_data, f, indent=2)

        logger.info(f"Successfully deleted MCP server '{server_name}'")
        return DeleteMCPServerResponse(
            status="success",
            message=f"MCP server '{server_name}' deleted successfully",
            server_name=server_name
        )

    except HTTPException:
        raise
    except json.JSONDecodeError as e:
        logger.error(f"Invalid JSON in MCP config file: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Invalid JSON in MCP config file: {str(e)}"
        )
    except Exception as e:
        logger.error(f"Error deleting MCP server: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to delete MCP server: {str(e)}"
        )
