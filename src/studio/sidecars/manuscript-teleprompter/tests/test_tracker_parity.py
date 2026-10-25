"""What script_tracker.py answers for the host's port (src/studio/desktop/internal/scripttrack) to reproduce.

The inputs are in tests/fixtures/booth-parity:
- `tracker-sessions.jsonl` holds every tracker session this suite drove when it was recorded (2026-10-25), deduplicated,
  and seeded synthetic reads of the coverage manuscript's chapters, with restarts, skips, seeks, pauses, wobbling
  partials, engine times as ints, floats or missing, and unknown events.
- `flag-sessions.jsonl` names a session of `tracker-sessions.jsonl` and the heading length to flag it with: every
  session with no heading, the ones the suite flagged with the heading it gave, and the synthetic reads with a heading.
- `tracker-cases.jsonl` holds seeded single calls of `normalize_word`, `words_match`, `SequenceMatcher.ratio`, `locate` and
  `align`, with Unicode edge cases and the autojunk path.
- `chapter-scripts.jsonl` holds the chapter_script.py calls this suite made when it was recorded (2026-10-25), with the
  manuscript or text file each read, and seeded synthetic ones: titles with a line-break subtitle, separators, Unicode
  case and space, every kind of paragraph index, broken manuscripts, and credits text with each line ending. A case
  that names `manuscriptPath` (the coverage manuscript, 4.6 MB) is answered with a digest.

The answers are in the `.golden.jsonl` beside them, one line per input line: for a session, each operation's position
events and the segment it closed; for a flag run, each operation's position and flag events; for a chapter script, the
script (tokens, heading, text and `script` event), the ChapterError (message and candidates) or the name of any other
exception it raised. `scripttrack`'s parity test must agree with them. Regenerate with `UPDATE_CONTRACTS=1`
only when the tracker changes on purpose, and say why in the PR.
"""

import base64
import difflib
import hashlib
import importlib.util
import json
import os
import sys
import tempfile
from pathlib import Path

CORE = Path(__file__).resolve().parents[1] / "core"
sys.path.insert(0, str(CORE))
SPEC = importlib.util.spec_from_file_location("script_tracker_parity", CORE / "script_tracker.py")
st = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
sys.modules[SPEC.name] = st
SPEC.loader.exec_module(st)
sys.modules.setdefault("script_tracker", st)
import chapter_script
import flags

ROOT = Path(__file__).resolve().parents[5]
FIXTURES = ROOT / "tests" / "fixtures" / "booth-parity"


def dump(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True)


def closed_json(reading):
    if reading is None:
        return None
    location = reading.location
    return {
        "heard": list(reading.heard),
        "heardRaw": list(reading.heard_raw),
        "anchor": reading.anchor,
        "heardTimes": [list(times) if times is not None else None for times in reading.heard_times],
        "location": {
            "read": location.read,
            "matched": location.matched,
            "jump": location.jump,
            "skipped": list(location.skipped) if location.skipped else None,
            "start": location.start,
            "first": location.first,
        },
    }


def replay(session):
    tracker = st.ScriptTracker(session["tokens"])
    outs, closed = [], []
    for op in session["ops"]:
        if op["op"] == "feed":
            out = tracker.feed(op["event"], op["now"])
        elif op["op"] == "tick":
            out = tracker.tick(op["now"])
        else:
            out = tracker.reset_to(op["word"], op["now"])
        outs.append(out)
        closed.append(closed_json(tracker.take_closed_segment()))
    return {"outs": outs, "closed": closed}


def answer(case):
    kind = case["k"]
    if kind == "norm":
        return st.normalize_word(case["w"])
    if kind == "match":
        return st.words_match(case["a"], case["b"])
    if kind == "ratio":
        return repr(difflib.SequenceMatcher(None, case["a"], case["b"]).ratio())
    if kind == "locate":
        location = st.locate(case["heard"], case["script"], case["anchor"])
        return [location.read, location.matched, location.jump, list(location.skipped) if location.skipped else None, location.start, location.first]
    if kind == "align":
        return list(st.align(case["heard"], case["script"], case["anchor"]))
    raise ValueError(kind)


