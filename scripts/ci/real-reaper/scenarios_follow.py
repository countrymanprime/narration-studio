"""Real-REAPER scenarios, group: what a DAW that follows the app's chapter costs and changes in REAPER (#3428, PR B).

The plan (issue #3428) has the app select a chapter's folder and its children, move the cursor, show it, and later make the chapter the only
unmuted one. These rows record what REAPER does for each of those steps, so the build rests on a run and not on a guess:

- view: whether `go_to`'s SetEditCurPos(time, true, false) scrolls the arrange view to a far chapter, horizontally and vertically, and what the
  REAPER actions found by ID and text (not by memory) do about the vertical part and about zooming to a time range;
- flags: whether setting B_MUTE or I_SOLO or the track selection through the API adds an undo point, counts as an edit or marks the project dirty;
- timing: what selecting a folder with its children and setting mute and solo on every other track cost on 60, 500 and 2000 tracks, with and
  without PreventUIRefresh;
- focus play: whether play_from's isolation, played inside a focus made of solos or of mutes, puts the focus back and then the narrator's own state.

Nothing here is product behaviour: the focus is made by the harness's Lua, since the app does not make one yet. The 2000-track mute and solo of every other track runs only with NARRATION_CI_FOLLOW_LARGE=1 in the environment (it takes about ten minutes). Every row writes its numbers to
<out>/follow/<row>.json for docs/research/2026-11-16-daw-follows-chapter-real-reaper.md. The REAPER window is xvfb's, so the arrange view is small
(about 7 s wide at the default zoom); what a narrator's window shows is pending with the owner.
"""

from __future__ import annotations

import json
import os
import statistics
import time

from scenario import Env, scenario
from scenarios_playtrack import mix_tones, narrator_state, tracks_now
from scenarios_transport import play_state

ACTIONS = {
    40913: "Track: Vertical scroll selected tracks into view",
    40031: "View: Zoom time selection",
}

# The lines every Lua snippet below shares: the arrange view, a track's place in it and the three things an edit would change.
LIB = """
local function view()
  local s, e = reaper.GetSet_ArrangeView2(0, false, 0, 0)
  return { s = s, e = e }
end
local function geo(t)
  return {
    y = reaper.GetMediaTrackInfo_Value(t, 'I_TCPY'),
    h = reaper.GetMediaTrackInfo_Value(t, 'I_TCPH'),
    selected = reaper.GetMediaTrackInfo_Value(t, 'I_SELECTED') ~= 0,
  }
end
local function flags()
  return { changes = reaper.GetProjectStateChangeCount(0), undo = reaper.Undo_CanUndo2(0) or '', dirty = reaper.IsProjectDirty(0) }
end
local function action(id, expected)
  local text = reaper.kbd_getTextFromCmd(id, reaper.SectionFromUniqueID(0))
  assert(text == expected, 'action ' .. id .. ' is ' .. tostring(text) .. ', expected ' .. expected)
  reaper.Main_OnCommand(id, 0)
end
local function track(name)
  return ci.track_by_name(name)
end
"""

# 20 chapters of a folder and two voices (60 tracks), each chapter's Narrator holding 5 s of audio at k * 200 s.
CHAPTERS = (
    LIB
    + """
local file = args[1]
reaper.PreventUIRefresh(1)
for k = 0, 19 do
  local folder = ci.add_track('Chapter ' .. k)
  local narrator = ci.add_track('Narrator ' .. k)
  local second = ci.add_track('Voice ' .. k)
  reaper.SetMediaTrackInfo_Value(folder, 'I_FOLDERDEPTH', 1)
  reaper.SetMediaTrackInfo_Value(second, 'I_FOLDERDEPTH', -1)
  ci.add_item(narrator, file, k * 200, 5)
end
reaper.PreventUIRefresh(-1)
reaper.UpdateArrange()
ci.save_and_reload(ci.rpp)
"""
)


def write(env: Env, name: str, value: object) -> None:
    folder = env.out / "follow"
    folder.mkdir(exist_ok=True)
    (folder / f"{name}.json").write_text(json.dumps(value, indent=2, sort_keys=True), encoding="utf-8")


