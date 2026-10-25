"""What replay.py reports, for the host's replay tool (src/studio/desktop/internal/boothreplay) to reproduce.

The inputs are the 40 live sessions of `tests/fixtures/booth-parity/live-sessions.golden.jsonl`, each replayed two ways:
- as tracker calls (`replay.tracker_calls`' format): a `tick` at each chunk's clock line and a `feed` of each engine
  event at its own clock line, from the `--clock` output;
- as a printed session (`replay.py --stream`): the tracked output's engine events, timed by `stream_events`.

`replay-cases.golden.jsonl` holds, per session and way, `replay.py`'s summary (`json.dumps(..., indent=2)`) and its
`--timeline` lines. `mock-calls.jsonl` holds `spikes/record_mock_stream.py --calls`, the calls behind the browser mock's
`src/studio/ui/src/api/teleprompterRecording.json`, which the host's tool must write as the same JSON, number for number. Regenerate with
`UPDATE_CONTRACTS=1` only when the tracker or the reports change on purpose, and say why in the PR.
"""

import importlib.util
import json
import os
import sys
from pathlib import Path

CORE = Path(__file__).resolve().parents[1] / "core"
SPIKES = Path(__file__).resolve().parents[1] / "spikes"
sys.path.insert(0, str(CORE))
import chapter_script
import replay
from flags import FlaggingTracker

ROOT = Path(__file__).resolve().parents[5]
FIXTURES = ROOT / "tests" / "fixtures" / "booth-parity"


def _load_mock_recorder():
    spec = importlib.util.spec_from_file_location("record_mock_stream", SPIKES / "record_mock_stream.py")
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


def _tokens(source):
    if "text" in source:
        return chapter_script.text_script(source["text"].replace("\r\n", "\n"), "credits", "Credits").tokens
    return chapter_script.load_chapter_script(ROOT / source["manuscriptPath"], source["chapter"]).tokens


def clock_calls(lines):
    """A `--clock` session's output as tracker calls: a tick at each chunk's clock, a feed of each engine event at its own."""
    calls, at = [], 0.0
    for line in lines:
        event = json.loads(line)
        if event["type"] == "clock":
            if event.get("event"):
                at = event["t"]
            else:
                calls.append({"tick": event["t"]})
        elif event["type"] != "level":
            calls.append({"feed": event, "t": at})
    return calls


def run_calls(calls, tokens):
    """The timeline and the confirmed-word count of tracker calls, as `track_events` makes them."""
    tracker = FlaggingTracker(tokens)
    timeline, heard_words = [], 0
    for call in calls:
        if "tick" in call:
            timeline.extend((call["tick"], tracked) for tracked in tracker.tick(call["tick"]))
        else:
            heard_words += call["feed"]["type"] == "word"
            timeline.extend((call["t"], tracked) for tracked in tracker.feed(call["feed"], call["t"]))
    return timeline, heard_words


def _report(timeline, heard_words, tokens):
    return {
        "summary": json.dumps(replay.summarize_timeline(timeline, len(tokens), heard_words, tokens), indent=2),
        "timeline": list(replay.timeline_lines(timeline, tokens)),
    }


def _check(path, text):
    if os.environ.get("UPDATE_CONTRACTS"):
        path.write_text(text, encoding="utf-8", newline="\n")
    assert path.is_file(), f"no {path}: run with UPDATE_CONTRACTS=1 and commit it"
    assert text == path.read_text(encoding="utf-8")


# Printed sessions the live ones do not reach: engine times that are ints (an int equal to the float clock keeps the
# float, as max() keeps the first), a script with curly quotes and an accented word (the summary escapes them), and an
# extra word heard past the script's end.
HANDMADE_SCRIPT = "“Curiouser and curiouser!” cried Alice, naïve as ever. The end."


def _word(word, start, end, segment=0):
    return {"type": "word", "segment": segment, "word": word, "start": start, "end": end}


