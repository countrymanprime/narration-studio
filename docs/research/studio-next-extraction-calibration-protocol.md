# Extraction confidence: calibration protocol

**Date:** 2026-10-11. **Slice:** SN-X13 / SNX-1 ([#1143](https://github.com/countrymanprime/narration-utils/issues/1143)), Phase 1 of the [Studio Next extraction PRD](../prds/studio-next-extraction-and-analysis-tools.prd.md). **For:** SN-X8, the evaluation harness, which implements this protocol and writes the calibration table. Nothing is measured here.

The rule being calibrated is [ADR 0803](../adr/0803-an-extraction-suggestion-at-75-percent-or-more-is-applied-and-flagged-review-and-one-under-75-percent-needs-verification.md): a suggestion at or above `VerifyBelow` is applied and flagged Review; one below it, or with no confidence, needs verification. The value is `extraction.VerifyBelow = 0.75` in `apps/desktop/internal/extraction/rule.go`, the only place the number is written. The PRD's failure test is "confident wrong entries above a few percent". This protocol says how to find out, and what a result may change.

## Books

Two scored books and one smoke book. All are public domain, with the text taken from the source LibriVox reads from (D71). **The egress proxy denied `gutenberg.org` and `librivox.org` on 2026-10-11, so the URLs and editions below were not re-read this session**; SN-X8 confirms each before use and records the exact URL, edition and the public-domain statement from the page.

LitBank, which BookNLP's models were trained on, contains *Alice*, *Pride and Prejudice* and *Treasure Island* (its README table, read 2026-10-11). A book in LitBank flatters BookNLP, so the scored books are outside it.

| Role | Book | Source | Why this one |
| --- | --- | --- | --- |
| Scored | *The Wind in the Willows*, Kenneth Grahame, 1908 | Project Gutenberg ebook 289 (`https://www.gutenberg.org/ebooks/289`); the LibriVox page for the solo reading is recorded by the runner | Invented-feeling names (Mole, Ratty, Toad), animals as characters, long stretches of nature description, alias traps (Toad, Mr. Toad; the disguise in the late chapters) |
| Scored | *Three Men in a Boat*, Jerome K. Jerome, 1889 | Project Gutenberg ebook 308 (`https://www.gutenberg.org/ebooks/308`); LibriVox page recorded by the runner | First-person narrator, few characters with strong asides, dialogue without tags, a style the other book lacks |
| Smoke only | *Alice's Adventures in Wonderland*, Lewis Carroll, 1865 | The repo fixture `tests/fixtures/alice_raw.txt` (Gutenberg ebook 11) | Already in the repo and used by the 2026-10-10 trial; in LitBank, so its BookNLP numbers are never used to change a default |

Public-domain statement to record for each: the Project Gutenberg record's own "Public domain in the USA" line, copied with the date it was read. Chapters used, chosen before any tool runs and fixed in the table:

| Book | Chapters | Why they differ |
| --- | --- | --- |
| *The Wind in the Willows* | I (cast introduced), VI (one character dominates), VIII (disguise, many minor speakers) | An introduction, a single-lead chapter and a crowded one |
| *Three Men in a Boat* | I to III (cast introduced), plus the two later chapters with the most quoted lines, counted by the harness | Narrator-heavy opening against a dialogue-heavy middle |

Aim for at least 15,000 words per scored book. The chapter numbers above come from the books' tables of contents as remembered, not re-read here; SN-X8 confirms them against the fetched text, then fixes the list. The harness refuses a chapter list changed after the first run.

## The gold set

A gold item is a hand-checked answer in the same shape as a suggestion, so a match is a fingerprint equality, not a string guess.

| Kind | A gold item is | Evidence |
| --- | --- | --- |
| `entry` | A character, place or thing the narrator would put in the Story Bible, with its category | One quote where it appears |
| `alias` | A name the text uses for an entry, with the entry | One quote showing the link |
| `speaker` | A quoted line and who says it | The line, with its paragraph and offsets |
| `property` | A fact the text states about an entry (key and value) | The sentence |
| `claim` | A `talk`, `act` or `know` claim about an entry | The sentence |

- **Who checks.** The runner writes the gold by reading the chapters, not by editing a tool's output (a tool's output anchors the reader). A second reader, a person or a fresh session that has not seen the first pass, re-checks a seeded random 20% of the items. If they disagree on more than 5% of that sample, the gold for that book is redone.
- **How many.** Per scored book, at least 40 `entry` items, 40 `alias` items, 100 `speaker` items (stratified into explicit, implicit and anaphoric lines, the types the PDNC research uses), 30 `property` items and 30 `claim` items. A kind with fewer than 30 items is reported but cannot move the threshold.
- **Where it is kept.** In an ignored local directory, never committed: `.local/calibration/<book-id>/gold.jsonl` once SN-X8 adds the ignore entry (this slice may not touch `.gitignore`), and until then outside the repository. The book text is not committed either; it is fetched by the recorded URL.
- **Format.** One JSON object per line:

  ```json
  {"id": "wiw-0001", "kind": "speaker", "payload": {"quote": "...", "speaker": "Mole"},
   "evidence": [{"paragraphId": "ch1-p14", "start": 0, "end": 31, "text": "..."}],
   "checkedBy": ["runner", "second"], "note": ""}
  ```

  `payload` and `evidence` follow `extraction.Payload` and `extraction.Evidence`. The fingerprint is `extraction.Fingerprint(payload)`, so spelling, case and typographic quotes do not split a match.

## Scores

For every source, book and kind:

- **Precision** = emitted items judged correct / emitted items. **Recall** = gold items found / gold items. **F1** = their harmonic mean.
- **Judging an emitted item that is not in the gold.** The gold is never complete. The checker adjudicates every such item, or a seeded random 200 per kind if there are more, as valid or invalid, with a quote. Valid items count as correct for precision and are added to the gold for recall (pooling). The seed and the sample size are recorded.
- **A correct item needs its evidence.** An item whose quote fails the evidence check (`extraction.ReasonQuoteNotFound`) is wrong for kinds that need a quote, whatever its content.

**Confidence table.** One table per source, pooled over books and kinds, and one per kind. Rows are the bins `<0.5`, `0.5-0.6`, `0.6-0.7`, `0.7-0.8`, `0.8-0.9`, `0.9-1.0`, and a separate row `null` for a source that gave no confidence. Columns: items, correct, share correct, and the lower end of a Wilson 95% interval for the share. A bin with fewer than 30 items is merged into its neighbour and says so.

**Confident-but-wrong.** The share of items at or above `VerifyBelow` that are wrong, among items that would be applied (confidence at or above the threshold, quote verified, entry present). This is the Key Hypothesis' failure test. The failure line for "a few percent" is **5%** as a proposal; the owner confirms or changes it on the owner queue (#992), and until then the table reports the share without declaring a pass.

**Derived confidence.** BookNLP and GLiNER give no calibrated score. GLiNER gives a span score; BookNLP gives none for clusters or speakers. Where SN-X8 computes a confidence from signals (a tag check, small-versus-large agreement, GLiNER agreement), the table records the formula's version and its inputs. A weight chosen on a book is evaluated only on the other book (train on one, test on the other); weights fitted and scored on the same text are not reported.

## What a result may change

One value, `VerifyBelow`. The decision rule, applied to the pooled table and then to each kind with 30 or more items:

1. Let the target be the share correct the owner accepts for applied items (proposal: 95%, which is the 5% line above).
2. For each bin edge `b`, take every item at or above `b`. `b` qualifies when that share is at least the target on **each** scored book separately.
3. The new value is the lowest qualifying `b`, and for the whole app it is the highest of the per-kind answers (the conservative one). If no edge qualifies, no confidence is trusted and the rule stays at the current value while the finding is raised with the owner.
4. The value moves only to a bin edge, and only when both scored books agree. One book qualifying is a note, not a change.

Nothing else changes: the quote requirement, the entry requirement, the reasons list and the tombstone behaviour of `rule.go` stay as they are. The change is the one constant, its test (`rule_test.go` pins it), the mock's `VERIFY_BELOW`, and an amendment of ADR 0803 through `adr-author`.

## Sources compared

Each run records the tool, its version, the pinned file hashes (from the GLiNER and BookNLP spike notes, `docs/research/studio-next-gliner-spike.md` and `docs/research/studio-next-booknlp-spike.md`), the date, the hardware and the exact command. A run is not comparable without them.

| Source | Version to record | Confidence it gives |
| --- | --- | --- |
| Rules baseline | App commit, spaCy model and version if used | Per the current rules adapter; `null` if none |
| GLiNER `gliner_small-v2.1` | `gliner` and `transformers` versions, model revision, label set, threshold | A span score, not calibrated |
| BookNLP small | `booknlp` version, the three weight hashes | None from the source; derived only |
| BookNLP large | As small | None from the source; derived only |
| An imported LLM file | Model name, provider, date, the prompt template version, the file's SHA-256 | Whatever the file states; `null` where it gives none |

The imported file is produced from the app's own prompt template. The books are public domain, so sending them to a hosted model for this protocol is not sending a narrator's data (D72); the narrator's own manuscript never goes out.

## Provisional until the owner's material

Results calibrated on public-domain or synthetic data are provisional, and a re-run on the owner's own material goes on the owner queue as a QA item before it ships to users (D70, D65). The item for #992:

> **QA, pending:** re-run the extraction calibration protocol (`docs/research/studio-next-extraction-calibration-protocol.md`) on the owner's own manuscript, with a gold set of at least 40 entries and 100 speaker lines checked by the owner, and compare its confidence table and confident-but-wrong share with the public-domain result. It does not block a merge or a launch.
