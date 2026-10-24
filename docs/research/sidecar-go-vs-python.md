# Go versus Python for the sidecars

**Measured 2026-10-23.** Issue: [#2251](https://github.com/countrymanprime/narration-studio/issues/2251), item R1. **Question (owner):** the three Python sidecars (`manuscript-guide` for the Story Bible, `transcript-compare` for Proof, `manuscript-teleprompter` for the Booth) could be Go in the host. Is there a reason to keep Python other than the model runtimes? Test the features against Go ports, then decide whether consistency is worth it.

**Answer.** The model runtimes and audio capture are the only reason. Every pure-logic module tried came out byte-identical in Go and 2 to 10 times faster. Porting pure logic saves start-up and gives one copy of each algorithm. It does not shrink the installer: native model libraries are almost all of the Python runtime's size. Speech recognition can run from Go, but each route measured either changes the Windows build (cgo or a new DLL boundary) or swaps the model format. Neither buys enough speed to justify that today. Moonshine is the exception: its engine is already a C library behind a ctypes shim.

**Status of the numbers.** Every number was measured in this container: Linux, 4 vCPU Intel Xeon at 2.80 GHz (AVX2, AVX-512, VNNI), 15 GB RAM, Go 1.27.2, CPython 3.12.13, one machine. Windows numbers come from the [2026-10-18 start-up note](2026-10-18-sidecar-start-up-and-bridge-round-trip.md) and the v0.3.290-rc release files. Timings are the median of 5 runs, except the ASR runs, which ran once each. Nothing here was measured on Windows; see [What the owner would have to run](#what-the-owner-would-have-to-run).

**Spike code.** The code is on the branch [`research/sidecar-go-spike`](https://github.com/countrymanprime/narration-studio/tree/research/sidecar-go-spike/research-spikes/sidecar-go), which is not for merging. Its README gives the re-run command for each spike.

## What Go already does

The repository has already moved pure logic out of the sidecars three times. Each time, a parity test holds the Go copy to the Python one:

| What | Go | Held by |
| --- | --- | --- |
| compare.py's tokenizer, number-word merge and chapter-by-track-name match | `src/studio/desktop/internal/chaptermatch` | `src/studio/sidecars/transcript-compare/tests/test_chapter_track_parity.py` |
| Story Bible create, edit, merge, unmerge, split, delete, relate and unrelate | `src/studio/desktop/internal/guide` (`mutateInHost`, `editInHost`), after [the mutation-path note](story-bible-mutation-path.md) | `src/studio/sidecars/manuscript-guide/tests/test_*_parity.py`, `internal/guide/*parity_test.go` |
| Manuscript import (DOCX, EPUB) | `src/studio/desktop/internal/importer` | its own tests; no sidecar imports `pypdf` or `python-docx` |
| The recording check's alignment and results (step 1, first part, 2026-10-24): `recording_coverage.py`, coverage_mode's report and compare.py's tokenizer, sentence units, `SequenceMatcher` and alignment | `src/studio/desktop/internal/recordingcoverage`, `internal/compare` (chaptermatch's tokenizer now calls it); the sidecar only transcribes and writes a words report | `results.golden.json`, unchanged, now written by `golden_test.go`; `tests/fixtures/compare-parity/cases.json`; the Python copies are deleted except the markers' `repeat_of` |

The cost of this pattern is two live copies held together by parity tests. The Python mutation code in `manuscript_guide.py` still exists beside the Go code that the host now runs.

## Inventory

`core/` modules only; spikes and tests are left out. Lines are `wc -l`. **Kind:** *pure* is logic over text, numbers and JSON; *runner* calls a model or a device; *mixed* is both; *glue* is CLI, files or orchestration. Total: 15,027 lines (guide 3,690, compare 5,047, teleprompter 3,346, `narration_common` 2,944).

### `manuscript-guide` (Story Bible)

| Module | Lines | Depends on | Kind | Go counterpart | cgo | Windows build | Risk | Effort |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `manuscript_guide.py` | 2,409 | spaCy, Piper, `pronouncing` (CMU) | mixed: about half is Bible build and mutation, already ported (above); the rest is spaCy candidates, pronunciation and Piper preview | mutations done; candidate rules and occurrences: plain Go | no | none | low for the pure part | M (rest of the pure part) |
| `extraction_rules.py` | 252 | none | pure | plain Go | no | none | low | S |
| `extraction_booknlp.py` | 554 | BookNLP, torch | runner | none; BookNLP is a PyTorch pipeline with no export | n/a | n/a | n/a | stays |
| `extraction_gliner.py` | 218 | GLiNER (transformers, torch) | runner | ONNX export of GLiNER through `github.com/yalue/onnxruntime_go`, plus a Go tokenizer | yes | onnxruntime DLL in the installer, cgo build | high: tokenizer parity, model re-validation | L |
| `providers.py` | 257 | Piper, `phonemizer` (espeak-ng), `pronouncing` | runner | CMU: a Go map over the CMU dictionary file. espeak-ng: its C library (GPL) through cgo. Piper: ONNX Runtime plus espeak-ng phonemes | yes, for espeak and Piper | espeak-ng and onnxruntime DLLs, cgo | high: phoneme parity changes every pronunciation | L |
| spaCy NER (inside `manuscript_guide.py`) | (part of above) | spaCy `en_core_web_*` | runner | none; spaCy pipelines (thinc) have no ONNX or Go route | n/a | n/a | n/a | stays |

### `transcript-compare` (Proof)

| Module | Lines | Depends on | Kind | Go counterpart | cgo | Windows build | Risk | Effort |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `compare.py` | 2,172 | PyAV, numpy, `multiprocessing`, faster-whisper (through `asr_batch`) | mixed: tokenizer, sentence units, diff and markers are pure (part ported, [spike 1](#spike-1-take-divergence-with-the-comparepy-core)); decode, chunked transcription and progress are runner and glue | pure part: plain Go plus a faithful `difflib` port. Decode: the FFmpeg the app already ships, as a subprocess | no | none | medium: the largest module, many callers | L |
| `asr_batch.py` | 73 | faster-whisper (CTranslate2) | runner | whisper.cpp through cgo ([ASR](#spike-4-speech-recognition-from-go)) | yes | C/C++ compiler in CI, OpenMP runtime, new model files | high | L |
| `coverage_mode.py` | 1,065 | faster-whisper, files | glue and runner | goroutines plus the ported core; transcription stays behind the words file | no | none | medium | M |
| `coverage_chunks.py` | 301 | numpy, `multiprocessing` | glue | goroutines | no | none | low | M |
| `coverage_pipeline.py` | 341 | threads | glue | goroutines | no | none | low | M |
| `recording_coverage.py` | 455 | none | pure | plain Go, [spike 2](#spike-2-recording-coverage), identical | no | none | low | S |
| `take_divergence.py` | 357 | none (uses `compare.py`) | pure | plain Go, [spike 1](#spike-1-take-divergence-with-the-comparepy-core), identical | no | none | low | S |
| `take_divergence_mode.py` | 283 | `compare.transcribe` | glue | Go once words arrive from a runner | no | none | low | S |

### `manuscript-teleprompter` (Booth)

| Module | Lines | Depends on | Kind | Go counterpart | cgo | Windows build | Risk | Effort |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `live_asr.py` | 1,087 | faster-whisper, Moonshine, PyAV, numpy | mixed: decode loop, agreement and confirmation, event NDJSON, capture wiring | the loop needs an ASR engine; the event logic is plain Go | yes, with whisper.cpp | as `asr_batch` | high | L |
| `script_tracker.py` | 326 | `difflib` | pure | plain Go, [spike 3](#spike-3-the-booths-script-tracker-and-flags), identical | no | none | low | S |
| `flags.py` | 233 | `script_tracker`, `spoken_forms` | pure | plain Go, spike 3, identical | no | none | low | S |
| `align_word.py` | 243 | `difflib`, `statistics` | pure | plain Go | no | none | low | S |
| `chapter_script.py` | 148 | `re` | pure | plain Go | no | none | low | S |
| `locate.py` | 316 | PyAV, numpy, ASR | mixed (`src/studio/desktop/internal/teleprompter/locate.go` already checks its limits) | pure part plain Go; it re-runs ASR on a tail of audio | with ASR | as ASR | medium | M |
| `control_channel.py` | 76 | `json` | glue | plain Go | no | none | low | S |
| `levels.py` | 56 | numpy | pure | plain Go (`internal/acoustic` already does FFT and levels) | no | none | low | S |
| `replay.py` | 215 | numpy | dev tool | plain Go | no | none | low | S |
| `moonshine_engine.py` | 125 | `moonshine-voice` (ctypes over `moonshine.dll`) | runner | the same C ABI from Go ([spike 4b](#4b-moonshine-from-go-same-c-library)); on Windows `syscall.LoadDLL`, no cgo | no | the DLLs ship as now; the freeze no longer carries them | low to medium: streaming API not yet tried from Go | M |
| `asr_adapters.py` | 117 | registries | glue | Go registry (`internal/asrport`) | no | none | low | S |
| `devices.py` | 122 | PyAV (dshow list) | runner | WASAPI enumeration: `github.com/moutend/go-wca` (COM, no cgo) or miniaudio through `github.com/gen2brain/malgo` (cgo) | go-wca no, malgo yes | none, or cgo | medium: needs real devices | M |
| `capture_dshow.py` | 72 | PyAV (FFmpeg dshow) | runner | FFmpeg subprocess with `-f dshow` | no | none | medium | M |
| `capture_wasapi.py` | 210 | `sounddevice` (PortAudio) | runner | go-wca or malgo | as above | as above | high: latency and device behaviour need hardware ([#846](https://github.com/countrymanprime/narration-studio/pull/846) took a hardware pass) | L |

### `src/studio/libs/python/narration_common`

| Module | Lines | Depends on | Kind | Go counterpart | cgo | Risk | Effort |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `spoken_forms.py` | 204 | `re` | pure | partly in `internal/chaptermatch/normalize.go`; ported in full by spikes 1 to 3 | no | low (needs `math/big`, see traps) | S |
| `ports/*` (registry, asr, capture, extraction, pronunciation, tts, vocabulary and their conformance suites) | 1,540 | none | pure | the Go ports exist (`internal/asrport`, `captureport`, `extractionport`, `pronunciationport`, `ttsport`); each Python port moves with the last provider it registers | no | low | M |
| `recording/recorder.py` | 328 | numpy, threads | runner glue | Go capture loop over the capture choice above | as capture | medium | M |
| `recording/wav.py`, `framing.py`, `meter.py` | 346 | numpy | pure | `encoding/binary`, `math` (`internal/recording`, `internal/measure` exist) | no | low | S |
| `config.py`, `contract_files.py`, `logging_utils.py`, `manuscript.py`, `progress.py`, `ui_bridge.py`, `chapter_names.py` | 494 | stdlib | glue | most exist (`internal/settings`, `contractfile`, `manuscript`, `chaptername`) | no | low | S |

## Spikes: pure logic

Each Go port went through the same loop: a Python driver writes sorted-key JSON lines from the real module on the repository's fixtures, the Go driver writes the same lines, and `cmp` must find no difference.

### Spike 1: take divergence with the compare.py core

Ported: `take_divergence.py` (all logic but `build_paragraph_span`), the alignment half of `diff_and_build_markers`, `tokenize`, `split_sentences`, `build_sentence_units`, `_fuse_hyphen_split_opcodes`, the `spoken_forms` canon and number merge, and CPython 3.12's `difflib.SequenceMatcher` (`__chain_b` with autojunk, `find_longest_match`, `get_matching_blocks`, `get_opcodes`, `ratio`). 1,132 lines of Go for the port.

| Input | Size | Identical |
| --- | --- | --- |
| `src/studio/sidecars/transcript-compare/tests/fixtures/divergence/cases.json` | 14 cases × 4 takes = 56 alignments | yes |
| Seeded stress set (Unicode spaces, offsets up to 1e16) | 150 spans, 600 takes | yes |
| Long take, Alice text | 10,024-word span, 10,049-word transcript | yes |
| `difflib` fuzz | 2,000 pairs, 0 to 700 tokens, 435 hit autojunk | yes (opcodes and `ratio`) |

| Workload | Python wall (s) | Go wall (s) | Python in-process (s) | Go in-process (s) | Python RSS (MB) | Go RSS (MB) |
| --- | --- | --- | --- | --- | --- | --- |
| Start-up only | 0.21 | <0.01 | n/a | n/a | 32.0 | 3.6 |
| Fixtures × 50 (2,800 alignments) | 2.54 | 1.16 | 2.30 | 1.14 | 33.7 | 14.2 |
| 10k-word Alice take | 0.96 | 0.18 | 0.74 | 0.17 | 49.5 | 25.8 |

### Spike 2: recording coverage

Ported: all of `recording_coverage.py`, plus the step from transcript words to opcodes (`build_chapter_units`, the filler filter, the number merge and `SequenceMatcher`). About 1,000 lines of Go. `go test ./internal/coverage/ -run Corpus` passes (16/16); today Go only reads the pinned results lines and computes no coverage itself.

| Input | Records | Identical |
| --- | --- | --- |
| The 16 cases of `src/studio/sidecars/transcript-compare/tests/fixtures/coverage/`, core and words-to-coverage | 16 | yes |
| The same × 50 | 800 | yes |
| A synthetic 10,112-token chapter | 1 | yes |
| Fuzz: float repr, `str.isspace`, tokenizer, sentence split, number merge, `SequenceMatcher` | 68,039 | yes |

| Workload (words to coverage) | Python wall (s) | Go wall (s) | Python compute (ms) | Go compute (ms) | Python RSS (MB) | Go RSS (MB) |
| --- | --- | --- | --- | --- | --- | --- |
| 16 cases | 0.31 | 0.03 | 21.2 | 20.7 | 33.2 | 9.0 |
| 800 cases | 1.94 | 0.86 | 1,215 | 512 | 95.5 | 110.5 |
| 10k-word chapter | 1.01 | 0.13 | 745 | 78 | 42.0 | 14.6 |

### Spike 3: the Booth's script tracker and flags

Ported: `script_tracker.py`, `flags.py` and the part of `spoken_forms` the flags use. 974 lines of Go by hand, plus 2,798 lines of Unicode tables generated from Python's own `unicodedata` (see trap 1).

| Input | Size | Identical |
| --- | --- | --- |
| Every session the 5 test files feed (146 tests, Hypothesis examples included) | 515 sessions, 8,465 operations | yes |
| Synthetic engine streams over the coverage manuscript (restarts, skips, seeks, pauses) | 200 sessions, 51,288 feeds, 35,732 position events, 1,021 flags | yes |
| `normalize_word` over every code point but surrogates, in three contexts | 3,336,192 | yes |
| Other fuzz (`words_match`, `ratio`, `spoken_key`, `locate`, `align`) | 15,193 | yes |

| Run | Python | Go |
| --- | --- | --- |
| Corpus wall (s) | 15.57 | 2.56 |
| Time per engine event, p50 (µs) | 256 | 26 |
| Time per engine event, p99 (µs) | 885 | 109 |
| Max RSS (MB) | 130 | 58 |

Both are far inside a live partial's budget. The Booth gains nothing a narrator would notice from this speed.

### Traps a port must handle

Each of these broke, or would have broken, identity with Python. The spikes solved all of them.

1. **Unicode version.** CPython 3.12 uses Unicode 15.0 and Go 1.27 uses 17.0. `strings.ToLower` plus Go's letter and digit tests differ from Python on 9,661 code points. Generate tables from Python, or accept the difference.
2. **Final sigma.** Python lowercases a final `Σ` to `ς`; Go gives `σ`.
3. **Whitespace.** `str.split()`, `strip()` and `\s` treat U+001C to U+001F as space; `unicode.IsSpace` does not.
4. **Lookbehind.** `(?<=[.!?])\s+` has no RE2 equivalent; the sentence splitter is hand-written.
5. **Unbounded integers.** The number merge overflows int64 on input like "hundred" said twelve times; the port uses `math/big`.
6. **Float and JSON output.** Python's `repr` is not Go's `'g'` format. `encoding/json` escapes `<`, `>`, `&`, U+2028 and U+2029, and it sorts no map keys. Each port carries its own writer.
7. **`len` counts code points**, so the 4-character fuzzy threshold counts runes.
8. **`difflib` details**: the autojunk rule at 200 or more items, junk extension, and tie order. `internal/chaptermatch/sequence.go` leaves out autojunk, which is right only because `compare.py` passes `autojunk=False`.

The cost is a few hundred lines of compatibility code per port. It exists only for identity with Python. Once Python is gone, a port could drop it, and its golden files would change once.

## Spike 4: speech recognition from Go

Input: the first 300 s of LibriVox *Alice* chapter 1 (`kara_01` in `tests/fixtures/audio/librivox-alice/sources.json`, SHA-256 checked), 16 kHz mono, 4 threads, beam 5, English, word timestamps on. **Approx. WER** compares each transcript with the Project Gutenberg text (`src/studio/ui/src/api/fixtures/alice-in-wonderland.txt`). It counts the LibriVox preamble as errors, so read it only as a comparison between rows. One run each.

### 4a. Whisper: faster-whisper (Python) against whisper.cpp (Go through cgo)

whisper.cpp 1.8.5 was built from the sources vendored in the `pywhispercpp` 1.5.1 sdist on PyPI (the container cannot reach `codeload.github.com`), as static libraries. The Go program uses whisper.cpp's own Go bindings (`bindings/go/pkg/whisper`). The ggml models came from `huggingface.co/ggerganov/whisper.cpp`. faster-whisper ran int8 on CPU, as `coverage_mode.load_whisper_model` and `live_asr._load_whisper_decoder` do, with the catalog's pinned files from `config/whisper-assets.json`.

| Engine | Model | Load (s) | Transcribe (s) | Real-time factor | Max RSS (MB) | Approx. WER |
| --- | --- | --- | --- | --- | --- | --- |
| faster-whisper 1.2.1, Python | tiny int8 | 1.63 (0.24 import) | 38.2 | 0.127 | 448 | 0.191 |
| whisper.cpp, Go | tiny f16 | 0.22 | 20.5 | 0.068 | 303 | 0.197 |
| whisper.cpp, Go | tiny q8_0 | 0.10 | 16.9 | 0.056 | 268 | 0.202 |
| faster-whisper 1.2.1, Python | small int8 | 1.67 (0.23 import) | 119.6 | 0.399 | 1,041 | 0.071 |
| whisper.cpp, Go | small f16 | 0.84 | 178.3 | 0.594 | 801 | 0.078 |
| whisper.cpp, Go | small q8_0 | 0.37 | 314.6 | 1.049 | 579 | 0.077 |

- On tiny, whisper.cpp is about 2× faster. On small, which is the size the transcripts are judged on, faster-whisper is 1.5× faster than f16 and 2.6× faster than q8_0. Accuracy is within a point.
- Go adds nothing to the engine's speed: the whole run is inside the C++ library. A Go route changes the engine, not the language.
- whisper.cpp reads ggml weights, not CTranslate2 ones. Moving would add a new hashed catalog beside `config/whisper-assets.json` (sizes are about equal: tiny 78 MB against 78 MB, small 488 MB against 486 MB), a new model review in `scripts/licenses/model-review.json`, and a re-run of the coverage calibration, because the words change. `vad_filter=True` (Silero, through faster-whisper) has a whisper.cpp counterpart (`whisper-vad-speech-segments`), which was not tried.
- **Windows toolchain.** The host builds with `CGO_ENABLED=0` (`scripts/release/wails-build.mjs`, `.github/actions/setup-toolchain/action.yml`). The bindings link `-lwhisper -lggml -lggml-base -lggml-cpu -lstdc++` and, on Linux, `-fopenmp`. So the static route needs:
  - cgo turned on for the whole host;
  - a pinned C/C++ compiler in `scripts/toolchain.json` and every Windows job (MinGW-w64 or clang);
  - a decision on OpenMP, which means `libgomp` beside the executable or ggml built without it.

  The other route builds whisper.cpp as DLLs in its own pinned job and loads them without cgo. That puts by-value structs (`whisper_full_params`) across a hand-written FFI. Neither was built for Windows here.
- The Go binary with whisper.cpp linked in is 4.8 MB. That is smaller than the CTranslate2 and faster-whisper part of a freeze, but this matters only if the whole Python path goes; see [Cost of Python today](#cost-of-python-today).
- **A trap seen on the way.** faster-whisper 1.2.1 cannot decode a file path with the pinned `av==19.0.1` (`TypeError: open() got an unexpected keyword argument 'metadata_errors'`). The sidecars pass numpy arrays (`asr_batch.py`, `coverage_mode.py`, `coverage_chunks.py`, `live_asr.py`), so they are not affected; a future caller that passes a path would be.

### 4b. Moonshine from Go: same C library

`moonshine-voice` is a ctypes shim over `libmoonshine` (`moonshine.dll` on Windows) and ONNX Runtime. Go called the same C functions (`moonshine_load_transcriber_from_files`, `moonshine_transcribe_without_streaming`, `moonshine_transcript_to_string`) through `github.com/ebitengine/purego` v0.8.4, with `CGO_ENABLED=0`. Library: the Linux `moonshine_voice` 0.1.5 wheel, the version `pyproject.toml` pins for Windows. The catalog's streaming models are served from `download.moonshine.ai`, which this container's network policy refuses. So the run used the non-streaming **base, quantized** model from `huggingface.co/UsefulSensors/moonshine` (`onnx/merged/base/quantized`), arch `BASE`.

| Caller | Load (s) | Transcribe (s) | Max RSS (MB) | Approx. WER | Text |
| --- | --- | --- | --- | --- | --- |
| Python `Transcriber` (ctypes) | 0.48 (0.36 import) | 192.1 | 870 | 0.186 | reference |
| Go, purego, no cgo | 0.51 | 186.1 | 679 | 0.186 | identical, all 65 lines |

The engine time is the same, as expected. Go's lower memory comes from not building a 4.8-million-item Python list of floats, which the Python binding does on each call. purego's `Dlopen` is Unix-only; on Windows the library would load with `syscall.LoadDLL` (not tried here). The DLLs ship as they do now, but beside the host instead of inside a freeze. The streaming API (`moonshine_create_stream`, `moonshine_transcribe_add_audio_to_stream`, `moonshine_transcribe_stream`), which the Booth uses, was not tried from Go.

## Cost of Python today

| Cost | Measured | Source |
| --- | --- | --- |
| Share of the release | `narration-studio.exe` in v0.3.290-rc is 514.7 MB; the host built here for Windows without the sidecar runtime is 22.9 MB (8.7 MB zipped). The update zip is 213.9 MB and the setup program 215.2 MB. So the embedded resources (the three freezes plus the Lua bridge and config) are about 490 MB inside the executable and at most about 205 MB of the download. The UI bundle was not built here, so it is not subtracted | release assets of [v0.3.290-rc](https://github.com/countrymanprime/narration-studio/releases/tag/v0.3.290-rc); `go build` with `GOOS=windows CGO_ENABLED=0 -ldflags "-s -w"` |
| Where that size is | The 2026-10-18 note measured the three freeze folders at 278, 259 and 285 MB on a Windows runner. Their sum is larger than the 490 MB above, and this note does not reconcile the two. Either way, the size is native libraries (CTranslate2, ONNX Runtime, FFmpeg in PyAV, numpy, spaCy), so porting pure logic removes almost none of it | [start-up note](2026-10-18-sidecar-start-up-and-bridge-round-trip.md) |
| Cold start (Windows, Defender off) | First launch of a fresh install: 882 ms (guide), 1,947 ms (compare), 3,147 ms (teleprompter). Warm: 230 to 273 ms, against 60 ms for a frozen hello-world | same note |
| Warm start (Linux, here) | Python interpreter plus `import compare` (pulls in numpy): 0.17 to 0.25 s. Go: 0.1 ms | spikes 1 and 2 |
| Freeze incidents | The freeze silently lost Piper's `espeak-ng-data` and `cmudict` ([#222](https://github.com/countrymanprime/narration-studio/pull/222)) and Moonshine's DLLs ([#390](https://github.com/countrymanprime/narration-studio/pull/390)); each still built and started. It ships packages the runtime never uses: `hypothesis`, `pytest`, `setuptools`, `fastapi` ([#245](https://github.com/countrymanprime/narration-studio/issues/245)). Frozen start-up imports `multiprocessing` (320 ms) and `setuptools` (121 ms), which the dev interpreter does not | `.claude/skills/sidecar-freeze/SKILL.md`, start-up note |
| Build time and guards | Freezing is "most of the Windows build" (`docs/operations/ci-and-releases.md`, the freeze cache). The cache key hashes all of `src/studio/sidecars/` and `src/studio/libs/python/`, so a one-line change to pure logic refreezes all three. Four places must change together for any new dependency (the `sidecar-freeze` skill) | `docs/operations/ci-and-releases.md` |
| Two copies | Tokenizer, chapter match and Bible mutations already exist in both languages, held by parity tests | [What Go already does](#what-go-already-does) |

The shallow clone (50 commits) has no freeze history in `git log`. The incidents above come from the pull requests and the skill.

## Recommendation

**Keep Python for model and device runners only.** Make each sidecar a thin runner behind the command-line and NDJSON contract it has now, and move each sidecar's pure logic into the host in the order below. Do not port faster-whisper, spaCy, BookNLP, GLiNER, Piper or `phonemizer`: none has a measured gain from Go here, and each costs a toolchain change, a model change, or both.

| Step | Move to Go | Python keeps | Buys | Costs |
| --- | --- | --- | --- | --- |
| 1 | Proof: `recording_coverage.py`, `take_divergence.py`, compare.py's diff and markers. Merge `internal/chaptermatch` into the same package, so the tokenizer exists once in Go | transcription to a words file. `coverage_mode` already reads and writes cached words files (`read_words_file`, `write_words_file`, `AlignOnlyError`) | No Python start for a re-check from cached words; 4 to 10× compute on a 10,000-word chapter (spikes 1, 2). Pure changes stop refreezing. One tokenizer. The ports are proven identical | Wire contract: the `COVERAGE*` results lines and the divergence JSON come from Go; keep `results.golden.json` and the divergence fixtures as the Go goldens (`wire-contract-change`). The Python parity tests go away with the Python code. About 2,500 lines of Go with tests: M |
| 2 | Booth: `script_tracker.py`, `flags.py`, `align_word.py`, `chapter_script.py`, `control_channel.py`, `levels.py`. The sidecar emits only engine events (`partial`, `word`, `segment_end`) and the host follows the script | engine events from faster-whisper or Moonshine, and capture | One follower, which `internal/liveflags` and `internal/teleprompter` already sit beside. Seek and replay without Python. No speed gain a narrator would see (256 µs against 26 µs per event) | The `position` and flag events move from sidecar output to host output. The replay tools move. M |
| 3 | Story Bible: the rest of the pure part of `manuscript_guide.py` (rule candidates, cue extraction, occurrences) and `extraction_rules.py`. Delete the Python mutation copies once nothing calls them | spaCy, BookNLP and GLiNER candidates; pronunciation (CMU, espeak); Piper preview | The guide sidecar's commands shrink to the model ones | M |
| 4 (optional) | Moonshine through its C ABI from Go (spike 4b) | faster-whisper | `moonshine-voice` leaves the teleprompter freeze, and the DLL-loss failure of [#390](https://github.com/countrymanprime/narration-studio/pull/390) leaves with it. Same engine and text, 22% less memory | Streaming API not yet proven from Go. The Booth would then have two engine paths in two languages until whisper moves too. M |
| Not now | whisper.cpp in the host | n/a | Tiny gets faster; small, the size that counts, is slower (4a) | cgo or a hand FFI for the whole host, a C toolchain on Windows, a new model catalog and review, and coverage re-calibration. Revisit only if dropping Python altogether becomes the goal; even then the Story Bible's spaCy and BookNLP have no Go route |
| Not now | Capture (`sounddevice`, PyAV dshow) | n/a | nothing measured | Needs audio hardware to verify. Revisit with step 4, because live ASR and capture share a process |

**Is consistency worth it?** For pure logic, yes: the ports are proven, small, and remove start-up, duplicate copies and refreezes. For the runners, no: Python is a packaging cost, and the engines underneath are C++ in both languages. Steps 1 to 3 leave Python as three thin runners. The installer stays roughly the same size until a whole runner is gone.

### Names

The owner's page-matched names fit; each sidecar maps to one page:

| Now | Proposed | Page |
| --- | --- | --- |
| `manuscript-guide` | `story-bible` | Story Bible |
| `transcript-compare` | `proof` | Proof |
| `manuscript-teleprompter` | `booth` | Booth |

224 files name the current sidecars (102 under `src/studio/desktop`, 60 under `src/studio/sidecars/`, 26 under `src/studio/ui`, 30 research notes). A rename touches:

| Area | What |
| --- | --- |
| Go launch | `sidecarPath(packagedRoot, "…")` in `src/studio/desktop/app.go`; `smokeSidecars` and the per-sidecar checks in `src/studio/desktop/smoke.go`; `internal/process` program names (`timing.go` names the executable) |
| Freeze and release | the three `Sidecar` entries in `scripts/release/prepare-resources.py`, `runtime/<name>/` under `src/studio/desktop/cmd/narration-studio/resources`, `scripts/release/verify-installable.mjs` and its test, `scripts/release/tests/test_prepare_resources.py`, the freeze cache key, `scripts/licenses` |
| Workspace | the three `src/studio/sidecars/*/project.json` names (Nx projects and tags), `pyproject.toml` paths, CI's affected-project scoping |
| Persisted data | **not renamed.** `transcript-compare` is the analyzer name saved with every finding (`internal/transcript/findings_adapter.go`, `internal/proofing/sources.go`, `src/studio/ui/src/api/contracts/findings.ts`). Renaming it needs a migration of saved findings, or the analyzer name and the sidecar name must part. Keep the analyzer name |
| Docs and skills | `docs/architecture/codebase-map.md` (Sidecar boundary), the threat-model rows for the sidecars, `docs/utilities/`, the `sidecar-freeze` and `sidecar-add` skills, `SECURITY.md`, `README.md` |
| Timing | the restructure in flight moves `src/studio/sidecars/` to `src/studio/sidecars`. Renaming in the same move touches each file once |

## What the owner would have to run

| Check | Why it could not run here | What to run |
| --- | --- | --- |
| whisper.cpp and Moonshine timings on Windows | Linux container, no Windows toolchain | `gowhisper` and `gomoonshine` from the spike branch on a Windows machine (MinGW-w64 for the cgo one), against `python` with the frozen runtime's packages, same clip |
| Moonshine streaming model (`SMALL_STREAMING`) from Go | `download.moonshine.ai` is refused by this container's network policy | the spike's `gomoonshine` with the catalog model from `config/moonshine-assets.json` and the stream calls |
| Cold start of a Go-only check against the frozen sidecar | Windows only; the start-up note's workflow covers the sidecar side | `latency-windows.yml` with a Go build of spike 2 beside the frozen `transcript-compare` |
