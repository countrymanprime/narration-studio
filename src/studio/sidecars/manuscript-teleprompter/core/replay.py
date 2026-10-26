"""
Turn recorded live-ASR output into the tracker calls the host's replay tool runs, offline - no microphone, model or UI.
Takes the JSON Lines file the Moonshine spike writes (`spikes/moonshine_probe.py --events-out`, one record per
partial/final line, each with the wall time it arrived), runs it through the shared event layer, and prints one call a
line: `{"tick": wall}`, then `{"feed": event, "t": wall}` for each engine event. The host's tool tracks them and reports
how the cursor behaved and what was flagged (src/studio/desktop/internal/boothreplay):

    python replay.py --events moonshine-mic-small.jsonl | go run ./cmd/booth-replay --script my-script.txt [--timeline]

A printed `live_asr.py` session needs no Python: `go run ./cmd/booth-replay --stream session.ndjson --script S`.
"""

import argparse
import json
import sys
from collections.abc import Iterator
from pathlib import Path
from types import SimpleNamespace

import numpy as np

_CORE_DIR = Path(__file__).resolve().parent
if str(_CORE_DIR) not in sys.path:
    sys.path.insert(0, str(_CORE_DIR))

import live_asr


class LineTextChanged:
    def __init__(self, line):
        self.line = line


class LineCompleted:
    def __init__(self, line):
        self.line = line


def load_records(path: str) -> list[dict]:
    with open(path, encoding="utf-8") as handle:
        return [json.loads(line) for line in handle if line.strip()]


def _record_line(record: dict) -> SimpleNamespace:
    words = [SimpleNamespace(word=w["word"], start=w["start"], end=w["end"]) for w in record["words"]] or None
    return SimpleNamespace(line_id=record["line_id"], text=record["text"], start_time=record["start"], duration=record["duration"], words=words)


class _RecordedTranscriber:
    """Plays recorded line events back through the same listener interface the
    real Moonshine Transcriber uses, one record per add_audio call."""

    def __init__(self, records: list[dict]) -> None:
        self._pending = iter(records)
        self._listener = None

    def add_listener(self, listener) -> None:
        self._listener = listener

    def start(self) -> None:
        pass

    def stop(self) -> None:
        pass

    def add_audio(self, samples, sample_rate) -> None:
        record = next(self._pending)
        event_class = LineCompleted if record["kind"] == "LineCompleted" else LineTextChanged
        self._listener(event_class(_record_line(record)))


def replay_events(records: list[dict]) -> Iterator[tuple[float, dict]]:
    """Engine events for recorded Moonshine records, each paired with the wall
    time of the record that produced it."""
    clock = {"wall": 0.0}

    def chunks() -> Iterator[np.ndarray]:
        for record in records:
            clock["wall"] = record["wall"]
            yield np.zeros(1, dtype=np.float32)

    for event in live_asr.confirmed_events(live_asr.moonshine_hypotheses(chunks(), _RecordedTranscriber(records))):
        yield clock["wall"], event


def tracker_calls(timed_events: Iterator[tuple[float, dict]]) -> Iterator[dict]:
    """The tracker calls of timed engine events, one JSON object each: `{"tick": wall}`, then `{"feed": event, "t": wall}`,
    for the host's replay tool (`go run ./cmd/booth-replay`, src/studio/desktop) to run through its tracker."""
    for wall, event in timed_events:
        yield {"tick": wall}
        yield {"feed": event, "t": wall}


def main() -> None:
    ap = argparse.ArgumentParser(description="Turn recorded live-ASR output into the tracker calls the host's replay tool runs")
    ap.add_argument("--events", required=True, help="JSON Lines file written by spikes/moonshine_probe.py --events-out")
    args = ap.parse_args()
    for call in tracker_calls(replay_events(load_records(args.events))):
        print(json.dumps(call))


if __name__ == "__main__":
    main()
