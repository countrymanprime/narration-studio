"""Real-REAPER scenarios, group 5: what the app meets when REAPER is slow, switched to another project, undone, unsaved or holds stale ids.

Each scenario makes the trouble happen in a real REAPER and asserts that the bridge answers with a refusal the app can show (a stale
GUID, an unsaved path) and changes nothing it should not, or that a command the host gave up on never runs late.
Rows: docs/operations/reaper-verification-pass.md, "Real-REAPER CI run (Linux)".
"""

from __future__ import annotations

import time

from scenario import Env, items_on, scenario
from scenarios_session import GUID_NONE, two_chapters, undo_once

HEARTBEAT_TIMEOUT = 5.0  # apps/desktop/internal/daw/reachability.go: the host calls REAPER unreachable after this long without a heartbeat


def heartbeat_arrivals(env: Env, seconds: float) -> list[float]:
    """Arrival times (seconds from now) of every PROJECT_STATUS in the next `seconds`."""
    start, out = time.monotonic(), []
    seen = len([e for e in env.session.seen if e[0] == "PROJECT_STATUS"])
    while time.monotonic() - start < seconds:
        env.session.events()
        beats = [e for e in env.session.seen if e[0] == "PROJECT_STATUS"]
        out.extend([time.monotonic() - start] * (len(beats) - seen))
        seen = len(beats)
        time.sleep(0.05)
    return out


STALL = """
local first = reaper.time_precise()
while reaper.time_precise() - first < tonumber(args[1]) do end
return true
"""


@scenario(
    "heartbeat",
    "PROJECT_STATUS, any command",
    "stalled REAPER: the heartbeat goes quiet past the host's timeout, resumes, and a command written meanwhile runs once when REAPER is back",
)
def stalled_reaper(env: Env) -> str:
    fx = two_chapters(env)
    stall_run = env.lua_async(STALL, "7")
    time.sleep(0.3)
    arm = env.start("arm_only", fx["ch2"])
    arrivals = heartbeat_arrivals(env, 12.0)
    assert env.wait_event(stall_run, "CI_RESULT"), "the stall never ended"
    gap = max(b - a for a, b in zip([0.0, *arrivals], arrivals, strict=False)) if arrivals else 12.0
    assert gap > HEARTBEAT_TIMEOUT, f"the longest heartbeat gap was {gap:.1f} s, so the host would not have called REAPER unreachable"
    assert arrivals and arrivals[-1] > 8.0, "the heartbeat did not resume after the stall"
    armed = [e for e in env.events_for(arm) if e[0] == "ARMED"]
    assert len(armed) == 1, f"the queued arm_only answered {len(armed)} times"
    assert {t["name"]: t["armed"] for t in env.snapshot()["tracks"]}["Chapter 2"], "the queued command did not run when REAPER came back"
    return f"heartbeat gap {gap:.1f} s (host timeout {HEARTBEAT_TIMEOUT:.0f} s), resumed; the command written during the stall ran once afterwards"


@scenario("heartbeat", "Client.Retract", "stalled REAPER: a command file the host took back never runs when REAPER returns")
def retracted_command(env: Env) -> str:
    fx = two_chapters(env)
    stall_run = env.lua_async(STALL, "4")
    time.sleep(0.3)
    run = env.start("arm_only", fx["ch2"])
    command = sorted((env.session.dir / "commands").glob("*.cmd"))
    assert command, "the command file was not written"
    for path in command:  # what bridge.Client.Retract does after a timeout
        path.unlink()
    env.wait_event(stall_run, "CI_RESULT", timeout=15)
    time.sleep(1.0)
    assert not [e for e in env.events_for(run) if e[0] == "ARMED"], "a retracted command ran"
    assert not {t["name"]: t["armed"] for t in env.snapshot()["tracks"]}["Chapter 2"], "a retracted command armed the track"
    return "no ARMED, track not armed: the retracted file was never read"


