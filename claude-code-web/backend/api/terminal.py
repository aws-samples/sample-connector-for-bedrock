from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional
import asyncio
import json


class CreateSessionRequest(BaseModel):
    rows: int = 24
    cols: int = 80
    cwd: Optional[str] = None
    shell: str = "bash"


class CreateSessionResponse(BaseModel):
    session_id: str
    status: str


class SessionOutputResponse(BaseModel):
    output: str
    seq: int
    exit_code: Optional[int]


class InputRequest(BaseModel):
    data: str


class ResizeRequest(BaseModel):
    rows: int
    cols: int


class SessionStatusResponse(BaseModel):
    session_id: str
    is_alive: bool
    exit_code: Optional[int]
    rows: int
    cols: int
    created_at: str
    last_activity: str


router = APIRouter()


@router.post("/terminal/sessions", response_model=CreateSessionResponse)
async def create_session(request: CreateSessionRequest):
    from ..server import pty_manager

    if not pty_manager:
        raise HTTPException(status_code=503, detail="PTY manager not initialized")

    try:
        session = await pty_manager.create_session(
            rows=request.rows,
            cols=request.cols,
            cwd=request.cwd,
            shell=request.shell
        )
        return CreateSessionResponse(
            session_id=session.session_id,
            status="running"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/terminal/sessions/{session_id}/output", response_model=SessionOutputResponse)
async def get_session_output(session_id: str, seq: int = 0):
    from ..server import pty_manager

    if not pty_manager:
        raise HTTPException(status_code=503, detail="PTY manager not initialized")

    session = pty_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    try:
        output, new_seq = session.get_output_since(seq)
        return SessionOutputResponse(
            output=output,
            seq=new_seq,
            exit_code=session.exit_code
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/terminal/sessions/{session_id}/input")
async def send_input(session_id: str, request: InputRequest):
    from ..server import pty_manager

    if not pty_manager:
        raise HTTPException(status_code=503, detail="PTY manager not initialized")

    session = pty_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if not session.is_alive():
        raise HTTPException(status_code=400, detail="Session is not alive")

    try:
        await session.write_input(request.data)
        return {"status": "ok"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/terminal/sessions/{session_id}/resize")
async def resize_session(session_id: str, request: ResizeRequest):
    from ..server import pty_manager

    if not pty_manager:
        raise HTTPException(status_code=503, detail="PTY manager not initialized")

    session = pty_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    try:
        await session.resize(request.rows, request.cols)
        return {"status": "ok", "rows": request.rows, "cols": request.cols}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/terminal/sessions/{session_id}")
async def close_session(session_id: str):
    from ..server import pty_manager

    if not pty_manager:
        raise HTTPException(status_code=503, detail="PTY manager not initialized")

    success = await pty_manager.close_session(session_id)
    if not success:
        raise HTTPException(status_code=404, detail="Session not found")

    return {"status": "closed"}


@router.get("/terminal/sessions/{session_id}/status", response_model=SessionStatusResponse)
async def get_session_status(session_id: str):
    from ..server import pty_manager

    if not pty_manager:
        raise HTTPException(status_code=503, detail="PTY manager not initialized")

    session = pty_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    return SessionStatusResponse(
        session_id=session.session_id,
        is_alive=session.is_alive(),
        exit_code=session.exit_code,
        rows=session.rows,
        cols=session.cols,
        created_at=session.created_at.isoformat(),
        last_activity=session.last_activity.isoformat()
    )


@router.get("/terminal/sessions")
async def list_sessions():
    from ..server import pty_manager

    if not pty_manager:
        raise HTTPException(status_code=503, detail="PTY manager not initialized")

    sessions = pty_manager.list_sessions()
    return {"sessions": sessions, "count": len(sessions)}


@router.get("/terminal/sessions/{session_id}/stream")
async def stream_session_output(session_id: str):
    """
    Server-Sent Events (SSE) endpoint for streaming terminal output.
    This provides a more efficient alternative to polling.
    """
    from ..server import pty_manager

    if not pty_manager:
        raise HTTPException(status_code=503, detail="PTY manager not initialized")

    session = pty_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    async def event_generator():
        seq = 0
        try:
            while session.is_alive():
                # Get output since last sequence
                output, new_seq = session.get_output_since(seq)

                if output:
                    # Send SSE event with output data
                    event_data = {
                        "output": output,
                        "seq": new_seq,
                        "exit_code": session.exit_code
                    }
                    yield f"data: {json.dumps(event_data)}\n\n"
                    seq = new_seq

                # Small delay to avoid busy-waiting
                await asyncio.sleep(0.05)

            # Send final event when session exits
            final_event = {
                "output": "",
                "seq": seq,
                "exit_code": session.exit_code
            }
            yield f"data: {json.dumps(final_event)}\n\n"
        except Exception as e:
            error_event = {
                "error": str(e),
                "seq": seq
            }
            yield f"data: {json.dumps(error_event)}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"  # Disable nginx buffering
        }
    )
