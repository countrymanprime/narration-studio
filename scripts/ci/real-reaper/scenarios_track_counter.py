"""Real-REAPER scenarios: which edits raise `GetProjectStateChangeCount`, for the host's cache of the live track list (#3647).

The host reuses `tracks_read`'s answer while the heartbeat's change count equals the count that answer carried (`tracks_cache.go`), so every edit
that changes the track list (a track added, renamed, deleted, moved, a folder opened or closed, an add undone) must raise the count; an edit that
leaves the list as it was may or may not. These rows measure each kind in a real REAPER and fail on a list-changing edit that leaves the count
alone. Numbers go to <out>/track_counter/rows.json for docs/research/reaper-bridge-performance.md.
"""

from __future__ import annotations

import json

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

# Each row edits the project once and answers the count before and after. `lists` is whether the edit changes what `tracks_read` lists.
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
        got = env.lua(LIB + f"local before = count() {body.replace('return {}', '')} return {{ before = before, after = count(), tracks = names() }}")
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
    folder = env.lua("local f = ci.track_by_name('Chapter 1') reaper.SetMediaTrackInfo_Value(f, 'I_FOLDERDEPTH', 1) reaper.SetMediaTrackInfo_Value(ci.track_by_name('Voice B'), 'I_FOLDERDEPTH', -1) return reaper.GetTrackGUID(f)")
    before = env.lua("return reaper.GetProjectStateChangeCount(0)")
    env.ok("track_create", "Veyra", folder, until="TRACK_CREATED")
    after = env.lua("return reaper.GetProjectStateChangeCount(0)")
    rows.append({"edit": "the bridge's track_create", "changes_the_list": True, "before": before, "after": after, "raised": after > before})
    if after <= before:
        failed.append("the bridge's track_create")
    write(env, "rows", rows)
    assert not failed, f"edits that change the track list left REAPER's change count alone: {failed}; rows {rows}"
    return "; ".join(f"{r['edit']}: {r['before']} -> {r['after']}{'' if r['raised'] else ' (not raised)'}" for r in rows)
