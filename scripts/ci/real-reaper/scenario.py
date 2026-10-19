"""What the real-REAPER scenario suites share: an arrange/act/assert environment over the bridge's file protocol.

A scenario arranges a scratch project with a Lua snippet (`ci_exec`, integrations/reaper/spikes/ci_real_reaper_lib.lua), acts by
sending the product's own bridge commands, and asserts on what REAPER holds afterwards: items, takes, volumes, envelopes, FX,
markers, undo labels, a saved-and-reopened project and, where "is it audible" matters, the samples of a rendered file.
Design and limits: docs/research/real-reaper-ci-integration.md.
"""

from __future__ import annotations

import json
import math
import struct
import textwrap
import time
import wave
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path

from drive import Report, Session, last

TONES = {"tone_a": 440.0, "tone_b": 660.0, "tone_c": 880.0}  # one pitch per file, so a render says which file played


def make_tone(path: Path, hz: float, seconds: float, rate: int = 44100, amplitude: float = 0.3) -> None:
    frames = bytearray()
    for i in range(int(seconds * rate)):
        frames += struct.pack("<h", int(amplitude * math.sin(2 * math.pi * hz * i / rate) * 32767))
    with wave.open(str(path), "wb") as out:
        out.setnchannels(1)
        out.setsampwidth(2)
        out.setframerate(rate)
        out.writeframes(bytes(frames))


def make_steps(path: Path, seconds: float = 30.0, step: float = 5.0, rate: int = 44100, amplitude: float = 0.3) -> None:
    """A file whose pitch changes every `step` seconds (tone_a, tone_b, tone_c, tone_a, ...): a render says which part of it played."""
    pitches = list(TONES.values())
    frames = bytearray()
    for i in range(int(seconds * rate)):
        hz = pitches[int(i / rate / step) % len(pitches)]
        frames += struct.pack("<h", int(amplitude * math.sin(2 * math.pi * hz * i / rate) * 32767))
    with wave.open(str(path), "wb") as out:
        out.setnchannels(1)
        out.setsampwidth(2)
        out.setframerate(rate)
        out.writeframes(bytes(frames))


