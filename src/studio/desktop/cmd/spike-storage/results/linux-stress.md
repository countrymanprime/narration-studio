### Dataset `stress` (2026-10-18T16:03:21Z)

5000 chapters, 201648 script words, 5761 paragraphs, 201648 ASR words over 5000 takes, 8065 findings, 3647 decisions, 2997 marks, 500 pickups, 300 Story Bible entries, 22.4 h of audio, generated in 31.1 s.

Drivers: map[github.com/ncruces/go-sqlite3:v0.35.6 github.com/ncruces/go-sqlite3-wasm/v6:v6.3.35304 go:go1.27.2 go.etcd.io/bbolt:v1.5.0 modernc.org/sqlite:v1.60.1]

#### Operations, p50 / p95 ms (write KiB per run)

| operation | json | json+fsync | modernc | ncruces | bbolt |
|---|---|---|---|---|---|
| openProject | 842.4 / 900.4 | 834.9 / 920.0 | 41.4 / 50.0 (0) | 49.0 / 56.7 | 196.3 / 222.0 |
| chapterText | 13.7 / 18.2 | 11.7 / 17.5 | 0.0 / 0.0 | 0.0 / 0.0 | 0.0 / 0.0 |
| chapterAlignment | 0.1 / 0.2 | 0.1 / 0.2 | 0.1 / 0.2 | 0.1 / 0.2 | 0.1 / 0.1 |
| chapterASR(take0) | 0.1 / 0.1 | 0.1 / 0.2 | 0.1 / 0.2 | 0.1 / 0.1 | 0.0 / 0.1 |
| chapterPeaks(take0) | 0.0 / 0.0 | 0.0 / 0.1 | 0.0 / 0.0 | 0.0 / 0.0 | 0.0 / 0.0 |
| listMarks | 11.5 / 16.2 | 10.0 / 13.2 | 15.6 / 20.4 | 11.1 / 17.3 | 23.4 / 32.4 |
| query.findings(sev>=warning) | 361.1 / 377.4 | 345.5 / 389.9 | 5.8 / 10.2 | 8.4 / 12.2 | 33.3 / 55.3 |
| query.name(common) | 14.2 / 19.2 | 15.5 / 23.8 | 2.8 / 3.8 | 2.4 / 2.9 | 11.6 / 16.8 |
| query.name(rare) | 16.3 / 20.1 | 17.7 / 24.2 | 0.0 / 0.1 | 0.0 / 0.1 | 14.8 / 21.2 |
| query.pickupsUnresolved | 333.9 / 367.7 | 334.2 / 389.6 | 1.2 / 2.1 | 1.2 / 1.5 | 56.7 / 67.8 |
| query.fts(common) | 14.6 / 19.9 | 15.0 / 19.7 | 11.7 / 18.2 | 14.0 / 19.7 | 10.2 / 14.7 |
| query.fts(mid) | 14.9 / 21.8 | 20.4 / 25.4 | 0.3 / 0.3 | 0.3 / 0.6 | 10.6 / 16.1 |
| query.fts(rare) | 15.9 / 22.5 | 16.2 / 24.0 | 0.1 / 0.1 | 0.1 / 0.1 | 15.5 / 16.4 |
| edit.oneMark | 21.7 / 31.1 (1311) | 22.6 / 28.6 (1289) | 0.0 / 0.1 (4) | 0.0 / 0.1 (4) | 0.4 / 0.8 (24) |
| edit.oneAlignmentWord | 0.6 / 0.9 (10) | 0.9 / 1.5 (10) | 0.0 / 0.0 (4) | 0.0 / 0.0 (4) | 0.6 / 1.0 (32) |
| edit.decideOneFinding | 108.5 / 160.4 (657) | 101.4 / 143.5 (2) | 0.1 / 0.2 (36) | 0.1 / 0.2 (36) | 0.5 / 0.6 (24) |
| undoGroup.50marks | 22.7 / 28.8 (1300) | 23.6 / 38.6 (1289) | 1.2 / 1.5 (173) | 1.3 / 1.7 (173) | 1.6 / 2.6 (60) |
| undoGroup.20decisions | 2374.1 / 2600.7 (13309) | 2097.4 / 2277.6 (37) | 1.3 / 13.9 (245) | 1.1 / 15.4 (245) | 2.7 / 4.9 (168) |

#### Memory (MB RSS; peak = VmHWM)

