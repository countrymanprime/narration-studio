"""Real-REAPER scenarios, group 7: phase 0 of recording to character sub-tracks in the Booth (#2251).

A chapter is a folder track whose children are its voices (docs/research/2026-10-30-booth-sub-track-recording.md, section 2). These rows
prove what REAPER does with that shape before any app change: what it writes for a folder, that arming a child records on the child and
not on the folder, what a stop/re-arm/record switch costs, what a live arm change during a take does, what Undo takes back, that FX on a
child or on the folder reach the children's items, and how the bridge's Editing play and chapter_track_state read a folder whose items
are all on its children. They act through the product's own commands where one exists and through `ci_exec` snippets otherwise.
Measurements go in the row detail; the research doc records them (section 6a). The JACK dummy device records silence. `booth_voices`
is a research group, not a capability in reaper.go: nothing is promoted by these rows.
"""

from __future__ import annotations

import itertools
import time

from scenario import Env, near, scenario
from scenarios_playtrack import mix_tones, narrator_state, play_range, stop_by_hand
from scenarios_transport import play_state

VOICES = ("Narrator", "Veyra", "Drone")


def folder_book(env: Env, *, audio: bool = False) -> dict:
    """Chapter 3 is a folder holding Narrator, Veyra and Drone; Chapter 4 is a flat track after it; saved and reopened.

    With `audio`, Narrator holds tone_a and Veyra tone_b at 0-8 s (items on the children only, none on the folder), Chapter 4 tone_c at 0-8 s.
    Answers the track GUIDs by name."""
    return env.lua(
        """
        local folder = ci.add_track('Chapter 3')
        local narrator = ci.add_track('Narrator')
        local veyra = ci.add_track('Veyra')
        local drone = ci.add_track('Drone')
        local flat = ci.add_track('Chapter 4')
        reaper.SetMediaTrackInfo_Value(folder, 'I_FOLDERDEPTH', 1)
        reaper.SetMediaTrackInfo_Value(drone, 'I_FOLDERDEPTH', -1)
        if args[1] == '1' then
          ci.add_item(narrator, args[2], 0, 8)
          ci.add_item(veyra, args[3], 0, 8)
          ci.add_item(flat, args[4], 0, 8)
        end
        ci.save_and_reload(ci.rpp)
        local out = {}
        for _, name in ipairs({ 'Chapter 3', 'Narrator', 'Veyra', 'Drone', 'Chapter 4' }) do
          out[name] = reaper.GetTrackGUID(ci.track_by_name(name))
        end
        return out
        """,
        "1" if audio else "0",
        env.media_path("tone_a"),
        env.media_path("tone_b"),
        env.media_path("tone_c"),
    )


def structure(env: Env) -> list[dict]:
    """Every track's name, I_FOLDERDEPTH, GetTrackDepth, parent name, I_RECARM, I_RECMODE and I_RECINPUT, in order."""
    return env.lua(
        """
        local out = {}
        for i = 0, reaper.CountTracks(0) - 1 do
          local t = reaper.GetTrack(0, i)
          local _, name = reaper.GetTrackName(t)
          local parent = reaper.GetParentTrack(t)
          out[#out + 1] = {
            name = name,
            delta = math.floor(reaper.GetMediaTrackInfo_Value(t, 'I_FOLDERDEPTH')),
            depth = reaper.GetTrackDepth(t),
            parent = parent and select(2, reaper.GetTrackName(parent)) or '',
            arm = math.floor(reaper.GetMediaTrackInfo_Value(t, 'I_RECARM')),
            mode = math.floor(reaper.GetMediaTrackInfo_Value(t, 'I_RECMODE')),
            input = math.floor(reaper.GetMediaTrackInfo_Value(t, 'I_RECINPUT')),
          }
        end
        return out
        """
    )


def isbus_lines(env: Env) -> list[str]:
    """The ISBUS line of every <TRACK> in the saved .rpp, in order: what REAPER itself wrote."""
    return env.lua(
        """
        reaper.Main_SaveProjectEx(0, ci.rpp, 0)
        local handle = assert(io.open(ci.rpp, 'rb'))
        local text = handle:read('a')
        handle:close()
        local out = {}
        for line in text:gmatch('[^\\r\\n]+') do
          local isbus = line:match('^%s*(ISBUS .-)%s*$')
          if isbus then out[#out + 1] = isbus end
        end
        return out
        """
    )


