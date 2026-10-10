# Studio Next Production and Schedule: Contract, Milestones, Sourced Numbers, Readiness and the Status Report

**Source:** owner request of 2026-10-10 ([Studio Next Rebuild](studio-next-rebuild.prd.md)); the Production and Schedule rulings and the sketch review in `studio-next/research/repo-compare-decisions.md`; the mock's `studio-next/src/pages/Production.tsx`, `studio-next/src/pages/Schedule.tsx` and `studio-next/src/pages/production/`.

**Builds on:** Production Tracking and Stage Recommendations (both delivered; their steady state is `apps/desktop/internal/production/`, `apps/desktop/internal/stages/` and [ADR 0323](../adr/0323-production-deadlines-and-milestones-are-calendar-dates-on-the-project-manifest.md), [ADR 0404](../adr/0404-production-next-up-ranks-chapters-by-held-back-readiness-then-stage-and-the-deadline-is-shown-not-projected.md), [ADR 0406](../adr/0406-the-status-report-leaves-out-the-contracted-amount-and-effective-rate-unless-the-narrator-opts-in.md), [ADR 0160](../adr/0160-stage-recommendations-are-computed-from-tri-state-signals-by-a-pure-engine.md), [ADR 0161](../adr/0161-stage-decisions-live-in-their-own-sidecar-and-confirm-writes-the-record-before-the-status.md)), the delivery profiles ([ADR 0179](../adr/0179-a-built-in-dated-acx-delivery-profile-ships-and-a-project-is-judged-against-its-selected-profile.md), [ADR 0180](../adr/0180-custom-delivery-profiles-are-copies-of-a-built-in-kept-in-a-user-level-file.md), [ADR 0440](../adr/0440-master-and-qcs-platform-tabs-are-the-projects-delivery-profile-and-the-page-draws-only-what-the-host-measures.md)), the chapter-track sync host work. It inherits the unfinished UI halves of the old chapter-track auto-sync PRD (see the carried-over table in the overview).

**Status (2026-10-10):** draft.

## Problem Statement

The real Production page already shows the plan, the board, Next up, deadline tone, stage recommendations and a status report. The mock goes further on what the owner ruled: a contract with a payment type (including "no per-finished-hour rate"), milestones that can be measured, estimated and marked done with a 15-minute checkpoint only as a template, a This week card whose numbers are sourced or say "not measured yet", an info popover that compares the standard 9,300 words per finished hour with the narrator's own pace, a readiness chip with Confirm, Dismiss and Revert, and a status report. The real page lacks the payment type, the milestone fields and the sourced-or-reason pattern, and its numbers come from sources the owner has not yet reviewed against the mock.

## Evidence

- **Mock.** `studio-next/src/selectors/progress.ts` (`deadlineTone`, `isFinished`, `contractValue`, `planStart`), `studio-next/src/selectors/nextup.ts`, `studio-next/src/selectors/milestones.ts` (`measureText`, `measureOptions`), `studio-next/src/selectors/measured.ts` and `studio-next/src/providers/measurements.ts` (`Measured<T>`), `studio-next/src/selectors/pace.ts`, `studio-next/src/pages/production/{NextUp,PipelineTable,ProgressChart,StageReadiness,TargetInfo,ReportDialog}.tsx`, `studio-next/src/config/estimates.ts`, `studio-next/src/fixtures/schedule.ts`, `studio-next/src/fixtures/platforms.ts`. Tests: `studio-next/tests/production.test.tsx`, `studio-next/tests/schedule.test.tsx`, `studio-next/tests/batch-b.test.tsx`, `studio-next/tests/f-production.test.tsx`, `studio-next/tests/delivery-profile.test.tsx`.
- **Repo.** `ProductionPlan {deadline, contractedAmount, milestones[{name, dueDate, note}]}` (`apps/ui/src/api/contracts/production.ts`); `apps/desktop/internal/production/{plan,overview,burndown,pfh}.go`; `apps/ui/src/components/production/{PlanPanel,ChapterBoard,StatusReportPanel}.tsx`; `apps/ui/src/components/stages/*`; `apps/ui/src/components/layout/TimerChip.tsx`.

