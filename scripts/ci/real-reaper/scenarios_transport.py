"""Real-REAPER scenarios, group 4: the transport, recording, roll, punch, the monitor level and the meters, on the JACK dummy audio device.

REAPER plays and records for real here (the device is a sound server with no hardware, so what is recorded is silence): a scenario arms a
track, sends the product's own command and asserts on REAPER's play state, the items a recording leaves and the arms, not on a sound.
What it cannot prove (a real microphone's level, hearing the roll, a hardware output's gain) is in the owner steps of
docs/operations/reaper-verification-pass.md, "Real-REAPER CI run (Linux)".
"""

from __future__ import annotations

import shutil
import subprocess
import time

from scenario import Env, items_on, near, scenario
from scenarios_session import GUID_NONE

TRACKS = ("Chapter 1", "Chapter 2", "Pickups")


def book(env: Env) -> dict:
    """Chapter 1 holds an earlier read (tone_a, 0-5 s); Chapter 2 and Pickups are empty; saved and reopened. Answers the track GUIDs."""
    return env.lua(
        """
        local one = ci.add_track('Chapter 1')
        ci.add_track('Chapter 2')
        ci.add_track('Pickups')
        ci.add_item(one, args[1], 0, 5)
        ci.save_and_reload(ci.rpp)
        return {
          ch1 = reaper.GetTrackGUID(ci.track_by_name('Chapter 1')),
          ch2 = reaper.GetTrackGUID(ci.track_by_name('Chapter 2')),
          pickups = reaper.GetTrackGUID(ci.track_by_name('Pickups')),
        }
        """,
        env.media_path("tone_a"),
    )


def arms(env: Env) -> dict[str, bool]:
    return {t["name"]: t["armed"] for t in env.snapshot()["tracks"]}


def arm_by_hand(env: Env, *names: str) -> None:
    env.lua(
        "for _, name in ipairs(args) do reaper.SetMediaTrackInfo_Value(ci.track_by_name(name), 'I_RECARM', 1) end return true",
        *names,
    )


def play_state(env: Env) -> int:
    return env.lua("return reaper.GetPlayState()")


def stop_by_hand(env: Env) -> None:
    env.lua("reaper.OnStopButton() return true")


# -- playback and the play position -------------------------------------------------------------------------------------------


@scenario(
    "track_state",
    "chapter_track_state",
    "track state: playing from 1 s reports play state 1 and a moving position, the edit cursor stays where it started",
    needs_audio=True,
)
def track_state_playing(env: Env) -> str:
    fx = book(env)
    env.lua("reaper.SetEditCurPos(1, false, false) reaper.OnPlayButton() return true")
    try:
        env.wait_for(lambda: play_state(env) == 1, what="playback to start")
        first = next(e for e in env.send("chapter_track_state", fx["ch1"], until={"TRACK_STATE_END"}) if e[0] == "TRACK_STATE")
        time.sleep(0.5)
        second = next(e for e in env.send("chapter_track_state", fx["ch1"], until={"TRACK_STATE_END"}) if e[0] == "TRACK_STATE")
    finally:
        stop_by_hand(env)
    assert first[3] == "1" and second[3] == "1", f"play state {first[3]}, {second[3]}"
    moved = float(second[5]) - float(first[5])
    assert 0.3 < moved < 1.5, f"the play position moved {moved:.3f} s in about 0.5 s"
    near(float(second[4]), 1.0, 1e-6, "edit cursor while playing")
    return f"play state 1 both reads, position moved {moved:.2f} s in ~0.5 s, cursor stayed at 1 s"


@scenario("punch", "play_position", "play position: stopped, playing from 1 s (heard and processed positions), and recording", needs_audio=True)
def play_position(env: Env) -> str:
    book(env)
    env.lua("reaper.SetEditCurPos(2.5, false, false) return true")
    stopped = env.ok("play_position", until="PLAY_POSITION")
    # Stopped, REAPER's two play positions are where it last played (not the cursor), so only the state and the cursor are the app's to use.
    assert stopped[2] == "0" and abs(float(stopped[5]) - 2.5) < 1e-6, f"stopped {stopped[2:]}"
    env.lua("reaper.SetEditCurPos(1, false, false) reaper.OnPlayButton() return true")
    try:
        env.wait_for(lambda: play_state(env) == 1, what="playback to start")
        one = env.ok("play_position", until="PLAY_POSITION")
        time.sleep(0.5)
        two = env.ok("play_position", until="PLAY_POSITION")
    finally:
        stop_by_hand(env)
    assert one[2] == "1" and two[2] == "1", f"play state {one[2]}, {two[2]}"
    moved = float(two[3]) - float(one[3])
    assert 0.3 < moved < 1.5, f"GetPlayPosition moved {moved:.3f} s"
    near(float(two[5]), 1.0, 1e-6, "edit cursor while playing")
    gap = float(two[4]) - float(two[3])  # GetPlayPosition2 is what REAPER processes now, GetPlayPosition what is heard
    arm_by_hand(env, "Chapter 1")
    env.lua("reaper.SetEditCurPos(5, false, false) reaper.CSurf_OnRecord() return true")
    try:
        env.wait_for(lambda: play_state(env) & 4 == 4, what="recording to start")
        time.sleep(0.5)
        recording = env.ok("play_position", until="PLAY_POSITION")
    finally:
        stop_by_hand(env)
    assert recording[2] == "5", f"recording play state {recording[2]}"
    assert float(recording[3]) > 5.0, f"the position did not move while recording: {recording[3]}"
    return f"state 0/1/5 (stopped: heard {float(stopped[3]):.2f}, processed {float(stopped[4]):.2f}, cursor 2.5); playing: position moved {moved:.2f} s in ~0.5 s; processed minus heard {gap * 1000:+.0f} ms on a 1024-frame JACK device"


