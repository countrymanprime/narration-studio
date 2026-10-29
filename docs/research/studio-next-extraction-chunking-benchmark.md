# Extraction scans: measured cost and quality of per-chapter chunking

Measured 2026-10-28 and 2026-10-29 to answer owner question #18 before any pool is built (design in [studio-next-extraction-chunking.md](studio-next-extraction-chunking.md)). The scripts are `scripts/research/extraction-bench/`; they drive the sidecar's own `extraction_gliner` and `extraction_booknlp` adapters, so a number is the sidecar's number.

## Setup

- Machine: cloud container, Linux, 4 vCPU, 15 GB, no GPU. torch 2.15 (CPU), gliner 0.2.29, booknlp 1.0.8, transformers 5.16.1, spaCy 3.8.18 with `en_core_web_sm` 3.7.1 (the catalog pins 3.8.0, which is only on GitHub, blocked here). Model files are the catalog's, SHA-256 checked.
- A run is one configuration in a fresh process, one at a time. Wall time includes model load (the slowest worker's load is the Load column). Peak memory is the summed resident set of the process and its children, sampled every 0.1 s.
- Chunked runs use torch threads = processors / workers per worker, a pool of N processes that each load the model once, and one chapter per task. "Cut at 1500 words" splits a chapter between paragraphs.
- Texts: public domain, from the PG-19 corpus (`emozilla/pg19` on Hugging Face), because `gutenberg.org` is blocked by this container's network policy. Chapters are split at `CHAPTER` headings.

| Gutenberg | Book | Words | Chapters | Quote marks per 100 words | Why |
| - | - | - | - | - | - |
| 56410 | Ruby, Molly E. Jamieson | 19,185 | 10 | 2.6 | short novel, curly quotes in the source |
| 34467 | In Camp With A Tin Soldier, John Kendrick Bangs | 36,634 | 14 | 6.7 | few characters, much dialogue |
| 53345 | Dan The Newsboy, Horatio Alger Jr. | 59,647 | 42 | 9.8 | mid novel, dialogue-heavy, large cast |
| 9931 | K, Mary Roberts Rinehart | 92,847 | 30 | 5.2 | the size the earlier trial extrapolated to |
| 6941 | Old Mortality, Walter Scott | 168,177 | 45 | 3.7 | long novel, Scots dialect |

## What was not measured

- **Non-ASCII text.** The corpus is almost all ASCII (Ruby has curly quotes; no book has accented names). Phase 2 adds a UTF-8 fixture with accented names to the tests; the speed and agreement figures here say nothing about it.
- **Large BookNLP weights past 60k words and at 4 workers.** The large weights take 3 to 7 GB per worker, so 4 workers on a 15 GB machine are only run where the guard allows (see the table), and books over 65k words were not run on them (a whole-book run of 90k words takes about 13 minutes).
- **The packaged Windows sidecar** (frozen with PyInstaller, win_amd64 wheels from the asset catalog) and Windows timings. Both engines ran on Linux, so nothing here is Windows-only, but Windows process start-up (spawn) and antivirus scanning change the per-worker cost. Run `python scripts/research/extraction-bench/run_all.py --work <dir>` on the owner's machine for the same tables; it takes the same book list and writes `report.md`.
- **Gold-standard accuracy.** There is no gold set (SN-X8). Every quality figure is agreement with the whole-book run.

## Findings

1. **Chunking alone saves nothing; the pool does.** One worker reading chapters is no faster than the whole book for GLiNER (0.96 to 1.13x) and slower for BookNLP (0.62 to 0.77x on the small weights: each chapter pays BookNLP's start-up again). A pool must have at least 2 workers to break even on BookNLP.
2. **GLiNER saves 1.3 to 1.9x at 2 to 4 workers, at 2 to 4 times the memory** (2.1 GB per worker, 8 GB at 4). torch already spreads one process over the cores, so more workers help little. The gain is a few minutes on a 90k-word book (291 s to 191 s at 4 workers; 164 s with chapters cut at 1500 words on the 60k book).
3. **GLiNER output is identical.** Names, types and scores match the whole-book run exactly in every configuration (precision, recall and type agreement 1.000, score drift 0): it keeps no state between paragraphs.
4. **BookNLP small saves 1.1 to 1.5x at 2 workers and 1.5 to 2.3x at 4 workers** (K: 159 s to 79 s; Old Mortality: 287 s to 127 s). At 4 workers the gain is 1.6x at 19k words, 1.8x at 37k, 1.5x at 60k, 2.0x at 93k and 2.3x at 168k. Whole-book memory grows with the book (2.0 GB at 19k words, 4.2 GB at 93k, 6.1 GB at 168k) while a chapter worker holds 1.4 to 1.9 GB, so 4 workers (5.6 to 5.9 GB) cost no more than the whole book on a long novel.
5. **BookNLP large weights barely gain**: 1.10 to 1.28x at 2 workers, and 1.2x at 4 workers on the 19k-word book (the only one it ran on), at 5 to 10 GB. Not worth a pool.
6. **BookNLP chunked output differs.** Against the whole-book run (per chapter, small weights): the major characters (5 or more attributed quotes) are found (recall 0.98 to 1.00), but 16 to 23% of all characters are not matched (minor characters, and characters that a chapter names differently), 1 to 25 whole-book characters are split in two and 0 to 14 are conflated, and 88 to 97% of the quoted lines shared by both runs get the same speaker (K, a mystery with many pronoun-only stretches, is lowest at 88%; the small weights and the large weights agree with their own whole-book runs to the same degree). Gender agrees for 95 to 100% of characters. Splits and conflations grow with the number of chapters (Old Mortality: 25 and 14). Cutting chapters at 1500 words loses a little more.
7. **Running GLiNER alongside BookNLP saves 6 to 29%** (1.06 to 1.29x) with torch limited to 2 threads each, and no more memory than the two take apart. It keeps whole-book BookNLP and is lossless.

## Conclusion for the build

- GLiNER: build the per-chapter pool (identical output, up to 1.9x, memory-capped).
- BookNLP: keep it whole-book by default. The saving at 4 workers is real on long novels (about 2x) but the output is not the whole-book output, and with no gold set the cost cannot be called acceptable; it is the owner's call whether to offer it as an opt-in for long books. Run it concurrently with GLiNER instead.

## Time and memory (all runs)

| Book (words) | Engine | Configuration | Chunks | Wall s | Load s | Read s | Speed-up vs whole | Peak GB | Failed |
| - | - | - | - | - | - | - | - | - | - |
| Ruby (19,185) | booknlp-big | whole book | 1 | 116.7 | 14.2 | 102.5 |  | 4.44 | 0 |
| Ruby (19,185) | booknlp-big | 1 worker, per chapter | 10 | 121.0 | 10.6 | 110.3 | 0.97x | 2.7 | 0 |
| Ruby (19,185) | booknlp-big | 2 workers, per chapter | 10 | 97.8 | 15.0 | 82.9 | 1.19x | 5.13 | 0 |
| Ruby (19,185) | booknlp-big | 4 workers, per chapter | 10 | 99.3 | 27.9 | 71.4 | 1.18x | 10.04 | 0 |
| Ruby (19,185) | booknlp-big | 4 workers, chapters cut at 1500 words | 18 | 91.9 | 16.4 | 75.5 | 1.27x | 10.16 | 0 |
| Ruby (19,185) | booknlp-small | whole book | 1 | 38.9 | 6.9 | 32.1 |  | 1.97 | 0 |
| Ruby (19,185) | booknlp-small | 1 worker, per chapter | 10 | 56.0 | 6.6 | 49.4 | 0.70x | 1.36 | 0 |
| Ruby (19,185) | booknlp-small | 2 workers, per chapter | 10 | 31.9 | 6.5 | 25.4 | 1.22x | 2.59 | 0 |
| Ruby (19,185) | booknlp-small | 4 workers, per chapter | 10 | 24.1 | 6.3 | 17.8 | 1.61x | 4.98 | 0 |
| Ruby (19,185) | booknlp-small | 4 workers, chapters cut at 1500 words | 18 | 30.2 | 6.8 | 23.4 | 1.29x | 4.9 | 0 |
| Ruby (19,185) | gliner | whole book | 1 | 59.3 | 12.1 | 47.2 |  | 2.1 | 0 |
| Ruby (19,185) | gliner | 1 worker, per chapter | 10 | 52.3 | 8.2 | 44.1 | 1.13x | 2.09 | 0 |
| Ruby (19,185) | gliner | 2 workers, per chapter | 10 | 44.3 | 12.2 | 32.1 | 1.34x | 4.1 | 0 |
| Ruby (19,185) | gliner | 4 workers, per chapter | 10 | 47.0 | 15.5 | 31.5 | 1.26x | 8.17 | 0 |
| Ruby (19,185) | gliner | 4 workers, chapters cut at 1500 words | 18 | 48.1 | 16.7 | 31.4 | 1.23x | 7.54 | 0 |
| In Camp With A Tin Soldier (36,634) | booknlp-big | whole book | 1 | 272.6 | 11.9 | 260.7 |  | 6.66 | 0 |
| In Camp With A Tin Soldier (36,634) | booknlp-big | 1 worker, per chapter | 14 | 297.9 | 11.4 | 286.5 | 0.92x | 3.25 | 0 |
| In Camp With A Tin Soldier (36,634) | booknlp-big | 2 workers, per chapter | 14 | 213.6 | 11.8 | 201.8 | 1.28x | 5.81 | 0 |
| In Camp With A Tin Soldier (36,634) | booknlp-small | whole book | 1 | 88.1 | 6.5 | 81.6 |  | 2.56 | 0 |
| In Camp With A Tin Soldier (36,634) | booknlp-small | 1 worker, per chapter | 14 | 114.5 | 6.3 | 108.3 | 0.77x | 1.49 | 0 |
| In Camp With A Tin Soldier (36,634) | booknlp-small | 2 workers, per chapter | 14 | 66.7 | 6.6 | 60.1 | 1.32x | 2.72 | 0 |
| In Camp With A Tin Soldier (36,634) | booknlp-small | 4 workers, per chapter | 14 | 49.3 | 6.8 | 42.5 | 1.79x | 5.22 | 0 |
| In Camp With A Tin Soldier (36,634) | booknlp-small | 4 workers, chapters cut at 1500 words | 30 | 54.0 | 7.8 | 46.2 | 1.63x | 5.0 | 0 |
| In Camp With A Tin Soldier (36,634) | gliner | whole book | 1 | 112.0 | 8.0 | 104.0 |  | 2.09 | 0 |
| In Camp With A Tin Soldier (36,634) | gliner | 1 worker, per chapter | 14 | 114.2 | 7.8 | 106.4 | 0.98x | 2.03 | 0 |
| In Camp With A Tin Soldier (36,634) | gliner | 2 workers, per chapter | 14 | 88.1 | 9.1 | 79.0 | 1.27x | 3.96 | 0 |
| In Camp With A Tin Soldier (36,634) | gliner | 4 workers, per chapter | 14 | 82.7 | 14.2 | 68.5 | 1.36x | 7.72 | 0 |
| In Camp With A Tin Soldier (36,634) | gliner | 4 workers, chapters cut at 1500 words | 30 | 73.5 | 12.7 | 60.8 | 1.52x | 7.63 | 0 |
| Dan The Newsboy (59,647) | booknlp-big | whole book | 1 | 511.6 | 11.0 | 500.6 |  | 7.45 | 0 |
| Dan The Newsboy (59,647) | booknlp-big | 1 worker, per chapter | 42 | 553.6 | 10.4 | 543.2 | 0.92x | 3.71 | 0 |
| Dan The Newsboy (59,647) | booknlp-big | 2 workers, per chapter | 42 | 463.2 | 11.2 | 452.0 | 1.10x | 6.08 | 0 |
| Dan The Newsboy (59,647) | booknlp-small | whole book | 1 | 153.5 | 6.5 | 147.0 |  | 3.34 | 0 |
| Dan The Newsboy (59,647) | booknlp-small | 1 worker, per chapter | 42 | 248.5 | 6.4 | 242.1 | 0.62x | 1.87 | 0 |
| Dan The Newsboy (59,647) | booknlp-small | 2 workers, per chapter | 42 | 139.7 | 6.6 | 133.2 | 1.10x | 3.12 | 0 |
| Dan The Newsboy (59,647) | booknlp-small | 4 workers, per chapter | 42 | 100.4 | 7.7 | 92.8 | 1.53x | 5.46 | 0 |
| Dan The Newsboy (59,647) | booknlp-small | 4 workers, chapters cut at 1500 words | 52 | 100.9 | 6.9 | 94.0 | 1.52x | 5.1 | 0 |
| Dan The Newsboy (59,647) | gliner | whole book | 1 | 306.4 | 8.4 | 297.9 |  | 2.11 | 0 |
| Dan The Newsboy (59,647) | gliner | 1 worker, per chapter | 42 | 287.0 | 7.6 | 279.4 | 1.07x | 2.11 | 0 |
| Dan The Newsboy (59,647) | gliner | 2 workers, per chapter | 42 | 208.8 | 7.9 | 201.0 | 1.47x | 4.02 | 0 |
| Dan The Newsboy (59,647) | gliner | 4 workers, per chapter | 42 | 192.3 | 13.6 | 178.6 | 1.59x | 7.89 | 0 |
| Dan The Newsboy (59,647) | gliner | 4 workers, chapters cut at 1500 words | 52 | 164.1 | 12.1 | 152.0 | 1.87x | 7.49 | 0 |
| K (92,847) | booknlp-small | whole book | 1 | 158.9 | 6.6 | 152.3 |  | 4.2 | 0 |
| K (92,847) | booknlp-small | 1 worker, per chapter | 30 | 212.3 | 6.7 | 205.6 | 0.75x | 1.64 | 0 |
| K (92,847) | booknlp-small | 2 workers, per chapter | 30 | 117.9 | 6.2 | 111.7 | 1.35x | 3.01 | 0 |
| K (92,847) | booknlp-small | 4 workers, per chapter | 30 | 78.6 | 7.2 | 71.4 | 2.02x | 5.59 | 0 |
| K (92,847) | gliner | whole book | 1 | 290.9 | 7.5 | 283.4 |  | 2.11 | 0 |
| K (92,847) | gliner | 1 worker, per chapter | 30 | 303.9 | 7.6 | 296.3 | 0.96x | 2.05 | 0 |
| K (92,847) | gliner | 2 workers, per chapter | 30 | 223.4 | 8.7 | 214.7 | 1.30x | 3.81 | 0 |
| K (92,847) | gliner | 4 workers, per chapter | 30 | 190.9 | 13.6 | 177.3 | 1.52x | 8.03 | 0 |
| Old Mortality Complete (168,177) | booknlp-small | whole book | 1 | 286.6 | 6.4 | 280.2 |  | 6.06 | 0 |
| Old Mortality Complete (168,177) | booknlp-small | 1 worker, per chapter | 45 | 375.4 | 6.9 | 368.5 | 0.76x | 1.85 | 0 |
| Old Mortality Complete (168,177) | booknlp-small | 2 workers, per chapter | 45 | 196.1 | 6.6 | 189.5 | 1.46x | 3.23 | 0 |
| Old Mortality Complete (168,177) | booknlp-small | 4 workers, per chapter | 45 | 126.7 | 7.0 | 119.6 | 2.26x | 5.91 | 0 |
| Old Mortality Complete (168,177) | gliner | whole book | 1 | 322.8 | 7.6 | 315.2 |  | 2.09 | 0 |
| Old Mortality Complete (168,177) | gliner | 1 worker, per chapter | 45 | 322.8 | 7.7 | 315.1 | 1.00x | 2.11 | 0 |
| Old Mortality Complete (168,177) | gliner | 2 workers, per chapter | 45 | 259.3 | 8.1 | 251.2 | 1.24x | 3.78 | 0 |
| Old Mortality Complete (168,177) | gliner | 4 workers, per chapter | 45 | 223.1 | 14.2 | 208.9 | 1.45x | 7.88 | 0 |

## GLiNER: chunked against whole book

| Book | Configuration | Names whole | Names chunked | Precision | Recall | Same type | Max score drift | Score median whole / chunked |
| - | - | - | - | - | - | - | - | - |
| Ruby | 1 worker, per chapter | 310 | 310 | 1.000 | 1.000 | 1.000 | 0.0 | 0.67 / 0.67 |
| Ruby | 2 workers, per chapter | 310 | 310 | 1.000 | 1.000 | 1.000 | 0.0 | 0.67 / 0.67 |
| Ruby | 4 workers, per chapter | 310 | 310 | 1.000 | 1.000 | 1.000 | 0.0 | 0.67 / 0.67 |
| Ruby | 4 workers, chapters cut at 1500 words | 310 | 310 | 1.000 | 1.000 | 1.000 | 0.0 | 0.67 / 0.67 |
| In Camp With A Tin Soldier | 1 worker, per chapter | 653 | 653 | 1.000 | 1.000 | 1.000 | 0.0 | 0.69 / 0.69 |
| In Camp With A Tin Soldier | 2 workers, per chapter | 653 | 653 | 1.000 | 1.000 | 1.000 | 0.0 | 0.69 / 0.69 |
| In Camp With A Tin Soldier | 4 workers, per chapter | 653 | 653 | 1.000 | 1.000 | 1.000 | 0.0 | 0.69 / 0.69 |
| In Camp With A Tin Soldier | 4 workers, chapters cut at 1500 words | 653 | 653 | 1.000 | 1.000 | 1.000 | 0.0 | 0.69 / 0.69 |
| Dan The Newsboy | 1 worker, per chapter | 1175 | 1175 | 1.000 | 1.000 | 1.000 | 0.0 | 0.74 / 0.74 |
| Dan The Newsboy | 2 workers, per chapter | 1175 | 1175 | 1.000 | 1.000 | 1.000 | 0.0 | 0.74 / 0.74 |
| Dan The Newsboy | 4 workers, per chapter | 1175 | 1175 | 1.000 | 1.000 | 1.000 | 0.0 | 0.74 / 0.74 |
| Dan The Newsboy | 4 workers, chapters cut at 1500 words | 1175 | 1175 | 1.000 | 1.000 | 1.000 | 0.0 | 0.74 / 0.74 |
| K | 1 worker, per chapter | 1495 | 1495 | 1.000 | 1.000 | 1.000 | 0.0 | 0.69 / 0.69 |
| K | 2 workers, per chapter | 1495 | 1495 | 1.000 | 1.000 | 1.000 | 0.0 | 0.69 / 0.69 |
| K | 4 workers, per chapter | 1495 | 1495 | 1.000 | 1.000 | 1.000 | 0.0 | 0.69 / 0.69 |
| Old Mortality Complete | 1 worker, per chapter | 2580 | 2580 | 1.000 | 1.000 | 1.000 | 0.0 | 0.67 / 0.67 |
| Old Mortality Complete | 2 workers, per chapter | 2580 | 2580 | 1.000 | 1.000 | 1.000 | 0.0 | 0.67 / 0.67 |
| Old Mortality Complete | 4 workers, per chapter | 2580 | 2580 | 1.000 | 1.000 | 1.000 | 0.0 | 0.67 / 0.67 |

## BookNLP: chunked against whole book

| Book | Weights | Configuration | Characters whole / chunked | Recall (major) | Precision | Split (major) | Conflated | Quotes whole / chunked | Speaker agreement | Gender agreement |
| - | - | - | - | - | - | - | - | - | - | - |
| Ruby | big | 1 worker, per chapter | 155 / 136 | 0.761 (1.000) | 0.882 | 4 (2) | 2 | 479 / 476 | 0.9534 (472 shared, 0 unmapped) | 0.9875 (80) |
| Ruby | big | 4 workers, chapters cut at 1500 words | 155 / 136 | 0.761 (1.000) | 0.875 | 3 (2) | 2 | 479 / 470 | 0.9572 (467 shared, 0 unmapped) | 0.9756 (82) |
| Ruby | small | 1 worker, per chapter | 154 / 146 | 0.812 (1.000) | 0.877 | 3 (2) | 0 | 479 / 477 | 0.9621 (475 shared, 0 unmapped) | 1.0 (87) |
| Ruby | small | 4 workers, chapters cut at 1500 words | 154 / 146 | 0.805 (1.000) | 0.877 | 4 (3) | 0 | 479 / 474 | 0.9619 (472 shared, 0 unmapped) | 0.9889 (90) |
| In Camp With A Tin Soldier | big | 1 worker, per chapter | 207 / 185 | 0.797 (1.000) | 0.892 | 1 (1) | 1 | 1262 / 1251 | 0.9816 (1249 shared, 0 unmapped) | 1.0 (86) |
| In Camp With A Tin Soldier | small | 1 worker, per chapter | 203 / 179 | 0.798 (1.000) | 0.905 | 1 (1) | 1 | 1265 / 1262 | 0.9429 (1261 shared, 0 unmapped) | 0.9877 (81) |
| In Camp With A Tin Soldier | small | 4 workers, chapters cut at 1500 words | 203 / 174 | 0.783 (1.000) | 0.925 | 3 (2) | 1 | 1265 / 1257 | 0.93 (1229 shared, 0 unmapped) | 0.9639 (83) |
| Dan The Newsboy | big | 1 worker, per chapter | 501 / 455 | 0.830 (1.000) | 0.923 | 6 (4) | 2 | 2816 / 2805 | 0.9492 (2796 shared, 0 unmapped) | 0.9964 (274) |
| Dan The Newsboy | small | 1 worker, per chapter | 514 / 478 | 0.841 (0.985) | 0.908 | 4 (4) | 2 | 2841 / 2833 | 0.9381 (2813 shared, 0 unmapped) | 0.9889 (271) |
| Dan The Newsboy | small | 4 workers, chapters cut at 1500 words | 514 / 467 | 0.811 (0.985) | 0.906 | 7 (4) | 1 | 2841 / 2816 | 0.9392 (2795 shared, 0 unmapped) | 0.9888 (268) |
| K | small | 1 worker, per chapter | 435 / 381 | 0.782 (0.976) | 0.882 | 3 (2) | 3 | 2164 / 2137 | 0.8829 (2067 shared, 0 unmapped) | 0.9508 (183) |
| Old Mortality Complete | small | 1 worker, per chapter | 1524 / 1345 | 0.774 (1.000) | 0.884 | 25 (9) | 14 | 3008 / 2981 | 0.973 (2959 shared, 0 unmapped) | 0.9686 (541) |

## GLiNER alongside BookNLP, against one after the other

| Book (words) | Weights | One after the other s | Together s | Speed-up | Peak GB (GLiNER / BookNLP) |
| - | - | - | - | - | - |
| Ruby (19,185) | small | 98.24 | 76.19 | 1.29x | 2.1 / 1.97 |
| In Camp With A Tin Soldier (36,634) | small | 200.11 | 156.77 | 1.28x | 2.11 / 2.46 |
| Dan The Newsboy (59,647) | small | 459.89 | 396.68 | 1.16x | 2.09 / 3.34 |
| K (92,847) | small | 449.81 | 422.44 | 1.06x | 2.11 / 4.07 |
| Old Mortality Complete (168,177) | small | 609.33 | 499.2 | 1.22x | 2.11 / 6.11 |
