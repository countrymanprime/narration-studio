"""Real-REAPER scenarios, group 1: regions, FX chains, item gain, render with FX, track state, track select and follow position.

Each scenario arranges a scratch project, sends the product's own bridge commands and asserts on what REAPER holds afterwards
(scenario.py). Rows and what a pass moves: docs/operations/reaper-verification-pass.md, "Real-REAPER CI run".
"""

from __future__ import annotations

import secrets
from pathlib import Path

from drive import BRAND, undo_label
from scenario import Env, db, items_on, near, only, scenario

GUID_NONE = "{00000000-0000-4000-8000-000000000000}"


def two_chapters(env: Env) -> dict:
    """Chapter 1 with three items (0-10, 12-22, 24-34 s of tone_a) and Chapter 2 with one (tone_b), saved and reopened."""
    return env.lua(
        """
        local a, b = args[1], args[2]
        local one, two = ci.add_track('Chapter 1'), ci.add_track('Chapter 2')
        ci.add_item(one, a, 0, 10)
        ci.add_item(one, a, 12, 10)
        ci.add_item(one, a, 24, 10)
        ci.add_item(two, b, 0, 10)
        ci.save_and_reload(ci.rpp)
        local function at(track, index)
          return ci.item_guid(reaper.GetTrackMediaItem(ci.track_by_name(track), index))
        end
        return {
          ch1 = reaper.GetTrackGUID(ci.track_by_name('Chapter 1')),
          ch2 = reaper.GetTrackGUID(ci.track_by_name('Chapter 2')),
          first = at('Chapter 1', 0), second = at('Chapter 1', 1), third = at('Chapter 1', 2), other = at('Chapter 2', 0),
        }
        """,
        env.media_path("tone_a"),
        env.media_path("tone_b"),
    )


def undo_once(env: Env) -> str:
    """One Undo in REAPER (Edit > Undo); answers the label it undid."""
    done = env.lua("local label = reaper.Undo_CanUndo2(0) or '' local ok = reaper.Undo_DoUndo2(0) return { label, ok }")
    assert done[1] == 1, f"Undo_DoUndo2 answered {done[1]}"
    return done[0]


# -- regions -----------------------------------------------------------------------------------------------------------------


@scenario("regions", "create_regions", "regions: bounds, titles, colour, one undo step, kept across save and reload")
def regions_create(env: Env) -> str:
    payload = env.payload("regions.txt", ["0|20|Opening Credits", "20|40|Chapter 1", "40|60|Chapter 2 | with a pipe"])
    tracks_before = env.witness(markers=False)
    added = env.ok("create_regions", payload, "ff8800", "0", until="REGIONS_CREATED")
    assert env.witness(markers=False) == tracks_before, "create_regions changed a track (row A10)"
    assert added[2:9] == ["3", "0", "0", "0", "0", "0"], f"created/existing/invalid/updated/ambiguous/failed {added[2:9]}"
    state = env.snapshot()
    regions = [m for m in state["markers"] if m["region"]]
    assert [(r["start"], r["finish"], r["name"]) for r in regions] == [
        (0.0, 20.0, "Opening Credits"),
        (20.0, 40.0, "Chapter 1"),
        (40.0, 60.0, "Chapter 2 | with a pipe"),
    ], regions
    assert sorted(r["number"] for r in regions) == [1, 2, 3], f"region numbers {[r['number'] for r in regions]}"
    assert all(r["color"] & 0xFFFFFF == regions[0]["color"] & 0xFFFFFF != 0 for r in regions), f"colours {[r['color'] for r in regions]}"
    assert state["undo"] == undo_label("create regions"), state["undo"]
    again = env.ok("create_regions", payload, "ff8800", "0", until="REGIONS_CREATED")
    assert again[2:5] == ["0", "3", "0"], f"second send {again[2:5]}"
    assert env.snapshot()["undo"] == undo_label("create regions")
    env.lua("ci.save_and_reload(ci.rpp) return true")
    reloaded = [m for m in env.snapshot()["markers"] if m["region"]]
    assert [(r["start"], r["finish"], r["name"], r["color"]) for r in reloaded] == [(r["start"], r["finish"], r["name"], r["color"]) for r in regions], (
        "regions changed across save and reload"
    )
    return f"3 regions, colour {regions[0]['color'] & 0xFFFFFF:06x}, numbers 1-3, label '{state['undo']}'"


