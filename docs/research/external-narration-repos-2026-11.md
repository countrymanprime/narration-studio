# What is worth taking from three external narration repositories (2026-11-20)

**Date:** 2026-11-20. **Issue:** [#3771](https://github.com/countrymanprime/narration-studio/issues/3771). **Question:** is anything in these three public repositories worth taking into the app, and what does each licence allow?

**Answer.** One of the three, Kosmos, is a close relative of this app (a desktop studio for human audiobook narration, MIT) and holds most of the value: its script-against-transcript proofing rules, its chapter-split heuristics and its voice-following teleprompter are pure TypeScript with test files alongside (tests not run by us), and the MIT licence lets us adapt them with a notice. The other two are worth a few small ideas each. A check of this app found it already covers several of the take-aways and partly covers most of the rest; the sixteen gaps that remain each have a follow-up issue ([Ranked across all three](#ranked-across-all-three)). None of the three drives a DAW or attributes dialogue to speakers, so none helps with creating DAW tracks ([#3748](https://github.com/countrymanprime/narration-studio/issues/3748)), the slow DAW link ([#3752](https://github.com/countrymanprime/narration-studio/issues/3752)) or the local-model attribution fallback ([#3743](https://github.com/countrymanprime/narration-studio/issues/3743)).

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

Every take-away that this app lacks, ranked by expected gain against effort. Each has a follow-up issue, written on 2026-11-20, that holds the evidence and the expected gain; none of the gains is measured. "In this app" is what a search of this repository found the same day. Take-aways the app already covers, and those ruled out, are in each repository's own table.

| # | Item | From | Licence class | Effort | In this app | Follow-up |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | A hand-labelled corpus and a test that reports Proof flag precision | Kosmos | Idea only | M | Partial: a provisional synthetic corpus counts stage recommendations, not flags (`internal/proofing/corpus_test.go`) | [#3782](https://github.com/countrymanprime/narration-studio/issues/3782) |
| 2 | British and American spellings compared as the same word | Kosmos | Adapt with attribution, or idea only | S | Partial: a narrator can add a pair by hand; `homophones.csv` has no spelling groups | [#3779](https://github.com/countrymanprime/narration-studio/issues/3779) |
| 3 | Per-book words to stop flagging, applied only when every word of a flag is listed | Kosmos | Idea only | S to M | Partial: a per-project "treat as same" pair list (`TreatAsSame.tsx`) | [#3780](https://github.com/countrymanprime/narration-studio/issues/3780) |
| 4 | Room check that predicts the noise floor after mastering gain | Kosmos | Adapt with attribution, or idea only | S | Partial: the floor is measured and shown in the Booth (`internal/roomtone`); the limit is checked on rendered files only | [#3791](https://github.com/countrymanprime/narration-studio/issues/3791) |
| 5 | Warning before recording that a chapter is estimated over the file-length limit | Kosmos | Idea only | S | Partial: the limit (`deliveryprofile/acx.go:68`) and a words-per-hour estimate (`ui/src/state.ts:81`) exist apart | [#3788](https://github.com/countrymanprime/narration-studio/issues/3788) |
| 6 | Pickup verification: check the retake against its line before clearing the flag | Kosmos | Idea only | M | Partial: pickups are marked recorded by position; an ASR re-check exists for live Booth flags only (`internal/liveflags`) | [#3783](https://github.com/countrymanprime/narration-studio/issues/3783) |
| 7 | Voice-following cursor: hallucination-token filter, halt after several misses, predictive lead | Kosmos | Idea only first | M to L | Partial: skip, restart and waiting are handled (`internal/scripttrack/tracker.go:26-35`); these three are not | [#3784](https://github.com/countrymanprime/narration-studio/issues/3784) |
| 8 | Each failed delivery check labelled with where it is fixed | Kosmos | Idea only | S | Partial: a prose fix per metric (`master/fileVerdict.ts:32`); no category, no bitrate case | [#3792](https://github.com/countrymanprime/narration-studio/issues/3792) |
| 9 | Per-chapter "review before you read" notices: leftover markup, very long paragraphs, tables | narrato-studio | Idea only | S | Absent: the importer's notices cover other cases | [#3789](https://github.com/countrymanprime/narration-studio/issues/3789) |
| 10 | Discrepancies within a fraction of a second merged into one flag | Kosmos | Idea only | S | Absent | [#3781](https://github.com/countrymanprime/narration-studio/issues/3781) |
| 11 | Clip start and end tightened with a loudness envelope around ASR word times | narration.studio | Adapt with attribution, or idea only | S to M | Partial: trims come from silence runs (`internal/editing/empty_space.go`); word times are not used | [#3793](https://github.com/countrymanprime/narration-studio/issues/3793) |
| 12 | Previous good copy of a project file kept as a fallback | Kosmos | Idea only | S to M | Partial: a corrupt file is set aside and a fresh one started (`internal/persist/persist.go:114`) | [#3795](https://github.com/countrymanprime/narration-studio/issues/3795) |
| 13 | A part heading directly above a chapter heading folded into one chapter start | Kosmos | Adapt with attribution, or idea only | S to M | Partial: contents lists are handled; stacked headings stay separate, pinned by `heading_subtitles_test.go:40` | [#3787](https://github.com/countrymanprime/narration-studio/issues/3787) |
| 14 | Follow-along matching by sound (phonemes) | narration.studio | Idea only | M | Partial: spelling match with homophone and number keys (`scripttrack/tracker.go:56, 86`) | [#3785](https://github.com/countrymanprime/narration-studio/issues/3785) |
| 15 | "How to say this" hints for figures and abbreviations | narrato-studio | Adapt with attribution, or idea only | M | Absent: spoken numbers are used for matching only | [#3790](https://github.com/countrymanprime/narration-studio/issues/3790) |
| 16 | Live "current line, retake of the previous line, or unclear" decision | narration.studio | Idea only | M | Partial: a "restart" flag (`scripttrack/flags.go:31`) | [#3786](https://github.com/countrymanprime/narration-studio/issues/3786) |

A search of this repository's open issues on 2026-11-20 found none that these items already serve, except that item 12 touches the package [#3751](https://github.com/countrymanprime/narration-studio/issues/3751) is researching and item 7 sits near [#3666](https://github.com/countrymanprime/narration-studio/issues/3666), a different teleprompter defect. Terms searched: homophone, false positive proof, skipped import, room tone, teleprompter follow, region csv, spelling, ignore word proof, pickup verify, noise floor room, chapter length, trim speech, backup corrupt, part chapter heading, numbers abbreviation, phoneme.

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
| Proofing | Myers diff, three folds, suppression rules, labelled corpus | `internal/compare` diff with a homophone canon (`homophones.csv`, 61 lines, also free of the heteronyms Kosmos names); the code has a homophone fold, a possessive fold and a re-spaced-word rule (`FuseHyphenSplits`), and a search of it for a British/American spelling fold found none |
| Teleprompter | Parakeet, resync windows, predictive lead | faster-whisper or moonshine in `manuscript-teleprompter/core/live_asr.py`; the cursor in `internal/scripttrack` handles skips, restarts and waiting |
| Chapters | TOC-run removal, stacked headings, length warning | `internal/importer/headings.go`, EPUB and Markdown TOC readers, import notices |
| Speaker attribution | None | Rules, BookNLP and GLiNER providers |
| Mastering meters | TypeScript | Go (`internal/measure`), same standards |
| Storage | One `project.json` | Several JSON files per project (`docs/reference/data-files.md`) |

Kosmos is ahead on proofing false-positive handling and teleprompter recovery, covers the same mastering standards (not compared by measurement), and is behind on DAW integration, speaker attribution and storage granularity.

### Kosmos: worth taking, ranked

| # | Item | Where | Licence class | Effort | In this app (2026-11-20) | Follow-up |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | A labelled corpus and evaluator for flag precision | `src/core/proof/corpus.ts`, `eval.ts` | Idea only (the method, with our own labels) | M | Partial | [#3782](https://github.com/countrymanprime/narration-studio/issues/3782) |
| 2 | British to American spelling fold | `src/core/proof/spelling.ts` | Adapt with attribution, or idea only | S | Partial | [#3779](https://github.com/countrymanprime/narration-studio/issues/3779) |
| 3 | Per-book suppressed words | `src/core/proof/align.ts:742-748` | Idea only | S to M | Partial | [#3780](https://github.com/countrymanprime/narration-studio/issues/3780) |
| 4 | Room check that predicts the floor after gain | `src/core/acx/room.ts` (160 lines) | Adapt with attribution, or idea only | S | Partial | [#3791](https://github.com/countrymanprime/narration-studio/issues/3791) |
| 5 | Chapter length warning (over 120 minutes at 9,300 words an hour) | `split.ts:14-15` | Idea only | S | Partial | [#3788](https://github.com/countrymanprime/narration-studio/issues/3788) |
| 6 | Pickup verification by re-running ASR on the punch | `src/core/proof/pickup-verification.ts` | Idea only | M | Partial | [#3783](https://github.com/countrymanprime/narration-studio/issues/3783) |
| 7 | Voice-following cursor: token filter, miss count, predictive lead | `src/core/teleprompter/{live,lead}.ts` | Idea only first | M to L | Partial | [#3784](https://github.com/countrymanprime/narration-studio/issues/3784) |
| 8 | "Who settles it" ownership per failed delivery check | `src/core/acx/fixes.ts` | Idea only | S | Partial | [#3792](https://github.com/countrymanprime/narration-studio/issues/3792) |
| 9 | Pickups within 0.4 s merged | `src/core/proof/align.ts:247-250` | Idea only | S | Absent | [#3781](https://github.com/countrymanprime/narration-studio/issues/3781) |
| 10 | Previous project file kept and read as a fallback | `electron/project-save.cjs:22-51` | Idea only | S to M | Partial | [#3795](https://github.com/countrymanprime/narration-studio/issues/3795) |
| 11 | Stacked part and chapter headings folded | `src/core/manuscript/split.ts:197-217` | Adapt with attribution, or idea only | S to M | Partial | [#3787](https://github.com/countrymanprime/narration-studio/issues/3787) |

Already in this app, so nothing to take:

- **The re-spaced-word check.** `FuseHyphenSplits` (`internal/compare/align.go:63`) treats "half-empty" against "halfempty" as equal, with tests in `compare_test.go:156`.
- **Contents-list handling at import.** DOCX and Markdown can use the table of contents as the chapter list (`internal/importer/markdown.go:171`), a multi-line TXT contents block is never read as a heading (`txt.go:296-300`), and EPUB navigation drives chapters (`epub_toc.go`).
- **The homophone fold without heteronyms**, the mastering meters (this app's Go meters cover the same standards) and marker export (this app writes to the DAW directly, and exports pickups as CSV from `internal/pickups/csv.go`).

Ruled out: the proofer packet in HTML and XLSX (`src/core/proof/packet.ts`), because `docs/prds/proof-and-pickups.prd.md:49` lists a proofer packet as out of scope; the storage layout; and the base64 audio transport.

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

| # | Item | Where | Licence class | Effort | In this app (2026-11-20) | Follow-up |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Per-chapter "review before you read" warnings: leftover markup, very long paragraphs, tables | `manuscript.py:1176-1190` | Idea only (a few lines; quicker to write than to port) | S | Absent | [#3789](https://github.com/countrymanprime/narration-studio/issues/3789) |
| 2 | Number and abbreviation expansion as a "how to say this" hint | `manuscript.py:456-657` | Adapt with attribution, or idea only | M | Absent | [#3790](https://github.com/countrymanprime/narration-studio/issues/3790) |

Does not apply: resetting a chapter's approval when its text is edited (`router.py:994-997`). A search of this app found no path that edits manuscript text after import; when the evidence behind a confirmed stage changes, `internal/stages/service.go:67` reports the contradiction and leaves the revert to the narrator. That search was not exhaustive.

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

| # | Item | Where | Licence class | Effort | In this app (2026-11-20) | Follow-up |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Envelope trim around a rough timestamp | `processor.ts:16-139` | Adapt with attribution (about 120 lines), or idea only | S to M | Partial | [#3793](https://github.com/countrymanprime/narration-studio/issues/3793) |
| 2 | Compare in phoneme space, not spelling, when matching speech to a line | `pronunciation.ts`, `AudioRecorder.svelte:76-90` | Idea only | M | Partial | [#3785](https://github.com/countrymanprime/narration-studio/issues/3785) |
| 3 | "Current line, previous line, or unclear" decision with an interval test and manual override | `AudioRecorder.svelte:91-128` | Idea only | M | Partial | [#3786](https://github.com/countrymanprime/narration-studio/issues/3786) |

Left to existing work: writing one record per edit (`persistence.ts:20-24`). This app replaces whole files atomically (`internal/persist/write.go`), and whether to store smaller units is the question [#3751](https://github.com/countrymanprime/narration-studio/issues/3751) is researching.

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

1. Whether to adapt code from an MIT source for the five follow-ups that offer it ([#3779](https://github.com/countrymanprime/narration-studio/issues/3779), [#3787](https://github.com/countrymanprime/narration-studio/issues/3787), [#3790](https://github.com/countrymanprime/narration-studio/issues/3790), [#3791](https://github.com/countrymanprime/narration-studio/issues/3791), [#3793](https://github.com/countrymanprime/narration-studio/issues/3793)), or to keep every take-away at idea level and avoid the notices work.
2. Whether to move the rule for ported source, stated so far only in a research note for one case, into the licence policy before the first such change.
3. Whether three follow-ups are wanted at all: [#3786](https://github.com/countrymanprime/narration-studio/issues/3786), [#3787](https://github.com/countrymanprime/narration-studio/issues/3787) and [#3790](https://github.com/countrymanprime/narration-studio/issues/3790) carry the `owner-decision` label.

## What was not read

- **Kosmos:** the legacy app (`src/app/App.tsx`, `electron/main.cjs`) and most renderer UI and CSS, searched by keyword only; the bodies of `live.ts` after line 500 and `master.ts` after line 170, read as outlines; `docs/SPEC.md` and the peer-to-peer research documents; the website folders; all test bodies; `package-lock.json`, so transitive dependency licences are unchecked, as are the licences of its `vgpu` and `electron-liquid-glass` dependencies; all binaries and model files.
- **narrato-studio:** the Chatterbox model code beyond licence headers, the older API servers, `process_manuscript.py`, `generate_audiobook_cli.py`, most of `narrato_cli.py`, most frontend components, the Docker files and test bodies.
- **narration.studio:** read in full except the Svelte markup and styles of the overlay components.
- **Not done for any of them:** running the software, measuring any claim, reading issue trackers or pull requests, checking forks or later commits, and reading history older than what `--depth 50` fetched for the shallow clones.
