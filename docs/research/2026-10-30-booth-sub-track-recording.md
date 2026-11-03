# Recording to character sub-tracks in the Booth

**Written 2026-10-30.** Issue: [#2251](https://github.com/countrymanprime/narration-studio/issues/2251) (owner request, no checklist item). **Question:** can the narrator press a number-pad key in the Booth to choose which character's track a take records on, so an FX chain on that track (the owner's example: drone chirps) covers every item the character speaks, with no per-item FX?

**Status.** A design note. The owner answered section 8 on 2026-11-02 and the mock's decisions on 2026-11-03, approving the mock. Phase 0 ran in REAPER 7.82 on Linux on 2026-11-02 (section 6a); nothing in the app is built. A REAPER behaviour below is cited to a recorded run, to section 6a, or marked **not run**.

## Recommendation

Link each chapter to a **folder track** whose children are the voices (Narrator, then one per character). Number-pad key N arms child N. Between takes that is `arm_only`, as today. During a take, REAPER 7.82 keeps recording when the arms change (section 6a, rows 7 to 9): the disarmed child's item ends and the armed child's item begins, under one "Recorded media" undo point. So a key pressed during a take switches the voice **live** (option B), which the owner prefers (decision 1). Stop, re-arm and record again (option A+) stays the fallback; it loses about as much input (section 6a) and stops the transport. Items stay whole; no split is needed. Character FX go on the child, chapter-wide FX on the folder (row 11). A flat chapter track keeps working unchanged (decision 7).

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

The folder `ISBUS` line REAPER writes was seen in phase 0 (section 6a, row 1) and matches the hand-made fixture `testdata/folders-handmade.rpp` (#992).

## 2. Target model

```text
Chapter 3            folder, linked to chapter 3      chapter-wide FX, e.g. loudness
├─ Narrator          child                            the default voice
├─ Veyra             child, named for the character   Veyra's FX
└─ Drone             child                            drone chirps FX, every item it speaks
```

- **The link stays one GUID: the folder.** `chapter-track-map.json` does not change shape. A linked track with no children behaves exactly as now.
- **Voices are children, matched by name** (decision 3). A child whose name equals a Story Bible character (or one of its aliases) is that character's track in every chapter. Names, not GUIDs, because each chapter has its own folder; the GUID would have to be stored once per chapter per character. Where no name matches, the narrator can assign a character to a child by hand; the assignment is keyed by the child's name, so it holds in every chapter folder that has a child of that name.
- **One child, several characters** (decision 3). A child such as "Extras" or "TV" holds the characters assigned to it.
- **The narrator** (decision 2). Narrator lines go to a child named Narrator, not to the folder. Items on the folder itself would run through the folder's FX together with the children's sum, so the narrator could not have FX of their own. The Narrator child can be assigned a character, for a first-person book: that character's lines then go to the Narrator child unless it has a child of its own.
- **A character with no child** (decisions 3 and 5). Nothing creates a track silently. Section 8 gives the rule.

## 3. REAPER calls, by option

| Option | Calls | What is known | Not run |
| --- | --- | --- | --- |
| **A. Arm between takes** | `SetMediaTrackInfo_Value(track, 'I_RECARM', 1)` on the chosen child and 0 on the rest (the `arm_only` command), then `CSurf_OnRecord` (`record_start`). | The commands exist and are harness-tested. Arms are not in REAPER's undo history. A stopped take is one "Recorded media" point (REAPER 7.82, Linux). Phase 0: a child records with its folder unarmed; two takes on two children from one cursor are two items and nothing splits (section 6a, rows 3 and 4). | Windows. |
| **A+. Switch during a take** | New `switch_record(track, at)`: the `roll` sequence with a different track: `OnStopButton`, `arm_only(new)`, `SetEditCurPos(at)`, `CSurf_OnRecord`. | `roll` does the same on one track. Phase 0: REAPER records again 31 to 34 ms after the stop and the play position moves at 127 to 132 ms; one undo point per stop (section 6a, rows 5, 6, 10). | Windows; a real input. |
| **B. Live arm change, no stop** (recommended) | Change `I_RECARM` while `GetPlayState()` reports recording. | Phase 0: REAPER keeps recording; the disarmed child's item ends and the armed child's begins; one undo point for the whole take (section 6a, rows 7 to 9). `record_start`, `stopped_at` and `restore_arms` assume one armed track and change (section 6b). | Windows; a real input; buffer sizes other than 1024 frames. |
| **C. Record once, then split by speaker** | Record on the Narrator child. After the stop, `SplitMediaItem` at each switch time the Booth logged, then `MoveMediaItemToTrack` for the pieces, in one undo block. | `delete_range` already does splits and moves in one undo step, and one Undo reverses it (row C3). A split keeps `P_EXT` on both halves (S0). | Switch times against the clock REAPER recorded with (`GetPlayPosition` trails `GetPlayPosition2` by about 64 ms on a 1024-frame device); the narrator pressing a key late. |
| **Not possible** | `I_RECMODE` chooses what a track records (input or its output, mono or stereo, none); it does not choose a destination. It can mute a child's recording, not redirect it. The folder `I_FOLDERDEPTH` sets structure only. | n/a | n/a |

**Creating the children.** Add a track below the folder with `InsertTrackAtIndex` and set `I_FOLDERDEPTH` (1 opens a folder, 0 changes nothing, -N closes N levels, as the track parser reads it). A new track at depth 0 after an opener swallows every later track until something closes it, so the last child needs -1, and a folder that was itself the last child of an outer folder passes its closing delta to the new last child. Each child needs the folder's `I_RECINPUT` and `I_RECMODE` copied, or it records from another input. Phase 0 ran this rule with a snippet (section 6a, row 2): `InsertTrackAtIndex` does not move the closing delta itself. `track_create` today appends at the end of the list and never nests.

**Selection and Editing play.** `SetOnlyTrackSelected` takes one track. REAPER's solo-in-place keeps a folder's parents audible (the code comment in `narration_transport.lua`). Soloing a folder parent in place plays its children and silences the next chapter (section 6a, row 13).

## 4. Booth design

**Mapping speaker to track.** A phrase's speaker is already on the page (`SpeakerChip`, `boothUnits.ts`, `UNKNOWN_SPEAKER`). The host maps a character to a child track by the name rule above. The armed voice changes only on a key or a pick (decision 6). With no match, section 8 gives the rule.

**Keys.** Inventory of `commands.catalog.ts` for the Booth scope: Space (record or stop), Arrow keys and Backspace (phrase and word), R (punch and roll), PageUp/PageDown, Equal and **NumpadAdd** (larger text), Minus and **NumpadSubtract** (smaller text), V (voice sample), N and Shift+N (pickups), Escape, F11. Global single keys include B, plus Mod chords. `Numpad0` to `Numpad9`, `NumpadDecimal`, `NumpadMultiply`, `NumpadDivide` and `NumpadEnter` are free with no modifier; only `Numpad0` with Mod is bound (zoom reset). Gestures are bound by physical `code`, so they work with Num Lock off.

| Key | Proposal |
| --- | --- |
| `Numpad1`–`Numpad9` | Voice slot 1–9, in the order the chapter folder lists its children |
| `Numpad0` | Narrator |
| `NumpadDecimal` | Open the voice list (decision 4) |
| `NumpadAdd`, `NumpadSubtract` | Next and previous voice in the list (decision 4). Taken by larger and smaller text today; Equal and Minus keep that. |

The keys are rows in the catalog (`booth.voice.1` …), so Settings lists and rebinds them and `findConflicts.test.ts` guards them.

**Showing the armed voice.** The record control gains a `SpeakerTag` in the character's colour with the slot's `KeyHint` ("Num 3"), updated from `chapter_track_state` (`thisArmed`, `armedCount`) rather than assumed. A slot strip is an `IconButton` per voice with a tooltip and an `aria-label`, a `Popover` for the voices beyond nine, and a `Toast` for a refusal (frontend-primitives rules 1 and 7). No instruction prose in flow (rule 8).

**Assignments.** Name matching needs no new file. Slot order is the folder's child order, which REAPER holds. The assignments the owner asked for (decisions 2, 3 and 7: a character to a child, the Narrator child to a character, a child for several characters, nested or flat per project) are a new persisted file or new fields, and so a wire change: schema, golden payload, row in `wireContracts.test.ts`, mock, API version ([wire contracts](../../.claude/rules/wire-contracts.md)). The `TRACK_ITEM` line gains a track GUID field and `chapter_track_state` an option to include children, both REAPER events for the table in `internal/bridge/wire.go`.

**Engine page.** The folder tree already draws nesting. A linked folder shows its children as voices, each with the character it is matched to (`SpeakerTag`) or "no character". Actions, as icon buttons: add a voice track for a character, link a child to a character. Adding a track is the nested `track_create` above.

## 5. Interaction with other features

| Feature | What breaks or holds |
| --- | --- |
| **Editing play** | `plays_at` reads the linked track's own items. A folder with items only on children fails it (section 6a, row 12), and the page plays in the app with a message. Fix: count items on descendants and solo the folder in place, which plays its children (row 13). |
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

Harness tests (fake `reaper`) come first for each new command; the scenarios prove what the fake cannot ([reaper bridge rule](../../.claude/rules/reaper-bridge.md)). Phase 0 ran 1, 3, 4, 5, 6 and 7 with snippets and the existing commands (section 6a). Pending: 2 as a bridge command, 8 (needs the phase 1 read) and 9. Hearing a seam between two voices, and Windows, need the owner.

## 6a. Phase 0 results

Run 2026-11-02 with `run-linux-check.sh` (REAPER 7.82, Linux, Xvfb, `jackd -d dummy -r 48000 -p 1024`, scratch `reaper.ini` with only `promptendrec=0`), `scripts/ci/real-reaper/scenarios_booth_voices.py`. Five runs: all 13 rows passed in the last two (one of these rows only, one of the full suite, 106 of 106 rows). Row 4 failed in the first three on the scenario's own cursor timing, which is how the stop guard below was found; row 8 was added after the first. Where runs differed the range is given. The device records silence, so these are positions and timings, not sound.

| # | Scenario | What REAPER did |
| --- | --- | --- |
| 1 | `folder_depths` | Saved, a folder with three children and a flat track after it wrote `ISBUS 1 1`, `ISBUS 0 0`, `ISBUS 0 0`, `ISBUS 2 -1`, `ISBUS 0 0`. Read back: `I_FOLDERDEPTH` 1, 0, 0, -1, 0; `GetTrackDepth` 0, 1, 1, 1, 0; `GetParentTrack` the folder for the three children. A new track reads `I_RECARM` 0, `I_RECMODE` 0 (record input) and `I_RECINPUT` 0 (input 1, mono). |
| 2 | `folder_add_last_child` | A folder (`Chapter 3`) that is the last child of an outer folder (`Book`) gained a new last child: inserted after the old last child, the old one's `-2` moved to the new one and the old one set to 0. Both folders still close (`ISBUS 2 -2` on the new child, depths 0, 1, 2, 2, 0) after save and reload. A bare `InsertTrackAtIndex` after a closing child leaves the new track at delta 0 and depth 0, outside the folder: the app has to move the delta. |
| 3 | `record_on_child` | `arm_only` on a child arms only it; the folder stays unarmed during the take. One item, on the child, from the cursor; `record_stop` reports 1 undo point. |
| 4 | `two_children_same_cursor` | Two takes from 2.0 s, one per child: two items, one take each, nothing split, nothing on the folder. The bridge's stop guard (`guard_stop`, 15 defer cycles) moved a `set_cursor` to the take's start, sent at once after the stop, back to the stop; sent 0.8 s later it held. |
| 5 | `switch_in_reaper` | Stop, disarm old, arm new, cursor to the stop, `CSurf_OnRecord`, in one snippet: the calls take 1.3 to 2.3 ms; `GetPlayState` reads stopped right after `OnStopButton` and recording right after `CSurf_OnRecord`; the next defer cycle sees recording at 31 to 34 ms, and the play position moves at 127 to 132 ms (4 cycles). The new item starts at the heard position read before the stop, 0 to 21 ms before the old item's end. |
| 6 | `switch_over_bridge` | `record_stop`, `arm_only`, `record_start` as three bridge commands, three switches: 152 to 158 ms per switch, each command about 51 ms, which is the driver's 50 ms poll. Seams 0 ms on the timeline (`record_start` begins where `record_stop` left the cursor); 1 undo point per stop. |
| 7 | `live_arm_switch` | During a take, the recording child disarmed and another armed in one call: REAPER kept recording. Switched at 2.600 s (heard): the old item ends at 2.600 or 2.621 s and the new one starts 64 ms later in every run, a stretch recorded on neither (three 1024-frame blocks at 48 kHz). The take is one "Recorded media" point: one Undo removed both items. |
| 8 | `live_arm_overlap` | The new child armed first, the old one disarmed 100 ms later: the items overlap by 21 to 64 ms instead. |
| 9 | `live_arm_add` | A second child armed during a take, the first left armed: both record; the new item starts about 85 ms after the heard position at the arm, the first runs to the stop. |
| 10 | `undo_after_switch` | Two takes on two children with stop-and-restart: two "Recorded media" points. Undo 1 removes the second child's item only, Undo 2 the first. Arms and folder depths are not in the undo history. |
| 11 | `fx_child_and_folder` | `apply_fx_chain` with a -12 dB chain on a child: that child -12.0 dB in the rendered mix, its sibling +0.0 dB. The same chain on the folder too: -12.0 dB and -24.1 dB. |
| 12 | `folder_reads_today` (replaced by `folder_reads` in phase 2) | A folder with items only on its children: `play_range` naming the folder is refused ("The chapter's track has no audio at that time in the REAPER project."); `chapter_track_state` on the folder lists 0 of 0 items; on a child, its item. `play_range` on a child plays it alone and puts the tracks back. |
| 13 | `folder_solo_plays_children` | The folder alone soloed in place (`I_SOLO` 2): both children are in the rendered mix (0.30 each), the flat chapter after the folder is silent (0.000). |

**Input lost on a switch.** Every way loses some input. Stop and restart loses what is spoken between the stop and the new recording: 31 to 132 ms inside REAPER (row 5), more over the bridge (row 6, where the driver's polling sets the figure; the host's own latency was not measured). The live switch loses 64 ms at a 1024-frame buffer (row 7) and keeps the transport running. Arming before disarming loses nothing but records 21 to 64 ms on both children (row 8), which the bridge would trim after the stop. Pressing the key in a pause between lines makes any of these silence.

**What REAPER cannot do.** It cannot keep a single item across two tracks or move a recording that is still in progress (a recording is not an item until it stops). The nearest behaviour is row 7: one undo point and two items that meet at the switch.

**Not run.** Windows and ASIO or WASAPI; a real microphone; buffer sizes other than 1024 frames (whether the 64 ms scales with the buffer is not measured); REAPER killed mid-take (scenario 9); `chapter_track_state` across children with the 1000-item limit (scenario 8, needs phase 1); a stems render; a `track_create` that nests (scenario 2 ran as a snippet).

## 6b. What phase 0 changes in the bridge plan

- **Live switch.** A new `switch_voice(track)` command, accepted only while a recording this bridge started runs: arm the new child, disarm the old one, remember the voice change. `record_start`'s single-armed-track check stays for the start. `stopped_at` reads the item on the last voice's track. `restore_arms` already puts back every arm it saved. The take stays one undo point, so `record_take` undo needs no new cap. Built in phase 4a; the real-REAPER scenario `switch_voice_bridge` (2026-11-03, REAPER 7.82, Linux, JACK dummy) measured a switch at 2.707 s answered in 51 ms over the driver, 64 ms recorded on neither voice, one undo point that one Undo removed, the cursor at the end of the last voice's item and every arm put back.
- **Stop guard.** A voice re-take from the same place within half a second of a stop is moved back by `guard_stop` (row 4). `set_cursor` and `punch_to` should end the guard, as `record_start` does. This affects flat chapters too. Done in phase 4a: both end it; row 4 now holds at once (2026-11-03).
- **Nested `track_create`.** Insert after the folder's last child and move its closing delta (row 2), copying `I_RECINPUT` and `I_RECMODE`.
- **Editing play.** `plays_at` counts the folder's descendants, and `isolate` solos the folder in place (rows 12 and 13).

## 7. Phases

Phase 0 is done (section 6a). The rest is re-planned with the owner's answers: option B replaces A+ in phase 2, and "follow the script" is dropped (decision 6). The plan with files, wire changes and mockups is drafted for the owner's review before any build.

| Phase | Work | Size | Risk |
| --- | --- | --- | --- |
| 0 | Scenarios in real REAPER. No app change. **Done 2026-11-02.** | S | n/a |
| 1 | Union reads: `chapter_track_state` with children and item track GUID; Editing play, live items, word times, recording check read the union. Flat chapters unchanged. Needs no Booth change. | L | Wire change across Lua, Go, schema, mock. Most regression surface. |
| 2 | Voices in the Booth: number-pad catalog rows, record control tag, `switch_voice` (option B), name matching, the no-track rule. | M | Key conflicts; the bridge's one-track take model. |
| 3 | Engine page: add voice track (nested `track_create`), assign a character to a child. | M | `I_FOLDERDEPTH` edge cases (row 2). |

## 8. Owner decisions

Answered 2026-11-02.

1. **Switching.** A live switch is preferred if it is not hard; otherwise stop, disarm the old track, arm the new one and record. Phase 0 shows REAPER switches live (rows 7 to 9), so phase 2 plans option B, with A+ as the fallback.
2. **Narrator.** A child of the chapter folder. The Narrator child can be assigned a character (first-person books).
3. **Matching.** By name. Where no name matches, the narrator can change the match when linking. In the Booth, a character in the scene with no track gets one made for them (see the rule below). A number with no track asks who is in it. A track such as "Extras" or "TV" can hold several characters.
4. **Number pad.** `Numpad1`–`Numpad9` voices 1–9 and `Numpad0` the Narrator, as proposed. `NumpadAdd` and `NumpadSubtract` move up and down the voice list (Equal and Minus keep text size); `NumpadDecimal` opens the list to choose from.
5. **A character with no track.** The section 2 recommendation (record on the Narrator child with a notice), combined with decision 3 as below.
6. **Manual only.** The armed voice never follows the speaker tag: re-takes happen, and items may be moved later.
7. **Flat projects stay flat.** Nested or flat is the narrator's choice per project; nothing converts.
8. **Phase 0** may run first. It ran (section 6a).

**How decisions 3 and 5 combine.** A take never waits for a track, and nothing makes a track without a press.

- **Stopped, a character chosen** (from the list, or the next or previous voice) with no child by name, alias or assignment: the Booth asks who records them, with three answers: make a track named for the character (the default), assign the character to an existing child (an "Extras" track among them), or record on the Narrator child. The first two store the match; the third arms the Narrator child and shows the notice on the record control while that voice is chosen.
- **Recording, the same choice:** no question mid-take. The Narrator child is armed live and the notice shows; after the stop, the notice offers the first two answers. What was recorded stays on the Narrator child.
- **A number key with no child behind it, while stopped:** "Who is in it?" lists the chapter's characters, those with lines in this chapter first. One character makes a track named for them; several make one track, named "Extras" unless the narrator types another name, holding them all. The new track is the next child, so it takes the next free number. While recording, the key is refused with a toast and the take goes on.
- **Opening a chapter in the Booth** whose folder lacks children for characters with lines in it: each such character's row in the side list shows an add-track button in place of its key. Nothing is made without a press (decision B below).
- **A flat chapter:** the voice keys are off and say why in their tooltip.

**The mock's decisions** (2026-11-03, [#2251 comment](https://github.com/countrymanprime/narration-studio/issues/2251#issuecomment-6594214485), relayed by the coordinator; the [mock](mockups/booth-voices/README.md) is approved):

- **A.** One voice control on the record bar, beside Cold read, opening the voice list.
- **B.** A character in the chapter with no track shows an add-track button in its side-list row; nothing is made without a press.
- **C.** A number key with no track while recording changes nothing and shows a brief "No track on Num 7" message; while stopped it asks "Who is in it?".
- **D.** Tracks are matched to characters on a Voices card on the Engine panel.
- **E.** The live switch arms the new child and disarms the old one together, leaving about 64 ms unrecorded at a 1024-frame buffer (section 6a, row 7).
- **F.** Voice keys follow the child order in the REAPER folder; the Narrator child is always 0.
- **G.** A new project is flat until Voice folders is switched on for it.