@scenario("regions", "create_regions", "regions: the one-step Undo removes every region the send added")
def regions_undo(env: Env) -> str:
    payload = env.payload("regions.txt", ["0|20|A", "20|40|B", "40|60|C"])
    env.ok("create_regions", payload, "", "0", until="REGIONS_CREATED")
    assert len([m for m in env.snapshot()["markers"] if m["region"]]) == 3
    undo_once(env)
    left = [m for m in env.snapshot()["markers"] if m["region"]]
    assert not left, f"{len(left)} regions left after one Undo"
    return "one Undo_DoUndo2 removed all 3"


@scenario("regions", "create_regions", "regions: update moves a region and keeps its number and colour; a doubled title is left alone")
def regions_update(env: Env) -> str:
    env.ok("create_regions", env.payload("a.txt", ["0|20|Chapter 1", "20|40|Dup", "40|60|Dup"]), "336699", "0", until="REGIONS_CREATED")
    before = {m["name"] + str(i): m for i, m in enumerate(m for m in env.snapshot()["markers"] if m["region"])}
    chapter = only([m for m in before.values() if m["name"] == "Chapter 1"], "Chapter 1 region")
    moved = env.ok("create_regions", env.payload("b.txt", ["0|25|Chapter 1", "30|50|Dup"]), "", "1", until="REGIONS_CREATED")
    assert moved[2:9] == ["0", "0", "0", "1", "1", "0"], f"created/existing/invalid/updated/ambiguous/failed {moved[2:9]}"
    after = [m for m in env.snapshot()["markers"] if m["region"]]
    now = only([m for m in after if m["name"] == "Chapter 1"], "Chapter 1 region")
    assert (now["start"], now["finish"]) == (0.0, 25.0), f"bounds {now['start']}-{now['finish']}"
    assert now["number"] == chapter["number"], f"number {chapter['number']} -> {now['number']}"
    assert now["color"] == chapter["color"], f"colour {chapter['color']:#x} -> {now['color']:#x}"
    dups = sorted((m["start"], m["finish"]) for m in after if m["name"] == "Dup")
    assert dups == [(20.0, 40.0), (40.0, 60.0)], f"ambiguous title was changed: {dups}"
    return f"region {now['number']} moved to 0-25 s, colour kept ({now['color'] & 0xFFFFFF:06x})"


# -- FX chains ---------------------------------------------------------------------------------------------------------------


def make_chains(env: Env) -> None:
    env.lua(
        """
        ci.make_chain('Voice/Test EQ.RfxChain', 'ReaEQ')
        ci.make_chain('Voice/Deep/Other EQ.RfxChain', 'ReaEQ')
        ci.make_chain('Voice/Quiet.RfxChain', 'JS: Volume Adjustment', function(track, index) reaper.TrackFX_SetParam(track, index, 0, -12) end)
        local sep = package.config:sub(1, 1)
        local handle = assert(io.open(reaper.GetResourcePath() .. sep .. 'FXChains' .. sep .. 'Voice' .. sep .. 'notes.txt', 'wb'))
        handle:write('not a chain\\n')
        handle:close()
        return true
        """
    )


@scenario("fx_chains", "list_fx_chains, apply_fx_chain", "fx chains: listed with forward slashes, applied to a track and the master, one undo step each")
def fx_chains(env: Env) -> str:
    fx = two_chapters(env)
    make_chains(env)
    events = env.send("list_fx_chains", until="FX_CHAINS_LISTED")
    listed = [e[2] for e in events if e[0] == "FX_CHAIN"]
    assert listed == ["Voice/Deep/Other EQ.RfxChain", "Voice/Quiet.RfxChain", "Voice/Test EQ.RfxChain"], listed
    assert events[-1][2:4] == ["3", "0"], f"count/truncated {events[-1][2:4]}"
    others = env.witness("Chapter 1")
    applied = env.ok("apply_fx_chain", fx["ch1"], "Voice/Test EQ.RfxChain", until="FX_CHAIN_APPLIED")
    assert applied[2] == "Voice/Test EQ.RfxChain" and applied[4] == "1", f"applied {applied[2:]}"
    assert env.witness("Chapter 1") == others, "apply_fx_chain changed the master, another track or a marker (row A10)"
    state = env.snapshot()
    chapter = next(t for t in state["tracks"] if t["name"] == "Chapter 1")
    assert [f for f in chapter["fx"] if "ReaEQ" in f], f"track FX {chapter['fx']}"
    assert state["undo"] == undo_label("apply FX chain Voice/Test EQ.RfxChain to Chapter 1"), state["undo"]
    undo_once(env)
    assert next(t for t in env.snapshot()["tracks"] if t["name"] == "Chapter 1")["fx"] == [], "FX still on the track after Undo"
    on_master = env.ok("apply_fx_chain", "master", "Voice/Test EQ.RfxChain", until="FX_CHAIN_APPLIED")
    assert on_master[3] == "master"
    master_fx = env.lua("return reaper.TrackFX_GetCount(reaper.GetMasterTrack(0))")
    assert master_fx == 1, f"master FX count {master_fx}"
    assert env.snapshot()["undo"] == undo_label("apply FX chain Voice/Test EQ.RfxChain to the master track")
    undo_once(env)
    assert env.lua("return reaper.TrackFX_GetCount(reaper.GetMasterTrack(0))") == 0
    return "3 chains listed (the .txt skipped), ReaEQ on Chapter 1 then on the master, each undone in one step"


