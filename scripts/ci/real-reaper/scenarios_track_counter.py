"""Real-REAPER scenarios: which edits raise `GetProjectStateChangeCount`, for the host's cache of the live track list (#3647).

The host reuses `tracks_read`'s answer while the heartbeat's change count equals the count that answer carried (`tracks_cache.go`), so every edit
that changes the track list (a track added, renamed, deleted, moved, a folder opened or closed, an add undone) must raise the count; an edit that
leaves the list as it was may or may not. These rows measure each kind in a real REAPER and fail on a list-changing edit that leaves the count
alone. Numbers go to <out>/track_counter/rows.json for docs/research/reaper-bridge-performance.md.
"""

from __future__ import annotations

import json
import re
import time

from scenario import Env, scenario

LIB = """
local function count()
  return reaper.GetProjectStateChangeCount(0)
end
local function names()
  local out = {}
  for i = 0, reaper.CountTracks(0) - 1 do
    local _, name = reaper.GetSetMediaTrackInfo_String(reaper.GetTrack(0, i), 'P_NAME', '', false)
    out[#out + 1] = name
  end
  return out
end
"""

# Each row edits the project once, as one undo block like the narrator's own edits, and answers the count before and after. `lists` is whether the
# edit changes what `tracks_read` lists.
ROWS = [
    ("add a track", True, "local t = ci.add_track('Added') return {}"),
    ("rename a track", True, "reaper.GetSetMediaTrackInfo_String(ci.track_by_name('Voice A'), 'P_NAME', 'Voice A renamed', true) return {}"),
    ("delete a track", True, "reaper.DeleteTrack(ci.track_by_name('Voice B')) return {}"),
    (
        "move a track up",
        True,
        "local t = ci.track_by_name('Voice B') reaper.SetOnlyTrackSelected(t) reaper.ReorderSelectedTracks(0, 0) return {}",
    ),
    ("open a folder", True, "reaper.SetMediaTrackInfo_Value(ci.track_by_name('Voice A'), 'I_FOLDERDEPTH', 1) return {}"),
    ("close a folder", True, "reaper.SetMediaTrackInfo_Value(ci.track_by_name('Voice B'), 'I_FOLDERDEPTH', -1) return {}"),
    ("select a track (I_SELECTED)", False, "reaper.SetMediaTrackInfo_Value(ci.track_by_name('Voice A'), 'I_SELECTED', 1) return {}"),
    ("arm a track (I_RECARM)", False, "reaper.SetMediaTrackInfo_Value(ci.track_by_name('Voice A'), 'I_RECARM', 1) return {}"),
    ("mute a track (B_MUTE)", False, "reaper.SetMediaTrackInfo_Value(ci.track_by_name('Voice A'), 'B_MUTE', 1) return {}"),
]

ARRANGE = (
    LIB
    + """
ci.add_track('Chapter 1')
ci.add_track('Voice A')
ci.add_track('Voice B')
ci.save_and_reload(ci.rpp)
return true
"""
)


def write(env: Env, name: str, value: object) -> None:
    folder = env.out / "track_counter"
    folder.mkdir(exist_ok=True)
    (folder / f"{name}.json").write_text(json.dumps(value, indent=2, sort_keys=True), encoding="utf-8")


