# Recording coverage: batched Whisper against the sequential path

**Status: measured, 2026-10-18. Decision: no-go** on `BatchedInferencePipeline` as the recording check's transcriber.
The sidecar code is unchanged. Everything below was run with a throwaway harness kept outside the repository.

## Question

faster-whisper's README publishes `BatchedInferencePipeline` (`small`, int8, CPU i7-12700K, 13 minutes of audio, beam 5):
1 m 42 s sequential against 51 s at `batch_size=8`, with RAM going from 1,477 MB to 3,608 MB. Those are the README's
figures, not measurements from this repository. The recording check transcribes each item with
`model.transcribe(..., vad_filter=True, word_timestamps=True, hotwords=...)`, one call at a time
(`core/asr_batch.py`, `core/coverage_mode.py`), and since [#1811](https://github.com/countrymanprime/narration-utils/pull/1811)
can also cut an item into 300 s chunks and run them in worker processes (`core/coverage_chunks.py`). The questions:

1. Does the batched pipeline keep word timestamps, text and hotwords close enough that the calibrated settings (0.8 / 3 / 8 / 3,
   see [the calibration note](recording-coverage-calibration.md)) still give the right verdict?
2. Does it fit a narrator's laptop RAM?
3. Does it compose with the chunked parallel path, or do the two double-count the CPUs?

## Method

- **Corpus:** the 14 LibriVox coverage cases ([`tests/fixtures/audio/librivox-alice`](../../tests/fixtures/audio/librivox-alice/README.md)),
  built with `build.py all` from the checksum-verified recordings: 173.1 audio minutes, 4 complete chapters (labelled "met") and 10
  incomplete ones. `small` and `tiny` ran on all 14. `large-v3-turbo` and `medium` ran on four of them
  (`kara_01-complete`, `kara_01-skipped-paragraph`, `kara_02-different-text`, `leach_01-complete`; 50.2 minutes) because of time.
- **Models:** the catalog's hash-pinned files (`config/whisper-assets.json`), SHA-256 verified after download.
- **Machine:** Intel Xeon 2.1 GHz, 4 vCPUs, 16 GB RAM, no GPU, Linux container. CPU, int8, beam 5 (both paths' default).
  faster-whisper 1.2.1, ctranslate2 4.8.2. This is a slower and smaller machine than the README's.
- **Path:** each case ran as its own `compare.py --coverage` process with `--language en`, as the host launches it, so decode, model load,
  VAD, the words file, alignment and the result lines are the shipped code. The harness only replaced
  `coverage_mode.load_whisper_model` (and the chunk workers' copy of it) with a wrapper whose `transcribe` calls
  `BatchedInferencePipeline.transcribe(..., batch_size=N)` with the same `language`, `word_timestamps=True`, `vad_filter=True` and
  `hotwords`. A run's configuration is `seq` (unchanged), `bN` (batched, N = 1, 4 or 8), `cW` (the chunked path, `--chunk-seconds 300
  --chunk-overlap-seconds 6 --parallel-workers W`) and `cW-b8` (both).
- **Measured per run:** wall time of the whole process; peak RSS as the sum over the process tree, sampled every 0.25 s from
  `/proc/<pid>/status`; CPU seconds (user + system, children included). Runs were one at a time so they did not share the CPUs.
- **Compared with `seq`:** words matched by `difflib.SequenceMatcher` over lower-cased alphanumerics; the start and end deltas are
  the absolute difference of matched words, pooled over cases. Verdicts apply `text_complete` from `tests/coverage_calibration.py` to
  the sidecar's result lines at the shipped 0.8 / 3 / 8 / 3 and at the Proposed 0.95 / 3 / 8 / 3, against the case labels.
- **Timing noise:** one run per cell. The same `seq` case took 155 s in the main matrix and 196 s in the later hotword run, so
  differences under about 25% are not established.

## Findings

### Speed and memory (measured)

| Model | Cases | `seq` s | `b1` s | `b4` s | `b8` s | `b8` against `seq` | Peak RSS MB `seq` / `b4` / `b8` |
| --- | --- | --- | --- | --- | --- | --- | --- |
| tiny | 14 | 652 | 520 | 270 | 238 | 2.7x | 1,001 / 731 / 1,068 |
| small | 14 | 2,233 | 1,849 | 1,156 | 1,131 | 2.0x | 1,327 / 1,877 / 2,374 |
| medium | 4 | 1,688 | | 841 | 828 | 2.0x | 2,695 / 3,992 / 5,499 |
| large-v3-turbo | 4 | 915 | | 631 | 641 | 1.4x | 2,220 / 2,930 / 3,754 |

Seconds are the sum over the cases. `small` sequential cost 12.9 s per audio minute here against 6.5 s at `b8`. The README's 2.0x
for `small` reproduces. Its RAM growth does not: 1.8x at `b8` here against 2.4x. `b4` is as fast as `b8` for every model and holds
about 500 MB to 1.5 GB less, so the batch size above 4 buys nothing on 4 CPUs. `b1` is only 1.2x faster: most of the gain is the
batching, not the pipeline. The RSS sum counts pages that worker processes map from the same model file more than once, so the
chunked figures below are upper bounds.

### Words are not the same, and the batch size does not change them (measured)

`b1`, `b4` and `b8` wrote **identical words and timestamps** on every case for every model. The difference from `seq` comes from the
pipeline (30 s windows cut from the VAD's speech runs, decoded without timestamp tokens and without the previous window as a prompt),
not from how many windows run together.

| Model | Matched words of `seq` | Median start delta | p95 start | p99 start | p95 end | `seq` words replaced / dropped / added in batched |
| --- | --- | --- | --- | --- | --- | --- |
| tiny | 30,088 of 30,594 | 10 ms | 140 ms | 470 ms | 60 ms | 621 / 27 / 60 |
| small | 29,307 of 30,267 | 10 ms | 60 ms | 290 ms | 30 ms | 691 / 298 / 6 |
| medium | 8,469 of 8,725 | 10 ms | 70 ms | 250 ms | 50 ms | 183 / 112 / 28 |
| large-v3-turbo | 8,769 of 8,865 | 10 ms | 50 ms | 720 ms | 30 ms | 53 / 51 / 31 |

Timestamps of matched words are close: the median is one 10 ms tick. The tails are not what matters. What matters is the words
the batched pipeline does not write.

### Verdicts: no false "met", more and different false "not met" (measured)

**No configuration passed an incomplete chapter.** All ten incomplete chapters stayed "not met" in every run in this note: every
model, batch size, chunked or not, with hotwords and with each mitigation below. The PRD's shipping gate is held.

False "not met" at the shipped 0.8 (a chapter labelled "met" that came out "not met"), out of the complete chapters that ran:

| Model | `seq` | Batched | Which |
| --- | --- | --- | --- |
| small (4 complete) | 0 | **3** | `kara_01-complete`, `kara_01-multiple-items`, `kara_01-retakes` |
| tiny (4 complete) | 3 | 0 | `seq` fails `kara_01-complete`, `kara_01-multiple-items`, `leach_01-complete` |
| large-v3-turbo (2 complete) | 0 | 1 | `kara_01-complete` |
| medium (2 complete) | 2 | 1 | `seq` fails both; batched fails `leach_01-complete` |

At the Proposed 0.95 `small` fails 3 sequentially and 4 batched. The direction depends on the model, so batching is not
uniformly worse, but for the default model it turns a clean result (0 of 14 wrong at 0.8, the figure in
[the calibration note](recording-coverage-calibration.md#librivox-real-speech-2026-09-27)) into 3 wrong.

**The `small` failure is one specific loss.** In all three cases the longest missing run is 21 words: the first sentence of the
chapter ("Alice was beginning to get very tired ... nothing to do"). Sequential `small` wrote it at 18.6 s; batched `small` wrote
the title ("Chapter 1 of Alice's Adventures in Wonderland") and then skipped to the second sentence at 28.4 s. Probing the first 70 s
of `kara_01-complete` with `small`: the default and `no_speech_threshold=None, log_prob_threshold=None` both lose the sentence;
`without_timestamps=False` writes it but loses the end of it ("and of having"); `chunk_length=15` and
`vad_parameters={"max_speech_duration_s": 15}` write it. The batched windows hold title, pause and first sentence together, and the
decoder stops after the title. A second loss of the same kind sits mid-chapter ("What a curious feeling, said Alice,", 2.3 s after
a pause). `medium` shows a larger one: `leach_01-complete` loses a run of 111 words under batching.

### The two window changes that recover the sentence do not fix the verdicts (measured)

`small`, `b8`, six cases (`kara_01-complete`, `kara_01-retakes`, `leach_01-complete`, `kara_10-editorial-notes-not-read`,
`kara_01-skipped-paragraph`, `kara_02-late-start`):

| Change | Wrong at 0.8 | Longest missing run on the two flipped chapters | Seconds (six cases) |
| --- | --- | --- | --- |
| `seq` | 0 | 1, 1 | 968 |
| batched, default | 2 | 21, 21 | 487 |
| `chunk_length=15` | 2 | 10, 19 | 777 |
| `vad_parameters max_speech_duration_s=15` | 2 | 9, 9 | 507 |

Each change moves the loss to a different sentence. `chunk_length=15` also costs time: on `large-v3-turbo` (three cases) it took 966 s
against 716 s sequential, because every 15 s window is padded to 30 s. With `medium` it fixed `leach_01-complete` and left
`kara_01-complete` failing (run of 15; sequentially 9). With `tiny` it kept 0 wrong against 2 for `seq` on those six cases. No setting tried is a safe default.

### Hotwords (measured, two cases)

`hotwords` is accepted by `BatchedInferencePipeline.transcribe` and the run completes. With a list of the Alice names
(`vocabulary_hints.txt` in the project folder) on `kara_01-complete` and `kara_02-late-start`, `small` `b8` wrote 260 replaced / 597 dropped / 21
added words of `seq`'s 4,101, against 691 / 298 / 6 of 30,267 across the 14 cases without hints. `kara_01-complete` fell to 1,675 of
2,197 words present with a missing run of 88. Sequential output with the hints had 2,160 words present on `kara_01-complete` (as without) and 1,910 on
`kara_02-late-start` (1,934 without). The mechanism is not diagnosed and the word-level effect on the names was not counted. Two cases are an alarm, not
a rate, but batched hotwords are not shown to be equivalent.

### Composition with the chunked path (measured, three cases, `small`)

`kara_01-complete`, `kara_10-editorial-notes-not-read`, `leach_01-complete`; `seq` took 510 s in total.

| Configuration | Seconds | Against `seq` | CPU s per wall s | Peak RSS MB | Wrong at 0.8 |
| --- | --- | --- | --- | --- | --- |
| `seq` | 510 | 1.00 | 2.2 | 1,327 | 0 |
| `b8` | 247 | 0.48 | 2.8 | 2,374 | 1 |
| `c4` (workers 4, requested) | 692 | 1.36 | 1.3 | 3,754 | 1 (`leach_01-complete`, run 6) |
| `c2` | 405 | 0.79 | 2.5 | 3,696 | 1 (same) |
| `c4-b8` | 512 | 1.00 | 1.3 | 5,184 | 1 |
| `c2-b8` | 290 | 0.57 | 2.5 | 5,196 | 1 |

(`seq` and `b8` CPU and RSS are over all 14 cases.)

- **They do not stack.** `c2-b8` is 17% slower than `b8` alone and holds twice the memory. The batched path already keeps about
  2.8 of the 4 CPUs busy; a second layer of workers has nothing left to use.
- **The shipped default is not faster on 4 CPUs.** `c4` asks for the model's cap of 4 workers; with 3 chunks that is 3 workers of
  `cpus // workers` = 1 thread each (`ChunkedTranscriber._chunked`), and the first chunk runs alone first. It took 1.36x the
  sequential time and used 1.3 CPUs on average. Two workers of two threads took 0.79x. That is one 4-CPU machine and three cases;
  a machine with more cores is likely to differ (expectation, not measured).
- **Chunking alone changed a verdict:** `leach_01-complete` at a chunk edge has a missing run of 6 (`c4`, `c2`) against 2 sequentially. The
  words differ by 202 replaced / 4 dropped / 20 added of 6,752.
- No slowdown from thrashing appeared beyond the above, so "oversubscription" on this machine means under-use (`c4`) or no gain
  (`c2-b8`), not contention.

## Go or no-go

**No-go for `BatchedInferencePipeline` as the recording check's transcriber, for any model, at any batch size.** Three measured reasons:

1. It turns the shipped default's clean LibriVox result (0 wrong of 14 at 0.8) into 3 false "not met" by dropping the first sentence
   after the preamble. That is the failure the check's missing-run rule exists to report, so a narrator would be told to
   re-record a sentence they read.
2. The two window settings that recover that sentence move the loss elsewhere, and one doubles the time on a larger model.
3. Hotwords, which the check passes from the project's `vocabulary_hints.txt`, behaved worse in the only two cases tried.

**Settings to keep:** `small`, sequential, `vad_filter=True`, `word_timestamps=True`. No change to `0.8 / 3 / 8 / 3` is indicated.

**Chunking:** leave `parallel_workers` and `chunk_seconds` as they are, but the default of 4 workers on a 4-CPU machine measured slower
than no chunking and 2 workers measured faster. A narrator on a 4-core laptop may want 2. That is a follow-up measurement
(more cores, more cases), not a settings change from three cases on one machine.

**A candidate worth one more look, not adopted:** a batched `tiny` first pass in the model cascade. It was 2.7x faster at `b8` (2.4x
at `b4`, with 0.73 GB peak against 1.07 GB), and 0 of 14 chapters wrong at 0.8 against 3 for sequential `tiny`. The cascade
re-checks failing regions with `large-v3-turbo` anyway. Conditions before it is adopted: more readers, a check that it never
marks a missed stretch present (none seen here: 0 false "met"), no hotwords, no chunking, `batch_size=4`.

**RAM for a narrator's laptop (estimate from the measured peaks):** `small` at `b4` peaked at 1.9 GB and at `b8` at 2.4 GB, so it fits an 8 GB
machine with the app open; `medium` at `b8` peaked at 5.5 GB and `large-v3-turbo` at 3.8 GB, which do not leave much on 8 GB. The
app's own memory use was not measured.

## Caveats

- **One slow 4-vCPU machine, one run per cell.** The README's machine is faster; a run-to-run swing of about 25% was seen. The
  relative results are consistent across all 14 cases (`b8` between 0.46x and 0.52x of `seq` for `small` on every case) but the
  absolute seconds are not a promise.
- **Two readers, 4 complete chapters, counts not rates.** The corpus is LibriVox 64 kbps MP3 read at an even pace; a quiet
  home studio will differ. `medium` and `large-v3-turbo` ran on four cases, so their rows are indications.
- **Mitigations tried were not a search.** Two window settings were run across cases. Others (for example a lower `no_speech_threshold`
  with shorter windows, or giving the pipeline the title as a prompt) were not.
- **Sequential is not the truth either:** sequential `tiny` and `medium` already fail two or three complete chapters at 0.8.
- **Hotword result is two cases.** The names' own recognition was not counted.
- **Not measured:** GPU (`float16`), Windows or macOS builds, the frozen sidecar's worker processes, more than four CPUs.
- **The harness is not in the repository.** It was a wrapper around the sidecar's model loader plus a runner and an analysis script;
  re-creating it needs only `BatchedInferencePipeline(model).transcribe(audio, language=..., word_timestamps=True, vad_filter=True,
  hotwords=..., batch_size=N)` in place of `model.transcribe` inside `coverage_mode.load_whisper_model`'s result.
