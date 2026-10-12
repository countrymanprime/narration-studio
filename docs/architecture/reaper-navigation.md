# Going to and looping a finding in REAPER

**Status: implemented end to end: bridge commands, Go client, host bindings and the Review page's Go to, Loop, Stop and Add marker buttons**, tested in the harness, in Go, in the UI and the visual suite. Go to, Loop and Stop were also checked in a scripted REAPER 7.80 run. Hearing the loop, three other steps, a run of the checklist from the page, and the approved marker in a real REAPER are pending (scripted run and owner); see the [owner checklist](../operations/reaper-verification-pass.md#going-to-a-finding-owner-checklist). The chapter workspace's Go to and Loop reuse the same commands over two host bindings (`WorkspaceGoTo`, `WorkspaceLoop`, no new Lua); see [From the workspace](#from-the-workspace). Decisions: [ADR 0121](../adr/0121-going-to-and-looping-a-finding-is-by-guid-and-source-time-makes-no-undo-point-and-stop-restores-what-the-loop-changed.md), [ADR 0123](../adr/0123-the-approved-marker-is-one-take-marker-for-an-accepted-finding-named-like-transcript-compares-in-one-undo-point.md) (the approved marker).

## What it does

A finding carries its REAPER identity in `source` (`item_guid`, `take_guid`, `track_guid`) and its time inside that take's audio in `time_range.source_start` and `source_end` ([findings contract](findings-contract.md)). The host asks REAPER, over [the file bridge](reaper-bridge.md), to:

- **go to** it: select only its item and put the edit cursor on its spot (`navigate_item`);
- **loop** it: set the time selection and the loop points to a window around it, turn repeat on and play (`loop_context`);
- **stop** the loop: stop the transport and put back the time selection, loop points and repeat the narrator had (`stop_loop`);
- say whether the script is there and knows these commands (`ping`);
- **add one approved marker** for a finding the narrator accepted: a take marker at its spot, in one undo point (`add_finding_marker`).

The commands live in `integrations/reaper/narration_navigation.lua`; the host side is `bridge.Navigator` in `apps/desktop/internal/bridge/navigation.go`.

## Finding the spot: GUIDs, never a position

The item is found by its GUID (upper or lower case, with or without braces). When the finding names a take, that take must still be on the item; otherwise the item's active take is used. The source time becomes a project time with the take's current start offset and play rate, `item position + (source time - offset) / rate`, the same mapping Transcript Compare uses when it reports a row, so a finding follows its item when the narrator moves it.

Three things make a finding **stale**, and each is answered `FINDING_STALE|run|guid|reason` with nothing selected, moved or played:

| Reason | When |
| --- | --- |
| `item` | No item has that GUID (deleted, or the GUID is empty) |
| `take` | The item is there but no longer has that take (or has no take at all and a time was asked for) |
| `range` | The spot is outside the item as it is now (trimmed, or the take's offset changed); for a loop, the window does not overlap the item |

Nothing ever falls back to a neighbouring item or to the project time the finding had when it was made. The host refuses a finding without an item GUID before sending anything (`bridge.ErrNoItemIdentity`), so a finding from an older comparison has to be re-run to be navigable.

Transcript Compare records the item, take and track GUIDs of each item when it prepares a comparison (`prepare_compare`, the audio the rows describe) and appends them to `COMPARE_MARKER` after `srcpos`. The Transcript service keeps them out of the Transcript page's rows and the findings adapter puts them in `source`.

## Looping

`loop_context` takes the item and take GUIDs and a source window. The host pads the finding's source range by `ContextPaddingSeconds` (2 s) on each side (never below 0); REAPER keeps the window inside the item. Then, in this order: stop the transport if it is playing, set the time selection and the loop points to the window, turn repeat on, move the edit cursor to the window start and press Play. Both ranges are set because repeat loops the loop points and REAPER only links them to the time selection by preference (on by default in REAPER 7.80).

The first `loop_context` remembers the narrator's time selection, loop points and repeat. A second one (Loop on another finding) re-targets the loop and keeps that memory, so Stop always returns to what the narrator had before any loop.

`stop_loop` stops the transport if a loop of ours is held and REAPER is not recording, then goes through the three values: one that still has the value the loop set is put back, one that already has the narrator's value counts as put back (with linked loop points, putting the time selection back moves them too), and one the narrator changed while listening is theirs and is kept. It answers `LOOP_STOPPED|run|restored|kept`. With no loop held it changes nothing and answers `0|0`.

The loop memory lives in the running script. If the launcher script ends (the narrator terminates it, or quits REAPER) with a loop held, a `reaper.atexit` handler puts the state back. If the app restarts the launcher, the memory is gone: Stop answers `0|0` and the narrator's time selection stays as the loop left it.

None of the four commands makes an undo point or changes the project's content (the approved marker, below, is the one command here that does). Items are deselected one at a time with `SetMediaItemSelected`. Nothing moves while REAPER is recording: `navigate_item` and `loop_context` answer `ERROR|run|REAPER is recording. Stop recording first.`

## Adding the approved marker

`add_finding_marker` adds one take marker for one finding the narrator accepted. It is found like `navigate_item`: the item by GUID, the named take or the active one, the source time mapped through the take's offset and rate, and `FINDING_STALE` with `item`, `take` or `range` when any of them is gone. It changes nothing while REAPER is recording (`ERROR ... REAPER is recording`).

The marker is a **take marker at the source time**, so it follows the item when the item moves, like the markers Transcript Compare's **Export markers** adds. The host names and colours it like them: the finding's kind (or its category), then what the script says and what was recorded, eight words at most each (`MISREAD: 'pink eyes' as 'pale eyes'`), in the Transcript Compare colour for that kind. Before adding, the script asks `existing_take_marker` (`narration_bridge_core.lua`, the rule the export uses): is there already a marker with the same issue prefix within 0.15 s on that take? If so, it answers `existing` with that marker's name and changes nothing, so the command is safe to send twice and the export later skips the row. Otherwise it adds the marker inside one `Undo_BeginBlock2`/`Undo_EndBlock2` block labelled "Narration Utils: add approved marker", so one Undo in REAPER takes it away. It moves no selection, cursor or transport.

The host (`FindingsAddMarker(id)`, `apps/desktop/bindings_marker.go`) refuses before writing anything when the finding is not `accepted` (`not_accepted`), has no item GUID (`no_item`) or no source time (`no_source_time`), or REAPER is not listening (`standalone`, `not_running`); REAPER's own refusals come back as `stale`, `recording`, `script_outdated` or `failed`, worded "so no marker was added". The Review page's **Add marker in REAPER** stays off until the finding is accepted, and asks in a confirm dialog before sending. The batch export stays on the Proofing page.

## Commands and events

| Command | Arguments after the name | Events |
| --- | --- | --- |
| `navigate_item` | `run_id`, `item_guid`, `take_guid` (may be empty), `source_time` (may be empty: the item's start) | `NAVIGATED\|run\|item_guid\|project_time`, `FINDING_STALE\|run\|guid\|reason`, or `ERROR` |
| `loop_context` | `run_id`, `item_guid`, `take_guid` (may be empty), `source_start`, `source_end` | `LOOP_STARTED\|run\|item_guid\|start\|end` (project seconds), `FINDING_STALE`, or `ERROR` |
| `stop_loop` | `run_id` | `LOOP_STOPPED\|run\|restored\|kept` |
| `ping` | `run_id` | `PONG\|run\|version\|looping\|playing` (version `1`; the flags are `0` or `1`) |
| `add_finding_marker` | `run_id`, `item_guid`, `take_guid` (may be empty), `source_time`, `color` (`RRGGBB`, may be empty), `name` | `FINDING_MARKER\|run\|added or existing\|take_guid\|source_time\|name` (the existing marker's name when `existing`), `FINDING_STALE`, or `ERROR` |

The events are in the table in `apps/desktop/internal/bridge/wire.go` ([wire contracts](wire-contracts.md#reaper-events-appsdesktopinternalbridgewirego)).

## The host side

`bridge.NewNavigator(client)` subscribes to those events on the session's `bridge.Client`. `Navigate`, `Loop`, `StopLoop`, `Ping` and `AddMarker` (`marker.go`) each send one command and wait for its answer, routed by run ID, for up to `DefaultAnswerTimeout` (3 s). They return typed results, or:

| Error | Meaning |
| --- | --- |
| `ErrUnavailable` | No bridge: the app was not opened from REAPER's action |
| `ErrNoAnswer` | No answer in time: REAPER closed, the script stopped, or REAPER is busy |
| `ErrScriptOutdated` | The script in REAPER answered "Unsupported workspace command": it predates these commands |
| `ErrNoItemIdentity`, `ErrNoSourceTime`, `ErrNoMarkerName` | The finding has no item GUID, no usable source time, or (for a marker) no name (nothing is sent) |
| `*StaleError` (`errors.Is(err, ErrStale)`) | `FINDING_STALE`, with the GUID and the reason in plain words |

The answer arrives through `Client.Dispatch`, which the host's 150 ms loop already calls. A request must therefore never be made from inside a `Subscription.Handle`, which runs within `Dispatch`. `configureLocked` constructs it next to the Transcript service on the same client (with no client, it is standalone and refuses everything).

## From the Review page

The Navigator sits behind host bindings (`apps/desktop/bindings_navigation.go`) and three buttons in Proof's note detail (`apps/ui/src/components/proof/ReaperControls.tsx`):

| Binding | Sends | Answers |
| --- | --- | --- |
| `FindingsReaperStatus()` | nothing | `connection` (`connected`, `not_running`, `standalone`), a `message` when not connected, and `loopingFindingId` while a loop this app started is held |
| `FindingsGoTo(id)` | `navigate_item` | `navigated` with `projectTime`, or `refused` |
| `FindingsLoop(id)` | `loop_context` | `looping` with `loopStart` and `loopEnd`, or `refused` |
| `FindingsStopLoop()` | `stop_loop` | `stopped` with `restored` and `kept`, or `refused` |
| `FindingsGoToRead(id, read)`, `FindingsLoopRead(id, read)` | `navigate_item`, `loop_context` | as Go to and Loop, for one read of a grouped finding: `evidence.members[read]`'s own item and take GUIDs and its range in its source (a take-review group, or a take comparison of one) ([ADR 0124](../adr/0124-take-review-groups-are-reviewed-on-the-review-page-each-read-is-navigated-by-its-index-and-the-scan-is-a-cancellable-job.md)); a read the finding does not have is an error |
| `FindingsAddMarker(id)` | `add_finding_marker` | `added` or `existing` with the marker's `name` and `sourceTime`, or `refused` (see [adding the approved marker](#adding-the-approved-marker)) |

The page sends only the finding's id; the host reads its item and take GUIDs and source times from the project's findings store. The status is read from `daw.Reachability` (the heartbeat REAPER's script sends every 1.5 s), so the page polls it every 3 s at no cost to REAPER: `standalone` when there is no bridge client, `not_running` when the heartbeat is stale. Go to and Loop are disabled with the reason under them until it is `connected`, and for a finding without an item GUID (or, for Loop, without a source time); Stop loop appears while `loopingFindingId` is set, on every finding.

A request is refused in this order, and nothing is written for a refusal before the last step: no item GUID (`no_item`), for Loop no source time (`no_source_time`), no bridge (`standalone`), a stale heartbeat (`not_running`); then REAPER's own answers: `stale`, `recording` (`bridge.ErrRecording`), `script_outdated`, no answer in time (`not_running`), anything else (`failed`, with REAPER's words). A refusal is an answer, not an error, with a plain-language `message` the page shows as an alert; the payloads are wire contracts (`findingNavigationSchema`, `reaperStatusSchema`, golden files `findings-go-to.json`, `findings-loop.json`, `findings-stop-loop.json`, `findings-navigation-*.json` and `findings-reaper-status-*.json`). Checking the heartbeat first means a command is never left in the folder for a REAPER that has gone, to be acted on later without the narrator ([threat model](threat-model.md) row 5f).

The host remembers which finding it looped (`findingNavigation.loopingID`) until a Stop succeeds. A project switch builds a new navigator and forgets it; REAPER's script still holds that loop until its own Stop or its exit handler.

## From the workspace

The chapter workspace's transport bar (Proof's chapter view; `apps/ui/src/components/proof/TransportBar.tsx`, `useWorkspaceReaper.ts`) reaches the same `navigate_item` and `loop_context` through two more host bindings, for the word at the playhead:

| Binding | Sends | Answers |
| --- | --- | --- |
| `WorkspaceGoTo(chapterId, tokenIndex)` | `navigate_item` | `navigated` with `projectTime`, or `refused` |
| `WorkspaceLoop(chapterId, firstToken, lastToken)` | `loop_context` | `looping` with `loopStart` and `loopEnd`, or `refused` |

No new Lua command, and no new bridge type: both resolve into a `bridge.Target` and go through the same `findingNavigation`/`bridge.Navigator` the Review page's bindings use (`apps/desktop/bindings_workspace.go`), so `FindingsReaperStatus` (polled the same way, `useReaperStatus`, shared with the Review page) and `FindingsStopLoop` serve the workspace too - there is one app loop at a time, whoever started it.

The page sends only the chapter id and the token index (or, for Loop, the first and last token of the passage, both required to be heard on the same item); it never sends a GUID or a time. The host resolves a token to where to go by reading the chapter's stored word alignment (`WorkspaceAlignment`, ADR 0242) - the token's item index, and the source time it was heard at - and joining that item's current GUID and take GUID from the saved project, exactly as `WorkspaceAlignment` itself already joins played ranges for display. A token nothing was heard for (a missing or skipped word) has no item to resolve, so it is refused (`no_item`) before anything is sent, in the workspace's own words ("This word wasn't heard in the recording..."); a passage whose two tokens were heard on different items is refused as a caller error (reload the workspace), since the page only ever sends a passage from one paragraph's worth of adjacent, same-item tokens. REAPER's own refusals (`stale`, `recording`, `script_outdated`, no answer, no bridge) come back worded exactly as they are for the Review page, since they are the same `bridge.Navigator` answering the same way; a stale item or take is reworded from "this finding's..." to "this word's..." in the host (`workspaceRefusal`, `bindings_workspace.go`), without touching `bridge.StaleError`'s own message, which the Review page's refusals still use unchanged.

Verified: Go tests over a fake navigator and a real coverage-backed saved project (`bindings_workspace_navigation_test.go`), the contract payloads (`bindings_workspace_contract_test.go`, goldens `workspace-go-to.json`, `workspace-loop.json`, `workspace-navigation-no-item.json`), and the UI (`ProofChapterPage.test.tsx`: Go to and Loop send the current token, Stop loop replaces Loop while looping, REAPER not connected disables both with the reason, a refusal shows as an alert). REAPER's own behaviour for these two bindings - `navigate_item` from a token the workspace resolved, and hearing the loop - was not re-verified by a scripted run for this phase (the commands and their refusals are the same ones [the owner checklist](../operations/reaper-verification-pass.md#going-to-a-finding-owner-checklist) already ran against a real REAPER for the Review page); a scripted run from the workspace itself, and the owner hearing it, are pending on [#510](https://github.com/countrymanprime/narration-utils/issues/510).

## Verification record

The harness, Go and REAPER checks and their results are in [the REAPER verification pass](../operations/reaper-verification-pass.md#going-to-looping-and-marking-a-finding-in-reaper).

## Manual verification checklist

The owner's steps in REAPER are in [the REAPER verification pass](../operations/reaper-verification-pass.md#going-to-a-finding-owner-checklist).