| Mock behaviour | Real today |
| --- | --- |
| Payment type, "no PFH rate" case | Only `contractedAmount`; effective rate from logged hours ([ADR 0320](../adr/0320-pfh-and-the-effective-rate-come-only-from-logged-hours-and-measured-recorded-time.md)) |
| Milestone note | Present |
| Milestone measure, estimate, done flag, templates | Absent |
| Deadline tone from days left; Next up group order | Present ([ADR 0404](../adr/0404-production-next-up-ranks-chapters-by-held-back-readiness-then-stage-and-the-deadline-is-shown-not-projected.md)); mock adds risk hours first |
| This week from sourced numbers or "not measured yet" | Not present as a pattern |
| Target pace info popover | Not present |
| Readiness chip plus slide-over, append-only decisions | Stage panel and suggestion exist (`components/stages`) |
| Status report export | Exists, writes files, opt-in amount ([ADR 0406](../adr/0406-the-status-report-leaves-out-the-contracted-amount-and-effective-rate-unless-the-narrator-opts-in.md)) |

## Proposed Solution

Converge the real page onto the mock without a second implementation of anything the host already does.

1. **Plan fields** on the project manifest: `payment: 'per_finished_hour' | 'royalty_share' | 'none'`; milestone `measure`, `estimate`, `done`, and a template id; additive schema and golden. A per-finished-hour rate shows an effective figure only when the payment type is per finished hour and hours exist.
2. **Milestones table and modal** replacing the panel's inline editing: a read-only table (measure written with its value) and an edit dialog (undoable). The 15-minute checkpoint is a template only; a platform's capabilities decide which templates and measures are offered (`platformHas`).
3. **Sourced numbers.** A `MeasurementsPort` returning `Measured<T>` (room tone per microphone, the take log, booth time for pickups, own pace from measured chapter lengths); selectors turn them into the chart's recorded line, This week and the room-tone label; a missing source shows "Not measured yet".
4. **Target pace popover** on the Recording KPI (no layout space): standard 9,300 w/h against the narrator's own pace and its breakdown.
5. **Readiness**: keep the stage engine; the chip and slide-over show the evidence and Confirm, Dismiss, Revert as append-only decisions with the evidence-key refusal Proof also uses.
6. **Status report**: keep the host writer; the dialog shows the pure report preview the mock builds; the contracted amount stays opt-in.
7. **Carried over**: the UI halves of chapter-track sync (consent dialog, Tracks states, status without a click, pickups interplay).

## Key Hypothesis

If every number on the page is a selector over a `Measured<T>` or a host field, the owner's "source it or drop it" rulings hold without per-number review. We are wrong if a number on the page cannot be traced to a port in the slice's Contracts line.

## What We're NOT Building

- Time tracking (stage timer, hours log, PFH, effective rate, hours by stage): existing code is untouched (DQ-3).
- A projection from the fixed inputs unless the owner answers DQ-4.
- Pace inputs fed by a time log; the owner asked to see a mock first.
- A Schedule page unless DQ-14 says so.
- Invented This week figures ("6:00 / 8:00", "3:05 recorded") from the mock's old versions.
- Multiple series or books.

## Success Metrics

| Metric | Target | Measured by |
| --- | --- | --- |
| Numbers with a traceable source | 100% on Production | Selector tests plus a scan for numeric literals |
| "No PFH rate" case | Never shows an effective rate without a per-finished-hour contract | Test ported from `studio-next/tests/batch-b.test.tsx` |
| Milestone fields | measure, estimate, done persisted across restart | Go and golden tests |
| Screenshots | Production at all viewports vs the mock | PR evidence |

## Open Questions

