# Studio Next Script-Based Editing: The Chapter's Words as the Editor

**Source:** owner request of 2026-10-10 ([Studio Next Rebuild](studio-next-rebuild.prd.md)); "Editing page: script-based audio editing (owner ruling)", the takes and Audacity follow-ups and the "FX exception" in `studio-next/research/repo-compare-decisions.md`; research in `studio-next/research/editing-page-research.md` and `studio-next/research/editing-fx-research.md`; the mock's `studio-next/src/pages/Editing.tsx` and `studio-next/src/pages/editing/`.

**Builds on / replaces (the old workspace is deleted in the swap, SNE-9):** the delivered workspace inside the Proof chapter page (word-level player, flags, takes panel, FX on a passage: [ADR 0212](../adr/0212-the-workspace-alignment-reuses-the-coverage-results-store-and-joins-played-ranges-from-the-saved-project-on-read.md), [ADR 0242](../adr/0242-the-recording-check-writes-the-chapters-word-alignment-as-additive-lines-and-align-again-never-transcribes.md), [ADR 0265](../adr/0265-the-workspace-highlights-by-binary-search-over-timed-tokens-and-groups-consecutive-flagged-tokens-into-one-flag.md), [ADR 0700](../adr/0700-the-takes-panel-lists-a-passages-takes-from-the-saved-project-and-chooses-one-by-an-id-the-host-offered.md), [ADR 0705](../adr/0705-the-workspace-adds-an-effect-to-a-passage-or-a-chain-to-the-chapters-track-only-after-the-narrator-confirms-and-the-host-names-both-targets.md), [ADR 0520](../adr/0520-the-peaks-cache-holds-one-whole-source-entry-and-the-strip-reuses-timelines-backdrop.md)), the editing readiness work ([ADR 0266](../adr/0266-the-editing-check-panel-reads-its-per-class-state-from-srs-stage-signals-and-keeps-progress-inline-so-candidates-stay-visible-while-it-runs.md), [ADR 0238](../adr/0238-silence-cleanup-candidates-are-classed-in-the-diagnostics-pass-and-raised-apart-from-the-diagnostics-findings.md)) and the DAW commands of [DAW Ports and Capabilities](studio-next-daw-ports-and-capabilities.prd.md). The old Edit and Proof Workspace PRD is superseded in its remaining parts here (follow REAPER, takes panel, consolidation); see the overview's carried-over table.

**Status (2026-10-10):** draft. The largest PRD of the series (12 people-weeks); its swap waits for the DAW range commands and for the take lanes of [Proof and Pickups](studio-next-proof-and-pickups.prd.md).

## Problem Statement

The owner chose design E: the chapter's own text is the editor. Words are read-only; the audio is what changes. Takes are sub-lines under each passage, a slim waveform ribbon sits under the active line, a right-click menu offers Delete words and audio and Add FX, a floating selection toolbar and a Clean up and FX drawer carry the rest, and a synchronised timeline strip of take lanes shows optionally at 1360 px and wider. Retries can be stacked onto the first read; cleanup, take prep (trim white space, breaths, normalise), a suggested take with honest confidence and a backups table (Audacity) belong here. The real app has the word-level player, flags, takes panel and FX on a passage inside the Proof chapter page, but no delete, no range FX, no stacking, no suggestions and no Editing page.

## Evidence

