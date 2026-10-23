### Dataset `max` (2026-10-18T16:00:45Z)

35 chapters, 153015 script words, 2570 paragraphs, 451426 ASR words over 105 takes, 12241 findings, 5479 decisions, 9995 marks, 600 pickups, 400 Story Bible entries, 17.3 h of audio, generated in 2.6 s.

Drivers: map[github.com/ncruces/go-sqlite3:v0.35.6 github.com/ncruces/go-sqlite3-wasm/v6:v6.3.35304 go:go1.27.2 go.etcd.io/bbolt:v1.5.0 modernc.org/sqlite:v1.60.1]

#### Operations, p50 / p95 ms (write KiB per run)

| operation | json | json+fsync | modernc | ncruces | bbolt |
|---|---|---|---|---|---|
| openProject | 561.2 / 610.4 | 669.2 / 739.3 | 75.4 / 102.1 (0) | 59.2 / 87.1 | 353.6 / 370.1 |
| chapterText | 3.9 / 5.3 | 4.0 / 6.0 | 0.1 / 0.1 | 0.1 / 0.2 | 0.1 / 0.1 |
| chapterAlignment | 11.8 / 17.5 | 11.4 / 20.0 | 9.4 / 13.6 | 4.5 / 7.0 | 9.2 / 18.3 |
| chapterASR(take0) | 6.6 / 11.1 | 7.4 / 12.6 | 4.8 / 6.6 | 2.7 / 3.6 | 5.1 / 8.4 |
| chapterPeaks(take0) | 1.5 / 2.4 | 1.6 / 3.2 | 0.4 / 0.7 | 0.5 / 1.0 | 0.0 / 0.0 |
| listMarks | 28.6 / 46.2 | 37.2 / 47.6 | 47.3 / 62.5 | 34.1 / 57.1 | 81.3 / 100.1 |
| query.findings(sev>=warning) | 313.5 / 354.3 | 340.5 / 390.7 | 9.7 / 10.9 | 11.1 / 18.1 | 47.2 / 85.4 |
| query.name(common) | 6.8 / 9.1 | 8.1 / 13.1 | 0.8 / 0.9 | 1.1 / 1.8 | 5.9 / 8.4 |
| query.name(rare) | 6.9 / 8.5 | 7.7 / 11.4 | 0.0 / 0.1 | 0.0 / 0.1 | 5.5 / 8.6 |
| query.pickupsUnresolved | 325.4 / 359.0 | 342.5 / 374.7 | 0.6 / 1.2 | 0.8 / 1.1 | 49.1 / 70.7 |
| query.fts(common) | 6.9 / 9.3 | 7.0 / 10.8 | 6.0 / 9.7 | 7.5 / 9.1 | 5.2 / 7.4 |
| query.fts(mid) | 7.9 / 9.3 | 10.0 / 14.3 | 0.3 / 0.4 | 0.3 / 0.5 | 5.6 / 8.6 |
| query.fts(rare) | 7.3 / 11.5 | 6.2 / 9.5 | 0.1 / 0.1 | 0.1 / 0.2 | 5.0 / 7.6 |
| edit.oneMark | 96.2 / 113.2 (4370) | 85.9 / 127.2 (4348) | 0.0 / 0.2 (4) | 0.0 / 0.2 (4) | 0.4 / 1.5 (24) |
| edit.oneAlignmentWord | 19.0 / 42.5 (1061) | 27.8 / 45.6 (1061) | 0.0 / 0.0 (4) | 0.0 / 0.0 (4) | 15.2 / 30.3 (1160) |
| edit.decideOneFinding | 114.3 / 169.8 (1166) | 82.7 / 136.0 (184) | 0.1 / 0.2 (44) | 0.1 / 0.2 (44) | 0.6 / 1.7 (24) |
| undoGroup.50marks | 86.3 / 106.6 (4358) | 81.8 / 125.9 (4348) | 0.9 / 1.2 (189) | 1.0 / 1.3 (189) | 1.7 / 1.9 (60) |
| undoGroup.20decisions | 2060.2 / 2083.9 (23078) | 1738.1 / 2316.3 (3438) | 1.0 / 18.9 (290) | 0.8 / 16.5 (290) | 2.3 / 4.9 (176) |

#### Memory (MB RSS; peak = VmHWM)

