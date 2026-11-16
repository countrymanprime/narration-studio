"""Real-REAPER scenarios, group: selecting a chapter's folder and its tracks must not move the project change count (#3560, #3428).

`GetProjectStateChangeCount` is what the host turns into `daw_project_edited`, and Editing re-reads its word table when it moves. The
benchmark of 2026-11-16 found that `SetTrackSelected` raises it by one per call, even for a track already in that state. These rows
measure the ways of selecting a folder with its children, so the bridge's `go_to` uses one that leaves the count alone.
Numbers go to <out>/select_count/<row>.json for docs/research/2026-11-16-select-without-edit-real-reaper.md.
"""

from __future__ import annotations

import json

from scenario import Env, scenario

LIB = """
local function flags()
  return { changes = reaper.GetProjectStateChangeCount(0), undo = reaper.Undo_CanUndo2(0) or '', dirty = reaper.IsProjectDirty(0) }
end
local function selected_names()
  local names = {}
  for i = 0, reaper.CountSelectedTracks(0) - 1 do
    local _, name = reaper.GetSetMediaTrackInfo_String(reaper.GetSelectedTrack(0, i), 'P_NAME', '', false)
    names[#names + 1] = name
  end
  return names
end
local function track(name)
  return ci.track_by_name(name)
end
"""

# Two chapters (a folder and two voices each) and a loose track.
ARRANGE = (
    LIB
    + """
local function chapter(name)
  local folder = ci.add_track(name)
  local narrator = ci.add_track(name .. ' Narrator')
  local second = ci.add_track(name .. ' Voice')
  reaper.SetMediaTrackInfo_Value(folder, 'I_FOLDERDEPTH', 1)
  reaper.SetMediaTrackInfo_Value(second, 'I_FOLDERDEPTH', -1)
end
chapter('Chapter 1')
chapter('Chapter 2')
ci.add_track('Pickups')
ci.save_and_reload(ci.rpp)
return true
"""
)


def write(env: Env, name: str, value: object) -> None:
    folder = env.out / "select_count"
    folder.mkdir(exist_ok=True)
    (folder / f"{name}.json").write_text(json.dumps(value, indent=2, sort_keys=True), encoding="utf-8")


@scenario(
    "select_count",
    "(API)",
    "select_count: no Main-section action selects the children of a folder (the actions naming select and a folder or children, by ID and text)",
)
def no_children_action(env: Env) -> str:
    env.lua(ARRANGE)
    got = env.lua(
        LIB
        + """
        local out, i = {}, 0
        local section = reaper.SectionFromUniqueID(0)
        while i < 60000 do
          local id, text = reaper.kbd_enumerateActions(section, i)
          if not id or id == 0 then break end
          local lower = tostring(text):lower()
          if (lower:find('child') or lower:find('folder')) and lower:find('select') then out[#out + 1] = { id = id, text = text } end
          i = i + 1
        end
        return { count = i, matches = out }
        """
    )
    write(env, "actions", got)
    texts = [a["text"] for a in got["matches"]]
    assert not any(t.lower().startswith("track: select") and "child" in t.lower() for t in texts), texts
    return f"{got['count']} actions listed; naming select and a folder or children: " + "; ".join(f"{a['id']} {a['text']}" for a in got["matches"])


# Each way of leaving a chapter's folder and both voices selected.
WAYS = """
local ways = {
  set_track_selected = function(folder, members)
    reaper.SetOnlyTrackSelected(folder)
    for _, m in ipairs(members) do reaper.SetTrackSelected(m, true) end
  end,
  i_selected = function(folder, members)
    reaper.SetOnlyTrackSelected(folder)
    for _, m in ipairs(members) do reaper.SetMediaTrackInfo_Value(m, 'I_SELECTED', 1) end
  end,
  i_selected_only_when_different = function(folder, members)
    reaper.SetOnlyTrackSelected(folder)
    for _, m in ipairs(members) do
      if reaper.GetMediaTrackInfo_Value(m, 'I_SELECTED') == 0 then reaper.SetMediaTrackInfo_Value(m, 'I_SELECTED', 1) end
    end
  end,
  set_track_selected_only_when_different = function(folder, members)
    reaper.SetOnlyTrackSelected(folder)
    for _, m in ipairs(members) do
      if reaper.GetMediaTrackInfo_Value(m, 'I_SELECTED') == 0 then reaper.SetTrackSelected(m, true) end
    end
  end,
}
"""


