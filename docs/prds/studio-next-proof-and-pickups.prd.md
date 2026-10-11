# Studio Next Proof and Pickups: Cleared Versus Decided, History, the Stale Guard, the Recording Check and Takes at a Spot

**Source:** owner request of 2026-10-10 ([Studio Next Rebuild](studio-next-rebuild.prd.md)); "Proof rulings" and "Pickups and speech check rulings" in `studio-next/research/repo-compare-decisions.md`; the mock's `studio-next/src/pages/Proof.tsx`, `studio-next/src/pages/Pickups.tsx`, `studio-next/src/pages/proof/`, `studio-next/src/pages/pickups/`.

**Builds on:** the delivered Proof and Review work ([ADR 0120](../adr/0120-findings-are-read-and-decided-through-four-generic-bindings-and-a-decision-carries-the-evidence-version-it-was-made-against.md), [ADR 0470](../adr/0470-proof-follows-mock-04-pickup-edit-waived-are-words-over-the-stored-status-and-the-chapter-view-leads-with-its-notes.md), [ADR 0525](../adr/0525-proofing-is-met-by-a-current-zero-open-pickup-source-and-every-required-delivery-check-confirmed-through-the-shared-stage-engine.md), [ADR 0650](../adr/0650-proofs-notes-card-composes-table-flush-statusbadge-and-panels-header-and-the-filters-move-behind-a-popover.md) to [ADR 0652](../adr/0652-a-book-level-waveform-and-a-denser-notes-list-measurably-lower-mock-04s-score-so-adr-0651-stands.md), [ADR 0715](../adr/0715-proofs-book-level-waveform-card-belongs-to-the-chapter-its-selector-names.md)), the recording check ([ADR 0126](../adr/0126-recording-coverage-reads-the-take-markers-sequencematcher-alignment-and-folds-chance-matches-into-gaps.md) to [ADR 0132](../adr/0132-the-recording-check-ships-0-8-3-8-3-chosen-on-synthetic-fixtures-and-labelled-uncalibrated.md), [ADR 0264](../adr/0264-the-recording-check-summary-moves-into-a-slide-over-opened-from-the-rows-own-status-and-the-check-button-retires.md)), the workspace takes panel ([ADR 0700](../adr/0700-the-takes-panel-lists-a-passages-takes-from-the-saved-project-and-chooses-one-by-an-id-the-host-offered.md)), the Pickups page, take review ([ADR 0124](../adr/0124-take-review-groups-are-reviewed-on-the-review-page-each-read-is-navigated-by-its-index-and-the-scan-is-a-cancellable-job.md), [ADR 0165](../adr/0165-a-take-comparison-is-one-finding-per-group-over-its-one-span-built-from-the-saved-project-and-never-ranked.md)). It carries over the unfinished REAPER checks of the old review-dashboard PRD (overview table). The word-level script editor moves to [Script-Based Editing](studio-next-script-based-editing.prd.md); this PRD keeps the Proof notes page and the Pickups page.

**Status (2026-10-10):** draft.

## Problem Statement

The owner ruled that Proof counts two things (decided and cleared), that a note stays open until fixed, waived or dismissed, that a decision made on changed evidence is refused with what changed shown, that decisions keep an audit history, that a recording check card summarises the speech check, that the takes at a flagged spot are visible on Proof, and that the speech check classifies gaps (missing, extra, misread; an unread start or end is unfinished recording, not a pickup) with a confidence that is a number or null with a reason. The real app has the findings store with a decision history keyed to an evidence version and a recording check, but a different open/closed definition, no cleared counter, and a different gap model. Pickups only points to the Booth.

## Evidence

