# In-flow prose inventory

Every run of prose the app draws (JSX text over 60 characters or two sentences, and text-bearing props), taken from the source on 2026-10-26 for [#2251](https://github.com/countrymanprime/narration-studio/issues/2251) after the owner found a two-line gesture manual under the Editing waveform. The rule it measures against is [No in-flow instructions](../design/design-system.md#no-in-flow-instructions). The list it is generated from, `src/studio/ui/tests/visual/prose/prose-inventory.ts`, is held to the code by `src/studio/ui/tests/visual/inFlowProse.test.ts`, so the counts there are current and this page is a snapshot.

**What it covers.** All 511 non-test `.tsx` files under `src/studio/ui/src`, read with the TypeScript parser (`tests/visual/prose/extract.ts`). It does not see text built in a variable or a `.ts` module and passed to JSX as `{note}`, and it does not measure rendered lines; a row's class says whether it sits in the page's flow (`instruction`, `explanation`, `state`, `error`, `empty`) or over it (`overlay`).

**Classes.** `instruction`: how to use a control or a gesture. `explanation`: background, reasons or technical detail. Both are debt when drawn in a page. `state`: the state of the thing in front of the narrator (data). `error`: a failure or a reading the app cannot trust, with what to do. `empty`: what an empty list is waiting for. `overlay`: inside a dialog, slide-over, menu, popover or tooltip.

## Fixed in this change

- Editing, the waveform's notes line: "Each bar is 20 ms of audio at this zoom: the host keeps 50 peaks a second." (deleted) and "Drag to choose a range; right-drag, the wheel or two fingers scroll; right-click for more." (moved to a "?" beside the zoom buttons). Fixed in the pull request before this one.
- Six hints over one line: the Subtitles info tip (Production import), Replace manuscript (Production), the book-progress bar's title (Production), and Whisper model, Parallel workers and Vocabulary hints (Proof's compare run). Each is now one line of at most 80 characters.
- Four Settings category blurbs over one line (Speech to text, Voice and dictionary, Models, Project).
- Master & QC, Diagnostics: six paragraphs (what each card lists, where the thresholds are set, that the values are starting values, that room tone means different things per source, that a finding is not a verdict) deleted; each card has a one-line "?" instead, and the guide keeps the detail.
- Recording check options: four lines on how chapters share the processors, how chunks overlap and what the larger model re-checks, plus two shorter ones of the same kind, deleted; the Settings rows and the guide hold them.
- Booth, the reader's key: "Click a word to start or go back to it.", which appeared once a session ran and moved the strip, and two lines for marks the key never shows, deleted.
- Editing's Effects tab, Settings Shortcuts and Retail sample: the how-to sentences cut to the one fact each needs (which projects it applies to, the 5-minute limit).

## Per page

| Page | instruction | explanation | state | error | empty | overlay | Total |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Audio engine panel | 0 | 1 | 1 | 3 | 1 | 12 | 18 |
| Booth | 1 | 0 | 8 | 2 | 1 | 5 | 17 |
| Chapter links | 0 | 0 | 0 | 0 | 0 | 2 | 2 |
| Credits | 0 | 0 | 0 | 0 | 0 | 4 | 4 |
| Delivery | 0 | 0 | 0 | 2 | 0 | 0 | 2 |
| Dev tools | 0 | 0 | 0 | 0 | 0 | 1 | 1 |
| Editing | 1 | 2 | 4 | 1 | 1 | 18 | 27 |
| Master & QC | 1 | 5 | 1 | 1 | 3 | 0 | 11 |
| Pickups | 1 | 0 | 0 | 1 | 0 | 1 | 3 |
| Production | 0 | 4 | 1 | 0 | 1 | 10 | 16 |
| Proof | 0 | 0 | 3 | 0 | 2 | 3 | 8 |
| Recording check | 0 | 0 | 0 | 0 | 0 | 5 | 5 |
| Schedule | 0 | 1 | 0 | 1 | 1 | 0 | 3 |
| Script | 0 | 0 | 0 | 3 | 1 | 0 | 4 |
| Settings | 0 | 7 | 11 | 10 | 1 | 4 | 33 |
| Shell | 0 | 1 | 0 | 0 | 2 | 0 | 3 |
| Stage evidence | 0 | 1 | 2 | 0 | 0 | 0 | 3 |
| Story Bible | 0 | 2 | 1 | 0 | 3 | 1 | 7 |
| **All** | **4** | **24** | **32** | **24** | **17** | **66** | **167** |

## In-flow instructions and explanations (the debt)

These are capped: the number may only go down. Each one moves to a tooltip, a "?" overlay or the page's guide, or is deleted.