def check(name, render):
    inputs = [json.loads(line) for line in (FIXTURES / f"{name}.jsonl").read_text(encoding="utf-8").split("\n") if line]
    text = "".join(dump(render(item)) + "\n" for item in inputs)
    golden = FIXTURES / f"{name}.golden.jsonl"
    if os.environ.get("UPDATE_CONTRACTS"):
        golden.write_text(text, encoding="utf-8", newline="\n")
    assert golden.is_file(), f"no {golden}: run with UPDATE_CONTRACTS=1 and commit it"
    assert text == golden.read_text(encoding="utf-8")
    return inputs


def test_every_recorded_session_gives_the_pinned_positions_and_closed_segments():
    sessions = check("tracker-sessions", replay)
    assert len(sessions) > 300


def flag_run(sessions):
    def run(item):
        session = sessions[item["session"]]
        tracker = flags.FlaggingTracker(session["tokens"], heading=item["heading"])
        outs = []
        for op in session["ops"]:
            if op["op"] == "feed":
                outs.append(tracker.feed(op["event"], op["now"]))
            elif op["op"] == "tick":
                outs.append(tracker.tick(op["now"]))
            else:
                outs.append(tracker.reset_to(op["word"], op["now"]))
        return {"outs": outs}

    return run


def test_every_flag_run_gives_the_pinned_positions_and_flags():
    sessions = [json.loads(line) for line in (FIXTURES / "tracker-sessions.jsonl").read_text(encoding="utf-8").split("\n") if line]
    runs = check("flag-sessions", flag_run(sessions))
    assert {run["heading"] for run in runs} > {0}


def test_every_single_call_gives_the_pinned_answer():
    cases = check("tracker-cases", lambda case: {"r": answer(case)})
    assert {case["k"] for case in cases} == {"norm", "match", "ratio", "locate", "align"}


def _written(case, key, folder):
    """The file a chapter-script case reads: its text (or bytes) written out, or a path that does not exist."""
    path = Path(folder) / "input"
    if case.get(key + "Base64") is not None:
        path.write_bytes(base64.b64decode(case[key + "Base64"]))
    elif case.get(key) is not None:
        path.write_bytes(case[key].encode("utf-8"))
    return path


def script_answer(case):
    with tempfile.TemporaryDirectory() as folder:
        try:
            if case["k"] == "text":
                script = chapter_script.text_script(case["text"], case["id"], case["title"])
            elif case["k"] == "textfile":
                script = chapter_script.load_text_script(_written(case, "text", folder), case["id"], case["title"])
            else:
                path = ROOT / case["manuscriptPath"] if "manuscriptPath" in case else _written(case, "manuscript", folder)
                script = chapter_script.load_chapter_script(path, case["chapter"])
        except chapter_script.ChapterError as error:
            message = str(error)
            if case["k"] == "textfile" and message.startswith("Could not read"):
                message = message.split(":")[0]  # the rest is the OSError's own text
            return {"error": message, "candidates": error.candidates}
        except Exception as error:  # noqa: BLE001 - the case pins that this input fails, not how
            return {"crash": type(error).__name__}
    answer = {"tokens": script.tokens, "heading": script.heading, "text": script.text, "event": chapter_script.script_event(script)}
    if "manuscriptPath" in case:
        return {"tokenCount": len(script.tokens), "sha256": hashlib.sha256(dump(answer).encode("utf-8")).hexdigest()}
    return answer


def test_every_chapter_script_gives_the_pinned_script_or_error():
    cases = check("chapter-scripts", script_answer)
    assert {case["k"] for case in cases} == {"chapter", "text", "textfile"}
