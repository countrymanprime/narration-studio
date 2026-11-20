# Host reads and page loads on seeded books (2026-11-20)

**What it settles:** what each page's host reads cost, and how long the real app keeps reading after a launch or a page change, on books of 1, 17 and 40 hours and of 300 chapters that carry a narrator's work. It is the baseline for the performance work of [#3751](https://github.com/countrymanprime/narration-studio/issues/3751), taken with the committed harness of [#3803](https://github.com/countrymanprime/narration-studio/issues/3803) on `main` at `270bbb7`, so each later change and the owner's own book can be measured the same way.

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
| `PickupsList` | 53 \| 19 | 1,049 \| 1,049 | 2,825 \| 2,435 | 3,329 \| 3,412 | 636.3 KB / 1.49 MB |
| `ManuscriptChapters` | 38 \| 11 | 713 \| 685 | 1,638 \| 1,580 | 2,434 \| 2,161 | 64.1 KB / 149.6 KB |
| `ProductionOverview` | 37 \| 10 | 806 \| 704 | 1,745 \| 1,685 | 2,422 \| 2,224 | 15.3 KB / 34.2 KB |
| `ChapterSyncState` | 29 \| 5.6 | 368 \| 344 | 902 \| 767 | 1,210 \| 1,074 | 18.3 KB / 42.2 KB |
| `FindingsList({})` | 3.6 \| 4.2 | 69 \| 60 | 159 \| 137 | 66 \| 64 | 3.21 MB / 7.51 MB |
| `FindingsSummary` | 2.0 \| 2.6 | 36 \| 37 | 95 \| 81 | 53 \| 41 | 1.9 KB / 4.1 KB |
| `WorkspaceAlignment(c-0001)` | 24 \| 9.5 | 61 \| 18 | 154 \| 32 | 294 \| 82 | 619.4 KB / 619.4 KB |
| `StageRecommendations` | 3.0 \| 0.8 | 35 \| 9.0 | 70 \| 18 | 259 \| 54 | 6.3 KB / 14.6 KB |
| `ChapterTrackLinks` | 4.2 \| 1.0 | 36 \| 9.3 | 90 \| 29 | 290 \| 158 | 55.0 KB / 128.2 KB |
| `GuideEntities` | 0.6 \| 0.8 | 7.8 \| 8.9 | 28 \| 19 | 8.3 \| 8.8 | 295.7 KB / 695.1 KB |
| `GuideDialogueCues` | 1.1 \| 1.0 | 7.5 \| 7.5 | 19 \| 18 | 7.9 \| 8.8 | 251.6 KB / 589.0 KB |
| `MarksList` | 2.2 \| 0.8 | 18 \| 12 | 60 \| 42 | 21 \| 12 | 542.7 KB / 1.27 MB |
| `Bootstrap` | 0.5 \| 0.4 | 5.1 \| 5.0 | 11 \| 11 | 5.4 \| 5.6 | 1.2 KB / 1.2 KB |
| `ManuscriptParagraphs(c-0001)` | 0.7 \| 0.1 | 4.8 \| 0.1 | 15 \| 0.1 | 6.0 \| 0.0 | 27.1 KB / 27.1 KB |
| `SystemSettingsForScope(project)` | 5.4 \| 4.4 | 4.0 \| 3.8 | 3.9 \| 3.8 | 6.7 \| 4.6 | 18.7 KB / 18.7 KB |

- The four reads every page waits for (`PickupsList`, `ManuscriptChapters`, `ProductionOverview`, `ChapterSyncState`) cost the same warm as cold: what they compute is not kept between calls.
- At `710bd32`, before the ledger kept its decoded records ([#3759](https://github.com/countrymanprime/narration-studio/pull/3759)), the research for #3751 timed `ManuscriptChapters` at 3.6 s for 17 h, 16.4 s for 40 h and 111 s for 300 chapters. It is 0.71 s, 1.64 s and 2.43 s here.
- After every read the host holds 2.8 MB (1 h), 10.0 MB (17 h), 21.0 MB (40 h) and 38.6 MB (300 chapters) more than a host that has read nothing.

### The work behind the slow reads

Files decoded (first call / warm), record folders listed, and allocations of the first call. These are the counts `TestTheSlowReadsStayInsideTheirBudgetsOnA44ChapterBook` caps in CI, on a 44-chapter book with short chapters; they follow the chapters and their checks, so the 17 hour column is that test's.

| Binding | 17 h | 17 h, 10 of 44 checked | 17 h, checked three times | 40 h | 300 chapters |
| --- | --- | --- | --- | --- | --- |
| `PickupsList` | 528 / 481, 268, 3.26 M | 256 / 243, 132, 1.20 M | 616 / 481, 268, 3.44 M | 1177 / 1071, 622, 8.01 M | 3344 / 3041, 1804, 13.20 M |
| `ManuscriptChapters` | 341 / 298, 178, 2.23 M | 103 / 94, 42, 0.74 M | 429 / 298, 178, 2.36 M | 754 / 652, 414, 5.41 M | 2133 / 1834, 1202, 9.23 M |
| `ProductionOverview` | 391 / 348, 178, 2.26 M | 153 / 144, 42, 0.78 M | 479 / 348, 178, 2.40 M | 863 / 761, 414, 5.49 M | 2439 / 2140, 1202, 9.48 M |
| `ChapterSyncState` | 199 / 155, 88, 1.21 M | 131 / 121, 88, 0.61 M | 287 / 155, 88, 1.29 M | 435 / 332, 206, 2.92 M | 1223 / 923, 600, 5.24 M |
| `FindingsSummary` | 44 / 44, 2, 0.12 M | 44 / 44, 2, 0.12 M | 44 / 44, 2, 0.12 M | 103 / 103, 2, 0.29 M | 300 / 300, 2, 0.14 M |

- One chapter-list read of a 44-chapter book decodes 298 files and lists 178 folders once the ledger is in memory: about 7 decodes and 4 listings a checked chapter.
- A book checked in part pays for its checked chapters: 10 of 44 costs a quarter to a third of the full book's time.
- Earlier checks of a chapter cost a decode each on the first read (88 more for 88 more records) and nothing after it; the time of the four reads is within about 10 % of the book checked once.

| Binding | 17 h, every chapter checked | 10 of 44 checked | Checked three times |
| --- | --- | --- | --- |
| `PickupsList` | 1,049 \| 1,049 | 416 \| 297 | 1,161 \| 1,134 |
| `ManuscriptChapters` | 713 \| 685 | 226 \| 176 | 743 \| 703 |
| `ProductionOverview` | 806 \| 704 | 216 \| 188 | 768 \| 648 |
| `ChapterSyncState` | 368 \| 344 | 166 \| 112 | 372 \| 330 |
| `FindingsSummary` | 36 \| 37 | 36 \| 37 | 33 \| 33 |

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

- Every page's slowest call is the pickup list, which the shell reads on each page change. At 17 h it takes 1.1 to 4.0 s on most pages against 1.05 s on the host alone, and 9 to 16 s on Proof and Pickups, where it is asked for several times while findings are read.
- A second visit costs what the first did: nothing a page reads is kept.
- Proof, Pickups and the Booth make reads on timers and after delays, so their last answer at 1 h (6 to 20 s) is not load time; compare a page across sizes, not with another page.
- **40 h.** After the first visit of Pickups the app did not go quiet within the 15 minute limit: its last answer came at 291 s, one `TracksLive` answer took 140 s, and the window then stopped answering the accessibility bus, so the rows after it are "n/r" (not reached). The pickup list at that size is 1.49 MB.
- Editing at 300 chapters makes 406 calls over 122 s.

## Not measured

- **Windows: pending.** `.github/workflows/host-read-bench-windows.yml` runs the seed and the read table on a Windows runner once it is on `main`; the counts of the budget test run on Windows in CI. Owner: one launch of the real book with debug logging on gives the same `ui.call.ok` lines as the launch table.
- **A cold start**, with the operating system's file cache empty.
- **The split of a call's wait between the host and the bridge to the page.** The page logs the whole wait; the host's share is the read table's, measured alone and not under the page's concurrent calls.
- **A real recogniser's result size.** The stand-in hears every word, so each result is the size of a clean read; a real run's result on real speech was not compared.
- **The mock pages:** 300 chapters on the mock (it sizes a book in hours only), first paint at 1 h and 17 h, and the warm Settings cell of `scripts/dev/page-bench.mjs`.
- **A live DAW and audio:** `PickupsCount`, `WorkspacePeaks` on real audio, take evidence and delivery measurements.
- **Run counts** are small (one to three), so differences under 10 % between cells are noise.
