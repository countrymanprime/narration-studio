"""Real-REAPER scenarios, group: the DAW follows the chapter, solo in place on the chapter (#3428, PR D).

`solo_chapter` soloes the chapter's folder track in place while the Booth is on that chapter, `solo_restore` puts it back
(src/studio/integrations/reaper/narration_solo_chapter.lua). The harness proves the rules against a fake; these rows show what the fake cannot:

- the mix: with the folder soloed only that chapter's tone is in the rendered master mix (the voices inside the folder are heard, the other chapter
  is silent), and moving to the other chapter swaps them;
- one write: the other tracks' solo, mute and selection are as the narrator left them, no undo point, no edit counted, the project not dirty;
- the restore returns the narrator's own state and removes the ledger; a folder the narrator soloed is left and not put back;
- the layer under a play: play_from inside the soloed chapter puts our solo back and the restore after it puts back the narrator's.

Every row writes its numbers to <out>/solo_chapter/<row>.json. What is pending with the owner: the redraw of the solo state in a narrator's own window,
Windows and a real crash. The project's own file is a row of its own: save_project writes it with the solo put back, and the narrator's own save keeps the solo (the limit
the Booth guide names).
"""

from __future__ import annotations

import json
import re
import time
from pathlib import Path

from scenario import Env, scenario
from scenarios_follow import FOCUS_ARRANGE
from scenarios_playtrack import mix_tones, narrator_state
from scenarios_transport import play_state

# The narrator's own state: Chapter 2's second voice muted by hand and Pickups selected; nothing soloed.
HAND = """
for i = 0, reaper.CountTracks(0) - 1 do
  local t = reaper.GetTrack(0, i)
  local _, name = reaper.GetSetMediaTrackInfo_String(t, 'P_NAME', '', false)
  reaper.SetTrackSelected(t, name == 'Pickups')
  reaper.SetMediaTrackInfo_Value(t, 'I_SOLO', 0)
  reaper.SetMediaTrackInfo_Value(t, 'B_MUTE', name == 'Chapter 2 Second' and 1 or 0)
end
return true
"""

FLAGS = "return { changes = reaper.GetProjectStateChangeCount(0), undo = reaper.Undo_CanUndo2(0) or '', dirty = reaper.IsProjectDirty(0) }"
LEDGER = "local f = io.open(reaper.GetResourcePath() .. '/narration_solo_ledger.txt', 'r') if f then local t = f:read('a') f:close() return t end return ''"
GUID = "return reaper.GetTrackGUID(ci.track_by_name(args[1]))"


def write(env: Env, name: str, value: object) -> None:
    folder = env.out / "solo_chapter"
    folder.mkdir(exist_ok=True)
    (folder / f"{name}.json").write_text(json.dumps(value, indent=2, sort_keys=True), encoding="utf-8")


def arrange(env: Env) -> tuple[str, str]:
    """Chapter 1 (tone_a, 440 Hz) and Chapter 2 (tone_b, 660 Hz), each a folder of a Narrator with 8 s of audio and a second voice, and Pickups."""
    first = env.lua(FOCUS_ARRANGE, env.media_path("tone_a"), env.media_path("tone_b"))
    second = env.lua(GUID, "Chapter 2")
    env.lua(HAND)
    return first["folder"], second


