# Test speed plan: a pull request pipeline of 15 minutes

**Measured 2026-11-21.** Issue: [#3860](https://github.com/countrymanprime/narration-studio/issues/3860). **Question:** a ready pull request waits 37 to 52 minutes for `CI passed`. Where does the time go, which tests are slow for reasons that can be fixed, and which checks belong on a pull request, on `main` after the merge, and before a release, so that a pull request finishes in 15 minutes with about 10 minutes of tests and every check still runs and still blocks?

The owner's targets, from #3860 (2026-11-21): the pipeline takes at most 15 minutes; unit tests run on the pull request, are individually quick (under 200 ms) and finish in under 10 minutes; integration, functional and visual-matrix tests run on a schedule and before a release; the six `Test (Linux)` shards stay six or fewer.

## Method

- **CI jobs and steps:** the Actions API (`jobs` of a run, with each step's start and end, 1 s resolution) for three full-tier runs of `ci.yml` on 2026-11-21: [44851856380](https://github.com/countrymanprime/narration-studio/actions/runs/44851856380) (A, a UI pull request), [44849055588](https://github.com/countrymanprime/narration-studio/actions/runs/44849055588) (E, a Go and UI pull request) and [44850764231](https://github.com/countrymanprime/narration-studio/actions/runs/44850764231) (M, `Main health` on `main`); three draft-tier runs (44851557370, 44849818477, 44849352790); and one Go pull request of 2026-11-20 (44809367858). Job logs and the `ui-visual-timings` artifacts are served from a host this environment's network policy refuses, so no per-test time comes from CI.
- **Per test, locally** (a 4-CPU Linux container, commit `00f0261`): the whole Vitest run with `--reporter=json`; the Go module with `go test -json -count=1 ./...` (no race detector); 99 tests of the visual state matrix (`app.spec.ts`, the `pickups`, `schedule` and `delivery` rows) with and without trace recording; the Storybook build and the mock build.
- **The visual suite by kind:** `playwright test tests/visual --list` (3,227 tests) priced with the per-test means in `src/studio/ui/tests/visual/shard-weights.json` (15 CI reports), through `planTests` of `scripts/ci/visual-shards.mjs`.
- **Fixed waits:** `grep` for `time.Sleep(` in `*_test.go` and `waitForTimeout(` under `src/studio/ui/tests`.

Local times rank tests against each other. They are not CI times: the Windows runners run the Go tests under the race detector, and the Vitest shards also collect coverage.

## Findings

### A full-tier run

| Run | Wall clock | Runner minutes | Linux shards | Windows tests | Longest queue wait |
| --- | --- | --- | --- | --- | --- |
| A (UI) | 37 min 11 s | 149 | 137 | did not run | 319 s (shard 2) |
| E (Go and UI) | 52 min 20 s | 208 | 159 | 34 | 1,088 s (`CI passed`) |
| M (`main`) | 50 min 42 s | 193 | 138 | 40 | 1,006 s (shard 1) |

The critical path is `lint` (142 to 193 s; every other job waits for it), then the slowest `Test (Linux i/6)` shard (1,764 to 1,797 s), then `CI passed` (45 to 53 s). The rest of the wall clock is waiting for a runner: in E every shard had finished 18 minutes before `CI passed` got one.

| Job | Median | Range | Runs |
| --- | --- | --- | --- |
| `lint` | 165 s | 72 to 193 | 7 |
| `Test (Linux i/6)`, full tier | 1,451 s | 988 to 1,797 | 18 shard jobs |
| `Test (Linux i/6)`, draft tier | 250 s | 165 to 344 | 18 shard jobs |
| `Test (Linux quick)` | 355 s | 259 to 439 | 6 |
| `Test (Windows 1/2)` | 817 s | 687 to 922 | 4 |
| `Test (Windows 2/2)` | 1,094 s | 840 to 1,727 | 4 |
| `Build (Windows)` | 255 s | 201 to 310 | 4 |
| `CI passed` | 47 s | 9 to 53 | 7 |

### Steps

Seconds per job; the Linux shard rows are over the 18 full-tier shard jobs of A, E and M.

| Job | Step | Median | Range | Share of the job |
| --- | --- | --- | --- | --- |
| Linux shard | `visual` | 944 | 538 to 1,220 | 66% |
| Linux shard | `vitest` | 210 | 140 to 284 | 15% |
| Linux shard | `atlas` | 182 | 121 to 305 | 13% |
| Linux shard | checkout, toolchain, Playwright setup, split | 57 | | 4% |
| Linux shard | `aria` (one shard) | 71 | 70 to 73 | |
| Linux shard | `atlas docs` (shard 1) | 26 | 22 to 32 | |
| Windows 1/2 | `go test (root)` | 620 | 529 to 710 | 76% |
| Windows 1/2 | `go lint` | 84 | 63 to 92 | 10% |
| Windows 1/2 | checkout and toolchain | 108 | | 13% |
| Windows 2/2 | `go test (rest)` | 665 | 499 to 791 | 61% |
| Windows 2/2 | `go test-schedules` | 157 | 119 to 181 | 14% |
| Windows 2/2 | `reaper (Lua)` | 2.5 | 2 to 3 on a pull request; 1,024 on `main` with the mutation checks | |
| Linux quick | `rename rehearsal` | 190 | 124 to 222 | 54% |
| Linux quick | checkout and toolchain | 83 | | 23% |
| Linux quick | `repo-scripts`, `docs-site`, `python`, `reaper (Lua)` | 14, 24, 2, 1 | | |
| `lint` | `ui static` | 85 | 58 to 89 | 52% |
| `lint` | toolchain | 29 | 23 to 30 | 18% |
| `lint` | `web static`, UI bundle | 24, 16 | | |

Setup is not the problem: 4% of a full Linux shard. Summed over a run, `visual` takes 90 to 104 runner minutes, `vitest` 20 to 25 and `atlas` 18 to 22.

### The visual suite: 3,227 browser tests

Every test opens a fresh browser context, loads the mock-backed production build and drives the page. Priced with the committed weights, the suite is 20,114 s of test time, which four parallel tests per runner turn into the measured 5,400 to 6,250 s of `visual` steps.

| Kind | Tests | Estimated test time | Share |
| --- | --- | --- | --- |
| State matrix (`app.spec.ts`: every catalogued page and state at every viewport, with the overflow, layout and axe checks) | 1,207 | 9,111 s | 45% |
| Behaviour specs (137 files of interaction tests on the real page) | 1,391 | 6,895 s | 34% |
| Overlay guard (`helpers/overlayGuardFor.ts`: every overlay at every guard size) | 629 | 4,108 s | 20% |

The Booth's behaviour specs are 3,042 s of the 6,895. The costliest single tests in the weights: `booth / record-connect-closed` 57.6 s, `booth / record-connect` 55.5 s, the 100,000-word chapter in `booth-matrix.spec.ts` 44.3 s, `booth / record-turned-away` 39.3 s; 216 test groups average over 10 s and 31 over 20 s. The cause of the 55 s Booth rows was not investigated.

**Trace recording costs 19%.** `playwright.config.ts` sets `trace: 'retain-on-failure'`, which records every test and keeps the trace of a failing one. The same 99 tests took 534 s of test time with it and 431 s with `--trace off` (142 s and 116 s wall clock).

**Fixed waits are small.** 248 `waitForTimeout` calls, 290 s when each runs once, in about 20,000 s; `booth-listening-owner.spec.ts` and `booth-leave-recording.spec.ts` hold 24 each.

### The atlas

`pnpm atlas` builds Storybook in every shard (36 s locally, six times a run), then draws 1,262 stories in two themes at two widths (5,048 captures) with their `play()` interactions and axe. `src/stories.test.tsx` already renders the same 1,262 stories, with `play()`, in jsdom in the Vitest run (35.9 s locally).

### Vitest: 15,561 tests in 984 files

903 s wall clock locally on 4 CPUs, 1,600 s of it inside tests. The median test takes 10 ms. 2,043 tests take over 200 ms and hold 1,188 of the 1,600 s; 239 take over 1 s and hold 496 s; 16 take over 5 s.

- **A fresh jsdom per file.** On `src/components/primitives` (88 files, 1,094 tests) Vitest reports tests 45%, environment 37%, setup 8%, import 8%, and "at least 17 s faster with isolate: false". The same folder took 44.1 s isolated and 18.3 s with `--pool=threads --no-isolate`, with 2 tests failing on state another file left behind.
- **The slowest files** (local seconds, tests): `App.test.tsx` 130 (240), `BoothNextPage.stopFails.test.tsx` 92 (20), `BoothNextPage.test.tsx` 72 (258), `BoothNextPage.listeningOwner.test.tsx` 47 (94), `ChapterLinksTable.test.tsx` 41 (39), `stories.test.tsx` 36 (1,263), `SettingsPage.test.tsx` 29 (90), `BoothNextPage.hugeChapter.test.tsx` 29 (3).
- **The slowest tests** wait in real time for a limit to pass: "survives 40 held arrow keys" 20.6 s, "linking the project file from one page" 11.0 s, four `stopFails` tests of 6.7 to 10.8 s, "tells the narrator when a read never answers" 10.6 s, "stopping and waiting answers once the host says the session has stopped" 9.0 s.

### Go: 6,688 tests in 138 packages

197 s wall clock locally without the race detector, against 529 to 710 s (`root`) and 499 to 791 s (`rest`) on the Windows runners with it. The median test takes under 10 ms; 310 take over 200 ms and hold 315 of the 389 test seconds.

- **Four tests of `internal/bridge` wait out the real answer limits: 110 s.** `TestReadTracksThatNeverAnswersIsErrNoAnswer` 50.0 s, and `TestACommandReadBeforeTheFolderVanishedIsStillTaken`, `TestACommandFolderThatVanishesIsNotREAPERReadingTheCommand` and `TestACommandREAPERReadButAnsweredLateIsTaken` 20 s each. The package takes 138.6 s; the root package 134.3 s.
- **Tests that start a real program:** `TestPronounceMatchesTheSidecar`, `TestBuildMatchesTheSidecar` and `TestPronounceWritesWindowsLineEnds` in `internal/guide` (4.6 to 5.4 s each, the Python sidecar), `TestTheStampedVersionIsWhatTheProgramReports` (5.0 s, builds the program), `TestTheRealSidecarReadsTheHostsManifestAndCachedWords` (2.5 s).
- **Long by design:** `TestTheSlowReadsStayInsideTheirBudgetsOnA44ChapterBook` 13.6 s, `TestEveryPlacementGivesThePinnedLocateOrWordTime` 7.2 s, `TestBindingsSurviveProjectSwitchesUnderLoad` 4.1 s.
- **Fixed sleeps:** 235 `time.Sleep` calls in test files, 68 of them 20 ms; `tracks_cache_test.go` holds 16.
- **`go test-schedules`** repeats the teleprompter and shutdown tests five times on one and on four CPUs (119 to 181 s). The same tests run once in `go test (root)` and `go test (rest)`.

### The other suites

Python 2 s, the Lua harness 1 s (its mutation checks already run on `main` only), the Node script tests 14 s, the docs-site tests 24 s. The rename rehearsal (124 to 222 s) renames a throwaway copy of the repository and runs the tests that read the name; `scripts/ci/brand-name.mjs` and `old-name.mjs`, the guards that fail on a spelled name, also run in `repo-scripts`.

## Tiers

| Tier | Runs on | Holds | Gates |
| --- | --- | --- | --- |
| **Pull request** | every push to a pull request | lint and typecheck; every unit test (Vitest, Go, Python, Lua, Node); the UI bundle and `Build (Windows)`; the visual state matrix with its whole-run checks and `aria`; the behaviour specs, overlay guard rows and stories of what the change touches | the merge: `CI passed` |
| **Main** | every push to `main`, and every three hours when `main` has a commit not yet judged (`main-health.yml`) | everything in the pull request tier with nothing narrowed: all 3,227 visual tests, the whole atlas, `go test-schedules`, the Lua mutation checks, the rename rehearsal `--full`, the strict coverage floors | the next merge and the next launch: a red run ticks `HOLD` on every open train issue (today) and opens a blocking issue (pull request 2) |
| **Release** | promoting a release candidate (`promote-release.yml`) | a green `Main health` run on the candidate's commit (pull request 2; `promote-release.yml` checks today that the tag is a pre-release and an ancestor of `main`). `windows-release-checks.yml` is a manual run that gates nothing, and the owner's release checklist is a person's step | the stable release |

The draft tier (`CI light passed`) stays as it is: the pull request tier without Playwright and without the Windows build.

**The state matrix stays on the pull request**, where #3860 names the visual matrix for the schedule. It is the one browser check that draws every page, so it is what catches a shared-code change on a page the change did not name, and the whole-run checks read its records. At 5.1 minutes a shard it fits the budget. If the pipeline still passes 15 minutes after pull request 10, narrowing the matrix to touched pages is the next move, and it is listed here so that it is a decision and not a surprise.

**One `main` run can judge several merges.** `main-health.yml` runs one at a time and keeps at most one run waiting, so a burst of merges is judged by a run on the newest commit. "Every push to `main`" below means every commit on `main` is inside a judged run, not that each has a run of its own; the blocking issue lists the commits since the last green run for that reason.

"What the change touches" is decided from the changed files, on the pull request, by the script that already splits the suite (`scripts/ci/visual-shards.mjs split`):

- a file under `src/studio/ui/src/components/<page>/` selects the behaviour specs and overlay guard rows of that page (`booth-*.spec.ts` for `booth`);
- a changed spec, helper or catalog file under `tests/visual/` selects itself;
- a changed story or component selects its stories in the atlas;
- a change to the suite's own machinery (`tests/visual/lib/`, `playwright*.config.ts`, the split script, the workflows) selects everything, as a workflow change does today.

A change to shared UI code (`primitives/`, `styles.css`, `App.tsx`, `api/`) runs the whole state matrix on the pull request, which draws every page that uses it, and the behaviour specs of the other pages on `main`.

### How a red main run blocks

`main-health.yml` runs the full tier on every push to `main` and ticks `HOLD` on each open train issue when it fails (`scripts/ci/train-health.mjs hold`). Two additions make it a gate a person cannot miss:

1. **A blocking issue.** The failing run opens an issue labelled `main-red` (or comments on the open one) naming the failed jobs, the run and the commits merged since the last green run. The first green run closes it. While it is open, the merge procedure treats `main` as closed to everything except the fix or the revert.
2. **A release gate.** `promote-release.yml` refuses a candidate whose commit has no successful `Main health` run.

Both are to add (pull request 2); `HOLD` exists.

`scripts/ci/check-manifest.json` records each moved check with `tier: post-merge` and its `safety_net`; `check-manifest.test.mjs` fails when a check leaves the pull request without one.

### What each move keeps and what it risks

Made under the owner's words of 2026-11-21 on #3860 ("i want reasonable setup ... i just don't want to stop things or block CI for 40+ min"), listed for review. Each pull request that makes a move repeats its row.

| Move | The pull request keeps | Runs in full | The risk taken |
| --- | --- | --- | --- |
| M1. Behaviour specs of pages the change does not touch (up to 1,391 tests, 34% of `visual`) | the state matrix of every page; the specs of touched pages; changed specs | every push to `main` | a shared-code change breaks an interaction on another page and is found one run after the merge |
| M2. Overlay guard rows of pages the change does not touch (up to 629 tests, 20%) | the rows of touched pages; all rows when `primitives/` overlay code changes | every push to `main` | as M1 |
| M3. Atlas captures of stories the change does not touch (up to 5,048 captures, 18 to 22 runner minutes) | touched stories in both themes and widths; `atlas docs`; every story's jsdom render and `play()` in `stories.test.tsx` | every push to `main` | a token or primitive change shifts an untouched story's axe or overflow result and is found one run after the merge |
| M4. `go test-schedules` (119 to 181 s) | the same tests, once, in `go test` | every push to `main` | an ordering bug that shows only on one CPU or on repetition is found one run after the merge |
| M5. The rename rehearsal (124 to 222 s) | the two name guards in `repo-scripts` | every push to `main`, `--full` | a test that spells the name in a way the guards miss is found one run after the merge |
| M6. Only if the Windows shards still pass 10 minutes after the Go fixes: the race detector on packages the change does not touch | the race detector on changed packages; every test without it | every push to `main` | a race in an untouched package is found one run after the merge |

Staying on the pull request with nothing narrowed: lint, typecheck, Knip, every Vitest, Go, Python, Lua and Node test, the coverage merge, the state matrix, the whole-run checks, `aria`, `atlas docs`, the UI bundle and `Build (Windows)`.

## Avoidable slow tests

| Where | What | Cost | Fix |
| --- | --- | --- | --- |
| `playwright.config.ts` | every test records a trace | 19% of `visual` | record no trace on the first pass; on a red step, run the failed tests again with `--last-failed --trace on` and upload those |
| `pnpm atlas` | Storybook is built in each of six shards | 36 s x 6 | build it once in `lint` beside the UI bundle and download it |
| `internal/bridge` | four tests wait 20 to 50 s for the real answer limits | 110 s | give the test's session short limits; the product limits stay as they are |
| Vitest | a fresh jsdom per file | 37% of a folder's run | `isolate: false` per folder, after fixing the tests that leak state (2 of 1,094 in `primitives`) |
| Vitest | `BoothNextPage.stopFails`, `useBoothVoices`, `useTeleprompterSession.coldRead`, `crossPage.dawLink` wait out 5 to 10 s limits in real time | about 120 s | fake timers, which 104 test files already use |
| Vitest | `BoothNextPage.hugeChapter` holds 40 arrow keys over 1,000 paragraphs | 20.6 s | not investigated |
| Vitest | `App.test.tsx` mounts the whole app for each of 240 tests | 130 s | not investigated; the file is the largest single cost |
| Visual | `booth / record-connect` and `record-connect-closed` | 55 to 58 s each | not investigated |
| Visual | 248 fixed `waitForTimeout` calls | 290 s | wait for the state the test asserts |
| Go | 235 `time.Sleep` calls in tests | not measured | a signal or an injected clock where the sleep waits for a goroutine |

## Expected result

Estimates from the measurements above, to be replaced by measurement as each pull request lands.

| Job | Today (median) | After | From |
| --- | --- | --- | --- |
| `Test (Linux i/6)`, change to shared UI code | 24 min | about 10 min | setup 1, `vitest` 3.5, state matrix 9,111 s x 0.81 over 6 shards of 4 = 5.1, touched stories and specs |
| `Test (Linux i/6)`, change inside one page | 24 min | under 8 min | the matrix as above, that page's specs |
| `Test (Windows 2/2)` | 18 min | about 11 min | minus `go test-schedules` (2.6) and the bridge waits |
| `Test (Windows 1/2)` | 14 min | about 11 min | the root package's tests shared between the two shards |
| Runner minutes, full UI run | 149 | about 75 | fewer minutes also shorten the queue waits |

With `lint` (3 min) before and `CI passed` (1 min) after, a shared-UI pull request reaches about 14 minutes when no job queues. The Windows shards are the tightest; M6 is the lever if they stay over.

**The queue is the gap in this plan.** The three full runs waited 319 to 1,088 s for a runner at their worst job, and no change here removes a wait outright. Two things shorten it: a full run asks for about half the runner minutes, and pull request 10 lowers the shard count, so two pull requests fit where one does on 2026-11-21. Pull request 10 measures wall clock with the queue included over five runs. If the median still passes 15 minutes, the remaining choices are the owner's: more concurrent runners on the account, or starting the test jobs beside `lint` instead of after it (about 3 minutes, and a change to the owner's decision on #3065).

## Pull requests, in order

Each is one small change with its own measurement in the body; the workflow changes go one at a time.

1. **Visual: no trace on the first pass, failed tests re-run with a trace.** 19% of `visual`, nothing moved. The second run only records: the first pass alone decides the step, so a test that passes the second time is still red.
2. **Main health: a red run opens a blocking `main-red` issue; `promote-release.yml` requires a green run on the candidate.** The safety net, before any move.
3. **Visual scope on a pull request (M1, M2):** `visual-shards.mjs split --changed`, the manifest rows, the whole-run check proven to judge the same records. The largest win: up to 54% of `visual`.
4. **Atlas scope on a pull request (M3)** and one Storybook build per run.
5. **Go: the bridge tests take their limits as parameters** (110 s), then the largest sleeps.
6. **Go: `go test-schedules` to `main` (M4); the root package's tests shared between the two Windows shards.**
7. **Vitest: the real-time waits to fake timers; `App.test.tsx` and `BoothNextPage.hugeChapter` investigated; `isolate: false` folder by folder.** A folder shares a jsdom only once its tests pass in shuffled order, and the `main` tier keeps running the isolated configuration, so a test that passes only in one of the two turns `main` red.
8. **A slow-test list that only shrinks.** The owner's 200 ms is the budget for a unit test. On 2026-11-21 2,043 Vitest tests and 310 Go tests are over it, so a hard limit would fail every run. The Vitest and Go steps report every test over 200 ms; a committed list holds the ones allowed to be, a new test over the budget fails the step, and the list loses entries as pull requests 5 and 7 and later work fix them.
9. **Rename rehearsal to `main` (M5).**
10. **Re-measure five full runs; rebuild `shard-weights.json`; lower the shard count to what a 10-minute shard needs; M6 only if the Windows shards need it.**

## State matrix

Where each check runs. "touched" is the scope rule above.

| Check | Draft pull request | Ready pull request today | Ready pull request after | Push to `main` | Before a release |
| --- | --- | --- | --- | --- | --- |
| lint, typecheck, Knip | yes | yes | yes | yes | through `Main health` |
| Vitest, coverage merge | yes | yes | yes | yes, strict floors | through `Main health` |
| Go tests, race detector | yes | yes | yes (M6: touched packages) | yes | through `Main health` |
| `go test-schedules` | yes | yes | M4: `main` | yes | through `Main health` |
| Python, Lua, Node tests | yes | yes | yes | yes, with Lua mutation checks | through `Main health` |
| Rename rehearsal | yes | yes | M5: `main` | yes, `--full` | through `Main health` |
| Visual state matrix, whole-run checks, `aria` | | yes | yes | yes | through `Main health` |
| Visual behaviour specs | | yes | touched (M1) | yes | through `Main health` |
| Overlay guard | | yes | touched (M2) | yes | through `Main health` |
| Atlas | | yes | touched (M3) | yes | through `Main health` |
| `atlas docs` | | yes | yes | yes | through `Main health` |
| UI bundle, `Build (Windows)` | | yes | yes | yes | `prerelease.yml` builds the candidate |

## Not measured

- Per-test times on the CI runners (the log and artifact host is blocked here); the Go times under the race detector on Windows.
- Why `Main health` failed three times on 2026-11-20 (runs 44774716130, 44810193548, 44831990211). A main tier that is often red for reasons other than a regression blocks more than it should, so pull request 2 reads those runs first.
- Whether any behaviour spec writes capture records that the whole-run check reads; pull request 3 proves it before narrowing.
- The split between context creation, page load and driving inside one visual test.
