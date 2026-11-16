# A DAW that follows the app's chapter, in a real REAPER (2026-11-16)

**What it settles:** what REAPER 7.82 does for the steps of [#3428](https://github.com/countrymanprime/narration-studio/issues/3428), a DAW that follows the chapter the narrator works on: showing the chapter (cursor and tracks), whether a mute, solo or selection made through the API counts as an edit, what selecting and muting cost on 60, 500 and 2000 tracks, and whether `play_from` inside a focus puts the focus back. It feeds PR C (arm on entry), PR D (mute tier) and the speed question in the plan ([plan comment](https://github.com/countrymanprime/narration-studio/issues/3428#issuecomment-6918657677), [correction](https://github.com/countrymanprime/narration-studio/issues/3428#issuecomment-6919003702)). No app behaviour changed.

**Method:** `scripts/ci/real-reaper/run-linux-check.sh` with `NARRATION_CI_ONLY=follow NARRATION_CI_FOLLOW_LARGE=1` (the second variable adds the 2000-track mute and solo of every other track, about ten minutes; the default run leaves those two out), REAPER 7.82 on Linux under `xvfb-run` (default screen), JACK dummy device, scratch `-cfgfile`, the tarball SHA-256 the script pins. The seven scenarios are in `scripts/ci/real-reaper/scenarios_follow.py`; each writes its raw numbers to `<out>/follow/<scenario>.json`. The run on 2026-11-16 passed 18 of 18 rows (the 11 base and earlier rows plus these seven). Notes on the method:

- Actions were found by listing every action of the Main section with `kbd_enumerateActions` and keeping those whose text mentions zoom, scroll or the arrange view (81 in 7.82). Each scenario names the action by ID and expected text through `kbd_getTextFromCmd` and stops if the text differs.
- The arrange view's size comes from `GetSet_ArrangeView2` (horizontal). REAPER has no call for the vertical size and the CI REAPER has no `js_ReaScriptAPI`, so the track area's height (350 px) is inferred from where action 40913 puts the last track (its bottom edge). Track positions are `I_TCPY` and `I_TCPH`, which are virtual (a track above the view reads a negative `I_TCPY`).
- Timings are `reaper.time_precise` around the calls inside one snippet, so the file protocol is not in them; the `go_to` row is the driver's wall time for the whole command. Each operation is repeated 5 times on 60 and 500 tracks and **once** on 2000 (one mute-others pass takes 43 s, see below). The projects hold tracks only (chapters of a folder and two voices, no items, no FX).
- The change count, undo label and `IsProjectDirty` are read before and after each call on a project saved just before.

## Findings

### Showing the chapter

| Question | Answer |
| --- | --- |
| Does `go_to` (`SetEditCurPos(time, true, false)`) to a chapter 3000 s away put the cursor in view? | Yes. The view moved from 0 to 6.73 s to 2999.18 to 3005.91 s with the cursor at 3000 s (0.82 s in from the left edge, not centred). Going back to 0 s moved it back (0 to 6.73 s). A cursor placed at 2 s, inside the view, left the view as it was. |
| Does it show the chapter's tracks? | **No.** The view scrolled only horizontally. The folder of "Chapter 15" stayed at `I_TCPY` 3330 (its voices at 3404 and 3478) in a track area 350 px tall, so none of the three was visible. |
| Which action scrolls to the selected tracks? | Action 40913, "Track: Vertical scroll selected tracks into view". After `go_to` it put the folder, Narrator and Voice at y 128, 202 and 276 (all three inside 0 to 350). It scrolls by the least amount: from above, the last selected track ends at the bottom edge (276 + 74 = 350); from below, the first selected track sits at the top (y 0). A selection already in view did not move, and with nothing selected nothing moved. It changed no selection, no cursor and no horizontal view, and counted no edit. |
| Which action zooms to a time range? | Action 40031, "View: Zoom time selection", zooms to the time selection the project holds: a selection of 3000 to 3150 s gave a view of 2994.9966 to 3158.4572 s (a margin of 5.0 s before and 8.5 s after). Setting the selection (`GetSet_LoopTimeRange`) and running the action counted no edit and moved no cursor, but the time selection is the narrator's own, so it has to be read and put back. |
| Can the API set the view without a time selection? | `GetSet_ArrangeView2(0, true, 0, 0, 1000, 1150)` set it and read back 999.851 to 1149.851 s (0.149 s earlier than asked, so a caller must not expect the exact start). It counted no edit. There is no API call for the vertical scroll; the action is the way. |

Not run: a selection taller than the track area (a chapter of more than four voices at the default height would not fit; which track 40913 favours is not recorded), the narrator's own window size, tracks of other heights, and nested folders.

### What counts as an edit

All of these were made on a saved project, outside an undo block. "Edit counted" is `GetProjectStateChangeCount` changing.

| Call | Undo point | Edit counted | Dirty |
| --- | --- | --- | --- |
| `B_MUTE` set to 1 or 0, `I_SOLO` set to 1, 2 or 0, and a set to the value already held | no | no | no |
| `SetTrackSelected(track, true)`, `(track, false)` or to the state it already has | no | **yes, +1 per call** | no |
| `SetOnlyTrackSelected(track)` (one call, one other track selected) | no | no | no |
| `SetEditCurPos(time, true, false)` and `(time, false, false)` | no | no | no |
| A mute inside `Undo_BeginBlock2`/`Undo_EndBlock2` (control) | yes | yes | yes |

- A `go_to` on a folder with two voices added 2 to the change count (two `SetTrackSelected` calls); four `go_to` calls in a row added 8.
- The host emits `daw_project_edited` whenever the change count moves ([`bindings_daw_projectedited.go`](../../src/studio/desktop/bindings_daw_projectedited.go)), and the Editing page rebuilds its word table on it. So each `go_to` on a folder already costs one such rebuild per voice, and PR A's follow does too. Whether a rebuild per chapter change is acceptable on a long book is a question for PR A; it was not measured here.
- A mute and a solo set through the API with the project **not dirty** were written to the file by the next save: the saved track read `MUTESOLO 1 2 0` (mute, solo 2, no phase invert) after `IsProjectDirty` read 0. A focus that mutes tracks therefore survives into the narrator's own project if the narrator saves while it is on, and REAPER asks nothing on close. PR D's ledger has to cover a save, not only a crash.

### Cost on 60, 500 and 2000 tracks

Median milliseconds of the call, without and with `PreventUIRefresh(1)`/`(-1)` around it. The chapter in the middle (folder and two voices) is the one selected or left alone.

| Operation | 60 tracks | 500 tracks | 2000 tracks (1 run) |
| --- | --- | --- | --- |
| Select the chapter (`SetOnlyTrackSelected`, two `SetTrackSelected`) | 0.21 / 0.32 | 2.21 / 2.34 | 12.0 / 13.2 |
| Select every track (`SetTrackSelected` on each) | 0.02 / 0.02 | 0.19 / 0.24 | 1.17 / 1.14 |
| Solo in place on the chapter's three tracks | 0.06 / 0.04 | 0.35 / 0.46 | 18.9 / 8.5 |
| `I_SOLO` = 2 on every other track | 0.53 / 0.45 | 69.0 / 87.6 | 2,666 / 2,680 |
| `B_MUTE` = 1 on every other track | 0.47 / 0.70 | 74.1 / 74.1 | **42,751 / 43,905** |
| `go_to` through the bridge, driver wall time | 50.7 | 50.5 | 50.5 |

- **Selecting is cheap at every size**, and `PreventUIRefresh` changed nothing measurable anywhere (differences of a fraction of a millisecond at 60 and 500 tracks, within the spread of the five runs).
- **Muting or soloing every other track is not linear.** One `SetMediaTrackInfo_Value` cost 6 to 8 µs on 60 tracks, about 0.15 ms on 500 and about 21 ms on 2000 for `B_MUTE` (about 1.3 ms for `I_SOLO`). On 2000 tracks one pass of mute-others took 43 s and putting the mutes back took another 43 s, with REAPER's main thread busy the whole time, so the bridge's own tick could not run meanwhile. The first sets in a pass cost about as much as the last, so the cost depends on the project's track count, not on how many tracks are already muted.
- **Soloing the chapter in place is the same effect in one call per chapter track** (8 to 19 ms on 2000 tracks, 3 ms to put back). Where the plan wants "the chapter is the only one heard", solo in place on the chapter's tracks and a restore of the narrator's solos is the one that stays fast; mute-others is not usable above a few hundred tracks. The decision (open question 6 of the plan) is the owner's; this is the measurement.
- The `go_to` row is the driver's polling interval (50 ms, `drive.py`), so it shows that the bridge answered within one poll at every size, not its own cost. REAPER's main-thread cost of the bridge in a large project is in [the bridge performance note](reaper-bridge-performance.md).
- The runner's window is small, so redraw costs are not those of a narrator's full-size window. The 2000-track figure is one run on one runner: read it as the order of magnitude (tens of seconds), not as 43 s.

### Play inside a focus

Scenario `follow: play_from inside a focus...` (needs the JACK dummy device). Project: "Chapter 1" and "Chapter 2" (each a folder with a Narrator holding 8 s of audio and a second voice) and "Pickups". The narrator's own state: Pickups soloed, "Chapter 2 Second" muted and, in two of the three rounds, "Chapter 1 Narrator" muted. The focus was made by the scenario's Lua (the app makes none yet), once as solo in place on Chapter 1's three tracks (clearing every other solo) and once as a mute on every track outside Chapter 1 that was not muted. Then `play_from` ran for the Narrator track or for the folder; the mix of the playing project was rendered (the render takes the transport, so the bridge sees the play end) and the three states compared.

| Result in all six rounds (solo focus and mute focus, three targets each) | |
| --- | --- |
| After the play, every track's selection, solo and mute equalled the focus's | yes |
| After releasing the focus (restoring the saved solos and mutes), every one equalled the narrator's own, including the hand mute and the hand solo | yes |
| While playing, the asked track alone had `I_SOLO` 2; the others read 0, and the focus's solo on the rest of the chapter was cleared for the play and came back | yes |
| `play_from` on a Narrator muted by hand | heard (440 Hz at 0.30 in the mix), the mute back afterwards |
| `play_from` on the **folder** while its Narrator was muted by hand | **silent** (440 Hz at 0.00): the folder's isolation unmutes the folder only, not a muted voice inside it, in both focus types |
| `play_from` on the folder with nothing muted inside | heard (440 Hz 0.30; the other chapter's tone at 0.00) |

So the isolation and a focus compose: the isolation remembers the focus's state as the state to return to, and the focus's own release returns the narrator's. The silent folder case is the existing `play_from` behaviour, not caused by the focus; it is a decision for PR D (whether the Booth's play passes the folder or a voice).

## Pending with the owner

- **The 2000-track run is a manual release step.** It stays behind `NARRATION_CI_FOLLOW_LARGE=1` (about ten minutes, longer than the Windows job's 1200 s limit) and is run by hand before each release, not on every pull request.

- Windows and the owner's audio device: every row ran on Linux with a JACK dummy device and a 640 x 480 virtual screen. The vertical scroll, the zoom margin and the timings on the narrator's own window size and screen are not measured.
- A chapter taller than the track area (several voices), a chapter in a nested folder, and tracks with items, FX or envelopes in the timing projects.
- What the narrator sees and hears: the flicker, if any, of the view following a chapter, and whether a 43 s stall on 2000 tracks is the same on the narrator's machine.
- Whether the `daw_project_edited` rebuild per `go_to` (above) is acceptable; a measurement of the Editing page's word-table rebuild on a long book.
- Audacity: no run (it has no `go_to` folder and no mute state read; the plan's question 5).
