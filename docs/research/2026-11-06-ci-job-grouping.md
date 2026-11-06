# CI job grouping: what a pull request holds, and what can wait

**Measured 2026-11-06.** Issue: [#3065](https://github.com/countrymanprime/narration-studio/issues/3065). **Question:** a pull request starts about 29 checks, most of them separate jobs, and the account runs a limited number of hosted jobs at once. How many runner slots does one pull request hold, for how long, and which checks can be grouped into fewer jobs or moved after the merge without weakening a gate?

## Method

- **Per pull request:** `node scripts/ci/ci-load.mjs merged 30`, over the head commits of the last 30 merged pull requests (#2835 to #3063). It reads every workflow run of the commit through the Actions API, keeps the newest run of each workflow and each job's latest attempt, and reports check entries, jobs that held a runner, the most that ran at once (`peakRunning`), the same counted from when each job was queued (`peakDemand`), billed minutes per OS (each job rounded up to a whole minute) and the `CI` wall clock (run created to last job finished).
- **Per job:** the same runs grouped by workflow and job name, with median, p90 and maximum run time.
- **Whole repository:** every run created from 2026-11-05 12:00 UTC (389 runs, 968 jobs that held a runner, 26.4 hours), sampled every 10 seconds for jobs running and jobs queued.
- **Lua harness on 4 CPUs (this container):** `run_lua_tests.py` with and without `--mutations`.

## Findings

### Accounting, checked against real runs

- **A skipped job holds no runner.** GitHub reports it started and finished in the same second, with the job's `runs-on` label. It is a check entry only. A skipped matrix job is one entry with the unexpanded name, for example `quality / go-test (${{ matrix.part }})`.
- **A matrix job is one job per entry** (`ui-visual (shard 1/4)` to `4/4` are four runners).
- **A reusable workflow adds no runner of its own.** `ci.yml`'s `quality` job (`_quality.yml`) shows only the called jobs, prefixed `quality / `.
- **The ceiling is not a hard 20 at every moment.** The repository ran 25 jobs at once at 2026-11-06 11:30 UTC (a ready pull request plus `Main health`).

### Per pull request (full tier, 30 of 30)

| Measure | Median | Max |
| --- | --- | --- |
| Check entries (all workflows) | 28 | 32 |
| Jobs that held a runner | 23 | 29 |
| of which Windows | 4 | 5 |
| Most running at once | 13 | 18 |
| Most running or queued at once | 14 | 19 |
| Linux minutes | 129 | 180 |
| Windows minutes | 36 | 56 |
| `CI` wall clock | 26.6 min | 66.4 min |

A pull request that touches only the desktop (#2920, #3044 to #3047) holds 7 to 9 slots; one that reaches the UI holds 12 to 18. The fan-out is the moment `quality / scope` finishes: every quality job, every shard and `Build (Windows)` start in the same minute.

### Per job (pull-request runs of those commits)

| Job | Runner | Median min | p90 min | Note |
| --- | --- | --- | --- | --- |
| `quality / ui-visual (shard i/4)` | Linux | 17.7 | 25.0 | the critical path; `setup-playwright` alone 1 to 9 min |
| `quality / ui-atlas (shard i/2)` | Linux | 10.2 | 12.3 | |
| `quality / js-test (shard i/3)` | Linux | 5.5 | 7.2 | |
| `quality / js-test` | Linux | 0.5 | 0.6 | merges three blobs, runs no test |
| `quality / js-static` | Linux | 1.6 | 2.3 | |
| `quality / quick-ubuntu` | Linux | 1.5 | 4.4 | |
| `quality / rename rehearsal` | Linux | 3.4 | 4.4 | |
| `quality / scope` | Linux | 0.6 | 0.8 | |
| `ui-dist / build` | Linux | 0.7 | 0.8 | |
| `CI passed` | Linux | 0.4 | 0.6 | |
| `quality / quick-windows` | Windows | 14.1 | 19.4 | 15.6 of 20.2 min on run 41966422733 was the Lua harness's mutation checks |
| `quality / go-test (rest)` | Windows | 14.9 | 15.9 | |
| `quality / go-test (root)` | Windows | 11.0 | 12.8 | |
| `Build (Windows)` | Windows | 4.8 | 5.4 | |
| `Security scan / govulncheck` | Windows | 2.1 | 2.3 | never fails a run (SARIF and a `continue-on-error` print) |
| `CodeQL / Analyze (go)` | Linux | 3.7 | 4.8 | |
| `CodeQL / Analyze (javascript-typescript)` | Linux | 2.0 | 2.4 | |
| `Docs checks`, `PR risk`, `Test ratchet`, `label`, `CodeQL scope`, `Pages / build` | Linux | 0.1 to 0.8 | | |

The Lua harness: 1057 tests in 12 s without `--mutations`, 577 mutation checks in 203 s more (4 CPUs, Linux).

### Whole repository, 26.4 hours

- Some job was queued 3.1% of the time. Queue time per job: p50 0 min, p90 0.7, p99 4.6, max 7.0.
- 3361 Linux and 1172 Windows minutes. Pull-request `CI` 3012 of them, scheduled `Main health` 859.
- `Main health` was red in 7 of its last 9 runs (`rename rehearsal --full`, `quick-ubuntu`), and cancelled jobs used 915 minutes.
- The cancellations at the 30-minute limit (three `ui-visual (shard 2/3)`, one `ui-atlas`, one `CodeQL / Analyze (go)`) count from the job's start, so queueing did not cause them: a slow `setup-playwright` and long shards did. The 41-minute cancellations in `Main health` are runs that a newer run replaced.

## Design

### Pull-request tier

Grouped by shared setup (one toolchain install per job) and by runner OS. A job that runs several checks runs each as its own step with `if: ${{ !cancelled() }}`, so a red step fails the job without hiding the others, and ends with a summary step (`scripts/ci/step-summary.mjs`) that reports each check.

| Job | Runner | Holds | Replaces |
| --- | --- | --- | --- |
| `quality / scope` | Linux | which families the change reaches | unchanged |
| `quality / linux-checks` | Linux | the UI and site static checks and Knip, repo scripts, docs site, Python, the Lua harness with mutations, the rename rehearsal, the UI bundle | `js-static`, `quick-ubuntu`, `rename rehearsal`, `ui-dist / build` |
| `quality / ui-unit (shard i/3)` | Linux | a third of the Vitest run, then (full tier) a third of the atlas | `js-test (shard i/3)`, `ui-atlas (shard i/2)` |
| `quality / ui-visual (shard i/4)` | Linux | unchanged | |
| `quality / go-test (root)` | Windows | the root package's tests, then Go lint | `go-test (root)`, the Go lint half of `quick-windows` |
| `quality / go-test (rest)` | Windows | the other packages, `test-schedules`, the Lua harness without mutations | `go-test (rest)`, the Lua half of `quick-windows` |
| `Build (Windows)` | Windows | starts when `linux-checks` has built the UI bundle | unchanged name |
| `CI passed` / `CI light passed` | Linux | the verdict over the jobs, the Vitest coverage merge, and (full tier) the visual whole-run check | `js-test` |

Expected, for a pull request that reaches everything: 10 jobs at the fan-out instead of 16, 14 `CI` check entries instead of 20, the light tier 6 jobs instead of 10, and the same critical path (a visual shard). `ui-unit` runs about 5 + 6 minutes of tests behind its setup, under the visual shard's 17 to 23.

### Moved after the merge

| Check | Pull request keeps | After the merge | Safety net |
| --- | --- | --- | --- |
| The Lua mutation checks on Windows | the harness on Windows without mutations (path and CRLF behaviour), the full harness with mutations on Linux | `post-merge.yml` on each push to `main` (one Windows job; a burst of merges is one run), and every `Main health` run | A red run on the `main` commit within about 20 minutes of the merge; `Main health` ticks `HOLD` within 3 hours; the coordinator fixes forward or reverts the merge that turned it red |
| `govulncheck` on a pull request that does not change `go.mod`, `go.sum` or `scripts/toolchain.json` | `govulncheck` when those change; dependency review on every dependency change | `security.yml` on each push to `main` that touches the module, and daily | The finding is a Code scanning alert on `main` within minutes of the merge. The pull-request run never failed: its findings were advisory there too |

No other check moves. `CodeQL` stays on the pull request: it is what shows a new alert on the pull request, and its jobs end in the first five minutes.

### Required checks

The `Pull Request` ruleset (id 23521923) requires no status check on 2026-11-06 (`gh api repos/countrymanprime/narration-studio/rules/branches/main`), so no ruleset edit is needed. `CI passed` keeps its name and meaning. Check names that go: `quality / js-static`, `quality / js-test (shard i/3)`, `quality / js-test`, `quality / ui-atlas (shard i/2)`, `quality / quick-ubuntu`, `quality / quick-windows`, `quality / rename rehearsal`, `ui-dist / build`. New: `quality / linux-checks`, `quality / ui-unit (shard i/3)`.

`scripts/ci/check-manifest.json` maps every check that ran on 2026-11-06 to the job and step that run it, and `scripts/ci/check-manifest.test.mjs` fails when one is lost or moved off the pull request without a safety net.

## After

Measured 2026-11-06 with `ci-load.mjs` and the Actions API, `ci.yml` only (the other workflows do not change), every project affected:

| Run | Tier | Jobs that held a runner | Most running at once | Linux / Windows min | Note |
| --- | --- | --- | --- | --- | --- |
| [42236631709](https://github.com/countrymanprime/narration-studio/actions/runs/42236631709), before (#3074) | full | 20 (4 Windows) | 16 | 136 / 52 | first job start to last job end 28.7 min, longest queue 1.7 min |
| [42238010497](https://github.com/countrymanprime/narration-studio/actions/runs/42238010497), after (manual run, #3079 plus a deliberate failing step) | full | 13 (3 Windows) | 10 | 132 / 51 | a manual run is not a pull request: the rename rehearsal ran `--full` (linux-checks 16 min) and the Windows mutation checks ran (905 s), so it costs more than a pull request would. Jobs queued up to 16.3 min behind other pull requests, so its 41.9 min wall clock measures the queue, not the shape |
| [42155413333](https://github.com/countrymanprime/narration-studio/actions/runs/42155413333), before | light (draft) | 12 | 8 | 55 / 32 | first start to last end 31.9 min |
| [42241288606](https://github.com/countrymanprime/narration-studio/actions/runs/42241288606), after (#3079) | light (draft) | 8 | 6 | 29 / 22 | both `go-test` jobs were cancelled at about 10 min by a newer push, so the Windows minutes are low |

In the after run, by job: the visual shards took 14.2 to 18.2 min, `ui-unit` 8.1 to 16.4 (with the atlas), `go-test (root)` 13.4, `linux-checks` 16.4 with the `--full` rehearsal (6.9 to 9.1 min on the light pull-request runs of #3079), `Build (Windows)` 4.8, starting when `linux-checks` ended. On a pull request the visual shards remain the critical path.

Pending: the pull-request full-tier wall clock and minutes. A ready pull request on the new jobs measures them, after the regroup merges or when #3079 is marked ready.