| Page | Component | Class | Text |
| --- | --- | --- | --- |
| Audio engine panel | `engine/AudacityLinkCard.tsx` | explanation | Unlinking leaves the link label in the Audacity project; delete it there if you like. |
| Booth | `booth/record/RecordSetup.tsx` | instruction | Link the open project asks you to choose the project file … has open. |
| Editing | `editing/EditingCheckPanel.tsx` | explanation | A met or not-met status shows only while this chapter is in Editing. |
| Editing | `editing/effects/ChooseInDaw.tsx` | instruction | Choose an effect for … in …’s FX window. When you close that window it is added to these words; Keep it adds it now. |
| Editing | `editing/stack/useStackRetries.tsx` | explanation | Hide … (…) of this passage. They are muted and put out of the way, never deleted, and Undo brings them back. |
| Master & QC | `master/DeliveryProfilePanel.tsx` | explanation | Loudness (LUFS) and true peak are shown in each file's detail for information |
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
| Schedule | `schedule/WorkedOut.tsx` | explanation | Finished audio is words ÷ …. Recording takes …×, editing …× and proofing …× the finished hours. Your pace is an estimate, not measured from your sessions: it assumes … h of work a day. |
| Settings | `settings/KeyboardPanel.tsx` | explanation | Replace takes it from "…", which is then left with no key; you can give it another one afterwards. |
| Settings | `settings/RecordingCheckSummary.tsx` | explanation | Misreads, extra words and a spoken title never count against it. |
| Settings | `settings/RecordingCheckSummary.tsx` | explanation | These values were chosen on synthetic test recordings and have not been checked against real recordings yet. Changing the first two only changes how a stored check is judged; changing either of the last two makes earlier checks out of date, so check those chapters again. |
| Settings | `settings/controls/EngineBody.tsx` | explanation | The app keeps its bridge in REAPER’s Scripts folder and REAPER starts it each time it opens, so there is nothing to set up in REAPER. |
| Settings | `settings/controls/MwKeyBody.tsx` | explanation | When no dictionary on this computer knows a name, Look up online asks Merriam-Webster. Only the one word you look up is sent, never your text, file names or project. Answers are kept on this computer, so a word is never sent twice. |
| Settings | `settings/page/ModelsPane.tsx` | explanation | The app needs a transcription model to check recordings and a voice to preview names. The recommended pair is about 600 MB. |
| Settings | `settings/page/ProjectDataPanel.tsx` | explanation | Clearing removes the imported manuscript and stored source, Story Bible, proofing artifacts, reader notes/bookmarks, and saved comparison results. Settings remain. |
| Shell | `layout/HistoryPanel.tsx` | explanation | History keeps the newest … changes; older changes can no longer be undone. |
| Stage evidence | `stages/StageEvidence.tsx` | explanation | Reads the evidence again; it starts no check. |
| Story Bible | `storybible/VoiceDataPanel.tsx` | explanation | Narration's voice samples and approved references are here - a character's own live on its entry. Remove voice data clears every approved reference in the project; Remove voice samples deletes every sample and its audio. Nothing else about the Story Bible changes. |
| Story Bible | `storybible/suggested/scan/AnalysisPrompt.tsx` | explanation | A scan finds more with the optional analysis tools. Nothing downloads until you agree. |

## Settings row descriptions

A Settings row draws its description under its label on every row, wrapping at 60 characters' width (two to four lines at the 390 px reflow width). The rule is one short line of at most 60 characters, with details behind the row's hint icon or in the guide. These rows are over it; their number is capped by `MAX_LONG_SETTING_DESCRIPTIONS` and may only go down. Shortening them is follow-up work on #2251.