- **Mock.** Page: `studio-next/src/pages/Editing.tsx` with `studio-next/src/pages/editing/{ScriptDoc,Ribbon,FlagCard,Bar,Strip,Drawer,RangeDialogs,TakeParts,CleanupTab,EffectsTab,BackupsTab,Coverage,StackDialog}.tsx`. Model: `studio-next/src/selectors/scriptedit.ts` (`alignToScript`, `ChapterDoc`, selection model, `summarize`), `studio-next/src/selectors/cuts.ts`, `studio-next/src/selectors/stacking.ts`, `studio-next/src/selectors/takes.ts` (`suggestTake`), `studio-next/src/selectors/passagemap.ts`. Commands: `studio-next/src/state/commands/{scriptedit,editing,stacking,backups,passagemap}.ts`. Providers: `studio-next/src/providers/{alignment,takes,fxchains}.ts`. Tests: ten files in `studio-next/tests/` named `editing`, `c2-editing`, `d2-editing-keys`, `e-alignment`, `e-selection`, `e-takes-inline`, `e-strip-narrow`, `e-delete-range`, `e-fx-range` and `d3-stacking`.
- **Repo.** `apps/ui/src/components/proof/{ProofChapterPage,ScriptView,TransportBar,WaveformStrip,TakesPanel,ApplyFxDialog}.tsx` and `{useChapterPlayback,useWorkspaceReaper,tokenAtTime,takesPassage}.ts`; `apps/ui/src/components/editing/{EditingCheckPanel,CleanupAction}.tsx`; Go `internal/passagetakes`, `internal/takecompare`, `internal/measure` (peaks, ranges), `bindings_workspace*.go`; Lua `narration_workspace.lua` (`set_active_take`, `add_take_fx`, `apply_fx_chain`), `narration_cleanup.lua`; keys `workspace.*` in `commands.catalog.ts`.

| Mock feature | Real today |
| --- | --- |
| Words as the editor, read-only text, selection by word and phrase | Word click seeks; Shift+click extends; right-click menu ([ADR 0705](../adr/0705-the-workspace-adds-an-effect-to-a-passage-or-a-chain-to-the-chapters-track-only-after-the-narrator-confirms-and-the-host-names-both-targets.md)) |
| Ribbon under the active line; flag cards; floating toolbar; bar | Waveform strip and transport; flags inline (`ScriptView`) |
| Takes inline with evidence and a suggested take | Takes panel with A/B, never ranked ([ADR 0165](../adr/0165-a-take-comparison-is-one-finding-per-group-over-its-one-span-built-from-the-saved-project-and-never-ranked.md)) |
| Delete words and audio (`deleteRange`) | Not built (the workspace PRD excluded delete) |
| Add FX on a range from the DAW's own chains | One plug-in on a passage; chain on a track ([ADR 0234](../adr/0234-fx-chains-go-on-tracks-and-a-passage-of-a-take-gets-one-plug-in-at-a-time.md)) |
| Stack retries; un-stack | None |
| Cleanup, prep steps, Backups tabs in a drawer | Editing check panel and cleanup launchers |
| Timeline strip of lanes at 1360+ | Waveform strip only |
| Passage map written by the Booth | None |

## Proposed Solution

