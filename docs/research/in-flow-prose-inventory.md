# In-flow prose inventory

Every run of prose the app draws (JSX text over 60 characters or two sentences, and text-bearing props), taken from the source on 2026-10-26 for [#2251](https://github.com/countrymanprime/narration-studio/issues/2251) after the owner found a two-line gesture manual under the Editing waveform. The rule it measures against is [No in-flow instructions](../design/design-system.md#no-in-flow-instructions). The list it is generated from, `src/studio/ui/tests/visual/prose/prose-inventory.ts`, is held to the code by `src/studio/ui/tests/visual/inFlowProse.test.ts`, so the counts there are current and this page is a snapshot.

**What it covers.** All 511 non-test `.tsx` files under `src/studio/ui/src`, read with the TypeScript parser (`tests/visual/prose/extract.ts`). It does not see text built in a variable or a `.ts` module and passed to JSX as `{note}`, and it does not measure rendered lines; a row's class says whether it sits in the page's flow (`instruction`, `explanation`, `state`, `error`, `empty`) or over it (`overlay`).

**Classes.** `instruction`: how to use a control or a gesture. `explanation`: background, reasons or technical detail. Both are debt when drawn in a page. `state`: the state of the thing in front of the narrator (data). `error`: a failure or a reading the app cannot trust, with what to do. `empty`: what an empty list is waiting for. `overlay`: inside a dialog, slide-over, menu, popover or tooltip.

## Fixed in this change

- Editing, the waveform's notes line: "Each bar is 20 ms of audio at this zoom: the host keeps 50 peaks a second." (deleted) and "Drag to choose a range; right-drag, the wheel or two fingers scroll; right-click for more." (moved to a "?" beside the zoom buttons). Fixed in the pull request before this one.
- Six hints over one line: the Subtitles info tip (Production import), Replace manuscript (Production), the book-progress bar's title (Production), and Whisper model, Parallel workers and Vocabulary hints (Proof's compare run). Each is now one line of at most 80 characters.
- Four Settings category blurbs over one line (Speech to text, Voice and dictionary, Models, Project).

## Per page

| Page | instruction | explanation | state | error | empty | overlay | Total |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Audio engine panel | 0 | 1 | 1 | 3 | 1 | 12 | 18 |
| Booth | 2 | 1 | 8 | 2 | 1 | 5 | 19 |
| Chapter links | 0 | 0 | 0 | 0 | 0 | 2 | 2 |
| Credits | 0 | 0 | 0 | 0 | 0 | 4 | 4 |
| Delivery | 0 | 0 | 0 | 2 | 0 | 0 | 2 |
| Dev tools | 0 | 0 | 0 | 0 | 0 | 1 | 1 |
| Editing | 1 | 3 | 4 | 1 | 1 | 17 | 27 |
| Master & QC | 2 | 10 | 0 | 1 | 3 | 0 | 16 |
| Pickups | 1 | 0 | 0 | 1 | 0 | 1 | 3 |
| Production | 0 | 4 | 1 | 0 | 0 | 8 | 13 |
| Proof | 0 | 0 | 3 | 0 | 2 | 3 | 8 |
| Recording check | 0 | 2 | 0 | 0 | 1 | 5 | 8 |
| Schedule | 0 | 1 | 0 | 1 | 1 | 0 | 3 |
| Script | 0 | 0 | 0 | 1 | 1 | 0 | 2 |
| Settings | 3 | 7 | 11 | 9 | 1 | 4 | 35 |
| Shell | 0 | 1 | 0 | 0 | 2 | 0 | 3 |
| Stage evidence | 0 | 1 | 2 | 0 | 0 | 0 | 3 |
| Story Bible | 0 | 2 | 1 | 0 | 3 | 3 | 9 |
| **All** | **9** | **33** | **31** | **21** | **17** | **65** | **176** |

## In-flow instructions and explanations (the debt)