- **Mock.** `studio-next/src/selectors/proof.ts` (`isCleared`, `noteProgress`), `studio-next/src/state/commands/notes.ts` (`setNoteRes` the only writer of `res`), `studio-next/src/state/commands/proof.ts` (stale guard via `ui.proof.seen`), `studio-next/src/selectors/gaps.ts`, `studio-next/src/selectors/checks.ts`, `studio-next/src/selectors/checkcard.ts`, `studio-next/src/pages/proof/{CheckCard,Inspector,NotesTable,TakeLanes}.tsx`, `studio-next/src/selectors/proofTakes.ts`, `studio-next/src/state/commands/pickups.ts` (`detectPickups`, `writeThroughDone`, `reconcilePickupMarkers`), `studio-next/src/pages/pickups/CheckRecordings.tsx`. Tests: `studio-next/tests/proof.test.tsx`, `studio-next/tests/c2-proof.test.tsx`, `studio-next/tests/d2-proof.test.tsx`, `studio-next/tests/f-proof.test.tsx`, `studio-next/tests/pickups.test.tsx`, `studio-next/tests/c2-pickups.test.tsx`.
- **Repo.** `apps/ui/src/components/proof/{ProofPage,ProofChapterPage,NotesHeader,NotesStrip,FindingDetail,FindingsList,RecordingCheckCard,TakesPanel,ChapterWaveformCard,ReaperControls}.tsx`; `apps/ui/src/components/pickups/PickupsPage.tsx` (punch from here, mark done, export); `apps/desktop/internal/findings/store.go` (append-only decision history against an evidence version); `internal/coverage/`, `sidecars/transcript-compare/core/coverage_mode.py`; `internal/passagetakes`.

| Ruling | Real today |
| --- | --- |
| Decided and cleared counters; open until fixed, waived, dismissed | `unreviewed/accepted/dismissed/deferred` statuses; open = all but dismissed ([ADR 0525](../adr/0525-proofing-is-met-by-a-current-zero-open-pickup-source-and-every-required-delivery-check-confirmed-through-the-shared-stage-engine.md)); the summary has `unreviewed` |
| Stale decision guard with before/now in the Inspector | Decision carries the evidence version ([ADR 0120](../adr/0120-findings-are-read-and-decided-through-four-generic-bindings-and-a-decision-carries-the-evidence-version-it-was-made-against.md)); Inspector display to verify |
| Decision history list | Store keeps it; UI display to verify |
| Sort by time, confidence, severity; Sources line | Filters behind a popover ([ADR 0650](../adr/0650-proofs-notes-card-composes-table-flush-statusbadge-and-panels-header-and-the-filters-move-behind-a-popover.md)) |
| Recording check card (states none, checking, current, stale) | `RecordingCheckCard` exists |
| Takes at a flagged spot | `TakesPanel` (passage takes) in the workspace |
| Gap taxonomy; confidence null with reason; unfinished is not a pickup | Regions with counts; "misreads count as read" ([ADR 0126](../adr/0126-recording-coverage-reads-the-take-markers-sequencematcher-alignment-and-folds-chance-matches-into-gaps.md)) |
| Engine picker lists what the host reports | Whisper models in settings; picker to verify |
| Add marker through `DawResult` with a kind prefix | `add_finding_marker` ([ADR 0123](../adr/0123-the-approved-marker-is-one-take-marker-for-an-accepted-finding-named-like-transcript-compares-in-one-undo-point.md)) |

## Proposed Solution

1. **Two counters.** The findings summary gains `cleared` beside `decided`; the page, the rail badge and Production read the same selector. A note is cleared when fixed, waived or dismissed; deferred and "needs pickup not yet redone" are open. The Proof percent is the mock's (`noteProgress` in `studio-next/src/selectors/proof.ts`): it cannot read 100 while a pickup is open, and the two counters sit beside it (DQ-16).
2. **Stale guard UI.** A decision made on evidence the narrator has not seen is refused; the Inspector shows before and now; the typed note stays.
3. **History.** An append-only decision list per note in the Inspector.
4. **Notes.** Sort (time, confidence, severity) and a Sources line.
5. **Recording check card** with the mock's states and counts, "as of last save", accept turning a finding into a note with the suggested decision word, ignore remembered.
6. **Takes at a spot.** A badge in the notes table and "Takes at this spot" lanes in the Inspector, play raw only; takes are edited on Editing.
7. **Gap taxonomy** in the sidecar report: missing, extra words, misread inside the read part; an unread start or end is `unfinished`; pickup confidence is a number or null with `confReason`.
8. **Check recordings dialog** lists the engines the host reports; Moonshine is not offered here (Booth only).
9. **Pickups.** Source list keeps speech, audio, proof and by hand; done state; pickup to chapter; auto-mark recorded; confidence. Pickups only points to the Booth ("Open in Booth at this pickup"); no punch and no cursor move. The existing Punch from here is removed in the Pickups swap slice (SNQ-9, DQ-6).
10. **Add marker** goes through the DAW result with a kind prefix.