def arrange_chapters(env: Env) -> dict[str, str]:
    """Twenty chapters of three tracks; answers the GUID of Chapter 15 (the far one) and Chapter 1."""
    env.lua(CHAPTERS, env.media_path("tone_a"), timeout=120.0)
    return env.lua(
        LIB
        + "return { far = reaper.GetTrackGUID(track('Chapter 15')), near = reaper.GetTrackGUID(track('Chapter 1')), start = reaper.GetTrackGUID(track('Chapter 0')) }"
    )


def arrange_height(env: Env) -> float:
    """The height in pixels of the arrange view's track area: where the last of 60 tracks lands when REAPER scrolls to it (its bottom edge)."""
    got = env.lua(
        LIB
        + """
        local id, text = 40913, 'Track: Vertical scroll selected tracks into view'
        reaper.SetOnlyTrackSelected(reaper.GetTrack(0, 0))
        action(id, text)
        local last = reaper.GetTrack(0, reaper.CountTracks(0) - 1)
        reaper.SetOnlyTrackSelected(last)
        action(id, text)
        local bottom = geo(last)
        reaper.SetOnlyTrackSelected(reaper.GetTrack(0, 0))
        action(id, text)
        return { bottom = bottom.y + bottom.h, first = geo(reaper.GetTrack(0, 0)).y }
        """
    )
    assert got["first"] == 0, f"scrolling to the first track left it at y={got['first']}"
    return got["bottom"]


@scenario(
    "follow",
    "go_to",
    "follow: go_to to a chapter 3000 s away scrolls the arrange view to the cursor but not down to the chapter's tracks, and 'Track: Vertical scroll selected tracks into view' brings them in",
)
def view_after_go_to(env: Env) -> str:
    guids = arrange_chapters(env)
    height = arrange_height(env)
    probe = (
        LIB
        + """
        local f, a, b = track('Chapter ' .. args[1]), track('Narrator ' .. args[1]), track('Voice ' .. args[1])
        local v = view()
        local cursor = reaper.GetCursorPosition()
        return {
          view = v, cursor = cursor, in_view = cursor >= v.s and cursor <= v.e,
          folder = geo(f), narrator = geo(a), voice = geo(b), changes = flags(),
          selected = reaper.CountSelectedTracks(0),
        }
        """
    )
    start = env.lua(probe, "0")
    env.ok("go_to", guids["start"], "at", "0", until="PLACE_SET")
    far = env.ok("go_to", guids["far"], "at", "3000", until="PLACE_SET")
    after_far = env.lua(probe, "15")
    assert after_far["in_view"], f"the cursor at 3000 s is not in the view: {after_far['view']}"
    assert after_far["selected"] == 3, f"go_to selected {after_far['selected']} tracks"
    low = after_far["folder"]["y"] + after_far["folder"]["h"] > height
    assert low, f"the far chapter's folder is in view at y={after_far['folder']['y']} (height {height})"
    scrolled = env.lua(
        probe.replace("local f, a, b", "action(40913, 'Track: Vertical scroll selected tracks into view')\n        local f, a, b"),
        "15",
    )
    for name in ("folder", "narrator", "voice"):
        track = scrolled[name]
        assert 0 <= track["y"] and track["y"] + track["h"] <= height, f"{name} not in view after the action: {track}, height {height}"
    assert scrolled["view"] == after_far["view"], "the vertical action moved the view horizontally"
    assert scrolled["selected"] == 3, "the vertical action changed the selection"
    # Back to the first chapter: the view follows the cursor to the left too.
    env.ok("go_to", guids["start"], "at", "0", until="PLACE_SET")
    back = env.lua(probe, "0")
    assert back["in_view"], f"the cursor at 0 s is not in the view after coming back: {back['view']}"
    # A place inside the view does not move it.
    env.ok("go_to", guids["start"], "at", "2", until="PLACE_SET")
    within = env.lua(probe, "0")
    assert within["view"] == back["view"], f"a cursor inside the view moved it: {back['view']} to {within['view']}"
    write(
        env,
        "view_after_go_to",
        {"arrange_height": height, "start": start, "far_event": far, "after_far": after_far, "after_vertical_action": scrolled, "back": back, "within": within},
    )
    return (
        f"cursor 3000 in view {after_far['view']['s']:.2f}-{after_far['view']['e']:.2f}; the folder's top is y={after_far['folder']['y']:.0f} of "
        f"{height:.0f} (not shown); after action 40913 the folder, Narrator and Voice are at y={scrolled['folder']['y']:.0f}/{scrolled['narrator']['y']:.0f}/{scrolled['voice']['y']:.0f}; "
        f"going back to 0 s scrolls left (view {back['view']['s']:.2f}-{back['view']['e']:.2f}); a cursor inside the view leaves it"
    )


