# Recording to character sub-tracks in the Booth

**Written 2026-10-30.** Issue: [#2251](https://github.com/countrymanprime/narration-studio/issues/2251) (owner request, no checklist item). **Question:** can the narrator press a number-pad key in the Booth to choose which character's track a take records on, so an FX chain on that track (the owner's example: drone chirps) covers every item the character speaks, with no per-item FX?

**Status.** A design note. Nothing here was built or run in REAPER. Every REAPER behaviour below is either cited to a run already recorded in [reaper.md](../reference/daw/reaper.md) or marked **not run**; section 6 lists what to run.

## Recommendation

Link each chapter to a **folder track** whose children are the voices (Narrator, then one per character). Number-pad key N arms child N **between takes**, using the arm and record commands that exist. A key pressed during a take stops that take and starts the next one on the new track, the way `roll` already does ([Roll](../reference/daw/reaper.md#roll)). Items stay whole; no split is needed. Character FX go on the child, chapter-wide FX on the folder. A flat chapter track keeps working unchanged. Live arming without a stop, and recording once then splitting by speaker, are phase 3 options that need real-REAPER proof first.

The cost is not the recording. It is that **every reader of "the chapter's items" reads one track GUID today** (section 5), and a folder with items only on its children reads as empty.

## 1. How it works today

| Question | Answer | Source |
| --- | --- | --- |
| How a chapter links to a track | One confirmed track GUID per chapter in `chapter-track-map.json`. `chapterTrackSet` replaces any earlier link and takes the track from any chapter that held it. | `src/studio/desktop/chapterlinks.go`, [data files](../reference/data-files.md) |
| What the Engine page shows | The track list with each track's `depth` and `isFolder` (from the `.rpp`'s `ISBUS` line), as a folder tree with carets, a folder mark and a rollup of linked chapters. Linking is per chapter row. | `components/tracks/trackTree.ts`, `components/engine/TrackList.tsx`, [Tracks](../utilities/tracks.md) |
| Which track is armed | `readAloudRecordStartFrom` resolves the chapter's linked GUID, refuses while playing or recording, calls `ArmOnly(guid)` (arms it, disarms every other, remembers the narrator's arms), then `RecordStart(guid, …)`. | `bindings_readaloud_record.go` |
| Where it lands | A start without a time puts the cursor at the end of the last item on that track (`bridge.AtEnd`). A punch moves the cursor with `PunchTo` first (`StartHere`). `record_start` refuses unless exactly the named track is armed. | `bindings_readaloud_record.go`, `narration_transport.lua` |
| After the stop | The arms are put back; the cursor is set to the end of the item that starts where the recording began **on that track** (`stopped_at`). | `narration_transport.lua` |
| Roll | Stops the recording the app started, moves the cursor to `at`, records again with `CSurf_OnRecord`. Refuses fixed-lane tracks and any overlap setting other than "splits and creates new takes". | `narration_roll.lua` |
| Editing play | `track_for_play` refuses a track with no item at the start (`plays_at` looks at that track's own items), then `isolate` solos only that track in place. | `narration_transport.lua` |
| FX on a whole track | `apply_fx_chain` adds a saved chain to one track with `TrackFX_AddByName`, in one undo block. The Editing page puts its chain on `ChapterTrackGUID`. | `narration_workspace.lua`, `coverage/workspace.go` |

Not yet seen in a file REAPER wrote: the folder `ISBUS` line. The only nested fixture is hand-made ([reaper.md](../reference/daw/reaper.md#documentation-and-research-not-run-in-reaper), #992).

## 2. Target model

```text
Chapter 3            folder, linked to chapter 3      chapter-wide FX, e.g. loudness
├─ Narrator          child                            the default voice
├─ Veyra             child, named for the character   Veyra's FX
└─ Drone             child                            drone chirps FX, every item it speaks
```

- **The link stays one GUID: the folder.** `chapter-track-map.json` does not change shape. A linked track with no children behaves exactly as now.
- **Voices are children, matched by name.** A child whose name equals a Story Bible character (or one of its aliases) is that character's track in every chapter. Names, not GUIDs, because each chapter has its own folder; the GUID would have to be stored once per chapter per character. An explicit override is a later option.
- **The narrator.** Narrator lines go to a child named Narrator, not to the folder. Items on the folder itself would run through the folder's FX together with the children's sum, so the narrator could not have FX of their own.
- **A character with no child.** The take records on the Narrator child and the Booth says so when the narrator chooses the voice (section 4). Nothing creates a track silently.

## 3. REAPER calls, by option

| Option | Calls | What is known | Not run |
| --- | --- | --- | --- |
| **A. Arm between takes** (recommended) | `SetMediaTrackInfo_Value(track, 'I_RECARM', 1)` on the chosen child and 0 on the rest (the `arm_only` command), then `CSurf_OnRecord` (`record_start`). | The commands exist and are harness-tested. Arms are not in REAPER's undo history. A stopped take is one "Recorded media" point (REAPER 7.82, Linux). | Arming a child inside a folder; that a folder parent stays unarmed and records nothing; that two takes on different children at the same cursor make two items and no take split. |
| **A+. Switch during a take** | New `switch_record(track, at)`: the `roll` sequence with a different track: `OnStopButton`, `arm_only(new)`, `SetEditCurPos(at)`, `CSurf_OnRecord`. | `roll` does the same on one track and waits up to 30 defer cycles for REAPER to report recording. | The gap between the two takes (stop to recording); whether a switch to a track the stop left armed misbehaves; undo points per switch (the bridge reports points per stop; `DAW_RESULT_MAX_UNDO_STEPS` is 12, so a take with many switches needs a rule). |
| **B. Live arm change, no stop** | Change `I_RECARM` while `GetPlayState()` reports recording. | Only that a recording is not an item until it stops, so nothing can be split or moved mid-take ([reaper.md](../reference/daw/reaper.md#media-sources-and-recording)). | Whether REAPER starts recording a track armed mid-take, and from where; whether it closes a disarmed track's item at that moment. `record_start`, `stopped_at` and `restore_arms` assume one armed track and would all change. **Possible but unproven.** |
| **C. Record once, then split by speaker** | Record on the Narrator child. After the stop, `SplitMediaItem` at each switch time the Booth logged, then `MoveMediaItemToTrack` for the pieces, in one undo block. | `delete_range` already does splits and moves in one undo step, and one Undo reverses it (row C3). A split keeps `P_EXT` on both halves (S0). | Switch times against the clock REAPER recorded with (`GetPlayPosition` trails `GetPlayPosition2` by about 64 ms on a 1024-frame device); the narrator pressing a key late. |
| **Not possible** | `I_RECMODE` chooses what a track records (input or its output, mono or stereo, none); it does not choose a destination. It can mute a child's recording, not redirect it. The folder `I_FOLDERDEPTH` sets structure only. | n/a | n/a |

**Creating the children.** Add a track below the folder with `InsertTrackAtIndex` and set `I_FOLDERDEPTH` (1 opens a folder, 0 changes nothing, -N closes N levels, as the track parser reads it). A new track at depth 0 after an opener swallows every later track until something closes it, so the last child needs -1, and a folder that was itself the last child of an outer folder passes its closing delta to the new last child. Each child needs the folder's `I_RECINPUT` and `I_RECMODE` copied, or it records from another input. **Not run.** `track_create` today appends at the end of the list and never nests.

**Selection and Editing play.** `SetOnlyTrackSelected` takes one track. REAPER's solo-in-place keeps a folder's parents audible (the code comment in `narration_transport.lua`); whether soloing a folder parent plays its children is **not run**.

## 4. Booth design

**Mapping speaker to track.** A phrase's speaker is already on the page (`SpeakerChip`, `boothUnits.ts`, `UNKNOWN_SPEAKER`). The host maps speaker name → child track by the name rule above. With no match it falls back to the Narrator child.

**Keys.** Inventory of `commands.catalog.ts` for the Booth scope: Space (record or stop), Arrow keys and Backspace (phrase and word), R (punch and roll), PageUp/PageDown, Equal and **NumpadAdd** (larger text), Minus and **NumpadSubtract** (smaller text), V (voice sample), N and Shift+N (pickups), Escape, F11. Global single keys include B, plus Mod chords. `Numpad0` to `Numpad9`, `NumpadDecimal`, `NumpadMultiply`, `NumpadDivide` and `NumpadEnter` are free with no modifier; only `Numpad0` with Mod is bound (zoom reset). Gestures are bound by physical `code`, so they work with Num Lock off.

| Key | Proposal |
| --- | --- |
| `Numpad1`–`Numpad9` | Voice slot 1–9, in the order the chapter folder lists its children |
| `Numpad0` | Narrator |
| `NumpadDecimal` | Follow the script: the armed voice follows the next phrase's speaker |
| `NumpadAdd`, `NumpadSubtract` | Taken by larger and smaller text today. Equal and Minus still do that, so the owner can give the numpad pair to "next voice" and "previous voice", or keep text size and leave them. |

The keys are rows in the catalog (`booth.voice.1` …), so Settings lists and rebinds them and `findConflicts.test.ts` guards them.

**Showing the armed voice.** The record control gains a `SpeakerTag` in the character's colour with the slot's `KeyHint` ("Num 3"), updated from `chapter_track_state` (`thisArmed`, `armedCount`) rather than assumed. A slot strip is an `IconButton` per voice with a tooltip and an `aria-label`, a `Popover` for the voices beyond nine, and a `Toast` for a refusal (frontend-primitives rules 1 and 7). No instruction prose in flow (rule 8).

**Assignments.** Name matching needs no new file. Slot order is the folder's child order, which REAPER holds. The one new setting is the opt-in for "follow the script", a project-scope key in `settings.json` (a row in [data files](../reference/data-files.md)). An override of a character to a specific child, if the owner wants one, is a new field in `chapter-track-map.json` or a new file, and is then a wire change: schema, golden payload, row in `wireContracts.test.ts`, mock, API version ([wire contracts](../../.claude/rules/wire-contracts.md)). The `TRACK_ITEM` line gains a track GUID field and `chapter_track_state` an option to include children, both REAPER events for the table in `internal/bridge/wire.go`.

**Engine page.** The folder tree already draws nesting. A linked folder shows its children as voices, each with the character it is matched to (`SpeakerTag`) or "no character". Actions, as icon buttons: add a voice track for a character, link a child to a character. Adding a track is the nested `track_create` above.

## 5. Interaction with other features

| Feature | What breaks or holds |
| --- | --- |
| **Editing play** | `plays_at` reads the linked track's own items. A folder with items only on children fails it, and the page plays in the app with a message. Fix: count items on descendants, and prove that solo-in-place on the folder plays its children (section 6). |
| **Live items and per-word timestamps** | `chapter_track_state` lists one track's items (limit 1000). `wordtimes` maps a word to project time through those items by file path and source range, so a word on a child reads `NotInProject`. Fix: list the folder's descendants with each item's track GUID; the limit then covers the union. |
| **Recording check** | `ChapterTrackGUID` is the scope of the coverage record, and the project items are read for that GUID. It needs the union, and a take may sit on a child. |
| **Credits as chapters** | Credits are chapters with a track each ([`credits_as_chapters`](../../scripts/ci/real-reaper/scenarios_session.py)). They stay flat; no change. |
| **Delivery and mastering** | The master render is the master mix per region (`RENDER_SETTINGS` 0), not stems, so child and folder FX are in the mix by construction. A stems render would need selected-track settings the app never sets. **Not run** with children; section 6. |
| **Undo** | Option A is one "Recorded media" point per take; a switch adds one per take. The journal's `record_take` undo covers up to 12 points, and only while the take is still REAPER's last action. A "take" spanning many switches either becomes several journal entries (recommended) or its cap is raised. |
| **REAPER crash mid-take** | The saved arms live in bridge memory (`state.saved_arms`), so after a restart several children may still be armed from the `.rpp`; `arm_only` fixes it at the next start, but the Booth should show `armedCount` above 1. Whether REAPER keeps the partly recorded files is **not run**. |
| **FX chains on a range** | `apply_fx_range` is take FX on a piece, unaffected. |

## 6. Scenarios to run in real REAPER

Add to `scripts/ci/real-reaper/` and run with `run-linux-check.sh` (REAPER 7.82, JACK dummy device, as the existing scenarios). Each starts from `ci.add_track` plus `I_FOLDERDEPTH`, saves and reloads, and asserts through `env.snapshot()`.

1. `folder_children_depths`: build the folder and two children via the API, save, read the `ISBUS` lines back. Settles the hand-made fixture (#992).
2. `folder_track_create`: nested `track_create` for a last child inside an outer folder; assert depths and that the outer folder still closes.
3. `arm_child_records_child`: arm child 2 only, record 2 s, stop. One item, on child 2, none on the folder or child 1.
4. `switch_between_children`: record on child 1, `switch_record` to child 2 at the cursor, stop. Items per track, the gap between them, undo points, one `undo_last` per point.
5. `live_arm_during_take`: arm child 2 while recording on child 1, then stop. Records the outcome whatever it is; decides option B.
6. `folder_solo_plays_children`: `play_range` naming the folder, items only on children. Whether the render has the audio, and whether the unlinked chapters stay silent.
7. `child_fx_in_render`: a chain on child 2 only, `render` the region. Child 2's items carry it, child 1's do not; then a folder chain covers both.
8. `track_state_union`: `chapter_track_state` with children; item track GUIDs, the 1000 limit across the union.
9. `crash_during_take`: kill REAPER mid-take; what files and arms remain.

Harness tests (fake `reaper`) come first for each new command; the scenarios prove what the fake cannot ([reaper bridge rule](../../.claude/rules/reaper-bridge.md)). Pending: all of them. Hearing a seam between two voices, and Windows, need the owner.

## 7. Phases

| Phase | Work | Size | Risk |
| --- | --- | --- | --- |
| 0 | Scenarios 1, 3, 6, 7 only. No app change. Confirms folders, arming a child, solo and FX survive. | S | Low; may kill the plan cheaply. |
| 1 | Union reads: `chapter_track_state` with children and item track GUID; Editing play, live items, word times, recording check read the union. Flat chapters unchanged. Needs no Booth change. | L | Wire change across Lua, Go, schema, mock. Most regression surface. |
| 2 | Voices in the Booth: option A, number-pad catalog rows, record control tag, `switch_record`, name matching. | M | Key conflicts; gap on a switch. |
| 3 | Engine page: add voice track (nested `track_create`), match a child to a character. | M | `I_FOLDERDEPTH` edge cases. |
| 4 | Follow the script, then option B or C only if scenario 4's gap is too long. | M | Unproven REAPER behaviour. |

## 8. Decisions for the owner

1. Is one stop-and-restart per voice change acceptable (the gap is measured in scenario 4), or is a seamless live switch required? That decides option A+ against B or C.
2. Narrator on its own child (recommended) or on the folder itself?
3. Match a character to a track by name (recommended), or store an explicit GUID per character per chapter?
4. Number-pad keys: slots 1–9, 0 for the Narrator, and what for `+`, `-` and `.`? Give up the numpad pair for text size?
5. A character with no track: record on the Narrator child with a visible notice (recommended), or refuse until a track exists?
6. Is "follow the script" (armed voice changes with the speaker tag) wanted, or manual keys only?
7. Existing flat projects: stay flat (recommended), or offer to convert a chapter track into a folder?
8. May phase 0 run before any app work?
