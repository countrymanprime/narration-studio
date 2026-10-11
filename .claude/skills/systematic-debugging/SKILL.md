---
name: systematic-debugging
description: A red test, a CI failure, a flaky check or a behaviour that differs between the app, the harness and REAPER? Find the root cause before changing code; reproduce, localise to a layer, form one hypothesis at a time, and pin the fix with a failing test first.
---

# systematic-debugging

## Why this exists

A fix applied before the cause is known hides the bug: a retry, a longer wait, a loosened assertion, a `sameAs` escape. This repo's gates (no retries in the visual suite, the Go test schedules, the bridge mutation check) are built to fail those. A failure here can sit in any of five layers: the Go host, the Wails bindings, the React UI, the Python sidecars or the Lua bridge in REAPER.

## When to use this

Any failure you do not yet understand: a failing `pnpm check`, a red CI job, a test that passes alone and fails in the suite, a result that differs between the fake `reaper` and real REAPER, a visual diff nobody asked for. Skip it for a failure whose cause is obvious from the message (a typo, a missing import).

## What to do

1. **Read the whole failure.** The first error is usually the cause; later ones are fallout. For CI: `gh run view <id> --log-failed`. A failing visual test leaves `apps/ui/test-results/<test>/trace.zip`; open it with `pnpm exec playwright show-trace` from `apps/ui` ([CI and releases](../../../docs/operations/ci-and-releases.md)).
2. **Reproduce it, smallest first.** Run only the failing test, then the shard or job that failed. Record the exact command and the result. If it does not reproduce, that is the finding: look at what differs (CPU count, OS, order, a stale build, a leftover file) before reading code.
3. **Name the layer.** State which side of each boundary is wrong before editing: the payload crossing it (`wire-contract-change` lists the checks), the Go host, the UI, a sidecar, or the Lua bridge. Compare the golden payload in `tests/fixtures/contracts/` with what was actually sent. Do not change both sides of a boundary to make a test pass.
4. **Check what changed.** `git log` and `git diff` on the failing path, and `git bisect` when the last good commit is known. A failure that appeared with no code change in the area points at the environment, a dependency or a generated file.
5. **One hypothesis, one experiment.** Write the hypothesis down, run the cheapest check that could disprove it, then record the result. Change one thing at a time. Add a log line or an assertion rather than guessing; remove it before you finish.
6. **Use the known patterns for this repo.**
   - `identical screenshots` or `sameAs no longer holds`: a driver in `apps/ui/tests/visual/app.drivers.ts` did not reach the state, or the two states are really duplicates. Fix the driver; do not add `sameAs`/`undriven`/`narrowControls` without a real reason (`visual-catalog-sync`).
   - `Unable to find` or `Test timed out` in a frontend test: the wait does not match the state, or the test is slow. Find what the state is, not a longer timeout.
   - A Go failure that comes and goes with CPU count: an ordering bug between goroutines. Run on one and four CPUs; do not assert wall-clock time (monotonic clock ticks up to 15.6 ms on Windows).
   - Passes against the fake `reaper`, fails in REAPER: the fake is wrong or the Lua differs from the app's version. Fix the fake to match observed REAPER behaviour, with a harness test, and re-run the scripted REAPER check (`reaper-command-add`, [reaper verification pass](../../../docs/operations/reaper-verification-pass.md)).
   - A sidecar result differs from the golden payload: regenerate nothing by hand. Contract goldens come from `UPDATE_CONTRACTS=1` after you know why the shape changed.
7. **Pin the root cause with a failing test first**, at the layer that owns the bug, then fix it (`tdd-guide`). A fix with no test that fails without it is a guess.
8. **Look for the same cause elsewhere.** Search for the pattern in other consumers (`change-impact-scan`). Say in the PR what you checked.
9. **Verify, then stop digging.** Re-run the original failing command, then the full gate (`full-verification-gate`). If three hypotheses in a row are wrong, stop and re-read step 1 and 3 instead of trying a fourth fix.

## What counts as fixed

- The original command passes without a retry, a longer timeout, a skipped test, or a new escape entry (`axe-debt.ts`, `sameAs`, `undriven`).
- A test exists that fails on the old code.
- The cause is stated in the PR in one or two sentences, with the evidence (log line, trace, diff).
- Anything not proved, such as REAPER's own API behaviour or an audio result, is marked pending with its owner.

## What this skill is not

It is not a way to classify a CI run (the list in step 6 only points to the likely layer), and it does not replace `full-verification-gate`. A decision that the debugging exposes as wrong goes to `adr-author`, not into a quiet code change.
