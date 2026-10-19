"""Real-REAPER scenarios, group 3: cutting words and their audio, FX on a range, lowering stretches, repairing clicks and undoing the app's own work.

Each scenario arranges one chapter, sends the product's command and asserts on the items, takes, FX and envelope points REAPER holds
afterwards, on one Undo, and on the samples of a render, so a cut that leaves the wrong audio playing, or an FX that is not heard,
fails. Rows: docs/operations/reaper-verification-pass.md, "Real-REAPER CI run (Linux)".
"""

from __future__ import annotations

from scenario import Env, db, items_on, near, scenario
from scenarios_session import GUID_NONE, make_chains, undo_once

CUT_LABEL = "Narration Utils: delete words"


def chapter(env: Env, file: str = "steps", length: float = 12.0, later: float = 14.0) -> dict:
    """Chapter 1: one item 0-`length` s playing `file`, the next line at `later` (tone_c, 6 s); Chapter 2: one item; saved and reopened."""
    return env.lua(
        """
        local one, two = ci.add_track('Chapter 1'), ci.add_track('Chapter 2')
        ci.add_item(one, args[1], 0, tonumber(args[2]))
        ci.add_item(one, args[3], tonumber(args[4]), 6)
        ci.add_item(two, args[3], 100, 6)  -- far from every render window, so a render hears Chapter 1 alone
        ci.save_and_reload(ci.rpp)
        local item = reaper.GetTrackMediaItem(ci.track_by_name('Chapter 1'), 0)
        return { item = ci.item_guid(item), take = ci.take_guid(reaper.GetTake(item, 0)) }
        """,
        env.media_path(file),
        str(length),
        env.media_path("tone_c"),
        str(later),
    )


def positions(env: Env, track: str) -> list[tuple[float, float]]:
    return [(round(i["position"], 3), round(i["length"], 3)) for i in items_on(env.snapshot(), track)]


# -- cut range ---------------------------------------------------------------------------------------------------------------


@scenario(
    "cut_range",
    "delete_range",
    "cut range: close mode splits at both ends, parks the middle on a muted Cuts track and moves the rest up; one Undo gives it back whole",
)
def cut_close(env: Env) -> str:
    fx = chapter(env)
    others = env.witness("Chapter 1")
    done = env.ok("delete_range", fx["item"], "4.5", "6", "close", "10", until="RANGE_CUT")
    assert env.witness("Chapter 1", "Cuts") == others, "delete_range changed another track, the master or a marker (row A10)"
    assert done[2] == fx["item"] and done[3] and done[4] == "1", f"left/cut/undo points {done[2:]}"
    state = env.snapshot()
    assert positions(env, "Chapter 1") == [(0.0, 4.5), (4.5, 6.0), (12.5, 6.0)], f"Chapter 1 {positions(env, 'Chapter 1')}"
    right = items_on(state, "Chapter 1")[1]
    near(right["takes"][0]["offset"], 6.0, 1e-6, "right piece's source offset")
    assert [(i["position"], i["length"]) for i in items_on(state, "Cuts")] == [(4.5, 1.5)], "the cut piece is not parked at 4.5-6 on Cuts"
    assert next(t for t in state["tracks"] if t["name"] == "Cuts")["mute"], "the Cuts track is not muted"
    assert [round(i["position"], 3) for i in items_on(state, "Chapter 2")] == [100.0], "another track moved"
    near(items_on(state, "Chapter 1")[0]["fade_out"], 0.01, 1e-6, "the left seam's fade-out")
    near(items_on(state, "Chapter 1")[1]["fade_in"], 0.01, 1e-6, "the right seam's fade-in")
    assert state["undo"] == CUT_LABEL, state["undo"]
    mix = env.render_mix("cut", 0.0, 10.0)
    assert mix.pitch(3.5, 4.4) == "tone_a" and mix.pitch(4.7, 5.9) == "tone_b" and mix.pitch(6.5, 8.3) == "tone_b", (
        "the audio after the cut is not the audio that followed it"
    )
    undone = undo_once(env)
    assert undone == CUT_LABEL, f"undid {undone!r}"
    back = env.snapshot()
    assert positions(env, "Chapter 1") == [(0.0, 12.0), (14.0, 6.0)], f"after Undo {positions(env, 'Chapter 1')}"
    assert not items_on(back, "Cuts") and len(back["tracks"]) == 2, "Undo left the Cuts track or its item behind"
    return "4.5-6 s parked on Cuts, the rest 6 -> 4.5 s (plays tone_b), the next line 14 -> 12.5 s; one Undo gives back one 12 s item"


