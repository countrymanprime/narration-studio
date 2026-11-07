# Inventory A: Production (+Schedule), Script, Story Bible, Booth

Sources: docs/research/ui-function-audit/inventory-{production-delivery,script-storybible,booth,shell}.md (dated 2026-11-01), re-checked against HEAD 38d00e1 (2026-11-03). Paths relative to `src/studio/ui/src/components/` (`C/`) unless noted. `port.x`/`api.x` = host binding via `usePort('x')`/`useApi()`. Line numbers are from the audit; spot-checked, may drift by a few lines.

Drift found since the audit (code is newer than the docs):
- Booth now has a **Voice control** (record each voice on its own track; Num+/Num-/Num. and Num 1-9 keys; #2812). Not in the audit.
- Script "Hear" is no longer a stub: `script/page/data/useScriptHear.ts` -> `storyBible.guidePreview` via shared `storybible/useHearEntry`. Script WordCard "Record my own clip" and Story Bible "Record my own clip" are still toast-only stubs.
- Schedule rate-basis: `wphOf` now has a caller (`schedule/useEffectiveWph.ts:41`), so the audit's "basis does nothing" item is stale.
- Companion Record-in-REAPER toggle/confirm removed (#2717). Booth context-menu "Punch and roll" now uses `punchAndRoll` (`useBoothPage.ts:663`), same gated function as key R (audit item fixed).
- Host take-review/take-comparison bindings deleted (#2800); not used by these pages.
- Production/Schedule/Story Bible how-to prose moved behind a `?` (#2709, #2705): not actions.

---

## 1. Production (+ Schedule)

Task context: see whether the book is on pace (hours recorded/edited/proofed vs due date), pick what to do next, link chapters to DAW tracks, check recordings, and export a status report; Schedule holds due date, pay, milestones.

### 1a. Production page (`C/production/ProductionPage.tsx`)

| Action (label) | Kind | Host binding | Source file:line | Also reachable from |
| - | - | - | - | - |
| Verdict pill "Open the schedule" | button | none (nav `/schedule`) | production/pipeline/PageHeader.tsx:82 | KPI "Due", chart calendar button, NoManuscript "Set a due date" |
| Stop timer | button + command `action.stop` | `api.productionStopTimer` | pipeline/useStageTimer.ts:42; PageHeader.tsx:101 | jump menu "Stop timer" (disabled when idle) |
| Start timer (Next up only) | button | `api.productionStartTimer(chapterId, stage)` | pipeline/useStageTimer.ts:25; NextUp.tsx:58 | none (no row-menu/jump entry) |
| Export status report | icon button + command `action.export` | `production.productionStatusReportPreview`, `production.productionStatusReport` (writes HTML+JSON) | report/ReportDialog.tsx:60,69; PageHeader.tsx:105 | jump menu |
| Start session | button + command `action.session` | none (nav Booth; gated by `daw.capabilities.record`) | PageHeader.tsx:106; useProductionPageCommands.ts:78 | jump menu (same label) |
| DAW not connected chip -> Connection dialog (Check again / Start DAW / link) | chip + dialog | `daw.capabilities` (check again); `project.launchDaw`, `project.linkDawFile` via dialog | pipeline/DawIndicator.tsx:16; ProductionPage.tsx:363; connection/ReaperOffDialog.tsx | Booth setup chip, Engine panel, Settings DAW |
| Retry (load error) | button | `production.productionOverview/productionPlan` | ProductionPage.tsx:345 | none |
| KPI tiles: Recorded audio (-> Script), Recording (-> Booth), Editing+proof (-> Editing), Open pickups (-> Pickups), Delivery check (-> Master), Due (-> Schedule) | buttons | none (nav) | overview/KpiRow.tsx; overviewFigures.ts:101-143 | sidebar nav |
| Finished-hour target (info) + Schedule basis toggle Standard/Your pace | icon button, popover | `production.setProductionRateBasis`; reads `measurements.chapterLengths` | target/TargetInfoButton.tsx:71; TargetPopover.tsx:62 | none |
| Check recordings (card) | icon button + command `check.recordings` | `coverage.coverageStart` via dialog (see 1c) | overview/CheckCountsCard.tsx:179; ProductionPage.tsx:430; useProductionPageCommands.ts:61 | jump menu; row menu; readiness panel; credits panel; Proof, Pickups, Editing |
| Read the stage suggestions again | command `check.stages` | `api.stageRecommendations` | useProductionPageCommands.ts:67 | none visible; also 30 s focus refresh (stages/useRefreshOnFocus.ts) |
| Open schedule (chart) | icon button | none | overview/ProgressChart.tsx:110; ProductionPage.tsx:491 | verdict pill |
| Next up: Open Booth / Review pickups / Inspect failed check | buttons | none (nav; Inspect drops chapter id) | pipeline/NextUp.tsx:54,75,88 | pipeline cells |
| Pipeline cells: Prep->Script, Record->Booth, Edit->Editing check panel (`api.editingState/editingCandidates`), Proof->/proof?chapter=, Pickups, Master, QC | buttons | none (nav) except Edit panel | pipeline/PipelineTable.tsx:97; pipelineRows.ts:162-235 | KPI tiles |
| Readiness chip -> panel: Confirm / Dismiss / Revert / Check recordings... / Check now | chip + slide-over | `api.stageConfirm`, `stageDismiss`, `stageRevert`, `stageRecommendations` | readiness/ReadinessChip.tsx:32; ReadinessPanel.tsx:78-86; stages/useStageRecommendations.ts:69-73 | Proof stage panel (`StageSuggestion`) |
| Row context menu: Open prep in Script / Open in Booth / Open Proof / Open Master & QC | menu | none (nav) | useChapterTools.tsx:195-216 | pipeline cells |
| Row menu: Go to this chapter in <DAW> (DAW) | menu | `api.trackSelectInReaper(guid)` | useChapterTools.tsx:118 | ChapterTrackPanel "Select in REAPER" |
| Row menu: Chapter track... -> slide-over (play/skip 30 s, Select in REAPER, Keep this one, Link, Another track, Unlink) (DAW) | menu + panel | `api.trackSelectInReaper`, `api.chapterTrackSet`, `api.chapterTrackUnlink`, `api.mediaUrl` (playback) | production/ChapterTrackPanel.tsx:100,113,126,211-290 | Booth ChapterLinkDialog, Editing check panel, Engine panel `/tracks` |
| Row menu: Remove from recording... / Restore | menu + dialog + list button | `api.manuscriptSetChapterKind(id,'reference'/'narration')` | useChapterTools.tsx:136,147; RemoveFromRecordingDialog.tsx; RemovedFromRecordingList.tsx:39 | none |
| Row menu: Check recordings... | menu | `coverage.*` via `openCheckRecordings([id])` | useChapterTools.tsx:168,230 | see above |
| Row menu: Editing check... (DAW link + editing job) | menu + panel | `api.chapterTrackMapConfirm`, `editingCandidates`, `editingSetSourceChoice`, `editingStart`, `editingCancel`, `editingState`, `stageRecommendations` | editing/EditingCheckPanel.tsx:94,250-340; useChapterTools.tsx:231 | Editing page |
| Row menu: Set status: Not Started/Recording/Editing/Proofing/Finalized | menu | `api.manuscriptSetChapterStatus`; credits rows `credits.setCreditsStatus` | useChapterTools.tsx:104; useCreditsRows.ts | Credits row panel select |
| Row menu: Credits... -> panel (status select, Check recordings, Open in Script, Settings>Credits) | menu + panel | `credits.setCreditsStatus`; `coverage.*` | CreditsRowPanel.tsx:77-92 | Settings credits |
| Chapter-sync toast "Undo" (auto-link of tracks) (DAW) | toast action | `chapterSync.chapterSyncUndo(trackGuid)` | useChapterSyncToast.ts:43 | none |
| Jump-menu: chapter rows (focus pipeline row; supersedes global Go to chapter) | command | none | useProductionPageCommands.ts:47 | global `goto.chapter.*` hidden on this page |
| Import manuscript (empty state; also page command `action.import`) | button + command | `api.selectManuscript`, `api.manuscriptBeginImport`, `manuscriptImportCommit`, `manuscriptImportCancel`, `deliverySelectProfile`, `saveSettings(General)` | production/ManuscriptImport.tsx:204-308; ImportChooseDialog.tsx; ImportReview.tsx | shell `manuscript.import` (only navigates here); NeedManuscript on other pages; Replace manuscript only in Settings |
| Credits setup banner / dialog | banner + dialog | `api.creditsSetupDismiss`, `creditsSetupSave`, `saveSettings(General)` | credits/CreditsSetupBanner/Dialog (via ManuscriptImport.tsx:345-362) | Script page (same components) |
| Stage suggestion options; Recording check rules | jump-menu commands only (no visible button) | `saveSettings` (Production/StageRecommendations; Production/RecordingCoverage) | stages/StageSuggestionOptions.tsx:24; production/RecordingCheckRules.tsx:21; proof/proofOptions/ProofOptions.tsx:128 | Proof options |

### 1b. Schedule page (`C/schedule/SchedulePage.tsx`; no jump-menu page commands, no shortcuts)

| Action (label) | Kind | Host binding | Source file:line | Also reachable from |
| - | - | - | - | - |
| Retry (first read, re-read) | button x2 | `production.productionPlan/productionOverview`, `deliveryProfiles.deliveryProfiles`, `measurements.takeLog` | SchedulePage.tsx:68,208 (same `reload`) | none |
| How you are paid (select) | select | `production.setProductionPayment` (journalled) | schedule/ContractPanel.tsx:239; scheduleCommands.ts:64 | none |
| Rate per finished hour | text field | `production.setProductionDeadline(date, amount)` (+ `setProductionPayment`) | ContractPanel.tsx:253; scheduleCommands.ts:52 | none |
| Delivery due (Final row date) | date field | `production.setProductionDeadline(date, amount)` | MilestoneTable.tsx:118; scheduleCommands.ts:39 | none |
| Add milestone / Edit / dialog | icon button + dialog | `production.saveProductionMilestones` | SchedulePage.tsx:258; MilestoneTable.tsx:96; MilestoneDialog.tsx | none |
| Mark complete / Add-Edit note | icon buttons | `production.saveProductionMilestones` | MilestoneTable.tsx:84,88 | none |
| Remove milestone (+Undo toast) | icon button | `production.saveProductionMilestones` | MilestoneTable.tsx:97; SchedulePage.tsx:111 | undo history |
| WorkedOut panel, verdict pill, progress chart | section (read-only) | derived from plan | schedule/WorkedOut.tsx; VerdictPill.tsx; production/overview/ProgressChart.tsx | chart is also on Production (with Open schedule button) |

### 1c. Shared recording check (opened from Production; `C/recordingcheck/**`, single entry `openCheckRecordings(preselected,{extra,onClosed})` at openCheckRecordings.tsx:17)

| Action (label) | Kind | Host binding | Source file:line | Also reachable from |
| - | - | - | - | - |
| Check N chapters (analysis) | dialog primary | `coverage.coverageStart`, `coverageEngines`, `coverageWorkerPlan` | recordingcheck/CheckRecordingsDialog.tsx:144,450 | Production, Proof, Pickups, Editing, Credits panel |
| Stop checking | button | `coverage.coverageCancel` | RunningView.tsx:14; Dialog:228 | none |
| Run options (model, look again, chunk, overlap, workers, chapters at once) | section | settings only | RunOptions.tsx:45-131 | none |
| Result: Check again / Go to paragraph / Open in Editing | buttons | `coverage.coverageResult`, `coverageStart` | Dialog:331-344; CheckResult.tsx | Proof CheckCard |
| Refused row: link track (MappingConfirm) / audio engine panel link | button | `tracks.tracksList`, `chapterTrackMap.chapterTrackMapConfirm` | CheckResult.tsx:143-203 | ChapterTrackPanel uses `chapterTrackSet` instead |
| Whisper model download | prompt | `whisper.whisperInstall/State/Cancel` | Dialog:265-310 | Booth `ListeningModelPrompt` |
| Background check card Pause/Cancel/Hide/Resume + notice dialog | app-wide card | `system.saveSettings(RecordingCoverage)`, `coverage.coverageCancel` | recordingcheck/background/BackgroundChecks.tsx:86-117; App.tsx:1082 | any page (folded on /booth) |

---

## 2. Script

Task context: prep the book before recording: read each chapter, mark notes/queries, flag words and set how to say them, tie names to the Story Bible, attribute speakers, bookmark places, set "My prep" state, then jump to Booth.

Page commands (`script/page/registry/useScriptRegistry.ts:98`): Search next/prev/clear (only while Find open), Chapters: <chapter>, Story Bible: <entry>, "Mark the selection as <type>". Search sources: manuscript, marks, words (:81-83). Keys: Alt+Up/Down chapter, F3/Shift+F3, Left/Right prep (`script.prep.prev/next`), Esc, B / Alt+] / Alt+[ bookmarks (catalog commands.catalog.ts:287-343).

| Action (label) | Kind | Host binding | Source file:line | Also reachable from |
| - | - | - | - | - |
| Attribute speakers ("Find who speaks each line") (analysis, journalled, Undo) | button | `storyBible.guideAttributeSpeakers`; undo `guideRestoreSpeakers` | script/page/ScriptPage.tsx:500; data/scriptCommands.ts:339-350 | none (Story Bible has only per-cue correction) |
| Chapter row / credits row (go to) | list button | none (scroll) | script/page/chapters/ChapterList.tsx:~95; CreditsItem | jump menu Chapters; Alt+Up/Down; Production "Open prep in Script"; Story Bible AppearsIn |
| Chapter-list context menu: Go to / Record in Booth / My prep > states | menu | `scriptPrep.scriptPrepSetChapter` | registry/contextProvider.ts:186-196 | PrepSegment, Left/Right keys |
| My prep segmented (Not started / In progress / Prepped), also credits cards | segmented | `scriptPrep.scriptPrepSetChapter` (journalled) | chapters/PrepSegment.tsx:21; data/scriptCommands.ts | Production Prep column reads same list |
| Record in Booth (chapter / credits card) | icon button | none (nav `/booth?chapter=` or `?credits=`) | chapters/ChapterCard.tsx:83; CreditsSection.tsx:53 | Production Start session / Next up; selection tool "Record from here" |
| Record from here | selection tool + context menu | none (nav Booth with `from`) | tools/select/SelectionTool.tsx:160; contextProvider.ts:120-139 | Booth "Start from here" |
| Mark menu (mark types, "Pronunciation (a word)", "Define how you mark up...") | selection tool | `marks.marksAdd` (composer), `scriptPrep.scriptWordFlag`, `marks.marksSaveTypes` | tools/select/MarkMenu.tsx:30-37; MarkComposer.tsx; MarksDialog.tsx:84 | Settings > MarksPanel (same dialog); jump menu "Mark the selection as X" |
| Story Bible menu (add selection as kind) | selection tool | `storyBible.guideCreate(name,kind,[])` (undo `guideDelete`) | tools/select/KindMenu.tsx:18 | Story Bible "+ Add entry"; Bible tab "Create an entry" |
| Add a bookmark here (B) / Edit / Delete bookmark | tool, ribbon, key | `bookmarks` port (journalled) | script/bookmarks/ui/BookmarkEditor.tsx; model/useBookmarkCommands.ts:48 | Booth (same bookmark model) |
| Look up (selection) | tool | none (opens tab) | SelectionTool.tsx:171; ScriptPage.tsx:350 | context menu |
| Find in the manuscript (no visible bar) | command / context row | none (local search) | tools/find/findState.ts; useScriptRegistry.ts:81; `?find=` deep link ScriptPage.tsx:214 | Story Bible Find button and entry context menu navigate `/script?find=` |
| Speaker chip -> Speaker picker (Confirm "X") | chip + dialog | `storyBible.guideCorrectCue` (journalled) | reader/Para.tsx:34; tools/speaker/SpeakerPicker.tsx:63; scriptCommands.ts:326 | Booth SpeakerChip; Story Bible DialogueCueAttribution |
| Text settings (font, size, spacing, width) | popover | browser storage only | tools/text/TextSettings.tsx:61 | Booth text popover; Settings > Reader text |
| Words tab: Definition source menu | menu | `system.saveSettings(Script, definition_source)` | rail/words/DefinitionSourceMenu.tsx:17 | Settings |
| Words tab: Hear (row/card) (analysis) | icon button | `storyBible.guidePreview` via `useHearEntry` | rail/InThisChapter.tsx:60; data/useScriptHear.ts:16 | Story Bible row/entry play |
| Words tab: Record my own clip | icon button (STUB toast) | none | rail/words/WordCard.tsx:65 | Story Bible entry (also stub) |
| Words tab: "How I will say it" Save + source menu (pronunciation) | field, menu | `scriptPrep.scriptWordSay`, `pronunciationSources.pronunciationCandidate` | words/WordCard.tsx:470-482; storybible/source/SourceMenu.tsx:34 | Story Bible NamePronunciation (different store: entry vs word list) |
| Words tab: Definition block, Use, dictionary Download/Repair | section | `pronunciationOnline.pronunciationOnlineLookup`, `system` lookup, `assets.assetsInstall('dictionary')` | words/DefinitionBlock.tsx:132; script/dictionaryInstall.tsx:49 | Story Bible OnlinePronunciationLookup; Settings |
| Words tab: Look up on the web (Definition, Forvo, YouGlish) | links | `pronunciationLookup.pronunciationLookupOpen` | words/ExternalLinks.tsx:15 | none |
| Add to my words / Remove from my words | button, context menu | `scriptPrep.scriptWordFlag` / `scriptWordUnflag` | WordCard.tsx:100; contextProvider.ts:162,213 | selection Mark menu |
| Bible tab: Find, Add a note (STUB toast), Open in Story Bible | icon buttons | none | rail/bible/EntryCard.tsx:80-82 | Story Bible page |
| Bible tab: Create an entry (miss card) | icon menu | `storyBible.guideCreate` (undo `guideDelete`) | bible/BiblePanel.tsx:78 | Story Bible Add entry |
| Notes tab: Type, Show, Copy, Delete note, Edit/Delete message, Reply, Reopen, Mark resolved | buttons | `marks.marksAdd/Remove/Reply/SetStatus/...` (journalled) | rail/threads/NoteCard.tsx:96-163; ThreadsTab.tsx | Booth Reference/notes display only |
| Credits setup banner / dialog | banner + dialog | `credits.creditsSetupState`, `api.creditsSetupDismiss/Save`, `saveSettings(General)` | credits/CreditsSetupBanner.tsx:56; CreditsSetupDialog.tsx:110-160; ScriptPage.tsx:626 | Production import (same components, separate state) |
| Chapters drawer / side-panel drawer toggles, Retry, Skip to side panel | buttons | `manuscript.manuscriptChapters` (retry) | ScriptPage.tsx:492,493; layout/SkipToRail.tsx | none |
| Empty state "Import" | button | none (nav `/`) | ScriptPage.tsx:95 | Production import |

No Script control touches the DAW directly (no sync, link, markers, scan or export); Script reaches the DAW only through Booth.

---

## 3. Story Bible

Task context: review and curate the cast/places/organisations extracted from the manuscript (names, aliases, pronunciation, relationships, voice samples/references, speaker colour) and run extraction scans or imports.

Page commands: Entries by name/alias (`storybible/Guide.tsx:341`); keys `storybible.entry.next/prev`; Ctrl+F opens this page's jump menu.

| Action (label) | Kind | Host binding | Source file:line | Also reachable from |
| - | - | - | - | - |
| + Add entry | button | `api.guideCreate` (after category chosen) | storybible/Guide.tsx:381 | Script selection Story Bible menu, Bible-tab Create an entry |
| More actions > Scan the manuscript (analysis) | menu item | `extraction.extractionSources`, `extractionScan`, poll `extractionScanState`; first-scan prompt reads `system.settingsForScope`, `assets.assetsList` | storybible/ActionsMenu.tsx:21; suggested/scan/useStartScan.tsx:42-87; AnalysisPrompt.tsx:18 | Settings analysis tools (consent/install) |
| Cancel scan / Scan incomplete badge | button | `extraction.extractionScanCancel` | suggested/panel/ScanStatus.tsx:38 | none |
| More actions > Import entries (import, Undo) | menu item + dialog | `extraction.extractionImportPrompt`, `extractionImportCommit`, `extractionImportUndo` | ActionsMenu.tsx:22; suggested/import/ImportDialog.tsx:~228-345 | scan prompt "Import from a file instead" |
| More actions > Voice data (cleanup) | menu item + drawer | `voiceSamples.voiceSamplesRemoveAll`; `api.characterRemoveVoiceData` | ActionsMenu.tsx:23; VoiceDataPanel.tsx:132,135 | Settings "Delete Story Bible data" |
| Search, Filter menu (kind, pronunciation, show), Sort menu, Clear filters | field/menus | none (local; sort in browser storage) | Guide.tsx:391; FilterMenu.tsx:52-142; SortMenu.tsx:21 | none |
| Entry row open; Hear (name) | row button | `api.guidePreview` (via `usePreviewAudio`) | EntryTable.tsx:185,322 | Script Words/Bible rows Hear (`useHearEntry`) |
| Entry context menu: Open / Find in the manuscript / Mark reviewed / Delete entry | menu | nav `/script?find=`; `api.guideMarkReviewed`; `api.guideDelete` | Guide.tsx:315-331 | GuideDetail buttons |
| Read notices / Retry / unknown-link alert (Go to Production) | buttons | `api.guideEntities`, `api.guideTypes` | ReadNotice.tsx:17; Guide.tsx:358,428-443 | none |
| Entry: Mark reviewed | button | `api.guideMarkReviewed(id)`; Undo `api.guideFlagReview` | GuideDetail.tsx:708 | context menu |
| Entry: Find in the manuscript | icon button | nav `/script?find=` | GuideDetail.tsx:184 | Script jump menu/context menus |
| Entry: Lock/Unlock; Edit; Save; Cancel; Delete (confirm) | icon buttons | `api.guideSetLocked`, `guideEdit`, `guideDelete` | GuideDetail.tsx:716-769,1065 | none |
| Kind chip menu | menu | `api.guideCreate` (draft) / `api.guideEdit({category})` | GuideDetail.tsx:665 | Settings types panel |
| Names: mark alias reviewed, remove alias, add name, Merge into this entry (Undo) | buttons | `api.guideMarkReviewed(id,i)`, `guideEdit({aliases})`, `guideMerge`, undo `guideUnmerge` | GuideDetail.tsx:604,828,838,892,904 | none |
| Play preview / alias pronunciation; voice download prompt | icon button | `api.guidePreview`; `api.ttsInstall/ttsInstallState/ttsInstallCancel` | GuideDetail.tsx:863,1038 | Script Hear |
| Record my own clip | icon button (STUB `notify`) | none | GuideDetail.tsx:941 | Script WordCard Record (stub) |
| Pronunciation field/source/alternate (Use mine / Use dictionary's) | field, menu | `api.guidePronounceUser`, `guidePronounce`, `guidePronunciationUseAlternate`, `pronunciationSources.pronunciationCandidate` | storybible/source/NamePronunciation.tsx:~84-190 | Script WordCard "How I will say it" (different record) |
| Look up online (Merriam-Webster, Use this); Listen on Commons | disclosure | `api.pronunciationOnlineLookup`, `api.pronunciationCommonsAudioOpen` | OnlinePronunciationLookup.tsx; CommonsAudioLookup.tsx:31 | Script ExternalLinks/DefinitionBlock |
| Description / talk / personality / context / properties editor | fields | `api.guideEdit` | GuideDetail.tsx:926-995; PropertiesSection.tsx | none |
| Speaker colour | select | `api.guideSetSpeakerColor` | SpeakerColourField.tsx:35 | none |
| Voice samples (Rename, Make primary, Move to character, Delete, Open in Editing, Mark again in Editing, Check again) (DAW-derived) | list + menu | `voiceSamples.voiceSampleSetPrimary/Update/...`, DAW state via useVoiceSamples | storybible/voicesamples/VoiceSampleRow.tsx:67-156; VoiceSamplesBody.tsx:145,159; useVoiceSampleActions.tsx | Booth side panel plays them; Editing creates them |
| Voice references: choose region, Approve, Revoke | section | `api.characterListRegions`, `characterReferences`, `characterApprove`, `characterRevoke` | VoiceReferencesSection.tsx:103,125 | none |
| Dialogue cues: speaker select per cue | select | `api.guideCorrectCue` (not journalled) | DialogueCueAttribution.tsx:84 | Script picker, Booth SpeakerChip |
| Suggested claims: accept / mark reviewed / edit / reject (journalled) | icon buttons | `extraction.extractionAccept/Reject/Review` (undo `extractionReopen`) | suggested/row/SuggestionRow.tsx:96-128 | none |
| Relationships: add, change, remove | dialog/buttons | `api.guideRelate`, `api.guideUnrelate` | Relationships.tsx:134-359 | none |
| Appears in: go to chapter; Rescan | button | nav `/script#c<id>`; `api.guideRescan(id)` | AppearsIn.tsx:43; GuideDetail.tsx:1023 | none |

No Story Bible control touches the DAW directly; Voice samples/references derive from Editing marks and approved regions. No export action exists on the page.

---

## 4. Booth (`C/booth/page/BoothNextPage.tsx`; scope `booth`)

Task context: record the chapter: large text that follows the narrator's voice, Record/Stop (DAW or built-in recorder), punch-and-roll, pickups session, voices/tracks, levels/mic, and fix link/connection problems before a take.

Page commands (`booth/page/useBoothPageCommands.ts:37-126`): Chapters: <chapter> (disabled while recording; supersedes), Transport: Record/Stop recording, Punch and roll from here, Next phrase, Back one phrase, Start/Stop cold read, Pickups: Next/Previous pickup, Booth: Leave the Booth; Ctrl+F manuscript search source (useBoothFind.ts). Keys (commands.catalog.ts): Space `reading.toggle`, Up/Down phrase, Left/Right word, R `booth.roll`, PageUp/PageDown, =/- text size, Num 1-9 + Num+ / Num- / Num. (`booth.voice.*`, catalog :495-510), V `booth.voice-sample`, Esc `booth.exit`, N / Shift+N pickups, F11 fullscreen, B / Alt+] / Alt+[ bookmarks.

| Action (label) | Kind | Host binding | Source file:line | Also reachable from |
| - | - | - | - | - |
| Record / Stop (DAW) | button `brec` + key Space + command | `daw.recordStart(chapterId, at)` / `daw.recordStop()`; `teleprompter.teleprompterStart/Stop` for follow | booth/record/RecordControl.tsx:20; useRecordControl.ts:445; useBoothPage.ts:545 | jump menu; Space; pedal; Production "Start session" only navigates |
| Punch and roll (R) / Start from here / Roll confirm | key, context menu, command | `daw.roll(to,{confirmed})` | booth/roll/useRoll.ts:90,123; useBoothPage.ts:617,663 | jump menu "Punch and roll from here" |
| Cold read | button `bcold` + command | `api.teleprompterStart({coldRead})`, `teleprompterStop` | frame/BoothFooter.tsx:133; useBoothPage.ts:512 | jump menu |
| Voice control (choose the voice/track to record; Num keys) (DAW) | button + popover + keys | `voiceTracks.boothVoiceGet(chapterId)`, `voiceTracks.boothVoiceSet(chapterId, guid)` | booth/voices/VoiceControl.tsx; useBoothVoices.ts:70,118 | keys `booth.voice.next/prev/list`; Engine panel voice layout (engine/voiceLayout) |
| Chapter picker / prev / next | stepper | none (URL `?chapter=`), refuses while recording | primitives/ChapterStepper.tsx; BoothNextPage.tsx:501,566 | jump menu chapters; Script/Production nav |
| Resume chip / Recorded-through chip | chip | `teleprompter.teleprompterLocate`; `manuscript.manuscriptChapters` | booth/resume/ResumeOffer.tsx:29; RecordedThroughChip.tsx | Companion ResumePrompt (own implementation) |
| Recording setup chip -> /settings#recording | chip | `dawChoice.dawChoice()`, `daw.capabilities`, `project.unsavedChanges` | booth/record/SetupChip.tsx:81 | Production DAW chip, Engine chip |
| Setup notice: <DAW> not connected / other project (Start DAW, Link the open project, Check again, DAW settings) (DAW) | chip + dialog | `project.launchDaw`, `project.linkDawFile`, `system.saveSettings(DAW)`, `daw.capabilities` | booth/record/RecordSetup.tsx:154-292; connection/ReaperOffDialog.tsx; connection/useReaperLaunch.ts; linkDawFile.tsx | Production DAW chip (same dialog), Settings DAW, Engine panel |
| Chapter-link chip -> Chapter link dialog (Link track, Create a new track, Check again) (DAW) | chip + dialog | `chapterTrackMap.chapterTrackMatch/MapList/Set/Create` | booth/record/ChapterLinkNotice.tsx:45; connection/ChapterLinkDialog.tsx:61-111 | Production ChapterTrackPanel; Editing check panel; recording-check refused row |
| Check again (record gate toast; Voices section) (DAW) | toast action, link | `daw.capabilities`, `teleprompter.readAloudReaperState`, `system.bootstrap` re-read | BoothNextPage.tsx:563; useRecordControl.ts; side/VoicesInChapter.tsx:54 | Production connection dialog; Engine panel |
| Levels menu: mic select, DAW candidate mics, Choose a different one / Use <DAW>'s input, monitor level, DAW meters, punch pre-roll (DAW) | popover | `recording.recorderDevices`, `teleprompter.teleprompterMeterStart/Stop`, `system.saveSettings(Teleprompter)`, `dawLevels.dawMonitorLevel/dawSetMonitorLevel/dawPunchPreroll` | booth/frame/LevelsMenu.tsx:93-452; useMonitorLevel.ts:45,64; usePunchPreroll.ts:54 | Settings MicBody and PageSettingPanel; Editing output reuses `useMonitorLevel` |
| Input level slider | slider (permanently disabled STUB) | none | LevelsMenu.tsx:312 | none |
| Room tone chip/meter (analysis) | chip | `measurements.roomTone(mic)` every 5 s | frame/BoothFooter.tsx:30; LevelsMenu.tsx:452 | Settings room tone |
| Text settings (font, size, width) | popover | browser storage | frame/BoothTop.tsx:33-55 | Script text settings; Settings > Reader text |
| Side-panel toggle | icon button | none | BoothTop.tsx:126 | none |
| Click word (seek); Speaker chip (change speaker, Confirm, play sample) | text/chip | `api.teleprompterSeek`; `storyBible.guideCorrectCue` | reading/BoothText.tsx:144; reading/SpeakerChip.tsx:90 | Script picker; Story Bible cue select |
| Bookmark here / Read to here / ribbons edit-delete | context menu, key B | `bookmarks` port (journalled) | bookmarks/useBoothBookmarks.ts:137-168 | Script bookmarks (same model) |
| Pickup session card jump; Dismiss (pickups) (DAW) | side-panel buttons | `pickups.pickupsRemove(id)` (no Undo) | booth/pickups/PickupSession.tsx:47,54; usePickupSession.ts:158 | Pickups page (list, "Open N in Booth"); jump menu Next/Prev pickup; N / Shift+N |
| Suspected lines: dismiss (+Undo), auto-save flags (analysis) | side-panel | `teleprompter.teleprompterSaveFlags`, `findings.findingsReview` | booth/suspected/SuspectedLines.tsx:94; useSuspectedPickups.ts | Companion saves same flags (CompanionHost.tsx:86) |
| Reference: Open in Story Bible | icon button | none (nav `/story-bible#id`) | side/Reference.tsx:25 | Script Bible tab |
| Voices in chapter: play primary / sample / N samples / Check again | side-panel | `voiceSamples.voiceSampleMediaUrl` (playback via singleton store) | side/VoicesInChapter.tsx:54-140; samples/useBoothSamples.ts | Key V; SpeakerChip; Story Bible/Editing players (unguarded) |
| This session / Last punch / Coming up | side-panel text | none | side/SessionNumbers.tsx; ComingUp.tsx | none |
| Stop recording? leave guard (Stop / Keep recording) (DAW) | dialog | `daw.recordStop`, `passageMap.passageMapRecordRun` (flush), journal take entry | booth/leave/useBoothLeaveGuard.ts:42; page/useBoothPage.ts:412 | Exit, nav, Esc |
| Take saved toast Undo | toast action | journal undo | useBoothPage.ts | undo history |
| Listening model download prompt | dialog | `api.assetsInstall/State/Cancel` | booth/listening/ListeningModelPrompt.tsx; useTeleprompterSession.ts:148 | Companion WhisperModelPrompt; Check dialog; Settings |
| Context menu: Start from here, Bookmark here, Read to here, Next/Back phrase, Punch and roll, Larger/Smaller text, Exit Booth | menu | see rows above | useBoothPage.ts:577-605 | keys |
| Credits warning chip -> /settings#credits; Retry/Leave on load error; BoothUnavailable | chip/buttons | `manuscript.manuscriptChapters` | page/CreditsWarning.tsx:15; BoothNextPage.tsx:188; BoothUnavailable.tsx:32 | Companion UnresolvedCreditsWarning |
| Fullscreen (F11) | key | `hostWindow.toggleFullscreen` | booth/useFullscreenKey.ts:12 | none |
| Companion (`/companion`, Ctrl/Cmd+Alt+C): Pin window, Full app, Play/Pause, Stop reading, Follow, Resume prompt, Pickups summary | page | `api.companionModeEnter/Exit`, `teleprompterStart/Pause/Stop/Seek/Locate`, `readAloudRecordStop`, `productionOverview` | booth/CompanionShell.tsx:71-209; companion/CompanionHost.tsx; ResumePrompt.tsx; CompanionThisChapter.tsx | Booth (parallel reading UI; no record control) |

Booth has no Recording-check entry point and no link to Editing for "mark a voice sample" (hint text only). Pickups-to-DAW markers/export (`pickupsExport`, "Add N as markers in <DAW>") live on the Pickups page (`C/pickups/usePickupsPageCommands.ts:27`), not Booth; Booth only consumes the session list.

---

## Duplicates / near-duplicates noticed

- **Select chapter's track in DAW**: row menu "Go to this chapter in <DAW>" (useChapterTools.tsx:118) and ChapterTrackPanel "Select in REAPER" (ChapterTrackPanel.tsx:100) both call `api.trackSelectInReaper` with different labels and toast text.
- **Chapter-to-track link written three ways**: Production panel `chapterTrackSet`/`chapterTrackUnlink`; Booth ChapterLinkDialog `chapterTrackSet`/`chapterTrackCreate`; recording-check refused row and EditingCheckPanel `chapterTrackMapConfirm` (MappingConfirm, `onClear` is a no-op in the check). Only Booth can create a track.
- **Check recordings**: one launcher (`openCheckRecordings`) but at least five Production entry points (card, jump menu, row menu, readiness panel, credits panel) and different availability gates (Production `caps.reachable`; dialog `useCapability('review')`; chapter lists from `chapterSync` vs `recordedChapters`). Booth has none.
- **"Check again" for the DAW**: Production ConnectionResolveDialog (`daw.capabilities`), Booth `control.checkAgain` (toast, Voices, setup dialog, own bootstrap copy), Engine panel `refreshBootstrap`; Booth's copy goes stale vs the app's after linking.
- **DAW-off / link dialog**: Production and Booth share `ConnectionResolveDialog`/`useLinkDawFile`, but each keeps its own open-once state and Booth its own bootstrap.
- **Stage Confirm/Dismiss/Revert**: Production ReadinessPanel (plain labels) vs Proof ProofingStagePanel/StageSuggestion (aria-labelled), both `api.stageConfirm/Dismiss/Revert`.
- **Create Story Bible entry**: Script selection "Story Bible" menu, Script Bible-tab "Create an entry", Story Bible "+ Add entry" (`guideCreate`); Script's undo calls `guideDelete`, Story Bible delete has no journal.
- **Speaker correction**: Script SpeakerPicker (journalled), Booth SpeakerChip, Story Bible DialogueCueAttribution (not journalled) all call `guideCorrectCue`; `guideAttributeSpeakers` exists only in Script.
- **Hear a name**: Story Bible `usePreviewAudio` and Script `useScriptHear` (via `useHearEntry`) both call `guidePreview`; Script says "open the name in Story Bible to install the voice" instead of prompting. "Record my own clip" is a toast stub in both Script WordCard and GuideDetail.
- **Pronunciation stored in two places**: Script WordCard `scriptWordSay` (word list) vs Story Bible `guidePronounce*` (entry); same source menu and lookup components, different records.
- **Find in manuscript**: Script jump/context rows, EntryCard icon, Story Bible GuideDetail icon and entry context menu; all end at `/script?find=` or `openFind`; catalog hint "Ctrl+F" actually opens the jump menu.
- **Mark reviewed** x3 meanings (entry, alias, suggestion) with the same label/icon; **Delete entry** named "Delete entity" / "Delete entry".
- **Dismiss**: Booth pickup dismiss (`pickupsRemove`, no Undo) vs Suspected dismiss (`teleprompterSaveFlags`, Undo).
- **Text settings**: Script TextSettings, Booth BoothTop popover, Settings Reader text (font/width shared pref; Booth size separate key).
- **Mic / pre-roll / definition source**: Booth LevelsMenu vs Settings (MicBody, PageSettingPanel); Script DefinitionSourceMenu vs Settings.
- **Credits setup banner/dialog**: same components on Production and Script with separate state; credits rows read via `useCreditsRows` (Production) vs `useScriptCredits` (Script).
- **Import manuscript**: Production page command opens the dialog; shell `manuscript.import` only navigates to `/` (two palette rows on empty Production); other pages' NeedManuscript just navigate.
- **Start session**: header button and jump-menu command share a label; both only navigate to Booth.
- **Schedule Retry** appears at two sites calling one `reload`; schedule chart exists on both pages, button to Schedule only on Production.
- **Companion vs Booth reading**: separate teleprompter/resume UIs (`ResumePrompt` vs `ResumeOffer`) over the same `teleprompter*` host calls.
- **Booth record-state**: "is recording" has several sources (`useRecordControl`, DAW session store, `useBoothRecording`); Story Bible/Editing sample players run unguarded while the Booth's block during recording.
