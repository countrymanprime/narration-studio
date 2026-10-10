# Studio Next Master, Delivery and Settings: Capability-Driven Settings and Delivery Brought to the Mock

**Source:** owner request of 2026-10-10 ([Studio Next Rebuild](studio-next-rebuild.prd.md)); the Settings, Master and Delivery behaviour in the mock's `studio-next/src/pages/Settings.tsx`, `studio-next/src/pages/Master.tsx`, `studio-next/src/pages/Delivery.tsx` and the delivery-profile rulings (ACX only; checkpoint as a template; payment type) in `studio-next/research/repo-compare-decisions.md`.

**Builds on:** the delivered Master & QC page, delivery profiles and mastering ([ADR 0179](../adr/0179-a-built-in-dated-acx-delivery-profile-ships-and-a-project-is-judged-against-its-selected-profile.md), [ADR 0180](../adr/0180-custom-delivery-profiles-are-copies-of-a-built-in-kept-in-a-user-level-file.md), [ADR 0440](../adr/0440-master-and-qcs-platform-tabs-are-the-projects-delivery-profile-and-the-page-draws-only-what-the-host-measures.md), [ADR 0170](../adr/0170-the-delivery-report-is-built-by-the-host-into-the-project-sidecar-without-paths-and-the-host-judges-the-limits.md), [ADR 0321](../adr/0321-the-mastering-chain-is-a-fixed-high-pass-limiter-and-gain-that-masters-to-the-profiles-own-measured-rms-and-sample-peak.md), [ADR 0322](../adr/0322-delivery-findings-are-saved-for-review-per-measured-file-versioned-by-the-audio-and-the-rules-bound.md), [ADR 0306](../adr/0306-mastering-is-a-provider-port-and-measurement-stays-one-in-process-judge.md)), the Settings page and scoped settings (`apps/ui/src/components/settings/`), the capability toggles ([ADR 0304](../adr/0304-bridge-actions-asks-a-per-command-gate-and-the-daw-ports-resolver-answers-it-from-the-per-capability-settings.md)) and the keyboard panel ([ADR 0361](../adr/0361-app-commands-go-through-one-registry-and-keyboard-midi-and-hid-are-input-sources-bound-by-a-remappable-keymap.md)). It carries over two owner-side validation phases (overview table).

**Status (2026-10-10):** draft. The smallest page PRD: most of the work is wiring other PRDs' seams into Settings and Master.

## Problem Statement

Settings in the mock is where the new seams become visible: the DAW capabilities with their reasons, destructive flags and modes; the manuscript replace action (moved here from the Script reader); Audacity backups (window and retention) shown only for DAWs with the capability; the Story Bible analysis tools; the key list from the command catalogue; the delivery profile choice (ACX or none, chosen on first import and changed here). Master and Delivery in the mock show only what the profile can check and word DAW things from capabilities. The real Settings, Master and Delivery pages exist and are measured to the benchmark mocks; the work is to add these rows and behaviours without regressing them.

## Evidence

- **Mock.** `studio-next/src/pages/Settings.tsx`, `studio-next/src/pages/settings/AnalysisTools.tsx`, `studio-next/src/selectors/platform.ts` and `studio-next/src/fixtures/platforms.ts` (`platformOf`, `platformHas`), `studio-next/src/state/commands/settings.ts`, `studio-next/src/state/commands/delivery.ts`, `studio-next/src/selectors/master.ts`, `studio-next/src/pages/Master.tsx`, `studio-next/src/pages/Delivery.tsx`; backups settings in `studio-next/src/pages/editing/BackupsTab.tsx` and `studio-next/src/selectors/backups.ts`. Tests: `studio-next/tests/settings.test.tsx`, `studio-next/tests/master.test.tsx`, `studio-next/tests/delivery.test.tsx`, `studio-next/tests/delivery-profile.test.tsx`.
- **Repo.** `apps/ui/src/components/settings/{Settings,DawCatalogPanel,KeyboardPanel,DeliveryProfilesPanel,DeliveryProfileEditor,ScopedSetting,AboutPanel,OnlineDictionaryPanel,CreditsPanel,RecordingCheckSummary,RetailSamplePanel}.tsx`; `apps/ui/src/components/master/*` (profile panel, per-file checks, diagnostics, mastering chain, multi-platform export, report); capability toggles in settings (`DAW.capability.<name>`, [ADR 0304](../adr/0304-bridge-actions-asks-a-per-command-gate-and-the-daw-ports-resolver-answers-it-from-the-per-capability-settings.md)); Settings categories and anchors in `App.tsx`.