@scenario(
    "follow",
    "go_to",
    "follow: the vertical-scroll action brings a selected folder and its voices into view from above and below, and zooming to a time range is an action on the time selection (View: Zoom time selection) or GetSet_ArrangeView2; none selects, moves the cursor or edits",
)
def view_actions(env: Env) -> str:
    arrange_chapters(env)
    height = arrange_height(env)
    out: dict = {"arrange_height": height, "actions": {str(k): v for k, v in ACTIONS.items()}}
    steps = env.lua(
        LIB
        + """
        local id, text = 40913, 'Track: Vertical scroll selected tracks into view'
        local function select_chapter(k)
          local folder = track('Chapter ' .. k)
          reaper.SetOnlyTrackSelected(folder)
          reaper.SetTrackSelected(track('Narrator ' .. k), true)
          reaper.SetTrackSelected(track('Voice ' .. k), true)
        end
        local function place(k)
          return { folder = geo(track('Chapter ' .. k)), voice = geo(track('Voice ' .. k)) }
        end
        local out = {}
        -- from the top: chapter 15 is far below
        reaper.Main_SaveProject(0, false)
        select_chapter(15)
        local before = flags()
        local cursor = reaper.GetCursorPosition()
        action(id, text)
        out.from_above = place(15)
        out.flags_after_action = flags()
        out.flags_before = before
        out.cursor_unchanged = reaper.GetCursorPosition() == cursor
        out.selected_after = reaper.CountSelectedTracks(0)
        -- from the bottom: chapter 2 is far above
        select_chapter(2)
        action(id, text)
        out.from_below = place(2)
        -- already in view: no move
        select_chapter(2)
        local y = geo(track('Chapter 2')).y
        action(id, text)
        out.in_view_moved = geo(track('Chapter 2')).y ~= y
        -- nothing selected
        reaper.SetOnlyTrackSelected(track('Chapter 19'))
        action(id, text)
        reaper.SetTrackSelected(track('Chapter 19'), false)
        local before_none = geo(track('Chapter 19')).y
        action(id, text)
        out.none_selected_moved = geo(track('Chapter 19')).y ~= before_none
        return out
        """
    )
    out["vertical"] = steps
    h = height
    for key in ("from_above", "from_below"):
        for name, t in steps[key].items():
            assert 0 <= t["y"] and t["y"] + t["h"] <= h, f"{key} {name} is not in view: {t}, height {h}"
    assert steps["cursor_unchanged"] and steps["selected_after"] == 3, f"the action moved the cursor or changed the selection: {steps}"
    assert steps["flags_after_action"] == steps["flags_before"], f"the vertical action edited the project: {steps}"

    zoom = env.lua(
        LIB
        + """
        local out = {}
        reaper.Main_SaveProject(0, false)
        local s0, e0 = reaper.GetSet_LoopTimeRange(false, false, 0, 0, false)
        out.time_selection_before = { s0, e0 }
        out.view_before = view()
        out.flags_before_time_selection = flags()
        reaper.GetSet_LoopTimeRange(true, false, 3000, 3150, false)
        out.flags_after_setting_time_selection = flags()
        action(40031, 'View: Zoom time selection')
        out.view_after_action = view()
        out.flags_after_action = flags()
        out.cursor = reaper.GetCursorPosition()
        reaper.GetSet_LoopTimeRange(true, false, s0, e0, false)
        out.time_selection_restored = { reaper.GetSet_LoopTimeRange(false, false, 0, 0, false) }
        -- the API call that sets the view without a time selection
        reaper.Main_SaveProject(0, false)
        local before = flags()
        reaper.GetSet_ArrangeView2(0, true, 0, 0, 1000, 1150)
        out.view_after_api = view()
        out.flags_before_api = before
        out.flags_after_api = flags()
        return out
        """
    )
    out["zoom"] = zoom
    after = zoom["view_after_action"]
    assert after["s"] <= 3000 and after["e"] >= 3150 and after["e"] - after["s"] < 400, f"zoom time selection gave {after}"
    write(env, "view_actions", out)
    api = zoom["view_after_api"]
    return (
        f"action 40913 from above y={steps['from_above']['folder']['y']:.0f}, from below y={steps['from_below']['folder']['y']:.0f} (height {h:.0f}), no edit counted; "
        f"in view moved: {steps['in_view_moved']}; nothing selected moved: {steps['none_selected_moved']}; action 40031 on 3000-3150 s gave view {after['s']:.2f}-{after['e']:.2f} "
        f"(edit counted: {zoom['flags_after_action']['changes'] != zoom['flags_after_setting_time_selection']['changes']}); GetSet_ArrangeView2 set 1000-1150 gave {api['s']:.2f}-{api['e']:.2f} "
        f"(edit counted: {zoom['flags_after_api']['changes'] != zoom['flags_before_api']['changes']})"
    )


