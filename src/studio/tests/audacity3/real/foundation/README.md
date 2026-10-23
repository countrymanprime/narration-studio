# Real Audacity 3: foundation suite

Tests A3-T1 to T13, T24 to T29 and T34 of [the capability matrix](../../../../../../docs/research/audacity-3-capability-matrix.md#test-plan), run against a pinned, real Audacity 3 on Linux. The record, punch and edit tests (T14 to T23, T30 to T33) are in their own directories next to this one.

## Run it

```bash
src/studio/tests/audacity3/real/foundation/run.sh [go-test-run-regexp]
```

It needs `curl`, `python3`, `go`, `ffmpeg`, `Xvfb`, PulseAudio (`pulseaudio`, `pactl`, `paplay`, `parec`), `libasound2-plugins`, `xdotool` and ImageMagick (the package list is in the script's header). It downloads the Audacity AppImage pinned in `run.sh` and checks its SHA-256, fetches the pinned LibriVox chapter, starts Xvfb and a PulseAudio null sink, and runs `go test -tags audacityreal ./internal/audacityreal/foundation/` from `src/studio/desktop`. CI runs it in [`real-audacity3-foundation.yml`](../../../../../../.github/workflows/real-audacity3-foundation.yml), on a manual dispatch and on a pull request that touches the files below.

## Where things are

| Path | What it holds |
| --- | --- |
| `src/studio/desktop/internal/audacityreal/` | The harness, no assertions: the FIFO transport that dials with a deadline, raw pipe exchanges, the first-start procedure and the primed profile, Audacity process control, window and sink probes, the poller prototype, and the results recorder |
| `src/studio/desktop/internal/audacityreal/foundation/` | The tests, one Go test per matrix test id |
| `src/studio/tests/audacity3/real/foundation/golden/` | Reply bytes a real Audacity wrote (A3-T3), the reference for the fake pipe (`src/studio/desktop/internal/audacitybridge/golden_test.go`) |
| `src/studio/tests/audacity3/real/foundation/summarise.py` | Merges the per-test result files into `results.json` and `summary.md` |

Everything is behind the `audacityreal` build tag, so no ordinary test run starts an Audacity. Another suite can use the `audacityreal` package; keep its tests in a package of its own.

## What a run writes

All under `$NU_AUDACITY_WORK/out` (the CI artifact, 14 days):

- `results.json`: every test, its Audacity version and runner image, and one row per step with a status (`pass`, `fail`, `skip`, or `info` for a measurement or an observed fact), the evidence, and the raw reply files it cites;
- `summary.md`: one line per test, the failed and skipped steps, and the measurements; the job summary shows it;
- `raw/<test>/*.bin`: the exact reply bytes a row cites; `golden/*.bin`: the replies of A3-T3 that are copied to the committed `golden/` directory;
- `shots/*.png`: screenshots; `audio/*.wav`: what the tests exported; `../logs/`: Audacity's own output.

The job never uploads the AppImage or the extracted tree (GPLv3 redistribution).

## Reading a result

A row named `KNOWN LIMIT: ...` pins something Audacity does not do (it does not loop, `GetInfo: Type=Preferences` crashes it). It passes while the limit holds and turns red when a later Audacity changes, which is the signal to look again at the capability it caps. `info` rows are measurements and never fail a test.

## Refreshing the golden replies

Run `run.sh 'TestA3T03'`, then copy `$NU_AUDACITY_WORK/out/golden/*.bin` to `src/studio/tests/audacity3/real/foundation/golden/` and read the diff. A change in those bytes is a change in Audacity.

## Pinning a new Audacity

Bump `AUDACITY_VERSION` and `AUDACITY_SHA256` together in `run.sh` (the hash is the only identity an AppImage has), run the suite, and record the differences.