@scenario(
    "punch",
    "punch_to",
    "punch: the cursor goes to the word minus the pre-roll and never before 0, in view, playback never started; bad input and recording refused",
    needs_audio=True,
)
def punch_to(env: Env) -> str:
    fx = book(env)
    undo = env.snapshot()["undo"]
    done = env.ok("punch_to", "42.5", "3", until="PUNCHED")
    near(float(done[2]), 39.5, 1e-6, "cursor after punch_to 42.5 with 3 s")
    state = env.snapshot()
    near(state["cursor"], 39.5, 1e-6, "REAPER's edit cursor")
    assert state["play_state"] == 0 and state["undo"] == undo, "punch_to started playback or opened an undo point"
    first, last = env.lua("local a, b = reaper.GetSet_ArrangeView2(0, false, 0, 0, 0, 0) return { a, b }")
    assert first <= 39.5 <= last, f"the cursor is not in view: {first}..{last}"
    near(float(env.ok("punch_to", "1.25", "3", until="PUNCHED")[2]), 0.0, 1e-9, "a cursor before the start")
    env.refused("punch_to", "42", "11")
    env.refused("punch_to", "-1", "3")
    env.refused("punch_to", "abc", "3")
    arm_by_hand(env, "Chapter 1")
    env.lua("reaper.CSurf_OnRecord() return true")
    try:
        env.wait_for(lambda: play_state(env) & 4 == 4, what="recording to start")
        recording = env.refused("punch_to", "42", "3")
        assert "recording" in recording[2], recording[2]
    finally:
        stop_by_hand(env)
    del fx
    return f"39.5 s, view {first:.1f}..{last:.1f} s, 0 s floor, 3 refusals and one while recording"


def recorded_items(env: Env, count: int) -> list[dict]:
    """Chapter 1's items once REAPER has made the recording an item (it does so a moment after the stop)."""

    def ready():
        items = items_on(env.snapshot(), "Chapter 1")
        return items if len(items) >= count and all(t["file"] for i in items for t in i["takes"]) else None

    return env.wait_for(ready, what=f"Chapter 1 to hold {count} items, each take with its file")


# -- record ------------------------------------------------------------------------------------------------------------------


@scenario(
    "record",
    "arm_only, record_start, record_stop",
    "record: arm only the track, start, stop; the recording is an item on the track and the narrator's arms come back",
    needs_audio=True,
)
def record_cycle(env: Env) -> str:
    fx = book(env)
    arm_by_hand(env, "Chapter 2", "Pickups")
    env.lua("reaper.SetEditCurPos(6, false, false) return true")  # after the earlier read, so the recording overlaps nothing
    undo = env.snapshot()["undo"]
    armed = env.ok("arm_only", fx["ch1"], until="ARMED")
    assert armed[2:5] == [fx["ch1"], "2", "1"], f"track/disarmed/changed {armed[2:]}"
    assert arms(env) == {"Chapter 1": True, "Chapter 2": False, "Pickups": False}, arms(env)
    assert env.snapshot()["undo"] == undo, "arm_only opened an undo point"
    again = env.ok("arm_only", fx["ch1"], until="ARMED")
    assert again[3:5] == ["0", "0"], f"second arm_only answered {again[3:5]}"
    started = env.ok("record_start", fx["ch1"], until="RECORD_STARTED")
    assert started[2] == fx["ch1"], started
    assert play_state(env) & 4 == 4, "REAPER is not recording"
    state = next(e for e in env.send("chapter_track_state", fx["ch1"], until={"TRACK_STATE_END"}) if e[0] == "TRACK_STATE")
    assert state[3] == "5" and state[9] == "1" and state[10] == "1", f"play state / this armed / armed count {state[3]}, {state[9]}, {state[10]}"
    env.wait_for(lambda: env.lua("return reaper.GetPlayPosition()") > 7.2, timeout=8, what="the recording to run for over a second")
    stopped = env.ok("record_stop", until="RECORD_STOPPED")
    assert stopped[2:4] == ["3", "0"], f"restored/kept {stopped[2:]} (Chapter 1's own arm goes back too)"
    env.wait_for(lambda: play_state(env) == 0, what="REAPER to stop")
    assert arms(env) == {"Chapter 1": False, "Chapter 2": True, "Pickups": True}, f"arms after the stop {arms(env)}"
    items = recorded_items(env, 2)
    recorded = next(i for i in items if i["takes"][0]["file"] != "tone_a.wav")
    assert recorded["takes"][0]["file"].lower().endswith(".wav") and recorded["length"] > 0.3, (
        f"recorded item {recorded['takes'][0]['file']} {recorded['length']}"
    )
    env.refused("record_stop", tag="RECORD_NOT_OURS")
    return f"armed 2 others off, recorded {recorded['length']:.1f} s of silence into {recorded['takes'][0]['file']}, all 3 arms put back, a second stop is RECORD_NOT_OURS"


@scenario(
    "undo_last",
    "record_stop, last_action, undo_last",
    "undo last: the take the app recorded is REAPER's last action, one undo takes it away (and rejoins an item it split), and a later edit is never undone",
    needs_audio=True,
)
def undo_record_take(env: Env) -> str:
    fx = book(env)
    assert env.ok("last_action", "record_take", until="LAST_ACTION")[3] == "other", "no take yet, yet last_action answered this"
    env.lua("reaper.SetEditCurPos(2, false, false) return true")  # inside the earlier read, so the take splits it
    env.ok("arm_only", fx["ch1"], until="ARMED")
    env.ok("record_start", fx["ch1"], until="RECORD_STARTED")
    env.wait_for(lambda: env.lua("return reaper.GetPlayPosition()") > 3.2, timeout=8, what="the recording to run for over a second")
    stopped = env.ok("record_stop", until="RECORD_STOPPED")
    assert stopped[4:5] == ["1"], f"record_stop reported undo points {stopped[4:]} (REAPER's one Recorded media point)"
    env.wait_for(lambda: play_state(env) == 0, what="REAPER to stop")
    assert len(recorded_items(env, 3)) == 3, "the take did not split the earlier read"
    assert env.ok("last_action", "record_take", until="LAST_ACTION")[3] == "this", "right after the take last_action did not answer this"
    undone = env.ok("undo_last", "record_take", "12", until="UNDONE_LAST")
    assert undone[3:5] == ["12", "1"], f"undo_last answered {undone[3:]}"
    items = items_on(env.snapshot(), "Chapter 1")
    assert [(round(i["position"], 3), round(i["length"], 3), len(i["takes"])) for i in items] == [(0.0, 5.0, 1)], f"after the undo {items}"
    again = env.ok("undo_last", "record_take", "1", until="UNDONE_LAST")
    assert again[4] == "0", "a second undo_last undid something"
    env.lua("reaper.SetEditCurPos(8, false, false) return true")
    env.ok("arm_only", fx["ch1"], until="ARMED")
    env.ok("record_start", fx["ch1"], until="RECORD_STARTED")
    env.wait_for(lambda: env.lua("return reaper.GetPlayPosition()") > 9.2, timeout=8, what="the second recording to run")
    env.ok("record_stop", until="RECORD_STOPPED")
    env.wait_for(lambda: play_state(env) == 0, what="REAPER to stop")
    recorded_items(env, 2)
    env.lua(
        """
        reaper.Undo_BeginBlock2(0)
        reaper.SetMediaItemInfo_Value(reaper.GetTrackMediaItem(ci.track_by_name('Chapter 1'), 0), 'D_VOL', 0.5)
        reaper.Undo_EndBlock2(0, 'Narrator edit', -1)
        return true
        """
    )
    assert env.ok("last_action", "record_take", until="LAST_ACTION")[3] == "other", "a narrator's later edit is reported as the take"
    kept = env.ok("undo_last", "record_take", "1", until="UNDONE_LAST")
    assert kept[4] == "0" and len(items_on(env.snapshot(), "Chapter 1")) == 2, "undo_last undid past the narrator's edit"
    return (
        "the take left 1 point, one undo_last removed it and rejoined the split read (1 item, 1 take), a second undid nothing, a later narrator edit blocked it"
    )


