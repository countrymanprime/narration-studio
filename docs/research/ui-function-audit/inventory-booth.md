# UI function audit: Booth, Companion, recording check, voice samples, playback, input

Built from code on branch `claude/ui-function-audit`. Paths are under `src/studio/ui/src/`. `B/` = `components/booth/`, `RC/` = `components/recordingcheck/`, `VS/` = `components/voicesamples/`. Host calls are `usePort('x').fn` (ports) or `useApi().fn` (direct) as noted; the Booth page uses ports, the Companion path and `useTeleprompterSession` use `useApi()`. Guides/mocks used only to cross-check (`docs/guides/using-the-app/booth.md`: no mention of Check recordings or the Companion).

## 1. Inventory

### 1.1 Booth page (`/booth`, `B/page/BoothNextPage.tsx`, scope `booth`)

| Control | Label / icon / tooltip | File:line | Handler -> host call / state | Notes |
|---|---|---|---|---|
| Chapter picker | `ChapterStepper` menu, items = Opening credits, chapters (+ `detail` = recorded short label), Closing credits | BoothNextPage.tsx:663-669 (primitive `components/primitives/ChapterStepper.tsx`) | `changeChapter(targetOf(id))` :501 -> `choose` -> `setParams` (URL `?chapter=`); refuses while recording (`overlay.toast('Stop recording first.')` :505) | disabled during take with reason; `data.recorded` detail via `chapterRecordedDetail` :557 |
| Prev/Next chapter arrows | IconButtons `previousChapter`/`nextChapter` | ChapterStepper (BoothNextPage.tsx:668 `onStep={step}`) | `step(dir)` :566 -> `changeChapter` | no key bound (stepKeys omitted) |
| Progress text | `bprog` "¶ n of N · words" | BoothTop.tsx:116 / BoothNextPage.tsx:592 `progressLine` | local calc from `units`, `at` | display only |
| Pickups badge | "Pickups · N open" | BoothTop.tsx:107-115 | `pickups.open` (`usePickupSession`) | only in pickup session |
| RecordedThrough chip | "Complete / 42% / ~42%" | B/resume/RecordedThroughChip.tsx; BoothNextPage.tsx:679 | `recordedThroughLabel(data.recorded[chapter.id], paragraphs)` :432 | display; source `manuscript.manuscriptChapters().recordedThrough` |
| Resume chip | "Resume at ¶ n" + tooltip "Sets where Start begins" / "No resume point" | B/resume/ResumeOffer.tsx:29 (`ResumeOfferLine`), BoothNextPage.tsx:680-684 | `page.chooseResume` -> `moveTo(unit)` (useBoothPage.ts:266); offer = `resumeOfferFor` (:265) fed by `teleprompter.teleprompterLocate` (:256) | |
| Credits warning chip | "N tokens have no value" | B/page/CreditsWarning.tsx:15; BoothNextPage.tsx:676 | `page.goTo('/settings#credits')` (leave guard) | credits sources only |
| Recording setup chip | `SetupChip`: DAW name / "· other project" / warning tone; tooltip "Recording settings · …" | B/record/SetupChip.tsx:81; BoothNextPage.tsx:690-697 | `page.goTo('/settings#recording')`; state from `useDawChoice` (`dawChoice.dawChoice()`, record/useDawChoice.ts:18) + capabilities + `project.unsavedChanges` | anchor `#recording`; RecordSetup "DAW settings" goes to `#daw` (BoothNextPage.tsx:791) |
| REC badge | "REC" / "REC · reading paused" | BoothTop.tsx:122 | `control.recording`, `page.paused` | display |
| Cold read badge | "Mic on · cold read" (dashed) | BoothTop.tsx:123 | `page.coldRead.on` | display |
| Text settings popover | IconButton `textSettings`, label "Text settings" | BoothTop.tsx:33 | opens Popover | |
| - Font select | "Font" | BoothTop.tsx:37 | `page.text.setFont` -> `saveTextPrefs` (localStorage, shared with Script + Settings > Reader text) (useTextChoices.ts:59) | |
| - Size slider | "Size 24-72 px step 4" | BoothTop.tsx:39 | `setSize` -> localStorage `narration.booth.textSize` (Booth-only) | no Settings copy |
| - Column width slider | "Column width" Narrow..Full | BoothTop.tsx:41-55 | `setWidth` -> `saveTextPrefs` | same pref as Settings > Reader text |
| Side-panel toggle | IconButton `sidePanel` "Toggle the side panel", `aria-expanded` | BoothTop.tsx:126-133 | `side.toggle` (`useBoothSideOpen`, side/BoothSidePanel.tsx:15) | drawer when layout `medium` (<=1280) |
| Record / Stop | Button id `brec`, icon record/stop, "Record"/"Stop" | B/record/RecordControl.tsx:20-29; BoothNextPage.tsx:819 | `page.toggleTake` (useBoothPage.ts:545): recording -> `control.toggle()`; gate -> `blocked(gate)`; else `roll.startTake()` -> `beginTake` (:310) -> `session.ensureModel`, `session.start`, `control.toggle(punch)` -> `daw.recordStart(chapterId, at)` / `daw.recordStop()` (useRecordControl.ts:445) | looks off via `aria-disabled` but stays pressable (opens fixing dialog or toast "Check again") |
| Take timer | `btimer` mm:ss | BoothFooter.tsx:128 | `useTakeClock(recording)` | wall clock |
| Levels menu | IconButton `levels` label "Levels" id `blevels` | LevelsMenu.tsx:417 (BoothFooter.tsx:131) | Popover | contents below |
| - Input meter | "Input level" | LevelsMenu.tsx:422 | `useLevels(device)` -> `teleprompter.teleprompterMeterStart/Stop` (useLevels.ts:44,49) + `subscribeTeleprompterEvent` | |
| - Microphone select (built-in recorder) | Select "Microphone" | LevelsMenu.tsx:93 (`Devices`) | `recording.recorderDevices()` (:72); `onDevice` = `session.changeDevice` -> `saveSettings('Teleprompter','global',{input_device})` (useTeleprompterSession.ts:401) | device list = recorder devices |
| - Microphone select (DAW; listen mic) | Select "Microphone" | LevelsMenu.tsx:107,209 (`MicSelect`) | `listen.onPick` = `session.changeDevice` | device list = teleprompter devices (different source than built-in branch) |
| - DAW candidate buttons | one per candidate mic, `aria-pressed` | LevelsMenu.tsx:170-178 | `listen.onPick(candidate)` | |
| - "Choose a different one" | ghost Button | LevelsMenu.tsx:161 | `setChoosing(true)` -> pick -> `session.chooseOverDaw` -> `saveSettings(Teleprompter,{input_device,input_source:'chosen'})` (:410) | duplicated in Settings `MicBody` |
| - "Use <DAW>'s input" | secondary Button | LevelsMenu.tsx:146-155 | `session.followDaw` -> `saveSettings(input_source:'daw')` (:401) | |
| - Input level slider | disabled always, "—" | LevelsMenu.tsx:312 | none (`onChange` unset) | STUB: permanently disabled slider |
| - Monitor level slider | "Monitor level (output)" | LevelsMenu.tsx:281-295 | `useMonitorLevel` -> `dawLevels.dawMonitorLevel()` / `dawSetMonitorLevel(n)` (useMonitorLevel.ts:45,64) | same hook reused by Editing output (`components/editing/output/EditingOutput.tsx:3`) |
| - DAW input/output meters | `DawMeter` | LevelsMenu.tsx:313,321 | `useDawMeters` -> DAW session store `state.meters` (`useDawMeterLease`) | |
| - Punch pre-roll (app) | NumberInput "Punch pre-roll (seconds)" | LevelsMenu.tsx:342 | `usePunchPreroll.set` -> `system.saveSettings('Teleprompter','global',{punch_preroll_seconds})` (usePunchPreroll.ts:54) | copy of Settings row (`settings/page/PageSettingPanel.tsx:10`); only when DAW declares no own pre-roll |
| - DAW pre-roll (read only) + "About …'s pre-roll" disclosure | Collapsible trigger "i" | LevelsMenu.tsx:378 | `useDawPreroll` -> `dawLevels.dawPunchPreroll()` (useDawPreroll.ts:26) | read only |
| Cold read | Button id `bcold` "Cold read", `aria-pressed`, title | BoothFooter.tsx:133-143 | `page.coldRead.toggle` (useBoothPage.ts:512): `session.ensureModel`, `session.start({coldRead:true})` -> `api.teleprompterStart({coldRead})`; stop -> `session.stop` -> `api.teleprompterStop` | also jump-menu "Start/Stop cold read" |
| Room tone chip + meter | "Room −58.6 dB" / "not measured yet" / "unavailable" | BoothFooter.tsx:30 `useRoomTone`; LevelsMenu.tsx:452 `LevelsInline` | `measurements.roomTone(mic)` every 5 s + focus (`ports/measurements`) | |
| Why / listen-why sentence | `#brec-why`, `#blisten-why` | BoothFooter.tsx:145,154-166 | `control.reason`, `listeningProblem(...)` | |
| Key hints | `KeyHints id=bkeys` | BoothFooter.tsx:168 | `footerHints('booth', keymap)` (input/hints.ts:78) | includes "Right-click Start from here" extra |
| Text (reading surface) | click a word | B/reading/BoothText.tsx:144 | `onSeek(paragraphId, word)` -> `page.seek` -> `moveTo` -> `session.seek(word)` -> `api.teleprompterSeek` (only when following) (BoothNextPage.tsx:726) + `referenced.show/clear` | also fills side-panel Reference |
| Text background click | none | BoothText.tsx:257 | `referenced.clear` | |
| Wheel scroll | browse mode | BoothText.tsx:256 -> `useBrowseView` | `onBrowse(true)` | |
| Note under paragraph | button `{name}: {text}` | BoothText.tsx:323 | `referenced.show({noteId})` | |
| Speaker chip | per quoted phrase, "Speaker X. Change speaker" | B/reading/SpeakerChip.tsx:90,121 | Popover: search, Listbox pick -> `setSpeaker(cueId, speaker)` -> `data.correctCue` -> `storyBible.guideCorrectCue` (useBoothData.ts) | |
| - "Confirm “X”" row | Listbox option | SpeakerChip.tsx (options `confirm:`) | same `onSetSpeaker` | |
| - sample play per speaker | IconButton play/stop | SpeakerChip.tsx:64 | `samples.play/stop` (useBoothSamples) | Ctrl+Enter = `samples.playPrimary` (:131-ish) |
| Bookmark ribbons | per bookmark, editor popover (label/note/delete) | B/bookmarks/BookmarkRibbons.tsx; `script/bookmarks/ui/BookmarkEditor` | `bookmarks.update/remove` (`useBookmarks` model, `bookmarks` port) | shared with Script |
| Page-break markers | `PageBreaks` | B/pages/PageBreaks.tsx | display; `Booth.words_per_page` (project setting) | |
| Setup notice chip(s) | "<DAW> not connected / not answering / Connecting…", "<DAW> has another project open" | B/record/RecordSetup.tsx:154,268 (`NoticeChip`) | `useOpenOnce().reopen` opens ResolveShell dialog | shown when `recordSetupFor(capabilities, facts)` |
| Chapter-link chip | "Not linked to a track" / "Linked to several tracks" | B/record/ChapterLinkNotice.tsx:45 | `reopen` opens `ChapterLinkDialog` | |
| Side panel (aside `#booth-side`) | sections order: Pickups(5), Reference(10), Suspected(30), Last punch(40), In this chapter(50), Coming up(60), This session(70) | side/builtinSections.tsx; BoothSidePanel.tsx:84 | see 1.3 | drawer: Escape/outside mouse closes (:50-58) |
| ListeningModelPrompt | "Download local <engine> model?" | B/listening/ListeningModelPrompt.tsx | `session.modelInstall` -> `api.assetsInstall/State/Cancel` (useTeleprompterSession.ts:148-151); `closeModelPrompt` | 4 copies, see tags |
| Loading / error / empty states | `BoothSkeleton`; `LoadError` (Retry + "Leave the Booth") | BoothNextPage.tsx:188-209 | `data.retry` -> `manuscriptChapters` again; `leave()` | |
| `BoothMessage` "no chapters to read" | text only | BoothNextPage.tsx:196 | none | no action |
| `BoothUnavailable` | "Set up credits in Settings" / "Back to the chapters" | B/page/BoothUnavailable.tsx:32-33 | `navigate('/settings#credits')`, `navigate('/script')` -- NOT through leave guard (uses raw `navigate` prop = `guardedNavigate`) | `useCommand('booth.exit')` :24 |
| NeedManuscript | import prompt | BoothNextPage.tsx:125 | `onImport` | |

