"""`serve` hands SIGTERM to the server process and keeps writing the log file."""

import os
import signal
import stat
import subprocess
import sys
import time
from pathlib import Path

SERVE = Path(__file__).resolve().parents[2] / "serve"

STUB_UV = """#!{python}
import signal, sys, time
from pathlib import Path
def term(*_):
    Path({marker!r}).write_text("x")
    sys.exit(0)
signal.signal(signal.SIGTERM, term)
print("ready", flush=True)
time.sleep(30)
"""


def test_sigterm_to_serve_reaches_the_server(tmp_path):
    script = tmp_path / "serve"
    script.write_text(SERVE.read_text().replace("/app/", f"{tmp_path}/"))
    bindir = tmp_path / "bin"
    bindir.mkdir()
    uv = bindir / "uv"
    uv.write_text(STUB_UV.format(python=sys.executable, marker=str(tmp_path / "got-term")))
    uv.chmod(uv.stat().st_mode | stat.S_IEXEC)

    env = {**os.environ, "PATH": f"{bindir}:{os.environ['PATH']}"}
    proc = subprocess.Popen(["bash", str(script)], env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    try:
        logs = tmp_path / "logs"
        deadline = time.time() + 5
        while time.time() < deadline:
            files = list(logs.glob("server_*.log")) if logs.exists() else []
            if files and "ready" in files[0].read_text():
                break
            time.sleep(0.05)
        else:
            raise AssertionError("server never became ready")
        proc.send_signal(signal.SIGTERM)
        deadline = time.time() + 5
        while time.time() < deadline and not (tmp_path / "got-term").exists():
            time.sleep(0.05)
        assert (tmp_path / "got-term").exists()
        assert "ready" in files[0].read_text()
    finally:
        if proc.poll() is None:
            proc.kill()
        proc.wait()