| backend | start | after open | after reads | end | peak |
|---|---|---|---|---|---|
| json | 17 | 37 | 29 | 24 | 47 |
| json+fsync | 19 | 36 | 26 | 24 | 46 |
| modernc | 17 | 20 | 22 | 22 | 22 |
| ncruces | 19 | 19 | 20 | 20 | 22 |
| bbolt | 16 | 34 | 39 | 39 | 39 |

JSON open breakdown (last run, ms): {"Story Bible":5.508,"coverage results (all chapters)":641.678,"findings (every scope file + review.json)":188.647,"manuscript.json":9.798,"marks.json":10.271,"pickup-list.json":1.256}

#### Index build from the JSON files (seconds)

- modernc: total 4.38 s, peak RSS 52 MB, stages map[checkpoint:0.039849065 commit:0.502104808 createIndexes:0.038511256 ftsRebuild:0.03331788 importASRWordsAndPeaks:1.585062411 importChaptersTextAlignment:1.770200658 importFindingsAndDecisions:0.322935846 importMarksPickupsBible:0.047101162 readManuscript:0.016850671]
- ncruces: total 3.91 s, peak RSS 51 MB, stages map[checkpoint:0.042495008 commit:0.406608791 createIndexes:0.059022954 ftsRebuild:0.034347064 importASRWordsAndPeaks:1.387211489 importChaptersTextAlignment:1.575575862 importFindingsAndDecisions:0.337000912 importMarksPickupsBible:0.037817318 readManuscript:0.023087839]
- bbolt: total 2.52 s, peak RSS 180 MB, stages map[]

#### Disk (MiB)

JSON project: 84.2 MiB in 21137 files (zip 32.1 MiB). By kind:

- ManuscriptGuide: 1.2 MiB
- analysis/cache: 21.0 MiB
- analysis/coverage: 48.9 MiB
- findings: 9.5 MiB
- manuscript: 2.3 MiB
- marks.json: 1.3 MiB
- pickups: 0.1 MiB
- index-bolt.db: 90.9 MiB (zip 13.8 MiB)
- index-modernc.db: 54.5 MiB (zip 16.8 MiB)
- index-ncruces.db: 54.5 MiB (zip 16.8 MiB)

#### Reads while another process writes (4 readers, writer commits one mark every 20 ms)

| backend | writer in other process | op | alone p50/p95 | with writer p50/p95 | read errors | writer commits (p50/p95 ms) | writer errors |
|---|---|---|---|---|---|---|---|
| json | true | loadChapterAlignment | 0.3 / 1.3 | 0.3 / 1.5 | 0 | 106 (26.4 / 36.9) | 0  |
| json | true | listMarks | 47.5 / 57.2 | 49.0 / 65.3 | 0 | 106 (26.4 / 36.9) | 0  |
| modernc | true | loadChapterAlignment | 0.2 / 0.6 | 0.3 / 0.6 | 0 | 242 (0.2 / 0.4) | 0  |
| modernc | true | listMarks | 25.5 / 33.5 | 26.5 / 32.9 | 0 | 242 (0.2 / 0.4) | 0  |
| ncruces | true | loadChapterAlignment | 0.2 / 0.4 | 0.2 / 0.4 | 0 | 244 (0.2 / 0.5) | 0  |
| ncruces | true | listMarks | 15.2 / 18.8 | 13.5 / 19.6 | 0 | 244 (0.2 / 0.5) | 0  |
| bbolt | false | loadChapterAlignment | 0.1 / 0.5 | 0.1 / 0.6 | 0 | 204 (1.8 / 8.9) | 0  |
| bbolt | false | listMarks | 32.1 / 41.1 | 37.4 / 50.0 | 0 | 204 (1.8 / 8.9) | 0  |

#### kill -9 mid-write

| backend | kills | consistent | torn/unparseable | mixed versions | lost acked commit | open failed | integrity failed | stray .tmp |
|---|---|---|---|---|---|---|---|---|
| json | 60 | 60 | 0 | 0 | 0 | 0 | 0 | 0 |
| json-naive | 60 | 53 | 7 | 0 | 0 | 0 | 0 | 0 |
| modernc | 60 | 60 | 0 | 0 | 0 | 0 | 0 | 0 |
| ncruces | 60 | 60 | 0 | 0 | 0 | 0 | 0 | 0 |
| bbolt | 60 | 60 | 0 | 0 | 0 | 0 | 0 | 0 |

#### First open after dropping the OS file cache (single run, measured)

- json first open after cache drop: 1845.7 ms
- modernc first open after cache drop: 62.1 ms
- ncruces first open after cache drop: 77.4 ms
- bbolt first open after cache drop: 499.7 ms
