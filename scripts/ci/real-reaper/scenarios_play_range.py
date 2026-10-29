"""Real-REAPER scenarios, group 5: `play_range` stops REAPER at the end it was given (the end of play of a word, #2251).

The Editing page asks REAPER to play a word and stop at the end of its sound. The stop is `range_tick`'s, a `reaper.defer` tick after the play head
passes the end. A defer loop in REAPER records the play head every frame, so the scenario can say where REAPER really stopped: never earlier than
the end (that would clip the word), and within a few frames after it. The file is a tone with a decay, like a word that thins out.
What it cannot prove (the owner's output latency, delay compensation on the narrator's FX chain) is in docs/operations/reaper-verification-pass.md.
"""

from __future__ import annotations

import math
import struct
import time
import wave
from pathlib import Path

from scenario import Env, scenario

RATE = 44100
EARLY_SLACK_SECONDS = 0.05  # the play head is read once a frame, so the last reading before the stop can be a frame short of the end
LATE_SECONDS = 0.35  # a defer tick or two after the end, plus the audio block REAPER stops on


def make_word(path: Path, seconds: float = 4.0) -> None:
    """440 Hz that swells in 30 ms, holds to 0.6 s and decays to nothing by 1.1 s, then is silent: a word and its tail."""
    frames = bytearray()
    for i in range(int(seconds * RATE)):
        t = i / RATE
        gain = min(1.0, t / 0.03) if t < 0.6 else max(0.0, 1.0 - (t - 0.6) / 0.5)
        frames += struct.pack("<h", int(0.3 * gain * math.sin(2 * math.pi * 440.0 * t) * 32767))
    with wave.open(str(path), "wb") as out:
        out.setnchannels(1)
        out.setsampwidth(2)
        out.setframerate(RATE)
        out.writeframes(bytes(frames))


WATCH = """
    ci.watch = { n = 0, playing = false }
    local w = ci.watch
    local function frame()
      local state = reaper.GetPlayState()
      if state % 2 == 1 then
        w.n, w.playing, w.head, w.at = w.n + 1, true, reaper.GetPlayPosition(), reaper.time_precise()
        if not w.first then w.first = w.head end
      elseif w.playing then
        w.playing, w.stopped_at = false, reaper.time_precise()
      end
      if not w.done then reaper.defer(frame) end
    end
    reaper.defer(frame)
    return true
"""


def watched_play(env: Env, start: float, end: float) -> dict:
    """Plays start..end through the bridge's play_range and answers what the defer loop saw: the last head while playing and the stop's lateness."""
    env.lua(WATCH)
    try:
        env.ok("play_range", f"{start:.6f}", f"{end:.6f}", until="RANGE_PLAYING")
        env.wait_for(lambda: env.lua("return ci.watch.n") > 0, timeout=10, what="REAPER to start playing")
        env.wait_for(lambda: not env.lua("return ci.watch.playing"), timeout=(end - start) + 6, what="REAPER to stop")
        time.sleep(0.2)
        return env.lua("return ci.watch")
    finally:
        env.lua("ci.watch.done = true reaper.OnStopButton() return true")


@scenario(
    "transport_sync",
    "play_range",
    "play_range: REAPER stops at the end it is given, never short of it, for a word and its tail",
    needs_audio=True,
)
def play_range_stops_at_the_end(env: Env) -> str:
    word = env.out / "media" / "word_decay.wav"
    word.parent.mkdir(parents=True, exist_ok=True)
    make_word(word)
    env.lua("local t = ci.add_track('Chapter 1') ci.add_item(t, args[1], 0, 4) ci.save_and_reload(ci.rpp) return true", str(word))
    seen = []
    for start, end in ((0.2, 1.3), (0.5, 0.95), (1.0, 1.4)):
        result = watched_play(env, start, end)
        head = result["head"]
        assert head >= end - EARLY_SLACK_SECONDS, f"play_range({start}, {end}) stopped at {head:.3f}: {end - head:.3f} s short of the end, so the tail is cut"
        assert head <= end + LATE_SECONDS, f"play_range({start}, {end}) ran on to {head:.3f}: {head - end:.3f} s past the end"
        seen.append(f"{start}->{end}: last head {head:.3f} ({head - end:+.3f})")
    return "; ".join(seen)