@scenario(
    "follow",
    "(API)",
    "follow: setting B_MUTE, I_SOLO or the selection through the API adds no undo point; whether it counts as an edit or dirties the project is recorded per call",
)
def flags_of_mute_solo_select(env: Env) -> str:
    got = env.lua(
        LIB
        + """
        local out, a, b = {}, ci.add_track('A'), ci.add_track('B')
        ci.save_and_reload(ci.rpp)
        a, b = track('A'), track('B')
        local function step(name, fn)
          reaper.Main_SaveProject(0, false)
          local before = flags()
          fn()
          out[name] = { before = before, after = flags() }
        end
        step('set_selected', function() reaper.SetTrackSelected(a, true) end)
        step('set_only_selected', function() reaper.SetOnlyTrackSelected(b) end)
        step('set_selected_false', function() reaper.SetTrackSelected(b, false) end)
        step('set_selected_true_again', function() reaper.SetTrackSelected(b, true) end)
        step('set_selected_already_true', function() reaper.SetTrackSelected(b, true) end)
        step('mute', function() reaper.SetMediaTrackInfo_Value(a, 'B_MUTE', 1) end)
        step('unmute', function() reaper.SetMediaTrackInfo_Value(a, 'B_MUTE', 0) end)
        step('solo_in_place', function() reaper.SetMediaTrackInfo_Value(a, 'I_SOLO', 2) end)
        step('unsolo', function() reaper.SetMediaTrackInfo_Value(a, 'I_SOLO', 0) end)
        step('solo_plain', function() reaper.SetMediaTrackInfo_Value(a, 'I_SOLO', 1) end)
        step('unsolo_plain', function() reaper.SetMediaTrackInfo_Value(a, 'I_SOLO', 0) end)
        step('mute_unchanged_value', function() reaper.SetMediaTrackInfo_Value(a, 'B_MUTE', 0) end)
        step('cursor_with_view', function() reaper.SetEditCurPos(5, true, false) end)
        step('cursor_no_view', function() reaper.SetEditCurPos(6, false, false) end)
        -- the same mute made as the narrator would, with an undo block: the control for what "an undo point" looks like here
        step('mute_in_undo_block', function()
          reaper.Undo_BeginBlock2(0)
          reaper.SetMediaTrackInfo_Value(a, 'B_MUTE', 1)
          reaper.Undo_EndBlock2(0, 'mute with a block', -1)
        end)
        reaper.SetMediaTrackInfo_Value(a, 'B_MUTE', 0)
        return out
        """
    )
    saved = env.lua(
        LIB
        + """
        -- Does a mute and solo set through the API, with the project not dirty, reach the file on the next save?
        local a = track('A')
        reaper.Main_SaveProject(0, false)
        reaper.SetMediaTrackInfo_Value(a, 'B_MUTE', 1)
        reaper.SetMediaTrackInfo_Value(a, 'I_SOLO', 2)
        local dirty = reaper.IsProjectDirty(0)
        reaper.Main_SaveProject(0, false)
        local handle = assert(io.open(ci.rpp, 'rb'))
        local text = handle:read('a')
        handle:close()
        local lines = {}
        for line in text:gmatch('[^\\r\\n]+') do
          if line:match('^%s*NAME ') or line:match('^%s*MUTESOLO') then lines[#lines + 1] = line:match('^%s*(.-)%s*$') end
        end
        reaper.SetMediaTrackInfo_Value(a, 'B_MUTE', 0)
        reaper.SetMediaTrackInfo_Value(a, 'I_SOLO', 0)
        return { dirty_before_save = dirty, lines = lines }
        """
    )
    got["saved_file"] = saved
    write(env, "flags_of_mute_solo_select", got)
    rows = []
    for name, step in got.items():
        if name == "saved_file":
            continue
        undo = step["after"]["undo"] != step["before"]["undo"]
        edit = step["after"]["changes"] != step["before"]["changes"]
        dirty = bool(step["after"]["dirty"]) and not bool(step["before"]["dirty"])
        rows.append(f"{name}: undo point {undo}, edit counted {edit}, dirty {dirty}")
    for name in ("mute", "solo_in_place", "set_selected"):
        assert got[name]["after"]["undo"] == got[name]["before"]["undo"], f"{name} changed the top of the undo history: {got[name]}"
    assert got["mute_in_undo_block"]["after"]["undo"] == "mute with a block", "the control did not leave an undo point"
    rows.append(f"a mute and a solo set by the API, then a save: dirty before the save {saved['dirty_before_save']}, file lines {saved['lines']}")
    return "; ".join(rows)