| Mock behaviour | Real today |
| --- | --- |
| Capabilities listed with reason, destructive, mode | Capability toggles per name with level; reason message from the resolver; no destructive or mode |
| Replace manuscript only in Settings | Replace on the import review and manuscript surfaces to verify |
| Backups settings, only for DAWs with the capability | None |
| Analysis tools section | None |
| Key list from catalogue, shows remapped keys | `KeyboardPanel` remaps from the catalogue |
| Delivery profile chosen on first import, changed in Settings | Profile selection per project and global default ([ADR 0179](../adr/0179-a-built-in-dated-acx-delivery-profile-ships-and-a-project-is-judged-against-its-selected-profile.md)) |
| Checkpoint measure only when the profile has it | 15-minute checkpoint is a milestone like any other (Production) |

## Proposed Solution

1. **Capabilities in Settings** show the resolver's reason, the `destructive` flag (a warning chip) and the `mode`, using the extended capability payload.
2. **Settings > Manuscript** carries Replace manuscript (the one place); the Script reader's icon goes.
3. **Backups** (window minutes, retention days) shown only when the DAW reports the `backups` capability.
4. **Story Bible analysis** section: the installed tools, sizes, remove, "ask before scanning" preference, using the [Extraction and Analysis Tools](studio-next-extraction-and-analysis-tools.prd.md) consent flow.
5. **Keys** list generated from the catalogue and the narrator's keymap.
6. **Delivery.** `platformHas(profile, capability)` is the one lookup for what a profile unlocks (templates, measures, payment types); the first import asks for the profile (ACX or none) and Settings changes it; Master & QC draws only what the host measures ([ADR 0440](../adr/0440-master-and-qcs-platform-tabs-are-the-projects-delivery-profile-and-the-page-draws-only-what-the-host-measures.md)); DAW wording on Master and Delivery comes from capabilities.
7. **Reflow.** Settings states are captured at 390 px ([ADR 0061](../adr/0061-settings-states-are-also-captured-at-a-390px-reflow-width.md)).

## Key Hypothesis

If Settings is generated from capabilities, the catalogue and the registry, no new feature needs a hand-built Settings row. We are wrong if a seam slice has to edit `Settings.tsx` by hand after SNM-1.

## What We're NOT Building

- Distribution profiles other than ACX (and the existing custom profiles); an export of profile files.
- A new Delivery page unless DQ-14 says so.
- Settings for the Companion; any Series settings change.
- A rewrite of the mastering chain or measurement ([ADR 0321](../adr/0321-the-mastering-chain-is-a-fixed-high-pass-limiter-and-gain-that-masters-to-the-profiles-own-measured-rms-and-sample-peak.md), [ADR 0306](../adr/0306-mastering-is-a-provider-port-and-measurement-stays-one-in-process-judge.md) stand).

## Success Metrics

| Metric | Target | Measured by |
| --- | --- | --- |
| Settings rows hand-written for a capability | 0 | Scan: capability rows come from the report |
| Reflow overflow at 390 | 0 | Visual suite reflow rows |
| Profile-gated features | All via `platformHas` | Scan for profile ids in components |

## Open Questions

- [ ] **SNM-Q1.** Where does the profile choice appear on first import? Recommendation: in the import review, as the mock's import flow (`studio-next/src/pages/production/ImportFlow.tsx`).
- [ ] **SNM-Q2.** Backups defaults. Recommendation: 2 minutes either side, 7 days (see the DAW PRD).
- [ ] **SNM-Q3.** Does Settings keep "Experimental REAPER actions"? Recommendation: keep until the DAW PRD's promotion plan empties the list ([ADR 0230](../adr/0230-reaper-commands-built-before-the-verification-pass-are-refused-by-the-host-while-the-experimental-switch-is-off.md)).
- [ ] **SNM-Q4.** Benchmark mock 05 versus the Studio Next Master page (DQ-1). Recommendation: side-by-side per state.

