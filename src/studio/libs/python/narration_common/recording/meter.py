"""Input level metering at any sample rate.

The Booth's Read Aloud meter and the built-in recorder both report

    {"type": "level", "peak": -12.3, "rms": -24.1}

the meter on the recognizer's own 16 kHz mono chunks (``live_asr.py``, through ``metered``), the recorder on its
native-rate frames,

one per ``report_ms`` of audio (100 ms by default). ``peak`` is the largest absolute sample in the report across every
channel, and ``rms`` the loudest channel's loudest ``window_ms`` window (50 ms), both in dBFS rounded to 0.1 dB, clamped
to 0.0 above full scale and to ``FLOOR_DBFS`` in silence (JSON has no -inf). Samples left over wait for the next block, so
the events come at the same pace whatever size the engine's blocks are. ``clipped`` counts samples at or over full scale
since the meter was made, which the recorder reports with the take.
"""

import math
from collections.abc import Callable, Iterable, Iterator

import numpy as np

FLOOR_DBFS = -100.0
# A float sample this close to 1.0 is a clipped one: the device's converter tops out a step or so below full scale.
CLIP_LEVEL = 0.999


def dbfs(value: float) -> float:
    """An amplitude (1.0 is full scale) in dBFS, between FLOOR_DBFS and 0.0."""
    if not value > 0:
        return FLOOR_DBFS
    return round(min(0.0, max(FLOOR_DBFS, 20 * math.log10(value))), 1)


class LevelMeter:
    """Turns blocks of any size into one ``level`` event per ``report_ms`` of audio."""

    def __init__(self, sample_rate: int, channels: int = 1, window_ms: int = 50, report_ms: int = 100):
        if sample_rate <= 0 or channels < 1:
            raise ValueError(f"a meter needs a positive rate and at least one channel, not {sample_rate} Hz x {channels}")
        if window_ms <= 0 or report_ms % window_ms:
            raise ValueError(f"a report ({report_ms} ms) is a whole number of windows ({window_ms} ms)")
        self.channels = channels
        self.window = max(1, sample_rate * window_ms // 1000)
        self.report = self.window * (report_ms // window_ms)
        self.clipped = 0
        self._pending = np.zeros((0, channels), dtype=np.float32)

    def feed(self, block: np.ndarray) -> list[dict]:
        frames = np.asarray(block, dtype=np.float32).reshape(-1, self.channels)
        frames = np.nan_to_num(frames, nan=0.0)
        self.clipped += int(np.count_nonzero(np.abs(frames) >= CLIP_LEVEL))
        samples = np.concatenate([self._pending, frames])
        whole = len(samples) - len(samples) % self.report
        self._pending = samples[whole:]
        events = []
        for start in range(0, whole, self.report):
            report = samples[start : start + self.report].astype(np.float64)
            windows = report.reshape(-1, self.window, self.channels)
            rms = float(np.sqrt(np.mean(windows * windows, axis=1)).max())
            events.append({"type": "level", "peak": dbfs(float(np.abs(report).max())), "rms": dbfs(rms)})
        return events


def metered(chunks: Iterable[np.ndarray], meter: LevelMeter, report: Callable[[dict], None]) -> Iterator[np.ndarray]:
    """Pass chunks through, reporting each one's levels as it arrives, before the engine sees it."""
    for chunk in chunks:
        for event in meter.feed(chunk):
            report(event)
        yield chunk
