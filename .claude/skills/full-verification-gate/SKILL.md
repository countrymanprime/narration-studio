---
name: full-verification-gate
description: What to verify before pushing a feature or fix — the targeted checks for what changed, the visual PNGs when apps/ui changed, the bridge harness plus a recorded in-REAPER check when integrations/reaper (Lua) changed — and that the PR pipeline, not a local pnpm check, is the full gate.
---

# full-verification-gate

## Why this exists

`pnpm check` runs the full monorepo gate (UI lint/format/test/build, Python ruff+pytest, Go vet/test/golangci-lint, the Knip dead-code check, the coverage ratchet on the logic directories, Lua format check). It takes about 15 minutes, and the pull-request pipeline ([`ci.yml`](../../../.github/workflows/ci.yml), which calls `_quality.yml`) runs the same checks on every push, split into parallel jobs. This skill says what to run yourself and what to leave to the pipeline, so a regression elsewhere in the repo is caught without a session sitting idle for the full run.

## The rule

**`pnpm check` does not gate a push, a PR or the next piece of work.** Run the targeted set for what you changed, push, subscribe to the PR (`subscribe_pr_activity`) and let the pipeline be the full gate. While it runs, start the next piece of work or the `intent-check` pass 2. When a job goes red, fix it and push again. A red pipeline blocks the merge, not the work.

Targeted set, for every session (worker stream or not):

- Go tests of the changed packages plus `go vet`.
- The Lua harness when `integrations/reaper` changed.
- Vitest of the changed UI; lint and typecheck of the touched projects.
- pytest of the changed sidecars.
- The visual states of the pages you changed, looking at every viewport's PNG (below).
- The generators and golden checks a change owes (`UPDATE_CONTRACTS=1` for a wire contract, `adr-topics.mjs --write` for an ADR).

The PR body lists the checks run and says the full gate runs in the pipeline. There is no stop hook that demands a stamp, and no `Gate: skipped` line to write.

## What still holds

1. A red targeted check is not done. Fix it before you push; do not push a failure you can see locally.
2. If `apps/ui` visual/layout code changed: first run `visual-catalog-sync` if the change added, removed, or visibly changed a page/state, so `state-catalog.ts` and its drivers describe current reality. Then follow the visual bug fix verification rule in [.claude/rules/ui-visual-verification.md](../../rules/ui-visual-verification.md): run the Playwright visual suite for the affected page/state across every viewport in `apps/ui/tests/visual/viewports.ts`, and actually open the generated PNGs — not just the one viewport eyeballed live. The full suite, the atlas and `aria` run in the pipeline; run `pnpm --dir apps/ui atlas` yourself only when a primitive's story needs it, and `pnpm --dir apps/ui run aria` when a dialog, slide-over or the navigation changed (read the snapshot diff before updating it).
3. If `integrations/reaper` Lua changed: every new or changed command needs a harness test first ([ADR 0066](../../../docs/adr/0066-the-lua-bridge-is-tested-by-a-harness-under-lua-5-4-and-reaper-api-behaviour-is-checked-in-reaper.md)). The fake cannot prove REAPER's own API behaviour, so verify that inside REAPER, scripted on a copy of a project with an isolated `-cfgfile`, and record it. Mark anything that needs the owner or audio hardware as pending. A green pipeline does not imply REAPER behaviour is safe.
   If the PR adds types, interfaces, packages or dependencies, confirm its body has a clean Design check or a **Design waivers** table from `solid-design-review`. This is a presence check, not a judgement.
4. If `change-impact-scan` was run earlier for this change, compare pipeline failures against its findings: a failure in a consumer that scan already flagged as zero-coverage is new information, not noise — surface it. A failure unrelated to the touched files can be named as such, but don't wave away a failure just because it's inconvenient.
5. Do not call a PR ready for merge while the pipeline is red or a required manual-verification step is outstanding. If a failure can't be fixed immediately, say so plainly and name the failing job.

## When to run `pnpm check` locally

To reproduce a red pipeline job you cannot diagnose from its log, when the owner asks, or for a change so wide that a red pipeline would cost more cycles than 15 minutes. It is never a precondition. `pnpm check:fast` checks staged files only and is not a substitute for the pipeline.

## What this skill is not

It's not a substitute for `change-impact-scan` (that's the "who else is affected" step, done before implementation) or `feature-cleanup` (the "leave no mess" step, done after the targeted checks pass).
