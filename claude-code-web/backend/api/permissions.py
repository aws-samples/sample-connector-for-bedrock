"""
Permission Management Endpoints.

Provides REST API endpoints for responding to permission requests
from the agent sessions.
"""

from fastapi import APIRouter

from ..core import SessionManager
from ..models import PermissionResponse

router = APIRouter()


def get_session_manager() -> SessionManager:
    """Get the global session manager instance."""
    from ..server import session_manager

    return session_manager


@router.post("/sessions/{session_id}/permissions/respond")
async def respond_to_permission(session_id: str, response: PermissionResponse):
    """
    Respond to a pending permission request.

    Args:
        session_id: The session ID
        response: Permission response

    Returns:
        Success message
    """
    manager = get_session_manager()
    session = await manager.get_session(session_id)
    session.respond_to_permission(
        request_id=response.request_id,
        allowed=response.allowed,
        apply_suggestions=response.apply_suggestions,
    )
    return {"status": "ok"}