@scenario(
    "tracks_read",
    "tracks_read",
    "track counter: every edit that changes the track list (add, rename, delete, move, open or close a folder, undo of an add, the bridge's own "
    "track_create) raises GetProjectStateChangeCount; select, arm and mute are measured and recorded",
)
def list_edits_raise_the_count(env: Env) -> str:
    rows = []
    failed = []
    for name, lists, body in ROWS:
        env.lua(ARRANGE)
        # Each edit is one undo block, as every edit the narrator makes in REAPER's own windows is (a bare API call makes no undo point, and the
        # first run of this row, 2026-11-17, showed such a call leaves the count alone).
        edit = body.replace("return {}", "")
        got = env.lua(
            LIB
            + f"local before = count() reaper.Undo_BeginBlock2(0) {edit} reaper.Undo_EndBlock2(0, 'counter row', -1) "
            + "return { before = before, after = count(), tracks = names() }"
        )
        raised = got["after"] > got["before"]
        rows.append({"edit": name, "changes_the_list": lists, "before": got["before"], "after": got["after"], "raised": raised})
        if lists and not raised:
            failed.append(name)
    # An add made as one undo block, then undone: the list changes back, and the count must rise again.
    env.lua(ARRANGE)
    undone = env.lua(
        LIB
        + """
        reaper.Undo_BeginBlock2(0)
        ci.add_track('Undone')
        reaper.Undo_EndBlock2(0, 'Add Undone', -1)
        local before = count()
        reaper.Undo_DoUndo2(0)
        return { before = before, after = count(), tracks = names() }
        """
    )
    raised = undone["after"] > undone["before"]
    rows.append({"edit": "undo an add", "changes_the_list": True, "before": undone["before"], "after": undone["after"], "raised": raised})
    if not raised:
        failed.append("undo an add")
    # The bridge's own create, as BoothVoiceAdd sends it: the count the next heartbeat carries must differ from the one the cache holds.
    env.lua(ARRANGE)
    folder = env.lua(
        "local f = ci.track_by_name('Chapter 1') reaper.SetMediaTrackInfo_Value(f, 'I_FOLDERDEPTH', 1) reaper.SetMediaTrackInfo_Value(ci.track_by_name('Voice B'), 'I_FOLDERDEPTH', -1) return reaper.GetTrackGUID(f)"
    )
    before = env.lua("return reaper.GetProjectStateChangeCount(0)")
    env.ok("track_create", "Veyra", folder, until="TRACK_CREATED")
    after = env.lua("return reaper.GetProjectStateChangeCount(0)")
    rows.append({"edit": "the bridge's track_create", "changes_the_list": True, "before": before, "after": after, "raised": after > before})
    if after <= before:
        failed.append("the bridge's track_create")
    write(env, "rows", rows)
    assert not failed, f"edits that change the track list left REAPER's change count alone: {failed}; rows {rows}"
    return "; ".join(f"{r['edit']}: {r['before']} -> {r['after']}{'' if r['raised'] else ' (not raised)'}" for r in rows)


def revision_read(env: Env) -> str:
    """The revision `tracks_read` answers: the sixth field of TRACKS_READ, 16 hex digits."""
    events = env.send("tracks_read", until={"TRACKS_READ_END", "ERROR"})
    header = next(e for e in events if e[0] == "TRACKS_READ")
    assert len(header) > 5 and re.fullmatch(r"[0-9a-f]{16}", header[5]), f"TRACKS_READ carried no revision: {header}"
    return header[5]


def heartbeat_carries(env: Env, revision: str, *, timeout: float) -> float:
    """Waits for the newest heartbeat to carry `revision` (its ninth field) and answers how long that took, in seconds."""
    started = time.monotonic()

    def carried():
        env.session.events()
        beats = [e for e in env.session.seen if e[0] == "PROJECT_STATUS"]
        return bool(beats) and len(beats[-1]) > 8 and beats[-1][8] == revision

    env.wait_for(carried, timeout=timeout, what=f"a heartbeat carrying the revision {revision}")
    return time.monotonic() - started