- [ ] **SNP-Q1 (DQ-3).** Existing timer and PFH: leave as built. Recommendation: leave.
- [ ] **SNP-Q2 (DQ-4).** Projection from fixed inputs or measured pace only? Recommendation: measured only.
- [ ] **SNP-Q3 (DQ-14).** Schedule as a page or a panel? Recommendation: panel first.
- [ ] **SNP-Q4.** Royalty share: any figure? Recommendation: none; the type is a label and removes the rate figure.
- [ ] **SNP-Q5.** Milestone measures offered: chapters done, minutes recorded, checkpoint only with ACX. Recommendation: as `studio-next/src/fixtures/schedule.ts` and `platforms.ts`.
- [ ] **SNP-Q6.** Own pace needs how many measured chapters before it is shown? Recommendation: three, else "not enough measured".

## Users & Context

A narrator planning a book against a deadline and a contract; the owner reviewing the Production screenshots at 1440, 1024 and 768.

## Solution Detail

### Acceptance criteria tied to the mock

| Behaviour | Mock reference | Acceptance |
| --- | --- | --- |
| Deadline tone from days left | `studio-next/src/selectors/progress.ts` | Neutral over a week, warning at a week or less while unfinished, danger past, success when finished |
| Next up ranking | `studio-next/src/selectors/nextup.ts` | Risk hours, then the group order of [ADR 0404](../adr/0404-production-next-up-ranks-chapters-by-held-back-readiness-then-stage-and-the-deadline-is-shown-not-projected.md), then least advanced stage |
| Payment type and no rate | `studio-next/src/fixtures/schedule.ts`, `studio-next/tests/batch-b.test.tsx` | Choosing royalty share hides per-hour figures |
| Milestones | `studio-next/src/pages/Schedule.tsx`, `studio-next/tests/schedule.test.tsx` | Table is read only; the dialog saves and removes as one undo step each |
| Checkpoint template | `studio-next/src/selectors/milestones.ts` | Offered only when the profile has the capability; when chosen it is measured |
| Not measured yet | `studio-next/src/selectors/measured.ts`, `studio-next/tests/f-production.test.tsx` | A missing source never renders a number |
| Target info | `studio-next/src/pages/production/TargetInfo.tsx` | Info icon with popover on the Recording KPI shows standard versus own pace |
| Readiness | `studio-next/src/pages/production/StageReadiness.tsx`, `studio-next/src/selectors/readiness.ts` | Confirm, Dismiss, Revert append decisions; changed evidence refuses the old decision |
| Status report | `studio-next/src/selectors/report.ts`, `studio-next/src/pages/production/ReportDialog.tsx` | Preview equals the written file; amount omitted unless opted in |

### Supersedes / depends on ADRs

On conflict this PRD, and the ADR written when its phase lands, is the source of truth for the rebuild; an old ADR stays in force for unmigrated code until the superseding ADR merges ([register](studio-next-adr-register.prd.md)).

