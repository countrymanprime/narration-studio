"""Spike, not shipped: a warm stdio worker for ``manuscript_guide.py`` (docs/research/story-bible-mutation-path.md).

It runs the sidecar's own command line in one long-lived process instead of one process per command, so a Story Bible mutation
pays the interpreter start and the module import once. Nothing in the app starts it; the Go spike in
``src/studio/desktop/internal/spike/guidemutation`` drives it under the ``spike`` build tag to measure it.

The protocol is NDJSON over stdin and stdout, one request and one response per line, answered in order:

- request ``{"id": 1, "argv": ["edit", "--guide", "...", ...], "run": "<run id>"}``: ``argv`` is exactly what the host passes the
  sidecar today (``guide.Service.Run``), and ``run`` (optional) stands in for the ``NARRATION_RUN_ID`` a spawned process inherits.
- response ``{"id": 1, "code": 0, "stdout": "EDITED|...", "stderr": "..."}``: the exit code and both streams a spawn would have
  produced, so the host can treat the two transports the same.

The worker exits when stdin closes, and on its own after ``--idle-seconds`` (default 60) without a request. It opens no port and
listens on nothing. It re-reads the guide file on every command, as a spawn does, so a writer it does not know about (a build run
as its own process) is never overwritten with a stale copy.
"""

from __future__ import annotations

import argparse
import contextlib
import io
import json
import os
import queue
import sys
import threading
from pathlib import Path

_CORE = Path(__file__).resolve().parents[1] / "core"
if str(_CORE) not in sys.path:
    sys.path.insert(0, str(_CORE))

import manuscript_guide

# The commands the worker refuses: the long jobs and the ones that load a model or a voice, which stay one process each so a crash or
# a cancel there never takes the warm worker with it.
SPAWN_ONLY = {"build", "render-audio", "self-check", "suggest"}


def run_command(argv: list[str], run_id: str | None) -> dict[str, object]:
    """Runs one command line through ``manuscript_guide.main`` and returns what a spawned process would have: code, stdout, stderr."""
    if not argv or argv[0] in SPAWN_ONLY:
        return {"code": 2, "stdout": "", "stderr": f"the worker does not run {argv[0] if argv else 'an empty command'}; spawn it"}
    out, err = io.StringIO(), io.StringIO()
    previous_argv, previous_run = sys.argv, os.environ.get("NARRATION_RUN_ID")
    sys.argv = ["manuscript_guide.py", *argv]
    if run_id:
        os.environ["NARRATION_RUN_ID"] = run_id
    code = 0
    try:
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            manuscript_guide.main()
    except SystemExit as exit_:
        code = exit_.code if isinstance(exit_.code, int) else 1
    finally:
        sys.argv = previous_argv
        if previous_run is None:
            os.environ.pop("NARRATION_RUN_ID", None)
        else:
            os.environ["NARRATION_RUN_ID"] = previous_run
    return {"code": code, "stdout": out.getvalue(), "stderr": err.getvalue()}


def serve(stdin, stdout, idle_seconds: float) -> None:
    """Answers requests until stdin closes or nothing arrives for ``idle_seconds``. Lines are read on a thread so the idle timeout
    works on a Windows pipe, which ``select`` cannot wait on."""
    lines: queue.Queue[str | None] = queue.Queue()

    def read() -> None:
        for line in stdin:
            lines.put(line)
        lines.put(None)

    threading.Thread(target=read, daemon=True).start()
    while True:
        try:
            line = lines.get(timeout=idle_seconds)
        except queue.Empty:
            return
        if line is None:
            return
        if not line.strip():
            continue
        try:
            request = json.loads(line)
            response = {"id": request.get("id"), **run_command(list(request["argv"]), request.get("run"))}
        except (ValueError, KeyError, TypeError) as exc:
            response = {"id": None, "code": 2, "stdout": "", "stderr": f"bad request: {exc}"}
        stdout.write(json.dumps(response, ensure_ascii=False) + "\n")
        stdout.flush()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--idle-seconds", type=float, default=60.0)
    args = parser.parse_args()
    stdin = io.TextIOWrapper(sys.stdin.buffer, encoding="utf-8")
    stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", write_through=True)
    serve(stdin, stdout, args.idle_seconds)


if __name__ == "__main__":
    main()
