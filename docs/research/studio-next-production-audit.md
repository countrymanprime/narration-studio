# Studio Next Production audit (SN-P40)

**Date:** 2026-10-11. **Code audited:** `main` at `b0a057a`. **Mock audited:** `docs/research/mockups/studio-next/` (last change `cb613f9`). **Slice:** SN-P40 (#1136), the audit the [Production and Schedule PRD](../prds/studio-next-production-and-schedule.prd.md) asks for in Phase 8 (SNP-8). SN-P8 deletes this note once its tables have been acted on.

Method: files read, `grep` over `apps/ui/src`, `apps/ui/tests`, `apps/desktop`, `docs`, and a relative-import graph over `apps/ui` (a throwaway script, not committed) cross-checked with the grep commands in [Commands](#commands). The app and REAPER were not run. A claim read from code carries a path; a claim not read line by line is marked **unverified**. Policy: the Studio Next mock is the only spec (owner ruling D98 in [the agent train](../operations/agent-train.md#which-mocks-are-the-spec)); old things with a mock equivalent are removed in the swap, old things without one stay as built (the stage timer, PFH and the effective rate, SN0-Q4). Slice numbers: SN-P41 is the measurements port (#1138), SN-P42 its selectors (#1194), SN-P43 the figures (#1213), SN-P44 the pipeline and Next up (#1215), SN-P621 and SN-P622 the report preview and dialog (#1151, #1216).

## Findings that change a slice

1. **Deleting `ChapterBoard.tsx` strands eight features that have no mock equivalent.** The board is the only host of the chapter track slide-over, Remove from recording and its Restore list, the credits rows, the chapter status override, the editing check, the chapter-sync batch toast, the running-check percent in the Record cell and the refresh on window focus (`apps/ui/src/components/production/ChapterBoard.tsx:109-143`, `:159-163`, `:188-221`, `:350-484`). The mock's pipeline cells only navigate or toast (`docs/research/mockups/studio-next/src/state/commands/production.ts` `cellAct`), and no mock file names a chapter track, a content kind or Remove from recording. D98 keeps all eight, so SN-P44 needs a host for each. [Old behaviour to new home](#old-behaviour-to-new-home) recommends one: the mock's own row menu (`docs/research/mockups/studio-next/src/pages/production/context.ts`) plus two credits rows.
2. **The new readiness panel drops three things the old stage slide-over has.** `ReadinessPanel` takes only `recommendation`, `seen`, `phase`, `error`, `isPending`, `onDecide` and `onCheckNow` (`apps/ui/src/components/production/readiness/ReadinessPanel.tsx:11-20`). The old `StageEvidence` call in `ChapterBoard.tsx:374-430` also passes the chapter status Select, the "Recording check: …" status line (`chapterCheckStatus`) and the Recording check and Editing check buttons. After the swap the only entry to a chapter's editing check from Production is whatever SN-P44 adds, and `chapterCheckStatus.ts` has no reader.
3. **The mock's Next up is a different list from the host's.** The mock lists up to four task items (`rec`, `pick`, `fail`, `flags`) ranked by work-hours at risk (`docs/research/mockups/studio-next/src/selectors/nextup.ts`). The host lists up to five chapters ranked by held-back readiness, then stage (`apps/desktop/internal/production/overview.go:16-17`, `:163-195`; ADR 0404). Only `rec` has a source in the overview (the mock takes the first chapter with a recorded share between 0 and 100, `selectors/chapters.ts` `recordingChapterOf`; the real equivalent is the first chapter whose `status` is `recording`). `pick` reads `PickupsState.remaining`, which exists only after REAPER counted (`apps/ui/src/api/contracts/pickups.ts:25-30`). `fail` needs Master's per-file verdicts, which `ProductionOverview` does not carry. `flags` (chapters changed by a new manuscript) has no wire field anywhere (`grep -rniE "textChanged|ChapterFlag" apps/ui/src/api/contracts` finds nothing). SN-P44 is larger than its title says: it either builds `nextUp` over three other stores in the UI or adds host work.
4. **The effective rate and the contracted amount now disagree about what the stored number is.** The Schedule labels it "Rate per finished hour" and values the contract as rate × words ÷ 9,300 (`apps/ui/src/components/schedule/ContractPanel.tsx:53`, `schedule/payment.ts` `contractValue`). The Production figure, the report and the host divide the same stored number by hours logged (`apps/desktop/internal/production/pfh.go:72-86`, `apps/ui/src/components/production/ProductionPage.tsx:34`, `apps/desktop/internal/productionreport/report.go` `rateOf`). Both cannot be right; ADR 0320 keeps the effective rate untouched and ADR 0800 does not say which one the amount is. Owner question 1.
5. **The new page has no place for the timer figures.** The mock KPI row is Finished audio, Recording left, Editing + proof left, Open pickups, Delivery check, Due (`docs/research/mockups/studio-next/src/pages/Production.tsx:89-96`). The real row has Work time logged, Hours per finished hour and Effective rate (`ProductionPage.tsx:47-58`), which D98 keeps. SN-P43 must draw them somewhere the mock does not. Owner question 2.
6. **`RecordingCheck` cannot go in SNP-8, and the swap's dependency list omits the slice that replaces it.** The mock's equivalent is the Check recordings dialog (`docs/research/mockups/studio-next/src/pages/pickups/CheckRecordings.tsx`, opened by `modals.checkRecordings`), which the [Proof PRD](../prds/studio-next-proof-and-pickups.prd.md) builds in SNQ-6. Until then `RecordingCheck.tsx` has two other users: `proof/ProofChapterPage.tsx:9` (until the Editing swap SNE-9 deletes that page's workspace) and the credits rows, whose check reuses it through a synthetic chapter (ADR 0495; `recordingCheckText.ts` `creditsCheckChapter`). SNP-8's Depends column reads `SNP-3..7`; it must also wait for SNQ-6, or leave `RecordingCheck`, `RecordingCheckReport`, `TakeReviewPickups` and `PickupListCount` alone.
7. **`recordingCheckText.ts` is a shared module, not a page part.** Seven files outside the folder import it (`editing/EditingCheckPanel.tsx`, `proof/{PreviewPanel,ProofChapterPage,RecordingCheckCard,RenderAssociationSection}.tsx`, `stages/{StageEvidence.tsx,stageText.ts}`), and the new `readiness/ReadinessPanel.tsx:8` imports `formatWhen` from it. It imports a type from `useCreditsRows.ts`, so `useCreditsRows.ts` is not deletable while the text module keeps `creditsCheckKind`.
8. **Three of the report's differences are decisions, not gaps.** The mock writes one chosen format and offers seven section toggles; the host always writes both files and has one toggle. See [Status report gap](#status-report-gap). SN-P621 and SN-P622 should not add the host toggles without an owner ruling (owner question 3).
9. **Per-chapter pipeline cells for Prep, Pickups, Master and QC have no host field.** [Pipeline cells](#pipeline-cells-from-real-data) lists each column's source or the reason it shows a dash. SN-P44 must not draw a percent for Record, Edit or Proof: the overview has a stage status per chapter and no fraction.
10. **Both Studio Next pieces already merged are unmounted, and a third is missing.** `schedule/*` and `production/readiness/*` have no importer outside their own folders. The mock's Recorded vs plan chart and Target pace popover (`pages/production/ProgressChart.tsx`, `TargetInfo.tsx`) have no real file at all; `apps/ui/src/components/primitives/` has `Popover` and `StatStrip` and no chart primitive. See [Built and not mounted](#built-and-not-mounted).

## Verdict per file

Every file under `apps/ui/src/components/production/` (49 files, including `readiness/`). "Importers" are non-test importers outside the file's own folder unless the cell says "inside". A test or story file sits in the row of the file it covers. Paths in the first column are under `apps/ui/src/components/production/`.

| File | Verdict | Importers | Tests and stories |
| - | - | - | - |
| `ProductionPage.tsx` | **swap deletes** (mock equivalent: `docs/research/mockups/studio-next/src/pages/Production.tsx`) | `apps/ui/src/App.tsx:48`, mounted at `:639` | `ProductionPage.test.tsx` |
| `ChapterBoard.tsx` | **swap deletes** (mock equivalent: `.../pages/production/PipelineTable.tsx`), after the eight features it hosts have a new host (finding 1) | `ProductionPage.tsx` (inside); `stages/StagePanel.test.tsx:15` mounts it | `ChapterBoard.test.tsx`; `RecordingCheck.test.tsx` also mounts it; `stages/StagePanel.test.tsx` |
| `PlanPanel.tsx` | **swap deletes** (mock equivalent: `.../pages/Schedule.tsx`; the real `schedule/SchedulePage.tsx` is built, unrouted) | `ProductionPage.tsx` (inside) | `PlanPanel.test.tsx`; `ACX_CHECKPOINT` (exported) is read only by `PlanPanel.tsx` and its test |
| `StatusReportPanel.tsx` | **swap deletes** (mock equivalent: `.../pages/production/ReportDialog.tsx`; SN-P622 builds it) | `ProductionPage.tsx` (inside) | `StatusReportPanel.test.tsx` |
| `productionFormat.ts` | **stays, cut down**: keep `formatClock`, `formatLength`, `formatPfh`, `formatRate`, `stageHoursHint` for the timer figures (finding 5); delete `BOARD_COLUMNS`, `boardCell`, `creditsCell`, `isCurrentStage` with the board (unless credits rows keep `creditsCell`), `nextUpLine` with the old Next up, `deadlineFigure` and `deliveryDue` (the Schedule's `progress.ts` and `dates.ts` replace them) | `ChapterBoard.tsx`, `CreditsRowPanel.tsx`, `ProductionPage.tsx` (inside) | `productionFormat.test.ts` (cut with it) |
| `ChapterTrackPanel.tsx` | **stays (no mock equivalent: the mock has no chapter-track link, unlink or choose-a-track view)**; its host moves from the board to the new row menu | `ChapterBoard.tsx` (inside) | `ChapterTrackPanel.test.tsx` |
| `chapterTrackButtonState.ts` | **stays** with `ChapterTrackPanel.tsx` | `ChapterTrackPanel.tsx`, `chapterCheckStatus.ts` (inside) | `chapterTrackButtonState.test.ts` |
| `RemoveFromRecordingDialog.tsx` | **stays (no mock equivalent: the mock cannot reclassify a chapter)** | `ChapterTrackPanel.tsx` (inside) | `RemoveFromRecordingDialog.test.tsx` |
| `RemovedFromRecordingList.tsx` | **stays (no mock equivalent)**; host moves from the board to the new page body | `ChapterBoard.tsx` (inside) | `RemovedFromRecordingList.test.tsx` |
| `chapterRemovalText.ts` | **stays** with the list | `RemovedFromRecordingList.tsx` (inside) | `chapterRemovalText.test.ts` |
| `CreditsRowPanel.tsx` | **stays (no mock equivalent: no mock file draws opening or closing credits on Production)** | `ChapterBoard.tsx` (inside) | none of its own (covered through `ChapterBoard.test.tsx`) |
| `useCreditsRows.ts` | **stays**; `recordingCheckText.ts` and `CreditsRowPanel.tsx` import its types | `ChapterBoard.tsx`, `CreditsRowPanel.tsx`, `recordingCheckText.ts` (inside) | none of its own |
| `RecordingCheck.tsx` | **stays until SNQ-6** (finding 6); then **swap deletes** (mock equivalent: `.../pages/pickups/CheckRecordings.tsx`) except for the credits check, which needs a ruling | `proof/ProofChapterPage.tsx:9`; `ChapterBoard.tsx` (inside) | `RecordingCheck.test.tsx` |
| `RecordingCheckReport.tsx` | **stays** with `RecordingCheck.tsx` | `RecordingCheck.tsx` (inside) | `RecordingCheckReport.test.tsx` |
| `TakeReviewPickups.tsx` | **stays** with the report; no mock Production file shows repeated reads | `RecordingCheckReport.tsx` (inside) | none of its own |
| `PickupListCount.tsx` | **stays** with the report | `RecordingCheckReport.tsx` (inside) | none of its own |
| `recordingCheckText.ts` | **stays in place** (7 outside importers and `readiness/`, finding 7) | `editing/EditingCheckPanel.tsx`, `proof/{PreviewPanel,ProofChapterPage,RecordingCheckCard,RenderAssociationSection}.tsx`, `stages/{StageEvidence.tsx,stageText.ts}`; `ChapterBoard.tsx`, `ChapterTrackPanel.tsx`, `RecordingCheck.tsx`, `RecordingCheckReport.tsx`, `readiness/ReadinessPanel.tsx` (inside) | `recordingCheckText.test.ts` |
| `chapterCheckStatus.ts` | **swap deletes** with the status line it feeds (`ChapterBoard.tsx:275-290`); the mock's Recording check card counts current, out of date and not checked from `ChapterSyncState.chapters[].freshness` instead (SN-P43) | `ChapterBoard.tsx` (inside) | `chapterCheckStatus.test.ts` |
| `chapterSyncToastText.ts` | **stays (no mock equivalent)**; the toast effect moves out of the board | `ChapterBoard.tsx` (inside) | `chapterSyncToastText.test.ts` |
| `ManuscriptImport.tsx` | **stays (see finding below)**: the mock's `ImportFlow.tsx` is a three-step dialog, the real flow is the grouped review with the Story Bible build, and Settings mounts the same hook | `settings/ManuscriptSection.tsx:3`; `ProductionPage.tsx` (inside) | `ManuscriptImport.test.tsx`; `settings/ManuscriptSection.test.tsx:96` asserts this file is the only caller of the import bindings |
| `ImportReview.tsx` | **stays** with the hook | `ManuscriptImport.tsx` (inside) | `ImportReview.test.tsx` |
| `importReviewModel.ts` | **stays** with the hook | `ImportReview.tsx`, `ManuscriptImport.tsx` (inside) | `importReviewModel.test.ts` |
| `readiness/ReadinessChip.tsx` | **stays (new)**; SN-P44 mounts it | none outside `readiness/` | `ReadinessChip.stories.tsx`; `ReadinessPanel.test.tsx` |
| `readiness/ReadinessPanel.tsx` | **stays (new)** | `readiness/openReadiness.tsx` (inside) | `ReadinessPanel.stories.tsx`, `ReadinessPanel.test.tsx` |
| `readiness/openReadiness.tsx` | **stays (new)**; opens the panel through the overlay service | none outside `readiness/` | `ReadinessPanel.test.tsx` |
| `readiness/verdict.ts` | **stays (new)** | `readiness/{ReadinessChip,ReadinessPanel}.tsx` (inside) | `verdict.test.ts` |
| `readiness/readinessFixtures.ts` | **stays (new)** | stories and `verdict.test.ts` (inside) | n/a |

On the import flow (`ManuscriptImport.tsx`, `ImportReview.tsx`, `importReviewModel.ts`): D98 would delete it, but two things argue against. Settings' Replace manuscript uses the same hook on purpose (`settings/ManuscriptSection.tsx` header comment, SNM-2), and the [Master PRD](../prds/studio-next-master-delivery-and-settings.prd.md) row SNM-Q1 adds the delivery profile to the import review as the mock's `ImportFlow.tsx` does, which treats the real review as the thing to extend. Recommendation (D22): keep it; SN-P44 calls `useManuscriptImport` for the empty state as `ProductionPage.tsx:163` does, and the mock's three-step dialog is not built. Not asked of the owner unless they want the three-step dialog.

Folder layout after the swap: `readiness/`, `measured/` (SN-P42), the stays above. No move is needed; the folder survives, and moving `ManuscriptImport` or `recordingCheckText` would touch the registries in [Registries and rows](#registries-and-rows) for no gain.

## Old behaviour to new home

For each behaviour of the old page the mock page does not draw. "Recommendation" applies under D22/D64/D65 unless the owner rules otherwise. Rows marked **#992** are also in [Owner questions](#owner-questions).

| Old behaviour | Where it lives after the swap | Recommendation |
| - | - | - |
| Start timer on a Next up item (`ProductionPage.tsx:114-126`, `productionStartTimer`) | New Next up | Keep a small Start timer button on each Next up item that names a chapter (`rec`). The mock's items have one action button; the second is the only addition. Hidden while a timer runs, as now. |
| Stop timer in the header (`ProductionPage.tsx:270-274`) | New header, beside Export and Start session | Keep as is. The mock's primary button is Start session (opens the Booth); Stop timer shows only while a timer runs, so the default header is the mock's. |
| Timer chip feed: `onOverview` → `runningTimerOf` → `AppShell` (`ProductionPage.tsx:158`, `App.tsx:178-191`, `components/layout/TimerChip.tsx:13`, `AppShell.tsx:304`) | `App.tsx` keeps its own read of `productionOverview` for the chip (it already reads once per manuscript, `App.tsx:182-193`); the new page keeps calling `onOverview` after it reads | Keep both. The chip must stay current after Start and Stop, which only the page triggers. |
| Timer figures: Work time logged, Hours per finished hour, Effective rate (`ProductionPage.tsx:47-58`) | A strip of three under the KPI row, drawn only when time is logged or a timer runs | **#992** (lost-feature candidate). Hidden when empty, the page is the mock's. |
| Credits rows and their slide-over (`ChapterBoard.tsx:225-229`, `:470-484`) | Opening credits as the first pipeline row, Closing credits as the last, as now | Keep. They are D98 "no equivalent". Their check keeps `RecordingCheck` alive (finding 6). **#992** only if the owner would rather drop credits rows. |
| Reclassify a chapter and Remove from recording (`ChapterTrackPanel.tsx`, `RemoveFromRecordingDialog.tsx`, `ChapterBoard.tsx:188-209`) | Row menu item "Chapter track…" opens the same slide-over | Keep. |
| Restore list of removed chapters (`ChapterBoard.tsx:350`) | A panel under the pipeline, as now | Keep. |
| Chapter status override (`ChapterBoard.tsx:400-405`, `manuscriptSetChapterStatus`) | Row menu item "Set status…" | **#992** (lost-feature candidate: the new readiness panel has no override, finding 2). Recommended: keep. |
| Recording check slide-over from the Record cell (`ChapterBoard.tsx:256`, `:358-370`) | Row menu item "Recording check…" until SNQ-6; then the Check recordings dialog replaces it (finding 6) | Keep the menu item; the Record cell opens the Booth as the mock's does (`cellAct` `booth:`). |
| Editing check from the Edit cell (`ChapterBoard.tsx:257`, `:433-442`) | Row menu item "Editing check…". `engine/ChapterLinksTable.tsx` keeps its own mount | Keep. |
| Manuscript import, Choose another file, import dialogs, credits banner (`ProductionPage.tsx:163-164`, `:277-278`, `:279-286`) | The mock's NoManuscript block calls the same hook; Choose another file stays only in Settings (`ManuscriptSection.tsx`) as the mock's header has none; the credits banner stays under the header | Keep the hook. Dropping the header's Choose another file is the mock's layout. |
| Chapter-sync batch toast with Undo (`ChapterBoard.tsx:115-136`, `useChapterSync`, `chapterSyncToastText.ts`) | An effect in the new page, not the table | Keep. The consent dialog is `engine/ChapterSyncConsentDialog.tsx` and is not part of the board. |
| Running-check percent in the Record cell (`ChapterBoard.tsx:240-243`) | The new Record cell reads `api.subscribeCoverage` and `ChapterSyncState.chapters[].checking` the same way | Keep. |
| Refresh on window focus (`ChapterBoard.tsx:159`, `useRefreshOnFocus`) | An effect in the new page | Keep; `proof/ProofingStagePanel.tsx:5` also uses it. |
| `PickupListCount` ("Pickup list: N open, project-wide") and `TakeReviewPickups` ("Repeated reads (Proof)") | Stay inside `RecordingCheckReport.tsx`, which is reached from the recording check | Keep until SNQ-6 decides the report (finding 6). The mock's Open pickups KPI counts the same markers (`PickupsState.remaining`). |
| Stage suggestion chips over the board (`StageSummaryChips`, `StageCheckLine`) | Gone: the mock has the readiness chip on each current-stage cell and no summary | Swap deletes (mock equivalent: `ReadinessChip` in `PipelineTable.tsx`). `stages/StageSummary.tsx` has no other importer and goes with the board. |
| `StageEvidence` slide-over | `openReadiness` | Swap deletes the Production use. `stages/StageEvidence.tsx` stays while `proof/ProofingStagePanel.tsx:7` imports it. |
| "About these figures" tooltip beside the subtitle (`ProductionPage.tsx:251-255`) | None | Swap deletes. The mock's figures carry their own `title` text. |
| Dash-with-reason figures (ADR 0320: "—" and why) | `Measured<T>` and the reasons in SN-P41/P42 | Keep the rule; the dash text becomes "not measured yet". |

## Consumers

### Commands

Run from the repo root on `main` at `b0a057a`.

```text
grep -rn "components/production/" apps/ui/src --include=*.ts --include=*.tsx | grep -v "^apps/ui/src/components/production/"
```

78 lines: `App.tsx:48` (1), `iconImports.test.ts:37-38` (2), `settings/ManuscriptSection.test.tsx:96` (1), `mapping/MappingConfirm.tsx:26` (a comment), `paletteContrast.test.ts:390` (1), `ports/useApiRatchet.test.ts:56-63` and `:161-168` (16), `rawNatives.test.ts:25` (1, the new `readiness/ReadinessChip.tsx`), and 55 path-keyed rows in `interactionFeedback.catalog.ts` (4), `interactionFeedback/credits.ts` (1) and `interactionFeedback/production.ts` (50). The grep misses relative imports (`../production/…`), so the importers below also come from the relative-import graph over `apps/ui`.

```text
grep -rln "ProductionPage\|ChapterBoard\|PlanPanel\|StatusReportPanel" apps/ui/tests docs --include=*.ts --include=*.json --include=*.md
```

24 files: `docs/prds/studio-next-production-and-schedule.prd.md`, `docs/prds/studio-next-domain-state-and-contracts.prd.md`, `docs/research/studio-next-editing-audit.md`, `docs/research/mockups/studio-next/research/repo-compare-workflow.md`, `docs/architecture/stage-recommendations.md`, `docs/ui/inventory.json`, 13 generated `docs/ui/atlas/*.md` (primitives that `ProductionPage` and `ChapterBoard` use), and ADRs 0495, 0605, 0615, 0616, 0640. `apps/ui/tests` has no hit by these four names.

### Outside importers of the deleted files

| Deleted file | Importers outside the folder | Action |
| - | - | - |
| `ProductionPage.tsx` | `App.tsx:48`, `:639`; `ports/useApiRatchet.test.ts:60`, `:165` | Replace the import and mount; drop both ratchet rows |
| `ChapterBoard.tsx` | `stages/StagePanel.test.tsx:15` (its subject is "the stage suggestions on the Production board"); `iconImports.test.ts:37`; `useApiRatchet.test.ts:56`, `:161`; `chapterNameFormatting.test.ts:31`; comments in `proof/ProofingStagePanel.tsx:31` | Re-host `StagePanel.test.tsx` on the new table with `readiness/`; drop the three allowlist rows; reword the comment |
| `PlanPanel.tsx` | `useApiRatchet.test.ts:59`, `:164` | Drop both rows |
| `StatusReportPanel.tsx` | `useApiRatchet.test.ts:63`, `:168` | Drop both rows |
| `chapterCheckStatus.ts` | none | Delete with the board |

Importers of the files that stay and are read from outside: `ManuscriptImport.tsx` ← `settings/ManuscriptSection.tsx:3` (`useManuscriptImport`); `RecordingCheck.tsx` ← `proof/ProofChapterPage.tsx:9`; `recordingCheckText.ts` ← seven files (finding 7). Also named in comments only: `mapping/MappingConfirm.tsx:26`, `api/mockHost/chapterTracks.ts:160`, `primitives/StatTile.tsx:17`. Exports used elsewhere: none from `ProductionPage`, `ChapterBoard`, `PlanPanel`, `StatusReportPanel`.

Allowlists that name stays and are untouched by the swap: `iconImports.test.ts:38` and `paletteContrast.test.ts:390` (`ChapterTrackPanel.tsx`), `chapterNameFormatting.test.ts:17`, `:35` (`importReviewModel.ts`, `ImportReview.tsx`), `useApiRatchet.test.ts:57-58`, `:61-62` (`ChapterTrackPanel`, `ManuscriptImport`, `RecordingCheck`, `RecordingCheckReport`).

## Registries and rows

| Registry | What names the old page | Swap change |
| - | - | - |
| `apps/ui/tests/visual/catalog/production.ts` | 61 rows. Page body (13): `no-data`, `on-pace`, `mock-fidelity-01`, `at-risk`, `plan`, `status-report`, `no-manuscript`, `info-tooltip`, `chapter-removed-list`, `chapter-track-no-project`, `stage-summary-chips`, `stage-dismissed`, `stage-error`. Page banners (4): `live-updates-degraded`, `daw-not-linked`, `chapter-sync-consent`, `chapter-sync-toast-undo`. Opened from a board cell or panel (44): `chapter-track-panel-{linked,ambiguous,missing}`, `chapter-remove-confirm`, `recording-check-*` (10), `stage-evidence-*` (4), `editing-check-*` (10), `credits-panel`, `credits-panel-not-set-up`, `import-*` (10), `manuscript-candidate-offer`, `credits-setup-*` (3) | Rewrite the 13 body rows to the mock page, delete `plan`, `stage-summary-chips`, `stage-dismissed`, `stage-error`, `info-tooltip`, `status-report` (replaced by Schedule and report-dialog rows). The 44 rows keep their names; their drivers change |
| `apps/ui/tests/visual/drivers/production.ts` | 388 lines of drivers for the above | Rewrite; `status-report` clicks "Production actions" › Export status report and expects a slide-over named Status report (`:44-46`); `plan` drives the Delivery plan region (`:37-40`) |
| `apps/ui/tests/visual/drivers/shared.ts` | `PAGE_CONTENT.Production` waits for the grid named "Chapter pipeline" (`:93`); `openProduction` (`:241-247`); `BOARD_COLUMN`, `clickBoardCell`, `openStageEvidence`, `openStageSuggestions`, `openRecordingCheck` (`:369-460`): 19 matching lines | Every page that starts at `/` waits on this grid, so the new table's accessible name decides whether 61 production rows, 35 `engine` rows (`catalog/engine.ts`) and 6 shell drivers (`drivers/shell.ts:31-63`) still load. Keep the name "Chapter pipeline" or change `PAGE_CONTENT` in the same PR |
| `apps/ui/tests/visual/catalog/engine.ts` | 35 rows open the engine panel over the Production home | Ride on the `shared.ts` row above |
| `apps/ui/tests/visual/catalog/global.ts` | `:12` `sameAs production/info-tooltip`; `:43` `sameAs production/no-data` | Repoint if `info-tooltip` is deleted |
| `apps/ui/tests/visual/state-catalog.ts`, `app.drivers.ts` | `:12` and `:37` import `productionStates`; `:13` and `:84` import `productionDrivers` | No change |
| `apps/ui/tests/visual/axe-debt.ts:19` | `production/info-tooltip` declares `aria-hidden-focus`, `region` | Delete the entry with the row |
| `apps/ui/tests/visual/mock-match/mocks.ts:43` | `01-production-home.webp` → `production/mock-fidelity-01` (benchmark mock 01) | D98 retires the benchmark target; point it at the Studio Next page or drop the row |
| `apps/ui/tests/aria/dialogs.spec.ts` | 11 uses: `import-confirm` (`:15`, `:169`, `:185`), `recording-check-incomplete` (`:39`), `stage-evidence-recommended` (`:54`, `:214`), `chapter-track-panel-linked` (`:64`), `chapter-remove-confirm` (`:69`), `credits-setup-dialog` (`:74`), `info-tooltip` (`:161`), `stage-evidence-unknown` (`:202`) | `stage-evidence-*` becomes the readiness slide-over (new snapshot); `info-tooltip` goes with its row; the rest stay |
| `apps/ui/tests/aria/snapshots/` | `slide-over-stage-evidence`, `slide-over-chapter-track`, `slide-over-recording-check`, `confirm-remove-from-recording`, `confirm-import-manuscript`, `dialog-credits-setup`, `info-tooltip` | Rewrite `slide-over-stage-evidence`; delete `info-tooltip` |
| `apps/ui/tests/visual/doc-screenshots.json` | 9 entries with `page: production`: `no-data` (named `nav-sidebar-desktop`), `on-pace` (`production-home`), `recording-check-incomplete`, `stage-summary-chips`, `stage-evidence-recommended`, `stage-evidence-changed`, `import-confirm`, `manuscript-candidate-offer`, `import-activity-log` | Re-point `production-stage-suggestions` (its row is deleted); regenerate `production-home`, `production-stage-evidence`, `production-stage-evidence-changed` |
| `docs/images/ui/production-*.webp` | 8 files: `home`, `import-activity`, `import-confirm`, `manuscript-offer`, `recording-check`, `stage-evidence`, `stage-evidence-changed`, `stage-suggestions` | Delete `production-stage-suggestions.webp`; regenerate the other three named above; `doc-screenshot-sync` |
| `docs/guides/using-the-app/production.md` (309 lines) | Sections The figures (`:26`), The stage timer (`:40`), Next up (`:48`), Chapter pipeline (`:56`, with A chapter's track `:83`, The credits rows `:105`), Checking a chapter's recording (`:118`), Stage suggestions (`:176`), Delivery plan (`:221`), Status report (`:233`), Importing the manuscript (`:245`) | Rewrite The figures, Next up, Chapter pipeline, Stage suggestions; move Delivery plan to a Schedule guide; Status report becomes the dialog; the rest stay. Linked from `README.md`, `navigation.md`, `booth.md`, `script.md`, `settings.md`, `proof.md`, `getting-started.md` in the same folder |
| `docs/architecture/codebase-map.md:163-164` | `production` and `productionreport` entries; `:163` ends "the page is `apps/ui/src/components/production/`" | The folder stays; no edit unless the swap adds `measured/` |
| `docs/architecture/stage-recommendations.md:197` | "wired into `components/production/ChapterBoard.tsx`" | Reword to the new table |
| `docs/architecture/{import-review,story-bible-concurrent-build,import-settings-workflow}.md` | Name `ManuscriptImport.tsx`, `ImportReview.tsx`, `importReviewModel.ts` | No change: those files stay |
| `docs/utilities/tracks.md:31` | Names `chapterTrackButtonState.ts` | No change: it stays |
| `docs/research/studio-next-editing-audit.md:9`, `:68`, `:72`, `:155` | Name `production/ChapterBoard.tsx:433` (the editing check mount) and `ChapterBoard.tsx:258`, `:369` (the Proof deep links) | The editing audit's claim that SNE-9 must not delete `components/editing/` still holds; the second mount (`engine/ChapterLinksTable.tsx`) is unchanged |
| Generated: `docs/ui/inventory.json`, 13 files under `docs/ui/atlas/` | Component lists | Regenerate with `pnpm --dir apps/ui docs:atlas` after the swap (not run here) |
| ADRs 0495, 0605, 0615, 0616, 0640 | Name `ChapterBoard`, `ProductionPage`, `StatusReportPanel` | History; not edited. The SN-P1 ADR names what supersedes them |

## Pipeline cells from real data

The mock's `vals(data, c)` returns `rec`, `edit` and `proof` as stored percents on the chapter fixture (`docs/research/mockups/studio-next/src/selectors/progress.ts`); only `proof` is derived (from notes, capped at 99 with an open pickup). The real overview has per chapter: `status`, `wordCount`, `recordedSeconds` or `recordedUnavailable`, `hoursLogged`, `pfh`, and `readiness` (`verdict`, `target`, `reason`) (`apps/ui/src/api/contracts/production.ts` `ProductionChapter`). No field is a fraction of a stage. SN-P44 draws what a field supports and a dash with its reason otherwise (ADR 0015).

| Column | Mock shows | Real field | Shows where the field is missing |
| - | - | - | - |
| Chapter | Label and title; a "Text changed" pill | `title`, `subtitle`, `contentKind` (`chapterName`) | No pill: no `flag` field exists on the wire (finding 3) |
| Fin. | `hm(words ÷ WPH)` | `wordCount` ÷ `WPH` (9,300, `schedule/estimates.ts`) | A word count of 0 reads "—". It is an estimate and the column tip says so; the measured length is `recordedSeconds` (next row) |
| Prep | Tick, half or empty circle | None. `productionFormat.ts` says Prep has "no per-chapter producer yet" | "—", tip "Not measured yet" |
| Record | Tick at 100, percent under way, dash | `status` against the stage order: a tick when `status` is past `recording`; the running percent from `api.subscribeCoverage` while a check runs on the chapter; otherwise the readiness label ("Ready", "Not ready", "Not checked", "In progress" from `readiness.verdict`) as `boardCell` does today. The tip carries `recordedSeconds` (`formatLength`) or the `recordedUnavailable` reason (`No track`, `2+ tracks`, `Track missing`, `No project`) | A dash for a chapter not started |
| Edit | Same | Same rule with `editing` | Same |
| Proof | Same, from notes cleared | Same rule with `proofing`. The note counts are book-wide (`FindingsSummary.decided`, `cleared`, `total`, `apps/ui/src/components/proof/proof.selectors.ts` `proofProgress`); a per-chapter count would need `findingsList` filtered by chapter | A dash with no tip percent; never a derived percent |
| Pickups | Count of open pickups once recorded | None per chapter. `PickupsState.remaining` is project-wide, and `pickups/pickupChapters.ts` `chaptersAtPosition` returns every chapter whose track covers a marker, never one | "—", tip "Pickups are counted for the whole project" |
| Master | Tick when the chapter is master-checked | None. `productionFormat.ts` says Delivery has "a delivery check tied to a chapter's file" with no producer | "—" |
| QC | PASS or the failing limits | None per chapter on the wire (Master's per-file verdicts are in `master/fileVerdict.ts`) | "—" |

Readiness chip: the mock puts it on the cell of the chapter's current stage (`PipelineTable.tsx` `wrap`). The real one is `readiness/ReadinessChip.tsx`, taking a `StageChapterRecommendation` from `useStageRecommendations`; `ProductionChapter.readiness` is not enough for it (it lacks the basis the panel sends to Confirm).

## Measurement sources

For SN-P41. The mock's `MeasurementProvider` (`docs/research/mockups/studio-next/src/providers/measurements.ts`) answers `Measured<T>` for four methods.

| Method | Host source | Notes |
| - | - | - |
| `roomTone(mic)` | **No host source.** `RecorderDevice` is `{name}` and `RecorderLevel` is a live `{peak, rms}` event while metering (`apps/ui/src/api/contracts/recording.ts`); nothing stores a room-tone reading per microphone. `credits_room_tone_seconds` is a length of silence in the credits (`apps/desktop/app.go:1427`), and `proofing.delivery.noise_floor_dbfs` is a delivery check on a rendered file (`apps/desktop/app.go:1526`) | Reason: "No room tone has been recorded for this microphone." |
| `takeLog()` | **Built-in recorder only:** `RecorderState.takes[].recordedAt` (the file's modification time, Unix ms) and `.seconds` | Three limits. It lists every take file, so a re-recorded line counts twice (the mock's entries are "finished audio added"); `keeper` marks the narrator's choice but not every take has a line. `recordedAt` is a file time, which a copy changes. With the REAPER engine (`engine: 'daw'`) there is no take log: reason "Takes recorded in REAPER are not logged by day." SN-P41 should count `seconds` as recorded time, not finished audio, and say so in the chart label |
| `pickupSessionSeconds(ids)` | **No host source.** A pickup is a `PICKUP:` marker renamed `PICKUP_DONE:` on resolve (`integrations/reaper/narration_pickups.lua`); no time is stored. The stage timer logs hours per chapter stage, not per pickup, and the PRD does not feed pace from it (SN0-Q4) | Reason: "No pickup session has been timed." |
| `chapterLengths()` | **`ProductionChapter.recordedSeconds`**, the measured length of the confirmed track, with `recordedUnavailable` (`unlinked`, `multiple_tracks`, `track_missing`, `no_project`) as the per-chapter reason. `ProductionTotals.measuredChapters` counts them | Fits `Measured<T>` directly. Unlinked chapters are absent from the record; the reason for the whole answer is "No chapter has a measured length yet" when `measuredChapters` is 0 |

The Recording check card's three counts are not in this port: they come from `ChapterSyncState.chapters[].freshness` (`never`, `stale`, `current`, `apps/ui/src/api/contracts/chapterSync.ts`), which `chapterCheckStatus.ts` reads today.

## Status report gap

The mock's document is `buildReport` in `docs/research/mockups/studio-next/src/selectors/report.ts`; the host's is `apps/desktop/production_report.go` over `apps/desktop/internal/productionreport/{model,report,html}.go`.

| Aspect | Mock | Host | Consequence |
| - | - | - | - |
| Sections | Seven toggles: chapters, words, schedule, pickups, delivery, amount, rate | None; one fixed document. One toggle, the amount (see Money) | SN-P621 builds the preview from the host's document, so the dialog shows the sections the host writes. Section toggles are a host change |
| Format | Choose HTML or JSON | Always writes both | The dialog's Format control is not built unless the host takes a format |
| File name | `<project>-status-<today>.<ext>` | `production-status-<UTC stamp>[-n].{html,json}`, never overwrites (`production_report.go` `freeProductionReportStem`) | Keep the host's |
| Location | `reportDir` or the project folder | `narration-utils/production/reports` under the project (`productionreport.Dir`) | Keep the host's |
| Summary | Status (finished, on track, tight, behind), chapters, words, finished hours, recorded hours and percent, due date, days left | Chapters, finalized chapters, words, recorded seconds, measured chapters, hours logged, hours by stage, book PFH | Different figures. The host's are measured or logged; the mock's recorded percent is an estimate from stored fractions |
| Status verdict | `isFinished`/`verdict` from the plan calculation | None. The host has the deadline and days left | SN-P621 can add the verdict from `schedule/progress.ts` or leave it out |
| Chapters table | Per chapter: words, finished hours, prep, recorded, edited, proofed, open pickups, mastered | None | The host has no per-chapter rows (pipeline cells above explain why) |
| Milestones | Name, date, done | Name, due date, note, days left, overdue; no `done` or `measure` | The host's `Milestone` predates SN-P2's fields (`internal/productionreport/model.go`); SN-P621 adds them |
| Open pickups, delivery check | Sections | Absent | No source per chapter; omit |
| Readiness | Not in the document | Counts per verdict: recommended, not ready, unknown, dismissed, none | Keep; the mock's readiness lives in the pipeline |
| Money | Amount = rate × finished hours; rate = the stored number; both only when the payment is per finished hour | `contracted_amount` = the stored number, `effective_rate` = stored number ÷ hours logged; opt-in together; `privacy` block | Finding 4. The two toggles of the mock are one in the host |
| Notice | None | `notice` text: "not an invoice or a certification" | Keep |
| Preview equals the file | The dialog renders the same document as the file | The page cannot preview; the host builds and writes in one call | SN-P621 adds the preview call; the PRD acceptance "Preview equals the written file" depends on it |

## Built and not mounted

| Piece | Where | Mounted by | In the swap |
| - | - | - | - |
| `SchedulePage`, `ContractPanel`, `MilestoneTable`, `MilestoneDialog`, `WorkedOut`, `VerdictPill`, `openMilestoneDialog`, `scheduleCommands`, and the pure files (`progress.ts`, `estimates.ts`, `measures.ts`, `payment.ts`, `platform.ts`, `profiles.ts`, `draft.ts`, `dates.ts`) | `apps/ui/src/components/schedule/` | Nothing. No importer outside the folder (`grep -rn "components/schedule/" apps/ui/src` finds only path-keyed `interactionFeedback/production.ts` rows); no route in `App.tsx`; `AppShell.tsx:184` comments that the navigation group has no Schedule page | SN-P8 adds the `/schedule` route and the rail item, and mounts `SchedulePage` |
| `VerdictPill` | `schedule/VerdictPill.tsx` | Nothing | The mock's Production header draws a pill (`pages/production/VerdictPill.tsx`); SN-P44 imports the Schedule's |
| `calc`, `deadlineTone`, `isFinished` | `schedule/progress.ts` | `SchedulePage` and its tests | SN-P43 reads them for Recording left, Editing + proof left and Due |
| `ReadinessChip`, `ReadinessPanel`, `openReadiness` | `production/readiness/` | Nothing outside stories and tests; `rawNatives.test.ts:25` lists the chip's one native button | SN-P44 mounts the chip on each current-stage cell and calls `openReadiness` |
| `Popover`, `StatStrip`, `Table`, `StageGrid` | `components/primitives/` | Yes (other pages) | Reused; no new primitive (PRD) |
| Recorded vs plan chart, Target pace popover | none | none | New in SN-P43 and SNP-5. No chart primitive exists |
| `MeasurementsPort` | none (`apps/ui/src/ports/` holds only `daw.ts`) | none | SN-P41 |

## Slice adjustments

- **SNP-8 (SN-P8) larger.** Adds the eight hosts (finding 1), the allowlist rows, the 61-row catalog rewrite, `shared.ts` readiness wait, 7 aria snapshots, 9 doc screenshots and the guide. It depends on SNQ-6 or leaves `RecordingCheck` mounted (finding 6). The 0.5 pw estimate is not credible; the Phase 8 row of the PRD should split as the issue notes (SN-P43, SN-P44) and keep SN-P8 as the route, rail item and deletions.
- **SN-P44 larger.** Next up is a different list (finding 3), the table needs row-menu hosts (finding 1), five columns are dashes (finding 9) and the readiness chip needs the full recommendation.
- **SN-P43 larger.** The timer strip (finding 5), the check counts from `ChapterSyncState`, the chart and `Measured` figures; the chart needs a primitive or an inline SVG that the mock draws.
- **SN-P41 smaller than a four-method port.** Two of four methods have no host source and answer a reason; one has a source with caveats. Only `chapterLengths` is straightforward.
- **SN-P621 larger.** It adds a preview call and the milestone fields (`done`, `measure`, `estimate`) to the host model; the host has no per-chapter rows to preview.
- **SN-P622 smaller.** One format control and one toggle already exist; the mock's section toggles wait on a ruling.
- **SNP-3 (schedule components) already true.** Built with no route; nothing to change in SN-P8 but the route.
- **SNP-6 half true.** The readiness half is built and unmounted; the report half is SN-P621/P622.

## Owner questions

To #992 (decisions register #993). Each carries a recommendation, so none gates a slice (D22/D64/D65).

1. **What is the stored contracted amount?** The Schedule treats it as a rate per finished hour; the Production figure and the report divide it by hours logged as if it were the contract total. Recommendation: for a per-finished-hour contract, the effective rate is (rate × finished hours) ÷ hours logged, using measured `recordedSeconds` for the finished hours; ADR 0320 needs an amendment.
2. **Where do the timer figures (Work time logged, Hours per finished hour, Effective rate) go on the mock-shaped page?** Recommendation: a three-figure strip under the KPI row, drawn only once time is logged or a timer runs.
3. **Does the status report get section toggles and a format choice?** The mock has seven toggles and one format; the host writes one fixed document in both formats. Recommendation: no, keep the host's document; the dialog previews it and keeps the amount opt-in.
4. **Keep the chapter status override?** The new readiness panel has none. Recommendation: keep it as a "Set status…" row-menu item.
5. **Keep the credits rows on the pipeline?** The mock draws none. Recommendation: keep them (D98), first and last row.
