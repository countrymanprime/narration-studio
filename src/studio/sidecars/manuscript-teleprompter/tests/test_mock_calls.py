"""`tests/fixtures/booth-parity/mock-calls.jsonl` is what `spikes/record_mock_stream.py` prints: the tracker calls behind
the browser mock's `src/studio/ui/src/api/teleprompterRecording.json`, which the host's replay tool turns into that file
(internal/boothreplay's replay_test.go checks it does). Regenerate with `UPDATE_CONTRACTS=1` when the recorder's scripted
narrator or the event layer changes, and the recording with `python record_mock_stream.py | go run ./cmd/booth-replay
--mock ...`.

`replay-cases.golden.jsonl` beside it was written by replay.py's reports before they moved to the host (2026-10-25); it
is frozen, and only Go reads it.
"""

import importlib.util
import json
import os
import sys
from pathlib import Path

CORE = Path(__file__).resolve().parents[1] / "core"
SPIKES = Path(__file__).resolve().parents[1] / "spikes"
GOLDEN = Path(__file__).resolve().parents[5] / "tests" / "fixtures" / "booth-parity" / "mock-calls.jsonl"


def _load_mock_recorder():
    sys.path.insert(0, str(CORE))
    spec = importlib.util.spec_from_file_location("record_mock_stream", SPIKES / "record_mock_stream.py")
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


def test_the_mock_calls_are_what_the_recorder_prints(capsys, monkeypatch):
    recorder = _load_mock_recorder()
    monkeypatch.setattr(sys, "argv", ["record_mock_stream.py"])
    recorder.main()
    text = capsys.readouterr().out
    if os.environ.get("UPDATE_CONTRACTS"):
        GOLDEN.write_text(text, encoding="utf-8", newline="\n")
    assert text == GOLDEN.read_text(encoding="utf-8")
    calls = [json.loads(line) for line in text.splitlines()]
    assert calls[0] == {"tokens": recorder.TOKENS}
    assert {next(iter(call)) for call in calls[1:]} == {"tick", "feed"}