@scenario(
    "heartbeat",
    "project switch",
    "project switched in REAPER: the heartbeat names the new project, every old GUID is stale and nothing in the new project changes",
)
def project_switched(env: Env) -> str:
    fx = two_chapters(env)
    other = env.out / "Other.rpp"
    env.lua(  # File > Open of another book: it replaces the project in the tab, with no prompt
        """
        while reaper.CountTracks(0) > 0 do
          reaper.DeleteTrack(reaper.GetTrack(0, 0))
        end
        local fresh = ci.add_track('Other book')
        ci.add_item(fresh, args[2], 0, 4)
        reaper.Main_SaveProjectEx(0, args[1], 0) -- a copy: it does not change the project's own path
        reaper.Main_openProject('noprompt:' .. args[1])
        return true
        """,
        str(other),
        env.media_path("tone_c"),
    )
    status = env.ok("project_state", until="PROJECT_STATE")
    assert status[3].replace("\\", "/").lower() == str(other).replace("\\", "/").lower(), f"the project REAPER reports {status[3]}"
    before = env.witness()
    env.refused("chapter_track_state", fx["ch1"], tag="TRACK_STALE")
    env.refused("select_track", fx["ch2"], tag="TRACK_STALE")
    env.refused("go_to", fx["ch1"], "end", "", tag="TRACK_STALE")
    env.refused("apply_fx_chain", fx["ch1"], "Missing.RfxChain")
    gain = env.send("apply_item_gain", env.payload("g.txt", [f"{fx['first']}|-6|f1"]), until="GAIN_APPLIED")
    assert any(e[0] == "GAIN_STALE" for e in gain) and gain[-1][2] == "0", f"gain answered {gain}"
    env.refused("hide_takes", fx["first"], GUID_NONE, tag="ITEM_STALE")
    env.refused("delete_range", fx["first"], "1", "2", "gap", "0", tag="ITEM_STALE")
    assert env.witness() == before, "a stale command changed the project that was switched to"
    assert [i["track"] for i in env.snapshot()["items"]] == ["Other book"], "the switched-to project is not what the bridge reads"
    env.lua("reaper.Main_openProject('noprompt:' .. ci.rpp) return true")  # back to the first book
    assert env.ok("project_state", until="PROJECT_STATE")[3].lower().endswith("cibook.rpp"), "the first project is not current again"
    return "heartbeat/project_state name Other.rpp; 7 old-GUID commands refused (TRACK_STALE, GAIN_STALE, ITEM_STALE); the new project untouched"


@scenario(
    "line_identity",
    "stamp_item_lines, read_line_ids",
    "line ids: stamped, read back after save and reload, follow a move; a deleted item is stale, a conflict is left alone, overwrite and Undo",
)
def line_ids(env: Env) -> str:
    fx = two_chapters(env)
    rows = [
        f"{fx['first']}|line-000001|Alice was beginning",
        f"{fx['second']}|line-000002|to get very tired",
        f"{fx['third']}|line-000003|of sitting | by her sister",
    ]
    stamped = env.ok("stamp_item_lines", env.payload("lines.txt", rows), "0", until="LINES_STAMPED")
    assert stamped[2:6] == ["3", "0", "0", "0"], f"applied/unchanged/stale/conflicts {stamped[2:6]}"
    again = env.ok("stamp_item_lines", env.payload("lines.txt", rows), "0", until="LINES_STAMPED")
    assert again[2:6] == ["0", "3", "0", "0"], f"second stamp {again[2:6]}"
    env.lua("ci.save_and_reload(ci.rpp) return true")
    report = env.out / "read.txt"
    report.unlink(missing_ok=True)
    env.ok("read_line_ids", str(report), until="LINES_READ")
    read = sorted(report.read_text(encoding="utf-8").splitlines(), key=lambda row: row.split("|")[1])
    assert [r.split("|")[1] for r in read] == ["line-000001", "line-000002", "line-000003"], f"read back {read}"
    assert read[2].endswith("of sitting | by her sister"), "a pipe in the text was lost"
    env.lua(
        """
        reaper.Undo_BeginBlock2(0)
        reaper.SetMediaItemInfo_Value(ci.item(args[1]), 'D_POSITION', 50)
        reaper.Undo_EndBlock2(0, 'narrator moved a line', -1)
        reaper.Undo_BeginBlock2(0)
        reaper.DeleteTrackMediaItem(reaper.GetMediaItemTrack(ci.item(args[2])), ci.item(args[2]))
        reaper.Undo_EndBlock2(0, 'narrator deleted a line', -1)
        return true
        """,
        fx["first"],
        fx["second"],
    )
    env.ok("read_line_ids", str(report), until="LINES_READ")
    now = {r.split("|")[1]: float(r.split("|")[2]) for r in report.read_text(encoding="utf-8").splitlines()}
    assert now == {"line-000001": 50.0, "line-000003": 24.0}, f"after a move and a delete {now}"
    stale = env.send("stamp_item_lines", env.payload("stale.txt", [f"{fx['second']}|line-000002|to get very tired"]), "0", until="LINES_STAMPED")
    assert any(e[0] == "LINES_STALE" for e in stale) and stale[-1][2:6] == ["0", "0", "1", "0"], f"deleted item answered {stale}"
    conflict = env.send("stamp_item_lines", env.payload("c.txt", [f"{fx['third']}|line-999999|other"]), "0", until="LINES_STAMPED")
    assert any(e[0] == "LINES_CONFLICT" for e in conflict) and conflict[-1][2:6] == ["0", "0", "0", "1"], f"conflict answered {conflict}"
    over = env.ok("stamp_item_lines", env.payload("o.txt", [f"{fx['third']}|line-999999|other"]), "1", until="LINES_STAMPED")
    assert over[2] == "1"
    assert undo_once(env) == "Narration Utils: stamp manuscript line IDs"
    env.ok("read_line_ids", str(report), until="LINES_READ")
    assert "line-000003" in report.read_text(encoding="utf-8"), "one Undo did not restore the earlier id"
    return "ids survive save/reload and a move; a deleted item is LINES_STALE and no neighbour is stamped; a conflict is kept unless overwrite; one Undo restores the id"


