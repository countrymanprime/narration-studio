# Story Bible mutations: warm Python worker, Go, or neither

**Date:** 2026-10-18. **Related:** [#1897](https://github.com/countrymanprime/narration-utils/issues/1897) (sidecar start-up instrumentation, a parallel spike), [interaction latency baseline](interaction-latency-baseline.md).

## Question

A Story Bible mutation (an edit, a lock, a merge) starts a frozen Python process, which cost 226 to 380 ms p50 in the [baseline](interaction-latency-baseline.md#after-phase-4) against under 10 ms for a Go-native call. `sidecars/manuscript-guide/core/manuscript_guide.py` (2,388 lines) does the model work (build, pronunciation lookups, voice previews) and also the pure-data mutations of `manuscript_guide.json`. Three options for the pure-data mutations:

- **A.** A warm Python worker the host starts, speaking NDJSON over stdin and stdout, with no port, an idle exit and a restart after a crash.
- **B.** Port the mutations to Go, so the host writes `manuscript_guide.json` and Python keeps the model work.
- **C.** Leave it as it is.

The owner also asked whether any other Python code that is not model work would be faster or more stable in Go.

**Recommendation: B, split by operation.** Python keeps everything that calls a model, a dictionary or a voice. The full-length numbers decide it: on an 88,000-word book the Story Bible file is 5 MB, and reading and rewriting it costs more than starting the process.

- A warm worker removes only the start. Its edit, which still re-reads the file, ties with a Go edit that re-reads it (about 130 ms p50 each).
- Go pulls ahead only because the host can keep the document in memory between edits, which no per-call process can do. Measured end to end, that is 21 to 27 ms p50 for a full-length edit. The list of operations to move, in order, is in [What to move first](#what-to-move-first).

## Method

- **Prototype.** Both prototypes are kept out of the app.
  - The worker is `sidecars/manuscript-guide/spikes/serve_worker.py`. It runs the sidecar's own command line (`manuscript_guide.main`) once per request line and answers with the exit code, stdout and stderr that a spawn would have produced. So any command works unchanged, and the host could treat the two transports the same.
  - The worker re-reads the file on every command, as a spawn does. It refuses `build`, `render-audio`, `self-check` and `suggest`, and exits after 60 s idle or when stdin closes.
  - The Go side is in `apps/desktop/internal/spike/guidemutation`, under the `spike` build tag. `worker.go` is the host end of the worker: it starts the worker on the first call and again after the worker has exited. `mutate.go` is `edit` for every field except `aliases`. setLocked is an edit of `locked`.
  - `Document` in the same file is that edit for a host that holds the parsed file. It re-reads the file only when its size or modification time shows another writer, and it writes back unindented.
  - `TestGoEditMatchesTheSidecar` runs ten edits through the real sidecar and through the Go `Edit` on copies of one built Story Bible. It requires the same JSON after each edit, for both the plain and the held edit; key order is the one difference, because Go sorts map keys. It passed.
  - `TestHeldDocumentRefusesWithoutChangingAndRereadsAfterAnotherWriter` checks that a refused field leaves the held copy alone and that an outside write is picked up.
  - The worker's own test, `sidecars/manuscript-guide/tests/test_serve_worker_spike.py`, runs in the normal sidecar pytest job, so the spike cannot rot while it lives. The Go spike runs only with the tag.
- **Measurement.** `TestLatency` in `latency_test.go` (build tags `spike` and `spikelatency`) uses the baseline harness's method: 20 runs, the first reported alone, p50, p95 and max over the other 19. It also uses the baseline's generator and seed (copied from `apps/desktop/internal/latency/latency_test.go`), so the manuscripts are the same text: small (2,225 words) and full-length (88,471 words, 30 chapters, 1,200 paragraphs).
  - The guide is built by the real sidecar with `rules-only` extraction. The baseline's venv had no spaCy model either. The build found 527 entries and 9,905 occurrences, and the full-length file is 4,994 KB.
  - The spawn rows go through the real `guide.Service` and `process.Supervisor.Run`, exactly as the app does.
  - Five passes were run (the held edit was added for the fourth); the tables below are the fourth. The other two agree within the run-to-run noise noted under [Caveats](#caveats).
  - Python's own JSON costs were timed in-process on the saved full-length file: `json.loads` and `json.dumps`, median of 20.
- **Machine.** Everything ran in a Linux cloud container: 4 vCPU Intel Xeon at 2.1 GHz, 15 GB RAM, Go 1.27.2, Python 3.12.14 (the repository's `.venv`), no antivirus.
  - The baseline was a Windows 11 Ryzen 9 9955HX. Process starts there cost more, so **the spawn rows here are not the Windows numbers**. Read the rows against each other, not against the baseline.
  - No frozen (PyInstaller) sidecar was built or measured.
- **Spike 1's timings.** #1897's instrumentation had not merged on 2026-10-18 (branch `claude/latency-instrumentation`, no pull request), so there was no `run.jsonl` timing to use and everything here was measured directly.

## Findings

### Measured: edit and setLocked, p50 and p95 in ms

| Path | Small p50 | Small p95 | Full-length p50 | Full-length p95 |
| --- | --- | --- | --- | --- |
| Spawn (today): edit, 1 field | 103 | 139 | 236 | 274 |
| Spawn (today): setLocked | 100 | 110 | 241 | 274 |
| Worker, warm: edit, 1 field | 8.1 | 12.5 | 130 | 149 |
| Worker, warm: setLocked | 8.0 | 12.1 | 134 | 169 |
| Worker, first call (start + call) | 68 (one run) | | 204 (one run) | |
| Worker after an idle exit (start + call) | 74 | 84 | 210 | 247 |
| Go: edit, 1 field (read, change, write) | 3.6 | 4.5 | 103 | 113 |
| Go: setLocked (read, change, write) | 3.0 | 4.3 | 129 | 152 |
| **Go: edit, document held in memory, unindented write** | **1.0** | 1.2 | **27** | 40 |
| **Go: setLocked, document held in memory, unindented write** | **1.1** | 1.6 | **21** | 42 |
| Go: the held edit's first call (parses the file) | 2.5 (one run) | | 110 (one run) | |
| Go: read and parse only | 1.5 | 2.2 | 56 | 75 |
| Go: write only, document held in memory | 1.2 | 2.1 | 44 | 59 |
| Go: write only, unindented, document held in memory | 0.9 | 1.1 | 16 | 24 |

Across the passes:
- the full-length spawn's p50 ranged from 232 to 263 ms;
- the warm worker's ranged from 128 to 136 ms;
- the Go edit that re-reads the file ranged from 100 to 132 ms;
- the held edit ranged from 21 to 27 ms (passes four and five).

### Measured: where the full-length time goes

- **Process start.** On this machine the spawn floor is about 95 ms (the small spawn rows less the small worker rows). On Windows it was about 120 ms in the dev venv and about 230 ms frozen ([baseline](interaction-latency-baseline.md#after-phase-4)). That is the only cost a worker removes.
- **Python's per-call work.** In a warm worker, a full-length edit costs 127 ms in-process: `json.loads` 23 ms, `json.dumps(indent=2)` 72 ms, and the rest is `load_json`'s normalising pass and the write. The NDJSON round trip adds about 4 ms (132 in the harness against 127 in-process).
  - The indented dump is three times the cost of an unindented one (22 ms).
  - The same in-process call with an unindented write was 56 ms p50 (78 ms p95).
- **Go's per-call work.** Go's `encoding/json` into `map[string]any` is slower than CPython's C parser on this file (54 ms against 23 ms). So a Go edit that re-reads the file each time is no faster than the warm worker at full length.
  - Go wins only by not re-reading. Held in memory and written unindented, the write costs 16 ms and the whole edit 21 to 27 ms.
- **What fills the file.** Occurrence evidence is 3.9 MB of the 5.1 MB (76%): each mention stores an excerpt of up to 300 characters. Appearances are 0.2 MB. Each mutation rewrites all of it.

### Estimated, not measured: the frozen app on Windows

The rows below apply the baseline's frozen floor to the per-call work measured here. The Windows machine has the faster CPU, so the work terms are probably lower there. The Go row needs no frozen sidecar, so only the machine differs.

| Path | Small | Full-length |
| --- | --- | --- |
| Spawn, frozen (measured in the baseline) | 226 | 355 |
| Worker, warm (estimated: the Python work alone) | under 10 | 100 to 130 |
| Worker after an idle exit, frozen (estimated: the frozen floor plus the work) | about 235 | about 355 |
| Go, document held in memory, unindented (the Linux numbers; no frozen part) | about 1 | 20 to 30 |

## Classification of every manuscript-guide command

Line counts are the functions each command uses, counted from the module's syntax tree; shared helpers are counted once, in the first group that uses them. "Tests" are the Python test files that drive the command (`sidecars/manuscript-guide/tests/`).

- The host reads the same file in `apps/desktop/internal/guide/service.go` (`document`, `Entities`, `normalizeEntity`, `DialogueCues`) and in `types.go` (`Types`, the mirrored `TypeColours` and `DefaultTypes`).
- The series reads other projects' files through `guide.ReadOnlyNames`.
- The sidecar writes the contract goldens `guide-entities*-sidecar.json`, `guide-review-*-sidecar.json` and `guide-types*-sidecar.json` (`test_contract_goldens.py`, `test_bible_types.py`, `test_review_flags.py`). The UI schemas check them.
- So two implementations of the read side exist already.

| Command | Kind | What it needs | Lines | Tests | Port |
| --- | --- | --- | --- | --- | --- |
| `build` | Model | spaCy or the rules, the pronunciation sources, `merge_locked` (the rebuild merge, about 140 lines) | about 600 with extraction | `test_manuscript_guide.py`, `test_extraction_rules.py`, `test_character_cues.py` | Stays |
| `suggest` | Model | GLiNER, BookNLP or the rules (`extraction_*.py`) | in those modules | `test_extraction_*.py` | Stays |
| `pronounce`, `candidate` | Model (dictionary) | CMU, eSpeak, Wiktextract through `SOURCES` | in `providers.py` | `test_pronounce.py`, `test_providers.py` | Stays |
| `render-audio`, `self-check`, `capabilities` | Model or voice, and glue | Piper, the freeze's data files | about 150 | `test_pronunciation_preview.py`, `test_providers.py` | Stays |
| `create` | Mixed | `find_occurrences` over the manuscript, plus a pronunciation for the name and every alias | about 60 | `test_manuscript_guide.py`, `test_properties.py` | M later: Go writes, Python answers only the pronunciation |
| `edit` with `aliases` | Mixed | as `create` | in `apply_edit` | `test_manuscript_guide.py` | M later, as `create` |
| `edit` (every other field), setLocked | Pure | the file | 168 with `load_json`, `write_json` and the types and properties checks | `test_manuscript_guide.py`, `test_properties.py`; the Go parity test here | **S, prototyped** |
| `mark-reviewed`, `review-flag`, `speaker-color` | Pure | the file | 79 | `test_review_flags.py` (23 tests) | S |
| `relate`, `unrelate`, `delete`, `correct-cue` | Pure | the file | 53 | `test_manuscript_guide.py`, `test_character_cues.py` | S |
| `type-add`, `type-rename`, `type-colour`, `type-speaks`, `type-remove` | Pure | the file | 82 | `test_bible_types.py` (12 tests) | S; the host already checks names and colours (`types.go`) |
| `pronounce-user`, `pronunciation-use-alternate` | Pure | the file (`set_pronunciation`, no lookup) | 76 | `test_pronounce.py`, `test_pronunciation_depth.py` | S |
| `merge`, `unmerge`, `split` | Pure | the file, `merge_undo` fingerprints, `entity_id` | 254 | `test_merge_undo.py` (12 tests), `test_manuscript_guide.py` | M; see [Risks](#risks-of-b) |
| `rescan`, `status` | Pure | the manuscript (`find_occurrences`, `excerpt`, the SHA-256 of the file) | 73 | `test_manuscript_guide.py` | M: the excerpts must match Python's to the character |

## The other sidecars and narration_common

The frozen entry scripts are `compare.py` and `live_asr.py` (`scripts/release/prepare-resources.py`). Both dispatch on flags, not subcommands. "Pure" lines are estimates read from the functions; tests are the files under each sidecar's `tests/` (and `libs/python/tests/`). Every output is tagged pipe-delimited lines or NDJSON on stdout, parsed on the Go side by the package named.

### Entry points

| Entry point | Kind | Go caller and parser | Tests and goldens | Port |
| --- | --- | --- | --- | --- |
| `compare.py`, default compare | Model (Whisper), then pure diff and markers | `internal/transcript/service.go` | `test_compare.py`, `test_compare_properties.py`, the marker golden | L, with the diff core below |
| `compare.py --find-repeats` | Model, then pure span grouping | `internal/takereview/sidecar.go`, `internal/repeats/parse.go` | `test_repeated_spans.py` | L, with the diff core |
| `compare.py --take-divergence` (`take_divergence_mode.py`) | Model, then pure alignment | `internal/takecompare/sidecar.go`, `divergence.go` | `test_take_divergence*.py`, `take-divergence-results.json` | L, with the diff core |
| `compare.py --coverage` (`coverage_mode.py`, `coverage_chunks.py`, `recording_coverage.py`) | Model, then pure coverage; `--align-only` runs no model at all | `internal/coverage` (`service.go`, `report.go`) | `test_coverage*.py`, `results.golden.json` (also read by `internal/coverage/corpus_test.go`) | L; `--align-only` alone is M |
| `compare.py --coverage --recheck` | Model on the windows, then a pure splice | `internal/coverage` (the host writes the windows file) | `test_coverage_recheck.py` | stays with the model |
| `compare.py --extract-hints` | Pure manuscript scan | none found | | delete if unused |
| `compare.py --capabilities`, `live_asr.py --capabilities` | Glue | `apps/desktop/smoke.go` | | stays |
| `live_asr.py`, a session | Model (Moonshine, Whisper) and capture; tracker, flags and the confirmation logic are pure, in the same loop | `internal/teleprompter/service.go` | `test_live_asr.py`, `test_script_tracker*.py`, `test_flags.py`, the `teleprompter-events` golden | M for the tracker and flags |
| `live_asr.py --locate`, `--align-word` | Model decode, then pure placement | `internal/teleprompter/locate.go`, `alignword.go` | `test_locate.py`, `test_align_word.py`, their goldens | M; little gain |
| `live_asr.py --meter`, `--record`, `--list-devices`, `--capture` | Native capture (WASAPI, dshow) | `internal/recording/sidecar.go`, `internal/teleprompter/meter.go` | `test_levels.py`, `test_devices.py`, `test_capture_*.py`, `test_recording.py` | stays |
| `replay.py` (developer tool, not frozen) | Pure | none | `test_replay.py` | not needed |

### narration_common

| Module | Lines | Kind | Go parallel | Port |
| --- | --- | --- | --- | --- |
| `manuscript.py` | 74 | Pure read and validate | the host owns the format (`internal/manuscript`) | nothing to port |
| `progress.py` | 38 | Protocol (`STAGE\|percent\|message`) | `internal/process/progress.go` reads it | stays (it is the contract) |
| `spoken_forms.py` | 204 | Pure (numbers, homophones, tokens) | partly in `internal/chaptermatch/normalize.go` | S to M, with whatever uses it |
| `chapter_names.py` | 50 | Pure | `internal/chaptername`, `apps/ui/src/chapterName.ts` | S |
| `config.py` | 168 | Glue (default settings) | the host's settings are authoritative | stays while sidecars read defaults |
| `contract_files.py` | 46 | Test glue (golden writer) | `internal/contractfile` | stays with the Python tests |
| `logging_utils.py` | 47 | Glue | `internal/runlog` reads it | stays |
| `ui_bridge.py` | 71 | Glue | no non-test importer found | delete if unused |
| `ports/` | 1,542 | Glue (engine registries, conformance) | the host's `*port` packages mirror the names | stays |
| `recording/` | 704 | numpy and I/O behind native capture | | stays |

### Already duplicated in Go

- **Chapter title matching.** `internal/chaptermatch` ports `compare.py`'s matcher, pinned by `tests/fixtures/chapter-track-match/parity-cases.json`, and Python still runs its copy when no `--chapter-title` is passed. Having the host always pass the title would let about 300 lines of `compare.py` and the parity fixture go. Cost: S to M.
- **The teleprompter's chapter script.** `sidecars/manuscript-teleprompter/core/chapter_script.py` (148 lines) has a Go twin, `internal/teleprompter/script.go`. Cost: S.
- **Chapter names.** `libs/python/narration_common/chapter_names.py` exists three times: Python, `internal/chaptername` and `apps/ui/src/chapterName.ts`, pinned by `tests/fixtures/chapter-names.json`. Cost: S.
- **Manuscript parsing.** Import is Go-only (`internal/importer`, `internal/manuscript`). `narration_common/manuscript.py` (74 lines) only reads and validates the canonical file. Nothing to port.
- **Progress and cancel.** `narration_common/progress.py` (38 lines) writes `STAGE|percent|message`, and the host reads it (`internal/process/progress.go`). Cancel is a `.cancel` file the host writes. Both are the protocol between the two sides, not logic, so there is nothing to move.

### No caller found

On 2026-10-18 no host caller was found for:

- `compare.py --extract-hints`;
- `narration_common/ui_bridge.py`, which has no non-test importer;
- `libs/python/config_cli.py`.

Check each before deleting it.

### Pure but behind a model

These would only be worth porting if the sidecars became "audio in, words out".

- **Diff and coverage logic.** `compare.py`'s diff and markers, `recording_coverage.py` (455 lines, all pure), `take_divergence.py` (357, all pure) and `coverage_mode.py`'s splice and report (about 650) are about 2,300 lines.
  - Every mode but `--coverage --align-only` still needs Whisper first, and all of them consume `difflib.SequenceMatcher(autojunk=False)` opcodes.
  - A port needs an exact copy of difflib's tie-breaking to keep the byte-identical goldens: `tests/fixtures/contracts/take-divergence-results.json`, `sidecars/transcript-compare/tests/fixtures/coverage/results.golden.json` and the marker golden.
  - `internal/chaptermatch/sequence.go` ports only the ratio, and documents that it diverges from Python on long inputs.
  - Cost: L, for no latency gain, since these are jobs measured in seconds of transcription.
- **The live teleprompter.** `script_tracker.py` and `flags.py` (about 560 lines) are pure.
  - The engine's word events already reach the host one by one (`live_asr.py` prints each before `tracker.feed`), so moving them adds no crossing per audio frame.
  - The tick per audio chunk, the stream clock and the seek and pause control would have to move with them, and `difflib`'s ratio would need exact parity.
  - Cost: M. Its benefit is a contract that moves, not speed.
- **Engine-bound code.** `coverage_chunks.py`'s planning (about 75 pure lines around a Whisper process pool), `locate.py` and `align_word.py` (559 lines between them, about 450 of them pure, each one-shot behind a decode) and `levels.py` (numpy, every chunk) belong with their engines.

## What B buys besides speed

- **No freeze on the mutation path.** The class of release bug the `sidecar-freeze` skill exists for (a lost data file, lost package metadata, a ctypes-loaded library) cannot break an edit.
- **No first start under antivirus.** The baseline saw a frozen executable's first start take three times its steady state with antivirus off.
- **No import breakage.** A broken Piper or spaCy import cannot stop a Save, as the module-level Piper import once slowed every command ([baseline](interaction-latency-baseline.md#what-the-numbers-say)).
- **One writer in one process.** Today two processes rewriting the file with no lock is the race `seedCharacterCandidates` (`apps/desktop/bindings.go`) and the [concurrent build note](../architecture/story-bible-concurrent-build.md) work around by sequencing. A Go writer serialises under one mutex in `guide.Service`.
- **An in-memory document.** Only the host can keep the document between calls, re-reading it when its size or modification time shows another writer.

## Risks of B

- **Two writers of one schema** while `build`, `create`, alias edits, `pronounce` and `rescan` stay in Python.
  - Every Go edit goes through one `guide.Service` lock (`editMu`). `Service.Run` does not take it, because a Save would then wait for a whole build; a sidecar write is seen by comparing bytes on the next edit (see [the concurrent build note](../architecture/story-bible-concurrent-build.md)).
  - Parity is pinned by fixtures, not by a Python run in the Go job. The Python tests write before-and-after pairs for each command into `tests/fixtures/contracts/` (`UPDATE_CONTRACTS=1`, the `wire-contract-change` pattern), and a Go test replays each pair and compares the JSON.
  - Python stops writing the file only if `build` returns its entities and the host does the rebuild merge (`merge_locked`, about 140 lines of the subtlest logic in the module, cost L). That is not proposed now.
- **Merge undo.** `merge` stores fingerprints of what it changed: SHA-256 of `json.dumps(value, sort_keys=True, ensure_ascii=False)`, with Python's `", "` and `": "` separators and Python's float formatting. `unmerge` refuses when a fingerprint does not match.
  - A Go `unmerge` of a Python-written record, or the other way round, must produce those bytes exactly, or every cross-implementation undo is refused.
  - Move `merge`, `unmerge` and `split` together, and pin a Go `pythonJSON` encoder against a golden of Python's output for Unicode, floats and nesting.
  - The undo ids themselves are random 16-hex strings with no parity problem. The records end at every rebuild, so an upgrade loses at most the undo of merges made before it.
- **Entry ids.** `entity_id` is SHA-1 of `normalize_name`: Python's `str.lower`, then everything outside `[a-z0-9]` dropped. `split` and `create` in Go must lower-case as Python does; a property test over non-ASCII names pins it.
- **Small text differences** the spike accepted: Go `strings.ToLower` against Python `str.casefold` for property keys (ß), and Go's escaping of U+2028 and U+2029.
- **Key order.** Go writes keys sorted, and the sidecar writes them in insertion order. The content is the same. The file is not in git, so the only cost is one larger diff for anyone comparing files by hand.

## Why not A

- **It does not change the full-length cost.** It removes the start (95 ms here, about 230 ms frozen on Windows) and nothing else, so a full-length edit stays at about 130 ms warm and 205 to 355 ms after every idle exit.
- **It adds a lifecycle to own.** A long-lived process needs a start, an idle exit, a restart after a crash, a job-object join, a run id per request instead of per process, and a crash that must not lose a half-written file.
- **It needs a rule change.** The [sidecar boundary](../architecture/codebase-map.md#sidecar-boundary) says no Python server.
- **It would be a fallback, not the plan.** Its one strength is that it moves every command at once with no second implementation of the schema. If B stalls, A is that fallback. [Doc changes](#doc-changes) has the wording it would need.

C is not enough. Every mutation stays over 100 ms, and full-length ones over 350 ms frozen.

## What to move first

On 2026-10-18 the owner approved B and asked for step 1 (#1923).

1. **`edit` for every field but `aliases`, and setLocked.** This is every Save. The prototype and its parity test exist.
2. **Hold the document in `guide.Service`.** Keep the parsed document in memory with the file's bytes, and parse again whenever the bytes differ (built: size and modification time were not trusted on a coarse file system). Dropping the indent was put to the owner (it is still JSON, but no longer pleasant to read by hand, and it takes a full-length write from 44 to 16 ms here, write only, held document); on 2026-10-18 the owner chose to keep it. The host therefore writes the indented form, and the speed comes from not re-parsing.
   - The same unindented write in Python's `write_json` is a separate, smaller change that would help the commands that stay in Python. Estimated: about 70 ms off each full-length spawn (in-process, 127 to 56 ms).
3. **`mark-reviewed`, `review-flag`, `speaker-color`, `relate`, `unrelate`, `delete` and `correct-cue`.**
4. **The five `type-*` commands.**
5. **`pronounce-user` and `pronunciation-use-alternate`.**
6. **`merge`, `unmerge` and `split` together**, with the fingerprint encoder and its golden.
7. **Later:**
   - `rescan` and `status`, once a Go `find_occurrences` matches Python's excerpts;
   - `create` and alias edits, with Go writing and the sidecar asked only for the pronunciation. This needs a stateless command beside `candidate` that returns the whole value of `pronunciation()`.

`build`, `suggest`, `pronounce`, `candidate`, `render-audio`, `self-check` and `capabilities` stay in Python.

## Doc changes

### If B

All under the `wire-contract-change` skill, since the host becomes a writer of a persisted file:

- **`docs/reference/data-files.md`, the `manuscript_guide.json` row.** The writer becomes "the host (`guide.Service`) for edits, locks, review flags, relationships, deletions, cue corrections, types and the narrator's own pronunciations; the manuscript-guide sidecar for builds, entries it creates, alias edits, pronunciation lookups and rescans". The fixtures column gains the parity pairs.
- **`apps/desktop/internal/guide/service.go`.** The `schemaVersion` comment ("the Python sidecar writes it") names both writers.
- **`docs/utilities/manuscript-guide.md`.** "Outputs" says which commands the sidecar still runs.
- **`docs/architecture/story-bible-concurrent-build.md`.** "Sequenced, never overlapped" names the `guide.Service` lock.
- **`docs/architecture/codebase-map.md`.** No change to the sidecar boundary. The `internal/guide` entry says it writes the Story Bible for the pure-data commands.
- **No threat-model row.** A file the app writes and reads back is not a trust boundary (`CLAUDE.md`, step 6).

### If A

The [sidecar boundary](../architecture/codebase-map.md#sidecar-boundary)'s first paragraph would become:

> The Python sidecars retain their stable `core` CLI contracts and are frozen as immutable packaged sidecars. Go supervises them; feature code must not add a Python server (a listening port or socket) or a browser transport. A sidecar may also run as a stdio worker: a child process the host starts and owns, speaking the same command line as NDJSON requests on its stdin and responses on its stdout, one per project, exiting when idle or when its stdin closes; the long jobs and the model, voice and download commands stay one process each.

[`dictionary-thesaurus-integration.md`](../architecture/dictionary-thesaurus-integration.md) quotes the rule ("no persistent Python sidecar") and would need the same distinction. Neither change is an ADR: the runtime of a sidecar is a convenience ([ADR README](../adr/README.md#when-to-write-one)).

## Caveats

- **Linux, not Windows.** The machine was a Linux container with no frozen sidecar and no antivirus. Every Windows or frozen figure above is the baseline's or an estimate.
- **Synthetic text.** The manuscript is synthetic and the build was rules-only. A real book with spaCy finds fewer, better entries, but a main character can have hundreds of mentions, so a file of several MB is plausible. A real full-length file was not measured.
- **Run-to-run noise** on this shared container was up to 25% on the full-length rows: the Go edit's p50 ranged from 100 to 132 ms across passes. The conclusions rest on gaps larger than that, except Go against the warm worker when Go re-reads the file each time, which is a tie.
- **What the prototype skipped.** The worker was started with `os/exec`, not through the supervisor's job object. The Go `Edit` does not take the lock a real one would. Neither prototype is wired into the app.
