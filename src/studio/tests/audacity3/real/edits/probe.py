#!/usr/bin/env python3
"""Exit 0 when the running Audacity answers `Message` and has a project window (what run.sh waits for after a launch)."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from pipe import Pipe, PipeError

try:
    p = Pipe(timeout=10)
    p.connect(deadline=10)
    p.wait_for_project(limit=30)
    p.do("Message: Text=ready")
    p.close()
except PipeError as exc:
    print(f"probe: {exc}")
    sys.exit(1)
