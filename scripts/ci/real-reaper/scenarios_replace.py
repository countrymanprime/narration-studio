"""Real-REAPER scenarios, group 6: replacing a range of the narrator's words with another narrator's audio, and putting it back.

Their audio sits on its own track, as the app's import leaves it. Each scenario sends the product's own replace_range or
restore_replacement and asserts on the items REAPER holds, on the samples of a render (their stretch is what plays, at the level
asked for, and the narrator's audio after it follows on), on one Undo, and on a put-back after a save and reopen, when REAPER's undo
history is gone. Rows: docs/operations/reaper-verification-pass.md, "Real-REAPER CI run (Linux)".
"""

from __future__ import annotations

from drive import BRAND, undo_label
from scenario import Env, db, items_on, near, scenario
from scenarios_session import GUID_NONE, undo_once

REPLACE_LABEL = undo_label("replace audio")
RESTORE_LABEL = undo_label("put audio back")
PREFIX = BRAND["identity"]["reaperExtPrefix"]


def duet(env: Env) -> dict:
    """Chapter 1: steps.wav at 0-12 s (tone_a to 5 s, tone_b to 10 s, tone_c after) and the next line at 14 s (tone_c, 6 s); the
    co-narrator's track "Eric Leach": their file, tone_c.wav, at 50-70 s. Saved and reopened, so nothing is in the undo history."""
    return env.lua(
        """
        local one, theirs = ci.add_track('Chapter 1'), ci.add_track('Eric Leach')
        ci.add_item(one, args[1], 0, 12)
        ci.add_item(one, args[2], 14, 6)
        ci.add_item(theirs, args[2], 50, 20)
        ci.save_and_reload(ci.rpp)
        local item = reaper.GetTrackMediaItem(ci.track_by_name('Chapter 1'), 0)
        local source = reaper.GetTrackMediaItem(ci.track_by_name('Eric Leach'), 0)
        return { item = ci.item_guid(item), source = ci.item_guid(source) }
        """,
        env.media_path("steps"),
        env.media_path("tone_c"),
    )


def positions(env: Env, track: str) -> list[tuple[float, float]]:
    return [(round(i["position"], 3), round(i["length"], 3)) for i in items_on(env.snapshot(), track)]


def item_ext(env: Env, guid: str, key: str) -> str:
    return env.lua(
        "local item = ci.item(args[1]) if not item then return '' end "
        "local _, v = reaper.GetSetMediaItemInfo_String(item, 'P_EXT:' .. args[2], '', false) return v or ''",
        guid,
        PREFIX + key,
    )


