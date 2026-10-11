# Studio Next Cutover: Parity Audit, Ratchets, Deleting the Mock and the Steady-State Docs

**Source:** owner request of 2026-10-10 ([Studio Next Rebuild](studio-next-rebuild.prd.md)); the mock's lifecycle ("this folder is deleted when the real app matches it", `studio-next/README.md`) and the "Which mocks are the spec" section of [`.claude/rules/ui-spec-and-screenshots.md`](../../.claude/rules/ui-spec-and-screenshots.md).

**Builds on:** [Which mocks are the spec](../operations/agent-train.md#which-mocks-are-the-spec), [ADR 0028](../adr/0028-planned-work-is-specified-as-prds-and-deleted-when-built.md) (planned work is deleted when built), [ADR 0407](../adr/0407-a-new-page-replaces-its-old-counterpart-in-the-same-change-and-the-navigation-is-grouped-by-production-stage.md) (replacement rule), the lifecycle in [the PRD README](README.md#lifecycle-of-a-prd).

**Status (2026-10-11):** draft; every owner question is decided (see Decisions). Runs last; its first two slices (the ruling index and the owner QA list) start early so the index fills as pages land.

## Problem Statement

"Matches the mock" has no definition. Without one, the mock folder either stays forever as a second spec that drifts from the app, or is deleted with rulings that never became tests. The owner's rulings (about 120 bullets across `studio-next/research/repo-compare-decisions.md`) are the contract; the mock's 45-odd tests are the evidence of how each behaved. The cutover turns both into a checked index, finishes the ratchets that only fall, deletes the mock and the PRDs, and writes the steady-state docs.

## Evidence

- The mock's rulings file is the seed; its tests (`studio-next/tests/`) are named by batch and page, not by ruling.
- The repo already checks contract coverage by test (`apps/ui/src/api/wireContracts.test.ts` fails on an unmapped binding) and has ratchets (`apps/ui/src/rawNatives.test.ts`, Knip at zero, atlas coverage); there is no ruling index.
- The mock folder is named by the PRD README, `knip.jsonc` (an `ignore` entry) and `tools/docs-site/mkdocs.yml` (an `exclude_docs` entry), and the rule file above is path-scoped to `docs/research/mockups/**`.
- The benchmark mocks are `docs/research/mockups/audiobook-studio-benchmark/01-*.webp` to `07-*.webp`, scored by `apps/ui/tests/visual/mock-match/` (`pnpm --dir apps/ui mock-match`, `mocks.ts`); `06-series-voice-bible.webp` and `07-daw-companion.webp` map to pages the Studio Next mock lacks.
- PRDs are deleted by the PR that completes their last phase ([ADR 0028](../adr/0028-planned-work-is-specified-as-prds-and-deleted-when-built.md)); the series has 15 PRDs and a cross-reference web that must not dangle.

## Proposed Solution

1. **Ruling index.** A table (`docs/research/studio-next-ruling-index.md` while the work runs, deleted at the end) with one row per ruling bullet: id, text, status (agreed, agreed with conditions, deferred, rejected, maybe), the owning slice, the test name in the real app. A test (`scripts/ci/studio-next-rulings.test.mjs`) fails while an "agreed" row has no test name.
2. **Parity audit per page.** For each page the mock's tests (`studio-next/tests/*`) are mapped to real tests; an unported test needs a reason (not applicable: mock-only, or covered by X).
3. **Owner QA list on #510.** The steps only the owner can do: Shift+F10 in the WebView, REAPER undo behaviour of each new command, a real record with the pedal, Audacity backups, extraction on a real manuscript, the carried-over verification passes.
4. **Final ratchets.** `rawNatives` ceilings for series pages at zero; direct `FontAwesomeIcon` imports outside `Icon` at zero for migrated pages; every port has a contract suite; no `registerKeys`-style handlers; no bridge imports outside adapters.
5. **Delete the mock and the old specs.** Remove `docs/research/mockups/studio-next/`, the `knip.jsonc` and `mkdocs.yml` entries, the PRD README lines, the "Which mocks are the spec" section of the rule file and the train's mock-spec section (D96, replaced by the Studio Next ruling of SN0-Q1 while the series runs and by nothing once the mock is gone), and the screenshots helper. Also remove the benchmark mocks and the mock-match tooling (`apps/ui/tests/visual/mock-match/`, the `mock-match` script, ADR 0585 and 0740's scoring), except the mock files, `mocks.ts` entries and report code that the Series voice bible and Companion pages still need: those two pages have no Studio Next equivalent and stay as built (SN0-Q5, DQ-13), so their reference mock stays.
6. **Confirm the old equivalents are gone.** Each swap already deleted the old page and every old equivalent of what the mock's page covers ([Deletions the rulings imply](#deletions-the-rulings-imply)); the parity audit checks that none remains.
7. **Steady-state docs.** New or updated: `docs/architecture/` (shell and registries; UI state and the command journal; DAW capabilities and results; extraction tiers), `docs/design/design-system.md` (new primitives, icon vocabulary, layout rules), `docs/guides/using-the-app/*` (each page), `docs/architecture/threat-model.md` and `SECURITY.md` rows, diagrams naming moved files, and the ADRs that landed.
8. **Delete the series PRDs** in the PR that completes the last phase of each, then this one; update the PRD index.

