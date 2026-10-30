"""Real-REAPER scenarios, group: what the bridge costs REAPER while it runs (#2251, docs/research/reaper-bridge-performance.md).

A probe (a ci_exec snippet) wraps reaper.defer, so every deferred callback, the bridge's own tick among them, is timed with
reaper.time_precise, and runs a defer loop of its own whose gaps say how long REAPER's main thread was busy between two of its
callbacks: the wait any UI action of the narrator's has. A "held" window keeps the bridge's tick from running (the wrapper
re-defers it untouched), which is REAPER with the bridge detached. REAPER's CPU comes from /proc/<pid>/stat and the file system
calls of its main thread from strace, when the runner has them.

Each scenario asserts a budget several times what REAPER 7.82 on Linux measured, so a change that makes the bridge cost REAPER
noticeably more fails the run, and a slower runner does not. Every window's numbers are written to <out>/perf/<scenario>.json.
"""

from __future__ import annotations

import json
import os
import shutil
import signal
import statistics
import subprocess
import time
from collections.abc import Callable
from pathlib import Path

from drive import dec
from scenario import Env, scenario

# Budgets, in milliseconds or percent. The measured REAPER 7.82 Linux values are in the research note.
IDLE_TICK_P99_MS = 5.0
IDLE_BUSY_PCT = 2.0
IDLE_CPU_EXTRA_PCT = 5.0
PROBE_GAP_P95_MS = 100.0
ROUND_TRIP_P95_MS = 300.0
TRACK_READ_1000_TICK_MS = 250.0

PROBE = """
local P = ci.perf
if not P then
  P = { real_defer = reaper.defer, on = false, ticks = {}, gaps = {}, hold_until = 0, start_at = math.huge }
  ci.perf = P
  reaper.defer = function(fn)
    return P.real_defer(function()
      if reaper.time_precise() < P.hold_until then
        reaper.defer(fn)
        return
      end
      local t0 = reaper.time_precise()
      fn()
      if P.on and t0 >= P.start_at then
        P.ticks[#P.ticks + 1] = reaper.time_precise() - t0
      end
    end)
  end
  local last
  local function probe()
    local now = reaper.time_precise()
    if P.on and last and last >= P.start_at then
      P.gaps[#P.gaps + 1] = now - last
    end
    last = now
    P.real_defer(probe)
  end
  P.real_defer(probe)
end
return true
"""

START = """
local P, now = ci.perf, reaper.time_precise()
P.ticks, P.gaps, P.on, P.start_at = {}, {}, true, now + 0.25
P.hold_until = args[1] == 'held' and (now + 0.25 + tonumber(args[2])) or 0
return true
"""

STOP = """
local P = ci.perf
P.on = false
local function ms(list)
  local out = {}
  for i, v in ipairs(list) do out[i] = v * 1000 end
  return out
end
return { ticks = ms(P.ticks), gaps = ms(P.gaps) }
"""

# One chapter track of 50 items, one track of 1000 retakes, and `bulk` tracks of `per` items each with ReaEQ and ReaComp.
BUILD = """
-- The protocol carries at most four snippet arguments, so the sizes come as one: tracks,items per track,chapter items,retake items.
local file = args[1]
local bulk, per, chapter_items, retake_items = args[2]:match('^(%d+),(%d+),(%d+),(%d+)$')
bulk, per, chapter_items, retake_items = tonumber(bulk), tonumber(per), tonumber(chapter_items), tonumber(retake_items)
reaper.PreventUIRefresh(1)
local function fill(track, count)
  for i = 0, count - 1 do
    ci.add_item(track, file, i * 5, 4.5)
  end
end
local chapter = ci.add_track('Chapter 1')
fill(chapter, chapter_items)
local retakes = ci.add_track('Retakes')
fill(retakes, retake_items)
for t = 1, bulk do
  local track = ci.add_track('Bulk ' .. t)
  reaper.TrackFX_AddByName(track, 'ReaEQ (Cockos)', false, -1)
  reaper.TrackFX_AddByName(track, 'ReaComp (Cockos)', false, -1)
  fill(track, per)
end
reaper.PreventUIRefresh(-1)
reaper.UpdateArrange()
reaper.Main_SaveProject(0, false)
return { chapter = reaper.GetTrackGUID(chapter), retakes = reaper.GetTrackGUID(retakes), items = reaper.CountMediaItems(0), tracks = reaper.CountTracks(0) }
"""
LARGE = "60,50,50,1000"  # 4050 items on 62 tracks, 120 FX


