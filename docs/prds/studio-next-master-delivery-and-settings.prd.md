# Studio Next Master, Delivery and Settings: Capability-Driven Settings and Delivery Brought to the Mock

**Source:** owner request of 2026-10-10 ([Studio Next Rebuild](studio-next-rebuild.prd.md)); the Settings, Master and Delivery behaviour in the mock's `studio-next/src/pages/Settings.tsx`, `studio-next/src/pages/Master.tsx`, `studio-next/src/pages/Delivery.tsx` and the delivery-profile rulings (ACX only; checkpoint as a template; payment type) in `studio-next/research/repo-compare-decisions.md`; the owner's rulings of 2026-10-11 (see Decisions).

**Builds on:** the delivered Master & QC page, delivery profiles and mastering ([ACX delivery requirements](../reference/acx-delivery-requirements.md), [Data files](../reference/data-files.md), [The mastering chain](../guides/using-the-app/master-and-qc.md#the-mastering-chain), [Exporting a report](../guides/using-the-app/master-and-qc.md#exporting-a-report), [Master & QC](../guides/using-the-app/master-and-qc.md), [Shared Findings Contract](../architecture/findings-contract.md), [Provider ports](../architecture/provider-ports.md)), the Settings page and scoped settings (`apps/ui/src/components/settings/`), the capability toggles ([resolver.go](../../apps/desktop/internal/dawport/resolver.go)) and the keyboard panel ([Studio shell and registries](../architecture/studio-shell-and-registries.md)). It carries over two owner-side validation phases (overview table).

**Status (2026-10-12):** the swap is in review (SN-M5, #1286): `/settings`, `/master` and `/delivery` mount the Studio Next pages, Delivery has its rail item beside Master & QC, and the old pages and equivalents are deleted. The mock's Story Bible types panel is built (SN-M53, #1539); its Recording, Definitions, Reader text and Marks panels have no host model yet and are not built. The owner's rulings of 2026-10-11 are applied. The Studio Next mock is the only spec for Settings, Master & QC and Delivery. **2026-10-13:** the old `Settings` component, which SN-M5 left stacked under the new panels, is deleted (#1698): its categories are panels of the page's one column, each two-scope panel with its own Global / This project switch, and Story Bible analysis is the mock's own panel.

**Settings redesign (2026-10-17, proposed):** the [Settings redesign](#settings-redesign-proposed) replaces the Settings behaviour above (the page's one column of panels, each two-scope panel with its own Global / This project switch) with eight categories, a scope and used-by list on every setting, one downloads list and search. The Studio Next mock's Settings page now draws it and supersedes its single-column predecessor. Nothing in `apps/ui` changes until the owner accepts it; the Master and Delivery text here stands.

## Problem Statement

Settings in the mock is where the new seams become visible: the DAW capabilities with their reasons, destructive flags and modes; the manuscript replace action (moved here from the Script reader); Audacity backups (window and retention) shown only for DAWs with the capability; the Story Bible analysis tools; the key list from the command catalogue; the delivery profile choice (ACX or none, chosen on first import and changed here). Master and Delivery in the mock show only what the profile can check and word DAW things from capabilities. The real Settings and Master pages exist and are measured to the benchmark mocks, and Delivery is a panel; the mock has all three as pages and replaces them (SNM-5).

## Evidence

- **Mock.** `studio-next/src/pages/Settings.tsx`, `studio-next/src/pages/settings/AnalysisTools.tsx`, `studio-next/src/selectors/platform.ts` and `studio-next/src/fixtures/platforms.ts` (`platformOf`, `platformHas`), `studio-next/src/state/commands/settings.ts`, `studio-next/src/state/commands/delivery.ts`, `studio-next/src/selectors/master.ts`, `studio-next/src/pages/Master.tsx`, `studio-next/src/pages/Delivery.tsx`; backups settings in `studio-next/src/pages/editing/BackupsTab.tsx` and `studio-next/src/selectors/backups.ts`. Tests: `studio-next/tests/settings.test.tsx`, `studio-next/tests/master.test.tsx`, `studio-next/tests/delivery.test.tsx`, `studio-next/tests/delivery-profile.test.tsx`.
- **Repo.** `apps/ui/src/components/settings/{Settings,DawCatalogPanel,KeyboardPanel,DeliveryProfilesPanel,DeliveryProfileEditor,ScopedSetting,AboutPanel,OnlineDictionaryPanel,CreditsPanel,RecordingCheckSummary,RetailSamplePanel}.tsx`; `apps/ui/src/components/master/*` (profile panel, per-file checks, diagnostics, mastering chain, multi-platform export, report); capability toggles in settings (`DAW.capability.<name>`, [resolver.go](../../apps/desktop/internal/dawport/resolver.go)); Settings categories and anchors in `App.tsx`.

| Mock behaviour | Real today |
| --- | --- |
| Capabilities listed with reason, destructive, mode | Capability toggles per name with level; reason message from the resolver; no destructive or mode |
| Replace manuscript only in Settings | Replace on the import review and manuscript surfaces to verify |
| Backups settings, only for DAWs with the capability | None |
| Analysis tools section | None |
| Key list from catalogue, shows remapped keys | `KeyboardPanel` remaps from the catalogue |
| Delivery profile chosen on first import, changed in Settings | Profile selection per project and global default ([ACX delivery requirements](../reference/acx-delivery-requirements.md)) |
| Checkpoint measure only when the profile has it | 15-minute checkpoint is a milestone like any other (Production) |

## Proposed Solution

1. **Capabilities in Settings** show the resolver's reason, the `destructive` flag (a warning chip) and the `mode`, using the extended capability payload.
2. **Settings > Manuscript** carries Replace manuscript (the one place); the Script reader's icon goes.
3. **Backups** (window minutes, retention days) shown only when the DAW reports the `backups` capability.
4. **Story Bible analysis** section: the installed tools, sizes, remove, "ask before scanning" preference, using the [Extraction and Analysis Tools](studio-next-extraction-and-analysis-tools.prd.md) consent flow.
5. **Keys** list generated from the catalogue and the narrator's keymap.
6. **Delivery.** `platformHas(profile, capability)` is the one lookup for what a profile unlocks (templates, measures, payment types); the first import asks for the profile (ACX or none) and Settings changes it; Master & QC draws only what the host measures ([The mastering chain](../guides/using-the-app/master-and-qc.md#the-mastering-chain)); DAW wording on Master and Delivery comes from capabilities.
7. **Reflow.** Settings states are captured at 390 px ([Design system reference](../design/design-system.md)); the mock's breakpoints apply to the reported width.
8. **Swap.** Settings, Master & QC and a new Delivery page (own rail item, `studio-next/src/pages/Delivery.tsx`) replace their counterparts in SNM-5, which deletes the old Settings and Master pages, the Delivery panel and every old equivalent of what the mock shows. What has no equivalent in the mock stays as built (Phase 5 lists it).

## Key Hypothesis

If Settings is generated from capabilities, the catalogue and the registry, no new feature needs a hand-built Settings row. We are wrong if a seam slice has to edit `Settings.tsx` by hand after SNM-1.

## What We're NOT Building

- Distribution profiles other than ACX (and the existing custom profiles); an export of profile files.
- Anything the mock does not show.
- Settings for the Companion; any Series settings change (no equivalent in the mock; untouched).
- A rewrite of the mastering chain or measurement ([Master & QC](../guides/using-the-app/master-and-qc.md), [Provider ports](../architecture/provider-ports.md) stand).

## Success Metrics

| Metric | Target | Measured by |
| --- | --- | --- |
| Settings rows hand-written for a capability | 0 | Scan: capability rows come from the report |
| Reflow overflow at 390 | 0 | Visual suite reflow rows |
| Profile-gated features | All via `platformHas` | Scan for profile ids in components |

## Decisions

Owner rulings of 2026-10-11; none is open.

| Id | Ruling | Consequence here |
| --- | --- | --- |
| SN0-Q1 / DQ-1 | Studio Next is the spec, tokens and layouts included | Benchmark mock 05 and `apps/ui/src/components/master/RuleBadges.tsx` to 0667 are superseded where the mock differs |
| SN0-Q2 / DQ-2 | Replace, one PR, no flag | SNM-5 swaps the routes and deletes the old pages |
| DQ-14 / SN0-Q6 | Schedule and Delivery are pages with their own rail items | `docs/architecture/principles.md` is superseded; SNM-5 adds the Delivery route and rail item |
| DQ-12 / DQ-13 | Series and Companion have no equivalent in the mock | Their settings stay as built |
| SNM-Q1 | The profile is chosen in the import review, as the mock's `studio-next/src/pages/production/ImportFlow.tsx` does (default taken, standing instruction) | Phase 4 |
| SNM-Q2 | Backups default to 2 minutes either side and 7 days (default taken; the DAW PRD owns the values) | Two settings rows |
| SNM-Q3 | Settings keeps "Experimental REAPER actions" until the DAW PRD's promotion plan empties the list ([The REAPER bridge and its test harness](../architecture/reaper-bridge.md)) (default taken; the mock has no such row, so it is not re-skinned) | Left as built |

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

### Settings redesign (proposed)

**Status:** proposed, design only; nothing in `apps/ui` changes until the owner accepts it. The owner's open decisions are listed in the [grouping note](../research/settings-inventory-and-grouping.md#decisions-that-need-the-owner) and registered on [#993](https://github.com/countrymanprime/narration-utils/issues/993). Every setting is described by one registry entry (scope, the pages that use it, other places that write it, Advanced or not), and the Settings page, its search and its deep links are built from that list. Settings that several pages share get one home; settings that change one page leave Settings. Reversing it means re-sorting about 100 keys across panels, anchors, guides and visual states.

**Observed.** Settings is one 860 px column of 27 panels with no navigation or search ([inventory](../research/settings-inventory-and-grouping.md#how-it-works-today)); panels 1 to 10 follow the Studio Next mock and 11 to 27 are older categories kept as built, so the order is delivery history.

- Shared configuration has no home: three settings choose a Whisper model (Proof, Recording check, Booth) and the same model serves four pages; downloads are listed or removed in six places; backups and the delivery profile are edited in three places each.
- Scope is decided per panel by a Global / This project switch that gives no cross-panel view. A non-number row shows an inherited value as if it were set, and a Global value has no reset (`apps/ui/src/components/settings/ScopedSetting.tsx`).
- Many settings only change what one page does (recording check rules, silence cleanup, preview, stage suggestions) yet sit far from it.
- One setting has no consumer (`General.log_verbosity`) and four have no editor.

The [best-practice note](../research/settings-best-practice.md) surveys VS Code, JetBrains, Resolve, REAPER, Ableton, Obsidian and Windows guidance; its sources were read as search excerpts only, and rules without a source are marked there as recommendations.

**Design.**

1. **Eight categories in three labelled groups, plus an index.** Shared tools: Recording & DAW, Speech to text, Voice & pronunciation, Models & downloads, Delivery. This project: Project. This computer: Appearance & keys, App & updates. Elsewhere: Set on a page. A left list shows one category at a time; below about 760 px of the page's own width it folds into one Category button (R-NAV1, R-A11Y7).
2. **Every setting has one scope and says who uses it.** A row carries a scope badge (this computer, this project, or all projects with an optional project override) and "Used by" links to the pages that read it. Where a project may override, the row shows "This project uses the computer setting" with Override, and the override with a way back (R-IA1, R-IA2, R-IA4). A quick control on a page that writes the same value is named on the row ("Also set in ...").
3. **A setting that changes one page leaves Settings.** Recording check rules, silence cleanup, preview, stage suggestions, compare defaults, punch pre-roll, favourite effects and backups are set on their page. Settings lists them under Set on a page and search finds them (R-IA3, R-WIN5).
4. **One transcription default.** "Transcription model" in Speech to text serves Production, Proof, Pickups and Editing. The two-pass models, workers and chunking are Advanced there. The Booth's live engine and model are their own section.
5. **One list owns downloads.** Models & downloads lists every asset with size, status, used-by and what is using it, shows disk use and the folder, and owns download, cancel, retry, repair and remove. A role's choice stays in the section for that role; choosing a model that is not on the disk offers the download in the row. Removing an asset in use names what uses it and moves the setting to another installed choice, or refuses when there is none (R-RES1 to R-RES5, R-EDIT8).
6. **Changes apply at once.** No Save button; each row says Saved, a changed row carries a "Changed" mark in words and can be reset, a category can be reset after confirmation, and a costly change (the transcription model) asks first and says what re-runs. Rarely changed options sit under a closed Advanced. An invalid value keeps the previous one and says how to fix it (R-EDIT1 to R-EDIT6).
7. **Search and deep links.** Search matches label, description, section and synonyms, opens matching Advanced rows and offers "Changed" and "In this project" filters. Another page opens Settings on a row with a Back link; Ctrl+, opens Settings from anywhere (R-NAV2 to R-NAV4).
8. **The registry is the source.** `docs/research/mockups/studio-next/src/fixtures/settings.ts` holds the rows and `settingsAssets.ts` the downloads; the real page builds from the host's `fieldSchemas` plus the same metadata, so a new setting is one entry and no panel is hand-written (the "0 hand-written rows" metric).
9. **The mock is the spec.** The Studio Next Settings page (`docs/research/mockups/studio-next/src/pages/Settings.tsx` and `pages/settings/`) is the one spec for Settings and replaces its single-column predecessor, under the rule that the Studio Next mock is the only spec for the pages it covers ([Which mocks are the spec](../design/design-system.md#which-mocks-are-the-spec)). A setting the mock does not place is not built until the owner places it.

**Consequences and open points.**

- A shared resource has one home and a visible list of its consumers. A worker adding a setting fills one registry entry and decides its scope and Advanced status instead of choosing a panel.
- If accepted, this replaces the Settings behaviour described elsewhere in this PRD (the page's one column of panels, each two-scope panel with its own Global / This project switch). The local assets list stays a registry-built list with its rows owning download, verify and remove, renamed Models & downloads, and the per-page remove buttons can go. Every state is still captured at the 390 px reflow width.
- The theme is documented as one global setting while it is stored per browser; the mock labels it "This computer". Moving it to the host is a separate decision.
- Moving a setting to its page is a change per page, each with its own guide update and visual states. Until a page has it, the setting stays in Settings under its old panel; the index page is built last.
- Page owners lose the single place to look. The index page and search are the mitigation; if narrators still cannot find settings, the cost is a longer Settings page, not a different structure.
- The mock's rows use a checkbox with an On/Off word where Windows guidance prefers a toggle, because the primitive set has none (R-WIN1). Adding a switch is a Foundations decision.
- Not decided: deleting `General.log_verbosity`, what to do with the four settings that have no editor and with `Mastering.provider`, and dropping the project override for the DAW rows. They are listed for the owner in the grouping note.

### Supersedes / depends on ADRs

On conflict this PRD is the source of truth.

| ADR | Class | Note |
| --- | --- | --- |
| [resolver.go](../../apps/desktop/internal/dawport/resolver.go), [The REAPER bridge and its test harness](../architecture/reaper-bridge.md), [The REAPER verification pass](../operations/reaper-verification-pass.md) | KEEP / EXTEND | Toggles; reasons and flags shown |
| [ACX delivery requirements](../reference/acx-delivery-requirements.md), [Data files](../reference/data-files.md), [The mastering chain](../guides/using-the-app/master-and-qc.md#the-mastering-chain) | EXTEND | Capability lookup |
| [Design system reference](../design/design-system.md) | KEEP | Reflow |
| [Mock match](../operations/verification-tooling.md#mock-match), [RuleBadges.tsx](../../apps/ui/src/components/master/RuleBadges.tsx) to [MasteringChain.tsx](../../apps/ui/src/components/master/MasteringChain.tsx) | SUPERSEDE (DQ-1) | Studio Next Master replaces benchmark mock 05 as the spec |
| [Design principles](../architecture/principles.md) | KEEP decision 1, SUPERSEDE decision 5 (DQ-2, DQ-14) | Delivery is a page with its own rail item |
| [The asset registry (implemented)](../architecture/first-use-dependency-provisioning.md#the-asset-registry-implemented), [The local assets page (implemented)](../architecture/first-use-dependency-provisioning.md#the-local-assets-page-implemented) | EXTEND | Local assets list shows analysis tools |
| [Studio shell and registries](../architecture/studio-shell-and-registries.md) | EXTEND | Key list from the catalogue |

## Technical Approach

**Interfaces.** Settings reads the capability report (`useCapability` and `dawCapabilities()`), the asset list, the catalogue and keymap, the delivery-profile bindings; no new binding is required except any the Backups settings need (two settings rows, append-only in `config/defaults.json`, `internal/settings/store.go`, `fieldSchemas`).

**Contracts.** Additive capability fields from the DAW PRD; settings rows have the existing wire shape; `wireContracts.test.ts` rows for any new binding.

**Architecture.** Settings sections as feature components using `ScopedSetting` and primitives; sections register through a small list so SNM-1 is the last hand edit.

**Test plan.** Port the mock's tests; visual rows for each Settings category and Master and Delivery states at all viewports plus reflow; aria; the existing Settings contract tests.

**Rollout.** Phases 1 to 4 build sections, lookups and the Delivery page as components and ports with no route; the old pages are untouched. SNM-5 swaps Settings, Master & QC and Delivery to the mock's pages in one PR per page (SNM-5 may be split into SNM-5a..c if the coordinator sizes it so), each deleting its old page, rows, guide text and screenshots. No flag.

**ADRs.** None new except those owned by other PRDs.

**Trust boundaries.** Backups retention deletes files under the project folder (DAW PRD); the threat model is updated there.

**Risks.** Settings is a textual hot spot (append-only rows serial point); the swap deleting an old control the mock lacks (mitigation: the change-impact scan lists each consumer, and only items with a mock equivalent are deleted).

## Implementation Phases

| # | Phase | Description | Status | Parallel | Depends | Est. (pw) | PRP Plan |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Capability section | Reason, destructive, mode in Settings; section registry | done (SN-M1 [#1079](https://github.com/countrymanprime/narration-utils/issues/1079)) | 2 | SND-2 | 0.8 | - |
| 2 | Manuscript and keys | Replace in Settings only; key list from catalogue | done (SN-M2 [#1087](https://github.com/countrymanprime/narration-utils/issues/1087); the key list in SN-M52 [#1281](https://github.com/countrymanprime/narration-utils/issues/1281)) | 1 | SNR-6 | 0.7 | - |
| 3 | Backups and analysis tools | Backups settings; tools section | done (SN-M32 [#1270](https://github.com/countrymanprime/narration-utils/issues/1270), SN-M33 [#1273](https://github.com/countrymanprime/narration-utils/issues/1273)) | - | 1, SND-8, SNX-6 | 0.8 | - |
| 4 | Delivery lookup and page | `platformHas`, profile on first import, Master wording from capabilities, Delivery page components (no route) | done (SN-M41 to SN-M45, [#1275](https://github.com/countrymanprime/narration-utils/issues/1275) to [#1280](https://github.com/countrymanprime/narration-utils/issues/1280)) | - | SNP-3 | 1.0 | - |
| 5 | Swap and close-out | Swap Settings, Master & QC and Delivery routes and the Delivery rail item; delete the old pages and equivalents; visual rows incl. reflow; guides; carried-over owner validation | in review (SN-M5 [#1286](https://github.com/countrymanprime/narration-utils/issues/1286); the SN-M51 audit note is deleted, its tables acted on) | - | 1 to 4 | 0.7 | - |

### Phase Details

- **Phase 5.** Carried over, pending on #510: the owner's reading of the ACX page and the EBU validation run; neither blocks a merge. Kept as built, with no mock equivalent: the Settings categories the mock does not draw (below its panels, with the scope tabs), the Global default profile with Duplicate, Edit and Delete, a file's every-rule list, Master to spec, the mastering chain, Diagnostics, the report export, the multi-platform export and the profile's rules and their sources (on Delivery). The mock's failing-file count on Master & QC's rail item is not drawn (no cheap host read yet).

### Parallelism Notes

1 and 2 are independent; 3 waits for DAW and extraction slices; 4 for the Production lookup.

### Parallel-session compatibility

| Phase | Files touched | Collides with |
| --- | --- | --- |
| 1, 2, 3 | `components/settings/*`, `config/defaults.json`, `internal/settings/store.go`, `app.go` `fieldSchemas` | Any settings PRD (append-only serial rows) |
| 4, 5 | `components/master/*`, `components/settings/DeliveryProfilesPanel.tsx`, navigation | Production slices; the navigation serial point |

### Slices

| Slice | Scope | Depends on | Parallel-safe | Verification |
| --- | --- | --- | --- | --- |
| SNM-1 | Phase 1 | SND-2 | yes | Ported tests; visual; contract tests |
| SNM-2 | Phase 2 | SNR-6 | yes | Ported tests; visual |
| SNM-3 | Phase 3 | SNM-1, SND-8, SNX-6 | yes | Visual; registry tests |
| SNM-4 | Phase 4 | SNP-3 | yes | Ported tests; visual |
| SNM-5 | Phase 5 | SNM-1..4 | no (page swap) | Visual suite incl. reflow; Screenshots against the mock pages; deleted code gone from Knip |

## Decisions Log

| Decision | Choice | Alternatives | Rationale |
| --- | --- | --- | --- |
| Generate, do not hand-write (proposed) | Rows from the report, catalogue, registry | Per-feature Settings edits | Open/closed |
| ACX only (owner) | Profile ids as data | More platforms | "Right now, I only want to support ACX" |
| Settings are grouped by what is configured, with a scope and a used-by list on every setting and one list that owns downloads (proposed, owner to accept) | Eight categories in three groups plus an index; one registry entry per setting | Keep the single column and add a table of contents (leaves the shared-resource and scope problems, and 27 panels is still 27 panels); tabs across the top (about nine categories is more than a tab bar holds, R-NAV1); one big searchable list with no categories (loses the workflow grouping the audio tools use, R-IA6); a modal Options dialog (no deep link or Back, R-WIN6); grouping by consuming page (puts the Whisper model on four pages, which is today's problem) | A shared resource gets one home and a visible list of its consumers |

## Research Summary

Read: the mock's settings, master, delivery and platform files; the real settings and master component lists; `docs/reference/acx-delivery-requirements.md, apps/desktop/internal/dawport/resolver.go, docs/guides/using-the-app/master-and-qc.md#the-mastering-chain`. Not done: Settings categories were not audited row by row.

## Visual Spec

Mock pages: Settings, Master & QC, Delivery (`studio-next/src/pages/Settings.tsx`, `Master.tsx`, `Delivery.tsx`).