## Users & Context

A narrator setting up a project (profile, DAW, keys) and checking a rendered chapter against ACX. Accessibility: the Settings page reflows to 390 px.

## Solution Detail

### Acceptance criteria tied to the mock

| Behaviour | Mock reference | Acceptance |
| --- | --- | --- |
| Capability row | `studio-next/tests/daw-wording.test.tsx`, `studio-next/tests/settings.test.tsx` | Level, reason, destructive chip and mode shown for each capability the host reports |
| Replace manuscript only here | `studio-next/tests/import.test.tsx` | Script reader has no replace icon; Settings > Manuscript does |
| Backups only when supported | `studio-next/src/selectors/backups.ts` | Hidden for REAPER; shown for Audacity |
| Profile lookup | `studio-next/tests/delivery-profile.test.tsx` | "Other / none" hides ACX-only measures and templates |
| Master draws what is measured | `studio-next/tests/master.test.tsx` | No row for an unmeasured rule |

### Supersedes / depends on ADRs

On conflict this PRD, and the ADR written when its phase lands, is the source of truth; old ADRs stay in force for unmigrated code ([register](studio-next-adr-register.prd.md)).

| ADR | Class | Note |
| --- | --- | --- |
| [ADR 0304](../adr/0304-bridge-actions-asks-a-per-command-gate-and-the-daw-ports-resolver-answers-it-from-the-per-capability-settings.md), [ADR 0230](../adr/0230-reaper-commands-built-before-the-verification-pass-are-refused-by-the-host-while-the-experimental-switch-is-off.md), [ADR 0400](../adr/0400-promoting-a-reaper-command-from-experimental-to-supported-is-a-one-line-daw-port-declaration-change.md) | KEEP / EXTEND | Toggles; reasons and flags shown |
| [ADR 0179](../adr/0179-a-built-in-dated-acx-delivery-profile-ships-and-a-project-is-judged-against-its-selected-profile.md), [ADR 0180](../adr/0180-custom-delivery-profiles-are-copies-of-a-built-in-kept-in-a-user-level-file.md), [ADR 0440](../adr/0440-master-and-qcs-platform-tabs-are-the-projects-delivery-profile-and-the-page-draws-only-what-the-host-measures.md) | EXTEND | Capability lookup |
| [ADR 0061](../adr/0061-settings-states-are-also-captured-at-a-390px-reflow-width.md), [ADR 0465](../adr/0465-the-shells-header-states-are-also-captured-at-the-reflow-width-because-thats-what-a-narrator-sees-at-high-zoom.md) | KEEP | Reflow |
| [ADR 0585](../adr/0585-mock-fidelity-is-a-pixel-match-at-the-mocks-own-size-and-theme-scored-by-a-tool-that-reports-and-does-not-gate.md), [ADR 0665](../adr/0665-master-s-rule-marks-compose-statusbadge-warn-and-muted-keep-their-outline-look.md) to [ADR 0667](../adr/0667-the-mastering-chain-s-steps-are-badges-and-the-last-one-is-accent-soft.md) | DISCUSS (DQ-1) | Benchmark mock 05 |
| [ADR 0407](../adr/0407-a-new-page-replaces-its-old-counterpart-in-the-same-change-and-the-navigation-is-grouped-by-production-stage.md) | DISCUSS (DQ-14) | Delivery stays a panel |
| [ADR 0079](../adr/0079-every-downloadable-asset-is-listed-installed-verified-and-removed-through-one-registry-of-providers.md), [ADR 0081](../adr/0081-local-assets-is-a-settings-list-built-from-the-registry-whose-rows-own-their-download-verify-and-remove.md) | EXTEND | Local assets list shows analysis tools |
| [ADR 0361](../adr/0361-app-commands-go-through-one-registry-and-keyboard-midi-and-hid-are-input-sources-bound-by-a-remappable-keymap.md) | EXTEND | Key list from the catalogue |

