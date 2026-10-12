# Extraction confidence: calibration result

**Date:** 2026-10-12. **Issue:** [#1267](https://github.com/countrymanprime/narration-utils/issues/1267), Phase 8 of the [Studio Next extraction PRD](../prds/studio-next-extraction-and-analysis-tools.prd.md). **Question:** does the 75% rule (`extraction.VerifyBelow`, [ADR 0803](../adr/0803-an-extraction-suggestion-at-75-percent-or-more-is-applied-and-flagged-review-and-one-under-75-percent-needs-verification.md)) hold, by the [protocol](studio-next-extraction-calibration-protocol.md)'s rule?

**Verdict: no table yet.** The harness is built and tested, but no source was scored. The two scored books could not be fetched (the egress proxy answered 403 for `gutenberg.org` on 2026-10-12), and no gold set exists, so every figure below is `not run`. No number in this note is estimated. `VerifyBelow` stays 0.75.

## Method

`scripts/research/extraction-calibration` ([README](../../scripts/research/extraction-calibration/README.md)) runs each source's `suggest` command on the books' fixed chapters and matches the output to a gold set by `extraction.Fingerprint`. It reports precision, recall and F1 per kind, a Wilson-bounded confidence table, and the share of applied items that are wrong, as the protocol defines them. Without a gold file, a source, a book or an install, it says `not run` and writes no figure. A bin under 30 items is merged into its neighbour, and a kind under 30 gold items is reported but cannot move the threshold.

The harness's own tests check the scorer against a hand-made gold set and run it end to end offline on invented books with a fake source; that run is a check of the code, not a measurement.

## Books

| Book | Role | Fetched | Gold set |
| --- | --- | --- | --- |
| *The Wind in the Willows* (Gutenberg 289) | Scored | `not run`: proxy 403 on 2026-10-12 | `not run`: not written |
| *Three Men in a Boat* (Gutenberg 308) | Scored | `not run`: proxy 403 on 2026-10-12 | `not run`: not written |
| *Alice's Adventures in Wonderland* (repo fixture `tests/fixtures/alice_raw.txt`) | Smoke only; in LitBank, so never used to change a default | Prepared from the fixture, chapters I and II (4,281 words) | Not written |

The chapter lists are those of the protocol (*Wind in the Willows* I, VI, VIII; *Three Men in a Boat* I to III) and are fixed by the harness on the first successful fetch. The public-domain statement from each Project Gutenberg record is to be copied into `source.json` when the book is fetched; it was not read here.

## Sources

| Source | Version and date | Result |
| --- | --- | --- |
| Rules baseline | App commit `3f5a04c8`, 2026-10-12, no spaCy | Ran on the Alice smoke book only: 9 `entry` suggestions, all with `null` confidence (the rules give a number only for speech-tag speakers). Not scored: no gold |
| GLiNER `gliner_small-v2.1` | `not run`: not installed in this environment | `not run` |
| BookNLP small | `not run`: not installed in this environment | `not run` |
| BookNLP large | `not run`: not installed in this environment | `not run` |
| Imported LLM file | `not run`: no file was produced | `not run` |

## Confidence versus correctness

Per source, pooled over books and kinds, bins `<0.5`, `0.5-0.6`, `0.6-0.7`, `0.7-0.8`, `0.8-0.9`, `0.9-1.0` and `null`:

| Source | Table | Confident but wrong (at or above 0.75) |
| --- | --- | --- |
| Rules baseline | `not run` | `not run` |
| GLiNER small | `not run` | `not run` |
| BookNLP small | `not run` | `not run` |
| BookNLP large | `not run` | `not run` |
| Imported LLM file | `not run` | `not run` |

The failure line for "a few percent" is 5% as a proposal; the owner confirms it, so even a measured share would not declare a pass.

## Which figures are provisional

All of them will be. Anything calibrated on public-domain books is provisional until the same protocol is run on the owner's own manuscript (D70). Nothing is measured yet, so there is nothing to compare with.

## Threshold recommendation

`VerifyBelow` stays 0.75: no source was scored on either scored book, and the protocol moves the value only to a bin edge where both scored books agree.

## How to reproduce

1. Fetch the books, from a machine that can reach Project Gutenberg: `python scripts/research/extraction-calibration/run_calibration.py fetch`. Texts, gold and output are ignored local data under `scripts/research/extraction-calibration/data/`.
2. Write each book's `gold.jsonl` by reading its chapters, to the protocol's format and minimums (`... gold-check` lists the shortfalls), and have a second reader re-check a seeded 20%.
3. Run `... run` with `--gliner-install`, `--booknlp-small-install` and `--booknlp-large-install` pointing at the registry's install folders, and `--import-file` for an imported model's output. Adjudicate the unjudged items the report counts, in `adjudicated.jsonl`, and run again.
4. Copy the report's tables into this note with the tool versions and date, and replace the recommendation with the harness's sentence.

## Owner steps, pending

The re-run on the owner's own manuscript, and the decision whether to change `VerifyBelow` if a table recommends it, are listed on the QA checklist ([#1495](https://github.com/countrymanprime/narration-utils/issues/1495)). They do not block a merge or a launch.
