"""Real-REAPER scenarios, group 6: play_range and play_from play only the chapter's linked track and put the narrator's tracks back.

The Editing page names the chapter's track; the bridge selects that track and solos it in place, and restores the narrator's selection, solos and
mutes when the play ends (docs/design/play-a-range-in-the-daw.md, decision 5). A scenario arranges tracks the way a narrator's project is (another
chapter selected, a track soloed or muted by hand, a folder parent with audio of its own), plays through the product's own command and reads REAPER:
each track's selection, solo and mute while it plays and after, and each track's post-fader meter (`Track_GetPeakInfo`) for what is audible. The JACK
dummy device has no hardware, so what the meters read is REAPER's own mix. What stays with the owner is how it sounds on a real output.
"""

from __future__ import annotations

import time

from scenario import Env, scenario
from scenarios_transport import play_state, stop_by_hand

CHAPTERS = ("Chapter 1", "Chapter 2", "Pickups")


def arrange(env: Env) -> dict:
    """Chapter 1 (tone_a) and Chapter 2 (tone_b) both hold audio at 0-8 s, the Pickups track is empty; saved. Answers the GUIDs."""
    return env.lua(
        """
        local one = ci.add_track('Chapter 1')
        local two = ci.add_track('Chapter 2')
        ci.add_track('Pickups')
        ci.add_item(one, args[1], 0, 8)
        ci.add_item(two, args[2], 0, 8)
        ci.save_and_reload(ci.rpp)
        return {
          ch1 = reaper.GetTrackGUID(ci.track_by_name('Chapter 1')),
          ch2 = reaper.GetTrackGUID(ci.track_by_name('Chapter 2')),
          pickups = reaper.GetTrackGUID(ci.track_by_name('Pickups')),
        }
        """,
        env.media_path("tone_a"),
        env.media_path("tone_b"),
    )


def tracks_now(env: Env) -> dict[str, dict]:
    """Every track's selection, solo (0/1/2...), mute and post-fader peak, by name."""
    return env.lua(
        """
        local out = {}
        for i = 0, reaper.CountTracks(0) - 1 do
          local t = reaper.GetTrack(0, i)
          local _, name = reaper.GetTrackName(t)
          out[name] = {
            selected = reaper.GetMediaTrackInfo_Value(t, 'I_SELECTED') ~= 0,
            solo = reaper.GetMediaTrackInfo_Value(t, 'I_SOLO'),
            muted = reaper.GetMediaTrackInfo_Value(t, 'B_MUTE') ~= 0,
            peak = math.max(reaper.Track_GetPeakInfo(t, 0), reaper.Track_GetPeakInfo(t, 1)),
          }
        end
        return out
        """
    )


def narrator_state(env: Env) -> dict[str, tuple]:
    return {name: (t["selected"], t["solo"], t["muted"]) for name, t in tracks_now(env).items()}


def hand_state(env: Env, select: str | None, soloed: tuple[str, ...] = (), muted: tuple[str, ...] = ()) -> None:
    env.lua(
        """
        local select, soloed, muted = args[1], args[2], args[3]
        for i = 0, reaper.CountTracks(0) - 1 do
          local t = reaper.GetTrack(0, i)
          local _, name = reaper.GetTrackName(t)
          reaper.SetTrackSelected(t, name == select)
          reaper.SetMediaTrackInfo_Value(t, 'I_SOLO', soloed[name] and 1 or 0)
          reaper.SetMediaTrackInfo_Value(t, 'B_MUTE', muted[name] and 1 or 0)
        end
        return true
        """,
        select or "",
        {name: True for name in soloed},
        {name: True for name in muted},
    )


def play_range(env: Env, start: float, end: float, guid: str) -> None:
    env.ok("play_range", str(start), str(end), guid, until="RANGE_PLAYING")


