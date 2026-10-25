# Moonshine streaming from Go

**Measured 2026-10-25.** Issue: [#2251](https://github.com/countrymanprime/narration-studio/issues/2251), step 4 of the [Go versus Python recommendation](sidecar-go-vs-python.md#recommendation). **Owner's bar:** "do 1-3, and 4 if it doesn't negatively impact performance." **Question:** is the Booth's live Moonshine engine, run from Go through the same C library, no slower and no heavier than today's Python path?

**Answer.** Against today's code, Go is faster and lighter: on the Booth's default tiny model it finishes a 300 s recording fed as fast as possible in 115 s against 200 s, with 17% less CPU and 26% less peak memory, and its events are identical. On the small model in real time, today's Python falls 5 to 12.5 s behind the narrator by the end of 300 s; Go stays within 0.5 s. But the engine time is the same in both. Python's extra cost is one copy in the `moonshine-voice` binding: every pass returns every line of the session with its audio, and `Transcriber._parse_transcript` turns that audio into a Python list. The library has an option that stops it, `return_audio_data=false`. With that option the Python path matches Go on time and CPU, uses less memory, and gives identical events. So step 4 buys no performance over a one-line Python fix, and it costs an audio pipe from the capture sidecar to the host, a DLL loader on Windows that was not tried, and two engine paths in two languages. **Recommendation: do not do step 4; set `return_audio_data` to `false` in `moonshine_engine.load_transcriber` instead.**

**Status of the numbers.** Measured in this container: Linux, 4 vCPU Intel Xeon at 2.80 GHz, Go 1.27.2, CPython 3.12.13. Another session ran Go and Python test suites on the same machine during some runs (load average up to 9, logged every 30 s); the engine's own time, which should be the same for the same work, shows which runs were slowed. The tiny fast table gives the median of 4 runs with the range; the other tables list each run. Nothing here ran on Windows.

## What was run

| Part | What | Source |
| --- | --- | --- |
| Library | `moonshine_voice-0.1.5-py3-none-manylinux_2_34_x86_64.whl` from PyPI (SHA-256 `1ed9e0cc…84496`), the Linux build of the version `pyproject.toml` pins for Windows; `libmoonshine.so` and its bundled ONNX Runtime | PyPI |
| Models | The catalog's tiny and small streaming models (`config/moonshine-assets.json`), 8 of 9 files each, every one matching the catalog's SHA-256 and size | see [Models](#models) |
| Audio | The first 300 s of LibriVox *Alice* chapter 1 (`kara_01`, SHA-256 checked against `tests/fixtures/audio/librivox-alice/sources.json`), decoded by `live_asr.iter_wav_chunks` (PyAV, 16 kHz mono float32): 4,800,000 samples, 938 chunks of 5,120 (0.32 s, `CHUNK_SECONDS`) | |
| Context | Chapter 1's text (11,229 characters), which the Booth sends by default (`live_asr.main`: the chapter text unless `--no-context`) | `tests/fixtures/audio/librivox-alice/alice_text.py` |
| Python | `moonshine_engine.load_transcriber` (update interval 0.5 s, `DECODE_INTERVAL_SECONDS`), then `live_asr.moonshine_hypotheses` and `confirmed_events`, writing each event as a JSON line: the calls the Booth makes, without capture and without the script tracker, which step 2 is moving to the host | |
| Go | A spike program with `github.com/ebitengine/purego` v0.8.4, `CGO_ENABLED=0`, calling the same C functions (`moonshine_load_transcriber_from_files`, `moonshine_transcriber_set_context`, `moonshine_create_stream`, `moonshine_start_stream`, `moonshine_transcribe_add_audio_to_stream`, `moonshine_transcribe_stream`, `moonshine_stop_stream`, `moonshine_free_stream`, `moonshine_free_transcriber`), with the struct layouts of `moonshine_api.py`. It re-implements `Stream.add_audio`'s update gate, `Stream._notify_from_transcript`, `moonshine_hypotheses`, `_moonshine_words`, `_align_timings_to_text` (with `internal/compare`'s `SequenceMatcher`) and `confirmed_events` | not in the repository (see [Spike code](#spike-code)) |

**Pace.** *Fast* hands each chunk over as soon as the last one is done. *Real time* hands chunk *n* over at *n* × 0.32 s after the first, as a microphone would.

**Per-chunk latency** is the time from a chunk's arrival to the end of everything that chunk caused: the library call, a transcription pass when the gate opens, the event layer and writing the events. A pass runs on about every second chunk, so the median chunk in fast mode is a chunk with no pass. **Final** is the time from the last chunk's arrival to the last event after the stream stops. **CPU** is user plus system time of the whole process during the stream (ONNX Runtime runs about 3 threads). **Peak RSS** is `ru_maxrss`.

### Models

`download.moonshine.ai` is refused by this container's network policy (the proxy answers 403 to `CONNECT`). The Hugging Face repositories [`inference4j/moonshine-streaming-tiny-en`](https://huggingface.co/inference4j/moonshine-streaming-tiny-en) and [`inference4j/moonshine-streaming-small-en`](https://huggingface.co/inference4j/moonshine-streaming-small-en) mirror the catalog's `quantized_26_08_21` files.

| File | Tiny | Small | From |
| --- | --- | --- | --- |
| `adapter.ort`, `cross_kv.ort`, `decoder_kv.ort`, `encoder.ort`, `frontend.model.ort`, `frontend.weights.ort`, `streaming_config.json` | matches the catalog | matches the catalog | the inference4j mirrors |
| `tokenizer.bin` | matches the catalog | matches the catalog | the wheel's own `moonshine_voice/assets/tiny-en/tokenizer.bin` |
| `decoder_kv_with_attention.ort` (word timings) | **not found** | **not found** | none of 422 Hugging Face repositories matching "moonshine" or "streaming-en" holds it; `moonshine-ai/moonshine-streaming` holds an older, unquantized layout |

Without the attention decoder the library loads and returns lines with no word timings, as `moonshine_engine.py`'s docstring says. The runs bypass `missing_model_files` for that one file. So `_align_timings_to_text` spread each line's words evenly in both languages, and the cost of computing word timings is in neither.

## The events are identical

`Stream.add_audio` widens its update gate when the last pass took longer than the update interval, so which chunk triggers a pass depends on wall time. Two Python runs of the same input give different events (1,334 against 1,332 on tiny). For the identity check the gate was pinned to 0.5 s in both (`_MAX_UPDATE_INTERVAL_FACTOR` set to 1 in Python, the same constant in Go), and events and line events were compared as parsed JSON, with the library's random line IDs left out.

| Model | Events | Line events | Python against Go | Python against Python | Go against Go |
| --- | --- | --- | --- | --- | --- |
| tiny | 1,336 (430 `partial`, 841 `word`, 65 `segment_end`) | 876 | identical | identical | identical |
| small | 1,322 (421 `partial`, 836 `word`, 65 `segment_end`) | 873 | identical | not run | not run |
| tiny, Python with `return_audio_data=false` | 1,336 | 876 | identical to Python without it | | |

## Results

### Tiny, the Booth's default

`DefaultModel` is `"tiny"` (`src/studio/desktop/internal/teleprompter/service.go`). Median of 4 runs in fast mode (range in brackets); real-time rows below.

| Measure | Python today | Go | Python, `return_audio_data=false` (1 run) |
| --- | --- | --- | --- |
| Load (`load_transcriber`, or `dlopen` plus load in Go) (s) | 0.21 [0.17–0.27], plus 0.08–0.16 importing `live_asr` | 0.19 [0.17–0.27] | 0.20 |
| Per-chunk latency p50 (ms) | 0.95 [0.87–1.31] | 0.12 [0.09–0.14] | 3.15 |
| p95 (ms) | 603 [567–666] | 379 [344–402] | 349 |
| p99 (ms) | 768 [745–883] | 570 [546–599] | 546 |
| Whole stream (s) | 200 [187–206] | 115 [110–120] | 113 |
| Engine calls alone (s) | 118 [109–123] (3 runs) | 111 [110–119] (3 runs) | 112 |
| Final, after the last chunk (s) | 0.62 [0.61–0.72] | 0.26 [0.17–0.46] | 0.19 |
| CPU (s) | 507 [504–513] | 423 [412–428] | 427 |
| RSS after load (MB) | 187 | 162 | 187 |
| Peak RSS (MB) | 430 [429–431] | 317 [294–338] | 280 |

Real time, each run (the engine-calls column shows contention: the same work took 110 to 117 s on a quiet machine):

| Run | p50 (ms) | p95 (ms) | p99 (ms) | Max (ms) | Final (s) | Engine calls (s) | CPU (s) | Peak RSS (MB) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Python today, 1 | 334 | 1,196 | 1,858 | 2,185 | 0.59 | 133 | 520 | 429 |
| Python today, 2 | 263 | 609 | 744 | 1,288 | 0.89 | 112 | 518 | 428 |
| Python today, 3 | 259 | 597 | 753 | 1,370 | 1.15 | 110 | 514 | 428 |
| Python today, 4 | 253 | 600 | 812 | 1,078 | 1.34 | 110 | 513 | 431 |
| Go, 1 (slowed) | 215 | 709 | 1,229 | 2,438 | 0.18 | 169 | 458 | 315 |
| Go, 2 | 60 | 357 | 568 | 1,138 | 0.27 | 112 | 438 | 327 |
| Go, 3 (slowed) | 197 | 812 | 1,226 | 1,745 | 0.27 | 159 | 451 | 334 |
| Go, 4 | 91 | 381 | 567 | 1,244 | 0.29 | 117 | 455 | 324 |
| Python, `return_audio_data=false` | 69 | 372 | 599 | 1,242 | 0.21 | 114 | 447 | 278 |

On a quiet machine Go's p95 is about 370 ms against about 600 ms for today's Python. Python's lag grows through the session: its final event comes 0.6 to 1.3 s after the last chunk, against under 0.3 s for Go. Python with the option matches the quiet Go runs.

### Small

One or two runs each; the first fast and real-time pair ran while the machine was loaded (load average 5 to 9).

| Run | Pace | Whole stream (s) | p95 (ms) | p99 (ms) | Final (s) | Engine calls (s) | CPU (s) | Peak RSS (MB) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Python today, 1 (loaded) | fast | 282 | 1,439 | 2,155 | 0.87 | 234 | 660 | 693 |
| Python today, 2 | fast | 264 | 875 | 1,191 | 0.69 | 192 | 728 | 694 |
| Go, 1 (loaded) | fast | 262 | 1,564 | 2,096 | 0.86 | 262 | 592 | 655 |
| Go, 2 | fast | 209 | 728 | 1,126 | 0.44 | 209 | 677 | 669 |
| Python, `return_audio_data=false` | fast | 191 | 611 | 802 | 0.41 | 190 | 673 | 552 |
| Python today, 1 (loaded) | real time | 312 | 10,154 | 11,543 | 12.50 | 251 | 631 | 692 |
| Python today, 2 | real time | 311 | 7,692 | 9,228 | 10.97 | 217 | 671 | 691 |
| Python today, 3 | real time | 305 | 3,467 | 4,406 | 5.34 | 189 | 750 | 691 |
| Go, 1 (loaded) | real time | 301 | 1,334 | 2,644 | 0.65 | 225 | 610 | 647 |
| Go, 2 | real time | 300 | 1,045 | 1,646 | 0.40 | 201 | 658 | 672 |
| Go, 3 | real time | 300 | 628 | 853 | 0.49 | 194 | 688 | 635 |
| Python, `return_audio_data=false` | real time | 300 | 611 | 909 | 0.49 | 189 | 682 | 564 |

Load took 0.35 to 0.58 s from Python and 0.35 to 0.65 s from Go. Today's Python falls behind on small in real time: its last event came 5 to 12.5 s after the last chunk, because each pass also copies the session's audio and the gate then widens. Go and Python with the option stay within 0.5 s.

## Where Python's extra time goes

- **The engine time is the same.** The time inside `moonshine_transcribe_stream` is 118 s from Python and 111 s from Go on tiny, against whole streams of 200 s and 115 s. A `cProfile` of the first 60 s puts 2.9 s of 28.4 s in `Transcriber._parse_transcript`; on 60 s the two languages are within noise of each other (Python 24.9 to 26.1 s, Go 23.2 to 25.5 s).
- **The copy grows with the session.** Every pass returns every line of the stream so far, each with its audio. At the end of the 300 s run the transcript holds 65 lines and 4,438,528 samples. `_parse_transcript` turns each line's audio into a Python list of floats (`audio_data = list(audio_array)`) on every pass, so a pass costs more the longer the narrator has been reading. The Booth never reads `line.audio_data`. Per-chunk p95 in each fifth (60 s) of a real-time run, in ms:

  | Run | 0–60 s | 60–120 s | 120–180 s | 180–240 s | 240–300 s |
  | --- | --- | --- | --- | --- | --- |
  | tiny, Python today (run 2) | 435 | 448 | 646 | 573 | 671 |
  | tiny, Python today (run 4) | 379 | 438 | 671 | 583 | 708 |
  | tiny, Go (run 2) | 383 | 371 | 418 | 342 | 327 |
  | tiny, Go (run 4) | 434 | 349 | 532 | 364 | 333 |
  | tiny, Python with `return_audio_data=false` | 373 | 352 | 508 | 335 | 319 |
  | small, Python today (run 2) | 682 | 677 | 765 | 3,607 | 8,996 |
  | small, Go (run 3) | 669 | 639 | 650 | 606 | 607 |

- **Removing the copy closes the gap.** With that one line patched out, Python took 111.9 s, 426 s of CPU and 297 MB peak. With the library's own option instead (`options={"word_timestamps": "true", "return_audio_data": "false"}`, which `libmoonshine.so` names among its options), the lines carry no audio (0 samples at the end), Python took 112.6 s, 427 s of CPU and 280 MB peak, and the events were identical to the run without it.

So the gain comes from the spike not copying the audio, not from Go.

## Audio over a pipe

With Moonshine in the host and capture still in Python, the capture sidecar would write each chunk to a pipe. A Python writer (`numpy` `tobytes`, a 12-byte header with the send time and sample count, `flush`) sent the recording's chunks to a Go reader (`io.ReadFull`, decode to `[]float32`); latency is send time to decoded chunk, on the same clock.

| Run | Chunks | Payload per chunk | p50 (µs) | p95 (µs) | p99 (µs) | Max (ms) | Writer CPU (s) | Reader CPU (s) | Writer peak RSS (MB) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| float32, real time (0.32 s apart) | 300 | 20,480 B | 278 | 498 | 2,164 | 12.4 | 0.41 | 0.17 | 46.8 |
| float32, back to back | 10,000 | 20,480 B | 69 | 271 | 426 | 1.8 | 0.64 | 0.32 | 46.8 |
| int16, back to back | 10,000 | 10,240 B | 96 | 397 | 851 | 58.5 | 0.69 | 0.30 | 46.8 |

- **The pipe costs nothing measurable.** A real-time chunk arrives in under 0.5 ms at p95, against a 0.32 s chunk and passes of 100 to 600 ms. 64 KB/s of float32 is the whole load; int16 halves the bytes and saves no time.
- **The engine over the pipe gives the same events.** The Go spike reading the 938 chunks from the writer on standard input, with the gate pinned, produced events and line events identical to its file run (119.8 s, 452 s CPU, 328 MB peak, within the spread of the file runs).
- **The capture process stays.** A Python process that imports `live_asr` and `capture_wasapi` peaks at 31 MB, and the writer at 47 MB with the audio loaded, so a Go engine saves the host-plus-sidecar total less than the RSS columns above suggest.

## What a Go engine would add

| Moving part | Today | With step 4 |
| --- | --- | --- |
| Where audio goes | capture and engine in one sidecar process | the capture sidecar writes 16 kHz chunks to a pipe, the host reads them and runs Moonshine; a new framed binary wire contract (`wire-contract-change`) beside the NDJSON events |
| Processes in a Booth session | one sidecar | the same sidecar for capture, plus the engine in the host; a Moonshine crash takes the host down instead of a sidecar |
| Native libraries | `moonshine.dll` and `onnxruntime.dll` inside the teleprompter freeze, which lost them once ([#390](https://github.com/countrymanprime/narration-studio/pull/390)); `--capabilities --verify` now proves they load | the same two DLLs shipped beside `narration-studio.exe`, loaded by `syscall.LoadDLL` or `windows.LoadDLL`; a new installer and update-package entry, and a new smoke check in the host |
| Windows loading | ctypes, proven by the packaged smoke test | not tried: purego's `Dlopen` is Unix-only, and its `RegisterLibFunc` with a Windows handle, the struct layouts under the Windows x64 ABI and the DLL search path beside the host are all unverified |
| Engines | Whisper and Moonshine both in Python, behind `asr_adapters.py` | Moonshine in Go and Whisper in Python until whisper moves, which [spike 4a](sidecar-go-vs-python.md#4a-whisper-faster-whisper-python-against-whispercpp-go-through-cgo) advised against; two adapters, two event layers (`confirmed_events` and its Go copy) held by a parity test |
| Event layer | `confirmed_events`, `moonshine_hypotheses`, `_align_timings_to_text` in Python | ported to Go (about 130 lines in the spike, over `internal/compare`'s `SequenceMatcher`) and held to Python by golden files while Whisper still uses the Python copy |
| Model catalog | `internal/moonshine` installs and verifies the files; the sidecar checks presence | unchanged; the host would load the directory itself |
| Toolchain | none | none: purego keeps `CGO_ENABLED=0` |

## Verdict against the bar

| Bar | Against today's Python | Against Python with `return_audio_data=false` |
| --- | --- | --- |
| No slower | met: tiny p95 and p99 lower, whole stream 42% shorter; small in real time stays current where Python falls seconds behind | equal within run-to-run noise |
| No heavier | met: 17% less CPU, 26% less peak RSS | CPU equal; Go's peak RSS is higher on tiny (317 MB median against 276 to 280 MB in three runs) and on small (635 to 672 MB against 552 to 564 MB), and the capture sidecar (31 MB or more) still runs beside it |
| Identical output | met | met |
| Small architecture cost | not met: a new audio wire contract, untested Windows DLL loading, two engine paths in two languages | same |

Step 4 does not clearly clear the bar once the Python path is fixed, and its architecture cost is not small, so this note outlines no PR series for it.

## Recommendation

1. **Do not move Moonshine to the host now.** Keep step 4 as "not now" in the recommendation table, revisited only if whisper also leaves Python, when capture would move too and the audio pipe would not be needed.
2. **Fix the Python path instead:** pass `"return_audio_data": "false"` beside `"word_timestamps": "true"` in `moonshine_engine.load_transcriber`. One option, no new process boundary. Before shipping it, check on Windows that the pinned `moonshine.dll` honours the option the same way, and pin it with a test that the option is passed (`src/studio/sidecars/manuscript-teleprompter/tests/test_moonshine_engine.py`).
3. **Get the attention decoder** (`decoder_kv_with_attention.ort`) from the catalog on a machine that can reach `download.moonshine.ai`, and re-run the comparison with word timings on, since their cost is in neither run here.

## What was not measured

- The word-timestamp decoder, as above.
- Windows: DLL loading from Go, the Windows build of the library, Defender and frozen start-up, and real devices. A narrator's real microphone was not used; capture is replaced by the decoded file.
- Medium streaming (`MEDIUM_STREAMING`): not in the catalog.
- The script tracker and flags, which step 2 is moving to the host (`internal/scripttrack`, [What Go already does](sidecar-go-vs-python.md#what-go-already-does)); both paths leave them out.
- Sessions longer than 300 s. The copy grows with session length, so a chapter-length session is expected to widen the gap in today's Python; it was not run.
- A quiet machine: runs overlapped with another session's tests. The engine-time column and the 60 s profile show the differences above are larger than that noise.

## Spike code

The scripts are not in the repository. They ran from a scratch directory: `pybench.py` (the Python path), `gostream/` (the Go module, with its own `go.mod`, so the app's `go.mod` and `go.sum` are untouched), `cmp.py` (event comparison), `prep.py` (audio and context), and `pipe/` (the pipe test). They could join the [`research/sidecar-go-spike`](https://github.com/countrymanprime/narration-studio/tree/research/sidecar-go-spike/research-spikes/sidecar-go) branch with the other spikes.
