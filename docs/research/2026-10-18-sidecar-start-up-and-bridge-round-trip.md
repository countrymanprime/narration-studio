# Sidecar start-up and the REAPER bridge round trip

**Measured 2026-10-18.** Issue: [#1897](https://github.com/countrymanprime/narration-utils/issues/1897). **Questions:** (1) in a frozen Story Bible call that costs 226 to 380 ms p50 ([interaction latency baseline](interaction-latency-baseline.md)), how much is the PyInstaller bootloader, how much is imports, and how much is work? (2) How long does one bridge command take to come back, given that the answer waits for the host's 150 ms tick? Nobody had measured either.

**Status of the numbers.** Every number below is labelled *measured* (and where) or *estimated*. The Windows rows come from the manual workflow [`latency-windows.yml`](../../.github/workflows/latency-windows.yml); **they are pending the workflow run and are marked so** until they are filled in.

## Method

- **Frozen-sidecar split.** `scripts/research/frozen-sidecar-timing.py` runs after `scripts/release/prepare-resources.py` has frozen the sidecars (`--onedir`, PyInstaller 6.22.3). It freezes a one-line `print` program with the same PyInstaller (the floor: bootloader, interpreter start, one print) and times whole launches of it and of each sidecar's `--help` (every module-level import plus argparse; no work). For each, it copies the folder to a **fresh** path three times and times launch 1 of each copy (new files: cold cache, and a scanner's first look where one runs) and launches 2 to 12 of the same copy. Launch 10 is reported beside launch 1. Wall time includes process creation.
- **Import profile.** The script runs the frozen executable with `PYTHONPROFILEIMPORTTIME=1`. If the bootloader ignores the variable (as the Linux build did), it re-freezes the sidecar from its generated spec with `('X importtime', None, 'OPTION')` built in and runs that. It also runs `python -X importtime sidecars/.../manuscript_guide.py --help` in the dev interpreter for comparison. Only top-level (unindented) imports are summed, in cumulative microseconds.
- **Work.** An operation's work is its time in the Go harness (`apps/desktop/internal/latency`, 20 runs, the real `guide.Service` and `process.Supervisor` against the frozen sidecar) minus the `--help` time of the same executable.
- **Bridge round trip.** `apps/desktop/internal/latency/bridge_test.go` runs the real Go client (`bridge.Actions.PlayPosition`) against the real `narration_ui_bridge.lua` on the harness's fake `reaper`, which `scripts/research/bridge-fake-driver.py` ticks like REAPER's defer loop, 16 to 33 ms apart. A goroutine plays the host: `Dispatch` every 150 ms. 10 warm-up calls, then 100 timed calls, each started at a random offset inside the host tick. A probe polling every 0.5 ms splits the trip into the command being taken and the answer being written. Repeated with `events.log` pre-filled to 0, 1 and 8 MB.
- **One host tick against a growing log.** `BenchmarkDispatchByLogSize` in `internal/bridge`: the cost of `Dispatch` when nothing new arrived.

## Findings

### Frozen sidecar start-up

Linux container (2.1 GHz Xeon, 4 vCPU), frozen `manuscript-guide`, 2 fresh copies, 6 launches each. **Measured, but Linux and a short run; the Windows figures are the ones that matter and are pending.**

| Program | Launch 1, fresh copy (ms) | Launch 10 (ms) | Launches 2 to N p50 (ms) | Folder |
| --- | --- | --- | --- | --- |
| frozen hello (floor) | 57 | 59 | 57 | 3 files, 35 MB |
| `manuscript-guide --help` | 224 | 200 | 202 | 709 files, 387 MB |

Import profile of `manuscript-guide --help`, summed top-level imports: **176 ms frozen** (built with `-X importtime`) against **80 ms in the dev interpreter**. The frozen profile's largest entry is `setuptools` at 89 ms, which the dev run does not import; the frozen build includes PyInstaller's `pyi_rth_setuptools` runtime hook. The cause of the import was not traced, so whether it can be dropped (an `--exclude-module`, or the hook) is **not established**.