1. **Page and model.** A new Editing page (rail group Review, [ADR 0407](../adr/0407-a-new-page-replaces-its-old-counterpart-in-the-same-change-and-the-navigation-is-grouped-by-production-stage.md)) whose model is ported as pure TypeScript: `alignToScript` (matches, misreads paired by look-alike, not read, extra words), `ChapterDoc` with stable keys, cut list and effects applied, the selection model, `summarize`. Words come from an `AlignmentPort`: per-word offsets, confidence and `added` flag from the stored workspace alignment ([ADR 0212](../adr/0212-the-workspace-alignment-reuses-the-coverage-results-store-and-joins-played-ranges-from-the-saved-project-on-read.md)); `snap` moves a cut to a zero crossing host-side.
2. **Keys and menus** through the catalogue and providers: word arrows, Shift selects, Ctrl phrase, Del, M mute, F FX, T and Shift+T takes, Enter play, H hide, `[` `]` flags, S, Esc, Ctrl+Shift+C, chapter step Alt+Up/Down (`studio-next/src/pages/Editing.tsx` `registerKeys` becomes catalogue rows).
3. **Takes inline** (`TakeParts`): each take a sub-line with evidence (words matched, longest pause, level against neighbours, noise floor, clarity, breaths) from the measure ranges ([ADR 0140](../adr/0140-take-metrics-are-per-category-evidence-over-a-takes-source-range.md)); a **suggested take** with an honest confidence, null with a reason until takes are level-comparable and rising as prep steps are applied; shown as a chip with its evidence, never preselected, never applied (DQ-15; [ADR 0165](../adr/0165-a-take-comparison-is-one-finding-per-group-over-its-one-span-built-from-the-saved-project-and-never-ranked.md) superseded to that extent).
4. **Prep steps** (trim white space, trim breaths, normalise) are offered, never run by themselves, and re-score the suggestion.
5. **Hide other takes** (mute, one undo) replaces removal; nothing is ever deleted.
6. **Duplicate reads** (a take that reads the line twice) are found and split into takes, in the DAW when the `takes` capability allows, else the built-in recorder.
7. **Stacking** as the mock does it (`studio-next/src/selectors/stacking.ts`, `StackDialog.tsx`): the plan is shown first, later reads move onto the first read, the chapter shifts; un-stack restores by offsets (DQ-7).
8. **Delete words and audio** and **Add FX to a range** through `DawClient.deleteRange` and `applyFxToRange`, behind `cut_range` and `fx_range`, always confirmed with a preview, one undo step, never deleting (a trim hides or mutes; it goes to the muted Cuts track as `delete_range` does, DQ-8), struck words kept, an underline and an FX marker with a way to remove, the DAW's own saved chains listed from the DAW (`studio-next/src/providers/fxchains.ts`).
9. **Strip and drawer.** The timeline strip of take lanes at the mock's width rule (1360 px and wider, implemented as the container query of [Foundations](studio-next-foundations.prd.md), SN0-Q7); the drawer with Clean up, Effects and Backups (and Timeline where the strip does not fit); Backups tab only for DAWs with the capability.
10. **Cleanup placement.** Editing owns cleanup plus take prep, take suggestion and backups (owner: "confirmed"); cleanup trims use the Cuts-track mechanism: they hide or mute, deletion is the DAW's job (DQ-8; [ADR 0262](../adr/0262-cleanup-trims-are-found-by-matching-the-measured-file-to-a-live-item-and-applied-as-a-split-and-delete-inside-one-undo-block.md) superseded).
11. **Carried over** from the old workspace PRD: follow REAPER's transport (Could, depends on the play-position spike) and the clause split that ADR 0252 deferred for lack of persisted word times (Could).

## Key Hypothesis

If the word model and the DAW range commands are separate seams, the page is only a view, and the same model serves REAPER, the built-in recorder and Audacity with backups. We are wrong if the page needs a DAW-name conditional or if an edit cannot be undone as the mock's confirmation text promises ("one undo step").

## What We're NOT Building

- Designs A to D and F's two-pane layout; FX chains on whole takes; editing the text (the text is read-only).
- Deleting audio in any DAW (hide or move to a muted Cuts track); redo; Audacity 4 clip-takes beyond the backups table.
- Multi-item range edits; auto-applied suggestions, prep or cleanup; a ranked "best take" without evidence.
- A second alignment run: Editing reads the stored alignment; the Booth's passage map is used where it exists.
- A feature flag or a period with two Editing pages: the swap is atomic like every other page (DQ-2).
- Anything the mock does not show ("if it is not in the mock it doesn't get built").

## Success Metrics

| Metric | Target | Measured by |
| --- | --- | --- |
| Edits that are one undo step as promised | 100% in REAPER; Audacity lists its steps | Harness and `DawClient` parity |
| Suggestions with null confidence when not comparable | 100% | Ported `studio-next/tests/e-takes-inline.test.tsx` |
| Auto-applied edits | 0 | Test: no DAW call without a confirm |
| Overflow at 1440, 1024, 768 | 0 | Visual suite; ported `studio-next/tests/e-strip-narrow.test.tsx` |
| Words rendered smoothly on a 10,000-word chapter | Interactions under 100 ms | Performance test on a synthetic chapter; the old workspace's open perf question (thousands of spans in WebView2) answered |

## Decisions

Decided by the owner on 2026-10-11; nothing here waits for an answer, so G0 has no question for the owner.