def mix_tones(env: Env, name: str) -> tuple[float, float]:
    """Renders 1-2 s of the master mix as the project is now (solos and mutes as the bridge left them) and answers the 440 Hz (Chapter 1's tone_a)
    and 660 Hz (tone_b) amplitudes in it. A track's meter is not used for this: REAPER keeps metering a track a solo has silenced."""
    mix = env.render_mix(name, 1.0, 2.0)
    return mix.tone(0.0, 1.0, 440.0), mix.tone(0.0, 1.0, 660.0)


def heard(env: Env, name: str, *, timeout: float = 6.0) -> dict[str, dict]:
    """The tracks while REAPER plays, once `name`'s meter reads signal."""
    return env.wait_for(lambda: (t := tracks_now(env)) and t[name]["peak"] > 0.05 and t, timeout=timeout, what=f"{name}'s meter to read the tone")


@scenario(
    "transport_sync",
    "play_range",
    "play_range with a track: that track is selected and soloed and alone in the rendered mix; the narrator's selection, solos and mutes come back when REAPER stops itself at the end",
    needs_audio=True,
)
def play_range_isolates(env: Env) -> str:
    fx = arrange(env)
    hand_state(env, "Chapter 2", soloed=("Pickups",), muted=())
    before = narrator_state(env)
    play_range(env, 1.0, 5.0, fx["ch1"])
    during = heard(env, "Chapter 1")
    assert during["Chapter 1"]["selected"] and not during["Chapter 2"]["selected"], f"selection while playing: {during}"
    assert during["Chapter 1"]["solo"] == 2 and during["Chapter 2"]["solo"] == 0 and during["Pickups"]["solo"] == 0, f"solos while playing: {during}"
    first, second = mix_tones(env, "isolated")
    assert first > 0.1 and second < 0.02, f"the mix holds Chapter 1's tone at {first:.3f} and Chapter 2's at {second:.3f}"
    # The render takes the transport (REAPER renders offline), so the bridge sees REAPER stop and puts the tracks back; stopping by hand is the same road.
    stop_by_hand(env)
    env.wait_for(lambda: narrator_state(env) == before, timeout=8, what="the narrator's tracks to be put back")
    return f"during: Chapter 1 selected and soloed in place, the mix holds its tone at {first:.2f} and the other chapter's at {second:.3f}; then selection, solos and mutes as before"


@scenario(
    "transport_sync",
    "play_range",
    "play_range ends by itself where it was asked to and the narrator's selection, solos and mutes are back by then",
    needs_audio=True,
)
def play_range_ends(env: Env) -> str:
    fx = arrange(env)
    hand_state(env, "Chapter 2", soloed=("Pickups",), muted=())
    before = narrator_state(env)
    started = time.monotonic()
    play_range(env, 1.0, 3.0, fx["ch1"])
    env.wait_for(lambda: play_state(env) == 1, what="REAPER to play")
    env.wait_for(lambda: play_state(env) == 0, timeout=8, what="REAPER to stop itself at the end of the stretch")
    elapsed = time.monotonic() - started
    after = narrator_state(env)
    assert after == before, f"the narrator's tracks were not put back:\nbefore {before}\nafter  {after}"
    assert 1.6 < elapsed < 4.0, f"the 2 s stretch stopped after {elapsed:.2f} s"
    return f"REAPER stopped itself {elapsed:.2f} s after the command for a 2 s stretch (the command and polling add a fraction of a second); selection, solos and mutes as before"


@scenario(
    "transport_sync",
    "play_range, stop_play",
    "play_range then stop_play: everything is put back at once, and a track the narrator muted is heard while it plays and muted again after",
    needs_audio=True,
)
def play_range_stop(env: Env) -> str:
    fx = arrange(env)
    hand_state(env, "Pickups", soloed=("Chapter 2",), muted=("Chapter 1",))
    before = narrator_state(env)
    play_range(env, 0.0, 6.0, fx["ch1"])
    during = heard(env, "Chapter 1")
    assert not during["Chapter 1"]["muted"], "the muted linked track stayed muted while it played"
    env.ok("stop_play", until="TRANSPORT_STOPPED")
    env.wait_for(lambda: play_state(env) == 0, what="REAPER to stop")
    after = narrator_state(env)
    assert after == before, f"not put back after stop_play:\nbefore {before}\nafter  {after}"
    return "a muted linked track was heard while it played; stop_play put the selection, the solo on Chapter 2 and the mute on Chapter 1 back"