@scenario(
    "follow_position",
    "solo_chapter,solo_restore",
    "solo_chapter: soloing the chapter's folder in place leaves only that chapter in the rendered mix with one write (no undo point, no edit, the other tracks as they were), moving to the other chapter swaps them, and solo_restore puts the narrator's state back and removes the ledger",
)
def solo_and_restore(env: Env) -> str:
    chapter1, chapter2 = arrange(env)
    narrator = narrator_state(env)
    flags = env.lua(FLAGS)
    result: dict = {"narrator": narrator, "flags_before": flags}

    done = env.ok("solo_chapter", chapter1, until="CHAPTER_SOLOED")
    assert done[3:] == ["1", "0"], f"CHAPTER_SOLOED {done}"
    state = narrator_state(env)
    expected = dict(narrator)
    selected, _, muted = narrator["Chapter 1"]
    expected["Chapter 1"] = (selected, 2.0, muted)
    assert state == expected, f"only the folder's solo changes:\n{narrator}\n{state}"
    result["after_solo_1"] = state
    result["flags_after_solo"] = env.lua(FLAGS)
    assert result["flags_after_solo"] == flags, f"a solo is not an edit: {flags} -> {result['flags_after_solo']}"
    one_a, one_b = mix_tones(env, "solo_chapter_1")
    result["mix_chapter_1"] = {"440": one_a, "660": one_b}
    assert one_a > 0.1 and one_b < 0.01, f"with Chapter 1 soloed the mix holds 440 Hz {one_a:.3f} and 660 Hz {one_b:.3f}"
    assert env.lua(LEDGER) != "", "the ledger is written while a chapter is soloed"

    moved = env.ok("solo_chapter", chapter2, until="CHAPTER_SOLOED")
    assert moved[3:] == ["1", "0"], f"CHAPTER_SOLOED {moved}"
    two_a, two_b = mix_tones(env, "solo_chapter_2")
    result["mix_chapter_2"] = {"440": two_a, "660": two_b}
    assert two_b > 0.1 and two_a < 0.01, f"with Chapter 2 soloed the mix holds 440 Hz {two_a:.3f} and 660 Hz {two_b:.3f}"
    assert narrator_state(env)["Chapter 1"][1] == 0.0, "the earlier chapter is put back when the next is soloed"

    restored = env.ok("solo_restore", until="SOLO_RESTORED")
    assert restored[2:] == ["1", "0", "0"], f"SOLO_RESTORED {restored}"
    after = narrator_state(env)
    assert after == narrator, f"the narrator's own state is not back:\n{narrator}\n{after}"
    assert env.lua(LEDGER) == "", "the ledger is removed once everything is put back"
    result["flags_after_restore"] = env.lua(FLAGS)
    assert result["flags_after_restore"] == flags, f"a restore is not an edit: {result['flags_after_restore']}"
    write(env, "solo_and_restore", result)
    return (
        f"solo on Chapter 1: mix 440 Hz {one_a:.2f}, 660 Hz {one_b:.3f}; on Chapter 2: 440 Hz {two_a:.3f}, 660 Hz {two_b:.2f}; "
        "undo, change count and dirty flag unchanged across the solos and the restore; the narrator's state and the ledger back"
    )


@scenario(
    "follow_position",
    "solo_chapter,solo_restore",
    "solo_chapter: a folder the narrator soloed is left as it is and not put back, a solo the narrator changes meanwhile is kept by solo_restore, and a track that is gone is refused with nothing changed",
)
def narrators_own_solo(env: Env) -> str:
    chapter1, _ = arrange(env)
    env.lua("reaper.SetMediaTrackInfo_Value(ci.track_by_name('Chapter 1'), 'I_SOLO', 1) return true")
    before = narrator_state(env)
    left = env.ok("solo_chapter", chapter1, until="CHAPTER_SOLOED")
    assert left[3:] == ["0", "0"], f"a folder soloed by hand is left: {left}"
    assert narrator_state(env) == before
    env.ok("solo_restore", until="SOLO_RESTORED")
    assert narrator_state(env) == before, "a solo the narrator set is not put back"
    env.lua("reaper.SetMediaTrackInfo_Value(ci.track_by_name('Chapter 1'), 'I_SOLO', 0) return true")
    env.ok("solo_chapter", chapter1, until="CHAPTER_SOLOED")
    env.lua("reaper.SetMediaTrackInfo_Value(ci.track_by_name('Chapter 1'), 'I_SOLO', 1) return true")
    kept = env.ok("solo_restore", until="SOLO_RESTORED")
    assert kept[2:] == ["0", "1", "0"], f"SOLO_RESTORED {kept}"
    assert narrator_state(env)["Chapter 1"][1] == 1.0, "a solo the narrator changed meanwhile is kept"
    stale = env.refused("solo_chapter", "{FFFFFFFF-0000-4000-8000-00000000FFFF}", tag="TRACK_STALE", until="CHAPTER_SOLOED")
    assert stale[0] == "TRACK_STALE"
    write(env, "narrators_own_solo", {"left": left, "kept": kept, "stale": stale})
    return "a folder soloed by hand was left and not put back; a solo changed meanwhile was kept; a gone track answered TRACK_STALE"


