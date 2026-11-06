"""Real-REAPER scenarios: tracks_read, the live track list behind Chapter links and Link chapters (#2840).

A chapter track or folder the narrator adds in REAPER must show in the app before the project is saved. These rows prove what the harness's
fake cannot: that REAPER lists a track and a folder added after the last save, with the folder depth changes the .rpp would record, that
P_NAME reads an unnamed track as empty (GetTrackName would answer "Track N"), that a name with a bar, emoji and right-to-left text comes
back whole, and that the read itself changes nothing: no undo point, no edit counted, the project not made dirty.
"""

from __future__ import annotations

from scenario import Env, scenario


def read_tracks(env: Env) -> tuple[list[str], list[list[str]], list[str]]:
    """tracks_read's header, rows and end event."""
    events = env.send("tracks_read", until={"TRACKS_READ_END", "ERROR"})
    assert events[-1][0] == "TRACKS_READ_END", f"tracks_read answered {events}"
    header = next(e for e in events if e[0] == "TRACKS_READ")
    rows = [e for e in events if e[0] == "TRACKS_ROW"]
    return header, rows, events[-1]


def untouched(env: Env) -> dict:
    """What a read must leave as it was: the edit counter, the top of the undo history and whether the project is dirty."""
    return env.lua(
        """
        return {
          changes = reaper.GetProjectStateChangeCount(0),
          undo = reaper.Undo_CanUndo2(0) or '',
          dirty = reaper.IsProjectDirty(0),
        }
        """
    )


@scenario(
    "tracks_read",
    "tracks_read",
    "tracks_read lists a track and a folder added after the last save, with their folder depth changes, an unnamed track as empty and a "
    "bar, emoji and right-to-left name whole, and changes nothing: no undo point, no edit counted, the project as dirty as it was",
)
def tracks_read_unsaved(env: Env) -> str:
    saved = env.lua(
        """
        local chapter = ci.add_track('Chapter 1')
        ci.save_and_reload(ci.rpp)
        return reaper.GetTrackGUID(ci.track_by_name('Chapter 1'))
        """
    )
    header, rows, end = read_tracks(env)
    assert [r[3:] for r in rows] == [[saved.upper(), "Chapter 1", "0"]], f"saved project rows {rows}"
    assert header[3] == "0" and header[2].lower().endswith(".rpp"), f"header {header}"

    added = env.lua(
        """
        -- One undo point, as the narrator's own add would make: a read must leave it the top of the history.
        reaper.Undo_BeginBlock2(0)
        local folder = ci.add_track('Chapter 2')
        local voice = ci.add_track(args[1])
        reaper.SetMediaTrackInfo_Value(folder, 'I_FOLDERDEPTH', 1)
        reaper.SetMediaTrackInfo_Value(voice, 'I_FOLDERDEPTH', -1)
        local index = reaper.CountTracks(0)
        reaper.InsertTrackAtIndex(index, true)
        reaper.Undo_EndBlock2(0, 'Add chapter tracks by hand', -1)
        local _, display = reaper.GetTrackName(reaper.GetTrack(0, index))
        return { folder = reaper.GetTrackGUID(folder), voice = reaper.GetTrackGUID(voice), unnamed = reaper.GetTrackGUID(reaper.GetTrack(0, index)), display = display }
        """,
        "Ch 3 | הים 🌊",
    )
    before = untouched(env)
    assert before["undo"] == "Add chapter tracks by hand", f"the add left no undo point to compare against: {before}"
    header, rows, end = read_tracks(env)
    after = untouched(env)
    shape = [(r[2], r[4], r[5]) for r in rows]
    assert shape == [("0", "Chapter 1", "0"), ("1", "Chapter 2", "1"), ("2", "Ch 3 | הים 🌊", "-1"), ("3", "", "0")], shape
    guids = [r[3] for r in rows[1:]]
    assert guids == [added["folder"].upper(), added["voice"].upper(), added["unnamed"].upper()], f"GUIDs {guids} vs {added}"
    assert end[2:] == ["4", "4"], f"end {end}"
    assert header[3] == "0", f"a saved project read as unsaved: {header}"
    assert after == before, f"the read changed the project: before {before}, after {after}"
    again = read_tracks(env)[1]
    assert again == [[r[0], again[0][1], *r[2:]] for r in rows], "a second read answered differently"
    return (
        f"rows {shape}; the unnamed track reads '' by P_NAME (GetTrackName says {added['display']!r}); change count {before['changes']}, "
        f"undo {before['undo']!r} and dirty {before['dirty']} unchanged by the read"
    )
