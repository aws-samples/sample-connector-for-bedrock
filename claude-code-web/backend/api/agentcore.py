"""
AgentCore Runtime Session Management API

Provides endpoints to manage AgentCore runtime sessions.
"""

import logging
import os
import urllib.parse

import requests
from fastapi import APIRouter, HTTPException, Request

logger = logging.getLogger(__name__)

router = APIRouter()


def get_agentcore_base_url() -> str:
    """
    Get AgentCore base URL from environment variables.

    Priority:
    1. AGENTCORE_URL (if set) - highest priority
    2. AGENT_ARN (constructs URL using AWS_REGION)
    3. Error if neither is set

    Returns:
        str: Base AgentCore URL

    Raises:
        ValueError: If neither AGENTCORE_URL nor AGENT_ARN is set
    """
    if os.getenv("AGENTCORE_URL"):
        return os.getenv("AGENTCORE_URL")
    elif os.getenv("AGENT_ARN"):
        agent_arn = os.getenv("AGENT_ARN")
        region = os.getenv("AWS_REGION", "us-west-2")
        encoded_arn = urllib.parse.quote(agent_arn, safe='')
        return f"https://bedrock-agentcore.{region}.amazonaws.com/runtimes/{encoded_arn}"
    else:
        raise ValueError("Either AGENTCORE_URL or AGENT_ARN environment variable is required")


@router.post("/agentcore/session/stop")
async def stop_agentcore_session(request: Request, qualifier: str = "DEFAULT"):
    """
    Stop an AgentCore runtime session.

    Calls AgentCore's stopRuntimeSession API to terminate the session.

    Headers required:
    - Authorization: Bearer token
    - X-Amzn-Bedrock-AgentCore-Runtime-Session-Id: Session ID to stop

    Query Parameters:
    - qualifier: Session qualifier (default: DEFAULT)

    Returns:
        dict: Response from AgentCore stopRuntimeSession API

    Raises:
        HTTPException: If session stop fails or required headers missing
    """
    # Extract bearer token from Authorization header
    auth_header = request.headers.get("authorization", "")
    if not auth_header.lower().startswith("bearer "):
        raise HTTPException(
            status_code=401,
            detail="Missing or invalid Authorization header"
        )

    bearer_token = auth_header[7:].strip()

    # Extract session ID from header
    session_id = request.headers.get("x-amzn-bedrock-agentcore-runtime-session-id")
    if not session_id:
        raise HTTPException(
            status_code=400,
            detail="Missing X-Amzn-Bedrock-AgentCore-Runtime-Session-Id header"
        )

    # Get AgentCore base URL
    try:
        base_url = get_agentcore_base_url()
    except ValueError as e:
        logger.error(f"AgentCore URL configuration error: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=str(e)
        )

    # Construct stopRuntimeSession endpoint
    url = f"{base_url}/stopruntimesession"
    if qualifier:
        url += f"?qualifier={qualifier}"

    headers = {
        "Authorization": f"Bearer {bearer_token}",
        "Content-Type": "application/json",
        "X-Amzn-Bedrock-AgentCore-Runtime-Session-Id": session_id
    }

    logger.info(f"Stopping AgentCore session: {session_id}")

    try:
        response = requests.post(url, headers=headers, timeout=30)
        response.raise_for_status()

        logger.info(f"Successfully stopped AgentCore session: {session_id}")

        # Try to return JSON response if available
        try:
            return response.json()
        except:
            return {"status": "success", "message": "Session stopped"}

    except requests.exceptions.HTTPError as e:
        status_code = e.response.status_code

        if status_code == 404:
            logger.warning(f"Session not found or already terminated: {session_id}")
            return {"status": "not_found", "message": "Session not found or already terminated"}
        elif status_code == 403:
            logger.error(f"Insufficient permissions to stop session: {session_id}")
            raise HTTPException(
                status_code=403,
                detail="Insufficient permissions to stop session"
            )
        elif status_code == 401:
            logger.error(f"Authentication failed when stopping session: {session_id}")
            raise HTTPException(
                status_code=401,
                detail="Authentication failed"
            )
        else:
            logger.error(f"HTTP error stopping session {session_id}: {e.response.text}")
            raise HTTPException(
                status_code=status_code,
                detail=f"Failed to stop session: {e.response.text}"
            )

    except requests.exceptions.RequestException as e:
        logger.error(f"Request error stopping session {session_id}: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to stop session: {str(e)}"
        )