@scenario("cut_range", "delete_range", "cut range: gap mode leaves silence and moves nothing; a pad shortens the cut; a range over a neighbour is refused")
def cut_gap(env: Env) -> str:
    fx = chapter(env)
    env.ok("delete_range", fx["item"], "4.5", "6", "gap", "0", until="RANGE_CUT")
    assert positions(env, "Chapter 1") == [(0.0, 4.5), (6.0, 6.0), (14.0, 6.0)], f"gap mode {positions(env, 'Chapter 1')}"
    gap = env.render_mix("gap", 3.0, 8.0)
    assert gap.rms(1.7, 2.8) < 1e-4, "the gap is not silent"  # project 4.7-5.8
    undo_once(env)
    padded = env.ok("delete_range", fx["item"], "4.5", "6", "gap", "0|0.1", until="RANGE_CUT")
    assert padded[4] == "1"
    cut = items_on(env.snapshot(), "Cuts")
    assert [(round(i["position"], 3), round(i["length"], 3)) for i in cut] == [(4.6, 1.3)], f"padded cut {[(i['position'], i['length']) for i in cut]}"
    undo_once(env)
    before = env.snapshot()
    env.lua("ci.add_item(ci.track_by_name('Chapter 1'), ci.audio, 11, 2) return true")  # a neighbour that sits over 11-13 s
    over = env.refused("delete_range", fx["item"], "10", "11.5", "gap", "0")
    assert over[2], over
    env.refused("delete_range", GUID_NONE, "4.5", "6", "gap", "0", tag="ITEM_STALE")
    env.refused("delete_range", fx["item"], "4.5", "6", "sideways", "0")
    env.refused("delete_range", fx["item"], "13", "20", "gap", "0")
    after = env.snapshot()
    assert not items_on(after, "Cuts") and after["undo"] == before["undo"], "refusals changed the project"
    return "gap mode moves nothing and renders silence; pad 0.1 cuts 4.6-5.9; 4 refusals"


@scenario(
    "cut_range",
    "delete_range",
    "cut range: room tone fills the gap from the marked stretch, in the cut's one undo step; with no marked stretch the cut is refused",
)
def cut_room_tone(env: Env) -> str:
    fx = chapter(env)
    missing = env.refused("delete_range", fx["item"], "4.5", "6", "gap", "10|0|1")
    assert "no room tone" in missing[2], missing[2]
    assert positions(env, "Chapter 1")[0] == (0.0, 12.0), "a refused cut changed the item"
    env.ok("create_regions", env.payload("tone.txt", ["8|9|Room tone"]), "", "0", until="REGIONS_CREATED")
    env.ok("delete_range", fx["item"], "4.5", "6", "gap", "10|0|1", until="RANGE_CUT")
    state = env.snapshot()
    pieces = [i for i in items_on(state, "Chapter 1") if 4.4 < i["position"] < 6.0]
    assert pieces and all(p["takes"][0]["file"] == "steps.wav" for p in pieces), (
        f"no room tone pieces in the gap: {[(i['position'], i['length']) for i in items_on(state, 'Chapter 1')]}"
    )
    marked = env.lua(
        "local n = 0 for i = 0, reaper.CountMediaItems(0) - 1 do local ok, v = reaper.GetSetMediaItemInfo_String(reaper.GetMediaItem(0, i), 'P_EXT:narration_utils_room_tone', '', false) if ok and v == '1' then n = n + 1 end end return n"
    )
    assert marked == len(pieces), f"{marked} items carry the room-tone mark, {len(pieces)} pieces lie in the gap"
    gap = env.render_mix("room_tone", 4.0, 7.0)
    assert gap.pitch(0.7, 1.8) == "tone_b" and gap.rms(0.7, 1.8) > 0.05, f"the gap plays {gap.pitch(0.7, 1.8)}, not the room tone (tone_b)"
    assert state["undo"] == CUT_LABEL
    undo_once(env)
    assert positions(env, "Chapter 1")[0] == (0.0, 12.0) and len(items_on(env.snapshot(), "Chapter 1")) == 2, (
        "one Undo did not remove the cut and the room-tone pieces"
    )
    return f"{len(pieces)} room-tone pieces fill 4.5-6 s with the marked stretch (tone_b); one Undo removes cut and fill"


