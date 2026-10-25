"""A `--clock` session prints what the host needs to follow the read exactly as this sidecar follows it.

Each seeded session reads a script (the coverage manuscript's chapters, or credits text) through `live_asr`'s real `_run`
twice over the same audio clock and engine events: once tracking here, as today, and once with `--clock`, where the
sidecar only prints a clock line per chunk. Narrators misread, add words, skip ahead, go back, fall silent long enough to
be "waiting", seek, pause and resume, and some start at a word.

`tests/fixtures/booth-parity/live-sessions.golden.jsonl` pins both outputs line for line, with the seeks the host is
given and the clock line each one comes before. The host's `teleprompter` test relays the tracked lines as today and
follows the clock lines itself, and the two streams it sends the UI must be the same. Regenerate with
`UPDATE_CONTRACTS=1` only when the stream changes on purpose, and say why in the PR.
"""

import importlib.util
import io
import json
import os
import random
import sys
from contextlib import redirect_stdout
from pathlib import Path

import numpy as np

CORE = Path(__file__).resolve().parents[1] / "core"
sys.path.insert(0, str(CORE))
from chapter_script import load_chapter_script  # the core directory just added
from control_channel import seek_word

SPEC = importlib.util.spec_from_file_location("live_asr_clock_parity", CORE / "live_asr.py")
live_asr = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(live_asr)

ROOT = Path(__file__).resolve().parents[5]
GOLDEN = ROOT / "tests" / "fixtures" / "booth-parity" / "live-sessions.golden.jsonl"
COVERAGE = "src/studio/sidecars/transcript-compare/tests/fixtures/coverage/manuscript.json"
CHUNK = int(live_asr.SAMPLE_RATE * live_asr.CHUNK_SECONDS)
STEP = 1e-4  # chunk k is filled with (k + 1) * STEP, so the fake engine knows which chunk it heard and every level is finite
CREDITS = [
    "You have been listening to Alice, written by Lewis Carroll,\nnarrated by Ada Finch.\n\nThe End.",
    "Opening credits.\r\nThe Lighthouse, by Ada Finch, read by the author.",
]
FILLERS = ["um", "uh", "chairs", "so", "the", "lighthouse"]