## Key Hypothesis

If every agreed ruling has a named test and the owner has done the QA list, deleting the mock loses nothing. We are wrong if a ruling is found after deletion that is not in the index; the index is built from the file, not from memory.

## What We're NOT Building

- New features; a re-litigation of any ruling; an ADR rewrite.
- Touching the Series voice bible, the Series tab, the Companion or the stage timer, PFH and effective rate: no equivalent in the mock, so they stay exactly as built (SN0-Q4, SN0-Q5, DQ-13).
- A mock for work that is not being built now.

## Success Metrics

| Metric | Target | Measured by |
| --- | --- | --- |
| Agreed rulings with a test | 100% | The ruling-index test |
| Mock tests mapped or excused | 100% | The parity table |
| Dangling references to the mock or to deleted PRDs | 0 | Docs link check (lychee), `scripts/ci/prd-references.mjs` |
| Owner QA items done or waived | 100% | #510 |

## Decisions

The owner's rulings of 2026-10-11 (SN0-Q1, DQ-1 to DQ-18; see [Studio Next Rebuild](studio-next-rebuild.prd.md#decisions)) settle every question this PRD had. No question is open.

| Id | Ruling | Consequence for the cutover |
| --- | --- | --- |
| SNC-Q1 | The mock is deleted at cutover, as its README says; it stays available only through git history (`git log --diff-filter=D` recipe in the docs). | Phase 6 deletes the folder. |
| SNC-Q2 | SN0-Q1 answers it: Studio Next is the only spec for the pages it covers. | D96 and the rule file's benchmark-only text are replaced while the series runs and removed at cutover. |
| SNC-Q3 | Deferred rows (time tracking, Companion, proofer CSV, Audacity 4, redo) get no successor PRD; they stay in the ruling index as deferred. | Nothing is added; the owner may open a PRD later. |
| SNC-Q4 | Every ruling DQ-1 to DQ-18 is recorded as an ADR before the old ADR's Status reads "Superseded by". | Required for cutover; the audit lists the register's working titles and their merged ADR numbers. |

SNC-Q1, Q3 and Q4 took their recommendations by the owner's standing instruction to take reasonable defaults, dated 2026-10-11.

## Users & Context

The owner, the coordinator and the last workers; the docs reader after the series.

## Solution Detail

### Acceptance criteria

