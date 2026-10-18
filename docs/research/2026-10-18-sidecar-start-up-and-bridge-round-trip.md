# Sidecar start-up and the REAPER bridge round trip

**Measured 2026-10-18.** Issue: [#1897](https://github.com/countrymanprime/narration-utils/issues/1897). **Questions:** (1) in a frozen Story Bible call that costs 226 to 380 ms p50 ([interaction latency baseline](interaction-latency-baseline.md)), how much is the PyInstaller bootloader, how much is imports, and how much is work? (2) How long does one bridge command take to come back, given that the answer waits for the host's 150 ms tick? Nobody had measured either.

**Status of the numbers.** Every number is *measured* on the machine named beside it; nothing here is estimated. The Windows figures come from one run of the manual workflow [`latency-windows.yml`](../../.github/workflows/latency-windows.yml) (run 39143237384) on a GitHub-hosted `windows-latest` runner: Windows Server 2025, 2-core AMD EPYC 7763, **Defender real-time protection off** (`AntivirusEnabled` true), so a scanned first launch is not in them. One run: expect noise between runs. Linux figures from this container are kept as a second sample of shape only.

## Method

- **Frozen-sidecar split.** `scripts/research/frozen-sidecar-timing.py` runs after `scripts/release/prepare-resources.py` has frozen the sidecars (`--onedir`, PyInstaller 6.22.3). It freezes a one-line `print` program with the same PyInstaller (the floor: bootloader, interpreter start, one print) and times whole launches of it and of each sidecar's `--help` (every module-level import plus argparse; no work). For each, it copies the folder to a **fresh** path three times and times launch 1 of each copy (new files: cold cache, and a scanner's first look where one runs) and launches 2 to 12 of the same copy. Launch 10 is reported beside launch 1. Wall time includes process creation.
- **Import profile.** The script runs the frozen executable with `PYTHONPROFILEIMPORTTIME=1`. If the bootloader ignores the variable (as the Linux build did), it re-freezes the sidecar from its generated spec with `('X importtime', None, 'OPTION')` built in and runs that. It also runs `python -X importtime sidecars/.../manuscript_guide.py --help` in the dev interpreter for comparison. Only top-level (unindented) imports are summed, in cumulative microseconds.
- **Work.** An operation's work is its time in the Go harness (`apps/desktop/internal/latency`, 20 runs, the real `guide.Service` and `process.Supervisor` against the frozen sidecar) minus the `--help` time of the same executable.
- **Bridge round trip.** `apps/desktop/internal/latency/bridge_test.go` runs the real Go client (`bridge.Actions.PlayPosition`) against the real `narration_ui_bridge.lua` on the harness's fake `reaper`, which `scripts/research/bridge-fake-driver.py` ticks like REAPER's defer loop, 16 to 33 ms apart. A goroutine plays the host: `Dispatch` every 150 ms. 10 warm-up calls, then 100 timed calls, each started at a random offset inside the host tick. A probe polling every 0.5 ms splits the trip into the command being taken and the answer being written. Repeated with `events.log` pre-filled to 0, 1 and 8 MB.
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