- **SN0-Q1 / DQ-1.** The Studio Next Editing page (`studio-next/src/pages/Editing.tsx`) is the spec, including layout, sizes and the strip width.
- **SN0-Q2 / DQ-2.** Replace, for Editing as for every page. No flag, no period with two versions. The model and components land with no route; one PR (SNE-9) swaps the route and deletes the old workspace, including its route redirect, rows, guide and screenshots ([ADR 0407](../adr/0407-a-new-page-replaces-its-old-counterpart-in-the-same-change-and-the-navigation-is-grouped-by-production-stage.md) decision 1 stays). Proof keeps notes and the takes-at-a-spot lanes.
- **DQ-7.** Stacking follows the mock; [ADR 0147](../adr/0147-retakes-on-fixed-lanes-are-chosen-by-lane-play-state-and-the-app-never-converts-takes-and-lanes.md) is superseded to that extent.
- **DQ-8.** Never delete: trims hide or mute and go to the muted Cuts track; [ADR 0262](../adr/0262-cleanup-trims-are-found-by-matching-the-measured-file-to-a-live-item-and-applied-as-a-split-and-delete-inside-one-undo-block.md) is superseded.
- **DQ-15.** Evidence first, a suggested take with an honest (possibly null) confidence, never auto-applied; [ADR 0165](../adr/0165-a-take-comparison-is-one-finding-per-group-over-its-one-span-built-from-the-saved-project-and-never-ranked.md) is superseded to that extent.
- **DQ-18.** Capability-driven take management for Audacity, as in the mock; [ADR 0660](../adr/0660-audacitys-finding-detail-hides-reapers-take-management-instead-of-disabling-it-through-capabilitygate.md) is superseded to that extent.
- **SN0-Q7.** The strip and drawer follow the mock's breakpoints as container queries at the mock's widths.
- **SN0-Q8.** Screenshots are compared against the Studio Next Editing page.

## Users & Context

A narrator doing the edit pass: reading the script while listening, deleting retakes and stumbles, picking takes, applying a saved chain to a phrase. Keyboard-first; the DAW is the audio truth.

## Solution Detail

### Acceptance criteria tied to the mock

| Behaviour | Mock reference | Acceptance |
| --- | --- | --- |
| Words against what was heard | `studio-next/tests/e-alignment.test.tsx` | Matches, misreads, not-read and extra words are marked, not by colour alone |
| Selection | `studio-next/tests/e-selection.test.ts`, `studio-next/tests/d2-editing-keys.test.tsx` | Word, phrase and flag stepping by keys; selection announced |
| Takes inline | `studio-next/tests/e-takes-inline.test.tsx` | Evidence per take; suggestion with confidence null until comparable |
| Delete words | `studio-next/tests/e-delete-range.test.tsx` | Backup first where the DAW changes audio; DAW first; one act; struck words kept; restore undoes it |
| FX on a range | `studio-next/tests/e-fx-range.test.tsx` | Confirmation with preview; chain from the DAW's list; marker with remove |
| Stacking | `studio-next/tests/d3-stacking.test.tsx` | Plan shown; later reads move; un-stack restores by offsets |
| Strip | `studio-next/tests/e-strip-narrow.test.tsx` | Strip at the wide width; timeline in the drawer below it |
| Backups | `studio-next/src/pages/editing/BackupsTab.tsx` | Tab only for DAWs with the capability; restore |

### Supersedes / depends on ADRs

On conflict this PRD, and the ADR written when its phase lands, is the source of truth; old ADRs stay in force for unmigrated code until then ([register](studio-next-adr-register.prd.md)).