def arm_only_by_hand(env: Env, name: str) -> None:
    env.lua(
        """
        for i = 0, reaper.CountTracks(0) - 1 do
          local t = reaper.GetTrack(0, i)
          reaper.SetMediaTrackInfo_Value(t, 'I_RECARM', select(2, reaper.GetTrackName(t)) == args[1] and 1 or 0)
        end
        return true
        """,
        name,
    )


def recording(env: Env) -> bool:
    return play_state(env) & 4 == 4


def position(env: Env) -> float:
    return env.lua("return reaper.GetPlayPosition()")


def settled_items(env: Env, count: int) -> list[dict]:
    """Every item once at least `count` exist and each take has its file (REAPER makes a recording an item a moment after the stop)."""

    def ready():
        items = env.snapshot()["items"]
        return items if len(items) >= count and all(t["file"] for i in items for t in i["takes"]) else None

    return env.wait_for(ready, what=f"{count} items, each take with its file")


def per_track(items: list[dict]) -> dict[str, list[tuple[float, float, int]]]:
    out: dict[str, list[tuple[float, float, int]]] = {}
    for item in items:
        out.setdefault(item["track"], []).append((round(item["position"], 3), round(item["length"], 3), len(item["takes"])))
    return out


# -- folder structure ---------------------------------------------------------------------------------------------------------


@scenario(
    "booth_voices",
    "(snippet) I_FOLDERDEPTH, GetTrackDepth, GetParentTrack, I_RECARM, I_RECMODE, I_RECINPUT",
    "voices phase 0: a folder and three children survive save and reload; what REAPER writes as ISBUS and reads back as depth, arm, record mode and input",
)
def folder_depths(env: Env) -> str:
    folder_book(env)
    rows = structure(env)
    shape = [(r["name"], r["delta"], r["depth"], r["parent"]) for r in rows]
    assert shape == [
        ("Chapter 3", 1, 0, ""),
        ("Narrator", 0, 1, "Chapter 3"),
        ("Veyra", 0, 1, "Chapter 3"),
        ("Drone", -1, 1, "Chapter 3"),
        ("Chapter 4", 0, 0, ""),
    ], shape
    lines = isbus_lines(env)
    assert len(lines) == 5, lines
    assert all(r["arm"] == 0 for r in rows), f"a fresh track is armed: {rows}"
    modes = sorted({r["mode"] for r in rows})
    inputs = sorted({r["input"] for r in rows})
    return f"ISBUS per track {lines}; I_FOLDERDEPTH 1,0,0,-1,0, GetTrackDepth 0,1,1,1,0, parent Chapter 3 for the three; I_RECMODE {modes}, I_RECINPUT {inputs} on every new track"