| backend | start | after open | after reads | end | peak |
|---|---|---|---|---|---|
| json | 13 | 37 | 19 | 17 | 46 |
| json+fsync | 13 | 36 | 19 | 19 | 46 |
| modernc | 13 | 21 | 22 | 22 | 22 |
| ncruces | 13 | 19 | 20 | 20 | 20 |
| bbolt | 13 | 47 | 83 | 85 | 89 |

JSON open breakdown (last run, ms): {"Story Bible":3.413,"coverage results (all chapters)":351.069,"findings (every scope file + review.json)":157.803,"manuscript.json":2.938,"marks.json":33.313,"pickup-list.json":1.199}

#### Index build from the JSON files (seconds)

- modernc: total 5.43 s, peak RSS 53 MB, stages map[checkpoint:0.08414816 commit:0.263343058 createIndexes:0.08908972 ftsRebuild:0.020195969 importASRWordsAndPeaks:3.059092663 importChaptersTextAlignment:1.31016068 importFindingsAndDecisions:0.460122101 importMarksPickupsBible:0.123817313 readManuscript:0.008916491]
- ncruces: total 5.11 s, peak RSS 50 MB, stages map[checkpoint:0.044021392 commit:0.296841579 createIndexes:0.069739081 ftsRebuild:0.02297006 importASRWordsAndPeaks:2.673486386 importChaptersTextAlignment:1.4602002490000001 importFindingsAndDecisions:0.390563078 importMarksPickupsBible:0.131657311 readManuscript:0.007591645]
- bbolt: total 1.48 s, peak RSS 211 MB, stages map[]

#### Disk (MiB)

JSON project: 102.0 MiB in 390 files (zip 41.2 MiB). By kind:

- ManuscriptGuide: 1.1 MiB
- analysis/cache: 47.0 MiB
- analysis/coverage: 34.2 MiB
- findings: 14.3 MiB
- manuscript: 1.1 MiB
- marks.json: 4.3 MiB
- pickups: 0.1 MiB
- index-bolt.db: 100.2 MiB (zip 27.4 MiB)
- index-modernc.db: 67.2 MiB (zip 32.4 MiB)
- index-ncruces.db: 67.2 MiB (zip 32.4 MiB)

#### Reads while another process writes (4 readers, writer commits one mark every 20 ms)

| backend | writer in other process | op | alone p50/p95 | with writer p50/p95 | read errors | writer commits (p50/p95 ms) | writer errors |
|---|---|---|---|---|---|---|---|
| json | true | loadChapterAlignment | 10.6 / 19.6 | 11.3 / 21.4 | 0 | 47 (82.1 / 123.6) | 0  |
| json | true | listMarks | 133.6 / 162.4 | 145.0 / 178.4 | 0 | 47 (82.1 / 123.6) | 0  |
| modernc | true | loadChapterAlignment | 9.8 / 17.8 | 11.4 / 18.9 | 0 | 243 (0.2 / 0.4) | 0  |
| modernc | true | listMarks | 74.6 / 85.5 | 79.0 / 92.2 | 0 | 243 (0.2 / 0.4) | 0  |
| ncruces | true | loadChapterAlignment | 5.7 / 10.5 | 7.1 / 12.6 | 0 | 243 (0.2 / 0.4) | 0  |
| ncruces | true | listMarks | 41.2 / 50.9 | 48.7 / 65.5 | 0 | 243 (0.2 / 0.4) | 0  |
| bbolt | false | loadChapterAlignment | 15.0 / 29.4 | 14.9 / 26.9 | 0 | 205 (1.7 / 9.2) | 0  |
| bbolt | false | listMarks | 122.6 / 163.7 | 124.4 / 152.7 | 0 | 205 (1.7 / 9.2) | 0  |

#### kill -9 mid-write

| backend | kills | consistent | torn/unparseable | mixed versions | lost acked commit | open failed | integrity failed | stray .tmp |
|---|---|---|---|---|---|---|---|---|
| json | 60 | 60 | 0 | 0 | 0 | 0 | 0 | 0 |
| json-naive | 60 | 53 | 7 | 0 | 0 | 0 | 0 | 0 |
| modernc | 60 | 60 | 0 | 0 | 0 | 0 | 0 | 0 |
| ncruces | 60 | 60 | 0 | 0 | 0 | 0 | 0 | 0 |
| bbolt | 60 | 60 | 0 | 0 | 0 | 0 | 0 | 0 |
