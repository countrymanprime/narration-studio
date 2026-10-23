"""pytest plugin: record every ScriptTracker / FlaggingTracker session the tests drive.

Every class object named ScriptTracker or FlaggingTracker (the tests load the modules several times
under different names) gets its __init__/feed/tick/reset_to wrapped. Sessions are written as JSON
lines to $RECORD_OUT at the end of the run, with the outputs the tests saw.
"""

import copy
import gc
import json
import os

_SESSIONS = []
_PATCHED = set()


def _patch(cls, kind):
    if id(cls) in _PATCHED:
        return
    _PATCHED.add(id(cls))
    init, feed, tick, reset_to = cls.__init__, cls.feed, cls.tick, cls.reset_to

    def __init__(self, tokens, *a, **k):
        self._rec = {"kind": kind, "tokens": list(tokens), "ops": [], "outs": []}
        _SESSIONS.append(self._rec)
        init(self, tokens, *a, **k)

    def _feed(self, event, now):
        ev = copy.deepcopy(event)
        out = feed(self, event, now)
        self._rec["ops"].append({"op": "feed", "event": ev, "now": now})
        self._rec["outs"].append(copy.deepcopy(out))
        return out

    def _tick(self, now):
        out = tick(self, now)
        self._rec["ops"].append({"op": "tick", "now": now})
        self._rec["outs"].append(copy.deepcopy(out))
        return out

    def _reset(self, word, now):
        out = reset_to(self, word, now)
        self._rec["ops"].append({"op": "reset", "word": word, "now": now})
        self._rec["outs"].append(copy.deepcopy(out))
        return out

    cls.__init__, cls.feed, cls.tick, cls.reset_to = __init__, _feed, _tick, _reset


def _patch_all():
    for obj in gc.get_objects():
        if isinstance(obj, type) and obj.__name__ in ("ScriptTracker", "FlaggingTracker") and hasattr(obj, "feed"):
            _patch(obj, "tracker" if obj.__name__ == "ScriptTracker" else "flagging")


def pytest_collection_finish(session):
    _patch_all()


def pytest_runtest_setup(item):
    _patch_all()  # modules imported lazily inside a test body


def pytest_sessionfinish(session, exitstatus):
    with open(os.environ["RECORD_OUT"], "w", encoding="utf-8") as fh:
        for rec in _SESSIONS:
            if rec["ops"]:
                fh.write(json.dumps(rec, sort_keys=True) + "\n")