# -- undo the app's own cut --------------------------------------------------------------------------------------------------


@scenario("undo_last", "last_action, undo_last", "undo last: names the cut's label, undoes it in one step, and never undoes a point the narrator made after it")
def undo_last(env: Env) -> str:
    fx = chapter(env)
    other = env.ok("last_action", "cut_range", until="LAST_ACTION")
    assert other[3] == "other", f"with no history last_action answered {other[3]!r}"
    env.ok("delete_range", fx["item"], "4.5", "6", "close", "10", until="RANGE_CUT")
    mine = env.ok("last_action", "cut_range", until="LAST_ACTION")
    assert mine[3] == "this", f"after a cut last_action answered {mine[3]!r}"
    before = env.snapshot()["change_count"]
    undone = env.ok("undo_last", "cut_range", "1", until="UNDONE_LAST")
    assert undone[3:5] == ["1", "1"], f"steps/undone {undone[3:5]}"
    assert positions(env, "Chapter 1") == [(0.0, 12.0), (14.0, 6.0)] and not items_on(env.snapshot(), "Cuts"), "one undo_last did not reverse the cut whole"
    assert env.snapshot()["change_count"] > before, "the change count did not rise after an Undo"
    env.ok("delete_range", fx["item"], "4.5", "6", "close", "10", until="RANGE_CUT")
    env.lua(
        """
        reaper.Undo_BeginBlock2(0)
        reaper.SetMediaItemInfo_Value(reaper.GetTrackMediaItem(ci.track_by_name('Chapter 2'), 0), 'D_POSITION', 1)
        reaper.Undo_EndBlock2(0, 'narrator moved an item', -1)
        return true
        """
    )
    assert env.ok("last_action", "cut_range", until="LAST_ACTION")[3] == "other", "a narrator's later point is reported as the cut's"
    kept = env.ok("undo_last", "cut_range", "3", until="UNDONE_LAST")
    assert kept[4] == "0", f"undone {kept[4]}: the narrator's own point was undone"
    assert positions(env, "Chapter 2") == [(1.0, 6.0)] and positions(env, "Chapter 1")[0] == (0.0, 4.5), "undo_last changed the project past a foreign point"
    env.refused("undo_last", "Narration Utils: delete words", "1")
    env.refused("last_action", "no_such_kind")
    return "this/other answered; one Undo reverses the cut whole; a later narrator point is never undone; a label in place of a kind is refused"


# -- FX on a range -----------------------------------------------------------------------------------------------------------

CHAIN = "Voice/Quiet.RfxChain"


def applied(env: Env, file: str = "tone_a") -> tuple[dict, list[str]]:
    fx = chapter(env, file)
    make_chains(env)
    done = env.ok("apply_fx_range", fx["item"], "4", "6", CHAIN, "10", until="RANGE_FX_APPLIED")
    return fx, done