@scenario(
    "booth_voices",
    "(snippet) InsertTrackAtIndex, I_FOLDERDEPTH",
    "voices phase 0: a voice added as the new last child of a folder that is itself the last child of an outer folder; both folders still close",
)
def folder_add_last_child(env: Env) -> str:
    env.lua(
        """
        local book = ci.add_track('Book')
        local chapter = ci.add_track('Chapter 3')
        local narrator = ci.add_track('Narrator')
        ci.add_track('After')
        reaper.SetMediaTrackInfo_Value(book, 'I_FOLDERDEPTH', 1)
        reaper.SetMediaTrackInfo_Value(chapter, 'I_FOLDERDEPTH', 1)
        reaper.SetMediaTrackInfo_Value(narrator, 'I_FOLDERDEPTH', -2)
        ci.save_and_reload(ci.rpp)
        -- The rule the nested track_create would follow: insert after the folder's last child, move that child's closing delta to the new track.
        local last = ci.track_by_name('Narrator')
        local index = math.floor(reaper.GetMediaTrackInfo_Value(last, 'IP_TRACKNUMBER'))  -- 1-based, so this is the slot after it
        local closing = reaper.GetMediaTrackInfo_Value(last, 'I_FOLDERDEPTH')
        reaper.InsertTrackAtIndex(index, true)
        local added = reaper.GetTrack(0, index)
        reaper.GetSetMediaTrackInfo_String(added, 'P_NAME', 'Veyra', true)
        reaper.SetMediaTrackInfo_Value(last, 'I_FOLDERDEPTH', 0)
        reaper.SetMediaTrackInfo_Value(added, 'I_FOLDERDEPTH', closing)
        reaper.SetMediaTrackInfo_Value(added, 'I_RECINPUT', reaper.GetMediaTrackInfo_Value(last, 'I_RECINPUT'))
        reaper.SetMediaTrackInfo_Value(added, 'I_RECMODE', reaper.GetMediaTrackInfo_Value(last, 'I_RECMODE'))
        ci.save_and_reload(ci.rpp)
        return true
        """
    )
    rows = structure(env)
    shape = [(r["name"], r["delta"], r["depth"], r["parent"]) for r in rows]
    assert shape == [
        ("Book", 1, 0, ""),
        ("Chapter 3", 1, 1, "Book"),
        ("Narrator", 0, 2, "Chapter 3"),
        ("Veyra", -2, 2, "Chapter 3"),
        ("After", 0, 0, ""),
    ], shape
    # InsertTrackAtIndex(i, true) inside a folder: does REAPER itself touch the neighbours' deltas? Read before the fix-up in a second build.
    raw = env.lua(
        """
        local a = ci.add_track('X folder')
        local b = ci.add_track('X last')
        reaper.SetMediaTrackInfo_Value(a, 'I_FOLDERDEPTH', 1)
        reaper.SetMediaTrackInfo_Value(b, 'I_FOLDERDEPTH', -1)
        local at = math.floor(reaper.GetMediaTrackInfo_Value(b, 'IP_TRACKNUMBER'))
        reaper.InsertTrackAtIndex(at, true)
        local c = reaper.GetTrack(0, at)
        return { last = reaper.GetMediaTrackInfo_Value(b, 'I_FOLDERDEPTH'), added = reaper.GetMediaTrackInfo_Value(c, 'I_FOLDERDEPTH'),
                 added_depth = reaper.GetTrackDepth(c) }
        """
    )
    return (
        f"after the move: {[(r['name'], r['delta']) for r in rows]}, depths {[r['depth'] for r in rows]}; ISBUS {isbus_lines(env)}; "
        f"a bare InsertTrackAtIndex after a closing child leaves that child at {raw['last']:g} and the new track at {raw['added']:g} "
        f"(depth {raw['added_depth']}), so the app moves the closing delta itself"
    )


# -- recording on a child -----------------------------------------------------------------------------------------------------


@scenario(
    "booth_voices",
    "arm_only, record_start, record_stop",
    "voices phase 0: arm_only on a child inside a folder; the folder stays unarmed and records nothing; the take is one item on that child",
    needs_audio=True,
)
def record_on_child(env: Env) -> str:
    g = folder_book(env)
    env.lua("reaper.SetEditCurPos(2, false, false) return true")
    armed = env.ok("arm_only", g["Veyra"], until="ARMED")
    assert armed[2] == g["Veyra"], armed
    arms = {r["name"]: r["arm"] for r in structure(env)}
    assert arms == {"Chapter 3": 0, "Narrator": 0, "Veyra": 1, "Drone": 0, "Chapter 4": 0}, arms
    env.ok("record_start", g["Veyra"], until="RECORD_STARTED")
    env.wait_for(lambda: position(env) > 3.2, timeout=8, what="the take to run over a second")
    during = {r["name"]: r["arm"] for r in structure(env)}
    stopped = env.ok("record_stop", until="RECORD_STOPPED")
    env.wait_for(lambda: play_state(env) == 0, what="REAPER to stop")
    tracks = per_track(settled_items(env, 1))
    assert list(tracks) == ["Veyra"] and len(tracks["Veyra"]) == 1, f"items per track {tracks}"
    near(tracks["Veyra"][0][0], 2.0, 0.05, "the take starts at the cursor")
    assert during["Chapter 3"] == 0, f"the folder was armed during the take: {during}"
    return f"arms during the take {during}; items {tracks}; record_stop restored/kept/undo points {stopped[2:5]}"


