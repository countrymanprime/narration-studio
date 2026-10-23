"""Shared helpers for the real-Audacity edit tests: loopback signals, export-and-measure, fingerprints, dialogs."""

import hashlib
import itertools
import json
import os
import subprocess
from pathlib import Path

import wavtools

SINK = os.environ.get("NU_AUDACITY_SINK", "nu_null")


def sine_wav(path, freq, seconds, rate=44100, channels=2, amp=0.5):
    """A sine as a WAV file made with ffmpeg: the signal played into the null sink while Audacity records."""
    subprocess.run(
        [
            "ffmpeg",
            "-v",
            "error",
            "-y",
            "-f",
            "lavfi",
            "-i",
            f"sine=frequency={freq}:duration={seconds}:sample_rate={rate}",
            "-af",
            f"volume={amp}",
            "-ac",
            str(channels),
            str(path),
        ],
        check=True,
        timeout=60,
    )
    return Path(path)


def play_into_sink(path):
    """Start playing a WAV into the PulseAudio null sink (Audacity records its monitor). Returns the Popen."""
    return subprocess.Popen(["paplay", f"--device={SINK}", str(path)], stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)


def zero_cross_freq(samples, rate):
    """Frequency estimated from rising zero crossings of a mono sample list."""
    if len(samples) < 4:
        return 0.0
    n = sum(1 for a, b in itertools.pairwise(samples) if a < 0 <= b)
    return n * rate / len(samples)


def sel_tracks(p, idxs):
    p.select_none()
    for n, i in enumerate(idxs):
        p.select_tracks(i, 1, "Set" if n == 0 else "Add")


def project_end(p):
    return max((t["end"] for t in p.tracks() if t["kind"] == "wave"), default=0.0)


def export(t, name, tracks, start=None, end=None, channels=1):
    """Select only `tracks`, select start..end (default: the whole project) and Export2. Returns (path, wav dict)."""
    p = t.pipe
    sel_tracks(p, tracks)
    p.select_time(0 if start is None else start, project_end(p) if end is None else end)
    path = t.work / name
    if path.exists():
        path.unlink()
    p.do(f'Export2: Filename="{path}" NumChannels={channels}')
    return path, wavtools.read_wav(path)


def audio_state(t, name="state.wav"):
    """A hash that sees audio, clips, track names and labels (selection and focus excluded): the stand-in for a change counter."""
    p = t.pipe
    tracks = [{k: v for k, v in tr.items() if k not in ("selected", "focused")} for tr in p.tracks()]
    audio = [i for i, tr in enumerate(p.tracks()) if tr["kind"] == "wave"]
    h = hashlib.sha256()
    h.update(json.dumps([tracks, p.clips(), p.labels()], sort_keys=True).encode())
    if audio and project_end(p) > 0:
        _, wav = export(t, name, audio)
        h.update(wavtools.pcm_hash(wav).encode())
    return h.hexdigest()[:12]


def structure_fp(p):
    """The fingerprint the matrix proposes: tracks (minus selected, focused), clips and labels. It does not see audio."""
    tracks = [{k: v for k, v in tr.items() if k not in ("selected", "focused")} for tr in p.tracks()]
    return hashlib.sha256(json.dumps([tracks, p.clips(), p.labels()], sort_keys=True).encode()).hexdigest()[:12]


def reset_project(p):
    """Remove every track, so the next step starts from an empty project without restarting Audacity."""
    if p.tracks():
        p.do("SelectAll")
        p.do("RemoveTracks")


def new_tone(t, name, seconds, freq=440.0, rate=44100, channels=1, amp=0.5, bursts=None):
    """Write a tone, import it as a new track, return its track index."""
    path = t.work / f"{name}.wav"
    wavtools.write_tone(path, seconds, rate=rate, freq=freq, amp=amp, channels=channels, bursts=bursts)
    before = len(t.pipe.tracks())
    t.pipe.do(f'Import2: Filename="{path}"')
    after = t.pipe.tracks()
    assert len(after) > before, "Import2 added no track"
    return len(after) - 1


def window_titles(t):
    return t.windows()


def dismiss_dialog(t, label):
    """Name what is on screen, screenshot it, and click inside a dialog (the lower middle, where the default button sits)."""
    titles = t.windows()
    shot = t.screenshot(label)
    t.note(f"{label}: windows", "; ".join(titles) or "none listed", titles=titles, screenshot=str(shot) if shot else None)
    return titles


def deterministic_exports(p):
    """Switch dither off, so two exports of the same float audio are byte-identical. Exports are 16-bit by default and the default dither
    (shaped, random) makes a recorded track export differently every time. The keys that count are the *Choice ones, with the words None,
    Rectangle, Triangle or Shaped; the numeric DitherAlgorithm keys are written by Audacity too but are not read; and the change only
    takes effect with Reload=1 (measured, A3-T16)."""
    for key in ("/Quality/DitherAlgorithmChoice", "/Quality/HQDitherAlgorithmChoice"):
        p.do(f'SetPreference: Name="{key}" Value="None" Reload="1"')


def set_sync_lock(p, on):
    """Make Sync-Lock Tracks on or off. SetPreference of /GUI/SyncLockTracks is written but does not change the open project (measured,
    A3-T18); the SyncLock menu command toggles it. The preference mirrors the state once it has been toggled, and is absent on a fresh
    profile, where Sync-Lock is off. Returns the state it left."""
    cur = p.do('GetPreference: Name="/GUI/SyncLockTracks"', expect_ok=False).body.strip() == "1"
    if cur != on:
        p.do("SyncLock")
    now = p.do('GetPreference: Name="/GUI/SyncLockTracks"', expect_ok=False).body.strip() == "1"
    assert now == on, f"SyncLock did not leave Sync-Lock {'on' if on else 'off'}"
    return now