@scenario(
    "fx_range",
    "apply_fx_range, remove_fx_range",
    "fx range: the chain goes on the middle piece only, is heard (-12 dB), one Undo rejoins the item; removing it joins the pieces",
)
def fx_range(env: Env) -> str:
    fx, done = applied(env)
    middle_guid, chain, undo_points = done[2], done[4], done[5]
    assert chain == CHAIN and undo_points == "1", f"answered {done[2:]}"
    state = env.snapshot()
    assert positions(env, "Chapter 1")[:3] == [(0.0, 4.0), (4.0, 2.0), (6.0, 6.0)], f"pieces {positions(env, 'Chapter 1')}"
    pieces = items_on(state, "Chapter 1")
    assert [len(p["takes"][0]["fx"]) for p in pieces[:3]] == [0, 1, 0], "the chain is not only on the middle piece"
    assert "Volume Adjustment" in pieces[1]["takes"][0]["fx"][0]["name"] and pieces[1]["guid"] == middle_guid
    assert state["undo"] == "Narration Utils: add chain to range", state["undo"]
    mix = env.render_mix("fx_on", 0.0, 12.0)
    plain, heard = mix.tone(1.0, 3.0, 440.0), mix.tone(4.2, 5.8, 440.0)
    near(db(heard / plain), -12.0, 0.4, "the chain's level on the range (dB)")
    near(db(mix.tone(7.0, 11.0, 440.0) / plain), 0.0, 0.3, "the piece after the range (dB)")
    again = env.refused("apply_fx_range", middle_guid, "4.5", "5.5", CHAIN, "10")
    assert again[2], "a piece that already carries a chain was accepted"
    env.refused("apply_fx_range", fx["item"], "1", "2", "Voice/Missing.RfxChain", "10")
    removed = env.ok("remove_fx_range", middle_guid, CHAIN, until="RANGE_FX_REMOVED")
    assert removed[4] == "1", f"undo points {removed[4]}"
    joined = env.snapshot()
    assert positions(env, "Chapter 1")[0] == (0.0, 12.0) and all(not i["takes"][0]["fx"] for i in items_on(joined, "Chapter 1")), (
        "the pieces were not joined or the FX is still on"
    )
    flat = env.render_mix("fx_off", 0.0, 12.0)
    near(db(flat.tone(4.2, 5.8, 440.0) / flat.tone(1.0, 3.0, 440.0)), 0.0, 0.3, "level on the old range after removal (dB)")
    none = env.ok("remove_fx_range", removed[2], CHAIN, until="RANGE_FX_REMOVED")
    assert none[4] == "0", f"removing again opened {none[4]} undo points"
    undone = undo_once(env)
    assert undone == "Narration Utils: remove chain from range", f"undid {undone!r}"
    return f"three pieces, chain on the middle ({db(heard / plain):+.1f} dB), remove joins them into one 12 s item, a second remove changes nothing"


@scenario("fx_range", "apply_fx_range", "fx range: one Undo takes the chain off and rejoins the item")
def fx_range_undo(env: Env) -> str:
    applied(env)
    undone = undo_once(env)
    assert undone == "Narration Utils: add chain to range", f"undid {undone!r}"
    items = items_on(env.snapshot(), "Chapter 1")
    assert [(i["position"], i["length"], len(i["takes"][0]["fx"])) for i in items][:1] == [(0.0, 12.0, 0)], (
        f"after Undo {[(i['position'], i['length']) for i in items]}"
    )
    return "one Undo_DoUndo2 restored a single 12 s item with no FX"


@scenario(
    "fx_range",
    "fx_range_params, fx_range_set_param, fx_range_bypass",
    "fx range: read the chain's settings, set one inside its range, bypass and turn back on, each one undo step, heard in a render",
)
def fx_range_edit(env: Env) -> str:
    _, done = applied(env)
    item, take = done[2], done[3]
    events = env.send("fx_range_params", item, take, CHAIN, until="RANGE_FX_PARAMS")
    params = [e for e in events if e[0] == "RANGE_FX_PARAM"]
    assert params, f"no settings listed: {events}"
    volume = params[0]
    assert volume[2] == "0", f"first setting {volume[2:]}"
    summary = events[-1]
    assert summary[2:5] == [item, take, CHAIN] and summary[-1] == "0", f"summary {summary[2:]} (bypassed last)"
    first_param = int(volume[4])
    low, high = float(volume[7]), float(volume[8])
    value = -6.0
    assert low <= value <= high, f"the setting's range {low}..{high} does not hold {value}"
    set_ = env.ok("fx_range_set_param", item, take, CHAIN, "0", str(first_param), str(value), until="RANGE_FX_PARAM_SET")
    assert set_[2:4] == [item, take] and abs(float(set_[6]) - value) < 1e-6 and set_[8] == "1", f"answered {set_[2:]}"
    mix = env.render_mix("param", 0.0, 12.0)
    near(db(mix.tone(4.2, 5.8, 440.0) / mix.tone(1.0, 3.0, 440.0)), -6.0, 0.4, "the changed setting is heard (dB)")
    assert env.snapshot()["undo"] == "Narration Utils: change effect setting", env.snapshot()["undo"]
    same = env.ok("fx_range_set_param", item, take, CHAIN, "0", str(first_param), str(value), until="RANGE_FX_PARAM_SET")
    assert same[8] == "0", f"setting it again opened {same[8]} undo points"
    env.refused("fx_range_set_param", item, take, CHAIN, "0", str(first_param), "999999")
    env.refused("fx_range_set_param", item, take, CHAIN, "9", "0", "1")
    undo_once(env)
    near(
        db(env.render_mix("param_undone", 0.0, 12.0).tone(4.2, 5.8, 440.0) / mix.tone(1.0, 3.0, 440.0)),
        -12.0,
        0.4,
        "after Undo the chain's own setting is back (dB)",
    )
    off = env.ok("fx_range_bypass", item, take, CHAIN, "1", until="RANGE_FX_BYPASSED")
    assert off[5:7] == ["1", "1"], f"bypassed/undo points {off[5:7]}"
    bypassed = env.render_mix("bypass", 0.0, 12.0)
    near(db(bypassed.tone(4.2, 5.8, 440.0) / bypassed.tone(1.0, 3.0, 440.0)), 0.0, 0.3, "bypassed range plays at the plain level (dB)")
    assert all(not f["enabled"] for f in items_on(env.snapshot(), "Chapter 1")[1]["takes"][0]["fx"]), "the FX is not bypassed"
    again = env.ok("fx_range_bypass", item, take, CHAIN, "1", until="RANGE_FX_BYPASSED")
    assert again[6] == "0", f"bypassing again opened {again[6]} undo points"
    on = env.ok("fx_range_bypass", item, take, CHAIN, "0", until="RANGE_FX_BYPASSED")
    assert on[6] == "1"
    env.refused("fx_range_params", GUID_NONE, "", CHAIN, tag="ITEM_STALE")
    return f"setting {first_param} range {low}..{high} set to {value}; bypass and un-bypass each one point; both heard"