@scenario(
    "tracks_read",
    "tracks_read",
    "track list revision (#3859): every edit that changes the track list changes the revision tracks_read answers and the heartbeat carries the "
    "new one within a second, sent at once and not at the 1.5 s interval; select, arm and mute leave it as it was; REAPER's own Lua computes it",
)
def list_edits_change_the_revision(env: Env) -> str:
    rows = []
    failed = []
    for name, lists, body in ROWS:
        env.lua(ARRANGE)
        before = revision_read(env)
        heartbeat_carries(env, before, timeout=5.0)
        edit = body.replace("return {}", "")
        env.lua(f"reaper.Undo_BeginBlock2(0) {edit} reaper.Undo_EndBlock2(0, 'revision row', -1) return true")
        sent = time.monotonic()
        after = revision_read(env)
        row = {"edit": name, "changes_the_list": lists, "before": before, "after": after, "changed": after != before}
        if lists:
            # The read above took a round trip; the heartbeat with the new revision must already be there or arrive well inside the interval.
            heartbeat_carries(env, after, timeout=5.0)
            row["seconds_from_edit"] = round(time.monotonic() - sent, 3)
            # Well under the 1.5 s interval: a heartbeat that only came on its interval would pass a looser bound by chance.
            if after == before or row["seconds_from_edit"] > 0.3:
                failed.append(name)
        elif after != before:
            failed.append(name)
        rows.append(row)
    write(env, "revision_rows", rows)
    assert not failed, f"track list revision rows that did not hold: {failed}; rows {rows}"
    return "; ".join(
        f"{r['edit']}: {'changed' if r['changed'] else 'same'}" + (f", heartbeat {r['seconds_from_edit']} s after the edit" if "seconds_from_edit" in r else "")
        for r in rows
    )


# The edits an undo and a redo can be pressed on: the ones ROWS lists as changing the list, minus the delete, whose undo needs REAPER to restore a track.
UNDO_ROWS = [row for row in ROWS if row[1] and row[0] != "delete a track"]


@scenario(
    "tracks_read",
    "tracks_read",
    "track list revision (#3880): an undo puts the revision back to what it was and a redo moves it again, each carried by a heartbeat sent at "
    "once; an edit outside an undo block is in a heartbeat within the interval",
)
def revision_follows_undo_redo_and_unblocked_edits(env: Env) -> str:
    rows = []
    failed = []
    for name, _lists, body in UNDO_ROWS:
        env.lua(ARRANGE)
        before = revision_read(env)
        heartbeat_carries(env, before, timeout=5.0)
        edit = body.replace("return {}", "")
        env.lua(f"reaper.Undo_BeginBlock2(0) {edit} reaper.Undo_EndBlock2(0, 'revision undo row', -1) return true")
        after = revision_read(env)
        heartbeat_carries(env, after, timeout=5.0)
        env.lua("reaper.Undo_DoUndo2(0) return true")
        started = time.monotonic()
        undone = revision_read(env)
        undo_seconds = round(heartbeat_carries(env, undone, timeout=5.0) + (time.monotonic() - started), 3)
        env.lua("reaper.Undo_DoRedo2(0) return true")
        started = time.monotonic()
        redone = revision_read(env)
        redo_seconds = round(heartbeat_carries(env, redone, timeout=5.0) + (time.monotonic() - started), 3)
        row = {
            "edit": name,
            "before": before,
            "after": after,
            "undone": undone,
            "redone": redone,
            "undo_seconds": undo_seconds,
            "redo_seconds": redo_seconds,
        }
        rows.append(row)
        if after == before or undone != before or redone != after:
            failed.append(name)
    # A script's edit outside any undo block: the change counter may not move, so it is the next heartbeat (interval 1.5 s) that carries it.
    env.lua(ARRANGE)
    before = revision_read(env)
    heartbeat_carries(env, before, timeout=5.0)
    env.lua("reaper.GetSetMediaTrackInfo_String(ci.track_by_name('Voice A'), 'P_NAME', 'Renamed outside a block', true) return true")
    after = revision_read(env)
    seconds = round(heartbeat_carries(env, after, timeout=5.0), 3)
    rows.append({"edit": "rename outside an undo block", "before": before, "after": after, "heartbeat_seconds": seconds})
    if after == before:
        failed.append("rename outside an undo block")
    write(env, "revision_undo_rows", rows)
    assert not failed, f"track list revision rows that did not hold: {failed}; rows {rows}"
    return "; ".join(
        f"{r['edit']}: " + (f"undo {r['undo_seconds']} s, redo {r['redo_seconds']} s" if "undo_seconds" in r else f"heartbeat {r['heartbeat_seconds']} s")
        for r in rows
    )
