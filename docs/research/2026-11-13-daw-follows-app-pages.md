# Should the DAW follow the page the narrator is on?

**Status: research, 2026-11-13. Nothing is built.** Issue: [#3428](https://github.com/countrymanprime/narration-studio/issues/3428). The owner decides from the questions at the end before anything is built.

## The question

The owner's words: DAW navigation, like a new chapter loading in the DAW, should be an option that can mirror the app's pages. Research which pages it should follow and how, for example zooming in on the chapter and tracks being worked on and muting all the other chapters.

## What it settles

| Question | Answer |
| --- | --- |
| Can the bridge already move the DAW to a chapter? | Selecting a chapter's track and placing the cursor: yes, both Experimental (`track_select`, `follow_position`). Zooming, scrolling the track list and muting the other chapters as a standing state: no command exists |
| Is there a safe way to change mutes and solos and put them back? | One pattern exists and ran in REAPER 7.82: the isolation a play does (`play_from`, `play_range`). It lasts for one play, so a standing mirror needs the same ledger kept for longer |
| Which pages should follow? | The pages whose work is about one chapter: Booth, Editing, Proof's chapter view, Pickups with a chapter scope and Production's chapter cells. Every other page has nothing in the DAW to follow ([per page](#per-page-what-the-daw-would-do)) |
| Does Audacity take part? | Select a track and place the cursor: yes (Experimental). Zoom and mute-as-focus: not recorded. Audacity 4: not reachable |
| What is the main risk? | A mirror that mutes tracks edits the narrator's project. On Audacity the mute is also folded into the previous undo step ([Audacity](#audacity)) |

## What exists today

All of this is in the repository now; nothing here is new.

| Behaviour | Where | Direction |
| --- | --- | --- |
| Booth opens on the chapter whose track is selected in the DAW | `useFollowDawOnOpen` (`useDawFollow.ts`), `DawPlace` | DAW to app, once, on open |
| Booth moves the DAW to the end of the chapter's audio, or to a time | `DawGoToChapter` (`go_to`) | app to DAW, on a click |
| "Select in REAPER" on a chapter link | `chaptertrackselect.go`, `select_track` | app to DAW, on a click |
| A finding's cursor and loop (Proof, Pickups "Hear it") | `navigate_item`, `loop_context`, `stop_loop` | app to DAW, on a click |
| A click on a word puts the DAW cursor there; Play plays from there | `transport_sync` ([`narration_transport.lua`](../../src/studio/integrations/reaper/narration_transport.lua)) | both ways, while the Editing page is open |
| Play soloes the chapter's track in place and puts the narrator's solos, mutes and selection back | `play_from`, `play_range` | app to DAW, for one play |
| Record arms only the chapter's track and restores the arms after | `record_*` | app to DAW, for one take |

The app moves the DAW only on a narrator's action today. A mirror would move it on every page change, which is a different trust level, and is why the questions below start with what the narrator expects.

## Per page: what the DAW would do

"Follow" means the page names a chapter (and sometimes a line) and the DAW moves to it. The first three actions are the cheap tier (they change the selection and the view, nothing saved in the project); the last two are the focus tier (they change track state the project saves).

| Page | Names a chapter? | Select the chapter's track and its children | Cursor and view | Mute or solo the other chapters | Arm | Recommendation |
| --- | --- | --- | --- | --- | --- | --- |
| Booth | Yes, and the line being read | Yes | Cursor to the end of what is recorded, in view (`go_to` `end`) | Optional focus tier; the narrator hears only their own monitoring while recording either way | Not on page entry: arming stays with the Record press (a hot mic on navigation is a surprise) | Follow with the cheap tier; offer the focus tier |
| Editing | Yes, and the word | Yes (its voices are the folder's children) | Cursor to the clicked word, already done by `transport_sync` | Optional; Play already isolates for the play | No | Follow with the cheap tier; the focus tier matters most here |
| Proof, chapter view | Yes | Yes | Cursor to the note being heard, already done by `navigate_item` | Optional | No | Follow on chapter change; findings keep their own click |
| Proof, all chapters | No | Nothing to follow | None | None | No | Do nothing; leave the DAW where it is |
| Pickups | Yes when scoped to a chapter; no for "all" | Yes when scoped | Cursor to the line that is open | Optional | The pickup session arms for the take, as the Booth does | Follow only when scoped to a chapter |
| Production | A chapter cell opens that chapter's track | Yes, on the click that opens it | Cursor to the start or the end of the chapter | No: Production is a hub, not a place to work | No | Follow the click, not the page |
| Script | Reader scrolls through chapters | Not recommended: the track would change as the narrator scrolls | None | None | No | Do nothing |
| Master & QC | Project-wide; a file check names a chapter | Only when a file check names one | None | A mirror must leave the project unmuted here: mastering reads the whole mix | No | Do nothing, and restore any focus on arrival |
| Delivery, Schedule, Story Bible, Settings | No | Nothing to follow | None | None | No | Do nothing |
| Companion (Booth beside the DAW) | Yes, as Booth | Yes | As Booth | Optional | As Booth | Same as Booth |

A page that does nothing must still do one thing when a focus was applied: put the narrator's mutes and solos back, so the Master page is never heard through a leftover mute ([risks](#risks)).

## What the bridge can do, and what each action needs

Levels are from [the matrix](../reference/daw/matrix.md). "Recorded" means [the REAPER reference](../reference/daw/reaper.md) has a row from a real run; "harness" means only the Lua tests under a fake `reaper` have run.

### REAPER

| Action | What exists | What it needs | Evidence |
| --- | --- | --- | --- |
| Select the chapter's track | `select_track` selects that track alone; `TRACK_STALE` for a track that is gone | Nothing for a plain track. For a chapter that is a folder, selecting the children as well has no command: a new `select_chapter` that takes the folder and its children from the depth rows `tracks_read` already returns | Harness (`track_select_test.lua`); folder depth rows are recorded |
| Cursor to the chapter | `go_to` (`SetOnlyTrackSelected`, `SetEditCurPos(time, true, false)`) | Nothing | Harness; `punch_to` and `SetEditCurPos` with the view flag are checked in view in the real-REAPER scenarios (`scenarios_transport.py`) |
| Scroll the track list so the chapter is visible | None | A scroll or "go to selected track" call; none is in the repository | Pending: no call or action ID is recorded for it, so none is named here |
| Zoom the timeline to the chapter | None. `GetSet_ArrangeView2` is used only to read the view in two checks | A zoom to the chapter's time range, either by writing the view range or by an action; look up the call or action ID by its text and run it in an isolated REAPER ([reaper-api-facts](../../.claude/skills/reaper-api-facts/SKILL.md)) | Pending |
| Mute or solo the other chapters | The isolation inside `play_from`: solo in place on the chosen track, remembering each track's solo, mute and selection, restoring only a value that is still the one set, and a file in REAPER's resource folder so a REAPER closed mid-play is put right on the next bridge tick | A command that keeps that state until the page changes, with the same file, and a rule for the two layers (a play inside a mirror) | Recorded for one play (REAPER 7.82 on Linux, 2026-10-28 and 2026-11-03): a folder whose audio is on its children plays them, soloed in place, with the next chapter silent; the selection, solos and mutes come back after `stop_play` and after the narrator stops REAPER. Standing state, a long book and a project saved while focused: not checked |
| Hide the other chapters from the track list | None | Setting a track's visibility changes the saved project more than a mute does; not recommended for a first version | Pending |
| Arm lanes | `arm_only` inside `record_start`, restored on stop | Nothing: arm at record time as today | Recorded (REAPER 7.82 on Linux, 2026-10-19 and 2026-10-24) |
| Tell the app the narrator moved the selection in the DAW | `read_place` on request; `transport_sync` streams position only | A selection event, or the app asks on focus return | Harness |
| Keep it out of the narrator's undo history | `select_track`, `go_to` and `read_place` add no undo point by design | A focus command must also add none (see [undo](#undo)) | Harness for the existing commands; for a mute set through the API, pending |

All new commands follow [`reaper-command-add`](../../.claude/skills/reaper-command-add/SKILL.md): a harness test per command, a Go side, an event row, and a recorded in-REAPER check for what the fake cannot prove. A change of the wire shape follows [`wire-contract-change`](../../.claude/skills/wire-contract-change/SKILL.md).

### Audacity

| Action | What the reference records | Gap |
| --- | --- | --- |
| Select a track and place the cursor | Supported by the adapter: `SelectTracks`, `SelectTime`. Whether Audacity scrolls to the cursor is not known (A3-T12), so the app can say it moved the cursor, not that it is on screen | None for the cheap tier's selection and cursor |
| Zoom, scroll the track list | Nothing recorded | Pending, would need a run in Audacity 3.7.x |
| Mute the other chapters | `SetTrackAudio` mute silences stacked take tracks; it acts on the selected track, so the client selects each track first ([Audacity 3.x](../reference/daw/audacity-3.md)) | Muting N tracks means N selections, which changes the narrator's selection; solo is not recorded. **`SetTrackAudio` and `SetTrackStatus` add no undo point, so the next Undo takes back the edit before it and the mute with it** |
| Read the narrator's mute state to restore it | Not recorded: Audacity reports no track ids, and the adapter finds tracks by name | Without a read there is no ledger, so no safe restore |
| No folders | `Kind.FolderTracks` is false; a chapter is one flat track | The "child tracks" step does not exist |

The recommendation for Audacity is the cheap tier only (select and place the cursor). Muting there loses the narrator's mute state and hooks into their undo.

### Audacity 4

Nothing is reachable: [there is no scripting interface](../reference/daw/audacity-4.md). A mirror does nothing and says so with the resolver's sentence.

### The built-in recorder

It has no project to mirror, and no capability here applies.

## Risks

| Risk | What happens | Mitigation to decide |
| --- | --- | --- |
| Changing a project the narrator is editing | Mute and solo are saved with the project; a mirror left on can leave other chapters muted in a file the narrator saves, renders from, or sends on | Restore on leave, on the switch turning off, and when the app closes; never save the project; cheap tier first |
| The narrator's own mute and solo | Overwritten by the mirror, so the narrator's deliberate mute is lost | A ledger as in `play_from`: remember each track's value before, put back only a value that is still the one the mirror set, so a mute the narrator changed in between is kept |
| Mirror and the narrator fight | The narrator selects another track in the DAW; the next page change moves them back | Apply only on a page or chapter change, never on a timer; do not undo what the narrator changed since |
| Recording | A mute or selection change mid-take could ruin a take or change what is armed | Refuse while the DAW records, as every existing command does; apply after the stop |
| Undo | A mirror undo point would sit on top of the narrator's history; and the app's own Undo of a cut refuses when the top point is not the cut's (`undo_last`) | Add no undo point; the ledger is the way back, not REAPER's Undo. On Audacity a mute changes the previous undo step, which is one reason to skip it |
| Dirty flag | A set of mute or solo may mark the project unsaved; whether selection does is also unrecorded | Pending a check of `IsProjectDirty` and the change count; if a mute marks it, the narrator sees an unsaved project they did not change |
| A long book | Dozens of chapters with several voices each is hundreds of tracks. Existing reads cap at 2000 tracks and 1000 items per track | One command that sets all tracks in one pass; guard `PreventUIRefresh` with `APIExists`; measure the time on a 2000-track project before choosing the default |
| Rapid stepping | Stepping through chapters with the keyboard queues a command per step on the file protocol | The latest page wins: drop older pending moves; do not queue |
| A DAW that is closed or not answering | The resolver says the engine is not answering | Do nothing, say nothing; apply the current page once when the DAW connects, or not at all (a question below) |
| The bridge is an older script | A command the installed script lacks is refused | Treat as not available for that action; the cheap tier still works |
| The two isolation layers | A play inside a focused mirror would record the mirror's solos as the narrator's, then restore them wrongly | One ledger with owners: a play puts back the mirror's state, not the narrator's original |
| A saved project opened by someone else | Muted tracks reach a collaborator | Same as the first row; restore on close |
| Audacity | See [Audacity](#audacity) | Cheap tier only |

## Undo

- Selection, cursor and view: no undo point. That is the existing rule for these commands.
- Focus (mute or solo): no undo point, on REAPER. Reversal is the switch turning off, leaving the page, or closing the app, each restoring from the ledger. The mirror's changes are not in the narrator's history, so Undo never reverses them.
- On Audacity, nothing in the focus tier is safe to do, for the reason in the table above.

## The setting

Settings keeps every setting ([product rules](../../.claude/rules/product-rules.md)), so the choice lives under DAW in Settings, not on a page. Options:

| Design | What the narrator sees | Cost |
| --- | --- | --- |
| **A. One switch**: "Move the DAW to the chapter I am working on" | Off or on | Smallest to build and explain; cannot separate the cheap tier from the focus tier, so the whole mirror either mutes or never does |
| **B. One switch and a choice of what it does** (recommended): off; follow the chapter (select, cursor, view); follow and quiet the other chapters | Three states in one Select | The mute is a visible second step, with its own warning |
| **C. Per page**: a row per page | Many rows, few of which differ | Each page has different needs, but the table above shows only five pages follow |
| **D. Per page with a default** (B, with Booth and Editing overriding) | B, plus a short list | Do this after B proves useful |

Recommendation: build B first, default **off**, with the choice stored as a DAW setting and applied the same way on every following page; revisit D from owner feedback. The directive on #2251 says a declared capability is live and gets no toggle; this switch is a behaviour the owner asked to be optional, not a capability gate, but it is the first such DAW setting, so it needs the owner's word (question 1).

## What would be built, and the checks it needs

Not scheduled; this is the work implied if the owner picks B.

1. The cheap tier: a host function that, on a page's chapter change, calls `select_track` and `go_to` through the resolver, skips when the DAW is not answering or recording, and drops older pending moves. Harness tests exist for both commands; a real-REAPER check that the selection and view moved on an owner project copy.
2. The view: a scroll and zoom command with a recorded run.
3. The focus tier: a `focus_chapter` command and its ledger, extending `play_from`'s state file; harness tests for the restore rules, plus the checks in the risks table; a recorded run on a long project.
4. The setting, its default, and the page guide sentences for each following page.

## Not done

- Nothing was run in REAPER or Audacity; every "pending" above has no owner-side check yet.
- The zoom and scroll calls were not looked up: the ReaScript reference is not reachable from a cloud session ([reaper-api-for-planned-commands](reaper-api-for-planned-commands.md)).
- Each page's code was not traced for where it would call the DAW; the per-page table comes from the pages' guides and the existing callers listed above.

## Questions for the owner

1. Do you want the cheap tier (the DAW selects the chapter's track, moves the cursor and shows it) without any mute at all, as a first version? The mute can follow once you see how it feels.
2. Should the mute (quieting the other chapters) exist at all, given that it changes track state the project saves and that a mirror that crashes mid-way could leave it? If yes, is "restore on leaving the page, on the switch turning off and on closing the app" enough, or should the app also warn when it finds a mute it set left over at the next start?
3. One switch with a choice of what it does (design B), one switch only (A), or a row per page (C)? The recommendation is B, then D if wanted.
4. Default off or on? The recommendation is off, because it changes the DAW without a click.
5. Which pages follow? The proposal: Booth, Editing, Proof's chapter view, Pickups with a chapter scope, and Production's chapter cells (on the click that opens one). Is any page missing or wrongly included, in particular the Script reader (no) and the Master page (no, and it must restore)?
6. Should Production follow the page, or only the click that opens a chapter?
7. When a chapter has voices in a folder, should the DAW select the folder and all its children, or only the child being worked on? The Editing page edits all the voices at once; the Booth records one.
8. Should arming ever happen on page entry? The proposal is no: arming stays with the Record press.
9. If the narrator selects a different track in the DAW on purpose, should the mirror leave them there until the next page change (the proposal), or pull them back?
10. If the DAW is closed when a page changes, should the app apply the current page once when the DAW next connects, or only follow changes that happen while it is connected?
11. Audacity: select and move the cursor only (the proposal), with the mute left out? Or should Audacity be left out altogether until its view behaviour is checked?
12. Does the mirror need to survive an app restart? That is, should the narrator reopen the app on a chapter and find the DAW at that chapter?
13. If the DAW lags a keyboard step on a very long book, is a short pause acceptable, or must it be instant, even if that means skipping the mute on a project over some size?
14. Should the REAPER checks (zoom, scroll, a mute's undo and dirty-flag behaviour, a long project) be run and recorded before you decide, so the questions above are answered with measurements?