@scenario(
    "fx_range",
    "fx_range_compare, stop_fx_compare",
    "fx range: compare plays the piece with the chain on then bypassed and puts the FX, cursor and transport back; REAPER writes its own FX bypass toggle points",
    needs_audio=True,
)
def fx_range_compare(env: Env) -> str:
    _, done = applied(env)
    item, take = done[2], done[3]
    env.lua("reaper.SetEditCurPos(9, false, false) return true")
    started = env.ok("fx_range_compare", item, take, CHAIN, until="RANGE_FX_COMPARE")
    near(float(started[5]), 4.0, 0.01, "compare starts at the piece")
    near(float(started[6]), 6.0, 0.01, "compare ends at the piece")
    seen = {"on": False, "off": False}

    def sample():
        state = env.lua(
            """
            local item = ci.item(args[1])
            local take = ci.take(args[2])
            return { playing = reaper.GetPlayState() & 1, enabled = reaper.TakeFX_GetEnabled(take, 0), position = reaper.GetPlayPosition2() }
            """,
            item,
            take,
        )
        if state["playing"] == 1:
            seen["on" if state["enabled"] else "off"] = True
        return state["playing"] == 0 and seen["on"] and seen["off"]

    env.wait_for(sample, timeout=40.0, what="the compare to play both passes and stop")
    state = env.snapshot()
    near(state["cursor"], 9.0, 0.01, "the edit cursor after the compare")
    assert state["play_state"] == 0, f"play state {state['play_state']}"
    # TakeFX_SetEnabled makes REAPER add an "FX bypass toggle" point per change (7.82): the app's own history is not touched, but the top of
    # it is no longer the chain's apply, so undo_last answers that nothing of the app's is on top.
    assert state["undo"].startswith("FX bypass toggle"), f"top of the undo history after a compare: {state['undo']!r}"
    assert env.ok("last_action", "cut_range", until="LAST_ACTION")[3] == "other"
    assert items_on(state, "Chapter 1")[1]["takes"][0]["fx"][0]["enabled"], "the chain was left bypassed"
    stop = env.ok("stop_fx_compare", until="RANGE_FX_COMPARE_STOPPED")
    assert stop[2] == "0", f"stopped {stop[2]}"
    return "pass 1 chain on and pass 2 bypassed were both seen playing; FX, cursor 9 s and the stopped transport put back; REAPER's own 'FX bypass toggle' points are on top of the history"


# -- lower stretches, repair clicks ------------------------------------------------------------------------------------------