@scenario("fx_chains", "apply_fx_chain", "fx chains: an unlisted name, a path out of FXChains and a stale track change nothing")
def fx_chains_refusals(env: Env) -> str:
    fx = two_chapters(env)
    make_chains(env)
    before = env.snapshot()
    for name in ("Voice/Missing.RfxChain", "../reaper.ini", "Voice/../Voice/Test EQ.RfxChain", "C:/Windows/x.RfxChain", "Voice\\Test EQ.RfxChain"):
        refusal = env.refused("apply_fx_chain", fx["ch1"], name)
        assert "not in the FXChains folder" in refusal[2], f"{name!r}: {refusal[2]!r}"
    env.refused("apply_fx_chain", GUID_NONE, "Voice/Test EQ.RfxChain", tag="TRACK_STALE")
    after = env.snapshot()
    assert before["tracks"] == after["tracks"] and before["undo"] == after["undo"], "a refused apply changed the project"
    return "5 names refused, 1 stale track, project unchanged"


# -- item gain ---------------------------------------------------------------------------------------------------------------


@scenario("item_gain", "apply_item_gain", "item gain: -6 dB then +6 dB on D_VOL, one undo step, stale item reported, level proven in a render")
def item_gain(env: Env) -> str:
    fx = two_chapters(env)
    base = env.render_mix("gain_before", 0.0, 3.0).tone(0.2, 2.8, 440.0)  # tone_a's pitch: Chapter 2 plays tone_b over it
    payload = env.payload("gain.txt", [f"{fx['first']}|-6|f1"])
    others = env.witness("Chapter 1")
    events = env.send("apply_item_gain", payload, until="GAIN_APPLIED")
    assert env.witness("Chapter 1") == others, "apply_item_gain changed another track, the master or a marker (row A10)"
    item = next(e for e in events if e[0] == "GAIN_ITEM")
    near(float(item[3]), 1.0, 1e-6, "volume before")
    near(float(item[4]), 0.501187, 1e-5, "volume after")
    assert events[-1][2] == "1"
    state = env.snapshot()
    near(items_on(state, "Chapter 1")[0]["volume"], 0.501187, 1e-5, "D_VOL")
    assert state["undo"] == undo_label("apply level-match gain"), state["undo"]
    quieter = env.render_mix("gain_after", 0.0, 3.0).tone(0.2, 2.8, 440.0)
    near(db(quieter / base), -6.0, 0.15, "rendered level change (dB)")
    env.ok("apply_item_gain", env.payload("up.txt", [f"{fx['first']}|6|f2"]), until="GAIN_APPLIED")
    near(items_on(env.snapshot(), "Chapter 1")[0]["volume"], 1.0, 1e-4, "D_VOL after +6 dB")
    undo_once(env)
    near(items_on(env.snapshot(), "Chapter 1")[0]["volume"], 0.501187, 1e-5, "D_VOL after one Undo")
    stale = env.send("apply_item_gain", env.payload("stale.txt", ["{00000000-0000-4000-8000-000000000001}|-3|f3"]), until="GAIN_APPLIED")
    assert any(e[0] == "GAIN_STALE" for e in stale) and stale[-1][2] == "0", f"stale item answered {stale}"
    return f"D_VOL 1.0 -> 0.501187; render {db(quieter / base):+.2f} dB; undo restores"


# -- render with FX ----------------------------------------------------------------------------------------------------------


