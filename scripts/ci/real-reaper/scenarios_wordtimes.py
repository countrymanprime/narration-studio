"""Real-REAPER scenarios, group 7: where a second of a source file plays in the project, after the edits a narrator makes.

The host's word table (src/studio/desktop/internal/wordtimes, docs/design/word-project-times.md) puts a word of a source file at
`position + (source second - source offset) / play rate` in the live item that plays it, read from `chapter_track_state`. These rows check that
reading and that formula against what REAPER really plays: a source whose pitch changes every 5 s (steps.wav) goes on a track, the narrator moves,
trims, re-rates, splits and deletes, `chapter_track_state` is read, and a render of the master mix at the project second the formula gives must carry
the pitch of that source second. A source second no live item covers must not be in the mix at all. The change counter must rise on each edit, since
the page asks for a new table when it does.
"""

from __future__ import annotations

from scenario import Env, scenario

STEP = 5.0
PITCHES = ["tone_a", "tone_b", "tone_c"]  # steps.wav: second s is PITCHES[int(s / STEP) % 3]
LENGTH = 30.0


def pitch_of(source_second: float) -> str:
    return PITCHES[int(source_second / STEP) % len(PITCHES)]


def arrange(env: Env, position: float = 10.0) -> str:
    """One item holding the whole of steps.wav at `position` on Chapter 1, saved and reopened; answers the track's GUID."""
    return env.lua(
        """
        local track = ci.add_track('Chapter 1')
        ci.add_item(track, args[1], args[2], 30)
        ci.save_and_reload(ci.rpp)
        return reaper.GetTrackGUID(ci.track_by_name('Chapter 1'))
        """,
        env.media_path("steps"),
        position,
    )


def live(env: Env, guid: str) -> tuple[int, list[dict]]:
    """chapter_track_state's change count and items (position, length, source offset, play rate, source file, muted)."""
    events = env.send("chapter_track_state", guid, until={"TRACK_STATE_END", "TRACK_STALE"})
    state = next(e for e in events if e[0] == "TRACK_STATE")
    items = [
        {
            "guid": e[2],
            "position": float(e[4]),
            "length": float(e[5]),
            "offset": float(e[6]),
            "rate": float(e[7]) or 1.0,
            "file": e[8],
            "muted": e[9] == "1",
        }
        for e in events
        if e[0] == "TRACK_ITEM"
    ]
    return int(state[8]), items


def placed(items: list[dict], source_second: float) -> float | None:
    """The host's rule: the project second the live item that plays `source_second` plays it at; of overlapping items the latest-starting one."""
    covering = [i for i in items if not i["muted"] and i["offset"] - 1e-6 <= source_second < i["offset"] + i["length"] * i["rate"] - 1e-6]
    if not covering:
        return None
    item = max(covering, key=lambda i: i["position"])
    return item["position"] + (source_second - item["offset"]) / item["rate"]


def probes() -> list[float]:
    """The middle of each 5 s step of the source."""
    return [STEP * k + STEP / 2 for k in range(int(LENGTH / STEP))]


def check_probes(env: Env, items: list[dict], name: str) -> tuple[int, int]:
    """Every probe the live items cover plays its own pitch at the project second the rule gives; every other probe is covered by no item."""
    heard = skipped = 0
    for s in probes():
        project = placed(items, s)
        if project is None:
            skipped += 1
            continue
        mix = env.render_mix(f"{name}_{int(s * 10)}", max(0.0, project - 0.15), project + 0.15)
        got = mix.pitch(0.0, 0.3)
        assert got == pitch_of(s), f"source {s} s should play at project {project:.3f} s as {pitch_of(s)}, the mix has {got}"
        heard += 1
    return heard, skipped


def stale_misses(env: Env, saved: list[dict], name: str) -> int:
    """How many probes play a different pitch at the place the SAVED items (before the edit) give: the page's old way would have lit those words wrong."""
    wrong = 0
    for s in probes():
        project = placed(saved, s)
        if project is None:
            continue
        if env.render_mix(f"{name}_{int(s * 10)}", max(0.0, project - 0.15), project + 0.15).pitch(0.0, 0.3) != pitch_of(s):
            wrong += 1
    return wrong


def edit(env: Env, label: str, code: str, *args: object) -> None:
    env.lua(
        "reaper.Undo_BeginBlock2(0)\n" + code + "\nreaper.Undo_EndBlock2(0, args[#args], -1)\nreturn true",
        *args,
        label,
    )


