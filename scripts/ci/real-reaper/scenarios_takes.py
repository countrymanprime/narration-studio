"""Real-REAPER scenarios, group 2: takes (use, hide, split, stack and un-stack).

Arrange a scratch project with two reads of a line, send the product's command, assert on the items, takes, volumes and P_EXT REAPER holds
afterwards, after a save and reload, after one Undo, and (where "is it audible" matters) on the samples of a render.
Rows: docs/operations/reaper-verification-pass.md, "Real-REAPER CI run (Linux)".
"""

from __future__ import annotations

from scenario import Env, items_on, near, scenario
from scenarios_session import GUID_NONE, undo_once


def two_take_item(env: Env) -> dict:
    """Chapter 1: one item 0-10 s with take 1 (tone_a, active) and take 2 (tone_b); saved and reopened."""
    return env.lua(
        """
        local track = ci.add_track('Chapter 1')
        local item, first = ci.add_item(track, args[1], 0, 10)
        local second = ci.add_take(item, args[2], 0)
        reaper.SetActiveTake(first)
        ci.save_and_reload(ci.rpp)
        local item = reaper.GetTrackMediaItem(ci.track_by_name('Chapter 1'), 0)
        return { item = ci.item_guid(item), first = ci.take_guid(reaper.GetTake(item, 0)), second = ci.take_guid(reaper.GetTake(item, 1)) }
        """,
        env.media_path("tone_a"),
        env.media_path("tone_b"),
    )


def the_item(env: Env, track: str = "Chapter 1", index: int = 0) -> dict:
    return items_on(env.snapshot(), track)[index]


# -- use a take --------------------------------------------------------------------------------------------------------------


@scenario("takes", "set_active_take", "takes: use take 2, the same again changes nothing, one Undo gives take 1 back, a stale take is refused")
def set_active_take(env: Env) -> str:
    fx = two_take_item(env)
    first = env.ok("set_active_take", fx["item"], fx["second"], until="ACTIVE_TAKE_SET")
    assert first[2:5] == [fx["item"], fx["second"], "1"], f"answered {first[2:]}"
    item = the_item(env)
    assert [t["active"] for t in item["takes"]] == [False, True], "take 2 is not the active take"
    assert env.snapshot()["undo"] == "Narration Utils: use take"
    assert env.render_mix("use_take", 0.0, 3.0).pitch(0.2, 2.8) == "tone_b", "the render does not play take 2"
    again = env.ok("set_active_take", fx["item"], fx["second"], until="ACTIVE_TAKE_SET")
    assert again[4] == "0", f"second send changed {again[4]}"
    undone = undo_once(env)
    assert undone == "Narration Utils: use take", f"undid {undone!r}"
    assert [t["active"] for t in the_item(env)["takes"]] == [True, False], "Undo did not make take 1 active again"
    env.refused("set_active_take", fx["item"], GUID_NONE, tag="ITEM_STALE")
    env.refused("set_active_take", GUID_NONE, fx["second"], tag="ITEM_STALE")
    return "take 2 plays (tone_b), undo gives take 1 back, 2 stale GUIDs refused"


# -- hide takes --------------------------------------------------------------------------------------------------------------