@scenario(
    "render_with_fx",
    "master_chain_read, render_with_fx",
    "render with FX: the chain on the master is listed, heard in the rendered file, and each approval works once",
)
def render_with_fx(env: Env) -> str:
    fx = two_chapters(env)
    make_chains(env)
    env.ok("create_regions", env.payload("r.txt", ["0|4|Region A", "12|16|Region B"]), "", "0", until="REGIONS_CREATED")
    env.ok("apply_fx_chain", "master", "Voice/Quiet.RfxChain", until="FX_CHAIN_APPLIED")
    listed = env.send("master_chain_read", until="MASTER_CHAIN_READ")
    rows = [e for e in listed if e[0] == "MASTER_CHAIN_FX"]
    assert len(rows) == 1 and rows[0][2] == "master" and "Volume Adjustment" in rows[0][4] and rows[0][5] == "1", f"chain rows {rows}"
    assert listed[-1][2:4] == ["1", "0"]
    project = Path(env.fixture["rpp"]).parent
    folder = project / BRAND["identity"]["projectFolder"] / "mastering" / "run1"
    folder.mkdir(parents=True)
    approval = secrets.token_hex(16)
    done = env.send("render_with_fx", approval, str(folder), "Region A\nRegion B", until={"FX_RENDERED"}, timeout=180)
    assert done[-1][0] == "FX_RENDERED" and done[-1][3] == "2", f"render answered {done[-1]}"
    files = [Path(e[3]) for e in done if e[0] == "FX_RENDER_FILE"]
    assert [f.name for f in files] == ["fx-01.wav", "fx-02.wav"] and all(f.exists() for f in files), files
    from scenario import Wav

    with_fx = Wav(files[0])
    env.ok("apply_fx_chain", fx["ch1"], "Voice/Test EQ.RfxChain", until="FX_CHAIN_APPLIED")  # a second chain must not break the first listing
    near(with_fx.seconds, 4.0, 0.05, "rendered length")
    env.lua("reaper.TrackFX_Delete(reaper.GetMasterTrack(0), 0) return true")
    plain = env.render_mix("plain", 0.0, 4.0)
    near(db(with_fx.rms(0.5, 3.5) / plain.rms(0.5, 3.5)), -12.0, 0.3, "master chain's effect in the rendered file (dB)")
    reuse = env.refused("render_with_fx", approval, str(folder), "Region A")
    assert "already used" in reuse[2], reuse[2]
    return f"2 regions rendered with the master's -12 dB chain: {db(with_fx.rms(0.5, 3.5) / plain.rms(0.5, 3.5)):+.2f} dB vs the plain mix"


@scenario("render_with_fx", "render_with_fx", "render with FX: a folder outside the app's mastering folder, a non-empty one and an unknown region are refused")
def render_with_fx_refusals(env: Env) -> str:
    two_chapters(env)
    env.ok("create_regions", env.payload("r.txt", ["0|4|Region A"]), "", "0", until="REGIONS_CREATED")
    project = Path(env.fixture["rpp"]).parent
    outside = project / "somewhere"
    outside.mkdir(exist_ok=True)
    refusals = []
    refusals.append(env.refused("render_with_fx", secrets.token_hex(16), str(outside), "Region A")[2])
    assert "not one the app made" in refusals[-1], refusals[-1]
    refusals.append(env.refused("render_with_fx", "nothex", str(outside), "Region A")[2])
    assert "approval" in refusals[-1], refusals[-1]
    full = project / BRAND["identity"]["projectFolder"] / "mastering" / "full"
    full.mkdir(parents=True, exist_ok=True)
    (full / "keep.wav").write_bytes(b"x")
    refusals.append(env.refused("render_with_fx", secrets.token_hex(16), str(full), "Region A")[2])
    assert "not empty" in refusals[-1], refusals[-1]
    fresh = project / BRAND["identity"]["projectFolder"] / "mastering" / "fresh"
    fresh.mkdir(exist_ok=True)
    refusals.append(env.refused("render_with_fx", secrets.token_hex(16), str(fresh), "No Such Region")[2])
    assert "no region named" in refusals[-1], refusals[-1]
    assert not list(fresh.iterdir()) and (full / "keep.wav").read_bytes() == b"x", "a refused render touched files"
    return "4 refusals, no file written"


# -- track state, track select, follow position ------------------------------------------------------------------------------


