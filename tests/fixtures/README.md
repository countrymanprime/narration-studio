# Test fixtures

Real manuscript content for exercising manuscript import (docx/markdown/pdf/txt/epub)
end-to-end, instead of synthetic one-off files. Not runtime dependencies -
used from tests and for manual/ad-hoc verification.

`<data>` stands for values in `config/brand.json` ([Product and technical names](../../docs/architecture/codebase-map.md#product-and-technical-names)).

## alice.epub

An EPUB 3 book (with an EPUB 2 `toc.ncx` alongside its `nav.xhtml`, as many real
exporters ship both) built by `write_epub` in `generate_alice.py` from the same
three-chapter Gutenberg text as `alice.txt`/`alice.md`/`alice.docx`, so
`TestEPUBFixtureParityWithAliceMarkdown` (`src/studio/desktop/internal/importer/epub_test.go`)
can compare their narration text directly. A front-matter document with no
heading precedes the chapters, classified Front Matter/Cover the same way
`alice.txt`'s own front matter is - unlike `alice.md`/`alice.docx`, which give
the book title its own `Title`-styled heading and section, `alice.epub` has
none, so it has 3 chapters where `alice.md`/`alice.docx` have 4.

Regenerate along with the others (below), or on its own without the
`python-docx`/`fpdf2` dependencies:

```powershell
cd tests/fixtures
python -c "import importlib.util; from pathlib import Path; spec = importlib.util.spec_from_file_location('gen', 'generate_alice.py'); mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod); mod.write_epub(mod.parse_chapters(Path('alice_raw.txt')), Path('alice.epub'))"
```

## sound-alike/

`cases.json` holds misread pairs, each a script text and what was heard, with the band its misread confidence must fall in.
`TestMisreadConfidenceFallsInEachCalibrationCasesBand` (`src/studio/desktop/internal/soundalike/soundalike_test.go`) holds
the scorer to every pair. The pairs come from two places: the owner's examples in #2251 item 27, and what Whisper
large-v3-turbo heard against the script in the committed LibriVox word timings (`audio/librivox-alice/alignment`), which
Transcript Compare's markers found. `PRINT_CALIBRATION=1 go test -v -run Print ./internal/soundalike` prints every score.
Hand-written; add a pair when a real misread is scored wrongly.

## heading-misreads/

Small constructed manuscripts (DOCX, EPUB, Markdown and plain text, one chapter heading each) that exercise the
importer's title/subtitle heuristic: 5 controls and 18 misreads, 7 of them since fixed.
`cases.json` records each case's intended and observed title and subtitle, and `TestHeadingMisreadFixtures`
(`src/studio/desktop/internal/importer/heading_misreads_test.go`) holds the importer to the observed values.
[The import failure modes](../../docs/architecture/import-settings-workflow.md#failure-modes) say what each case
shows, and the subtitle override uses these cases as its fixtures. Regenerate with the standard library only:

```powershell
cd tests/fixtures/heading-misreads
python generate.py
```

## teleprompter-locate/

The recorded tails the teleprompter's tail-audio locate is measured on
([Resume: where REAPER is and where the prompter was](../../docs/architecture/manuscript-teleprompter.md#resume-where-reaper-is-and-where-the-prompter-was),
`src/studio/sidecars/manuscript-teleprompter/tests/test_locate.py`). `chapter.txt` is Chapter I of `alice.md` (one paragraph per
line, `_italics_` markers removed) and `chapter-repeated.txt` the same chapter with its twelfth paragraph repeated at the
end. `tails.json` holds, per case, what the tiny Whisper model heard in the last seconds of a Piper reading that stops at
a known word (`expectedWord`), and whether the case should be confident. Only the transcripts are committed, not the
audio. Regenerate with the app's own installed voice and model:

```powershell
uv run python src/studio/sidecars/manuscript-teleprompter/spikes/record_locate_tails.py `
  --piper-model "$env:LOCALAPPDATA/<data>/assets/tts/piper/en_US-ljspeech-high/1.0.0/en_US-ljspeech-high.onnx" `
  --model-dir "$env:LOCALAPPDATA/<data>/assets/whisper/faster-whisper/tiny/<commit>"
```

## alice.txt

A Gutenberg-shaped, hard-wrapped plain-text export of the same three chapters (`write_txt` in
`generate_alice.py`): a `*** START OF ... ***`/`*** END OF ... ***` boilerplate pair, lines
wrapped at about 70 columns, and `_word_` underscore italics, matching `alice_raw.txt`'s own
shape. Used by the TXT importer's parity and hazard tests
(`src/studio/desktop/internal/importer/txt_test.go`).

## after-the-applause.md

The front matter from an owner report (a title split
across lines, an all-capitals title, a genre descriptor, a bare-name byline and a copyright line), imported through
`manuscript.Service` and read by `credits.Detect` in `src/studio/desktop/creditsdetect_test.go`, so the fix for the
`storedPath` double-join defect and the front matter parser are both exercised against a real commit()-produced
project rather than a hand-built `manuscript.json`.

## alice.docx / alice.md / alice.pdf

The first three chapters of *Alice's Adventures in Wonderland* (Lewis
Carroll, 1865 - public domain worldwide), sourced from Project Gutenberg
EBook #11 (`alice_raw.txt`). Real prose, real chapter breaks, and real
typographic punctuation (curly quotes, em dashes) that a purely synthetic
fixture wouldn't exercise.

`alice.docx` also has a "Contents" Heading-1 paragraph inserted before
Chapter II specifically to exercise the non-chapter-heading skip path
(`isNonChapterHeading` in `src/studio/desktop/internal/importer/`) against a real
heading, not just a synthetic unit-test one.

Regenerate with:

```powershell
cd tests/fixtures
python generate_alice.py alice_raw.txt
```

Needs `python-docx` and `fpdf2` (`pip install fpdf2` - a fixture-generation
tool only, not a project dependency) and, as written, a Windows Arial TTF
path for Unicode PDF text - see the script for how to point it elsewhere.

**Known limitation, deliberately left visible:** `alice.pdf` has no reliable chapter boundaries
(`pypdf` text extraction never yields a blank line for a PDF built this way), so the Go importer rejects it;
`TestPDFFixtureIsRejectedUntilChapterBoundariesAreReliable` (`src/studio/desktop/internal/importer/importer_test.go`) holds it to that.

## audio/librivox-alice/

Markers and recipes for seven public-domain LibriVox readings of *Alice* chapters (the demo script), which are fetched
from archive.org to build real-speech test corpora: the recording check, the character-continuity trial and the audio
diagnostics. See [its README](audio/librivox-alice/README.md) and `tests/fixtures/audio/librivox-alice/README.md`.

## repeat-rule/

`parity-cases.json`: the cases for "a run of extra words says the script beside it again" (issue #2251 item 30), which the
host's take markers and recording check (`src/studio/desktop/internal/recordingcoverage`, `RepeatOf`) and the Editing page
(`src/studio/ui/src/components/editing/model/duplicates.ts`, `saysScriptAgain`) implement. `coverage_test.go` and
`duplicates.test.ts` read the file, so the two copies of the rule cannot drift apart.

## compare-parity/

`cases.json`: Python's own answers, on a seeded set of awkward inputs, for the text rules the host's port of Transcript Compare
(`src/studio/desktop/internal/compare`) reproduces: the tokenizer, the sentence split, the chapter units, the number-word merge,
the equivalence list, `difflib.SequenceMatcher`, `str.split`, `str.strip`, `str.lower`, and float `repr`, `round` and `sum`.
`compare.py` wrote it before its tokenizer was deleted (2026-10-24), so it is frozen: `compare_test.go` must agree with it, and
`test_compare_go_parity.py` holds `narration_common`'s number merge, which the teleprompter still runs, to the same answers.

## guide-edit/

`edit-parity.json`: what the manuscript-guide sidecar's `edit` command did to a Story Bible file, case by case: the file it
left, or the reason it refused. The host edits the file itself (`src/studio/desktop/internal/guide/edit.go`), and
`edit_test.go` and `edit_held_test.go` replay every case. The sidecar's `edit` and its recorder were deleted (2026-10-25,
[Go versus Python for the sidecars](../../docs/research/sidecar-go-vs-python.md), step 3), so the file is frozen: nothing
rewrites it. The other Story Bible commands' cases are frozen the same way in `src/studio/desktop/internal/guide/testdata/`.

## guide-rules/

What the manuscript-guide sidecar's `suggest --source rules` did with each case, recorded before the rules moved into the host
(2026-10-25, [Go versus Python for the sidecars](../../docs/research/sidecar-go-vs-python.md), step 3, second PR).
`cases.jsonl` holds one case a line: the manuscript file's exact text, or `manuscriptPath`, a repository path to one (the
`*.manuscript.json` files here are the Markdown fixtures as canonical manuscripts), or null for no file; and the Story
Bible file's exact text, or null. `cases.golden.json` holds, for each case in the same order, the lines the command printed,
its exit status and, when it failed, the exception's type and words. `src/studio/desktop/internal/guide/rules_parity_test.go`
replays every case through `guide.RuleSuggestions`: the same lines byte for byte, and an error where the command exited 1, in
its words where it refused rather than crashed. The recorder was deleted with the Python rules, so the files are frozen.

## guide-cues/

What the manuscript-guide sidecar's `cues` command and `build` did with the dialogue cues, recorded before the cues moved into
the host (2026-10-25, [Go versus Python for the sidecars](../../docs/research/sidecar-go-vs-python.md), step 3, third PR).
`cases.jsonl` holds one run of `cues` a line: `rulesCase`, the name of a `guide-rules/` case whose manuscript and Story Bible it
reads, or the manuscript's exact text or `manuscriptPath` and the Story Bible's exact text, `guidePath` (`alice-corrected.guide.json`
here) or null; and the `--chapter-id` values. `cases.golden.json` holds, for each case in the same order, the `CUES|n|m` line, the
exit status, the exception's type and words when it failed, and the Story Bible file afterwards: its text when under 4 KiB, and its
SHA-256. `builds.jsonl` holds a manuscript and the Story Bible a build rebuilt; `builds.golden.json` holds the file the build wrote
while it found the cues itself (its SHA-256, and its text when short) and the file it writes now, keeping the old cues (`cut`), each
with its exit status; the manuscript's path in a built file is `@MANUSCRIPT@` and the clock was fixed. Python wrote every file with
LF line ends. `src/studio/desktop/internal/guide/cues_parity_test.go` replays every case through the host's refresh and checks the
file byte for byte; it refreshes each `cut` file and checks the result is the old build's. The sidecar's `test_build_golden.py`
checks `build` still writes each `cut` file. The recorder was deleted with the Python cue code, so the files are frozen.

## booth-parity/

`text-rules.json`: Python 3.12's own answers for the text rules the host needs to follow a read the way the Booth's
sidecar does ([Go versus Python for the sidecars](../../docs/research/sidecar-go-vs-python.md), step 2). It holds a digest
of `str.lower`, `re`'s `\w` and `str.isspace` over every code point, with `str.lower` also tried beside a capital sigma
on both sides, and `spoken_key` over seeded text. `src/studio/libs/python/tests/test_pyunicode_tables.py` writes it
(`UPDATE_CONTRACTS=1`) and checks that `src/studio/desktop/internal/compare/pyunicode_gen.go` is what
`scripts/dev/gen-pyunicode.py` generates from the same Python. `internal/compare`'s `pyunicode_test.go` must agree with it.