def _partial(words, segment=0):
    return {"type": "partial", "segment": segment, "words": [{"word": w, "start": a, "end": b} for w, a, b in words]}


HANDMADE = [
    [
        _partial([("curiouser", 0, 1)]),
        _word("curiouser", 0, 1.0),
        _word("and", 1, 2),
        _word("curiouser", 2.0, 3),
        _word("cried", 3, 4),
        {"type": "segment_end", "segment": 0},
        _partial([("alice", 6, 7)], 1),
        _word("alice", 6, 7, 1),
        _word("naive", 7, 8, 1),
        _word("as", 8.0, 9, 1),
        _word("ever", 9, 10, 1),
        {"type": "segment_end", "segment": 1},
    ],
    [
        _word("curiouser", 0.5, 0.9),
        _word("and", 1.0, 1.4),
        _word("curiouser", 1.5, 1.9),
        _word("cried", 2.0, 2.4),
        _word("alice", 2.5, 2.9),
        _word("chairs", 3.0, 3.4),
        _word("as", 3.5, 3.9),
        _word("really", 3.9, 4.0),
        _word("ever", 4.0, 4.4),
        _word("the", 4.5, 4.9),
        _word("end", 5.0, 5.4),
        _word("chairs", 5.5, 5.9),
        _word("again", 6.0, 6.4),
        {"type": "segment_end", "segment": 0},
    ],
    [
        _word("cried", 0, 1),
        _word("alice", 1, 2),
        _word("naive", 2, 3),
        _word("as", 3, 4),
        {"type": "segment_end", "segment": 0},
        _word("curiouser", 10, 11, 1),
        _word("and", 11, 12, 1),
        _word("curiouser", 12, 13, 1),
        _word("cried", 13, 14, 1),
        {"type": "segment_end", "segment": 1},
    ],
]


def test_every_session_replays_to_the_pinned_summary_and_timeline():
    sessions = [json.loads(line) for line in (FIXTURES / "live-sessions.golden.jsonl").read_text(encoding="utf-8").split("\n") if line]
    lines = []
    for session in sessions:
        tokens = _tokens(session["source"])
        lines.append({"way": "calls", **_report(*run_calls(clock_calls(session["clock"]), tokens), tokens)})
        timed = replay.stream_events([json.loads(line) for line in session["tracked"]])
        lines.append({"way": "stream", **_report(*replay.track_events(timed, tokens), tokens)})
    tokens = HANDMADE_SCRIPT.split()
    for events in HANDMADE:
        report = _report(*replay.track_events(replay.stream_events(events), tokens), tokens)
        lines.append({"way": "handmade", "script": HANDMADE_SCRIPT, "stream": [json.dumps(event) for event in events], **report})
    _check(FIXTURES / "replay-cases.golden.jsonl", "".join(json.dumps(line, ensure_ascii=False) + "\n" for line in lines))
    assert len(lines) == 80 + len(HANDMADE)


def test_the_mock_recordings_calls_are_the_recorders_and_give_the_committed_recording():
    recorder = _load_mock_recorder()
    calls = recorder.calls()
    _check(FIXTURES / "mock-calls.jsonl", "".join(json.dumps(line) + "\n" for line in [{"tokens": recorder.TOKENS}, *calls]))
    timeline, _ = run_calls(calls, recorder.TOKENS)
    events = [{"t": round(t, 2), "event": event} for t, event in timeline]
    committed = ROOT / "src" / "studio" / "ui" / "src" / "api" / "teleprompterRecording.json"
    # The committed file is Prettier's layout of what the recorder writes, so the two are compared as JSON, each number as
    # written.
    exact = {"parse_float": str, "parse_int": str}
    written = json.dumps({"tokens": len(recorder.TOKENS), "events": events}, separators=(",", ":"))
    assert json.loads(written, **exact) == json.loads(committed.read_text(encoding="utf-8"), **exact)