@scenario(
    "booth_voices",
    "arm_only, record_start, record_stop",
    "voices phase 0: two takes on two children from the same cursor are two items, one per child, and neither splits the other",
    needs_audio=True,
)
def two_children_same_cursor(env: Env) -> str:
    g = folder_book(env)
    env.lua("reaper.SetEditCurPos(2, false, false) return true")
    guarded = None
    for count, voice in enumerate(("Narrator", "Veyra"), start=1):
        env.ok("arm_only", g[voice], until="ARMED")
        env.ok("record_start", g[voice], until="RECORD_STARTED")
        env.wait_for(lambda: position(env) > 3.2, timeout=8, what=f"{voice}'s take to run over a second")
        env.ok("record_stop", until="RECORD_STOPPED")
        env.wait_for(lambda: play_state(env) == 0, what="REAPER to stop")
        settled_items(env, count)
        if count == 1:
            # Back to the take's start through the product's set_cursor at once: the bridge's stop guard (guard_stop, 15 defer cycles)
            # reads a cursor at the recording's start as REAPER's own seek and puts it back at the stop.
            env.ok("set_cursor", "2", until="CURSOR_SET")
            time.sleep(0.8)
            guarded = round(env.snapshot()["cursor"], 3)
            env.ok("set_cursor", "2", until="CURSOR_SET")
            near(env.snapshot()["cursor"], 2.0, 1e-6, "the cursor set again once the guard has run out")
    tracks = per_track(settled_items(env, 2))
    assert set(tracks) == {"Narrator", "Veyra"}, tracks
    assert all(len(rows) == 1 and rows[0][2] == 1 for rows in tracks.values()), f"a take split or stacked: {tracks}"
    near(tracks["Narrator"][0][0], tracks["Veyra"][0][0], 0.01, "both takes start at the same cursor")
    return (
        f"items {tracks}: one item, one take on each child, nothing on the folder. set_cursor to the take's start right after the stop "
        f"was moved back to {guarded} s by the stop guard; sent again 0.8 s later it held"
    )


# -- switching voice -----------------------------------------------------------------------------------------------------------

SWITCH = """
-- stop, disarm the old voice, arm the new one, record again from where the old take was: the switch_record sequence, timed inside REAPER.
local old, new = ci.track_by_name(args[1]), ci.track_by_name(args[2])
local function rec() return math.floor(reaper.GetPlayState() / 4) % 2 == 1 end
local s = { cycles = 0 }
ci.switch = s
local t0 = reaper.time_precise()
s.at = reaper.GetPlayPosition()
reaper.OnStopButton()
s.recording_after_stop = rec()
s.play_state_after_stop = reaper.GetPlayState()
reaper.SetMediaTrackInfo_Value(old, 'I_RECARM', 0)
reaper.SetMediaTrackInfo_Value(new, 'I_RECARM', 1)
reaper.SetEditCurPos(s.at, false, false)
reaper.CSurf_OnRecord()
s.recording_after_record = rec()
s.call_ms = (reaper.time_precise() - t0) * 1000
local function tick()
  s.cycles = s.cycles + 1
  local now = (reaper.time_precise() - t0) * 1000
  if not s.recording_ms and rec() then s.recording_ms = now end
  if s.recording_ms and reaper.GetPlayPosition() > s.at + 0.001 then
    s.moving_ms, s.position = now, reaper.GetPlayPosition()
    return
  end
  if s.cycles < 300 then reaper.defer(tick) else s.gave_up = true end
end
reaper.defer(tick)
return true
"""


