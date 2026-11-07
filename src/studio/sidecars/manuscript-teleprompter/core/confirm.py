"""The trailing confirmation pass (docs/architecture/manuscript-teleprompter.md, "The trailing confirmation pass").

The live engine (Moonshine) follows the narrator fast and is sometimes wrong about a word. When a segment ends, this
module cuts that segment's audio out of a ring of what the engine heard, has a Whisper-class decoder read it on a worker
thread, and reports the words as a `segment_check` event. The host compares them with the live reading to confirm or
clear the flags the segment raised. Nothing here touches the live path: the cursor never waits for a check, a decode that
fails reports an error for its segment and the session goes on, and a segment whose audio has left the ring is skipped.

Time is the engine's: the ring counts the samples fed to the engine (after pause gating), which is the stream time its
word timings are in.
"""

import math
import queue
import threading
from collections import deque
from collections.abc import Callable, Iterable, Iterator
from typing import Any

import numpy as np
from narration_common.logging_utils import log
from narration_common.ports.capture import SAMPLE_RATE

# Larger than any stream time (a day of audio is 86,400 s); a time past it is garbage, not a place in the ring.
_MAX_SECONDS = 1e7


def _seconds(value: object) -> float | None:
    """`value` as a time in seconds when it is a finite number of sane size (not a bool), else None."""
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or abs(value) >= _MAX_SECONDS:
        return None
    return float(value)


Word = tuple[str, float, float]
Decoder = Callable[[np.ndarray], list[Word]]


class Confirmer:
    """Rechecks closed segments with a second decoder. `load_decoder` is called once, on the worker thread, so a model
    that takes seconds to load never delays the first chunk."""

    def __init__(
        self,
        load_decoder: Callable[[], Decoder],
        sample_rate: int = SAMPLE_RATE,
        keep_seconds: float = 60.0,
        padding_seconds: float = 0.3,
    ):
        self._load_decoder = load_decoder
        self._rate = sample_rate
        self._keep = int(keep_seconds * sample_rate)
        self._padding = padding_seconds
        self._lock = threading.Lock()
        self._chunks: deque[tuple[int, np.ndarray]] = deque()  # (first sample, audio), oldest first
        self._fed = 0
        self._spans: dict[Any, list[float]] = {}  # segment -> [first word start, last word end]
        self._jobs: queue.Queue = queue.Queue()
        self._ready: queue.Queue = queue.Queue()
        self._pending = 0
        self._idle = threading.Condition()
        self._worker = threading.Thread(target=self._work, name="confirm", daemon=True)
        self._worker.start()

    def tee(self, chunks: Iterable[np.ndarray]) -> Iterator[np.ndarray]:
        """Pass `chunks` through unchanged, remembering the most recent `keep_seconds` of them."""
        for chunk in chunks:
            with self._lock:
                self._chunks.append((self._fed, chunk))
                self._fed += len(chunk)
                while self._chunks and self._chunks[0][0] + len(self._chunks[0][1]) < self._fed - self._keep:
                    self._chunks.popleft()
            yield chunk

    def observe(self, event: dict) -> None:
        """Note the span of each segment's confirmed words and queue a check when the segment ends. An event it cannot read
        (not an object, a time that is not a finite number, a segment that is not a number or a string) is ignored."""
        if not isinstance(event, dict):
            return
        kind, segment = event.get("type"), event.get("segment")
        if isinstance(segment, bool) or not isinstance(segment, (int, float, str)):
            return
        if kind == "word":
            start, end = _seconds(event.get("start")), _seconds(event.get("end"))
            if start is None or end is None:
                return
            span = self._spans.setdefault(segment, [start, end])
            span[0], span[1] = min(span[0], start), max(span[1], end)
        elif kind == "segment_end":
            span = self._spans.pop(segment, None)
            audio = self._cut(span) if span else None
            if audio is not None:
                with self._idle:
                    self._pending += 1
                self._jobs.put((segment, *audio))

    def poll(self) -> list[dict]:
        """The checks that finished since the last call, oldest first."""
        out = []
        while True:
            try:
                out.append(self._ready.get_nowait())
            except queue.Empty:
                return out

    def finish(self, timeout: float = 5.0) -> list[dict]:
        """Wait up to `timeout` seconds for the queued checks, then return what finished. The worker is a daemon, so a
        check that is still running does not hold the process open."""
        with self._idle:
            self._idle.wait_for(lambda: self._pending == 0, timeout)
        return self.poll()

    def _cut(self, span: list[float]) -> tuple[np.ndarray, float] | None:
        first = max(0, int((span[0] - self._padding) * self._rate))
        last = int((span[1] + self._padding) * self._rate)
        with self._lock:
            held = list(self._chunks)
            last = min(last, self._fed)
        if not held or first >= last or first < held[0][0] or span[1] < span[0]:
            return None  # empty, or the start has already left the ring
        parts = [chunk[max(0, first - at) : max(0, last - at)] for at, chunk in held if at < last and at + len(chunk) > first]
        audio = np.concatenate(parts) if parts else np.zeros(0, dtype=np.float32)
        return (audio, first / self._rate) if len(audio) else None

    def _work(self) -> None:
        decode: Decoder | None = None
        load_error = None
        while True:
            job = self._jobs.get()
            if job is None:
                return
            segment, audio, offset = job
            event: dict = {"type": "segment_check", "segment": segment}
            try:
                if decode is None and load_error is None:
                    try:
                        decode = self._load_decoder()
                    except Exception as error:  # noqa: BLE001 - a model that will not load turns the pass off, never the session
                        load_error = f"{type(error).__name__}: {error}"
                        log(f"The confirmation model could not be loaded: {load_error}")
                if decode is None:
                    event["error"] = load_error
                else:
                    event["words"] = [
                        {"word": text, "start": round(offset + start, 3), "end": round(offset + max(end, start), 3)}
                        for text, start, end in decode(audio)
                        if text
                    ]
            except Exception as error:  # noqa: BLE001 - one failed decode is that segment's error only
                event = {"type": "segment_check", "segment": segment, "error": f"{type(error).__name__}: {error}"}
            self._ready.put(event)
            with self._idle:
                self._pending -= 1
                self._idle.notify_all()

    def close(self) -> None:
        """Stop the worker after the checks already queued."""
        self._jobs.put(None)
