# Studio Next Cutover: Parity Audit, Ratchets, Deleting the Mock and the Steady-State Docs

**Source:** owner request of 2026-10-10 ([Studio Next Rebuild](studio-next-rebuild.prd.md)); the mock's lifecycle ("this folder is deleted when the real app matches it", `studio-next/README.md`) and the "Which mocks are the spec" section of [`.claude/rules/ui-spec-and-screenshots.md`](../../.claude/rules/ui-spec-and-screenshots.md).

**Builds on:** [Which mocks are the spec](../operations/agent-train.md#which-mocks-are-the-spec), [ADR 0028](../adr/0028-planned-work-is-specified-as-prds-and-deleted-when-built.md) (planned work is deleted when built), [ADR 0407](../adr/0407-a-new-page-replaces-its-old-counterpart-in-the-same-change-and-the-navigation-is-grouped-by-production-stage.md) (replacement rule), the lifecycle in [the PRD README](README.md#lifecycle-of-a-prd).

**Status (2026-10-10):** draft. Runs last; its first two slices (the ruling index and the owner QA list) start early so the index fills as pages land.

## Problem Statement

"Matches the mock" has no definition. Without one, the mock folder either stays forever as a second spec that drifts from the app, or is deleted with rulings that never became tests. The owner's rulings (about 120 bullets across `studio-next/research/repo-compare-decisions.md`) are the contract; the mock's 45-odd tests are the evidence of how each behaved. The cutover turns both into a checked index, finishes the ratchets that only fall, deletes the mock and the PRDs, and writes the steady-state docs.

## Evidence

- The mock's rulings file is the seed; its tests (`studio-next/tests/`) are named by batch and page, not by ruling.
- The repo already checks contract coverage by test (`apps/ui/src/api/wireContracts.test.ts` fails on an unmapped binding) and has ratchets (`apps/ui/src/rawNatives.test.ts`, Knip at zero, atlas coverage); there is no ruling index.
- The mock folder is named by the PRD README, `knip.jsonc` (an `ignore` entry) and `tools/docs-site/mkdocs.yml` (an `exclude_docs` entry), and the rule file above is path-scoped to `docs/research/mockups/**`.
- PRDs are deleted by the PR that completes their last phase ([ADR 0028](../adr/0028-planned-work-is-specified-as-prds-and-deleted-when-built.md)); the series has 15 PRDs and a cross-reference web that must not dangle.

## Proposed Solution

1. **Ruling index.** A table (`docs/research/studio-next-ruling-index.md` while the work runs, deleted at the end) with one row per ruling bullet: id, text, status (agreed, agreed with conditions, deferred, rejected, maybe), the owning slice, the test name in the real app. A test (`scripts/ci/studio-next-rulings.test.mjs`) fails while an "agreed" row has no test name.
2. **Parity audit per page.** For each page the mock's tests (`studio-next/tests/*`) are mapped to real tests; an unported test needs a reason (not applicable: mock-only, or covered by X).
3. **Owner QA list on #510.** The steps only the owner can do: Shift+F10 in the WebView, REAPER undo behaviour of each new command, a real record with the pedal, Audacity backups, extraction on a real manuscript, the carried-over verification passes.
4. **Final ratchets.** `rawNatives` ceilings for series pages at zero; direct `FontAwesomeIcon` imports outside `Icon` at zero for migrated pages; every port has a contract suite; no `registerKeys`-style handlers; no bridge imports outside adapters.
5. **Delete the mock.** Remove `docs/research/mockups/studio-next/`, the `knip.jsonc` and `mkdocs.yml` entries, the PRD README lines, the "Which mocks are the spec" section of the rule file and the train's mock-spec section (to be replaced by whatever the owner rules in SN0-Q1), the screenshots helper, and any `mock-match` entries for it.
6. **Steady-state docs.** New or updated: `docs/architecture/` (shell and registries; UI state and the command journal; DAW capabilities and results; extraction tiers), `docs/design/design-system.md` (new primitives, icon vocabulary, layout rules), `docs/guides/using-the-app/*` (each page), `docs/architecture/threat-model.md` and `SECURITY.md` rows, diagrams naming moved files, and the ADRs that landed.
7. **Delete the series PRDs** in the PR that completes the last phase of each, then this one; update the PRD index.

## Key Hypothesis

If every agreed ruling has a named test and the owner has done the QA list, deleting the mock loses nothing. We are wrong if a ruling is found after deletion that is not in the index; the index is built from the file, not from memory.

## What We're NOT Building

- New features; a re-litigation of any ruling; an ADR rewrite.
- Deleting the benchmark mocks (they stay if the owner's SN0-Q1 answer keeps them).
- A mock for work that is not being built now.

## Success Metrics

| Metric | Target | Measured by |
| --- | --- | --- |
| Agreed rulings with a test | 100% | The ruling-index test |
| Mock tests mapped or excused | 100% | The parity table |
| Dangling references to the mock or to deleted PRDs | 0 | Docs link check (lychee), `scripts/ci/prd-references.mjs` |
| Owner QA items done or waived | 100% | #510 |

## Open Questions

- [ ] **SNC-Q1.** After cutover, does the owner want the mock kept as a git-history reference only? Recommendation: yes (`git log --diff-filter=D` recipe in the docs).
- [ ] **SNC-Q2.** Which spec replaces D96 in the train? Answered by SN0-Q1.
- [ ] **SNC-Q3.** Do deferred rows (time tracking, Companion, proofer CSV, Audacity 4, redo) get successor PRDs? Recommendation: no; they stay in the ruling index as deferred and in the roadmap if the owner wishes.
- [ ] **SNC-Q4.** Are the DISCUSS answers (DQ-1..DQ-18) all recorded as ADRs by then? Recommendation: required for cutover.

## Users & Context

The owner, the coordinator and the last workers; the docs reader after the series.

## Solution Detail

### Acceptance criteria

| Behaviour | Acceptance |
| --- | --- |
| Ruling index | Every "agreed" and "agreed with conditions" bullet has a test name that exists |
| Deferred and rejected rows | Listed with their status and the ADR or PRD that records the decision |
| Mock deletion | The folder and references gone; `pnpm check` and the docs check green |
| Steady-state docs | Each page guide updated; the architecture docs exist; screenshots regenerated once by the final sweep (D44) |
| PRD deletion | Each series PRD removed in its last phase's PR; the index and "Replaced briefs" updated; the old PRDs' carried-over phases show where they went |

### Supersedes / depends on ADRs

On conflict this PRD, and the ADR written when its phase lands, is the source of truth; old ADRs stay in force for unmigrated code ([register](studio-next-adr-register.prd.md)). This PRD checks that every superseding ADR in the register is merged, every DISCUSS row answered, and the old ADRs' Status lines read "Superseded by".

| ADR | Class | Note |
| --- | --- | --- |
| [ADR 0028](../adr/0028-planned-work-is-specified-as-prds-and-deleted-when-built.md) | KEEP | Delete when built |
| [ADR 0407](../adr/0407-a-new-page-replaces-its-old-counterpart-in-the-same-change-and-the-navigation-is-grouped-by-production-stage.md) | KEEP (DQ-2 outcome) | No mock-era route left |
| [ADR 0585](../adr/0585-mock-fidelity-is-a-pixel-match-at-the-mocks-own-size-and-theme-scored-by-a-tool-that-reports-and-does-not-gate.md), [ADR 0740](../adr/0740-mock-match-is-text-blind-and-a-diagnostic-and-only-the-benchmark-mocks-are-kept.md) | DISCUSS (DQ-1) | The scoring tool's source list after the mock is gone |
| [ADR 0045](../adr/0045-dead-code-is-gated-at-zero-with-reasoned-ignores.md), [ADR 0046](../adr/0046-architecture-rules-taken-from-adrs-are-lint-and-test-rules.md) | KEEP | Dead code and rules stay at zero |

## Technical Approach

**Interfaces.** None. **Contracts.** None. **Architecture.** Docs and deletions. The ruling-index test is a small Node test beside the other CI scripts (`scripts/ci/`), run by `pnpm check`.

**Test plan.** The ruling-index test, link check, markdownlint, Knip, `pnpm check`, the full visual suite, atlas, aria once (D44), mock-match if kept.

**Rollout.** One slice per deletion kind; the mock goes last, after the owner QA list is cleared or waived.

**ADRs.** The cutover PR checks them; it writes one only to record the final spec precedence if SN0-Q1 needs it.

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
| 6 | Delete | Mock, references, series PRDs, index | pending | - | 1 to 5, owner | 0.7 | - |

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
| 6 | `docs/research/mockups/studio-next/`, `.claude/rules/ui-spec-and-screenshots.md`, `knip.jsonc`, `mkdocs.yml`, train | Everything; runs alone (owner approval for the rule file and the train) |

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