@scenario("track_state", "chapter_track_state", "track state: the stopped transport, the saved path, the track's items and take sources, the change count")
def track_state(env: Env) -> str:
    fx = two_chapters(env)
    events = env.send("chapter_track_state", fx["ch1"], until={"TRACK_STATE_END", "TRACK_STALE"})
    state = next(e for e in events if e[0] == "TRACK_STATE")
    assert state[2] == fx["ch1"] and state[3] == "0", f"guid/playState {state[2:4]}"
    assert state[6].replace("\\", "/").lower() == env.fixture["rpp"].replace("\\", "/").lower(), f"saved path {state[6]}"
    assert state[7] == "0", f"unsaved flag {state[7]}"
    items = [e for e in events if e[0] == "TRACK_ITEM"]
    assert [round(float(e[4])) for e in items] == [0, 12, 24] and all(e[8].endswith("tone_a.wav") for e in items), f"items {items}"
    assert events[-1][2:4] == ["3", "3"], f"listed/total {events[-1][2:4]}"
    count = int(state[8])
    env.lua(  # a narrator's edit: REAPER's change count moves with its undo points
        """
        reaper.Undo_BeginBlock2(0)
        reaper.SetMediaItemInfo_Value(reaper.GetMediaItem(0, 0), 'D_POSITION', 1)
        reaper.Undo_EndBlock2(0, 'narrator moved an item', -1)
        return true
        """
    )
    later = env.send("chapter_track_state", fx["ch1"], until={"TRACK_STATE_END"})
    assert int(next(e for e in later if e[0] == "TRACK_STATE")[8]) > count, "the change count did not rise after an edit"
    env.lua("reaper.Main_SaveProject(0, false) return true")
    saved = env.send("chapter_track_state", fx["ch1"], until={"TRACK_STATE_END"})
    assert next(e for e in saved if e[0] == "TRACK_STATE")[7] == "0"
    return f"{len(items)} items, change count {count} -> {next(e for e in later if e[0] == 'TRACK_STATE')[8]}"


@scenario(
    "track_state",
    "chapter_track_state",
    "track state: REAPER's input and output device names and the track's input channel names, as the Booth shows them (#2251)",
    needs_audio=True,
)
def track_state_devices(env: Env) -> str:
    fx = two_chapters(env)
    expected = env.lua(
        """
        local track = ci.track_by_name('Chapter 1')
        local function set(value) reaper.SetMediaTrackInfo_Value(track, 'I_RECINPUT', value) end
        local _, device_in = reaper.GetAudioDeviceInfo('IDENT_IN', '')
        local _, device_out = reaper.GetAudioDeviceInfo('IDENT_OUT', '')
        local names = {}
        for index = 0, 3 do names[#names + 1] = tostring(reaper.GetInputChannelName(index)) end
        set(0)
        return { input = device_in, output = device_out, names = names }
        """
    )
    env.notes.append(f"REAPER answered IDENT_IN {expected['input']!r}, IDENT_OUT {expected['output']!r}, GetInputChannelName(0..3) {expected['names']!r}")
    mono = next(e for e in env.send("chapter_track_state", fx["ch1"], until={"TRACK_STATE_END"}) if e[0] == "TRACK_STATE")
    assert mono[11] == "0", f"recInput {mono[11]}"
    assert mono[12] == expected["input"] and mono[12] != "", f"inputDevice {mono[12]!r} vs {expected['input']!r}"
    assert mono[13] == expected["output"] and mono[13] != "", f"outputDevice {mono[13]!r} vs {expected['output']!r}"
    assert mono[14] == expected["names"][0] and mono[14] != "", f"recInputName {mono[14]!r} vs {expected['names'][0]!r}"
    env.lua("reaper.SetMediaTrackInfo_Value(ci.track_by_name('Chapter 1'), 'I_RECINPUT', 1024) return true")
    pair = next(e for e in env.send("chapter_track_state", fx["ch1"], until={"TRACK_STATE_END"}) if e[0] == "TRACK_STATE")
    assert pair[14] == f"{expected['names'][0]} / {expected['names'][1]}", f"stereo recInputName {pair[14]!r}"
    env.lua("reaper.SetMediaTrackInfo_Value(ci.track_by_name('Chapter 1'), 'I_RECINPUT', 3) return true")
    past = next(e for e in env.send("chapter_track_state", fx["ch1"], until={"TRACK_STATE_END"}) if e[0] == "TRACK_STATE")
    env.lua("reaper.SetMediaTrackInfo_Value(ci.track_by_name('Chapter 1'), 'I_RECINPUT', -1) return true")
    none = next(e for e in env.send("chapter_track_state", fx["ch1"], until={"TRACK_STATE_END"}) if e[0] == "TRACK_STATE")
    assert none[14] == "", f"no input named {none[14]!r}"
    return f"in {mono[12]!r}, out {mono[13]!r}, mono {mono[14]!r}, pair {pair[14]!r}, channel 3 of 2 {past[14]!r}"