@scenario(
    "follow_position",
    "solo_chapter,play_from",
    "solo_chapter: play_from inside the soloed chapter isolates the voice and gives the chapter's solo back, and solo_restore after it puts back the narrator's state",
    needs_audio=True,
)
def solo_under_a_play(env: Env) -> str:
    chapter1, _ = arrange(env)
    narrator = narrator_state(env)
    env.ok("solo_chapter", chapter1, until="CHAPTER_SOLOED")
    soloed = narrator_state(env)
    voice = env.lua(GUID, "Chapter 1 Narrator")
    env.ok("play_from", "1", voice, until="TRANSPORT_PLAYING")
    env.wait_for(lambda: play_state(env) == 1, what="REAPER to play")
    time.sleep(0.5)
    waiting = env.ok("solo_restore", until="SOLO_RESTORED")
    assert waiting[2:] == ["0", "0", "1"], f"a restore under a play waits: {waiting}"
    env.ok("stop_play", until="TRANSPORT_STOPPED")
    env.wait_for(lambda: narrator_state(env) == narrator, timeout=8, what="the narrator's state to be back after the play and the waiting restore")
    assert soloed != narrator
    write(env, "solo_under_a_play", {"narrator": narrator, "soloed": soloed, "waiting": waiting})
    return (
        "a restore sent during a play waited; after the stop the play's isolation and then the chapter's solo were put back, leaving the narrator's own state"
    )


SOLOED_IN_FILE = re.compile(r"^\s*MUTESOLO\s+\S+\s+2\b", re.MULTILINE)


@scenario(
    "follow_position",
    "solo_chapter,solo_restore,save_project",
    "solo_chapter: save_project writes the project with the chapter's solo put back and soloes it again (the file never holds the solo), while a save made by REAPER itself keeps the solo in the file, which is the limit the Booth guide names",
)
def save_while_soloed(env: Env) -> str:
    chapter1, _ = arrange(env)
    rpp = env.lua("ci.save_and_reload(ci.rpp) return ci.rpp")
    env.ok("solo_chapter", chapter1, until="CHAPTER_SOLOED")
    assert narrator_state(env)["Chapter 1"][1] == 2.0
    env.ok("save_project", rpp, until="SAVED")
    assert narrator_state(env)["Chapter 1"][1] == 2.0, "the chapter is soloed again after the save"
    by_the_app = Path(rpp).read_text(encoding="utf-8")
    assert not SOLOED_IN_FILE.search(by_the_app), "save_project wrote the chapter's solo into the file"
    assert env.lua(LEDGER) != "", "the row stays on the ledger through the save"
    env.lua("reaper.Main_SaveProject(0, false) return true")
    by_reaper = Path(rpp).read_text(encoding="utf-8")
    assert SOLOED_IN_FILE.search(by_reaper), "a save made by REAPER itself holds the solo: the limit"
    env.ok("solo_restore", until="SOLO_RESTORED")
    env.lua("ci.save_and_reload(ci.rpp) return true")
    reopened = env.ok("solo_chapter", env.lua(GUID, "Chapter 1"), until="CHAPTER_SOLOED")
    assert reopened[3:] == ["1", "0"], f"after the app's save and a restore the reopened project has the chapter not soloed: {reopened}"
    write(env, "save_while_soloed", {"by_the_app_holds_solo": False, "by_reaper_holds_solo": True, "reopened": reopened})
    return "save_project wrote the file without the solo and soloed the chapter again; REAPER's own save kept the solo in the file; after a restore and a reopen the chapter was not soloed"