| Behaviour | Acceptance |
| --- | --- |
| Ruling index | Every "agreed" and "agreed with conditions" bullet has a test name that exists |
| Deferred and rejected rows | Listed with their status and the ADR or PRD that records the decision |
| Mock deletion | The folder and references gone; the benchmark mocks and mock-match tooling gone except what the Series voice bible and Companion pages need; `pnpm check` and the docs check green |
| Old equivalents | No old page, route, state-catalogue row, driver, aria snapshot or guide for anything the Studio Next mock covers remains |
| Steady-state docs | Each page guide updated; the architecture docs exist; screenshots regenerated once by the final sweep (D44) |
| PRD deletion | Each series PRD removed in its last phase's PR; the index and "Replaced briefs" updated; the old PRDs' carried-over phases show where they went |

### Deletions the rulings imply

A swap slice deletes the old page and every old equivalent of what the mock's page covers; nothing waits for cutover except the mock, the benchmark and their tooling. Each row is carried out by the named slice, and the parity audit (SNC-3) confirms it.

| What is removed | Removed in | Ruling |
| --- | --- | --- |
| The old page for each Studio Next page, its route, state-catalogue rows, drivers, aria snapshots, guide and doc screenshots | That page's swap slice (SNB-8, SNP-8, SNQ-9, SNO-10, SNM-5, SNE-9) | SN0-Q2 |
| Benchmark-measured tokens and primitive sizes that differ from the mock | The token batch (SNF-2) and each swap | DQ-1 |
| The Proof chapter page's workspace (word-level player, flags, takes panel, FX on a passage) | The Editing swap (SNE-9) | SN0-Q2, A15 |
| The split-and-delete apply path for cleanup trims (ADR 0262); trims go to the muted Cuts track | The Editing swap | DQ-8 |
| `pickupsPunch`, the Punch on the Pickups page | The Pickups swap (SNQ-9) | DQ-6 |
| The pronunciation query status, the author query CSV export and import, and the rail badge counting open queries | The Story Bible swap (SNB-8) | DQ-11 |
| The Schedule panel of Production and the Delivery panel of Master & QC | The Production swap (SNP-8) and the Master swap (SNM-5) | DQ-14 |
| Benchmark mocks and mock-match tooling, except what the Series voice bible and Companion pages need | Cutover (SNC-6) | SN0-Q1 |

Not removed, re-skinned or extended: the Series voice bible and Series tab, the Companion, and the stage timer, PFH and effective rate.

### Supersedes / depends on ADRs

On conflict this PRD, and the ADR written when its phase lands, is the source of truth; old ADRs stay in force for unmigrated code ([register](studio-next-adr-register.prd.md)). This PRD checks that every superseding ADR in the register is merged and the old ADRs' Status lines read "Superseded by"; every row of the register is KEEP, EXTEND, SUPERSEDE or DECIDED.

| ADR | Class | Note |
| --- | --- | --- |
| [ADR 0028](../adr/0028-planned-work-is-specified-as-prds-and-deleted-when-built.md) | KEEP | Delete when built |
| [ADR 0407](../adr/0407-a-new-page-replaces-its-old-counterpart-in-the-same-change-and-the-navigation-is-grouped-by-production-stage.md) | KEEP decision 1 (DQ-2), SUPERSEDE decision 5 (DQ-14) | No old route or panel left; Schedule and Delivery are pages |
| [ADR 0585](../adr/0585-mock-fidelity-is-a-pixel-match-at-the-mocks-own-size-and-theme-scored-by-a-tool-that-reports-and-does-not-gate.md), [ADR 0740](../adr/0740-mock-match-is-text-blind-and-a-diagnostic-and-only-the-benchmark-mocks-are-kept.md) | SUPERSEDE (DQ-1) | The scoring tool's source list shrinks to the Series voice bible and Companion mocks |
| [ADR 0045](../adr/0045-dead-code-is-gated-at-zero-with-reasoned-ignores.md), [ADR 0046](../adr/0046-architecture-rules-taken-from-adrs-are-lint-and-test-rules.md) | KEEP | Dead code and rules stay at zero |

## Technical Approach

