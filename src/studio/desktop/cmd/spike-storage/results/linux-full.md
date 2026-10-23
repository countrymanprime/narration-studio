### Dataset `full` (2026-10-18T15:58:10Z)

35 chapters, 159319 script words, 2658 paragraphs, 308938 ASR words over 69 takes, 6372 findings, 2835 decisions, 2387 marks, 300 pickups, 300 Story Bible entries, 18.1 h of audio, generated in 1.4 s.

Drivers: map[github.com/ncruces/go-sqlite3:v0.35.6 github.com/ncruces/go-sqlite3-wasm/v6:v6.3.35304 go:go1.27.2 go.etcd.io/bbolt:v1.5.0 modernc.org/sqlite:v1.60.1]

#### Operations, p50 / p95 ms (write KiB per run)

| operation | json | json+fsync | modernc | ncruces | bbolt |
|---|---|---|---|---|---|
| openProject | 497.3 / 535.0 | 563.3 / 584.7 | 22.5 / 36.0 (0) | 22.2 / 32.1 | 168.8 / 212.2 |
| chapterText | 3.2 / 4.6 | 3.0 / 4.2 | 0.1 / 0.1 | 0.1 / 0.1 | 0.1 / 0.2 |
| chapterAlignment | 12.8 / 20.1 | 9.4 / 15.9 | 10.1 / 19.6 | 5.2 / 7.9 | 9.9 / 15.4 |
| chapterASR(take0) | 7.3 / 13.6 | 5.4 / 9.8 | 5.3 / 8.8 | 2.8 / 4.2 | 5.7 / 9.5 |
| chapterPeaks(take0) | 1.5 / 3.3 | 1.4 / 2.5 | 0.5 / 1.1 | 0.5 / 0.8 | 0.0 / 0.0 |
| listMarks | 7.8 / 11.5 | 6.1 / 9.4 | 10.0 / 17.0 | 8.6 / 11.5 | 19.3 / 26.0 |
| query.findings(sev>=warning) | 187.2 / 214.7 | 190.4 / 223.9 | 5.6 / 8.0 | 5.7 / 9.8 | 23.2 / 32.8 |
| query.name(common) | 7.1 / 9.2 | 7.1 / 9.3 | 0.8 / 0.9 | 1.0 / 1.2 | 4.8 / 5.2 |
| query.name(rare) | 7.6 / 10.3 | 7.4 / 8.0 | 0.0 / 0.0 | 0.0 / 0.0 | 6.1 / 7.0 |
| query.pickupsUnresolved | 194.0 / 229.5 | 181.8 / 220.7 | 0.3 / 0.5 | 0.3 / 0.4 | 28.0 / 31.3 |
| query.fts(common) | 8.9 / 10.6 | 5.7 / 6.8 | 5.5 / 5.7 | 7.0 / 7.5 | 6.8 / 8.5 |
| query.fts(mid) | 6.9 / 9.7 | 6.4 / 9.0 | 0.3 / 0.4 | 0.3 / 0.5 | 7.5 / 8.6 |
| query.fts(rare) | 8.0 / 9.9 | 7.8 / 9.8 | 0.1 / 0.1 | 0.1 / 0.1 | 5.5 / 7.2 |
| edit.oneMark | 21.8 / 31.3 (1043) | 23.1 / 32.3 (1021) | 0.0 / 0.2 (4) | 0.0 / 0.1 (4) | 0.3 / 0.4 (24) |
| edit.oneAlignmentWord | 23.5 / 44.7 (986) | 24.2 / 34.9 (986) | 0.0 / 0.1 (4) | 0.0 / 0.0 (4) | 19.9 / 29.8 (1124) |
| edit.decideOneFinding | 56.4 / 104.6 (610) | 45.1 / 63.2 (107) | 0.1 / 0.2 (32) | 0.1 / 0.2 (32) | 0.4 / 0.6 (28) |
| undoGroup.50marks | 15.9 / 26.2 (1031) | 18.0 / 21.9 (1021) | 0.7 / 0.9 (165) | 0.9 / 1.4 (165) | 1.6 / 1.9 (64) |
| undoGroup.20decisions | 1042.7 / 1254.8 (12054) | 700.6 / 899.9 (1632) | 0.9 / 13.4 (245) | 0.9 / 16.7 (245) | 1.6 / 1.9 (172) |

#### Memory (MB RSS; peak = VmHWM)

