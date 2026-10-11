# Transcript Compare

Transcribes a chapter's narration with a local Whisper model, matches it to the chapter of the
canonical manuscript, and diffs the two. The result is a list of misread, skipped and extra words
(the host turns them into findings and, on request, take markers) plus a unified diff file of the
script text against what was said. The workflow is documented in
[Transcript Compare](../../docs/utilities/transcript-compare.md) and the
[Proof guide](../../docs/guides/using-the-app/proof.md).

## Layout

- `core/` — the DAW-agnostic Python backend (`compare.py`), plus
  `common_words.txt`. No DAW APIs are used here; it's a plain CLI invoked by whichever DAW
  driver below is running it. Its dependencies are declared in the repo-root `pyproject.toml` and pinned in `uv.lock`.
- `core/recording_coverage.py` — the recording-coverage model: how much of a chapter's body text the
  recording contains, in order, computed from the same alignment as the take markers; see
  `docs/research/recording-coverage-alignment-spike.md`.
- `core/coverage_mode.py` — `compare.py --coverage`: reads a JSON manifest of a chapter's items,
  reuses or writes one words file per item, and writes `COVERAGE` lines with JSON payloads
  (measurements only; the host applies the thresholds), then the word alignment
  (`COVERAGE_TOKEN`, `COVERAGE_EXTRA`, ADR 0242). `--align-only` re-aligns from cached words and
  never transcribes. Its module docstring and ADR 0127 give
  the manifest, words-file and output formats and the exit codes. The Go service that starts it
  is `apps/desktop/internal/coverage` (ADR 0128, docs/utilities/recording-coverage.md).
- `tests/` — the pytest suite for the backend, plus the recording-coverage ground-truth harness
  (`coverage_harness.py`) and its synthetic labeled fixtures (`fixtures/coverage/`), and the
  alignment spike that scores `core/recording_coverage.py` on them (`coverage_spike.py`); see
  `docs/research/recording-coverage-fixtures.md`.
- REAPER integration is in `integrations/reaper/`; a future Audacity driver has placeholder notes under
  `integrations/audacity/transcript-compare/`.

## Pieces

- `core/compare.py` — the backend. Runs locally via faster-whisper (no cloud, no API key) +
  a word-level diff against the project's canonical manuscript. Runs under the repo-root shared venv (`.venv/`) so it doesn't
  depend on REAPER's or the system's Python.
- `core/take_divergence_mode.py` and `core/take_divergence.py` — `compare.py --take-divergence`, an
  additive mode for Take Intelligence: it aligns every take in a JSON manifest to one fixed manuscript
  span with the same diff the markers use and writes, per take, each span word's status and time and
  every divergence as span words plus source seconds (`TAKE_DIVERGENCE|{json}` lines). The manifest,
  output and exit codes are in the module docstring;
  [ADR 0141](../../docs/adr/0141-per-take-divergence-is-localized-by-the-markers-diff-and-asr-word-timestamps.md)
  and [the evaluation](../../docs/research/take-divergence-evaluation.md) explain why ASR word
  timestamps are precise enough. `tests/divergence_harness.py` scores it against the constructed takes
  in `tests/fixtures/divergence/`.
- `libs/python/narration_common/spoken_forms.py` — the built-in homophone list (your/you're,
  its/it's, etc.), the number words and the filler words, shared with the teleprompter's live
  flags so both forgive the same spellings (ADR 0105). It is Python data rather than a file next
  to the script so a frozen build always carries it. Add a globally-useful pair to
  `HOMOPHONE_GROUPS` there (for something manuscript-specific, use the per-project equivalence
  list instead - see "Handling invented names/words" below).
- `core/common_words.txt` — a stoplist of ordinary English words, used only by the config
  screen's **Suggest...** button (see "Handling invented names/words" below) to avoid
  suggesting common words that just happen to be capitalized mid-sentence.
- The desktop app owns the workflow and settings (`apps/desktop/internal/transcript`). Python runs from the
  checkout `.venv` that `pnpm run bootstrap` creates.

## Project files

Settings are layered: a repo-wide default, a per-user **Global** value in
`%APPDATA%\narration-utils\global-settings.json`, and an optional **This Project** override in
`<project folder>\narration-utils\settings.json`. Both files are plain JSON, not REAPER ExtState.

Per-project inputs and outputs live in `<project folder>\TranscriptCompare\`:

- `vocabulary_hints.txt` — comma-separated names and terms passed to Whisper as `hotwords`. Best-effort.
  `compare.py --hints-out` writes suggested terms (capitalized words that are not sentence-initial, minus
  `core/common_words.txt`) for the user to review; it never saves hints itself.
- `equivalences.csv` — custom spelling equivalences, one comma-separated group per line, like the built-in
  homophone groups but per manuscript. Only single words match, since matching is word by word.
- `diffs/<track name>_<run number>.diff` — the unified diff of manuscript against transcript, with a plain
  `.manuscript.txt` / `.recorded.txt` pair beside it for two-pane viewers.

One track is one chapter: the track name is matched (exact, then closest fuzzy match) against the
manuscript's chapter headings, and the run asks for a pick when no heading matches confidently. This
happens before audio is decoded.

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
  would have rendered the spoken number as a digit. A genuinely misread title still gets
  flagged as a normal MISREAD marker.
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
  same as whole-file mode. Chunks overlap by ~1.5s and duplicate words in that overlap are
  de-duplicated on reassembly, but this is a heuristic, not a guarantee - a chunk boundary
  landing mid-word/mid-sentence in an unlucky spot can still occasionally produce an extra or
  missing word right at the seam. Language auto-detection runs once (on the first chunk) and is
  reused for the rest when `--language` isn't forced, but each chunk's Whisper call otherwise
  has no visibility into its neighbors.