@scenario(
    "transport_sync",
    "play_range, play_from",
    "play_range and play_from refuse a track REAPER lacks or a time with no audio on it, change nothing and do not play",
    needs_audio=True,
)
def play_refusals(env: Env) -> str:
    fx = arrange(env)
    hand_state(env, "Chapter 2", soloed=("Pickups",))
    before = narrator_state(env)
    missing = "{00000000-0000-0000-0000-00000000DEAD}"
    for command, args in (
        ("play_range", ("1", "2", missing)),
        ("play_range", ("20", "21", fx["ch1"])),
        ("play_from", ("1", missing)),
        ("play_from", ("20", fx["ch1"])),
        ("play_range", ("1", "2", fx["pickups"])),
    ):
        env.refused(command, *args)
    assert play_state(env) == 0, "a refused play started REAPER"
    after = narrator_state(env)
    assert after == before, f"a refused play changed the tracks:\nbefore {before}\nafter  {after}"
    return "a missing track, a time past the item, and an empty track were each refused with the tracks and the transport untouched"


@scenario(
    "transport_sync",
    "play_from",
    "play_from with a track: soloed while REAPER plays, put back when the narrator stops REAPER",
    needs_audio=True,
)
def play_from_isolates(env: Env) -> str:
    fx = arrange(env)
    hand_state(env, "Chapter 2", soloed=("Pickups",))
    before = narrator_state(env)
    env.ok("play_from", "1", fx["ch1"], until="TRANSPORT_PLAYING")
    during = heard(env, "Chapter 1")
    assert during["Chapter 1"]["solo"] == 2 and during["Chapter 2"]["solo"] == 0, f"while playing: {during}"
    first, second = mix_tones(env, "from_isolated")
    assert first > 0.1 and second < 0.02, f"the mix holds Chapter 1's tone at {first:.3f} and Chapter 2's at {second:.3f}"
    stop_by_hand(env)
    env.wait_for(lambda: narrator_state(env) == before, timeout=6, what="the tracks to be put back after the narrator stopped REAPER")
    return "Chapter 1 alone while playing; the narrator stopping REAPER in its own window put the tracks back"


@scenario(
    "transport_sync",
    "play_range",
    "play_range on a folder child: the folder parent's own audio is not heard (it is a route, not a track to play)",
    needs_audio=True,
)
def play_range_folder_child(env: Env) -> str:
    env.lua(
        """
        local parent = ci.add_track('Folder')
        local child = ci.add_track('Child')
        ci.add_item(parent, args[1], 0, 8)
        ci.add_item(child, args[2], 0, 8)
        reaper.SetMediaTrackInfo_Value(parent, 'I_FOLDERDEPTH', 1)
        reaper.SetMediaTrackInfo_Value(child, 'I_FOLDERDEPTH', -1)
        ci.save_and_reload(ci.rpp)
        return true
        """,
        env.media_path("tone_b"),
        env.media_path("tone_a"),
    )
    guid = env.lua("return reaper.GetTrackGUID(ci.track_by_name('Child'))")
    play_range(env, 0.5, 3.0, guid)
    heard(env, "Child")
    child, parent = mix_tones(env, "folder_child")
    stop_by_hand(env)
    env.wait_for(lambda: play_state(env) == 0, what="REAPER to stop")
    # The child's tone is 440 Hz; the folder parent's own item is 660 Hz. The child reaches the master through its parent, which must stay a route.
    assert child > 0.1, f"the child was not heard through its parent: {child:.3f}"
    assert parent < 0.02, f"the folder parent's own audio is audible: {parent:.3f}"
    return f"the mix holds the child's tone at {child:.2f} and the folder parent's own item's at {parent:.3f}: the parent is a route, not a track that plays"
