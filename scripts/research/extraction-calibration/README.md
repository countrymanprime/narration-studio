# Extraction calibration harness

Scores each extraction source against a hand-checked gold set and writes the confidence-versus-correctness table that the
75% rule (`extraction.VerifyBelow`, ADR 0803) is calibrated against. The protocol is
[studio-next-extraction-calibration-protocol.md](../../../docs/research/studio-next-extraction-calibration-protocol.md); the
result is [studio-next-extraction-calibration.md](../../../docs/research/studio-next-extraction-calibration.md).

The harness runs the sidecar's own read-only `suggest` command (`sidecars/manuscript-guide/core/manuscript_guide.py suggest`),
so what is scored is what the app would be offered. It never invents a figure: a source that is not installed, a book that is
not fetched and a book with no gold set are each `not run` with a sentence.

## Commands

Run from the repository root with `python` (the standard library only).

| Command | What it does |
| --- | --- |
| `python scripts/research/extraction-calibration/run_calibration.py fetch` | Downloads the scored books from `data/books.json`, cuts the fixed chapters into `data/<id>/manuscript.json` and records the URL, date and SHA-256 in `source.json`. Also prepares the Alice smoke book from `tests/fixtures/alice_raw.txt` |
| `... run [--gliner-install D] [--booknlp-small-install D] [--booknlp-large-install D] [--spacy-model S] [--import-file F] [--rules-only]` | Runs every source it can and writes `data/out/report.md` |
| `... run --fake` | Offline demonstration on two invented books and a fake source; the report says it is not a measurement |
| `... gold-check` | Counts each book's gold items against the protocol's minimums |

Add `--books alice` to work on the smoke book only. The install folders are the ones the app's asset registry fills (ADR 0848).

## Local data (never committed)

`.gitignore` here ignores everything under `data/` except `books.json`, and `out/`. A book lives in `data/<id>/`:

| File | Holds |
| --- | --- |
| `text.txt`, `source.json`, `manuscript.json` | The downloaded text, where and when it came from, and the cut chapters. `chapters.lock.json` fixes the chapter list on the first run; a different list is refused |
| `gold.jsonl` | The hand-checked answers, one JSON object per line, in the protocol's format. The runner writes it by reading the chapters, not by editing a tool's output |
| `adjudicated.jsonl` | The checker's verdicts on emitted items that are not in the gold: `{"fp": "<fingerprint>", "valid": true}`. An item with neither a gold match nor a verdict is `unjudged` and left out of precision |
| an imported LLM file | Produced from the app's prompt template; pass it with `--import-file` |

Fingerprints are `extraction.Fingerprint` ported to `calibration/fingerprint.py`, so spelling, case and typographic quotes do not
split a match.

## Tests

```text
python -m pytest scripts/research/extraction-calibration -q
python -m ruff check scripts/research/extraction-calibration
python -m ruff format --check scripts/research/extraction-calibration
```