### 1.2 Booth context menu (right-click, `ContextMenuHost` + `useContextProvider(menu)`; items in useBoothPage.ts:577-605 + bookmarks)

| Item | Where | Handler | Notes |
|---|---|---|---|
| Start from here (phrase only) | useBoothPage.ts:593 | `roll.startFromHere(phrase)` -> `chooseStart` + `startTake(from)` or `rollFrom` -> `daw.roll(recordId, t, {confirmed})` (useBoothPage.ts:307) | |
| Bookmark here (word) | useBoothBookmarks.ts:167 | `mark(spot)` -> `addBookmark(env)` (journal command, `bookmarks` port) + Undo toast | same command as key B |
| Read to here (word / page break) | useBoothBookmarks.ts:162,168 | `readToHere` -> `setStop` | |
| Edit bookmark / Edit stopping place (ribbon) | useBoothBookmarks.ts:155 | `ribbon.click()` | ribbon target = only these two |
| Delete bookmark / Remove stopping place (ribbon) | useBoothBookmarks.ts:156 | `remove(id)` | |
| Next phrase | useBoothPage.ts:595 | `moveTo(nextPhrase)` | same as Down |
| Back one phrase | :596 | `moveTo(backPhrase)` | |
| Punch and roll | :597 | `roll.punchAndRoll()` (NOT `page.punchAndRoll`: skips the `control.gate` check) | SUSPICIOUS-4 |
| Larger text / Smaller text | :598-599 | `setSize` | |
| Exit Booth | :600 | `exit()` | |
Each item `run()`-wraps to release the take hold (`holdWhileMenuOpen`, :670).

