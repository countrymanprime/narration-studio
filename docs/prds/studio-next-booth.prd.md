# Studio Next Booth: Record Preconditions, Leaving While Recording, Roll and Punch, Resume, Suspected Flags and Key Hints

**Source:** owner request of 2026-10-10 ([Studio Next Rebuild](studio-next-rebuild.prd.md)); "Booth rulings" and the record-preconditions rule in `studio-next/research/repo-compare-decisions.md`; the mock's `studio-next/src/pages/Booth.tsx`, `studio-next/src/pages/booth/` and `studio-next/src/state/commands/booth.ts`.

**Builds on:** the delivered Booth ([ADR 0388](../adr/0388-the-booth-is-a-page-keyed-by-its-address-and-only-exit-booth-stops-a-live-session.md), [ADR 0720](../adr/0720-the-booth-fills-the-whole-window-and-f11-takes-the-window-fullscreen.md), [ADR 0196](../adr/0196-the-read-aloud-control-bar-lives-in-a-dialog-footer-slot-and-space-plays-or-stops-a-session.md), [ADR 0111](../adr/0111-the-resume-point-comes-from-transcribing-the-recorded-tail-and-placing-it-with-the-tracker.md), [ADR 0112](../adr/0112-the-resume-card-looks-up-where-the-recording-ends-on-open-and-a-choice-only-sets-where-start-begins.md), [ADR 0115](../adr/0115-live-flags-are-suspected-judged-per-closed-segment-and-forgive-what-transcript-compare-forgives.md), [ADR 0117](../adr/0117-live-flags-are-kept-as-suspected-findings-merged-per-chapter-when-a-session-ends.md), [ADR 0455](../adr/0455-the-built-in-recorder-records-each-take-to-a-partial-file-in-the-projects-recordings-folder-and-links-it-to-its-take-name.md)), record in REAPER ([ADR 0380](../adr/0380-record-in-reaper-is-a-project-scope-setting-and-arming-is-a-separate-click-from-play.md), [ADR 0231](../adr/0231-chapter-track-state-is-one-read-only-answer-of-the-transport-the-arms-the-input-device-and-one-tracks-items.md), [ADR 0232](../adr/0232-arming-for-a-recording-remembers-the-narrators-arms-makes-no-undo-point-and-the-app-stops-only-the-recording-it-started.md)), punch and roll ([ADR 0246](../adr/0246-punch-and-roll-moves-only-the-edit-cursor-and-anchors-words-by-a-polled-play-position.md), [ADR 0560](../adr/0560-punch-and-roll-times-a-word-past-the-anchors-by-aligning-it-in-the-recording-before-falling-back-to-the-reading-pace.md)), the input registry ([ADR 0361](../adr/0361-app-commands-go-through-one-registry-and-keyboard-midi-and-hid-are-input-sources-bound-by-a-remappable-keymap.md)). It carries over the unfinished phases of the old read-aloud control bar, teleprompter integration, engines and booth-actions PRDs (see the overview's carried-over table). The DAW commands are [DAW Ports and Capabilities](studio-next-daw-ports-and-capabilities.prd.md).

**Status (2026-10-12):** the swap is in review (SN-O10, #1258): `/booth` mounts the Studio Next Booth and the old Booth is deleted. Bookmarks and the pickup session (phase 8) are built but not yet mounted on the page; the trailing confirmation pass of item 10 has no slice (#1476 lists it as not built).

## Problem Statement

The Booth is where the narrator records. The owner's rulings turn it into a DAW-neutral, honest recorder: Record shows why it cannot start; the one-chapter-one-track rule and the "start at the end of the last item" rule protect the project; leaving the Booth while recording asks instead of silently stopping; a roll keeps the earlier audio and asks first where the DAW would lose it; the resume point, suspected flags and key hints are consistent. The real Booth has most pieces (record in REAPER, punch from here, resume prompt, live flags) but keyed to REAPER, with a silent stop on some exits and an arming model (a separate click) the mock does not have.

## Evidence

- **Mock.** `studio-next/src/selectors/booth.ts`; `recordCheck`, `recordStartAt`, `roll`, `setChangeGuard` in `studio-next/src/state/commands/booth.ts`, `studio-next/src/state/daw.ts` and `studio-next/src/state/store.ts`; `studio-next/src/providers/speech.ts` (suspected skips and restarts as Pickups with `src: 'speech'`, `live: true`, stable `flagKey`, dismissible, never re-added); `studio-next/src/pages/booth/{Teleprompter,SidePanel,TopBar}.tsx`; `studio-next/src/ui/KeyHints.tsx`; `studio-next/src/state/commands/passagemap.ts`. Tests: `studio-next/tests/booth.test.tsx`, `studio-next/tests/booth-daw.test.tsx`, `studio-next/tests/d2-booth.test.tsx`, `studio-next/tests/d2-keycaps.test.tsx`.
- **Repo.** `apps/ui/src/components/booth/{BoothPage,BoothSession,BoothView,BuiltinRecorder,ResumePrompt,ReaderFlagsPanel,RecordInReaperConfirm}.tsx`; hooks `useBoothRecording`, `useRecordInReaper`, `useTeleprompterSession`, `useResumeLocate`, `useFollowCursor`; commands `reading.toggle`, `booth.fullscreen` in `apps/ui/src/input/commands.catalog.ts`; `apps/desktop/internal/teleprompter/`, `liveflags/`, `recording/`.

| Ruling | Real today |
| --- | --- |
| Record in any supported DAW, DAW-neutral wording | Record in REAPER toggle and confirm; wording names REAPER |
| Record preconditions with the reason on the control | Refusals named (`not_armed`, `other_armed`, `several_armed`) ([ADR 0380](../adr/0380-record-in-reaper-is-a-project-scope-setting-and-arming-is-a-separate-click-from-play.md)); superseded (DQ-5) |
| Chapter's track only; start at the end of the last item | Resume locate reads the live cursor and items ([ADR 0349](../adr/0349-the-resume-locate-reads-reapers-live-cursor-and-items-first-and-falls-back-to-the-saved-project-never-to-a-guess.md)); start rule not verified |
| Leave while recording: confirm or stop | Exit and Escape ask "Stop reading?"; leaving by nav keeps the session running ([ADR 0388](../adr/0388-the-booth-is-a-page-keyed-by-its-address-and-only-exit-booth-stops-a-live-session.md) decision 3) |
| Roll as one command with a take kept; confirm where destructive | `punch_to` moves the edit cursor only ([ADR 0246](../adr/0246-punch-and-roll-moves-only-the-edit-cursor-and-anchors-words-by-a-polled-play-position.md)) |
| Suspected flags automatic, dismissible, no manual flag | Live flags kept as findings ([ADR 0117](../adr/0117-live-flags-are-kept-as-suspected-findings-merged-per-chapter-when-a-session-ends.md)) |
| Pickup session in Booth, bookmarks, key hints, F11 | F11 exists; others to build |
| Passage map written at record time | Absent |

## Proposed Solution

1. **Record preconditions.** One selector (`recordCheck`) over capability, project state and chapter-track state returns `null` or a `Refusal`; the Record control shows the reason from the capability or the check, never its own wording.
2. **One chapter, one track.** Only the chapter's track is armed for a take, restoring the previous arms afterwards ([ADR 0232](../adr/0232-arming-for-a-recording-remembers-the-narrators-arms-makes-no-undo-point-and-the-app-stops-only-the-recording-it-started.md)); a take starts at the end of the last item on the track unless the narrator explicitly punches. Record arms only the chapter's track and starts at the end of the last item; Space stays one action; a failed precondition shows the capability's refusal reason (DQ-5). [ADR 0380](../adr/0380-record-in-reaper-is-a-project-scope-setting-and-arming-is-a-separate-click-from-play.md)'s separate arming click is removed with the old Booth.
3. **Leave guard.** A leave guard registered by the Booth while a recording runs asks "Stop recording?" (ConfirmDialog) and on yes stops the DAW recording the app started and replays the navigation; Escape and page changes use it; a reading-only session keeps [ADR 0388](../adr/0388-the-booth-is-a-page-keyed-by-its-address-and-only-exit-booth-stops-a-live-session.md) decision 3.
4. **Roll and punch.** Roll calls the DAW's roll; where the capability is `destructive` a confirmation precedes it; where backups are on or REAPER auto-creates a take it is non-destructive and does not ask.
5. **Resume.** "Resume at paragraph n" from the DAW's live cursor, else the saved project, else the Booth's own record; the source and confidence are shown ([ADR 0349](../adr/0349-the-resume-locate-reads-reapers-live-cursor-and-items-first-and-falls-back-to-the-saved-project-never-to-a-guess.md)).
6. **Suspected flags** are findings with a stable key; dismissing one keeps a tombstone so it is not raised again.
7. **Reading.** Sentence-phrase navigation (keep ours), smooth scroll that follows the voice and the mock's wheel browse (the wheel and Page Up and Down move the view by pixels and the reading position stays; `studio-next/src/pages/booth/Teleprompter.tsx`, DQ-17; [ADR 0119](../adr/0119-a-hand-scroll-pauses-following-until-the-current-word-is-back-in-the-band.md) is kept only where it describes identical behaviour), a click on a word, levels (`LevelMeter`), speaker chips, credits readable, F11, foot pedal Space only (start and stop).
8. **Key hints footer** from the catalogue (`KeyHints`), bookmarks ribbons on the right margin, a pickup session in the side panel ("Open in Booth at this pickup" lives here).
9. **Passage map.** The Booth writes a passage map at record time (paragraph, word, seconds, item and take ids the DAW gave) so Editing lists passages exactly; alignment is only for takes recorded elsewhere.
10. **Engine picker** lists what the host reports; Moonshine is offered as the live engine in the Booth only; Whisper-class confirms after. The default engine is unchanged ([ADR 0414](../adr/0414-the-teleprompter-default-engine-stays-whisper-tiny-until-a-real-time-ab-evaluation-runs.md)); the mock picks none (DQ-9).

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

- **SN0-Q1 / DQ-1.** The Studio Next Booth page (`studio-next/src/pages/Booth.tsx`) is the spec, including tokens, sizes and layout; the benchmark's measured values and the ADRs measured to it are superseded where they differ ([ADR 0585](../adr/0585-mock-fidelity-is-a-pixel-match-at-the-mocks-own-size-and-theme-scored-by-a-tool-that-reports-and-does-not-gate.md), [ADR 0740](../adr/0740-mock-match-is-text-blind-and-a-diagnostic-and-only-the-benchmark-mocks-are-kept.md)).
- **SN0-Q2 / DQ-2.** Replace. Seams and components land with no route; one PR (SNO-10) swaps the route and deletes the old Booth.
- **DQ-5.** Record arms only the chapter's track, starts at the end of the last item, Space stays one action, a failed precondition shows the capability's refusal reason. [ADR 0380](../adr/0380-record-in-reaper-is-a-project-scope-setting-and-arming-is-a-separate-click-from-play.md) is superseded to that extent.
- **DQ-6.** Pickups only points to the Booth; the Booth pickup session is SNO-8.
- **DQ-9.** No conflict; [ADR 0414](../adr/0414-the-teleprompter-default-engine-stays-whisper-tiny-until-a-real-time-ab-evaluation-runs.md) is unchanged.
- **DQ-13.** Companion: frozen as built, no work.
- **DQ-17.** The mock's wheel-browse behaviour is the spec.
- **SN0-Q8.** Screenshots are compared against the Studio Next mock page.
- **Process defaults, taken as recommended (2026-10-11).** Leave while recording asks "Stop recording?" with Cancel as the way to stay; the passage map is the project sidecar `passagemap.json`, written when the take ends and validated on read; opening and closing credits record and map to their regions, checked in SNO-6.

## Users & Context

A narrator mid-take, hands on keys or a pedal, who must never lose their place or a take. The Booth fills the window ([ADR 0720](../adr/0720-the-booth-fills-the-whole-window-and-f11-takes-the-window-fullscreen.md)); accessibility: nothing interrupts a take except the leave guard.

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
| [ADR 0388](../adr/0388-the-booth-is-a-page-keyed-by-its-address-and-only-exit-booth-stops-a-live-session.md) | SUPERSEDE (decision 3 while recording) | Leave while recording (A10) |
| [ADR 0232](../adr/0232-arming-for-a-recording-remembers-the-narrators-arms-makes-no-undo-point-and-the-app-stops-only-the-recording-it-started.md) | EXTEND | Confirm stops the DAW recording the app started |
| [ADR 0380](../adr/0380-record-in-reaper-is-a-project-scope-setting-and-arming-is-a-separate-click-from-play.md) | SUPERSEDE (DQ-5) | Arming is not a separate click |
| [ADR 0246](../adr/0246-punch-and-roll-moves-only-the-edit-cursor-and-anchors-words-by-a-polled-play-position.md) | SUPERSEDE (roll) | In the DAW PRD |
| [ADR 0560](../adr/0560-punch-and-roll-times-a-word-past-the-anchors-by-aligning-it-in-the-recording-before-falling-back-to-the-reading-pace.md) | EXTEND | Passage map avoids alignment for Booth takes |
| [ADR 0111](../adr/0111-the-resume-point-comes-from-transcribing-the-recorded-tail-and-placing-it-with-the-tracker.md), [ADR 0112](../adr/0112-the-resume-card-looks-up-where-the-recording-ends-on-open-and-a-choice-only-sets-where-start-begins.md), [ADR 0205](../adr/0205-the-prompter-remembers-its-last-word-per-chapter-in-a-host-named-file-dropped-when-the-text-changes.md), [ADR 0206](../adr/0206-resume-reconciles-the-recording-with-the-prompters-last-word-in-the-host-and-asks-only-when-they-disagree.md), [ADR 0349](../adr/0349-the-resume-locate-reads-reapers-live-cursor-and-items-first-and-falls-back-to-the-saved-project-never-to-a-guess.md), [ADR 0353](../adr/0353-the-resume-prompt-goes-away-when-reaper-plays-and-a-bounded-host-poll-follows-the-cursor-only-while-it-shows.md) | EXTEND | Resume shown with source |
| [ADR 0115](../adr/0115-live-flags-are-suspected-judged-per-closed-segment-and-forgive-what-transcript-compare-forgives.md), [ADR 0117](../adr/0117-live-flags-are-kept-as-suspected-findings-merged-per-chapter-when-a-session-ends.md), [ADR 0118](../adr/0118-read-aloud-flags-are-highlight-kinds-with-an-inline-hint-and-skips-and-restarts-show-by-default.md) | EXTEND | Dismissible with a stable key |
| [ADR 0119](../adr/0119-a-hand-scroll-pauses-following-until-the-current-word-is-back-in-the-band.md) | SUPERSEDE except identical behaviour (DQ-17) | The mock's wheel browse |
| [ADR 0107](../adr/0107-moonshine-ships-inside-the-windows-teleprompter-sidecar-and-runs-only-from-a-verified-catalog-install.md), [ADR 0414](../adr/0414-the-teleprompter-default-engine-stays-whisper-tiny-until-a-real-time-ab-evaluation-runs.md) | KEEP (DQ-9) | Engine default unchanged |
| [ADR 0196](../adr/0196-the-read-aloud-control-bar-lives-in-a-dialog-footer-slot-and-space-plays-or-stops-a-session.md), [ADR 0720](../adr/0720-the-booth-fills-the-whole-window-and-f11-takes-the-window-fullscreen.md), [ADR 0655](../adr/0655-the-booths-current-word-is-an-accent-tint-with-a-caret-not-a-solid-fill.md), [ADR 0656](../adr/0656-the-booths-rec-pill-draws-with-its-own-rec-fillrec-text-tokens-not-a-status-tone.md) | KEEP | Space; full window; styles |
| [ADR 0381](../adr/0381-the-companion-panel-is-the-read-aloud-session-in-the-whole-window-and-follows-the-voice-not-the-daw-playhead.md), [ADR 0401](../adr/0401-companion-mode-resizes-and-pins-the-one-existing-window-and-never-opens-a-second-one.md) | KEEP (DQ-13) | Companion untouched |
| [ADR 0585](../adr/0585-mock-fidelity-is-a-pixel-match-at-the-mocks-own-size-and-theme-scored-by-a-tool-that-reports-and-does-not-gate.md), [ADR 0740](../adr/0740-mock-match-is-text-blind-and-a-diagnostic-and-only-the-benchmark-mocks-are-kept.md) | SUPERSEDE (DQ-1) | The Studio Next mock is the spec; benchmark mock 03 is deleted at cutover |

## Technical Approach

**Interfaces.** `BoothPort`: `recordCheck(chapter)`, `recordStartAt(chapter)`, `record()`, `stop()`, `roll(at, {confirmed})`, `resume(chapter)`, `passageMap.write()` over `DawClient` and the teleprompter bindings; `LeaveGuard` from [App Shell and Registries](studio-next-app-shell-and-registries.prd.md); engines from the existing provider capabilities binding.

**Contracts.** `passageMapSchema` and its golden; `ResumePoint` and `LiveFlag` schemas (mock: `studio-next/src/domain/daw.ts`) mapped onto the existing resume and flag payloads, extended additively (`source`, `confident`, `key`); `DawResult` from the DAW PRD.

**Architecture.** `components/booth/*` consume ports and selectors; no component names a DAW; capability gating through `CapabilityGate`.

**Test plan.** Ported mock tests; host tests for the passage map and the stop-on-leave path with a fake recorder (`recordingtest.Fake`); visual rows for Record refusal, leave dialog, roll confirm, resume prompt, bookmarks ribbon, footer; aria for dialogs; owner steps pending on #992 (microphone check, REAPER recording, pedal).

**Rollout.** Seams, ports and components land first with no route. One PR (SNO-10) swaps the Booth route and deletes the old Booth (`BoothPage`, `BoothView`, `ResumePrompt`, `RecordInReaperConfirm`, the record-in-REAPER hook and their stories and rows); files the frozen Companion still imports stay (SNO-1 lists them). No flag, no period with two Booths.

**ADRs.** A10 leave while recording; passage map ADR.

**Trust boundaries.** Stopping a recording the app started ([ADR 0232](../adr/0232-arming-for-a-recording-remembers-the-narrators-arms-makes-no-undo-point-and-the-app-stops-only-the-recording-it-started.md)) and the new sidecar file; threat-model rows 4g and 4h re-read.

**Risks.** A path that leaves REAPER recording (mitigation: the only stop is `recordStop`, and tests exercise every exit); owner hardware steps are pending.

## Implementation Phases

| # | Phase | Description | Status | Parallel | Depends | Est. (pw) | PRP Plan |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | ADR and audit | A10; audit of the current Booth against the table, including the files the Companion shares | done (SN-O1 #1035; ADR 0790, ADR 0791) | - | SN0-1 | 0.5 | - |
| 2 | Record preconditions | `recordCheck`, reasons on the control, start rule | done (SN-O21 #1220, SN-O22 #1221, SN-O23 #1223) | 3 | 1, SND-2 | 1.0 | - |
| 3 | Leave guard | Registration, dialog, stop on yes | done (SN-O3 #1082, SN-O31 #1224) | 2 | 1, SNR-3 | 0.8 | - |
| 4 | Roll and punch confirm | Uses the DAW roll and `destructive` | done (SN-O4 #1226) | 5 | 2, SND-6a | 0.8 | - |
| 5 | Resume and flags | Source display, tombstones, stable keys | done (SN-O51 #1227, SN-O52 #1228) | 4 | 1 | 1.0 | - |
| 6 | Reading polish | Phrase navigation, scroll rule check, levels, chips, footer | done (SN-O61 #1229, SN-O62 #1232, SN-O63 #1233, SN-O64 #1234) | 4 | SNF-4 | 1.0 | - |
| 7 | Passage map | Writer, sidecar, schema, golden | done (SN-O71 #1237, SN-O72 #1238) | 5 | 2 | 0.8 | - |
| 8 | Pickup session and bookmarks | Side panel, ribbons | built, not mounted (SN-O81 #1242, SN-O82 #1249; the page does not mount them yet) | - | SNB-5, SNQ-8 | 0.7 | - |
| 9 | Engine picker | Host-reported engines, Moonshine live label | dropped: the mock Booth has no engine picker (SNO-1 finding 8); the engine and model stay in Settings > Booth | - | 1 | 0.4 | - |
| 10 | Swap and close-out | Route swap, delete the old Booth and its old equivalents, rows, guide, screenshots; carried-over owner checks | in review (SN-O10, #1258; the SNO-1 audit note is deleted, its tables acted on) | - | 2 to 9 | 0.5 | - |

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

## Research Summary

Read: the mock's booth selectors, commands, providers and tests; the rulings; the real Booth file list, ADRs 0232, 0246, 0380, 0388. Not done: the Booth audit; no run with a microphone or REAPER.

## Visual Spec

Mock page: Booth (`studio-next/src/pages/Booth.tsx`), the only spec; one app-wide theme per D69. States: ready, recording, refusal, leave dialog, roll confirm, resume.