def measure(env: Env) -> dict:
    return env.lua(
        LIB
        + WAYS
        + """
        local out = {}
        local function members_of(name) return { track(name .. ' Narrator'), track(name .. ' Voice') } end
        for way, run in pairs(ways) do
          local row = {}
          reaper.SetOnlyTrackSelected(track('Pickups'))
          reaper.Main_SaveProject(0, false)
          local function step(label, name)
            local before = flags()
            run(track(name), members_of(name))
            row[label] = { before = before, after = flags(), selected = selected_names() }
          end
          step('from_pickups', 'Chapter 1')
          step('again_same_chapter', 'Chapter 1')
          step('other_chapter', 'Chapter 2')
          step('back', 'Chapter 1')
          out[way] = row
        end
        return out
        """
    )


@scenario(
    "select_count",
    "(API)",
    "select_count: which way of selecting a folder and its children leaves the project change count, undo history and dirty flag alone",
)
def ways_of_selecting(env: Env) -> str:
    env.lua(ARRANGE)
    got = measure(env)
    write(env, "ways", got)
    want = ["Chapter 1", "Chapter 1 Narrator", "Chapter 1 Voice"]
    rows = []
    for way, row in sorted(got.items()):
        for label in ("from_pickups", "again_same_chapter", "back"):
            assert sorted(row[label]["selected"]) == want, f"{way} {label} left {row[label]['selected']}"
        moved = {label: step["after"]["changes"] - step["before"]["changes"] for label, step in row.items()}
        undo = any(step["after"]["undo"] != step["before"]["undo"] for step in row.values())
        dirty = any(step["after"]["dirty"] and not step["before"]["dirty"] for step in row.values())
        rows.append(f"{way}: count moved by {moved}, undo point {undo}, dirty {dirty}")
    return "; ".join(rows)


@scenario(
    "select_count",
    "go_to",
    "select_count: the bridge's go_to to a chapter, again, to another and back leaves the change count, undo history and dirty flag where they were and selects the folder and its voices",
)
def go_to_leaves_count(env: Env) -> str:
    env.lua(ARRANGE)
    guids = env.lua(LIB + "return { one = reaper.GetTrackGUID(track('Chapter 1')), two = reaper.GetTrackGUID(track('Chapter 2')) }")
    rows = {}
    for label, guid in (("first", guids["one"]), ("again", guids["one"]), ("other", guids["two"]), ("back", guids["one"])):
        before = env.lua(LIB + "return flags()")
        env.ok("go_to", guid, "end", "", until="PLACE_SET")
        after = env.lua(LIB + "local f = flags() f.selected = selected_names() return f")
        rows[label] = {"before": before, "after": after}
        assert after["changes"] == before["changes"], f"go_to {label} moved the change count {before['changes']} -> {after['changes']}"
        assert after["undo"] == before["undo"], f"go_to {label} changed the undo history"
        assert after["dirty"] == before["dirty"], f"go_to {label} changed the dirty flag"
    name = "Chapter 1"
    assert sorted(rows["back"]["after"]["selected"]) == [name, name + " Narrator", name + " Voice"], rows["back"]["after"]["selected"]
    write(env, "go_to", rows)
    return "change count, undo and dirty unchanged across four go_to calls; selected " + ", ".join(sorted(rows["back"]["after"]["selected"]))
