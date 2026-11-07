# Inventory B: Editing, Proof (check card, compare, pickups), Master & QC, Delivery

Built from the three function-audit inventories (`docs/research/ui-function-audit/inventory-{editing-proof,production-delivery,shell}.md`), the state-matrix and design notes named in the brief, the PRDs and guides, and a spot-check of the current tree (HEAD `38d00e1`, 2026-11-03). Spot-checks: `daw.*`, `findings*`, `pickups*`, `export*`/`package*`, `cleanupToolsLaunch`, the Engine panel buttons, `usePageCommands` users, `EnginePanelLink` users and the Master, Delivery and Pickups labels all still exist. Line numbers are the audit's (branch `claude/ui-function-audit`). Master, Delivery, Cleanup and Pickups lines were re-found and match to within a few lines; other lines may have drifted a little (Pickups handler lines in `PickupsPage.tsx` have moved about +50). New since the audit: Proof Inspector `TreatAsSame` (#2807, `proof/inspector/TreatAsSame.tsx`, `transcriptAddEquivalence`); the take-review/take-comparison bindings were deleted (#2800).

Conventions: paths are relative to `src/studio/ui/src/components/` unless they start with another top dir. "Host binding" gives the api/port method; the Go binding is the same name in PascalCase (`daw.deleteRange` is `DawDeleteRange`). `daw.*` is `usePort('daw')` (`ports/daw.ts`). **DAW** marks an action that touches the DAW. Jump menu means Ctrl+K "On this page" (`usePageCommands`) or the global catalog (`input/commands.catalog.ts`, `layout/useShellCommands.ts`).

Global shell commands relevant to all four pages (`useShellCommands.ts`, catalog): Back, Forward, Open Settings, Zoom in/out/reset, Open Companion, Show keyboard shortcuts, Open the undo history, Undo: <label>, Toggle dark theme, Import manuscript, Replace manuscript, Settings: <category>, Go to <page>, Go to <chapter> (goes to Script, hidden where a page registers its own chapter rows). **Master & QC and Delivery register no page commands.** Editing, Proof and Pickups do.

---

## 0. Where cleanup, chapter regions and the Engine panel are reachable from Editing and Proof

**Cleanup tools (the REAPER-side launchers: Repair Pops/Clicks, Magnolius DeClick; `cleanupToolsLaunch`, bridge `launch_cleanup_tool`)**
- Live only inside the Engine panel (`engine/EnginePanel.tsx:177`, button **Cleanup tools…** in the "REAPER tools" panel, dialog `engine/CleanupToolsDialog.tsx`). The panel shows these buttons only when the project has tracks and the engine is REAPER.
- Neither Editing nor Proof has a button, menu item, jump-menu command or key for them. The launchers' REAPER check is still pending (`docs/research/reaper-cleanup-launchers.md`).
- Editing has its own, different cleanup: drawer tab **Clean up** (gaps, breaths, clicks, plosives, noise; Preview, Apply). It does not call the launchers.
- Editing's **Clean up and effects** header button and Ctrl+Shift+C open that drawer; Proof has no cleanup tools of any kind except **Trim the gap to 1.2 s** on a said-twice note's gap.

**Chapter regions (`chapterRegionsPreview/Create`, `engine/CreateChapterRegionsDialog.tsx`)**
- Engine panel only: **Create chapter regions…** (`EnginePanel.tsx:175`), and from **Prepare chapter render…** (`RenderConfigDialog` shows "Create chapter regions…" when no regions were found).
- No entry on Editing, Proof, Pickups, Master or Delivery. Master and Delivery never mention regions (the "Clip regions" column in Diagnostics is unrelated).

**Engine panel (the header chip, `EnginePanelLink`, `useOpenEnginePanel`)**
- Header engine chip (`layout/EngineChip.tsx:86`, `onOpenEnginePanel`, `App.tsx:242`) is in the shell on every page except the Booth, so Editing, Proof, Pickups, Master and Delivery all have it. It is the only always-available entry.
- `EnginePanelLink` ("Open the audio engine panel") appears in:
  - Proof main page: `proof/checkcard/CheckCard.tsx:259`, inside the "why Check recordings is off" sentence when the reason has an `engine` resolve (no project file, several tracks linked, mapped track missing).
  - Proof chapter view `/proof/:chapterId`: `proof/ProofChapterPage.tsx:183` ("No linked track").
  - The Check recordings dialog result, which Editing, Proof and Pickups all open: `recordingcheck/CheckResult.tsx:149,184` (reason pages with `engine:true`, and "The REAPER tracks could not be listed").
  - `editing/EditingCheckPanel.tsx:82,390`, but that panel is opened only from Production's row menu and the Engine panel's chapter table, not from the Editing page.
  - `stages/StageEvidence.tsx:228` (used by `ProofingStagePanel`, chapter view only).
