import asyncio
import os
import uuid
from collections import deque
from datetime import datetime
from typing import Optional, Deque
import pexpect
from pexpect import spawn


class PTYSession:
    def __init__(
        self,
        session_id: Optional[str] = None,
        rows: int = 24,
        cols: int = 80,
        cwd: Optional[str] = None,
        shell: str = "bash",
        max_output_lines: int = 10000
    ):
        self.session_id = session_id or str(uuid.uuid4())
        self.rows = rows
        self.cols = cols
        self.cwd = cwd or os.getcwd()
        self.shell = shell
        self.max_output_lines = max_output_lines

        self.process: Optional[spawn] = None
        self.output_buffer: Deque[bytes] = deque(maxlen=max_output_lines)
        self.output_seq: int = 0
        self.created_at = datetime.utcnow()
        self.last_activity = datetime.utcnow()
        self.exit_code: Optional[int] = None
        self._running = False
        self._output_task: Optional[asyncio.Task] = None

    async def start(self):
        if self._running:
            return

        shell_cmd = self.shell
        if self.shell == "bash":
            shell_cmd = "bash --norc --noprofile"
        elif self.shell == "zsh":
            shell_cmd = "zsh --no-rcs"

        self.process = spawn(
            shell_cmd,
            dimensions=(self.rows, self.cols),
            cwd=self.cwd,
            echo=True,
            encoding='utf-8',
            codec_errors='replace'
        )

        self._running = True
        self._output_task = asyncio.create_task(self._read_output_loop())

    async def _read_output_loop(self):
        loop = asyncio.get_event_loop()

        while self._running and self.process.isalive():
            try:
                output = await loop.run_in_executor(
                    None,
                    lambda: self.process.read_nonblocking(size=4096, timeout=0.1)
                )
                if output:
                    self.output_buffer.append(output.encode('utf-8'))
                    self.output_seq += 1
                    self.last_activity = datetime.utcnow()
            except pexpect.TIMEOUT:
                await asyncio.sleep(0.05)
            except (pexpect.EOF, OSError):
                break
            except Exception:
                await asyncio.sleep(0.1)

        if self.process and not self.process.isalive():
            self.exit_code = self.process.exitstatus
            self._running = False

    async def write_input(self, data: str):
        if not self._running or not self.process:
            raise RuntimeError("Session not running")

        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, self.process.send, data)
        self.last_activity = datetime.utcnow()

    async def resize(self, rows: int, cols: int):
        if not self._running or not self.process:
            raise RuntimeError("Session not running")

        self.rows = rows
        self.cols = cols
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(
            None,
            self.process.setwinsize,
            rows,
            cols
        )
        self.last_activity = datetime.utcnow()

    def get_output_since(self, seq: int) -> tuple[str, int]:
        if seq < self.output_seq - len(self.output_buffer):
            seq = self.output_seq - len(self.output_buffer)

        start_idx = max(0, len(self.output_buffer) - (self.output_seq - seq))
        output_bytes = b''.join(list(self.output_buffer)[start_idx:])

        return output_bytes.decode('utf-8', errors='replace'), self.output_seq

    def is_alive(self) -> bool:
        return self._running and (self.process is not None and self.process.isalive())

    async def close(self):
        self._running = False

        if self._output_task:
            self._output_task.cancel()
            try:
                await self._output_task
            except asyncio.CancelledError:
                pass

        if self.process and self.process.isalive():
            loop = asyncio.get_event_loop()
            try:
                await loop.run_in_executor(None, self.process.terminate, True)
            except:
                pass

            for _ in range(10):
                if not self.process.isalive():
                    break
                await asyncio.sleep(0.1)

            if self.process.isalive():
                try:
                    await loop.run_in_executor(None, self.process.kill, 9)
                except:
                    pass

        self.exit_code = self.process.exitstatus if self.process else -1

    def to_dict(self) -> dict:
        return {
            "session_id": self.session_id,
            "rows": self.rows,
            "cols": self.cols,
            "cwd": self.cwd,
            "shell": self.shell,
            "created_at": self.created_at.isoformat(),
            "last_activity": self.last_activity.isoformat(),
            "is_alive": self.is_alive(),
            "exit_code": self.exit_code,
            "output_seq": self.output_seq
        }
