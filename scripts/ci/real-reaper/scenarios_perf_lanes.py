"""Real-REAPER scenarios, group: what a lane action costs as the project grows (#3645, #3657, #3664).

The owner's testing found lane switching and recording slow in a big project and the owner will not run log steps, so the run measures it:
a chapter folder of three voices, a dozen other tracks, and 100, 1000 and 5000 short items cut from public-domain speech (a LibriVox
chapter when the run fetched one, the generated tones otherwise) spread over them. For each size every step the Booth makes is timed from
writing the command file to its answering event, five times, through the same file protocol the app's host uses: the track list, the
press-time state read, the folder read, a lane switch (`arm_lane`), `arm_only`, a lane create (`track_create` inside the folder),
`punch_to`, `record_start` and `record_stop`. REAPER's own `bridge.timing` summary is switched on for the run and its lines are kept
with the numbers. The numbers go in the row's detail and in <out>/perf/lanes.json.

What this does not time is the app host's half (its 150 ms tick before it reads an answer, the UI's own reads): the host's
`bridge.timing` log lines carry that. A step over 500 ms is named in the detail ("OVER 500 ms"); a step that reaches the host's 3 s
answer limit fails the row.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import time
from pathlib import Path

from scenario import Env, scenario
from scenarios_perf import TIMING, round_trip, summary, write_result

SIZES = (0, 100, 1000, 5000)
REPS = 5
OVER_MS = 500.0
HOST_LIMIT_MS = 3000.0

# A chapter folder of Narrator, Veyra and Drone, then twelve other tracks; `count` items of half a second, cut one after another.
BUILD = """
local file, count, span = args[1], tonumber(args[2]), tonumber(args[3])
reaper.PreventUIRefresh(1)
local folder = ci.add_track('Chapter 1')
local voices = { ci.add_track('Narrator'), ci.add_track('Veyra'), ci.add_track('Drone') }
reaper.SetMediaTrackInfo_Value(folder, 'I_FOLDERDEPTH', 1)
reaper.SetMediaTrackInfo_Value(voices[3], 'I_FOLDERDEPTH', -1)
local others = {}
for i = 1, 12 do
  others[i] = ci.add_track('Other ' .. i)
end
local homes = { voices[1], voices[2], voices[3], others[1], others[2], others[3], others[4], others[5], others[6], others[7],
  others[8], others[9], others[10], others[11], others[12] }
local at = {}
for i = 1, count do
  local home = (i - 1) % #homes + 1
  at[home] = (at[home] or 0) + 0.5
  -- Cut from the source in turn, so a speech file gives every item its own half second of it.
  ci.add_item(homes[home], file, at[home], 0.5, (i * 0.5) % span)
end
reaper.PreventUIRefresh(-1)
reaper.UpdateArrange()
reaper.Main_SaveProject(0, false)
return {
  folder = reaper.GetTrackGUID(folder),
  narrator = reaper.GetTrackGUID(voices[1]),
  veyra = reaper.GetTrackGUID(voices[2]),
  items = reaper.CountMediaItems(0),
  tracks = reaper.CountTracks(0),
}
"""


def timed(env: Env, steps: dict[str, list[float]], name: str, command: str, *args: object, until: set[str]) -> None:
    steps.setdefault(name, []).append(round_trip(env, command, *args, until=until))


def speech(env: Env) -> tuple[str, float]:
    """The run's fetched LibriVox chapter (public domain) and how many seconds of it items are cut from; a generated tone when there is none."""
    path = os.environ.get("NARRATION_CI_AUDIO", "")
    if path and Path(path).exists():
        return path, 600.0
    return env.media_path("tone_a"), 8.0


def build(env: Env, count: int) -> dict:
    env.reset()
    source, span = speech(env)
    return env.lua(BUILD, source, str(count), f"{span:.1f}", timeout=900)


def one_size(env: Env, count: int) -> dict:
    started = time.monotonic()
    fx = build(env, count)
    built = round(time.monotonic() - started, 1)
    folder, narrator, veyra = fx["folder"], fx["narrator"], fx["veyra"]
    steps: dict[str, list[float]] = {}
    for rep in range(REPS):
        timed(env, steps, "ping", "ping", until={"PONG"})
        timed(env, steps, "tracks_read", "tracks_read", until={"TRACKS_READ_END"})
        timed(env, steps, "state_none", "chapter_track_state", folder, "none", until={"TRACK_STATE_END"})
        timed(env, steps, "state_folder", "chapter_track_state", folder, "children", until={"TRACK_STATE_END"})
        timed(env, steps, "lane_switch", "arm_lane", narrator if rep % 2 else veyra, until={"ARMED"})
        timed(env, steps, "arm_only", "arm_only", narrator, until={"ARMED"})
        timed(env, steps, "lane_create", "track_create", f"Lane {rep}", folder, until={"TRACK_CREATED"})
        if env.audio_mode == "jack-dummy":
            timed(env, steps, "punch_to", "punch_to", "120", "0", until={"PUNCHED"})
            timed(env, steps, "record_start", "record_start", narrator, until={"RECORD_STARTED"})
            time.sleep(0.5)
            timed(env, steps, "record_stop", "record_stop", until={"RECORDED", "RECORD_STOPPED"})
            env.wait_for(lambda: env.lua("return reaper.GetPlayState()") == 0, what="REAPER to stop")
    return {"items": fx["items"], "tracks": fx["tracks"], "build_s": built, "steps_ms": {name: summary(values) for name, values in steps.items()}}


def timing_lines(env: Env, before: int) -> list[str]:
    log = env.session.dir / "bridge-timing.log"
    if not log.exists():
        return []
    return log.read_text(encoding="utf-8").splitlines()[before:]