# -- play inside a focus --------------------------------------------------------------------------------------------------------

FOCUS_ARRANGE = """
local file1, file2 = args[1], args[2]
local function chapter(name, file)
  local folder = ci.add_track(name)
  local narrator = ci.add_track(name .. ' Narrator')
  local second = ci.add_track(name .. ' Second')
  reaper.SetMediaTrackInfo_Value(folder, 'I_FOLDERDEPTH', 1)
  reaper.SetMediaTrackInfo_Value(second, 'I_FOLDERDEPTH', -1)
  ci.add_item(narrator, file, 0, 8)
  return narrator
end
chapter('Chapter 1', file1)
chapter('Chapter 2', file2)
ci.add_track('Pickups')
ci.save_and_reload(ci.rpp)
return {
  narrator = reaper.GetTrackGUID(ci.track_by_name('Chapter 1 Narrator')),
  folder = reaper.GetTrackGUID(ci.track_by_name('Chapter 1')),
}
"""

# The narrator's own state: Pickups soloed by hand, Chapter 2's second voice muted by hand and, when args[1] is 1, Chapter 1's Narrator too.
HAND = """
local solo, mute = { ['Pickups'] = 1 }, { ['Chapter 2 Second'] = true }
if args[1] == '1' then mute['Chapter 1 Narrator'] = true end
for i = 0, reaper.CountTracks(0) - 1 do
  local t = reaper.GetTrack(0, i)
  local _, name = reaper.GetSetMediaTrackInfo_String(t, 'P_NAME', '', false)
  reaper.SetTrackSelected(t, name == 'Pickups')
  reaper.SetMediaTrackInfo_Value(t, 'I_SOLO', solo[name] or 0)
  reaper.SetMediaTrackInfo_Value(t, 'B_MUTE', mute[name] and 1 or 0)
end
return true
"""

