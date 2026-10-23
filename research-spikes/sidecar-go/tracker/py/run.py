"""Reference driver: replay tracker sessions through the real Python modules.

    run.py replay SESSIONS.jsonl OUT.jsonl [--check]   # --check: compare to the outputs the tests recorded
    run.py fuzz FUZZ_IN.jsonl FUZZ_OUT.jsonl

Session line: {"kind": "tracker"|"flagging", "tokens": [...], "ops": [{"op": "feed", "event": {...}, "now": t},
{"op": "tick", "now": t}, {"op": "reset", "word": n, "now": t}]}.
Output: one sorted-keys JSON line per emitted event ({"s","o","e"}) and per closed segment ({"s","o","closed"}).
Timing (ns per feed of a partial/word event) goes to OUT.timing.
"""

import json
import sys
import time
from pathlib import Path

CORE = Path("/home/user/narration-studio/sidecars/manuscript-teleprompter/core")
sys.path.insert(0, str(CORE))

import flags  # noqa: E402
import script_tracker as st  # noqa: E402
from narration_common.spoken_forms import spoken_key  # noqa: E402


def _closed(reading):
    loc = reading.location
    return {
        "heard": list(reading.heard),
        "heard_raw": list(reading.heard_raw),
        "anchor": reading.anchor,
        "heard_times": [list(t) if t is not None else None for t in reading.heard_times],
        "location": {
            "read": loc.read,
            "matched": loc.matched,
            "jump": loc.jump,
            "skipped": list(loc.skipped) if loc.skipped else None,
            "start": loc.start,
            "first": loc.first,
        },
    }


def replay(src, dst, check):
    sessions = [json.loads(line) for line in open(src, encoding="utf-8")]
    lines, timings, mismatches = [], [], 0
    t_all = time.perf_counter_ns()
    for si, sess in enumerate(sessions):
        flagging = sess["kind"] == "flagging"
        tracker = flags.FlaggingTracker(sess["tokens"]) if flagging else st.ScriptTracker(sess["tokens"])
        for oi, op in enumerate(sess["ops"]):
            kind = op["op"]
            if kind == "feed":
                ev = op["event"]
                t0 = time.perf_counter_ns()
                out = tracker.feed(ev, op["now"])
                dt = time.perf_counter_ns() - t0
                if ev.get("type") in ("partial", "word"):
                    timings.append(dt)
            elif kind == "tick":
                out = tracker.tick(op["now"])
            else:
                out = tracker.reset_to(op["word"], op["now"])
            if check and "outs" in sess and out != sess["outs"][oi]:
                mismatches += 1
            for e in out:
                lines.append(json.dumps({"s": si, "o": oi, "e": e}, sort_keys=True))
            if not flagging:
                closed = tracker.take_closed_segment()
                if closed is not None:
                    lines.append(json.dumps({"s": si, "o": oi, "closed": _closed(closed)}, sort_keys=True))
    total = time.perf_counter_ns() - t_all
    with open(dst, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines) + ("\n" if lines else ""))
    with open(dst + ".timing", "w") as fh:
        fh.write(json.dumps({"feeds": timings, "total_ns": total}))
    if check:
        print(f"replay vs recorded test outputs: {mismatches} mismatching ops", file=sys.stderr)


def fuzz(src, dst):
    out = []
    for line in open(src, encoding="utf-8"):
        case = json.loads(line)
        kind = case["k"]
        if kind == "norm":
            r = st.normalize_word(case["w"])
        elif kind == "match":
            r = st.words_match(case["a"], case["b"])
        elif kind == "ratio":
            import difflib

            r = repr(difflib.SequenceMatcher(None, case["a"], case["b"]).ratio())
        elif kind == "split":
            r = st.script_words(case["w"])
        elif kind == "key":
            r = spoken_key(case["w"])
        elif kind == "locate":
            loc = st.locate(case["heard"], case["script"], case["anchor"])
            r = [loc.read, loc.matched, loc.jump, list(loc.skipped) if loc.skipped else None, loc.start, loc.first]
        elif kind == "align":
            r = list(st.align(case["heard"], case["script"], case["anchor"]))
        else:
            raise ValueError(kind)
        out.append(json.dumps({"r": r}, sort_keys=True))
    with open(dst, "w", encoding="utf-8") as fh:
        fh.write("\n".join(out) + "\n")


if __name__ == "__main__":
    mode = sys.argv[1]
    if mode == "replay":
        replay(sys.argv[2], sys.argv[3], "--check" in sys.argv)
    else:
        fuzz(sys.argv[2], sys.argv[3])