@scenario("takes", "hide_takes", "takes: hide the other take, kept take active, the hidden take silent, one Undo, kept across save and reload")
def hide_takes(env: Env) -> str:
    fx = two_take_item(env)
    env.lua("reaper.SetMediaItemTakeInfo_Value(ci.take(args[1]), 'D_VOL', 0.5) return true", fx["first"])
    others = env.witness("Chapter 1")
    hidden = env.ok("hide_takes", fx["item"], fx["second"], until="TAKES_HIDDEN")
    assert env.witness("Chapter 1") == others, "hide_takes changed another track, the master or a marker (row A10)"
    assert hidden[2:5] == [fx["item"], "1", "1"], f"hidden/changed {hidden[2:]}"
    item = the_item(env)
    first, second = item["takes"]
    assert first["volume"] == 0 and second["volume"] == 1, f"volumes {first['volume']}, {second['volume']}"
    assert second["active"] and not first["active"], "the kept take is not the active take"
    saved = env.lua("return ci.take_ext(ci.take(args[1]), 'narration_utils_take_hidden_volume')", fx["first"])
    assert saved and abs(float(saved) - 0.5) < 1e-9, f"the take's saved volume {saved!r}"
    assert env.snapshot()["undo"] == "Narration Utils: hide other takes"
    # A narrator who makes the hidden take the active one hears nothing: D_VOL 0 is silent.
    env.lua("reaper.SetActiveTake(ci.take(args[1])) return true", fx["first"])
    silent = env.render_mix("hidden", 0.0, 3.0)
    assert silent.rms(0.2, 2.8) < 1e-4, f"the hidden take plays: rms {silent.rms(0.2, 2.8)}"
    env.lua("reaper.SetActiveTake(ci.take(args[1])) return true", fx["second"])
    assert env.render_mix("kept", 0.0, 3.0).pitch(0.2, 2.8) == "tone_b", "the kept take does not play"
    again = env.ok("hide_takes", fx["item"], fx["second"], until="TAKES_HIDDEN")
    assert again[3:5] == ["0", "0"], f"second send answered {again[3:5]}"
    env.lua("ci.save_and_reload(ci.rpp) return true")
    after = the_item(env)["takes"]
    assert after[0]["volume"] == 0, "the hidden take is audible again after save and reload"
    kept = env.lua("return ci.take_ext(ci.take(args[1]), 'narration_utils_take_hidden_volume')", after[0]["guid"])
    assert kept and abs(float(kept) - 0.5) < 1e-9, f"the saved volume after reload {kept!r}"
    giveback = env.ok("hide_takes", fx["item"], fx["first"], until="TAKES_HIDDEN")
    assert giveback[3:5] == ["1", "1"], f"hiding the other way answered {giveback[3:5]}"
    both = the_item(env)["takes"]
    assert abs(both[0]["volume"] - 0.5) < 1e-9 and both[1]["volume"] == 0 and both[0]["active"], "the first take did not get its 0.5 back"
    undone = undo_once(env)
    assert undone == "Narration Utils: hide other takes", f"undid {undone!r}"
    restored = the_item(env)["takes"]
    assert restored[0]["volume"] == 0 and restored[1]["volume"] == 1, "one Undo did not restore every volume"
    env.refused("hide_takes", fx["item"], GUID_NONE, tag="ITEM_STALE")
    return "volumes, active take and the saved 0.5 survive reload; one Undo restores them; hidden take renders silence"


# -- split a take ------------------------------------------------------------------------------------------------------------


def one_read_twice(env: Env) -> dict:
    """Chapter 1: one item 10-20 s playing steps.wav from 0 (pitch A 0-5 s, B 5-10 s, C 10-15 s): a read, then the same line read again."""
    return env.lua(
        """
        local track = ci.add_track('Chapter 1')
        local item = ci.add_item(track, args[1], 10, 10)
        ci.save_and_reload(ci.rpp)
        local item = reaper.GetTrackMediaItem(ci.track_by_name('Chapter 1'), 0)
        return { item = ci.item_guid(item), take = ci.take_guid(reaper.GetTake(item, 0)) }
        """,
        env.media_path("steps"),
    )


@scenario("takes", "split_take", "takes: split at the second read, a take that plays from the cut, one Undo puts the take back whole")
def split_take(env: Env) -> str:
    fx = one_read_twice(env)
    done = env.ok("split_take", fx["item"], fx["take"], "15.5", until="TAKE_SPLIT")
    assert done[2:4] == [fx["item"], fx["take"]] and done[5] == "15.500" and done[6] == "1", f"answered {done[2:]}"
    item = the_item(env)
    near(item["length"], 5.5, 1e-6, "item length")
    near(item["position"], 10.0, 1e-6, "item position")
    first, second = item["takes"]
    assert first["active"] and not second["active"], "the first read must stay active"
    assert first["guid"] == fx["take"] and second["guid"] == done[4], "take GUIDs"
    assert second["file"] == "steps.wav" and abs(second["offset"] - 5.5) < 1e-6, f"second take plays {second['file']} from {second['offset']}"
    assert env.snapshot()["undo"] == "Narration Utils: split take"
    mix = env.render_mix("first_read", 10.0, 15.5)
    assert mix.pitch(0.5, 3.0) == "tone_a", f"first read plays {mix.pitch(0.5, 3.0)}"  # the render starts at project second 10
    env.lua("reaper.SetActiveTake(ci.take(args[1])) return true", second["guid"])
    heard = env.render_mix("second_read", 10.0, 15.5)
    assert heard.pitch(0.2, 4.0) == "tone_b", f"second read plays {heard.pitch(0.2, 4.0)} (source 5.5 s on is tone_b)"
    env.refused("split_take", fx["item"], fx["take"], "13", until=None)  # an item with two takes is refused
    undone = undo_once(env)
    assert undone == "Narration Utils: split take", f"undid {undone!r}"
    whole = the_item(env)
    near(whole["length"], 10.0, 1e-6, "length after Undo")
    assert len(whole["takes"]) == 1 and whole["takes"][0]["guid"] == fx["take"], "Undo did not put the take back whole"
    return "second take plays from 5.5 s (tone_b), first read keeps 10-15.5 s, one Undo restores the whole take"