@scenario(
    "record",
    "record_start, record_stop",
    "record: with time-selection auto-punch REAPER records only inside the selection (row B2's second half)",
    needs_audio=True,
)
def record_auto_punch(env: Env) -> str:
    fx = book(env)
    env.lua(
        """
        reaper.GetSet_LoopTimeRange(true, false, 8, 9.2, false)
        reaper.Main_OnCommand(40076, 0) -- Record: set record mode to time selection auto-punch
        reaper.SetEditCurPos(7, false, false)
        return true
        """
    )
    try:
        env.ok("arm_only", fx["ch1"], until="ARMED")
        started = env.ok("record_start", fx["ch1"], until="RECORD_STARTED")
        near(float(started[3]), 7.0, 1e-6, "the cursor the recording began from")
        env.wait_for(lambda: env.lua("return reaper.GetPlayPosition()") > 9.6, timeout=10, what="the recording to pass the punch-out")
        env.ok("record_stop", until="RECORD_STOPPED")
        env.wait_for(lambda: play_state(env) == 0, what="REAPER to stop")
        items = [i for i in recorded_items(env, 2) if i["position"] > 5.5]
    finally:
        env.lua("reaper.Main_OnCommand(40252, 0) return true")  # Record: set record mode to normal
    assert len(items) == 1, f"{len(items)} recorded items"
    near(items[0]["position"], 8.0, 0.15, "the recorded item starts at the punch-in")
    near(items[0]["position"] + items[0]["length"], 9.2, 0.15, "and ends at the punch-out")
    return f"auto-punch honoured: the item covers {items[0]['position']:.2f}-{items[0]['position'] + items[0]['length']:.2f} s of a recording that began at 7 s"


@scenario("record", "record_start", "record: the end rule moves the cursor to the end of the track's last item first", needs_audio=True)
def record_from_end(env: Env) -> str:
    fx = book(env)
    env.ok("arm_only", fx["ch1"], until="ARMED")
    started = env.ok("record_start", fx["ch1"], "end", until="RECORD_STARTED")
    near(float(started[3]), 5.0, 1e-6, "recording starts at the end of the last item")
    time.sleep(1.0)
    env.ok("record_stop", until="RECORD_STOPPED")
    env.wait_for(lambda: play_state(env) == 0, what="REAPER to stop")
    items = recorded_items(env, 2)
    assert items[0]["position"] == 0.0 and items[-1]["position"] >= 4.9, f"items {[(i['position'], i['length']) for i in items]}"
    return "recording began at 5.0 s; the earlier read is untouched"


@scenario(
    "record",
    "record_stop, record_start",
    "record: stopping in REAPER ends the app's recording (RECORD_ENDED) and restores the arms; a recording the app did not start is not stopped",
    needs_audio=True,
)
def record_stopped_in_reaper(env: Env) -> str:
    fx = book(env)
    arm_by_hand(env, "Chapter 2")
    env.ok("arm_only", fx["ch1"], until="ARMED")
    run = env.start("record_start", fx["ch1"])
    env.wait_event(run, "RECORD_STARTED")
    time.sleep(0.8)
    stop_by_hand(env)
    ended = env.wait_event(run, "RECORD_ENDED")
    assert ended[2:4] == ["2", "0"], f"restored/kept {ended[2:]}"
    assert arms(env)["Chapter 2"] and not arms(env)["Chapter 1"], f"arms {arms(env)}"
    env.refused("record_stop", tag="RECORD_NOT_OURS")
    # Record pressed in REAPER itself: the app does not own it, record_stop leaves it running.
    arm_by_hand(env, "Chapter 1")
    env.lua("reaper.CSurf_OnRecord() return true")
    try:
        env.wait_for(lambda: play_state(env) & 4 == 4, what="REAPER to record")
        env.refused("record_stop", tag="RECORD_NOT_OURS")
        time.sleep(0.3)
        assert play_state(env) & 4 == 4, "record_stop stopped a recording the app did not start"
    finally:
        stop_by_hand(env)
    return "RECORD_ENDED restored 2 arms; RECORD_NOT_OURS twice, the narrator's own recording kept running"


@scenario("record", "record_stop", "record: an arm the narrator changes during the take is kept and reported", needs_audio=True)
def record_arm_changed(env: Env) -> str:
    fx = book(env)
    arm_by_hand(env, "Chapter 2")
    env.ok("arm_only", fx["ch1"], until="ARMED")
    env.ok("record_start", fx["ch1"], until="RECORD_STARTED")
    arm_by_hand(env, "Pickups")
    time.sleep(0.4)
    stopped = env.ok("record_stop", until="RECORD_STOPPED")
    env.wait_for(lambda: play_state(env) == 0, what="REAPER to stop")
    assert stopped[2:4] == ["2", "1"], f"restored/kept {stopped[2:]}"
    assert arms(env) == {"Chapter 1": False, "Chapter 2": True, "Pickups": True}, arms(env)
    return "Chapter 1 disarmed and Chapter 2 re-armed (restored 2), Pickups left armed as the narrator set it (kept 1)"


