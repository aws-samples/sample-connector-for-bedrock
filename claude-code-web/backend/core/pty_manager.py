import asyncio
from datetime import datetime, timedelta
from typing import Dict, Optional
from .pty_session import PTYSession


class PTYManager:
    def __init__(self, session_timeout_minutes: int = 30, max_sessions_per_user: int = 20):
        self.sessions: Dict[str, PTYSession] = {}
        self.session_timeout_minutes = session_timeout_minutes
        self.max_sessions_per_user = max_sessions_per_user
        self._cleanup_task: Optional[asyncio.Task] = None
        self._running = False

    async def start(self):
        if self._running:
            return
        self._running = True
        self._cleanup_task = asyncio.create_task(self._cleanup_loop())

    async def stop(self):
        self._running = False
        if self._cleanup_task:
            self._cleanup_task.cancel()
            try:
                await self._cleanup_task
            except asyncio.CancelledError:
                pass

        for session in list(self.sessions.values()):
            await session.close()
        self.sessions.clear()

    async def _cleanup_loop(self):
        while self._running:
            try:
                await self._cleanup_inactive_sessions()
                await asyncio.sleep(60)
            except asyncio.CancelledError:
                break
            except Exception:
                await asyncio.sleep(60)

    async def _cleanup_inactive_sessions(self):
        timeout_threshold = datetime.utcnow() - timedelta(minutes=self.session_timeout_minutes)
        sessions_to_remove = []

        for session_id, session in self.sessions.items():
            if session.last_activity < timeout_threshold or not session.is_alive():
                sessions_to_remove.append(session_id)

        for session_id in sessions_to_remove:
            await self.close_session(session_id)

    async def create_session(
        self,
        rows: int = 24,
        cols: int = 80,
        cwd: Optional[str] = None,
        shell: str = "bash",
        user_id: Optional[str] = None
    ) -> PTYSession:
        if user_id:
            user_sessions = [s for s in self.sessions.values() if s.session_id.startswith(user_id)]
            if len(user_sessions) >= self.max_sessions_per_user:
                raise RuntimeError(f"Maximum sessions per user ({self.max_sessions_per_user}) exceeded")

        session = PTYSession(rows=rows, cols=cols, cwd=cwd, shell=shell)
        await session.start()
        self.sessions[session.session_id] = session
        return session

    def get_session(self, session_id: str) -> Optional[PTYSession]:
        return self.sessions.get(session_id)

    async def close_session(self, session_id: str) -> bool:
        session = self.sessions.pop(session_id, None)
        if session:
            await session.close()
            return True
        return False

    def list_sessions(self, user_id: Optional[str] = None) -> list[dict]:
        sessions = list(self.sessions.values())
        if user_id:
            sessions = [s for s in sessions if s.session_id.startswith(user_id)]
        return [s.to_dict() for s in sessions]

    def get_session_count(self) -> int:
        return len(self.sessions)