@scenario(
    "undo_last", "undo, redo, GUIDs", "undo and redo: item GUIDs survive both, so the next command still finds its item and undo_last still names the cut"
)
def undo_redo(env: Env) -> str:
    fx = two_chapters(env)
    env.ok("delete_range", fx["first"], "4", "6", "close", "10", until="RANGE_CUT")
    assert undo_once(env) == "Narration Utils: delete words"
    assert env.lua("return reaper.Undo_DoRedo2(0)") == 1, "REAPER would not redo"
    assert env.ok("last_action", "cut_range", until="LAST_ACTION")[3] == "this", "after Redo the cut is not on top"
    undone = env.ok("undo_last", "cut_range", "1", until="UNDONE_LAST")
    assert undone[4] == "1"
    again = env.ok("delete_range", fx["first"], "4", "6", "gap", "0", until="RANGE_CUT")
    assert again[2] == fx["first"], "the item's GUID changed across undo and redo"
    assert [(i["position"], i["length"]) for i in items_on(env.snapshot(), "Chapter 1")][:2] == [(0.0, 4.0), (6.0, 4.0)]
    return "undo, redo, undo_last, then a new cut on the same GUID all resolved"


@scenario(
    "record",
    "record_start, unsaved project",
    "unsaved project: recording into a project that was never saved is not held up by a prompt and leaves an item",
    needs_audio=True,
)
def record_unsaved(env: Env) -> str:
    env.lua("reaper.Main_OnCommand(40023, 0) return true")  # File: New project, never saved (the scratch project was saved, so no prompt)
    try:
        guid = env.lua("local t = ci.add_track('Take one') reaper.SetMediaTrackInfo_Value(t, 'I_RECARM', 1) return reaper.GetTrackGUID(t)")
        state = next(e for e in env.send("chapter_track_state", guid, until={"TRACK_STATE_END"}) if e[0] == "TRACK_STATE")
        assert state[6] == "" and state[7] == "1", f"unsaved project reported {state[6]!r}, unsaved {state[7]}"
        started = env.ok("record_start", guid, until="RECORD_STARTED", timeout=20)
        assert started[2] == guid
        time.sleep(1.0)
        env.ok("record_stop", until="RECORD_STOPPED")
        env.wait_for(lambda: env.lua("return reaper.GetPlayState()") == 0, what="REAPER to stop")
        items = env.wait_for(lambda: env.lua("return reaper.CountMediaItems(0)") >= 1, what="the recording to become an item")
        assert items
        assert env.ok("project_state", until="PROJECT_STATE")[3] == "", "the recording gave the project a path"
    finally:
        env.lua("reaper.OnStopButton() reaper.Main_openProject('noprompt:' .. ci.rpp) return true")  # back to the scratch project, discarding the unsaved one
    return "an unsaved project records and reports no path; no modal prompt held the bridge"
