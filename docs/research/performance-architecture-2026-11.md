# Performance architecture for the pages that are not audio or DAW work

**Measured 2026-11-20** on `main` at `710bd32`. Issue: [#3751](https://github.com/countrymanprime/narration-studio/issues/3751), with the derived-data rule of [#3778](https://github.com/countrymanprime/narration-studio/issues/3778). **Question:** where does the time go when a page or the app opens on a 1 hour, 17 hour, 40 hour and 300-chapter book, and which changes to how the book and its state are stored, read and drawn remove the most waiting?

**Answer in one paragraph.** The waiting is not in the file layout, the wire format or the size of the script bundle. It is in four host reads that every page makes (the chapter list, the Production overview, the pickups list and the chapter sync state), which decode the whole analysis ledger once per checked chapter and every stored recording-check result twice per read. On a 17 hour book with a recording check on each of its 44 chapters, one chapter-list read costs 3.6 s and the real app's Production page keeps reading for 28 to 63 s after launch; at 103 chapters the first chapter list arrives 60 s after launch. A scratch build that decodes each ledger record once while its file is unchanged brings the chapter list to 0.78 s at 44 chapters, and a per-chapter summary record removes most of the rest. Splitting the manuscript into per-chapter files, an embedded database, compression and code splitting each measure as small next to that. The order of work is in [Recommended order](#recommended-order).

## Method

All numbers are from one cloud container: 4 vCPU Intel Xeon at 2.10 GHz, 15 GiB RAM, Linux 6.18 (Firecracker), ext4, Go 1.27.3, headless Chromium, WebKitGTK 2.52.6 under Xvfb. Windows and the owner's machine are not measured here; see [Not measured](#not-measured).

- **Book sizes.** 9,000 words an hour and 3,500 words a chapter, the scale `fixtures/bookSize.ts` uses: 1 h is 3 chapters, 17 h is 44 chapters (154,900 words), 40 h is 103 chapters (362,600 words). A fourth project has 300 short chapters (158,400 words) for the many-chapters case.
- **Mock pages.** `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/opt/pw-browsers/chromium node scripts/dev/page-bench.mjs --hours 1,17,40 --runs 5` on the production mock build (`pnpm --dir src/studio/ui run build:mock`). Cold is a fresh browser context on the page's address; warm is a click from another page. The mock backend answers from memory, so these numbers hold the page's own cost and none of the host's.
- **Page start split.** A Chrome trace of a cold load (navigation timing, `v8.evaluateModule`, first contentful paint, the start of the first host call), median of 7.
- **Page CPU split.** A CPU profile of a cold and a warm load on an un-minified production build, self time grouped by the module a function came from. Profiling inflates totals; read the shares, not the milliseconds.
- **Host reads.** Seeded project folders in the host's real layout: `scripts/dev/real-app/seed.py --chapters N --items-per-track 100` for the manuscript, a `.rpp` with one linked track of 100 items per chapter and the links; then, through the host's own code, a Story Bible (`guide.Build`), one complete recording check per chapter (`CoverageStart` with a stand-in sidecar, so the ledger record and the stored result are real), findings at 40 per 1,000 words with 45 % decided, marks at 15 per 1,000 words, a pickup list and script prep. A Go test builds a `Host` on the folder the way `ServiceStartup` does (without the background loops) and calls each read binding: the first call in a fresh process (cold), then the median of up to 9 more (warm). 5 fresh processes for 1 h and 17 h, 3 for 40 h, 1 for 300 chapters. A second pass drops the operating system's file cache before each process.
- **Real app start.** The built host (`/tmp/ns-host`) started by `scripts/dev/real-app/start-host.sh` on the same seeded folders with `NARRATION_DEBUG=1`, no DAW running; times are from the launch command to the `ui.call.ok` lines of `run.jsonl`. 3 starts each for no project, 1 h and 17 h; 2 for 40 h.
- **Reused numbers.** Lane switches and bridge round trips through a real REAPER are in [REAPER bridge performance](reaper-bridge-performance.md) (a lane switch about 105 ms on Linux and 120 to 209 ms on Windows, flat from 0 to 5,000 items). The embedded-store numbers are from the [storage engine spike](storage-engine-spike.md). Repeated page reads are counted in [#3658](https://github.com/countrymanprime/narration-studio/issues/3658).

The seeding test, the timing test and the start script were scratch files and are not in the repository; [slice 3](#recommended-order) commits a version of them. `scripts/dev/real-app/seed.py` on its own writes no recording checks, findings or Story Bible, which is why the real-host figure in [#3254](https://github.com/countrymanprime/narration-studio/issues/3254) (938 ms for the first chapter-link read at 44 chapters) does not show the cost found here.

### What the seeded projects hold

| On disk | 1 h, 3 chapters | 17 h, 44 chapters | 40 h, 103 chapters | 300 chapters |
| --- | --- | --- | --- | --- |
| `manuscript.json` | 89 KB | 1.31 MB | 3.06 MB | 1.38 MB |
| `Book.rpp` (items) | 118 KB (300) | 1.73 MB (4,400) | 4.06 MB (10,300) | 11.87 MB (30,000) |
| Story Bible (entities, cues) | 148 KB (21, 40) | 2.29 MB (297, 587) | 5.30 MB (681, 1,373) | 2.40 MB (301, 600) |
| Findings files (findings) | 538 KB (460) | 7.90 MB (6,742) | 18.5 MB (15,760) | 8.10 MB (6,894) |
| Recording-check results | 2.41 MB (3 files) | 35.4 MB (44) | 82.7 MB (103) | 42.8 MB (300) |
| Analysis ledger | 162 KB (3) | 2.37 MB (44) | 5.56 MB (103) | 16.2 MB (300) |
| `marks.json` (marks) | 51 KB (158) | 736 KB (2,323) | 1.72 MB (5,438) | 754 KB (2,376) |

Not seeded: bookmarks, notes, edit logs, the passage map, voice tracks, production sessions, stage decisions, the transcript and waveform cache, real audio. The manuscript text is pseudo-words, so compression ratios are indicative.

## Baseline

### App start, real host

Time after the launch command, in seconds. "First answer" is the first host call the page gets back; the app shell is drawn by then.

| Project | First answer | Chapter list first answers | Pickups list first answers | Reads stop |
| --- | --- | --- | --- | --- |
| None | 1.5 to 1.7 | n/a | n/a | 2.5 to 2.7 |
| 1 h | 1.4 to 1.7 | 1.9 to 2.5 | 2.1 to 2.5 | 2.4 to 7.9 |
| 17 h, every chapter checked | 1.5 to 1.7 | 13.6 to 14.6 | 23 to 25 | 28 to 63 |
| 40 h, every chapter checked | 1.5 to 1.7 | 59.7 | 74 | after 110 |

- The host itself is ready in 0.11 s: `NewHost`, `configureLocked` and `buildAssetRegistry` together take about 5 ms at every book size. The 1.4 s before the first answer is the window, WebKitGTK and the script bundle, under software rendering.
- The chapter-list and pickups columns are the first answer's time plus nothing else: the log line is written when the answer arrives.
- On the 17 h project the page sends `ManuscriptChapters` three times, `PickupsList` twice and `ProductionOverview` once at the same moment. Each takes 12.0 to 12.9 s there against 3.6 s when called alone, because they compete for the same cores and files.
- The reads repeat after the first set (a focus or event refresh), which is why the page keeps working for 28 to 63 s.

### Host reads, one call in a fresh process

Milliseconds, cold | warm, and the size of the answer.

| Binding | 1 h | 17 h | 40 h | 300 chapters (cold) |
| --- | --- | --- | --- | --- |
| `PickupsList` | 94 \| 58 | 5,475 \| 5,443 (1.68 MB) | 25,133 \| 25,193 (3.89 MB) | 164,927 |
| `ManuscriptChapters` | 68 \| 34 | 3,556 \| 3,627 (63 KB) | 16,435 \| 16,341 (148 KB) | 110,640 |
| `ProductionOverview` | 80 \| 33 | 3,627 \| 3,616 (15 KB) | 15,195 \| 15,850 (33 KB) | 110,310 |
| `ChapterSyncState` | 57 \| 13 | 1,852 \| 1,809 (18 KB) | 7,985 \| 7,967 (41 KB) | 56,892 |
| `FindingsList({})` | 14 | 199 \| 183 (5.73 MB) | 419 \| 401 (13.4 MB) | n/a |
| `FindingsSummary` | n/a | 115 \| 107 (2 KB) | 295 \| 211 (4 KB) | n/a |
| `WorkspaceAlignment(chapter)` | 38 \| 33 | 123 \| 69 (569 KB) | 224 \| 124 (568 KB) | n/a |
| `StageRecommendations` | n/a | 65 \| 15 | 142 \| 27 | n/a |
| `ChapterTrackLinks` | n/a | 64 | 147 | n/a |
| `GuideEntities` | n/a | 48 | 107 (3.36 MB) | n/a |
| `GuideDialogueCues` | n/a | 42 | 85 (693 KB) | n/a |
| `MarksList` | n/a | 37 | 168 | n/a |
| `Bootstrap` | 1.1 \| 0.8 | 9.3 \| 7.3 | 28 \| 22 | 34 \| 12 |
| `ManuscriptParagraphs(chapter)` | n/a | 12 \| 0.1 | 20 \| 0.1 | 7.5 \| 0.02 |
| `SystemSettingsForScope` | 7 to 9 at every size | | | |

- Warm equals cold for the first four: nothing they compute is kept between calls.
- With the operating system's file cache dropped, the first four stay inside their warm range (file reading is at most 0.5 % of their time). `FindingsList({})` rises to 311 ms at 17 h and 703 ms at 40 h, `Bootstrap` to 21 and 39 ms, `GuideEntities` to 82 ms at 17 h.
- `PickupsCount` needs a live bridge and `WorkspacePeaks` needs audio; neither is in the table.

### Host reads by page

Milliseconds for a page's read bindings called one after another, cold | warm; then called at once, cold; then the bytes returned.

| Page (reads) | 17 h in order | 17 h at once | 40 h in order | 40 h at once | Bytes, 17 h / 40 h |
| --- | --- | --- | --- | --- | --- |
| Every page's shell (9) | 9,540 \| 9,445 | 5,676 | 39,655 | 25,035 | 1.76 / 4.06 MB |
| Production (11) | 5,538 \| 5,501 | 3,820 | 23,524 \| 23,763 | 15,377 | 5.83 / 13.6 MB |
| Schedule (3) | 3,698 \| 3,657 | 3,807 | 15,136 \| 15,168 | 15,496 | small |
| Pickups (4) | 5,449 \| 5,544 | 5,775 | 24,711 \| 24,196 | 24,486 | 1.7 / 3.9 MB |
| Proof (10) | 987 \| 869 | 750 | 2,103 \| 1,898 | 1,557 | 11.8 / 26.8 MB |
| Editing (10) | 280 \| 247 | 208 | 591 \| 484 | 329 | under 1 MB |
| Booth (11) | 193 \| 147 | 117 | 416 \| 363 | 215 | under 1 MB |
| Script (7) | 150 \| 143 | 109 | 344 \| 350 | 229 | 2.32 / 5.33 MB |
| Story Bible (7) | 154 \| 115 | 116 | 360 \| 257 | 239 | 3 to 4 MB |
| Settings (8) | 104 \| 99 | 97 | 110 \| 96 | 107 | small |
| Master & QC, Delivery (5) | 3 \| 1 | 3 | 3 \| 1 | 3 | small |

The shell row is what every page pays before its own reads, because the layout reads the chapter list, the findings summary and the pickups list. Calling a page's reads at once takes 0.6 to 1.0 times the in-order time, and nothing at all on a page with one dominant read.

### Pages on the mock backend

Milliseconds until the page is usable, cold | warm (`page-bench.mjs`, median of 5).

| Page | 1 h | 17 h | 40 h | DOM nodes at 40 h | Calls / KB at 40 h, cold |
| --- | --- | --- | --- | --- | --- |
| Production | 712 \| 153 | 992 \| 308 | 1,001 \| 450 | 5,015 | 53 / 447 |
| Script | 803 \| 292 | 1,250 \| 431 | 1,247 \| 517 | 4,822 | 36 / 259 |
| Booth | 1,076 \| 560 | 1,263 \| 622 | 1,148 \| 585 | 3,998 | 62 / 227 |
| Editing | 850 \| 390 | 1,047 \| 359 | 843 \| 322 | 4,098 | 56 / 458 |
| Proof | 749 \| 222 | 844 \| 223 | 791 \| 226 | 744 | 41 / 220 |
| Schedule | 651 \| 112 | 763 \| 130 | 634 \| 131 | 259 | 27 / 210 |
| Story Bible | 670 \| 167 | 795 \| 179 | 703 \| 160 | 488 | 35 / 172 |
| Pickups | 714 \| 154 | 738 \| 153 | 799 \| 146 | 348 | 30 / 162 |
| Master & QC | 663 \| 136 | 702 \| 138 | 737 \| 150 | 1,181 | 29 / 172 |
| Delivery | 659 \| 127 | 749 \| 112 | 625 \| 119 | 650 | 28 / 168 |
| Settings | 844 | 685 | 705 | 585 | 43 / 217 |

- The warm Settings cell printed `NaN` at every size: the benchmark's own step to reach Settings failed and is not diagnosed.
- The JS heap after a collection is 11 to 20 MB at 1 h and 23 to 34 MB at 40 h.
- **Start split.** On every page and every book size the first host call starts 330 to 450 ms after navigation. That time is fetching and compiling one 3.5 MB script (2.97 MB in the real build) and 165 to 200 ms evaluating its modules. It is 40 to 60 % of a cold page on the mock and does not depend on the book.
- **CPU split at 40 h.** Production warm, 661 ms busy: browser style, layout and paint 30 %, `react-dom` 25 %, the Production components 23 %. Script warm, 938 ms: `react-dom` 28 %, the Script components 25 %. Cold loads add about 150 ms in the API client's modules (building the Zod schemas at import) and 80 to 120 ms in the mock backend, which the real app does not run. Validating answers with Zod is 54 to 67 ms, 4 to 5 % of a cold load.

### Where the four slow reads spend their time

A CPU profile at 40 h puts 72 % of `ManuscriptChapters` in `coverage.currentReports`, and under it 63 % in `evidence.LedgerStore.All` decoding ledger records with `json.Unmarshal`.

- `currentReports` ([internal/coverage/read.go](../../src/studio/desktop/internal/coverage/read.go)) evaluates every checked chapter. Each evaluation asks the ledger for the chapter's newest record, and `LedgerStore.List` answers by decoding every record file in the folder ([internal/evidence/ledger.go](../../src/studio/desktop/internal/evidence/ledger.go)). A record holds the fingerprint of each item on the chapter's track, about 54 KB at 100 items. The work is checked chapters × ledger records: 1,936 decodes at 44 chapters, 10,609 at 103, 90,000 at 300.
- A chapter-list read runs `currentReports` twice, once for the recorded fractions and once for the recorded-through place.
- Each evaluation that finds a current check then decodes the chapter's stored result, about 800 KB, to read its counts. The decoded-result cache holds 4 entries, so a 44-chapter book decodes 35.4 MB twice per chapter-list read.
- `ProductionOverview` and `PickupsList` call the chapter list and inherit all of it; `PickupsList` adds its own evaluation per chapter. `ChapterSyncState` reaches the same ledger scan through `coverage.ResultIn`.
- A system-call trace at 3 chapters shows each ledger file opened 28 times and `settings.json` 63 times for three bindings.
- One pass over every page's reads allocates 8.1 GB at 17 h and 37.5 GB at 40 h, almost all of it this decoding.

A side observation from seeding: each finished recording check queues a `chaptersync:state` read, so checking 103 chapters in a row left the host above 100 % CPU for more than 10 minutes after the last check had been written.

## The ten largest costs

Ranked by the waiting a narrator sees on a 17 hour book whose chapters have recording checks. Times are for 44 chapters, then 103.

| # | Cost | Measured | Where the narrator meets it |
| --- | --- | --- | --- |
| 1 | The ledger is decoded once per checked chapter | 3.6 s, 16.4 s per chapter-list read; 111 s at 300 chapters | Every page (the shell reads the chapter list); Production, Schedule and Pickups most |
| 2 | Every stored check result is decoded twice per chapter-list read | 0.78 s, 1.97 s per chapter-list read with cost 1 fixed | The same pages |
| 3 | The same slow read is sent two or three times at once and again on refresh | 12 to 13 s per call in the real app against 3.6 s alone; reads continue for 28 to 63 s | App start and every page change ([#3658](https://github.com/countrymanprime/narration-studio/issues/3658)) |
| 4 | The pickups list re-evaluates every chapter and returns the whole list | 5.5 s, 25 s; 1.68 MB, 3.89 MB | Every page (the shell's count), Pickups |
| 5 | Chapter sync state evaluates every chapter | 1.85 s, 8.0 s | Every page; a check that finishes queues one |
| 6 | Findings are decoded from every file for each list, summary or single finding | list 199 ms, 419 ms; summary 115 ms, 295 ms for a 2 KB answer; Proof moves 11.8 MB, 26.8 MB | Proof, the shell's summary, Production |
| 7 | The window, the web view and one 3 MB script before any book data | 1.4 s to the first answer on this rig; 330 to 450 ms of it in Chromium is the script | App start |
| 8 | Whole-book lists are drawn in full | Production 450 ms and Script 517 ms warm at 103 chapters, 5,015 and 4,822 DOM nodes | Production, Script |
| 9 | The Story Bible is decoded per read and sent whole | 48 ms, 107 ms per read, two or three reads a page; 3.36 MB at 40 h | Script, Story Bible, Booth, Editing, Settings |
| 10 | The `.rpp` is parsed in full after each save, and every item's file is stat'ed on each read | parse 29 ms, 52 ms, 141 ms at 300 tracks; `ChapterTrackLinks` 64 ms, 147 ms | The first read after each REAPER save |

Costs 1 to 5 are 90 % or more of the host time on Production, Schedule, Pickups and the shell. Costs 6 to 10 are each under half a second.

## Options

### Granular files with an index

The proposal: a chapter index file, one text file per chapter, and separate files for attributions, links and peaks, each with a version and hash header.

| Measurement | 17 h | 40 h | 300 chapters |
| --- | --- | --- | --- |
| `ManuscriptChapters` answer | 64.8 KB | 151 KB | 145 KB |
| Share of that answer that is `paragraphIds` | 78 % | 78 % | n/a |
| A chapter index (id, title, word count, status): size, read + decode + encode | 3.6 KB, 0.20 ms | 8.1 KB, 0.26 ms | 23.2 KB, 0.80 ms |
| One chapter's paragraphs from `manuscript.json`: cold, warm | 11.1 ms, 0.18 ms | 17.9 ms, 0.11 ms | 7.5 ms, 0.02 ms |
| One chapter's paragraphs from its own file | 26 KB, 0.21 ms | 26 KB, 0.17 ms | 3.9 KB, 0.03 ms |
| `manuscript.json` read, decode | 0.9 ms, 7.3 ms | 1.9 ms, 23.4 ms | n/a |

- **Gain.** Splitting the manuscript text saves 11 to 18 ms once per app start; after that the in-memory parse already answers a chapter in 0.1 ms. Not worth a second copy of the source of truth.
- **What is worth taking from it.** The chapter list as an index: drop `paragraphIds` from `ManuscriptChapters` (78 % of its bytes; the pages that need them read `ManuscriptParagraphs`), and keep the per-chapter derived figures in small records (the next option). Links, attributions (the Story Bible) and peaks are already separate files.
- **Cost and risk.** Dropping `paragraphIds` changes a binding: a contract row, the golden payload, the mock and a `hostAPIVersion` bump. No file changes, so no migration.

### A persisted derived-state snapshot, keyed by its inputs

| Measurement | 1 h | 17 h | 40 h | 300 chapters |
| --- | --- | --- | --- | --- |
| Input files of the chapter list, overview and recommendations (count, bytes) | 13, 3.0 MB | 95, 41.0 MB | 213, 95.7 MB | 607, 72.5 MB |
| Snapshot of those three answers | 11 KB | 116 KB | 268 KB | 479 KB |
| Validate by size and modified time of every input | 0.01 ms | 0.20 ms | 0.16 ms | 0.50 ms |
| Validate by SHA-256 of every input | 2.7 ms | 39 ms | 83 ms | 71 ms |
| Read and decode the snapshot | 0.04 ms | 0.49 ms | 0.88 ms | 1.7 ms |
| Recompute the three answers cold, as built | 88 ms | 7,460 ms | 31,400 ms | about 226,000 ms |

- **Gain.** A valid snapshot answers in under 1 ms plus 0.2 ms of validation. Against the host as built that is 7.5 s at 17 h; against a host with costs 1 and 2 removed it is a few hundred milliseconds, once per app start.
- **Shape.** One whole-book snapshot is invalid whenever any of 95 inputs changes, and the `.rpp` changes at every REAPER save. A summary record per chapter is invalid only when that chapter's check, track or text changes, and the rest stay valid. It is also what the chapter list needs during a session, not only at start. So: per-chapter records, not one snapshot.
- **Key.** Size and modified time alone would miss an edit that keeps both (the stale waveform of [#3794](https://github.com/countrymanprime/narration-studio/pull/3794) is that case for audio). The host already has the right key for audio-derived data: `evidence.Identify` (size, modified time and a hash of three 64 KiB samples) with `CacheEntryKey` (analyzer id, analyzer version, parameter hash) in [internal/evidence](../../src/studio/desktop/internal/evidence/cache.go). A summary of a recording check is keyed by the ledger record id, the result file's size and modified time, and a summary version; the ledger's own fingerprints already decide whether the check is current for the saved project.
- **Staleness and corruption.** A record whose key does not match, whose version is unknown or that fails to decode is discarded and rebuilt from the result; the chapter shows its checking state while that happens, never the old figure. The records are derived data: `resetDerived` removes them with the rest on manuscript replace.
- **Migration.** None. A project without records builds them on first read.
- **Contracts.** A file the app writes and reads back: a row in [data files](../reference/data-files.md) with location, schema, version and retention, and a test that writes and reads it. No binding changes.

### One fingerprint rule for derived data

The inventory for [#3778](https://github.com/countrymanprime/narration-studio/issues/3778), from reading the host.

| Derived value | Inputs | Lives | Recompute cost | Proposed |
| --- | --- | --- | --- | --- |
| Waveform peaks, 50 buckets a second, whole source | a WAV | Persisted, `analysis/cache/<hash>.json`, `CacheEntryKey` | 3.4 s per recorded hour ([EP0 spike](edit-and-proof-spike-ep0.md)) | Keep; add coarser levels; stop re-hashing and re-decoding the whole blob per item in `WorkspacePeaks` ([#3767](https://github.com/countrymanprime/narration-studio/issues/3767)) |
| Recogniser words per source | audio, model, language, hotwords | Persisted, same store | the most expensive value the app makes | Keep; prune last |
| Editing scan per played range | audio range | Persisted, same store | a range decode | Keep |
| Recording-check result | sidecar report | Persisted, `analysis/coverage/results/<recordId>.json`, about 800 KB a chapter | a recogniser run | Keep; add the per-chapter summary |
| Ledger records | analyzer runs | Persisted, one file per run, about 54 KB at 100 items | n/a | Keep; decode each once ([slice 1](#recommended-order)); retention in [#3761](https://github.com/countrymanprime/narration-studio/issues/3761) |
| Story Bible | manuscript, sidecar spans | Persisted, keyed by the manuscript's SHA-256 | a build | Keep; hold the decoded document while the file is unchanged |
| Recorded fractions, recorded-through, check state per chapter | ledger, results, `.rpp`, manuscript | Recomputed per read | 3.6 s, 16.4 s per read | Persist as per-chapter summary records |
| Stage recommendations, Production overview | the chapter list, decisions, evidence | Recomputed per read | 65 ms, 142 ms once the chapter list is cheap | Leave computed |
| Findings list, summary, counts | every findings file, `review.json` | Recomputed per read | 115 to 419 ms | Hold decoded in memory while the folder is unchanged; persist nothing new |
| Pickups list | pickup file, findings, per-chapter check state | Recomputed per read | 5.5 s, 25 s | Reads the summary records |
| `.rpp` parse | the `.rpp` | Memory, 4 entries, path + modified time + size | 29 to 141 ms | Leave in memory; a persisted copy would save one parse per start |
| Manuscript parse and indexes | `manuscript.json` | Memory, 1 entry | 7 to 23 ms | Leave in memory |
| Source identity of each audio file | the file | Memory, in the coverage service only; ten other call sites hash on every call | three 64 KiB reads per file | One shared in-memory cache |
| Take evidence (RMS, noise floor, pauses) | a take's range | Memory, 512 entries | a range decode per take | Persist in the evidence cache under the same key as the editing scan |
| Delivery measurement and diagnostics | the chosen files | Memory, the job's state | 58.8 s per 60 minute file ([EP0 spike](edit-and-proof-spike-ep0.md)) | Persist per file under `CacheEntryKey` |

- The helper exists for audio sources. What is missing is the same rule for a project file (`manuscript.json`, the `.rpp`, a result file) as the input, and one place that builds a key. Ten keying schemes are in use across the host and `hashParts` is copied in three packages.
- Six derived stores have no size bound: `analysis/cache/` (`CacheStore.Prune` has no caller), `analysis/ledger/` (`LedgerStore.Retain` has no caller), `analysis/coverage/results/`, the findings files, the TTS previews and the Transcript Compare files. A bound has to be per kind and ordered by recompute cost: peaks first, recogniser words last. Oldest-first across the store would delete transcripts to keep peaks.

### An embedded store against plain files

From the [storage engine spike](storage-engine-spike.md) at 35 chapters: opening the project 536 ms from JSON against 22 to 24 ms from SQLite, a findings query 217 ms against 5 ms, unresolved pickups 199 ms against 0.3 ms, accepting one finding 63 ms and 610 KiB written against 0.1 ms and 32 KiB.

- **Gain here.** The ranked costs are repeated decoding, not query speed. Decoding each ledger record once and holding findings in memory reach the same milliseconds without a second store. The spike's own JSON-only alternative (a per-chapter summary and a cached `readAll`) is this page's slices 2 and 5.
- **Cost.** A new dependency (the spike prefers the pure-Go `modernc.org/sqlite`; `CGO_ENABLED=0` is a standing constraint), an index that must be rebuilt (3.5 to 5.4 s) and kept in step with the JSON files, and the Windows rename failures the spike saw with concurrent readers.
- **Verdict.** Not now. Revisit if, after slices 1 to 5, a cross-chapter query still costs more than 100 ms on a 40 hour book.

### Streamed parsing of the `.rpp` and the manuscript

| Measurement | 17 h | 40 h | 300 tracks |
| --- | --- | --- | --- |
| `.rpp` size, items | 1.73 MB, 4,400 | 4.06 MB, 10,300 | 11.87 MB, 30,000 |
| `tracks.Parse` | 28.8 ms | 52.1 ms | 141 ms |
| Allocations, bytes allocated | 165,000, 20.6 MB | 385,000, 48.3 MB | 1,120,000, 141 MB |
| A line scan for track GUID and name, item position and length | 2.4 ms | 5.0 ms | 14.9 ms |

- **Gain.** 26 ms at 17 h and 126 ms at 300 tracks, once after each `.rpp` save; an unchanged file already costs one `stat`. `ChapterTrackLinks` also spends 19 % of its 118 ms at 40 h in `os.Stat` of every item's source, on every read.
- **Cost.** The scan reads less than the tree parse does (takes, sources, regions), so it is a second reader of the same format, or a rewrite of `tracks.Parse` to build less.
- **Verdict.** Low. Remove the per-read stats first. The manuscript decode is 7 to 23 ms once per start and needs nothing.

### Pre-warming at app start and on idle

The host is configured in about 5 ms and then idle for about 1.4 s while the window opens (on this rig). In that window it can fill what the first page will ask for: the manuscript parse (7 to 23 ms), the `.rpp` parse (29 to 52 ms), the ledger (27 ms at 17 h, 58 ms at 40 h, read once) and the per-chapter summaries.

- **Gain.** After slices 1 and 2, the first chapter list is answered from memory instead of paying about 100 to 200 ms at 44 chapters.
- **Parallel workers.** Evaluating every chapter's check with 4 workers instead of 1: 766 ms against 2,450 ms at 17 h, 3,610 against 9,880 at 40 h (2.7 to 3.2 times faster). That is the right tool for a cold rebuild of the summaries, not for each read.
- **Risk.** Work started before the page asks must not hold a lock the first page read needs ([host binding concurrency](../architecture/host-binding-concurrency.md)); it runs through `goBackground` and reads through the same caches.
- **Verdict.** After slices 1 and 2; it has nothing useful to warm before them.

### Layered rendering

Shell and chapter index first, then the per-chapter figures.

- **Gain.** With `paragraphIds` gone the chapter index is 3.6 KB at 17 h and answers in under 1 ms, so Production can draw its rows before the recorded figures arrive. As built this would turn a 14 s blank into rows that fill in over 14 s; after slices 1 and 2 the figures arrive within about 200 ms and layering matters only on a cold rebuild.
- **Rules it has to keep.** Each row reserves the space of its figures, so nothing moves and no button is covered when they arrive ([interaction feedback](../architecture/interaction-feedback.md)); a figure that has not arrived shows the loading state, never the last session's value.
- **Verdict.** Build the read split in the host (slice 4) and let [#3749](https://github.com/countrymanprime/narration-studio/issues/3749) decide the page side with its own measurements.

### List virtualization

From [#3254](https://github.com/countrymanprime/narration-studio/issues/3254): windowing the Production table from 30 rows instead of 150 took a 40 hour cold load from 1,141 to 840 ms and warm from 388 to 253 ms, did nothing at 17 hours, and loses the browser's find-in-page over hidden rows. Today's profile agrees: at 103 chapters Production's warm 661 ms is rendering and layout of 5,015 nodes.

- **Verdict.** A 135 ms gain at 40 hours only. Low; [#3766](https://github.com/countrymanprime/narration-studio/issues/3766) has the Script page, where 4,822 nodes cost 517 ms warm.

### Code splitting and bundle size

A scratch build with the 13 pages behind `React.lazy` and default chunking, cold at 40 h, median of 7:

| Page | First paint, one bundle | First paint, split | Last answer, one bundle | Last answer, split | Script requests |
| --- | --- | --- | --- | --- | --- |
| Delivery | 432 ms | 340 ms | 627 ms | 829 ms | 3 → 52 |
| Production | 456 ms | 340 ms | 973 ms | 1,109 ms | 3 → 69 |
| Script | 468 ms | 372 ms | 1,386 ms | 1,416 ms | 3 → 65 |
| Booth | 508 ms | 392 ms | 1,149 ms | 918 ms | 3 → 75 |

- **Gain.** 90 to 115 ms of first paint. Time to the last answer does not improve with default chunking, because 50 to 80 small requests replace 3. Module evaluation stays at 150 to 200 ms either way: most of it is shared code. About 150 ms of the start is the API client building its Zod schemas at import.
- **Verdict.** Low, and only with grouped chunks. [#3769](https://github.com/countrymanprime/narration-studio/issues/3769) owns it; the 1.4 s on the real host is mostly the window and web view, which this does not touch, and WebView2 on Windows is not measured.

### Host-side worker parallelism

- Calling a page's reads at once is 0.6 to 1.0 times the in-order time: the reads share locks and the same files. The real app shows the other side: three identical chapter-list reads at once take 12 to 13 s each against 3.6 s alone.
- **Verdict.** Parallel reads do not fix a read that does the same work three times. Coalesce identical reads in the host (one computation, three answers) as part of slice 1's cache, and use workers only for the cold summary rebuild.

### Binary or compressed wire

The five largest answers at 40 h:

| Answer | JSON | gzip -1 (time) | zstd fastest (time) | `json.Marshal` | Encoding the JSON again as a string |
| --- | --- | --- | --- | --- | --- |
| `FindingsList({})` | 13.74 MB | 1.80 MB (48 ms) | 1.45 MB (30 ms) | 78 ms | 24 ms, 15.37 MB |
| `FindingsList(transcript)` | 6.14 MB | 0.69 MB (16 ms) | 0.60 MB (11 ms) | 41 ms | 12.7 ms, 6.90 MB |
| `PickupsList` | 3.99 MB | 0.80 MB (18 ms) | 0.71 MB (13 ms) | 14.5 ms | 6.8 ms, 4.22 MB |
| `GuideEntities` | 3.36 MB | 0.90 MB (18 ms) | 0.74 MB (14 ms) | 12 ms | 4.7 ms, 3.60 MB |
| `FindingsList(audio_quality)` | 3.07 MB | 0.36 MB (11 ms) | 0.31 MB (5.5 ms) | 22 ms | 7.1 ms, 3.46 MB |

- Every binding returns its JSON as a string, which Wails encodes again: 6 to 12 % more bytes and 30 to 50 % more encoding time.
- **Gain.** The call stays inside one process, so there is no network for compression to save; it would add 11 to 48 ms of host time and a decompression step in the page. The cost of these answers is that they are built and parsed at all: 13.7 MB of findings for a page that shows one chapter's.
- **Verdict.** No compression and no binary format. Send less: a findings read by chapter or by page, counts from the summary, the Story Bible's entity list without fields the page does not draw. Waveform peaks are the one payload where a binary form is worth measuring, in [#3767](https://github.com/countrymanprime/narration-studio/issues/3767).

### Memory budget

| | 1 h | 17 h | 40 h | 300 chapters |
| --- | --- | --- | --- | --- |
| Host heap in use after every page's reads | 6.6 MB | 14.6 MB | 27.4 MB | 39.4 MB |
| Host resident memory, peak | 67, 73 MB | 99, 126 MB | 125, 222 MB | 161, 212 MB |
| Bytes allocated by that one pass | 0.13 GB | 8.1 GB | 37.5 GB | n/a |
| Page JS heap | 11 to 20 MB | 16 to 25 MB | 23 to 34 MB | n/a |

- Steady memory is small. The peak is garbage from repeated decoding and falls with slices 1 and 2.
- **Budget for the new caches.** The slices add three held sets: decoded ledger records (2.4 MB on disk at 17 h, 5.6 MB at 40 h), summary records (under 1 MB) and decoded findings (7.9 MB on disk at 17 h, 18.5 MB at 40 h). Their size in memory is not measured; findings are the largest and are dropped when the project closes.

## Recommended order

Each slice is one pull request. Gains are for 44 chapters, then 103, with a recording check on every chapter. "Measured" is a scratch build; "expected" is derived from the profile and stated as such.

| # | Slice | Gain | Files, contracts | Issue |
| --- | --- | --- | --- | --- |
| 1 | Decode each ledger record once while its file is unchanged; answer identical reads in flight from one computation | **Measured:** chapter list 3.6 → 0.78 s, 16.4 → 1.97 s, 111 → 3.8 s at 300 chapters; pickups list 5.5 → 1.3 s, 25 → 3.4 s; sync state 1.85 → 0.40 s, 8.0 → 1.1 s | In memory only. A test that counts decodes | [#3801](https://github.com/countrymanprime/narration-studio/issues/3801) |
| 2 | A per-chapter summary record of a recording check (counts, paragraph lines, recorded-through), keyed by record id, result size and modified time, and a version; one evaluation per chapter-list read instead of two | **Expected:** chapter list 0.78 → about 0.1 to 0.2 s, 1.97 → about 0.3 to 0.5 s (72 % of the remaining profile is result decoding, half of it the second pass) | A new derived file: data-files row, schema, version, discard on mismatch | [#3802](https://github.com/countrymanprime/narration-studio/issues/3802) |
| 3 | Seed recording checks, findings and a Story Bible in `seed.py`, and commit the host read benchmark with a budget per binding | Keeps 1 and 2 from regressing; makes the real-host rig show the owner's case | Scripts and a Go benchmark; no app change | [#3803](https://github.com/countrymanprime/narration-studio/issues/3803) |
| 4 | The pickups list and chapter sync state read the summary records; the chapter list answers without `paragraphIds` | **Expected:** pickups list 1.3 → under 0.2 s; chapter-list answer 64.8 → about 14 KB | A binding changes shape: contract row, golden, mock, `hostAPIVersion` | [#3804](https://github.com/countrymanprime/narration-studio/issues/3804) |
| 5 | Hold decoded findings in memory while the findings folder is unchanged; answer the summary from counts; read findings by chapter on Proof | **Expected:** summary 115 → under 5 ms; Proof moves about 0.2 MB instead of 11.8 MB | In memory; the list binding gains a filter the page uses | [#3805](https://github.com/countrymanprime/narration-studio/issues/3805) |
| 6 | One key builder for derived files (audio source or project file, algorithm version, parameters), a size bound and a prune order per kind, one shared source-identity cache | Disk stays bounded; a second start reuses what the first computed; removes ten per-call file hashes | `internal/evidence`; data-files rows gain a bound | [#3778](https://github.com/countrymanprime/narration-studio/issues/3778), [#3761](https://github.com/countrymanprime/narration-studio/issues/3761) |
| 7 | Fill the manuscript, `.rpp`, ledger and summaries in the background at start; rebuild missing summaries with 4 workers | **Expected:** the first chapter list from memory; a cold rebuild 2.7 to 3.2 times faster | None | [#3806](https://github.com/countrymanprime/narration-studio/issues/3806) |
| 8 | Hold the decoded Story Bible and the settings files while unchanged; stop the per-read `stat` of every item source | **Expected:** 48 → about 12 ms per Story Bible read; 63 opens of `settings.json` → 1 | In memory | [#3807](https://github.com/countrymanprime/narration-studio/issues/3807) |
| 9 | Page side: one read of each source per page, layered Production rows, windowing, grouped chunks | Measured in their own issues | See each | [#3658](https://github.com/countrymanprime/narration-studio/issues/3658), [#3749](https://github.com/countrymanprime/narration-studio/issues/3749), [#3766](https://github.com/countrymanprime/narration-studio/issues/3766), [#3767](https://github.com/countrymanprime/narration-studio/issues/3767), [#3768](https://github.com/countrymanprime/narration-studio/issues/3768), [#3769](https://github.com/countrymanprime/narration-studio/issues/3769) |

Not recommended now: per-chapter manuscript files, one whole-book snapshot, an embedded database, a streamed `.rpp` parser, compression or a binary wire format. Each is measured above and each gains less than slice 1 alone.

Rules every slice keeps:

- A stored value is used only when its key matches the inputs it was made from; otherwise it is discarded and rebuilt, and the page shows the loading state for that value, not the old one.
- A cache names what invalidates it and has a test that counts reads ([#3560](https://github.com/countrymanprime/narration-studio/issues/3560)).
- A new file has a row in [data files](../reference/data-files.md), a schema, a version and a retention rule.
- The mock backend gets the same shape first, behind the port.

## Not measured

- **Windows and the owner's machine.** Every number is from a Linux container. File opens are slower on Windows with Defender on, WebView2 starts differently from WebKitGTK, and the owner's book has its own number of checked chapters and items per chapter. The owner's `run.jsonl` with `General.debug_logging` on gives the same `ui.call.ok` lines used here.
- **A partly checked book.** Cost 1 grows with checked chapters × ledger records, including records of earlier checks and of other analyzers. A book with 10 checked chapters of 44 pays less than the table; a book checked several times pays more.
- **A live DAW.** No REAPER was running, so `PickupsCount`, live track reads and the bridge are outside these numbers; they are in [REAPER bridge performance](reaper-bridge-performance.md).
- **Audio.** Waveform peaks, take evidence and delivery measurement costs are quoted from earlier pages, not re-measured.
- **The 300-chapter project** has one run, and four of its pages were not run as pages because one chapter-list read takes 111 s.
- **Slices 2, 4, 5, 7 and 8** have expected gains, not measured ones.