These are capped: the number may only go down. Each one moves to a tooltip, a "?" overlay or the page's guide, or is deleted.

| Page | Component | Class | Text |
| --- | --- | --- | --- |
| Audio engine panel | `engine/AudacityLinkCard.tsx` | explanation | Unlinking leaves the link label in the Audacity project; delete it there if you like. |
| Booth | `booth/ReaderKey.tsx` | instruction | Click a highlighted name, note or flag to open it here. The reading position stays where it is. |
| Booth | `booth/ReaderKey.tsx` | explanation | Flags are suspected: live listening can mishear a correct read. Transcript Compare over the recording is authoritative. |
| Booth | `booth/record/RecordSetup.tsx` | instruction | Link the open project asks you to choose the project file … has open. |
| Editing | `editing/EditingCheckPanel.tsx` | explanation | A met or not-met status shows only while this chapter is in Editing. |
| Editing | `editing/effects/AddEffect.tsx` | explanation | Favourites are saved for every project. To keep them for one project only, use Favourite effects in Settings, under Set on a page. |
| Editing | `editing/effects/ChooseInDaw.tsx` | instruction | Choose an effect for … in …’s FX window. When you close that window it is added to these words; Keep it adds it now. |
| Editing | `editing/stack/useStackRetries.tsx` | explanation | Hide … (…) of this passage. They are muted and put out of the way, never deleted, and Undo brings them back. |
| Master & QC | `master/DeliveryProfilePanel.tsx` | explanation | Loudness (LUFS) and true peak are shown in each file's detail for information |
| Master & QC | `master/DiagnosticsSection.tsx` | explanation | Silences, breaths and clicks the same check found while reading each file, each a candidate to cut, never applied here: cutting a candidate needs the … actions this app does not yet run from here. Nothing is saved, played or changed. |
| Master & QC | `master/DiagnosticsSection.tsx` | instruction | Set in Settings > Silence cleanup (Open Settings, above), or for this project only from Jump to or run > Open Silence cleanup options. |
| Master & QC | `master/DiagnosticsSection.tsx` | explanation | These are starting values, fixed in this version and not a delivery specification. Each finding shows the threshold that raised it. |
| Master & QC | `master/DiagnosticsSection.tsx` | explanation | Clipping, level shifts, room-tone changes and long pauses, each with its time in the file and the threshold that raised it. Listen at those times in …: nothing here is saved, played or changed. |
| Master & QC | `master/DiagnosticsSection.tsx` | explanation | Room tone and level mean different things in each: a render may have been gated or cleaned on purpose. |
| Master & QC | `master/DiagnosticsSection.tsx` | explanation | Every finding is a candidate to listen to, not a verdict, and stays unreviewed: deciding on them comes with the review list. |
| Master & QC | `master/FileRulesPanel.tsx` | explanation | Book rules (channels the same across files, credits files, retail sample, one section per file, consistency) judge the book as a whole, not this one file: see the Delivery package beside the files. |
| Master & QC | `master/MasterToSpecPanel.tsx` | instruction | Master before encoding…, to the platform's RMS window and peak limit |
| Master & QC | `master/MasteringChain.tsx` | explanation | One chain for the book: …, the same for every platform, with each platform's own RMS window and peak limit. |
| Master & QC | `master/ReportExportPanel.tsx` | explanation | Writes an HTML page anyone can open and a JSON file with the same findings, of the files measured and checked here, into this project’s … … folder. Every open finding and every file not measured is listed. It is a measurement, not a distributor’s approval, and your audio is never changed. |
| Master & QC | `master/ReportExportPanel.tsx` | explanation | Include each file’s full location (otherwise only file names are written) |
| Pickups | `pickups/PickupsCompanionSummary.tsx` | instruction | Jump to one or mark it done on the Pickups page in the full app. |
| Production | `production/ImportReview.tsx` | explanation | Checked names become reviewable Character entries after import. |
| Production | `production/RecordingCheckReport.tsx` | explanation | heard (retakes, asides, a spoken title); extra words never count against the reading. |
| Production | `production/RecordingCheckRules.tsx` | explanation | They were chosen on synthetic test recordings and have not been checked against real ones. The first two only change how a stored check is judged; changing either of the next two changes which words count, so earlier checks read as out of date and those chapters need checking again. |
| Production | `production/pipeline/NoManuscript.tsx` | explanation | The app reads your manuscript, finds the chapters, and works out how much finished audio, recording and editing that means. |
| Recording check | `recordingcheck/RunOptions.tsx` | explanation | Only the passages that are missing or that Whisper was unsure of are transcribed a second time. |
| Recording check | `recordingcheck/RunOptions.tsx` | explanation | Chapters share the processors, so more chapters at once means fewer workers for each. |
| Schedule | `schedule/WorkedOut.tsx` | explanation | Finished audio is words ÷ …. Recording takes …×, editing …× and proofing …× the finished hours. Your pace is an estimate, not measured from your sessions: it assumes … h of work a day. |
| Settings | `settings/KeyboardPanel.tsx` | explanation | Replace takes it from "…", which is then left with no key; you can give it another one afterwards. |
| Settings | `settings/KeyboardPanel.tsx` | instruction | Choose Change, then press the key or pedal to use. A USB footswitch that types a key works like a keyboard. These apply to every project. |
| Settings | `settings/RecordingCheckSummary.tsx` | explanation | Misreads, extra words and a spoken title never count against it. |
| Settings | `settings/RecordingCheckSummary.tsx` | explanation | These values were chosen on synthetic test recordings and have not been checked against real recordings yet. Changing the first two only changes how a stored check is judged; changing either of the last two makes earlier checks out of date, so check those chapters again. |
| Settings | `settings/RetailSamplePanel.tsx` | instruction | Pick up to 5 minutes from anywhere in the book. The sample is marked in the Manuscript view; it adds no time to the estimate. |
| Settings | `settings/controls/EngineBody.tsx` | explanation | The app keeps its bridge in REAPER’s Scripts folder and REAPER starts it each time it opens, so there is nothing to set up in REAPER. |
| Settings | `settings/controls/MicBody.tsx` | instruction | Type the device name the Booth should use, or leave it empty for the system input. |
| Settings | `settings/controls/MwKeyBody.tsx` | explanation | When no dictionary on this computer knows a name, Look up online asks Merriam-Webster. Only the one word you look up is sent, never your text, file names or project. Answers are kept on this computer, so a word is never sent twice. |
| Settings | `settings/page/ModelsPane.tsx` | explanation | The app needs a transcription model to check recordings and a voice to preview names. The recommended pair is about 600 MB. |
| Settings | `settings/page/ProjectDataPanel.tsx` | explanation | Clearing removes the imported manuscript and stored source, Story Bible, proofing artifacts, reader notes/bookmarks, and saved comparison results. Settings remain. |
| Shell | `layout/HistoryPanel.tsx` | explanation | History keeps the newest … changes; older changes can no longer be undone. |
| Stage evidence | `stages/StageEvidence.tsx` | explanation | Reads the evidence again; it starts no check. |
| Story Bible | `storybible/VoiceDataPanel.tsx` | explanation | Narration's voice samples and approved references are here - a character's own live on its entry. Remove voice data clears every approved reference in the project; Remove voice samples deletes every sample and its audio. Nothing else about the Story Bible changes. |
| Story Bible | `storybible/suggested/scan/AnalysisPrompt.tsx` | explanation | A scan finds more with the optional analysis tools. Nothing downloads until you agree. |

## Settings row descriptions

All 46 Settings descriptions that ran past one line are now one line of at most 60 characters. What each said in full moved, word for word, to the row's **?** (`more` in `src/studio/ui/src/components/settings/registry/rows.ts`), so nothing was lost, and Search settings still matches it. `MAX_LONG_SETTING_DESCRIPTIONS` is 0.