@scenario("takes", "split_take", "takes: refused when the second read is longer, the playback rate is changed, or the cut is outside the item")
def split_take_refusals(env: Env) -> str:
    fx = one_read_twice(env)
    before = env.snapshot()
    longer = env.refused("split_take", fx["item"], fx["take"], "12")
    assert "longer" in longer[2], longer[2]
    env.refused("split_take", fx["item"], fx["take"], "25", tag="ITEM_STALE")
    env.refused("split_take", fx["item"], fx["take"], "10", tag="ITEM_STALE")
    env.refused("split_take", fx["item"], GUID_NONE, "15", tag="ITEM_STALE")
    env.lua("reaper.SetMediaItemTakeInfo_Value(ci.take(args[1]), 'D_PLAYRATE', 1.5) return true", fx["take"])
    rate = env.refused("split_take", fx["item"], fx["take"], "15.5")
    assert "playback rate" in rate[2], rate[2]
    after = env.snapshot()
    assert items_on(after, "Chapter 1")[0]["takes"][0]["rate"] == 1.5 and len(items_on(after, "Chapter 1")[0]["takes"]) == 1
    assert after["undo"] == before["undo"], "a refused split opened an undo point"
    return "5 refusals, nothing changed"


# -- stack and un-stack -------------------------------------------------------------------------------------------------------


def two_reads(env: Env) -> dict:
    """Chapter 1: a first read 0-5 s (tone_a), a retake 6-10 s (tone_b) and the next line 12-17 s (tone_c); Chapter 2 holds one item (tone_c)."""
    return env.lua(
        """
        local one, two = ci.add_track('Chapter 1'), ci.add_track('Chapter 2')
        ci.add_item(one, args[1], 0, 5)
        ci.add_item(one, args[2], 6, 4)
        ci.add_item(one, args[3], 12, 5)
        ci.add_item(two, args[3], 100, 5)  -- far from every render window, so a render hears Chapter 1 alone
        ci.save_and_reload(ci.rpp)
        local track = ci.track_by_name('Chapter 1')
        local function at(index)
          local item = reaper.GetTrackMediaItem(track, index)
          return { item = ci.item_guid(item), take = ci.take_guid(reaper.GetTake(item, 0)) }
        end
        return { first = at(0), retake = at(1), later = at(2) }
        """,
        env.media_path("tone_a"),
        env.media_path("tone_b"),
        env.media_path("tone_c"),
    )


def stack_payload(env: Env, fx: dict, name: str = "stack.txt") -> str:
    return env.payload(name, ["shift|-5", f"group|{fx['first']['item']}|{fx['first']['take']}", f"move|{fx['retake']['take']}|6|0|4"])


def unstack_payload(env: Env, fx: dict, name: str = "unstack.txt") -> str:
    return env.payload(name, ["shift|5", f"group|{fx['first']['item']}|{fx['first']['take']}", f"move|{fx['retake']['take']}|0|6|4"])