- Editing page itself: no `EnginePanelLink`. Its DAW-off chip opens `ConnectionResolveDialog` (Start <DAW>, Check again, "Link in Settings" when unlinked; `connection/ReaperOffDialog.tsx:135`). The "Not linked to a track" chip opens `ChapterLinkDialog` (link a track here). Neither opens the Engine panel. The Engine panel's chapter-link table opens Editing ("Open in Editing"), and `/tracks` redirects into it.
- Pickups: no `EnginePanelLink` of its own; reaches it only via the Check recordings dialog and the chip.

---

## 1. Editing (`/editing[/:chapterId]`, `editing/EditingPage.tsx`)

Task context: hear one chapter against its script, edit the audio by selecting words (delete, mute, FX, replace, take choice, cleanup), proof flagged words in place, and hand off pickups.

| Action (label) | Kind | Host binding | Shared component / source file:line | Also reachable from |
| - | - | - | - | - |
| Chapter stepper (prev/next/pick, Alt+Up/Down) | button+command `editing.chapter.next/prev` | `manuscriptChapters` | `primitives/ChapterStepper`, `editing/EditingPage.tsx:160` | Proof, Pickups, Master (own copies of the stepper); jump menu "Go to <chapter>" rows (`page/useEditingPageCommands.ts:19`) |
| DAW-off chip / dialog (Start <DAW>, Check again, Link in Settings) **DAW** | button/dialog | `daw.capabilities` via `session.refreshCapabilities`; `startDaw` | `connection/ReaperOffDialog.tsx`, `EditingPage.tsx:161` | Production (same dialog), chip opens once per loss |
| Not-linked chip / ChapterLinkDialog **DAW** | button/dialog | `chapterTrackSet` | `connection/ChapterLinkDialog.tsx`, `page/useChapterLink.tsx:33` | Engine panel chapter links, Production Chapter track panel |
| Read again (no-audio banner) | button | `useChapterSource.reread` (`workspaceAlignment`) | `page/NoAudioBanner.tsx:26` | none |
| Check recordings… (not-transcribed row) | button | `openCheckRecordings` (coverage*) | `script/ScriptDoc.tsx:113`, `page/useRecordingCheck.tsx` | jump "Check the recording of this chapter"; Proof, Pickups, Production open the same dialog |
| Timeline strip toggle (S) / strip take Play | button/command `editing.strip` | `useTakeAudition` (`daw.previewTake`) | `strip/TimelineStrip.tsx:15,98` | Drawer "Timeline" tab below 1360 px |
| Clean up and effects (drawer toggle, Ctrl+Shift+C) | button/command `editing.drawer` | none | `page/EditingHeader.tsx:142`, `drawer/Drawer.tsx:62` | jump "Open <tab> in the drawer" (cleanup/effects/backups); `?drawer=` link |
| **Drawer: Clean up tab** per-kind Review | button | none (local) | `drawer/FoundList.tsx:15` | none |
| Drawer Clean up: kind toggle (Gaps/Breaths/Clicks/Plosives/Noise), select all, row checkboxes | section | `findingsList`, `editingCandidates` | `cleanup/CleanupHeader.tsx:11`, `CleanupList.tsx:51` | none |
| Drawer Clean up: row Play, Preview / Stop preview | button | page playback (`useScriptPlayback`, DAW `transport_sync` else app) | `CleanupList.tsx:82`, `CleanupInspector.tsx:132`, `usePreviewPlay.ts` | none |
| Drawer Clean up: Strength (Light/Standard/Heavy/Custom), Advanced | section | none | `CleanupInspector.tsx:81,89` | none |
| **Apply to N selected (de-click, breath, plosive, gap trim)** **DAW** | button | `daw.trimRange` + `editingCutRecord` (gaps); `daw.reduceRangeGain` (breaths, plosives, cap `range_gain`); `daw.repairClick` (clicks, cap `click_repair`) | `CleanupInspector.tsx:136`, `cleanup/cleanupApply.ts`, `useCleanupDeps.ts:45-81` | Proof "Trim the gap" uses `applyCleanupCommand` for gaps only |
| Drawer: Retries RetryBar (Chapter/Stack/Leave), Stack retries as takes **DAW** | section/button | `editingRetryModeSet`, `daw.stackTakes` + `editingStackRecord` | `stack/RetryBar.tsx:23`, `useStackRetries.tsx:298` | jump "Stack retries as takes"; word menu |
| Drawer: Effects tab (list, Coverage cap, inspector, Settings, Bypass, Compare, Preview, Remove, FX in <DAW>, Check again) **DAW** | section | `daw.fxRangeParams/setFxRangeParam/bypassFxRange/compareFxRange/removeFxFromRange`, `system.saveSettings`, `refreshFx` | `effects/EffectInspector.tsx`, `EffectSettings.tsx`, `ProjectFx.tsx:25` | none |
| Drawer: Add effect / Choose in <DAW>… (REAPER only) **DAW** | button | `daw.applyFxToRange`; `daw.chooseFxForRange` + `chosenFxForRange` (poll) | `effects/AddEffect.tsx:70-109`, `useChooseInDaw.ts:79` | Add FX itself: bar, toolbar, word menu, key F |
| Effect inspector: Show in <DAW> **DAW** | button | `workspaceGoTo` | `effects/useShowEffectInDaw.ts:44` | Take footer "Show in the DAW" |
| Drawer: Backups tab, Put this back, window/keep-days **DAW** | section/button | `daw.backups`, `daw.restoreBackup`, `saveSettings('DAW')` | `backups/BackupsList.tsx:64`, `BackupsInspector.tsx:56-98` | jump "Open backups in the drawer" |
| Prev word / Play-Pause / Next word | button / `workspace.play` Space | `useScriptPlayback`: `daw.playFrom`/`stopPlay` (cap `transport_sync`) else app Audio | `bar/SelectionBar.tsx:35-37`, `bar/useScriptPlayback.ts:166` | keys; jump "Play from the cursor or selection" |
| Floating "Play the selection" | button | same | `bar/SelToolbar.tsx:80` | word menu "Play selection" |
| **Delete words and audio** (Del) / **Mute, keep audio** (M) **DAW** | button/command `editing.delete`, `editing.mute` | `daw.deleteRange` then `editingCutRecord`; undo `daw.undoLast` | `cut/CutButtons.tsx`, `range/cut/CutDialog.tsx:132`, `cutCommand.ts` | word menu, flag card "Delete words…", jump "Delete the selected words and audio" |
| Restore these words **DAW** | button | `journal.undo` or "Forget the cut" `editingCutRemove` | `cut/CutButtons.tsx:31`, `useCutWords.tsx:142` | word menu |
| Add FX (F) **DAW** | button/command `editing.fx` | `workspaceListFXChains`, `daw.applyFxToRange`, `editingWordFxRecord`, A/B `daw.compareFxRange` | `range/fx/FxButtons.tsx:8`, `FxDialog.tsx`, `useFxWords.tsx:281` | word menu, jump "Add FX to the selected words" |
| Remove effect (marker menu) **DAW** | button | `daw.removeFxFromRange`, `editingWordFxRemove` | `FxButtons.tsx:21`, `useFxWords.tsx:296` | word menu; Effects tab |
| Replace with another narrator's audio / Put my audio back **DAW** | button+dialog | `replaceNarrators/NarratorAdd/AddFile/Plan`, `dawReplaceRange`, `dawRestoreReplacement` | `range/replace/ReplaceDialog.tsx:199`, `useReplaceAudio.tsx:155` | word menu; replacement-mark popover |
| Voice sample (V) | button/command `editing.voice-sample` | `voiceSampleMark` | `voicesample/VoiceSampleDialog.tsx`, `useVoiceSample.tsx:158` | word menu; Story Bible |
| Takes of this line (T), Take Play/Stop, Keep take, Undo choice **DAW** | button/command `editing.takes.*`, `editing.keep` | `daw.previewTake`/`stopPreview`, `daw.useTake` | `takes/TakeLines.tsx:90-98`, `keepTake.ts` | word menu; jump "Keep the take the keys are on" |
| Show in the DAW (takes footer) **DAW** | button | `workspaceGoTo` | `takes/useShowInDaw.tsx:20` | Effects inspector (same call); Proof Inspector uses `findingsGoTo` instead |
| Compare takes (Play every, A then B, Stop) | button | `useTakeAudition` | `takes/TakeCompare.tsx` | none |
| Prep: Trim white space / Trim breaths / Normalise **DAW** | button | `daw.deleteRange` (cap `cut_range`), item gain (cap `item_gain`) | `takes/prep/PrepControls.tsx:14`, `usePrepSteps.tsx:140` | none (only Editing offers breath trimming per take) |
| Hide other takes / Look at hidden **DAW** | button/command `editing.hide-others` | `daw.hideTakes` | `takes/prep/useHideOthers.tsx:143` | word menu |
| Split into takes **DAW** | button | `daw.splitTake` | `takes/split/useSplitDuplicate.tsx:92` | word menu; flag card "Stack as 2 takes" (same command) |
| Stack retries / Un-stack / Clean up the other reads **DAW** | button | `daw.stackTakes/unstackTakes/hideTakes`, `editingStackRecord/Remove` | `stack/StackControls.tsx:49`, `StackDialog.tsx`, `stackCommand.ts:140` | word menu |
| Flag card: Hear it, Keep this addition / It is right accept, Delete…, Mark for pickup, Stack as 2 takes, Hear both, Leave in place | section | `editingAccept`, `findingsList`/`findingsReview(dismissed)` (linked), `pickupsAdd` | `flags/FlagCard.tsx:151-185`, `flags/useAcceptWords.ts` | keys `[`/`]`, Enter; word menu Mark for pickup |
| Word menu: Mark as…, Add note…, Mark for pickup, Copy words, Show takes | menu | `markWords` (Script's `addMark`), `pickupsAdd`/`findingsReview` | `menu/marks/markMenuSections.ts:20`, `markCommands.ts` | Script page marks |
| Waveform: zoom, scroll, drag range, right-click menu | button/menu | none (local) | `ribbon/RibbonControls.tsx:21`, `WaveDock.tsx:96` | none |
| Output popover (silence, speed, volume, device, DAW monitor level) **DAW** (cap `monitor_level`) | section | `daw.monitorLevel/setMonitorLevel` | `output/OutputControls.tsx:105-130` | Booth/Settings share `outputPrefs` |
| Match levels… | button | `levelMatchPreview/Apply` (item_gain) | `editing/CleanupAction.tsx:66` (inside `EditingCheckPanel` only) | **not reachable from the Editing page**; Production row menu "Editing check…" and Engine chapter table |
| History/Undo of any edit | command | `journal.undo` | `undo.last`, toasts | global |

Timing notes (Editing):
- The page is open to every chapter in the book, including ones with no audio or no check (it shows "Not transcribed yet"/"No audio to edit"). Cleanup Apply, Delete, FX and prep are shown there but refused or disabled only through DAW capability reasons, not through "chapter recorded/checked" state.
- Prep steps and Keep take are offered per take before the line's evidence is read; Hide others and Stack clean-up require a take kept this session (`useHideOthers.tsx:100`).
- The drawer's **Clean up** counts (tab label) use default params and ignore gaps already trimmed.
- **Mark for pickup** and Accept sit in Editing (early) and write by-hand pickups without a `findingId`; the owner's decision (Proof "Needs pickup") is a later step.
- Backups tab is offered when the DAW reports `backups` available but also by `backupsOffered` in an unused hook (`drawer/useDrawer.ts`).

---

## 2. Proof (`/proof`, `proof/ProofPage.tsx`; chapter view `/proof/:chapterId`)

Task context: one list of notes from the recording check, comparison, Story Bible and delivery checks; mark each Needs pickup, Fix in edit, Fine as read or Defer; the decision is the record.

### 2a. Main page

| Action (label) | Kind | Host binding | Shared component / source file:line | Also reachable from |
| - | - | - | - | - |
| Chapter stepper incl. All chapters (Left/Right) | button+command `proof.chapter.next/prev` | `manuscriptChapters` | `proof/ProofPage.tsx:440` | jump "All chapters", "<n> open notes" rows (`useProofPageCommands.ts:33`); Production pipeline Proof cell `/proof?chapter=` |
| Chapter strip tiles (All view, credits tiles) | button | none | `proof/frame/ChapterStrip.tsx:54` | Escape returns to All |
| Progress ring "N of M cleared" | text | `findingsSummary` + `pickupsList` | `proof/frame/ProofHeader.tsx:34` | rail badge (omits pickups) |
| **Check card**: Check recordings / Stop checking **DAW** (needs project file) | button | `coverageStart`/`coverageCancel` via `openCheckRecordings` | `proof/checkcard/CheckCard.tsx:217-317` | NotesPanel icon (`ProofPage.tsx:542`), jump "Check recordings (of <chapter>)", Editing, Pickups, Production |
| Check card finding Accept / Ignore | button | `coverageGapAccept/Ignore` or `findingsReview` | `CheckCard.tsx:171-190`, `checkcard/FindingRow.tsx:44-59` | Inspector decisions (`findingsReview`) |
| Check card finding "Open in Editing: <what>" | link | none (route) | `FindingRow.tsx:44` | Inspector "Open in Editing" (said twice only); Manage takes in Editing |
| Check card filter pills; show/hide findings | button | `findingsList({category})`, `coverageResult` | `CheckCard.tsx` | none |
| Waveform window: zoom, window edges, note pins | button | `workspace` peaks | `proof/frame/WaveformWindow.tsx:162-296` | none |
| Notes: chip filter, In view pill, Sort, Find in notes, Clear filters | section | `findingsList(sort, scope)` | `proof/notes/NotesPanel.tsx:181-220`, `NotesTable.tsx:110` | jump search source `notesSource` |
| Check recordings… (notes lead icon) | button | as above | `ProofPage.tsx:542` | duplicate of check card button |
| **Import proofer sheet / Export for proofer** | button | `pickupsImport/pickupsExport`, `pickupsResolve` family | `proof/ProoferSheet.tsx:124-125` | none (Pickups has no entry) |
| Row select / Enter (opens the note's chapter from All) | row | none | `ProofPage.tsx:~525` | keys J/K/Up/Down `proof.note.next/prev` |
| Inspector: Type of finding select | section | `findingsSetType` | `proof/inspector/TypeSelect.tsx:26` | none |
| Inspector: Previous/Next note; Use new evidence | button | `findingsGet` | `NoteSteps.tsx`, `EvidenceChangedBanner.tsx:52` | keys |
| **Hear it, 3 s either side / Stop hearing** **DAW** | button (Space `proof.note.hear`) | `findingsLoop`/`findingsStopLoop` (host loop in DAW, cap `navigate`) | `inspector/HearIt.tsx:118,155` | jump? no; context menu "Hear it"; app-player fallback per transport-sync design |
| **Show in <DAW>** (go to the note) **DAW** | button | `findingsGoTo` | `inspector/InspectorActions.tsx:102,120` | note context menu "Go to <DAW>" (clicks the Inspector button); Editing uses `workspaceGoTo` |
| **Add marker in <DAW>** **DAW** | button | `daw.addMarker` -> `findingsAddMarker` (cap `markers`) | `InspectorActions.tsx:113,128` | not in the context menu; Pickups "Add N as markers" is the pickup variant |
| Treat these two words as the same (misreads) | button | `transcriptAddEquivalence`, `findingsGet` | `inspector/TreatAsSame.tsx:28`, `equivalence.ts` | none |
| Open in Editing (said twice only) | button | none | `Inspector.tsx:135` -> `goToEditing` | check card link; SpotTakes "Manage takes in Editing" |
| Open this chapter in Script / Booth | button | none | `InspectorActions.tsx:136,142` | context menu; Pickups menu |
| **Trim the gap to 1.2 s** (said-twice gaps) **DAW** | button | `daw.trimRange` + `editingCutRecord`, then `findingsReview(accepted)` | `inspector/TrimGap.tsx:99`, Editing `cleanup/cleanupApply` | Editing drawer Clean up (the same op, Gaps) |
| Decisions: Needs pickup (P), Fix in edit (E), Fine as read (W), Defer (D), Reopen | button / commands `proof.decide.*` | `findingsReview` via `journalledReview` (journal + Undo toast) | `inspector/DecisionButtons.tsx:48`, `ProofPage.tsx:286` | context menu; jump group "Selected note"; keys |
| Decision note; thread (Add a note, Edit, Delete) | section | `findingsThread` | `Inspector.tsx:153`, `inspector/FindingThread.tsx:60-147` | none |
| Takes at this spot: Play/Stop, Manage takes in Editing | button | `useRangePlayer(mediaUrl)` (app player only) | `proof/spot/SpotTakes.tsx:58,78` | none |
| Surrounding text | read-only | `manuscript` | `proof/around/SurroundingText.tsx` | none |
| Note context menu (Hear it, decisions, Go to <DAW>, Trim the gap, Script, Booth) | menu | via `press()` of the Inspector buttons | `proof/useNoteContextMenu.ts:50-70` | no Open in Editing, no Add marker |
| Jump menu: All chapters, <n> open notes, 4 decisions, Check recordings; Open Stage suggestion options / Recording check rules (Production only) | command | `openCheckRecordings` | `proof/useProofPageCommands.ts:33-68` | ProofOptions registers "Open Compare options" on the chapter view |

### 2b. Chapter view `/proof/:chapterId` (compare, preview, native takes, proofing stage)

Reachable only from the Engine panel chapter table ("Open in Proof", `engine/ChapterLinksTable.tsx:151/206`) and the `/tracks/chapter/:id` redirect. Not linked from the main Proof page.

| Action (label) | Kind | Host binding | Shared component / source file:line | Also reachable from |
| - | - | - | - | - |
| Check recordings… | button | `openCheckRecordings` | `proof/ProofChapterPage.tsx:222` | same dialog as everywhere |
| **Compare the recording with the script**: Start comparison, Cancel, Review last run, New comparison, Export N markers (**DAW** markers file), Suggest hints, Whisper download | section | `transcriptStart/Cancel/Reset/Hints/SaveHints/SuggestHints`, `transcriptExportMarkers`, `whisperInstall*` | `proof/CompareRun.tsx:421-588` | nowhere else (the Engine "Open in Proof" path only); jump "Open Compare options" |
| Compare options dialog | dialog | `settingsForScope('project')` | `proof/proofOptions/ProofOptions.tsx:106` | also mounted in Master Diagnostics, Production stage options, Recording check rules |
| Preview panel (candidates, pin, Extend/Shrink, Copy range, Open in manuscript reader) | section | `previewCandidates`, `previewPin*` | `proof/PreviewPanel.tsx` | none |
| Native takes panel (Play, Keeper, Assign line) | section | `recorderSetTakeKeeper`, `recorderSetTakeLine` | `proof/NativeTakesPanel.tsx:130-173` | none (recorder-engine only) |
| Proofing readiness (Confirm/Dismiss/Revert, Why, Check now) | section | `stageConfirm/Dismiss/Revert` | `proof/ProofingStagePanel.tsx` | Production `ReadinessPanel` (different UI, same host calls) |
| Rendered file for proofing: Choose, Clear, Measure | button | `proofingChooseRender/ClearRender`, `measureAnalyze` | `proof/RenderAssociationSection.tsx:54-63` | Master & QC "Check files" measures too |
| AuditionDialog | dialog | none | `proof/AuditionDialog.tsx` | orphan (no importer outside tests) |

Timing notes (Proof):
- The Inspector offers **Add marker in <DAW>**, **Trim the gap** (a real DAW edit) and **Show in <DAW>** before a note is decided. Trim the gap is an editing action on the review page; Editing's Clean up covers the same gap trimming.
- **Needs pickup** and **Fix in edit** write the same status (`accepted`); the pickup/edit split is derived from the category (`proof/resolution.ts:23`).
- **Import/Export proofer sheet** and **Check recordings** sit on the page that comes after Editing; a check run (coverage) is also offered from Editing (earlier) and from Pickups (later).
- Compare, Preview and Native takes belong to the recording-check stage but live on a page the narrator reaches only through the Engine panel.

---

## 3. Pickups (`/pickups`, `pickups/PickupsPage.tsx`)

Task context: queue of lines to record again; gather them into one Booth session.

| Action (label) | Kind | Host binding | Shared component / source file:line | Also reachable from |
| - | - | - | - | - |
| Chapter stepper incl. all (Alt+Up/Down reuses `editing.chapter.*`) | button+command | `manuscriptChapters` | `pickups/list/PickupsTable.tsx:298`, `PickupsPage.tsx:174` | jump "Show every chapter / Show only <chapter>" (`usePickupsPageCommands.ts:27`) |
| Check recordings **DAW** | button | `openCheckRecordings` | `PickupsTable.tsx:303` | jump "Check recordings"; Proof, Editing, Production |
| Add a pickup by hand | popover | `pickupsAdd` | `pickups/list/AddPickup.tsx:71`, `PickupsTable.tsx:329` | Editing "Mark for pickup" (same call) |
| Include in session (checkbox, Space) | checkbox | `pickupsSetIncluded` | `PickupsTable.tsx:415` | row menu |
| **Hear the original in context / Stop** **DAW** | button | `dawTransportSync` (play_from, cap `transport_sync`) else app player | `PickupsTable.tsx:449`, `list/usePlayOriginal.ts:28` | row menu |
| Open in Booth at this line | button | none (route) | `PickupsTable.tsx:453` -> `boothSessionPath` | Proof "Open this chapter in Booth" (different builder) |
| Mark recorded / Mark open again **DAW** (holds back while the DAW has the marker) | button | `pickupsSetDone` | `PickupsTable.tsx:456` | row menu |
| Remove from pickups | button | `pickupsRemove` | `PickupsTable.tsx:461` | row menu |
| Fine, not a pickup | button | `findingsGet` + `findingsReview(dismissed)` | `PickupsTable.tsx:525`, `PickupsPage.tsx:199` | row menu; duplicates Proof "Fine as read" |
| Go to the note in Proof | button | none (`/proof?finding=`) | `PickupsTable.tsx:529` | row menu |
| Go to Proof (empty state); Retry / Check again | button | `pickupsList` | `PickupsTable.tsx:345,368,491` | none |
| Copy the pickup script | button | clipboard | `list/SessionPanel.tsx:96` | none |
| **Open N in Booth** | button | none | `SessionPanel.tsx:119` | jump "Open N in Booth" |
| **Add N as markers in <DAW>** (pickup markers) **DAW** | button | `daw.addPickupMarkers` (cap `markers`), then `pickupsList` | `SessionPanel.tsx:123`, `PickupsPage.tsx:253` | jump "Add N as markers" |
| Row context menu (include, hear, Booth, Script, recorded, remove, fine, Proof) | menu | as above | `list/usePickupsContextMenu.ts:33` | none |
| Per-pickup jump rows (reveal) | command | none | `usePickupsPageCommands.ts` | none |
| Booth companion summary | read-only | `subscribePickups`, `pickupsState` | `pickups/PickupsCompanionSummary.tsx` | Booth |

Timing notes (Pickups):
- Lines can be queued as soon as a check finds a gap, before Editing; nothing separates "pickup because of audio" from "pickup the editor can fix". **Fine, not a pickup** and **Check recordings** (a check action) are offered after the queue is built.
- No Show in DAW, no Open in Editing on a pickup row. Pickup markers are the only DAW write on the page.

---

## 4. Master & QC (`/master`, `masterqc/page/MasterPage.tsx`)

Task context: check rendered chapter files against the delivery profile, say why a file fails, master and encode to spec. Needs only an imported manuscript, no DAW.

| Action (label) | Kind | Host binding | Shared component / source file:line | Also reachable from |
| - | - | - | - | - |
| Chapter stepper (Alt+Up/Down) | button+command | `saveSharedChapter` (shared with Proof) | `masterqc/page/MasterPage.tsx:241` | row select; Delivery rows deep-link via `focusFile` |
| Profile pill (Open Delivery) | button | none | `MasterPage.tsx:244` | package panel "Open Delivery" |
| **Check files… / Re-check N files** (loudness, peak, noise floor, ACX/QC rules) | button | `measurePickFiles` + `measureAnalyze` | `masterqc/page/MeasureRun.tsx:485` | table header icon, row menu "Check the files again" (same `run.check()`); Proof chapter view "Measure" (rendered file) |
| Choose other files… | button | `measurePickFiles` | `MeasureRun.tsx:481` | none |
| Cancel measurement | button | `measureCancel` | `MeasureRun.tsx:526` | none |
| Check again (lost host) | button | `measureState` | `MeasureRun.tsx:504` | none |
| Retry profile / chapters; Show the first file instead | button | `deliveryProfiles`, `manuscriptChapters` | `MasterPage.tsx:266-285` | none |
| Files table (select, arrows), Book consistency chart | section | none | `masterqc/files/FilesTable.tsx:233`, `page/Consistency.tsx` | none |
| **Play the quietest 5 s** **DAW** (cap `file_preview`) | button+menu | `daw.playQuietest` -> `MasterPlayQuietest` | `masterqc/files/FileChecks.tsx:231`, `FilesTable.tsx:151`, `page/useFileActions.ts:448` | row menu |
| **Open in <DAW>** (file browser) **DAW** (cap `file_reveal`) | button+menu | `daw.openFile` -> `MasterOpenInDaw` | `FileChecks.tsx:234`, `FilesTable.tsx:157` | row menu |
| Check again (DAW gates) | button | `daw.capabilities` | `FileChecks.tsx:242` | none |
| Rule-by-rule panel (Close) | section | none | `master/FileRulesPanel.tsx:70` | Delivery uses `DeliveryProfilePanel` (shared `Requirement`) |
| **Master all to spec…** / Add files… | button | `exportPickFiles` | `MasterPage.tsx:252`, `master/MasterToSpecPanel.tsx:81` | same `jobs.pick()` twice |
| **Master & encode / Encode**, Cancel, role/title, Remove, "Master" checkbox (render/encode/master) | section | `exportStart`, `exportCancel`, `exportState` | `MasterToSpecPanel.tsx:84-184`, `master/useExportJobs.ts:129` | Delivery polls the same `exportState` |
| Mastering chain | read-only | `masteringProviders` | `master/MasteringChain.tsx:59` | none |
| **Diagnostics**: Check measured files, Choose files…, source toggle, Cancel | section | `diagnosticsAnalyze/State/Cancel`, `measurePickFiles` | `master/DiagnosticsSection.tsx:78-261` | none; mounts `ProofOptions` |
| **Report export**: Include full location, Export report | section | `deliveryExportReport` | `master/ReportExportPanel.tsx:55,60` | Production "Export status report" is a separate report |
| Delivery package card (counts, Open Delivery) | section | none | `masterqc/page/PackageChecks.tsx:74` | Delivery |
| **Multi-platform export** (profile checkboxes, Build, Cancel) | section | `packageStartMulti`, `packageMultiState/Cancel` | `master/MultiPlatformExportPanel.tsx:118-141` | none; single-profile Build is on Delivery |

Timing notes (Master & QC):
- Mastering, encoding, diagnostics and **package building (multi-platform)** are all available before any measurement has shown which files fail; the multi-platform package build is on the page before Delivery, which is the stage named "build the package".
- **Play the quietest 5 s** and **Open in <DAW>** act on a finished file; they are offered with the DAW gate reason shown.
- No jump-menu entries at all (Check files, Master all to spec, Build are unreachable from Ctrl+K).

---

## 5. Delivery (`/delivery`, `delivery/page/DeliveryPage.tsx`)

Task context: last step; pick the delivery profile, see every chapter's check, build the platform's package from the files mastered and encoded in Master & QC.

| Action (label) | Kind | Host binding | Shared component / source file:line | Also reachable from |
| - | - | - | - | - |
| Profile select (built-ins first) | menu | `deliverySelectProfile('project', id, version)` | `delivery/profile/ProfileMenu.tsx:388`, `ProfileCard.tsx:102` | Settings delivery profile; Production import review `ImportProfileField` |
| Profile name, limit boxes, longest file, format rows (custom profiles) | section | `deliverySaveProfile` (duplicate/delete are Settings) | `ProfileCard.tsx:105,123`, `profile/LimitRow.tsx:43`, `CommitBox.tsx`, `FormatRows.tsx` | Settings |
| Check again (profiles) | button | `deliveryProfiles` | `ProfileCard.tsx:89,159` | none |
| Rules panel (read-only) | section | none | `master/DeliveryProfilePanel.tsx:54` | Master rule-by-rule |
| **Build <profile> package** | button | `renderEncodeMaster.packageStart({profileId, profileVersion, items})`; host opens the folder picker | `delivery/page/OutputPanel.tsx:113-122`, `useDeliveryBuild.ts:284` | none (Master has the multi-platform one) |
| Cancel build | button | `packageCancel` | `OutputPanel.tsx:124` | none |
| Open folder | button | `deliveryOpenPackageFolder` | `OutputPanel.tsx:206` | none |
| Check again (build state) | button | `exportState` + `packageState` | `OutputPanel.tsx:167` | none |
| Open Master & QC (in failure message; section header icon) | button | none | `OutputPanel.tsx:151`, `Preflight.tsx:288` | Master's "Open Delivery" is the reverse |
| Before you build: chapter rows (Open in Master & QC), Show the other N chapters, Check again (list) | section | `measureState`, `manuscriptChapters` (re-read only) | `delivery/page/Preflight.tsx:332,349,294` | Master files table |

Timing notes (Delivery):
- Delivery shows no way to **start** a measurement or encode; Check again only re-reads. Re-measuring needs Master & QC. Build is `aria-disabled` until at least one chapter is encoded and ready.
- No DAW-touching action on this page.
- No jump-menu commands (Build, Check again unreachable from Ctrl+K).

---

## Duplicates / near-duplicates noticed

1. **Check recordings**: one dialog (`recordingcheck/openCheckRecordings`), opened from at least nine places with different labels: Editing ScriptDoc button, Editing jump "Check the recording of this chapter", Proof check-card button, Proof notes icon (`ProofPage.tsx:542`), Proof chapter view, Proof jump command, Pickups icon + jump, Production card/row menu/credits panel/Readiness. Proof alone has two buttons for the same action on one screen.
2. **Show in DAW**: three labels ("Show in <DAW>", "Show in the DAW", "Go to <DAW>") and two host calls (`findingsGoTo` on Proof, `workspaceGoTo` on Editing takes footer and effect inspector).
3. **Needs pickup (P) and Fix in edit (E)** call the same `findingsReview(accepted)`; the meaning is derived from the category.
4. **Fine as read (Proof) / Ignore (check card) / Fine, not a pickup (Pickups)**: all `findingsReview(dismissed)` (check card may use `coverageGapIgnore`). Editing's "It is right, accept" is a fourth writer (`editingAccept`, then dismisses linked findings by text match).
5. **Mark for pickup** (Editing menu and flag card, `pickupsAdd`, by hand, no `findingId`) vs **Needs pickup** (Proof, `findingsReview`) vs **Add a pickup by hand** (Pickups, same `pickupsAdd`).
6. **Gap trimming**: Proof "Trim the gap to 1.2 s" and Editing drawer Clean up > Gaps both run `applyCleanupCommand` (`daw.trimRange`); Editing prep "Trim white space" is a third path (`daw.deleteRange` per take). Breath handling exists only on Editing (Clean up > Breaths and prep "Trim breaths").
7. **Split vs Stack**: flag card "Stack as 2 takes" runs the Split command; "Hide the other takes" appears in `useHideOthers` and again inside the stack clean-up (`stackCommand.ts:140`).
8. **Add FX**: bar, toolbar, word menu, key F (dialog after choosing a chain) vs drawer "Add effect" (dialog) vs drawer "Choose in <DAW>…" (REAPER only, no other entry).
9. **Cleanup**: Editing's in-app Clean up drawer (applies via `trimRange`, `reduceRangeGain`, `repairClick`) vs the Engine panel's **Cleanup tools…** (opens REAPER's Repair Pops/Clicks, Magnolius DeClick on the selected items). Two de-click paths, no link between them.
10. **Editing check**: `EditingCheckPanel` ("Check editing", Match levels…) duplicates intent of the drawer Clean up and is reachable only from Production and the Engine panel.
11. **Measure/QC**: `run.check()` has three labels on Master ("Check files…" / "Re-check N files", table icon, row menu "Check the files again"); Proof chapter view "Measure" and Master Diagnostics each run their own analysis; Delivery, Production and the rail only read `measureState` (four readers, different refresh triggers).
12. **Master all to spec… / Add files…** both call `exportPickFiles`.
13. **Package build**: single-profile build on Delivery vs multi-platform build on Master; Master's `useExportJobs` also carries unused `startPackage/cancelPackage/packageJob` and both pages poll `exportState` separately.
14. **Fail counts** ("Delivery check" KPI, rail badge, Next up, Delivery readiness, Master package counts) are separate implementations; "mastered" in Production counts failing files as mastered.
15. **Playback**: separate players for Editing (DAW transport or app), take audition, Proof "Hear it" (host loop), Proof SpotTakes (own range player), Pickups "Hear the original", ProofChapter native takes, voice samples, AuditionDialog (unused). Master's "Play the quietest 5 s" is a seventh path (`MasterPlayQuietest`).
16. **Capabilities**: Editing reads `daw.capabilities()` in about 14 separate hooks (plus the shared `useDawStatus`); Proof, Pickups and Master read their own; most read once on mount.
17. **Chapter steppers**: one primitive, four page copies, each fetching `manuscriptChapters()` and filtering narration itself; Pickups reuses Editing's command ids.
18. **Recorded-through and counts**: Editing/Proof use `recordedThrough.ts`; Production has its own wording; Proof header percent vs rail badge vs notes chips vs check-card counts differ.
19. **Chapter naming**: `chapterName` (table) vs `headingName` (menus, Next up) name the same chapter two ways (Production/Master).
20. **Open in Booth / Editing / Proof**: two path builders (`addressPath` vs hand-built `/booth...`), and `/proof/:id` (chapter view) vs `/proof?chapter=` under the same "Open in Proof" label.
21. **Stage suggestion UI**: `ProofingStagePanel` (chapter view) vs Production `ReadinessPanel` for Confirm/Dismiss/Revert.