@scenario(
    "record",
    "record_start",
    "record: refused with two tracks armed, another track armed, none armed, a stale track and while playing; REAPER does not record",
    needs_audio=True,
)
def record_refusals(env: Env) -> str:
    fx = book(env)
    messages = []
    messages.append(env.refused("record_start", fx["ch1"])[2])  # none armed
    arm_by_hand(env, "Chapter 1", "Chapter 2")
    messages.append(env.refused("record_start", fx["ch1"])[2])  # two armed
    env.lua("reaper.SetMediaTrackInfo_Value(ci.track_by_name('Chapter 1'), 'I_RECARM', 0) return true")
    messages.append(env.refused("record_start", fx["ch1"])[2])  # another track armed
    env.refused("record_start", GUID_NONE, tag="TRACK_STALE")
    env.refused("record_start", fx["ch2"], "sideways")
    arm_by_hand(env, "Chapter 1")
    env.lua("reaper.SetMediaTrackInfo_Value(ci.track_by_name('Chapter 2'), 'I_RECARM', 0) reaper.OnPlayButton() return true")
    try:
        env.wait_for(lambda: play_state(env) == 1, what="playback to start")
        messages.append(env.refused("record_start", fx["ch1"])[2])  # playing
        assert play_state(env) & 4 == 0, "REAPER recorded while playing"
    finally:
        stop_by_hand(env)
    wanted = ["No track is armed.", "More than one track is armed.", "Another track is armed.", "REAPER is playing. Stop it first."]
    assert messages == wanted, f"messages {messages}"
    assert not items_on(env.snapshot(), "Chapter 2") and len(items_on(env.snapshot(), "Chapter 1")) == 1, "a refused start left a recording"
    return "5 refusals, no recording"


# -- roll --------------------------------------------------------------------------------------------------------------------


def timed(env: Env, steps: list[tuple[str, float]], label: str, command: str, *args: object, until: str) -> list[str]:
    """One bridge command as the host sends it, with its round trip in milliseconds appended to steps."""
    began = time.monotonic()
    answer = env.ok(command, *args, until=until)
    steps.append((label, (time.monotonic() - began) * 1000))
    return answer


@scenario(
    "punch",
    "chapter_track_state, arm_only, punch_to, record_start",
    "punch and roll start: the four bridge steps of one Booth press timed one by one",
    needs_audio=True,
)
def punch_start_timing(env: Env) -> str:
    """Click-to-record-start on the bridge side: readAloudRecordStartFrom's four commands, in its order, each timed from the harness.

    A round trip here is the harness's file protocol plus REAPER's defer loop, as the host's is. The listening session's start is the
    page's own and is not on the bridge. The numbers go in the row's detail; the asserts only keep the sequence correct.
    """
    fx = book(env)
    steps: list[tuple[str, float]] = []
    for _ in range(3):  # a bridge command with no work, for the floor of one round trip
        timed(env, steps, "baseline play_position", "play_position", until="PLAY_POSITION")
    state_events = None
    began = time.monotonic()
    state_events = env.send("chapter_track_state", fx["ch1"], until={"TRACK_STATE_END"})
    steps.append(("chapter_track_state", (time.monotonic() - began) * 1000))
    assert any(e[0] == "TRACK_STATE" for e in state_events), state_events
    timed(env, steps, "arm_only", "arm_only", fx["ch1"], until="ARMED")
    timed(env, steps, "punch_to (pre-roll 0)", "punch_to", "2", "0", until="PUNCHED")
    began = time.monotonic()
    env.ok("record_start", fx["ch1"], "", until="RECORD_STARTED")
    steps.append(("record_start", (time.monotonic() - began) * 1000))
    assert play_state(env) & 4 == 4, "REAPER is not recording"
    try:
        sequence = [ms for label, ms in steps if not label.startswith("baseline")]
        base = [ms for label, ms in steps if label.startswith("baseline")]
        total = sum(sequence)
        print("punch_start_timing_ms " + ", ".join(f"{label}={ms:.0f}" for label, ms in steps) + f", total={total:.0f}", flush=True)
        result = (
            f"read+arm+cursor+record {total:.0f} ms ("
            + ", ".join(f"{label} {ms:.0f}" for label, ms in steps if not label.startswith("baseline"))
            + f"); one empty round trip {min(base):.0f}-{max(base):.0f} ms"
        )
        env.ok("record_stop", until="RECORD_STOPPED")
        env.wait_for(lambda: play_state(env) == 0, what="REAPER to stop")
        before = env.lua("local _, a = reaper.get_config_var_string('preroll') local _, b = reaper.get_config_var_string('prerollmeas') return {a, b}")
        off_bridge, off_lead = seconds_to_cursor(env, fx["ch1"], 12.0)
        env.ok("record_stop", until="RECORD_STOPPED")
        env.wait_for(lambda: play_state(env) == 0, what="REAPER to stop")
        try:
            env.lua("reaper.set_config_var_string('preroll', '2', 0) reaper.set_config_var_string('prerollmeas', '2', 0) return true")
            on_bridge, on_lead = seconds_to_cursor(env, fx["ch1"], 20.0)
            env.ok("record_stop", until="RECORD_STOPPED")
            env.wait_for(lambda: play_state(env) == 0, what="REAPER to stop")
        finally:
            env.lua("reaper.set_config_var_string('preroll', args[1], 0) reaper.set_config_var_string('prerollmeas', args[2], 0) return true", *before)
        print(
            f"punch_start_timing_preroll off: bridge {off_bridge:.0f} ms, play head at the cursor after {off_lead:.2f} s; on (2 measures): bridge {on_bridge:.0f} ms, after {on_lead:.2f} s",
            flush=True,
        )
        return result + f"; pre-roll off: play head at the cursor {off_lead:.2f} s after record_start; pre-roll on, 2 measures: {on_lead:.2f} s"
    finally:
        if play_state(env) & 4:
            stop_by_hand(env)


