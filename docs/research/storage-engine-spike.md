# Storage engine: JSON files or an embedded database

**Measured 2026-10-18 on Linux and on a Windows runner ([Windows](#windows)).** Question from the owner, who narrates a 17-hour, 35-chapter book of about 150,000 words: the app keeps everything as JSON files (a temp file renamed over the old one, a read class per file). Is an embedded database better at that size, and which one? An earlier review answered "SQLite is not worth it" on the assumption of tiny data and load-the-whole-file access. This note re-tests that assumption. The benchmark is a throwaway module, [`src/studio/desktop/cmd/spike-storage`](../../src/studio/desktop/cmd/spike-storage/README.md); the app's `go.mod` and `go.sum` are untouched.

## Answer

**Keep JSON as the source of truth. Add a derived, disposable SQLite index for the data that is read across chapters, and fix two write costs inside JSON.** A full move to SQLite is not justified by these numbers and gives up properties the repository is built on ([principle 11](../architecture/principles.md), [data files](../reference/data-files.md)).

- At 150,000 words JSON is not slow for what the app does most. Loading one chapter's alignment or transcript takes 4 to 25 ms in every engine (measured), the same as SQLite.
- JSON is slow in three places, all measured: opening a project (0.54 s warm, 1.8 s after the file cache is dropped, at 5,000 chapters), any question across chapters (findings and pickups: 200 to 360 ms), and any edit that rewrites a big file (one mark: 23 to 96 ms and 1 to 4.3 MiB written; an undo group of 20 decisions: 1.1 to 2.4 s).
- A SQLite index answers the same questions in 0.3 to 11 ms, opens in 20 to 75 ms, and commits an edit in 0.1 ms with 4 KiB written (all measured). It rebuilds from the JSON files in 3.5 to 5.4 s for everything, so it can be deleted at any time.
- bbolt is rejected: no queries, 100 MiB for a 100 MiB project, one process only. DuckDB, Parquet and Arrow do not fit ([below](#what-else-was-considered)).
- Issue [#1764](https://github.com/countrymanprime/narration-studio/issues/1764) (a 5,000-chapter book taking about 29 s to load) is not a storage problem: it is 35,000 mounted tooltips and a 186k-node DOM. Reading the same 5,000-chapter project from JSON takes 0.8 s (measured).

## Method

- **Project.** A deterministic generator writes a project with the real schemas where the app exports them: findings through the real `findings.Store`, coverage results as `coverage.StoredResult` with one `TokenLine` per script word (written with `MarshalIndent`, as `coverage/results.go` does), the ASR word files and the waveform peaks through the real `evidence.CacheStore` (the cache envelope base64-encodes its blob, so peaks are base64 twice), marks as `marks.Mark`, decisions as `findings.Decision`. The manuscript file, the pickup list and the Story Bible mirror the documented shape rather than import it (estimated shape, `src/studio/sidecars/manuscript-guide/core/manuscript_guide.py` for the Bible). Words are Zipf-distributed pseudo-words with 300 names.
- **Scales** (measured counts from the generator):

| | script words | chapters | ASR words (takes) | findings / decisions | marks | pickups | audio |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `full` | 159,319 | 35 | 308,938 (69) | 6,372 / 2,835 | 2,387 | 300 | 18.1 h |
| `max` | 153,015 | 35 | 451,426 (105) | 12,241 / 5,479 | 9,995 (the ceiling) | 600 | 17.3 h |
| `stress` | 201,648 | 5,000 | 201,648 (5,000) | 8,065 / 3,647 | 2,997 | 500 | 22.4 h |

- **Backends.** `json` is today's code path: reads through `persist.Reporter.ReadJSON`, findings through the real store, the cache through the real `CacheStore`; writes replicate `marks.write` (indent, temp file, rename, no fsync). `json+fsync` adds a file sync before and a directory sync after the rename. `modernc` is `modernc.org/sqlite` v1.60.1, `ncruces` is `github.com/ncruces/go-sqlite3` v0.35.6 (both SQLite 3.53.4, `CGO_ENABLED=0`, WAL, `synchronous=NORMAL`, a pool of four connections), with FTS5 over the paragraphs. `bbolt` is `go.etcd.io/bbolt` v1.5.0, one value per record, no secondary indexes (cross-chapter questions are scans). The SQLite schema is the whole project as tables; the index is built by reading the JSON files the way the host would.
- **Measuring.** Each backend runs in its own process so memory is not shared. Each operation runs 3 to 40 times (until a time budget is spent) and the table gives p50 and p95. "Cold" means a new process with the operating system's file cache warm, except the rows marked "cache dropped" (`echo 3 > /proc/sys/vm/drop_caches`, one run each). Bytes written are the process's `wchar` from `/proc/self/io` (every write the process asked for: temp file, WAL, pages). Memory is VmRSS and VmHWM. The query results of all backends were compared and agree.
- **Machine.** A 4-vCPU Intel Xeon 2.1 GHz virtual machine, 16 GB, ext4 on a virtual disk, Linux 6.18, Go 1.27.2. **Not the owner's machine and not Windows**; fsync cost and file-system behaviour differ, so read the ratios, not the milliseconds.

## Findings

All numbers below are **measured** unless marked **(estimate)**. p50 / p95 in ms; "KiB" is bytes written per run.

### The book (`full`: 35 chapters, 159k words, 309k ASR words)

| operation | json | json+fsync | modernc | ncruces | bbolt |
| --- | --- | --- | --- | --- | --- |
| open the project | 536 / 598 | 534 / 596 | 22 / 25 | 24 / 26 | 144 / 155 |
| load a chapter's text | 4.7 / 5.8 | 3.2 / 4.8 | 0.1 / 0.1 | 0.1 / 0.1 | 0.1 / 0.1 |
| load a chapter's alignment (about 4,500 tokens) | 13.8 / 25 | 11.9 / 19.5 | 10.9 / 17.1 | 5.7 / 10.5 | 10.7 / 15.9 |
| load a chapter's ASR words, one take | 7.3 / 10.5 | 7.1 / 12.4 | 5.9 / 10.1 | 3.3 / 4.5 | 4.7 / 6.5 |
| list all marks | 9.3 / 13.1 | 9.8 / 11.8 | 14.8 / 17.1 | 7.6 / 9.6 | 15.2 / 24.5 |
| findings with severity at least warning | 217 / 235 | 208 / 258 | 5.1 / 6.5 | 6.0 / 6.4 | 25 / 43 |
| unresolved pickups (list + findings, by chapter) | 199 / 256 | 192 / 206 | 0.3 / 0.4 | 0.4 / 0.6 | 26 / 34 |
| paragraphs naming a character: p50 for a common / a rare name | 8.1 / 8.7 | 8.7 / 9.1 | 0.8 / 0.0 | 1.4 / 0.0 | 6.4 / 7.3 |
| full-text, a common word | 9.6 / 11 | 6.1 / 9.5 | 5.7 / 6.6 | 6.9 / 8.2 | 5.3 / 8.2 |
| full-text, a rare word | 7.9 / 10.7 | 8.0 / 8.7 | 0.1 / 0.1 | 0.1 / 0.1 | 5.6 / 8.5 |
| edit one mark (KiB written) | 23.5 (1,043) | 26.2 (1,021) | 0.0 (4) | 0.0 (4) | 0.3 (24) |
| edit one alignment word (KiB written) | 22.6 (986) | 25.7 (986) | 0.0 (4) | 0.0 (4) | 15.4 (1,124) |
| accept one finding (KiB written) | 63 (610) | see note | 0.1 (32) | 0.1 (32) | 0.5 (28) |
| undo group: 50 marks in one transaction (KiB) | 23 (1,031) | 25 (1,021) | 0.7 (165) | 0.9 (165) | 1.3 (64) |
| undo group: 20 finding decisions (KiB) | 1,073 (12,054) | see note | 1.3 (245) | 0.9 (245) | 2.4 (172) |

`json+fsync` writes marks and coverage results with a sync; the finding decisions go through the real `findings.Store`, which has no fsync, so its two decision rows repeat the same code and are not comparable (the second backend re-applied decisions the first had already recorded). The 12 to 14 ms p95 on SQLite's 20-decision undo (against a 1 ms p50) was not investigated.

**Where the JSON open time goes** (last run, ms): coverage results of all 35 chapters 380 (35.6 MiB of indented JSON, read only to get each chapter's present-token count), findings 98 (every scope file plus `review.json`), marks 10, everything else under 10. **After dropping the file cache** the first open took 582 ms (json), 39 ms (modernc), 47 ms (ncruces), 401 ms (bbolt).

### At the ceilings (`max`: 3 takes everywhere, 10,000 marks, 12,241 findings)

| operation | json | modernc | ncruces |
| --- | --- | --- | --- |
| open the project | 561 / 610 | 75 / 102 | 59 / 87 |
| list all marks | 28.6 / 46 | 47 / 63 | 34 / 57 |
| findings with severity at least warning | 314 / 354 | 9.7 / 10.9 | 11.1 / 18.1 |
| edit one mark (KiB written) | 96 (4,370) | 0.0 (4) | 0.0 (4) |
| undo group: 20 decisions (KiB) | 2,060 (23,078) | 1.0 (290) | 0.8 (290) |

Listing 10,000 marks is the one read where SQLite is slower than JSON (47 ms against 29 ms in modernc): the JSON file is one sequential read and a decode, the table is 10,000 rows scanned through `database/sql`.

### 5,000 chapters (`stress`, issue #1764)

JSON open 842 / 900 ms (1,846 ms with the cache dropped; 21,137 files), modernc 41 / 50 ms (62 ms dropped), ncruces 49 / 57 ms (77 ms dropped), bbolt 196 ms. Findings query: json 361 ms, SQLite 6 to 8 ms. Accepting 20 findings at once: json 2.4 s, SQLite 1.3 ms. Loading one chapter is 0.1 ms everywhere because a chapter is 40 words. The JSON cost is 0.64 s of results files, 0.19 s of findings scope files. None of this is the 29 seconds in the issue.

### Memory (MB RSS, peak = VmHWM)

| | json | modernc | ncruces | bbolt |
| --- | --- | --- | --- | --- |
| `full`, after open / peak | 26 / 32 | 20 / 23 | 19 / 20 | 29 / 71 |
| `max`, peak | 46 | 22 | 20 | 89 |
| `stress`, peak | 47 | 22 | 22 | 39 |

The Go process starts at 13 MB. bbolt maps its file, so its resident size follows what was touched.

### Size on disk

| | JSON files | zipped | modernc / ncruces file | zipped | bbolt file |
| --- | --- | --- | --- | --- | --- |
| `full` | 78.3 MiB (318 files) | 28.8 MiB | 47.0 MiB | 22.8 MiB | 73.6 MiB |
| `max` | 102.0 MiB (390 files) | 41.2 MiB | 67.2 MiB | 32.4 MiB | 100.2 MiB |
| `stress` | 84.2 MiB (21,137 files) | 32.1 MiB | 54.5 MiB | 16.8 MiB | 90.9 MiB |

In `full`, the JSON is 35.6 MiB of coverage results (indented tokens), 32.1 MiB of analysis cache (ASR words and doubly base64-encoded peaks), 7.4 MiB of findings, 1.0 MiB each of marks, Bible and manuscript.

### Index build (the migration cost of a derived index)

From the JSON files, in seconds: modernc 3.96 / 5.43 / 4.38 (`full` / `max` / `stress`), ncruces 3.55 / 5.11 / 3.91, bbolt 1.06 / 1.48 / 2.52. About half is the ASR words (309k to 451k inserts). Peak memory 34 to 53 MB for SQLite, 146 to 211 MB for bbolt. An index of only findings, decisions, marks, pickups, paragraphs and chapter summaries would skip the two largest imports: **(estimate)** 1 to 1.5 s and a few MiB; this subset was not built or timed.

### Reads while another process writes

Four reader goroutines for 4 s; a second process commits one mark edit every 20 ms.

| backend | writer commit p50 / p95 | commits in 4 s | read errors | writer errors | chapter-load p50 alone → with writer |
| --- | --- | --- | --- | --- | --- |
| json (`full`) | 21.9 / 30.2 | 119 | 0 | 0 | 12.7 → 14.1 |
| json (`max`) | 82.1 / 123.6 | 47 | 0 | 0 | 10.6 → 11.3 |
| modernc | 0.2 / 0.3 | 244 | 0 | 0 | 10.3 → 10.9 |
| ncruces | 0.2 / 0.3 | 243 | 0 | 0 | 5.4 → 5.9 |
| bbolt (writer in the same process) | 2.0 / 8.0 | 205 | 0 | 0 | 13.9 → 17.2 |

No reader saw a torn file or a lock error in any backend, because the rename is atomic on Linux and WAL readers do not block. The JSON writer manages 119 commits against SQLite's 243 because each of its commits takes 22 ms on top of the 20 ms pause. **bbolt cannot be opened by a second process** (it takes an exclusive file lock), so a sidecar could never write to it; the bbolt row had to put the writer in the reader's process. On the ncruces limit the owner asked about: this version (v0.35.6, built with the default tags) reports `SupportsFileLocking = true` and `SupportsSharedMemory = true` on Linux, uses `mmap` for the WAL index, and ran four pooled connections plus a second process without error. The single-connection rule (`SetMaxOpenConns(1)` with `EXCLUSIVE` locking) applies only to a build without those two features; both are also true on Windows ([Windows](#windows)). ncruces also needs `ext/fts5` registered on every connection (an `Open` callback); without it `CREATE VIRTUAL TABLE ... USING fts5` fails with "no such module".

### kill -9 in the middle of a write

A child process rewrites a 5,000-record state in a loop and prints an acknowledgement after each commit; the parent kills it 5 to 155 ms after the first one, 60 times per backend and per scale, and checks the state.

| backend | kills | consistent | torn or unparseable | mixed versions | lost an acknowledged commit | integrity check failed |
| --- | --- | --- | --- | --- | --- | --- |
| json (temp file + rename, as today) | 60 | 60 | 0 | 0 | 0 | |
| json, written in place (control) | 60 | 52 to 53 | 7 to 8 | 0 | 0 | |
| modernc | 60 | 60 | 0 | 0 | 0 | 0 |
| ncruces | 60 | 60 | 0 | 0 | 0 | 0 |
| bbolt | 60 | 60 | 0 | 0 | 0 | 0 |

(This test does not depend on the project, so the `full`, `max` and `stress` runs are three repeats: the atomic write was consistent 60 of 60 each time, and the in-place control tore 8, 7 and 7 of 60.) The temp-file-and-rename write the app uses is as safe against a killed process as a database commit; the control shows what it is protecting against. **This tests a killed process only.** A power cut or operating-system crash was not tested, and it is where the two differ by design: the writers read for this note (`marks.write`, the coverage result store, the analysis cache) write the temp file and rename it **without calling `Sync`**, so after a power cut a renamed file can come back empty or short on a journaling file system; SQLite in WAL mode with `synchronous=NORMAL` syncs the WAL at checkpoints and `FULL` syncs every commit. Adding `Sync` to the JSON writes cost nothing visible here (23.5 to 26.2 ms for a mark edit on this virtual disk), but a real disk and Windows will differ.

### Binary size

Adding a driver to an otherwise empty Go program (stripped, measured): modernc +4.7 MB on Linux (+4.4 MB Windows), ncruces with `ext/fts5` +6.6 MB (+6.7 MB Windows). modernc's FTS5 is built in.

## What else was considered

- **bbolt.** Fast point reads and a good write path (0.3 ms to edit a mark, 4 KiB-page copy-on-write), but it is a key-value store: every cross-chapter question is a scan the app writes and decodes (25 to 50 ms for findings, 5 to 15 ms for a name), there is no full-text search, the file is 100 MiB for a 100 MiB project, and one process holds it. Not a fit for a project that sidecars also write.
- **DuckDB, Parquet, Arrow.** Not benchmarked. DuckDB's Go driver needs cgo (a standing constraint is `CGO_ENABLED=0`) and a native library per platform; Parquet and Arrow are columnar formats for large analytic scans, and this data is a few hundred thousand rows with many small point updates. Their strength (scanning billions of values) is not the workload, and none is human-inspectable.
- **JSON with the two mitigations.** The two measured read costs also have a JSON-only fix: keep a small per-chapter summary (present tokens and the like) so open does not decode 35 MiB, and cache `findings.Store.readAll` in the process so a query is not a directory walk. **(Estimate)** open under 50 ms, a findings query under 20 ms. This leaves out cross-chapter joins, full-text ranking and anything that needs an index; it is the cheaper path if the owner does not want a dependency.

## Constraints from the repository

| Constraint | JSON | SQLite as the source of truth | SQLite as a derived index |
| --- | --- | --- | --- |
| Files beside the `.rpp`, per-project portability, copy or zip the folder | yes | yes (one file, a `-wal` and a `-shm` beside it while open) | yes; the index is not needed in a copy |
| Human-inspectable and diffable | yes | no | the sources stay so |
| Read classes: kept aside, healed, refused | per file | would become one decision for the whole database | the index is the `Disposable` class: unreadable or stale means delete and rebuild |
| A hand edit cannot run anything | a JSON value only | a database file can carry views, triggers and a schema the app did not write (`PRAGMA trusted_schema=OFF` and `defensive` narrow this) | a bad file is deleted, never trusted |
| Sidecars read and write the same files | Python reads `manuscript.json` and others | would need a SQLite binding in every Python sidecar | only the host reads it |
| Backup / zip | 28.8 MiB zipped (`full`) | 22.8 MiB | not needed |
| New dependency | none | yes | yes (+4.7 MB; modernc is BSD-3-Clause, ncruces MIT) |

## Decision rule

Move a data set into the index when a question must run across chapters or the whole project and the JSON route reads every file to answer it (the [100 ms acknowledgment](../architecture/interaction-feedback.md#the-standard) is the test: findings and pickups queries take 200 to 360 ms in JSON). Keep a data set out of the index when it is read and written one file at a time (a chapter's alignment, ASR words and peaks load as fast from JSON as from a table, and indexing them is the 2 s of the build and 20 MiB of the file for no gain). Make SQLite the source of truth for a data set only when its JSON rewrite is the cost and a split cannot fix it; the one candidate is `marks.json` (96 ms and 4.3 MiB for one edit at the 10,000-mark ceiling), and splitting it per chapter is the cheaper first try.

## Recommendation

1. **First slice: a findings, pickups and chapter-summary index.** A new package builds `narration-studio/index.db` (a derived file, `Disposable`) from the findings scope files, `review.json`, `pickup-list.json` and the per-chapter coverage summary; each source file's path, size and modification time are recorded in a table, and the index is rebuilt if any differs or it cannot be opened. `findings.Store` (the only writer of the findings files) keeps it current on each save. It serves the Review and Production questions and `locate`, which is what makes one decision scan every scope file today. Expected effect: project open from about 0.54 s to under 0.1 s, findings and pickups queries from 200 to 360 ms to under 12 ms, accepting 20 findings from 1 to 2 s to the cost of one `review.json` rewrite (about 25 ms). The JSON files stay the record. **(Estimate; the slice itself was not built.)**
2. **Second slice: full-text search and name occurrences** over the manuscript paragraphs in the same index, added when a page needs it. Today's linear scan is 8 to 16 ms for 150k words, so this is a ranking and snippet feature, not a speed fix.
3. **Fix inside JSON:** split `marks.json` per chapter (or per chapter range), write one `review.json` rewrite for a group of decisions, and retry a failed rename or an `Unreadable` read a few times with a short pause (the Windows run lost 4 to 10 saves in 120 to 150 with four readers spinning on the file). None needs the index.
4. **Do not index** the ASR words, the alignment tokens or the peaks.
5. **Driver.** Both passed every test with no error and are within a factor of two of each other at this size (ncruces about 1.5 to 2 times faster on chapter loads and 1 MB lighter in memory; modernc 1.9 MB smaller in the binary, FTS5 built in, no per-connection extension step). Prefer **`modernc.org/sqlite`**: it has the simpler setup and the longer record, and the speed difference does not reach the 100 ms threshold; the Windows run showed neither ncruces' locking features missing nor modernc slower there. This is a judgment, not a measured result.
6. **Migration cost of slice 1.** No data migration (the JSON is unchanged and the index builds itself on first open). Work: the index package and its rebuild-on-mismatch path, a row in [data files](../reference/data-files.md) (location, schema, `Disposable`, "safe to delete"), a threat-model row only if the index is opened with any untrusted input (it is not: only the host writes it), supply-chain review of the new module and its `modernc.org/libc` family, tests for stale, missing, corrupt and half-written index (the kill test above is the template), and `go.mod` growth. A full move would instead rewrite about 30 stores and their read classes, and drop the diffable files; **(estimate)** several weeks, and not recommended on this evidence.

## Windows

Measured on a GitHub-hosted `windows-latest` runner (4 vCPU, `D:` drive, Go 1.27.2, `CGO_ENABLED=0`) by the manual `Storage spike (Windows)` workflow, `full` scale, same code and dataset as the Linux run. Windows is the one supported platform. The raw output of the workflow run is its log and artifact (runs [39143851042](https://github.com/countrymanprime/narration-studio/actions/runs/39143851042) and [39147532089](https://github.com/countrymanprime/narration-studio/actions/runs/39147532089)); the `max` and `stress` scales were not run on Windows. The runner is faster than the Linux VM, so compare ratios.

| p50 / p95 ms, Windows `full` | json | json+fsync | modernc | ncruces | bbolt |
| --- | --- | --- | --- | --- | --- |
| open the project | 287 / 302 | 288 / 324 | 16.6 / 19.9 | 19.7 / 21.1 | 96 / 105 |
| load a chapter's alignment | 6.3 / 9.4 | 6.6 / 9.5 | 5.4 / 8.0 | 3.3 / 5.5 | 6.0 / 8.1 |
| findings with severity at least warning | 97 / 105 | 97 / 102 | 5.3 / 6.0 | 6.1 / 8.1 | 17 / 19 |
| unresolved pickups | 94 / 99 | 95 / 102 | 0.0 / 2.0 | 0.0 / 1.6 | 18 / 20 |
| full-text, a rare word | 4.1 / 6.1 | 4.9 / 6.1 | 0.0 / 0.6 | 0.0 / 0.3 | 3.7 / 4.3 |
| edit one mark (KiB written) | 10.5 (1,043) | 15.7 (1,021) | 0.0 (4) | 0.0 (4) | 0.5 (24) |
| accept one finding (KiB written) | 37.5 (610) | see Linux note | 0.0 (32) | 0.0 (32) | 0.9 (28) |
| undo group: 20 decisions (KiB) | 649 (12,054) | see Linux note | 0.9 (245) | 0.7 (245) | 2.7 (172) |

The JSON open breakdown was 224 ms of coverage results, 53 ms of findings and 5 ms of marks. Index build from JSON: modernc 2.4 s, ncruces 2.7 s, bbolt 0.9 s. File sizes match Linux (JSON 78.3 MiB, SQLite 47.0 MiB, zipped 28.7 and 22.8 MiB). Memory: json peak 37 MB, modernc 24, ncruces 21, bbolt 65. The `kill` test (TerminateProcess) gave 60 of 60 consistent for the temp-file write, modernc, ncruces and bbolt, and the in-place control tore 1 to 2 of 60. As on Linux this tests a killed process, not a power cut.

**The temp-file-and-rename write fails on Windows while another handle has the file open.** In the concurrency test (four readers re-reading `marks.json` and the chapter files, a second process saving one mark every 20 ms), measured in two runs:

- The writer's `os.Rename` of `marks.json.tmp` over `marks.json` failed `Access is denied.` 10 times in run 1 (142 commits made) and 4 times in run 2 (120 commits made).
- Readers failed too: 4 and 2 `listMarks` reads came back with `persist` outcome 4, `Unreadable`, in the same window (`ReadFile` could not open the file during the swap). The chapter-file reads, which the writer does not touch, had none.
- modernc, ncruces and bbolt had 0 reader errors and 0 writer errors; the SQLite writer ran in a separate process throughout.

In the app, `Unreadable` means `ReadJSON` logs and leaves the file, and the marks writer then refuses to save ("your marks file could not be read, so nothing was changed"). So on Windows a second reader of a project file (a Python sidecar, a second window, a backup tool or antivirus holding the file open) can make a save fail with a user-visible refusal. The failure is rare in this test (about 3 to 7% of writes while four readers spin on the file, a far higher read rate than the app has) and the cause is not confirmed beyond the error text; a bounded retry on the rename and on an `Unreadable` read is the usual remedy and was not tried. SQLite does not have the problem here because readers and the writer do not replace a file.

**ncruces on Windows.** `vfs.SupportsFileLocking` and `vfs.SupportsSharedMemory` are both `true`, the pool of five connections and the second writing process ran with no errors in WAL mode, so the single-connection constraint does not apply to this version on Windows either. (The `info` step's two "unable to open database file" lines in the log of run 39147532089 are my probe pointing at a folder it had not created, not a driver result.) Antivirus state on the runner was not controlled or recorded.

**What this changes in the recommendation.** The speed result is the same as on Linux. The rename failure is a reason to build the index and to leave the writes alone for the data that other processes read: it is evidence for the retry fix (item 3) and a new reason, not in the Linux data, to prefer SQLite for anything a sidecar also touches.

## Caveats

- Synthetic text, timings and findings; a real manuscript has longer words and more names, a real alignment has less regular timing. The manuscript, pickup and Story Bible files are mirrored shapes, not the app's types.
- One virtual machine, warm file cache except the rows that say otherwise, a single run of each cache-dropped open. p95 comes from 3 to 40 runs, so treat a p95 within 20% as equal.
- The JSON side measures the host's Go code only. Python sidecars read the same files; their cost was not measured and would not change with the index.
- ASR words are decoded generically (`[][]any`); a typed decoder would be faster for JSON and for bbolt. The host does not decode ASR words today (it passes the cache blob to the sidecar), so that row is the cost of a feature that does not exist yet.
- No power-loss or operating-system-crash test; `kill` only. Disk-full, a read-only project folder, a network path and antivirus were not tested.
- The index and the JSON can disagree for the length of a crash between writing the JSON and updating the index; the rebuild-on-mismatch rule in the recommendation covers it, and that path was not built.
- Query parity was checked between backends on the synthetic data; the SQL for "unresolved pickups" encodes this note's reading (open pickup-list lines plus pickup findings that are unreviewed or deferred), not a reviewed product rule.

## Reproducing

```text
cd src/studio/desktop/cmd/spike-storage
CGO_ENABLED=0 go build -o spike .
./spike all -dir <empty folder> -scale full -out results.json
```

The Linux tables of this run are in [`results/`](../../src/studio/desktop/cmd/spike-storage/results/linux-full.md).
