# Studio Next Editing audit (SN-E1)

**Date:** 2026-10-11. **Code audited:** `main` at `c922a81`. **Mock audited:** `docs/research/mockups/studio-next/` (`src/pages/Editing.tsx`, `src/pages/editing/`, `src/selectors/{scriptedit,cuts,stacking,takes,passagemap}.ts`, `src/providers/{alignment,takes,fxchains}.ts`). **Slice:** SN-E1 (#1038), SNE-1 of the [Script-Based Editing PRD](../prds/studio-next-script-based-editing.prd.md). SNE-9, the Editing swap, deletes this note once its tables have been acted on.

Method: files read; a relative-import graph over `apps/ui/src` (a throwaway script, not committed) cross-checked with the grep commands in [Commands](#commands); `grep` over `apps/desktop`, `integrations/reaper`, `tests/fixtures`, `docs`. The app and REAPER were not run and nothing was measured. A claim not read line by line is marked **unverified**. Policy: the Studio Next mock is the only spec (owner ruling D98, [which mocks are the spec](../operations/agent-train.md#which-mocks-are-the-spec)): an old thing with a mock equivalent is removed in the swap, one without is left. The earlier [Proof and Pickups audit](studio-next-proof-audit.md) (SN-Q1) lists the same folder from the Proof side; [Proof overlap](#proof-overlap) compares the two.

## Findings that change a slice

1. **`components/editing/` is not part of the workspace.** `EditingCheckPanel` is mounted by `production/ChapterBoard.tsx:433` and `engine/ChapterLinksTable.tsx:139`, never by `ProofChapterPage`. The drawer replaces its candidate list, not its readiness, link, source-choice and progress parts ([below](#what-the-drawer-does-not-replace)). SNE-9 must not delete the folder wholesale.
2. **ADR 0262's file-to-item matching has no production caller.** `cleanupmap.ForFile` is called only from its own tests (`grep -rn "ForFile(" apps --include=*.go`); `cleanupCandidatesIn` (`apps/desktop/bindings_cleanup.go:53`) takes the item and take GUIDs from the editing check's finding (`f.Source.ItemGUID`). The package is dead code before the swap. ADR 0262 is still `Proposed`.
3. **The alignment the Editing page reads has no confidence and no `added` flag.** `WorkspaceToken` is `{i, p, w, text, status, heard, item, start, end}` (`WorkspaceToken` in `apps/ui/src/api/contracts/workspace.ts:14`). The PRD's `AlignmentPort` ("per-word offsets, confidence and `added` flag from the stored workspace alignment") needs a wire change or a null with a reason; the same gap as SN-Q1 finding 5. SNE-2 is larger.
4. **Takes are offered per paragraph, not per word range.** `WorkspaceTakes` snaps the passage to whole paragraphs (`firstParagraph`, `lastParagraph`, `workspace.ts:149`) and `internal/passagetakes` builds candidates from that; the mock's take parts sit under a selection of words. SNE-5a is larger.
5. **Delete, stacking, backups and the passage map do not exist anywhere** in `apps`, `integrations` or `docs/reference` (`grep -rniE "deleteRange|delete_range|applyFxToRange|cut_range|fx_range|passage_?map" apps integrations docs/reference` finds only `apps/ui/src/fixtures/daw.ts`, a mock fixture). SNE-6a, SNE-7 and SNE-8b build from nothing.
6. **Several Proof-page panels have no home in either mock** ([Proof overlap](#proof-overlap), items 5 and 6). SN-Q1 says they "follow the same swap", which deletes them; D98 says an old thing without a mock equivalent is left. An owner ruling is needed before SNE-9 and SNQ-9 can both be written.
7. **The swap order matters.** `WaveformStrip.tsx` is imported by `ChapterWaveformCard.tsx` (Proof's book page) as well as by `ProofChapterPage.tsx`. If SNE-9 lands before SNQ-9, `WaveformStrip.tsx`, `waveformLayout.ts` and `peaksDecode.ts` cannot be deleted.

## Workspace file table

"Workspace" here means the files `ProofChapterPage` mounts or imports apart from the notes ([`ProofChapterPage.tsx`](../../apps/ui/src/components/proof/ProofChapterPage.tsx) lines 27-43). Paths are under `apps/ui/src/components/`. Dispositions: **Editing swap deletes**, **Proof keeps (notes or takes at a spot)**, **shared** (an importer outside the workspace and the notes). A test, story or other co-located file is deleted or kept with its subject; its name is the subject's plus `.test.ts(x)`. There are no stories in `proof/` outside `proof/inspector/` and none in `editing/`.

### The PRD's list and the page itself

| File | Type | Importers (non-test) | Tests | Disposition |
| - | - | - | - | - |
| `proof/ProofChapterPage.tsx` | component | `App.tsx:41`, mounted at `App.tsx:672` | `ProofChapterPage.test.tsx` (5 `describe`s; the last, line 401, covers the notes) | **Editing swap deletes** the workspace parts; the notes block (lines 221-259) is **Proof keeps**, so SNQ-9 moves it first or SNE-9 and SNQ-9 edit the file in turn. The Editing page is a new file, not this one |
| `proof/ScriptView.tsx` | component | `ProofChapterPage.tsx:27` | `ScriptView.test.tsx` | **Editing swap deletes** |
| `proof/TransportBar.tsx` | component | `ProofChapterPage.tsx:26` | `TransportBar.test.tsx` | **Editing swap deletes** |
| `proof/WaveformStrip.tsx` | component | `ProofChapterPage.tsx:17`, `ChapterWaveformCard.tsx` | `WaveformStrip.test.tsx` | **Editing swap deletes**, only after `ChapterWaveformCard` is gone (finding 7) |
| `proof/TakesPanel.tsx` | component | `ProofChapterPage.tsx:37` | `TakesPanel.test.tsx` | **Editing swap deletes** (Proof's takes-at-a-spot lanes are new, SNQ-7) |
| `proof/ApplyFxDialog.tsx` | component | `ProofChapterPage.tsx:1`, `ScriptView.tsx:3` (type) | `ApplyFxDialog.test.tsx` | **Editing swap deletes** |
| `proof/useChapterPlayback.ts` | hook | `ProofChapterPage.tsx:24`, `TransportBar.tsx` | `useChapterPlayback.test.tsx` | **Editing swap deletes** |
| `proof/useWorkspaceReaper.ts` | hook | `ProofChapterPage.tsx:25`, `TransportBar.tsx`, `FlagsPanel.tsx` (type) | covered by `TransportBar.test.tsx` | **Editing swap deletes** (with `FlagsPanel`) |
| `proof/tokenAtTime.ts` | helper | `ProofChapterPage.tsx:23` | `tokenAtTime.test.ts` | **Editing swap deletes**, unless SNE-2 ports the binary search ([ADR 0265](../adr/0265-the-workspace-highlights-by-binary-search-over-timed-tokens-and-groups-consecutive-flagged-tokens-into-one-flag.md)) |
| `proof/takesPassage.ts` | helper | `TakesPanel.tsx` | `takesPassage.test.ts` | **Editing swap deletes**; it imports `AuditionDialog.tsx`, which stays |

### Other files only the workspace imports

Mounted by `ProofChapterPage` or imported only by a file above. SN-Q1 lists the same names as "workspace-only"; three of them are contested ([Proof overlap](#proof-overlap)).

| File | Type | Importers (non-test) | Disposition |
| - | - | - | - |
| `proof/FlagsPanel.tsx` | component | `ProofChapterPage.tsx:28` | **Editing swap deletes** (flag cards are the mock's `FlagCard.tsx`, a new component) |
| `proof/InlineDiff.tsx` | component | `FlagsPanel.tsx` | **Editing swap deletes** |
| `proof/findingFlags.ts`, `proof/compareFlags.ts` | helpers | `ProofChapterPage.tsx` | **Editing swap deletes** (they overlay findings and compare rows on the flags); SNE-2 decides whether the model reuses the overlay |
| `proof/waveformLayout.ts`, `proof/peaksDecode.ts` | helpers | `WaveformStrip.tsx` | **Editing swap deletes** with `WaveformStrip` |
| `proof/NativeTakesPanel.tsx` | component | `ProofChapterPage.tsx:36` (notes column, line 259) | **Contested**, see Proof overlap item 4 |
| `proof/RecordingCheckCard.tsx` | component | `ProofChapterPage.tsx:40` | **Proof keeps** until SNQ-6 replaces it |
| `proof/CompareRun.tsx`, `proof/hints.ts`, `proof/leavesCompareRun.ts` | component, helpers | `ProofChapterPage.tsx:29`, `CompareRun.tsx`, `App.tsx:46` | **Contested**, Proof overlap item 5 |
| `proof/PreviewPanel.tsx`, `proof/ProofingStagePanel.tsx`, `proof/RenderAssociationSection.tsx`, `proof/useProofingRender.ts` | components, hook | `ProofChapterPage.tsx:31-32`, `ProofingStagePanel.tsx`, `RenderAssociationSection.tsx` | **Contested**, Proof overlap item 5 |

### Shared files the workspace imports

Not deleted by the swap. A file in this table may lose its only workspace importer.

| File | Other importers (non-test) | Disposition |
| - | - | - |
| `proof/playlist.ts` | `engine/useTrackPlayback.ts`, `pickups/pickupChapters.ts`, `ChapterWaveformCard.tsx` | **shared** |
| `proof/format.ts` | `engine/CreateChapterRegionsDialog.tsx`, `FlagsPanel.tsx`, `TransportBar.tsx` | **shared** |
| `proof/flags.ts` | `RecordingCheckCard.tsx`, `resolution.ts`, `ChapterWaveformCard.tsx` | **shared**; the flag grouping (`buildFlags`) is what ADR 0265 describes and SNE-2's `alignToScript` supersedes for the Editing page only |
| `proof/options.ts` | `settings/ScopedSetting.tsx`, `CompareRun.tsx` | **shared** |
| `proof/useReaperStatus.ts` | `editing/EditingCheckPanel.tsx`, `ProofPage.tsx` | **shared** |
| `proof/resolution.ts`, `proof/findingFormat.ts`, `proof/ReaperControls.tsx`, `proof/FindingDetail.tsx`, `proof/FindingsList.tsx`, `proof/NotesHeader.tsx`, `proof/NotesStrip.tsx` | the notes, `ProofPage`, and for `findingFormat.ts` also `booth/`, `master/`, `pickups/`, `editing/` | **Proof keeps (notes or takes at a spot)** |
| `proof/TakeComparisonView.tsx`, `proof/TakeComparisonDialog.tsx`, `proof/takeComparisonFormat.ts`, `proof/AuditionDialog.tsx` | `FindingDetail.tsx`, `TakeReviewReads.tsx` (Proof's take review) as well as `TakesPanel.tsx` | **Proof keeps** while Proof's detail compares takes; they leave with `TakesPanel` only if SNQ-7 and SNQ-3 drop the comparison (SN-Q1, "What SNQ-9 must keep") |
| `proof/useReadNavigation.ts`, `proof/takeReviewFormat.ts` | `TakeComparisonView.tsx`, `TakeReviewReads.tsx`, `AuditionDialog.tsx` | **Proof keeps** |

### `components/editing/`

None of these has a workspace importer. Mounts: `production/ChapterBoard.tsx:433`, `engine/ChapterLinksTable.tsx:139`.

| File | Type | Importers (non-test) | Tests | Disposition |
| - | - | - | - | - |
| `editing/EditingCheckPanel.tsx` | component (slide-over) | `ChapterBoard.tsx`, `ChapterLinksTable.tsx` | `EditingCheckPanel.test.tsx` | **shared**; the drawer replaces its candidate list only |
| `editing/EditingCandidateRow.tsx` | component | `EditingCheckPanel.tsx` | none | **shared** until the drawer's Cleanup tab replaces the list, then **Editing swap deletes** |
| `editing/CleanupAction.tsx` | component | `EditingCheckPanel.tsx` | `CleanupAction.test.tsx` | **Editing swap deletes** the silence-trim row (DQ-8); the item-gain row has no drawer equivalent (below) |
| `editing/editingCheckText.ts` | helper | `EditingCheckPanel.tsx`, `EditingCandidateRow.tsx` | `editingCheckText.test.ts` | **shared** with `EditingCheckPanel` |

#### What the drawer does not replace

The PRD says the drawer replaces these files "where the drawer replaces them" (item 10). The mock's Cleanup tab (`pages/editing/CleanupTab.tsx`, `selectors/editing.ts:123`) has five operations (gaps, breaths, clicks, plosives, noise), strength levels, a preview and an apply, over rows from Proof notes and detections. It has none of the following, so they stay on the Production board and the engine panel:

- **The per-class readiness** from the stage signals ([ADR 0266](../adr/0266-the-editing-check-panel-reads-its-per-class-state-from-srs-stage-signals-and-keeps-progress-inline-so-candidates-stay-visible-while-it-runs.md)): `EDITING_SIGNAL_ID` and the `ClassSummary` (`ClassSummary`, `EditingCheckPanel.tsx:97`).
- **The chapter-track link prompt** (`MappingFix`, `EditingCheckPanel.tsx:43`, `chapterTrackMapConfirm`).
- **The analysis source choice**, items on the track or the rendered file (`SOURCE_CHOICE_OPTIONS`, `editingSetSourceChoice`).
- **Start, progress and cancel** of the editing check job (`editingStart`, `editingState`, `editingCancel`; Go `bindings_editing.go:53-79`).
- **The processed-audio caveat** (`PROCESSED_AUDIO_CAVEAT`, `editingCheckText.ts:28`).
- **Item gain** (`CleanupAction.tsx:100`, `levelMatchPreview` / `levelMatchApply`, capability `item_gain`). The mock has no level-match operation. It stays by D98, and the drawer needs a home or an owner ruling for it.
- **Class coverage.** The repo raises three candidate classes (`silence`, `click`, `breath`; `EDITING_CLASSES`). The mock's plosives and noise operations have no host candidates; they are new work in SNE-8b.

## Host and Lua surface

"Stays (still used by SNE)" is decided from what the mock's Editing page needs; a command the mock does not use is marked removed with the reason. Verdicts are from code and tests, not from running REAPER.

### Go

| Surface | Used by | Verdict | Reason |
| - | - | - | - |
| `WorkspaceAlignment` (`bindings_coverage.go:168`), `WorkspacePeaks` (`bindings_workspace_peaks.go:48`) | `ProofChapterPage`, `ChapterWaveformCard` | stays (still used by SNE) | The Editing page reads the stored alignment (PRD, "A second alignment run" is out); peaks feed the ribbon and strip ([ADR 0520](../adr/0520-the-peaks-cache-holds-one-whole-source-entry-and-the-strip-reuses-timelines-backdrop.md)). Both also serve Proof's book page until SNQ-9 |
| `WorkspaceTakes`, `WorkspaceUseTake` (`bindings_workspace_takes.go:83`, `:125`), `internal/passagetakes` | `TakesPanel` (UI); `WorkspaceUseTake` also `ports/daw.ts:48` (`DawClient.useTake`) | stays (still used by SNE) | Inline takes (SNE-5a) and Proof's lanes (SNQ-7) need the passage's takes; `useTake` is already behind the DAW port. Paragraph snapping is the gap (finding 4) |
| `WorkspaceTakesCompareStart` (`bindings_workspace_takes.go:92`), `takecompare_job.go`, `internal/takecompare` | `TakesPanel`; `startTakeComparison` also serves Proof's finding-level comparison | stays (used elsewhere) | The suggestion's evidence (DQ-15) is built on the comparer; ADR 0165 is superseded to that extent |
| `internal/measure` ranges (`range.go` `AnalyzeFileRange`, `takemetrics.go` `MeasureTake`) | `internal/acoustic`, `internal/continuity`, `internal/editing/decode.go`, `bindings_cleanup.go`, `internal/takecompare`, `bindings_workspace_peaks.go` | stays (used elsewhere) | Per-take evidence ([ADR 0140](../adr/0140-take-metrics-are-per-category-evidence-over-a-takes-source-range.md)) |
| `WorkspaceGoTo` (`bindings_workspace.go:62`) | `useWorkspaceReaper.ts` only | stays (still used by SNE) | The mock gates a "Show in <DAW>" button on the `goto` capability (`pages/editing/EffectsTab.tsx:102`, `TakeParts.tsx:171`); the caller is rewritten behind the DAW port |
| `WorkspaceLoop` (`bindings_workspace.go:70`), `findingsStopLoop` call in `useWorkspaceReaper.ts:114` | `useWorkspaceReaper.ts` only | removed by the swap or a later slice | No loop in the mock's Editing page (a grep of `pages/Editing.tsx` and `pages/editing/` finds only `goto`); `findingsStopLoop` stays (`ReaperControls.tsx`) |
| `WorkspaceListFXChains` (`bindings_workspace.go:204`), `WorkspaceApplyFXChain` (`bindings_workspace_fx_apply.go:196`) | `ApplyFxDialog.tsx` only | stays (still used by SNE) | The mock lists the DAW's saved chains (`providers/fxchains.ts`); the chapter-track target is replaced by a range target (`fx_range`, SND-6c) |
| `WorkspaceListFX`, `WorkspaceAddTakeFX` (`bindings_workspace_fx_apply.go:164`, `:171`) | `ApplyFxDialog.tsx` only | removed by the swap or a later slice | One plug-in on a passage ([ADR 0234](../adr/0234-fx-chains-go-on-tracks-and-a-passage-of-a-take-gets-one-plug-in-at-a-time.md)); the mock offers chains only. SND-6c decides whether the plug-in path survives |
| `EditingStart/State/Cancel/Candidates/SourceChoice/SetSourceChoice` (`bindings_editing.go`), `internal/editing` | `EditingCheckPanel.tsx`, `internal/manuscript` | stays (used elsewhere) | The editing check feeds the drawer's rows and the stage engine |
| `CleanupPreview`, `CleanupApply` (`bindings_cleanup.go:151`, `:157`), `bridge.CleanupClient` (`internal/bridge/cleanup.go`) | `CleanupAction.tsx` only | removed by the swap or a later slice | Split-and-delete; DQ-8 supersedes it ([Cleanup apply path](#cleanup-apply-path-adr-0262)) |
| `internal/cleanupmap` | none (tests only) | removed by the swap or a later slice | Finding 2; the Cuts-track command may reuse its refusals |
| `LevelMatchPreview`, `LevelMatchApply` (`bindings_cleanup.go:324`, `:330`) | `CleanupAction.tsx` only | stays (used elsewhere) | No mock equivalent (D98) |
| `CleanupToolsLaunch`, `CleanupToolsState`, `internal/cleanuptools` | `engine/CleanupToolsDialog.tsx` | stays (used elsewhere) | Launches the narrator's own REAPER cleanup tools; not part of the workspace |

### Lua (`integrations/reaper/`)

| Command | File | Verdict | Reason |
| - | - | - | - |
| `set_active_take` | `narration_workspace.lua:359` | stays (still used by SNE) | "Use this take" through `DawClient.useTake`; harness `tests/workspace_test.lua` |
| `list_fx_chains`, `apply_fx_chain` | `narration_workspace.lua:362`, `:368` | stays (still used by SNE) | Chains listing for the Effects tab; the target changes with `fx_range` |
| `list_fx`, `add_take_fx` | `narration_workspace.lua:365`, `:371` | removed by the swap or a later slice | Same as the Go row |
| `preview_cleanup_markers` | `narration_cleanup_preview.lua:232` | removed by the swap or a later slice | Take markers for the old preview; the mock previews in the strip. Replacement is a SNE-8b decision |
| `apply_cleanup_trims` | `narration_cleanup_preview.lua:235` | removed by the swap or a later slice | Superseded by DQ-8 |
| `launch_cleanup_tool` | `narration_cleanup.lua:111` | stays (used elsewhere) | `CleanupToolsDialog`; `narration_cleanup.lua` holds only this command |

Each Lua command has a harness test (`tests/workspace_test.lua`, `tests/cleanup_preview_test.lua`, `tests/registry_test.lua`) and a fake in `tests/fake_reaper.lua`; a consumer of a command deleted here without a harness test would be zero coverage (`.claude/rules/reaper-bridge.md`).

### Contracts, schemas, goldens and mocks

| Binding group | Golden (`tests/fixtures/contracts/`) | UI registrations |
| - | - | - |
| `workspace*` | `workspace-alignment-{current,needs-align-again,never,stale}.json`, `workspace-peaks{,-no-source}.json`, `workspace-takes{,-none}.json`, `workspace-use-take-{done,refused,started}.json`, `workspace-go-to.json`, `workspace-loop.json`, `workspace-navigation-no-item.json`, `workspace-fx-{added,applied,chains,plugins,refused}.json` | `apps/ui/src/api/contracts/workspace.ts`, `schemas/workspace.ts`, `contractGoldens/workspace.ts`, `workspaceMock.ts`, `workspaceTakesMock.ts`, rows in `wireContracts.test.ts` (75 lines mention `workspace`) |
| `cleanup*`, `levelMatch*` | `cleanup-{apply,preview}.json`, `cleanup-tools-{idle,launched}.json`, `level-match-{apply,preview}.json` | `contracts/cleanup.ts`, `schemas/cleanup.ts`, `schemas/cleanuptools.ts` |
| `editing*` | `editing-{candidates-empty,source-choice-items,start-refused-unmapped,state-idle}.json` | `contracts/editing.ts`, `schemas/editing.ts` |

Removing a binding in the swap is a `hostAPIVersion` bump (84 at SN-Q1, 85 on `main` now: `apps/desktop/app.go:65`); the Proof swap bumps it too, so it is a serial point ([`wire-contract-change`](../../.claude/skills/wire-contract-change/SKILL.md)). The generated `wailsjs/**/host.ts` is regenerated, never edited. Trust boundary: [`threat-model.md`](../architecture/threat-model.md) rows 5h and 5l (apply FX, `set_active_take`) and 5p (the Takes panel's `WorkspaceUseTake`) are re-read, and edited if a command is removed.

### Cleanup apply path (ADR 0262)

[ADR 0262](../adr/0262-cleanup-trims-are-found-by-matching-the-measured-file-to-a-live-item-and-applied-as-a-split-and-delete-inside-one-undo-block.md) (`Proposed`) applies a trim by splitting the item at the cut's start and end and removing the middle piece with `DeleteTrackMediaItem`, all inside one undo block, leaving a gap. **Superseded by DQ-8** ([ADR register PRD](../prds/studio-next-adr-register.prd.md), row 69 and the 0262 row): trims go to the muted Cuts track and nothing is deleted. The cutover PRD lists it as removed by the Editing swap.

What the Cuts-track replacement must keep from the code that exists (`narration_cleanup_preview.lua`, `internal/bridge/cleanup.go`, `cleanupmap`):

- **Resolve by GUID, never by position.** A candidate whose item, take or cut range no longer resolves is reported stale (`CLEANUP_STALE`, reasons `item`, `take`, `range`) and skipped; it never falls back to a neighbour.
- **One call is one undo step**, and no block opens when every row is stale.
- **Source media is never rendered, trimmed or deleted.**
- **Items a call does not name keep their timeline position** (the gap is left, no ripple).
- **Order within an item:** the plan is applied by descending cut-start, because a split gives the removed piece a new GUID and keeps the original GUID on the left part.
- **Refuse an unreliable mapping:** stretch markers, or a trimmed `SECTION` source (`cleanupmap` refusals).
- **The `EDGE_TOLERANCE` rounding rule** shared with `narration_navigation.lua`.
- **Cuts-track specifics are new:** the muted track, moving the middle piece to it, and an inverse for un-hide. The undo inverse table is [`studio-next-undo-inverse-table.md`](studio-next-undo-inverse-table.md).

## Route and nav surface

| Surface | Today | What the swap does |
| - | - | - |
| Route | `App.tsx:672` `/proof/:chapterId` renders `ProofChapterPage`; `App.tsx:566` gates it on a manuscript | Add the Editing route and delete the workspace parts. Whether `/proof/:chapterId` survives as Proof's chapter view is not decided in either note (Proof overlap item 7) |
| Redirect | `/tracks/chapter/:chapterId` to `/proof/:chapterId` (`App.tsx:724`); `/tracks`, `/review`, `/proofing` to `/proof` | The PRD says the swap carries the redirect from the old path: retarget `/tracks/chapter/:chapterId` and the deep links to the Editing path |
| Deep links | `goToProofChapter` (`App.tsx:536-539`) adds `?finding=`; `?t=` seeks (`ProofChapterPage.tsx:73-82`). Callers: `ProductionPage`/`ChapterBoard.tsx:258`, `:369`, `ScriptPage` (`App.tsx:657`), `ProofPage` (`goToWorkspace`, `openChapter`), `engine/ChapterLinksTable.tsx:107` | Each caller moves with the route; `FindingDetail.tsx:219` ("Open in workspace") is Proof's button and needs a target |
| `leavesCompareRun` | `App.tsx:46`, `proof/leavesCompareRun.ts:4` match `from.startsWith('/proof/')` | Goes or moves with `CompareRun` (Proof overlap item 5) |
| NAV | `AppShell.tsx:52` `PROOF` in the Review group (`:69`); no Editing entry | Add `Editing` to the Review group ([ADR 0407](../adr/0407-a-new-page-replaces-its-old-counterpart-in-the-same-change-and-the-navigation-is-grouped-by-production-stage.md)); `NAV_COUNT_KEYS` needs no entry |
| Command catalogue | seven `workspace.*` rows in `input/commands.catalog.ts:89-110` (`play`, `word.prev`, `word.next`, `paragraph.prev`, `paragraph.next`, `flag.prev`, `flag.next`), used by `ProofChapterPage.tsx:165-171`, `main.tsx:555` (comment), `keymap.test.ts`, `findConflicts.test.ts`, `KeyboardPanel.test.tsx:155` | The PRD (item 2) turns the mock's `registerKeys` into catalogue rows. Renaming an id breaks saved user bindings (`KeyboardPanel.test.tsx` pins `workspace.paragraph.next`) |
| Visual catalogue | `tests/visual/catalog/proof-chapter.ts` (50 states: `note-selected` is Proof's, the rest the workspace and its folded panels); `drivers/proof-chapter.ts`; `app.drivers.ts:81`; `global.ts:20` (`of: 'proof-chapter/compare-toast'`); `drivers/shared.ts:160` `openProofChapter`, reused by `drivers/global.ts` and the Proof drivers | Delete the workspace states and drivers; `engine` state `editing-check-unmapped` and `production` states `editing-check-*` belong to `EditingCheckPanel` and stay |
| Aria snapshots | `tests/aria/dialogs.spec.ts`: `proof-chapter/effects-confirm` (`confirm-passage-effect.aria.yml`), `proof-chapter/takes-confirm` (`confirm-add-take-and-activate.aria.yml`), plus the two `menu-passage-effects*.aria.yml` menus | Replace with the Editing page's FX, delete, stack dialogs and drawer (PRD test plan) |
| Guide | `docs/guides/using-the-app/proof.md` "The chapter view" (line 260 on), "Adding an effect to a passage" (311), "Choosing between takes" (343), "Comparing the recording with the script" (370); `navigation.md:189` ("Open workspace") | Move to a new Editing guide page |
| Doc screenshots | 13 files `docs/images/ui/proof-chapter-*.webp`; 11 entries with `"page": "proof-chapter"` in `apps/ui/tests/visual/doc-screenshots.json` | Delete with the states; `doc-screenshot-sync` |
| Feedback catalogue | rows for `ProofChapterPage`, `TakesPanel`, `ApplyFxDialog` in `interactionFeedback/proof.ts`; `NativeTakesPanel` rows in `interactionFeedback/recording.ts`; `editing/*` rows in `interactionFeedback/editing.ts`; path-keyed rows in `interactionFeedback.catalog.ts:152-185` | Remove the keys of deleted files in the same change |
| Registries naming files | `iconImports.test.ts` (`TransportBar`, `TakesPanel`, `EditingCandidateRow`), `panelCopies.test.ts` (`WaveformStrip`), `rawNatives.test.ts` (`ScriptView`), `ports/useApiRatchet.test.ts` (`ProofChapterPage`, `TakesPanel`, `ApplyFxDialog`, `useWorkspaceReaper`, `EditingCheckPanel`, `CleanupAction`, `EditingCandidateRow`) | Remove the entries with the files |
| Generated | `docs/ui/inventory.json` and `docs/ui/atlas/` list components | Regenerate with `pnpm --dir apps/ui atlas` |
| Docs naming files | `docs/architecture/codebase-map.md:169` (`passagetakes`), `docs/architecture/reaper-bridge.md:170-176` ("The workspace's take and FX actions"), `docs/architecture/threat-model.md` rows 5h, 5l, 5p | Update in the swap |

## Mock features versus repo

Present, partial or absent is the app on `main`. The last column is the Editing slice that builds the rest.

| Mock feature | Verdict | Where | Slice |
| - | - | - | - |
| Words as the editor: read-only text, selection by word and phrase | **Partial.** Words render per token, a click seeks, Shift+click extends, a right click selects the word and opens the effect menu; no phrase selection was found. Off-screen paragraphs use `content-visibility: auto` | `ScriptView.tsx:92-101`; keys in `ProofChapterPage.tsx:165-171` | SNE-2, SNE-3 |
| Ribbon under the active line; flag cards; floating toolbar; bar | **Partial.** A whole-chapter waveform strip and a transport; flags are a list panel plus marks in the text. No per-line ribbon, no floating toolbar | `WaveformStrip.tsx`, `TransportBar.tsx`, `FlagsPanel.tsx` | SNE-4 |
| Takes inline with evidence and a suggested take | **Partial.** A panel for the passage at the playhead: A/B, choose, compare, never ranked. Per-take evidence exists host-side (`measure.MeasureTake`), but nothing suggests a take, and takes are per paragraph (finding 4) | `TakesPanel.tsx`, `internal/passagetakes`, `internal/measure/takemetrics.go` | SNE-5a |
| Prep steps: trim white space, trim breaths, normalise | **Partial.** Silence trim (split and delete) and item gain exist as cleanup actions; no breath trim as a prep step, no re-scoring | `CleanupAction.tsx` | SNE-5b |
| Hide other takes (mute, one undo) | **Absent** | none | SNE-5b |
| Duplicate reads split into takes | **Absent** | none (`recorderSetTakeLine` assigns built-in recorder takes to lines, `NativeTakesPanel.tsx`) | SNE-5c |
| Delete words and audio (`deleteRange`) | **Absent** | none | SNE-6a |
| Add FX on a range from the DAW's own chains | **Partial.** One plug-in on a passage and a chain on the chapter's track, each after a confirm | `ApplyFxDialog.tsx`, `narration_workspace.lua` | SNE-6b |
| Stack retries; un-stack | **Absent** | none | SNE-7 |
| Drawer: Clean up, Effects, Backups | **Partial.** The editing check slide-over lists silence, click and breath candidates; no Effects tab, no Backups | `EditingCheckPanel.tsx` | SNE-8b |
| Timeline strip of take lanes at 1360 px and wider | **Partial.** A single-lane waveform strip; no take lanes, no container query | `WaveformStrip.tsx` | SNE-8a |
| Passage map written by the Booth | **Absent.** Nothing writes or reads a passage map; the Editing page reads the stored alignment and uses the map where it exists (PRD, "What We're NOT Building") | none | Booth PRD, then SNE-2 |

## Proof overlap

SN-Q1's [Workspace parts](studio-next-proof-audit.md#workspace-parts) table and this note agree on every file in the PRD's list: each is deleted by SNE-9 and none is needed by Proof's notes. The disagreements and conditions:

1. **`TakesPanel.tsx` in the Proof PRD.** The [Proof and Pickups PRD](../prds/studio-next-proof-and-pickups.prd.md) (line 16) lists `TakesPanel` among Proof's repo files; this note and SN-Q1 mark it the Editing swap's. The PRD line is the odd one; Proof's lanes are new (SNQ-7).
2. **`takesPassage.ts`.** SN-Q1 calls it a "candidate" for Proof's takes lanes; its only importer is `TakesPanel.tsx`. If SNQ-7 imports it first it becomes shared and SNE-9 must not delete it.
3. **`WaveformStrip.tsx`.** SN-Q1 says SNE-9 can delete it "without touching Proof" once SNQ-9 deletes `ChapterWaveformCard`. Today the card imports it, so the claim holds only if SNQ-9 merges first (finding 7).
4. **`NativeTakesPanel.tsx`.** SN-Q1 lists it workspace-only. It is mounted in the notes column (`ProofChapterPage.tsx:259`), has its own feedback rows (`interactionFeedback/recording.ts:125-153`), and is the built-in recorder's takes list. Neither mock page shows it; the Editing PRD names the built-in recorder only for the duplicate split. Disagreement: Editing swap deletes (SN-Q1) against left as built (D98).
5. **Compare run, Preview and stage panels.** SN-Q1 lists `CompareRun`, `hints.ts`, `compareFlags.ts`, `PreviewPanel`, `ProofingStagePanel`, `RenderAssociationSection` and `useProofingRender` as workspace-only. Neither mock page mounts them: under `pages/Proof.tsx`, `pages/proof/`, `pages/Editing.tsx` and `pages/editing/` the only "compare" is the take comparison in Editing, and no stage panel or preview panel of this kind is mounted (**unverified**: Preview was matched by name only). Both PRDs are silent. D98 says leave them; their only mount is the file the two swaps delete.
6. **`RecordingCheckCard.tsx`.** SN-Q1: Proof's, replaced by SNQ-6. Agreed; it is mounted at `ProofChapterPage.tsx:258` and SNE-9 must not delete it before SNQ-6.
7. **`ProofChapterPage.tsx` itself.** Both swaps edit it (the Editing PRD's Phase 9 row names the file; SN-Q1 names the notes block). The Editing PRD says "Proof keeps notes and the takes-at-a-spot lanes" (SN0-Q2) but neither note says where Proof's chapter view lives after the swap.

Owner decisions for #992: items 4, 5 and 7, and the item gain row of the cleanup table.

## Performance question

The PRD's success metric (line 65) refers to "the old workspace's open perf question (thousands of spans in WebView2)". No source file contains that sentence. The two places that hold the question:

- [ADR 0265](../adr/0265-the-workspace-highlights-by-binary-search-over-timed-tokens-and-groups-consecutive-flagged-tokens-into-one-flag.md), decision 2: the binary search "keeps this affordable on every `timeupdate` tick for a 15,000-word chapter, a scale not measured here."
- `apps/ui/src/components/proof/ScriptView.tsx:99-101`: "Paragraphs get `content-visibility: auto` so the browser skips laying out and painting the (thousands of) words currently off-screen, a chapter's worth of virtualisation with no extra code." Whether `content-visibility` holds up in WebView2 for a chapter of this size is not recorded anywhere (**unverified**).

SNE-3's 10,000-word test answers both: the per-tick highlight lookup (`tokenAtTime.ts`) and the layout cost of one element per word. Nothing is measured here.

## Slice adjustments

- **SNE-2 larger.** The alignment has no confidence or `added` flag (finding 3); `alignToScript` is a new model, and `tokenAtTime.ts`/`flags.ts` are ported rather than imported.
- **SNE-3 mixed.** Seek, Shift+extend, play and arrow keys are true today; phrase selection and the Del, M, F, T, H keys are new. The catalogue's `workspace.*` ids need a rename plan (route table).
- **SNE-5a larger.** Takes are per paragraph (finding 4); the suggestion has no code.
- **SNE-5b larger.** Hide and breath trim are absent; only silence trim and item gain exist.
- **SNE-6b smaller than "from nothing".** Listing the DAW's chains and applying one by name is true (`list_fx_chains`, `apply_fx_chain`); the target changes from a track to a range.
- **SNE-6a, SNE-7, SNE-8b (Backups) unchanged.** Nothing exists; the Cuts-track rules above carry over.
- **SNE-8b larger.** Plosives and noise have no host candidates, and the item-gain, readiness, source-choice and link parts need a home (what the drawer does not replace).
- **SNE-9 larger.** It carries the route and redirect, nine files plus the contested ones, 50 visual states, 13 doc images, 11 doc-screenshot entries, four aria snapshots, the `hostAPIVersion` bump, the feedback and ratchet entries, and the `leavesCompareRun` guard. It waits on SNQ-9 for `WaveformStrip` (finding 7).

## Commands

```text
grep -rn "components/proof/\|components/editing/" apps/ui/src --include=*.ts --include=*.tsx | grep -v "^apps/ui/src/components/\(proof\|editing\)/"
grep -rn "workspace\." apps/ui/src/input apps/ui/src/components --include=*.ts --include=*.tsx -l
grep -rn "ForFile(" apps --include=*.go
```

The first finds path-keyed rows in `interactionFeedback.catalog.ts`, name-keyed allowlists in `iconImports.test.ts`, `panelCopies.test.ts`, `rawNatives.test.ts` and `ports/useApiRatchet.test.ts`, and `App.tsx`; it misses relative imports (`../proof/...`, `./...`), which come from the import graph. The second finds `proof/ProofChapterPage.tsx`, `proof/ProofChapterPage.test.tsx`, `proof/useWorkspaceReaper.ts` (the `workspace.` API calls), `input/commands.catalog.ts`, `input/scopes.ts` (a comment), `input/keymap.test.ts`, `input/findConflicts.test.ts` and `settings/KeyboardPanel.test.tsx`; `main.tsx` mentions `workspace.play` in a comment outside the searched directories.