def seconds_to_cursor(env: Env, track: str, at: float) -> tuple[float, float]:
    """Milliseconds for the bridge's four steps, and seconds from the record_start command until REAPER's play head reaches the cursor.

    With pre-roll on record REAPER reports recording at once but plays in from before the cursor, so the second number is the lead-in
    the narrator waits through. Leaves the recording running; the caller stops it.
    """
    env.lua("reaper.SetEditCurPos(args[1], false, false) return true", at)
    began = time.monotonic()
    env.send("chapter_track_state", track, until={"TRACK_STATE_END"})
    env.ok("arm_only", track, until="ARMED")
    env.ok("punch_to", f"{at}", "0", until="PUNCHED")
    sent = time.monotonic()
    env.ok("record_start", track, "", until="RECORD_STARTED")
    bridge = (time.monotonic() - began) * 1000
    env.wait_for(lambda: env.lua("return reaper.GetPlayPosition()") >= at - 0.02, timeout=15, what="the play head to reach the cursor")
    return bridge, time.monotonic() - sent


@scenario(
    "punch",
    "roll",
    "roll: stops the app's recording, moves back and records again over it; the earlier pass is kept (a take or an item) and nothing is deleted",
    needs_audio=True,
)
def roll(env: Env) -> str:
    fx = book(env)
    env.lua("reaper.SetEditCurPos(10, false, false) return true")
    env.ok("arm_only", fx["ch1"], until="ARMED")
    env.ok("record_start", fx["ch1"], until="RECORD_STARTED")
    env.wait_for(lambda: env.lua("return reaper.GetPlayPosition()") > 12.0, timeout=8, what="two seconds of recording")
    rolled = env.ok("roll", fx["ch1"], "11", until="ROLLED", timeout=20)
    assert rolled[2] == fx["ch1"] and abs(float(rolled[3]) - 11.0) < 1e-6 and rolled[4] == "0", f"answered {rolled[2:]}"
    env.wait_for(lambda: play_state(env) & 4 == 4, what="REAPER to record again")
    assert env.lua("return reaper.GetCursorPosition()") <= 11.5, "the cursor was not moved back to the roll time"
    time.sleep(1.0)
    env.ok("record_stop", until="RECORD_STOPPED")
    env.wait_for(lambda: play_state(env) == 0, what="REAPER to stop")
    state = env.snapshot()
    chapter = [i for i in items_on(state, "Chapter 1") if i["position"] >= 9.5]
    takes = sum(len(i["takes"]) for i in chapter)
    assert takes >= 2, f"the earlier pass is gone: {[(i['position'], i['length'], len(i['takes'])) for i in chapter]}"
    assert any(len(i["takes"]) >= 2 for i in chapter), "the earlier pass did not become a take of the overlapping item"
    assert arms(env)["Chapter 1"] is False, "the arm was not restored"
    env.refused("roll", fx["ch1"], "1", tag="RECORD_NOT_OURS")
    return f"{takes} takes across {len(chapter)} item(s) after the roll; the earlier pass is a take of the item it overlaps"


@scenario(
    "punch_preroll",
    "punch_preroll, record_start, record_stop",
    "punch pre-roll: reads REAPER's pre-roll and never changes it; with pre-roll on record REAPER plays in from the bar line before and records from the cursor",
    needs_audio=True,
)
def punch_preroll(env: Env) -> str:
    fx = book(env)
    get = "local _, a = reaper.get_config_var_string('preroll') local _, b = reaper.get_config_var_string('prerollmeas') return {a, b}"
    before = env.lua(get)
    try:
        read = env.ok("punch_preroll", until="PUNCH_PREROLL")
        assert read[2:5] == ["0", "2.000000", "2.000000"], f"a fresh REAPER read {read[2:]}"
        env.ok("punch_preroll", "1", "1", until="PUNCH_PREROLL")  # anything after the run is ignored: the command sets nothing
        assert env.lua(get) == before, "punch_preroll changed a REAPER preference"
        # The narrator turns pre-roll on record on and sets 1.5 measures in REAPER (here through the scratch configuration).
        env.lua("reaper.set_config_var_string('preroll', '2', 0) reaper.set_config_var_string('prerollmeas', '1.5', 0) return true")
        assert env.lua("return reaper.GetToggleCommandState(41819)") == 1, "action 41819 does not show pre-roll on record"
        on = env.ok("punch_preroll", until="PUNCH_PREROLL")
        assert on[2:5] == ["1", "1.500000", "2.000000"], f"after the change in REAPER {on[2:]}"
        env.lua("reaper.SetEditCurPos(10, false, false) return true")
        env.ok("arm_only", fx["ch1"], until="ARMED")
        env.ok("record_start", fx["ch1"], until="RECORD_STARTED", timeout=10)
        heard = env.lua("return reaper.GetPlayPosition()")
        near(heard, 6.0, 0.1, "where REAPER plays in from: the bar line at or before 10 s minus 1.5 measures (7 s) is 6 s")
        env.wait_for(lambda: env.lua("return reaper.GetPlayPosition()") > 11.0, timeout=10, what="the recording to pass the cursor")
        env.ok("record_stop", until="RECORD_STOPPED")
        env.wait_for(lambda: play_state(env) == 0, what="REAPER to stop")
        starts = sorted(round(i["position"], 2) for i in items_on(env.snapshot(), "Chapter 1"))
        assert starts == [0.0, 10.0], f"the take did not start at the cursor: items start at {starts}"
        return f"read 0/2 measures and changed nothing; after REAPER was set to 1.5 measures on record it read 1/1.5; the take played in from {heard:.2f} s (the bar line) and was recorded from 10.00 s"
    finally:
        env.lua("reaper.set_config_var_string('preroll', args[1], 0) reaper.set_config_var_string('prerollmeas', args[2], 0) return true", *before)