### 1.3 Booth side panel sections

| Control | Label | File:line | Handler -> host | Notes |
|---|---|---|---|---|
| Pickup session card jump | card body button | B/pickups/PickupSession.tsx:54 | `session.jump(id)` -> `jumpToLine` (BoothNextPage.tsx:346) -> `choose` or `seek`; refuses while recording | |
| Pickup dismiss | IconButton close "Dismiss: …" (speech-source, not done) | PickupSession.tsx:47 | `session.dismiss` -> `pickups.pickupsRemove(id)` + toast "Dismissed." (usePickupSession.ts) | no Undo |
| Suspected: dismiss | IconButton close "Dismiss: …" | B/suspected/SuspectedLines.tsx:94 | `dismiss` -> `teleprompter.teleprompterSaveFlags(chapterId, …dismissed)` + Undo toast -> `findings.findingsReview({status:'unreviewed'})` | different mechanism than pickup dismiss |
| Suspected auto-save | effect | SuspectedLines.tsx (effect on `flags`) | `teleprompterSaveFlags` on every flags change | also Companion `CompanionHost.tsx:86`, and `useSuspectedPickups.takeStopped` |
| Reference: Open in Story Bible | IconButton `openInStoryBible` | B/side/Reference.tsx:25 | `onOpenEntry(id)` -> `page.goTo('/story-bible#id')` | |
| Voices: play/stop primary | IconButton "Play primary voice sample for X" | B/side/VoicesInChapter.tsx:83 | `samples.play/stop` | disabled w/ `samples.refusal` |
| Voices: no sample | IconButton `hear` disabled "No voice sample yet. Mark one in Editing." | VoicesInChapter.tsx:91 | none | hint only, no link to Editing |
| Voices: "N samples" disclosure | ghost Button `aria-expanded` | VoicesInChapter.tsx:100 | local `setOpen` | |
| Voices: each sample | Button "Play voice sample: …" | VoicesInChapter.tsx:140 | `samples.play(sample, voice.name)` | |
| Voices: Check again | link Button | VoicesInChapter.tsx:54 | `samples.checkAgain` = `control.checkAgain` (DAW capability re-read) | |
| This session / Last punch | text | B/side/SessionNumbers.tsx | `page.numbers` (in-memory per page mount: `recorded`, `punches`) | session-local figure, not the chapter's recorded length |
| Coming up | text | B/side/ComingUp.tsx | `comingUpWords(units, at.cur, entities)` | |

### 1.4 Dialogs, drawers, toasts raised by the Booth

| Dialog / toast | Trigger | File:line | Actions -> host |
|---|---|---|---|
| "Stop recording?" leave question | leave while recording (nav, Exit, shell) | B/leave/useBoothLeaveGuard.ts:42 spec `leave/stopRecordingSpec.ts` | confirm -> `daw.recordStop()` (`stopRecording`, useBoothPage.ts:412) + `journal` take entry + `writer.flush` (`passageMap.passageMapRecordRun`); refused -> "Could not stop the take" / "Leave anyway" |
| "Stop reading?" | Exit while listening only | useBoothPage.ts:44,500 | `session.stop` -> `teleprompterStop`, `navigate` |
| Roll confirm "Roll again from ¶ n?" / "Punch in at ¶ n?" | destructive `punch` capability | roll/useRoll.ts:112,148 + roll/rollConfirm.ts | confirm -> `daw.roll(...)` / `beginTake(seconds)` ("Keep recording" cancel) |
| Setup dialog (connect) | chip click / press Record with `capability`/`wrong_project` gate | B/record/RecordSetup.tsx:292 -> `ConnectionResolveDialog variant=reaper-off` (`connection/ReaperOffDialog.tsx`) | "Start <DAW>" -> `useReaperLaunch`: `system.saveSettings('DAW','global',…)`, `project.launchDaw()`, poll `daw.capabilities()`; "Check again" -> `control.refresh`; "Link in Settings" -> `/settings#daw`; "Copy path" (RecordSetup.tsx:251) clipboard |
| Setup dialog (other project) | same | RecordSetup.tsx:159-170 `ResolveShell` | "Link the open project" -> `project.linkDawFile()`; "Check again"; "DAW settings" -> `/settings#daw` |
| Chapter link dialog | chip / Record with `no_track`/`several_tracks` | B/record/ChapterLinkNotice.tsx:64 -> `connection/ChapterLinkDialog.tsx` | "Link track" -> `chapterTrackMap.chapterTrackSet(chapterId, guid)` (:94); "Create a new track" -> `chapterTrackCreate` (:111); "Check again" |
| Model download prompt | Record/Cold read with model missing | `ListeningModelPrompt` | `api.assetsInstall…` |
| Toasts (page) | see useBoothPage/useRecordControl | `notify`, `overlay.toast` | "Take saved" + Undo (`overlay.toastUndo(TAKE_SAVED, journal.undo)`), `Recording did not start … Retry`, `Check again` action (BoothNextPage.tsx:615), `Track "x" added… Save the project`, "Stop recording first.", START_GUARD sentence, `stoppedInDaw`/`lostInDaw`/`backInDaw`, bookmark add/Undo, suspected/pickups Undo |

### 1.5 Booth keyboard / pedal commands (catalog `input/commands.catalog.ts`, scope `booth`; handlers via `useCommand`)