@scenario(
    "replace_range",
    "replace_range",
    "replace range: their stretch plays in place of the words at the level asked for, the later audio moves by the difference; one Undo gives it back",
)
def replace_longer(env: Env) -> str:
    fx = duet(env)
    others = env.witness("Chapter 1", "Cuts")
    done = env.ok("replace_range", fx["item"], "4.5", "6", fx["source"], "51|54|10|-6|r-ci-1", until="RANGE_REPLACED")
    assert env.witness("Chapter 1", "Cuts") == others, "replace_range changed another track (their track included), the master or a marker"
    new_guid, cut_guid, left_guid, shift, undo_points = done[2:7]
    assert left_guid == fx["item"] and shift == "1.500000" and undo_points == "1", f"answered {done[2:]}"
    state = env.snapshot()
    assert positions(env, "Chapter 1") == [(0.0, 4.5), (4.5, 3.0), (7.5, 6.0), (15.5, 6.0)], f"Chapter 1 {positions(env, 'Chapter 1')}"
    new = items_on(state, "Chapter 1")[1]
    assert new["guid"] == new_guid and new["takes"][0]["file"] == "tone_c.wav", f"the new item {new}"
    near(new["takes"][0]["offset"], 1.0, 1e-6, "their take's source offset")
    near(db(new["takes"][0]["volume"]), -6.0, 0.01, "their take's volume (dB)")
    near(new["fade_in"], 0.01, 1e-6, "their stretch's fade-in")
    near(items_on(state, "Chapter 1")[2]["fade_in"], 0.01, 1e-6, "the right seam's fade-in")
    near(items_on(state, "Chapter 1")[2]["takes"][0]["offset"], 6.0, 1e-6, "the right piece's source offset")
    assert [(i["guid"], round(i["position"], 3), round(i["length"], 3)) for i in items_on(state, "Cuts")] == [(cut_guid, 4.5, 1.5)], (
        "the narrator's piece is not parked on Cuts"
    )
    assert positions(env, "Eric Leach") == [(50.0, 20.0)], "their item moved"
    assert item_ext(env, new_guid, "replacement") == "r-ci-1" and item_ext(env, new_guid, "replacement_cut") == cut_guid
    assert item_ext(env, cut_guid, "replaced_by") == "r-ci-1"
    assert state["undo"] == REPLACE_LABEL, state["undo"]
    mix = env.render_mix("replace", 0.0, 12.0)
    plain = mix.tone(1.0, 3.0, 440.0)
    assert mix.pitch(4.7, 7.3) == "tone_c", f"the replaced range plays {mix.pitch(4.7, 7.3)}, not their file (tone_c)"
    near(db(mix.tone(4.7, 7.3, 880.0) / plain), -6.0, 0.5, "their stretch's level against the narrator's (dB)")
    assert mix.pitch(7.7, 11.3) == "tone_b", "the narrator's audio after the words does not follow their read"
    mine = env.ok("last_action", "replace_range", until="LAST_ACTION")
    assert mine[3] == "this", f"after a replacement last_action answered {mine[3]!r}"
    undone = undo_once(env)
    assert undone == REPLACE_LABEL, f"undid {undone!r}"
    back = env.snapshot()
    assert positions(env, "Chapter 1") == [(0.0, 12.0), (14.0, 6.0)], f"after Undo {positions(env, 'Chapter 1')}"
    assert not items_on(back, "Cuts"), "Undo left the parked piece on Cuts"
    return "4.5-6 s replaced by their 51-54 s (tone_c at -6 dB, rendered -6 dB), the rest 1.5 s later; one Undo gives back one 12 s item"


@scenario(
    "replace_range",
    "replace_range, undo_last",
    "replace range: a shorter read closes the gap; the app's Undo (undo_last replace_range) takes it back in one step; refusals change nothing",
)
def replace_shorter(env: Env) -> str:
    fx = duet(env)
    done = env.ok("replace_range", fx["item"], "4.5", "6", fx["source"], "51|52|0|0|r-ci-2", until="RANGE_REPLACED")
    assert done[5] == "-0.500000", f"shift {done[5]}"
    assert positions(env, "Chapter 1") == [(0.0, 4.5), (4.5, 1.0), (5.5, 6.0), (13.5, 6.0)], f"Chapter 1 {positions(env, 'Chapter 1')}"
    again = env.refused("replace_range", done[2], "4.6", "5", fx["source"], "51|52|0|0|r-ci-3")
    assert "already replaced" in again[2], again[2]
    undone = env.ok("undo_last", "replace_range", "1", until="UNDONE_LAST")
    assert undone[3:5] == ["1", "1"], f"steps/undone {undone[3:5]}"
    assert positions(env, "Chapter 1") == [(0.0, 12.0), (14.0, 6.0)], f"after undo_last {positions(env, 'Chapter 1')}"
    before = env.snapshot()
    env.refused("replace_range", GUID_NONE, "4.5", "6", fx["source"], "51|52|0|0|r-ci-4", tag="ITEM_STALE")
    env.refused("replace_range", fx["item"], "4.5", "6", GUID_NONE, "51|52|0|0|r-ci-4", tag="ITEM_STALE")
    env.refused("replace_range", fx["item"], "4.5", "6", fx["source"], "69|72|0|0|r-ci-4")
    env.refused("replace_range", fx["item"], "4.5", "6", fx["item"], "8|9|0|0|r-ci-4")
    env.refused("replace_range", fx["item"], "4.5", "6", fx["source"], "51|52|0|30|r-ci-4")
    after = env.snapshot()
    assert not items_on(after, "Cuts") and after["undo"] == before["undo"], "refusals changed the project"
    return "a 1 s read for 1.5 s of words closes the gap by 0.5 s; undo_last undoes it in one step; 5 refusals change nothing"


