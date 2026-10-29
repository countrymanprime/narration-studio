# UI function inventory: Production, Schedule, Stages, Master & QC, Delivery

Built from code under `src/studio/ui/src` (paths below are relative to it; `C/` = `components/`). Guides and mocks were not used as a source. `port.x` = `usePort('x')` (src/ports), `api.x` = `useApi()` (api/ApiContext, wailsClient/hostApi). Read-only audit; nothing fixed.

## 0. Pages, sources, modules

| Surface | Entry | Data sources it reads |
| - | - | - |
| Production `/` | C/production/ProductionPage.tsx | `production.productionOverview/productionPlan` (:157), `daw.capabilities` (:170), `useOpenPickups` -> `pickups.pickupsList` (:196), `measurements.*` via `useMeasured` (:200), `findings.findingsList` + `measure.measureState` + `manuscript.manuscriptChapters` + `scriptPrep.scriptPrepList` via `usePipelineSources` (C/production/usePipelineSources.ts:50), `api.stageRecommendations` via `useStageRecommendations` (:214), `api.manuscriptChapters/chapterTrackLinks` via `useChapterTools` (C/production/useChapterTools.tsx:63,71), `chapterSync` port (:262) |
| Schedule | C/schedule/SchedulePage.tsx | `useScheduleReading` (C/schedule/useScheduleReading.ts:62): `production.productionPlan/productionOverview`, `deliveryProfiles.deliveryProfiles`, `measurements.takeLog`; `useOpenPickups` (:56) |
| Master & QC `/master` | C/masterqc/page/MasterPage.tsx | `manuscript.manuscriptChapters` (:152), `deliveryProfiles.deliveryProfiles` (:126), `measure.measureState/measureAnalyze/measurePickFiles/measureCancel` via `useMeasureRun` (C/masterqc/page/MeasureRun.tsx), `useExportJobs` (api.exportState/packageState/packageMultiState), `useCreditsRows`, `useOpenPickups`, `daw.capabilities` via `useDawGates` |
| Delivery | C/delivery/page/DeliveryPage.tsx | `useDeliveryChecks` (store slot `chapters` via `useStudio`, `measure.measureState`), `useCreditsRows`, `useOpenPickups`, `renderEncodeMaster.exportState/packageState/packageStart/packageCancel/deliveryOpenPackageFolder` (useDeliveryBuild), `deliveryProfiles.*` (ProfileCard) |
| Stages | C/stages/* (no page; hosts `useStageRecommendations`, `StageSuggestion`, `StageEvidence`, `StageSuggestionOptions`, `useRefreshOnFocus`) | `api.stageRecommendations/stageConfirm/stageDismiss/stageRevert` (useStageRecommendations.ts:55,69-73) |
| Shared modules | chapterStatus.ts, recordedThrough.ts, chapterHeading.ts, chapterName.ts, C/layout/useNavCounts.ts | see section 2 |

No jump-menu page commands exist for Schedule, Master & QC or Delivery (grep `usePageCommands`: only `useProductionPageCommands.ts:34`). No keyboard shortcuts exist on Production, Schedule or Delivery. Master & QC has Alt+Up/Alt+Down (ChapterStepper `stepKeys`, MasterPage.tsx:241) and Arrow/Home/End on the files grid (C/masterqc/files/useMasterSelection.ts:394).

## 1. Control tables

### 1.1 Production page: header (C/production/pipeline/PageHeader.tsx)

| Control | Label/icon/tooltip | File:line | Handler -> host call / state | Notes |
| - | - | - | - | - |
| Verdict pill button | `VerdictPill`, tip "Open the schedule" | PageHeader.tsx:82-90 | `onOpenSchedule` -> `go('/schedule')` (ProductionPage.tsx:391) | navigation |
| Stop timer | Button "Stop timer" (shown only if `overview.running`) | PageHeader.tsx:101 | `timer.stop(nameOf)` -> `api.productionStopTimer()` (pipeline/useStageTimer.ts:42), then `read()` | sets inline `timer.notice`/`problem` text, not a toast |
| Export status report | IconButton `export` "Export status report" | PageHeader.tsx:105 | `openReportDialog` (ProductionPage.tsx:390) -> overlay dialog (1.9) | also jump-menu `action.export` |
| Start session | Button primary, `record` icon "Start session"; disabled unless `caps.capabilities.record.available`, reason text under it | PageHeader.tsx:106 | `goToBooth(recordingChapter?.id)` (ProductionPage.tsx:389) | navigation only; `recordingChapter` = first narrated chapter with `status==='recording'` (:288) |
| TimerChip | chip with running timer | PageHeader.tsx:99 (C/layout/TimerChip) | display | `runningTimerOf(overview)` |
| DAW not connected chip | `ConnectionIndicator` "<daw> not connected" | pipeline/DawIndicator.tsx:16, ProductionPage.tsx:360 | `dawDialog.reopen` (`useOpenOnce`) | only when `caps.reachable===false && daw!=='none'` |
| Connection dialog | `ConnectionResolveDialog variant="reaper-off"` | ProductionPage.tsx:363-373 | `onCheckAgain=checkDaw` -> `daw.capabilities()`; `onCaps=takeCaps`; `onClose` | auto-opens once per loss after `settling` grace |
| Load error Retry | `LoadError` Retry | ProductionPage.tsx:345-352 | `read()` -> `production.productionOverview/productionPlan` | |
| Timer problem/notice | inline `role=alert/status` text | ProductionPage.tsx:396-405 | state in `useStageTimer` | |

### 1.2 Production page: KPI row, figures, cards

| Control | Label | File:line | Handler -> source | Notes |
| - | - | - | - | - |
| KPI tile "Recorded audio" | `hm(recordedSeconds)/ hm(finished)` "before editing" | overview/KpiRow.tsx:26-31; overviewFigures.ts:101-102 | `onGo('script')` -> `go/goToScript` (ProductionPage.tsx:225) | target is Script (suspicious, 3) |
| KPI "Recording" | left / est. | overviewFigures.ts:113 | `onGo('booth')` -> `goToBooth(undefined)` | Target-info IconButton is overlaid on this tile (KpiRow.tsx:34) |
| KPI "Editing + proof" | `editLeft+proofLeft` | overviewFigures.ts:123 | `onGo('editing')` -> `go('/editing')` (:227 with no chapter) | proof not reachable from tile |
| KPI "Open pickups" | count, "about N min" | overviewFigures.ts:133 | `onGo('pickups')` -> `/pickups` | count = `useOpenPickups().length` |
| KPI "Delivery check" | pass / total | overviewFigures.ts:143 | `onGo('master')` -> `/master` | `deliveryCounts` |
| KPI "Due" | date / "Not set" | overviewFigures.ts:90,98 | `onGo('schedule')` -> `/schedule` | |
| Finished-hour target (info) | IconButton "Finished-hour target", hover/click popover | production/target/TargetInfoButton.tsx:94-117 | reads `production.productionPlan/productionOverview` (:38), `measurements.chapterLengths` via `useMeasured` (:24); writes `production.setProductionRateBasis` (:71) | see 3.1: basis not consumed |
| Schedule basis toggle | ToggleGroup "Standard" / "Your pace" | target/TargetPopover.tsx:62 | `onBasis` -> `setProductionRateBasis('standard'|'own')` | |
| Timer figures strip | "Work time logged", "Hours per finished hour", "Effective rate" | ProductionPage.tsx:73-109 | display of `overview.totals` | hidden until hours logged or timer running |
| Where the book stands | stage bar + legend | overview/StageBar.tsx; ProductionPage.tsx:424 | `stageSegments(narrated, WPH, pipelineSources.master)` | display |
| This week | "Recorded this week", "Voice rest (last 24 h)" | overview/WeekCard.tsx; ProductionPage.tsx:425 | `weekFigures(takeLog,...)` (measured.selectors.ts:339) | display |
| Recording check card | counts: Checked / Out of date / Not checked yet | overview/CheckCountsCard.tsx:149-190 | `checkCounts(sync.chapters, narrationIds)` (overviewFigures.ts:216) | row tooltips list chapter names |
| Check recordings (card) | IconButton `checkRecordings` "Check recordings", `aria-haspopup=dialog`, disabled with reason | CheckCountsCard.tsx:179 | `openCheckRecordings(stale+never)` (ProductionPage.tsx:430) | also jump menu `check.recordings` (useProductionPageCommands.ts:61) |
| Recorded vs plan chart | svg + IconButton `calendar` "Open schedule" | overview/ProgressChart.tsx:110; ProductionPage.tsx:491 | `go('/schedule')` | same chart on Schedule (no button there) |

### 1.3 Production page: Next up

| Control | Label | File:line | Handler | Notes |
| - | - | - | - | - |
| Open Booth | Button "Open Booth" | pipeline/NextUp.tsx:54 (printed 483, offset 429) | `onGo('booth', chapterId)` -> `goToBooth(id)` | |
| Start timer | Button "Start timer", `aria-label="Start timer on <name>"`, hidden while a timer runs | NextUp.tsx:58-65 | `timer.start(chapterId, stage)` -> `api.productionStartTimer` (useStageTimer.ts:25) | the only place a timer can be started |
| Review pickups | Button | NextUp.tsx:75 | `onGo('pickups')` -> `/pickups` | |
| Inspect failed check | Button | NextUp.tsx:88 | `onGo('master', chapterId)` -> `go('/master')` (ProductionPage.tsx:230), chapterId dropped | see 3.4 |
| Empty state | "Nothing needs you right now." | NextUp.tsx:99 | | ranked by `rankNextUp` (nextUpRanking.ts:472) |

### 1.4 Production page: chapter pipeline table (pipeline/PipelineTable.tsx, offset +210 from the concatenated listing)

| Control | Label | File:line | Handler -> host call / state | Notes |
| - | - | - | - | - |
| Rec. header info | "Rec." + info mark | PipelineTable.tsx:149 | tooltip | measured length of linked track |
| Est. header info | "Est." + info mark | PipelineTable.tsx:156 | tooltip | `hm(wordCount/WPH)` |
| Prep cell | tick / half disc / dash (button) | PipelineTable.tsx:97 (StageCell); pipelineRows.ts:215 | `onGo('script', id)` -> `goToScript(id)` or `go(/script?credits=)` (ProductionPage.tsx:225) | state from `scriptPrep.scriptPrepList`; credits rows from template tokens |
| Record cell | tick / % / half disc | pipelineRows.ts:162 | `onGo('booth', id)` -> `goToBooth(id)` | tooltip adds recording-check freshness (`chapterCheckStatus`) |
| Edit cell | | pipelineRows.ts:198 | `onGo('editing', id)` -> `tools.openEditingCheck(id)` (EditingCheckPanel overlay) or `tools.openCredits(kind)` (ProductionPage.tsx:227) | NOT `go('/editing')` when a chapter is given |
| Proof cell | % or tick | pipelineRows.ts:204 | `onGo('proof', id)` -> `go(/proof?chapter=)` (credits: unfiltered) | |
| Pickups cell | count; plain text (no button) until status >= editing | pipelineRows.ts:222 | `onGo('pickups')` -> `/pickups` | `go:false` before recorded |
| Master cell | tick / dash | pipelineRows.ts:230 | `onGo('master')` -> `/master` | |
| QC cell | PASS / FAIL / dash | pipelineRows.ts:235 | `onGo('master')` -> `/master` | |
| Readiness chip | round mark, `aria-label="Stage readiness: <verdict>, <stage>"`, `aria-haspopup=dialog` | readiness/ReadinessChip.tsx:32; PipelineTable.tsx:200-201 | `openReadiness({chapterId, notify, onStatus, onCheckRecording})` -> overlay slide-over (1.7) | chip drawn on the cell of the chapter's current stage only |
| Row context menu | right click / Menu key on a tbody row | C/production/useChapterTools.tsx:173-241 | `registerContextProvider` (1.5) | |
| Pipeline scroll area | tab stop `role=group` "Chapter pipeline scroll area" | PipelineTable.tsx:141 | keyboard scroll | |
| Row highlight | `justChanged` | PipelineTable.tsx:175 | `useJustChanged().mark` after Confirm/Revert/Restore | |
| Stage suggestion options | jump menu "Open Stage suggestion options" (no visible button); renders `ProofOptions` panel in the Panel | stages/StageSuggestionOptions.tsx:24; proof/proofOptions/ProofOptions.tsx:128 | saves project settings group Production/StageRecommendations, `onSaved=refreshStages` (ProductionPage.tsx:452) | 16 keys |
| Recording check rules | jump menu "Open Recording check rules" | production/RecordingCheckRules.tsx:21; ProductionPage.tsx:453 | settings Production/RecordingCoverage, `onSaved=onChanged` | |

### 1.5 Production page: row context menu (useChapterTools.tsx:173-241)

| Item | Label | File:line | Handler | Notes |
| - | - | - | - | - |
| heading | chapter name (`headingName`) disabled row | :195,212 | none | |
| script | "Open prep in Script" | :196,213 | `go.script(id)` | credits rows too |
| booth | "Open in Booth" | :197,214 | `go.booth(id)` | |
| proof | "Open Proof" (chapters only) | :215 | `go.proof(id)` | |
| master | "Open Master & QC" (chapters only) | :216 | `go.master()` -> `/master`, no chapter | |
| goto | "Go to this chapter in <DAW>" | :217-223 | `api.trackSelectInReaper(guid)` (:118) -> toast | gated by `track_select` capability and a linked track |
| track | "Chapter track…" | :224-229 | opens `ChapterTrackPanel` (1.6) | needs link known |
| recording | "Check recordings…" | :230 | `openCheckRecordings([id])` (:168) | |
| editing | "Editing check…" | :231 | opens `EditingCheckPanel` | |
| credits | "Credits…" (credits rows only) | :198 | opens `CreditsRowPanel` (1.8) | |
| status-* | "Set status: Not Started / Recording / Editing / Proofing / Finalized" (all but current) | :199-203,232-236 | chapters: `api.manuscriptSetChapterStatus(id,status)` (:104), then `onChanged`; credits: `credits.setStatus(kind,status)` (useCreditsRows) | labels from chapterStatus.ts `STATUS_LABELS` |

### 1.6 Chapter track slide-over and removal (C/production/ChapterTrackPanel.tsx)

| Control | Label | File:line | Handler -> host call | Notes |
| - | - | - | - | - |
| Skip back 30s | Button `aria-label="Skip back 30s"` | :211 | `player.skipBackward` (useTrackPlayback, `api.mediaUrl`) | |
| Play/Pause | Button | :214 | `player.togglePlay` | |
| Skip forward 30s | Button | :217 | `player.skipForward` | |
| Select in REAPER | Button | :226 | `api.trackSelectInReaper(linkedTrackGuid)` (:100) -> toast "Selected in REAPER." | same call as row-menu "Go to this chapter in <DAW>" (useChapterTools.tsx:118), different toast text/label |
| Keep this one | Button per linked track | :243 | `link_(guid)` -> `api.chapterTrackSet(chapterId, guid)` (:113) | |
| Link (candidate) | Button "Link" | :264 | `api.chapterTrackSet` | |
| MappingConfirm | confirm / "Another track…" / "Unlink" | :275-290 | `api.chapterTrackSet` / `api.chapterTrackUnlink(chapterId)` (:126) | |
| Remove from recording… | Button danger | :302 | opens `RemoveFromRecordingDialog` | |
| Dialog "Remove from recording" | ConfirmDialog (confirm, cancel) | RemoveFromRecordingDialog.tsx | `removeFromRecording(id,'reference')` -> `api.manuscriptSetChapterKind(id,'reference')` (useChapterTools.tsx:136), toast "<title> removed from recording." | reclassification, not delete |
| Restore | Button per removed chapter | RemovedFromRecordingList.tsx:39 | `restore(id)` -> `api.manuscriptSetChapterKind(id,'narration')` (useChapterTools.tsx:147), toast "<title> restored." | list under table (:250) |

### 1.7 Readiness slide-over (readiness/ReadinessPanel.tsx, openReadiness.tsx)

| Control | Label | File:line | Handler -> host call | Notes |
| - | - | - | - | - |
| Revert | Button | ReadinessPanel.tsx:78 | `decide('revert')` -> `api.stageRevert(id)` (useStageRecommendations.ts:69) | toast `decidedMessage` |
| Dismiss | Button | :79 | `api.stageDismiss(id,target,basisKey)` (:73) | |
| Confirm | Button primary | :80 | `api.stageConfirm(id,target,basisKey)` (:72) -> `onStatus` -> `changedRow.mark` + `onChanged` | sends the basis from first read (`seen`, openReadiness.tsx:168) |
| Check recordings… | Button (only when verdict `notchecked` and stage recording) | :82-86 | closes panel, `tools.openRecordingCheck` | |
| Check now | Button in error state | :58 | `refresh()` -> `api.stageRecommendations` | |

### 1.8 Credits row slide-over (C/production/CreditsRowPanel.tsx)

| Control | Label | File:line | Handler | Notes |
| - | - | - | - | - |
| Status select | `<label> status` | :77-80 | `credits.setStatus(kind,status)` | uses `STATUS_ORDER/STATUS_LABELS` |
| Check recordings… | Button | :89 | `creditsCheckChapter` + `openCheckRecordings([id], {extra})` (useChapterTools.tsx:278-282) | synthetic chapter |
| Open in Script | Link | :92 | `/script?credits=` | |
| Settings > Credits link | Link | :70 | `/settings#credits` | |

### 1.9 Status report dialog (C/production/report/ReportDialog.tsx)

| Control | Label | File:line | Handler -> host call | Notes |
| - | - | - | - | - |
| Close | IconButton `close` | :95 | `onClose` | |
| Include checkboxes (6) | Words / Hours by stage / Deadline and milestones / Open pickups / Delivery check / Contracted amount (money only if `amountOffered`) | :103-107; reportModel.ts:204 | `include` state -> `production.productionStatusReportPreview(include)` (:60) | money offered when payment per-hour with amount |
| Format toggle | HTML / JSON | :118 | `format` state | only switches preview pane and displayed path; Export writes both |
| Preview | iframe (html) or pre (json) | :136,138 | | |
| Cancel | Button | :165 | close | |
| Export | Button primary | :173 | `production.productionStatusReport(include)` (:69) -> "Wrote <html> and <json> to <folder>" | |
| Done | Button (after write) | :169 | close | |

### 1.10 Manuscript import (C/production/ManuscriptImport.tsx, ImportChooseDialog.tsx, ImportReview.tsx), shown when no manuscript

| Control | Label | File:line | Handler -> host call | Notes |
| - | - | - | - | - |
| Import manuscript | Button primary (NoManuscript) / "Replace manuscript…" danger when `found` (not drawn on Production when found) | ManuscriptImport.tsx:240-241 | opens step 1 | jump menu `action.import` (useProductionPageCommands.ts:37) when no manuscript |
| Set a due date | IconButton `calendar` | pipeline/NoManuscript.tsx:23 | `go('/schedule')` | |
| Choose a file… | Button primary | ImportChooseDialog.tsx:75 | `api.selectManuscript()` (ManuscriptImport.tsx:204) -> `beginImportPreview` | |
| Drop a file | drop zone | ImportChooseDialog.tsx:41 | `api.manuscriptBeginImport(path)` (:233) | `subscribeManuscriptDropped` (:219) |
| Offer candidate | ConfirmDialog "Import manuscript?" Import/decline | ManuscriptImport.tsx:268 | `api.manuscriptBeginImport(candidate.path)` | |
| Step 2 Back | Button | ManuscriptImport.tsx:296 | `api.manuscriptImportCancel(id)` then step 1 | |
| Close when done | Checkbox | :305 | `api.saveSettings('General','global',{close_import_when_done})` (:105) | |
| Import / Replace and reset | Button primary or danger | :308 | `api.manuscriptImportCommit(id, selection)` (:185), then `api.deliverySelectProfile('project',...)` (:144) | |
| Review: chapter Switch, heading level, subtitles, profile, story bible, Select all/none, per-candidate Switch | | ImportReview.tsx:178,211,222,226,233,274,280,291; ImportProfileField.tsx:15 | `onSelectionChange` state | |
| Cancel on WorkDialog | | ManuscriptImport.tsx:327-338 | `api.manuscriptImportCancel` | only while `preparing` |
| Credits setup dialog / banner | | ManuscriptImport.tsx:345,357 | `CreditsSetupDialog` | |

### 1.11 Toast actions and jump-menu entries (Production)

| Item | File:line | Handler | Notes |
| - | - | - | - |
| Chapter-sync batch toast "Undo" | C/production/useChapterSyncToast.ts:43-47 | `api.chapterSyncUndo(trackGuid)` for each linked track | toast; `onState` -> `tools.reload(); onChanged()` (ProductionPage.tsx:262-270) |
| Selected-in-DAW / linked / unlinked / removed / restored / stage-decision toasts | useChapterTools.tsx:119,136,148; ChapterTrackPanel.tsx:101-127; useStageRecommendations.ts:81-88 | `notify` | |
| Jump menu: chapter rows | useProductionPageCommands.ts:47-53 | `focusPipelineRow(index)` (scroll + focus) | replaces global "Go to <chapter>" (supersedes 'Chapters') |
| Jump menu: Check recordings / Read the stage suggestions again / Export status report / Start session / Stop timer | :60-87 | see 1.2, 1.1, `refreshStages` | "Start session" label duplicates header button; Stop timer disabled with reason |
| Jump menu: Import manuscript (no manuscript only) | :37-43 | `manuscriptImport.open` | |
| Focus/visibility refresh | stages/useRefreshOnFocus.ts:256 (30 s throttle) | `tools.reload(); onChanged()` (ProductionPage.tsx:273) | not a control; re-reads |

### 1.12 Schedule page (C/schedule/SchedulePage.tsx)

| Control | Label | File:line | Handler -> host call | Notes |
| - | - | - | - | - |
| Retry (first read failed) | Button | SchedulePage.tsx:68 | `reload()` | |
| Retry (re-read failed) | Button | :208 | `reload()` | same function, two sites |
| Verdict pill | StatusBadge, not a button | :226 | | |
| Recorded audio vs plan chart | no button (Production's has the calendar button) | :232 | | |
| Payment select | Select "How you are paid" | schedule/ContractPanel.tsx:239 | `setPaymentCommand` -> `production.setProductionPayment` (scheduleCommands.ts:336) | journalled, Undo toast not offered |
| Rate per finished hour | TextField (commit on blur/Enter) | ContractPanel.tsx:253 | `setAmountCommand` -> `production.setProductionDeadline(date, amount)` (scheduleCommands.ts:325); null path also calls `setProductionPayment('per_finished_hour')` | refusals -> toast topic `schedule-refusal` |
| Add milestone | IconButton `add` "Add milestone" | SchedulePage.tsx:258 | `edit(null)` -> `openMilestoneDialog` | Undo toast "Milestone added." |
| Mark <name> complete | IconButton, `aria-pressed` | MilestoneTable.tsx:84 | `toggleDone` -> `saveMilestonesCommand` -> `production.saveProductionMilestones` (scheduleCommands.ts:301) | |
| Add/Edit note | IconButton `addNote` | MilestoneTable.tsx:88 | `edit(index,'note')` | |
| Edit <name> | IconButton `edit` | MilestoneTable.tsx:96 | `edit(index)` -> dialog | |
| Remove <name> | IconButton `remove` danger | MilestoneTable.tsx:97 | `remove(index)` -> `saveProductionMilestones`, Undo toast "Removed <name>." (`overlay.toastUndo` + `journal.undo`) (SchedulePage.tsx:111-120) | the only toast Undo in my area besides sync |
| Delivery due (Final row) | DateField, commits on valid date or Enter on empty | MilestoneTable.tsx:118,164-181 | `changeDue` -> `setDueDateCommand` -> `production.setProductionDeadline(date, contractedAmount)` (scheduleCommands.ts:311); announce | empty+Enter clears due date |
| Milestone dialog | fields Name, Due, Measures select (+chapters/minutes), Note, Done checkbox; Cancel, Add milestone/Save | MilestoneDialog.tsx:52-114 | `onSave` -> `saveList` | |
| WorkedOut panel | read-only derivation | schedule/WorkedOut.tsx | `calc` | |
| History panel Undo | outside area | useScheduleReading.ts:126 | `journal.subscribe` -> `reload` | |

### 1.13 Master & QC page (C/masterqc)

| Control | Label | File:line | Handler -> host call | Notes |
| - | - | - | - | - |
| Chapter stepper | prev/next arrows, chapter select; Alt+Up / Alt+Down | MasterPage.tsx:241; primitives/ChapterStepper.tsx:82,116 | `goToChapter` / `stepChapter` -> `setPicked`, `saveSharedChapter(projectFolder,id)` (sharedChapter.ts) | shared chapter with other pages |
| Profile chip | HeaderChip "Open Delivery" (profile name) | MasterPage.tsx:244 | `onOpenDelivery` | |
| Master all to spec… | Button secondary | MasterPage.tsx:253 | `jobs.pick()` -> `api.exportPickFiles()` (useExportJobs.ts:106) | opens Master-to-spec panel with picked files |
| Check files… / Re-check N files | Button (data-measure-check) | MeasureRun.tsx:485 | `run.check()` -> `measure.measurePickFiles()` then `measure.measureAnalyze(paths)` (:430-431), or reuse paths | |
| Choose other files… | Button ghost | MeasureRun.tsx:481 | `run.chooseOther()` | |
| Cancel measurement | Button | MeasureRun.tsx:526 | `measure.measureCancel()` (:440) | |
| Check again (lost host) | Button ghost | MeasureRun.tsx:504 | `read()` -> `measure.measureState()` | |
| Check the files again | IconButton `retry` in table header, gated by `project_read` capability | files/FilesTable.tsx:75 | `actions.onRecheck` = `run.check()` (MasterPage.tsx:225) | same function as Re-check |
| Retry profile / chapters | Button sm | MasterPage.tsx:266,275 | `retryProfile` / `retryChapters` | |
| Show the first file instead | Button sm | MasterPage.tsx:285 | `setPicked(undefined)` | stale link |
| Files table row | select (click/Enter), Arrow/Home/End | FilesTable.tsx:233; useMasterSelection.ts:394 | `select` -> `saveSharedChapter` | |
| Row context menu | "Show the checks", "Play the quietest 5 s", "Open in <DAW>", "Check the files again" | FilesTable.tsx:140,151,157,159 | `onSelect`; `actions.onPlayQuietest` -> `daw.playQuietest(fileId)`; `onOpenInDaw` -> `daw.openFile(fileId)` (masterqc/page/useFileActions.ts:448-449) -> toast | gated by `file_preview`, `file_reveal`, `project_read` (files/useDawGates.ts:294-296) |
| Play the quietest 5 s | IconButton `play` (FileChecks) | files/FileChecks.tsx:231 | same `daw.playQuietest` | |
| Open in <DAW> | IconButton `openInReaper` | FileChecks.tsx:234 | same `daw.openFile` | |
| Check again (DAW gates) | Button ghost | FileChecks.tsx:242 | `daw.capabilities()` | |
| Rule-by-rule panel Close | Button | master/FileRulesPanel.tsx:70 | `setRulesClosed(path)` | |
| Book consistency | chart | masterqc/page/Consistency.tsx | derived | |
| Master to spec panel | "Add files…", "Master & encode"/"Encode", role Select, Title field, Remove, "Master" Checkbox, Cancel | master/MasterToSpecPanel.tsx:81,84,122,141,157,171,184 | `jobs.pick`, `jobs.startExport` -> `api.exportStart({items,master,format:'mp3'})` (useExportJobs.ts:129), `updateItem`, `removeItem`, `setMaster`, `jobs.cancelExport` -> `api.exportCancel()` | panel hidden until files or a problem |
| Mastering chain | read-only steps | master/MasteringChain.tsx:59 | `useMasteringProviders` | |
| Diagnostics | "Check measured files", "Choose files…", source ToggleGroup, Cancel, "Open Settings" | master/DiagnosticsSection.tsx:78,223,227,237,261 | `api.diagnosticsAnalyze(paths, kind)` (:196), `api.measurePickFiles()` (:205), `api.diagnosticsCancel()` (:207) | |
| Report export | "Include each file's full location" checkbox, "Export report" | master/ReportExportPanel.tsx:55,60 | `api.deliveryExportReport(includePaths)` (:33) | disabled while a run is live or nothing measured |
| Delivery package card | list of checks; button "Open Delivery" | masterqc/page/PackageChecks.tsx:74 | `onOpenDelivery` | counts via `packageCounts` (page/packageItems.ts:94) |
| Multi-platform export | profile Checkboxes, "Build" button, Cancel | master/MultiPlatformExportPanel.tsx:118,137,141 | `jobs.startMultiPackage(chosen)` -> `api.packageStartMulti` (useExportJobs.ts:154), `api.packageMultiCancel` | uses `doneFiles` from Master's own `exportState` read |
| Link focus | `focusFile` | MasterPage.tsx:116-120 | selects file or chapter's file | Delivery rows deep-link with chapter id |

### 1.14 Delivery page (C/delivery)

| Control | Label | File:line | Handler -> host call | Notes |
| - | - | - | - | - |
| Profile select | Select `Delivery profile: <name>`; built-ins first | delivery/profile/ProfileMenu.tsx:388 | `choose(next)` -> `deliveryProfiles.deliverySelectProfile('project', id, version)` (ProfileCard.tsx:102) then `onChange` -> `setBuilt(false); reread()` (DeliveryPage.tsx:149) | disabled while building ("Locked while it builds" badge :118) |
| Profile name | CommitBox "Profile name" (custom profiles) | ProfileCard.tsx:123; CommitBox.tsx:432 | `deliverySaveProfile(edit)` (:105) then `deliveryProfiles()` | validates empty / max length locally |
| Limit boxes | CommitBox "<rule> lowest/highest" | delivery/profile/LimitRow.tsx:43 | `deliverySaveProfile` via `editOf` | readOnly for built-ins |
| Format rows | FormatRows | delivery/profile/FormatRows.tsx | same | |
| Check again (profiles) | Button ghost | ProfileCard.tsx:89,159 | `read.again` -> `deliveryProfiles()` | |
| Build <profile> package | Button, `aria-disabled` until `ready && encoded>0`, a press while blocked sets `refused` | delivery/page/OutputPanel.tsx:113-122 | `build.build()` -> `renderEncodeMaster.packageStart({profileId, profileVersion, items:encodedFiles})` (useDeliveryBuild.ts:284); host opens its own folder picker | items come from `renderEncodeMaster.exportState()` done files |
| Cancel build | Button secondary | OutputPanel.tsx:124 | `build.cancel()` -> `packageCancel()` (useDeliveryBuild.ts:298) | |
| Open Master & QC | Button sm in failure message (only for NOTHING_MEASURED) | OutputPanel.tsx:151 | `onOpenMaster` | |
| Check again (build state) | Button sm | OutputPanel.tsx:167 | `build.checkAgain` -> `exportState` + `packageState` reads | |
| Open folder | IconButton `openFolder` | OutputPanel.tsx:206 | `port.deliveryOpenPackageFolder()` (useDeliveryBuild.ts:309) | |
| Before you build: open in Master & QC | IconButton `goTo` | delivery/page/Preflight.tsx:288 | `onOpenMaster` | |
| Chapter row | link-style Button `<name>: <text>. Open in Master & QC` | Preflight.tsx:332 | `onOpenInMaster(chapterId)` | deep-links `focusFile` |
| Check again (list) | Button ghost | Preflight.tsx:294 | `setCreditsRead(+1); checks.checkAgain()` -> `studio.load('chapters')` + `measure.measureState()` | re-reads; does not start a measurement |
| Show the other N chapters | Button sm | Preflight.tsx:349 | `setAll(true)` | |
| Rules panel | read-only `DeliveryProfilePanel` | master/DeliveryProfilePanel.tsx:54 | | shared component with Master's FileRulesPanel (`Requirement`) |

### 1.15 Shell: nav counts (C/layout/useNavCounts.ts)

| Item | File:line | Source | Notes |
| - | - | - | - |
| Proof badge | useNavCounts.ts:35 | `api.findingsSummary()` -> `proofProgress(summary,0).open` | pickups term forced to 0 |
| Pickups badge | :41 | `api.pickupsList()` -> `openPickups(list.pickups).length`; `api.subscribePickups`, `onPickupListChanged` | |
| Master & QC badge | :44-47 | `api.measureState()` + `api.manuscriptChapters()` -> `masterByChapter([...chapters, ...CREDITS_FILE_CHAPTERS], job.files)` count `qc==='FAIL'` | |
| Production / Schedule / Delivery | none | | no badge |
| Wiring | App.tsx:406; AppShell.tsx:44 `NAV_COUNT_KEYS`, :251 | re-read on `pathname` change (:61) | |

## 2. Capability tags

### 2.1 Per-chapter status (the stage)

Source of truth: host `ProductionChapter.status` (overview.go:62, `stages.Stage`) / `ManuscriptChapter.status`. Writes: `api.manuscriptSetChapterStatus` (useChapterTools.tsx:104), `credits.setStatus`, `api.stageConfirm/stageRevert` (readiness panel; ProofingStagePanel; EnginePanel).

| Where | File:line | Implementation | Shared? |
| - | - | - | - |
| Labels/order/tone | chapterStatus.ts:8-26 (`STATUS_LABELS`, `STATUS_ORDER`, `STATUS_TONE`) | imported by useChapterTools.tsx:7, CreditsRowPanel, stageText, TimerChip, productionFormat, StatusBadge, Booth CompanionThisChapter, engine/LinkChaptersDialog | one for labels |
| "Stage order" ranks | pipelineRows.ts:83-84 (`ORDER`, `past`) | own copy of the five-status array | separate |
| | schedule/progress.ts:18-21 (`STAGE_ORDER`, `DONE_AT`, `stageDone`) | own copy | separate |
| | overview/overviewFigures.ts:165-171 (`DONE_SHARE`) | own table keyed by status | separate |
| | pipelineRows.ts:243 (`currentColumn`) | own switch | separate |
| Stage done thresholds | pipelineRows.ts: record done at `>=editing`, edit done at `>=proofing`, proof done at `finalized`; progress.ts `DONE_AT = {rec:'editing', edit:'proofing', proof:'finalized'}`; `DONE_SHARE` same thresholds | same today, three copies | could drift |
| "Recording chapter" | ProductionPage.tsx:288 (`narrated.find(c => c.status==='recording')`, first match) | feeds Start session, Next up, jump menu | Booth has its own current chapter (`useBoothData`, outside area) |
| Narrated set | ProductionPage.tsx:67,205 (`!contentKind || 'narration'`, excludes `opening` and `reference`) | KPI, StageBar via `narrated` | Schedule uses `scheduleChapters` (progress.ts:12: excludes only `reference`, keeps `opening`) -> see below |
| Master chapter bar | MasterPage.tsx:93,209 (`(contentKind ?? 'narration')==='narration'`) | own copy of narrated rule | separate |
| Stage readiness verdict | readiness/verdict.ts:46 `verdictOf` over host `StageChapterRecommendation`; 4+ independent `useStageRecommendations` instances: ProductionPage.tsx:214, readiness/openReadiness.tsx:23, proof/ProofingStagePanel.tsx:41, engine/EnginePanel.tsx:89 | same hook and host call, separate state per mounted instance | one implementation, separate copies of state; Production chip is refreshed after a panel decision via `onStatus -> onChanged` |

### 2.2 Progress / recorded / edited / proofed / mastered per chapter and book

| Figure | Location | Implementation | Definition |
| - | - | - | - |
| Recorded seconds (raw linked-track audio) | host `ProductionChapter.recordedSeconds` (overview.go:64) | read by pipelineRows.ts:141 (Rec. cell), KpiRow (ProductionPage.tsx:316), ProgressChart `recordedHours` (:316), Schedule `recordedHours` (useScheduleReading.ts:85), NextUp `share` (ProductionPage.tsx:467), StageBar `measured` (overviewFigures.ts:186), ChapterTrackPanel `recordedLength` (useChapterTools.tsx:260) | Production sums `narrated` (no opening, no reference); Schedule sums all but `reference` (includes `opening` chapters) -> same book, possibly different hours |
| Recorded through (paragraph/percent) | recordedThrough.ts:14 `recordedThroughLabel`, :37 `chapterRecordedDetail`: used by Booth (BoothNextPage.tsx:432,557), Editing (EditingPage.tsx:131), Proof (ProofPage.tsx:446) | raw `percent`, "Complete" / "Complete?" | Production does not import it |
| | pipelineRows.ts:122 `throughWords` + :162 `recordCell` | own wording ("recorded through ¶ N (38%)"), percent clamped to 1-99 unless `complete` | separate implementation, same input (`recordedThrough`) |
| Record cell % when no `recordedThrough` | pipelineRows.ts:177-192 | `floor(recordedSeconds / ((words/WPH)*3600) * 100)` clamped 1-99 | own |
| Next up "N% recorded" | ProductionPage.tsx:467-470, nextUpRanking.ts:476 | `min(1, recordedSeconds / finishedOf(words))`, never reads `recordedThrough` | own; can disagree with Record cell and with Booth/Editing/Proof |
| Stage bar "Recorded" | overviewFigures.ts:179-203 | per chapter `max(delivered, proofed/edited share, status rec share, measured seconds share)` weighted by words | own; "Delivered" = `master[id].mastered` which is true for PASS and FAIL files (see below) |
| Edited | pipelineRows.ts:198 `editCell` (status only); StageBar `ew` (status) | status-only | no measured edit progress anywhere |
| Proofed | pipelineRows.ts:204 `proofCell`: `finalized` -> done; else notes cleared/total from `proofByChapter(findings.findingsList)` (usePipelineSources.ts:17); `cleared` = review.status `dismissed`, skips `not_in_latest_run` | own | |
| | useNavCounts.ts:35 `proofProgress(findingsSummary,0).open` (proof/proof.selectors.ts:23) | host summary, pickups term 0 | Proof page adds `openPickupsBeyondNotes`; Production cell counts findings list; two sources (summary vs list) |
| Mastered / QC per chapter | usePipelineSources.ts:34 `masterByChapter` = `fileOf` + `fileVerdict`: `mastered = verdict !== 'none'` (PASS or FAIL), `qc` = 'PASS' / 'FAIL' / null. Same function used by useNavCounts.ts:46 | one function | A failing file is "mastered:true, qc:FAIL": Production Master cell ticks "Mastered" for a chapter Delivery calls "Fails N checks" |
| | delivery/page/chapterStates.ts:76 `stateOf` | `fileVerdict`: pass -> ok, fail -> bad, none/no file -> wait ("Not mastered") | separate from `masterByChapter`, same `fileOf`+`fileVerdict` |
| | masterqc/files/rows.ts:105-178 `buildChapterRows` | `fileOf` over files minus sample files (:168), `fileVerdict` | `masterByChapter` / `chapterStates` call `fileOf` on all files including the retail sample |
| | masterqc/page/packageItems.ts:87-101 `packageCounts` | reuses `chapterStates` + strays | shares with Delivery |
| Pickups per chapter | ProductionPage.tsx:319 and Master (MasterPage.tsx:170), Delivery (DeliveryPage.tsx:165), useNavCounts.ts:41 | all `openPickups()` (pickups/list/pickupRows.ts:85) over `pickupsList`; Production/Master/Delivery/Schedule read through `useOpenPickups` (separate hook instance + subscription each), nav through its own `pickupsList` + `subscribePickups` | one filter, N copies of fetched state |
| Recording-check freshness | cell: chapterCheckStatus.ts:30 (link state first, then sync freshness); card: overviewFigures.ts:216 `checkCounts` (sync freshness only, narrated set) | separate | an unlinked chapter is `not_linked` in the cell and `never` in the card |

### 2.3 Hours / minutes totals

| Figure | Location | Implementation | Notes |
| - | - | - | - |
| Words per finished hour | schedule/estimates.ts:9 `WPH = 9300` | passed as `wph={WPH}` by ProductionPage.tsx:410,424,484 and SchedulePage.tsx:239; `calc(..)` defaults to it (progress.ts:53); `remainFor` uses it directly (:100-104); `TargetPopover` shows it; `Est.` column pipelineRows.ts:266; `finishedOf` ProductionPage.tsx:315 | one constant |
| Narrator's own rate / basis | target/pace.selectors.ts:424 `ownRate`, :36 `basisOf`, :41 `wphOf`; persisted `plan.rateBasis` | `wphOf` has no caller (grep) | basis toggle changes nothing downstream (3.1) |
| Work hours left (rec/edit/proof, pickups) | schedule/progress.ts:53 `calc` | used by Production header/KPI/pill (ProductionPage.tsx:312 over `narrated`) and Schedule (SchedulePage.tsx:136 over all non-reference) | two inputs sets |
| Per-stage hours logged | host `overview.totals.hoursByStage`, `hoursLogged`, `bookPfh`, `effectiveRate` | TimerFigures (ProductionPage.tsx:73) | |
| Pickup minutes | ProductionPage.tsx:337 `pickupSessionSeconds/60` rounded | `measure.sessionMinutes` (measured.selectors.ts:76) also used by pickups/list/SessionPanel.tsx:9 | Production rounds without the floor-at-1 rule that `sessionMinutes` has |
| Week / last 24 h | measured.selectors.ts:339 `weekFigures` over `measurements.takeLog` | take log, not chapter recordedSeconds | chart's cumulative line (`recordedSeries`, :310) is also take-log; chart's last point is overwritten with chapters' `recordedHours` (ProgressChart.tsx `actual`) so the line mixes two sources |
| Plan start | measured.selectors.ts:297 `planStart(today)` = 1st of current month | recomputed every month | moves when the month changes |
| Milestone remaining | schedule/progress.ts:98 `remainFor` | independent of `calc` | |
| Chapter lengths for own pace | measurements.chapterLengths (TargetInfoButton.tsx:24,52) | a third "measured length" source, not `recordedSeconds` | |

### 2.4 Chapter naming / headings

| Where | File:line | Function | Output form |
| - | - | - | - |
| Pipeline row names, jump-menu rows, rows' aria names, Master/Delivery rows, readiness title | pipelineRows.ts:265, useProductionPageCommands.ts:49, masterqc/files/rows.ts:52,170, delivery/page/chapterStates.ts:30, readiness/ReadinessPanel.tsx:91 | `chapterName(.., 'full'|'short')` (chapterName.ts:64) | "Title — Subtitle" / title |
| Row context menu heading, Next up, `nameOf` (check tooltips, timer notice), Master chapter bar & checks title | useChapterTools.tsx:195,212; ProductionPage.tsx:209,465; MasterPage.tsx:209,311 | `headingName` (chapterHeading.ts:34) | "CHAPTER VIII. Title" / "Chapter 3: Title" |
| Result | | | same chapter named two ways on one page (table vs menu/Next up/tooltips) |

### 2.5 Export / render / delete / clear

| Capability | Locations | Implementation |
| - | - | - |
| Status report export | ReportDialog.tsx:69 (+ jump menu `action.export`) | `production.productionStatusReport(include)`, preview `productionStatusReportPreview` |
| Delivery (QC) report export | master/ReportExportPanel.tsx:33 | `api.deliveryExportReport(includePaths)` |
| Render/encode/master | MasterPage.tsx:253 + MasterToSpecPanel.tsx:81,84 | `api.exportPickFiles`, `api.exportStart`, `api.exportCancel`; state `api.exportState` polled by `useExportJobs` (Master) AND `port.exportState` polled by `useHostRead` in Delivery (useDeliveryBuild.ts:237) |
| Package build | Delivery OutputPanel.tsx:113 -> `renderEncodeMaster.packageStart` (single profile, host folder picker); Master MultiPlatformExportPanel.tsx:137 -> `api.packageStartMulti`; Master `useExportJobs.startPackage/cancelPackage/packageJob` exist (useExportJobs.ts:138-147) but nothing draws them | two paths; single-package UI only on Delivery |
| Measure (QC) | MeasureRun.tsx (`measureAnalyze`) triggered from Master only; Delivery/Production/nav only read `measureState` | three readers (MasterPage `useMeasureRun`, Delivery `useDeliveryChecks`, `usePipelineSources`, `useNavCounts`) with different re-read triggers: Master polls 500 ms while running (MeasureRun.tsx:412), Delivery 500 ms + `job:ended` (useHostRead), Production once per `manuscriptKey` (usePipelineSources.ts:77), nav once per pathname (useNavCounts.ts:61) |
| Diagnostics | DiagnosticsSection.tsx:196 | `api.diagnosticsAnalyze` |
| Delete / clear data | Remove from recording (reclassify to `reference`): ChapterTrackPanel.tsx:302 -> `manuscriptSetChapterKind`; Restore: RemovedFromRecordingList.tsx:39. Replace manuscript (clears Story Bible, notes, bookmarks, proofing results): ManuscriptImport.tsx:240-241 (`found` branch), not drawn on Production; Milestone remove SchedulePage.tsx:185. No delete of timer sessions, takes, measurements or reports in this area | |

### 2.6 Can copies disagree? Summary

| Quantity | One implementation? | Disagree risk |
| - | - | - |
| Chapter status stage names/labels | yes (chapterStatus.ts) | none |
| Stage ordering / done thresholds | no, 4 copies (pipelineRows.ts:83, progress.ts:18, overviewFigures.ts:165, pipelineRows.ts:243) | latent |
| Narrated chapter set | no: ProductionPage.tsx:67, progress.ts:15 (keeps opening), MasterPage.tsx:93, TargetInfoButton.tsx:41 (keeps opening), overview.go:183 (Go) | Production header/KPI vs Schedule totals differ when any `opening` chapter exists |
| Per-chapter "mastered/QC" | `masterByChapter` shared by Production + nav; `chapterStates` for Delivery + Master package; `buildChapterRows` for Master table | verdict agrees (all `fileVerdict`); mastered semantics and chapter sets differ (see 3.5) |
| "Recorded %" | no: Record cell (recordedThrough), Next up (seconds/WPH), StageBar (seconds/WPH + status), Booth/Editing/Proof (`recordedThrough.ts`) | yes |
| Pickups count | filter shared, state copies | transient only |
| Fail count | KPI `deliveryCounts` (narration only, no credits), nav (all chapters + credits), Next up (`failingChapter`, needs profile), Delivery `readinessCounts`, Master `packageCounts` (+ strays) | yes: rail badge vs KPI vs Delivery |
| Proof open count | nav (`findingsSummary`), pipeline cell (`findingsList`), Proof page (summary + pickups beyond notes) | yes |
| Hours totals | `calc` + `WPH` | basis ignored (3.1) |

## 3. Suspicious controls

1. **Schedule basis toggle does nothing downstream.** `TargetPopover.tsx:62` -> `production.setProductionRateBasis` (TargetInfoButton.tsx:71) persists `plan.rateBasis` (wailsClient.ts:596). `wphOf` (pace.selectors.ts:41) has no caller; ProductionPage.tsx:410/424/484 and SchedulePage.tsx:239 pass `WPH` and `calc` defaults to `WPH`. Only the popover's own highlighted cell changes. Label "Schedule basis" implies the schedule changes. `docs` comment in estimates.ts says the Production chart and popover import from there; basis is never applied.
2. **KPI tile "Recorded audio" opens Script** (overviewFigures.ts:102), "Editing + proof" opens Editing only (:123). Tile for audio opens a text page; no tile reaches Proof.
3. **Report Format toggle** (ReportDialog.tsx:118) changes only the preview pane and the displayed path (:121); Export writes both files (:69, copy at :110).
4. **Production cells and Next up "Inspect failed check" drop the chapter.** `onGo('master', id)` ends in `go('/master')` (ProductionPage.tsx:230) although Delivery deep-links the file (`onOpenInMaster(chapterId)`) and Master supports `focusFile` (MasterPage.tsx:116). Row menu "Open Master & QC" also has no chapter (useChapterTools.tsx:216). Master & QC opens on its first failing row, which may be a different chapter than the cell clicked.
5. **"Mastered" is not mastered.** `masterByChapter` (usePipelineSources.ts:38) sets `mastered = verdict !== 'none'`. A chapter that FAILS shows Master tick + QC FAIL; `stageSegments` counts it in "Delivered" hours (overviewFigures.ts:186-190, `master?.[id]?.mastered`). Delivery/Master call the same chapter "Fails N checks" and "Not mastered" only for no verdict.
6. **Same function, different labels.** `run.check()`: "Check files…" / "Re-check N files" (MeasureRun.tsx:485), table icon "Check the files again" (FilesTable.tsx:75), row menu "Check the files again" (:159). `jobs.pick()`: "Master all to spec…" (MasterPage.tsx:253) and "Add files…" (MasterToSpecPanel.tsx:81). `daw.playQuietest`/`openFile`: IconButtons (FileChecks.tsx:231,234) and row menu (FilesTable.tsx:151,157). `trackSelectInReaper`: row menu "Go to this chapter in <DAW>" and panel "Select in REAPER" (different wording and toast: "Selected in ${dawName}." vs "Selected in REAPER." with hard-coded REAPER, ChapterTrackPanel.tsx:101,226). `goToBooth(recordingChapter?.id)`: "Start session" (header, jump menu), `goToBooth(id)`: "Open Booth" (Next up, row menu, Record cell). "Check recordings": card icon and jump menu check stale+never; row menu, Readiness and credits panel check one chapter. Schedule Retry x2 (SchedulePage.tsx:68,208).
7. **Dead code in Master.** `useExportJobs` returns `startPackage`, `cancelPackage`, `packageJob`, `packageRunning`, `packageProblem` and polls `packageState` (useExportJobs.ts:70-84,138-147); only `packageRunning` is read (MultiPlatformExportPanel.tsx:100). Single-profile package build UI was moved to Delivery, which reads `exportState` separately, so Master's mastered/encoded file list and Delivery's `encoded` count are two independent polls of the same host job.
8. **Controls missing where expected.**
   - Delivery cannot start a measurement; its "Check again" only re-reads (Preflight.tsx:294). Re-measure requires Master & QC.
   - Master & QC, Delivery and Schedule register no jump-menu commands (Production does). "Build package", "Check files", "Add milestone", "Set due date" are not reachable from the jump menu.
   - Timer can be started only from a Next up item (NextUp.tsx:58); no row-menu or jump-menu "Start timer", though "Stop timer" exists in both header and jump menu.
   - Schedule chart has no "Open Production"; Production chart has "Open schedule" only.
   - Replace manuscript is not on Production when a manuscript exists (ManuscriptImport.tsx:240 builds the button, ProductionPage.tsx:306 uses it only in `!found`); lives in Settings.
   - Schedule payment/amount changes give no Undo toast (only Remove milestone and Add milestone do, SchedulePage.tsx:159,185), though all are journalled.
   - Production has no refresh button for the pipeline (re-read is via focus, jump-menu "Read the stage suggestions again", or navigation).
9. **Stage suggestion options / Recording check rules** (ProductionPage.tsx:452-453) have no visible control; they open only from jump-menu commands registered by `ProofOptions` (ProofOptions.tsx:128). Undiscoverable except via the jump menu.
10. **`StageSuggestion` / `StageEvidence`** (stages/StageSuggestion.tsx, StageEvidence.tsx) are drawn only by `proof/ProofingStagePanel.tsx`, not by Production, whose equivalent is `ReadinessPanel`: two UIs for Confirm/Dismiss/Revert/Why with different labels (`Confirm <title> as <target>` aria-labels vs plain "Confirm").
11. **`fileOf` matching** (master/chapterFile.ts:9-15): `name.includes(title)` for any chapter title, so short titles ("I", "A") claim unrelated files; first chapter in list wins. All five pairing sites share this (usePipelineSources.ts:34, useNavCounts.ts:46, rows.ts:166, chapterStates.ts:30, nextUpSources.ts:422), so it fails identically everywhere, but `masterByChapter`/`chapterStates` do not exclude the retail sample while `buildChapterRows` does (rows.ts:168).
12. **Labels that do not match behaviour.** Verdict pill "button" has tooltip "Open the schedule" while visually a badge (PageHeader.tsx:82). Pickups cell is plain text before status >= editing, so Pickups cannot be reached from a not-yet-recorded row. Header "Stop timer" appears only when running; the jump-menu entry stays listed disabled. `StageCell` for `none` Prep cell "Not measured yet" is a button that goes to Script.
