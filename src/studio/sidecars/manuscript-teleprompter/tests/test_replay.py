import importlib.util
import json
from pathlib import Path

REPLAY_PATH = Path(__file__).resolve().parents[1] / "core" / "replay.py"
SPEC = importlib.util.spec_from_file_location("replay", REPLAY_PATH)
replay = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(replay)


def _record(kind, wall, line_id, text):
    words = [{"word": w.strip(".,"), "start": round(0.2 * i, 3), "end": round(0.2 * i + 0.15, 3)} for i, w in enumerate(text.split())]
    return {"kind": kind, "wall": wall, "line_id": line_id, "text": text, "start": 0.0, "duration": 0.2 * len(words), "words": words, "latency_ms": 10}


def _reading():
    return [
        _record("LineTextChanged", 1.0, 5, "the old"),
        _record("LineTextChanged", 1.5, 5, "the old lighthouse keeper"),
        _record("LineTextChanged", 2.0, 5, "the old lighthouse keeper climbed"),
        _record("LineCompleted", 2.6, 5, "the old lighthouse keeper climbed"),
    ]


def test_replay_events_stamp_each_engine_event_with_the_wall_time_of_its_record():
    events = list(replay.replay_events(_reading()))

    assert events[0][0] == 1.0
    assert events[0][1]["type"] == "partial"
    first_word = next(item for item in events if item[1]["type"] == "word")
    assert first_word[0] == 1.5
    assert events[-1][1] == {"type": "segment_end", "segment": 0}
    assert events[-1][0] == 2.6


def test_load_records_reads_json_lines(tmp_path):
    path = tmp_path / "events.jsonl"
    path.write_text("\n".join(json.dumps(r) for r in _reading()) + "\n", encoding="utf-8")

    assert replay.load_records(str(path)) == _reading()


def test_loaded_as_a_script_it_puts_its_own_folder_on_the_import_path(monkeypatch):
    """`python replay.py` from anywhere finds its siblings: the module adds core/ to sys.path when it is not there yet,
    whichever test (or sidecar module) happened to add it first in this run."""
    import sys

    core = str(REPLAY_PATH.parent)
    monkeypatch.setattr(sys, "path", [entry for entry in sys.path if entry != core])
    spec = importlib.util.spec_from_file_location("replay_fresh", REPLAY_PATH)
    fresh = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(fresh)

    assert sys.path[0] == core


def test_the_cli_prints_a_tick_then_a_feed_per_engine_event_for_the_hosts_tool(tmp_path, capsys, monkeypatch):
    records = [_record("LineCompleted", 2.0, 5, "the old lighthouse")]
    recording = tmp_path / "recording.jsonl"
    recording.write_text("\n".join(json.dumps(r) for r in records) + "\n", encoding="utf-8")
    monkeypatch.setattr("sys.argv", ["replay.py", "--events", str(recording)])

    replay.main()

    calls = [json.loads(line) for line in capsys.readouterr().out.splitlines()]
    events = list(replay.replay_events(records))
    assert calls == [call for wall, event in events for call in ({"tick": wall}, {"feed": event, "t": wall})]
    assert calls[-1]["feed"]["type"] == "segment_end"