| ADR | Class | Note |
| --- | --- | --- |
| [ADR 0234](../adr/0234-fx-chains-go-on-tracks-and-a-passage-of-a-take-gets-one-plug-in-at-a-time.md), [ADR 0705](../adr/0705-the-workspace-adds-an-effect-to-a-passage-or-a-chain-to-the-chapters-track-only-after-the-narrator-confirms-and-the-host-names-both-targets.md) | SUPERSEDE (range part) | FX on a range of words (A9) |
| [ADR 0407](../adr/0407-a-new-page-replaces-its-old-counterpart-in-the-same-change-and-the-navigation-is-grouped-by-production-stage.md) | KEEP decision 1 (DQ-2) | Editing replaces the workspace in Proof, atomically (A15) |
| [ADR 0470](../adr/0470-proof-follows-mock-04-pickup-edit-waived-are-words-over-the-stored-status-and-the-chapter-view-leads-with-its-notes.md) | EXTEND | Proof keeps notes |
| [ADR 0147](../adr/0147-retakes-on-fixed-lanes-are-chosen-by-lane-play-state-and-the-app-never-converts-takes-and-lanes.md) | SUPERSEDE (DQ-7) | Stacking follows the mock |
| [ADR 0165](../adr/0165-a-take-comparison-is-one-finding-per-group-over-its-one-span-built-from-the-saved-project-and-never-ranked.md) | SUPERSEDE (DQ-15) | Suggestion |
| [ADR 0140](../adr/0140-take-metrics-are-per-category-evidence-over-a-takes-source-range.md) | EXTEND | Per-take measurements |
| [ADR 0262](../adr/0262-cleanup-trims-are-found-by-matching-the-measured-file-to-a-live-item-and-applied-as-a-split-and-delete-inside-one-undo-block.md) | SUPERSEDE (DQ-8) | Trims hide or mute; nothing is deleted |
| [ADR 0252](../adr/0252-level-normalize-ships-without-clause-split-because-word-timing-is-not-persisted-anywhere.md) | EXTEND | Clause split using persisted word times |
| [ADR 0032](../adr/0032-analyzers-report-findings-and-never-change-audio-or-manuscript-on-their-own.md) | KEEP | Narrator-triggered, one undo step, nothing auto-applied |
| [ADR 0212](../adr/0212-the-workspace-alignment-reuses-the-coverage-results-store-and-joins-played-ranges-from-the-saved-project-on-read.md), [ADR 0242](../adr/0242-the-recording-check-writes-the-chapters-word-alignment-as-additive-lines-and-align-again-never-transcribes.md), [ADR 0265](../adr/0265-the-workspace-highlights-by-binary-search-over-timed-tokens-and-groups-consecutive-flagged-tokens-into-one-flag.md), [ADR 0520](../adr/0520-the-peaks-cache-holds-one-whole-source-entry-and-the-strip-reuses-timelines-backdrop.md) | KEEP / EXTEND | Alignment, highlighting, peaks reused |
| [ADR 0660](../adr/0660-audacitys-finding-detail-hides-reapers-take-management-instead-of-disabling-it-through-capabilitygate.md) | SUPERSEDE (DQ-18) | Audacity takes through backups |
| [ADR 0585](../adr/0585-mock-fidelity-is-a-pixel-match-at-the-mocks-own-size-and-theme-scored-by-a-tool-that-reports-and-does-not-gate.md), [ADR 0740](../adr/0740-mock-match-is-text-blind-and-a-diagnostic-and-only-the-benchmark-mocks-are-kept.md) | SUPERSEDE (DQ-1) | The Studio Next mock is the only spec; no benchmark mock exists for Editing |

## Technical Approach