## Key Hypothesis

If "open" and "cleared" have one definition in one selector, the page, the rail and Production cannot disagree. We are wrong if the stage engine's "proofing met" ([ADR 0525](../adr/0525-proofing-is-met-by-a-current-zero-open-pickup-source-and-every-required-delivery-check-confirmed-through-the-shared-stage-engine.md)) and the new counters diverge for the same chapter.

## What We're NOT Building

- Proofer CSV import or export, a proofer packet.
- A full chapter player on Proof (Editing plays the whole chapter), play ±3 s and go-to-by-id (owner unclear), tone-match clip, print pickup script, a marker confirmation gate.
- A new decision store: the findings store stays the audit log.
- Punch or cursor move on Pickups (DQ-6): the existing Punch is deleted in the swap.
- A Proof percent other than the mock's (DQ-16).
- Anything the mock does not show ("if it is not in the mock it doesn't get built").

## Success Metrics

| Metric | Target | Measured by |
| --- | --- | --- |
| One definition of cleared | Page, rail, Production show the same number | Contract test over the shared selector |
| Stale decisions applied | 0 | Ported `studio-next/tests/d2-proof.test.tsx` |
| Confidence fabricated | 0: null with a reason when unknown | Report schema test |
| Unfinished recording listed as pickup | 0 | Gap taxonomy tests |

## Decisions

Decided by the owner on 2026-10-11; nothing here waits for an answer, so G0 has no question for the owner.

- **SN0-Q1 / DQ-1.** The Studio Next Proof and Pickups pages (`studio-next/src/pages/Proof.tsx`, `Pickups.tsx`) are the spec, including layout and sizes. [ADR 0650](../adr/0650-proofs-notes-card-composes-table-flush-statusbadge-and-panels-header-and-the-filters-move-behind-a-popover.md) to [ADR 0652](../adr/0652-a-book-level-waveform-and-a-denser-notes-list-measurably-lower-mock-04s-score-so-adr-0651-stands.md), [ADR 0651](../adr/0651-proofs-book-level-draws-no-waveform-header-because-its-notes-span-more-than-one-chapter.md) and [ADR 0715](../adr/0715-proofs-book-level-waveform-card-belongs-to-the-chapter-its-selector-names.md) are superseded where they differ; benchmark mock 04 stops being a spec.
- **SN0-Q2 / DQ-2.** Replace. Seams and components land with no route; one PR (SNQ-9) swaps the Proof and Pickups routes and deletes the old pages.
- **DQ-6.** Pickups only points to the Booth. The existing Punch on the Pickups page is removed in SNQ-9.
- **DQ-9.** No conflict; [ADR 0414](../adr/0414-the-teleprompter-default-engine-stays-whisper-tiny-until-a-real-time-ab-evaluation-runs.md) is unchanged.
- **DQ-15.** Evidence first, a suggested take with an honest (possibly null) confidence, never auto-applied; [ADR 0165](../adr/0165-a-take-comparison-is-one-finding-per-group-over-its-one-span-built-from-the-saved-project-and-never-ranked.md) is superseded to that extent.
- **DQ-16.** The mock's Proof percent with its two counters, decided and cleared; [ADR 0525](../adr/0525-proofing-is-met-by-a-current-zero-open-pickup-source-and-every-required-delivery-check-confirmed-through-the-shared-stage-engine.md) is superseded to that extent.
- **DQ-18.** Capability-driven take management for Audacity, as in the mock; [ADR 0660](../adr/0660-audacitys-finding-detail-hides-reapers-take-management-instead-of-disabling-it-through-capabilitygate.md) is superseded to that extent.
- **SN0-Q8.** Screenshots are compared against the Studio Next mock page.
- **Process defaults, taken as recommended (2026-10-11).** "Waived" maps to `dismissed` with reason `waived` (no new status, no migration); "as of last save" is the DAW's `savedAt` ([DAW Ports and Capabilities](studio-next-daw-ports-and-capabilities.prd.md)).