@scenario(
    "undo_last",
    "roll, record_stop, undo_last",
    "undo last: a take with a roll leaves a point per stop, and one undo_last of them takes both passes away",
    needs_audio=True,
)
def undo_rolled_take(env: Env) -> str:
    fx = book(env)
    env.lua("reaper.SetEditCurPos(10, false, false) return true")
    env.ok("arm_only", fx["ch1"], until="ARMED")
    env.ok("record_start", fx["ch1"], until="RECORD_STARTED")
    env.wait_for(lambda: env.lua("return reaper.GetPlayPosition()") > 12.0, timeout=8, what="two seconds of recording")
    env.ok("roll", fx["ch1"], "11", until="ROLLED", timeout=20)
    env.wait_for(lambda: play_state(env) & 4 == 4, what="REAPER to record again")
    time.sleep(1.0)
    stopped = env.ok("record_stop", until="RECORD_STOPPED")
    env.wait_for(lambda: play_state(env) == 0, what="REAPER to stop")
    points = int(stopped[4])
    assert points == 2, f"record_stop reported {points} undo points (one per stop: the roll's and this one)"
    assert env.ok("last_action", "record_take", until="LAST_ACTION")[3] == "this", "the rolled take is not REAPER's last action"
    undone = env.ok("undo_last", "record_take", str(points), until="UNDONE_LAST")
    assert undone[4] == "2", f"undo_last answered {undone[3:]}"
    left = [(round(i["position"], 3), round(i["length"], 3), len(i["takes"])) for i in items_on(env.snapshot(), "Chapter 1")]
    assert left == [(0.0, 5.0, 1)], f"after the undo {left}"
    return "a take with one roll left 2 points; one undo_last of 2 removed both passes and left the earlier read as it was"


@scenario("punch", "roll", "roll: refused when the app is not recording, on a stale track, for a bad time or past the end of the recording", needs_audio=True)
def roll_refusals(env: Env) -> str:
    fx = book(env)
    env.refused("roll", fx["ch1"], "1", tag="RECORD_NOT_OURS")
    env.ok("arm_only", fx["ch1"], until="ARMED")
    env.ok("record_start", fx["ch1"], until="RECORD_STARTED")
    try:
        env.refused("roll", GUID_NONE, "1", tag="TRACK_STALE")
        env.refused("roll", fx["ch1"], "abc")
        env.refused("roll", fx["ch1"], "-3")
        past = env.refused("roll", fx["ch1"], "500")
        assert "past the end" in past[2], past[2]
        env.refused("roll", fx["ch2"], "1", tag="RECORD_NOT_OURS")
        assert play_state(env) & 4 == 4, "a refused roll stopped the recording"
    finally:
        env.ok("record_stop", until="RECORD_STOPPED")
    return "5 refusals; the recording ran on"


# -- monitor level -----------------------------------------------------------------------------------------------------------


@scenario(
    "monitor_level",
    "monitor_level",
    "monitor level: reads and sets the volume of the master's first hardware output send on the app's 0-100 scale, no undo point",
)
def monitor_level(env: Env) -> str:
    book(env)

    def gain() -> float:
        return env.lua("return reaper.GetTrackSendInfo_Value(reaper.GetMasterTrack(0), 1, 0, 'D_VOL')")

    outputs = env.lua("return reaper.GetTrackNumSends(reaper.GetMasterTrack(0), 1)")
    assert outputs >= 1, f"a fresh project's master has {outputs} hardware outputs"
    fresh = env.ok("monitor_level", "", until="MONITOR_LEVEL")
    near(gain(), 1.0, 1e-9, "a fresh master's hardware output gain")
    assert fresh[2] == "70", f"unity reads {fresh[2]}, not 70"
    # With no hardware output on the master there is nothing to read or set.
    env.lua("local master = reaper.GetMasterTrack(0) while reaper.GetTrackNumSends(master, 1) > 0 do reaper.RemoveTrackSend(master, 1, 0) end return true")
    none = env.refused("monitor_level", "")
    assert "hardware output" in none[2].lower(), none[2]
    env.refused("monitor_level", "50")
    env.lua("local index = reaper.CreateTrackSend(reaper.GetMasterTrack(0), nil) assert(index >= 0, 'no hardware output send') return index")
    assert env.lua("return reaper.GetTrackNumSends(reaper.GetMasterTrack(0), 1)") == 1, "CreateTrackSend(master, nil) did not add one hardware output"
    undo, changes = env.snapshot()["undo"], env.snapshot()["change_count"]
    assert env.ok("monitor_level", "", until="MONITOR_LEVEL")[2] == "70"
    for level, expected in ((70, 1.0), (100, 10 ** (6 / 20)), (35, 10 ** (-30 / 20)), (0, 0.0), (85, 10 ** (3 / 20))):
        done = env.ok("monitor_level", str(level), until="MONITOR_LEVEL")
        assert int(done[2]) == level, f"set {level} answered {done[2]}"
        near(gain(), expected, 1e-4, f"send gain at level {level}")
        assert int(env.ok("monitor_level", "", until="MONITOR_LEVEL")[2]) == level, f"read back after {level}"
    assert env.lua("return reaper.GetTrackSendInfo_Value(reaper.GetMasterTrack(0), 1, 0, 'B_MUTE')") == 0, "a set muted the hardware output"
    near(env.lua("return reaper.GetMediaTrackInfo_Value(reaper.GetMasterTrack(0), 'D_VOL')"), 1.0, 1e-9, "the master fader")
    state = env.snapshot()
    assert state["undo"] == undo, f"monitor_level opened an undo point: {state['undo']!r}"
    note = "unchanged" if state["change_count"] == changes else f"{changes} -> {state['change_count']}"
    for bad in ("101", "-1", "7.5", "loud"):
        env.refused("monitor_level", bad)
    assert int(env.ok("monitor_level", "", until="MONITOR_LEVEL")[2]) == 85, "a refused level changed the send"
    return f"a fresh master has {outputs} hardware output reading 70 (unity); 100 = +6 dB, 35 = -30 dB, 0 = silence, 85 = +3 dB; the fader and mute untouched; no undo point (change count {note}); no output and 4 bad levels refused"


def meters_when(env: Env, holds, *, timeout: float, what: str) -> list[str]:
    """Reads daw_meters until its METERS fields satisfy `holds`; answers them."""

    def read():
        meters = env.ok("daw_meters", until="METERS")
        return meters if holds(meters) else None

    return env.wait_for(read, timeout=timeout, what=what)