@scenario(
    "booth_voices",
    "(snippet) OnStopButton, I_RECARM, SetEditCurPos, CSurf_OnRecord",
    "voices phase 0: a switch inside REAPER (stop, disarm old, arm new, record from the stop) times the gap and leaves two abutting items",
    needs_audio=True,
)
def switch_in_reaper(env: Env) -> str:
    folder_book(env)
    arm_only_by_hand(env, "Narrator")
    env.lua("reaper.SetEditCurPos(1, false, false) reaper.CSurf_OnRecord() return true")
    env.wait_for(lambda: recording(env), what="recording to start")
    env.wait_for(lambda: position(env) > 2.5, timeout=8, what="the first take to run")
    undo_before = env.lua("return reaper.Undo_CanUndo2(0) or ''")
    env.lua(SWITCH, "Narrator", "Veyra")
    s = env.wait_for(
        lambda: (v := env.lua("return ci.switch")) and (v.get("moving_ms") or v.get("gave_up")) and v, timeout=10, what="the switch to record again"
    )
    assert not s.get("gave_up"), f"REAPER did not record again: {s}"
    env.wait_for(lambda: position(env) > s["at"] + 1.2, timeout=8, what="the second take to run")
    stop_by_hand(env)
    env.wait_for(lambda: play_state(env) == 0, what="REAPER to stop")
    items = settled_items(env, 2)
    tracks = per_track(items)
    assert set(tracks) == {"Narrator", "Veyra"}, tracks
    first, second = tracks["Narrator"][0], tracks["Veyra"][0]
    seam = second[0] - (first[0] + first[1])
    return (
        f"stop then record: recording again {s['recording_ms']:.1f} ms after the stop, the play position moving at {s['moving_ms']:.1f} ms "
        f"({s['cycles']} defer cycles; the calls themselves {s['call_ms']:.1f} ms; recording right after OnStopButton {s['recording_after_stop']}, "
        f"play state {s['play_state_after_stop']}; recording right after CSurf_OnRecord {s['recording_after_record']}). "
        f"Items {tracks}; seam on the timeline {seam * 1000:+.0f} ms. Undo before the switch {undo_before!r}"
    )


@scenario(
    "booth_voices",
    "record_stop, arm_only, record_start",
    "voices phase 0: the same switch through the bridge (record_stop, arm_only, record_start) as the app would send it, timed from the driver",
    needs_audio=True,
)
def switch_over_bridge(env: Env) -> str:
    g = folder_book(env)
    env.lua("reaper.SetEditCurPos(1, false, false) return true")
    env.ok("arm_only", g["Narrator"], until="ARMED")
    env.ok("record_start", g["Narrator"], until="RECORD_STARTED")
    env.wait_for(lambda: position(env) > 2.5, timeout=8, what="the first take to run")
    gaps = []
    for old, new in (("Narrator", "Veyra"), ("Veyra", "Drone"), ("Drone", "Narrator")):
        t0 = time.monotonic()
        stopped = env.ok("record_stop", until="RECORD_STOPPED")
        t1 = time.monotonic()
        env.ok("arm_only", g[new], until="ARMED")
        t2 = time.monotonic()
        started = env.ok("record_start", g[new], until="RECORD_STARTED")
        t3 = time.monotonic()
        gaps.append((old, new, (t1 - t0) * 1000, (t2 - t1) * 1000, (t3 - t2) * 1000, stopped[4], float(started[3])))
        here = float(started[3])
        env.wait_for(lambda h=here: position(env) > h + 1.2, timeout=8, what=f"{new}'s take to run")
    env.ok("record_stop", until="RECORD_STOPPED")
    env.wait_for(lambda: play_state(env) == 0, what="REAPER to stop")
    items = sorted(settled_items(env, 4), key=lambda i: i["position"])
    order = [(i["track"], round(i["position"], 3), round(i["length"], 3)) for i in items]
    seams = [round((b["position"] - (a["position"] + a["length"])) * 1000) for a, b in itertools.pairwise(items)]
    totals = [round(g_[2] + g_[3] + g_[4]) for g_ in gaps]
    undo = env.lua("return reaper.Undo_CanUndo2(0) or ''")
    rows = "; ".join(f"{o}->{n}: stop {a:.0f} + arm {b:.0f} + start {c:.0f} ms, undo points {p}, started at {at:.3f}" for o, n, a, b, c, p, at in gaps)
    return f"{rows}. Total per switch {totals} ms (driver round trips included). Items in time order {order}; seams {seams} ms. Last undo {undo!r}"


