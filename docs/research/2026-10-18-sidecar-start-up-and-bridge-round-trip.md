# Sidecar start-up and the REAPER bridge round trip

**Measured 2026-10-18.** Issue: [#1897](https://github.com/countrymanprime/narration-utils/issues/1897). **Questions:** (1) in a frozen Story Bible call that costs 226 to 380 ms p50 ([interaction latency baseline](interaction-latency-baseline.md)), how much is the PyInstaller bootloader, how much is imports, and how much is work? (2) How long does one bridge command take to come back, given that the answer waits for the host's 150 ms tick? Nobody had measured either.

**Status of the numbers.** Every number is *measured* on the machine named beside it; nothing here is estimated. The Windows figures come from one run of the manual workflow [`latency-windows.yml`](../../.github/workflows/latency-windows.yml) (run 39143237384) on a GitHub-hosted `windows-latest` runner: Windows Server 2025, 2-core AMD EPYC 7763, **Defender real-time protection off** (`AntivirusEnabled` true), so a scanned first launch is not in them. One run: expect noise between runs. Linux figures from this container are kept as a second sample of shape only.

## Method

- **Frozen-sidecar split.** `scripts/research/frozen-sidecar-timing.py` runs after `scripts/release/prepare-resources.py` has frozen the sidecars (`--onedir`, PyInstaller 6.22.3). It freezes a one-line `print` program with the same PyInstaller (the floor: bootloader, interpreter start, one print) and times whole launches of it and of each sidecar's `--help` (every module-level import plus argparse; no work). For each, it copies the folder to a **fresh** path three times and times launch 1 of each copy (new files: cold cache, and a scanner's first look where one runs) and launches 2 to 12 of the same copy. Launch 10 is reported beside launch 1. Wall time includes process creation.
- **Import profile.** The script runs the frozen executable with `PYTHONPROFILEIMPORTTIME=1`. If the bootloader ignores the variable (as the Linux build did), it re-freezes the sidecar from its generated spec with `('X importtime', None, 'OPTION')` built in and runs that. It also runs `python -X importtime src/studio/sidecars/.../manuscript_guide.py --help` in the dev interpreter for comparison. Only top-level (unindented) imports are summed, in cumulative microseconds.
- **Work.** An operation's work is its time in the Go harness (`src/studio/desktop/internal/latency`, 20 runs, the real `guide.Service` and `process.Supervisor` against the frozen sidecar) minus the `--help` time of the same executable.
- **Bridge round trip.** `src/studio/desktop/internal/latency/bridge_test.go` runs the real Go client (`bridge.Actions.PlayPosition`) against the real `narration_ui_bridge.lua` on the harness's fake `reaper`, which `scripts/research/bridge-fake-driver.py` ticks like REAPER's defer loop, 16 to 33 ms apart. A goroutine plays the host: `Dispatch` every 150 ms. 10 warm-up calls, then 100 timed calls, each started at a random offset inside the host tick. A probe polling every 0.5 ms splits the trip into the command being taken and the answer being written. Repeated with `events.log` pre-filled to 0, 1 and 8 MB.
- **One host tick against a growing log.** `BenchmarkDispatchByLogSize` in `internal/bridge`: the cost of `Dispatch` when nothing new arrived.

## Findings

### Frozen sidecar start-up (Windows, measured)

Launches of each frozen sidecar's `--help` (every module-level import plus argparse; no work). Launch 1 is the first run of a freshly copied folder; launch 10 and the p50 of launches 2 to 12 are warm. Three fresh copies, 12 launches each.

| Program | Launch 1, fresh copy (ms) | Launch 10 (ms) | Launches 2 to 12 p50 (ms) | p95 (ms) | Folder |
| --- | --- | --- | --- | --- | --- |
| frozen hello (the floor) | 224 (max 246) | 62 | 60 | 69 | 55 files, 20 MB |
| `manuscript-guide --help` | **882** (max 1,283) | 235 | 230 | 260 | 825 files, 278 MB |
| `transcript-compare --help` | **1,947** (max 3,142) | 268 | 269 | 310 | 245 files, 259 MB |
| `manuscript-teleprompter --help` | **3,147** (max 5,528) | 271 | 273 | 312 | 256 files, 285 MB |