def jack_patch(connect: bool) -> None:
    """Patches REAPER's first JACK output into its first input (or takes the patch away): the dummy device's only way to give an armed track a signal."""
    tool = shutil.which("jack_connect" if connect else "jack_disconnect")
    assert tool, "jack_connect is not installed (jackd2 brings it)"
    subprocess.run([tool, "REAPER:out1", "REAPER:in1"], check=connect, capture_output=True, timeout=10)


@scenario(
    "daw_meters",
    "daw_meters",
    "meters: the master's level while REAPER plays and the first armed track's input with its name; silence as -100; arms, sets and undoes nothing",
    needs_audio=True,
)
def daw_meters(env: Env) -> str:
    book(env)
    # Chapter 2 is the track the narrator would record on: input 1, record monitoring off, so its input never reaches the master.
    env.lua(
        "local t = ci.track_by_name('Chapter 2') reaper.SetMediaTrackInfo_Value(t, 'I_RECINPUT', 0) reaper.SetMediaTrackInfo_Value(t, 'I_RECMON', 0) return true"
    )
    still = env.ok("daw_meters", until="METERS")
    assert still[2:5] == ["-100.0", "", ""], f"stopped with nothing armed REAPER read {still[2:]}"
    arm_by_hand(env, "Chapter 2")
    before = env.snapshot()
    quiet = meters_when(env, lambda m: m[4] == "Chapter 2", timeout=5, what="the armed track to be named")
    assert float(quiet[3]) < -60, f"an armed track with no signal read {quiet[3]} dB"
    # Chapter 1's earlier read (tone_a, amplitude 0.3: -10.5 dBFS) plays; REAPER's output is patched into its input, so the armed track hears it too.
    jack_patch(True)
    try:
        env.lua("reaper.SetEditCurPos(0, false, false) reaper.OnPlayButton() return true")
        env.wait_for(lambda: play_state(env) & 1 == 1, what="REAPER to play")
        heard = meters_when(env, lambda m: float(m[2]) > -30 and m[3] != "" and float(m[3]) > -30, timeout=4, what="both meters to read the tone")
        stop_by_hand(env)
        env.wait_for(lambda: play_state(env) == 0, what="REAPER to stop")
    finally:
        jack_patch(False)
    assert heard[4] == "Chapter 2", f"the input was named {heard[4]!r}"
    near(float(heard[2]), -10.5, 6.0, "the master's level while the -10.5 dBFS tone plays (pan law aside)")
    fallen = meters_when(env, lambda m: float(m[2]) < -60, timeout=3, what="the output meter to fall after the stop")
    after = env.snapshot()
    assert arms(env) == {"Chapter 1": False, "Chapter 2": True, "Pickups": False}, f"the arms changed: {arms(env)}"
    assert after["undo"] == before["undo"], f"daw_meters opened an undo point: {after['undo']!r}"
    return (
        f"stopped and unarmed: -100.0 and no input; armed with no signal: {quiet[3]} dB on Chapter 2; playing: output {heard[2]} dB, "
        f"input {heard[3]} dB on Chapter 2; {fallen[2]} dB after the stop; arms and undo unchanged"
    )


# -- where Stop leaves the edit cursor -------------------------------------------------------------------------------------------


def cursor(env: Env) -> float:
    return env.lua("return reaper.GetCursorPosition()")


def recorded_from(env: Env, start: float) -> dict:
    """Chapter 1's item that REAPER made from a recording begun at `start`, once its take has its file."""

    def ready():
        items = [i for i in items_on(env.snapshot(), "Chapter 1") if abs(i["position"] - start) < 1e-3 and all(t["file"] for t in i["takes"])]
        return items[-1] if items else None

    return env.wait_for(ready, what=f"the item recorded from {start} s")


@scenario(
    "record",
    "record_stop",
    "record: Stop leaves the edit cursor at the end of what was just recorded, not where recording began (REAPER's own Stop leaves it at the start)",
    needs_audio=True,
)
def record_stop_keeps_cursor(env: Env) -> str:
    fx = book(env)
    # REAPER on its own, for the record: a recording the app did not start, stopped in REAPER.
    arm_by_hand(env, "Chapter 2")
    env.lua("reaper.SetEditCurPos(20, false, false) reaper.CSurf_OnRecord() return true")
    env.wait_for(lambda: env.lua("return reaper.GetPlayPosition()") > 20.8, timeout=8, what="REAPER's own recording to run")
    stop_by_hand(env)
    env.wait_for(lambda: play_state(env) == 0, what="REAPER to stop")
    reaper_own = cursor(env)
    env.lua("reaper.SetMediaTrackInfo_Value(ci.track_by_name('Chapter 2'), 'I_RECARM', 0) return true")
    # The app's take.
    env.lua("reaper.SetEditCurPos(6, false, false) return true")
    env.ok("arm_only", fx["ch1"], until="ARMED")
    env.ok("record_start", fx["ch1"], until="RECORD_STARTED")
    env.wait_for(lambda: env.lua("return reaper.GetPlayPosition()") > 7.2, timeout=8, what="the recording to run for over a second")
    stopped = env.ok("record_stop", until="RECORD_STOPPED")
    assert stopped[4] == "1", f"record_stop reported undo points {stopped[4:]} (REAPER's one Recorded media point; the cursor adds none)"
    env.wait_for(lambda: play_state(env) == 0, what="REAPER to stop")
    item = recorded_from(env, 6.0)
    end = item["position"] + item["length"]
    near(cursor(env), end, 1e-3, "the edit cursor after record_stop")
    assert end > 7.0, f"the recorded item ends at {end}"
    assert env.lua("return reaper.Undo_CanUndo2(0)") == "Recorded media", "the top undo point is not the take"
    return f"REAPER's own Stop left the cursor at {reaper_own:.3f} s (recording began at 20 s); after record_stop it is at {end:.3f} s, the end of the take begun at 6 s"


