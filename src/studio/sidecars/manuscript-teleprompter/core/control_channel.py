"""Control channel for the Manuscript Teleprompter. The desktop host tells a running sidecar to pause and resume
listening by appending one JSON object per line to a plain sentinel file (`--control-file PATH`):

    {"cmd": "pause"}
    {"cmd": "resume"}

A seek is the host's own now (src/studio/desktop/internal/teleprompter, follow.go), as is following the read.

This is the same sentinel-file pattern `--stop-file` already uses (docs/architecture/manuscript-teleprompter.md:
no loopback server, no port): the host appends, and this module tails the
file from a saved byte offset every time it is polled, which `live_asr.py`
does once per chunk of its existing capture loop (CHUNK_SECONDS apart), so a
pause takes effect within about one chunk without any extra I/O between polls.

Only whole trailing lines are consumed; a line still being written by the
host is left for the next poll. A line that is not valid JSON, or not an
object, is skipped - a malformed command must never stop the session.
"""

import json
from pathlib import Path


class ControlChannel:
    """Tails `path` for new command lines appended since the last poll."""

    def __init__(self, path: str | None) -> None:
        self._path = Path(path) if path else None
        self._offset = 0

    def poll(self) -> list[dict]:
        """Whole command lines that arrived since the last call, oldest first."""
        if self._path is None:
            return []
        try:
            data = self._path.read_bytes()
        except FileNotFoundError:
            return []
        chunk = data[self._offset :]
        if not chunk:
            return []
        newline = chunk.rfind(b"\n")
        if newline == -1:
            return []
        complete = chunk[: newline + 1]
        self._offset += len(complete)
        commands = []
        for line in complete.decode("utf-8", errors="replace").splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                parsed = json.loads(line)
            except json.JSONDecodeError:
                continue
            if isinstance(parsed, dict):
                commands.append(parsed)
        return commands


def pause_state(command: dict) -> bool | None:
    """True for `{"cmd": "pause"}`, False for `{"cmd": "resume"}`, None for
    anything else - never raises, so one bad command cannot stop the poll loop."""
    return {"pause": True, "resume": False}.get(command.get("cmd")) if isinstance(command.get("cmd"), str) else None
