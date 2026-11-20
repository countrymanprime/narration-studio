# Performance architecture for the pages that are not audio or DAW work

**Measured 2026-11-20** on `main` at `710bd32`. Issue: [#3751](https://github.com/countrymanprime/narration-studio/issues/3751), with the derived-data rule of [#3778](https://github.com/countrymanprime/narration-studio/issues/3778). **Question:** where does the time go when a page or the app opens on a 1 hour, 17 hour, 40 hour and 300-chapter book, and which changes to how the book and its state are stored, read and drawn remove the most waiting?

**Answer in one paragraph.** The waiting is not in the file layout, the wire format or the size of the script bundle. It is in four host reads that every page makes (the chapter list, the Production overview, the pickups list and the chapter sync state). Each evaluates every checked chapter, and each evaluation decodes the whole analysis ledger twice; the chapter list then decodes every stored recording-check result, and does all of it twice per read. On a 17 hour book with a recording check on each of its 44 chapters, one chapter-list read costs 3.6 s and the real app's Production page keeps reading for 28 to 63 s after launch; at 103 chapters the first chapter list arrives 60 s after launch. A scratch build that decodes each ledger record once brings the chapter list to 0.78 s at 44 chapters; one pass per read and a small per-chapter summary of each result remove most of what is left at 44 and 103 chapters. Splitting the manuscript into per-chapter files, an embedded database, compression and code splitting each measure as small next to that. The order of work is in [Recommended order](#recommended-order).

## Method

All numbers are from one cloud container: 4 vCPU Intel Xeon at 2.10 GHz, 15 GiB RAM, Linux 6.18 (Firecracker), ext4, Go 1.27.3, headless Chromium, WebKitGTK 2.52.6 under Xvfb. Windows is the only supported platform and is not measured here; see [Not measured](#not-measured).

- **Book sizes.** 9,000 words an hour and 3,500 words a chapter, the scale `fixtures/bookSize.ts` uses: 1 h is 3 chapters, 17 h is 44 chapters (154,900 words), 40 h is 103 chapters (362,600 words). A fourth project has 300 short chapters (158,400 words) for the many-chapters case.
- **Mock pages.** `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/opt/pw-browsers/chromium node scripts/dev/page-bench.mjs --hours 1,17,40 --runs 5` on the production mock build (`pnpm --dir src/studio/ui run build:mock`). Cold is a fresh browser context on the page's address; warm is a click from another page. The mock backend answers from memory, so these numbers hold the page's own cost and none of the host's. The mock has no 300-chapter size.
- **Page start split.** A Chrome trace of a cold load (navigation timing, `v8.evaluateModule`, first contentful paint, the start of the first host call), median of 7, at 40 h.
- **Page CPU split.** A CPU profile of a cold and a warm load on an un-minified production build, self time grouped by the module a function came from. Profiling inflates totals; read the shares, not the milliseconds.
- **Host reads.** Seeded project folders in the host's real layout: `scripts/dev/real-app/seed.py --chapters N --items-per-track 100` for the manuscript, a `.rpp` with one linked track of 100 items per chapter and the links; then, through the host's own code, a Story Bible (`guide.Build`), one complete recording check per chapter (`CoverageStart` with a stand-in sidecar that reports one token per word, so the ledger record and the stored result go through the real write path), findings at 40 per 1,000 words with 45 % decided, marks at 15 per 1,000 words, a pickup list and script prep. A Go test builds a `Host` on the folder the way `ServiceStartup` does (without the background loops) and calls each read binding: the first call in a fresh process (cold), then more calls for a warm median.
- **Run counts.** 5 fresh processes for 1 h and 17 h, 3 for 40 h, 1 for 300 chapters. The warm median is over 9 calls, 3 when a call takes over 1 s, 1 over 5 s and none over 30 s; so the warm figures of the four slow reads at 40 h, and of the pickups list at 17 h, are one call per process. The pass with the operating system's file cache dropped is one run. The scratch-build figures are one process per project.
- **Real app start.** The built host started by `scripts/dev/real-app/start-host.sh` on the same seeded folders with `NARRATION_DEBUG=1`, no DAW running; times are from the launch command to the `ui.call.ok` lines of `run.jsonl`. 3 starts each for no project, 1 h and 17 h; 2 for 40 h. The landing page is Production.
- **Reused numbers.** Lane switches and bridge round trips through a real REAPER are in [REAPER bridge performance](reaper-bridge-performance.md) (a lane switch about 105 ms on Linux and 120 to 209 ms on Windows, flat from 0 to 5,000 items). The embedded-store numbers are from the [storage engine spike](storage-engine-spike.md). Repeated page reads are counted in [#3658](https://github.com/countrymanprime/narration-studio/issues/3658).
- **Units.** KB and MB are 1,000 and 1,000,000 bytes. The mock benchmark prints KiB and its table says so.

The seeding test, the timing test and the start script were scratch files and are not in the repository; [slice 2](#recommended-order) commits a version of them, and until it does the host numbers cannot be re-run from the repository. `scripts/dev/real-app/seed.py` on its own writes no recording checks, findings or Story Bible, which is why the real-host figure in [#3254](https://github.com/countrymanprime/narration-studio/issues/3254) (938 ms for the first chapter-link read at 44 chapters) does not show the cost found here.

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

- A ledger record's size follows the items on the chapter's track: about 54 KB at 100 items. A result's size follows the chapter's words: about 800 KB at 3,500 words, 143 KB in the 300-chapter project.
- The seed is an upper bound in one way (every chapter is checked and current) and a lower bound in another (one ledger record per chapter and one analyzer; a real project also keeps the records of earlier checks and of the editing and proofing analyzers, since nothing prunes the ledger).
- 100 items per track is an assumption; the ledger cost is linear in it.
- Not seeded: bookmarks, notes, edit logs, the passage map, voice tracks, production sessions, stage decisions, the transcript and waveform cache, real audio. The manuscript text is pseudo-words, so compression ratios are indicative.

## Baseline

### App start, real host

Seconds after the launch command, cold (a new process each time; a warm start, the app reopened while the system still holds its files, was not timed separately because every start here had a warm file cache). "First answer" is the first host call the page gets back; the app shell is drawn by then.

| Project | First answer | Chapter list first answers | Pickups list first answers | Reads stop |
| --- | --- | --- | --- | --- |
| None | 1.5 to 1.7 | n/a | n/a | 2.5 to 2.7 |
| 1 h | 1.4 to 1.7 | 1.9 to 2.5 | 2.1 to 2.5 | 2.4 to 7.9 |
| 17 h, every chapter checked | 1.5 to 1.7 | 13.6 to 14.6 | 23 to 25 | 28 to 63 |
| 40 h, every chapter checked | 1.5 to 1.7 | 59.7 | 74 | after 110 |
| 300 chapters | not run | | | |

- The process writes its first log line 0.11 s after the launch command. Inside it `NewHost`, `configureLocked` and `buildAssetRegistry` take about 5 ms in total at every book size. The remaining 1.4 s before the first answer is the window, WebKitGTK and the script bundle, under software rendering.
- Calls in the first set of reads: 13 with no project, 52 to 59 at 1 h, 96 to 140 at 17 h.
- At start the page sends `ManuscriptChapters` three times, `ChapterSyncState` twice, `PickupsList` twice and `ProductionOverview` once at the same moment. On the 17 h project each chapter-list call takes 12.0 to 12.9 s against 3.6 s alone; on the 40 h project 58 s against 16.4 s, and each sync-state call 33 s against 8.0 s.
- The reads repeat after the first set (a focus or event refresh), which is why the page keeps working for 28 to 63 s.
- Only the last 40 h run's `run.jsonl` was kept; the other rows are from the values printed during the runs.

### Host reads, one call in a fresh process

Milliseconds, cold | warm, and the size of the answer.

| Binding | 1 h | 17 h | 40 h | 300 chapters (cold) |
| --- | --- | --- | --- | --- |
| `PickupsList` | 94 \| 58 | 5,475 \| 5,443 (1.72 MB) | 25,133 \| 25,193 (3.99 MB) | 164,927 |
| `ManuscriptChapters` | 68 \| 34 | 3,556 \| 3,627 (64.8 KB) | 16,435 \| 16,341 (151 KB) | 110,640 |
| `ProductionOverview` | 80 \| 33 | 3,627 \| 3,616 (15 KB) | 15,195 \| 15,850 (34 KB) | 110,310 |
| `ChapterSyncState` | 57 \| 13 | 1,852 \| 1,809 (18 KB) | 7,985 \| 7,967 (42 KB) | 56,892 |
| `FindingsList({})` | 14 | 199 \| 183 (5.86 MB) | 419 \| 401 (13.74 MB) | not run |
| `FindingsSummary` | not kept | 115 \| 107 (2 KB) | 295 \| 211 (4 KB) | not run |
| `WorkspaceAlignment(chapter)` | 33 \| 15 | 123 \| 69 (583 KB) | 224 \| 124 (582 KB) | not run |
| `StageRecommendations` | not kept | 65 \| 17 | 142 \| 29 | not run |
| `ChapterTrackLinks` | not kept | 64 | 147 | not run |
| `GuideEntities` | not kept | 48 | 107 (3.36 MB) | not run |
| `GuideDialogueCues` | not kept | 42 | 85 (693 KB) | not run |
| `MarksList` | not kept | 37 | 168 | not run |
| `Bootstrap` | 1.1 \| 0.8 | 9.3 \| 7.3 | 28 \| 22 | 34 \| 12 |
| `ManuscriptParagraphs(chapter)` | not kept | 12 \| 0.2 | 20 \| 0.1 | 9.3 \| 0.06 |
| `SystemSettingsForScope` | 8 to 11 cold, 6 to 9 warm, at every size | | | |

- Warm equals cold for the first four: nothing they compute is kept between calls.
- With the operating system's file cache dropped (one run), the first four stay inside their warm range: file reading is at most 0.5 % of their time. `FindingsList({})` rises to 311 ms at 17 h and 703 ms at 40 h, `Bootstrap` to 21 and 39 ms, `GuideEntities` to 82 ms at 17 h.
- `PickupsCount` needs a live bridge and `WorkspacePeaks` needs audio; neither is in the table. "Not kept" cells were measured but their values are only in the scratch output.

### Host reads by page

Milliseconds for a page's read bindings called one after another, cold | warm; then all at once, cold; then the bytes returned. The 300-chapter project ran only the pages that do not start with a 111 s read.

| Page (reads) | 1 h | 17 h | 17 h at once | 40 h | 40 h at once | 300 chapters | Bytes, 17 h / 40 h |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Every page's shell (9) | 136 \| 109 | 9,540 \| 9,445 | 5,676 | 39,655 | 25,035 | not run | 1.81 / 4.16 MB |
| Production (11) | 117 \| 68 | 5,538 \| 5,501 | 3,820 | 23,524 \| 23,763 | 15,377 | not run | 5.97 / 13.97 MB |
| Schedule (3) | 79 \| 34 | 3,698 \| 3,657 | 3,807 | 15,136 \| 15,168 | 15,496 | not run | 24 / 43 KB |
| Pickups (4) | 108 \| 65 | 5,449 \| 5,544 | 5,775 | 24,711 \| 24,196 | 24,486 | not run | 1.72 / 3.99 MB |
| Proof (10) | 111 \| 90 | 987 \| 869 | 750 | 2,103 \| 1,898 | 1,557 | 1,509 \| 1,250 | 12.05 / 27.4 MB |
| Editing (10) | 53 \| 38 | 280 \| 247 | 208 | 591 \| 484 | 329 | 1,002 \| 828 | 0.77 / 0.81 MB |
| Booth (11) | 23 \| 21 | 193 \| 147 | 117 | 416 \| 363 | 215 | 160 \| 128 | 2.41 / 5.49 MB |
| Script (7) | 13 \| 11 | 150 \| 143 | 109 | 344 \| 350 | 229 | 157 \| 141 | 2.37 / 5.46 MB |
| Story Bible (7) | 13 \| 9 | 154 \| 115 | 116 | 360 \| 257 | 239 | 450 \| 153 | 1.77 / 4.07 MB |
| Settings (8) | 30 \| 25 | 104 \| 99 | 97 | 201 \| 177 | 203 | 90 \| 99 | 1.52 / 3.42 MB |
| Master & QC, Delivery (5) | 3 \| 1 | 3 \| 1 | 3 | 3 \| 1 | 3 | 3 \| 1 | 18 KB |

- The shell row is what every page pays before its own reads, because the layout reads the chapter list, the findings summary and the pickups list.
- Calling a page's reads at once takes 0.5 to 1.1 times the in-order time, and gains nothing on a page with one dominant read.
- **By stage.** For the four slow reads, file reading is at most 0.5 %, encoding the answer under 0.1 % (1.4 ms for the chapter list at 40 h), and the rest is JSON decoding inside the host ([below](#where-the-four-slow-reads-spend-their-time)). For the others at 40 h: `FindingsList({})` is 34 % decode, 29 % answer encode and 29 % garbage collection; `GuideEntities` 47 % decode and 25 % encode; `ChapterTrackLinks` 35 % `.rpp` parse and 26 % `os.Stat`; `Bootstrap` 76 % decode. The page's share (parse, validate, render) is not in these numbers; the mock tables hold it. A per-page split of one real page load into host, wire and page time was not measured.

### Pages on the mock backend

Milliseconds, cold | warm (`page-bench.mjs`, median of 5). "First change" is when the page's region first changes; "usable" is when no call is in flight and the page has been still for 200 ms.

| Page | First change, 1 h | 17 h | 40 h | Usable, 1 h | 17 h | 40 h | DOM nodes at 40 h |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Production | 580 \| 56 | 658 \| 0 | 627 \| 0 | 712 \| 153 | 992 \| 308 | 1,001 \| 450 | 5,015 |
| Script | 564 \| 0 | 611 \| 0 | 533 \| 0 | 803 \| 292 | 1,250 \| 431 | 1,247 \| 517 | 4,822 |
| Booth | 486 \| 315 | 568 \| 461 | 552 \| 305 | 1,076 \| 560 | 1,263 \| 622 | 1,148 \| 585 | 3,998 |
| Editing | 553 \| 310 | 698 \| 270 | 564 \| 237 | 850 \| 390 | 1,047 \| 359 | 843 \| 322 | 4,098 |
| Proof | 545 \| 0 | 640 \| 181 | 582 \| 0 | 749 \| 222 | 844 \| 223 | 791 \| 226 | 744 |
| Schedule | 527 \| 0 | 630 \| 0 | 542 \| 0 | 651 \| 112 | 763 \| 130 | 634 \| 131 | 259 |
| Story Bible | 539 \| 129 | 613 \| 140 | 567 \| 143 | 670 \| 167 | 795 \| 179 | 703 \| 160 | 488 |
| Pickups | 584 \| 143 | 609 \| 139 | 674 \| 92 | 714 \| 154 | 738 \| 153 | 799 \| 146 | 348 |
| Master & QC | 556 \| 106 | 587 \| 84 | 602 \| 83 | 663 \| 136 | 702 \| 138 | 737 \| 150 | 1,181 |
| Delivery | 572 \| 0 | 649 \| 0 | 537 \| 0 | 659 \| 127 | 749 \| 112 | 625 \| 119 | 650 |
| Settings | 654 | 539 | 570 | 844 | 685 | 705 | 585 |

A warm first change of 0 means the page changed in the same task as the click. The warm Settings cells printed `NaN` at every size: the benchmark's own step to reach Settings failed and is not diagnosed.

Host calls and KiB of answers, cold | warm:

| Page | 1 h | 17 h | 40 h |
| --- | --- | --- | --- |
| Production | 53 / 129 \| 39 / 83 | 53 / 268 \| 39 / 204 | 53 / 447 \| 39 / 358 |
| Script | 36 / 179 \| 21 / 131 | 36 / 214 \| 21 / 140 | 36 / 259 \| 21 / 152 |
| Booth | 62 / 151 \| 48 / 105 | 62 / 184 \| 49 / 119 | 62 / 227 \| 49 / 138 |
| Editing | 56 / 381 \| 41 / 334 | 56 / 414 \| 41 / 341 | 56 / 458 \| 41 / 351 |
| Proof | 41 / 143 \| 26 / 97 | 41 / 176 \| 26 / 112 | 41 / 220 \| 26 / 130 |
| Schedule | 27 / 87 \| 13 / 41 | 27 / 140 \| 13 / 76 | 27 / 210 \| 13 / 121 |
| Story Bible | 35 / 95 \| 21 / 49 | 35 / 129 \| 21 / 64 | 35 / 172 \| 21 / 82 |
| Pickups | 30 / 86 \| 14 / 35 | 30 / 119 \| 14 / 42 | 30 / 162 \| 14 / 51 |
| Master & QC | 29 / 95 \| 15 / 49 | 29 / 128 \| 15 / 64 | 29 / 172 \| 15 / 82 |
| Delivery | 28 / 92 \| 13 / 41 | 28 / 125 \| 13 / 56 | 28 / 168 \| 13 / 75 |
| Settings (cold) | 43 / 104 | 43 / 152 | 43 / 217 |

- The mock's answers are smaller than the real host's (447 KiB against 5.97 MB for Production at 40 h) because the mock book has no findings at scale.
- The JS heap after a collection is 11 to 20 MB at 1 h and 23 to 34 MB at 40 h.
- **Start split, 40 h.** First contentful paint is 400 to 510 ms (Delivery 432, Production 456, Script 468, Booth 508, Editing 420) and the first host call starts 330 to 450 ms after navigation, on every page and every book size. That time is fetching and compiling one 3.5 MB script (2.97 MB in the real build) and 165 to 200 ms evaluating its modules. It is 40 to 60 % of a cold page on the mock and does not depend on the book.
- **CPU split at 40 h.** Production warm, 661 ms busy: browser style, layout and paint 30 %, `react-dom` 25 %, the Production components 23 %. Script warm, 938 ms: `react-dom` 28 %, the Script components 25 %. Cold loads add about 150 ms in the API client's modules (building the Zod schemas at import) and 80 to 120 ms in the mock backend, which the real app does not run. Validating answers with Zod is 54 to 67 ms, 4 to 5 % of a cold load.

### Where the four slow reads spend their time

A CPU profile at 40 h: `coverage.currentReports` is 99 % of `ManuscriptChapters` (28.9 of 29.1 s over two calls) and `evidence.LedgerStore.All`, decoding ledger records with `json.Unmarshal`, is 87 %.

- `chapters` ([internal/manuscript/reader.go](../../src/studio/desktop/internal/manuscript/reader.go)) asks for the recorded fractions and then the recorded-through places; each runs `currentReports` ([internal/coverage/read.go](../../src/studio/desktop/internal/coverage/read.go)), so every chapter-list read makes two passes over the checked chapters. A single chapter's read (`reader.go`, `kind.go`) makes the same two passes.
- A pass lists the ledger once to find the checked chapters, then evaluates each one. `EvaluateChapter` ([internal/evidence/staleness.go](../../src/studio/desktop/internal/evidence/staleness.go)) lists the ledger twice, and `LedgerStore.List` answers by decoding every record file in the folder ([internal/evidence/ledger.go](../../src/studio/desktop/internal/evidence/ledger.go)). With N checked chapters and one record each, a chapter-list read makes 2 × (1 + 2N) scans of N records: 7,832 decodes at 44 chapters, 42,642 at 103, 360,600 at 300. A system-call trace at 3 chapters agrees: each ledger file is opened 28 times for two chapter-list reads.
- Each evaluation that finds a current check then decodes the chapter's stored result to read its present fraction and paragraph lines. The decoded-result cache holds 4 entries ([internal/coverage/results.go](../../src/studio/desktop/internal/coverage/results.go)), so a 44-chapter book decodes 35.4 MB twice per chapter-list read.
- Each evaluation also reads and decodes `chapter-track-map.json` (`MappingStore.List`) and lists the ledger folder again.
- `ProductionOverview` and `PickupsList` call the chapter list and inherit all of it; `PickupsList` adds its own evaluation per chapter. `ChapterSyncState` reaches the ledger scans through `coverage.ResultIn`.
- The same trace shows `settings.json` opened 63 times and `global-settings.json` 64 times for three bindings.
- One pass over every page's reads allocates 8.1 GB at 17 h, 37.5 GB at 40 h and 277 GB at 300 chapters, almost all of it this decoding.

Each finished recording check queues a `chaptersync:state` read, so checking 103 chapters in a row left the host above 100 % CPU for more than 10 minutes after the last check had been written.

### The same reads on a scratch build

One change: `LedgerStore.All` keeps each decoded record while its file's size and modified time are unchanged. Milliseconds, cold, one process.

| Binding | 17 h as built → scratch | 40 h | 300 chapters |
| --- | --- | --- | --- |
| `ManuscriptChapters` | 3,556 → 778 | 16,435 → 1,973 | 110,640 → 3,840 |
| `ProductionOverview` | 3,627 → 837 | 15,195 → 2,072 | 110,310 → 3,374 |
| `PickupsList` | 5,475 → 1,279 | 25,133 → 3,426 | 164,927 → 5,088 |
| `ChapterSyncState` | 1,852 → 401 | 7,985 → 1,124 | 56,892 → 2,097 |

What is left in `ManuscriptChapters` on the scratch build, from profiles:

- **At 103 chapters:** decoding stored results is 71 % (4.38 of 6.17 s over three calls); the two passes are 3.13 s and 2.91 s.
- **At 300 short chapters:** decoding results is 21 % (1.45 of 6.98 s over two calls). `EvaluateChapter` is 56 %: the ledger folder listed and each file stat'ed twice per chapter (`os.Lstat` 1.0 s, `os.ReadDir` 0.65 s), and `chapter-track-map.json` decoded once per chapter (1.1 s). Garbage collection is 18 % of all samples.

## The ten largest costs

Ranked by seconds of waiting each time the narrator meets the cost, on a book whose chapters have recording checks; a cost met on every page ranks above an equal one met on one page. Times are for 44 chapters, then 103.

| # | Cost | Measured | Where the narrator meets it |
| --- | --- | --- | --- |
| 1 | The ledger is decoded twice per checked chapter, in two passes per chapter-list read | chapter list 3.6 s, 16.4 s (111 s at 300 chapters); overview the same; pickups list 5.5 s, 25 s; sync state 1.85 s, 8.0 s | Every page (the shell reads the chapter list and the pickups list); a check that finishes queues a sync-state read |
| 2 | The same slow read is sent two or three times at once, and again on refresh | each call 3.4 to 3.5 times slower: 12 to 13 s against 3.6 s; 58 s against 16.4 s. Reads continue for 28 to 63 s | App start and every page change ([#3658](https://github.com/countrymanprime/narration-studio/issues/3658)) |
| 3 | The window, the web view and one 3 MB script before any book data | 1.4 s to the first answer on this rig; 330 to 450 ms of it in Chromium is the script | Every app start |
| 4 | Every stored check result is decoded, twice, per chapter-list read | 0.78 s, 1.97 s per read with cost 1 fixed; 71 % of it at 103 chapters | Every page, once cost 1 is gone |
| 5 | The ledger folder is listed and the link file decoded once per chapter | about 2 s of the 3.8 s left at 300 chapters with cost 1 fixed | Books with many chapters |
| 6 | The pickups list is built and sent whole to show a count | 1.72 MB, 3.99 MB on every page; 1.3 s, 3.4 s with cost 1 fixed | Every page (the shell), Pickups |
| 7 | Findings are decoded from every file for each list, summary or single finding | list 199 ms, 419 ms; summary 115 ms, 295 ms for a 2 KB answer; Proof moves 12.05 MB, 27.4 MB | Proof, the shell's summary, Production |
| 8 | Whole-book lists are drawn in full | Production 308 ms, 450 ms and Script 431 ms, 517 ms warm; 5,015 and 4,822 DOM nodes at 103 chapters | Production, Script |
| 9 | The Story Bible is decoded per read and sent whole | 48 ms, 107 ms per read, two or three reads a page; 3.36 MB at 40 h | Script, Story Bible, Booth, Editing, Settings |
| 10 | The `.rpp` is parsed in full after each save, and every item's file is stat'ed on each read | parse 29 ms, 52 ms, 141 ms at 300 tracks; `ChapterTrackLinks` 64 ms, 147 ms | The first read after each REAPER save |

Costs 1 and 2 are the seconds. With them fixed, every cost below is under 2 s at 103 chapters, and costs 9 and 10 are under 150 ms each.

## Options

Each option is scored on gain, cost, risk of stale or corrupt data, migration of existing projects, and effect on the wire contracts.

### Granular files with an index

The proposal: a chapter index file, one text file per chapter, and separate files for attributions, links and peaks, each with a version and hash header.

| Measurement | 17 h | 40 h | 300 chapters |
| --- | --- | --- | --- |
| `ManuscriptChapters` answer | 64.8 KB | 151 KB | 145 KB |
| Share of that answer that is `paragraphIds` | 78 % | 78 % | 35 % (`recordedThrough` 24 %) |
| A chapter index (id, title, word count, status): size, read + decode + encode | 3.6 KB, 0.20 ms | 8.1 KB, 0.26 ms | 23.2 KB, 0.80 ms |
| One chapter's paragraphs from `manuscript.json`: cold, warm | 11.1 ms, 0.18 ms | 17.9 ms, 0.11 ms | 7.5 ms, 0.02 ms |
| One chapter's paragraphs from its own file | 26 KB, 0.21 ms | 26 KB, 0.17 ms | 3.9 KB, 0.03 ms |
| `manuscript.json` read, decode | 0.9 ms, 7.3 ms | 1.9 ms, 23.4 ms | not kept |

- **Gain.** Splitting the manuscript text saves 11 to 18 ms once per app start; after that the in-memory parse answers a chapter in 0.1 to 0.2 ms. Attributions (the Story Bible, 28 to 65 ms to decode), links (`chapter-track-map.json`) and peaks (`analysis/cache/`) are separate files today; their cost is being decoded per read, which a held copy fixes ([slice 9](#recommended-order)), not a further split.
- **Cost.** A second copy of the manuscript beside the source of truth, an index to keep in step with it, and a write path for every importer and editor of the text.
- **Staleness and corruption.** A per-chapter file can disagree with `manuscript.json` after a crash between the two writes; every reader would need the index's hash check. A version and hash header costs under 0.1 ms to read and 0.9 ms (17 h) to 1.9 ms (40 h) to verify by hashing the manuscript.
- **Migration.** Every existing project would need its chapter files written on first open.
- **Contracts.** New files with schemas and data-files rows; no binding change.
- **Verdict.** Not the manuscript text. Take the index idea at the wire: `ManuscriptChapters` without `paragraphIds` is the chapter index ([slice 6](#recommended-order)), and the per-chapter derived figures become small records (the next option).

### A persisted derived-state snapshot, keyed by its inputs

| Measurement | 1 h | 17 h | 40 h | 300 chapters |
| --- | --- | --- | --- | --- |
| Input files of the chapter list, overview and recommendations (count, bytes) | 13, 3.0 MB | 95, 41.0 MB | 213, 95.7 MB | 607, 72.5 MB |
| Snapshot of those three answers | 11 KB | 116 KB | 268 KB | 479 KB |
| Validate by size and modified time of every input | 0.01 ms | 0.20 ms | 0.16 ms | 0.50 ms |
| Validate by SHA-256 of every input | 2.7 ms | 39 ms | 83 ms | 71 ms |
| Read and decode the snapshot | 0.04 ms | 0.49 ms | 0.88 ms | 1.7 ms |
| Recompute the three answers cold, as built | 88 ms | 7,460 ms | 31,400 ms | about 226,000 ms |

- **Gain.** A valid snapshot answers in under 1 ms plus its validation. Against the host as built that is 7.5 s at 17 h; against a host with costs 1, 4 and 5 fixed it is a few hundred milliseconds, once per app start.
- **Shape.** One whole-book snapshot is invalid whenever any of 95 inputs changes, and the `.rpp` changes at every REAPER save. The chapter list's answer also mixes values of two kinds. Some are pure functions of one stored result (its counts, its paragraph lines). Others are judged on every read against the saved project, the check parameters, the manuscript hash, the Booth reading file and recorded lengths (whether the check is current, the recorded-through place: `read.go`, `recordedthroughs.go`). Only the first kind can be stored without risking a stale figure. So: a small summary beside each stored result holding only what that result determines, and the judgement stays computed.
- **Alternatives to a summary file.** Counts in the ledger record (`LedgerRecord.Counts` exists) would carry the fraction but not the paragraph lines, and would grow the file every evaluation reads. Trimming the stored result breaks the alignment Editing reads. One summary file per project is rewritten on every check.
- **Key.** A result file is written once per ledger record and never rewritten, so the summary is keyed by the record id and a summary version, carries the record id inside and is verified on read the way `resultStore` verifies a result. No file time or size is trusted. This is weaker than #3778's general rule (size, modified time, content hash, algorithm version) only because the input cannot change; an input that can change needs the content hash.
- **Staleness and corruption.** A summary that is missing, has another version, names another record or fails to decode is discarded and rebuilt from the result inline (one decode, about 9.5 ms). It lives under the coverage folder, so `resetDerived` removes it with the results on manuscript replace or Clear.
- **Cost.** A second small file per check, written where the result is written (`run.go`, with the report in memory), and a lazy backfill for existing results.
- **Migration.** None. A project without summaries builds them on first read.
- **Contracts.** A file the app writes and reads back: a row in [data files](../reference/data-files.md) with location, schema, version and retention, and a test that writes and reads it. No binding changes.
- **Verdict.** Per-result summaries, [slice 3](#recommended-order). No whole-book snapshot.

### One fingerprint rule for derived data

The inventory for [#3778](https://github.com/countrymanprime/narration-studio/issues/3778), from reading the host. Costs are measured on this rig unless a source is named; sizes are per item at the 17 h scale.

#### Persisted today

| Derived value | Inputs | File and key | Recompute cost | Size | Proposed |
| --- | --- | --- | --- | --- | --- |
| Waveform peaks, 50 buckets a second, one resolution, whole source | a WAV | `analysis/cache/<hash>.json`; `CacheEntryKey` | 3.4 s per recorded hour ([EP0 spike](edit-and-proof-spike-ep0.md)) | 360 KB per recorded hour (same source) | Keep the store. The read path re-hashes the source and decodes the whole blob per item; fix in [#3767](https://github.com/countrymanprime/narration-studio/issues/3767), which also decides whether coarser levels are needed |
| Recogniser words per source | audio, model, language, hotwords | same store | a recogniser run; not measured here | up to 256 segments per source | Keep; prune last |
| Editing scan per played range | an audio range | same store, key includes the range | a range decode; not measured here | not measured | Keep |
| Recording-check result | the sidecar's report | `analysis/coverage/results/<recordId>.json`; record id | a recogniser run | about 800 KB a chapter | Keep; add the summary |
| Ledger records | analyzer runs | `analysis/ledger/<id>.json` | not recomputable; they are the record | about 54 KB at 100 items | Keep; decode once; fix the retention rule ([#3761](https://github.com/countrymanprime/narration-studio/issues/3761)) |
| Story Bible | manuscript, sidecar spans | `ManuscriptGuide/manuscript_guide.json`; SHA-256 of the manuscript | a build; sidecar timings in the [latency baseline](interaction-latency-baseline.md) | 2.29 MB | Keep; hold the decoded document |
| TTS previews | voice, text, pronunciation | `ManuscriptGuide/audio/tts/<sha256>.wav` | a synthesis | one WAV each | Keep; bound |
| Transcript Compare outputs | audio | `TranscriptCompare/diffs/`, session files; run id | a recogniser run | not measured | Keep; bound |

#### In memory only, rebuilt after every app start

| Derived value | Inputs | Cache | Recompute cost | Proposed |
| --- | --- | --- | --- | --- |
| `.rpp` parse | the `.rpp` | 4 entries; path, modified time, size | 29 ms (1.73 MB), 52 ms, 141 ms (11.9 MB) | Leave in memory: a persisted copy saves one parse per start |
| Manuscript parse and indexes | `manuscript.json` | 1 entry | 7 ms, 23 ms | Leave in memory |
| Decoded check results | result files | 4 entries | 9.5 ms each (800 KB) | Leave; the summary removes the whole-book reads |
| Source identity of each audio file | the file | the coverage service only; ten other call sites hash on every call | three 64 KiB reads per file; not timed | One shared in-memory cache |
| Take evidence (RMS, noise floor, pauses, breaths) | a take's range | 512 entries, cleared when full | a range decode per take; not timed | Persist in the evidence cache, keyed like the editing scan |
| Delivery measurement and diagnostics | the chosen files | the job's state | 58.8 s per 60 minute file ([EP0 spike](edit-and-proof-spike-ep0.md)) | Persist per file under `CacheEntryKey` |
| Live track list | the bridge | one answer, 10 s | a bridge round trip, 11 to 80 ms ([bridge performance](reaper-bridge-performance.md)) | Leave |

#### Recomputed on every read

| Derived value | Inputs | Recompute cost, 17 h, 40 h | Proposed |
| --- | --- | --- | --- |
| Recorded fractions, paragraph lines of current checks | ledger, results | inside the chapter list: 3.6 s, 16.4 s | The per-result summary |
| Whether a check is current; recorded-through place | ledger, `.rpp`, parameters, manuscript hash, reading file, lengths | inside the same reads | Stay computed; cheap once the ledger is decoded once |
| Recorded-through tokenization | a second, uncached decode of `manuscript.json` (`teleprompter.LoadBook`) | 7 ms, 23 ms per read plus tokenizing | Read through the manuscript cache |
| Stage recommendations, Production overview | chapter list, decisions, evidence | 65 ms, 142 ms beyond the chapter list | Leave computed |
| Findings list, summary, counts, single finding | every findings file, `review.json` | 115 to 419 ms | Hold decoded in memory while the folder is unchanged |
| Pickups list | pickup file, findings, per-chapter check state | 5.5 s, 25 s as built | Reads the shared evaluation; the shell asks for a count |
| Story Bible reads; its status | the guide file; SHA-256 of the manuscript per status call | 48 ms, 107 ms per read | Hold the decoded document and the hash while the files are unchanged |
| Settings lookup | up to three files per key | 8 to 11 ms per scope read; 63 opens for three bindings | Hold each scope's file while unchanged |
| `WorkspacePeaks` per item | alignment, `.rpp`, the peaks blob | not measured (needs audio) | [#3767](https://github.com/countrymanprime/narration-studio/issues/3767) |
| Manuscript search | the parse; every paragraph folded per keystroke | not measured | Leave until measured ([#3766](https://github.com/countrymanprime/narration-studio/issues/3766)) |

What the inventory says about the rule:

- **The helper exists for audio.** `evidence.Identify` returns a file's size, modified time and a hash of three 64 KiB samples; `CacheEntryKey` hashes the path, the size, that partial hash, the analyzer id, the analyzer version and a parameter hash, and leaves the modified time out ([internal/evidence/cache.go](../../src/studio/desktop/internal/evidence/cache.go), [identity.go](../../src/studio/desktop/internal/evidence/identity.go)). An edit that keeps the size and misses the three samples keeps the key; that was the stale waveform fixed in [#3794](https://github.com/countrymanprime/narration-studio/pull/3794).
- **Keys in use.** `CacheEntryKey`; `measure.Fingerprint` (size, modified time, full SHA-256); path + modified time + size in memory (`.rpp`, manuscript, results, take evidence, identity); byte equality (the held Story Bible); the manuscript's SHA-256 (Story Bible, script hash, check results); ledger fingerprints; the heartbeat change count (live tracks); a time limit (the DAW folder); a content-addressed name (TTS); a lower-cased word (online pronunciations). `hashParts` is copied in `internal/evidence/fingerprint.go`, `internal/coverage/params.go` and `internal/editing/util.go`.
- **What is missing** is the same rule with a project file as the input, and one place that builds a key. The summary of slice 3 puts its key helper in `internal/evidence` so the rule has one home from the start.
- **Bounds.** No size bound on `analysis/cache/` (`CacheStore.Prune` has no caller), `analysis/ledger/` (`LedgerStore.Retain` has no caller), `analysis/coverage/results/`, the findings files, the TTS previews or the Transcript Compare files. A bound has to be per kind and ordered by recompute cost: peaks first, recogniser words last; oldest-first across the store would delete transcripts to keep peaks.
- **`Retain` is not safe to call as written.** It keeps the newest record per analyzer and chapter whatever its outcome (`ledger.go`), while the evaluator uses the newest complete record and skips newer partial or failed ones (`staleness.go`). After a cancelled re-check it would delete the current complete record, the chapter would read as never checked, and the 800 KB result would be orphaned. The rule has to keep the newest complete record and remove the results of the records it drops.

Scores: **gain** is what a second start reuses (58.8 s per measured hour-long file, a range decode per take) and bounded disk; **cost** is one key builder and a prune pass; **staleness** is governed by the key, with the content hash required for any input that can change in place; **migration** none, old cache entries keep resolving or are recomputed; **contracts** data-files rows gain a bound, no binding changes.

### An embedded store against plain files

From the [storage engine spike](storage-engine-spike.md) at 35 chapters: opening the project 536 ms from JSON against 22 to 24 ms from SQLite, a findings query 217 ms against 5 ms, unresolved pickups 199 ms against 0.3 ms, accepting one finding 63 ms and 610 KiB written against 0.1 ms and 32 KiB. The spike recommended a derived, disposable SQLite index beside the JSON files.

- **Gain for these reads.** The costs ranked here are repeated decoding, not query speed. Decoding each ledger record once and holding findings in memory reach the same milliseconds without a second store; the spike's own JSON-only alternative (a per-chapter summary and a cached `readAll`) is slices 3 and 7.
- **Cost.** A new dependency (the spike prefers the pure-Go `modernc.org/sqlite`; `CGO_ENABLED=0` is a standing constraint) and an index that must be rebuilt (3.5 to 5.4 s) and kept in step with the JSON files.
- **Staleness and corruption.** The index is derived, so a mismatch is fixed by a rebuild; the risk is serving a query from an index that lags a JSON write.
- **Migration.** A rebuild on first open of each project.
- **Contracts.** None at the wire; a new file with a data-files row.
- **Verdict.** Not for reads, now. This page sets aside the spike's first recommendation for the read costs only. The spike's write costs (a 610 KiB rewrite to accept one finding, 1 s for a 20-decision undo) are not addressed by any slice here and remain its open case. Revisit if, after slices 1 to 7, a cross-chapter query still costs more than 100 ms on a 40 hour book.

### Streamed parsing of the `.rpp` and the manuscript

| Measurement | 17 h | 40 h | 300 tracks |
| --- | --- | --- | --- |
| `.rpp` size, items | 1.73 MB, 4,400 | 4.06 MB, 10,300 | 11.87 MB, 30,000 |
| `tracks.Parse` | 28.8 ms | 52.1 ms | 141 ms |
| Allocations, bytes allocated | 165,000, 20.6 MB | 385,000, 48.3 MB | 1,120,000, 141 MB |
| A line scan for track GUID and name, item position and length | 2.4 ms | 5.0 ms | 14.9 ms |

- **Gain.** 26 ms at 17 h and 126 ms at 300 tracks, once after each `.rpp` save; an unchanged file costs one `stat`. `ChapterTrackLinks` spends 26 % of its time at 40 h in `os.Stat` of every item's source, on every read. The manuscript decode is 7 to 23 ms once per start; streaming it would save part of that.
- **Cost.** The scan reads less than the tree parse does (takes, sources, regions), so it is a second reader of the same format, or a rewrite of `tracks.Parse`.
- **Staleness and corruption.** Two readers of one format can disagree about a malformed file; one of them would have to be the authority.
- **Migration and contracts.** None.
- **Verdict.** Low. Remove the per-read stats (slice 9). No streamed parser.

### Pre-warming at app start and on idle

The host is configured in about 5 ms and then idle for about 1.4 s while the window opens (on this rig). In that window it can fill what the first page will ask for: the manuscript parse (7 to 23 ms), the `.rpp` parse (29 to 52 ms), the ledger read once (27 ms at 17 h, 58 ms at 40 h) and the per-result summaries.

- **Gain.** With slices 1 and 3 in, the first chapter list is answered from memory instead of paying its first decode of the ledger and summaries. Rebuilding every chapter's evaluation with 4 workers instead of 1: 766 ms against 2,450 ms at 17 h, 3,610 against 9,880 at 40 h (2.7 to 3.2 times faster). On idle, the same fill after a `.rpp` save would hide the 29 to 141 ms parse; that was not measured.
- **Cost.** A background task per project open, through `goBackground`, and CPU the first page may also want.
- **Staleness and corruption.** It fills the same caches the bindings read, under the same keys, so it adds no new way to be stale. It must not hold a lock the first page read needs ([host binding concurrency](../architecture/host-binding-concurrency.md)), and a worker pool must bypass the 4-entry decoded-result cache, which refuses concurrent fills and would evict the Editing page's entries.
- **Migration and contracts.** None.
- **Verdict.** After slices 1 and 3 ([slice 8](#recommended-order)); it has nothing cheap to warm before them.

### Layered rendering

Shell and chapter index first, then the per-chapter figures.

- **Gain.** Not measured as a page change. The inputs are: a chapter index is 3.6 KB at 17 h and answers in under 1 ms, so Production could draw its rows before the recorded figures arrive. As built this would turn a 14 s blank into rows that fill in over 14 s; with slices 1 and 3 the figures arrive within a few hundred milliseconds and layering matters only on a cold rebuild.
- **Cost.** A second read per page and a loading state per figure.
- **Staleness.** A figure that has not arrived shows the loading state, never the last session's value. Each row reserves the space of its figures, so nothing moves and no button is covered when they arrive ([interaction feedback](../architecture/interaction-feedback.md)).
- **Migration.** None.
- **Contracts.** The chapter list without `paragraphIds` is a binding change (slice 6).
- **Verdict.** Build the read split in the host and let [#3749](https://github.com/countrymanprime/narration-studio/issues/3749) decide the page side with its own measurements.

### List virtualization

From [#3254](https://github.com/countrymanprime/narration-studio/issues/3254): windowing the Production table from 30 rows instead of 150 took a 40 hour cold load from 1,141 to 840 ms and warm from 388 to 253 ms, and did nothing at 17 hours. The 2026-11-20 profile agrees: at 103 chapters Production's warm 661 ms is rendering and layout of 5,015 nodes.

- **Gain.** About 135 ms warm at 40 hours; none at 17.
- **Cost.** Hidden rows are not found by the browser's find-in-page, and row heights must be fixed.
- **Staleness, migration, contracts.** None.
- **Verdict.** Low. [#3766](https://github.com/countrymanprime/narration-studio/issues/3766) has the Script page, where 4,822 nodes cost 517 ms warm.

### Code splitting and bundle size

The real build is one script of 2.97 MB and one stylesheet of 180 KB; the mock build's script is 3.37 MB (1.06 MB gzipped) plus a 177 KB fixture. A scratch build with the 13 route components (the 11 pages, the Proof chapter page and the Booth companion) behind `React.lazy` and default chunking, cold at 40 h, median of 7:

| Page | First paint, one bundle | First paint, split | Last answer, one bundle | Last answer, split | Script requests |
| --- | --- | --- | --- | --- | --- |
| Delivery | 432 ms | 340 ms | 627 ms | 829 ms | 3 → 52 |
| Production | 456 ms | 340 ms | 973 ms | 1,109 ms | 3 → 69 |
| Script | 468 ms | 372 ms | 1,386 ms | 1,416 ms | 3 → 65 |
| Booth | 508 ms | 392 ms | 1,149 ms | 918 ms | 3 → 75 |

The largest route chunks: Editing 318 KB, Settings 187 KB, Booth 162 KB, Story Bible 102 KB, Production 88 KB, Script 88 KB, Proof 86 KB; a shared chunk of panel styles is 318 KB.

- **Gain.** 90 to 115 ms of first paint. Time to the last answer does not improve with default chunking, because 50 to 80 small requests replace 3. Module evaluation stays at 150 to 200 ms either way: most of it is shared code. About 150 ms of the start is the API client building its Zod schemas at import.
- **Cost.** A chunking configuration to maintain and a loading boundary per route.
- **Staleness, migration, contracts.** None; the chunks ship inside the app.
- **Verdict.** Low, and only with grouped chunks. [#3769](https://github.com/countrymanprime/narration-studio/issues/3769) owns it; the 1.4 s on the real host is mostly the window and web view, which this does not touch, and WebView2 on Windows is not measured.

### Host-side worker parallelism

- **Measured.** Calling a page's reads at once is 0.5 to 1.1 times the in-order time. `LedgerStore.All` takes no lock, so the limit is CPU and garbage collection, not a shared lock. Three identical chapter-list reads at once take 12 to 13 s each against 3.6 s alone.
- **Gain.** Answering identical reads in flight from one computation removes the 3.4 times multiplier of cost 2. Not measured in a build.
- **Cost and risk.** The coalescing belongs at the binding, keyed on the services snapshot and a generation number that every ledger or result write advances; otherwise the refresh sent after a check finishes joins a computation started before the write and returns the answer from before the check. It holds no lock across the computation.
- **Migration and contracts.** None.
- **Verdict.** Coalesce in the host ([slice 4](#recommended-order)) beside the page-side work of #3658; use workers only for the cold rebuild of slice 8.

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
- **Gain.** The call stays inside one process, so compression has no network to save; it would add 11 to 48 ms of host time and a decompression step in the page. A binary format (MessagePack, CBOR) was not measured: the host has no such dependency, and the page's `JSON.parse` is native while a binary decoder would run in script. The page-side cost of validating answers is 4 to 5 % of a cold load.
- **Cost.** A second encoder and decoder for every binding, and goldens in two forms.
- **Staleness and migration.** None.
- **Contracts.** Every binding's contract row would change.
- **Verdict.** No compression and no binary format. Send less: findings by chapter, a pickups count for the shell, the chapter list without `paragraphIds`. Waveform peaks are the one payload where a binary form is worth measuring, in [#3767](https://github.com/countrymanprime/narration-studio/issues/3767).

### Memory budget

| | 1 h | 17 h | 40 h | 300 chapters |
| --- | --- | --- | --- | --- |
| Host heap in use after every page's reads | 6.6 MB | 14.6 MB | 27.4 MB | 39.4 MB |
| Host resident memory after that, and at peak | 67, 73 MB | 99, 126 MB | 125, 222 MB | 161, 212 MB |
| Bytes allocated by that one pass | 0.13 GB | 8.1 GB | 37.5 GB | 277 GB |
| Page JS heap | 11 to 20 MB | 16 to 25 MB | 23 to 34 MB | not run |

- Steady memory is small. The peak is garbage from repeated decoding and falls with slices 1 and 3.
- **Proposed budget.** The slices add three held sets: decoded ledger records (2.4 MB on disk at 17 h, 5.6 MB at 40 h), summaries (under 1 MB) and decoded findings (7.9 MB on disk at 17 h, 18.5 MB at 40 h). Their size in memory was not measured. The budget each slice has to meet and report: the host's heap in use after every page's reads stays under 100 MB at 40 h (27.4 MB today), and the findings set is dropped when the project closes.
- **Cost, staleness, migration, contracts.** None beyond each cache's own invalidation rule.

## Recommended order

Each issue is one pull request. Gains are for 44 chapters, then 103, with a recording check on every chapter. "Measured" is the scratch build; "expected" is derived from a profile and stated as such.

| # | Slice | Gain | Files, contracts | Issue |
| --- | --- | --- | --- | --- |
| 1 | The ledger is read once per binding read: one pass of `currentReports` per chapter-list read, one ledger listing and one link-file read per pass handed to each evaluation, each record decoded once (records are never rewritten, so the cache is keyed by file name), one `LedgerStore` per project | **Measured for the decode cache alone:** chapter list 3.6 → 0.78 s, 16.4 → 1.97 s, 111 → 3.8 s at 300 chapters; pickups list 5.5 → 1.3 s, 25 → 3.4 s; sync state 1.85 → 0.40 s, 8.0 → 1.1 s. **Expected** from the single pass: about half of what is left | In memory only. A test that counts decodes and directory listings | [#3801](https://github.com/countrymanprime/narration-studio/issues/3801) |
| 2 | Beside slice 1: seed recording checks, findings and a Story Bible for the rig, and commit the host read benchmark with budgets counted in decodes and allocations, run on the Windows runner | Makes every number here reproducible and keeps slice 1 from regressing | Scripts and a Go benchmark; no app change | [#3803](https://github.com/countrymanprime/narration-studio/issues/3803) |
| 3 | A summary beside each stored check result (present fraction, counts, paragraph lines, document id, manuscript hash), keyed by record id and a summary version; whether the check is current and the recorded-through place stay computed | **Expected:** chapter list 0.78 → about 0.1 to 0.2 s, 1.97 → about 0.3 to 0.5 s (result decoding is 71 % of the profile at 103 chapters). Not supported at 300 short chapters, where it is 21 % | A new derived file: data-files row, schema, version, discard on mismatch | [#3802](https://github.com/countrymanprime/narration-studio/issues/3802) |
| 4 | Identical reads in flight share one computation, at the binding, keyed on the services snapshot and a write generation | **Expected:** removes the 3.4 times multiplier at start (12 to 13 s per call → the single-call time) | In memory. A race test: a read started after a write never gets the answer from before it | [#3810](https://github.com/countrymanprime/narration-studio/issues/3810) |
| 5 | The pickups list and the sync state take each chapter's evaluation from the shared pass; the shell reads a pickups count; a finished check queues one sync-state read, not one per check | **Expected:** pickups list 1.3 → under 0.3 s; the shell stops moving 1.72 MB per page; no CPU tail after a run of checks | Host only; a count binding that needs no bridge | [#3804](https://github.com/countrymanprime/narration-studio/issues/3804) |
| 6 | The chapter list answers without `paragraphIds`; its seven page-side readers take them from `ManuscriptParagraphs` | **Expected:** chapter-list answer 64.8 → about 14 KB at 44 chapters | A binding changes shape: contract row, golden, mock, `hostAPIVersion`; a multi-page UI change | [#3811](https://github.com/countrymanprime/narration-studio/issues/3811) |
| 7 | Findings are held decoded while the findings folder is unchanged; the summary and a single finding answer from the held set. Then, separately, Proof reads findings by chapter | **Expected:** summary 115 → under 5 ms; Proof moves about 0.2 MB instead of 12.05 MB | In memory first; the page change adds a filter to the list binding | [#3805](https://github.com/countrymanprime/narration-studio/issues/3805), [#3812](https://github.com/countrymanprime/narration-studio/issues/3812) |
| 8 | Fill the manuscript, `.rpp`, ledger and summaries in the background at start; rebuild missing summaries with 4 workers outside the decoded-result cache | **Expected:** the first chapter list from memory; a cold rebuild 2.7 to 3.2 times faster | None | [#3806](https://github.com/countrymanprime/narration-studio/issues/3806) |
| 9 | Hold the decoded Story Bible while its file is unchanged and stop the per-read `stat` of every item source. Separately, hold each settings scope's file while unchanged | **Expected:** a Story Bible read 48 → about 12 ms; `ChapterTrackLinks` about a quarter less; `settings.json` opens 63 → 1 | In memory | [#3807](https://github.com/countrymanprime/narration-studio/issues/3807), [#3813](https://github.com/countrymanprime/narration-studio/issues/3813) |
| 10 | Derived data, in order: one shared source-identity cache and one key builder in `internal/evidence`; then persist take evidence and delivery measurements under it; then a size bound and prune order per kind, with a ledger retention rule that keeps the newest complete record | **Expected:** a measured hour-long file is not measured again after a restart (58.8 s); ten per-call file hashes removed; disk bounded | `internal/evidence`; data-files rows gain a bound; the pruning change runs alone | [#3814](https://github.com/countrymanprime/narration-studio/issues/3814), [#3815](https://github.com/countrymanprime/narration-studio/issues/3815), [#3816](https://github.com/countrymanprime/narration-studio/issues/3816), with [#3778](https://github.com/countrymanprime/narration-studio/issues/3778) and [#3761](https://github.com/countrymanprime/narration-studio/issues/3761) |

What can run together: slices 1 and 2; slice 7's host half, slice 9 and the identity cache of slice 10 at any time. Slices 1, 3, 5 and 8 touch `internal/coverage/read.go` and run in that order. Slices 6 and 7's page half both change a binding and the mock, and merge one at a time.

Page-side work is not part of this order and keeps its own issues and measurements: one read of each source per page ([#3658](https://github.com/countrymanprime/narration-studio/issues/3658)), Production's layout while figures arrive ([#3749](https://github.com/countrymanprime/narration-studio/issues/3749)), Script and Proof ([#3766](https://github.com/countrymanprime/narration-studio/issues/3766)), Editing and peaks ([#3767](https://github.com/countrymanprime/narration-studio/issues/3767)), the remaining pages ([#3768](https://github.com/countrymanprime/narration-studio/issues/3768)), app start and the bundle ([#3769](https://github.com/countrymanprime/narration-studio/issues/3769)).

Not recommended now: per-chapter manuscript files, one whole-book snapshot, an embedded database for reads, a streamed `.rpp` parser, compression or a binary wire format. Each is measured above and each gains less than slice 1 alone.

Rules every slice keeps:

- A stored value is used only when its key matches the inputs it was made from; otherwise it is discarded and rebuilt, and the page shows the loading state for that value, not the old one.
- A cache names what invalidates it and has a test that counts reads ([#3560](https://github.com/countrymanprime/narration-studio/issues/3560)). A cached record is returned as a copy or used read-only.
- A new file has a row in [data files](../reference/data-files.md), a schema, a version and a retention rule.
- The mock backend gets the same shape first, behind the port.

## Not measured

- **Windows and the owner's machine: pending the owner.** Every number is from a Linux container. File opens are slower on Windows with Defender on, WebView2 starts differently from WebKitGTK, and the owner's book has its own number of checked chapters, items per chapter and past checks. One launch of the real book with `General.debug_logging` on writes the same `ui.call.ok` lines to `run.jsonl` that the start table here is built from, and would confirm or correct it.
- **A partly checked book.** Cost 1 grows with checked chapters × ledger records, including records of earlier checks and of other analyzers. A book with 10 checked chapters of 44 pays less than the table; a book checked several times pays more.
- **Each page driven in the real app.** The real app was timed at launch on Production only. Per-page host time is from bindings called in a Go test, and per-page drawing time is from the mock. Driving each page in the real app at each size is slice 2's job.
- **A warm app start**, the 300-chapter app start, and the mock at 300 chapters.
- **A live DAW.** No REAPER was running, so `PickupsCount`, live track reads and the bridge are outside these numbers; they are in [REAPER bridge performance](reaper-bridge-performance.md).
- **Audio.** Waveform peaks, take evidence and delivery measurement costs are quoted from earlier pages, not re-measured.
- **The stand-in sidecar's result** (one token per word) was not compared with a real recogniser run's result size.
- **Expected gains.** Only slice 1's decode cache was built and timed. The single pass, coalescing and slices 3 to 10 carry expected gains.