def reaper_pid() -> int | None:
    """REAPER's process: the one whose command line names this run's scratch cfg. None where there is no /proc."""
    cfg = os.environ.get("NARRATION_CI_CFG", "")
    proc = Path("/proc")
    if not cfg or not proc.exists():
        return None
    for entry in proc.iterdir():
        try:
            if entry.name.isdigit() and os.readlink(entry / "exe").endswith("/reaper") and cfg.encode() in (entry / "cmdline").read_bytes():
                return int(entry.name)
        except OSError:
            continue
    return None


def cpu_seconds(pid: int | None) -> float | None:
    if pid is None:
        return None
    fields = Path(f"/proc/{pid}/stat").read_text().rsplit(")", 1)[1].split()
    return (int(fields[11]) + int(fields[12])) / os.sysconf("SC_CLK_TCK")


def pct(values: list[float], q: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    return ordered[min(len(ordered) - 1, int(q * len(ordered)))]


def summary(values: list[float]) -> dict:
    return {
        "n": len(values),
        "mean": round(statistics.fmean(values), 3) if values else 0.0,
        "p50": round(pct(values, 0.5), 3),
        "p95": round(pct(values, 0.95), 3),
        "p99": round(pct(values, 0.99), 3),
        "max": round(max(values), 3) if values else 0.0,
    }


class Syscalls:
    """The file system calls REAPER's main thread makes while it runs (strace -c on that thread only), by name, per second."""

    def __init__(self, pid: int | None) -> None:
        self.proc = None
        if pid is not None and shutil.which("strace"):
            self.proc = subprocess.Popen(["strace", "-c", "-U", "name,calls", "-e", "trace=%file,%desc", "-p", str(pid)], stderr=subprocess.PIPE, text=True)
        self.started = time.monotonic()

    def stop(self) -> dict[str, float] | None:
        if self.proc is None:
            return None
        self.proc.send_signal(signal.SIGINT)
        _, err = self.proc.communicate(timeout=30)
        seconds = time.monotonic() - self.started
        counts = {}
        for line in err.splitlines():
            parts = line.split()
            if len(parts) == 2 and parts[1].isdigit() and parts[0] != "total":
                counts[parts[0]] = round(int(parts[1]) / seconds, 1)
        return dict(sorted(counts.items()))


def window(env: Env, seconds: float, *, held: bool = False, during: Callable[[float], None] | None = None, trace: bool = False) -> dict:
    """One measured window, the bridge running (or held), with `during(deadline)` run by the driver meanwhile. With `trace` the
    window counts system calls instead: strace slows each call, so its timings are not kept."""
    env.lua(START, "held" if held else "on", str(seconds))
    pid = reaper_pid()
    time.sleep(0.25)
    cpu0, t0 = cpu_seconds(pid), time.monotonic()
    tracer = Syscalls(pid) if trace else None
    deadline = time.monotonic() + seconds
    if during:
        during(deadline)
    while time.monotonic() < deadline:
        time.sleep(0.05)
    calls = tracer.stop() if tracer else None
    cpu1, t1 = cpu_seconds(pid), time.monotonic()
    if held:
        time.sleep(0.3)
    got = env.lua(STOP)
    if trace:
        return {"held": held, "seconds": seconds, "syscalls_per_s": calls}
    ticks, gaps = got["ticks"] or [], got["gaps"] or []
    return {
        "held": held,
        "seconds": seconds,
        "cpu_pct": None if cpu0 is None or cpu1 is None else round(100 * (cpu1 - cpu0) / (t1 - t0), 1),
        "tick_ms": summary(ticks),
        "busy_pct": round(100 * sum(ticks) / 1000 / seconds, 2),
        "gap_ms": summary(gaps),
    }


class Tail:
    """events.log read on from where it ends now, polled every 2 ms, so a round trip is REAPER's time and not a harness poll's."""

    def __init__(self, env: Env) -> None:
        self.path = env.session.dir / "events.log"
        self.offset = self.path.stat().st_size if self.path.exists() else 0

    def wait(self, run: str, until: set[str], timeout: float = 30.0) -> list[list[str]]:
        got, buffer, deadline = [], b"", time.monotonic() + timeout
        while time.monotonic() < deadline:
            with self.path.open("rb") as handle:
                handle.seek(self.offset)
                data = handle.read()
            self.offset += len(data)
            buffer += data
            *lines, buffer = buffer.split(b"\n")
            for line in lines:
                event = [dec(p) for p in line.decode("utf-8").rstrip("\r").split("|")]
                if len(event) > 1 and event[1] == run:
                    got.append(event)
                    if event[0] in until | {"ERROR"}:
                        return got
            time.sleep(0.002)
        raise TimeoutError(f"{run}: none of {sorted(until)} within {timeout:.0f}s")


def round_trip(env: Env, command: str, *args: object, until: set[str]) -> float:
    tail = Tail(env)
    start = time.monotonic()
    run = env.session.send(command, *args)
    events = tail.wait(run, until)
    assert events[-1][0] in until, f"{command}: {events[-1]}"
    return (time.monotonic() - start) * 1000


def polling(env: Env, guid: str, every: float) -> Callable[[float], None]:
    """What a page that reads the chapter's track on a timer sends: chapter_track_state every `every` seconds."""

    def during(deadline: float) -> None:
        while time.monotonic() < deadline - 0.5:
            env.session.send("chapter_track_state", guid)
            time.sleep(every)

    return during


def write_result(env: Env, name: str, value: dict) -> None:
    folder = env.out / "perf"
    folder.mkdir(parents=True, exist_ok=True)
    (folder / f"{name}.json").write_text(json.dumps(value, indent=2), encoding="utf-8")


def idle_line(on: dict, held: dict) -> str:
    cpu = "" if on["cpu_pct"] is None else f", CPU {on['cpu_pct']}% on vs {held['cpu_pct']}% held"
    return f"tick p50 {on['tick_ms']['p50']} ms p99 {on['tick_ms']['p99']} ms, busy {on['busy_pct']}%{cpu}, probe gap p95 {on['gap_ms']['p95']} ms"


def assert_idle(on: dict, held: dict, what: str) -> None:
    assert on["tick_ms"]["n"] > 100, f"{what}: the bridge ticked {on['tick_ms']['n']} times in {on['seconds']} s"
    assert on["tick_ms"]["p99"] <= IDLE_TICK_P99_MS, f"{what}: idle tick p99 {on['tick_ms']['p99']} ms > {IDLE_TICK_P99_MS}"
    assert on["busy_pct"] <= IDLE_BUSY_PCT, f"{what}: the idle bridge kept REAPER's main thread busy {on['busy_pct']}% > {IDLE_BUSY_PCT}"
    assert on["gap_ms"]["p95"] <= PROBE_GAP_P95_MS, f"{what}: probe gap p95 {on['gap_ms']['p95']} ms > {PROBE_GAP_P95_MS}"
    if on["cpu_pct"] is not None and held["cpu_pct"] is not None:
        extra = on["cpu_pct"] - held["cpu_pct"]
        assert extra <= IDLE_CPU_EXTRA_PCT, f"{what}: REAPER used {extra:.1f} points more CPU with the bridge than without"


@scenario("perf", "(the defer loop)", "perf: the idle bridge in a small project costs REAPER's main thread next to nothing")
def perf_idle_small(env: Env) -> str:
    env.lua(PROBE)
    result = {
        "trace_on": window(env, 10, trace=True),
        "trace_held": window(env, 10, held=True, trace=True),
        "on": window(env, 10),
        "held": window(env, 10, held=True),
    }
    write_result(env, "idle_small", result)
    assert_idle(result["on"], result["held"], "small project")
    return idle_line(result["on"], result["held"])


@scenario("perf", "ping, project_state, chapter_track_state", "perf: a 4050-item project with FX: idle cost, round trips and track reads stay in budget")
def perf_large(env: Env) -> str:
    env.lua(PROBE)
    started = time.monotonic()
    fx = env.lua(BUILD, env.media_path("tone_a"), LARGE, timeout=300)
    result: dict = {"project": {**fx, "build_s": round(time.monotonic() - started, 1)}}
    result["idle_on"] = window(env, 10)
    result["idle_held"] = window(env, 10, held=True)
    trips: dict[str, list[float]] = {"ping": [], "project_state": [], "track_state_no_track": [], "track_state_50": [], "track_state_1000": []}
    for _ in range(10):
        trips["ping"].append(round_trip(env, "ping", until={"PONG"}))
        trips["project_state"].append(round_trip(env, "project_state", until={"PROJECT_STATE"}))
        trips["track_state_no_track"].append(round_trip(env, "chapter_track_state", "", until={"TRACK_STATE_END"}))
        trips["track_state_50"].append(round_trip(env, "chapter_track_state", fx["chapter"], until={"TRACK_STATE_END"}))
        trips["track_state_1000"].append(round_trip(env, "chapter_track_state", fx["retakes"], until={"TRACK_STATE_END"}))
    result["round_trip_ms"] = {name: summary(values) for name, values in trips.items()}
    result["poll_50_every_1s"] = window(env, 12, during=polling(env, fx["chapter"], 1.0))
    result["poll_1000_every_1s"] = window(env, 12, during=polling(env, fx["retakes"], 1.0))
    result["poll_1000_trace"] = window(env, 12, during=polling(env, fx["retakes"], 1.0), trace=True)
    write_result(env, "large", result)

    assert fx["items"] == 4050, f"the project holds {fx['items']} items"
    assert_idle(result["idle_on"], result["idle_held"], "4050-item project")
    for name in ("ping", "project_state", "track_state_no_track", "track_state_50"):
        p95 = result["round_trip_ms"][name]["p95"]
        assert p95 <= ROUND_TRIP_P95_MS, f"{name} round trip p95 {p95} ms > {ROUND_TRIP_P95_MS}"
    read_1000 = result["poll_1000_every_1s"]["tick_ms"]["max"]
    assert read_1000 <= TRACK_READ_1000_TICK_MS, f"a 1000-item track read held REAPER for {read_1000} ms > {TRACK_READ_1000_TICK_MS}"
    rt = result["round_trip_ms"]
    return (
        f"{fx['items']} items, {fx['tracks']} tracks; idle {idle_line(result['idle_on'], result['idle_held'])}; round trip p50 ping "
        f"{rt['ping']['p50']} ms, project_state {rt['project_state']['p50']} ms, 50-item read {rt['track_state_50']['p50']} ms, "
        f"1000-item read {rt['track_state_1000']['p50']} ms; longest tick polling 50 items {result['poll_50_every_1s']['tick_ms']['max']} ms, "
        f"1000 items {read_1000} ms"
    )


@scenario("perf", "chapter_track_state", "perf: recording in a 4050-item project, idle and read every 4 s as the Booth does", needs_audio=True)
def perf_recording(env: Env) -> str:
    env.lua(PROBE)
    fx = env.lua(BUILD, env.media_path("tone_a"), LARGE, timeout=300)
    env.lua(
        "reaper.SetMediaTrackInfo_Value(ci.track_by_name('Chapter 1'), 'I_RECARM', 1) reaper.SetEditCurPos(300, false, false) reaper.CSurf_OnRecord() return true"
    )
    env.wait_for(lambda: env.lua("return reaper.GetPlayState()") & 4, what="recording to start")
    try:
        result = {"on": window(env, 10), "held": window(env, 10, held=True), "poll_50_every_4s": window(env, 12, during=polling(env, fx["chapter"], 4.0))}
    finally:
        env.lua("reaper.OnStopButton() return true")
    write_result(env, "recording", result)
    assert_idle(result["on"], result["held"], "recording")
    polled = result["poll_50_every_4s"]["tick_ms"]["max"]
    assert polled <= TRACK_READ_1000_TICK_MS, f"a 50-item read while recording held REAPER for {polled} ms"
    return f"{idle_line(result['on'], result['held'])}; longest tick reading 50 items every 4 s {polled} ms"
