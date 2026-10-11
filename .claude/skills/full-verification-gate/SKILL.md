---
name: full-verification-gate
description: The one gate that must pass before any feature or fix is called done — full pnpm check, Playwright visual suite when apps/ui changed, and the bridge harness plus a recorded in-REAPER check when integrations/reaper (Lua) changed.
---

# full-verification-gate

## Why this exists

`pnpm check` runs the full monorepo gate (UI lint/format/test/build, Python ruff+pytest, Go vet/test/golangci-lint, the Knip dead-code check, the coverage ratchet on the logic directories, Lua format check) — but `pnpm check:fast` only checks staged files, and it's easy for an agent or a rushed commit to run the fast version, see green, and call it done while a full-suite regression sits untouched elsewhere. This skill is the checkpoint that stops "looked fine locally" from becoming "broke something unrelated."

## When to use this

Before reporting any feature, bugfix, or refactor as complete — always, not just for large changes. Run it again after any fix made in response to its own findings.

## In an agent-train worker stream

A worker started from the [worker template](../../../docs/operations/agent-train.md#worker-template) runs the targeted set, not the full runs in the steps below (owner rules D43 and D44): Go tests of the changed packages plus `go vet`, the Lua harness for Lua, Vitest of the changed UI, pytest of the changed sidecars, lint and typecheck of the touched projects, and the visual states of the pages it changed, looking at every viewport's PNG. It does not run the full `pnpm check`, the full visual suite, the atlas (a primitive's own atlas story is fine) or `aria`: the final sweep runs those once. The PR body lists the checks run and says the full gate is deferred to the sweep. Everything else here still holds: a red targeted check is not done, and a manual step that is outstanding is named as pending. A session that is not a worker stream runs the full gate.

## What to do

1. Run the full gate, not the staged one:

   ```bash
   pnpm check
   ```

   Do not substitute `pnpm check:fast` or a hand-picked subset unless the change is trivially scoped (e.g. a single doc file) — if you scope it down, say explicitly why and what you skipped.
2. If `apps/ui` visual/layout code changed: first run `visual-catalog-sync` if the change added, removed, or visibly changed a page/state, so `state-catalog.ts` and its drivers describe current reality. Then follow the visual bug fix verification rule in [CLAUDE.md](../../../CLAUDE.md): run the Playwright visual suite for the affected page/state across every viewport in `apps/ui/tests/visual/viewports.ts`, and actually open the generated PNGs — not just the one viewport eyeballed live.
   Also run `pnpm --dir apps/ui atlas` when a primitive or `styles.css` changed, and `pnpm --dir apps/ui run aria` when a dialog, slide-over or the navigation changed (read the snapshot diff before updating it).
3. If `integrations/reaper` Lua changed: `pnpm check` runs StyLua and the bridge harness (a fake `reaper` driven through the file protocol, plus mutation checks; [ADR 0066](../../../docs/adr/0066-the-lua-bridge-is-tested-by-a-harness-under-lua-5-4-and-reaper-api-behaviour-is-checked-in-reaper.md)). Every new or changed command needs a harness test first. The fake cannot prove REAPER's own API behaviour, so verify that inside REAPER, scripted on a copy of a project with an isolated `-cfgfile`, and record it. Mark anything that needs the owner or audio hardware as pending. Do not let a green `pnpm check` imply REAPER behaviour is safe.
   If the PR adds types, interfaces, packages or dependencies, confirm its body has a clean Design check or a **Design waivers** table from `solid-design-review`. This is a presence check, not a judgement.
4. If `change-impact-scan` was run earlier for this change, compare failures against its findings: a failure in a consumer that scan already flagged as zero-coverage is new information, not noise — surface it. A pre-existing flaky failure unrelated to the touched files can be named as such, but don't wave away a failure just because it's inconvenient.
5. Do not report the work as complete while `pnpm check` is red or a required manual-verification step is outstanding. If a failure can't be fixed immediately, say so plainly and name the failing check — don't silently narrow scope to make the gate pass.

## What this skill is not

It's not a substitute for `change-impact-scan` (that's the "who else is affected" step, done before implementation) or `feature-cleanup` (the "leave no mess" step, done after this gate passes).
