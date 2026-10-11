# 0758. The agent train is watched from outside and gated by checks a worker cannot edit

**Status:** Accepted
**Date:** 2026-10-10

## Context

The agent train ([docs/operations/agent-train.md](../operations/agent-train.md)) builds the planned work without a person watching. On 2026-10-10 a review of it against published practice for long-running agent harnesses found these gaps:

- Issue #509's last activity was 2026-09-29 and its body was last rewritten 2026-09-27. Workers N-F1, N-F2 and N-F3 had reported green pull requests and were waiting for the coordinator to merge them. Nothing told the owner the coordinator had stopped.
- Workers merge on `Build (Windows)` and `ui-dist` (D43). The full `pnpm check`, the visual suite and the atlas run once at the end (D44), so a regression can sit on `main` between sweeps.
- Nothing mechanical stopped a worker from deleting a test, adding a skip or lowering a coverage floor to get a green check.
- The merge conditions had no reviewer other than the worker's own `intent-check` pass, and no route for a change to a trust boundary or to the unattended machinery itself.
- A stream that failed could be relaunched without limit. The worker stops after three red CI rounds, but a new session for the same stream starts the count again.
- `.claude/settings.json` allowed `git push origin:*` with no deny for `main`. The `Main Protection` ruleset blocks deletion and non-fast-forward pushes only.

## Decision

The train is watched from outside and gated by checks that run from the base branch, so the agent being checked cannot edit its own check.

- **Train health** (`train-health.yml`, `scripts/ci/train-health.mjs`) warns on #510 when #509's `Last pass:` line is more than two hours old. The coordinator writes that line last on every pass.
- **Main health** (`main-health.yml`) runs all of `ci.yml` on `main` nightly and ticks `HOLD` on #509 when it fails.
- **Test ratchet** (`test-ratchet.yml`, `scripts/ci/test-ratchet.mjs`) fails a pull request that deletes a test file, adds a skip or focus marker to one, or lowers a coverage floor. Only the owner's `ratchet-approved` label clears it.
- **PR risk** (`pr-risk.yml`, `scripts/ci/pr-risk.mjs`) labels `risk:high` a pull request that touches a trust boundary, the pinned toolchain and lockfiles, or the files in this list. The coordinator does not merge one without the owner.
- **Intent review.** The coordinator starts a fresh session per merge-ready pull request that runs the `intent-reviewer` agent, and merges only on its pass for the current head.
- **Launch limit.** A stream with three launches and no merged pull request is blocked and goes to #510.
- **Permissions.** `.claude/settings.json` denies `git push origin main` and `git push origin HEAD:main`.

The two label-driven checks run the script as it is on the base branch. A pull request that adds the script runs its own copy once.

## Consequences

- A stopped coordinator is noticed within about three hours instead of never. The check needs the coordinator to keep the `Last pass:` line current; a coordinator that edits it without doing the pass would defeat it.
- A red `main` stops new launches within a day. The nightly run costs one full CI run.
- A deliberate test removal or floor change needs the owner's label, so an unattended train cannot make that call itself.
- Every merge costs one extra reviewer session, and `risk:high` pull requests wait for the owner. Both slow the train down on purpose.
- None of the new checks is a required status check, because no ruleset requires one (#544). The coordinator reads them, and a person merging by hand is not stopped by them.
- A later change to any threshold here (two hours, three launches, the risk paths) edits the script or the doc, not this decision. Dropping a check needs a new ADR that supersedes this one.
