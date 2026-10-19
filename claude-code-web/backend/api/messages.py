"""
Message and Status Endpoints.

Provides REST API endpoints for sending messages to sessions,
checking session status, and managing session models.
"""

import json
from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from ..core import SessionManager
from ..models import (
    SendMessageRequest,
    SendMessageResponse,
    SessionStatus,
    SetPermissionModeRequest,
)

router = APIRouter()


def get_session_manager() -> SessionManager:
    """Get the global session manager instance."""
    from ..server import session_manager

    return session_manager


@router.get("/sessions/{session_id}/status", response_model=SessionStatus)
async def get_session_status(session_id: str):
    """
    Get the status of a session.

    Args:
        session_id: The session ID

    Returns:
        Session status including pending permissions
    """
    manager = get_session_manager()
    session = await manager.get_session(session_id)
    return session.get_status()


@router.post("/sessions/{session_id}/messages", response_model=SendMessageResponse)
async def send_message(session_id: str, request: SendMessageRequest):
    """
    Send a message in a session (non-streaming).

    Args:
        session_id: The session ID
        request: Message request

    Returns:
        Assistant's response
    """
    manager = get_session_manager()
    session = await manager.get_session(session_id)
    return await session.send_message(request.message)


@router.post("/sessions/{session_id}/messages/stream")
def safe_json_dumps(obj):
    """
    Safely serialize objects to JSON, handling non-serializable objects.

    Args:
        obj: Object to serialize

    Returns:
        JSON string
    """
    def default_handler(o):
        # Handle objects with __dict__ attribute
        if hasattr(o, '__dict__'):
            return o.__dict__
        # Handle other non-serializable types
        return str(o)

    return json.dumps(obj, default=default_handler)


async def send_message_stream(session_id: str, request: SendMessageRequest):
    """
    Send a message in a session with streaming response (SSE).

    Automatically updates model and MCP servers if provided in request and different from current.

    Args:
        session_id: The session ID
        request: Message request (with optional model and mcp_server_ids)

    Returns:
        Server-Sent Events stream with real-time updates
    """
    print(f"\n[API] ========== send_message_stream START ==========")
    print(f"[API] session_id: {session_id}")
    print(f"[API] request.message type: {type(request.message)}")
    if isinstance(request.message, str):
        print(f"[API] request.message (string): {request.message[:200]}...")
    else:
        print(f"[API] request.message (dict): {request.message}")
    print(f"[API] request.model: {request.model}")
    print(f"[API] request.mcp_server_ids: {request.mcp_server_ids}")

    manager = get_session_manager()

    # Get session and ensure model and MCP servers match request
    # This will automatically reconnect if configuration changed
    session = await manager.get_or_ensure_session(
        session_id,
        model=request.model,
        mcp_server_ids=request.mcp_server_ids
    )

    async def event_generator():
        """Generate SSE events from the agent response."""
        event_count = 0
        try:
            async for event in session.send_message_stream(request.message):
                event_count += 1
                print(f"[API] Event #{event_count}: type={event.get('type', 'unknown')}")
                if event.get('type') == 'text':
                    content_preview = event.get('content', '')[:100]
                    print(f"[API]   text content preview: {content_preview}...")
                elif event.get('type') == 'tool_use':
                    print(f"[API]   tool_name: {event.get('tool_name')}")
                    print(f"[API]   tool_input: {event.get('tool_input')}")
                elif event.get('type') == 'permission':
                    perm = event.get('permission', {})
                    print(f"[API]   permission tool: {perm.get('tool_name')}")
                elif event.get('type') == 'result':
                    print(f"[API]   cost_usd: {event.get('cost_usd')}")
                    print(f"[API]   num_turns: {event.get('num_turns')}")
                elif event.get('type') == 'done':
                    print(f"[API]   session_id: {event.get('session_id')}")

                # Format as SSE: data: {json}\n\n
                # Use safe_json_dumps to handle non-serializable objects
                yield f"data: {safe_json_dumps(event)}\n\n"

            print(f"[API] ========== send_message_stream END (total events: {event_count}) ==========\n")
        except Exception as e:
            print(f"[API] ========== send_message_stream ERROR ==========")
            print(f"[API] Exception: {type(e).__name__}: {str(e)}")
            import traceback
            print(f"[API] Traceback:\n{traceback.format_exc()}")
            print(f"[API] ================================================\n")
            # Send error event
            error_event = {
                "type": "error",
                "error": str(e)
            }
            yield f"data: {safe_json_dumps(error_event)}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"  # Disable nginx buffering
        }
    )


@router.post("/sessions/{session_id}/interrupt")
async def interrupt_session(session_id: str):
    """
    Interrupt the current operation in a session.

    Args:
        session_id: The session ID

    Returns:
        Success message
    """
    manager = get_session_manager()
    session = await manager.get_session(session_id)
    await session.interrupt()
    return {"status": "interrupted"}


@router.post("/sessions/{session_id}/permission_mode")
async def set_permission_mode(session_id: str, request: SetPermissionModeRequest):
    """
    Change the permission mode for a session.

    Args:
        session_id: The session ID
        request: Permission mode change request

    Returns:
        Success message with new mode
    """
    manager = get_session_manager()
    session = await manager.get_session(session_id)
    await session.set_permission_mode(request.mode)
    return {"status": "ok", "mode": request.mode}