@scenario(
    "perf_lanes",
    "tracks_read, chapter_track_state, arm_lane, arm_only, track_create, punch_to, record_start, record_stop",
    "perf: lane create, lane switch, arm and a record start and stop at 0, 100, 1000 and 5000 items, with the REAPER timing summary on",
    needs_audio=True,
)
def perf_lanes(env: Env) -> str:
    log = env.session.dir / "bridge-timing.log"
    before = len(log.read_text(encoding="utf-8").splitlines()) if log.exists() else 0
    env.lua(TIMING, "on")
    results: dict[str, dict] = {}
    try:
        for count in SIZES:
            results[str(count)] = one_size(env, count)
            # The summary is written on REAPER's own schedule; give it a moment so each size's lines are kept with its numbers.
            time.sleep(6)
            results[str(count)]["bridge_timing"] = timing_lines(env, before)
            before += len(results[str(count)]["bridge_timing"])
    finally:
        env.lua(TIMING, "off")
        env.lua("reaper.OnStopButton() return true")
    write_result(env, "lanes", results)

    names = list(results[str(SIZES[0])]["steps_ms"])
    lines = ["step p50 ms at " + " / ".join(f"{count} items" for count in SIZES)]
    over: list[str] = []
    worst = 0.0
    for name in names:
        row = []
        for count in SIZES:
            got = results[str(count)]["steps_ms"].get(name)
            if not got:
                row.append("-")
                continue
            row.append(f"{got['p50']:.0f}")
            worst = max(worst, got["max"])
            if got["p50"] > OVER_MS:
                over.append(f"{name}@{count}={got['p50']:.0f}")
        lines.append(f"{name} " + " / ".join(row))
    assert worst < HOST_LIMIT_MS, f"a step took {worst:.0f} ms, over the host's {HOST_LIMIT_MS:.0f} ms answer limit: {lines}"
    flag = f"OVER {OVER_MS:.0f} ms: {', '.join(over)}" if over else f"no step's p50 over {OVER_MS:.0f} ms"
    return "; ".join(lines) + f"; {flag}; worst single {worst:.0f} ms"


HOST_REPS = 5


def booth_binary(env: Env) -> Path:
    """The host's Booth sequence test, compiled once with the realreaper tag (needs Go; the runner's image has it)."""
    repo = Path(os.environ["NARRATION_CI_REAPER_DIR"]).parents[3]
    binary = env.out / "booth.test"
    if not binary.exists():
        subprocess.run(
            ["go", "test", "-c", "-tags", "realreaper", "-o", str(binary), "./internal/bridge"],
            cwd=repo / "src" / "studio" / "desktop",
            check=True,
            timeout=900,
        )
    return binary


@scenario(
    "perf_lanes_host",
    "tracks_read, chapter_track_state, arm_lane, track_create, punch_to, record_start, record_stop",
    "perf: the app host's Booth sequence (its 150 ms tick, request waits and the page's reads between steps) against the real REAPER at 0, 100, 1000 and 5000 items",
    needs_audio=True,
)
def perf_lanes_host(env: Env) -> str:
    if shutil.which("go") is None:
        raise AssertionError("no Go toolchain on this runner")
    binary = booth_binary(env)
    results: dict[str, dict] = {}
    for count in SIZES:
        fx = build(env, count)
        out = env.out / "perf" / f"lanes_host_{count}.json"
        out.parent.mkdir(parents=True, exist_ok=True)
        run = subprocess.run(
            [str(binary), "-test.run", "TestBoothSequenceAgainstRealReaper", "-test.v", "-test.timeout", "600s"],
            env={
                **os.environ,
                "NARRATION_REAL_REAPER_SESSION": str(env.session.dir),
                "NARRATION_REAL_REAPER_GUIDS": json.dumps({"folder": fx["folder"], "narrator": fx["narrator"], "veyra": fx["veyra"]}),
                "NARRATION_REAL_REAPER_OUT": str(out),
                "NARRATION_REAL_REAPER_REPS": str(HOST_REPS),
            },
            capture_output=True,
            text=True,
            timeout=900,
            check=False,
        )
        env.lua("reaper.OnStopButton() return true")
        if not out.exists():
            raise AssertionError(f"the host's sequence wrote no result at {count} items: {run.stdout[-1500:]} {run.stderr[-500:]}")
        results[str(count)] = json.loads(out.read_text(encoding="utf-8"))
        results[str(count)]["items"] = fx["items"]
    write_result(env, "lanes_host", results)

    names = list(results[str(SIZES[0])]["actions_ms"])
    lines = ["action p50 / max ms at " + " / ".join(f"{count} items" for count in SIZES)]
    over: list[str] = []
    worst, failed = 0.0, []
    for name in names:
        row = []
        for count in SIZES:
            got = results[str(count)]["actions_ms"].get(name)
            if not got:
                row.append("-")
                continue
            row.append(f"{got['p50']:.0f}/{got['max']:.0f}")
            worst = max(worst, got["max"])
            if got["p50"] > OVER_MS:
                over.append(f"{name}@{count}={got['p50']:.0f}")
        lines.append(f"{name} " + " / ".join(row))
    for count in SIZES:
        failed += [f"{key}@{count}" for key in results[str(count)]["failures"]]
    assert not failed, f"requests failed or timed out: {failed}; {lines}"
    flag = f"OVER {OVER_MS:.0f} ms: {', '.join(over)}" if over else f"no action's p50 over {OVER_MS:.0f} ms"
    return "; ".join(lines) + f"; {flag}; worst single action {worst:.0f} ms"