@scenario("track_state", "chapter_track_state, project_state", "track state: a project that was never saved reports no path and unsaved")
def track_state_unsaved(env: Env) -> str:
    env.lua("reaper.Main_OnCommand(40859, 0) return true")  # File: New project tab: a project that was never saved
    try:
        state = next(e for e in env.send("chapter_track_state", "", until={"TRACK_STATE_END"}) if e[0] == "TRACK_STATE")
        assert state[6] == "", f"an unsaved project reported the path {state[6]!r}"
        assert state[7] == "1", f"unsaved flag {state[7]}"
        status = env.ok("project_state", until="PROJECT_STATE")
        assert status[3] == "", f"project_state path {status[3]!r}"
    finally:
        env.lua("reaper.Main_OnCommand(40860, 0) return true")  # close that tab again
    assert env.ok("project_state", until="PROJECT_STATE")[3] != "", "the scratch project is not the current tab again"


@scenario("track_select", "select_track", "track select: selects only the named track, no undo point, a stale GUID selects nothing")
def track_select(env: Env) -> str:
    fx = two_chapters(env)
    env.lua("for _, name in ipairs({'Chapter 1', 'Chapter 2'}) do reaper.SetMediaTrackInfo_Value(ci.track_by_name(name), 'I_SELECTED', 1) end return true")
    undo_before = env.snapshot()["undo"]
    chosen = env.ok("select_track", fx["ch2"], until="TRACK_SELECTED")
    assert chosen[2] == fx["ch2"]
    state = env.snapshot()
    assert [t["name"] for t in state["tracks"] if t["selected"]] == ["Chapter 2"], "selection after select_track"
    assert state["undo"] == undo_before, "select_track opened an undo point"
    env.refused("select_track", GUID_NONE, tag="TRACK_STALE")
    assert [t["name"] for t in env.snapshot()["tracks"] if t["selected"]] == ["Chapter 2"], "a stale GUID changed the selection"
    return "only Chapter 2 selected, undo history unchanged"


@scenario(
    "follow_position",
    "read_place, go_to",
    "follow position: read_place names the one selected track and the cursor; go_to selects and moves the cursor, never starts playback",
)
def follow_position(env: Env) -> str:
    fx = two_chapters(env)
    env.lua("reaper.SetEditCurPos(7.5, false, false) return true")
    env.ok("select_track", fx["ch1"], until="TRACK_SELECTED")
    place = env.ok("read_place", until="PLACE")
    assert place[2] == fx["ch1"] and place[3] == "1" and abs(float(place[4]) - 7.5) < 1e-6, f"place {place[2:]}"
    env.lua("reaper.SetMediaTrackInfo_Value(ci.track_by_name('Chapter 2'), 'I_SELECTED', 1) return true")
    both = env.ok("read_place", until="PLACE")
    assert both[2] == "" and both[3] == "2", f"two selected tracks answered {both[2:]}"
    end = env.ok("go_to", fx["ch1"], "end", "", until="PLACE_SET")
    near(float(end[3]), 34.0, 0.01, "end of Chapter 1's last item")
    at = env.ok("go_to", fx["ch2"], "at", "3.25", until="PLACE_SET")
    near(float(at[3]), 3.25, 1e-6, "go_to at")
    state = env.snapshot()
    assert [t["name"] for t in state["tracks"] if t["selected"]] == ["Chapter 2"], "go_to selection"
    near(state["cursor"], 3.25, 1e-6, "edit cursor")
    assert state["play_state"] == 0, f"go_to started the transport ({state['play_state']})"
    env.refused("go_to", GUID_NONE, "end", "", tag="TRACK_STALE")
    env.refused("go_to", fx["ch1"], "at", "-1")
    env.refused("go_to", fx["ch1"], "somewhere", "")
    return "read_place/go_to move the cursor and the selection only; 3 refusals"
