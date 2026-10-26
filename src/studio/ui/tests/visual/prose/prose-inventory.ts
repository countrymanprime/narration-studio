// Every run of prose (over 60 characters, or two sentences) the app draws as plain JSX text, found by tests/visual/prose/extract.ts and
// classed by what it is (design system, "No in-flow instructions": docs/design/design-system.md#no-in-flow-instructions). The list is the
// whole inventory, not a sample: inFlowProse.test.ts fails on a run of prose that is not listed here and on an entry whose text is gone, so
// the list always matches the code. Classes:
//
// - `overlay`: inside a dialog, slide-over, menu, popover or tooltip, so it cannot move the page under it.
// - `error`: a failure, a refusal or a reading the app cannot trust, with what to do about it.
// - `empty`: what an empty list or panel is waiting for.
// - `state`: the state of the thing in front of the narrator, in words (data).
// - `instruction`: how to use a control or a gesture, drawn in the page's flow. Not allowed: its home is a tooltip, a "?" overlay or the guide.
// - `explanation`: background, reasons or technical detail drawn in the page's flow. Not allowed either, for the same reason.
//
// `instruction` and `explanation` entries are debt, tracked on #2251: their number may only shrink (`MAX_IN_FLOW_INSTRUCTIONS` in
// inFlowProse.test.ts caps it). Adding an entry of another class is allowed, and a reviewer sees the class it claims.
//
// Generated on 2026-10-26 from main by the extractor and classed by hand where the pattern guessed wrong; re-class an entry when you touch it.

type ProseClass = 'overlay' | 'error' | 'empty' | 'state' | 'instruction' | 'explanation';

export type ProseEntry = { file: string; text: string; class: ProseClass };