**Windows (`windows-latest`): pending the workflow run.** The runner is Windows Server 2025 on a 2-core AMD EPYC 7763, with Defender's real-time protection **off** (read from the first run's log), the kindest case for a first launch, as in the earlier baseline.

### Where the 200 ms goes (Linux, measured; Windows pending)

| Part | ms | How known |
| --- | --- | --- |
| Bootloader, interpreter start, a `print` | about 57 | frozen hello |
| Module imports and argparse of `manuscript-guide` | about 145 | `--help` minus hello (202 - 57) |
| Of which `setuptools` | about 89 | import profile, frozen build |
| Work (an edit on a 2,000-word manuscript) | to be taken from the Windows Go harness | pending |

So on Linux about 28% of a no-work launch is the floor and 72% is imports, and about half the imports are one package the dev interpreter does not load. This does not yet say the same for Windows, where the earlier baseline measured the interpreter at 47 ms and `import piper.voice` at 264 ms in the dev venv.

### Bridge round trip

`play_position` through the real Lua bridge on the fake reaper, host tick 150 ms. **Measured on the Linux container; Windows pending.** This is the **before** state: the answer waits for the host's tick.

| events.log at start (KB) | Round trip p50 (ms) | p95 (ms) | Max (ms) | Command taken p50 (ms) | Answer written p50 (ms) |
| --- | --- | --- | --- | --- | --- |
| 0 | 98 | 163 | 172 | 14 | 15 |
| 1,024 | 97 | 162 | 172 | 14 | 14 |
| 8,192 | 100 | 165 | 208 | 15 | 16 |

- The script takes a command in about 14 ms and writes its answer in the same tick, so the Lua is about 15 ms of the 98. **The other 80 ms or so is the wait for the host's tick**, matching the review's estimate (script tick 16 to 33 ms plus a mean of 75 ms waiting for the 150 ms tick), now measured on the fake.
- The log's length does not move the round trip: 0 and 8 MB differ by 2 ms at p50.

### One host tick against a growing log (Linux, measured; `Dispatch` before the offset read)

| events.log | Time per tick | Allocated per tick |
| --- | --- | --- |
| 0 KB | 6 µs | 952 B |
| 200 KB (about an hour of session) | 45 µs | 213 KB |
| 1 MB | 226 µs | 1.06 MB |
| 8 MB | 1.8 ms | 8.4 MB |

Reading the whole log is cheap on Linux with a warm page cache, because nothing is re-read from disk: at 1 MB (about five hours) it is 0.15% of a 150 ms tick. It is memory churn (the whole file copied and converted to a string every tick) more than time. Windows, with a scanner opening the file, may differ; **pending**.

## What this does and does not show

- The bridge cost is mostly the host's tick, not the script or the log. That is the part [the fast-poll change](https://github.com/countrymanprime/narration-utils/pull/1909) targets.
- The sidecar floor (the hello program) is a quarter of a no-work launch on Linux. Whether the imports can shrink is a separate question; `manuscript_guide.py` imports `providers` (and through it Piper) for every subcommand, and the `setuptools` import above is a candidate, neither tried here.
- Measured: Linux numbers above, from this container. Estimated: nothing in the tables. Pending: every Windows figure, the cold-launch ratio on Windows, and the work share of each Story Bible operation.

## Caveats

- Linux is not the shipping platform. Process creation, file-cache and scanner behaviour all differ on Windows, so the Linux splits are shape, not size.
- The fake `reaper` ticks from a Python thread; real REAPER's defer cadence under load (a big project, rendering) was not measured. The review's 16 to 33 ms is the figure from the [transport timing note](reaper-transport-timing.md).
- The bridge probe's 0.5 ms polling and Go's timer resolution put about 1 ms of noise on the split between "taken" and "written".
- The hello program is a floor for the bootloader, not for PyInstaller's runtime hooks, which also run in a sidecar.
- A GitHub runner is shared hardware: expect run-to-run noise, and the real-time protection state above applies only to that runner.