## Users & Context

A narrator proofing a chapter note by note and a proofer-like pass after recording; keyboard use (keys in the footer).

## Solution Detail

### Acceptance criteria tied to the mock

| Behaviour | Mock reference | Acceptance |
| --- | --- | --- |
| Cleared versus decided | `studio-next/src/selectors/proof.ts` | A deferred note counts decided and open; a dismissed note counts both |
| Stale guard | `studio-next/tests/d2-proof.test.tsx` | Decision refused, before/now shown, typed note kept |
| History | `studio-next/src/pages/proof/Inspector.tsx` | Each decision listed with word and time, append only |
| Sort and sources | `studio-next/tests/f-proof.test.tsx` | Sort changes order; the line names the sources |
| Check card | `studio-next/src/selectors/checkcard.ts` | States none, checking, current, stale; stale after text, recording or save moves |
| Takes at a spot | `studio-next/src/selectors/proofTakes.ts` | Badge count and lanes for the note's passage; play raw only |
| Gaps | `studio-next/src/selectors/gaps.ts`, `studio-next/tests/c2-pickups.test.tsx` | Unread start/end is unfinished, never a pickup |
| Pickup marker truth | `studio-next/src/state/commands/pickups.ts` | Done state written to the DAW marker; reconcile on open |

### Supersedes / depends on ADRs

On conflict this PRD, and the ADR written when its phase lands, is the source of truth; old ADRs stay in force for unmigrated code ([register](studio-next-adr-register.prd.md)).

| ADR | Class | Note |
| --- | --- | --- |
| [ADR 0120](../adr/0120-findings-are-read-and-decided-through-four-generic-bindings-and-a-decision-carries-the-evidence-version-it-was-made-against.md) | EXTEND | History and guard UI |
| [ADR 0470](../adr/0470-proof-follows-mock-04-pickup-edit-waived-are-words-over-the-stored-status-and-the-chapter-view-leads-with-its-notes.md), [ADR 0525](../adr/0525-proofing-is-met-by-a-current-zero-open-pickup-source-and-every-required-delivery-check-confirmed-through-the-shared-stage-engine.md) | EXTEND; 0525 SUPERSEDE to the extent of DQ-16 | Cleared versus decided (A18 working title: Proof counters) |
| [ADR 0650](../adr/0650-proofs-notes-card-composes-table-flush-statusbadge-and-panels-header-and-the-filters-move-behind-a-popover.md) to [ADR 0652](../adr/0652-a-book-level-waveform-and-a-denser-notes-list-measurably-lower-mock-04s-score-so-adr-0651-stands.md), [ADR 0715](../adr/0715-proofs-book-level-waveform-card-belongs-to-the-chapter-its-selector-names.md) | SUPERSEDE (DQ-1) | The Studio Next Proof page decides the notes card and waveform scope |
| [ADR 0126](../adr/0126-recording-coverage-reads-the-take-markers-sequencematcher-alignment-and-folds-chance-matches-into-gaps.md) to [ADR 0132](../adr/0132-the-recording-check-ships-0-8-3-8-3-chosen-on-synthetic-fixtures-and-labelled-uncalibrated.md), [ADR 0264](../adr/0264-the-recording-check-summary-moves-into-a-slide-over-opened-from-the-rows-own-status-and-the-check-button-retires.md) | EXTEND | Gap taxonomy and nullable confidence |
| [ADR 0700](../adr/0700-the-takes-panel-lists-a-passages-takes-from-the-saved-project-and-chooses-one-by-an-id-the-host-offered.md) | EXTEND | Takes at a spot on Proof |
| [ADR 0165](../adr/0165-a-take-comparison-is-one-finding-per-group-over-its-one-span-built-from-the-saved-project-and-never-ranked.md) | SUPERSEDE (DQ-15) | Take suggestion (Editing) |
| [ADR 0123](../adr/0123-the-approved-marker-is-one-take-marker-for-an-accepted-finding-named-like-transcript-compares-in-one-undo-point.md) | EXTEND | Marker kind prefix |
| [ADR 0246](../adr/0246-punch-and-roll-moves-only-the-edit-cursor-and-anchors-words-by-a-polled-play-position.md) | SUPERSEDE (roll) | DAW PRD |
| [ADR 0660](../adr/0660-audacitys-finding-detail-hides-reapers-take-management-instead-of-disabling-it-through-capabilitygate.md) | SUPERSEDE (DQ-18) | Capability-driven take UI |
| [ADR 0107](../adr/0107-moonshine-ships-inside-the-windows-teleprompter-sidecar-and-runs-only-from-a-verified-catalog-install.md), [ADR 0414](../adr/0414-the-teleprompter-default-engine-stays-whisper-tiny-until-a-real-time-ab-evaluation-runs.md) | KEEP (DQ-9) | Engines |
| [ADR 0725](../adr/0725-the-rail-draws-a-count-badge-only-from-a-count-the-host-reports-and-the-product-is-named-studio.md) | EXTEND | Proof badge reads the same cleared selector |