@scenario(
    "replace_range",
    "replace_range, restore_replacement",
    "put my audio back: after a save and reopen (no undo history) the narrator's piece returns from Cuts and plays as before",
)
def restore_after_reload(env: Env) -> str:
    fx = duet(env)
    done = env.ok("replace_range", fx["item"], "4.5", "6", fx["source"], "51|54|10|0|r-ci-5", until="RANGE_REPLACED")
    new_guid, cut_guid = done[2], done[3]
    env.lua("ci.save_and_reload(ci.rpp) return true")
    assert item_ext(env, new_guid, "replacement") == "r-ci-5", "the replacement's P_EXT did not survive a save and reopen"
    wrong = env.refused("restore_replacement", new_guid, "r-ci-other", tag="ITEM_STALE")
    assert wrong[3] == "replacement", wrong
    put = env.ok("restore_replacement", new_guid, "r-ci-5", until="REPLACEMENT_RESTORED")
    assert put[2:5] == [cut_guid, "-1.500000", "1"], f"answered {put[2:]}"
    state = env.snapshot()
    assert positions(env, "Chapter 1") == [(0.0, 4.5), (4.5, 1.5), (6.0, 6.0), (14.0, 6.0)], f"Chapter 1 {positions(env, 'Chapter 1')}"
    pieces = items_on(state, "Chapter 1")
    assert pieces[1]["guid"] == cut_guid and not items_on(state, "Cuts"), "the narrator's piece is not back on the chapter track"
    assert pieces[0]["fade_out"] == 0 and pieces[1]["fade_in"] == 0 and pieces[1]["fade_out"] == 0 and pieces[2]["fade_in"] == 0, (
        "the seams are not joined without a fade"
    )
    assert state["undo"] == RESTORE_LABEL, state["undo"]
    mix = env.render_mix("restored", 0.0, 12.0)
    assert mix.pitch(3.5, 4.4) == "tone_a" and mix.pitch(5.1, 5.9) == "tone_b" and mix.pitch(6.5, 9.5) == "tone_b", "the restored audio does not play as before"
    near(db(mix.tone(4.0, 5.0, 440.0) / mix.tone(1.0, 3.0, 440.0)), 0.0, 0.3, "the level across the restored seam (dB)")
    again = env.refused("restore_replacement", new_guid, "r-ci-5", tag="ITEM_STALE")
    assert again[3] == "item", again
    return "after a save and reopen the piece returns to 4.5-6 s, the rest back 1.5 s, seams joined with no dip; a second put-back changes nothing"