def _plan(rng, words):
    """Engine events and control commands per chunk for a narrator reading `words` from a random place."""
    chunks, position, segment, heard, confirmed, t = [], rng.randrange(max(1, len(words) // 3)), 0, [], 0, 0.0

    def times(start, end):
        kind = rng.random()
        if kind < 0.1:
            return {}
        if kind < 0.2:
            return {"start": int(start), "end": int(end) + 1}
        return {"start": round(start, 3), "end": round(end, 3)}

    def close():
        nonlocal segment, heard, confirmed
        events = [{"type": "word", "segment": segment, "word": w, **times(a, b)} for w, a, b in heard[confirmed:]]
        if heard:
            events.append({"type": "segment_end", "segment": segment})
        segment, heard, confirmed = segment + 1, [], 0
        return events

    for _ in range(rng.randint(30, 70)):
        events, control, t = [], [], t + live_asr.CHUNK_SECONDS
        roll = rng.random()
        if roll < 0.05:
            control.append({"cmd": "seek", "word": rng.randrange(-2, len(words) + 3)})
        elif roll < 0.08:
            control.append({"cmd": "pause"})
        elif roll < 0.12:
            control.append({"cmd": "resume"})
        elif roll < 0.13:
            control.append({"cmd": "seek", "word": "7"})
        if rng.random() < 0.12:  # a silence: the segment ends and nothing is heard
            events += close()
        else:
            for _ in range(rng.choice([0, 1, 1, 1, 2])):
                mistake = rng.random()
                if mistake < 0.06:
                    position += rng.randint(3, 12)
                elif mistake < 0.11:
                    position = max(0, position - rng.randint(3, 8))
                if mistake > 0.92 or position >= len(words):
                    word = rng.choice(FILLERS)
                else:
                    word = words[position].strip(".,;:!?\"'") or words[position]
                    position += 1
                heard.append((word, t - 0.3, t - 0.05))
            if heard:
                events.append({"type": "partial", "segment": segment, "words": [{"word": w, "start": round(a, 3), "end": round(b, 3)} for w, a, b in heard]})
            if len(heard) - confirmed > 2:
                w, a, b = heard[confirmed]
                events.append({"type": "word", "segment": segment, "word": w, **times(a, b)})
                confirmed += 1
            if len(heard) > rng.randint(6, 12):
                events += close()
        if rng.random() < 0.02:
            events.append({"type": "noise", "segment": segment})
        chunks.append({"events": events, "control": control})
    chunks.append({"events": close(), "control": []})
    return chunks


def _run(argv, plan, control):
    """One `_run` of the planned session, as `main` runs it: its stdout lines."""
    ap = live_asr.build_parser()
    args = ap.parse_args(argv)
    live_asr._check_engine_args(ap, args)
    tracker, script_message, _text = live_asr._session_script(ap, args)
    control.write_text("", encoding="utf-8")

    def chunks():
        for index, chunk in enumerate(plan):
            with control.open("a", encoding="utf-8") as fh:
                fh.writelines(json.dumps(command) + "\n" for command in chunk["control"])
            yield np.full(CHUNK, (index + 1) * STEP, dtype=np.float32)

    def stream(audio):
        for chunk in audio:
            yield from plan[round(float(chunk[0]) / STEP) - 1]["events"]

    out = io.StringIO()
    with redirect_stdout(out):
        if script_message:
            live_asr._emit(script_message)
        live_asr._run(args, stream, chunks(), tracker)
    return out.getvalue().split("\n")[:-1]


def _sessions(tmp_path):
    rng = random.Random(2251)
    chapters = json.loads((ROOT / COVERAGE).read_text(encoding="utf-8"))["chapters"]
    for number in range(40):
        if number % 4 == 3:
            text = rng.choice(CREDITS)
            path = tmp_path / f"credits-{number}.txt"
            path.write_bytes(text.encode("utf-8"))
            source, argv = {"text": text}, ["--script", str(path), "--script-id", "credits", "--script-title", "Credits"]
            words = text.split()
        else:
            chapter = rng.choice(chapters)
            source, argv = {"manuscriptPath": COVERAGE, "chapter": chapter["id"]}, ["--manuscript", str(ROOT / COVERAGE), "--chapter", chapter["id"]]
            words = load_chapter_script(ROOT / COVERAGE, chapter["id"]).tokens[:400]
        start = rng.randrange(len(words)) if rng.random() < 0.25 else None
        if start is not None:
            argv += ["--start-word", str(start)]
        plan = _plan(rng, words)
        control = tmp_path / f"session-{number}.control"
        argv = ["--wav", "r.wav", *argv, "--control-file", str(control)]
        # A seek written before chunk k is read as chunk k arrives: after the start's clock line and k chunk lines.
        seeks = [[index + 1, command["word"]] for index, chunk in enumerate(plan) for command in chunk["control"] if seek_word(command) is not None]
        yield {"source": source, "startWord": start, "seeks": seeks, "tracked": _run(argv, plan, control), "clock": _run([*argv, "--clock"], plan, control)}


def test_a_clock_session_prints_the_engine_events_and_a_clock_line_per_chunk(tmp_path):
    sessions = list(_sessions(tmp_path))
    text = "".join(json.dumps(session, ensure_ascii=False, separators=(",", ":")) + "\n" for session in sessions)
    if os.environ.get("UPDATE_CONTRACTS"):
        GOLDEN.write_text(text, encoding="utf-8", newline="\n")
    assert GOLDEN.is_file(), f"no {GOLDEN}: run with UPDATE_CONTRACTS=1 and commit it"
    assert text == GOLDEN.read_text(encoding="utf-8")
    for session in sessions:
        tracked = [json.loads(line) for line in session["tracked"]]
        clocked = [json.loads(line) for line in session["clock"]]
        # The clock lines take the place of the script, position and flag events; everything else is the same lines.
        assert [e for e in tracked if e["type"] not in ("script", "position", "flag")] == [e for e in clocked if e["type"] != "clock"]
        assert {e["type"] for e in clocked} >= {"clock", "level"}
    kinds = {json.loads(line)["type"] for session in sessions for line in session["tracked"]}
    assert kinds >= {"script", "position", "flag", "partial", "word", "segment_end", "level"}
    statuses = {json.loads(line).get("status") for session in sessions for line in session["tracked"]}
    assert statuses >= {"listening", "waiting", "done"}