## Technical Approach

**Interfaces.** `ProofPort` (notes, decisions with `evidenceKey`, history), `RecordingCheckPort` (`run`, `cancel`, `state`), `SpeechPort` (engines, `check`, `recheck`), all over existing bindings with additive fields; `DawClient.addMarker(kind)`.

**Contracts.** Additive fields: findings summary `cleared`; decision `evidenceKey`/`seen`; coverage report `gaps[]` with `kind`, `unfinished`, `confidence` (nullable) and `confReason`; goldens regenerated (`UPDATE_CONTRACTS=1`); `wireContracts.test.ts` rows; mocks pass.

**Architecture.** `internal/findings` unchanged as the store; `internal/coverage` and the sidecar gain the taxonomy; the Proof page composes `Table`, `Inspector` (SlideOver or side column per width), `Popover`; the check card uses the existing summary components.

**Test plan.** Ported tests; sidecar tests with synthetic fixtures (D70/D71); Go golden tests; visual rows for Proof (notes, inspector with stale refusal, check card states, takes lanes) and Pickups at all viewports; aria; axe.

**Rollout.** Counters and taxonomy are additive and invisible first; seams and components land with no route. One PR (SNQ-9) swaps the Proof and Pickups routes and deletes the old pages (`ProofPage`, `ProofChapterPage` notes parts, `NotesHeader`, `NotesStrip`, `FindingDetail`, `FindingsList`, `ChapterWaveformCard`, `PickupsPage` with its Punch from here), their stories, rows and guides; the workspace parts of `components/proof/` go in the Editing swap (SNE-9), and the SNQ-1 audit lists each file's remaining consumers. No flag.

**ADRs.** Proof counters and cleared definition; gap taxonomy.

**Trust boundaries.** None new; markers written to the DAW are in the DAW PRD.

**Risks.** Migrating stored `res` semantics (mitigation: derive cleared from existing statuses, no migration); two percentages (mitigation: one selector and a test).

## Implementation Phases