| ADR | Class | Note |
| --- | --- | --- |
| [ADR 0323](../adr/0323-production-deadlines-and-milestones-are-calendar-dates-on-the-project-manifest.md) | EXTEND | New plan fields (A12) |
| [ADR 0404](../adr/0404-production-next-up-ranks-chapters-by-held-back-readiness-then-stage-and-the-deadline-is-shown-not-projected.md) | EXTEND, DISCUSS (DQ-4) | Risk hours first; projection waits for the owner |
| [ADR 0320](../adr/0320-pfh-and-the-effective-rate-come-only-from-logged-hours-and-measured-recorded-time.md) | DISCUSS (DQ-3) | Not touched |
| [ADR 0406](../adr/0406-the-status-report-leaves-out-the-contracted-amount-and-effective-rate-unless-the-narrator-opts-in.md) | EXTEND | Amount stays opt-in |
| [ADR 0160](../adr/0160-stage-recommendations-are-computed-from-tri-state-signals-by-a-pure-engine.md), [ADR 0161](../adr/0161-stage-decisions-live-in-their-own-sidecar-and-confirm-writes-the-record-before-the-status.md) | EXTEND | Same engine; mock's decision log shape |
| [ADR 0179](../adr/0179-a-built-in-dated-acx-delivery-profile-ships-and-a-project-is-judged-against-its-selected-profile.md), [ADR 0180](../adr/0180-custom-delivery-profiles-are-copies-of-a-built-in-kept-in-a-user-level-file.md), [ADR 0440](../adr/0440-master-and-qcs-platform-tabs-are-the-projects-delivery-profile-and-the-page-draws-only-what-the-host-measures.md) | EXTEND | Capability lookup |
| [ADR 0407](../adr/0407-a-new-page-replaces-its-old-counterpart-in-the-same-change-and-the-navigation-is-grouped-by-production-stage.md) | DISCUSS (DQ-2, DQ-14) | Panels or page |
| [ADR 0015](../adr/0015-real-progress-only.md) | KEEP | Real progress only |
| [ADR 0585](../adr/0585-mock-fidelity-is-a-pixel-match-at-the-mocks-own-size-and-theme-scored-by-a-tool-that-reports-and-does-not-gate.md), [ADR 0645](../adr/0645-the-production-board-draws-mock-01s-cells-columns-and-layout-and-the-mock-wins-the-open-audit-layout-questions.md) | DISCUSS (DQ-1) | Benchmark mock 01 versus Studio Next |

## Technical Approach

**Interfaces.** `ProductionApi` (existing) gains plan fields; `MeasurementsPort` (new) with `roomTone(mic)`, `takeLog(chapter)`, `boothMinutes(chapter)`, `chapterLengths()`; all return `Measured<T>`. `platformHas(profileId, capability)` is a pure selector over the delivery-profile binding (no new binding).

**Contracts.** Extend `productionPlanSchema` (additive: `payment`, milestone `measure`, `estimate`, `done`, `template`); new `measurementsSchema`; goldens in `tests/fixtures/contracts/`; `wireContracts.test.ts` rows; mocks pass; `hostAPIVersion` bump if a binding is added. Go: `internal/production/plan.go` and the manifest; no new network.

**Architecture.** Selectors in `components/production/*.selectors.ts` over read models; dialogs through the overlay service; the table uses `Table`; the popover uses `Popover` ([ADR 0049](../adr/0049-hints-are-base-ui-tooltips-that-meet-wcag-1-4-13-and-info-icons-are-buttons.md)); no new primitive.

**Test plan.** Port the mock's tests; Go tests for the plan round trip and old-manifest migration (missing fields read as defaults); visual rows for Production at all viewports (plan panel, milestones modal, readiness slide-over, popover open); aria for the slide-over and modal; axe.

**Rollout.** Atomic swap of the Production page layout in the last slice ([ADR 0407](../adr/0407-a-new-page-replaces-its-old-counterpart-in-the-same-change-and-the-navigation-is-grouped-by-production-stage.md)); earlier slices are additive and invisible or add one control.

**ADRs.** A12 plan fields; (A13 only if DQ-14 is B).

**Risks.** Existing manifests (mitigation: defaults and a migration test); the Production page is the most-viewed page (mitigation: owner screenshot review before the swap).

## Implementation Phases

| # | Phase | Description | Status | Parallel | Depends | Est. (pw) | PRP Plan |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Decisions and ADR | DQ-3, DQ-4, DQ-14; A12 Proposed | pending | - | SN0-1 | 0.3 | - |
| 2 | Plan fields (host) | Payment, milestone fields, schema, golden, mock | pending | 4 | 1 | 0.9 | - |
| 3 | Milestones UI | Table, dialog, templates, capability lookup | pending | 4 | 2, SNF-3 | 1.0 | - |
| 4 | Sourced numbers | `MeasurementsPort`, `Measured`, This week, chart line, room tone | pending | 2, 3 | SNS-4 | 1.2 | - |
| 5 | Target pace popover | Info affordance and popover | pending | 6 | 4 | 0.4 | - |
| 6 | Readiness and report | Chip, slide-over, report dialog parity | pending | 5 | SNS-2 | 0.9 | - |
| 7 | Chapter-sync UI carry-over | Consent dialog, Tracks states, status without a click, pickups interplay | pending | 6 | 1 | 1.0 | - |
| 8 | Page swap | Production layout to the mock, rows, docs, screenshots | pending | - | 3 to 7 | 0.5 | - |