- **First launch against warm:** 3.6x for the hello program, 3.7x for `manuscript-guide`, 7.3x for `transcript-compare`, 11.6x for `manuscript-teleprompter`. The larger the folder of native libraries a sidecar loads, the more the first launch costs. This is with Defender's real-time protection off; whether it is the file cache or a scan that the runner still does was not separated.
- **Dev interpreter:** `python -c pass` 30 ms on the runner.

### Where a warm Story Bible call goes (Windows, measured)

For `manuscript-guide`, from the table above and the Go harness (20 runs, the real `guide.Service` and `process.Supervisor` against the frozen sidecar):

| Part | ms | Share of a one-field edit on a 2,000-word manuscript (241 ms) | How known |
| --- | --- | --- | --- |
| Bootloader, interpreter start, a `print` | 60 | 25% | frozen hello, warm |
| Imports and argparse of `manuscript_guide.py` | 170 | 70% | `--help` (230) minus hello (60) |
| Work | about 11 | 5% | edit (241) minus `--help` (230) |

On a full-length manuscript (88,000 words) the same edit is 424 ms, so the work is about 195 ms there, and start-up is still 230 ms of it. Operations that do more than edit one field cost more on any size: create 538 ms and an alias (pronunciation) edit 654 ms on the small manuscript, so 300 to 420 ms of work each (not traced).

**So 95% of a cheap small-manuscript call is start-up, and about three quarters of that start-up is imports and argparse, not the bootloader.** Cutting imports is where the 170 ms is; the bootloader floor of 60 ms is what remains.

### Import profile (Windows, measured once)

Summed top-level imports of `manuscript-guide --help`: **63 ms in the dev interpreter** against **511 ms in a frozen build with `-X importtime` built in** (the frozen program ignored the environment variable `PYTHONPROFILEIMPORTTIME` on both platforms, which is why the script re-freezes from the generated spec). The frozen profile's largest entries are `multiprocessing` (320 ms), `setuptools` (121 ms) and `ctypes.util` (21 ms); the dev profile has none of them. The build log shows PyInstaller including the `pyi_rth_setuptools` runtime hook; no hook was seen for `multiprocessing`. **The cause of either import was not traced and removing them was not tried.** The 511 ms is also inflated: it is a single launch of a newly built executable (a cold one, by the table above) with the profiler on, so it is not comparable to the 230 ms warm launch. Read it as a ranking, not a total. The other two sidecars have no frozen profile (only `manuscript-guide` is re-frozen); their dev profiles are 128 ms (`transcript-compare`, `numpy` 65 ms the largest) and 114 ms (`manuscript-teleprompter`, `numpy` 62 ms).

### Bridge round trip (Windows, measured; Linux in brackets)

`play_position` through the real Lua bridge on the fake reaper, host tick 150 ms. This is the **before** state: the answer waits for the host's tick.

| events.log at start (KB) | Round trip p50 (ms) | p95 (ms) | Max (ms) | Command taken p50 (ms) | Answer written p50 (ms) |
| --- | --- | --- | --- | --- | --- |
| 0 | 94 [98] | 158 [163] | 175 [172] | 11 [14] | 16 [15] |
| 1,024 | 92 [97] | 161 [162] | 175 [172] | 13 [14] | 16 [14] |
| 8,192 | 97 [100] | 158 [165] | 172 [208] | 11 [15] | 14 [16] |

- The script takes a command in 11 to 13 ms and writes its answer in the same tick, about 16 ms of the 94. **The other 78 ms or so is the wait for the host's tick**, matching the review's estimate (script tick 16 to 33 ms plus a mean of 75 ms), now measured on the fake. p95 is 158 ms: a command sent just after a tick waits nearly the whole 150 ms.
- The log's length (0 to 8 MB) moves p50 by 5 ms, within noise.

### One host tick against a growing log (Windows, measured)

`Dispatch` when nothing new arrived, before the change that reads from the saved offset (three runs each):

| events.log | Time per tick | Allocated per tick |
| --- | --- | --- |
| 0 KB | 15 µs | 1.1 KB |
| 200 KB (about an hour of session) | 46 to 48 µs | 214 KB |
| 1 MB | 221 to 236 µs | 1.06 MB |
| 8 MB | 1.9 to 2.3 ms | 8.4 MB |

