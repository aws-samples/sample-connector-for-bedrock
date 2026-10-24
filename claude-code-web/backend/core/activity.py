"""Time of the last real activity, reported by /ping.

AgentCore's idle timeout only fires when the reported timestamp stops moving, so
it is set at process start and moved only by real work, never by a ping.
"""

import time

_last_activity: float = time.time()


def mark_activity(now: float | None = None) -> None:
    global _last_activity
    _last_activity = time.time() if now is None else now


def last_activity() -> int:
    return int(_last_activity)