@scenario(
    "range_gain", "reduce_range_gain", "range gain: lowers two stretches by 9 dB on the take's volume envelope and nothing else, one Undo removes the points"
)
def range_gain(env: Env) -> str:
    fx = chapter(env, "click")
    reduced = env.ok("reduce_range_gain", fx["item"], fx["take"], "9", "2:3,6:7", until="RANGE_GAIN_REDUCED")
    assert reduced[2:5] == [fx["item"], fx["take"], "2"] and float(reduced[5]) == 9.0 and reduced[6] == "1", f"answered {reduced[2:]}"
    state = env.snapshot()
    item = items_on(state, "Chapter 1")[0]
    points = [p for p in item["takes"][0]["envelope_points"] if p["time"] > 0]  # REAPER adds its own point at 0 s when it makes the envelope
    assert len(points) == 8, f"{len(points)} envelope points, expected 4 per stretch: {item['takes'][0]['envelope_points']}"
    assert (item["position"], item["length"]) == (0.0, 12.0) and item["takes"][0]["file"] == "click.wav", "the item or its source changed"
    assert state["undo"] == "Narration Utils: lower stretches", state["undo"]
    mix = env.render_mix("lowered", 0.0, 12.0)
    base = mix.tone(8.0, 11.0, 440.0)
    for first, last in ((2.1, 2.9), (6.1, 6.9)):
        near(db(mix.tone(first, last, 440.0) / base), -9.0, 0.5, f"stretch {first}-{last} (dB)")
    near(db(mix.tone(3.5, 4.5, 440.0) / base), 0.0, 0.3, "between the stretches (dB)")
    undone = undo_once(env)
    assert undone == "Narration Utils: lower stretches", f"undid {undone!r}"
    after = items_on(env.snapshot(), "Chapter 1")[0]["takes"][0]
    assert not [p for p in after["envelope_points"] if p["time"] > 0], f"the points are still there after Undo: {after['envelope_points']}"
    flat = env.render_mix("lowered_undone", 0.0, 12.0)
    near(db(flat.tone(2.1, 2.9, 440.0) / flat.tone(8.0, 11.0, 440.0)), 0.0, 0.3, "after Undo (dB)")
    env.refused("reduce_range_gain", fx["item"], fx["take"], "9", "2:99", tag="ITEM_STALE")
    env.refused("reduce_range_gain", GUID_NONE, fx["take"], "9", "2:3", tag="ITEM_STALE")
    env.refused("reduce_range_gain", fx["item"], fx["take"], "99", "2:3")
    return "two stretches heard -9 dB, between them 0 dB; one Undo gives back a flat take"


@scenario("click_repair", "repair_click", "click repair: dips the click's 2 ms by 30 dB between ramps, leaves the tone around it, one Undo removes the dip")
def click_repair(env: Env) -> str:
    fx = chapter(env, "click")
    before = env.render_mix("click_before", 0.0, 12.0)
    assert before.peak(5.0005, 5.0015) > 0.5, "the fixture's click is not in the render"
    repaired = env.ok("repair_click", fx["item"], fx["take"], "5.000:5.002", until="CLICKS_REPAIRED")
    assert repaired[2:5] == [fx["item"], fx["take"], "1"] and repaired[5] == "1", f"answered {repaired[2:]}"
    state = env.snapshot()
    points = [p for p in items_on(state, "Chapter 1")[0]["takes"][0]["envelope_points"] if p["time"] > 0]  # REAPER's own point at 0 s is not ours
    assert len(points) == 4, f"expected 4 envelope points for one click: {items_on(state, 'Chapter 1')[0]['takes'][0]['envelope_points']}"
    assert state["undo"] == "Narration Utils: repair clicks", state["undo"]
    after = env.render_mix("click_after", 0.0, 12.0)
    assert after.peak(5.0005, 5.0015) < 0.05, f"the click still peaks at {after.peak(5.0005, 5.0015):.3f} (was {before.peak(5.0005, 5.0015):.3f})"
    near(db(after.rms(6.0, 9.0) / before.rms(6.0, 9.0)), 0.0, 0.2, "the tone away from the click (dB)")
    near(db(after.rms(4.5, 4.9) / before.rms(4.5, 4.9)), 0.0, 0.2, "the tone just before the click (dB)")
    undone = undo_once(env)
    assert undone == "Narration Utils: repair clicks", f"undid {undone!r}"
    assert render_peak(env) > 0.5, "after Undo the click is not back"
    env.refused("repair_click", fx["item"], fx["take"], "5.0:5.5")
    env.refused("repair_click", fx["item"], fx["take"], "50:50.001", tag="ITEM_STALE")
    return f"click peak {before.peak(5.0005, 5.0015):.2f} -> {after.peak(5.0005, 5.0015):.3f}; tone around it unchanged; Undo brings it back"


def render_peak(env: Env) -> float:
    return env.render_mix("click_undone", 0.0, 12.0).peak(5.0005, 5.0015)
