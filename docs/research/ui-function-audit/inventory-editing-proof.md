# UI function inventory: Editing, Proof, Pickups

Built from code in `src/studio/ui/src/components/{editing,proof,pickups}`. Paths below are relative to `src/studio/ui/src/components/` unless they start with another top dir. Line numbers are from the working tree on branch `claude/ui-function-audit`. Guides and mocks were not used as the source. `api/*Mock.ts` and `daw/` were read only as needed (port names); not audited.

Conventions: "port X" = `usePort('X')` (`ports/index.ts`), host method names as in `api/contracts/*`. "DAW" = `usePort('daw')` (`DawClient`, `ports/daw.ts`). `journal` = `useJournal()` (`studio/journal/createJournal.ts`; Ctrl+Z `undo.last` and History read it). `toastUndo` = `overlay.toastUndo(..., () => journal.undo(id))`.

Routes (App.tsx): `/editing[/:chapterId]` (EditingRoute, App.tsx:1160s, query `finding passage t drawer`), `/proof` (ProofPage; chapter via `?chapter=`), `/proof/:chapterId` (ProofChapterPage, only reachable from `engine/ChapterLinksTable.tsx:206` "Open in Proof"), `/pickups`.

---

## 1. Editing page

### 1.1 Page frame, header, panels (`editing/EditingPage.tsx`, `page/EditingHeader.tsx`, `page/EditingBody.tsx`)

| Control | Label / icon / tooltip | File:line | Handler → host call / state | Notes |
|---|---|---|---|---|
| Chapter stepper (prev/next/pick) | `ChapterStepper`, keys Alt+Up/Down | EditingPage.tsx:160 | `choose`/`step` → local `chosen`, `onChapter` → `navigate('/editing/:id')` (App.tsx EditingRoute). Chapters from `manuscript.manuscriptChapters()` (EditingPage.tsx:113), filtered to narration | Each chapter's note = `chapterRecordedDetail` (recordedThrough.ts) |
| DAW-off indicator | `ConnectionIndicator id="dawoff"` "<DAW> not connected" | EditingPage.tsx:161 | `dawDialog.reopen` → opens `ConnectionResolveDialog variant="reaper-off"` (EditingPage.tsx:167). Dialog "Check again" → `daw.retry` = `session.refreshCapabilities`; `onCaps` → `session.takeCapabilities` | Opens by itself once per connection loss after `DAW_CONNECT_GRACE_MS` (useOpenOnce) |
| Chapter-not-linked indicator + dialog | `ConnectionIndicator id="noaudio"` "Not linked to a track" | page/useChapterLink.tsx:33 | opens `ChapterLinkDialog` (onLinked/onCheckedAgain → `onReread`) | Waits for DAW dialog (`hold`) |
| Retry (load error) | `LoadErrorPanel retry` | EditingPage.tsx:197, :299 | `retry` → re-runs `manuscriptChapters` / `useChapterSource.retry` | |
| Strip toggle | `StripToggle`, `IconButton action="timelineStrip" label="Timeline"`, `aria-keyshortcuts=S` | strip/TimelineStrip.tsx:15-24, header EditingHeader.tsx:141 | `panels.strip.toggle` (local `usePanels` state EditingPage.tsx:57); hidden when window < 1360 (`STRIP_MIN_WIDTH`) | Below 1360 the Timeline is a drawer tab (EditingBody.tsx:441 `showTimeline`) |
| Drawer toggle | `IconButton action="cleanUpAndEffects" label="Clean up and effects" id="drawertoggle"`, tooltip "Clean up and effects (Ctrl+Shift+C)" | EditingHeader.tsx:142-151 | `panels.drawer.toggle` | Escape on toggle closes (`escapeClosesPanel`) |
| Drawer close | `IconButton action="close" id="drawerclose"` | drawer/Drawer.tsx:62 | `panels.drawer.close` | |
| Drawer tabs | Clean up · N, Effects · N, Backups · N (only where DAW `backups` capability `available`), Timeline (only < 1360) | drawer/Drawer.tsx:64-71, drawerTabs.ts:90 | `panels.drawer.setWant`; counts from `useTabCounts` (drawer/useTabCounts.ts) | Tab deep link `?drawer=` (App.tsx EditingRoute) |
| Legend | "<Kind> · N" per kind, "Not transcribed yet" / "No audio to edit" badge | flags/Legend.tsx:22-41 | read-only, `doc.counts` | See capability tag "findings counts" |
| No-audio banner "Read again" | `Button` | page/NoAudioBanner.tsx:26 | `onReread` → `useChapterSource.reread` | |
| "Check recordings…" (not-transcribed row) | `Button` | script/ScriptDoc.tsx:113 | `onCheckRecording` = `useRecordingCheck` → `openCheckRecordings([chapterId], {onClosed → forgetPeaks + onReread})` (page/useRecordingCheck.tsx) | Same dialog Proof/Pickups open |
| Edit-off notice | text only | page/EditOffNotice.tsx | shown when `cut.plan.kind==='refused'` | no control |
| Script text | `role=textbox` "Script with what was heard"; mouse down/over (select, shift-extend, drag), right-click = word menu | script/ScriptDoc.tsx:128, Word.tsx | `dispatch place/select/extend/openFlag` (script/scriptState.ts) | |

### 1.2 Keyboard (`keys/useEditingKeys.ts`; defaults `input/commands.catalog.ts`)

All bound with `useCommand` only when `doc.items.length>0`; handlers passed from EditingBody.tsx:452-468.

| Command id | Default | Line | Handler |
|---|---|---|---|
| `workspace.word.prev/next` | Left/Right | useEditingKeys.ts:125-126 | `move` → `dispatch place` |
| `workspace.paragraph.prev/next` | Up/Down | :127-128 | `phrase` |
| `workspace.flag.prev/next` | `[` / `]` | :129-130 | `flag` → `focusFlag` (select run + `openFlag`) |
| `workspace.play` | Space | :131 | `playback.toggle` (`useScriptPlayback`) |
| `editing.delete` | Delete, Backspace | :132 | `cut.remove` → `ask(selected,false)` (ignored inside `#drawer`) |
| `editing.mute` | M | :133 | `cut.mute` |
| `editing.fx` | F | :134 | `fx.fx` → opens FX list menu at last selected word |
| `editing.voice-sample` | V | :135 | `voice.open()` |
| `editing.hide-others` | H | :136 | `hide.handlers.hideOthers` |
| `editing.strip` | S | :137 | `showTimeline` |
| `editing.keep` | Enter | :138-146 | flagged word → `focusFlag` (open card), else `lineTakes.handlers.keep` → `keep.keep(line,take)` |
| `editing.escape` | Escape | :147-155 | clear flag/selection, else `escapeDrawer` |
| `editing.word.extend.prev/next` | Shift+Left/Right | :161-170 | `extend` |
| `editing.phrase.prev/next` | Mod+Left/Right | :171-180 | `phrase` |
| `editing.takes.next/prev` | T / Shift+T | :181-186 | `lineTakes.handlers.takes` (opens/walks takes) |
| `editing.drawer` | Mod+Shift+C | :187 | `panels.drawer.toggle` |
| `editing.chapter.next/prev` | Alt+Down/Up | :188-189, EditingBody.tsx:474-475 (when text empty) | `chapterStep` |
| `editing.menu` | Shift+F10 | :190 | synthesises `contextmenu` on cursor word |
| (jump menu provider) | "Next chapter", "Previous chapter", "Play from the cursor or the selection", "Mark the selected words as a voice sample", "Next/Previous flagged word", "Show or hide the timeline", "Keep the take the keys are on", "Hide or show the other takes" | :193-221 | `useCommandProvider` |
| Jump-menu page commands | per chapter "Go to <chapter>" (`chapter.<id>`), "Delete the selected words and audio", "Mute the selected words…", "Add FX to the selected words", "Check the recording of this chapter", "Open <tab> in the drawer" (cleanup/effects/backups) | page/useEditingPageCommands.ts:19-105 | `usePageCommands`; disabled reasons mirror bar buttons (`cut.refusalOf`, `fx.refusalOf`) |
| Stack chapter command | "Stack retries as takes" (when `count>0`) | stack/useStackRetries.tsx:261-263 | `requestStack()` |
| Key-hint footer | Play from here, Word, Select words, Delete words and audio, Add FX, Takes, Keep take (label varies), Hide others, Timeline, Clear | keys/editingKeyHints.ts:232-243, EditingBody.tsx:487-494 | display only | Mute and Voice sample have no hint |
| Waveform keys (focused ribbon) | Arrows/PageUp/PageDown/Home/End/+/-/=/_ | ribbon/useScrollGestures.ts:130-150 | `ribbon.nudge/scrollTo/zoom` | local view only |