@scenario(
    "replace_range",
    "replace_range",
    "replace range: their file is a 22.05 kHz MP3 (the LibriVox chapter) in the project: the stretch renders, as long as asked",
)
def replace_from_mp3(env: Env) -> str:
    fx = env.lua(
        """
        local one, theirs = ci.add_track('Chapter 1'), ci.add_track('Eric Leach')
        ci.add_item(one, args[1], 0, 12)
        ci.add_item(theirs, ci.audio, 100, 200, 0)
        ci.save_and_reload(ci.rpp)
        local item = reaper.GetTrackMediaItem(ci.track_by_name('Chapter 1'), 0)
        local source = reaper.GetTrackMediaItem(ci.track_by_name('Eric Leach'), 0)
        return { item = ci.item_guid(item), source = ci.item_guid(source) }
        """,
        env.media_path("steps"),
    )
    done = env.ok("replace_range", fx["item"], "4", "6", fx["source"], "160|163|10|0|r-ci-6", until="RANGE_REPLACED")
    assert done[5] == "1.000000", f"shift {done[5]}"
    new = next(i for i in items_on(env.snapshot(), "Chapter 1") if i["guid"] == done[2])
    assert new["takes"][0]["file"].endswith(".mp3"), new["takes"][0]["file"]
    near(new["takes"][0]["offset"], 60.0, 1e-6, "their take's source offset into the MP3")
    mix = env.render_mix("replace_mp3", 0.0, 10.0)
    speech = mix.rms(4.1, 6.9)
    assert speech > 0.003, f"the MP3 stretch renders at rms {speech}: not heard"
    assert mix.tone(4.1, 6.9, 440.0) < 0.01 and mix.tone(4.1, 6.9, 660.0) < 0.01, "the narrator's tones still play under their stretch"
    assert mix.pitch(7.2, 9.8) == "tone_b", "the narrator's audio after the words does not follow on"
    return f"60-63 s of the 22.05 kHz MP3 renders at rms {speech:.4f} in place of 4-6 s; the rest 1 s later"


@scenario(
    "replace_range",
    "import_audio_track, replace_range",
    "import their audio: the file goes on a new muted track in one undo step, is not heard in a render, and is the source of a replacement",
)
def import_then_replace(env: Env) -> str:
    fx = env.lua(
        """
        local one = ci.add_track('Chapter 1')
        ci.add_item(one, args[1], 0, 12)
        ci.save_and_reload(ci.rpp)
        return { item = ci.item_guid(reaper.GetTrackMediaItem(ci.track_by_name('Chapter 1'), 0)) }
        """,
        env.media_path("steps"),
    )
    added = env.ok("import_audio_track", "Eric Leach 🎙", env.media_path("tone_c"), until="AUDIO_TRACK_ADDED")
    track_guid, item_guid, length, undo_points = added[2:6]
    near(float(length), 30.0, 0.01, "their item's length (the file's)")
    assert undo_points == "1", added
    state = env.snapshot()
    theirs = next(t for t in state["tracks"] if t["name"] == "Eric Leach 🎙")
    assert theirs["mute"], "their track is not muted"
    assert [(i["guid"], round(i["position"], 3), round(i["length"], 3)) for i in items_on(state, "Eric Leach 🎙")] == [(item_guid, 0.0, 30.0)]
    assert state["undo"] == undo_label("add their audio"), state["undo"]
    mix = env.render_mix("imported", 0.0, 10.0)
    assert mix.tone(1.0, 3.0, 880.0) < 0.01 and mix.pitch(1.0, 3.0) == "tone_a", "their muted track is heard in the mix"
    env.refused("import_audio_track", "Eric Leach", "//server/share/x.wav")
    env.refused("import_audio_track", "Eric Leach", env.media_path("tone_c").replace("tone_c.wav", "gone.wav"))
    done = env.ok("replace_range", fx["item"], "6", "7", item_guid, "2|3|10|0|r-ci-7", until="RANGE_REPLACED")
    mix = env.render_mix("imported_replace", 0.0, 10.0)
    assert mix.pitch(6.1, 6.9) == "tone_c", f"the replacement from the imported track plays {mix.pitch(6.1, 6.9)}"
    undone = undo_once(env)
    assert undone == REPLACE_LABEL, undone
    assert undo_once(env) == undo_label("add their audio"), "the import is not its own undo step"
    assert not any(t["name"] == "Eric Leach 🎙" for t in env.snapshot()["tracks"]), "Undo left their track"
    return f"a 30 s WAV on a muted track {track_guid[:9]}…, silent in the mix; a replacement from it renders tone_c; {done[0]}; two Undos remove both"