# A focus on Chapter 1, made as PR D would: by solo in place on the chapter's three tracks (every solo the narrator set is cleared and remembered),
# or by muting every track outside the chapter that is not muted already. The narrator's state is kept in ci.focus_saved for the release.
FOCUS_ON = """
local mode = args[1]
local saved = {}
for i = 0, reaper.CountTracks(0) - 1 do
  local t = reaper.GetTrack(0, i)
  saved[#saved + 1] = { t = t, solo = reaper.GetMediaTrackInfo_Value(t, 'I_SOLO'), mute = reaper.GetMediaTrackInfo_Value(t, 'B_MUTE') }
end
ci.focus_saved = saved
local inside = { ['Chapter 1'] = true, ['Chapter 1 Narrator'] = true, ['Chapter 1 Second'] = true }
for _, row in ipairs(saved) do
  local _, name = reaper.GetSetMediaTrackInfo_String(row.t, 'P_NAME', '', false)
  if mode == 'solo' then
    reaper.SetMediaTrackInfo_Value(row.t, 'I_SOLO', inside[name] and 2 or 0)
  elseif not inside[name] and row.mute == 0 then
    reaper.SetMediaTrackInfo_Value(row.t, 'B_MUTE', 1)
  end
end
return true
"""

FOCUS_OFF = """
for _, row in ipairs(ci.focus_saved) do
  reaper.SetMediaTrackInfo_Value(row.t, 'I_SOLO', row.solo)
  reaper.SetMediaTrackInfo_Value(row.t, 'B_MUTE', row.mute)
end
return true
"""


def focus_round(env: Env, guid: str, mode: str, label: str, muted_child: bool) -> dict:
    """One play_from inside a focus of `mode`; answers the three states it compares (narrator's own, the focus, after the play) and the mix."""
    env.lua(HAND, "1" if muted_child else "0")
    narrator = narrator_state(env)
    env.lua(FOCUS_ON, mode)
    focus = narrator_state(env)
    env.ok("play_from", "1", guid, until="TRANSPORT_PLAYING")
    env.wait_for(lambda: play_state(env) == 1, what="REAPER to play")
    time.sleep(0.5)
    during = tracks_now(env)
    first, second = mix_tones(env, f"focus_{mode}_{label.split(',')[0]}_{int(muted_child)}")
    # The render takes the transport and the bridge puts the isolation back once REAPER does not play (as in scenarios_playtrack).
    env.wait_for(lambda: narrator_state(env) == focus, timeout=8, what="the focus to be back after the play")
    after_play = narrator_state(env)
    env.lua(FOCUS_OFF)
    released = narrator_state(env)
    return {
        "narrator": narrator,
        "focus": focus,
        "while_playing": {n: {"solo": t["solo"], "muted": t["muted"], "selected": t["selected"]} for n, t in during.items()},
        "after_play": after_play,
        "after_release": released,
        "mix_tone_440": first,
        "mix_tone_660": second,
        "restored_to_focus": after_play == focus,
        "restored_to_narrator": released == narrator,
    }


@scenario(
    "follow",
    "play_from",
    "follow: play_from inside a focus made by solo in place, or by muting the other chapters, plays only the asked track and puts the focus back, and releasing the focus puts the narrator's own mutes and solos back",
    needs_audio=True,
)
def focus_play(env: Env) -> str:
    fx = env.lua(FOCUS_ARRANGE, env.media_path("tone_a"), env.media_path("tone_b"))
    results = {}
    notes = []
    for mode in ("solo", "mute"):
        for target, guid, muted_child in (
            ("narrator_track, muted by hand", fx["narrator"], True),
            ("folder", fx["folder"], False),
            ("folder, its Narrator muted by hand", fx["folder"], True),
        ):
            round_ = focus_round(env, guid, mode, target, muted_child)
            results[f"{mode} focus, play_from {target}"] = round_
            assert round_["restored_to_focus"], (
                f"{mode}/{target}: after the play the tracks are not as the focus left them:\n{round_['focus']}\n{round_['after_play']}"
            )
            assert round_["restored_to_narrator"], (
                f"{mode}/{target}: releasing the focus did not restore the narrator's state:\n{round_['narrator']}\n{round_['after_release']}"
            )
            heard_a, heard_b = round_["mix_tone_440"], round_["mix_tone_660"]
            notes.append(f"{mode}/{target}: 440 Hz {heard_a:.2f}, 660 Hz {heard_b:.3f}")
            env.lua("reaper.OnStopButton() return true")
    write(env, "focus_play", results)
    return "after the play the focus was back and releasing it restored the narrator's state in every round; mix tones: " + "; ".join(notes)