| backend | start | after open | after reads | end | peak |
|---|---|---|---|---|---|
| json | 13 | 23 | 16 | 17 | 32 |
| json+fsync | 13 | 24 | 16 | 16 | 32 |
| modernc | 13 | 19 | 22 | 22 | 22 |
| ncruces | 13 | 18 | 20 | 20 | 21 |
| bbolt | 13 | 29 | 65 | 67 | 72 |

JSON open breakdown (last run, ms): {"Story Bible":3.203,"coverage results (all chapters)":380.518,"findings (every scope file + review.json)":97.959,"manuscript.json":2.406,"marks.json":9.72,"pickup-list.json":0.404}

#### Index build from the JSON files (seconds)

- modernc: total 3.96 s, peak RSS 35 MB, stages map[checkpoint:0.035922882 commit:0.225908532 createIndexes:0.044135932 ftsRebuild:0.021344564 importASRWordsAndPeaks:2.147954666 importChaptersTextAlignment:1.218633632 importFindingsAndDecisions:0.210893945 importMarksPickupsBible:0.04167819 readManuscript:0.006075596]
- ncruces: total 3.55 s, peak RSS 34 MB, stages map[checkpoint:0.037405484 commit:0.226795543 createIndexes:0.032312538 ftsRebuild:0.023523606 importASRWordsAndPeaks:1.770586329 importChaptersTextAlignment:1.219657123 importFindingsAndDecisions:0.193983849 importMarksPickupsBible:0.032572594 readManuscript:0.006122295]
- bbolt: total 1.06 s, peak RSS 146 MB, stages map[]

#### Disk (MiB)

JSON project: 78.3 MiB in 318 files (zip 28.7 MiB). By kind:

- ManuscriptGuide: 1.0 MiB
- analysis/cache: 32.1 MiB
- analysis/coverage: 35.6 MiB
- findings: 7.4 MiB
- manuscript: 1.1 MiB
- marks.json: 1.0 MiB
- pickups: 0.1 MiB
- index-bolt.db: 73.6 MiB (zip 19.1 MiB)
- index-modernc.db: 47.0 MiB (zip 22.8 MiB)
- index-ncruces.db: 47.0 MiB (zip 22.8 MiB)

#### Reads while another process writes (4 readers, writer commits one mark every 20 ms)

| backend | writer in other process | op | alone p50/p95 | with writer p50/p95 | read errors | writer commits (p50/p95 ms) | writer errors |
|---|---|---|---|---|---|---|---|
| json | true | loadChapterAlignment | 12.3 / 20.9 | 13.4 / 25.0 | 0 | 121 (20.3 / 30.1) | 0  |
| json | true | listMarks | 24.9 / 37.0 | 26.9 / 42.3 | 0 | 121 (20.3 / 30.1) | 0  |
| modernc | true | loadChapterAlignment | 9.3 / 15.8 | 10.6 / 17.1 | 0 | 244 (0.2 / 0.3) | 0  |
| modernc | true | listMarks | 14.1 / 19.4 | 16.2 / 21.7 | 0 | 244 (0.2 / 0.3) | 0  |
| ncruces | true | loadChapterAlignment | 5.2 / 9.8 | 5.3 / 9.1 | 0 | 243 (0.2 / 0.3) | 0  |
| ncruces | true | listMarks | 8.5 / 13.7 | 8.8 / 12.8 | 0 | 243 (0.2 / 0.3) | 0  |
| bbolt | false | loadChapterAlignment | 12.7 / 23.4 | 13.6 / 25.0 | 0 | 212 (2.0 / 6.8) | 0  |
| bbolt | false | listMarks | 24.3 / 34.4 | 26.9 / 36.6 | 0 | 212 (2.0 / 6.8) | 0  |

#### kill -9 mid-write

| backend | kills | consistent | torn/unparseable | mixed versions | lost acked commit | open failed | integrity failed | stray .tmp |
|---|---|---|---|---|---|---|---|---|
| json | 60 | 60 | 0 | 0 | 0 | 0 | 0 | 0 |
| json-naive | 60 | 52 | 8 | 0 | 0 | 0 | 0 | 0 |
| modernc | 60 | 60 | 0 | 0 | 0 | 0 | 0 | 0 |
| ncruces | 60 | 60 | 0 | 0 | 0 | 0 | 0 | 0 |
| bbolt | 60 | 60 | 0 | 0 | 0 | 0 | 0 | 0 |

#### First open after dropping the OS file cache (single run, measured)

- json first open after cache drop: 582.1 ms
- modernc first open after cache drop: 38.6 ms
- ncruces first open after cache drop: 46.9 ms
- bbolt first open after cache drop: 401.1 ms