@scenario("word_times", "chapter_track_state", "word times: an untouched item, a moved one and a trimmed one play each source second where the live item says")
def moved_and_trimmed(env: Env) -> str:
    guid = arrange(env, 10.0)
    count, items = live(env, guid)
    assert len(items) == 1 and abs(items[0]["position"] - 10.0) < 1e-6
    heard, _ = check_probes(env, items, "plain")
    saved = items
    edit(env, "moved", "reaper.SetMediaItemInfo_Value(reaper.GetMediaItem(0, 0), 'D_POSITION', args[1])", 40.0)
    moved_count, items = live(env, guid)
    assert moved_count > count, "the change count did not rise after a move"
    check_probes(env, items, "moved")
    stale = stale_misses(env, saved, "stale_moved")
    assert stale > 0, "the places the unedited items give should be wrong after a move (the check would prove nothing)"
    edit(
        env,
        "trimmed",
        """
        local item = reaper.GetMediaItem(0, 0)
        reaper.SetMediaItemInfo_Value(item, 'D_POSITION', args[1] + args[2])
        reaper.SetMediaItemInfo_Value(item, 'D_LENGTH', 30 - args[2])
        reaper.SetMediaItemTakeInfo_Value(reaper.GetActiveTake(item), 'D_STARTOFFS', args[2])
        """,
        40.0,
        12.0,
    )
    trimmed_count, items = live(env, guid)
    assert trimmed_count > moved_count, "the change count did not rise after a trim"
    assert abs(items[0]["offset"] - 12.0) < 1e-6 and abs(items[0]["position"] - 52.0) < 1e-6, f"live item {items[0]}"
    heard_trimmed, skipped = check_probes(env, items, "trimmed")
    assert skipped == 2, f"{skipped} probes are before the trim; two are"
    return f"{heard} probes plain, moved ({stale} of them wrong at the pre-edit place), and {heard_trimmed} after a 12 s head trim (2 cut off); the change count rose on each edit"


@scenario("word_times", "chapter_track_state", "word times: a play rate of 2 and of 0.5 put each source second at position + offset / rate")
def rates(env: Env) -> str:
    guid = arrange(env, 10.0)
    done = []
    for rate in (2.0, 0.5):
        edit(
            env,
            f"rate {rate}",
            """
            local item = reaper.GetMediaItem(0, 0)
            reaper.SetMediaItemTakeInfo_Value(reaper.GetActiveTake(item), 'D_PLAYRATE', args[1])
            reaper.SetMediaItemInfo_Value(item, 'D_LENGTH', 30 / args[1])
            """,
            rate,
        )
        _, items = live(env, guid)
        assert abs(items[0]["rate"] - rate) < 1e-9, f"live rate {items[0]['rate']}"
        heard, _ = check_probes(env, items, f"rate_{rate}")
        done.append(f"{rate}: {heard} probes")
    return "; ".join(done)


@scenario("word_times", "chapter_track_state", "word times: a split gives the right half a new GUID, the time is the same, and the change count rose")
def split(env: Env) -> str:
    guid = arrange(env, 10.0)
    before, items = live(env, guid)
    edit(env, "split", "reaper.SplitMediaItem(reaper.GetMediaItem(0, 0), 10 + args[1])", 14.0)
    count, items = live(env, guid)
    assert count > before, "the change count did not rise after a split"
    assert len(items) == 2 and items[0]["guid"] != items[1]["guid"], f"items {items}"
    right = max(items, key=lambda i: i["position"])
    assert abs(right["offset"] - 14.0) < 1e-6 and abs(right["position"] - 24.0) < 1e-6, f"right half {right}"
    heard, skipped = check_probes(env, items, "split")
    assert skipped == 0, "a split leaves every second of the source in the project"
    return f"2 items with different GUIDs, {heard} probes play at their place across the split"


@scenario("word_times", "chapter_track_state", "word times: a section deleted and closed up leaves its seconds in no item, and the later ones earlier")
def deleted_and_closed(env: Env) -> str:
    guid = arrange(env, 10.0)
    before, _ = live(env, guid)
    edit(
        env,
        "delete and close",
        """
        local item = reaper.GetMediaItem(0, 0)
        local right = reaper.SplitMediaItem(item, 10 + args[1])
        local last = reaper.SplitMediaItem(right, 10 + args[2])
        reaper.DeleteTrackMediaItem(reaper.GetTrack(0, 0), right)
        reaper.SetMediaItemInfo_Value(last, 'D_POSITION', 10 + args[1])
        """,
        10.0,
        15.0,
    )
    count, items = live(env, guid)
    assert count > before, "the change count did not rise after a delete"
    assert len(items) == 2, f"items {items}"
    tail = max(items, key=lambda i: i["position"])
    assert abs(tail["offset"] - 15.0) < 1e-6 and abs(tail["position"] - 20.0) < 1e-6, f"tail {tail}"
    assert placed(items, 12.5) is None, "a second inside the deleted section has a time"
    heard, skipped = check_probes(env, items, "deleted")
    assert skipped == 1, f"{skipped} probes are in the deleted section; one is"
    return f"{heard} probes play at their place; the deleted 5 s section (source 10 to 15 s) is in no item; the tail moved up to 20 s"


@scenario("word_times", "chapter_track_state", "word times: a muted take and a muted item are not in the table, the other take plays")
def muted(env: Env) -> str:
    guid = arrange(env, 10.0)
    edit(env, "mute", "reaper.SetMediaItemInfo_Value(reaper.GetMediaItem(0, 0), 'B_MUTE', 1)")
    _, items = live(env, guid)
    assert items[0]["muted"], "the live item is not reported muted"
    assert placed(items, 12.5) is None, "a muted item has a time"
    mix = env.render_mix("muted", 10.0, 14.0)
    assert mix.rms(0.5, 3.5) < 1e-4, "a muted item is heard"
    return "a muted item reports muted, has no time, and is silent in the mix"