# -- timing ---------------------------------------------------------------------------------------------------------------------

BUILD = """
local count = tonumber(args[1])
reaper.PreventUIRefresh(1)
for k = 0, count // 3 - 1 do
  local folder = ci.add_track('C' .. k)
  local a = ci.add_track('N' .. k)
  local b = ci.add_track('V' .. k)
  reaper.SetMediaTrackInfo_Value(folder, 'I_FOLDERDEPTH', 1)
  reaper.SetMediaTrackInfo_Value(b, 'I_FOLDERDEPTH', -1)
end
for _ = 1, count - 3 * (count // 3) do ci.add_track('P') end
reaper.PreventUIRefresh(-1)
reaper.UpdateArrange()
return reaper.CountTracks(0)
"""

CLEAR = """
reaper.PreventUIRefresh(1)
while reaper.CountTracks(0) > 0 do
  reaper.DeleteTrack(reaper.GetTrack(0, reaper.CountTracks(0) - 1))
end
reaper.PreventUIRefresh(-1)
reaper.UpdateArrange()
return true
"""

# One timed operation, `reps` times, with or without PreventUIRefresh (args: track count, repetitions, operation, "plain" or "prevent"). The chapter is
# the one in the middle (folder, Narrator, Voice). Each repetition ends with an untimed put-back of only what the operation changed, timed apart.
TIMING = """
local count, reps, name, mode = tonumber(args[1]), tonumber(args[2]), args[3], args[4]
local first = (count // 3 // 2) * 3
local tracks = {}
for i = 0, count - 1 do tracks[i] = reaper.GetTrack(0, i) end
local function inside(i) return i >= first and i < first + 3 end
local stamps = {}
local function others(key, value)
  for i = 0, count - 1 do
    if not inside(i) and reaper.GetMediaTrackInfo_Value(tracks[i], key) == 0 then
      local t = reaper.time_precise()
      reaper.SetMediaTrackInfo_Value(tracks[i], key, value)
      stamps[#stamps + 1] = (reaper.time_precise() - t) * 1000
    end
  end
end
local function clear(key)
  for i = 0, count - 1 do
    if reaper.GetMediaTrackInfo_Value(tracks[i], key) ~= 0 then reaper.SetMediaTrackInfo_Value(tracks[i], key, 0) end
  end
end
local ops = {
  select_chapter = {
    function()
      reaper.SetOnlyTrackSelected(tracks[first])
      reaper.SetTrackSelected(tracks[first + 1], true)
      reaper.SetTrackSelected(tracks[first + 2], true)
    end,
    function() reaper.SetOnlyTrackSelected(tracks[0]) end,
  },
  select_all = {
    function()
      reaper.SetOnlyTrackSelected(tracks[0])
      for i = 1, count - 1 do reaper.SetTrackSelected(tracks[i], true) end
    end,
    function() reaper.SetOnlyTrackSelected(tracks[0]) end,
  },
  mute_others = { function() others('B_MUTE', 1) end, function() clear('B_MUTE') end },
  solo_others = { function() others('I_SOLO', 2) end, function() clear('I_SOLO') end },
  solo_chapter = {
    function() for i = first, first + 2 do reaper.SetMediaTrackInfo_Value(tracks[i], 'I_SOLO', 2) end end,
    function() clear('I_SOLO') end,
  },
}
local act, restore = ops[name][1], ops[name][2]
local runs, back, first_sets, last_sets = {}, {}, nil, nil
for r = 1, reps do
  local t0 = reaper.time_precise()
  if mode == 'prevent' then reaper.PreventUIRefresh(1) end
  act()
  if mode == 'prevent' then reaper.PreventUIRefresh(-1) end
  local t1 = reaper.time_precise()
  runs[#runs + 1] = (t1 - t0) * 1000
  if r == 1 and #stamps > 6 then
    local n = #stamps
    first_sets = { stamps[1], stamps[2], stamps[3] }
    last_sets = { stamps[n - 2], stamps[n - 1], stamps[n] }
  end
  reaper.PreventUIRefresh(1)
  restore()
  reaper.PreventUIRefresh(-1)
  back[#back + 1] = (reaper.time_precise() - t1) * 1000
end
return { runs = runs, restore = back, first_sets_ms = first_sets, last_sets_ms = last_sets }
"""