@scenario(
    "booth_voices",
    "(snippet) I_RECARM during recording",
    "voices phase 0: a live arm switch during a take (disarm the recording child, arm another); what REAPER does with the take in progress",
    needs_audio=True,
)
def live_arm_switch(env: Env) -> str:
    folder_book(env)
    arm_only_by_hand(env, "Narrator")
    env.lua("reaper.SetEditCurPos(1, false, false) reaper.CSurf_OnRecord() return true")
    env.wait_for(lambda: recording(env), what="recording to start")
    env.wait_for(lambda: position(env) > 2.5, timeout=8, what="the first part to run")
    at = env.lua(
        """
        local at = reaper.GetPlayPosition()
        reaper.SetMediaTrackInfo_Value(ci.track_by_name('Narrator'), 'I_RECARM', 0)
        reaper.SetMediaTrackInfo_Value(ci.track_by_name('Veyra'), 'I_RECARM', 1)
        return at
        """
    )
    time.sleep(0.3)
    still = recording(env)
    env.wait_for(lambda: position(env) > at + 1.5, timeout=8, what="the take to run on after the switch")
    stop_at = position(env)
    stop_by_hand(env)
    env.wait_for(lambda: play_state(env) == 0, what="REAPER to stop")
    tracks = per_track(settled_items(env, 2))
    undo = env.lua("return reaper.Undo_CanUndo2(0) or ''")
    env.lua("reaper.Undo_DoUndo2(0) return true")
    after_undo = per_track(env.snapshot()["items"])
    return (
        f"switched at {at:.3f} s (heard position), stopped at {stop_at:.3f} s; still recording after the switch: {still}; items {tracks}; "
        f"undo {undo!r}, one Undo left {after_undo}"
    )


@scenario(
    "booth_voices",
    "(snippet) I_RECARM during recording",
    "voices phase 0: a live switch that arms the new child first and disarms the old one 100 ms later; overlap instead of a hole",
    needs_audio=True,
)
def live_arm_overlap(env: Env) -> str:
    folder_book(env)
    arm_only_by_hand(env, "Narrator")
    env.lua("reaper.SetEditCurPos(1, false, false) reaper.CSurf_OnRecord() return true")
    env.wait_for(lambda: recording(env), what="recording to start")
    env.wait_for(lambda: position(env) > 2.5, timeout=8, what="the first part to run")
    env.lua(
        """
        local s = { at = reaper.GetPlayPosition(), processed = reaper.GetPlayPosition2() }
        ci.overlap = s
        local t0 = reaper.time_precise()
        reaper.SetMediaTrackInfo_Value(ci.track_by_name('Veyra'), 'I_RECARM', 1)
        local function tick()
          if reaper.time_precise() - t0 >= 0.1 then
            reaper.SetMediaTrackInfo_Value(ci.track_by_name('Narrator'), 'I_RECARM', 0)
            s.disarmed_at = reaper.GetPlayPosition()
            return
          end
          reaper.defer(tick)
        end
        reaper.defer(tick)
        return true
        """
    )
    s = env.wait_for(lambda: (v := env.lua("return ci.overlap")) and v.get("disarmed_at") and v, what="the delayed disarm")
    env.wait_for(lambda: position(env) > s["at"] + 1.5, timeout=8, what="the take to run on")
    stop_by_hand(env)
    env.wait_for(lambda: play_state(env) == 0, what="REAPER to stop")
    items = settled_items(env, 2)
    tracks = per_track(items)
    old = next(i for i in items if i["track"] == "Narrator")
    new = next(i for i in items if i["track"] == "Veyra")
    overlap = old["position"] + old["length"] - new["position"]
    return (
        f"armed Veyra at {s['at']:.3f} s heard ({s['processed']:.3f} s processed), disarmed Narrator at {s['disarmed_at']:.3f} s heard; "
        f"items {tracks}; overlap {overlap * 1000:+.0f} ms"
    )


