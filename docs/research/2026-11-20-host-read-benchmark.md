# Host reads and page loads on seeded books (2026-11-20)

**What it settles:** what each page's host reads cost, and how long the real app keeps reading after a launch or a page change, on books of 1, 17 and 40 hours and of 300 chapters that carry a narrator's work. It is the baseline for the performance work of [#3751](https://github.com/countrymanprime/narration-studio/issues/3751) ([its research page](performance-architecture-2026-11.md)), taken with the committed harness of [#3803](https://github.com/countrymanprime/narration-studio/issues/3803) on `main` at `270bbb7`, so each later change and the owner's own book can be measured the same way.

**Method.** One cloud container: 4 vCPU Intel Xeon at 2.10 GHz, 15 GiB RAM, Linux 6.18, ext4, Go 1.27.3, WebKitGTK under Xvfb. Windows is the supported platform and is not in these numbers; see [Not measured](#not-measured).

- **Books.** `node scripts/dev/host-read-bench.mjs seed <folder> --size 1h|17h|40h|300`: 3, 44 and 103 chapters of 40 paragraphs (3,640 words a chapter) and 300 chapters of 6, each chapter linked to a track of 100 takes. Through the host's own code every chapter gets one complete recording check (a stand-in sidecar hears each word; the host's aligner scores it 100 % present), and the book gets a Story Bible, findings at about 40 per 1,000 words with 45 % decided, marks at about 15 per 1,000 words, a pickup in one chapter of eight and script prep. Two more 17 hour books: 10 of 44 chapters checked (`--checked 10`), and every chapter checked three times (`--checks 3`).
- **Host reads.** `node scripts/dev/host-read-bench.mjs reads <folder>`: each read binding called on a host that has read nothing, then again for a warm median (9 calls, 3 when the first took over a second), with no window and no DAW. Three processes for 1 h and 17 h, one for the others; the cells are medians over the processes.
- **Real app.** The built host under `scripts/dev/real-app/start-host.sh` with `NARRATION_DEBUG=1`, no DAW running, driven by `scripts/dev/real-app/page_times.py`: it reads the launch from the run log and presses each page's navigation button twice over. Three launches for 1 h and 17 h, two for 40 h and 300 chapters; one pass over the pages each. The operating system's file cache was warm for every launch, so each is the warm start.
- Units: KB and MB are 1,000 and 1,000,000 bytes.

## What the seeded books hold

| On disk | 1 h, 3 chapters | 17 h, 44 chapters | 40 h, 103 chapters | 300 chapters |
| --- | --- | --- | --- | --- |
| `manuscript.json` | 88 KB | 1.22 MB | 2.85 MB | 1.27 MB |
| `Book.rpp` (items) | 84 KB (300) | 1.21 MB (4,400) | 2.83 MB (10,300) | 8.25 MB (30,000) |
| Story Bible (entities, cues) | 56 KB (15, 30) | 724 KB (220, 440) | 1.68 MB (515, 1,030) | 756 KB (225, 450) |
| Findings files | 348 KB | 5.00 MB | 11.7 MB | 5.24 MB |
| Recording-check results | 2.45 MB (3 files) | 35.9 MB (44) | 84.1 MB (103) | 43.8 MB (300) |
| Analysis ledger | 172 KB (3) | 2.47 MB (44) | 5.78 MB (103) | 16.8 MB (300) |
| `marks.json` | 48 KB | 672 KB | 1.57 MB | 688 KB |

Checking every chapter three times triples the results (107.7 MB) and the ledger (7.40 MB) of the 17 hour book. Seeding takes 4 s, 70 s, 246 s and 403 s for the four sizes.

## Host reads

Milliseconds, first call on a host that has read nothing | warm median.

| Binding | 1 h | 17 h | 40 h | 300 chapters | Answer, 17 h / 40 h |
| --- | --- | --- | --- | --- | --- |
| `PickupsList` | 52 \| 18 | 1,124 \| 956 | 2,736 \| 2,410 | 3,852 \| 3,489 | 636.3 KB / 1.49 MB |
| `ManuscriptChapters` | 34 \| 9.5 | 712 \| 653 | 1,762 \| 1,514 | 2,378 \| 2,257 | 64.1 KB / 149.6 KB |
| `ProductionOverview` | 37 \| 9.2 | 670 \| 652 | 1,631 \| 1,568 | 2,458 \| 2,444 | 15.3 KB / 34.2 KB |
| `ChapterSyncState` | 28 \| 4.3 | 349 \| 318 | 872 \| 755 | 1,538 \| 1,188 | 18.3 KB / 42.2 KB |
| `FindingsList({})` | 4.9 \| 3.6 | 70 \| 63 | 170 \| 139 | 68 \| 68 | 3.21 MB / 7.51 MB |
| `FindingsSummary` | 3.0 \| 2.0 | 41 \| 36 | 77 \| 86 | 42 \| 41 | 1.9 KB / 4.1 KB |
| `WorkspaceAlignment(c-0001)` | 21 \| 7.7 | 60 \| 19 | 126 \| 39 | 329 \| 87 | 619.4 KB / 619.4 KB |
| `StageRecommendations` | 3.3 \| 0.7 | 32 \| 8.6 | 113 \| 23 | 203 \| 58 | 6.3 KB / 14.6 KB |
| `ChapterTrackLinks` | 4.8 \| 0.7 | 33 \| 9.1 | 88 \| 30 | 304 \| 161 | 55.0 KB / 128.2 KB |
| `TracksLive` | 1.8 \| 0.7 | 31 \| 10 | 80 \| 26 | 221 \| 84 | 1.61 MB / 3.76 MB |
| `VoiceTracksGet` | 0.0 \| 0.0 | 0.0 \| 0.0 | 0.0 \| 0.0 | 0.0 \| 0.0 | 0.1 KB / 0.1 KB |
| `GuideEntities` | 0.6 \| 0.6 | 8.8 \| 7.6 | 21 \| 19 | 11 \| 8.4 | 295.7 KB / 695.1 KB |
| `GuideDialogueCues` | 0.7 \| 0.6 | 7.7 \| 8.0 | 26 \| 19 | 8.4 \| 8.2 | 251.6 KB / 589.0 KB |
| `MarksList` | 1.1 \| 0.6 | 16 \| 12 | 54 \| 44 | 20 \| 13 | 542.7 KB / 1.27 MB |
| `Bootstrap` | 0.5 \| 0.4 | 5.3 \| 4.7 | 14 \| 12 | 5.3 \| 5.7 | 1.2 KB / 1.2 KB |
| `ManuscriptParagraphs(c-0001)` | 0.5 \| 0.1 | 6.5 \| 0.1 | 14 \| 0.1 | 5.5 \| 0.0 | 27.1 KB / 27.1 KB |
| `SystemSettingsForScope(project)` | 6.0 \| 4.0 | 5.6 \| 5.7 | 4.0 \| 4.1 | 4.0 \| 4.0 | 18.7 KB / 18.7 KB |

- The four reads every page waits for (`PickupsList`, `ManuscriptChapters`, `ProductionOverview`, `ChapterSyncState`) cost the same warm as cold: what they compute is not kept between calls.
- At `710bd32`, before the ledger kept its decoded records ([#3759](https://github.com/countrymanprime/narration-studio/pull/3759)), the research for #3751 timed `ManuscriptChapters` at 3.6 s for 17 h, 16.4 s for 40 h and 111 s for 300 chapters. It is 0.71 s, 1.76 s and 2.38 s here.
- After every read the host holds 1.9 to 2.6 MB (1 h), 9.1 to 9.9 MB (17 h), 18.8 MB (40 h) and 38.5 MB (300 chapters) more than a host that has read nothing.
- `TracksLive` answers with every item of the saved project: 1.61 MB at 17 h and 3.76 MB at 40 h, the largest answer after the findings list.

### The work behind the slow reads

Files decoded (first call / warm), record folders listed, and allocations of the first call. These are the kinds of count `TestTheSlowReadsStayInsideTheirBudgetsOnA44ChapterBook` caps in CI, on a 44-chapter book with short chapters (its caps are the lower counts of `f88e387`, [below](#the-same-reads-after-the-first-changes)); they follow the chapters and their checks, so that test sees the 17 hour column's decodes and listings.

| Binding | 17 h | 17 h, 10 of 44 checked | 17 h, checked three times | 40 h | 300 chapters |
| --- | --- | --- | --- | --- | --- |
| `PickupsList` | 528 / 481, 268, 3.26 M | 256 / 243, 132, 1.20 M | 616 / 481, 268, 3.44 M | 1177 / 1071, 622, 8.01 M | 3344 / 3041, 1804, 13.20 M |
| `ManuscriptChapters` | 341 / 298, 178, 2.23 M | 103 / 94, 42, 0.74 M | 429 / 298, 178, 2.36 M | 754 / 652, 414, 5.41 M | 2133 / 1834, 1202, 9.23 M |
| `ProductionOverview` | 391 / 348, 178, 2.26 M | 153 / 144, 42, 0.78 M | 479 / 348, 178, 2.40 M | 863 / 761, 414, 5.49 M | 2439 / 2140, 1202, 9.48 M |
| `ChapterSyncState` | 199 / 155, 88, 1.21 M | 131 / 121, 88, 0.61 M | 287 / 155, 88, 1.29 M | 435 / 332, 206, 2.92 M | 1223 / 923, 600, 5.24 M |
| `FindingsSummary` | 44 / 44, 2, 0.12 M | 44 / 44, 2, 0.12 M | 44 / 44, 2, 0.12 M | 103 / 103, 2, 0.29 M | 300 / 300, 2, 0.14 M |

- One chapter-list read of a 44-chapter book decodes 298 files and lists 178 folders once the ledger is in memory: about 7 decodes and 4 listings a checked chapter.
- A book checked in part pays for its checked chapters: 10 of 44 costs between a quarter and two fifths of the full book's time.
- Earlier checks of a chapter cost a decode each on the first read (88 more for 88 more records) and nothing after it; the time of the four reads is within 20 % of the book checked once, with one process a book.

| Binding | 17 h, every chapter checked | 10 of 44 checked | Checked three times |
| --- | --- | --- | --- |
| `PickupsList` | 1,124 \| 956 | 332 \| 302 | 1,181 \| 1,084 |
| `ManuscriptChapters` | 712 \| 653 | 221 \| 177 | 818 \| 688 |
| `ProductionOverview` | 670 \| 652 | 216 \| 180 | 792 \| 682 |
| `ChapterSyncState` | 349 \| 318 | 128 \| 102 | 384 \| 370 |
| `FindingsSummary` | 41 \| 36 | 36 \| 35 | 38 \| 33 |

### The same reads after the first changes

`main` moved to `f88e387` while this was measured: [#3762](https://github.com/countrymanprime/narration-studio/pull/3762) answers every chapter of a read from one listing of the ledger, [#3796](https://github.com/countrymanprime/narration-studio/pull/3796) decodes the chapter-track map only when its bytes change and [#3777](https://github.com/countrymanprime/narration-studio/pull/3777) decodes only the Story Bible list a read answers. One process a book, milliseconds, first call | warm, at `270bbb7` → at `f88e387`.

| Binding | 17 h | 40 h | 300 chapters |
| --- | --- | --- | --- |
| `PickupsList` | 1,124 \| 956 → 744 \| 645 | 2,736 \| 2,410 → 1,794 \| 1,559 | 3,852 \| 3,489 → 1,870 \| 1,446 |
| `ManuscriptChapters` | 712 \| 653 → 335 \| 321 | 1,762 \| 1,514 → 897 \| 824 | 2,378 \| 2,257 → 968 \| 774 |
| `ProductionOverview` | 670 \| 652 → 360 \| 353 | 1,631 \| 1,568 → 874 \| 790 | 2,458 \| 2,444 → 1,053 \| 800 |
| `ChapterSyncState` | 349 \| 318 → 340 \| 308 | 872 \| 755 → 839 \| 749 | 1,538 \| 1,188 → 937 \| 661 |

At 17 h a warm chapter-list read went from 298 decodes and 178 listings to 152 and 1, and the allocations of a first call from 2.23 to 1.22 million. The budget test's rows are the `f88e387` counts. The real-app tables below are from `270bbb7`.

### The saved project's parse by content hash ([#3897](https://github.com/countrymanprime/narration-studio/pull/3897))

`main` at `0c831c2` against the head of #3897, `4ad2987`, on the seeded books, three processes each, warm median of 9 calls, milliseconds, median over the processes. The rule reads and hashes the saved project on each read, so its cost follows the project's size (`Book.rpp`: 84 KB, 1.21 MB, 2.83 MB and 8.25 MB for the 3, 44, 103 and 300 chapter books above; the 200 chapter book has 20 paragraphs a chapter).

| Binding | 3 chapters | 44 | 103 | 200 | 300 |
| --- | --- | --- | --- | --- | --- |
| `ChapterTrackLinks` | 1.0 → 1.2 | 15.8 → 16.3 | 38.3 → 51.7 | 134.2 → 108.1 | 205.0 → 215.0 |
| `TracksLive` | 0.9 → 1.1 | 13.3 → 15.6 | 23.7 → 32.3 | 52.8 → 61.6 | 86.6 → 95.3 |

The rule adds about 1 to 3 ms at 3 and 44 chapters, 8 to 13 ms at 103 and up to 9 ms at 300 (8 MB of project); the 200 chapter book reads faster with it, which is the spread of three processes. The four chapter-list reads do not read the project file: `ManuscriptChapters` 346 → 322 ms, `ChapterSyncState` 319 → 313 ms and `PickupsList` 365 → 380 ms at 300 chapters, within the spread of the processes.

### The retention pass ([#3958](https://github.com/countrymanprime/narration-studio/pull/3958))

`node scripts/dev/host-read-bench.mjs retention <book>` runs the ledger retention pass twice over a copy of a seeded book, on a host whose ledger store has decoded nothing, then times three reads on a host before the pass and a new one after it. A book checked once holds nothing to remove (the pass is then its cost to find that out). The `x3` books were seeded with `--checks 3`: each chapter holds three complete checks, so two are superseded. Two runs each; the pass in milliseconds, files and MB are the ledger, results and summaries together.

| Book | First pass, ms (two runs) | Files | MB | Records removed | Second pass, ms |
| --- | --- | --- | --- | --- | --- |
| 3 chapters | 1, 1 | 9 → 9 | 2.67 → 2.67 | 0 | 0, 0 |
| 44 chapters | 13, 15 | 132 → 132 | 39.22 → 39.22 | 0 | 5, 4 |
| 44 chapters, checked three times | 49, 60 | 396 → 132 | 117.66 → 39.22 | 88 | 3, 4 |
| 103 chapters | 41, 32 | 309 → 309 | 91.81 → 91.81 | 0 | 8, 10 |
| 200 chapters of 20 paragraphs | 75, 74 | 600 → 600 | 97.11 → 97.11 | 0 | 17, 17 |
| 300 chapters | 90, 102 | 900 → 900 | 60.80 → 60.80 | 0 | 25, 29 |
| 300 chapters, checked three times | 357, 517 | 2,700 → 900 | 182.40 → 60.80 | 600 | 24, 29 |

On the two books checked three times, the first call of three reads that walk the ledger, before the pass → after it (median of two runs, ms): 44 chapters `ManuscriptChapters` 161 → 109, `ProductionOverview` 112 → 81, `ChapterSyncState` 54 → 59; 300 chapters `ManuscriptChapters` 978 → 682, `ProductionOverview` 561 → 422, `ChapterSyncState` 439 → 311. On the books checked once there is nothing to remove and the reads do not change (differences within the spread of the runs).

### The cache pass (#3816)

`node scripts/dev/host-read-bench.mjs retention <book> --cache-entries N` fills the copy's analysis cache with N entries of each of the six kinds of the retention table (8 KB blobs; a third last used 400 days ago, the others 0 to 39 hours ago, about the same mix for every kind, assigned by position in the folder) and runs the cache step twice. The seeded books' cache holds one entry, so the entries are synthetic: the pass time follows the number of files (it reads the start of each envelope, never the blob), not their size. Two runs each, on the 44 chapter book; milliseconds; files and MB are the whole cache folder.

| Entries of each kind | First pass, ms | Files | MB | Removed | Second pass, ms |
| --- | --- | --- | --- | --- | --- |
| 10 | 2, 3 | 61 → 45 | 0.91 → 0.73 | 16 | 0, 0 |
| 100 | 17, 19 | 601 → 479 | 6.86 → 5.51 | 122 | 3, 4 |
| 1,000 | 319, 271 | 6,001 → 4,478 | 66.39 → 49.60 | 1,523 | 54, 49 |
| 10,000 | 5,079, 5,737 | 60,001 → 28,290 | 661.68 → 312.07 | 31,711 | 274, 288 |

Measured at `4c362abbb`, the head of PR #3986 after its review fixes (the first version, before the per-entry handle check and the time check before each removal, took 1 to 2, 23 to 35, 202 to 281 and 4,455 to 4,761 ms at the same sizes).

What goes at 10,000 is mostly the size caps (80 MB of blobs of each kind against caps of 8 and 64 MB) and the entries past 24 hours and 7 days. A real cache holds far fewer, larger entries (a peaks entry is about 0.9 MB an hour of audio, a take evidence entry about 0.45 KB), so the first pass of a real project is the 100 to 1,000 row at most. The pass asks to stop every 256 entries while it reads and before each removal, so a check starting waits for at most 256 header reads (not timed on their own).

### The previews, the Transcript Compare files and the shared prune helper (#3816)

`node scripts/dev/host-read-bench.mjs retention <book> --files N` adds N TTS previews (64 KB each, none used in the last ten minutes) and N Transcript Compare runs (a diff of 4 KB and two text files of 4 KB, run i being 25+i hours old: past the day a run is left alone) to the copy and runs the two folder steps twice each. The previews are held to 64 MB (1,024 files of 64 KB), the runs to the newest 20 and 7 days. Two runs each, 44 chapter book, milliseconds; files and MB are the whole folder.

| N | Previews: first pass, ms | Files | MB | Removed | Compare runs: first pass, ms | Files | MB | Removed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 10 | 0, 0 | 10 → 10 | 0.66 → 0.66 | 0 | 0, 0 | 30 → 30 | 0.12 → 0.12 | 0 |
| 100 | 0, 1 | 100 → 100 | 6.55 → 6.55 | 0 | 6, 9 | 300 → 60 | 1.23 → 0.25 | 240 |
| 1,000 | 3, 6 | 1,000 → 1,000 | 65.54 → 65.54 | 0 | 63, 62 | 3,000 → 60 | 12.29 → 0.25 | 2,940 |
| 10,000 | 299, 279 | 10,000 → 1,024 | 655.36 → 67.11 | 8,976 | 735, 720 | 30,000 → 60 | 122.88 → 0.25 | 29,940 |

The second pass takes 0 to 5 ms for the previews and 0 to 1 ms for the runs at every size. Under 20 runs and under 64 MiB (67.11 MB; the table's MB are decimal) nothing is removed (the 10, 100 and 1,000 preview rows: 1,000 previews of 64 KB are 65.54 MB, 1,024 fit the cap). A real project holds a few dozen previews and as many runs as the narrator has compared: the 10 and 100 rows.

`runlog.Begin` prunes `logs/runs` as every run starts, and now does it with the same helper (`persist.PruneFolder`) in place of its own loop. Cost of one `Begin` with N files in `logs/runs`, `main` against this change, 5 runs of 200 calls each (a folder held at its 20-file cap, the steady state), and the first `Begin` over N stale files (5 runs of one call each); every file is past the hour a written file is left alone, so both versions prune to 20; microseconds and milliseconds:

| Folder | `main` | This change |
| --- | --- | --- |
| 20 files, steady state, µs | 31 to 48 | 43 to 51 |
| 200 stale files, first `Begin`, ms | 1.0 to 1.7 | 2.0 to 2.7 |
| 2,000 stale files, first `Begin`, ms | 10.3 to 16.6 | 25.7 to 35.0 |

The helper costs about 5 to 12 µs more per run start at the cap, and about twice the old loop for the one-time prune of a folder far over it (it removes through an `os.Root`, with a look at each file before it goes). The benchmark is committed: `go -C src/studio/desktop test ./internal/runlog -run xxx -bench BenchmarkBegin -benchtime=200x -count=5` (`-benchtime=1x` for the first `Begin`). After that prune the folder is held at 20 files (a file written in the last hour is never removed, so a burst of more than 20 runs within an hour keeps them until the hour has passed), so the one-time cost is paid on the first run after the upgrade.

## The real app

Seconds after the launch command, per launch.

| Book | First answer | Chapter list first answers | Pickup list first answers | Last answer of the first reads |
| --- | --- | --- | --- | --- |
| 1 h | 1.1 to 1.3 | 1.4 to 1.7 | 1.5 to 2.0 | 6.3 to 6.5 |
| 17 h | 1.0 to 1.1 | 3.4 to 3.7 | 3.9 to 4.3 | 6.3 |
| 40 h | 1.0 to 1.1 | 7.2 to 7.5 | 8.4 to 9.0 | 11.4 to 11.7 |
| 300 chapters | 1.1 | 13.6 to 13.9 | 15.4 to 16.1 | 23.4 to 26.9 |

- At launch the page asks for the chapter list three times, the Production overview and the pickup list twice each and the chapter sync state twice, at the same moment. At 17 h each chapter-list call takes 2.5 to 2.9 s against 0.7 s alone.
- At 1 h and 17 h the last answer at 6.3 s belongs to a second set of reads (`TracksLive`, `ChapterTrackLinks`, `VoiceTracksGet`) that the page makes about 5 s after it opens.
- At `710bd32` the research for #3751 saw the chapter list at 13.6 to 14.6 s (17 h) and 59.7 s (40 h).

Seconds from pressing a page's navigation button to its last answer, with the calls made in brackets: first visit | second visit. The launch row is the same measure from the launch command.

| Page | 1 h | 17 h | 40 h | 300 chapters |
| --- | --- | --- | --- | --- |
| Launch, on Production | 6.5 (51) | 6.3 (49) | 11.7 (54) | 26.9 (73) |
| Production | 0.2 (32) \| 0.3 (32) | 5.2 (35) \| 5.2 (35) | n/r \| n/r | 17.5 (43) \| 20.6 (48) |
| Schedule | 0.2 (10) \| 0.1 (10) | 2.8 (10) \| 3.3 (10) | 7.3 (10) \| n/r | 12.5 (10) \| 14.1 (12) |
| Script | 0.4 (20) \| 0.3 (15) | 2.0 (20) \| 1.8 (15) | 4.9 (20) \| n/r | 8.1 (20) \| 6.0 (15) |
| Story Bible | 0.3 (20) \| 0.2 (20) | 1.8 (20) \| 1.8 (20) | 3.9 (20) \| n/r | 7.0 (20) \| 7.3 (20) |
| Booth | 20.4 (83) | 3.7 (41) | n/r | 27.8 (84) |
| Editing | 5.2 (77) \| 5.1 (75) | 12.7 (121) \| 12.1 (118) | 30.2 (189) \| n/r | 122.0 (406) \| 115.5 (401) |
| Proof | 6.6 (18) \| 6.9 (18) | 10.2 (18) \| 13.4 (18) | 59.0 (36) \| n/r | 26.2 (27) \| 21.5 (24) |
| Pickups | 7.3 (13) \| 7.2 (13) | 21.6 (16) \| 21.5 (13) | 291.3 (13) \| n/r | 27.6 (19) \| 29.4 (16) |
| Master & QC | 0.1 (9) \| 0.1 (9) | 1.8 (9) \| 2.2 (9) | n/r \| n/r | 7.3 (9) \| 5.9 (9) |
| Delivery | 0.1 (10) \| 0.1 (10) | 1.2 (10) \| 1.5 (10) | n/r \| n/r | 5.8 (10) \| 6.8 (10) |
| Settings | 0.2 (30) \| 0.2 (23) | 1.7 (23) \| 1.5 (23) | n/r \| n/r | 5.9 (23) \| 6.3 (30) |

The slowest call of each first visit, in seconds as the page waited for it:

| Page, first visit | 1 h | 17 h | 40 h | 300 chapters |
| --- | --- | --- | --- | --- |
| Production | `ManuscriptChapters` 0.16 | `PickupsList` 4.02 | n/r | `PickupsList` 17.44 |
| Schedule | `PickupsList` 0.13 | `PickupsList` 2.79 | `PickupsList` 7.28 | `PickupsList` 12.46 |
| Script | `PickupsList` 0.16 | `PickupsList` 2.01 | `PickupsList` 4.89 | `PickupsList` 7.86 |
| Story Bible | `PickupsList` 0.11 | `PickupsList` 1.65 | `PickupsList` 3.64 | `PickupsList` 6.36 |
| Booth | `Bootstrap` 0.17 | `PickupsList` 2.41 | n/r | `PickupsList` 8.67 |
| Editing | `WorkspacePeaks` 0.55 | `PickupsList` 2.51 | `PickupsList` 5.30 | `PickupsList` 7.62 |
| Proof | `PickupsList` 0.61 | `PickupsList` 9.20 | `PickupsList` 21.80 | `PickupsList` 16.18 |
| Pickups | `FindingsSummary` 0.27 | `PickupsList` 11.87 | `TracksLive` 139.53 | `PickupsList` 13.61 |
| Master & QC | `PickupsList` 0.07 | `PickupsList` 1.54 | n/r | `PickupsList` 6.76 |
| Delivery | `PickupsList` 0.07 | `PickupsList` 1.14 | n/r | `PickupsList` 5.60 |
| Settings | `PickupsList` 0.12 | `PickupsList` 1.68 | n/r | `PickupsList` 5.87 |

- From 17 h up the slowest call of every first visit but one (Pickups at 40 h) is the pickup list, which the shell reads on each page change. At 17 h it takes 1.1 to 4.0 s on most pages against about 1 s on the host alone, and 9 to 12 s on a first visit of Proof and Pickups (12 to 16 s on the second), where it is asked for several times while findings are read.
- A second visit costs what the first did: nothing a page reads is kept.
- Proof, Pickups and the Booth make reads on timers and after delays, so their last answer at 1 h (6 to 20 s) is not load time; compare a page across sizes, not with another page.
- **40 h.** After the first visit of Pickups the app did not go quiet within the 15 minute limit: its last answer came at 291 s, one `TracksLive` answer took 140 s, and the window then stopped answering the accessibility bus, so the rows after it are "n/r" (not reached). The pickup list at that size is 1.49 MB.
- Editing at 300 chapters makes 406 calls over 122 s.

## The pages on the mock

`node scripts/dev/page-bench.mjs --hours 1,17,40 --runs 5` on the production mock build, where the host answers from memory. Milliseconds to the page's first change / until it is usable, cold (a new browser context on the page's address) | warm (a press on the navigation from another page). The warm Settings cell is filled: the script looked for Settings inside the navigation landmark, where it is not, and printed `NaN`.

| Page | 1 h | 17 h | 40 h |
| --- | --- | --- | --- |
| Production | 431 / 540 \| 52 / 120 | 523 / 730 \| 65 / 246 | 438 / 691 \| 0 / 408 |
| Schedule | 347 / 400 \| 44 / 73 | 478 / 590 \| 46 / 90 | 449 / 516 \| 39 / 73 |
| Script | 347 / 499 \| 50 / 221 | 435 / 770 \| 266 / 268 | 391 / 822 \| 45 / 395 |
| Story Bible | 499 / 615 \| 70 / 131 | 419 / 507 \| 69 / 138 | 408 / 553 \| 51 / 117 |
| Booth | 410 / 924 \| 297 / 488 | 403 / 852 \| 45 / 457 | 439 / 963 \| 40 / 481 |
| Editing | 462 / 706 \| 47 / 241 | 483 / 698 \| 64 / 270 | 446 / 637 \| 59 / 253 |
| Proof | 433 / 602 \| 0 / 159 | 413 / 567 \| 51 / 154 | 457 / 615 \| 51 / 155 |
| Pickups | 475 / 557 \| 64 / 120 | 508 / 628 \| 63 / 109 | 401 / 479 \| 59 / 97 |
| Master & QC | 406 / 476 \| 84 / 118 | 422 / 497 \| 60 / 91 | 415 / 503 \| 69 / 118 |
| Delivery | 556 / 625 \| 0 / 115 | 395 / 448 \| 49 / 78 | 393 / 452 \| 46 / 81 |
| Settings | 480 / 640 \| 72 / 155 | 413 / 541 \| 87 / 152 | 466 / 584 \| 118 / 173 |

A first change of 0 in three warm cells means the script saw no change of the page after its measurement began in most of the five runs; it prints 0 for that. A page's own cost stays under one second at every size; what a narrator waits for on a real book is the host reads above.

### Readers moved onto the shared chapter list (#3658)

Host calls and answer size (calls / KB, `--runs 3`) of the Production page before and after its pipeline cells took the chapter list from the store instead of reading it again. Books of 1, 5, 17 and 40 hours (3, 13, 44 and 103 chapters).

| Production | 1 h | 5 h | 17 h | 40 h |
| --- | --- | --- | --- | --- |
| Cold, before | 53 / 122 | 53 / 167 | 53 / 262 | 53 / 440 |
| Cold, after | 52 / 121 | 52 / 163 | 52 / 253 | 52 / 422 |
| Warm, before | 35 / 64 | 35 / 100 | 35 / 176 | 35 / 321 |
| Warm, after | 34 / 63 | 34 / 96 | 34 / 168 | 34 / 303 |

The saved call is one `ManuscriptChapters` read, whose warm cost on the real host is in the [host read table](#host-reads): 9.5 ms at 1 h, 653 ms at 17 h, 1,514 ms at 40 h and 2,257 ms at 300 chapters. The mock answers from memory, so its milliseconds say nothing about that; the calls and KB do.

Booth and Editing then took the same list (the Editor, the Booth and the Production pipeline through `useReadChapters`; #3994 and #3934 revived on the project record of #3998). Calls / KB on the same rig, built from `main` at 00a3bfc and from the branch, `--runs 5`, run one after the other (the first three-run table had both builds running at once). Nodes are 3,983 (Booth) and 4,098 (Editing) before and after.

| Booth | 1 h | 5 h | 17 h | 40 h |
| --- | --- | --- | --- | --- |
| Cold, before | 63 / 145 | 63 / 155 | 63 / 178 | 64 / 221 |
| Cold, after | 63 / 145 | 63 / 155 | 63 / 178 | 64 / 221 |
| Warm, before | 52 / 107 | 53 / 112 | 53 / 122 | 53 / 140 |
| Warm, after | 52 / 106 | 52 / 109 | 51 / 113 | 51 / 123 |

| Editing | 1 h | 5 h | 17 h | 40 h |
| --- | --- | --- | --- | --- |
| Cold, before | 56 / 260 | 56 / 271 | 56 / 293 | 56 / 337 |
| Cold, after | 56 / 260 | 56 / 271 | 56 / 293 | 56 / 337 |
| Warm, before | 41 / 212 | 41 / 217 | 42 / 342 | 42 / 360 |
| Warm, after | 40 / 211 | 41 / 328 | 41 / 333 | 41 / 342 |

A cold start reads the list once either way. A warm visit makes one fewer call at 17 and 40 h (Booth 53 to 51, Editing 42 to 41). The Editing warm KB cells jump between about 217 and 330 in both builds: a store refresh of the list (an event or a focus, 100 to 150 KB at 17 to 40 h) lands inside the quiet window in some runs and not in others, so the KB of those cells says nothing about the change. The Production pipeline already read the store (#3910); its calls are unchanged (34 warm at every size), and what changed is that its own copy of the read (the generation and refresh-key bookkeeping around `ensure`/`load`) is one call of the shared hook. The goal of these moves is one list for every page, not the call count; the count is reported so a regression would show.
Production's rows, header, pace and Next up then took their chapters from the shared list too (#4058; the host's overview supplies only the per-chapter numbers), and the target popover took its chapters from it. Calls / KB for 1, 5, 17 and 40 h, `--runs 5`, current `main` against this head, run one after the other:

| Production | Calls | KB at 1, 5, 17, 40 h |
| --- | --- | --- |
| Cold, `main` | 52 | 122, 164, 254, 423 |
| Cold, this head | 52 | 122, 164, 254, 423 |
| Warm, `main` | 34 | 63, 96, 168, 303 |
| Warm, this head | 34 | 63, 96, 168, 303 |

Nodes are unchanged, and the call sets of a cold start are the same names and counts in both builds (`?mockCallLog=1`, 17 h). A first version of the change read the list once more on a cold start (53 calls, 441 KB at 40 h): the page's reader started the read before App's `load` of the same list, and `load` does not join a read in flight. App now asks for the list with `ensure`, which joins it. This was done for consistency, not speed: the page has one source of chapter names, order and statuses, so a rename or a failed list read shows on Production as on every other page.

The other readers then moved (Script, Story Bible, Proof, Pickups, Master & QC, Settings, with the rail's Master & QC badge, the Companion and the dialogs). Calls / KB, `--runs 5`, `main` at 00a3bfc against the head of that change, one build after the other; 1, 5, 17 and 40 hours. Nodes are unchanged on every page.

| Page | Cold, before | Cold, after | Warm, before | Warm, after |
| --- | --- | --- | --- | --- |
| Script | 36 / 173, 183, 207, 253 | 35 / 171, 180, 199, 235 | 22 / 124, 130, 141, 162 | 21 / 123, 126, 132, 144 |
| Story Bible | 35 / 90, 100, 123, 166 | 34 / 88, 96, 114, 148 | 21 / 41, 46, 56, 74 | 19 / 39, 39, 39, 39 |
| Proof | 41 / 129, 140, 163, 206 | 40 / 129, 137, 155, 189 | 23 / 77, 82, 92, 110 | 21 / 75, 75, 75, 75 |
| Pickups | 30 / 76, 87, 109, 153 | 29 / 75, 83, 101, 135 | 12 / 22, 27, 36, 55 | 10 / 19, 19, 19, 19 |
| Master & QC | 29 / 89, 100, 123, 166 | 28 / 88, 96, 114, 148 | 15 / 41, 46, 56, 74 | 13 / 39, 39, 39, 39 |
| Settings | 47 / 104, 118, 152, 217 | 47 / 104, 118, 152, 217 | 33 / 56, 64, 86, 126 | 32 / 55, 61, 77, 108 |

(Calls are the same at every size; the four KB figures are 1, 5, 17 and 40 h.) A cold start makes one call fewer on five pages and a warm visit one or two fewer: the pages no longer read the list the store already holds, so after the first read their warm KB no longer grows with the book (Pickups 55 KB at 40 h before, 19 after; Proof 110 to 75). Settings' cold start is unchanged (47 calls); why was not traced. The real-host cost of each saved read is the `ManuscriptChapters` row of the [host read table](#host-reads) (653 ms at 17 h, 1,514 ms at 40 h).

## The track list: a 5 s poll against REAPER's change event

[#3880](https://github.com/countrymanprime/narration-studio/issues/3880), slice 1. Before it, every page that shows the project's tracks (`useLiveTracks`, behind the engine panel, Link chapters, Editing, Proof, Pickups and the Booth's voices) read `TracksLive`, `ChapterTrackLinks` and `VoiceTracksGet` every 5 s while the window was visible. With a revision from REAPER's heartbeat it reads on `daw_tracks_changed`, on focus and on Refresh, and every 30 s for a save in REAPER, which sends no event. Same rig and method as [above](#host-reads): `host-read-bench.mjs seed` then `reads --runs 3` (three processes, medians), here with `--tracks N` for the extra empty tracks. The three reads' warm medians are one tick; the poll is 12 ticks a minute, the event idle 2 (the 30 s read), a change 1.

| Book | One tick, warm, ms (`TracksLive` + `ChapterTrackLinks` + `VoiceTracksGet`) | Answers in one tick | Poll, per minute | Event, idle, per minute | Event, per change |
| --- | --- | --- | --- | --- | --- |
| 3 chapters, 3 tracks | 1.9 (0.9 + 1.0 + 0.0) | 115 KB | 23 ms, 1.38 MB | 3.8 ms, 0.23 MB | 1.9 ms, 115 KB |
| 3 chapters, 203 tracks | 5.5 (1.1 + 4.4 + 0.0) | 199 KB | 66 ms, 2.39 MB | 11 ms, 0.40 MB | 5.5 ms, 199 KB |
| 3 chapters, 2,003 tracks | 62 (2.4 + 59.7 + 0.0) | 956 KB | 745 ms, 11.5 MB | 124 ms, 1.91 MB | 62 ms, 956 KB |
| 44 chapters (17 h) | 27 (12.5 + 14.9 + 0.0) | 1.69 MB | 329 ms, 20.3 MB | 55 ms, 3.38 MB | 27 ms, 1.69 MB |
| 300 chapters | 288 (91.7 + 196.1 + 0.0) | 11.6 MB | 3,454 ms, 139 MB | 576 ms, 23.1 MB | 288 ms, 11.6 MB |

- Idle, the page asks 6 times less than the poll did, at every size: the same tick, 2 a minute instead of 12. At 300 chapters that is 2.9 s of host work and 116 MB of answers a minute not done. The cold first tick is 11, 19, 101, 81 and 647 ms, for a page that opens.
- A change in REAPER costs one tick at the moment it happens, where the poll found it up to 5 s late and read every 5 s whether anything changed.
- The size that grows is `TracksLive` with the chapters (every item of the saved project: 1.6 MB at 44 chapters, 11.2 MB at 300) and `ChapterTrackLinks` with the tracks (0.52 MB and 60 ms at 2,003 tracks).
- With no revision (a script from before #3859, REAPER not answering, the saved file's tracks) the page still reads every 5 s, so those rows of the table are the poll's column.
- A host that heard nothing needs no work for the event itself: `pollDawTracksChanged` compares two strings on the existing 150 ms tick.

**Not measured here:** the live path through REAPER (the `tracks_read` round trip in a real REAPER, which these runs have no DAW for: `TracksLive` here is the saved file's answer); the webview's cost of receiving and decoding the answers; Windows; the axes of audio length and take count, which the tick's reads do not depend on beyond the items the saved project holds (the 17 h and 300 chapter books carry 4,400 and 30,000 items). The event's own latency in REAPER is in [the bridge performance note](reaper-bridge-performance.md) (0.05 s after an edit).

## The Booth's idle read: every 15 s against once a minute

[#3880](https://github.com/countrymanprime/narration-studio/issues/3880), slice 2. While Record is ready and idle the record control read the DAW's capabilities, the link facts (`Bootstrap`), the project's play state and the chapter's track state (`ReadAloudReaperState`) every 15 s. When the shared track state follows REAPER's revision ([above](#the-track-list-a-5-s-poll-against-reapers-change-event)) another project or a track change arrives as `daw_tracks_changed`, which reads at once, and the timer is a 60 s backstop. A notice or a take keeps its 4 s timer; with no revision the idle timer stays 15 s. Same rig and method (`reads --runs 3`, medians, warm), three reads added to its list (`DawCapabilities`, `DawProjectState`, `ReadAloudReaperState(c-0001)`; `Bootstrap` was there). The rig has no DAW, so the three DAW reads answer that REAPER is not running: this is the host's work for a tick, not the round trip to a live REAPER.

| Book | One tick, warm, ms (`Bootstrap` + capabilities + play state + `ReadAloudReaperState`) | Before, per minute (4 ticks) | After, idle, per minute (1 tick) | Per change |
| --- | --- | --- | --- | --- |
| 3 chapters, 3 tracks | 1.6 (0.5 + 0.1 + 0.0 + 1.0) | 6.4 ms | 1.6 ms | 1.6 ms |
| 3 chapters, 2,003 tracks | 1.9 (0.5 + 0.1 + 0.0 + 1.3) | 7.6 ms | 1.9 ms | 1.9 ms |
| 44 chapters (17 h) | 16.6 (5.7 + 0.1 + 0.0 + 10.8) | 66 ms | 16.6 ms | 16.6 ms |
| 300 chapters | 66.6 (6.4 + 0.1 + 0.0 + 60.1) | 266 ms | 66.6 ms | 66.6 ms |

- Four times fewer ticks when idle at every size: 3 of 4 a minute not done, 200 ms a minute at 300 chapters. A tick's answers are 8.8 KB at every size, so the saving is the host's work and the bridge calls (four a tick), not bytes.
- `ReadAloudReaperState` is the cost that grows (60 ms at 300 chapters, with no DAW: it reads the chapter's link and the manuscript); with a live REAPER it also reads the track state through the bridge, which this rig cannot time.
- A track armed or disarmed in REAPER has no event that is known to carry it (the recorded runs say arming through the bridge leaves REAPER's change counter alone; a narrator's click on the arm button is not recorded: [recording and undo](reaper-recording-undo-2026-10-23.md), [arms and monitors](2026-11-16-booth-arms-and-monitors.md)), so the 60 s timer, focus and a press are how the Booth learns of it while idle; the script's `record_start` refuses a wrong arming whatever the page showed. A take started in the DAW is heard from the transport at once, as before.

## The REAPER start wait: one read a second against the host's event

[#3880](https://github.com/countrymanprime/narration-studio/issues/3880), slice 3. After Start REAPER the dialog read `DawCapabilities` every second for up to 10 s until the bridge answered. The host already announces the picture (`daw_capabilities_changed`, from its own tick), so the dialog now listens from before the launcher runs, reads once when the launcher returns (a REAPER already open can answer during the launch, and an unchanged picture is not announced again), then waits for the event, reading once more at the 10 s deadline in case the event was lost. The cost of the read is the `DawCapabilities` row already on the rig ([above](#the-booths-idle-read-every-15-s-against-once-a-minute)): 0.1 ms warm at every book size (3, 44, 300 chapters, 2,003 tracks), 8.8 KB across the four reads of a tick, so the saving is a count, not a size.

| Case | Reads before | Reads after |
| --- | --- | --- |
| REAPER answers within 10 s | up to 10 (one every second until it answers) | 1 (after the launcher), then the event |
| REAPER never answers | 10 | 2 (after the launcher, at the deadline) |

Not measured: the time a live REAPER takes to answer, and a live bridge round trip (the rig has no DAW). The counts are arithmetic from the code, covered by `connection.test.tsx` (`hands each read to the page until it answers` asserts no read between events; `takes the answer of its one read at the end`; `hears the DAW answer while the launcher is still running`; Playwright `reaper-start-wait.spec.ts`).

## The Booth's follow on open: asked every 2 s against once

[#3880](https://github.com/countrymanprime/narration-studio/issues/3880), slice 3. A Booth opened with no chapter in the address asks the DAW where the narrator is (`DawPlace`) and opens on that chapter. While the DAW had not answered it asked again every 2 s for 20 s (up to 10 asks); it now asks once and again when the DAW says it is reachable (its capabilities event, which the app's session also sends on a focus or a Check again), for the same 20 s, one ask at a time, and, only while a DAW that says it is reachable still refuses (REAPER loading its project: no event says it is ready), again after 2 s and then 10 s (a third retry is pulled in to just before the 20 s end, so at most 4 asks in all). Same rig and method (`reads --runs 3`, medians): `DawPlace` joins its list.

| Book | `DawPlace`, no DAW, first call \| warm | Answer | Asks while the DAW does not answer: before \| after |
| --- | --- | --- | --- |
| 3 chapters | 0.1 \| 0.0 ms | 147 bytes | 10 \| 1 |
| 44 chapters (17 h) | 0.1 \| 0.0 ms | 147 bytes | 10 \| 1 |
| 300 chapters | 0.1 \| 0.0 ms | 147 bytes | 10 \| 1 |

- With no DAW the host answers at once that it is not running, so the host's cost is the same at every size and too small to show here: the saving is the count of asks (9 fewer in the 20 s a DAW takes to connect), each of which is a request through the bridge to REAPER when one is running. A DAW that connects at second 7 is followed within a tick of its event, where the timer found it up to 2 s later.
- **Not measured:** the round trip to a live REAPER (what an ask costs there), which this rig cannot time.

## The Proof comparison's "may have changed" check: every 30 s against the edit event

[#3880](https://github.com/countrymanprime/narration-studio/issues/3880), slice 3. While a comparison's results were shown, `CompareRun` asked the host for REAPER's edit counter (`ProjectStateCheck`) every 30 s and compared it with the count the comparison started from. The host already announces every change of that counter (`daw_project_edited`), so the results now ask once when they open, hear each edit from the event (compared at once with `ProjectStateChangedSince`, a pure comparison that reads nothing), and ask again only every 5 minutes as a backstop for a lost event. Same rig and method (`reads --runs 3`, medians, books of 3, 44 and 300 chapters), one row added (`ProjectStateCheck`). The rig has no DAW, so the row times the host's immediate refusal (no bridge): `0.0` ms warm at every size, a 32-byte answer, 0 files decoded. That is the host's work, not the round trip to a live REAPER, which this rig cannot time.

| Results shown for | Asks of REAPER before | After (once, then a backstop every 5 min) | Edits heard |
| --- | --- | --- | --- |
| 1 minute | 3 | 1 | each, at once, no read |
| 10 minutes | 21 | 3 | each, at once, no read |
| 1 hour | 121 | 13 | each, at once, no read |

- The saving is the count of asks (each a request through the bridge to REAPER while it runs): 9 in 10 fewer over an hour. The label also appears at the edit instead of up to 30 s later.
- **Not measured:** the round trip of a check to a live REAPER, the label's delay after a real edit, and a comparison left open for hours.

## Editing's heartbeat follow of the DAW's play: four reads a second against the transport event

[#3880](https://github.com/countrymanprime/narration-studio/issues/3880), slice 3. When the transport sync is not usable (the `transport_sync` capability is unavailable, for instance an older bridge script) but the heartbeat is, the Editing page lights the word REAPER is playing from a fallback, `useDawPlayPosition`, which read `DawProjectState` four times a second whenever the DAW was reachable and the page visible, played or not. The read answers from the host's heartbeat cache, which the host refreshes about every 1.5 s, so most of those reads returned the value the one before had. The host already pushes the same position: `daw_transport_changed` carries `position` (project seconds, as of the last heartbeat) while the DAW plays and is pushed again each time it moves, and the app's DAW session holds it. The fallback now follows that event and reads `DawProjectState` only every 30 s, as the backstop for an event that was lost. Same rig and method, one existing row (`DawProjectState`): `0.0` ms warm at every size (3, 44, 300 chapters; the rig has no DAW, so it times the host's immediate answer from its cache), so the saving is a count of calls from the page to the host.

| Editing page visible, DAW reachable | Reads a minute before | After |
| --- | --- | --- |
| DAW stopped | 240 | 2 |
| DAW playing | 240 | 2 (the position comes on the event, about every 1.5 s) |

- A hundred and twenty times fewer calls to the host, stopped or playing; the word is lit from the event as the heartbeat moves (every 1.5 s, the same steps the 4 Hz read saw).
- **Not measured:** the delay between a real play and its transport event in a running app, and what the page costs while REAPER plays for hours.

## Not measured

- **Windows: pending.** `.github/workflows/host-read-bench-windows.yml` runs the seed and the read table on a Windows runner once it is on `main`; the counts of the budget test run on Windows in CI. Owner: one launch of the real book with debug logging on gives the same `ui.call.ok` lines as the launch table.
- **A cold start**, with the operating system's file cache empty.
- **The split of a call's wait between the host and the bridge to the page.** The page logs the whole wait; the host's share is the read table's, measured alone and not under the page's concurrent calls.
- **A real recogniser's result size.** The stand-in hears every word, so each result is the size of a clean read; a real run's result on real speech was not compared.
- **300 chapters on the mock**, which sizes a book in hours only. The reader table above is the page's calls on the mock; the saved milliseconds on the real host are taken from the read table, not measured under the page's concurrent calls.
- **A live DAW and audio:** `PickupsCount`, `WorkspacePeaks` on real audio, take evidence and delivery measurements.
- **The four sections above (#3897, #3958, the cache pass, the folder passes):** Linux only, one cloud container, two or three processes each. Audio length per chapter was not varied: the seeded takes hold no audio and none of these changes decodes audio. What the narrator pays after an entry expires was not measured: an editing scan unused for 24 hours is decoded again the next time its item is scanned (the decode costs of `MeasureRange` and the editing scan are in the sections above). The passes were timed alone, not beside a recording check or editing writes. The cache entries are synthetic (equal 8 KB blobs, one age mix for every kind, no real peaks or words); the added stat of a cache hit was not timed. No real narrator's book. Windows: not measured.
- **Run counts** are small (one to five), so differences under 10 % between cells are noise.
- **The Editor, Booth and Production moves (#3658):** real-host timing under the pages' concurrent calls, Windows, 300 chapters on the mock (the mock sizes a book in hours), a cold OS file cache, and the pages' time to usable (the mock's milliseconds are fixtures).

## Schedule, Companion and the pace on the shared list (#4062)

The Schedule, the Companion's "This chapter" and the finished-hour pace no longer read the chapters from `productionOverview`: they take the chapter set, names, kinds, words and recorded seconds from the shared chapter list (the store's `chapters` slot), and the overview's `hoursLogged`, `pfh` and `readiness` stay on the overview, matched by id. The Schedule's first read serves the held list; its minute tick, focus and Retry read it fresh. The measurements port no longer has `chapterLengths`, so the pace is no longer a second overview read on every page that shows it.

Mock host, `scripts/dev/page-bench.mjs`, 1, 5, 17 and 40 h, `--runs 5`, `main` (bf91de08f) against this change, one build after the other. Calls / answer KB, cold then warm:

| Page | 1 h | 5 h | 17 h | 40 h |
| - | - | - | - | - |
| Production cold, main | 50 / 119 | 50 / 157 | 50 / 237 | 50 / 388 |
| Production cold, this change | 46 / 111 | 46 / 136 | 46 / 187 | 46 / 285 |
| Production warm, main | 32 / 61 | 32 / 88 | 32 / 151 | 32 / 268 |
| Production warm, this change | 28 / 52 | 28 / 67 | 28 / 101 | 28 / 164 |
| Schedule cold, main | 26 / 80 | 26 / 94 | 26 / 126 | 26 / 186 |
| Schedule cold, this change | 24 / 75 | 24 / 81 | 24 / 93 | 24 / 118 |
| Schedule warm, main | 12 / 32 | 12 / 40 | 12 / 59 | 12 / 95 |
| Schedule warm, this change | 10 / 27 | 10 / 27 | 10 / 27 | 10 / 27 |
| Booth cold and warm | unchanged: 60 / 142-186 cold, 49 / 105 warm | | | |

Nodes are unchanged on all three pages. Time to usable moved by less than the run-to-run spread (Production cold at 40 h read 639 ms on main and 780 ms here; the other cells differ by under 10 %), so no time gain is claimed: the mock's milliseconds are fixtures. The saved calls are the overview reads the pace and the Schedule made beside the page's own, and the saved KB are their answers, which carried every chapter's title and numbers. This was done for consistency, not for speed.

Not measured: the real host and Windows, 300 chapters on the mock, the Companion (it is not in the page list of the bench), the Schedule's minute tick (it now reads the chapter list, not the overview).
