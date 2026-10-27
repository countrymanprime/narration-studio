# Studio Next Booth: Record Preconditions, Leaving While Recording, Roll and Punch, Resume, Suspected Flags and Key Hints

**Source:** owner request of 2026-10-10 ([Studio Next Rebuild](studio-next-rebuild.prd.md)); "Booth rulings" and the record-preconditions rule in `studio-next/research/repo-compare-decisions.md`; the mock's `studio-next/src/pages/Booth.tsx`, `studio-next/src/pages/booth/` and `studio-next/src/state/commands/booth.ts`.

**Builds on:** the delivered Booth ([Booth](../guides/using-the-app/booth.md), [The page](../guides/using-the-app/booth.md#the-page), [Design system reference](../design/design-system.md), [Resume: where REAPER is and where the prompter was](../architecture/manuscript-teleprompter.md#resume-where-reaper-is-and-where-the-prompter-was), [Where you stopped](../guides/using-the-app/booth.md#where-you-stopped), [Flags](../architecture/manuscript-teleprompter.md#flags), [Shared Findings Contract](../architecture/findings-contract.md), [Built-in recorder: what the app declares for it](../reference/daw/builtin-recorder.md)), record in REAPER ([app.go](../../src/studio/desktop/app.go), [Live transport and track state (`narration_track_state.lua`)](../architecture/reaper-bridge.md#live-transport-and-track-state-narration_track_statelua), [Recording in REAPER (`narration_transport.lua`)](../architecture/reaper-bridge.md#recording-in-reaper-narration_transportlua)), punch and roll ([narration_punch.lua](../../src/studio/integrations/reaper/narration_punch.lua), [Punch from here: where a word's time comes from](../architecture/manuscript-teleprompter.md#punch-from-here-where-a-words-time-comes-from)), the input registry ([Studio shell and registries](../architecture/studio-shell-and-registries.md)). It carries over the unfinished phases of the old read-aloud control bar, teleprompter integration, engines and booth-actions PRDs (see the overview's carried-over table). The DAW commands are [DAW Ports and Capabilities](studio-next-daw-ports-and-capabilities.prd.md).

**Status (2026-10-12):** the swap is done (SN-O10, #1258): `/booth` mounts the Studio Next Booth and the old Booth is deleted, with bookmarks and the pickup session (phase 8) on the page; the trailing confirmation pass of item 10 has no slice (#1476 lists it as not built).

## Problem Statement

The Booth is where the narrator records. The owner's rulings turn it into a DAW-neutral, honest recorder: Record shows why it cannot start; the one-chapter-one-track rule and the "start at the end of the last item" rule protect the project; leaving the Booth while recording asks instead of silently stopping; a roll keeps the earlier audio and asks first where the DAW would lose it; the resume point, suspected flags and key hints are consistent. The real Booth has most pieces (record in REAPER, punch from here, resume prompt, live flags) but keyed to REAPER, with a silent stop on some exits and an arming model (a separate click) the mock does not have.

## Evidence

- **Mock.** `studio-next/src/selectors/booth.ts`; `recordCheck`, `recordStartAt`, `roll`, `setChangeGuard` in `studio-next/src/state/commands/booth.ts`, `studio-next/src/state/daw.ts` and `studio-next/src/state/store.ts`; `studio-next/src/providers/speech.ts` (suspected skips and restarts as Pickups with `src: 'speech'`, `live: true`, stable `flagKey`, dismissible, never re-added); `studio-next/src/pages/booth/{Teleprompter,SidePanel,TopBar}.tsx`; `studio-next/src/ui/KeyHints.tsx`; `studio-next/src/state/commands/passagemap.ts`. Tests: `studio-next/tests/booth.test.tsx`, `studio-next/tests/booth-daw.test.tsx`, `studio-next/tests/d2-booth.test.tsx`, `studio-next/tests/d2-keycaps.test.tsx`.
- **Repo.** `src/studio/ui/src/components/booth/{BoothPage,BoothSession,BoothView,BuiltinRecorder,ResumePrompt,ReaderFlagsPanel,RecordInReaperConfirm}.tsx`; hooks `useBoothRecording`, `useRecordInReaper`, `useTeleprompterSession`, `useResumeLocate`, `useFollowCursor`; commands `reading.toggle`, `booth.fullscreen` in `src/studio/ui/src/input/commands.catalog.ts`; `src/studio/desktop/internal/teleprompter/`, `liveflags/`, `recording/`.

| Ruling | Real today |
| --- | --- |
| Record in any supported DAW, DAW-neutral wording | Record in REAPER toggle and confirm; wording names REAPER |
| Record preconditions with the reason on the control | Refusals named (`not_armed`, `other_armed`, `several_armed`) ([app.go](../../src/studio/desktop/app.go)); superseded (DQ-5) |
| Chapter's track only; start at the end of the last item | Resume locate reads the live cursor and items ([Resume: where REAPER is and where the prompter was](../architecture/manuscript-teleprompter.md#resume-where-reaper-is-and-where-the-prompter-was)); start rule not verified |
| Leave while recording: confirm or stop | Exit and Escape ask "Stop reading?"; leaving by nav keeps the session running ([Booth](../guides/using-the-app/booth.md) decision 3) |
| Roll as one command with a take kept; confirm where destructive | `punch_to` moves the edit cursor only ([narration_punch.lua](../../src/studio/integrations/reaper/narration_punch.lua)) |
| Suspected flags automatic, dismissible, no manual flag | Live flags kept as findings ([Shared Findings Contract](../architecture/findings-contract.md)) |
| Pickup session in Booth, bookmarks, key hints, F11 | F11 exists; others to build |
| Passage map written at record time | Absent |

## Proposed Solution

1. **Record preconditions.** One selector (`recordCheck`) over capability, project state and chapter-track state returns `null` or a `Refusal`; the Record control shows the reason from the capability or the check, never its own wording.
2. **One chapter, one track.** Only the chapter's track is armed for a take, restoring the previous arms afterwards ([Recording in REAPER (`narration_transport.lua`)](../architecture/reaper-bridge.md#recording-in-reaper-narration_transportlua)); a take starts at the end of the last item on the track unless the narrator explicitly punches. Record arms only the chapter's track and starts at the end of the last item; Space stays one action; a failed precondition shows the capability's refusal reason (DQ-5). [app.go](../../src/studio/desktop/app.go)'s separate arming click is removed with the old Booth.
3. **Leave guard.** A leave guard registered by the Booth while a recording runs asks "Stop recording?" (ConfirmDialog) and on yes stops the DAW recording the app started and replays the navigation; Escape and page changes use it; a reading-only session keeps [Booth](../guides/using-the-app/booth.md) decision 3.
4. **Roll and punch.** Roll calls the DAW's roll; where the capability is `destructive` a confirmation precedes it; where backups are on or REAPER auto-creates a take it is non-destructive and does not ask.
5. **Resume.** "Resume at paragraph n" from the DAW's live cursor, else the saved project, else the Booth's own record; the source and confidence are shown ([Resume: where REAPER is and where the prompter was](../architecture/manuscript-teleprompter.md#resume-where-reaper-is-and-where-the-prompter-was)).
6. **Suspected flags** are findings with a stable key; dismissing one keeps a tombstone so it is not raised again.
7. **Reading.** Sentence-phrase navigation (keep ours), smooth scroll that follows the voice and the mock's wheel browse (the wheel and Page Up and Down move the view by pixels and the reading position stays; `studio-next/src/pages/booth/Teleprompter.tsx`, DQ-17; [useFollowCursor.ts](../../src/studio/ui/src/components/booth/useFollowCursor.ts) is kept only where it describes identical behaviour), a click on a word, levels (`LevelMeter`), speaker chips, credits readable, F11, foot pedal Space only (start and stop).
8. **Key hints footer** from the catalogue (`KeyHints`), bookmarks ribbons on the right margin, a pickup session in the side panel ("Open in Booth at this pickup" lives here).
9. **Passage map.** The Booth writes a passage map at record time (paragraph, word, seconds, item and take ids the DAW gave) so Editing lists passages exactly; alignment is only for takes recorded elsewhere.
10. **Engine picker** lists what the host reports; Moonshine is offered as the live engine in the Booth only; Whisper-class confirms after. The default engine is unchanged ([Manuscript Teleprompter](../architecture/manuscript-teleprompter.md)); the mock picks none (DQ-9).

## Key Hypothesis

If every refusal comes from a capability or a check and every exit passes the leave guard, the Booth can never lose a take silently and never word a DAW-specific message. We are wrong if a path leaves a recording running with no way to stop it.

## What We're NOT Building

- Booth mirror text (removed at the owner's request), a manual "flag for edit" (only automatic suspected flags), any work on the Companion (frozen as built, DQ-13; it has no equivalent in the mock).
- A change to the default engine (DQ-9).
- Anything the mock does not show ("if it is not in the mock it doesn't get built").
- Redo; wheel browse that moves the reading position.
- Punch from the Pickups page: Pickups only points to the Booth (DQ-6).
- Any new REAPER command here (they are in the DAW PRD).

## Success Metrics

| Metric | Target | Measured by |
| --- | --- | --- |
| Silent stops | 0: every exit while recording asks or is blocked | Ported `studio-next/tests/booth-daw.test.tsx` |
| Refusals worded in the Booth | 0 (all from capability or check) | Scan for strings near `CapabilityGate` |
| Take overwrites | 0: starts at the end of the last item unless punched | Harness and host tests |
| Key hints from the catalogue | 100% of Booth footer keys | Surfaces test |

## Decisions

Decided by the owner on 2026-10-11; nothing here waits for an answer, so G0 has no question for the owner.

- **SN0-Q1 / DQ-1.** The Studio Next Booth page (`studio-next/src/pages/Booth.tsx`) is the spec, including tokens, sizes and layout; the benchmark's measured values and the ADRs measured to it are superseded where they differ ([Mock match](../operations/verification-tooling.md#mock-match)).
- **SN0-Q2 / DQ-2.** Replace. Seams and components land with no route; one PR (SNO-10) swaps the route and deletes the old Booth.
- **DQ-5.** Record arms only the chapter's track, starts at the end of the last item, Space stays one action, a failed precondition shows the capability's refusal reason. [app.go](../../src/studio/desktop/app.go) is superseded to that extent.
- **DQ-6.** Pickups only points to the Booth; the Booth pickup session is SNO-8.
- **DQ-9.** No conflict; [Manuscript Teleprompter](../architecture/manuscript-teleprompter.md) is unchanged.
- **DQ-13.** Companion: frozen as built, no work.
- **DQ-17.** The mock's wheel-browse behaviour is the spec.
- **SN0-Q8.** Screenshots are compared against the Studio Next mock page.
- **Reading column (owner, 2026-10-26, #2251).** The Booth's text column is as wide as the Reader text **Column width** the Script uses (48, 64, 80 or 100 characters of the text, `ch`), and the Booth's Text settings popover gains that Column width slider, writing the same saved choice. This supersedes the mock's fixed `.btext{max-width:26em}` and its `TextPop` of Font and Size only. Paragraphs are left-aligned with no first-line indent, 0.5em apart: #2251 item 8's tighter spacing, in place of the mock's `.btext p{margin:0 0 .9em}`.
- **Process defaults, taken as recommended (2026-10-11).** Leave while recording asks "Stop recording?" with Cancel as the way to stay; the passage map is the project sidecar `passagemap.json`, written when the take ends and validated on read; opening and closing credits record and map to their regions, checked in SNO-6.

## Users & Context

A narrator mid-take, hands on keys or a pedal, who must never lose their place or a take. The Booth fills the window ([The page](../guides/using-the-app/booth.md#the-page)); accessibility: nothing interrupts a take except the leave guard.

## Solution Detail

### Acceptance criteria tied to the mock

| Behaviour | Mock reference | Acceptance |
| --- | --- | --- |
| Reason on Record | `studio-next/tests/booth-daw.test.tsx` | Not running, wrong track, playing, no DAW: each shows its capability or check sentence |
| Leave asks | `studio-next/src/state/store.ts` `setChangeGuard` | Esc and nav ask "Stop recording?"; Yes stops the DAW recording and leaves; No stays |
| Roll confirm | `studio-next/tests/booth-daw.test.tsx` | Audacity without backups asks first; with backups and REAPER it does not |
| Resume | `studio-next/tests/d2-booth.test.tsx` | "Resume at ¶ n" shows its source; choosing it sets where Start begins |
| Suspected flags | `studio-next/src/providers/speech.ts` | A skip or restart becomes a pickup marked automatic; dismiss is remembered |
| Key hints | `studio-next/tests/d2-keycaps.test.tsx` | Footer draws caps for the keys the catalogue binds |
| Passage map | `studio-next/src/selectors/passagemap.ts` | Editing lists a Booth-recorded chapter's passages without alignment |

### Supersedes / depends on ADRs

On conflict this PRD, and the ADR written when its phase lands, is the source of truth; old ADRs stay in force for unmigrated code ([register](studio-next-adr-register.prd.md)).

| ADR | Class | Note |
| --- | --- | --- |
| [Booth](../guides/using-the-app/booth.md) | SUPERSEDE (decision 3 while recording) | Leave while recording (A10) |
| [Recording in REAPER (`narration_transport.lua`)](../architecture/reaper-bridge.md#recording-in-reaper-narration_transportlua) | EXTEND | Confirm stops the DAW recording the app started |
| [app.go](../../src/studio/desktop/app.go) | SUPERSEDE (DQ-5) | Arming is not a separate click |
| [narration_punch.lua](../../src/studio/integrations/reaper/narration_punch.lua) | SUPERSEDE (roll) | In the DAW PRD |
| [Punch from here: where a word's time comes from](../architecture/manuscript-teleprompter.md#punch-from-here-where-a-words-time-comes-from) | EXTEND | Passage map avoids alignment for Booth takes |
| [Resume: where REAPER is and where the prompter was](../architecture/manuscript-teleprompter.md#resume-where-reaper-is-and-where-the-prompter-was), [Where you stopped](../guides/using-the-app/booth.md#where-you-stopped), [Data files](../reference/data-files.md), [Manuscript Teleprompter](../architecture/manuscript-teleprompter.md), [Resume: where REAPER is and where the prompter was](../architecture/manuscript-teleprompter.md#resume-where-reaper-is-and-where-the-prompter-was) | EXTEND | Resume shown with source |
| [Flags](../architecture/manuscript-teleprompter.md#flags), [Shared Findings Contract](../architecture/findings-contract.md), [readerFlags.ts](../../src/studio/ui/src/components/booth/readerFlags.ts) | EXTEND | Dismissible with a stable key |
| [useFollowCursor.ts](../../src/studio/ui/src/components/booth/useFollowCursor.ts) | SUPERSEDE except identical behaviour (DQ-17) | The mock's wheel browse |
| [Manuscript Teleprompter](../architecture/manuscript-teleprompter.md) | KEEP (DQ-9) | Engine default unchanged |
| [Design system reference](../design/design-system.md), [The page](../guides/using-the-app/booth.md#the-page), [Design system reference](../design/design-system.md), [Colour and contrast](../design/colour-and-contrast.md) | KEEP | Space; full window; styles |
| [Companion mode](../guides/using-the-app/booth.md#companion-mode), [bindings_companion.go](../../src/studio/desktop/bindings_companion.go) | KEEP (DQ-13) | Companion untouched |
| [Mock match](../operations/verification-tooling.md#mock-match) | SUPERSEDE (DQ-1) | The Studio Next mock is the spec; benchmark mock 03 is deleted at cutover |

## Technical Approach

**Interfaces.** `BoothPort`: `recordCheck(chapter)`, `recordStartAt(chapter)`, `record()`, `stop()`, `roll(at, {confirmed})`, `resume(chapter)`, `passageMap.write()` over `DawClient` and the teleprompter bindings; `LeaveGuard` from [App Shell and Registries](studio-next-app-shell-and-registries.prd.md); engines from the existing provider capabilities binding.

**Contracts.** `passageMapSchema` and its golden; `ResumePoint` and `LiveFlag` schemas (mock: `studio-next/src/domain/daw.ts`) mapped onto the existing resume and flag payloads, extended additively (`source`, `confident`, `key`); `DawResult` from the DAW PRD.

**Architecture.** `components/booth/*` consume ports and selectors; no component names a DAW; capability gating through `CapabilityGate`.

**Test plan.** Ported mock tests; host tests for the passage map and the stop-on-leave path with a fake recorder (`recordingtest.Fake`); visual rows for Record refusal, leave dialog, roll confirm, resume prompt, bookmarks ribbon, footer; aria for dialogs; owner steps pending on #992 (microphone check, REAPER recording, pedal).

**Rollout.** Seams, ports and components land first with no route. One PR (SNO-10) swaps the Booth route and deletes the old Booth (`BoothPage`, `BoothView`, `ResumePrompt`, `RecordInReaperConfirm`, the record-in-REAPER hook and their stories and rows); files the frozen Companion still imports stay (SNO-1 lists them). No flag, no period with two Booths.

**ADRs.** A10 leave while recording; passage map ADR.

**Trust boundaries.** Stopping a recording the app started ([Recording in REAPER (`narration_transport.lua`)](../architecture/reaper-bridge.md#recording-in-reaper-narration_transportlua)) and the new sidecar file; threat-model rows 4g and 4h re-read.

**Risks.** A path that leaves REAPER recording (mitigation: the only stop is `recordStop`, and tests exercise every exit); owner hardware steps are pending.

## Implementation Phases

| # | Phase | Description | Status | Parallel | Depends | Est. (pw) | PRP Plan |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | ADR and audit | A10; audit of the current Booth against the table, including the files the Companion shares | done (SN-O1 #1035) | - | SN0-1 | 0.5 | - |
| 2 | Record preconditions | `recordCheck`, reasons on the control, start rule | done (SN-O21 #1220, SN-O22 #1221, SN-O23 #1223) | 3 | 1, SND-2 | 1.0 | - |
| 3 | Leave guard | Registration, dialog, stop on yes | done (SN-O3 #1082, SN-O31 #1224) | 2 | 1, SNR-3 | 0.8 | - |
| 4 | Roll and punch confirm | Uses the DAW roll and `destructive` | done (SN-O4 #1226) | 5 | 2, SND-6a | 0.8 | - |
| 5 | Resume and flags | Source display, tombstones, stable keys | done (SN-O51 #1227, SN-O52 #1228) | 4 | 1 | 1.0 | - |
| 6 | Reading polish | Phrase navigation, scroll rule check, levels, chips, footer | done (SN-O61 #1229, SN-O62 #1232, SN-O63 #1233, SN-O64 #1234) | 4 | SNF-4 | 1.0 | - |
| 7 | Passage map | Writer, sidecar, schema, golden | done (SN-O71 #1237, SN-O72 #1238) | 5 | 2 | 0.8 | - |
| 8 | Pickup session and bookmarks | Side panel, ribbons | done: bookmarks (`bookmarks/BookmarkRibbons.tsx`, `bookmarks/useBoothBookmarks.ts`) and the pickup session (`pickups/PickupSession.tsx`, `pickups/usePickupSession.ts`) are mounted by `booth/page/BoothNextPage.tsx` (SN-O81 #1242, SN-O82 #1249, SN-O103 #1516) | - | SNB-5, SNQ-8 | 0.7 | - |
| 9 | Engine picker | Host-reported engines, Moonshine live label | dropped: the mock Booth has no engine picker (SNO-1 finding 8); the engine and model stay in Settings > Booth | - | 1 | 0.4 | - |
| 10 | Swap and close-out | Route swap, delete the old Booth and its old equivalents, rows, guide, screenshots; carried-over owner checks | done: `/booth` mounts `BoothNextPage` (`src/studio/ui/src/App.tsx`) and the old Booth is deleted (SN-O10, #1258) | - | 2 to 9 | 0.5 | - |

### Phase Details

- **Phase 1.** The audit decides which rows of the evidence table are already true and lists the Booth files the Companion imports, which the swap keeps.
- **Phase 4.** Blocked until the roll spike result and command exist; the confirm UI can be built against the mock.
- **Phase 10.** The carried-over owner checks (microphone, REAPER recording, pedal) are listed on #992.

### Parallelism Notes

2 and 3 are independent; 4 follows the roll command; 5, 6, 7 are independent of each other.

### Parallel-session compatibility

| Phase | Files touched | Collides with |
| --- | --- | --- |
| 2 | `components/booth/useRecordInReaper.ts`, `BoothView.tsx` | Booth slices (same files) |
| 3 | `components/booth/BoothPage.tsx`, registries | App shell slices |
| 7 | `internal/recording`, `internal/teleprompter` | Native recording streams |
| 10 | `BoothPage.tsx`, visual rows | Any Booth slice |

### Slices

| Slice | Scope | Depends on | Parallel-safe | Verification |
| --- | --- | --- | --- | --- |
| SNO-1 | Phase 1 | SN0-1 | yes | Audit comment (with the Companion-shared files); ADR |
| SNO-2 | Phase 2 | SNO-1, SND-2 | yes | Ported tests; visual |
| SNO-3 | Phase 3 | SNO-1, SNR-3 | yes | Ported tests; aria |
| SNO-4 | Phase 4 | SNO-2, SND-6a | yes | Ported tests; owner step pending |
| SNO-5 | Phase 5 | SNO-1 | yes | Ported tests |
| SNO-6 | Phase 6 | SNF-4 | yes | Visual rows |
| SNO-7 | Phase 7 | SNO-2 | yes | Go tests; golden |
| SNO-8 | Phase 8 | SNB-5, SNQ-8 | yes | Component tests |
| SNO-9 | Phase 9 | SNO-1 | yes | Provider capability tests |
| SNO-10 | Phase 10 (swap; deletes the old Booth) | SNO-2..9 | no | Visual suite for the page; Screenshots against the Studio Next Booth |

## Decisions Log

| Decision | Choice | Alternatives | Rationale |
| --- | --- | --- | --- |
| Reasons from capabilities (owner) | No UI-worded refusals | Per-control wording | Rulings 9 and 14 |
| Ask, do not silently stop (owner) | Leave guard | Silent stop | Ruling 16 |
| Pedal is Space only (owner) | Start and stop | Extra pedal actions | Ruling 13 |
| Record arms the chapter's track (DQ-5) | No separate arming click | Arming as a visible step | The mock is the spec |
| Where a chapter opens, and how far it is recorded (owner report, #2251, 2026-10-26) | An explicit target, then the word after the chapter's `recordedThrough` (host-derived from Proof, the Booth's takes or the track's length), then the place last read to in that chapter, then its top. Adds a **Recorded NN%** / **Complete** chip to the top bar and each chapter's figure in the chapter menu, which the mock lacks | The mock's single kept place per project; offering Resume at ¶ n only | A narrator who switched chapters and came back started at the top of a half-recorded chapter ([Where you stopped](../guides/using-the-app/booth.md#where-you-stopped)) |

## Research Summary

Read: the mock's booth selectors, commands, providers and tests; the rulings; the real Booth file list, `docs/architecture/reaper-bridge.md#recording-in-reaper-narration_transportlua, src/studio/integrations/reaper/narration_punch.lua, src/studio/desktop/app.go, docs/guides/using-the-app/booth.md`. Not done: the Booth audit; no run with a microphone or REAPER.

## Visual Spec

Mock page: Booth (`studio-next/src/pages/Booth.tsx`), the only spec; one app-wide theme per D69. States: ready, recording, refusal, leave dialog, roll confirm, resume.
