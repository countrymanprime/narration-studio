# What is worth taking from three external narration repositories (2026-11-20)

**Date:** 2026-11-20. **Issue:** [#3771](https://github.com/countrymanprime/narration-studio/issues/3771). **Question:** is anything in these three public repositories worth taking into the app, and what does each licence allow?

**Answer.** One of the three, Kosmos, is a close relative of this app (a desktop studio for human audiobook narration, MIT) and holds most of the value: its script-against-transcript proofing rules, its chapter-split heuristics and its voice-following teleprompter are pure TypeScript with test files alongside (tests not run by us), and the MIT licence lets us adapt them with a notice. The other two are worth a few small ideas each. None of the three drives a DAW or attributes dialogue to speakers, so none helps with creating DAW tracks ([#3748](https://github.com/countrymanprime/narration-studio/issues/3748)), the slow DAW link ([#3752](https://github.com/countrymanprime/narration-studio/issues/3752)) or the local-model attribution fallback ([#3743](https://github.com/countrymanprime/narration-studio/issues/3743)).

Nothing was copied into this repository. Every item below that involves their code needs an owner decision and an entry in the third-party notices file shipped with each release first ([Licence compatibility](#licence-compatibility)).

## Method and limits

- Each repository was cloned read-only into a scratch directory outside this repository on 2026-11-20 and read at the commit in the table. No code from any of them was run, built or installed, and nothing was sent to their hosts beyond the `git clone`.
- Claims cite `path:line` in the external repository at that commit. A claim cited to their documentation is their own description and was not checked against their code.
- The clones are shallow (`--depth 50`, which fetched 50 to 198 commits depending on merges), so history before the oldest fetched commit was not read.
- Issue #3771 also names a fourth repository whose licence is proprietary, all rights reserved. At the owner's request (review on the pull request, 2026-11-20) it is left out of this report, and nothing here derives from it.
- Effort and gain are estimates. Nothing was measured or prototyped. Effort: **S** is up to a day, **M** is two to five days, **L** is more than a week.
- What was left unread is listed per repository under [What was not read](#what-was-not-read).

| Repository | Commit read | Last commit | Licence at that commit | What it is |
| --- | --- | --- | --- | --- |
| [stevenwaterman/narration.studio](https://github.com/stevenwaterman/narration.studio) | `38702f1` | 2020-11-16 | MIT | Browser app: record a script by voice, auto-cut retakes |
| [sushily1k/narrato-studio](https://github.com/sushily1k/narrato-studio) | `a2c0c57` | 2026-09-18 | MIT | Text-to-speech audiobook generator built on Chatterbox |
| [Parafield-Official/kosmos](https://github.com/Parafield-Official/kosmos) | `8ba3a2b` | 2026-10-16 | MIT | Desktop studio for human audiobook narration |

## Licence classes used in this report

| Class | Meaning | What it requires of us |
| --- | --- | --- |
| **Idea only** | We read how it works and write our own implementation from the description, without their source open beside ours. | No licence condition: copyright protects the wording of code, not the method it implements. This repository's practice is to name the source of a ported design in the module header ([local-dependency-evaluation.md](local-dependency-evaluation.md), the `live_asr.py` precedent). |
| **Adapt with attribution** | We translate or rework their code (for example TypeScript to Go). The result is a derivative work: a work based on theirs, which their licence terms follow. | By the licence: their copyright line and licence text ship with the app. By this repository's practice: the file says where it came from. |
| **Copy with notice** | We take files or data unchanged. | The same as adapting. |

Under MIT, adapting and copying carry the same single condition: the copyright notice and the permission notice stay with "all copies or substantial portions".

**Must not copy** is the status of a source whose licence grants no right to copy or adapt. None of the three repositories in this report is in that class.

These are the author's readings of the licence texts, not legal advice.

## Ranked across all three

The ten items most worth the owner's attention, ranked by expected gain against effort, with items that serve an open issue ahead of equal items that serve none. The issues named: #3751 is the performance research on granular files and layered loading, #3666 keeping the teleprompter following when a DAW recording starts, #3748 new-chapter tracks, #3752 the slow DAW link. #3743 is the local-model fallback for speaker attribution.

| # | Item | From | Licence class | Effort | Expected gain | Serves |
| --- | --- | --- | --- | --- | --- | --- |
| 2 | Proofing false-positive rules: British and American spelling fold, per-book suppressed words, a re-spaced-word check ("half-empty" heard as "halfempty"), flags within 0.4 s merged into one pickup, plus a hand-labelled precision corpus | Kosmos | Adapt with attribution (or idea only) | M | Fewer false flags on the Proof page; a corpus to measure flag precision | Proof page; no open issue found |
| 4 | Voice-following cursor: resync windows, hallucination-token filter, halt after three misses, predictive lead | Kosmos | Idea only first; adapt with attribution if the ideas prove out | M to L | A teleprompter that recovers from skips and restarts | Teleprompter; nearest open issue is [#3666](https://github.com/countrymanprime/narration-studio/issues/3666), which asks for following to survive a recording start |
| 5 | Table-of-contents run removal and stacked part/chapter heading folding in chapter detection | Kosmos | Adapt with attribution | S to M | Fewer phantom chapters on import | Import; no open issue found |
| 8 | Room check that predicts the noise floor after mastering gain | Kosmos | Adapt with attribution | S | The narrator learns before recording that the room is likely to fail ACX's noise-floor limit | Booth; no open issue found |
| 9 | Pickup verification: re-run ASR on the punched line and clear the flag only when it matches | Kosmos | Idea only | M | Closes the loop between Pickups and Proof | Pickups; no open issue found |
| 10 | Envelope-based trim of a clip's start and end around a rough ASR timestamp | narration.studio | Adapt with attribution | S | Tighter automatic take boundaries | Editing; no open issue found |

"No open issue found" means a search of this repository's open issues on 2026-11-20 for the item's keywords returned nothing relevant. Terms searched: homophone, false positive proof, skipped import, room tone, teleprompter follow, provenance attribution, region csv.

## Kosmos (Parafield-Official/kosmos)

### Kosmos: licence

**Licence: MIT** (the SPDX identifier, the standard short name for a licence). `LICENSE` reads "Copyright (c) 2026 Parafield Inc." followed by the standard MIT text; `package.json:6` says `"license": "MIT"`. Key terms: use, copy, modify, merge, publish, distribute, sublicense and sell are all allowed; the one condition is that the copyright and permission notices stay with copies or substantial portions; no warranty.

Its source files carry no per-file licence headers. Material in the repository under other terms, none of which we would take from here (licences as its `THIRD_PARTY_NOTICES.md` and `vendor/` notice files state them; the binaries were not inspected):

- `native/parakeet_capi.h` is the parakeet.cpp header (MIT).
- `vendor/cmudict/` is the CMU Pronouncing Dictionary, whose README asks for acknowledgement. This app already has its own CMU source row (`internal/pronunciationport`).
- `vendor/bin/` holds committed macOS binaries of FFmpeg (LGPL-2.1-or-later), whisper.cpp (MIT) and parakeet (MIT), with LAME and mpg123 libraries (LGPL) and a MarkItDown licence file (MIT). `vendor/silero-vad` (MIT) and `vendor/whisperx-runtime` (BSD-2-Clause) sit beside it.
- The Parakeet speech model it downloads is CC BY 4.0 (`THIRD_PARTY_NOTICES.md`).
- The licence of the wav2vec2 alignment model that WhisperX uses is not stated anywhere in the repository.

### Kosmos: what it does

Record a chapter from a teleprompter that follows the narrator's voice, or import a recording; proofread the take against the manuscript; master to ACX; export a named delivery pack (`README.md:1-40`). Version 0.1.40 (`package.json`, package name `booth-desk`). It records with its own recorder and exports pickup markers for REAPER, Audacity and Audition instead of driving a DAW.

### Kosmos: architecture

- **Electron, two generations in one repository.** The shipping app is `electron/labs.cjs` with the React 19 renderer in `labs/next/src` (`package.json:16`); `src/app/App.tsx` (10,625 lines) and `electron/main.cjs` are an older app excluded from the package (`package.json:59-60`).
- **`src/core`** is pure TypeScript domain logic: 78 source files of about 15,700 lines, plus 69 test files, shared by the main process and the renderer. This is where the reusable code lives.
- **IPC.** 52 `labs:*` invoke channels, each asserting the sender is the one trusted window (`electron/ipc-security.cjs:6-20`).
- **Storage.** One `project.json` per project (schema 1) holding pickups, punches, word timings and the transcript, plus chapter HTML and WAV files in folders. Writes go through a per-file queue, then a temp file, then a rename (`electron/file-utils.cjs`); the previous `project.json` is kept as `project.json.previous` and read as a fallback (`electron/project-save.cjs:22-51`).
- **Helpers.** FFmpeg, whisper.cpp, WhisperX, Parakeet and MarkItDown run as child processes with a timeout and an output cap (`electron/process.cjs:52-116`). Models are pinned by revision and SHA-256 (`electron/model.cjs:8-24`).
- **Tests.** Vitest, 147 test files across the repository; `testdata/README.md` says most audio fixtures are PCM generated inside the unit tests. The proofing code takes ASR output as an input, so its tests need no speech model. Test bodies were not read and the suite was not run.

### Kosmos: notable techniques

- **Proofing** (six files of `src/core/proof/`: `align`, `normalize`, `numbers`, `homophones`, `spelling`, `silence`; 1,653 lines):
  - A Myers diff over normalised "match units" (`align.ts:812-842`).
  - Three folds before comparing: numbers to digits (`numbers.ts`), homophone classes, and British to American spelling with guards (`spelling.ts`).
  - The homophone list leaves heteronyms out on purpose: `homophones.ts:7-9` explains that "read" has a second pronunciation and "choosing the wrong one is exactly the mistake a narrator makes".
  - False-positive suppression: a re-spaced-word check that ignores a difference when only the spaces moved, as in "half-empty" heard as "halfempty" (`align.ts:407-413`); a confidence gate (`align.ts:215-218`); per-book suppressed words that apply only when every word of the pickup is listed (`align.ts:742-748`); and pickups closer than 0.4 s merged into one (`align.ts:247-250`).
  - Pauses are measured from the audio, not from ASR timings (`silence.ts:24-35`).
  - A hand-labelled precision corpus (`corpus.ts`, `eval.ts`).
- **Pickups.** A pickup carries its whole sentence (`types.ts:160-169`); a punched line is re-checked by ASR (`pickup-verification.ts`); a book-wide worklist and a proofer packet in HTML and XLSX (`book-pickups.ts`, `packet.ts`).
- **Marker export** (`src/core/markers/export.ts`, 237 lines): pickups as a REAPER Region/Marker Manager CSV, Audacity labels, Audition markers and SRT.
- **Teleprompter** (`src/core/teleprompter/live.ts`, 2,167 lines, with a 1,777-line test file):
  - Parakeet streaming ASR in 160 ms hops, falling back to whisper.cpp.
  - A cursor into the manuscript words advanced by `matchLiveWindow` (`live.ts:477`), with look-ahead resync of 8 and 64 words and backtrack of 48 (`live.ts:413-420`), a hallucination-token filter (`live.ts:446`) and a halt only after three misses in a row (`live.ts:190`).
  - A predictive lead that coasts at 0.85 of the measured pace, capped at one word, to hide ASR latency (`lead.ts`).
- **Chapter detection** (`src/core/manuscript/split.ts`, 484 lines): heading regexes, removal of a table-of-contents run (`split.ts:406-435`), folding of stacked part and chapter headings (`split.ts:197-217`), and a warning when a chapter is estimated over 120 minutes at 9,300 words an hour (`split.ts:14-15`). EPUB import treats the nav or NCX targets as the authoritative headings (`epub.ts:42-57`).
- **Recording.** Punch as a crossfaded splice (`src/core/audio/splice.ts`), punch-and-roll planned on sentence boundaries (`session-tape.ts:230`), and a room test that predicts the noise floor after gain from the 20th percentile of 50 ms frames (`src/core/acx/room.ts:24-110`).
- **Mastering** (`src/core/acx/`): true peak by 4x sinc oversampling and BS.1770-4 loudness in TypeScript, with a test file built on the EBU Tech 3341 signals (`loudness.test.ts`, not run by us); repair filters gated so that at most 2% of samples change (`repair.ts:13-15`); each exported file is decoded and measured again (`electron/labs-audio.cjs:829-838`); a checklist that assigns each failed check an owner: master, encode, room or manuscript (`fixes.ts`).
- **Pronunciation** (`src/core/glossary/`): candidate extraction, ARPAbet to a "LEE-oh-min-ster" respelling (`respell.ts`), and a voice guide.
- **Speaker attribution: none found.** Dialogue is marked by a quote toggle and narrator seats are painted by hand (`src/core/duet/seats.ts:29`).
- **UX patterns.** A pickup shows its whole sentence, not only the word. Punching is disabled, with the reason shown, when a flag's timestamps belong to a different recording (`session-tape.ts:119`). Its design audits record that after a stopped read, Continue is the primary action and replacing the take asks for confirmation (`docs/design-audits/`).
- **Performance.** Mastering runs in a worker thread and ASR servers stay alive between calls. Audio crosses IPC as base64 (`electron/labs.cjs:750-762`), and a keyword search of the renderer found no waveform peak cache or virtualised list. This is a design to avoid, not to take.

### Kosmos: compared with this app

| Area | Kosmos | This app (2026-11-20) |
| --- | --- | --- |
| Recording | Its own recorder; exports markers to DAWs | Drives REAPER through the Lua bridge; also Audacity 3 and a built-in recorder |
| Proofing | Myers diff, three folds, suppression rules, labelled corpus | `internal/compare` diff with a homophone canon (`homophones.csv`, 61 lines, also free of the heteronyms Kosmos names); the code has a homophone fold and a possessive fold, and a search of it for a British/American spelling fold found none |
| Teleprompter | Parakeet, resync windows, predictive lead | faster-whisper or moonshine in `manuscript-teleprompter/core/live_asr.py` |
| Chapters | TOC-run removal, stacked headings, length warning | `internal/importer/headings.go`, EPUB and Markdown TOC readers, import notices |
| Speaker attribution | None | Rules, BookNLP and GLiNER providers |
| Mastering meters | TypeScript | Go (`internal/measure`), same standards |
| Storage | One `project.json` | Several JSON files per project (`docs/reference/data-files.md`) |

Kosmos is ahead on proofing false-positive handling and teleprompter recovery, covers the same mastering standards (not compared by measurement), and is behind on DAW integration, speaker attribution and storage granularity.

### Kosmos: worth taking, ranked

| # | Item | Where | Licence class | Effort | Expected gain | Serves |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Proofing suppression rules and the spelling fold; build our own labelled corpus the same way | `src/core/proof/{align,spelling,normalize}.ts`, `corpus.ts`, `eval.ts` | Adapt with attribution for the word lists and rules; idea only for the corpus method | M | Fewer false flags; a precision number for the Proof page | Proof page |
| 2 | Voice-following cursor design | `src/core/teleprompter/{live,lead}.ts` | Idea only first: compare with `live_asr.py` on paper, then decide whether to adapt | M to L | Recovery from skips and restarts | Teleprompter; nearest is [#3666](https://github.com/countrymanprime/narration-studio/issues/3666) |
| 3 | TOC-run removal and stacked-heading folding | `src/core/manuscript/split.ts:197-217, 406-435` | Adapt with attribution | S to M | Fewer phantom chapters | Import |
| 4 | Room check that predicts the floor after gain | `src/core/acx/room.ts` (160 lines) | Adapt with attribution | S | Earlier warning of an ACX noise-floor failure | Booth |
| 5 | Pickup verification by re-running ASR on the punch | `src/core/proof/pickup-verification.ts` | Idea only | M | A pickup closes itself when the retake is right | Pickups |
| 6 | "Who settles it" ownership per failed delivery check | `src/core/acx/fixes.ts` | Idea only | S | A Master & QC failure says where to fix it | Master & QC |
| 7 | Chapter length warning (over 120 minutes at 9,300 words an hour) | `split.ts:14-15` | Idea only | S | Flags a chapter likely to exceed 120 minutes, the maximum their code sets per chapter (`MAX_CHAPTER_MINUTES`), before recording | Import |
| 8 | Proofer packet (HTML and XLSX) | `src/core/proof/packet.ts` (407 lines) | Adapt with attribution | M | A file to hand to an outside proofer | Proof page |
| 9 | Keep the previous project file and fall back to it on a failed read | `electron/project-save.cjs:22-51` | Idea only | S | Recovery from a corrupt write; check first what `internal/persist` already does | Storage; no open issue found |

Not worth taking: the mastering meters (this app's Go meters cover the same standards), the marker export (this app writes to the DAW directly), the storage layout and the base64 audio transport.

## narrato-studio (sushily1k/narrato-studio)

### narrato-studio: licence

**Licence: MIT.** `LICENSE` reads "Copyright (c) 2025 Resemble AI": the repository is built on Resemble AI's Chatterbox and keeps its licence file. `README.md:104` says "License: MIT — free for personal and commercial use". The author of the additions (46 of the 56 commits fetched) added no copyright line of their own, so the notice we would have to reproduce is the file as it stands. Key terms are the standard MIT ones described under Kosmos.

Other licences inside it: Apache-2.0 headers on model code under `src/chatterbox/models/s3gen/` (Alibaba, Mobvoi and others). We would take nothing from there. Its dependency licences are not stated in the repository.

### narrato-studio: what it does

A local text-to-speech audiobook generator for authors: clean a manuscript, review the script, generate, repair and export (`ROADMAP.md:5-6, 33-40`). No human recording and no DAW.

### narrato-studio: architecture

A FastAPI backend on `127.0.0.1:8765` and a Next.js 16 frontend that polls over REST (`studio/lib/api.ts`, `studio/app/generate/page.tsx:79`). State is module-level dictionaries saved to one `.narrato_project.json` by temp file and rename (`api/v2/router.py:337-344`). Tests are `unittest`: 31 cases for manuscript cleaning and a 1,228-line file using fake model classes; CI installs the package and does not run them.

### narrato-studio: notable techniques

- **Manuscript cleaner** (`src/chatterbox/manuscript.py:717-1300`): a block state machine with one policy per construct (bullets, numbered lists, tables read as "column: value", worksheet blanks).
- **Review warnings per chapter** (`manuscript.py:1176-1190`): leftover markup, paragraphs over 1,200 characters, large tables. The editor shows them beside the chapter.
- **Number and abbreviation expansion** for speech (`manuscript.py:456-657`): money, percentages, years, decades, ranges, ordinals.
- **Approval gate.** Editing an approved chapter resets it to pending (`api/v2/router.py:994-997`).
- **Phrase locator.** Whisper word timestamps find a phrase in the audio by a normalised word n-gram match (`router.py:1472-1495`).
- **M4B chapters** from an FFmpeg `FFMETADATA1` file with offsets computed from sample counts (`router.py:1612-1656`).
- **Pronunciation lexicon** applied at synthesis only, so the visible script is unchanged (`router.py:394-406`).
- **Speaker attribution: none.** One voice per job.
- **Recording flow: none** (it synthesises speech). **Performance:** a cache of converted voice files keyed on a hash of path, size and modification time (`api/core/tts.py:773-811`), and a per-chunk seed so editing one sentence leaves the others unchanged (`tts.py:993-1000`); neither applies to recorded audio.

Weak spots seen while reading, which lower how far to trust it: the upload path decodes a `.docx` as UTF-8 and never calls the docx reader (`router.py:827, 853`); the "ACX" mastering hard-clips peaks and uses digital zero as room tone (`router.py:1567-1599`); a failed chunk becomes silence and the chapter is still marked done (`router.py:1153-1171`).

### narrato-studio: compared with this app

This app already covers its import formats, its chapter detection, M4B and chapter tags (`internal/encodeport`, `internal/chaptertags`), mastering to a real ACX profile and pronunciation sources. Its distinct contributions are the read-aloud review warnings and the approval reset.

### narrato-studio: worth taking, ranked

| # | Item | Where | Licence class | Effort | Expected gain | Serves |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Per-chapter "review before you read" warnings: leftover markup, very long paragraphs, tables | `manuscript.py:1176-1190` | Idea only (a few lines; quicker to write than to port) | S | The narrator sees awkward-to-read spots on the Script page before the booth | Script page |
| 2 | Editing an approved chapter resets its approval | `router.py:994-997` | Idea only | S | Proofed state cannot outlive a text change; check what the Proof page does first | Proof page |
| 3 | Number and abbreviation expansion as a "how to say this" hint | `manuscript.py:456-657` | Adapt with attribution | M | Reading hints for figures and abbreviations; its rules lean towards finance text | Script page |

## narration.studio (stevenwaterman/narration.studio)

### narration.studio: licence

**Licence: MIT.** `LICENSE` reads "Copyright (c) 2020 Steven Waterman"; `package.json:4` and `README.md:18` agree. Key terms are the standard MIT ones described under Kosmos. Its dependencies are few (marked, fast-levenshtein, audiobuffer-to-wav, downloadjs, uuid, bowser, sirv-cli) and we would take none of them.

### narration.studio: what it does

A browser page, about 2,860 lines of Svelte and TypeScript read in full for this report. Paste a script in Markdown, read it aloud line by line, and the page decides from speech recognition whether each utterance was the current line, a retake of the previous line, or neither; then it cuts the recording to the accepted takes and offers a waveform editor and a WAV download. Last commit 2020-11-16. No tests.

### narration.studio: architecture

Everything runs in the browser: Web Speech API for recognition, MediaRecorder for one continuous capture, Web Audio for processing and playback, WebGL2 in a worker for the waveform, IndexedDB for auto-save.

Two things in it conflict with this app's outbound-data product rule (`.claude/rules/product-rules.md`):

- `src/recording/AudioRecorder.svelte:42` uses `webkitSpeechRecognition`. In Chrome that service sends the microphone audio to Google for recognition (general knowledge of the browser; not verified in this research).
- `src/recording/pronunciation.ts:3` downloads the CMU dictionary from `raw.githubusercontent.com` every time the page loads.

### narration.studio: notable techniques

- **Retake detection by phoneme distance** (`AudioRecorder.svelte:76-128`). The recognised text, the current line and the previous line are each converted to CMU phonemes, one character per phoneme (`pronunciation.ts:8-50`). The Levenshtein distance to each line is divided by the line's length, widened into an interval by the recogniser's confidence, and the closer line wins only when the two intervals do not overlap and the winner is under 0.5. Otherwise the page says it cannot tell and offers two buttons.
- **Trim by loudness envelope** (`src/editing/processor.ts:16-139`). A band-pass around speech, absolute value and a 128-sample mean give an envelope. Starting from the recogniser's rough times, the range grows by half a second, grows to silence, shrinks to speech, and grows to silence again. Silence is 0.1 s under 3% of the local peak; speech is over 20%.
- **Waveform** (`src/editing/canvas/render.ts`): one WebGL line strip with a vertex per sample, drawn in a worker on an `OffscreenCanvas`; scroll and zoom only change two shader uniforms.
- **Auto-save** (`src/editing/persistence.ts:20-24, 141-151`): an edit to one clip writes one record, not the whole list.
- **Hands-free flow.** Saying the line again replaces the take; saying "completed" ends the recording.
- **Text parsing.** The script is lexed as Markdown and split into sentences on `.`, `?` and `!`; a code block or table becomes a spoken placeholder (`src/script/tokenizer.ts:28, 94-95`). **Chapter handling, speaker attribution, proofing and tests: none.** It handles one script and one recording at a time. Export is a single WAV.

### narration.studio: compared with this app

This app records through a DAW with takes and punch commands, compares the take with the script afterwards (`internal/compare`), and draws waveforms from computed peaks (`internal/measure/peaks.go`). A vertex per sample is about 6.4 billion vertices for a 40-hour book at its 44.1 kHz (computed, not measured). The one idea with no counterpart here is deciding during recording that an utterance was a retake of the previous line.

### narration.studio: worth taking, ranked

| # | Item | Where | Licence class | Effort | Expected gain | Serves |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Envelope trim around a rough timestamp | `processor.ts:16-139` | Adapt with attribution (about 120 lines), or idea only | S | Tighter automatic clip boundaries from ASR word times | Editing |
| 2 | Compare in phoneme space, not spelling, when matching speech to a line | `pronunciation.ts`, `AudioRecorder.svelte:76-90` | Idea only | M | Names and odd spellings match by sound in follow-along; needs a local phoneme source, which this app has | Teleprompter; no open issue found |
| 3 | "Current line, previous line, or unclear" decision with an interval test and manual override | `AudioRecorder.svelte:91-128` | Idea only | M | A live retake hint in the Booth; unproven beyond this page | Booth |
| 4 | Write one record per edit | `persistence.ts:20-24` | Idea only | S | One data point for granular files | [#3751](https://github.com/countrymanprime/narration-studio/issues/3751) |

Not worth taking: the recogniser, the runtime dictionary download, and the per-sample waveform.

## Licence compatibility

This app is `AGPL-3.0-or-later` (`package.json:5`, `pyproject.toml:4`).

| Source | Licence | Can their code go into an AGPL-3.0-or-later app? | On the dependency allow-list | Classes open to us | What taking code would require |
| --- | --- | --- | --- | --- | --- |
| Kosmos | MIT | Yes. MIT code can be included in an AGPL work; the MIT notice stays on that part | MIT is listed | Idea only, adapt, copy | Owner decision; notice "Copyright (c) 2026 Parafield Inc." and the MIT text shipped with the app; the file header names the repository, the copyright holder and the exact commit |
| narration.studio | MIT | Yes | MIT is listed | Idea only, adapt, copy | Owner decision; notice "Copyright (c) 2020 Steven Waterman" and the MIT text; the same file header |
| narrato-studio, the author's own files | MIT (README and licence file; the copyright line names Resemble AI) | Yes | MIT is listed | Idea only, adapt, copy | Owner decision; the licence file reproduced as it stands; a note that the adapted code is by the repository's author |
| narrato-studio, `src/chatterbox/models/s3gen/` | Apache-2.0 headers | Yes with GPLv3-family licences | Apache-2.0 is listed | Not recommended: model code we have no use for | Apache-2.0 also requires carrying their NOTICE file and marking the files we changed |
| CMU Pronouncing Dictionary (inside Kosmos, fetched by narration.studio) | BSD-style with an acknowledgement request | Yes | n/a (data, not a package); already a pronunciation source in this app | n/a | Nothing new: take nothing from their copies |
| Parakeet model weights (downloaded by Kosmos) | CC BY 4.0 | A model is data, reviewed apart from code | CC-BY-4.0 is listed; models go through `scripts/licenses/model-review.json` | Out of scope here | A model review entry if the model were ever adopted |

The "yes" answers for MIT (which the FSF lists as the Expat licence) and Apache-2.0 follow the Free Software Foundation's [licence list](https://www.gnu.org/licenses/license-list.html), which marks both compatible with GPLv3; AGPLv3 shares GPLv3's compatibility terms. That page was cited from memory and not re-read in this research.

How this meets the app's dependency policy:

- **The allow-list** (`.github/workflows/dependency-review.yml`, described in [github-workflow.md](../operations/github-workflow.md)) checks package dependencies. MIT, Apache-2.0 and CC-BY-4.0 are on it. It does not see source code copied into this repository.
- **The notices file.** `THIRD-PARTY-NOTICES.txt` is generated at release by `scripts/licenses/notices.py` from the Python, npm and Go dependency graphs plus `scripts/licenses/manual.json` ([ci-and-releases.md](../operations/ci-and-releases.md), "Third-party notices"). Adapted or copied source is invisible to those graphs, so each source we take from needs a hand-written `manual.json` entry and its licence text under `scripts/licenses/texts/`.
- **The rule for ported code is written in one research note only.** [local-dependency-evaluation.md](local-dependency-evaluation.md) (section 9, WhisperLive) says a module ported from MIT code must carry a header citing the source repository and copyright holder, pinned to the exact upstream commit, because the MIT notice has to travel with the ported code. That module was in the end re-implemented from a description. The licence policy pages ([github-workflow.md](../operations/github-workflow.md), [ci-and-releases.md](../operations/ci-and-releases.md)) cover packages and do not repeat the rule. If the owner approves any "adapt" or "copy" row above, the same change should move the rule beside the notices policy: the header with its commit pin, a `manual.json` entry and the licence text.
- **Idea-only rows need no notices entry** (see the class table).

## Owner decisions this report asks for

1. Whether to adapt code from any MIT source (cross-repository rows 2, 5, 8 and 10, and later possibly row 4; the Kosmos proofer packet; narrato-studio's number expansion), or to keep every take-away at idea level and avoid the notices work.
2. Whether to move the rule for ported source, stated so far only in a research note for one case, into the licence policy before the first such change.

## What was not read

- **Kosmos:** the legacy app (`src/app/App.tsx`, `electron/main.cjs`) and most renderer UI and CSS, searched by keyword only; the bodies of `live.ts` after line 500 and `master.ts` after line 170, read as outlines; `docs/SPEC.md` and the peer-to-peer research documents; the website folders; all test bodies; `package-lock.json`, so transitive dependency licences are unchecked, as are the licences of its `vgpu` and `electron-liquid-glass` dependencies; all binaries and model files.
- **narrato-studio:** the Chatterbox model code beyond licence headers, the older API servers, `process_manuscript.py`, `generate_audiobook_cli.py`, most of `narrato_cli.py`, most frontend components, the Docker files and test bodies.
- **narration.studio:** read in full except the Svelte markup and styles of the overlay components.
- **Not done for any of them:** running the software, measuring any claim, reading issue trackers or pull requests, checking forks or later commits, and reading history older than what `--depth 50` fetched for the shallow clones.
