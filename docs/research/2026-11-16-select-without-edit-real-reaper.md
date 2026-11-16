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

**Pending:** whether the arrange view and the track panel redraw the selection made through `I_SELECTED` (the xvfb run reads state, not pixels; the owner's check on a real window), and `play_from`'s isolation and restore in `narration_transport.lua`, which still call `SetTrackSelected` and so still count an edit.
