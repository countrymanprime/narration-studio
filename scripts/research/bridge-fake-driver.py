"""Runs the real REAPER bridge script (integrations/reaper/narration_ui_bridge.lua) against the harness's fake `reaper` in a session folder
the caller names, ticking it like REAPER's defer loop, so the Go host's bridge client can be timed against it end to end.

    python scripts/research/bridge-fake-driver.py <session-dir> [--tick-min-ms 16] [--tick-max-ms 33]

It prints ``READY`` once the bridge is running and ticks until its standard input closes. Used by the ``latency``-tagged Go test
``apps/desktop/internal/latency/bridge_test.go`` (docs/research/2026-10-18-sidecar-start-up-and-bridge-round-trip.md). A research tool, not product code.
"""

from __future__ import annotations

import argparse
import random
import sys
import threading
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TESTS_DIR = ROOT / "integrations" / "reaper" / "tests"
sys.path.insert(0, str(TESTS_DIR))

from lupa.lua54 import LuaRuntime
from run_lua_tests import BOOTSTRAP, build_host


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("session_dir", type=Path)
    parser.add_argument("--tick-min-ms", type=float, default=16.0, help="shortest gap between two defer ticks")
    parser.add_argument("--tick-max-ms", type=float, default=33.0, help="longest gap between two defer ticks")
    args = parser.parse_args()

    session_dir = args.session_dir.resolve()
    session_dir.mkdir(parents=True, exist_ok=True)
    lua = LuaRuntime(unpack_returned_tuples=True)
    host = build_host(lua, TESTS_DIR.parent, session_dir.parent)
    # The harness makes its own session folder; the host names this one.
    host["tmpdir"] = lambda: str(session_dir)
    lua.execute(BOOTSTRAP, host, TESTS_DIR.as_posix())
    harness = lua.eval("(require('harness'))")
    session = harness.session(lua.table_from({"project_path": "C:/Projects/Book/Book.rpp"}))
    # The fake's clock moves one unit per call; the heartbeat (every 1.5 s) should run on real time as it does in REAPER.
    session.fake.reaper.time_precise = time.time

    stop = threading.Event()
    threading.Thread(target=lambda: (sys.stdin.read(), stop.set()), daemon=True).start()
    print("READY", flush=True)
    low, high = args.tick_min_ms / 1000.0, args.tick_max_ms / 1000.0
    while not stop.is_set():
        session.tick(session)
        time.sleep(random.uniform(low, high))
    return 0


if __name__ == "__main__":
    sys.exit(main())