### 1.3 Transport bar and floating toolbar (`bar/`)

| Control | Label / icon | File:line | Handler → call | Notes |
|---|---|---|---|---|
| Previous word | `action="previousWord"` | bar/SelectionBar.tsx:35 | `playback.skip(-1)` | |
| Play / Pause | `action=play\|pause`, label "Play from here" / "Play the selection" / "Pause" | :36 | `playback.toggle` → `useScriptPlayback`: providers `[DAW transport (cap `transport_sync`, port `dawTransportSync`), app Audio]` via `playback/providers.playThrough` (bar/useScriptPlayback.ts:166-215) | |
| Next word | `action="nextWord"` | :37 | `playback.skip(1)` | |
| Clock, word count, badges ("Cut", "Read twice", "Not in the script", "In the script", "N low confidence") | text | :38-72 | read-only from `summarize` | |
| Output group | see 1.9 | EditingBody.tsx:599 | | |
| Selection actions (registry `bar/selectionActions.ts`, ordered) | order 5 Restore, 10 Add FX, 20 Mute, 20 Voice sample, 25 Takes of this line (toolbar only), 27 Replace/Put my audio back, 30 Delete | cut/useCutWords.tsx:182-206, fx/useFxWords.tsx:281, voicesample/useVoiceSample.tsx:158, EditingBody.tsx:366, replace/useReplaceAudio.tsx:155 | below | bar + toolbar both except Takes (toolbar only) |
| Floating toolbar "Play the selection" | `IconButton action="play"` | bar/SelToolbar.tsx:80 | `playback.playSelection` | Hidden while playing/flag card open |
| Restore these words | `icon undo` | cut/CutButtons.tsx:31 | `cut.restore(keys)` → `journal.undo(entry)` if cut made this session, else toast "Undo it in <DAW> (Edit > Undo)…" with action "Forget the cut" → `editCuts.editingCutRemove` + `onCuts` (useCutWords.tsx:142-174) | Only works for cuts made this session (`entries` ref) |
| Add FX | `icon addFx`, "Add FX (F)" | range/fx/FxButtons.tsx:8 | `openMenu(el)` → context-menu of `fxMenuItems` (DAW chain list via `createHostFxChains` → `daw.capabilities`+`workspace.workspaceListFXChains`) → pick → `ask(keys, chainId)` → FxDialog | |
| Mute, keep the audio | `icon hideExample`, "(M)" | cut/CutButtons.tsx:5 | `cut.ask(keys,true)` → CutDialog | |
| Voice sample | `icon voiceSample`, "Mark a voice sample (V)" | voicesample/useVoiceSample.tsx:163 | `open(keys)` → VoiceSampleDialog | |
| Takes of this line | `icon showTakes`, "(T)" | EditingBody.tsx:374-379 | `setLineOpen(line.id,true)` | Rendered for lines with >=1 take (comment says "more than one") |
| Replace with another narrator's audio / Put my audio back | `icon replaceAudio` | replace/useReplaceAudio.tsx:164-178 | `ask(keys)` → ReplaceDialog; or `restore(replaced)` → `daw.dawRestoreReplacement`-style (useReplaceAudio.tsx:136 `api.dawRestoreReplacement`) | |
| Delete words and audio | `icon delete`, danger, "(Del)" | cut/CutButtons.tsx:19 | `cut.ask(keys,false)` → CutDialog | Disabled with reason from `cutRefusal` |

### 1.4 Word context menu (right-click / Shift+F10) (`menu/`, registry `menu/wordMenuRegistry.ts`, host `useEditingWordMenu.ts`)