**Interfaces.** None. **Contracts.** None. **Architecture.** Docs and deletions. The ruling-index test is a small Node test beside the other CI scripts (`scripts/ci/`), run by `pnpm check`.

**Test plan.** The ruling-index test, link check, markdownlint, Knip, `pnpm check`, the full visual suite, atlas, aria once (D44), and `mock-match` for the two kept mocks.

**Rollout.** One slice per deletion kind; the mock goes last, after the owner QA list is cleared or waived.

**ADRs.** The cutover PR checks them and writes none; the spec precedence is A1 ([register](studio-next-adr-register.prd.md), DQ-1).

**Trust boundaries.** Re-read the threat-model rows touched by the series; update review dates (CLAUDE.md step 6).

**Risks.** A ruling missed (mitigation: built from the file); the owner QA items stall the cutover (mitigation: waive explicitly, never silently); doc screenshot churn (mitigation: regenerate once).

## Implementation Phases

| # | Phase | Description | Status | Parallel | Depends | Est. (pw) | PRP Plan |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Ruling index | Table, test, owners per row | pending | 2 | SN0-1 | 0.5 | - |
| 2 | Owner QA list | #510 comment per step with commands | pending | 1 | SN0-1 | 0.2 | - |
| 3 | Parity audit | Per page, after its swap | pending | - | each page swap | 0.6 | - |
| 4 | Ratchets | Final ceilings and rules | pending | - | all page swaps | 0.3 | - |
| 5 | Steady-state docs | Architecture, design, guides, threat model | pending | 6 | 3 | 0.7 | - |
| 6 | Delete | Mock, benchmark mocks and mock-match tooling (except the two pages' needs), references, series PRDs, index | pending | - | 1 to 5, owner | 0.7 | - |

### Phase Details

- **Phase 1.** Built mechanically from the headings and bullets of `repo-compare-decisions.md`; "Maybe" and "Need to see a mock first" rows are kept with their status.
- **Phase 6.** The deletion PR is the one that also removes this file.

### Parallelism Notes

1 and 2 start at G0 and are updated as pages land; 3 repeats per page; 5 and 6 are last.

### Parallel-session compatibility

| Phase | Files touched | Collides with |
| --- | --- | --- |
| 1 | `docs/research/`, `scripts/ci/` | none |
| 4 | `rawNatives.test.ts`, ratchet tests | Page swaps (mechanical) |
| 5 | `docs/**` | Page swaps' guide edits |
| 6 | `docs/research/mockups/`, `apps/ui/tests/visual/mock-match/`, `.claude/rules/ui-spec-and-screenshots.md`, `knip.jsonc`, `mkdocs.yml`, train | Everything; runs alone (owner approval for the rule file and the train) |

### Slices

| Slice | Scope | Depends on | Parallel-safe | Verification |
| --- | --- | --- | --- | --- |
| SNC-1 | Phase 1 | SN0-1 | yes | The index test fails on a gap |
| SNC-2 | Phase 2 | SN0-1 | yes | #510 lists every owner step |
| SNC-3 | Phase 3, one slice per page | the page's swap | yes | Parity table complete for the page |
| SNC-4 | Phase 4 | all swaps | no | Ratchets at zero |
| SNC-5 | Phase 5 | SNC-3 | yes | Link check; markdownlint |
| SNC-6 | Phase 6 | SNC-1..5, owner | no | `pnpm check`; link check; no dangling references |

## Decisions Log

| Decision | Choice | Alternatives | Rationale |
| --- | --- | --- | --- |
| Rulings are the contract (proposed) | Index built from the file | Port every mock test | Tests are evidence, rulings are the contract |
| Waive explicitly (proposed) | Owner QA items waived by comment | Silent skip | Honesty |

## Research Summary

Read: the mock README and rulings file, `.claude/rules/ui-spec-and-screenshots.md`, the PRD README lifecycle, `prd-references.mjs`. Not done: the ruling count is an estimate from the file's length, not a counted index.

## Visual Spec

None; the final sweep regenerates doc screenshots once.