### Phase Details

- **Phase 4.** Own pace comes from measured recorded lengths (`production.Recorded`, [ADR 0193](../adr/0193-homes-actual-recorded-is-the-linked-tracks-recorded-length-from-the-saved-project-and-never-an-estimate.md)), not from the timer.
- **Phase 7.** The old PRD's remaining phases are listed in the overview's carried-over table; this phase finishes only the UI halves.
- **Phase 8.** The screenshots compare the mock (`studio-next/e2e/prod-shots.mjs` pattern), before and after.

### Parallelism Notes

2 and 4 are independent (host fields versus a port); 3 follows 2; 5, 6, 7 can run together once 4 lands.

### Parallel-session compatibility

| Phase | Files touched | Collides with |
| --- | --- | --- |
| 2 | `apps/desktop/internal/production/*`, manifest, `api/{contracts,schemas}/production.ts`, goldens, `hostAPIVersion` | Every binding PRD (serial bump) |
| 3 | `components/production/PlanPanel*` | Chapter-track UI slices (same folder) |
| 4 | `api/ports` measurements, selectors | none |
| 6 | `components/stages/*`, `StatusReportPanel.tsx` | Proof readiness slices |
| 8 | `ProductionPage.tsx`, visual rows, guides | Any Production slice |

### Slices

| Slice | Scope | Depends on | Parallel-safe | Verification |
| --- | --- | --- | --- | --- |
| SNP-1 | Phase 1 | SN0-1 | yes | ADR index |
| SNP-2 | Phase 2 | SNP-1 | yes | Go and golden tests; wire row; mock passes |
| SNP-3 | Phase 3 | SNP-2, SNF-3 | yes | Component tests; visual rows; aria |
| SNP-4 | Phase 4 | SNS-4 | yes | Parity suite; scan for literals |
| SNP-5 | Phase 5 | SNP-4 | yes | Popover test; visual row |
| SNP-6 | Phase 6 | SNS-2 | yes | Ported tests; visual row |
| SNP-7 | Phase 7 | SNP-1 | yes | Existing sync tests; visual rows |
| SNP-8 | Phase 8 | SNP-3..7 | no (page swap) | Full visual suite for the page; Screenshots |

## Decisions Log

| Decision | Choice | Alternatives | Rationale |
| --- | --- | --- | --- |
| Value or reason (owner) | `Measured<T>` | Estimates | "Drop invented numbers; source them" |
| Reuse engines (proposed) | Stage engine and report writer stay | Port the mock's selectors as engines | They already exist and are tested |
| Panels first (proposed) | Schedule stays in Production | New page | [ADR 0407](../adr/0407-a-new-page-replaces-its-old-counterpart-in-the-same-change-and-the-navigation-is-grouped-by-production-stage.md) decision 5 |

## Research Summary

Read: the mock's Production and Schedule files and tests, the owner's rulings, `contracts/production.ts`, `plan.go` headers, ADRs 0320, 0323, 0404, 0406. Not done: the old chapter-track sync PRD's per-phase detail was summarised from its status table only.

## Visual Spec

Mock pages: Production (`studio-next/src/pages/Production.tsx`) and Schedule (`studio-next/src/pages/Schedule.tsx`), light and dark, subject to DQ-1. States: default, milestone modal, readiness slide-over, target popover, report dialog.
