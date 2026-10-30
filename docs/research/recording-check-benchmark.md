# Recording check benchmark

How fast the recording check is on real narration, what sets its speed, and what it costs in accuracy. Measured 2026-10-29 with `scripts/dev/recording-check-benchmark.py`, which you can run again on your own machine (see [Rerun it](#rerun-it)).

## Setup

- **Audio.** The first N minutes of LibriVox's *Alice's Adventures in Wonderland*, read by Kara Shallenberg (ids `kara_01`, `kara_02`, `kara_07`, `kara_09` in `tests/fixtures/audio/librivox-alice/sources.json`: 64 kbps mono MP3s, joined). The 2-minute span is the first 120.0 s of `kara_01`; the 10-minute span is the first 600 s of `kara_01` (796 s long).
- **Machine.** 4 virtual processors, 16 GB, Linux container, no GPU. Whisper through faster-whisper, int8. Models `tiny`, `small` and `large-v3-turbo`.
- **Run.** The real sidecar, started as the host starts it: `compare.py --coverage` with `--parallel-workers N`, `--chunk-seconds S` and `--chunk-overlap-seconds 6` (the app's overlap), language `en`.
- **Quality.** Word error rate (substitutions, deletions and insertions over reference words) against (a) the chapter's Project Gutenberg text, over the paragraphs the span holds in full, and (b) the committed whole-file `large-v3-turbo` words (`alignment/*.words.json`). Words lost and repeated against (b), and the errors within 3 s of a chunk boundary, are counted apart.

Timings of the earlier rows in the first table were taken while other work was using the processors at low priority, so read them to about 10%.

## What sets the speed

The check runs transcriptions in parallel in two ways, both threads on **one** loaded model (faster-whisper's `num_workers`; the decoder releases the interpreter lock):

- **Items side by side.** A chapter recorded as several items runs several at once.
- **Chunks of one long item.** An item longer than the chunk length is cut into overlapping chunks. Before this change each chunk ran in a freshly started process that loaded its own copy of the model, and the first chunk ran alone; that was barely faster than one process. They now run as threads on the one model.

A recording shorter than the chunk length is one chunk, and one chunk cannot run beside anything. That is why a 2-minute single recording took the same time at 1, 2, 4 workers and Automatic (25.2, 25.8, 24.8, 25.6 s for `small`).

On 4 processors, **2 workers is as fast as 4**: every extra worker takes threads from the others (4 workers leave each one thread). Automatic's "half the processors" is therefore right here.

## Results, `small`, one recording

| Span | Cut into | Workers | Wall | Real-time factor | WER vs text | WER vs reference | Lost / repeated | Errors at chunk edges |
| - | - | - | - | - | - | - | - | - |
| 2 min | whole | 1 / 2 / 4 / Auto | 25.2 / 25.8 / 24.8 / 25.6 s | 0.21 | 0.7% | 3.0% | 0 / 1 | - |
| 2 min | 30 s chunks | 2 | 19.6 s | 0.16 | 2.2% | 7.3% | 6 / 12 | - |
| 2 min | 60 s chunks | 2 | 20.6 s | 0.17 | 0.4% | 3.3% | 1 / 0 | - |
| 10 min | whole | 2 | 162 s | 0.27 | 2.8% | 1.3% | 2 / 3 | - |
| 10 min | whole | 4 | 144 s | 0.24 | 2.8% | 1.3% | 2 / 3 | - |
| 10 min | 60 s chunks | 2 | **70 s** | **0.12** | 2.4% | 1.3% | 3 / 1 | 3 |
| 10 min | 60 s chunks | 4 | 79 s | 0.13 | 2.4% | 1.3% | 3 / 1 | 3 |
| 10 min | 120 s chunks | 2 | 71 s | 0.12 | 2.5% | 1.5% | 4 / 3 | 0 |
| 10 min | 300 s chunks | 2 | 110 s | 0.18 | 2.5% | 1.0% | 5 / 1 | 2 |

Read: 60 s chunks are 2.3 times faster than the whole file on 10 minutes and are not less accurate. 30 s chunks are fast but lose and repeat words at the joins (the 6 s crossover is a fifth of the chunk): do not go that short. On a 2-minute span a 60 s cut gives about 1.2 times, because the first chunk runs alone and the model's start-up is a larger share of the run.

### Items side by side (10 minutes cut into 10 takes)

| Workers | Wall | Real-time factor |
| - | - | - |
| 1 | 233 s | 0.39 |
| 2 | 80 s | 0.13 |
| 4 | 73 s | 0.12 |

The same 30 minutes as 30 takes: 417 s, 220 s and 184 s at 1, 2 and 4 workers (real-time factor 0.23, 0.12, 0.10).

## The larger-model re-check is the cost

`small` with `large-v3-turbo` re-checking its doubtful words (score line 0.5), 10 minutes as 10 takes, 2 workers: **286 s** (real-time factor 0.48) against 80 s for `small` alone. It re-checked 8 of the 10 takes, 354 s of the 600 s of audio (59%, just under the 60% where whole takes are redone), on clean narration. Every doubtful run becomes a window of at least 25 s, padded and merged. On a machine where the larger model runs near real time, a check with the second look on will run near real time however many workers are free. The windows rule is unchanged here; the quality it buys has to be measured before it is made cheaper.

## What changed

- Chunks of a long item run as threads on one model, not in cold processes.
- The shipped chunk length is 60 s (it was 300 s): on a single 10-minute recording the default now gives the 2.3 times above.
- The recording check's dialog shows the chunks done, the workers busy against the number really used, and the larger model's passages, so none of this has to be guessed.

Not measured: `large-v3` (2.6 GB; about an hour a run on 4 processors), 8 workers (the machine has 4 processors), a GPU, and `tiny`/`large-v3-turbo` quality tables (run the script).

## Rerun it

```bash
python scripts/dev/recording-check-benchmark.py --models tiny,small,large-v3-turbo --spans 2,10 \
    --units whole,items:10,chunk:60,chunk:120 --workers 1,2,4,0 --out ../narration-benchmark
```

It downloads the recordings once (checksummed) and any model it does not find under `--models-dir`, runs every combination through the real sidecar, and writes `results.jsonl` and `results.md`. `--recheck-model large-v3-turbo` adds the second look. On Windows use the same command from the repository's Python environment. Install `psutil` to fill the memory, process and CPU columns.