| # | Phase | Description | Status | Parallel | Depends | Est. (pw) | PRP Plan |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | ADRs and audit | ADRs; audit of what exists and of each old file's consumers | in review (ADR 0793; audit: docs/sn-q1-proof-audit) | - | SN0-1 | 0.4 | - |
| 2 | Counters | `cleared` in the summary; selector; rail and Production read it | pending | 3 | 1 | 0.8 | - |
| 3 | Guard and history UI | Inspector before/now, typed note kept, history list | in review (feat/sn-q3-evidence-banner) | 2 | 1 | 0.9 | - |
| 4 | Notes polish | Sort, sources line, takes badge | pending | 5 | 2 | 0.6 | - |
| 5 | Gap taxonomy | Sidecar and host fields; nullable confidence | pending | 4 | 1 | 1.2 | - |
| 6 | Check card and engines | Card states, accept/ignore, host engine list | in review (feat/sn-q65-check-dialog: the Check recordings dialog) | - | 5, SNS-4 | 1.0 | - |
| 7 | Takes at a spot | Lanes in the Inspector | pending | - | 2 | 0.6 | - |
| 8 | Pickups | Source list, done write-through, to chapter, auto-mark recorded, points to Booth | pending | - | SND-4, 5 | 1.0 | - |
| 9 | Swap and close-out | Route swap, delete the old Proof and Pickups pages (Punch included), rows, guides, carried-over owner checks | pending | - | 2 to 8, SNO-8 | 0.5 | - |

### Phase Details

- **Phase 5.** Fixtures are synthetic or public-domain (D70/D71); thresholds stay provisional.
- **Phase 8.** Pickups only points to the Booth. The old Punch from here is deleted with the old page in the swap (phase 9), which follows the Booth pickup session (SNO-8).
- **Phase 9.** The carried-over REAPER checks (go to, loop, approved marker) are owner steps on #992.

### Parallelism Notes

2 and 3 are independent; 4 and 5 are independent after 2; 6 to 8 follow.

### Parallel-session compatibility

| Phase | Files touched | Collides with |
| --- | --- | --- |
| 2 | `apps/desktop/internal/findings`, `bindings_findings.go`, schemas, goldens | Findings consumers, `hostAPIVersion` |
| 3, 4, 7 | `components/proof/*` | Editing slices that move the workspace out (serialise) |
| 5 | `sidecars/transcript-compare/core/coverage_mode.py`, `internal/coverage` | Recording-check streams |
| 8 | `components/pickups/*` | Booth pickup session |

### Slices

| Slice | Scope | Depends on | Parallel-safe | Verification |
| --- | --- | --- | --- | --- |
| SNQ-1 | Phase 1 | SN0-1 | yes | ADRs; audit with consumers of each old file |
| SNQ-2 | Phase 2 | SNQ-1 | yes | Contract test; golden |
| SNQ-3 | Phase 3 | SNQ-1 | yes | Ported tests; visual |
| SNQ-4 | Phase 4 | SNQ-2 | yes | Ported tests |
| SNQ-5 | Phase 5 | SNQ-1 | yes | Sidecar tests; golden |
| SNQ-6 | Phase 6 | SNQ-5, SNS-4 | yes | Parity suite; visual |
| SNQ-7 | Phase 7 | SNQ-2 | yes | Ported tests |
| SNQ-8 | Phase 8 | SND-4, SNQ-5 | yes | Harness-backed host tests |
| SNQ-9 | Phase 9 (swap; deletes the old pages and Punch) | SNQ-2..8, SNO-8 | no | Visual suite; Screenshots against the Studio Next mock |

## Decisions Log

| Decision | Choice | Alternatives | Rationale |
| --- | --- | --- | --- |
| Store stays | Findings store is the audit log | New decision store | Already append-only and versioned |
| The mock's Proof percent (owner, DQ-16) | `noteProgress`, never 100 while a pickup is open, plus decided and cleared | A different percent or cap | The mock is the spec |
| Waived maps to dismissed | Reason code | New status | No migration |

## Research Summary

Read: the mock's proof, pickups and check files and tests; the rulings; the real proof and pickups file lists, `findings/store.go` header, ADRs 0120, 0525, 0700. Not done: no audit of the Inspector for before/now; the old review-dashboard PRD phases 6 to 8 were taken from its status table.

## Visual Spec

Mock pages, the only spec: Proof (`studio-next/src/pages/Proof.tsx`), Pickups (`studio-next/src/pages/Pickups.tsx`); states: notes, inspector with refusal, check card (four states), takes lanes.