Reading the whole log costs 0.15% of a 150 ms tick at 1 MB and 1.5% at 8 MB (about 40 hours). It is memory churn (the whole file copied and converted to a string each tick), not time. This is why the fast-poll change reads from the offset but adds no size cap or rotation.

## After the fast-poll change (Windows, measured)

The same harness and workflow on `claude/bridge-fast-poll` ([#1909](https://github.com/countrymanprime/narration-utils/pull/1909): `Client.Expect` polls every 15 ms while a request awaits its answer, and `Dispatch` reads `events.log` from the saved offset), run 39145917943. **The runner differed from the first run: AMD EPYC 7763 here, an Intel Xeon 6973P in the first run's benchmark output**, so the Story Bible rows moved by run-to-run noise as well (see below); the bridge rows are far outside that noise.

### Bridge round trip, before and after

| events.log at start (KB) | p50 before (ms) | p50 after (ms) | p95 before | p95 after | Max before | Max after |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | 94 | 16 | 158 | 31 | 175 | 46 |
| 1,024 | 92 | 16 | 161 | 31 | 175 | 45 |
| 8,192 | 97 | 16 | 158 | 31 | 172 | 45 |

- The round trip is now the script's own cost: the command is taken at p50 11 ms and the answer written at 13 to 14 ms, so the host adds 2 to 3 ms at p50. The 78 ms wait for the host tick is gone, and the worst case dropped from 175 ms to 46 ms.
- Linux, same harness: p50 98 to 16 ms and p95 163 to 31 ms.
- The ceiling is the script's 16 to 33 ms defer tick; a faster host poll cannot go below it. Real REAPER's cadence under load was not measured.

### One host tick against a growing log, before and after

| events.log | Time per tick before | after | Allocated before | after |
| --- | --- | --- | --- | --- |
| 0 KB | 15 µs | 32 µs | 1.1 KB | 0.6 KB |
| 200 KB | 46 to 48 µs | 32 µs | 214 KB | 0.6 to 0.8 KB |
| 1 MB | 221 to 236 µs | 32 µs | 1.06 MB | 0.6 to 0.8 KB |
| 8 MB | 1.9 to 2.3 ms | 32 µs | 8.4 MB | 0.6 to 0.8 KB |

A tick no longer depends on the log's length. The empty-log tick read 32 µs after against 15 µs before, but the two runs were on different CPUs; the re-run below, on a third CPU, measures 15 µs at every size, so the open, stat and close on every tick cost nothing visible.

### Story Bible operations, to show the noise

Not changed by this PR (no sidecar code moved). One-field edit p50: 241 ms (first run), small manuscript; full-length 424 ms against 496 ms in this run. Seeding ten candidates on the full-length manuscript: 8.4 s against 10.9 s. Differences of 15% to 30% between two runs of the same code on different shared runners are the noise to read the bridge comparison against; the bridge change is a factor of six.

### Re-run on the merged head

The same workflow again (run 39156991571, head `0821407`) after `main` and #1898's `sidecar.timing` and `bridge.timing` records were merged into the branch, so the round trip is measured with the timing observer on. Runner: AMD EPYC 9V45 (a third CPU).

| events.log at start (KB) | Round trip p50 (ms) | p95 (ms) | Max (ms) | Command taken p50 (ms) | Answer written p50 (ms) |
| --- | --- | --- | --- | --- | --- |
| 0 | 16 | 31 | 45 | 14 | 14 |
| 1,024 | 16 | 31 | 45 | 13 | 13 |
| 8,192 | 16 | 31 | 46 | 14 | 15 |

| events.log | Time per tick | Allocated per tick |
| --- | --- | --- |
| 0 KB | 14.5 to 15.3 µs | 600 B |
| 200 KB | 14.7 to 14.9 µs | 616 to 808 B |
| 1 MB | 14.5 to 14.8 µs | 808 B |
| 8 MB | 15.4 to 15.8 µs | 808 B |

- **The timing records did not change the round trip**: p50 16 ms, p95 31 ms and max 45 to 46 ms, the same as before the merge. (`Actions.SetObserver` is only wired by the host, `recordBridgeTiming`; this harness calls `Actions` directly with no observer, so this run shows the fast poll after the merge but not the cost of writing the record. That cost is one `slog` line per request and was not measured.)
- A tick costs about 15 µs at every log size, from empty to 8 MB.

### After, merged head (2026-10-19)

The same workflow run by hand on `main` at `c363085` (run 39177332990, started 2026-10-18 23:38 UTC), after #1909 and #1936 merged. Runner: `windows-latest`, AMD EPYC 7763, 4 logical CPUs. Sample: 100 timed `play_position` calls per log size after 10 warm-ups. Defender's state on this run was not read from the log.

| events.log at start (KB) | Round trip p50 (ms) | p95 (ms) | Max (ms) | Command taken p50 (ms) | Answer written p50 (ms) |
| --- | --- | --- | --- | --- | --- |
| 0 | 16 | 31 | 46 | 6 | 14 |
| 1,024 | 16 | 31 | 45 | 7 | 14 |
| 8,192 | 16 | 31 | 45 | 10 | 15 |

| events.log | Time per tick (three runs) | Allocated per tick |
| --- | --- | --- |
| 0 KB | 31.8 to 32.5 µs | 600 B |
| 200 KB | 32.3 to 32.4 µs | 808 B |
| 1 MB | 32.5 to 33.1 µs | 808 B |
| 8 MB | 31.9 to 32.5 µs | 808 B |

- The round trip matches the branch runs: p50 16 ms against 94 ms before the change, p95 31 ms against 158 ms, max 45 to 46 ms against 172 to 175 ms. The fast poll holds on the merged head.
- A tick is flat across log sizes, as before. It reads 32 µs here and 15 µs on the EPYC 9V45 run above; both runners are shared hardware, and this one has the same CPU as the first "after" run (EPYC 7763, 32 µs), so the difference tracks the CPU, not the code.
- "Command taken" moved between runs (6 to 10 ms here, 11 to 14 ms before) while the total did not. The 0.5 ms probe and the fake's defer cadence limit how far to read that split.
- The same run re-measured the frozen sidecars slower than the first run (`manuscript-guide --help` p50 313 ms against 230 ms, hello 80 ms against 60 ms; the first launch of a fresh copy 576 ms against 882 ms). Those rows are not comparable across runs. They are not tabulated here.
- **What this run could not prove.** The bridge was driven by a fake `reaper` ticked from a Python thread, not by REAPER: the 16 ms floor is the fake's 16 to 33 ms tick, and real REAPER's defer cadence under load is unmeasured. The runner has no audio device, so nothing here touches playback or recording. The harness calls `Actions` without the host's timing observer, so the cost of the timing record is not in these numbers.

## What this does and does not show

- The bridge cost is the host's tick, not the script or the log. [The fast-poll change](https://github.com/countrymanprime/narration-utils/pull/1909) targets it.
- Start-up dominates cheap Story Bible calls, and imports dominate start-up. Candidates, none tried: the `multiprocessing` and `setuptools` imports a frozen build carries; `manuscript_guide.py` importing `providers` (and through it Piper) for every subcommand; one long-lived sidecar process instead of one process per call. Which of them pays is for a follow-up with its own measurement.
- The first launch of a sidecar is 0.9 to 3.1 s on this runner even with real-time protection off. Whether to start a sidecar ahead of its first use is a product question these numbers inform but do not answer.
- Not measured: a machine with real-time protection on, a real manuscript, real REAPER under load, the work inside `create` and the pronunciation edits.

## Caveats

- One Windows run on a shared 2-core runner. The Linux container's numbers (from a 2-copy, 6-launch run for the sidecar, and the same harness for the bridge) agree in shape and are not shown except in brackets.
- The 12 launches per copy and 3 copies are small samples; p95 over launches 2 to 12 is the 11 slowest-but-one of 33.
- The fake `reaper` ticks from a Python thread; real REAPER's defer cadence under load (a big project, rendering) was not measured. The review's 16 to 33 ms is the figure from the [transport timing note](reaper-transport-timing.md).
- The bridge probe's 0.5 ms polling and Go's timer resolution put about 1 ms of noise on the split between "taken" and "written".
- The hello program is a floor for the bootloader, not for PyInstaller's runtime hooks, which also run in a sidecar.
- A GitHub runner is shared hardware: expect run-to-run noise, and the real-time protection state above applies only to that runner.