**Interfaces.** `AlignmentPort.heard(req)`, `snap(t)`; `TakesPort.measure(take, prepSteps)`; `FxChainsPort.list()` (DAW's own list); `DawClient.deleteRange`, `applyFxToRange`, `removeFxFromRange`, `stackTakes`, `unstackTakes`, `hideTakes`, `splitTake`, `backupAround`, `restoreBackup`; passage map read.

**Contracts.** `editCutSchema`, `wordFxSchema`, `backupSchema` (project sidecar; additive), `passageMapSchema` (Booth), `heardSchema` (extends the stored alignment payload with offsets and `added`); goldens from Go; `wireContracts.test.ts` rows; mocks pass.

**Architecture.** `components/editing/` hosts the page; pure model files (`scriptedit.ts`, `cuts.ts`, `stacking.ts`, `takes.ts`) under `components/editing/model/` with no React; commands are journalled through the store; dialogs through the overlay service; the context menu through a provider; `ScriptDoc`, `Word` and paragraph components are memoised per paragraph.

**Test plan.** Port the mock's ten editing tests; model tests with property tests for cut time arithmetic (`studio-next/src/selectors/cuts.ts` is pure); harness tests are in the DAW PRD; visual rows for default, selection toolbar, take expansion, delete dialog, FX dialog, stack dialog, strip, drawer tabs at all viewports; aria for dialogs and the drawer; axe; a performance test.

**Rollout.** Build with no route (model, then components with stories), then one atomic swap PR (SNE-9) that adds the route and deletes the old workspace. No flag, no `studioNext` setting.

**ADRs.** A9 (with SND), A15, take suggestion, backups table.

**Trust boundaries.** New sidecar files (`cuts`, `wordfx`, `backups`) the app reads back; the bridge commands (DAW PRD); threat model rows 5 and the Audacity row.

**Risks.** Size (mitigation: 16 small slices, model first); cut arithmetic bugs (mitigation: property tests and the cut list kept in the original recording's time); owner QA of real REAPER edits (pending on #992).

## Implementation Phases

| # | Phase | Description | Status | Parallel | Depends | Est. (pw) | PRP Plan |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | ADRs and audit | A9, A15; audit of the workspace's consumers | pending | - | SN0-1 | 0.6 | - |
| 2 | Alignment port and model | `AlignmentPort`, ported pure model, tests | partial: pure model in SN-E2 (#1059); `AlignmentPort` still pending | - | 1, SNS-4 | 1.5 | - |
| 3 | Script document | `ScriptDoc`, words, selection, keys, provider menu | pending | - | 2, SNR-5 | 1.5 | - |
| 4 | Ribbon, cards, bar | Ribbon, flag cards, floating toolbar, bar | in progress (accepted words host store: [#1245](https://github.com/countrymanprime/narration-utils/issues/1245), ADR 0856); partial: bar and floating toolbar in SN-E43 (#1263); flag cards and legend in SN-E42 (#1261) | 5 | 3, SNF-5a | 1.2 | - |
| 5 | Takes inline | Evidence, suggestion, hide, split duplicates, prep steps | partial: take evidence binding and `TakesPort` in SNE-5a (#1266); the chip, sub-lines, suggestion, Keep and T keys as components with no route (#1269); the duplicate-read rule, its confirmation and the recorder and refusal paths as components with no route (#1277), the DAW half not built: no split command on the port; hide the other takes and the three prep steps, each asked first, as components with no route (#1271) | 4 | 3, SNQ-7 | 1.5 | - |
| 6 | Delete and FX on a range | Dialogs, journal, markers | in progress (cuts host store: [#1282](https://github.com/countrymanprime/narration-utils/issues/1282); word effects host store: [#1285](https://github.com/countrymanprime/narration-utils/issues/1285); ADR 0856); partial: Delete words and Mute, their question, the journalled cut and Restore as components with no route (#1283), the pad not sent: `deleteRange` takes tokens, not times; Add FX to a range of words (the DAW's own chains through `FxChainsPort`, the question, the journalled effect, the marker with Remove) as components with no route (#1287), the A/B listen and the Effects tab's cap not built | - | 3, SND-6b, SND-6c | 1.5 | - |
| 7 | Stacking | Dialog, plan, un-stack | in progress (stack record and retry mode host store: [#1290](https://github.com/countrymanprime/narration-utils/issues/1290), ADR 0858) | 6 | 5, SND-7 | 1.0 | - |
| 8 | Strip and drawer | Timeline strip, Clean up, Effects, Backups | partial: the timeline strip as a component with no route in SNE-8a (#1296); the drawer shell, its tabs by capability, the Timeline tab and the Found list as components with no route in SNE-8b (#1298); the Clean up findings section (by operation, strength levels, preview and apply) as components with no route in SN-E85 (#1299), its Apply held until the DAW has a range trim by item and time; the sections of Effects and Backups pending | - | 4, SND-8 | 1.3 | - |
| 9 | Swap | Route swap; delete the old workspace and its equivalents (script view, transport bar, waveform strip, takes panel, apply-FX dialog, editing check panel and cleanup launchers where the drawer replaces them); rows, guide, screenshots | pending | - | 4 to 8 | 0.6 | - |
| 10 | Carried over (Could) | Follow REAPER; clause split | pending | - | 9, SND-1f | 0.8 | - |

### Phase Details

- **Phase 1.** The audit lists every consumer of `ProofChapterPage` workspace parts so the swap deletes nothing still used (CLAUDE.md step 2).
- **Phase 2.** The model is moved with its tests first; nothing is rendered yet.
- **Phase 6.** Needs the two DAW commands; against the mock `DawClient` it can be built earlier but not marked complete.
- **Phase 9.** The swap PR carries the Screenshots against the Studio Next Editing page for every changed state and the redirect from the old path.

### Parallelism Notes

4 and 5 are independent after 3; 6 and 7 depend on DAW slices; 8 can start when the ribbon exists.

### Parallel-session compatibility

| Phase | Files touched | Collides with |
| --- | --- | --- |
| 2 | `components/editing/model/**` (new) | none |
| 3 | `components/editing/*`, `input/commands.catalog.ts` (rows) | Catalogue slices (add-only) |
| 5 | `internal/passagetakes`, `internal/measure` | Proof takes slices |
| 6, 7 | `DawClient` callers | DAW slices |
| 9 | `ProofChapterPage.tsx`, `App.tsx` routes, `AppShell.tsx` NAV, visual rows | Serial: navigation; Proof slices |

### Slices

| Slice | Scope | Depends on | Parallel-safe | Verification |
| --- | --- | --- | --- | --- |
| SNE-1 | Phase 1 | SN0-1 | yes | ADRs; audit comment listing each old file's consumers |
| SNE-2 | Phase 2 | SNE-1, SNS-4 | yes | Ported model tests; property tests |
| SNE-3 | Phase 3 | SNE-2, SNR-5 | yes | Ported selection and key tests |
| SNE-4 | Phase 4 | SNE-3, SNF-5a | yes | Component tests; atlas for any primitive |
| SNE-5a | Evidence and suggestion | SNE-3, SNQ-7 | yes | Ported takes tests |
| SNE-5b | Prep steps and hide | SNE-5a | yes | Same |
| SNE-5c | Duplicate-read split | SNE-5a, SND-5 | yes | Same |
| SNE-6a | Delete words | SNE-3, SND-6b | yes | Ported delete tests; owner REAPER step pending |
| SNE-6b | FX on a range | SNE-3, SND-6c | yes | Ported FX tests |
| SNE-7 | Phase 7 | SNE-5a, SND-7 | yes | Ported stacking tests |
| SNE-8a | Strip | SNE-4 | yes | Ported strip tests; visual |
| SNE-8b | Drawer tabs | SNE-4, SND-8 | yes | Visual; aria |
| SNE-9 | Phase 9 (swap; deletes the old workspace) | SNE-4..8 | no (serial: nav) | Full visual suite for the page; Screenshots |
| SNE-10 | Phase 10 (Could) | SNE-9, SND-1f | yes | Tests |

## Decisions Log

| Decision | Choice | Alternatives | Rationale |
| --- | --- | --- | --- |
| Design E (owner) | Script as the editor | A to D, F's panes | Owner ruling |
| Hide, never delete (owner) | Mute or Cuts track | Delete | Non-destructive |
| Suggest, never apply (owner) | Chip with evidence | Preselect | DQ-15 |
| Model first (proposed) | Pure model slice before UI | UI first | Parallel safety and testability |

## Research Summary

Read: the mock's editing sources and tests, the owner's rulings, the real proof and editing component lists, ADRs 0140, 0165, 0234, 0252, 0262, 0700, 0705. Not done: no measurement of rendering 10,000 words in WebView2; no REAPER run.

## Visual Spec

Mock page: Editing (`studio-next/src/pages/Editing.tsx`). There is no benchmark mock for it; the Studio Next mock is the only spec. States: default, selection, takes expanded, delete dialog, FX dialog, stack dialog, strip, each drawer tab.
