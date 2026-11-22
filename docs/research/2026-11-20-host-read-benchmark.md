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

## Not measured

- **Windows: pending.** `.github/workflows/host-read-bench-windows.yml` runs the seed and the read table on a Windows runner once it is on `main`; the counts of the budget test run on Windows in CI. Owner: one launch of the real book with debug logging on gives the same `ui.call.ok` lines as the launch table.
- **A cold start**, with the operating system's file cache empty.
- **The split of a call's wait between the host and the bridge to the page.** The page logs the whole wait; the host's share is the read table's, measured alone and not under the page's concurrent calls.
- **A real recogniser's result size.** The stand-in hears every word, so each result is the size of a clean read; a real run's result on real speech was not compared.
- **300 chapters on the mock**, which sizes a book in hours only. The reader table above is the page's calls on the mock; the saved milliseconds on the real host are taken from the read table, not measured under the page's concurrent calls.
- **A live DAW and audio:** `PickupsCount`, `WorkspacePeaks` on real audio, take evidence and delivery measurements.
- **The three sections above (#3897, #3958, the cache pass):** Linux only, one cloud container, two or three processes each. Audio length per chapter was not varied: the seeded takes hold no audio and none of these changes decodes audio. What the narrator pays after an entry expires was not measured: an editing scan unused for 24 hours is decoded again the next time its item is scanned (the decode costs of `MeasureRange` and the editing scan are in the sections above). The passes were timed alone, not beside a recording check or editing writes. The cache entries are synthetic (equal 8 KB blobs, one age mix for every kind, no real peaks or words); the added stat of a cache hit was not timed. No real narrator's book. Windows: not measured.
- **Run counts** are small (one to three), so differences under 10 % between cells are noise.