@scenario(
    "record",
    "record_stop, record_start, punch_to",
    "record: the cycle record, stop, record, stop, punch, record, stop; each take starts where the last stopped unless the narrator punched",
    needs_audio=True,
)
def record_stop_cycle(env: Env) -> str:
    fx = book(env)
    env.ok("arm_only", fx["ch1"], until="ARMED")
    ends = []
    for run in range(2):
        rule = ("end",) if run == 0 else ()
        started = env.ok("record_start", fx["ch1"], *rule, until="RECORD_STARTED")
        begin = float(started[3])
        if run == 1:
            near(begin, ends[0], 1e-3, "take B begins where take A stopped")
        env.wait_for(lambda b=begin: env.lua("return reaper.GetPlayPosition()") > b + 1.0, timeout=8, what="the take to run")
        env.ok("record_stop", until="RECORD_STOPPED")
        env.wait_for(lambda: play_state(env) == 0, what="REAPER to stop")
        item = recorded_from(env, begin)
        ends.append(item["position"] + item["length"])
        near(cursor(env), ends[-1], 1e-3, f"the cursor after take {run + 1}")
        env.ok("arm_only", fx["ch1"], until="ARMED")
    env.ok("punch_to", "3", "0", until="PUNCHED")
    started = env.ok("record_start", fx["ch1"], until="RECORD_STARTED")
    near(float(started[3]), 3.0, 1e-6, "the punch begins where the narrator chose")
    env.wait_for(lambda: env.lua("return reaper.GetPlayPosition()") > 3.8, timeout=8, what="the punch to run")
    env.ok("record_stop", until="RECORD_STOPPED")
    env.wait_for(lambda: play_state(env) == 0, what="REAPER to stop")
    item = recorded_from(env, 3.0)
    punch_end = item["position"] + item["length"]
    near(cursor(env), punch_end, 1e-3, "the cursor after the punch")
    return f"take A 5.000-{ends[0]:.3f} s, take B {ends[0]:.3f}-{ends[1]:.3f} s, punch 3.000-{punch_end:.3f} s; the cursor ended each at its end"


@scenario(
    "record",
    "record_stop",
    "record: a take stopped in REAPER (RECORD_ENDED) also leaves the edit cursor at its end",
    needs_audio=True,
)
def record_stopped_in_reaper_keeps_cursor(env: Env) -> str:
    fx = book(env)
    env.lua("reaper.SetEditCurPos(8, false, false) return true")
    env.ok("arm_only", fx["ch1"], until="ARMED")
    run = env.start("record_start", fx["ch1"])
    env.wait_event(run, "RECORD_STARTED")
    env.wait_for(lambda: env.lua("return reaper.GetPlayPosition()") > 9.0, timeout=8, what="the take to run")
    stop_by_hand(env)
    env.wait_event(run, "RECORD_ENDED")
    item = recorded_from(env, 8.0)
    end = item["position"] + item["length"]
    near(cursor(env), end, 1e-3, "the edit cursor after a Stop in REAPER")
    return f"stopped in REAPER; the cursor is at {end:.3f} s, the end of the take begun at 8 s"


@scenario("punch", "roll, record_stop", "roll: a take stopped after a roll leaves the edit cursor at the end of the rolled pass", needs_audio=True)
def roll_stop_keeps_cursor(env: Env) -> str:
    fx = book(env)
    env.lua("reaper.SetEditCurPos(10, false, false) return true")
    env.ok("arm_only", fx["ch1"], until="ARMED")
    env.ok("record_start", fx["ch1"], until="RECORD_STARTED")
    env.wait_for(lambda: env.lua("return reaper.GetPlayPosition()") > 12.0, timeout=8, what="the take to run")
    env.ok("roll", fx["ch1"], "11", until="ROLLED", timeout=20)
    env.wait_for(lambda: play_state(env) & 4 == 4, what="REAPER to record again")
    env.wait_for(lambda: env.lua("return reaper.GetPlayPosition()") > 12.0, timeout=8, what="the rolled pass to run")
    env.ok("record_stop", until="RECORD_STOPPED")
    env.wait_for(lambda: play_state(env) == 0, what="REAPER to stop")
    item = recorded_from(env, 11.0)
    end = item["position"] + item["length"]
    near(cursor(env), end, 1e-3, "the edit cursor after a roll and Stop")
    return f"rolled at 11 s; the cursor is at {end:.3f} s, the end of the rolled pass, not back at 11 s"


@scenario(
    "record",
    "record_start, record_stop, punch_to",
    "record: after a pickup over earlier audio, the next plain take (end rule) starts where the pickup stopped, not after the later audio",
    needs_audio=True,
)
def record_end_rule_after_stop(env: Env) -> str:
    fx = book(env)
    env.ok("arm_only", fx["ch1"], until="ARMED")
    env.ok("punch_to", "1", "0", until="PUNCHED")
    env.ok("record_start", fx["ch1"], until="RECORD_STARTED")
    env.wait_for(lambda: env.lua("return reaper.GetPlayPosition()") > 2.0, timeout=8, what="the pickup to run")
    env.ok("record_stop", until="RECORD_STOPPED")
    env.wait_for(lambda: play_state(env) == 0, what="REAPER to stop")
    item = recorded_from(env, 1.0)
    stop = item["position"] + item["length"]
    assert stop < 5.0, f"the pickup ran past the earlier read ({stop} s)"
    near(cursor(env), stop, 1e-3, "the cursor after the pickup")
    env.ok("arm_only", fx["ch1"], until="ARMED")
    started = env.ok("record_start", fx["ch1"], "end", until="RECORD_STARTED")
    near(float(started[3]), stop, 1e-3, "the next take starts where the pickup stopped")
    env.wait_for(lambda: env.lua("return reaper.GetPlayPosition()") > stop + 0.5, timeout=8, what="the take to run")
    env.ok("record_stop", until="RECORD_STOPPED")
    env.wait_for(lambda: play_state(env) == 0, what="REAPER to stop")
    # A cursor the narrator moved is not where a take stopped: the end rule goes after the track's last item again.
    env.lua("reaper.SetEditCurPos(0.5, false, false) return true")
    env.ok("arm_only", fx["ch1"], until="ARMED")
    moved = env.ok("record_start", fx["ch1"], "end", until="RECORD_STARTED")
    env.ok("record_stop", until="RECORD_STOPPED")
    env.wait_for(lambda: play_state(env) == 0, what="REAPER to stop")
    assert float(moved[3]) >= 5.0 - 1e-3, f"a moved cursor started at {moved[3]}, not after the last item"
    return f"pickup 1.000-{stop:.3f} s over the 0-5 s read; the next plain take began at {float(started[3]):.3f} s; with the cursor moved it began at {float(moved[3]):.3f} s"