| Row | Characters | Description |
| --- | ---: | --- |
| `stt.background` | 228 | Checks what you record while you work, so Editing and Pickups are ready. Only audio no check has listened to is checked, below everything else, and never while REAPER records. Its progress shows at the bottom left of every page. |
| `daw.startTone` | 212 | A short beep before a take starts, for recording by foot pedal without looking at the screen. It ends before the take begins, so it is not on the recording; the take starts a fraction of a second after the press. |
| `daw.sampleOutput` | 193 | Where this project’s voice samples play. With the built-in recorder it is one of this computer’s outputs; with a DAW, samples play on the default output and the DAW’s own device is not changed. |
| `daw.autoLauncher` | 176 | Puts the app’s bridge in REAPER’s Scripts folder and has REAPER start it each time it opens, so REAPER connects with no step in REAPER. Off: the app writes nothing into REAPER. |
| `project.wordsPerPage` | 163 | The Booth marks a page break at the end of the paragraph in which a page reaches this many words, counted from the start of each chapter. 250 is a manuscript page. |
| `project.data` | 162 | Removes the imported manuscript and its stored source, the Story Bible and proofing data, reader notes and saved comparison results. Settings and recordings stay. |
| `stt.pipeline` | 142 | The re-check model starts on each item as soon as the first-pass model has finished it. Off, it waits until every item has had its first pass. |
| `stt.workers` | 140 | 0 lets the app choose: several items at once, each given its share of this computer’s processors, never more than the model’s memory allows. |
| `project.credits` | 135 | Templates for the opening and closing credits and the retail sample. Templates are shared; the filled-in values belong to this project. |
| `app.updates` | 117 | Once a day, the app asks the release server whether a newer version exists. It sends nothing about you or your books. |
| `voice.mwKey` | 116 | Your own key for online lookups. It is stored apart from the other settings and never shown again after you save it. |
| `stt.model` | 115 | The model that turns recordings into text for comparing against the manuscript. Bigger is slower and more accurate. |
| `project.build` | 115 | Starts the Story Bible build when a manuscript is imported. The import dialog can still turn it off for one import. |
| `delivery.profile` | 114 | The standard this project’s chapters are judged against. Master & QC and Delivery measure and word things from it. |
| `stt.live` | 113 | Follows your voice in the Booth while you record. Whisper runs everywhere; Moonshine is quicker and Windows only. |
| `look.readerWidth` | 113 | How wide the manuscript’s column is in the Script reader. The quote under it is drawn in all four reader choices. |
| `daw.capabilities` | 107 | Each thing the app can ask the recording tool to do, with the reason when it cannot. Auto follows the tool. |
| `stt.chunk` | 106 | Long recordings are cut into pieces of this length and checked at the same time. 0 checks each file whole. |
| `stt.backgroundProcessors` | 106 | 0 lets the app choose: half of this computer’s processors, a quarter while the Booth follows your reading. |
| `project.manuscript` | 106 | The text this project is recorded from. Replacing it keeps recordings and re-matches them to the new text. |
| `look.motion` | 105 | Reduce stops slides, fades and highlights in this app; Follow Windows uses its Animation effects setting. |
| `app.importClose` | 104 | Closes the import window as soon as the manuscript is written. Turn it off to read the import log first. |
| `daw.syncActivity` | 103 | What each chapter sync did, newest first. Undo removes a link sync made, and sync never makes it again. |
| `stt.backgroundModel` | 101 | Listens to everything a background check covers. Your own Check recording keeps the models set above. |
| `delivery.custom` | 98 | Copies of a built-in profile with your own limits. Editing one changes every project that uses it. |
| `app.debug` | 98 | Writes the reasons behind the app’s decisions to the run log. Turn it on when asked to send a log. |
| `voice.id` | 92 | The voice that says a name or word when you ask for a preview. It does not narrate anything. |
| `app.notify` | 90 | Shows a Windows notification when a check or export ends while you are in another program. |
| `daw.experimental` | 89 | Allows DAW commands the app has not verified yet. Off keeps the app to the verified ones. |
| `look.zoom` | 86 | Scales the whole window. Ctrl + plus, Ctrl + minus and Ctrl 0 change it from anywhere. |
| `daw.engine` | 85 | Where this project’s recordings live. Changing it later does not move existing takes. |
| `look.readerSize` | 85 | How large the manuscript is drawn in the Script reader. The Booth keeps its own size. |
| `stt.cascade` | 84 | A fast first pass, then a second model re-checks only what the first could not find. |
| `project.types` | 84 | The kinds of entry in this project’s Story Bible, and which can speak a quoted line. |
| `project.marks` | 83 | The vocabulary for marking the manuscript. Edited in the Script page’s mark editor. |
| `look.reader` | 75 | The typeface of the manuscript in the Script reader. The Booth uses it too. |
| `stt.backgroundRecheck` | 74 | Listens again to the passages the first model was unsure of, alongside it. |
| `daw.mic` | 70 | The input the Booth listens to and the built-in recorder records with. |
| `stt.cascadeRecheck` | 70 | Used only for passages the first pass could not find or was unsure of. |
| `delivery.default` | 68 | A new project starts with this profile; the first import still asks. |
| `keys.map` | 68 | Every command and its keys. Remap a key, or bind a pedal, from here. |
| `voice.pron` | 67 | Which source a new name tries first. Automatic tries them in order. |
| `project.roomTone` | 64 | Silence added to each credits file when the length is estimated. |
| `look.readerSpacing` | 62 | The space between the manuscript’s lines in the Script reader. |
| `daw.reaperPath` | 61 | The full path to reaper.exe, for when the app cannot find it. |
| `voice.dict` | 61 | Where a looked-up word gets its definition and pronunciation. |
