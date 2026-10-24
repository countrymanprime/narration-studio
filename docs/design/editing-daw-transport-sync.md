# Editing page and REAPER: two-way transport sync

Status: built, Experimental (capability `transport_sync`). Only the harness and the unit tests have run it; nothing here has run in a real REAPER ([the owner's checklist](#what-only-a-person-in-reaper-can-check)).

## What existed before

| Piece | What it does | Where |
| --- | --- | --- |
| Heartbeat | Every 1.5 s, and at once when the play state changes, REAPER appends `PROJECT_STATUS` with the project path, edit counter, `GetPlayState` and `GetPlayPosition`. It carries no edit cursor. | `src/studio/integrations/reaper/narration_ui_bridge.lua`, `daw.Reachability.Transport` |
| Heartbeat to the UI | `daw_transport_changed` (play, record, position) and `daw_project_state_changed`, pushed by the host loop on a change; `DawProjectState` reads the same. The position moves only with the heartbeat. | `bindings_daw_transport.go`, `bindings_daw_projectstate.go` |
| Editing follow of REAPER's play | `useDawPlayPosition` reads `projectState` four times a second while the page is visible, maps the position to a word through `sourceAt` and `docTimeAt`, and lights it. Playing only; no cursor; the position still steps every 1.5 s. | `follow/useDawPlayPosition.ts`, `follow/dawPosition.ts` |
| Booth follow | `useFollowDawOnOpen` asks `DawPlace` once on open, `useMoveDawOnOpen` sends `DawGoToChapter` once. Neither follows afterwards. | `booth/page/useDawFollow.ts`, `bindings_daw_place.go` |
| Transport commands | `arm_only`, `record_start`, `record_stop` (recording), `go_to` and `read_place` (cursor, with a track), `navigate_item`, `loop_context`, `stop_loop` (a finding), `preview_file_range`. None plays the project from a time. | `narration_transport.lua`, `narration_track_select.lua`, `narration_navigation.lua` |
| App playback | One `Audio` element over the playlist's source files, driving `state.playT`. REAPER's sound, level and routing play no part. | `bar/useScriptPlayback.ts` |
| Capability gating | One row per capability in `dawport.Capabilities()`, a level per engine, `useDawStatus` for the banner. | `internal/dawport`, `page/useDawStatus.ts` |

That is why Play in the app sounds different from Play in REAPER and does not move REAPER.

## Decisions

**A new capability, `transport_sync`, Experimental on REAPER.** It starts REAPER's transport, which `follow_position` (read the place, move the cursor) never did, and a narrator who allowed the Booth to follow REAPER has not allowed the app to start it. Audacity declares it Not yet available, the built-in recorder Unsupported. When it is not usable, for any reason the resolver words, the page behaves as before this change: `useDawPlayPosition` keeps following the heartbeat and Play plays the app's audio.

**Four commands, one stream.** `set_cursor`, `play_from` and `stop_play` act; `watch_transport` takes a lease on a `TRANSPORT` stream. A poll of an existing read was the alternative: `projectState` carries no cursor, and a `read_place` round trip is a command file, a defer cycle and an event for every sample. The lease costs REAPER three API reads per defer cycle and, while it plays, four small appends a second ([cost](../architecture/reaper-bridge.md#transport-sync-narration_transportlua)). Four a second is the rate at which a word (about 0.3 s) lights without lagging by more than one; the host and the page add no rate of their own. A stopped REAPER sends only changes.

**The lease is the bound.** The host asks for 6 s and renews every 3 s while the page is open and visible. A page that closes, a hidden window, or a dead host stops the stream within 6 s; REAPER caps any lease at 10 s.

## The clock mapping

The document's clock (`state.playT`, the ribbon, every word's `t0`) is the chapter's elapsed time over the played stretches. `playlistOf` makes one `PlaylistSegment` for each heard paragraph, `elapsedStart..elapsedEnd` over `sourceStart..sourceEnd` of one item's file. REAPER's clock is project seconds. `follow/clockMap.ts` is the pure two-way map:

1. Document second to segment (`elapsedStart <= t < elapsedEnd`); the offset into the segment.
2. Closing cuts: the document has the cut's source seconds removed, so the offset is put back past each cut in the segment (`ClosedCut`, from `closedCutsOf`).
3. Source second = segment `sourceStart` + offset. Item = the live alignment item with the segment's GUID.
4. Project second = item `position` + (source second − item `sourceStart` − the cuts before it) / `playRate` (a rate of 0 reads as 1, as the bridge does). A source second before the item's `sourceStart` (trimmed off the head), or a project second at or past `position + length` (trimmed off the tail), has no project time.

Project to document runs the same steps backwards. When items overlap, the one that starts latest plays (REAPER's rule, and `sourceAt`'s).

What the map returns null for, and the page then does nothing visible: a gap between paragraphs; an item that is not live or whose place was not read; a trimmed-off stretch; a project second no item covers. Two limits, not tested in REAPER: a cut inside a take (offsets from the take's start) and a wordless cut (a trimmed gap) are not given to the map, and after a closing cut REAPER splits the item, so words after the cut inside that paragraph have no project time until the alignment is read again. The map is tested with takes, a take laid over another, a trimmed item, play rates 2, 0.5 and 0, closing cuts (one, two, at the segment's start, with a rate of 2, of another item) and a round trip ([`clockMap.test.ts`](../../src/studio/ui/src/components/editing/follow/clockMap.test.ts)). A shadowed take's words have a project time where another take plays; that is REAPER's own answer.

## Behaviour

**DAW to app.** While `ready` (the lease was answered), `useDawTransportSync` hears `daw_position_changed`:

- The edit cursor, when it changed and REAPER is stopped, goes to the word at that project time (`place`).
- A play head lights the word it is inside (`play`); a second between words leaves the last word lit. A play the narrator started in REAPER turns following on. When the narrator stops REAPER, the last word stays lit until the cursor moves, as the heartbeat follow did.
- An event with another project open (`sameProject` false: the heartbeat's project is not the book's `.rpp`), a recording, or a position outside the chapter changes nothing.

**App to DAW.** The page's cursor landing on a word is written to REAPER after 80 ms of quiet (`set_cursor`). Play (`playFrom`, Space, the word menu, skip while playing) calls `play_from` at the word's project second, silences the app's `Audio`, and takes `state.playT` from REAPER's head. Stop calls `stop_play` when REAPER plays, whether the app or the narrator started it. The play-a-selection end and the chapter's end are checked against REAPER's head, and stop REAPER.

### Who plays

Every play goes through the playback providers in [`playback/providers.ts`](../../src/studio/ui/src/playback/providers.ts): an ordered list for each kind of play, the linked DAW's first and the app's own player last. Each provider says whether it is ready now and then plays; `playThrough` takes the first that is ready and plays.

| Kind of play | DAW provider (capability) | Then |
| --- | --- | --- |
| Play a chapter from a word (Play, Space, the word menu, skip, a selection, the Voice sample dialog's **Play range**) | the transport, `transport_sync`: the lease answered and the word has a project time | the app's `Audio` over the playlist |
| Audition a take | the DAW's file preview, `file_preview` (`previewTake`) | the app's range player on the take's file |

The rule, which replaces "a linked DAW is the only player" of #2251 item 32 by the owner's decision on that issue ("we should play something … if a specific capability is not working we should have a fallback if it is not a DAW specific action"):

- A DAW provider that is ready plays, and the app stays silent. A DAW that can play is never passed over, so its FX, routing and level are what is heard.
- Before the DAW's capabilities first arrive, or before the first answer to the watch lease, nothing plays and the page says it is checking: passing it over would play the raw files where the DAW could have played them.
- A DAW provider that is not usable now (not answering, the switch off, another project open, the word not in its project) or that refuses the play hands the play to the app, from the same word, with one notice: the DAW's reason, then "Played in the app instead." A read of the capabilities that failed does the same and asks again.
- An engine that never declared the capability (Audacity today, the built-in recorder, no recording tool) is passed over without a notice: the app is its normal player. When Audacity declares `transport_sync` or `file_preview` Experimental, the same code drives it; nothing in the page names an engine.
- Before the app plays in place of a DAW, the DAW's project state is read: while it records, nothing plays (`quietWhileRecording`).
- A play the narrator stopped, or replaced, while the DAW was being asked is not handed on.
- An action that needs the DAW's own FX, routing or project state (`dawSpecific`) never falls back; nothing plays and the notice says it can only be done in the DAW. No play on this page is one; the rule is there for one that is.

## Loop safety and drift## Loop safety and drift

`follow/echoGuard.ts`. Each cursor write gets a generation and is remembered for 2.5 s with its project second. A cursor REAPER reports is **unchanged** (within a millisecond of the last one: a reading from before the write cannot undo it), an **echo** (within 20 ms of a remembered write: nothing happens, and older writes are forgotten) or **moved**. A move forgets every pending write: a move the narrator made in REAPER while the page's write was on its way is not lost, and a write that lands afterwards is then reported as the move it has become, so the page ends where REAPER is. A failed write is forgotten. The page does not write a cursor REAPER put there (`fromDaw`).

Drift. While REAPER plays for the page, the app's audio is silent, so there is one sound clock. The page's playhead is REAPER's last reading, at most 0.25 s old plus the host's 150 ms loop, and is not extrapolated: the lit word can trail the sound by up to one word. When readings stop for 3 s during a play the app started, the page stops, says REAPER stopped answering, and does not guess. When the app plays itself (no DAW that can play) there is no second clock to drift against.

## State matrix

| State | What happens | Tested |
| --- | --- | --- |
| REAPER never answers | `capabilities` says not reachable, so the page never takes a lease; Play plays in the app and says the capability's sentence; the banner is unchanged | `transportSync.test.tsx` (a DAW that is not running) |
| Answers late | The play is asked; the app stays silent until it answers; a refusal or failure then stops the page and says why. A stop before the answer stops REAPER again on the answer | `transportSync.test.tsx` (stopped before the DAW answered) |
| Wrong project open | The watch is refused (`sameProject` false), nothing is moved in REAPER, the page follows nothing, and Play plays in the app and says why; events carry `sameProject` | `transportsync_test.go`, `transportSync.test.tsx` |
| Restarted mid-session | The next renewal (within 3 s) takes a new lease from the restarted script, and its opening event adopts REAPER's cursor. A play the app started stops after 3 s without readings | `transportSync.test.tsx` (goes quiet); the reconnect is not tested |
| Playing while the page opens | The lease's first event carries the play state, and the word lights | `transportSync.test.tsx` |
| Chapter not linked, or no audio | No segment or no live item: every second maps to null; Play plays in the app and says the part is not in REAPER's project; nothing is written | `clockMap.test.ts`, `transportSync.test.tsx` (item not live) |
| Recording | Reads are ignored, writes are refused with REAPER's sentence; Play plays nothing, in REAPER or the app | Lua and `transportsync_test.go`; the page's toast on a refusal is `transportSync.test.tsx` |
| Capability off (Experimental switch, per-capability Off) | No lease; Play plays in the app and says the capability's sentence | `transportSync.test.tsx` |
| DAW not answered yet | Play plays nothing and says the page is checking | `transportSync.test.tsx` |
| Built-in recorder, no tool, Audacity | The app plays the files itself, with no notice | `transportSync.test.tsx`, `providers.test.ts` |
| Every provider readiness | The DAW ready, waiting, read failed, undeclared or unavailable; its play taken, refused or refused finally; the app ready or not; DAW-specific or not; recording or not: 120 cells | `providers.test.ts` |
| Rapid double-fire, leave mid-play | Cursor writes debounce; unmounting stops the lease and the DAW if the page played it | the first is tested; the second is not |
| Lost, repeated or out-of-order events | A repeated cursor is `unchanged`; a late echo is a move; a lost event delays by one tick | `echoGuard.test.ts` |
| Huge, negative, NaN times | Refused before anything is sent, in Go, in Lua and in the map | all three |
| Right-to-left, emoji | Nothing here depends on text | not applicable |

## What only a person in REAPER can check

The harness drives a fake `reaper`. These are pending with the owner:

1. Clicking a word moves REAPER's edit cursor there, and the arrange view scrolls to it.
2. Moving the cursor in REAPER puts the page's cursor on the word, and the ribbon follows.
3. Play in the app starts REAPER from the cursor (`OnPlayButton` plays from the edit cursor), and the sound is REAPER's, at REAPER's master level and output, with the app silent.
4. Stop in the app stops REAPER; Stop in REAPER stops the page. What REAPER does with the cursor on Stop (it may return to the play start) and that the page then follows it.
5. A take with an offset (a trimmed head, play rate other than 1): the lit word is the word heard, and a click on a word in a trimmed item lands on that word's sound.
6. The lit word trails the sound by no more than a word. `GetPlayPosition` while stopped and while paused.
7. Moving REAPER's cursor with the transport running, and a Play from a paused REAPER (stopped first, then played).
8. Four events a second are not felt in REAPER while it plays.

## Not exercised here

The real REAPER (all of the above); the Windows build and `src/studio/desktop`'s root-package tests (the container has no GTK, so the binding in `bindings_daw_transportsync.go` and the wiring in `app.go` were only compiled for Windows, and the logic they call is in `internal/transportsync`, which is tested); the committed `daw-capabilities-*.json` and `settings-*.json` rows, which were written by script from the neighbouring row because the root-package tests that write them could not run (CI's contract tests check them); the scripted real-REAPER CI scenarios (`scripts/ci/real-reaper`) have no scenario for these commands yet.