export const PROSE_INVENTORY: ProseEntry[] = [
  { file: 'components/booth/CompanionShell.tsx', text: 'Hotkeys that reach this panel from REAPER are not available yet.', class: 'state' },
  {
    file: 'components/booth/CompanionShell.tsx',
    text: 'The proofer&apos;s note at REAPER&apos;s playhead, with Resolve and Fine as read, will show here.',
    class: 'state',
  },
  {
    file: 'components/booth/RecordInReaperConfirm.tsx',
    text: 'Play will arm and start recording in REAPER on the track linked to … , and Stop will stop that recording.',
    class: 'overlay',
  },
  {
    file: 'components/booth/RecordInReaperConfirm.tsx',
    text: 'Nothing is recorded on any other track, and a recording you started in REAPER yourself is never stopped by the app.',
    class: 'overlay',
  },
  {
    file: 'components/booth/RecordInReaperConfirm.tsx',
    text: 'You will be asked this once for this project. You can turn it off from the bar at any time.',
    class: 'overlay',
  },
  { file: 'components/booth/ResumePrompt.tsx', text: 'REAPER and your last reading are in different places. Start where?', class: 'state' },
  {
    file: 'components/booth/ResumePrompt.tsx',
    text: "Your last reading stopped at … (nothing recorded on this chapter's track). Continue there?",
    class: 'state',
  },
  {
    file: 'components/booth/ResumePrompt.tsx',
    text: 'Checking where REAPER and your last reading are… You can press Play now to start from the top.',
    class: 'state',
  },
  {
    file: 'components/booth/ResumePrompt.tsx',
    text: 'Finding where you stopped listens to the end of your recording with the … Whisper model, which is not downloaded yet. Until then reading starts from the top.',
    class: 'state',
  },
  { file: 'components/booth/ResumePrompt.tsx', text: 'This chapter is recorded to the end. Play reads from the top.', class: 'state' },
  {
    file: 'components/booth/UnresolvedCreditsWarning.tsx',
    text: 'will show as written, in brackets. You can still start reading; fill them in under Settings &gt; Credits first so the recording says the right thing.',
    class: 'state',
  },
  {
    file: 'components/booth/frame/LevelsMenu.tsx',
    text: 'Seconds before the word that “Punch from here” starts, for every project. Also in Settings.',
    class: 'overlay',
  },
  {
    file: 'components/booth/frame/LevelsMenu.tsx',
    text: '’s own pre-roll, the lead-in a punch uses. One measure is … s at the edit cursor. On, … plays from the bar line … or more before the word, then records from the word. Off, a punch records from the word with no lead-in. Change it in …, for every project: “Pre-roll: Toggle pre-roll on record” turns it on or off.',
    class: 'overlay',
  },
  {
    file: 'components/booth/page/BoothNextPage.tsx',
    text: 'The Booth reads narration chapters. Import a manuscript with at least one narration chapter first.',
    class: 'empty',
  },
  {
    file: 'components/booth/record/RecordSetup.tsx',
    text: 'A take would not land in the project linked here. Open the linked project in …, or link the one that is open now.',
    class: 'error',
  },
  { file: 'components/booth/record/RecordSetup.tsx', text: 'Link the open project asks you to choose the project file … has open.', class: 'instruction' },
  { file: 'components/booth/record/RecordSetup.tsx', text: 'Could not read whether a project file is linked. Press Check again.', class: 'error' },
  { file: 'components/connection/ChapterLinkDialog.tsx', text: 'is linked to …. Linking it here moves it.', class: 'overlay' },
  { file: 'components/connection/ChapterLinkDialog.tsx', text: 'Or have … add a new track for this chapter, named after it, and link it:', class: 'overlay' },
  {
    file: 'components/credits/CreditsSetupDialog.tsx',
    text: 'Your opening and closing credits need … value…. We filled in what the manuscript already says; check them and save.',
    class: 'overlay',
  },
  { file: 'components/credits/CreditsSetupDialog.tsx', text: 'Not set yet: nothing in the manuscript names the narrator.', class: 'overlay' },
  { file: 'components/credits/CreditsSetupDialog.tsx', text: 'Use for all my projects (saved as your default in Settings &gt; General)', class: 'overlay' },
  { file: 'components/credits/CreditsSetupDialog.tsx', text: 'Only empty values are filled in; nothing you have already set is changed.', class: 'overlay' },
  { file: 'components/delivery/page/OutputPanel.tsx', text: "Can't tell how the build is going, …: … ( … ).", class: 'error' },
  {
    file: 'components/delivery/page/OutputPanel.tsx',
    text: 'Cancel was sent, but the host did not confirm it, so the build may still be running.',
    class: 'error',
  },
  {
    file: 'components/devtools/MockStatesPanel.tsx',
    text: 'This panel forces states and is not part of the app. Each choice sets a mock URL parameter and reloads.',
    class: 'overlay',
  },
  {
    file: 'components/editing/CleanupAction.tsx',
    text: "Matching changes each item's volume in REAPER to bring it onto target, in one undo step.",
    class: 'overlay',
  },
  { file: 'components/editing/EditingCheckPanel.tsx', text: 'A met or not-met status shows only while this chapter is in Editing.', class: 'explanation' },
  { file: 'components/editing/EditingCheckPanel.tsx', text: 'Another chapter is being checked. Check this one when it finishes.', class: 'overlay' },
  {
    file: 'components/editing/EditingCheckPanel.tsx',
    text: 'Stopped after … of … items. The items already checked are kept for the next check.',
    class: 'overlay',
  },
  { file: 'components/editing/EditingPage.tsx', text: 'Import a manuscript with at least one narration chapter first.', class: 'empty' },
  { file: 'components/editing/cleanup/CleanupPreview.tsx', text: 'Hidden on …; nothing is deleted.', class: 'state' },
  {
    file: 'components/editing/effects/ChooseInDaw.tsx',
    text: 'Choose an effect for … in …’s FX window. When you close that window it is added to these words; Keep it adds it now.',
    class: 'instruction',
  },
  { file: 'components/editing/flags/FlagCard.tsx', text: 'reads the line twice. The second read starts at ….', class: 'state' },
  {
    file: 'components/editing/output/OutputControls.tsx',
    text: 'This computer would not list its outputs, so the choice is off. Sound plays on the system default.',
    class: 'error',
  },
  {
    file: 'components/editing/range/replace/ReplaceDialog.tsx',
    text: 'Name the other narrator once for this project (a duet partner, a stand-in, or one of a cast). Their name is shown on the words their audio replaces.',
    class: 'overlay',
  },
  { file: 'components/editing/range/replace/ReplaceDialog.tsx', text: 'Drag across their waveform, or type the times. … ms to … minutes.', class: 'overlay' },
  {
    file: 'components/editing/range/replace/ReplaceDialog.tsx',
    text: "moves your audio for these words to the muted Cuts track and plays theirs in its place, in one undo step. Your recording and their file are not changed. Undo takes it back while it is …'s last action; … works later too.",
    class: 'overlay',
  },
  { file: 'components/editing/range/replace/ReplacementMark.tsx', text: "'s audio plays here in place of yours: “…”.", class: 'overlay' },
  { file: 'components/editing/stack/StackDialog.tsx', text: 'No DAW is asked: the built-in recorder keeps the takes itself.', class: 'overlay' },
  {
    file: 'components/editing/stack/useStackRetries.tsx',
    text: 'Hide … (…) of this passage. They are muted and put out of the way, never deleted, and Undo brings them back.',
    class: 'explanation',
  },
  {
    file: 'components/editing/takes/TakeCompare.tsx',
    text: 'These two were recorded … dB apart, so they are not comparable by loudness or noise.',
    class: 'state',
  },
  { file: 'components/editing/takes/TakeLines.tsx', text: 'This take reads the line twice. The second read starts at ….', class: 'state' },
  {
    file: 'components/editing/takes/prep/HideOthersConfirm.tsx',
    text: 'Keep … and mute the other …. They are muted, not deleted: they stay in the project, and you can look at them again here.',
    class: 'overlay',
  },
  { file: 'components/editing/takes/prep/HideOthersConfirm.tsx', text: 'It is one undo step in …: Undo there brings them back.', class: 'overlay' },
  {
    file: 'components/editing/takes/prep/PrepConfirm.tsx',
    text: 'Bring … on this chapter&apos;s linked track to … dBFS RMS, so the takes can be compared. This changes each item&apos;s volume in ….',
    class: 'overlay',
  },
  {
    file: 'components/editing/takes/prep/PrepConfirm.tsx',
    text: 'It is one undo step in …. Undo it in …; the figures are measured again afterwards.',
    class: 'overlay',
  },
  {
    file: 'components/editing/takes/prep/PrepConfirm.tsx',
    text: ': cut … in this passage (…). The audio moves to the muted Cuts track; nothing is deleted.',
    class: 'overlay',
  },
  { file: 'components/editing/takes/prep/PrepConfirm.tsx', text: 'Undo it in …: …. The figures are measured again afterwards.', class: 'overlay' },
  {
    file: 'components/editing/takes/split/SplitConfirm.tsx',
    text: 'reads the line twice. Cut it at … , where the second read starts, so the line has two takes to choose between. Nothing is deleted.',
    class: 'overlay',
  },
  {
    file: 'components/editing/takes/split/SplitConfirm.tsx',
    text: 'replaces audio when it cuts, so the audio around the cut is backed up first.',
    class: 'overlay',
  },
  {
    file: 'components/editing/voicesample/VoiceSampleDialog.tsx',
    text: 'Copies the raw recording, as it was before editing, into this project. Nothing leaves your computer.',
    class: 'overlay',
  },
  {
    file: 'components/engine/AudacityLinkCard.tsx',
    text: 'Unlinking leaves the link label in the Audacity project; delete it there if you like.',
    class: 'explanation',
  },
  {
    file: 'components/engine/ChapterSyncConsentDialog.tsx',
    text: 'You choose these after syncing, in the audio engine panel or from the chapter&rsquo;s Recorded cell on Production.',
    class: 'overlay',
  },
  {
    file: 'components/engine/ChapterSyncConsentDialog.tsx',
    text: 'You can turn chapter sync on or off later in the audio engine panel (the … chip at the top of the window).',
    class: 'overlay',
  },
  {
    file: 'components/engine/ChapterSyncPanel.tsx',
    text: 'REAPER has changes that aren&rsquo;t saved yet. Sync reads the saved project, so it picks them up when you save.',
    class: 'state',
  },
  {
    file: 'components/engine/ChapterTagsDialog.tsx',
    text: 'Add ID3 chapter markers to a copy of an already-rendered MP3, using the chapter names and lengths from your last chapter render. The file you choose below is never changed; a new, tagged copy is written beside it.',
    class: 'overlay',
  },
  {
    file: 'components/engine/ChapterTagsDialog.tsx',
    text: 'No chapter render is configured yet. Use &ldquo;Prepare chapter render…&rdquo; first.',
    class: 'overlay',
  },
  {
    file: 'components/engine/ChapterTagsDialog.tsx',
    text: 'I understand this writes a new file beside the one above; the original file is not changed.',
    class: 'overlay',
  },
  {
    file: 'components/engine/CleanupToolsDialog.tsx',
    text: 'Open a repair tool in REAPER on the items you have selected there. The app changes nothing itself: you apply or cancel the repair in the tool’s own window.',
    class: 'overlay',
  },
  {
    file: 'components/engine/CreateChapterRegionsDialog.tsx',
    text: 'Plan one REAPER region per chapter with a confirmed track link, plus the opening and closing credits tracks you choose below. Nothing is written until you create them.',
    class: 'overlay',
  },
  {
    file: 'components/engine/CreateChapterRegionsDialog.tsx',
    text: 'Move an existing region that shares a chapter&rsquo;s title, instead of adding a second one',
    class: 'overlay',
  },
  {
    file: 'components/engine/EnginePanel.tsx',
    text: 'No tracks have been read from Audacity yet. They appear here once Audacity answers with this project open.',
    class: 'empty',
  },
  {
    file: 'components/engine/EnginePanel.tsx',
    text: 'REAPER has a different project open than the one linked here. Link the open project, or switch REAPER to the linked file.',
    class: 'error',
  },
  {
    file: 'components/engine/EnginePanel.tsx',
    text: 'This project folder doesn&rsquo;t contain a .rpp file. Save your REAPER project into the folder, then open this panel again.',
    class: 'error',
  },
  {
    file: 'components/engine/EnginePanel.tsx',
    text: 'More than one .rpp file was found in this project folder. Choose which one to read tracks from.',
    class: 'error',
  },
  {
    file: 'components/engine/LinkChaptersDialog.tsx',
    text: "Choose which REAPER track holds each chapter's recording. Every item on a linked track will be stamped with that chapter's identity; nothing is written until you approve.",
    class: 'overlay',
  },
  {
    file: 'components/engine/RenderConfigDialog.tsx',
    text: 'Set the render bounds to every chapter region and name each file after its region. This does not render anything: you press Render in REAPER yourself.',
    class: 'overlay',
  },
  { file: 'components/engine/RenderConfigDialog.tsx', text: 'or File &gt; Render to create them.', class: 'overlay' },
  {
    file: 'components/engine/RetakeLanesDialog.tsx',
    text: 'Choose which lane plays for a line. A lane plays across its whole track, so choosing one silences the other lanes of that track everywhere, not only for this line. … changes nothing else, and Undo in REAPER puts the previous lanes back.',
    class: 'overlay',
  },
  { file: 'components/layout/HistoryPanel.tsx', text: 'History keeps the newest … changes; older changes can no longer be undone.', class: 'explanation' },
  { file: 'components/layout/NeedManuscript.tsx', text: 'This project has no manuscript yet. Import one to begin.', class: 'empty' },
  {
    file: 'components/layout/NotFoundPage.tsx',
    text: 'The app has no page at this address. It may be an old link, or it may have been mistyped.',
    class: 'empty',
  },
  {
    file: 'components/master/DeliveryProfilePanel.tsx',
    text: 'Loudness (LUFS) and true peak are shown in each file&apos;s detail for information',
    class: 'explanation',
  },
  {
    file: 'components/master/DiagnosticsSection.tsx',
    text: 'No silence, breath or click candidates in the checked files, against the thresholds below.',
    class: 'empty',
  },
  {
    file: 'components/master/DiagnosticsSection.tsx',
    text: 'Nothing reached a threshold in the checked files. That is not a pass: it only means no clipping, level shift, room-tone change or long pause reached the thresholds below.',
    class: 'empty',
  },
  {
    file: 'components/master/DiagnosticsSection.tsx',
    text: 'Nothing checked yet. Check the files you measured, or choose rendered chapters or raw recordings (WAV) to check.',
    class: 'empty',
  },
  {
    file: 'components/master/FileRulesPanel.tsx',
    text: 'Book rules (channels the same across files, credits files, retail sample, one section per file, consistency) judge the book as a whole, not this one file: see the Delivery package beside the files.',
    class: 'explanation',
  },
  { file: 'components/master/MasterToSpecPanel.tsx', text: 'Master before encoding…, to the platform&apos;s RMS window and peak limit', class: 'instruction' },
  {
    file: 'components/master/MasteringChain.tsx',
    text: "One chain for the book: …, the same for every platform, with each platform's own RMS window and peak limit.",
    class: 'explanation',
  },
  {
    file: 'components/master/ReportExportPanel.tsx',
    text: 'Writes an HTML page anyone can open and a JSON file with the same findings, of the files measured and checked here, into this project’s … … folder. Every open finding and every file not measured is listed. It is a measurement, not a distributor’s approval, and your audio is never changed.',
    class: 'explanation',
  },
  { file: 'components/master/ReportExportPanel.tsx', text: 'Include each file’s full location (otherwise only file names are written)', class: 'explanation' },
  { file: 'components/masterqc/page/MasterPage.tsx', text: 'The chapters could not be read, so the files keep their file names:', class: 'error' },
  { file: 'components/pickups/PickupsCompanionSummary.tsx', text: 'Jump to one or mark it done on the Pickups page in the full app.', class: 'instruction' },
  {
    file: 'components/pickups/list/PickupsTable.tsx',
    text: 'A pickup can be added once the list has been read. If it could not be read, use Retry.',
    class: 'overlay',
  },
  { file: 'components/pickups/list/PickupsTable.tsx', text: 'Can’t tell if this list is current. … Last read at ….', class: 'error' },
  {
    file: 'components/production/ChapterTrackPanel.tsx',
    text: 'The linked track… is not in the saved project. It may have been deleted or the project saved elsewhere. Link another track, or unlink.',
    class: 'overlay',
  },
  {
    file: 'components/production/ChapterTrackPanel.tsx',
    text: 'Not linked yet. This track looks like the chapter; link it to use it for checks and recorded time.',
    class: 'overlay',
  },
  { file: 'components/production/ChapterTrackPanel.tsx', text: 'tracks look like this chapter. Link the one it is recorded on.', class: 'overlay' },
  {
    file: 'components/production/ChapterTrackPanel.tsx',
    text: 'This track&rsquo;s audio couldn&rsquo;t be played. Check that its source files are still where the project expects them.',
    class: 'overlay',
  },
  { file: 'components/production/ChapterTrackPanel.tsx', text: 'Keep one link; the others will be cleared.', class: 'overlay' },
  {
    file: 'components/production/ChapterTrackPanel.tsx',
    text: 'Imported by mistake? Take it out of the board and totals. Its text stays in the manuscript.',
    class: 'overlay',
  },
  { file: 'components/production/ImportReview.tsx', text: 'Checked names become reviewable Character entries after import.', class: 'explanation' },
  {
    file: 'components/production/RecordingCheckReport.tsx',
    text: 'heard (retakes, asides, a spoken title); extra words never count against the reading.',
    class: 'explanation',
  },
  { file: 'components/production/RecordingCheckReport.tsx', text: 'The paragraphs with missing words. The other … are fully read.', class: 'state' },
  {
    file: 'components/production/RecordingCheckRules.tsx',
    text: 'They were chosen on synthetic test recordings and have not been checked against real ones. The first two only change how a stored check is judged; changing either of the next two changes which words count, so earlier checks read as out of date and those chapters need checking again.',
    class: 'explanation',
  },
  {
    file: 'components/production/RemoveFromRecordingDialog.tsx',
    text: 'It leaves the chapter table, totals, the reader and the teleprompter. Its text stays in the manuscript, and its track link is cleared. You can restore it below the table.',
    class: 'overlay',
  },
  {
    file: 'components/production/pipeline/NoManuscript.tsx',
    text: 'The app reads your manuscript, finds the chapters, and works out how much finished audio, recording and editing that means.',
    class: 'explanation',
  },
  {
    file: 'components/production/report/ReportDialog.tsx',
    text: 'Writes an HTML page anyone can open and a JSON file with the same figures into this project’s reports folder. The contracted amount and effective rate are left out unless you include them.',
    class: 'overlay',
  },
  {
    file: 'components/proof/AuditionDialog.tsx',
    text: 'This read&rsquo;s audio couldn&rsquo;t be played. Check that its source file is still where the project expects it.',
    class: 'overlay',
  },
  {
    file: 'components/proof/AuditionDialog.tsx',
    text: 'Each read plays straight from its own source file, with about …s before and …s after the matched span. REAPER&rsquo;s processing chain (FX, gain, edits) is not applied, so this can sound different from the project.',
    class: 'overlay',
  },
  {
    file: 'components/proof/PreviewPanel.tsx',
    text: 'No eligible text was found for a preview. Narration chapters with at least one paragraph are needed.',
    class: 'empty',
  },
  {
    file: 'components/proof/ProofChapterPage.tsx',
    text: 'This chapter was last checked before the app could read its word alignment. Run Check again to edit it word by word on the Editing page.',
    class: 'state',
  },
  {
    file: 'components/proof/ProofChapterPage.tsx',
    text: 'This chapter isn&rsquo;t linked to a REAPER track yet. Link one from the Chapter links table in the audio engine panel, then open this chapter again.',
    class: 'empty',
  },
  {
    file: 'components/proof/inspector/EvidenceChangedBanner.tsx',
    text: 'The check heard the same words again; their timing or confidence changed.',
    class: 'state',
  },
  {
    file: 'components/proof/inspector/Inspector.tsx',
    text: 'Said twice. The second take is on Editing, where you can keep both, compare them or delete one.',
    class: 'state',
  },
  {
    file: 'components/proof/proofOptions/ProofOptions.tsx',
    text: 'Saved at once for this project. Settings sets the same values for every project.',
    class: 'overlay',
  },
  {
    file: 'components/recordingcheck/background/BackgroundChecksNotice.tsx',
    text: '… changed since … last check. The app can listen back to what you recorded while you work and mark skipped or misread words, so they are ready on Editing and Pickups.',
    class: 'overlay',
  },
  {
    file: 'components/recordingcheck/background/BackgroundChecksNotice.tsx',
    text: 'Only audio no check has listened to is checked. Earlier takes are not checked again unless you change the model or the audio.',
    class: 'overlay',
  },
  {
    file: 'components/recordingcheck/background/BackgroundChecksNotice.tsx',
    text: 'It runs on part of this computer&rsquo;s processors, below everything else, and never while REAPER is recording.',
    class: 'overlay',
  },
  {
    file: 'components/recordingcheck/background/BackgroundChecksNotice.tsx',
    text: 'A bar at the bottom left shows its progress on every page, with Pause and Cancel.',
    class: 'overlay',
  },
  {
    file: 'components/recordingcheck/background/BackgroundChecksNotice.tsx',
    text: 'Change the models, the processors it may use or turn it off in Settings &rsaquo; Speech to text &rsaquo; Background checks.',
    class: 'overlay',
  },
  {
    file: 'components/recordingcheck/RunOptions.tsx',
    text: 'Only the passages that are missing or that Whisper was unsure of are transcribed a second time.',
    class: 'explanation',
  },
  {
    file: 'components/recordingcheck/RunOptions.tsx',
    text: 'Chapters share the processors, so more chapters at once means fewer workers for each.',
    class: 'explanation',
  },
  { file: 'components/schedule/MilestoneTable.tsx', text: 'No other milestones yet. Add one with +.', class: 'empty' },
  { file: 'components/schedule/SchedulePage.tsx', text: "Couldn't read the schedule again: …. This is what was read ….", class: 'error' },
  {
    file: 'components/schedule/WorkedOut.tsx',
    text: 'Finished audio is words ÷ …. Recording takes …×, editing …× and proofing …× the finished hours. Your pace is an estimate, not measured from your sessions: it assumes … h of work a day.',
    class: 'explanation',
  },
  { file: 'components/script/page/rail/threads/ThreadsPanel.tsx', text: 'No notes in this chapter yet. Select text and choose Mark.', class: 'empty' },
  { file: 'components/script/page/rail/words/DefinitionBlock.tsx', text: 'cannot be reached. The web links below still work.', class: 'error' },
  {
    file: 'components/settings/AboutPanel.tsx',
    text: 'This is a development build, not a release, so it has no version to compare with a newer one.',
    class: 'state',
  },
  { file: 'components/settings/BackupsSection.tsx', text: 'The backups settings could not be read: ….', class: 'error' },
  { file: 'components/settings/BackupsSection.tsx', text: 'The change was not saved: ….', class: 'error' },
  { file: 'components/settings/CapabilitySection.tsx', text: "The DAW's capabilities could not be read: ….", class: 'error' },
  { file: 'components/settings/CreditsPanel.tsx', text: 'Credits could not be loaded: ….', class: 'error' },
  {
    file: 'components/settings/CreditsPanel.tsx',
    text: 'The global narrator default is …; a narrator override here applies only to this project.',
    class: 'state',
  },
  { file: 'components/settings/CreditsPanel.tsx', text: 'Detected from …: “…”….', class: 'state' },
  {
    file: 'components/settings/DeliveryProfileEditor.tsx',
    text: '…Saving makes revision …; projects using it are judged again without measuring.',
    class: 'overlay',
  },
  {
    file: 'components/settings/DeliveryProfileEditor.tsx',
    text: 'The listen-only and book rules (one section per file, credits files, retail sample, consistency, channels the same in every file) are kept as in …. A copy cannot add a kind of rule the app does not check.',
    class: 'overlay',
  },
  { file: 'components/settings/DeliveryProfilesPanel.tsx', text: 'No custom profiles. Duplicate a built-in profile to make one.', class: 'empty' },
  { file: 'components/settings/KeyboardPanel.tsx', text: 'Press another key or pedal to try again. Esc cancels.', class: 'error' },
  {
    file: 'components/settings/KeyboardPanel.tsx',
    text: 'Replace takes it from "…", which is then left with no key; you can give it another one afterwards.',
    class: 'explanation',
  },
  { file: 'components/settings/RecordingCheckSummary.tsx', text: 'Misreads, extra words and a spoken title never count against it.', class: 'explanation' },
  {
    file: 'components/settings/RecordingCheckSummary.tsx',
    text: 'These values were chosen on synthetic test recordings and have not been checked against real recordings yet. Changing the first two only changes how a stored check is judged; changing either of the last two makes earlier checks out of date, so check those chapters again.',
    class: 'explanation',
  },
  {
    file: 'components/settings/UpdatesPanel.tsx',
    text: 'Update checks are for releases. A development build is never offered an update.',
    class: 'state',
  },
  {
    file: 'components/settings/UpdatesPanel.tsx',
    text: 'The app has no release for this kind of computer, so there is nothing to update to.',
    class: 'state',
  },
  {
    file: 'components/settings/UpdatesPanel.tsx',
    text: 'This platform does not update itself. Open the release notes to download it from the release page.',
    class: 'state',
  },
  {
    file: 'components/settings/controls/AboutSection.tsx',
    text: 'The app is free software, licensed under the GNU Affero General Public License, version 3 or later.',
    class: 'state',
  },
  { file: 'components/settings/controls/CapabilitiesBody.tsx', text: 'The recording tool’s capabilities could not be read: ….', class: 'error' },
  { file: 'components/settings/controls/DeliveryBodies.tsx', text: 'None checked. Master &amp; QC measures but does not judge.', class: 'state' },
  {
    file: 'components/settings/controls/EngineBody.tsx',
    text: 'The app keeps its bridge in REAPER’s Scripts folder and REAPER starts it each time it opens, so there is nothing to set up in REAPER.',
    class: 'explanation',
  },
  {
    file: 'components/settings/controls/EngineBody.tsx',
    text: 'This window was opened from …, so it records with … until the app is opened another way. The choice saved for this project is ….',
    class: 'state',
  },
  {
    file: 'components/settings/controls/EngineBody.tsx',
    text: 'New takes would be recorded by this app and kept in the project’s own folder, not in … ….',
    class: 'overlay',
  },
  {
    file: 'components/settings/controls/EngineBody.tsx',
    text: 'Takes already recorded in … stay in …, but the Booth, Editing and Proof stop reading them, and nothing from … reaches the app while the built-in recorder is chosen. The link to … is kept: choosing … again brings those takes back.',
    class: 'overlay',
  },
  {
    file: 'components/settings/controls/MicBody.tsx',
    text: 'Type the device name the Booth should use, or leave it empty for the system input.',
    class: 'error',
  },
  {
    file: 'components/settings/controls/MwKeyBody.tsx',
    text: 'When no dictionary on this computer knows a name, Look up online asks Merriam-Webster. Only the one word you look up is sent, never your text, file names or project. Answers are kept on this computer, so a word is never sent twice.',
    class: 'explanation',
  },
  {
    file: 'components/settings/controls/SampleOutputBody.tsx',
    text: 'is not connected. Voice samples play on the system default until it is back.',
    class: 'error',
  },
  {
    file: 'components/settings/controls/SampleOutputBody.tsx',
    text: 'Last checked …. The list is read again when you open Settings, when the window gets focus, and while this notice is up.',
    class: 'state',
  },
  {
    file: 'components/settings/page/ModelsPane.tsx',
    text: 'The app needs a transcription model to check recordings and a voice to preview names. The recommended pair is about 600 MB.',
    class: 'explanation',
  },
  {
    file: 'components/settings/page/ProjectDataPanel.tsx',
    text: 'Clearing removes the imported manuscript and stored source, Story Bible, proofing artifacts, reader notes/bookmarks, and saved comparison results. Settings remain.',
    class: 'explanation',
  },
  { file: 'components/settings/page/ScopedFieldsPanel.tsx', text: 'Settings could not be loaded: ….', class: 'error' },
  {
    file: 'components/settings/page/SettingsPage.tsx',
    text: 'The last change was not kept and the previous value is still in use. The setting says why.',
    class: 'error',
  },
  { file: 'components/settings/page/SettingsPage.tsx', text: '. Nothing can be changed until the file can be read.', class: 'state' },
  {
    file: 'components/stages/StageEvidence.tsx',
    text: 'You confirmed the move from … to … on …. A check since then is not met (below). Nothing has changed: the chapter stays in … unless you revert it.',
    class: 'state',
  },
  { file: 'components/stages/StageEvidence.tsx', text: 'Reads the evidence again; it starts no check.', class: 'explanation' },
  { file: 'components/stages/StageEvidence.tsx', text: 'Based on the saved REAPER project, file modified … …. Read ….', class: 'state' },
  { file: 'components/storybible/AppearsIn.tsx', text: 'Not listed yet. Build the Story Bible again to list the chapters.', class: 'empty' },
  {
    file: 'components/storybible/Guide.tsx',
    text: 'This link points to an entry that is not in the Story Bible. It may have been deleted or merged since the link was made.',
    class: 'state',
  },
  { file: 'components/storybible/GuideDetail.tsx', text: 'Not written yet: … .', class: 'empty' },
  { file: 'components/storybible/GuideDetail.tsx', text: 'No matching entities. Build the guide to discover names and terms.', class: 'empty' },
  {
    file: 'components/storybible/VoiceDataPanel.tsx',
    text: "Narration's voice samples and approved references are here - a character's own live on its entry. Remove voice data clears every approved reference in the project; Remove voice samples deletes every sample and its audio. Nothing else about the Story Bible changes.",
    class: 'explanation',
  },
  {
    file: 'components/storybible/suggested/import/ImportDialog.tsx',
    text: 'A CSV or JSON file, or a JSON blob from any LLM you ran the manuscript through.',
    class: 'overlay',
  },
  {
    file: 'components/storybible/suggested/scan/AnalysisPrompt.tsx',
    text: 'A scan finds more with the optional analysis tools. Nothing downloads until you agree.',
    class: 'explanation',
  },
  {
    file: 'components/recordingcheck/CheckResult.tsx',
    text: 'Not checked yet. A check transcribes this chapter&rsquo;s audio from the saved project and compares it with the text, so you can see what is still to record. It changes nothing in the project.',
    class: 'empty',
  },
  {
    file: 'components/storybible/DeleteStoryBibleData.tsx',
    text: 'Delete the Story Bible of \u2026: \u2026, with every name, pronunciation, note, relationship, review flag and speaker colour, the types and the dialogue speakers?',
    class: 'overlay',
  },
  {
    file: 'components/storybible/DeleteStoryBibleData.tsx',
    text: 'This cannot be undone. The script, takes, recordings, settings, voice samples and voice references stay. Add entry or Scan the manuscript starts the Story Bible again.',
    class: 'overlay',
  },
];