@scenario(
    "booth_voices",
    "(snippet) I_RECARM during recording",
    "voices phase 0: arming a second child during a take without disarming the first; whether REAPER starts recording it and from where",
    needs_audio=True,
)
def live_arm_add(env: Env) -> str:
    folder_book(env)
    arm_only_by_hand(env, "Narrator")
    env.lua("reaper.SetEditCurPos(1, false, false) reaper.CSurf_OnRecord() return true")
    env.wait_for(lambda: recording(env), what="recording to start")
    env.wait_for(lambda: position(env) > 2.5, timeout=8, what="the first part to run")
    at = env.lua("local at = reaper.GetPlayPosition() reaper.SetMediaTrackInfo_Value(ci.track_by_name('Veyra'), 'I_RECARM', 1) return at")
    env.wait_for(lambda: position(env) > at + 1.5, timeout=8, what="the take to run on")
    stop_at = position(env)
    stop_by_hand(env)
    env.wait_for(lambda: play_state(env) == 0, what="REAPER to stop")
    tracks = per_track(settled_items(env, 2))
    return f"armed Veyra at {at:.3f} s, stopped at {stop_at:.3f} s; items {tracks}"


@scenario(
    "booth_voices",
    "arm_only, record_start, record_stop, (snippet) Undo_DoUndo2",
    "voices phase 0: Undo after takes on two children; each take is its own point, Undo takes the last voice's item only, arms and folder depths survive",
    needs_audio=True,
)
def undo_after_switch(env: Env) -> str:
    g = folder_book(env)
    env.lua("reaper.SetEditCurPos(1, false, false) return true")
    labels = []
    for voice in ("Narrator", "Veyra"):
        env.ok("arm_only", g[voice], until="ARMED")
        env.ok("record_start", g[voice], until="RECORD_STARTED")
        until = 3.2 if voice == "Veyra" else 2.2
        env.wait_for(lambda until=until: position(env) > until, timeout=8, what=f"{voice}'s take")
        env.ok("record_stop", until="RECORD_STOPPED")
        env.wait_for(lambda: play_state(env) == 0, what="REAPER to stop")
        labels.append(env.lua("return reaper.Undo_CanUndo2(0) or ''"))
    settled_items(env, 2)
    before = structure(env)
    one = env.lua("local l = reaper.Undo_CanUndo2(0) or '' reaper.Undo_DoUndo2(0) return l")
    after_one = per_track(env.snapshot()["items"])
    after = structure(env)
    assert [(r["name"], r["delta"]) for r in after] == [(r["name"], r["delta"]) for r in before], "Undo changed the folder structure"
    assert "Veyra" not in after_one and len(after_one.get("Narrator", [])) == 1, f"after one Undo {after_one}"
    two = env.lua("local l = reaper.Undo_CanUndo2(0) or '' reaper.Undo_DoUndo2(0) return l")
    after_two = per_track(env.snapshot()["items"])
    arms = {r["name"]: r["arm"] for r in structure(env)}
    return f"undo labels after each take {labels}; Undo 1 ({one!r}) left {after_one}; Undo 2 ({two!r}) left {after_two}; arms after both {arms}; folder depths unchanged"


# -- FX on a child and on the folder -------------------------------------------------------------------------------------------


@scenario(
    "booth_voices",
    "apply_fx_chain",
    "voices phase 0: apply_fx_chain on a child changes that child's items in the mix only; on the folder it changes every child's",
)
def fx_child_and_folder(env: Env) -> str:
    from scenarios_session import make_chains

    g = folder_book(env, audio=True)
    env.lua("reaper.SetMediaTrackInfo_Value(ci.track_by_name('Chapter 4'), 'B_MUTE', 1) return true")
    make_chains(env)
    a0, b0 = mix_tones(env, "voices_dry")
    env.ok("apply_fx_chain", g["Veyra"], "Voice/Quiet.RfxChain", until="FX_CHAIN_APPLIED")
    a1, b1 = mix_tones(env, "voices_child_fx")
    env.ok("apply_fx_chain", g["Chapter 3"], "Voice/Quiet.RfxChain", until="FX_CHAIN_APPLIED")
    a2, b2 = mix_tones(env, "voices_folder_fx")
    from scenario import db

    d_child_a, d_child_b = db(a1 / a0), db(b1 / b0)
    d_folder_a, d_folder_b = db(a2 / a0), db(b2 / b0)
    near(d_child_a, 0.0, 0.5, "Narrator after a chain on Veyra (dB)")
    near(d_child_b, -12.0, 0.5, "Veyra after its own -12 dB chain (dB)")
    near(d_folder_a, -12.0, 0.5, "Narrator after the folder's -12 dB chain (dB)")
    near(d_folder_b, -24.0, 0.5, "Veyra after its chain and the folder's (dB)")
    return (
        f"chain on Veyra: Narrator {d_child_a:+.1f} dB, Veyra {d_child_b:+.1f} dB; then on the folder too: Narrator {d_folder_a:+.1f} dB, "
        f"Veyra {d_folder_b:+.1f} dB (rendered master mix, -12 dB JS Volume Adjustment chain)"
    )


