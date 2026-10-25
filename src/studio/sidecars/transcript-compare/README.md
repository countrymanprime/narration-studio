# Transcript Compare

Transcribes a chapter's narration with a local Whisper model and matches it to the chapter of the
canonical manuscript. The host diffs the words against the chapter
(`src/studio/desktop/internal/comparerun`): a list of misread, skipped and extra words (findings and,
on request, take markers) plus a unified diff file of the script text against what was said. The workflow is documented in
[Transcript Compare](../../../../docs/utilities/transcript-compare.md) and the
[Proof guide](../../../../docs/guides/using-the-app/proof.md).

`<app>` and `<data>` stand for values in `config/brand.json` ([Product and technical names](../../../../docs/architecture/codebase-map.md#product-and-technical-names)).

## Layout

- `core/` — the DAW-agnostic Python backend (`compare.py`). It decodes and transcribes; the tokenizer,
  the chapter match, the alignment and the markers are the host's (`src/studio/desktop/internal/compare`,
  `chaptermatch`, `comparerun` and `recordingcoverage`). No DAW APIs are used here; it's a plain CLI
  invoked by whichever DAW driver below is running it. Its dependencies are declared in the repo-root
  `pyproject.toml` and pinned in `uv.lock`.
- `core/coverage_mode.py` — `compare.py --coverage`: reads a JSON manifest of a chapter's items,
  reuses or writes one words file per item, and writes a words report (`COVERAGE_WORDS`,
  `COVERAGE_UNSURE`, `COVERAGE_RECHECKED`). The host aligns the chapter to the words and writes the
  `COVERAGE` lines. Its module docstring and `docs/utilities/recording-coverage.md` give
  the manifest, words-file and report formats and the exit codes. The Go service that starts it
  is `src/studio/desktop/internal/coverage` (docs/utilities/recording-coverage.md).
- `tests/` — the pytest suite for the backend, plus the recording-coverage ground-truth harness
  (`coverage_harness.py`) and its synthetic labeled fixtures (`fixtures/coverage/`), the alignment
  spike (`coverage_spike.py`) and the calibration (`coverage_calibration.py`); see
  `tests/fixtures/coverage/README.md`. These measure the host's aligner through `go_coverage.py`, which
  builds `src/studio/desktop/cmd/proof-align`, so the suite needs Go.
- REAPER integration is in `src/studio/integrations/reaper/`; a future Audacity driver has placeholder notes under
  `src/studio/integrations/audacity/transcript-compare/`.

## Pieces

- `core/compare.py` — the backend. Runs locally via faster-whisper (no cloud, no API key) +
  a word-level diff against the project's canonical manuscript. Runs under the repo-root shared venv (`.venv/`) so it doesn't
  depend on REAPER's or the system's Python.
- `core/take_divergence_mode.py` — `compare.py --take-divergence`, an additive mode for Take
  Intelligence: it transcribes every take in a JSON manifest and writes their words
  (`TAKE_TRANSCRIPTION` and `TAKE_WORDS` lines). The host aligns them to the span with the same diff
  the markers use and writes each span word's status and time and every divergence as span words plus
  source seconds (`src/studio/desktop/internal/takedivergence`). The manifest, output and exit codes
  are in the module docstring; [Alignment and confidence](../../../../docs/utilities/transcript-compare.md#alignment-and-confidence)
  explains why ASR word timestamps are precise enough. `tests/divergence_harness.py` scores the host's
  alignment (through `tests/go_divergence.py`) against the constructed takes in `tests/fixtures/divergence/`.
- `src/studio/libs/python/narration_common/spoken_forms.py` — the built-in homophone list (your/you're,
  its/it's, etc.), the number words and the filler words, shared with the teleprompter's live
  flags so both forgive the same spellings (`src/studio/ui/tests/visual/lib/capture.ts`). It is Python data rather than a file next
  to the script so a frozen build always carries it. Add a globally-useful pair to
  `HOMOPHONE_GROUPS` there (for something manuscript-specific, use the per-project equivalence
  list instead - see "Handling invented names/words" below).
- The desktop app owns the workflow and settings (`src/studio/desktop/internal/transcript`). Python runs from the
  checkout `.venv` that `pnpm run bootstrap` creates.

## Project files

Settings are layered: a repo-wide default, a per-user **Global** value in
`%APPDATA%\<data>\global-settings.json`, and an optional **This Project** override in
`<project folder>\<app>\settings.json`. Both files are plain JSON, not REAPER ExtState.

Per-project inputs and outputs live in `<project folder>\TranscriptCompare\`:

- `vocabulary_hints.txt` — comma-separated names and terms passed to Whisper as `hotwords`. Best-effort.
  The host suggests terms from the Story Bible (`TranscriptSuggestHints`); the sidecar never saves hints.
- `equivalences.csv` — custom spelling equivalences, one comma-separated group per line, like the built-in
  homophone groups but per manuscript. Only single words match, since matching is word by word.
- `diffs/<track name>_<run number>.diff` — the unified diff of manuscript against transcript, with a plain
  `.manuscript.txt` / `.recorded.txt` pair beside it for two-pane viewers. The host writes them.

One track is one chapter: the host matches the track name (exact, then closest fuzzy match) against the
manuscript's chapter headings before it starts the run (`internal/comparerun`'s `Choose`), and asks for a
pick when no heading matches confidently. The pickup and duplicate scan chooses its chapter the same way, and
`--find-repeats` only transcribes each read; the host groups them ([Take review](../../../../docs/utilities/take-review.md)).

## Notes / limitations

- If you only select/record part of a chapter, the unrecorded rest doesn't produce SKIPPED
  markers — only genuine mid-recording skips do. The VS Code diff's manuscript side is trimmed
  to stop a sentence or two past the last thing actually recorded (using the diff's own
  alignment, not a fuzzy guess), with `...` marking where it was cut off before/after what you
  recorded. Both files are rendered one sentence per line, using the manuscript's own sentences
  as the line boundaries on both sides — a sentence that matches the manuscript exactly
  (ignoring case, punctuation, and how it was split across lines when read aloud) shows the
  manuscript's own text on both sides, so e.g. five short one-clause sentences the manuscript
  uses for dramatic effect but the narrator reads as one flowing, comma-joined sentence don't
  show up as a false diff. A genuinely misread or extra word still shows the real transcribed
  text on its line — and even then, only the actually-wrong word(s) fall back to Whisper's raw
  rendering. The rest of that line reuses the manuscript's own words verbatim, so one real
  misread next to a quote, a capitalized proper noun, a hyphenated compound, or a spelled-out
  number doesn't also paint those as "different" just because Whisper transcribed them a bit
  differently.
- The chapter heading/title text is included in what's diffed (not just the body paragraphs),
  since narrators typically read the title aloud - so a spoken title lines up against the doc
  instead of showing as a false "EXTRA IN AUDIO". The visual diff's audio side shows its own
  heading too (separate from the body, matching the doc side's structure), always using the
  manuscript's own title text — so "Chapter One" reads the same on both sides even if Whisper
  would have rendered the spoken number as a digit. The heading is the title and then the
  subtitle, and reading it is optional: nothing said in it, or between it and the chapter's
  first word, is a marker, so a misheard or reworded title is never a pickup.
- Numbers are normalized before diffing, so "one" in the doc won't falsely flag against Whisper
  transcribing the spoken word as "1" (handles cardinal numbers up to billions, including forms
  like "one hundred and one"). Genuine number misreads (doc says 23, you said 24) still get
  flagged.
- Case, quotation marks, and typographic ("smart") apostrophes/quotes are all ignored for
  matching purposes - a Word apostrophe like "yesterday's" lines up correctly against Whisper's
  straight-apostrophe transcript instead of splitting into two words and showing a false
  MISREAD.
- A trailing possessive-'s is treated the same as a plain plural -s for any word ("sentinel's"
  and "sentinels" sound identical, so there's no way to actually misread one as the other).
- Common homophones (`HOMOPHONE_GROUPS` in `narration_common/spoken_forms.py` - your/you're, their/there/they're, its/it's,
  miner/minor, vane/vein, and several dozen more) are treated as equivalent, so Whisper
  transcribing a correctly-spoken word with the "wrong" spelling doesn't get flagged. Excludes
  any homophone that's also a number word (one/won, to/too/two, for/four, ate/eight), since
  aliasing those could interfere with number normalization above. See "Handling invented
  names/words" above for manuscript-specific spelling variance (invented proper nouns, etc.)
  that a general homophone list can't cover.
- A hyphenated rendering of a compound word (Whisper's "super-powered" vs. the manuscript's
  "superpowered") is treated as the same word too.
- Filler words (uh/um/erm/hmm) are stripped from the transcript before diffing so they don't
  spam markers.
- Multi-item stitching assumes a constant playrate per item (no time-stretching accounted for
  beyond a simple multiply).
- Diff granularity is per contiguous mismatched word-block; Whisper's own word timestamps have
  some jitter, so don't trust marker timing to the millisecond.
- Chunked transcription (the **Chunk**/**Workers** config-screen rows) splits only the
  transcription step - the diff/marker step still runs once over the full assembled transcript,
  same as whole-file mode. Neighbouring chunks share ~3 s (each reaches ~1.5 s past the cut
  between them), and each word is kept from the chunk its midpoint falls in, the cut being the
  middle of the shared span, as the recording check's chunks are joined. A word Whisper hears
  differently in the two chunks right at the cut can still come out once from each side or not
  at all. Language auto-detection runs once (on the first chunk) and is
  reused for the rest when `--language` isn't forced, but each chunk's Whisper call otherwise
  has no visibility into its neighbors.
