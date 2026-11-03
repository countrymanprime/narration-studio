"""confirm.py: the trailing confirmation pass cuts a closed segment's audio, has a second decoder read it off the live path
and reports `segment_check`, whatever the decoder does."""

import importlib.util
import sys
from pathlib import Path

import numpy as np

CORE = Path(__file__).resolve().parents[1] / "core"
sys.path.insert(0, str(CORE))
SPEC = importlib.util.spec_from_file_location("confirm", CORE / "confirm.py")
confirm = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(confirm)

RATE = 16000


def _second(value: float) -> np.ndarray:
    return np.full(RATE, value, dtype=np.float32)


def _feed(confirmer, seconds: int):
    return list(confirmer.tee(_second(float(n)) for n in range(seconds)))


def _word(segment, start, end, text="hello"):
    return {"type": "word", "segment": segment, "word": text, "start": start, "end": end}


def test_a_closed_segment_is_decoded_from_its_own_audio_in_stream_time():
    seen = []

    def decode(audio):
        seen.append(audio.copy())
        return [("hello", 0.1, 0.4), ("", 0.4, 0.5)]

    confirmer = confirm.Confirmer(lambda: decode, padding_seconds=0.0)
    _feed(confirmer, 6)
    confirmer.observe(_word(0, 2.0, 3.0))
    confirmer.observe({"type": "segment_end", "segment": 0})

    got = confirmer.finish()

    assert got == [{"type": "segment_check", "segment": 0, "words": [{"word": "hello", "start": 2.1, "end": 2.4}]}]
    assert len(seen[0]) == RATE and set(seen[0].tolist()) == {2.0}, "the second of audio the words span, nothing before or after"


def test_the_cut_is_padded_on_both_sides():
    seen = []
    confirmer = confirm.Confirmer(lambda: lambda audio: seen.append(len(audio)) or [], padding_seconds=0.5)
    _feed(confirmer, 6)
    confirmer.observe(_word(0, 2.0, 3.0))
    confirmer.observe({"type": "segment_end", "segment": 0})
    confirmer.finish()
    assert seen == [2 * RATE]


def test_a_decoder_that_hears_nothing_reports_no_words_not_an_error():
    confirmer = confirm.Confirmer(lambda: lambda audio: [])
    _feed(confirmer, 4)
    confirmer.observe(_word(0, 1.0, 2.0))
    confirmer.observe({"type": "segment_end", "segment": 0})
    assert confirmer.finish() == [{"type": "segment_check", "segment": 0, "words": []}]


def test_a_decode_that_fails_is_that_segments_error_and_the_next_still_runs():
    calls = []

    def decode(audio):
        calls.append(1)
        if len(calls) == 1:
            raise RuntimeError("out of memory")
        return [("ok", 0.0, 0.1)]

    confirmer = confirm.Confirmer(lambda: decode)
    _feed(confirmer, 8)
    for segment, start in ((0, 1.0), (1, 5.0)):
        confirmer.observe(_word(segment, start, start + 1))
        confirmer.observe({"type": "segment_end", "segment": segment})
    first, second = confirmer.finish()
    assert first["segment"] == 0 and "out of memory" in first["error"] and "words" not in first
    assert second["segment"] == 1 and second["words"][0]["word"] == "ok"


def test_a_model_that_will_not_load_turns_the_pass_off_with_an_error_per_segment():
    def broken():
        raise OSError("model files missing")

    confirmer = confirm.Confirmer(broken)
    _feed(confirmer, 6)
    for segment, start in ((0, 1.0), (1, 3.0)):
        confirmer.observe(_word(segment, start, start + 1))
        confirmer.observe({"type": "segment_end", "segment": segment})
    got = confirmer.finish()
    assert [event["segment"] for event in got] == [0, 1]
    assert all("model files missing" in event["error"] for event in got)


def test_a_segment_whose_audio_left_the_ring_is_skipped():
    confirmer = confirm.Confirmer(lambda: lambda audio: [("x", 0.0, 0.1)], keep_seconds=3.0)
    _feed(confirmer, 10)
    confirmer.observe(_word(0, 1.0, 2.0))
    confirmer.observe({"type": "segment_end", "segment": 0})
    assert confirmer.finish() == []


def test_a_segment_with_no_confirmed_words_or_a_backwards_span_queues_nothing():
    confirmer = confirm.Confirmer(lambda: lambda audio: [("x", 0.0, 0.1)])
    _feed(confirmer, 4)
    confirmer.observe({"type": "segment_end", "segment": 0})
    confirmer.observe({"type": "word", "segment": 1, "word": "no times"})
    confirmer.observe({"type": "segment_end", "segment": 1})
    assert confirmer.finish() == []


def test_tee_passes_every_chunk_through_unchanged():
    confirmer = confirm.Confirmer(lambda: lambda audio: [])
    chunks = [_second(1.0), _second(2.0)]
    assert [c.tolist() == o.tolist() for c, o in zip(confirmer.tee(iter(chunks)), chunks, strict=True)] == [True, True]


def test_poll_returns_only_what_finished_and_finish_times_out_on_a_stuck_decode():
    import threading

    release = threading.Event()
    confirmer = confirm.Confirmer(lambda: lambda audio: release.wait(10) and [])
    _feed(confirmer, 4)
    confirmer.observe(_word(0, 1.0, 2.0))
    confirmer.observe({"type": "segment_end", "segment": 0})
    assert confirmer.poll() == []
    assert confirmer.finish(timeout=0.05) == []
    release.set()
    assert confirmer.finish()[0]["segment"] == 0