def make_click(path: Path, at: float = 5.0, seconds: float = 12.0, rate: int = 44100) -> None:
    """tone_a with a loud 2 ms click at `at`: a mouth click for repair_click to dip."""
    frames = bytearray()
    for i in range(int(seconds * rate)):
        t = i / rate
        value = 0.2 * math.sin(2 * math.pi * 440.0 * t)
        if at <= t < at + 0.002:
            value = 0.9 if (i // 8) % 2 else -0.9
        frames += struct.pack("<h", int(value * 32767))
    with wave.open(str(path), "wb") as out:
        out.setnchannels(1)
        out.setsampwidth(2)
        out.setframerate(rate)
        out.writeframes(bytes(frames))


def make_media(directory: Path) -> dict[str, Path]:
    """Writes tone_a/b/c.wav (30 s each, 440/660/880 Hz), steps.wav and click.wav; answers name -> path."""
    directory.mkdir(parents=True, exist_ok=True)
    out = {}
    for name, hz in TONES.items():
        out[name] = directory / f"{name}.wav"
        if not out[name].exists():
            make_tone(out[name], hz, 30.0)
    out["steps"] = directory / "steps.wav"
    if not out["steps"].exists():
        make_steps(out["steps"])
    out["click"] = directory / "click.wav"
    if not out["click"].exists():
        make_click(out["click"])
    return out


class Wav:
    """A PCM or float WAV read whole: mono mix, the sample rate and per-window level and pitch measurements."""

    def __init__(self, path: Path) -> None:
        data = path.read_bytes()
        assert data[:4] == b"RIFF" and data[8:12] == b"WAVE", f"{path.name} is not a WAV"
        pos, fmt, body = 12, None, b""
        while pos + 8 <= len(data):
            tag, size = data[pos : pos + 4], struct.unpack("<I", data[pos + 4 : pos + 8])[0]
            chunk = data[pos + 8 : pos + 8 + size]
            if tag == b"fmt ":
                fmt = struct.unpack("<HHIIHH", chunk[:16])
            elif tag == b"data":
                body = chunk
            pos += 8 + size + (size & 1)
        assert fmt and body, "no fmt or data chunk"
        self.format, self.channels, self.rate, _, _, self.bits = fmt
        width = self.bits // 8
        frames = len(body) // (width * self.channels)
        self.frames = frames
        self.samples = [0.0] * frames
        for i in range(frames):
            total = 0.0
            for c in range(self.channels):
                at = (i * self.channels + c) * width
                raw = body[at : at + width]
                if self.format == 3:
                    value = struct.unpack("<f" if width == 4 else "<d", raw)[0]
                elif width == 2:
                    value = struct.unpack("<h", raw)[0] / 32768.0
                elif width == 3:
                    value = int.from_bytes(raw, "little", signed=True) / 8388608.0
                else:
                    value = struct.unpack("<i", raw)[0] / 2147483648.0
                total += value
            self.samples[i] = total / self.channels

    @property
    def seconds(self) -> float:
        return self.frames / self.rate

    def window(self, start: float, end: float) -> list[float]:
        return self.samples[int(start * self.rate) : int(end * self.rate)]

    def rms(self, start: float, end: float) -> float:
        w = self.window(start, end)
        return math.sqrt(sum(s * s for s in w) / len(w)) if w else 0.0

    def peak(self, start: float, end: float) -> float:
        return max((abs(s) for s in self.window(start, end)), default=0.0)

    def tone(self, start: float, end: float, hz: float) -> float:
        """The amplitude of `hz` in the window (Goertzel), so a window says which pitch it holds."""
        w = self.window(start, end)
        if not w:
            return 0.0
        k = 2 * math.pi * hz / self.rate
        coeff, s1, s2 = 2 * math.cos(k), 0.0, 0.0
        for sample in w:
            s1, s2 = sample + coeff * s1 - s2, s1
        power = s1 * s1 + s2 * s2 - coeff * s1 * s2
        return 2 * math.sqrt(max(power, 0.0)) / len(w)

    def pitch(self, start: float, end: float) -> str:
        """The name of the TONES file the window plays, "silence" when it is quiet, "mixed" when no pitch clearly dominates."""
        if self.rms(start, end) < 0.005:
            return "silence"
        levels = sorted(((self.tone(start, end, hz), name) for name, hz in TONES.items()), reverse=True)
        return levels[0][1] if levels[0][0] > 4 * levels[1][0] else "mixed"


def db(ratio: float) -> float:
    return 20 * math.log10(ratio) if ratio > 0 else -math.inf


@dataclass
class Env:
    """Everything a scenario reaches REAPER through."""

    session: Session
    out: Path
    fixture: dict
    media: dict[str, Path]
    audio_mode: str = "closed"
    snippets: int = 0
    renders: int = 0
    notes: list[str] = field(default_factory=list)

    # -- arrange / read -------------------------------------------------------------------------------------------------
    def lua(self, code: str, *args: object, timeout: float = 60.0):
        """Runs a Lua snippet in REAPER with `ci` (ci_real_reaper_lib.lua) and `args` in scope; answers its returned value."""
        self.snippets += 1
        file = self.out / "snippets" / f"s{self.snippets:04d}.lua"
        file.parent.mkdir(parents=True, exist_ok=True)
        file.write_text(textwrap.dedent(code), encoding="utf-8", newline="\n")
        events = self.session.ask("ci_exec", str(file), *args, until={"CI_RESULT"}, timeout=timeout)
        final = events[-1]
        if final[0] == "ERROR":
            raise AssertionError(f"snippet failed: {final[2:]}")
        return json.loads(final[2])

    def lua_async(self, code: str, *args: object) -> str:
        """Sends a Lua snippet without waiting for it; answers its run id (CI_RESULT arrives when REAPER gets to it)."""
        self.snippets += 1
        file = self.out / "snippets" / f"s{self.snippets:04d}.lua"
        file.parent.mkdir(parents=True, exist_ok=True)
        file.write_text(textwrap.dedent(code), encoding="utf-8", newline="\n")
        return self.session.send("ci_exec", str(file), *args)

    def reset(self) -> None:
        """An empty, saved project with no undo history, no recording and the transport stopped."""
        self.lua("reaper.OnStopButton() ci.reset(ci.rpp) return true")

    def snapshot(self) -> dict:
        return self.lua("return ci.snapshot()")

    def witness(self, *except_tracks: str, markers: bool = True) -> str:
        """Every track's state chunk but the named ones' (and the markers): equal before and after means a command touched none of it (row A10)."""
        return self.lua("return ci.witness({ table.unpack(args, 2) }, args[1] == '1')", "1" if markers else "0", *except_tracks)

    def media_path(self, name: str) -> str:
        return str(self.media[name])

    # -- act ------------------------------------------------------------------------------------------------------------
    def send(self, command: str, *args: object, until: set[str] | str, timeout: float = 30.0) -> list[list[str]]:
        wanted = {until} if isinstance(until, str) else set(until)
        return self.session.ask(command, *args, until=wanted, timeout=timeout)

    def ok(self, command: str, *args: object, until: str, timeout: float = 30.0) -> list[str]:
        """Sends a command that must succeed; answers the `until` event's fields (tag, run, ...)."""
        events = self.send(command, *args, until=until, timeout=timeout)
        assert events[-1][0] == until, f"{command}: expected {until}, got {events}"
        return events[-1]

    def refused(self, command: str, *args: object, tag: str = "ERROR", until: set[str] | str | None = None) -> list[str]:
        """Sends a command that must be refused with `tag`; answers the event."""
        wanted = {tag} if until is None else ({until} if isinstance(until, str) else set(until)) | {tag}
        events = self.send(command, *args, until=wanted)
        assert events[-1][0] == tag, f"{command}: expected {tag}, got {events}"
        return events[-1]

    def start(self, command: str, *args: object) -> str:
        """Sends a command without waiting; answers its run id (for events that come later, such as RECORD_ENDED)."""
        return self.session.send(command, *args)

    def wait_event(self, run: str, tag: str, *, timeout: float = 20.0) -> list[str]:
        """The first event `tag` carrying the run id, waiting for it to arrive."""

        def find():
            self.session.events()
            return next((e for e in self.session.seen if len(e) > 1 and e[0] == tag and e[1] == run), None)

        return self.wait_for(find, timeout=timeout, what=f"{tag} for {run}")

    def events_for(self, run: str) -> list[list[str]]:
        self.session.events()
        return [e for e in self.session.seen if len(e) > 1 and e[1] == run]

    def payload(self, name: str, lines: list[str]) -> str:
        directory = self.out / "payloads"
        directory.mkdir(parents=True, exist_ok=True)
        file = directory / name
        file.write_text("".join(line + "\n" for line in lines), encoding="utf-8", newline="\n")
        return str(file)

    def wait_for(self, predicate: Callable[[], object], *, timeout: float = 15.0, what: str = "the condition"):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            value = predicate()
            if value:
                return value
            time.sleep(0.1)
        raise TimeoutError(f"{what} did not hold within {timeout:.0f}s")

    # -- measure --------------------------------------------------------------------------------------------------------
    def render_mix(self, name: str, start: float, end: float) -> Wav:
        """Renders the master mix between two project times to <out>/renders/<name>.wav (REAPER's own render, no audio device)."""
        folder = self.out / "mix"
        folder.mkdir(parents=True, exist_ok=True)
        target = folder / f"{name}.wav"
        target.unlink(missing_ok=True)
        self.lua(
            """
            local folder, name, start, finish = args[1], args[2], tonumber(args[3]), tonumber(args[4])
            local text = reaper.kbd_getTextFromCmd(42230, reaper.SectionFromUniqueID(0))
            assert(text == 'File: Render project, using the most recent render settings, auto-close render dialog', text)
            reaper.GetSetProjectInfo_String(0, 'RENDER_FILE', folder, true)
            reaper.GetSetProjectInfo_String(0, 'RENDER_PATTERN', name, true)
            reaper.GetSetProjectInfo(0, 'RENDER_BOUNDSFLAG', 0, true)
            reaper.GetSetProjectInfo(0, 'RENDER_STARTPOS', start, true)
            reaper.GetSetProjectInfo(0, 'RENDER_ENDPOS', finish, true)
            reaper.GetSetProjectInfo(0, 'RENDER_SETTINGS', 0, true)
            reaper.GetSetProjectInfo(0, 'RENDER_ADDTOPROJ', 0, true)
            reaper.Main_OnCommand(42230, 0)
            return true
            """,
            str(folder),
            name,
            f"{start:.6f}",
            f"{end:.6f}",
            timeout=120.0,
        )
        assert target.exists(), f"REAPER wrote no {target.name}"
        return Wav(target)


def near(actual: float, expected: float, tolerance: float, what: str) -> None:
    assert abs(actual - expected) <= tolerance, f"{what}: {actual} is not within {tolerance} of {expected}"


def only(rows: list[dict], what: str) -> dict:
    assert len(rows) == 1, f"expected one {what}, got {len(rows)}: {rows}"
    return rows[0]


def items_on(snapshot: dict, track: str) -> list[dict]:
    return [item for item in snapshot["items"] if item["track"] == track]


# -- registering scenarios -----------------------------------------------------------------------------------------------

STATUSES = ("PASS", "FAIL", "SKIP")


@dataclass
class Scenario:
    capability: str  # the capability a promotion would move (apps/desktop/internal/dawport/reaper/reaper.go)
    commands: str
    name: str
    fn: Callable[[Env], str | None]
    needs_audio: bool = False  # needs the JACK dummy device (play, record, monitor)


SCENARIOS: list[Scenario] = []


def scenario(capability: str, commands: str, name: str, *, needs_audio: bool = False):
    def register(fn: Callable[[Env], str | None]):
        SCENARIOS.append(Scenario(capability, commands, name, fn, needs_audio))
        return fn

    return register


def run_scenarios(env: Env, report: Report, target: str, only_names: set[str] | None = None) -> None:
    for item in SCENARIOS:
        label = f"[{item.capability}] {item.name}"
        if only_names and item.name not in only_names and item.capability not in only_names:
            continue
        if target != "real":
            report.record(label, "SKIP", "needs a real REAPER")
            continue
        if item.needs_audio and env.audio_mode != "jack-dummy":
            report.record(label, "SKIP", "needs an audio device (the JACK dummy device on Linux)")
            continue
        try:
            env.reset()
            report.record(label, "PASS", item.fn(env) or "")
        except Exception as exc:  # noqa: BLE001 - a failed assertion, a timeout or a bad event: the row fails, the run goes on
            report.record(label, "FAIL", f"{type(exc).__name__}: {exc}")


__all__ = ["SCENARIOS", "Env", "Wav", "db", "items_on", "last", "make_media", "near", "only", "run_scenarios", "scenario"]