| Item | Order | File:line | Handler |
|---|---|---|---|
| Play selection | 10 | menu/playAndCopySections.ts:16 | `selection.play(start,end)` = `playback.playFrom` |
| Add FX (submenu: source line, DAW chains, disabled "Manage in <DAW>…") | 90 | fx/useFxWords.tsx:288, fxMenu.ts:30-52 | `ask(keys, chainId)`; Manage item is a no-op (`onSelect:()=>{}`, always `unavailable`) |
| Mute these words (keep the audio) / Delete words and audio… / Restore these words | 100 | cut/useCutWords.tsx:208-219 | `ask(keys,true/false)`, `restore` |
| Remove <chain> (first effect on words) | 105 | fx/useFxWords.tsx:296 | `fx.remove(on)` → `daw.removeFxFromRange` + `editWordFx.editingWordFxRemove` |
| Replace with another narrator's audio… / Put my audio back (now X's) | 105 | replace/useReplaceAudio.tsx:181 | as bar |
| Mark as (submenu of mark types) / Add note… / Mark for pickup | 250.. | menu/marks/markMenuSections.ts:20-51 | `markWords` via `useScriptCommands().addMark` (Script page's command); Add note → `NoteDialog` (Save → `markWords`); Mark for pickup → `markForPickup` → `pickups.pickupsAdd` / `findings.findingsReview` (menu/marks/markCommands.ts) |
| Mark as voice sample… | 280 | voicesample/useVoiceSample.tsx:165 | `open(keys)` |
| Show takes of this line (T), Keep <take> per take | 300 | takes/takesMenuSection.ts:17-35 | `setLineOpen`, `keep.keep(line,take)` (needs `takes` capability via `useTakesGate`) |
| Stack retries as takes / Un-stack the takes | 310 | stack/useStackRetries.tsx:245-258 | `requestStack([id])`, `requestUnstack(id)` |
| Hide the other takes / Look at (Put away) the hidden takes (H) | | takes/prep/useHideOthers.tsx:157-168 | `toggle(passage)` |
| Split into takes | | takes/split/useSplitDuplicate.tsx:92-98 | `act(pid)` → confirm "Split this take?" |
| Copy words | 900 | menu/playAndCopySections.ts:31 | `navigator.clipboard.writeText` |

### 1.5 Ribbon / waveform dock (`ribbon/WaveDock.tsx`, `Ribbon.tsx`, `RibbonControls.tsx`)

| Control | Label | File:line | Handler | Notes |
|---|---|---|---|---|
| Zoom out / in | `action zoomOut/zoomIn` | ribbon/RibbonControls.tsx:21-22 | `ribbon.zoom(±1)` (view state in `useRibbonView`) | local state |
| Scroll back/forward end arrows | `scrollWaveBack/Forward` | RibbonControls.tsx:35 | `ribbon.nudge(dir,true)` | |
| Gestures "?" tooltip | | RibbonControls.tsx:20 | | |
| Drag range / edge handles | "Start of range" / "End of range" sliders | ribbon/RangeOverlay.tsx:43, useRangeInteraction.ts | `dispatch selectSpan` / `dropRange` (WaveDock.tsx:70-78) | Range feeds Cut/FX/Replace (`state.span`) |
| Waveform right-click menu | Play from <t>; Play the range; Clear the range; Put the cursor on "<word>"; Select this line; Zoom in (at); Zoom out; Show the whole line; Show the whole recording | ribbon/WaveDock.tsx:96-134, Ribbon.tsx:226-246 | `playFrom`, `dispatch` | |
| Peaks | no control; `usePrefetchPeaks`, `useRibbonPeaks` → `workspace` peaks | EditingPage.tsx:138 | | |

### 1.6 Timeline strip / drawer Timeline tab (`strip/TimelineStrip.tsx`)

| Control | Label | File:line | Handler |
|---|---|---|---|
| Per-take play | aria "Play take <label>" / "Stop take" | strip/TimelineStrip.tsx:98 | `onPlay(take)` = `useTakeAudition.play` |
| Take lane label + badge | "Active" / "Muted" | :88-92 | display |

### 1.7 Cut, Mute, FX, Replace dialogs

| Dialog | Controls | File:line | Handler → host call |
|---|---|---|---|
| Cut / Mute ("Delete N words and their audio?" / "Mute N words and keep their audio?") | RadioGroup "What happens to the gap" (Close the gap / Leave room tone), Select "Crossfade at the join", Select "Keep audio at each edge of the cut", disabled Checkbox (keep cut audio), **Cancel** (autofocus), **Delete N words and audio** / **Mute N words** | range/cut/CutDialog.tsx:132-173; opened range/cut/useCutWords.tsx:113 | confirm → `journal.act(cutCommand)` (range/cut/cutCommand.ts): `daw.deleteRange` (or `step.run` backup first when plan `backup-then-daw`) then `editCuts.editingCutRecord`; undo = `daw.undoLast('cut', steps)` + `editingCutRemove`. Ends cut toast with Undo (`toastUndo`). Snap ends via `alignment` port (`snapEnd`) |
| Add FX ("Add FX to N words?") | Select "Effect" (chains), **A/B** (hear without/with), **Cancel**, confirm button | range/fx/FxDialog.tsx:96, :128, :143, :146; opened fx/useFxWords.tsx:191 | confirm → `journal.act(applyFxCommand)`: `daw.applyFxToRange` then `editWordFx.editingWordFxRecord`; A/B → `daw.compareFxRange` (useFxWords.tsx:167-180) |
| Replace with another narrator's audio | Select "Other narrator", Select "Their file", **Add file** (`replaceAddFile`), Field "Name another narrator" + **Add narrator** (`replaceNarratorAdd`), NumberInput From/To (seconds), "Level change (dB)", "Fade at each seam", **Cancel**, **Replace** | range/replace/ReplaceDialog.tsx:199-340 | `api.replaceNarrators`, `replaceFilePeaks`, `replacePlan`, `replaceNarratorAdd`, `replaceAddFile` (lines 86-155); confirm → `daw.dawReplaceRange` (replaceCommand.ts:64) with undo `daw.undoLast('replace',1)` + `editingReplacementRemove` |
| Replacement mark popover | chip "<narrator>" opens Popover with **Put my audio back** | range/replace/ReplacementMark.tsx:11,48 | `restore(r)` → `api.dawRestoreReplacement(chapterId, id)` (useReplaceAudio.tsx:136) |
| FX marker (after last underlined word) | Menu "<chain> on <text>. Options": Select the words / Remove the effect | range/fx/FxButtons.tsx:21-22 | `selectWords(f.keys)`; `fx.remove(f)` |
| Voice sample ("Voice sample") | Select character, IconButton Play range/Stop, Field label, Field note, Checkbox make primary, **Cancel**, **Save** (submit) | voicesample/VoiceSampleDialog.tsx:165-244; opened useVoiceSample.tsx:89 | save → `voiceSamples.voiceSampleMark`; reads `storyBible.guideEntities/guideDialogueCues`, `voiceSamplesList`; Play = page `playback.playFrom` |
| Voice-sample dot popover | list of samples, Play, **Open in Story Bible** | voicesample/SampleMark.tsx:122 | `onOpenStoryBible(characterId)` → navigate story-bible (App.tsx EditingRoute) |
| Add a note | Select "Kind of mark", Field "Note", **Cancel**, submit | menu/marks/NoteDialog.tsx:50-69; opened useMarkMenuSections.ts:44 | `markWords` → Script `addMark` |
| Stack / Un-stack / Clean up the other reads (dialog) | confirm dialog listing groups; **Cancel**, **Stack takes / Put them back** | stack/StackDialog.tsx:76-79; opened useStackRetries.tsx:153 | `journal.act(stackCommand)`: `daw.stackTakes` / `daw.unstackTakes` + `editStacks.editingStackRecord/Remove`; clean-up = `daw.hideTakes` (stackCommand.ts:140-144) |

### 1.8 Takes (under each line; `takes/`, container `EditingBody.tsx:608-674`)

| Control | Label | File:line | Handler → host call / state |
|---|---|---|---|
| Take chip | "N takes" + dots + active label + badge (Kept / Stacked / Duplicate read / To choose) | takes/TakeChip.tsx:46 | `setLineOpen(pid,!open)` (local `openLines`) |
| Suggested take card | "Suggested: <take>", confidence badge, "Steps that would make it surer" | takes/Suggested.tsx | display from `takes/model suggestionFor` |
| Take row Play/Stop | `data-tplay`, label "Play/Stop <take>" | takes/TakeLines.tsx:90-96 | `onPlay(take)` = `useTakeAudition.play`: DAW `daw.previewTake` (cap `file_preview`) else app `useRangePlayer` (takes/useTakeAudition.ts) ; stop = `daw.stopPreview` |
| Take row Keep | `action="keepTake"`, label "Keep <take>" (hidden for the kept one) | TakeLines.tsx:98 | `keep.keep(line,take)` → `journal.act(keepTakeCommand)` → `daw.useTake(chapterId, first, last, take.id)`; undo = `daw.useTake(before)`; local `kept` map (takes/keepTake.ts) ; gated by `useTakesGate` (cap `takes`) |
| Undo choice | `IconButton action="undo" label="Undo choice"` | EditingBody.tsx:359 | `keep.undoKeep(passage.id)` → `journal.undo` |
| Show in the DAW | `action="showInReaper" label="Show in the DAW"` | takes/useShowInDaw.tsx:20 | `workspace.workspaceGoTo(chapterId, firstToken)` ; gated on cap `navigate` |
| Compare: Play every take | `IconButton play`, `data-tall` | takes/TakeCompare.tsx:7 | `playEvery` (queue of `onPlay`) |
| Compare: First / Second take Select, **A then B** | | TakeCompare.tsx:32+ | `playAB` |
| Compare: Stop comparing | `data-tstop` | TakeCompare.tsx:45 | `stop` |
| Prep step buttons: "Trim white space", "Trim breaths", "Normalise" (+ "<step>: done" badge, "Updating the figures…") | `PrepStepButton data-prep` | takes/prep/PrepControls.tsx:14, usePrepSteps.tsx:163-173 | `overlay.confirm` (usePrepSteps.tsx:140,154) → `daw.deleteRange` (trim, cap `cut_range`) / item gain (cap `item_gain`) ; re-measure via `takes` port evidence |
| Hide the other N takes / Look at (Put away) N hidden takes | `HideButton data-thide` | takes/prep/PrepControls.tsx:41, useHideOthers.tsx:143,153 | confirm "Hide the other takes?" (useHideOthers.tsx:104) → `journal.act` → `daw.hideTakes(chapterId, first, last, keptId)`; "Look at" = local `revealed` state only |
| Split into takes | `data-tsplit` Button | takes/split/SplitButton.tsx:4 | `act(pid)` → confirm "Split this take?" (useSplitDuplicate.tsx:59) → `splitter` → `daw.splitTake(chapterId, takeId, at)` ; recorder plan has `toastUndo` |
| Retry bar: "How retries are kept" ToggleGroup (Chapter · X / Stack / Leave) | passage level in takes footer; chapter level at top of Clean up tab | stack/RetryBar.tsx:23-65, StackControls.tsx | `editStacks.editingRetryModeSet(level, chapterId, passageId, mode)` (useRetryMode.ts:34) |
| Stack retries as takes | `data-stack-all` | RetryBar.tsx:65 | `requestStack` → StackDialog |
| Un-stack the takes / Clean up the other reads | `data-unstack`, `data-cleanup` | stack/StackControls.tsx:49-50 | `requestUnstack`, `requestCleanUp` (confirm titled "Clean up the other reads", useStackRetries.tsx:221) |

### 1.9 Output controls (`output/`)

| Control | Label | File:line | Handler |
|---|---|---|---|
| Silence output | `IconButton silenceOutput` | output/OutputControls.tsx:105 | `onChange({muted})` → `useOutputPrefs` (components/engine/outputPrefs, shared across pages) |
| Output popover | `IconButton outputAudio` "Output" | :116 | popover |
| Speed ToggleGroup | | :122 | `onChange({rate})` |
| Volume Slider | | :130 | `onChange({volume})` |
| Output device Select + "Check again" | | :61, :69 | `onChange({device})`; `useOutputDevices` → `listAudioOutputs()` (browser); refresh on focus/devicechange |
| DAW monitor level Slider | "<DAW> monitor level" (cap `monitor_level` only) | OutputControls.tsx:79-90, EditingOutput.tsx | `useMonitorLevel` (set) |

### 1.10 Flag card (under a flagged word; `flags/FlagCard.tsx`)

| Control | Label | File:line | Handler |
|---|---|---|---|
| Hear it / Hear the word | `Button` | :166 | `hear(t0-margin, t1+margin)` = `playback.playFrom` |
| Keep this addition (extra) / It is right, accept (others) | | :173, :182 | `accept(keys)` = `useAcceptWords`: `editLog.editingAccept(chapterId, keys)` then `findings.findingsList` + `decideLinked(... 'dismissed')` → `findings.findingsReview`; journal entry "Accepted a word"; undo `editingUnaccept` + `restoreLinked` |
| Delete words and audio… / Delete second read… | | :176, :160 | slot `deleteWords` (registered by `useCutWords`, useCutWords.tsx:221) → `cut.ask` |
| Mark for pickup | | :185 | slot `markForPickup` (menu/marks/useMarkMenuSections.ts:60) → `markForPickup` → `pickups.pickupsAdd` + notes |
| **Stack as 2 takes** (duplicate read) | | :151 | slot `stackAsTakes` registered by **useSplitDuplicate** (takes/split/useSplitDuplicate.tsx:81) = the **Split** command, not stacking |
| Hear both reads, Leave in place | | :154, :157 | `hearBoth`, `close` |
| Missing slot behaviour | button disabled, title "Not available yet" | :34, :122 | `useFlagActions` |

### 1.11 Drawer: Clean up tab (`drawer/FoundList.tsx`, `cleanup/`, `stack/useStackRetries.tsx:298`)

| Control | Label | File:line | Handler → host call / state |
|---|---|---|---|
| Retries RetryBar (chapter level) | section "Retries" | stack/useStackRetries.tsx:298-312 | as 1.8 |
| Found in this chapter: per kind **Review** | `aria-label "Review <kind>"` | drawer/FoundList.tsx:15 | `onReview(kind)` = EditingBody.tsx:425 (`setFlagKind`, place+openFlag first flagged word) |
| Kind of finding ToggleGroup | "Gaps N / Breaths N / Clicks N / Plosives N / Noise N" | cleanup/CleanupHeader.tsx:11 | `choose(op)` |
| Select every finding / per-row Checkbox | | cleanup/CleanupList.tsx:51, row | `toggle(keys, include)` (local `skip`) |
| Per-row Play | `data-rplay`, "Play <t> with 2 s before and after" | CleanupList.tsx:82 | `playback.playFrom(windowOf(row))` (page playback) |
| Strength ToggleGroup (Light/Standard/Heavy/Custom) | | cleanup/CleanupInspector.tsx:81 | `setLevel` (local `params`) |
| Advanced disclosure + NumberInputs | | CleanupInspector.tsx:89 | `setParam` |
| Preview / Stop preview | `Button` | CleanupInspector.tsx:132 | `previewPlay.start(on,...)` → plays first 3 selected via page `playFrom`; Esc stops (usePreviewPlay.ts) |
| Apply to N selected | `Button` | CleanupInspector.tsx:136 | `journal.act(applyCleanupCommand)`: gaps `deps.trim` = `daw.trimRange` + `deps.record` = `editCuts.editingCutRecord`; breaths/plosives `daw.reduceRangeGain` (cap `range_gain`); clicks `daw.repairClick` (cap `click_repair`); then `notifyCleanupChanged` (cleanup/CleanupTab.tsx:100-114) |
| Data | `findings.findingsList({chapterId})` + `editing.editingCandidates(chapterId)` (CleanupTab.tsx:48) ; `daw.capabilities()` x3 (CleanupTab.tsx:63, CleanupInspector.tsx:209, useCleanupDeps.ts:350) | | |

### 1.12 Drawer: Effects tab (`effects/`)

| Control | Label | File:line | Handler |
|---|---|---|---|
| Effects on words: Select the words / Remove the effect | `IconButton locate / remove` | effects/OnWords.tsx:37-38 | `onSelect`, `fx.remove` |
| Coverage cap NumberInput | `FX_CAP_LABEL` | effects/CoverageStrip.tsx | `useFxCap.setCap` → `system.saveSettings('Editing','project',{fx_cap_pct})` (useFxCap.ts:171) |
| Coverage bar segments | click | CoverageStrip.tsx:103 | `onSelect(id)` |
| Effects list row | `Button variant=link data-fxr` | effects/EffectsList.tsx:55 | `setPick` |
| Inspector: Previous/Next effect, Show in <DAW>, Remove (danger Button), Settings sliders/NumberInputs, "Bypass this effect" Checkbox, "Turn on anyway"/Cancel, Preview, Compare/Stop comparing | | effects/EffectInspector.tsx:24-86, EffectSettings.tsx:63, 367-383 | `daw.fxRangeParams`, `setFxRangeParam`, `bypassFxRange`, `compareFxRange`, `stopFxCompare`; Preview = page `host.play(span±pad)`; Remove = `fx.remove`; Show = `workspace.workspaceGoTo` (useShowEffectInDaw.ts:44) |
| FX in <DAW> | table + **Check again** | effects/ProjectFx.tsx:25 | `useProjectFx.checkAgain` → `session.refreshFx()` (`daw/dawSession.ts`, shared state) |
| Add an effect | **Add effect / Add anyway**, **Choose in <DAW>…** (REAPER only), favourites star buttons `aria-label "Favourite <name>"` | effects/AddEffect.tsx:70-109 | `fx.ask(selected)`; `chooser.start` → `daw.chooseFxForRange`, polls `daw.chosenFxForRange` (useChooseInDaw.ts:79,121), Keep it / Cancel / Check (ChooseInDaw.tsx:72-78), `daw.removeFxFromRange` on cancel; favourites `system.settingsForScope('global')` (`DAW.fx_favourites`) |
| Disabled placeholders | Settings, Bypass, Preview, Compare, "Not available in <DAW>." | EffectSettings.tsx:55-72 (`OffControls`) | intentionally disabled when DAW lacks the capability |

### 1.13 Drawer: Backups tab (`backups/`, shown only when DAW cap `backups` available)

| Control | Label | File:line | Handler |
|---|---|---|---|
| Row Put this back (list) | `IconButton undo`, `data-bkrestore` | backups/BackupsList.tsx:64 | `backups.restore(id)` → `journal.act(restoreCommand)` → `daw.restoreBackup(id)`; toast "cannot be undone here" |
| Put this back (inspector) | `data-bkput` | BackupsInspector.tsx:98 | same |
| Window seconds / Keep days NumberInputs | `data-bkwin`, `data-bkkeep` | BackupsInspector.tsx:56, :68 | `system.saveSettings('DAW','project',{backups.window_seconds / backups.retention_days})` (useBackupSettings.ts:60) |
| Data | `daw.backups()` (useBackups.ts:48), filtered to chapter | | |

### 1.14 Other Editing-owned components used elsewhere

| Component | Label | File:line | Used from |
|---|---|---|---|
| EditingCheckPanel (SlideOver "Editing check") | Back, ToggleGroup "Analysis source", **Check editing / Check again**, Cancel, "Clean up in Editing" Link, MappingFix (`MappingConfirm`) | editing/EditingCheckPanel.tsx:221, 362, 402, 186 | `engine/ChapterLinksTable.tsx:151`, `production/useChapterTools.tsx:251`. Calls: `editingCandidates`, `stageRecommendations`, `editingState`, `editingSetSourceChoice`, `chapterTrackMapList`, `editingStart`, `editingCancel`, `chapterTrackMapConfirm`; `MappingFix` `onClear={() => {}}` (line 102) |
| CleanupAction → **Match levels…** ConfirmDialog "Match levels" | | editing/CleanupAction.tsx:66-77 | `api.levelMatchPreview` / `levelMatchApply` (item_gain); only inside EditingCheckPanel (no Editing-page entry) |
| `useRecordingCheck` | | page/useRecordingCheck.tsx | `openCheckRecordings` |

---

## 2. Proof page (`/proof`, `proof/ProofPage.tsx`)

State: `findings` (`findings.findingsList(queryFor(sort, scope))`, :213), `summary` (`findingsSummary()`, :213), `pickups` (`pickupsList()`, :200), `chapters` (`manuscriptChapters()`, :177), selection (`?finding=`, `proofMemory`), `win` (waveform window), last chapter in `localStorage` (:66-82).

### 2.1 Header, strip, check card, waveform

| Control | Label | File:line | Handler → host call / state |
|---|---|---|---|
| Chapter stepper incl. "All chapters" | `ChapterStepper allowAll`, keys Left/Right | ProofPage.tsx:440-455 | `choose` → `setParams({chapter})` + `saveLastChapter` |
| Progress ring + "N of M cleared · K decided" | text | proof/frame/ProofHeader.tsx:34 | `proofProgress(summary, openPickupsBeyondNotes(pickups))` (ProofPage.tsx:407-413) |
| Chapter strip tiles (All chapters view) | tile per chapter + credits tiles | proof/frame/ChapterStrip.tsx:54, ProofPage.tsx:483 | `chooseTile`: credits → `goTo(addressPath script credits)` (:400) else `choose` |
| Recording check card | state badge (Not checked / Checking / Up to date / Out of date); **Check recordings** / **Stop checking**; show/hide findings chevron; Recorded / Script estimate / Last check; counts "Against the script", "In the audio"; filter Pills (todo/accepted/ignored); per finding **Accept**, **Ignore**, "Open in Editing: <what>" Link | proof/checkcard/CheckCard.tsx:217-317, FindingRow.tsx:44-59 | `onCheck` = `openCheckRecordings([id])`; `coverage.coverageCancel()`; accept = `coverage.coverageGapAccept` or `findings.findingsReview(accepted)`; ignore = `coverageGapIgnore` or `findingsReview(dismissed)` (CheckCard.tsx:171,182); data `coverage.coverageResult/GapReviews/coverageState/subscribeCoverage` + `findings.findingsList({category})` |
| Waveform window | Zoom out / Zoom in, draggable window edges ("Window start/end"), window slider, note pins (click selects), cluster pins | proof/frame/WaveformWindow.tsx:162, 212, 215, 296 | `setWin`, `select(id)`; peaks via `useChapterTimeline`/`useChapterPeaks` (`workspace`) |
| Take lanes under the waveform | read-only lanes | proof/spot/TakeLanes.tsx | display |

### 2.2 Notes panel (`proof/notes/NotesPanel.tsx`, `NotesTable.tsx`)

| Control | Label | File:line | Handler |
|---|---|---|---|
| Chip filter | All / To review / Open / Pickups / Decided with counts (`chipCounts`) | NotesPanel.tsx:181-188, noteRows.ts:121 | local `chip` |
| "In view" pill | only when waveform window narrower than chapter | NotesPanel.tsx:195 | local |
| Sort Select | `NOTE_SORTS` | NotesPanel.tsx:201 | `onSortChange` → page `sort` → new `findingsList` query |
| Check recordings… (lead) | `IconButton checkRecordings` | ProofPage.tsx:542 | `openCheckRecordings(chapter ? [id] : [])`; disabled by `useCapability('review')` |
| Find in notes | `IconButton find` + field | NotesPanel.tsx:220 | local `query`; also jump-menu search source `notesSource` (noteRows.ts) |
| Import proofer sheet / Export for proofer | `IconButton import/export` | proof/ProoferSheet.tsx:124-125 | file input + export → proofer-sheet host calls via `useProoferSheet`-style hooks (ProoferSheet.tsx:77-105), counts via `usePickupsState` + `useOpenPickups` |
| Row click / Enter | select; from All chapters also opens the note's chapter | ProofPage.tsx:~525-536 | `select`, `choose(chapterOf(note))` |
| Takes badge | "N takes" | proof/spot/TakesBadge.tsx | `spots.counts` |
| "Clear filters" empty state | Button | NotesTable.tsx:110 | `onClearFilters` |
| Keys J/K, Up/Down inside list | | NotesPanel.tsx:146-158 | `move` |

### 2.3 Inspector (`proof/inspector/`)

| Control | Label | File:line | Handler → host call |
|---|---|---|---|
| Type select | "Type of finding" | inspector/TypeSelect.tsx:26 via ProofPage.tsx:577 | `findings.findingsSetType(id, evidenceVersion, type)` |
| Previous note / Next note | `IconButton` | inspector/NoteSteps.tsx:10-11 | `evidence.step(±1)` |
| Evidence-changed banner: "Use new evidence" | Button | inspector/EvidenceChangedBanner.tsx:52 | `evidence.useNewEvidence` |
| Open in Editing ("Said twice") | Button | inspector/Inspector.tsx:135 | `onOpenEditing(chapterId, finding.id)` → `goToEditing` (App.tsx:779) |
| Takes at this spot: Manage takes in Editing; per take Play/Stop | `IconButton manageTakes`, `play/stop` | proof/spot/SpotTakes.tsx:58, 78 | `goToEditing(chapter, finding.id, passageId)`; `useRangePlayer(api.mediaUrl)` |
| Trim the gap to 1.2 s | `IconButton trimGap` | inspector/TrimGap.tsx:99 | `applyCleanupCommand` (Editing's `cleanup/cleanupApply`) via `daw.trimRange` + `editCuts.editingCutRecord`, then `decide('accepted')` |
| Hear it, 3 s either side / Stop hearing | `IconButton play/stop` | inspector/HearIt.tsx:155 | `findings.findingsLoop(noteId)` / `findingsStopLoop()` (host loop in DAW) |
| Show in <DAW> | `action showInReaper` | inspector/InspectorActions.tsx:120 | `findings.findingsGoTo(id)` |
| Add marker in <DAW> | `action addMarker` | :128 | `daw.addMarker(findingId)` |
| Open this chapter in Script / Booth | `openInScript`, `openInBooth` | :136, :142 | `goToScript(chapterId)`, `goToBooth({chapter})` |
| Reopen | Button (when decided) | :151 | `decide('unreviewed')` |
| Decision buttons | **Needs pickup (P)**, **Fix in edit (E)**, **Fine as read (W)**, **Defer (D)** | inspector/DecisionButtons.tsx:48 | all → `evidence.decide(status)` → `findings.findingsReview({id, evidenceVersion, status, note})` wrapped by `journalledReview` (ProofPage.tsx:286) = journal entry + toast Undo (ProofPage.tsx:341). Needs pickup and Fix in edit both send `status:'accepted'` (see 4) |
| Decision note field | "Note with the decision (optional)" | Inspector.tsx:153 | `evidence.setNote` (draft, `useShownEvidence`) |
| Thread: Add a note, "Who wrote this" ToggleGroup, Edit this note, Delete note (toast Undo "Deleted the note") | | inspector/FindingThread.tsx:60,61,129,147 | `findings.findingsThread(id, change)` |
| Surrounding text | read-only | proof/around/SurroundingText.tsx | `useParagraphsAround` → `manuscript` |

### 2.4 Keyboard, commands, context menu

| Item | Default | File:line | Handler |
|---|---|---|---|
| `proof.note.next/prev` | Down/J, Up/K | proof/useProofKeys.ts:53 | `select` next/prev in `order` |
| `proof.chapter.next/prev` | Right/Left | useProofKeys.ts | `step(±1)` |
| `proof.note.hear` | Space | useProofKeys.ts | `press(HEAR_LABEL, STOP_HEARING_LABEL)`: finds the Inspector `<button>` by aria-label/text and `.click()`s it |
| `proof.decide.pickup/edit/waive/defer` | P / E / W / D | useProofKeys.ts | `press(label)` the same way |
| `proof.escape` | Escape | useProofKeys.ts | back to All chapters unless a dialog/menu is open |
| Jump menu | All chapters; per chapter "<n> open notes"; Needs pickup / Fix in edit / Fine as read / Defer (group "Selected note"); Check recordings (of <chapter>) | proof/useProofPageCommands.ts:33-68 | `choose`, `press(label)`, `openCheckRecordings` |
| Note context menu (row or pin) | Hear it; Needs pickup; Fix in edit; Fine as read; Defer; Reopen; Go to <DAW>; Trim the gap; Open this chapter in Script; Open this chapter in Booth | proof/useNoteContextMenu.ts:50-70 | all via `press()` except Script/Booth (props). No "Open in Editing", no "Add marker" |

### 2.5 `/proof/:chapterId` chapter page (`proof/ProofChapterPage.tsx`) — legacy tools page

| Control | Label | File:line | Handler → host call |
|---|---|---|---|
| Breadcrumb "Proof" link, "Back to Proof" | | :164 | `navigate('/proof')` |
| Check recordings… | Button | :222 | `openCheckRecordings([chapterId], {onClosed → reload})` ; state label from `workspace.workspaceAlignment` |
| Native takes panel | per take Play/Stop (`player.toggle`), Keeper toggle, Select "<take>'s line" + Assign | proof/NativeTakesPanel.tsx:130-173 | `recorderSetTakeKeeper(name, !keeper)` (:138), `recorderSetTakeLine(name, line)` (:173), `subscribeRecorderState` |
| Compare the recording with the script (CompareRun) | ToggleGroups Whisper model / Chunk length / Parallel workers / Log detail; TagInput "Vocabulary hints"; IconButton Suggest from manuscript (:421); `ProofOptions` "Compare options"; **Review last run** (:435); **Start comparison** (:458); chapter-pick Buttons; **Cancel** (:521, `transcriptCancel`); **Skip to results (demo)** (mock mode only :518); **Export N markers** (:554 `transcriptExportMarkers`); **New comparison** (:568); Whisper "Download model" prompt (:588) | proof/CompareRun.tsx | `transcriptStart`, `transcriptCancel`, `transcriptReset`, `transcriptHints/SaveHints/SuggestHints`, `whisperInstall*`, `settingsForScope('project')`, `subscribeProjectState/projectStateCheck` |
| Preview panel | per candidate: Open in manuscript reader (:237 `goToManuscript`), Copy range and length (:246), Pin/Unpin; pinned: Clear (:106), Extend/Shrink start/end (:107); Read again (:168); `ProofOptions` "Preview options" | proof/PreviewPanel.tsx | `previewCandidates`, `previewPin`, `previewPinSet/Clear/Adjust`, `manuscriptChapters` |
| Proofing readiness (only if chapter.status==='proofing') | `StageSuggestion` decision buttons, Why → `StageEvidence` dialog, Check now, Open finding (→ `goToEditing(chapterId, findingId)`, :215), `onOpenCheck`/`onOpenEditingCheck` are `() => {}` (ProofingStagePanel.tsx) | proof/ProofingStagePanel.tsx | `useStageRecommendations` (stages port) |
| Rendered file for proofing | **Choose rendered file**, **Clear**, **Measure** | proof/RenderAssociationSection.tsx:54,58,63 | `proofingChooseRender`, `proofingClearRender`, `measureAnalyze`, `measureState` (useProofingRender.ts:60,78,92) |
| `ProofOptions` (shared) | Dialog with per-field NumberInput/Select/Switch/colour/text and Reset | proof/proofOptions/ProofOptions.tsx:106,136 | `useProjectOptions` → `system.settingsForScope/saveSettings`; also mounted in `master/DiagnosticsSection.tsx`, `stages/StageSuggestionOptions.tsx`, `production/RecordingCheckRules.tsx` |
| `AuditionDialog` | Dialog "Audition candidate reads": per side Select + Play/Pause + Loop | proof/AuditionDialog.tsx | **No importer outside tests** (orphan) |

---

## 3. Pickups page (`/pickups`, `pickups/PickupsPage.tsx`)

State: `list` (`pickups.pickupsList()` PickupsPage.tsx `load`), re-read on window focus/visibility and every 10 s while failing; `seconds` (`measurements.pickupSessionSeconds(ids)`); chapters (`manuscriptChapters()`).

| Control | Label | File:line | Handler → host call / state |
|---|---|---|---|
| Chapter stepper incl. all | `ChapterStepper allowAll`, Alt+Up/Down | pickups/list/PickupsTable.tsx:298; `useCommand('editing.chapter.next/prev')` PickupsPage.tsx:174 | local `scope` |
| Check recordings | `IconButton checkRecordings` | PickupsTable.tsx:303 | `openCheckRecordings(chaptersToCheck)` (`list.leftOut`); gated on `useCapability('review')` |
| Add a pickup by hand | popover with Field "Time in the recording", Field "Line to re-record", submit | PickupsTable.tsx:329, list/AddPickup.tsx:71-90 | `add` → `pickups.pickupsAdd(chapterId,time,line)` (PickupsPage.tsx `add`) |
| Row checkbox "include in session" | | PickupsTable.tsx:415 | `pickups.pickupsSetIncluded(id, included)` |
| Row: Hear the original in context / Stop | `IconButton play/stop` | PickupsTable.tsx:449 | `usePlayOriginal` (list/usePlayOriginal.ts): DAW `dawTransportSync` when ready, else app audio; reads `chapterTrackMap`, `tracks`, `daw.capabilities`, `daw.projectState` |
| Row: Open in Booth at this line | `openInBooth` | PickupsTable.tsx:453 | `openInBooth([pickup])` → `rememberPickupLeft`, `goTo(boothSessionPath(...))` |
| Row: Mark recorded / Mark open again | `markDone/markedDone` | PickupsTable.tsx:456 | `pickups.pickupsSetDone(id, done)` |
| Row: Remove from pickups | `remove` danger | PickupsTable.tsx:461 | `pickups.pickupsRemove(id)`; toast Undo only for `source==='you'` (`pickupsAdd` again) |
| Show-where row: Fine, not a pickup; Go to the note in Proof | Buttons (aria-disabled when no finding) | PickupsTable.tsx:525, 529 | `fine` → `journal.act` + `findings.findingsGet`/`findingsReview(dismissed)` (PickupsPage.tsx:199); Go → `goTo('/proof?finding=<id>')` (:322) |
| Row context menu | Include in / Leave out of the session; Hear the original in context; Open in Booth at this line; Open this chapter in Script; Mark recorded/open again; Remove from pickups; Fine, not a pickup; Go to the note in Proof | list/usePickupsContextMenu.ts:33-68 | same handlers |
| Empty state "Go to Proof" | Button | PickupsTable.tsx:491 | `goTo('/proof')` |
| Retry / Check again | Buttons | PickupsTable.tsx:345, 368 | `load()` |
| Session panel: Copy the pickup script | `IconButton copy` | list/SessionPanel.tsx:96 | `navigator.clipboard.writeText(pickupScript(...))` |
| Session panel: **Open N in Booth** | Button | SessionPanel.tsx:119 | `goTo(boothSessionPath(picked))` |
| Session panel: Add N as markers in <DAW> | `IconButton addMarker` | SessionPanel.tsx:123 | `daw.addPickupMarkers(items)` (PickupsPage.tsx:253), then `pickupsList` |
| Jump menu | per pickup "<t> · <line>" (reveal), Show every chapter, Show only <chapter>, Check recordings, Open N in Booth, Add N as markers | pickups/usePickupsPageCommands.ts:27-87 | |
| Companion summary (Booth page) | read-only text | pickups/PickupsCompanionSummary.tsx | `usePickupsState` (`subscribePickups`, `pickupsState`, `pickupsCount`) + `usePickupList` |

---

## 4. Capability tags

Each: locations → exact implementation → one or several → can they disagree.

### 4.1 Findings / flags counts

| Where | Implementation | Input |
|---|---|---|
| Editing Legend, Found-in-chapter list, tab count "Clean up · N" | `doc.counts.{extra,miss,mis,low}` (model/doc.ts, built from `workspace.workspaceAlignment` answer in `useChapterSource`) | Alignment (words heard vs script), `editLog.editingAcceptedList` |
| Editing "Clean up · N" tab label | `flagTotal(doc) + tabCounts.proposals` (EditingBody.tsx:517); `proposals = proposalTotal(findingsList + editingCandidates)` using **`initialParams()` and no `trimmed` check** (drawer/useTabCounts.ts:123,144) | findings + candidates |
| Editing Clean up header chips | `countsOf(findings, params, trimmed)` with the narrator's current params and gaps already trimmed excluded (cleanup/CleanupTab.tsx:78) | same data, different params |
| Proof header | `proofProgress(summary from findingsSummary(), openPickupsBeyondNotes)` (ProofPage.tsx:407) | host summary + pickups |
| Proof notes chips | `chipCounts(rows)` → `proofProgress(local rows, 0)` (noteRows.ts:121) | loaded list for scope only |
| Proof check card counts | `cardCounts(cardFindings(coverageResult gaps, gap reviews, audio findings))` (CheckCard.tsx:122-127) | **coverage** store, not `findingsList` for speech gaps |
| Rail badge "Proof" | `proofProgress(findingsSummary, 0).open` (layout/useNavCounts.ts:35) | summary only, **no open pickups** |
| Editing Cleanup-tab "N to fix" | `rows.length - fixed` (CleanupTab.tsx:131) | |

Separate implementations. Can disagree: Editing tab count vs its own Clean up chips (different params, `trimmed` ignored in tab label); Proof header percent (capped at 99 while an open pickup exists, ProofPage.tsx:407 / proof.selectors.ts:30) vs rail badge (ignores pickups); CheckCard counts vs Proof notes for the same chapter (coverage gaps vs findings); Editing flagged-word counts vs any findings count (alignment vs findings).

### 4.2 "Is proofed" / decision status of a note

| Where | Implementation |
|---|---|
| Proof Inspector decisions | `findings.findingsReview` via `journalledReview` (ProofPage.tsx:286) |
| Proof CheckCard Accept/Ignore | `coverageGapAccept/Ignore` for gaps, `findings.findingsReview(accepted/dismissed)` for audio (CheckCard.tsx:171-190) |
| Pickups "Fine, not a pickup" | own `journal.act` + `findingsReview(dismissed)` (PickupsPage.tsx:199) |
| Editing flag-card accept / Mark for pickup | `useAcceptWords` + `decideLinked` (flags/decideLinked.ts) matches findings by text (`findingsAt`, flags/findingLink.ts: categories `transcript_discrepancy`,`pickup`; needs `manuscript.expected`) |
| Proofing stage "proofing readiness" | `stages` port via `useStageRecommendations` (ProofingStagePanel.tsx:38) ; chapter `status` |

Four separate writers of the same finding review status; Editing's link is a heuristic text match, so findings without `expected` text or of other categories are not reached.

### 4.3 Open in Booth / Editing / Proof / Script

| Target | Locations | Implementation |
|---|---|---|
| Booth | Proof Inspector (InspectorActions.tsx:142), Proof context menu (useNoteContextMenu.ts:59) → `goToBooth({chapter})` (App.tsx:782 `addressPath`); Pickups row/menu/session/jump (PickupsTable.tsx:453, SessionPanel.tsx:119, usePickupsPageCommands.ts) → `boothSessionPath` (PickupsPage.tsx:35, `/booth` + `boothQuery`) | Two builders: `addressPath({page:'booth',target})` vs hand-built `/booth${boothQuery(...)}`. Labels: "Open this chapter in Booth", "Open in Booth at this line", "Open N in Booth", "Open in Booth" |
| Editing | Proof SpotTakes "Manage takes in Editing" (SpotTakes.tsx:58), Inspector "Open in Editing" (Inspector.tsx:135, said-twice notes only), ProofChapterPage `onOpenFinding` (:215), CheckCard FindingRow Link "Open in Editing: …" (FindingRow.tsx:44, hand-built `addressPath`), EditingCheckPanel "Clean up in Editing" Link (EditingCheckPanel.tsx:186) | `goToEditing` (App.tsx:779) for first three; `addressPath` inline for the Links. Proof context menu and Pickups have **no** Open in Editing |
| Proof | Pickups "Go to the note in Proof" (`/proof?finding=` string, PickupsPage.tsx:322) and "Go to Proof" (`/proof`); engine table "Open in Proof" → `/proof/:chapterId` (the legacy chapter page, not `/proof?chapter=`); Production `proofAt` → `addressPath proof chapter` | `/proof/:id` and `/proof?chapter=` are different pages under the same label |
| Script | Proof Inspector/menu (`goToScript`), Pickups menu, Preview "Open in the manuscript reader" (`goToManuscript`), Proof credits tiles | |
| Show in DAW | Proof Inspector (`findings.findingsGoTo`, InspectorActions.tsx:120); Editing take footer (`workspace.workspaceGoTo(chapter, firstToken)`, useShowInDaw.tsx:20); Editing effect inspector (`workspaceGoTo`, useShowEffectInDaw.ts:44); labels "Show in <DAW>" vs "Show in the DAW" vs context "Go to <DAW>" | Two host calls (`findingsGoTo` vs `workspaceGoTo`); gating via `navigate` capability read three separate ways |

### 4.4 Play / stop (all independent)

| Where | Implementation |
|---|---|
| Editing chapter / selection / word / flag / preview | `useScriptPlayback` (bar/useScriptPlayback.ts) providers [DAW `transport_sync`, app Audio]; Cleanup row Play + Preview, flag Hear, effect Preview, voice-sample Play all call its `playFrom`/`stop` (EditingBody.tsx:319, 398, 628) |
| Editing take Play, Play every take, A then B, strip Play | `useTakeAudition` ([DAW `previewTake` (`file_preview`), app `useRangePlayer`]) (EditingBody.tsx:215) |
| Voice-sample dots | `useSamplePlayer` (voicesample/sampleMarksContext.tsx) own app player |
| Proof "Hear it" | host loop `findings.findingsLoop` (HearIt.tsx:118) |
| Proof SpotTakes take Play | own `useRangePlayer(api.mediaUrl)` (SpotTakes.tsx:43) |
| ProofChapter NativeTakes | own `<audio>` (`player.toggle`, NativeTakesPanel.tsx:44) |
| Pickups "Hear the original" | `usePlayOriginal` ([DAW `dawTransportSync`, app]) |
| AuditionDialog | 2x `useRangePlayer` (unused) |
| Editing FX Compare/A/B | `daw.compareFxRange` / `stopFxCompare` |

Starting one does not generally stop the others across pages; within Editing, `stopChapter` is passed to `useTakeAudition` and voice sample `stopPlayback`, but EffectSettings Preview uses the chapter player only.

### 4.5 DAW capability reads (gating of every Editing action)

Separate `daw.capabilities()` calls, each with its own state: useCutWords.tsx:66, useFxWords.tsx:99, useReplaceAudio.tsx:61, useHideOthers.tsx:73, usePrepSteps.tsx:57, useSplitDuplicate.tsx:44, useStackRetries.tsx:73, useTakesGate.ts, useShowEffectInDaw.ts:32, useBackups.ts:48 (and `daw.backups()` again in useTabCounts.ts:161), CleanupTab.tsx:63, CleanupInspector.tsx:209 (`useCapabilities`), useCleanupDeps.ts:350, drawer/useDrawer.ts:27, Proof InspectorActions.tsx:96, TrimGap.tsx:206, Pickups `useCapability('review'|'markers')`. One shared store: `useDawStatus` → `daw/dawSession` (EditingPage.tsx:96, `caps` passed to body for playback, take audition, backups tab, output).
Not one implementation. Each reads once on mount (not on the capabilities event) so a DAW connecting/dropping mid-session can leave buttons gated by stale answers while `useDawStatus`, the header indicator and playback follow the event. Gating of the Backups tab uses `keepsBackups(caps)` (`available`) in EditingBody.tsx:387 but `backupsOffered(caps)` (`level !== 'unsupported'`) in drawer/drawerTabs.ts:98 / useDrawer.ts:37 (second hook, unused by the page).

### 4.6 Take pickers / kept vs active

| Where | "Kept" derived from |
|---|---|
| Editing TakeLines/TakeChip/Undo choice/strip | `useKeepTakes` local React state, set only when Keep is pressed this session (takes/keepTake.ts); `active` from `workspaceTakes` candidates; chip shows "To choose" when `keptId===null` even if a take is active |
| Proof SpotTakes / TakeLanes / pin label | `kept: candidate.active` (proof/spot/spot.ts:61) — host-active take is shown "✓ Kept" |
| Editing prep/hide/stack | `keep.kept` (local), hide requires a take kept this session (useHideOthers.tsx:100) |

Separate. Disagree: the same take is "Kept" in Proof and "Active"/"To choose" in Editing after a reload; Hide/Stack-cleanup demand a session-local keep. Both read `workspace.workspaceTakes` (Editing: `useLines` + `passageMap` + `takes.evidence`; Proof: `useSpotTakes` + `workspaceAlignment`) with separate caches.
Chapter pickers: Editing `ChapterStepper` (EditingPage.tsx:160), Proof (ProofPage.tsx:440, adds All), Pickups (PickupsTable.tsx:298) — one shared primitive (`primitives/ChapterStepper`), three separate chapter lists (each calls `manuscriptChapters()`); Proof/Pickups/Editing each filter `contentKind` narration themselves; Editing and Pickups both bind `editing.chapter.next/prev` (Pickups reuses the Editing command ids, PickupsPage.tsx:174).

### 4.7 Undo

| Where | Implementation |
|---|---|
| All Editing mutations, Proof decisions, Pickups fine | `journal.act` + `toastUndo` (`overlay`) ; Ctrl+Z `undo.last` and History (`layout/HistoryPanel.tsx:33`) read the same journal |
| Editing "Restore these words" | `journal.undo(entries[cut])` only for cuts made this session, else toast to undo in the DAW and "Forget the cut" |
| Editing Keep take | `journal.undo` / "Undo choice" button |
| Pickups removal | bespoke undo only for hand-added (`source==='you'`); automatic lines have none |
| Backup restore | not undoable here (toast says undo in DAW) |
| Editing flag accept | journal; Proof flag reopen is a decision not an undo |

Shared journal; Pickups and "Restore" use separate undo bookkeeping (`entries` ref, `RemoveUndo`).

### 4.8 Pickups (list, count, creation)

| Where | Implementation |
|---|---|
| Pickups page | own `pickupsList()` state in PickupsPage.tsx `load` (focus/visibility/10 s retry) |
| Rail badge | own `pickupsList` + `subscribePickups` + `onPickupListChanged` (layout/useNavCounts.ts:41) |
| Proof header | own `pickupsList()` on `reload` (ProofPage.tsx:200) via `openPickupsBeyondNotes` |
| Production/Delivery/Master/Schedule/ProoferSheet/RecordingCheckReport | `usePickupList` / `useOpenPickups` (pickups/useOpenPickups.ts) |
| Booth companion | `usePickupList` + `usePickupsState` (`pickupsState`,`pickupsCount`, DAW-marker based) (PickupsCompanionSummary.tsx) |
| Pickup creation | Editing "Mark for pickup" (menu + flag card) → `pickups.pickupsAdd`; Pickups "Add a pickup by hand" → `pickupsAdd`; Proof "Needs pickup" → `findingsReview(accepted)` (host derives the pickup); recording check gaps (host) |

The figure `openPickups(list)` is one function (`pickups/list/pickupRows.ts:85`); the lists fed to it are separate fetches with different refresh triggers. Proof's page-level `open` = notes + pickups-beyond-notes; the rail's Proof badge omits pickups.

### 4.9 Chapter edit / record status

`chapterRecordedDetail(c)` (recordedThrough.ts:37): Editing stepper note (EditingPage.tsx:131), Proof stepper (ProofPage.tsx:447), Booth. One implementation. Editing "edited" state: cuts/effects via `editCuts.editingCutsList` + `editWordFx.editingWordFxList` (useChapterSource.ts:81-82) + `editLog.editingAcceptedList`; EditingCheckPanel (`editing` stage signals) and `ProofingStagePanel` (`stages`) read other stores. No single "chapter is edited" figure inside this area; chapter `status` (`ManuscriptChapter.status`) updated by `ProofingStagePanel.onStatusChanged` only on `/proof/:chapterId`.

### 4.10 Check recordings dialog (one implementation)

`openCheckRecordings(ids, opts)` (recordingcheck/openCheckRecordings): Editing (useRecordingCheck.tsx, ScriptDoc "Check recordings…", jump command), Proof (ProofPage.tsx:542, CheckCard, jump command, ProofChapterPage:222), Pickups (PickupsTable.tsx:303, jump command). Same dialog. Labels differ: "Check recordings…", "Check recordings", "Check the recording of this chapter", "Check recordings of <chapter>". Disabled reason: Proof/Pickups use `useCapability('review')`; Editing has no DAW gate on its entry.

### 4.11 Add FX

Bar/toolbar "Add FX" (menu → pick chain → dialog) vs drawer "Add effect" (`fx.ask(selected)`, dialog without choosing chain first) vs "Choose in <DAW>…" (drawer only). Same `useFxWords` instance (one implementation) for apply/remove; Choose in DAW is drawer-only, no key/menu/bar entry.

### 4.12 Split vs Stack

"Stack as 2 takes" (flag card) and "Split into takes" (take footer, word menu) are the same `useSplitDuplicate` action. "Stack retries as takes"/"Un-stack"/"Clean up the other reads" are `useStackRetries` (different function). "Hide the other takes" exists in `useHideOthers` (`daw.hideTakes`) and again inside the stack clean-up (`stackCommand.ts:140`).

---

## 5. Suspicious controls

1. **Needs pickup (P) and Fix in edit (E) are one call.** Both `DecisionButtons` send `status:'accepted'` (proof/inspector/DecisionButtons.tsx:6-11,48); which label is "pressed" and which toast shows comes from `fixKindOf(finding)` (proof/resolution.ts:23), a function of the finding's category. Pressing "Fix in edit" on a pickup-category note stores the same status and the note then reads "Pickup". `useProofKeys.press()` clicks whichever button matches by text.
2. **Split labelled Stack.** Flag-card "Stack as 2 takes" (flags/FlagCard.tsx:151) runs the Split command (takes/split/useSplitDuplicate.tsx:81). Same function: flag card "Stack as 2 takes", take footer "Split into takes", menu "Split into takes", confirm "Split this take?".
3. **Same decision, three labels.** Proof "Fine as read" (Inspector), CheckCard "Ignore" (finding), Pickups "Fine, not a pickup" (`FINE_LABEL`, PickupsTable.tsx:525): all `findingsReview(dismissed)` (CheckCard may use `coverageGapIgnore` instead). Likewise "Needs pickup" / "Accept" / Editing "Mark for pickup" / "It is right, accept" (Editing's accept is `editingAccept` + dismisses linked findings, opposite effect from CheckCard "Accept" = accepted).
4. **Show in DAW: three labels, two host calls.** "Show in <DAW>" (`findingsGoTo`), "Show in the DAW" (`workspaceGoTo`), menu "Go to <DAW>" (clicks the Inspector button via `press(SHOW_IN)`).
5. **Proof keys and context menu act by clicking DOM buttons.** `press()` (useProofKeys.ts, useNoteContextMenu.ts) selects `aside[aria-label="Note"] button` by aria-label/text prefix; a renamed label silently breaks keys, jump-menu rows and menu items.
6. **No-op / placeholder handlers.** `MappingFix onClear={() => {}}` (EditingCheckPanel.tsx:102); `ProofingStagePanel` `onOpenCheck`/`onOpenEditingCheck={() => {}}` (documented unreachable); FX menu "Manage in <DAW>…" and source line (`fxMenu.ts:30,34`, always unavailable); `Skip to results (demo)` only in `MODE==='mock'` (CompareRun.tsx:518); `OffControls` (EffectSettings.tsx:55-72) permanently disabled Settings/Bypass/Preview/Compare when the DAW lacks them; CutDialog "Keep the cut audio…" Checkbox is `checked disabled onChange={() => {}}` (CutDialog.tsx:154); `FlagCard` buttons disabled "Not available yet" if their slot is not registered (e.g. Stack/Delete/Mark for pickup before the slice mounts).
7. **Orphans.** `proof/AuditionDialog.tsx` (no importer outside tests); `useBackupsOffered`-style hook in `editing/drawer/useDrawer.ts:24-37` and `backupsOffered` unused by the page (page uses `keepsBackups`); `RetryBar level="project"` has no UI (project retry mode is read by `useStackRetries.tsx:93` but only chapter/passage bars are mounted); `/proof/:chapterId` page reachable only from the engine panel.
8. **Takes of this line** toolbar button renders for lines with one take (EditingBody.tsx:372 `takes.length < 1` check) though the comment says more than one.
9. **Controls missing where expected.** Proof note context menu has no "Open in Editing" or "Add marker" though the Inspector has Add marker and Open in Editing (said-twice only); Proof Inspector offers Open in Editing only for repeat notes, other notes reach Editing only via "Manage takes in Editing" in the spot-takes block (needs takes). Pickups rows have no "Open in Editing" or "Show in DAW". Editing has no way to see/open the Proof note for a flagged word (`findingsAt` links silently), no link to Pickups, and no entry to "Choose in <DAW>" or the Backups restore outside the drawer. Editing "Match levels…" exists only inside the Editing check slide-over (Production/Engine), not in the drawer's Clean up tab. Restore of a cut from a previous session is only a toast instruction.
10. **Editing command ids on Pickups.** `useCommand('editing.chapter.next/prev')` in PickupsPage.tsx:174 (Alt+Up/Down) reuses the Editing command; keymap rebinds for Editing silently change Pickups.
11. **Counts disagree by construction** (see 4.1): tab label "Clean up · N" ignores `trimmed` and strength changes.
12. **Capability gate read once.** Most Editing hooks call `daw.capabilities()` on mount only (4.5); `useDawStatus` follows events. After the DAW connects, Delete/FX/Keep may stay disabled with the "Could not ask the DAW" / "Checking what the DAW can do." text until the chapter changes (EditingChapter is keyed by chapter).
13. **Proof "Hear it" Space shadows play.** `proof.note.hear` Space (`shadows: workspace.play`); on Proof this plays through the host loop in the DAW only (`findingsLoop`), whereas Editing Space plays via `useScriptPlayback`.
