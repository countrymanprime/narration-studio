# Selecting a chapter without counting an edit, in a real REAPER (2026-11-16)

**What it settles:** which call selects a folder and its children without raising `GetProjectStateChangeCount` ([#3560](https://github.com/countrymanprime/narration-studio/issues/3560), [#3428](https://github.com/countrymanprime/narration-studio/issues/3428)). The host emits `daw_project_edited` whenever the count moves, and Editing re-reads its word table when it does, so a `go_to` that bumped the count made Editing re-read for a move that edited nothing.

**Method:** `scripts/ci/real-reaper/run-linux-check.sh` with `NARRATION_CI_ONLY=select_count`, REAPER 7.82 on Linux under xvfb, JACK dummy device, scratch `-cfgfile`. Rows are in `scripts/ci/real-reaper/scenarios_select_count.py`; raw numbers go to `<out>/select_count/*.json`. A project of two chapters (a folder and two voices each) and a loose track, saved, was the start; each way ran from "Pickups selected", then again on the same chapter, on the other chapter and back.

**Findings:**

| Question | Answer |
| --- | --- |
| Does an action select the children of a selected folder? | No. Listing the Main section with `kbd_enumerateActions` (4379 actions) and keeping texts that name select and a folder or children found only 41665 "Track: Show/hide children of selected folder tracks in mixer" and 42696 "... in TCP", which show tracks and select none. |
| `SetOnlyTrackSelected(folder)` then `SetTrackSelected(member, true)` per child (the old `go_to`) | Count +2 on every move, also when the chapter was already selected. No undo point, not dirty. |
| The same, calling `SetTrackSelected` only for a member not yet selected | Count +2 still: `SetOnlyTrackSelected` had just cleared them. |
| `SetOnlyTrackSelected(folder)` then `SetMediaTrackInfo_Value(member, 'I_SELECTED', 1)` per child | Count +0 on all four moves, the same selection (folder and both voices), no undo point, not dirty. |
| The bridge's `go_to` with that change, four moves (first, again, other chapter, back) | Count, undo top and dirty flag unchanged after each; the selection was the folder and both voices. |

**Play isolation ([#3580](https://github.com/countrymanprime/narration-studio/issues/3580), same REAPER 7.82 run, row `play_from, play_range, stop_play` in `scenarios_playtrack.py`, numbers in `<out>/select_count/play.json`):** `play_range` and `play_from` with a chapter track select it, solo it in place and unmute it, then put the narrator's selection, solos and mutes back. Written through `I_SELECTED`, `I_SOLO` and `B_MUTE`, the change count, undo top and dirty flag were identical before the play, while it played and after the restore, for a `play_range` that ended itself, a `play_range` ended by `stop_play` and a `play_from` stopped by the narrator in REAPER, with the selection, solos and mutes exactly as before each time. With the isolation and restore calling `SetTrackSelected` instead, the same row failed: the count rose by 2 when the play started. So the solo and mute writes do not mark the project changed; only `SetTrackSelected` did.

**Pending:** whether the arrange view and the track panel redraw the selection made through `I_SELECTED` (the xvfb run reads state, not pixels; the owner's check on a real window), the same on Windows, a play on a real audio device (this run used the JACK dummy device), and two restore paths run only in the harness: a play replaced by another play, and the leftover-file restore after a REAPER that closed mid-play.