| Command | Default | Catalog line | Handler (file:line) | Notes |
|---|---|---|---|---|
| `reading.toggle` | Space | :439 | useBoothPage.ts:555 `toggleTake`; Companion: CompanionShell.tsx:140 (Play/Pause listening, not Record) | same id, two behaviours |
| (pedal) | Space, capture phase | - | `usePedalSpace(toggleTake)` useBoothPage.ts:556 / input/usePedalSpace.ts | fires when focus is on a non-Record button or a soft popup is open; closes popup |
| `booth.phrase.next/prev` | Down / Up, Backspace | :441,449 | useBoothPage.ts:557-558 | repeats |
| `booth.word.next/prev` | Right / Left | :459,467 | :559-560 | repeats |
| `booth.roll` | R | :476 | :561 `punchAndRoll` (gate-checked) | |
| `booth.view.down/up` | PageDown / PageUp | :477-478 | :562-563 `view.current.down/up(0.8)` | |
| `booth.text.larger/smaller` | = Num+ / - Num- | :479-480 | :564-565 | |
| `booth.voice-sample` | V | :489 | BoothNextPage.tsx:535 `samples.toggleSpeaker` | not marked `noisy` (guard via `useSamplePlayer` instead) |
| `booth.exit` | Escape | :496 | useBoothPage.ts:566 (closes sample first :570); BoothNextPage.tsx:132 (`BoothExit`, no session); BoothUnavailable.tsx:24; `layout/AddressGate.tsx:155` | 4 registrations |
| `booth.pickup.next/prev` | N / Shift+N | :497-498 | usePickupSession.ts:98-99 (only `active`) | |
| `booth.fullscreen` | F11 | :500 | B/useFullscreenKey.ts:12 -> `api/hostWindow.toggleFullscreen/exitFullscreen` | |
| `bookmark.here/next/prev` | B / Alt+] / Alt+[ | :287-302 | `useBookmarkCommands` in useBoothBookmarks.ts:137 | scope `global`, shared with Script |
| `companion.open` | Ctrl/Cmd+Alt+C | :502 | App.tsx:617 -> `/companion` | not from Booth UI |
| Jump-menu "On this page" (Booth) | Ctrl+K / Ctrl+F | page id `booth` | useBoothPageCommands.ts:37-130: chapters (`chapter.<id>`), Record/Stop, "Punch and roll from here", Next/Back phrase, "Start/Stop cold read", Next/Previous pickup, "Leave the Booth", + search rows Next/Previous match/Clear (useBoothFind.ts:88-105) | `run` = same functions as controls |
| Search source | Ctrl+F text | `useSearchSource(manuscriptSource)` useBoothFind.ts | `searchManuscript(lines, term)` + `reveal` -> `seek` |

Global keys active on the Booth (App.tsx useCommand 515-625, catalog): nav.back (Alt+Left/Browser Back/Mod+[), nav.forward, nav.settings (Mod+,), zoom.in/out/reset, help.shortcuts (?), jump.open, jump.page, history.open, undo.last (Mod+Z), companion.open.
Input sources: keyboard, `midiSource`, `hidSource` combined in main.tsx:37 (skipped when `appExtension().keyboardOnly`). Router: `LiveCommandRouter` (input/LiveCommandRouter.tsx) wires `isRecording` to `useDawRecording` (DAW session transport) to silence `noisy` commands. Key learning UI: `useGestureCapture` (input/useGestureCapture.ts) used by Settings. Keymap: `useUserKeymap` reads `settingsForScope('global').Keymap.overrides`.

### 1.6 Companion (`/companion`, `B/companion/CompanionPage.tsx` -> `CompanionHost.tsx` -> `CompanionShell.tsx`)

| Control | Label | File:line | Handler -> host | Notes |
|---|---|---|---|---|
| Window pin | enter/exit companion mode | CompanionShell.tsx:71-78 | `api.companionModeEnter()` / `companionModeExit()` | error line "Couldn't pin the window…" |
| Full app | secondary Button, icon up-right-down-left | CompanionShell.tsx:173 | `onFullApp` -> `navigate(/booth?chapter=…)` (CompanionPage.tsx) | no leave guard on session |
| Esc Esc | double Escape within 3 s | CompanionShell.tsx:163 `onKeyDown` | `onFullApp` | status line "Press Esc again…" |
| Play / Pause | Button `<Kbd Space>` Play/Pause, `aria-pressed` | CompanionShell.tsx:194 | `onPlayPause`: not active -> `recording.beforeStart()` (`useRecordInReaper`) then `t.start()` -> `api.teleprompterStart`; active -> `t.pause(listening)` -> `api.teleprompterPause` | `reading.toggle` :140 same |
| Stop reading | danger Button | CompanionShell.tsx:201 | `t.stop()` + `recording.afterStop()` -> `api.readAloudRecordStop()` | |
| Follow | Button | CompanionShell.tsx:209 | `follow.resume` (`useFollowCursor`) | only while active |
| Read-along text | `ReadAlongView`/`ReaderText` rows | ReadAlongView.tsx:64; ReaderText.tsx:80-84 | click word -> `t.seek` -> `api.teleprompterSeek` (only when active) | `onOpenMark` unused (no handler passed by Shell) |
| Resume prompt ("Where you stopped") | text links: Change, Start from the top, Pick a word, resume-here buttons, Retry, Download model… | B/ResumePrompt.tsx:165,167,198,218,220,243,247,307,318,367,409-441 | `onStartWord` -> `session.setStartWord`; `useResumeLocate` -> `api.teleprompterLocate`; `api.teleprompterResumeFollow/Unfollow` + `subscribeTeleprompterResumeFollow` (:513-525); model: `api.whisperInstall…` | separate resume implementation from Booth page |
| Pickups summary | `PickupsCompanionSummary` | CompanionShell.tsx (Section "Pickups") | (pickups area) | |
| Hotkeys section | static list Space / Esc Esc | CompanionShell.tsx | none | text "Hotkeys that reach this panel from REAPER are not available yet." |
| This chapter | "Recorded m:ss", stage + reason | B/CompanionThisChapter.tsx:15-48 | `api.productionOverview()` -> `chapters[].recordedSeconds`, `status`, `readiness.reason` | |
| Note at playhead | badge "Coming soon" | CompanionShell.tsx | none | STUB |
| Playhead badge | "Recording · t" / "Playhead t" / "stopped" | CompanionShell.tsx:playheadBadge | `useDawState(state.transport)` | |
| Record-in-REAPER toggle + confirm | "Record in REAPER when you press Play?" "Turn on" | B/RecordInReaperConfirm.tsx; useRecordInReaper.ts toggle/confirm | `saveSettings('ReadAloud','project',{record_in_reaper,record_confirmed})`; `readAloudRecordStart/Stop`, `readAloudArmOnly` | NO control calls `recording.toggle()`/`armOnly()`: confirm dialog unreachable (SUSPICIOUS-1) |
| Unresolved credits warning | "Fill them in Settings" | B/UnresolvedCreditsWarning.tsx:25 | `onFixCredits` -> `/settings#credits` | |
| Flag save | on stop/unmount | CompanionHost.tsx:86 | `api.teleprompterSaveFlags` | |

### 1.7 Check recordings dialog (`RC/`; the only entry is `openCheckRecordings(preselected, {extra,onClosed})`, RC/openCheckRecordings.tsx:17, via overlay `dialog` "Check recordings", wide, no outside-dismiss)

| Control | Label | File:line | Handler -> host | Notes |
|---|---|---|---|---|
| Speech model select | "Speech model" | RunOptions.tsx:45 | `onChange({model})`; options from `coverage.coverageEngines()` (Dialog:102) | label "(not installed)" |
| Look again checkbox | "Look again with a larger model" | RunOptions.tsx:47 | `recheck` | |
| Larger model select | "Larger model" | :55 | `recheckModel` | |
| Doubt share select | "Also look again at words scored under" | :65 | `recheckBelow` | |
| Whole checkbox | "Transcribe each recording whole" | :80 | `chunkSeconds` 0/60 | |
| Chunk / Overlap / Workers sliders | | :83,94,107 | choices | |
| Automatic workers checkbox | | :118 | `workers` 0 | plan text from `coverage.coverageWorkerPlan` (workerPlan.ts) |
| Chapters at once select | | :131 | `chapters` | |
| Chapter checkboxes | per recorded chapter | Dialog.tsx:396 | `toggle` | list = `recordedChapters(manuscriptChapters, preselected)` (checkSelection.ts) |
| All / None | ghost sm Buttons | Dialog.tsx:374,377 | `setTicked` | |
| Show result | per chapter | Dialog.tsx:403 | `setViewing(id)` -> `CheckResult` (`coverage.coverageResult`) | |
| Refused reason block: TrackLink / page links | "Open the audio engine panel", MappingConfirm | CheckResult.tsx:143-152, 158-203 | `tracks.tracksList`, `chapterTrackMap.chapterTrackMapConfirm(guid, chapterId)` (:192) | `onClear={() => {}}` noop |
| Cancel | secondary | Dialog.tsx:447 | `close` | |
| "Check N chapters" | primary | Dialog.tsx:450 | `begin(ids)` -> reducer -> `coverage.coverageStart(id, startOptions)` (:144) | disabled by `findProblem`, `useCapability('review')` |
| Stop checking | secondary | RunningView.tsx:14 | `stop` -> `coverage.coverageCancel()` (Dialog:228) | Escape while running -> confirm "Stop checking?" (:233-245) |
| Result: Check again / Check recording | primary | Dialog.tsx:334 | `begin([id])` | |
| Result: Go to paragraph / Open in Editing | in `RecordingCheckReport` | Dialog.tsx:331-332 | `scriptPath(...)` / `addressPath({page:'editing'})`, closes | |
| Result: Back to chapters / Done | | Dialog.tsx:341,344 | `setViewing(undefined)` / `close` | |
| Model download prompt | "Download local Whisper model?" / "Download the re-check model?" / "Check with X only" | Dialog.tsx:265-310 | `whisper.whisperInstall/State/Cancel`; alternative sets `recheck:false` | |
| Toasts | "Checked N chapters · N lines to redo · N not recorded to the end" / "Stopped…" / "Whisper model installed." | Dialog.tsx:174-176, 201; checkSelection.ts finishedToast/stoppedToast | | |
| Background check card (app-wide, fixed bottom-left) | Pause, Cancel, Hide, Resume, collapsed button | RC/background/BackgroundCheckStatus.tsx; mounted App.tsx:1082 (`folded` on /booth) | `system.saveSettings('RecordingCoverage','global',{background_checks…})` + `coverage.coverageCancel()` (BackgroundChecks.tsx:96-117); `coverage.coverageState` + `subscribeCoverage` | |
| Background notice dialog | "Not now" / "Check in the background" | BackgroundChecksNotice.tsx | `saveSettings({background_checks_confirmed…})` (BackgroundChecks.tsx:86-95) | |
Callers of `openCheckRecordings`: editing/page/useRecordingCheck.tsx:17, production/useChapterTools.tsx:168,281, production/ProductionPage.tsx:294,430, proof/ProofPage.tsx:429,489,546, proof/ProofChapterPage.tsx:221, pickups/PickupsPage.tsx:277,314. Booth: none.

### 1.8 Voice samples (`VS/`)

| Control | File:line | Handler -> host |
|---|---|---|
| `SamplePlayButton` (IconButton play/stop + progress) | VS/SamplePlayButton.tsx | `onPlay/onStop` from caller; used in Editing `SampleMark.tsx:77`, Story Bible `VoiceSampleRow.tsx:86` |
| `SamplePlayerAnnouncement` live region | SamplePlayButton.tsx; BoothNextPage.tsx:817 | |
| `useSamplePlayer` | VS/useSamplePlayer.ts | module-singleton player `samplePlayerStore.ts` (`playSample`, `stopSample`); URL = `voiceSamples.voiceSampleMediaUrl(id)`; guard `{recording, cantTell}` optional |
| `useVoiceSamples` | VS/useVoiceSamples.ts | `voiceSamples.voiceSamplesList()` + `subscribeVoiceSamples` |
| `useSampleOutputSync` | VS/useSampleOutputSync.ts | `system.settingsForScope('project').VoiceSamples.output_device` + `recording.recorderState()` (only applied when engine builtin) -> `setSampleOutput` |
| `audioOutputs.ts` / `testSound.ts` | | `setSinkId`; `playTestSound` used by Settings `SampleOutputBody` only |
| Escape stops sample before page | samplePlayerStore.ts:58-63, useBoothPage.ts:570, SpeakerChip.tsx (Escape) | `escapeJustStoppedASample()` |
| Booth wrapper `useBoothSamples` | B/samples/useBoothSamples.ts | adds recording/`cantTell` guard, pauses listening session (`session.pause`) 350 ms around a sample, prefetch |

### 1.9 Playback (`playback/providers.ts`)

No controls. `playThrough(providers, request, rule)` ordered providers (DAW first, app last), `dawReadiness(caps, capability)`, `quietWhileRecording(projectState, name)`. Consumers (not Booth): editing/takes/useTakeAudition.ts:87,136,137; editing/bar/useScriptPlayback.ts:182,209,210; proof/inspector/HearIt.tsx:114,142; pickups/list/usePlayOriginal.ts:91,144-146. The Booth does not use it: its only audio is the voice sample player (app-only `<audio>`) and the take tone (`takeTone.ts`, WebAudio).

### 1.10 Misc settings written/read from this area

| Setting | Store | Booth writer | Other writer |
|---|---|---|---|
| Take start tone | localStorage `narration-ui-take-tone` | read in `playTakeTone` (useRecordControl.ts:444) | Settings `settings/controls/TakeToneBody.tsx` writes |
| Booth text size | localStorage `narration.booth.textSize` | useTextChoices.ts | none |
| Font/width | localStorage via `loadTextPrefs/saveTextPrefs` | BoothTop popover | Script text tool (`script/page/tools/text/useTextPrefs.ts`), Settings `controls/readerText.ts` |
| Last place/chapter place | localStorage `narration.booth.lastPlace.<folder>`, `chapterPlaces.<folder>` | page/lastPlace.ts | none |
| Mic device/source/engine/model | global settings `Teleprompter.*` | useTeleprompterSession.ts:401-440 | Settings (`MicBody`, rows.ts:62) |
| Punch pre-roll | global `Teleprompter.punch_preroll_seconds` | LevelsMenu | Settings `PageSettingPanel` |
| words_per_page | project `Booth.words_per_page` | read only (pages/useWordsPerPage.ts) | Settings rows.ts:477 |
| Flag visibility | localStorage `narration.readAloud.flags` | nothing writes (readerPreferences.ts note) | Companion reads |
| Record-in-REAPER | project `ReadAloud.record_in_reaper`, `record_confirmed` | useRecordInReaper.ts:73 (never triggered) | Settings? (not found in this area) |

## 2. Capability tags

Legend: ONE = one shared implementation; SEP = separate implementations.

### T1. Recording-check run / state

- Run dialog: RC/CheckRecordingsDialog.tsx (`coverage.coverageStart`, :144). One entry fn `openCheckRecordings` for every caller (ONE for launching).
- State shown per chapter: three places read `coverage.coverageResult`: dialog (Dialog:105,165,213), `proof/checkcard/CheckCard.tsx:84` (also `coverageGapReviews`), `useChapterTools`/production row (`subscribeCoverage` interactionFeedback/production.ts:35 = percent only). Stale/never/current text: `checkStateLabel` (RC/checkSelection.ts) vs `production/recordingCheckText` / `pipelineRows`. SEP readers of the same host value; they read the same `coverageResult`, so they disagree only in staleness (dialog reads once on open and after run; CheckCard re-reads on `subscribeCoverage`).
- Which chapters are checkable: Dialog uses `recordedChapters()` = `manuscriptChapters[].recordedSeconds > 0 || recordedFraction > 0 || asked` (checkSelection.ts:9-14). Production uses `counts.stale/never` from `chapterSync` (`ProductionPage.tsx:287-294`). Proof CheckCard uses `hasRecording(chapter.recordedSeconds)` (CheckCard.tsx:127,143). Booth uses none. SEP, inputs differ: manuscript chapter fields vs chapterSync rows.
- Gate: Dialog `useCapability('review')` (Dialog:75) vs Production `caps.reachable` (ProductionPage.tsx:294). SEP.
- Background run: `BackgroundChecks` (App-level) + dialog both subscribe `coverage.subscribeCoverage`; state is host-side so ONE source, but the dialog filters `state.runId` of its own runs only implicitly (no `background` check in Dialog:128-135) -> a background run's progress events can enter the dialog reducer (`dispatch progress` with a foreign runId; reducer likely ignores unknown runId, not verified).
- Booth: no entry point. Recorded/needs-check status is not shown on the Booth at all.

### T2. "Is recording" (take state)

1. `useRecordControl.recording` (B/record/useRecordControl.ts:141): local state set by `recordStart/Stop` result, transport push (`daw.subscribeTransport`), 4 s `projectState().playState` poll, adoption of a take (module vars `appTakeRunning`, `lastStartAt`). Drives REC badge, footer timer, leave guard, chapter picker lock, sample guard, pickups, bookmarks.
2. Router `isRecording` = `useDawRecording` (input/useDawRecording.ts) = DAW session store `transport.recording` (daw/useDawSession). Gates `noisy` commands only (Space `workspace.play`, `proof.note.hear`).
3. `useBoothRecording(boothShowing)` (B/useBoothRecording.ts) = same DAW session store `transport.recording` && route is /booth. Gates App toast queue (App.tsx:407).
4. `quietWhileRecording` (playback/providers.ts:91) = `daw.projectState().playState === 'recording'` fetched at play time (Editing/Pickups/Proof).
5. Companion: no recording flag; `useRecordInReaper.recording` (own `recordingSince`) and playhead badge from DAW session transport.
6. Story Bible / Editing sample players: `useSamplePlayer()` with NO guard (Guide.tsx:118, editing/voicesample/sampleMarksContext.tsx:57, VoiceDataPanel.tsx:64, EntryVoiceSamples.tsx:27) -> can play while recording; the Booth's version blocks (NOT_WHILE_RECORDING).
SEP. Can disagree: (1) is app-driven with heartbeat lag and a 4 s poll plus a 3-miss rule, while (2)(3) read the live transport push; with the app's own built-in recorder `transport.recording` may never be true (needs verification), so (2)(3)(4) can say "not recording" while (1) says recording; and after a DAW-side stop/Record start by hand (1) uses `takeElsewhere`/`adopt` logic that (2)(3) do not.

### T3. Record availability ("can Record?" and why not)

- Booth: `recordCheck(capabilities, chapter, openProject)` (B/record/recordCheck.ts) over `daw.capabilities()` + `subscribeCapabilities` + `teleprompter.readAloudReaperState(chapterId)` (track count) + `system.bootstrap()` (`dawFileLinked`, `dawProjectMatches`) + `projectState().playState` (elsewhere). Refusal codes: capability, wrong_project, recording_elsewhere, no_track, several_tracks.
- Production page: `caps.capabilities.record?.available` only (ProductionPage.tsx:278-282) from DAW session store; the "session" jump-menu entry.
- Companion: `useCapability('record')` = DAW session store (CompanionHost.tsx:66).
- Pickups/Proof/Editing: link to Booth only.
- Setup chip: `SetupChip` computes `ready` from `useDawChoice` (`dawChoice.dawChoice()`) OR `capabilities.reachable` (SetupChip.tsx:62-66) -- a third notion ("connected").
SEP (3 stores: `useRecordControl` local capabilities, DAW session store, `useDawChoice`). They can disagree: Production says Record OK while the Booth refuses (no track, different project open, DAW recording elsewhere); the chip can show green ("connected") while `capability` is unavailable and vice versa. Booth re-reads on focus/4 s/15 s; session store has its own cadence (`DAW_RETRY_MS`).

### T4. Chapter-to-track link (fix for "not linked")

- Booth: `ChapterLinkDialog` -> `chapterTrackMap.chapterTrackSet / chapterTrackCreate` (connection/ChapterLinkDialog.tsx:94,111).
- Recording-check refused row: `TrackLink` -> `MappingConfirm` -> `chapterTrackMap.chapterTrackMapConfirm` (RC/CheckResult.tsx:192).
- Audio engine panel `/tracks` (link from CheckResult.tsx:178 and others).
SEP (different host methods: `chapterTrackSet` vs `chapterTrackMapConfirm`). Same host data (chapter-track map) so they should agree after refresh, but only the Booth path can create a track and shows last-checked seconds; the check dialog `onClear` is a noop.

### T5. Recorded figures / progress

1. Chapter `recordedThrough` (host value via `manuscript.manuscriptChapters()`): Booth chip + picker detail + `resumeStart` (BoothNextPage.tsx:405-432,557); shared helper `recordedThrough.ts` used by Editing chapter menu (EditingPage.tsx:131) and Proof (ProofPage.tsx:447); Production pipeline uses own wording `pipelineRows.ts:118-185`. Helper ONE; read timing SEP: Booth re-reads after each take (`refreshRecorded`, BoothNextPage.tsx:429), others only when they load.
2. `recordedSeconds` (length): Check dialog audio total (checkSelection.ts:28), Companion "Recorded m:ss" via `productionOverview()` (CompanionThisChapter.tsx:42), Production KPI/pipeline, Proof CheckCard `recordedLabel`. Two host reads: `manuscriptChapters` vs `productionOverview` -> SEP, can disagree in freshness (Companion reads once per chapterId mount).
3. Booth "This session / Recorded mm:ss" (SessionNumbers.tsx) = in-memory sum of takes this page mount (`recorded + seconds`, useBoothPage.ts:386,638): third figure called "Recorded", resets on chapter change/reload; not equal to (1) or (2).
4. Progress line in top bar = words read of the text (`progressLine`), Companion has none. `boothProgress.ts` `boothProgress/progressText/comingUp` are old and appear unused (only `clockText` is imported elsewhere).

### T6. Play / stop (audio) and "Hear"

- Booth: voice-sample play via `useBoothSamples` -> `useSamplePlayer` -> `samplePlayerStore` (module singleton). 5 play entry points: SpeakerChip row button (SpeakerChip.tsx:64), VoicesInChapter primary (:83) and each sample (:140), key V (`booth.voice-sample`, BoothNextPage.tsx:535), Ctrl+Enter in speaker listbox. ONE implementation (`samples.play`).
- Same player store is used by Story Bible and Editing, but via separate `useSamplePlayer()` instances with different guards (T2.6). One shared audio element/state (singleton) so they cannot play simultaneously; guards differ.
- Recorded-audio playback (Editing, Pickups, Proof) use `playback/providers.ts` `playThrough`, each with its own provider list (useTakeAudition: [preview(file_preview), app]; useScriptPlayback: [transport_sync…]; HearIt: [loop(navigate), app]; usePlayOriginal: [transport(transport_sync), app]) -> shared rule, SEP providers; capability keys differ (`file_preview`, `transport_sync`, `navigate`), so DAW-can-play can differ per page.
- Companion Play/Pause = listening session, not audio.
- Router: Space `workspace.play` (noisy) vs `proof.note.hear` (noisy) vs `reading.toggle` (Booth/Companion): one key, three meanings by page, resolved by scope and `shadows`.

### T7. Open in Editing / Proof / Story Bible / Settings / Script (navigation out of Booth)

- To Settings: `#credits` (CreditsWarning, BoothUnavailable, Companion UnresolvedCredits), `#recording` (SetupChip), `#daw` (RecordSetup, ReaperOffDialog onLink). Booth 'Settings' anchors differ for the same DAW-link purpose. All via `page.goTo` (leave guard) except BoothUnavailable's `navigate` prop.
- To Story Bible: Reference `openInStoryBible` (`/story-bible#id`) only.
- To Script: BoothUnavailable "Back to the chapters", exit (`exitTo`), Esc.
- To Pickups: exit in a pickup session.
- To Editing/Proof: NONE from the Booth (Voices "No voice sample yet. Mark one in Editing." has no link). Check dialog result has "Open in Editing" (CheckResult path Dialog.tsx:332) and Go to paragraph (Script).
- Into the Booth: `boothQuery` (B/page/boothQuery.ts:12) from Script (goToBooth with `from`), Pickups (`boothSessionPath`), Proof (`useNoteContextMenu.ts:59`), Production (`goToBooth`), Companion Full app, App `useFollowDawOnOpen` (DAW's chapter).

### T8. Resume point

Three implementations:
1. Open-at (`resumeStart`: recordedThrough -> kept chapter place -> top), B/resume/resumeStart.ts + `lastPlace.ts` (localStorage).
2. Booth top-bar offer (`ResumeOfferLine`): `resumeOfferFor` with kept/opened/`teleprompterLocate` via `usePort('teleprompter')` (useBoothPage.ts:256).
3. Companion `ResumePrompt` + `useResumeLocate` via `useApi().teleprompterLocate` + `teleprompterResumeFollow` (separate component, model-download copy, agree/disagree UI).
(`ResumeOffer`+`useResumeOffer` in B/resume/ResumeOffer.tsx are a fourth, unused.) SEP: (1) uses the manuscript `recordedThrough`; (2)/(3) use the host locate (transcription of the recording end / DAW cursor). They are different data sources and can name different words (guide says Start from recorded end; the chip may offer the DAW cursor).

### T9. Chapter pickers

- Booth: `ChapterStepper` fed by `pickerChapters` (BoothNextPage.tsx:554): credits + narration chapters only (`contentKind==='narration'`, useBoothData.ts:103) with `headingName`.
- Companion: no picker (URL `?chapter=`), fallback = running session / `readerState().activeChapter` / first (CompanionPage.tsx).
- Jump menu Booth rows (useBoothPageCommands.ts:46) reuse `pickerChapters` (ONE with the stepper).
- Others: Editing (EditingPage.tsx:127), Proof (ProofPage.tsx:446), Script, Pickups, Production each build their own list from their own manuscript read; same primitive `ChapterStepper`/`chapterRecordedDetail`. Booth lists credits rows that other pages' pickers do not; Booth opens on `useBoothData.fallback` = running session chapter else first, Companion on last-read chapter -> can open different chapters for the same project state.

### T10. Settings duplicated in the Booth

Microphone (device/source), punch pre-roll, text font/width, take tone (Settings only), engine/model (Booth session state; `changeEngine/changeModel` exist in `useTeleprompterSession.ts:419-440` but no Booth control calls them), words_per_page (Settings only), DAW start/link (Settings + setup dialogs). Booth writes via `useApi().saveSettings` (session) or `usePort('system').saveSettings` (pre-roll): two access layers for the same store; the Booth reads `Teleprompter.*` once at mount (`settingsForScope('global')`, useTeleprompterSession.ts:225) so a Settings change while the Booth is mounted is not seen (the Booth is full-window, so unlikely; Companion + main window concurrency possible).

### T11. Model download prompt (Whisper/Moonshine)

Four separate copies of "Download local <engine> model?": `ListeningModelPrompt` (Booth), inline `AssetInstallPrompt` in `ReadAlongView.tsx:64-90` (Companion), `WhisperModelPrompt` (Companion resume), inline in CheckRecordingsDialog.tsx:265. Three install hooks: `api.assetsInstall` (listening) vs `whisper.whisperInstall` (resume, check). ListeningModelPrompt.tsx header admits the copy (DQ-13).

### T12. Microphone / device list

Built-in recorder: `recording.recorderDevices()`; DAW listening mic: `session.devices` (teleprompter devices); both write the same `Teleprompter.input_device`. Settings `MicBody` shows a third rendering (`resolveListeningMic` shared, `listening/listeningMic.ts`). ONE resolver, SEP lists.

### T13. Bookmarks / stopping place

Script and Booth share `useBookmarks`, `useBookmarkCommands`, `addBookmark/setStop`, ribbons: ONE implementation, hosted twice; key `B` etc. are global-scope rows.

### T14. DAW follow / chapter sync

Booth: `useFollowDawOnOpen` (dawPlace.dawPlace polling 2 s for 20 s when opened with no chapter) and `useMoveDawOnOpen` (dawGoToChapter) -- Booth-only; Companion/Production do not move the DAW.

### T15. Pickups from Booth

- Session pickups marked recorded after a take: `pickups.pickupsSetDone` (usePickupSession.ts); dismiss `pickups.pickupsRemove`.
- Suspected lines: `teleprompter.teleprompterSaveFlags` + `findings.findingsReview(accepted)` (useSuspectedPickups.ts); list/dismiss path `teleprompterSaveFlags` + `findingsReview` (SuspectedLines.tsx).
- Pickups page owns the list (`pickups.pickupsList`).
SEP: pickup-dismiss (remove) vs suspected-dismiss (review status) differ in persistence and Undo.

## 3. Suspicious controls

1. **Record-in-REAPER toggle and confirm are dead.** `useRecordInReaper.toggle`, `armOnly`, `armPending` are never called by any component (grep: only defined, B/useRecordInReaper.ts:25,86-143); `RecordInReaperConfirm` shows only when `confirmPending`, set only by `toggle`. Companion Play records in REAPER only if a project setting `ReadAloud.record_in_reaper` is already true, with no UI here to set it (ratchetReasons.ts:26 marks it COMPANION/frozen). Booth Record uses a different path (`daw.recordStart`), so "Play in Companion" and "Record in Booth" are two unrelated recording implementations (`api.readAloudRecordStart` vs `daw.recordStart`).
2. **Input level slider is permanently disabled** (LevelsMenu.tsx:312: value 0, "—", no handler) -- a stub shown with a reason sentence.
3. **"Note at playhead" section in Companion is "Coming soon"** (CompanionShell.tsx); Companion `onOpenMark` is declared but CompanionShell passes none to the text rows (`onOpenMark` prop from Shell is never given by `CompanionHost`).
4. **Right-click "Punch and roll" calls `roll.punchAndRoll()` directly (useBoothPage.ts:597)** while key R and the jump menu call `page.punchAndRoll` (:551) which first checks `control.gate`; the menu skips the gate message path.
5. **Same function, different labels:** `reading.toggle` is "Record or stop" (catalog), "Record / stop" (footer hint), Companion "Play/Pause"; `booth.phrase.next/prev` = "Next phrase"/"Previous phrase" (catalog) vs "Back one phrase" (menu + jump menu) vs hint "Phrase"; `booth.exit` "Leave the Booth" (catalog, jump) vs "Exit Booth" (context menu) vs "Exit" (hint); `workspace.*` vs `editing.phrase.*` "Previous phrase" (non-Booth); bookmark steps labelled "Bookmarks" in hints; dismiss = "Dismiss" icon for pickups (remove) and suspected (review) with different effects.
6. **Duplicate controls for the same toggle:** `BoothSideToggle` (side/BoothSidePanel.tsx:25, `aria-pressed`) is unused; BoothTop has its own `IconButton action="sidePanel"` with `aria-expanded`. `ResumeOffer` (resume/ResumeOffer.tsx:50) + `useResumeOffer` unused in production. `boothProgress`/`progressText`/`comingUp` in B/boothProgress.ts likely unused (only `clockText` imported elsewhere). `ReaderKey` only in non-dense ReadAlongView (Companion passes `hideKey`). `usePedalSpace` plus `reading.toggle` both bind Space (intentional, split by target).
7. **Controls that should exist elsewhere but do not:**
   - Booth has no "Check recording" / recording-check status entry (every other recording page does; guide booth.md silent).
   - Booth has no "Open in Editing/Proof" for the chapter or the recorded take, and the "Mark one in Editing" hint on Voices is text, not a link.
   - Booth exposes no engine/model choice although `changeEngine/changeModel` exist (useTeleprompterSession.ts:419,430): only reachable from Settings.
   - Take tone, words-per-page, Booth text size have no Settings counterpart for size (size is Booth-only localStorage).
   - Companion has no Record/Stop, no punch, no chapter picker, no bookmark, no Levels; hotkeys list says REAPER hotkeys "not available yet".
   - Companion "Full app" navigates without the Stop-reading question while a session listens (Booth Exit asks).
8. **Anchor inconsistency:** SetupChip -> `/settings#recording`; RecordSetup "DAW settings" and ReaperOffDialog "Link in Settings" -> `/settings#daw`; CreditsWarning text says "Settings > Project > Credits" but anchor `#credits`.
9. **`CheckResult` `MappingConfirm onClear={() => {}}`** (RC/CheckResult.tsx:200): clear action is a noop.
10. **Booth `BoothMessage` "no chapters"** has no action/exit button (Esc is not registered either: no `BoothExit` wrapper, BoothNextPage.tsx:196), unlike the error and unavailable states.
11. **`booth.exit` registered four times** (useBoothPage.ts:566, BoothNextPage.tsx:132, BoothUnavailable.tsx:24, layout/AddressGate.tsx:155); only one mounted at a time by construction; verify no overlap during the loading -> loaded transition (BoothExit wraps the skeleton, then BoothSession mounts its own).
12. **Booth `BoothUnavailable` navigations bypass `page.goTo`** (uses raw `navigate`), fine because no take can run there.
13. **Escape during Check dialog run** is captured with `document` capture listener (RC/CheckRecordingsDialog.tsx:245), separate from overlay's Escape; fine but a second Escape mechanism.
14. **Sample players unguarded outside Booth** (T2.6): Story Bible/Editing can play while a DAW take records.