# -- Editing play and the track state with items on children only --------------------------------------------------------------


@scenario(
    "booth_voices",
    "play_range, chapter_track_state",
    "voices phase 2: a folder whose items are all on its children: chapter_track_state with children lists both children's items with their tracks, "
    "the one-track read still lists none, and play_range naming the folder plays both children and not the next chapter",
    needs_audio=True,
)
def folder_reads(env: Env) -> str:
    g = folder_book(env, audio=True)
    plain = env.send("chapter_track_state", g["Chapter 3"], until={"TRACK_STATE_END", "TRACK_STALE"})
    assert plain[-1][0] == "TRACK_STATE_END" and plain[-1][2:4] == ["0", "0"], f"one-track read of the folder {plain}"
    union = env.send("chapter_track_state", g["Chapter 3"], "children", until={"TRACK_STATE_END", "TRACK_STALE"})
    rows = [(e[8].replace("\\", "/").rsplit("/", 1)[-1], e[10]) for e in union if e[0] == "TRACK_ITEM"]
    assert rows == [("tone_a.wav", g["Narrator"]), ("tone_b.wav", g["Veyra"])], f"children read {rows}"
    assert union[-1][2:4] == ["2", "2"], f"listed/total {union[-1][2:4]}"
    before = narrator_state(env)
    play_range(env, 0.5, 4.0, g["Chapter 3"])
    # One render: it takes the transport, so the bridge sees REAPER stop and puts the solos back before any second render.
    mix = env.render_mix("voices_folder_play", 1.0, 2.0)
    narrator, veyra, chapter4 = (mix.tone(0.0, 1.0, hz) for hz in (440.0, 660.0, 880.0))
    stop_by_hand(env)
    env.wait_for(lambda: narrator_state(env) == before, timeout=8, what="the tracks to be put back")
    assert narrator > 0.1 and veyra > 0.1, f"playing the folder: Narrator {narrator:.3f}, Veyra {veyra:.3f}"
    assert chapter4 < 0.02, f"Chapter 4 is audible while the folder plays: {chapter4:.3f}"
    return (
        f"one-track read of the folder 0 of 0; children read {len(rows)} items, each with its child's GUID; play_range on the folder: "
        f"Narrator {narrator:.2f}, Veyra {veyra:.2f}, Chapter 4 {chapter4:.3f} in the mix, tracks put back"
    )


@scenario(
    "booth_voices",
    "(snippet) I_SOLO on a folder",
    "voices phase 0: solo-in-place on the folder plays every child and silences the flat chapter after it (the candidate fix for Editing play)",
    needs_audio=True,
)
def folder_solo_plays_children(env: Env) -> str:
    folder_book(env, audio=True)
    env.lua(
        """
        for i = 0, reaper.CountTracks(0) - 1 do
          local t = reaper.GetTrack(0, i)
          reaper.SetMediaTrackInfo_Value(t, 'I_SOLO', select(2, reaper.GetTrackName(t)) == 'Chapter 3' and 2 or 0)
        end
        return true
        """
    )
    mix = env.render_mix("voices_folder_solo", 1.0, 2.0)
    a, b, c = (mix.tone(0.0, 1.0, hz) for hz in (440.0, 660.0, 880.0))
    env.lua("for i = 0, reaper.CountTracks(0) - 1 do reaper.SetMediaTrackInfo_Value(reaper.GetTrack(0, i), 'I_SOLO', 0) end return true")
    assert a > 0.1 and b > 0.1, f"a child is silent with the folder soloed: Narrator {a:.3f}, Veyra {b:.3f}"
    assert c < 0.02, f"Chapter 4 is audible with only the folder soloed: {c:.3f}"
    return f"folder soloed in place: Narrator {a:.2f}, Veyra {b:.2f}, Chapter 4 {c:.3f} in the rendered mix"
