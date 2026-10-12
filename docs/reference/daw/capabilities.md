# DAW capabilities: what each one is and what it returns

The DAW-neutral catalog behind [the DAW port](../../architecture/daw-integration.md#the-daw-port). One section per capability, in the order of `dawport.Capabilities()`. Each states the intent, the result a conforming engine returns, how each engine maps to it, and where it was checked. [The matrix](matrix.md) says which engine declares which level. A test fails when this page and the port's catalog list different capabilities (`apps/desktop/internal/dawport/dawportdoc/reference_doc_test.go`).

Facts about REAPER, Audacity and the built-in recorder are copied from the pages linked in each section. Each "Checked" line separates three kinds of evidence: the **harness** (a fake `reaper` under Lua 5.4, which proves the bridge's logic and nothing about REAPER), a **run in the engine** (a spike or a scripted pass, with its version), and the **verification pass row**, which defines the expected result and has not run yet where the line says pending. Where a line says "not checked", no run in the engine backs the statement: it comes from published documentation or from the code.

## Rules every capability follows

- **A capability is declared at a level**: Unsupported, Not yet available, Experimental (built, not through the owner's verification pass, off unless the narrator turns it on) or Supported ([port levels](../../../apps/desktop/internal/port/port.go)). Promoting one is a one-line declaration change after the owner's pass ([ADR 0400](../../adr/0400-promoting-a-reaper-command-from-experimental-to-supported-is-a-one-line-daw-port-declaration-change.md)).
- **The resolver decides what is usable now**, from the declaration, whether the engine is answering and the narrator's `DAW.capability.<name>` setting. A refusal carries a reason (`standalone`, `not_running`, `experimental_off`, `turned_off`, `not_yet`, `unsupported`, `failed`) and a sentence for the narrator; a control never words its own ([ADR 0300](../../adr/0300-every-daw-is-reached-through-one-port-of-small-role-interfaces-and-callers-ask-a-resolver-what-it-supports.md)).
- **A capability can require another.** An engine declares what each of its capabilities needs (`dawport.Requirer`; the catalogue's `Spec.Requires` adds nothing today). The resolver checks a requirement after the capability's own declaration and settings: a capability whose requirement is unavailable is refused with the requirement's reason, in one sentence the engine words. A capability the engine declares destructive stays usable and destructive without its requirement, and is not destructive with it. Audacity's takes, `punch`, `stack_takes`, `cut_range` and `fx_range` require `backups`.
- **A mutation runs only on the narrator's action** and, in REAPER, in one undo block that reports failure without applying unrelated changes ([DAW integration](../../architecture/daw-integration.md#reaper-rules)).
- **An item is found by identity, never by position.** A GUID that no longer resolves is stale and nothing is changed; no command falls back to a neighbouring item or to the time a finding had when it was made ([going to and looping a finding](../../architecture/reaper-navigation.md)).
- **Nothing happens while the engine is recording** for the commands that move the cursor or write markers.
- **The two capabilities that make the engine render** (`render_with_fx`, `macro_render`) need the narrator's approval for that one render. REAPER's script also uses the token up and writes only into an empty folder the host made; the Audacity role checks only that an approval is present, and the mastering row owns the destination rule.
- **Asynchronous roles** return an error only when the request could not be handed to the engine; the answer is an event tagged with the run ID. **Synchronous roles** return when the engine has answered ([roles](../../../apps/desktop/internal/dawport/roles.go)).

## Capabilities

### `review`

- **Intent:** compare a recording with the manuscript and carry the findings into the engine as markers or labels.
- **Role:** `ReviewSession`, asynchronous.
- **Result:** `PrepareReview` answers `COMPARE_PREPARED` with the paths of the manifest, manuscript and diff, the count of audio items listed, and the project change count at that moment. `InspectFindings` answers `COMPARE_MARKER` per finding, then `COMPARE_INSPECTED` with the total and how many are already marked. `ExportFindings` answers `COMPARE_EXPORT_MARKER` per finding, then `COMPARE_EXPORTED` with added and skipped counts; it skips a finding the same active take already marks within 0.15 s with the same issue prefix, and writes only when the narrator selects Export markers.
- **REAPER:** `prepare_compare`, `inspect_compare_results`, `export_compare_markers`, `jump_to_compare_marker` ([the bridge](../../architecture/reaper-bridge.md#commands)).
- **Audacity:** every request is refused with the "Audacity support is not available yet" sentence ([ADR 0144](../../adr/0144-a-launch-names-its-daw-with-daw-and-an-audacity-launch-opens-no-reaper-bridge.md)); the review needs the recorded audio from the engine, which the adapter does not read.
- **Checked:** harness, `integrations/reaper/tests/compare_test.lua`.

### `navigate`

- **Intent:** put the engine's cursor on a finding, loop the audio around it, and stop the loop.
- **Role:** `Navigator`, synchronous (`Navigate`, `Loop`, `StopLoop`).
- **Result:** `Navigate` returns the project time the cursor is at. `Loop` returns the window it looped, which is the finding padded by 2 s each side (never below 0). `StopLoop` returns what it restored and what it kept. A stale finding (`item`, `take` or `range`) changes nothing. Nothing makes an undo point.
- **REAPER:** `navigate_item`, `loop_context`, `stop_loop`. Navigate selects only the finding's item. Loop sets the time selection and loop points, turns repeat on and plays; Stop puts back the narrator's time selection, loop points and repeat, and keeps a value the narrator changed while listening ([going to and looping a finding](../../architecture/reaper-navigation.md)).
- **Audacity 3.x:** `Navigate` stops playback and puts the cursor at the target's time. `Loop` selects the padded time and plays it looped (`SelectTime`, then `PlayAtSpeedLooped`). `StopLoop` stops playback and restores nothing, because Audacity keeps no loop state. A target that names an item is refused: Audacity has no items or takes ([session.go](../../../apps/desktop/internal/dawport/audacity/session.go)).
- **Checked:** REAPER, a scripted REAPER 7.80 run and the harness (`navigation_test.lua`). Audacity, not checked: built from the published spec and waiting on the owner's pass ([ADR 0355](../../adr/0355-audacity-is-driven-over-its-scripting-pipe-built-from-the-published-spec-and-verified-by-the-owners-pass.md)).

### `markers`

- **Intent:** add one marker for an accepted finding.
- **Role:** `MarkerWriter`, synchronous (`AddMarker`).
- **Result:** a `MarkerResult` saying whether a marker was added. The duplicate rule differs by engine: REAPER skips a marker when the same active take has one within 0.15 s with the same issue prefix; Audacity skips a label with the same text within 0.15 s.
- **REAPER:** `add_finding_marker` adds a take marker at the source time, so it follows the item, in one undo point. Its name is the finding's kind plus the script's words and the recorded words, eight words at most each, in that kind's colour. Stale findings and recording are refused as for `navigate`.
- **Audacity 3.x:** adds one label named for the finding at the target's start unless a label with the same text is within 0.15 s. Labels have no colour, so the colour is not used. Labels live on a track named "Narration Utils", made when the project has none.
- **Checked:** REAPER, harness (`finding_marker_test.lua`). Audacity, not checked.

### `pickups`

- **Intent:** keep a list of lines to re-record, walk it, resolve entries and reopen them, and read every pickup marker back with its state.
- **Role:** `PickupList`, asynchronous.
- **Result:** `import_pickups` answers `PICKUPS_IMPORTED` with added, already-there and invalid counts. `export_pickups` answers `PICKUPS_EXPORTED` with the path and count. `next_pickup` answers `PICKUP_NEXT`, or an error when none remain. `resolve_pickup` answers `PICKUP_RESOLVED` and `reopen_pickup` answers `PICKUP_REOPENED`. `list_pickup_markers` writes every pickup marker, `open` or `done`, to the file it names and answers `PICKUP_MARKERS_LISTED` with the path and both counts; the host reads back only the file it asked for. `count_pickups` answers `PICKUPS_COUNTED` with remaining and total.
- **REAPER:** the commands of the same names ([the bridge](../../architecture/reaper-bridge.md#commands)).
- **Audacity:** none. Take management has no direct Audacity equivalent ([DAW integration](../../architecture/daw-integration.md#audacity-boundary)).
- **Checked:** REAPER, harness (`pickups_test.lua`). `reopen_pickup` and `list_pickup_markers`: not checked in REAPER; expected result is rows C8 and C9 of [the verification pass](../../operations/reaper-verification-pass.md#part-c-the-studio-next-daw-commands-not-scripted-yet).

### `line_identity`

- **Intent:** record which manuscript line each recorded item reads, and read it back.
- **Role:** `LineStamper`, asynchronous.
- **Result:** `LINES_*` events. Identity is stored on items as namespaced extension data; `overwrite` false keeps an existing stamp ([manuscript line identity](../../architecture/manuscript-line-identity.md), [ADR 0026](../../adr/0026-manuscript-line-identity-in-item-extension-data.md)).
- **REAPER:** `stamp_item_lines`, `read_line_ids`.
- **Audacity:** none (take management).
- **Checked:** REAPER, harness (`line_identity_test.lua`). What REAPER does with the extension data on save, split and copy is checked in [spike S0](../../research/reaper-spike-s0-item-extension-data.md).

### `render_config`

- **Intent:** set the engine's render settings so each chapter renders to its own file, without rendering.
- **Role:** `RenderConfigurer`, asynchronous.
- **Result:** `RENDER_CONFIGURED` with the folder, the count of targets and their names. The command never invokes a render.
- **REAPER:** `configure_chapter_render`. The harness asserts it never calls `Main_OnCommand` or reads render stats.
- **Audacity:** none (take management).
- **Checked:** REAPER, harness (`render_test.lua`); render keys are in [spike S5](../../research/reaper-spike-s5-render-details.md).

### `cleanup_tools`

- **Intent:** open one of the engine's own cleanup dialogs on the selected items. The app edits nothing itself.
- **Role:** `CleanupLauncher`, asynchronous.
- **Result:** `CLEANUP_LAUNCHED` with the tool key and the action's name. Only an allow-listed tool (`repair_pops_clicks`, `magnolius_declick`) is launched; a launch is one action call and no edit ([ADR 0146](../../adr/0146-cleanup-launchers-open-an-allow-listed-reaper-action-found-by-its-name-and-change-nothing-themselves.md)).
- **REAPER:** `launch_cleanup_tool`.
- **Audacity:** not built.
- **Checked:** REAPER, harness (`cleanup_test.lua`). The check in REAPER is pending with the owner.

### `retake_lanes`

- **Intent:** play one retake of a line on a fixed-lane track.
- **Role:** `RetakeLanePicker`, asynchronous.
- **Result:** `RETAKE_LANE_PICKED` with the line, the item GUID and the 0-based lane. One lane value changes, in one undo block, and nothing else ([retake lanes](../../research/reaper-retake-lanes.md)).
- **REAPER:** `pick_retake_lane`.
- **Audacity:** not built.
- **Checked:** REAPER, harness (`retake_lanes_test.lua`); lane semantics observed in [spike S7](../../research/reaper-spike-s7-fixed-lanes.md). The command's own check in REAPER is pending with the owner.

### `project_state`

- **Intent:** ask for the live change count and the current project's saved file.
- **Role:** `ProjectStateReader`, asynchronous.
- **Result:** `PROJECT_STATE` with the change count and the project path.
- **REAPER:** `project_state`.
- **Audacity:** not built.
- **Checked:** REAPER, harness (`project_state_test.lua`).

`DawProjectState()` and its `daw_project_state_changed` event answer the saved project against the live one without this command: `{savedAt, unsavedChanges, playState, playPosition}`, read through the `heartbeat` capability (`apps/desktop/bindings_daw_projectstate.go`, `internal/dawport/projectstate.go`).

- `savedAt` is the host's stat of the `.rpp` the heartbeat names, as a local date and time to the minute; null when the project was never saved or the engine keeps no saved project (the built-in recorder, and Audacity until it reports one).
- `unsavedChanges` compares the heartbeat's change count with a baseline taken at the first count and again at each save (the `.rpp`'s modification time moves), as the chapter sync watcher does ([ADR 0210](../../adr/0210-chapter-sync-watches-the-saved-rpp-and-reapers-edit-counter-and-sends-reaper-nothing.md)). The `unsaved` field of the heartbeat and of `chapter_track_state` means "never saved", not this.
- `playState` is `stopped`, `playing` or `recording`, and `playPosition` is the heartbeat's position while playing or recording, 0 when stopped. It is a display value, not an anchor for a word.
- With no engine, the engine not answering or `heartbeat` turned off, the payload is stopped, 0, null, false. The event goes out from the same `transcriptLoop` tick as `daw_transport_changed`, on the first tick and then only on a change.

### `take_create`

- **Intent:** add a chosen read as a take of an existing item, from a source range of another item.
- **Role:** `TakeCreator`, asynchronous.
- **Result:** `TAKE_CREATED` with the target item and the new take's GUID, or `TAKE_STALE` when the item is gone. One undo step.
- **REAPER:** `create_take`.
- **Audacity:** none (take management).
- **Checked:** REAPER, harness (`take_review_test.lua`). The check in REAPER is pending with the owner ([take review](../../utilities/take-review.md)).

### `heartbeat`

- **Intent:** know without asking whether the engine is answering, which project it has open, whether that project has unsaved changes, its change count, and the transport state.
- **Role:** `Heartbeat`, synchronous reads of what the engine last reported.
- **Result:** `Reachable`, `CurrentProject`, `Matches`, `ChangeCount` and `Transport`. The heartbeat carries the transport and is sent at once when it changes ([ADR 0305](../../adr/0305-the-daw-heartbeat-carries-the-transport-and-is-sent-at-once-when-it-changes.md)).
- **REAPER:** the bridge's reachability heartbeat ([the bridge](../../architecture/reaper-bridge.md#reachability-heartbeat)).
- **Audacity:** not built.
- **Checked:** expected result is row A1 of [the verification pass](../../operations/reaper-verification-pass.md#the-rows): the change count is present, whole, and rises after a move, a marker and a save; the run in REAPER is pending with the owner ([#510](https://github.com/countrymanprime/narration-utils/issues/510)).

### `project_read`

- **Intent:** read a saved project's tracks and items with the engine closed.
- **Role:** `ProjectReader`, synchronous (`ReadProject(path)`).
- **Result:** the project's tracks, chapter links and items. Needs no running engine.
- **REAPER:** the Go `tracks` package parses the `.rpp` file ([Tracks](../../utilities/tracks.md)).
- **Audacity:** not built; Audacity's project format is not read.
- **Built-in recorder:** Unsupported, with "The built-in recorder keeps no saved project.": its takes are files in the project's Recordings folder ([built-in recorder](builtin-recorder.md)).
- **Checked:** REAPER, Go tests in `apps/desktop/internal/tracks`.

### `track_state`

- **Intent:** read one track's arm and record state, its items, and the transport.
- **Role:** `TrackStateReader`, synchronous.
- **Result:** `TRACK_STATE` (play state, edit cursor, play position, project path, unsaved, change count, armed flags, record input), a `TRACK_ITEM` per item (at most 1000), then `TRACK_STATE_END`. A track that is gone answers `TRACK_STALE`. An empty GUID answers the transport only. No undo point and the change count does not move.
- **REAPER:** `chapter_track_state`.
- **Audacity:** not built.
- **Checked:** harness (`track_state_test.lua`); expected result is rows A2 and A3 of the verification pass; the run in REAPER is pending with the owner ([#510](https://github.com/countrymanprime/narration-utils/issues/510)).

### `track_select`

- **Intent:** select one chapter's track in the engine.
- **Role:** `TrackSelector`, synchronous.
- **Result:** `TRACK_SELECTED`; only that track is selected afterwards. An unknown or empty GUID answers `TRACK_STALE` and leaves the selection as it was. No undo point.
- **REAPER:** `select_track`.
- **Audacity:** not built.
- **Checked:** harness (`track_select_test.lua`); expected result is row A11; the run in REAPER is pending with the owner ([#510](https://github.com/countrymanprime/narration-utils/issues/510)).

### `record`

- **Intent:** arm one track, start and stop recording on it, and learn when the narrator stops it in the engine.
- **Role:** `Recorder`, synchronous, with an `OnRecordEnded` callback. `RecordStart(ctx, guid, opts)` takes a start rule: `AtEnd` first moves the cursor to the end of the track's last item, the default leaves it. The host's Record arms the chapter's track alone and then starts with `AtEnd`.
- **Result:** `ARMED` with how many other tracks were disarmed, `RECORD_STARTED` with the position once the engine reports recording, `RECORD_STOPPED`, or `RECORD_NOT_OURS` when no recording this bridge started is running. If the narrator stops it in the engine, `RECORD_ENDED` follows. Recording is refused with two tracks armed, with a different track armed, and while playing. Arming makes no "Narration Utils" undo point.
- **REAPER:** `arm_only`, `record_start`, `record_stop`.
- **Audacity:** not built.
- **Built-in recorder:** Experimental. `ArmOnly` arms nothing (no track); `RecordStart` records a new take on the narrator's chosen microphone and ignores the track and start rule; `RecordStop` asks the take to end; `OnRecordEnded` never fires ([built-in recorder](builtin-recorder.md)). Not checked with a device: the owner's microphone pass is pending on [#510](https://github.com/countrymanprime/narration-utils/issues/510).
- **Checked:** harness (`transport_test.lua`); expected result is rows A4 and A5 (unattended) and Part B (with an audio device); the run in REAPER is pending with the owner ([#510](https://github.com/countrymanprime/narration-utils/issues/510)).

### `punch`

- **Intent:** put the cursor a pre-roll before a word, read the play position, and roll again while recording: record again from an earlier time and keep the earlier audio.
- **Role:** `Puncher`, synchronous. `Roll` answers a `Result`.
- **Result:** `PUNCHED` with the cursor at `max(0, time - pre-roll)`, in view, without starting playback. Refused while recording and for a pre-roll out of range. `PLAY_POSITION` reports the play state, the position being heard, the position being processed and the cursor; while recording the state is 5. A roll is ok and changed, with the earlier audio kept as a take; it is refused, changing nothing, when the app is not recording on that track, for a time that is not finite, is negative or is past where the recording is now, and when the engine's own recording setting would not keep the earlier audio (the refusal names the setting; the app never changes it). A track that is gone is refused stale. A roll that stopped the recording but could not record again is not ok and changed, never a refusal, and says the recording ended.
- **Undo:** a punch and a play position add none. A roll opens no undo block of its own, so `undoSteps` is 0; the points the engine adds for the recorded media are its own ([ADR 0860](../../adr/0860-a-roll-keeps-the-earlier-audio-as-a-take-and-a-range-cut-a-chain-on-a-range-and-stacking-move-audio-and-never-delete-it.md) point 1).
- **Depth:** an engine where a roll replaces audio declares `destructive` and the page asks before rolling; the role never asks, and the `DawRoll` binding refuses until the page sends the narrator's confirmation.
- **REAPER:** `punch_to`, `play_position`, `roll`. Mode `native`, not destructive: the roll stops the recording, moves the cursor and records again, so the new pass overlaps the earlier one, and refuses unless "New recording that overlaps existing media items" is "Splits existing items and creates new takes" ([REAPER](reaper.md#roll)).
- **Binding:** `DawRoll(chapterID, at, confirmed)` answers the `Result` (`apps/desktop/bindings_daw_roll.go`); the UI calls it as `DawClient.roll`. The page sends a chapter id, a time and whether the narrator confirmed; the host sends the chapter's one confirmed link. The resolver's refusal comes first, then a time that is not finite or is negative, a chapter with no link (`has no linked track`), the confirmation ("This will replace the audio from here on. Confirm to continue.") where `punch` is destructive, and a time past the play position read just before; nothing is sent on any of them. Where `punch` is not destructive, `confirmed` is ignored.
- **Audacity 3.x:** Experimental, requiring [`backups`](#backups) (SN-D83). A roll records over the audio, so `punch` is destructive while backups are unavailable and not destructive while they are, as in [the Studio Next mock](../../research/mockups/studio-next/src/selectors/daw.ts) ("Audacity's roll is non-destructive exactly when backups are on"). `Roll` stops the recording, backs up the track from the roll point to its end, and records again with Audacity's Punch and Roll (`apps/desktop/internal/dawport/audacity/steps_roll.go`); with no backups it records over without one. Punching in and the play position are not built for Audacity and answer the "not available yet" sentence.
- **Checked:** harness (`punch_test.lua`, `roll_test.lua`); expected result is rows A9b and A9c; the run in REAPER is pending with the owner ([#510](https://github.com/countrymanprime/narration-utils/issues/510)). The heard-versus-processed gap is community research, not a measurement made here ([REAPER transport timing](../../research/reaper-transport-timing.md)). Roll: not checked; expected result is row C2 of [the verification pass](../../operations/reaper-verification-pass.md#part-c-the-studio-next-daw-commands-not-scripted-yet), and the QA pass ([#1495](https://github.com/countrymanprime/narration-utils/issues/1495)) checks it. Audacity: not checked; expected result is Part C row C6 of [the Audacity pass](../../operations/audacity-verification-pass.md#part-c-unattended-after-part-a).

### `regions`

- **Intent:** create or update chapter and credits regions.
- **Role:** `RegionWriter`, synchronous.
- **Result:** `REGIONS_CREATED` with counts created, existing, invalid, updated, ambiguous and failed. Sending the same list twice creates none the second time; with `update` on, a moved end moves the region and keeps its number and colour. One undo point.
- **REAPER:** `create_regions`.
- **Audacity:** not built.
- **Checked:** harness (`regions_test.lua`); expected result is row A9; the run in REAPER is pending with the owner ([#510](https://github.com/countrymanprime/narration-utils/issues/510)).

### `takes`

- **Intent:** make one take of an item the active one; hide (mute, never delete) the item's other takes; cut a take that reads its line twice into two takes of one item.
- **Role:** `TakeSelector`, synchronous (`SetActiveTake`; `HideTakes` answers a `Result`). An engine that can cut a take also makes its takes role a `TakeSplitter` (`SplitTake` answers a `Result`); the takes level, toggle and refusals cover it.
- **Result:** `ACTIVE_TAKE_SET` with whether it changed; a take or item that is gone answers `ITEM_STALE` with the reason and changes nothing. One undo point. `HideTakes` answers `Muted N other takes` with one undo point, or unchanged with none when every other take is already hidden; a gone item or kept take is refused with the `stale` code. `SplitTake(item, take, at)` answers changed with one undo point; a gone item or take, or a cut no longer inside the item, is refused with the `stale` code; a take the engine cannot cut is refused with its sentence. Nothing is deleted.
- **REAPER:** `set_active_take`; `hide_takes`, which sets each other take's volume (`D_VOL`) to 0 with the old volume saved in the take's `P_EXT`, makes the kept take active (giving it back its volume if an earlier hide muted it), in one undo block, and deletes, moves and re-sources nothing. `split_take` (Experimental) adds a take that plays the same file from the cut and ends the item at the cut, in one undo block, so the second read is a take on the first read's spot; no other item moves, so the second read's place is left empty. It refuses an item with more than one take, a fixed-lane track, a MIDI take, a changed playback rate, a second read longer than the first, and a missing file. Refused while REAPER records.
- **Audacity 3.x:** Experimental, requiring [`backups`](#backups): Audacity keeps no takes, so it has them only as backups ([PRD decision DQ-18](../../prds/studio-next-daw-ports-and-capabilities.prd.md#decisions)). Refused with backups' reason while they are unavailable: "Keeping takes needs Audacity backups. Turn on Audio backups in Settings." Setting the active take, hiding takes and splitting a take are not built for Audacity and answer the "not available yet" sentence; a roll keeps the earlier audio in Backups ([`punch`](#punch)).
- **Binding:** `WorkspaceHideTakes(chapterID, firstToken, lastToken, keepCandidateID)` answers the `Result` (`apps/desktop/bindings_workspace_hide.go`, `internal/passagetakes/hide.go`); the UI calls it as `DawClient.hideTakes`. The page sends a chapter id, token indices and an id `WorkspaceTakes` offered; the host reads the item and kept take GUIDs from the saved project. The resolver's refusal comes first, and nothing is sent on any refusal. An id the host does not offer, or a passage whose item the saved project no longer has, is refused with the `stale` code. Only a take of the passage's own item can be kept. `DawSplitTake(chapterID, takeID, at)` answers the `Result` (`apps/desktop/bindings_daw_split.go`); the UI calls it as `DawClient.splitTake`. The host looks `takeID` up among the takes on the chapter's linked track as `chapter_track_state` reads it now, checks the cut is inside that take, and sends the item and take it read. The resolver's refusal comes first; a take the track does not hold, or a cut outside it, is refused with the `stale` code, and nothing is sent on any refusal.
- **Built-in recorder:** Experimental. `SetActiveTake(line, take)` marks the named take the keeper of its line; the audio file is not touched ([built-in recorder](builtin-recorder.md)). `HideTakes` changes nothing: only the kept take plays. `SplitTake` is refused: every take file in the Recordings folder is a listed take, so two takes cut from one would be listed beside the whole file unless the recorder deleted or rewrote it, which it never does.
- **Checked:** harness (`workspace_test.lua`, `takes_test.lua`); expected result of `set_active_take` is row A6; the runs in REAPER are pending with the owner ([#510](https://github.com/countrymanprime/narration-utils/issues/510)). `hide_takes`: not checked in REAPER; expected result is row C1 of [the verification pass](../../operations/reaper-verification-pass.md#part-c-the-studio-next-daw-commands-not-scripted-yet). `split_take`: harness (`split_take_test.lua`); not checked in REAPER, pending with the owner on the QA pass ([#1495](https://github.com/countrymanprime/narration-utils/issues/1495)).

### `fx_chains`

- **Intent:** list the narrator's FX chain files and apply a chain to a track.
- **Role:** `FXManager`, synchronous.
- **Result:** `FX_CHAIN` per chain then `FX_CHAINS_LISTED`; `FX_CHAIN_APPLIED` with the number added. A name outside the chains folder is refused before anything changes. Each write is one undo point.
- **REAPER:** `list_fx_chains`, `apply_fx_chain`. The host stopped sending `list_fx` and `add_take_fx` in [#1661](https://github.com/countrymanprime/narration-utils/issues/1661); their Lua handlers go with [#1311](https://github.com/countrymanprime/narration-utils/issues/1311).
- **Audacity:** not built.
- **Checked:** harness (`workspace_test.lua`); expected result is rows A7, A8 and A8b; the run in REAPER is pending with the owner ([#510](https://github.com/countrymanprime/narration-utils/issues/510)).

### `item_gain`

- **Intent:** match levels by changing an item's gain.
- **Role:** `GainAdjuster`, synchronous.
- **Result:** `GAIN_ITEM` per item with the volume before and after, then `GAIN_APPLIED`. The gain multiplies the item's existing volume, so the narrator's own trim is kept. An unknown item answers `GAIN_STALE`. One undo point.
- **REAPER:** `apply_item_gain`, reached through the host's `LevelMatchPreview` and `LevelMatchApply` bindings. Experimental until the pass.
- **Audacity:** not built.
- **Checked:** harness (`level_normalize_test.lua`); expected result is row A14; the run in REAPER is pending with the owner ([#510](https://github.com/countrymanprime/narration-utils/issues/510)).

### `render_with_fx`

- **Intent:** render chapter regions through the project's own track and master FX, into a folder the host made.
- **Role:** `FXRenderer`, asynchronous.
- **Result:** `FX_RENDER_FILE` per region, then `FX_RENDERED` with the folder and count. The approval token is used up by the render. The folder is empty, under the project's mastering folder, and nothing is written outside it. The narrator's own render settings are put back afterwards. Each use needs the narrator's approval in the UI (threat model row 5o in [the threat model](../../architecture/threat-model.md)).
- **REAPER:** `render_with_fx`.
- **Audacity:** not built.
- **Checked:** REAPER, harness (`master_render_test.lua`: approval used once, run folder, one predicted WAV, settings restored). Not run in REAPER.

### `master_chain_read`

- **Intent:** show the narrator the FX a render would run, before they approve it.
- **Role:** `MasterChainReader`, synchronous.
- **Result:** `MASTER_CHAIN_FX` per slot (every track's, then the master's, at most 500), then `MASTER_CHAIN_READ` with the count and whether the list was cut. Reads only.
- **REAPER:** `master_chain_read`.
- **Audacity:** none. A macro's steps cannot be read back.
- **Checked:** REAPER, harness (`master_render_test.lua`). Not run in REAPER.

### `macro_render`

- **Intent:** apply the narrator's named effect macro to a rendered WAV and export the result.
- **Role:** `MacroRenderer`, synchronous (`RenderWithMacro`).
- **Result:** `MacroRendered` with the exported path, which equals the requested path on success. The role refuses a request without an approval or without a macro name. It imports the source as its own track, selects only that track, applies the macro and exports. The mastering row, not this role, makes the destination a path that does not exist yet and refuses one equal to the source ([ADR 0460](../../adr/0460-the-audacity-mastering-row-is-its-own-row-not-daw-and-imports-the-source-as-its-own-track-before-the-macro.md)).
- **REAPER:** Unsupported: REAPER has no macro manager.
- **Audacity 3.x:** import, select, apply the macro, export, over the scripting pipe. Audacity 4.0.0 lists the Macro Manager and the scripting pipe as not available ([Audacity 4](audacity-4.md)).
- **Checked:** not checked in Audacity ([ADR 0460](../../adr/0460-the-audacity-mastering-row-is-its-own-row-not-daw-and-imports-the-source-as-its-own-track-before-the-macro.md)); the owner's pass is the check.

### `cut_range`

- **Intent:** cut a range of words from the script together with their audio.
- **Role:** `RangeCutter`, synchronous (`DeleteRange`, a `DeleteRangeRequest`: the item's GUID as the app last read it, start and end in seconds, the word count, mode `close` or `gap`, fade in milliseconds, pad in milliseconds and whether to fill the gap with room tone).
- **Result:** a `Result` ([ADR 0810](../../adr/0810-a-daw-call-answers-one-result-object-and-a-capability-reports-whether-it-is-destructive-and-its-mode.md)). The middle piece goes to a muted Cuts track, never deleted ([PRD decision DQ-8](../../prds/studio-next-daw-ports-and-capabilities.prd.md#decisions)); `close` moves later audio up, `gap` keeps the length, silent unless room tone is asked for. A pad (0 to 500 ms) cuts that much less at each end of the range; room tone (`gap` only) fills the gap with the chapter's room tone.
- **Refusals:** an item whose GUID no longer matches (`stale`); a range that is not a finite start before its end, or not inside the item; another item on the track overlapping the range; a mode other than `close` or `gap`; a fade or pad outside 0 to 500 ms, or a pad that leaves nothing to cut; room tone with `close`, or where the engine has no room tone for the chapter; the engine recording; an engine that cannot make the edit. A refused call changes nothing.
- **Undo:** one undo point where the engine makes the edit as one action; `UndoSteps` and `Steps` report otherwise.
- **Depth:** an engine that moves the cut audio aside rather than deleting it is not destructive.
- **REAPER:** `delete_range`, Experimental. Mode `native`, not destructive: the item is split at both ends and the middle piece moves to a muted Cuts track, in one undo block, `UndoSteps` 1; `close` moves the later items on the same track up, `gap` leaves silence. The pad and room tone travel in the command's last field, after the fade (SN-E97). Room tone is the first region named "Room tone" that lies over audio on the chapter's track and clear of the cut: copies of that stretch, each a new item playing the same file, fill the gap in the same undo block; with no such region the cut is refused, "This chapter has no room tone marked in REAPER. Mark a stretch of room tone on its track with a region named Room tone." A script older than the pad refuses the field as a fade and cuts nothing; the host answers that the script must be imported again ([REAPER](reaper.md#range-cut)). The message is "Deleted N words and their audio in REAPER."
- **Binding:** `DawDeleteRange(chapterID, firstToken, lastToken, mode, fadeMs, padMs, roomTone)` answers the `Result` (`apps/desktop/bindings_daw_range.go`); the UI calls it as `DawClient.deleteRange`. The page sends a chapter id, two token indices of the chapter's stored alignment, the mode and the fade; the host resolves the item GUID and the start and end in project seconds from the alignment and the saved project (`internal/passagetakes/range.go`). The resolver's refusal comes first, then a mode other than `close` or `gap`, a fade or pad outside 0 to 500 ms, or room tone with `close` (`delete_range`'s own sentences), then words not heard, words on two items, and a range outside the alignment or an item gone or no longer covering the words (code `stale`); words the edit log already holds as cut answer ok with `changed: false`. Nothing is sent on any of them.
- **Audacity 3.x:** Experimental, requiring [`backups`](#backups), mode `steps`: a cut changes the audio itself, so it needs a backup first ([the Studio Next mock](../../research/mockups/studio-next/src/selectors/daw.ts), [PRD decision DQ-18](../../prds/studio-next-daw-ports-and-capabilities.prd.md#decisions)). Refused with backups' reason while they are unavailable: "Cutting words and their audio needs Audacity backups. Turn on Audio backups in Settings." A cut backs up the range, selects it and deletes it; mode `close` then deletes the gap, moving the audio after it up (two undo points), and mode `gap` leaves silence (one). The pad is taken off each end of the range before anything is sent; room tone is refused, "Audacity has no room tone to fill a cut with, so nothing was changed. Leave the gap silent or close it up." No fade is made (`steps_range.go`). The built-in recorder cuts the padded range into the take's edit list, whose gap already plays as room tone.
- **Checked:** harness (`range_test.lua`); the run in REAPER is not done; expected result is row C3 of [the verification pass](../../operations/reaper-verification-pass.md#part-c-the-studio-next-daw-commands-not-scripted-yet), and Audacity's is Part C rows C1, C2 and C7 of [the Audacity pass](../../operations/audacity-verification-pass.md#part-c-unattended-after-part-a); the QA pass ([#1495](https://github.com/countrymanprime/narration-utils/issues/1495)) checks it.

### `fx_range`

- **Intent:** put one of the engine's own saved chains on a range of words, and take it off again.
- **Role:** `RangeFXApplier`, synchronous (`ApplyFXToRange` with an `FXRangeRequest`: the range, the chain's id and name as the engine listed them, fade in milliseconds; `RemoveFXFromRange` with the item GUID and chain name).
- **Result:** a `Result`. The item is split at the range and the chain goes on the middle piece; removing it joins the piece back.
- **Refusals:** a stale item GUID; a chain the engine does not list, or a name that could be a path; a range that is not a finite start before its end, or not inside the item; a fade outside 0 to 500 ms; words that already carry a chain; the engine recording; an engine that cannot make the edit. A refused call changes nothing, except that a chain that loads nothing after the split is refused and the sentence says one Undo rejoins the item.
- **Undo:** as `cut_range`.
- **Depth:** an engine that puts the chain on a piece as take FX, leaving the recorded audio as it was, is not destructive.
- **REAPER:** `apply_fx_range` and `remove_fx_range`, Experimental. Mode `native`, not destructive. Applying splits the item at both ends and loads the chain, named as `list_fx_chains` lists it and resolved inside `FXChains` by the Lua, onto the middle piece's active take with `TakeFX_AddByName`, in one undo block, `UndoSteps` 1; the take's `P_EXT` records the chain and the FX it added. Removing takes off only those FX and joins the piece to the pieces the apply split off, when they still carry on its audio, in one undo block, `UndoSteps` 1, or changes nothing when the piece no longer carries the chain ([REAPER](reaper.md#chain-on-a-range)). REAPER lists a chain by one name, so the role sends the request's `ChainName`. The messages are "Added CHAIN to N words in REAPER." and "CHAIN taken off in REAPER."
- **Binding:** `DawApplyFxToRange(chapterID, firstToken, lastToken, chainName, fadeMs)` and `DawRemoveFxFromRange(chapterID, firstToken, lastToken, chainName)` answer the `Result` (`apps/desktop/bindings_daw_fx_range.go`); the UI calls them as `DawClient.applyFxToRange` and `removeFxFromRange`, and `DawClient.fxChains` lists the chains over `WorkspaceListFXChains` as the mock's `FxList` (a source label and the choices). The host resolves the range as `DawDeleteRange` does. The resolver's refusal comes first; then an apply's fade outside 0 to 500 ms; then words not heard, words on two items, and a range outside the alignment or an item gone or no longer covering the words (code `stale`); then the chain: an apply's must be one `list_fx_chains` lists, a removal's a plain chain name, so a chain deleted from `FXChains` since it went on still comes off. Nothing is sent on any of them. A removal sends the item the alignment names; after an apply the chain is on a new piece, which the alignment names once the chapter is checked again, so a removal before that answers `changed: false` and says to check again.
- **Audacity 3.x:** Experimental, requiring [`backups`](#backups), mode `steps`: an effect changes the audio itself, so it needs a backup first ([the Studio Next mock](../../research/mockups/studio-next/src/selectors/daw.ts)). Refused with backups' reason while they are unavailable: "Adding an effect to words needs Audacity backups. Turn on Audio backups in Settings." The effect backs up the range, selects it, splits at both ends and applies the narrator's macro by name (`ApplyMacro`), two undo points. Taking an effect off is refused with a sentence that points to the backup.
- **Checked:** harness (`fx_range_test.lua`); the run in REAPER is not done; expected result is rows C4 and C5 of [the verification pass](../../operations/reaper-verification-pass.md#part-c-the-studio-next-daw-commands-not-scripted-yet), and Audacity's is Part C row C3 of [the Audacity pass](../../operations/audacity-verification-pass.md#part-c-unattended-after-part-a); the QA pass ([#1495](https://github.com/countrymanprime/narration-utils/issues/1495)) checks it.

### `stack_takes`

- **Intent:** put the later reads of a passage on the first read's spot as takes, and move them back.
- **Role:** `TakeStacker`, synchronous (`StackTakes` and `UnstackTakes`, a `StackRequest`: the chapter, one group per passage with its item GUID, base read and moves, and the shift of the audio that follows).
- **Result:** a `Result`; an engine with no native way lists the edits it made in `Steps` (mode `steps`).
- **Refusals:** a stale item GUID; an engine that cannot stack (Audacity without backups).
- **Undo:** one undo point natively ([PRD acceptance, "Stack retries"](../../prds/studio-next-daw-ports-and-capabilities.prd.md#acceptance-criteria-tied-to-the-mock)).
- **REAPER:** `stack_takes` and `unstack_takes`, Experimental. Mode `native`, not destructive. Stacking makes each later read a take of the first read's item and moves the read's own item to the muted Cuts track, and the audio after the passage moves up by the request's `Shift`, in one undo block, `UndoSteps` 1; the first read stays active and nothing is deleted. Un-stacking removes those takes and puts each read back by the offset its take recorded, in one undo block, `UndoSteps` 1 ([REAPER](reaper.md#stacking-takes)). A group's `Base` is the first read's take GUID and a move's `TakeID` the later read's take GUID. Every GUID is checked before anything changes, so one stale item refuses the whole request (`stale`); a request with no group is refused as "There are no retries to move in REAPER." The messages are "Stacked N takes in REAPER." and "Moved back N takes in REAPER." The host writes the request to a payload file under the session folder ([the bridge](../../architecture/reaper-bridge.md#stacking-takes-narration_takeslua)).
- **Binding:** `DawStackTakes(chapterID, passageIDs)` and `DawUnstackTakes(chapterID, passageIDs)` answer the `Result` (`apps/desktop/bindings_daw_stack.go`); the UI calls them as `DawClient.stackTakes` and `unstackTakes` with the mock's `StackRequest`, of which only the chapter and each group's `passageId` are sent. A passage is a paragraph the Booth's passage map says two or more recorded items read, named `pm-<chapter>-<paragraph>`. The host builds the request itself (`passagetakes.StackPlan` and `UnstackPlan`): the read that starts first on the chapter's linked track (read with `chapter_track_state`) stays, every other read there that does not start on its spot moves onto it, and passages that share a first read are one group; an un-stack moves every stacked take of the first read's item back (a stack goes back whole), with the offsets read from the stacked takes' `P_EXT` in the saved project, so a stack not saved since answers that nothing is stacked and says to save. The resolver's refusal comes first; then more than 200 passages; then an id the chapter does not list or a track that is gone (code `stale`); then a muted read (a take was kept), reads two passages share, or nothing to move. Nothing is sent on any of them.
- **Audacity 3.x:** Experimental, requiring [`backups`](#backups), mode `steps` ([the Studio Next mock](../../research/mockups/studio-next/src/selectors/daw.ts): "Audacity can stack only with backups on"). Refused with backups' reason while they are unavailable: "Stacking takes needs Audacity backups. Turn on Audio backups in Settings." A stack backs up the passage, pastes each later read onto a muted take track of its own at the first read's spot, splits and deletes the chapter track from where the first read ends to where the reads end, and mutes the take tracks: the mock's five steps and five undo points for one read (`steps_stack.go`). The take track's name records where the read was recorded and the backup made, and an un-stack pastes that stretch back from the backup and removes the take tracks. One passage per call, at most three later reads.
- **Checked:** harness (`stack_test.lua`); the run in REAPER is not done; expected result is rows C6 and C7 of [the verification pass](../../operations/reaper-verification-pass.md#part-c-the-studio-next-daw-commands-not-scripted-yet), and Audacity's is Part C rows C4 and C5 of [the Audacity pass](../../operations/audacity-verification-pass.md#part-c-unattended-after-part-a); the QA pass ([#1495](https://github.com/countrymanprime/narration-utils/issues/1495)) checks it.

### `backups`

- **Intent:** clone the audio around an edit before it is made, so it can be put back, for an engine that keeps no takes of its own.
- **Role:** `BackupKeeper`, synchronous (`BackupAround` with a `BackupRequest`: the track or item GUID, the chapter, start and end in seconds, and a label saying what it is for; `RestoreBackup` with the backup's GUID).
- **Result:** a `Result`. How long a stretch is cloned and how long backups are kept are settings ([PRD decisions](../../prds/studio-next-daw-ports-and-capabilities.prd.md#decisions)): `DAW.backups.window_seconds` (10 to 300 s in steps of 10, default 120) and `DAW.backups.retention_days` (1 to 365, default 7), with the Studio Next mock's ranges.
- **Binding:** `DawBackupAround(chapterID, firstToken, lastToken, label)`, `DawRestoreBackup(backupID)` and `DawBackups()` (`apps/desktop/bindings_daw_backups.go`); the UI calls them as `DawClient.backupAround`, `restoreBackup` and `backups`. The page sends a chapter id, two token indices and the label, or a backup id: the host resolves the words' project seconds from the stored alignment and the track from the chapter's one link, and the adapter adds the window. The resolver's sentence comes first. `DawBackups` answers the table in the file's shape, newest first, from the file alone. The host prunes the table when a project opens, with the retention, only while the resolver says backups can be used.
- **Refusals:** `RestoreBackup` of a GUID the engine has no backup for.
- **Undo:** a backup adds no undo step the narrator's audio needs (`undoSteps: 0`); a restore is one (`undoSteps: 1`). What Audacity itself records is checked by the owner's pass.
- **REAPER:** not yet available. The mock declares it unsupported, as REAPER keeps takes itself (`studio-next/src/fixtures/daw.ts`); the declaration is settled when the command is built.
- **Audacity 3.x:** Experimental ([ADR 0863](../../adr/0863-an-audacity-backup-is-a-muted-track-in-the-project-and-a-row-in-a-table-beside-it-and-a-restore-never-deletes.md), `apps/desktop/internal/dawport/audacity/backups.go`). `BackupAround` copies the window, 120 s either side of the edit clamped to the project, to a new muted track named `Narration Utils backup {ID}` with the commands spike 1g sends (`SelectTracks` and `SelectTime`, `Copy`, `NewMonoTrack` or `NewStereoTrack`, `SetTrackStatus` to name it, `Paste`, `SetTrackAudio: Mute=1`) and adds a row to `narration-utils/backups.json` in the app's project folder ([data files](../data-files.md)); it answers `changed: false`, "Backed up N s of audio in Audacity." The request's GUID is the source track's name, as Audacity reports no track ids. `RestoreBackup` pastes the backup's window back over the same window of the source track, keeps the backup track and its row, and answers `changed: true`. Refusals: no project folder from the host; a request with no track, chapter or finite range; a source track that is gone (`stale`) or two tracks with its name; no audio in the window; a full table (500 rows); an id the table does not have ("Audacity has no backup with that id."); a backup or source track that is gone (`stale`); a table from a newer app. `List` reads a row whose track is gone as `missing`; `Prune` removes only rows older than the retention and the tracks they name, and waits for a restore in flight. A row keeps the request's label, and a restore stamps its `restored` time. The host builds the role on an Audacity launch with a project, but opens no pipe from a page yet, so the resolver answers "Audacity isn't connected to this app yet" and the bindings refuse with it until a later slice connects the pipe.
- **Checked:** Go tests over a fake pipe (`backups_test.go`, `backups_prune_test.go`, `backups_label_test.go`) and of the bindings (`bindings_daw_backups_test.go`); spike 1g and the owner's pass ([verification pass](../../operations/audacity-verification-pass.md)) are pending, and the QA pass ([#1495](https://github.com/countrymanprime/narration-utils/issues/1495)) lists what only a real Audacity shows.

### `file_preview`

- **Intent:** play a stretch of a file on disk, such as the quietest 5 s of a rendered chapter that Master & QC measured, and stop it, leaving the project unchanged. A measured file is not a project item, so [`navigate`](#navigate) cannot reach it.
- **Role:** `FilePreviewer`, synchronous (`PreviewFileRange` with a `FilePreview`: the path, the start and the length in the file's own seconds; `StopFilePreview`).
- **Result:** `PreviewFileRange` returns the stretch that plays, its length shortened to the end of the file. `StopFilePreview` returns whether a preview this app started was playing; with none it changes nothing. One preview plays at a time: a new one stops the last. Nothing is inserted, no undo point is made, and the project's transport, cursor and selection are not touched.
- **Refusals:** a path that is not an absolute local path to an existing audio file (a network share, a relative path, a `..` segment, a folder, another kind of file), checked by the host before anything is sent and by the engine again; a start below 0, or a length not above 0 or above 60 s; a stretch that starts at or after the end of the file; the engine recording; an engine with no way to play a file outside the project.
- **REAPER:** `preview_file_range` and `stop_file_preview`, Experimental (`narration_media_file.lua`). Plays through an SWS preview (`CF_CreatePreview`, then `CF_Preview_SetValue` for `D_POSITION` and `B_LOOP`, then `CF_Preview_Play`) from a source made with `PCM_Source_CreateFromFile`; a watcher on the bridge's defer loop stops it at the end of the stretch with `CF_Preview_Stop` and frees the source one cycle later. Without SWS it refuses: "Playing part of a file needs the SWS extension in REAPER." Each call is checked with `APIExists` first ([the bridge](../../architecture/reaper-bridge.md#playing-and-showing-a-file-on-disk-narration_media_filelua)).
- **Audacity:** not yet available. The adapter's commands play the project (`Play`) or import a file into it as new tracks (`Import2`, [`commands.go`](../../../apps/desktop/internal/audacitybridge/commands.go)), and neither leaves the project unchanged; no command that previews a file is built.
- **Built-in recorder:** unsupported.
- **Binding:** `DawPreviewFileRange(path, start, length)` and `DawStopFilePreview()` (`apps/desktop/bindings_daw_files.go`) answer a `DawResult` with no undo step; the UI's API calls them as `dawPreviewFileRange` and `dawStopFilePreview` (no page sends them yet; SN-M97 will). The host checks the capability, then the stretch, then the path, and sends only a path the narrator picked to measure in this session.
- **Checked:** harness (`media_file_test.lua`); nothing run in REAPER. Expected result is row C10 of [the verification pass](../../operations/reaper-verification-pass.md#part-c-the-studio-next-daw-commands-not-scripted-yet); the QA pass ([#1495](https://github.com/countrymanprime/narration-utils/issues/1495)) checks it.

### `file_reveal`

- **Intent:** show a file on disk in the engine's own file browser, without importing or playing it, so the narrator can open it there themselves ("Open in the DAW"). Importing it would change the project, which this capability never does.
- **Role:** `FileRevealer`, synchronous (`RevealFile` with the path).
- **Result:** the path shown. No undo point; the project is unchanged.
- **Refusals:** the path rules of [`file_preview`](#file_preview); an engine with no file browser it can be asked to show a file in.
- **REAPER:** `reveal_file`, Experimental (`narration_media_file.lua`): `OpenMediaExplorer(path, false)`, which selects the file in the Media Explorer without playing it. A REAPER without the call refuses: "This REAPER version cannot show a file in its Media Explorer."
- **Audacity:** not yet available. The adapter has no command that shows a file without importing it (`Import2` adds it to the project).
- **Built-in recorder:** unsupported.
- **Binding:** `DawRevealFile(path)` (`apps/desktop/bindings_daw_files.go`) answers a `DawResult` with no undo step; the UI's API calls it as `dawRevealFile`.
- **Checked:** harness (`media_file_test.lua`); nothing run in REAPER. Expected result is row C11 of [the verification pass](../../operations/reaper-verification-pass.md#part-c-the-studio-next-daw-commands-not-scripted-yet).
