#!/usr/bin/env python3
"""Run registered real-Audacity edit tests against the Audacity already running: run_tests.py A3-T14 [A3-T15 ...]"""

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import harness
import tests_edits  # noqa: F401  (registers A3-T14 to T23)
import tests_misc  # noqa: F401  (registers A3-T32, T33, T30)


def main(argv):
    out = os.environ.get("NU_AUDACITY_OUT", "out")
    work = os.environ.get("NU_AUDACITY_TESTWORK", os.path.join(out, "work"))
    if argv and argv[0] == "--list":
        for k, v in sorted(harness.REGISTRY.items()):
            print(k, v["group"], v["title"])
        return 0
    bad = 0
    for tid in argv:
        if tid not in harness.REGISTRY:
            print(f"unknown test {tid}", file=sys.stderr)
            return 2
        result = harness.run_one(tid, out, work)
        print(f"=== {tid} {result['status']} ({result['seconds']} s): {result['title']}", flush=True)
        bad += result["status"] == "FAIL"
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