@scenario(
    "stack_takes",
    "stack_takes",
    "stack takes: the retake becomes take 2 of the first read, its item goes to the muted Cuts track, the next line moves up, one Undo",
)
def stack_takes(env: Env) -> str:
    fx = two_reads(env)
    done = env.ok("stack_takes", stack_payload(env, fx), until="TAKES_STACKED")
    assert done[2:6] == ["1", "1", "-5.000", "1"], f"groups/takes/shift/undo points {done[2:]}"
    state = env.snapshot()
    chapter = items_on(state, "Chapter 1")
    assert [round(i["position"], 3) for i in chapter] == [0.0, 7.0], f"Chapter 1 items {[(i['position'], i['length']) for i in chapter]}"
    first = chapter[0]
    assert [t["file"] for t in first["takes"]] == ["tone_a.wav", "tone_b.wav"], f"takes {[t['file'] for t in first['takes']]}"
    assert first["takes"][0]["active"], "the first read must stay active"
    cuts = next(t for t in state["tracks"] if t["name"] == "Cuts")
    assert cuts["mute"], "the Cuts track is not muted"
    parked = items_on(state, "Cuts")
    assert [(i["position"], i["length"]) for i in parked] == [(6.0, 4.0)], f"Cuts track holds {[(i['position'], i['length']) for i in parked]}"
    assert [round(i["position"], 3) for i in items_on(state, "Chapter 2")] == [100.0], "another track's item moved"
    record = env.lua("return ci.take_ext(reaper.GetTake(ci.item(args[1]), 1), 'narration_utils_stacked_from')", first["guid"])
    assert record.split("|")[1] == fx["retake"]["take"] and abs(float(record.split("|")[4]) - 6.0) < 1e-6, f"the take records {record!r}"
    assert state["undo"] == "Narration Utils: stack takes"
    assert len(env.snapshot()["tracks"]) == 3
    env.lua("reaper.SetActiveTake(reaper.GetTake(ci.item(args[1]), 1)) return true", first["guid"])
    assert env.render_mix("stacked", 0.0, 5.0).pitch(0.5, 4.5) == "tone_b", "the stacked take does not play the retake"
    undone = undo_once(env)
    assert undone == "Narration Utils: stack takes", f"undid {undone!r}"
    back = env.snapshot()
    assert [(i["position"], i["length"], len(i["takes"])) for i in items_on(back, "Chapter 1")] == [(0.0, 5.0, 1), (6.0, 4.0, 1), (12.0, 5.0, 1)], (
        "one Undo did not restore Chapter 1"
    )
    assert not items_on(back, "Cuts"), "the retake is still parked on the Cuts track"
    return "retake is take 2 (tone_b) of the first read, parked on Cuts, the next line 12 -> 7 s, one Undo restores all"


@scenario("stack_takes", "stack_takes", "stack takes: a stale item, a read on another track and other audio between the reads change nothing")
def stack_takes_refusals(env: Env) -> str:
    fx = two_reads(env)
    before = env.snapshot()
    stale = env.refused(
        "stack_takes",
        env.payload("stale.txt", ["shift|-5", f"group|{GUID_NONE}|{fx['first']['take']}", f"move|{fx['retake']['take']}|6|0|4"]),
        tag="ITEM_STALE",
    )
    assert stale[3] == "item", stale
    env.refused(
        "stack_takes",
        env.payload("moved.txt", ["shift|-5", f"group|{fx['first']['item']}|{fx['first']['take']}", f"move|{fx['retake']['take']}|8|0|4"]),
        tag="ITEM_STALE",
    )
    env.refused("stack_takes", env.payload("none.txt", ["shift|-5"]))
    between = env.payload("between.txt", ["shift|-12", f"group|{fx['first']['item']}|{fx['first']['take']}", f"move|{fx['later']['take']}|12|0|5"])
    clash = env.refused("stack_takes", between)
    assert "between the reads" in clash[2], clash[2]
    after = env.snapshot()
    assert after["items"] == before["items"] and after["undo"] == before["undo"], "a refused stack changed the project"
    return "4 refusals, project unchanged"


@scenario(
    "stack_takes",
    "unstack_takes",
    "unstack takes: the stacked take goes, the read goes back where it was recorded and the next line moves out, after a save and reload, one Undo",
)
def unstack_takes(env: Env) -> str:
    fx = two_reads(env)
    original = [(i["position"], i["length"]) for i in items_on(env.snapshot(), "Chapter 1")]
    env.ok("stack_takes", stack_payload(env, fx), until="TAKES_STACKED")
    env.lua("ci.save_and_reload(ci.rpp) return true")
    done = env.ok("unstack_takes", unstack_payload(env, fx), until="TAKES_UNSTACKED")
    assert done[2:5] == ["1", "1", "5.000"], f"answered {done[2:]}"
    state = env.snapshot()
    chapter = items_on(state, "Chapter 1")
    assert [(i["position"], i["length"]) for i in chapter] == original, f"Chapter 1 is {[(i['position'], i['length']) for i in chapter]}, was {original}"
    assert [len(i["takes"]) for i in chapter] == [1, 1, 1], "a stacked take is left on the first read"
    assert chapter[0]["takes"][0]["file"] == "tone_a.wav" and chapter[1]["takes"][0]["file"] == "tone_b.wav"
    assert state["undo"] == "Narration Utils: unstack takes"
    mix = env.render_mix("unstacked", 0.0, 10.0)
    assert (mix.pitch(0.5, 4.5), mix.pitch(6.5, 9.5)) == ("tone_a", "tone_b"), "the reads do not play where they were recorded"
    undone = undo_once(env)
    assert undone == "Narration Utils: unstack takes"
    assert [len(i["takes"]) for i in items_on(env.snapshot(), "Chapter 1")] == [2, 1], "one Undo did not stack the take again"
    return "first read back to 1 take, retake back at 6-10 s, next line 12 s again; Undo stacks it again"