## Technical Approach

**Interfaces.** Settings reads the capability report (`useCapability` and `dawCapabilities()`), the asset list, the catalogue and keymap, the delivery-profile bindings; no new binding is required except any the Backups settings need (two settings rows, append-only in `config/defaults.json`, `internal/settings/store.go`, `fieldSchemas`).

**Contracts.** Additive capability fields from the DAW PRD; settings rows have the existing wire shape; `wireContracts.test.ts` rows for any new binding.

**Architecture.** Settings sections as feature components using `ScopedSetting` and primitives; sections register through a small list so SNM-1 is the last hand edit.

**Test plan.** Port the mock's tests; visual rows for each Settings category and Master and Delivery states at all viewports plus reflow; aria; the existing Settings contract tests.

**Rollout.** Row-by-row additions; no flag; the Master/Delivery pass is a small swap with Screenshots.

**ADRs.** None new except those owned by other PRDs.

**Trust boundaries.** Backups retention deletes files under the project folder (DAW PRD); the threat model is updated there.

**Risks.** Settings is a textual hot spot (append-only rows serial point); regressions in the benchmark-matched pages (DQ-1).

## Implementation Phases

| # | Phase | Description | Status | Parallel | Depends | Est. (pw) | PRP Plan |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Capability section | Reason, destructive, mode in Settings; section registry | pending | 2 | SND-2 | 0.8 | - |
| 2 | Manuscript and keys | Replace in Settings only; key list from catalogue | pending | 1 | SNR-6 | 0.7 | - |
| 3 | Backups and analysis tools | Backups settings; tools section | pending | - | 1, SND-8, SNX-6 | 0.8 | - |
| 4 | Delivery lookup | `platformHas`, profile on first import, Master wording from capabilities | pending | - | SNP-3 | 1.0 | - |
| 5 | Close-out | Visual rows incl. reflow; guides; carried-over owner validation | pending | - | 1 to 4 | 0.7 | - |

### Phase Details

- **Phase 5.** Carried over: the ACX page reading by the owner and the EBU validation run (owner-side, #510); neither blocks a merge.

### Parallelism Notes

1 and 2 are independent; 3 waits for DAW and extraction slices; 4 for the Production lookup.

### Parallel-session compatibility

| Phase | Files touched | Collides with |
| --- | --- | --- |
| 1, 2, 3 | `components/settings/*`, `config/defaults.json`, `internal/settings/store.go`, `app.go` `fieldSchemas` | Any settings PRD (append-only serial rows) |
| 4 | `components/master/*`, `components/settings/DeliveryProfilesPanel.tsx` | Production slices |

### Slices

| Slice | Scope | Depends on | Parallel-safe | Verification |
| --- | --- | --- | --- | --- |
| SNM-1 | Phase 1 | SND-2 | yes | Ported tests; visual; contract tests |
| SNM-2 | Phase 2 | SNR-6 | yes | Ported tests; visual |
| SNM-3 | Phase 3 | SNM-1, SND-8, SNX-6 | yes | Visual; registry tests |
| SNM-4 | Phase 4 | SNP-3 | yes | Ported tests; visual |
| SNM-5 | Phase 5 | SNM-1..4 | no | Visual suite incl. reflow; Screenshots |

## Decisions Log

| Decision | Choice | Alternatives | Rationale |
| --- | --- | --- | --- |
| Generate, do not hand-write (proposed) | Rows from the report, catalogue, registry | Per-feature Settings edits | Open/closed |
| ACX only (owner) | Profile ids as data | More platforms | "Right now, I only want to support ACX" |

## Research Summary

Read: the mock's settings, master, delivery and platform files; the real settings and master component lists; ADRs 0179, 0304, 0440. Not done: Settings categories were not audited row by row.

## Visual Spec

Mock pages: Settings, Master & QC, Delivery (`studio-next/src/pages/Settings.tsx`, `Master.tsx`, `Delivery.tsx`); subject to DQ-1 for Master (benchmark mock 05).