OPERATIONS = ("select_chapter", "select_all", "mute_others", "solo_others", "solo_chapter")
# On 2000 tracks one pass of these takes from 3 s to 43 s and putting it back as long again (docs/research/2026-11-16-daw-follows-chapter-real-reaper.md),
# so a run measures them there only with NARRATION_CI_FOLLOW_LARGE=1; the default run keeps the Windows job inside its REAPER time limit.
SLOW_OPERATIONS = ("mute_others", "solo_others")


def stats(runs: list[float]) -> dict[str, float]:
    return {"median_ms": round(statistics.median(runs), 2), "max_ms": round(max(runs), 2), "runs": len(runs)}


def timing_scenario(count: int, budget_ms: float) -> None:
    @scenario(
        "follow",
        "go_to",
        f"follow: selecting a folder and its voices and setting mute and solo on every other track, with and without PreventUIRefresh, on {count} tracks",
    )
    def run(env: Env) -> str:
        try:
            built = env.lua(BUILD, str(count), timeout=300.0)
            assert built == count, f"built {built} tracks"
            raw, restore, per_set = {}, {}, {}
            reps = "5" if count < 1000 else "1"
            for operation in OPERATIONS:
                if count >= 1000 and operation in SLOW_OPERATIONS and not os.environ.get("NARRATION_CI_FOLLOW_LARGE"):
                    continue
                for mode in ("plain", "prevent"):
                    got = env.lua(TIMING, str(count), reps, operation, mode, timeout=900.0)
                    raw[f"{operation} {mode}"], restore[f"{operation} {mode}"] = got["runs"], got["restore"]
                    if got.get("first_sets_ms"):
                        per_set[f"{operation} {mode}"] = {"first": got["first_sets_ms"], "last": got["last_sets_ms"]}
            first = env.lua("return reaper.GetTrackGUID(reaper.GetTrack(0, (tonumber(args[1]) // 3 // 2) * 3))", str(count))
            places = []
            for _ in range(5):
                started = time.monotonic()
                env.ok("go_to", first, "at", "0", until="PLACE_SET")
                places.append(round((time.monotonic() - started) * 1000, 1))
        finally:
            env.lua(CLEAR, timeout=600.0)
        result = {name: stats(runs) for name, runs in raw.items()}
        result["go_to round trip, bridge (wall ms)"] = {"median_ms": statistics.median(places), "max_ms": max(places), "runs": len(places)}
        write(env, f"timing_{count}", {"tracks": count, "raw_ms": raw, "restore_ms": restore, "per_set_ms": per_set, "summary": result})
        worst = max(v["max_ms"] for k, v in result.items() if k.startswith(("select_chapter", "select_all", "solo_chapter")))
        assert worst < budget_ms, f"{count} tracks: a selection or a chapter solo took {worst} ms, budget {budget_ms}"
        text = "; ".join(f"{k} {v['median_ms']} ms (max {v['max_ms']})" for k, v in result.items())
        return text

    run.__name__ = f"timing_{count}"


for _count, _budget in ((60, 100.0), (500, 500.0), (2000, 2000.0)):
    timing_scenario(_count, _budget)
