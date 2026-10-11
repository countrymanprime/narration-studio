# Working in this repo

## Feature workflow: plan → impact scan → implement → verify → clean up

New features and bugfixes in this repo have a history of silently breaking unrelated things — this order exists to catch that before it ships, not after. For anything beyond a trivial single-file change:

1. **Plan** the change (`/plan` or the `planner` agent). Find or open the tracking issue first (`gh issue list`) and put `Closes #<n>` in the PR; see `docs/operations/github-workflow.md`. Run **`solid-design-review`** pass 1 on the plan: a Design check table for the types, interfaces and packages it adds or touches. Look up the governing decisions with `decision-index` and check the plan against `design-principles`. State the intent (`intent-check` pass 1).
2. **`change-impact-scan`** — before touching a file shared across tools (`libs/python/narration_common`, `integrations/reaper`, `apps/ui/src` components), find every consumer and its existing test coverage. For `integrations/reaper`, find the bridge harness tests for every command a Lua consumer touches and treat a consumer with none as zero-coverage (`.claude/rules/reaper-bridge.md`).
3. Implement with TDD (`tdd-guide` agent / `tdd-workflow` skill).
4. **`full-verification-gate`** — run `pnpm check` (the full gate, not `check:fast`) before calling anything done. An agent-train worker stream runs the targeted set the worker template names instead, and the final sweep runs the full gate (`full-verification-gate`). Run the Playwright visual suite when `apps/ui` changed (`.claude/rules/ui-visual-verification.md`). Then run `intent-check` pass 2 with the `intent-reviewer` agent in a fresh context. When `integrations/reaper` changed, add a harness test first for every new or changed command, and verify what the fake cannot prove inside REAPER (`.claude/rules/reaper-bridge.md`).
5. **`design-spec-guard`** — if the change touches `apps/ui/src/components/primitives/` or `apps/ui/src/styles.css`, check it doesn't silently contradict a recorded ADR.
6. **`feature-cleanup`** — dead code, stale docs (`doc-impact-check` finds the docs the diff owes; `doc-unslop` cuts filler from what you wrote; both follow `docs-style`, which also holds the doc-comment rules for Go, TypeScript, Python and Lua), scratch artifacts, ADR bookkeeping (`adr-author` if a real decision was made), a trust-boundary check (a download, the update, a sidecar's arguments, the REAPER bridge, a file the app opens, the release pipeline: re-read its row in `docs/architecture/threat-model.md` and update it and `SECURITY.md`; a moved file, binding or event named by a diagram in `docs/architecture/` updates that diagram), design drift (`solid-design-review` pass 2 against the plan's Design check; unmet rows are fixed or listed as **Design waivers** in the PR body), final `git status` review. Re-run `full-verification-gate` after any cleanup edits.

Task-specific skills, used alongside the steps above: `systematic-debugging` (a failure you do not yet understand: a red check, a flaky test, the fake `reaper` and real REAPER disagreeing), `wire-contract-change` (a binding, event, persisted file, sidecar output or REAPER event changes shape), `reaper-command-add` (a bridge command or event), `sidecar-add` (a new sidecar or sidecar mode), `go-package-split` (moving code out of the `apps/desktop` root package or splitting an `internal/*` package).

## Area rules

Rules for one area live in `.claude/rules/` and load when Claude reads or edits a file under the paths in their `paths:` frontmatter. They bind the same work as before; they only stay out of context until the work reaches that area.

| Rule file | Applies to | Holds |
| - | - | - |
| `.claude/rules/ui-spec-and-screenshots.md` | `apps/ui/**`, `docs/research/mockups/**` | Which mocks are the spec; a UI change ships with screenshots of the change |
| `.claude/rules/ui-visual-verification.md` | `apps/ui/**` | Visual bug fixes require screenshot verification; the atlas, axe, aria and visual-suite gate rules |
| `.claude/rules/wire-contracts.md` | `apps/ui/src/api/**`, `apps/desktop/**`, `tests/fixtures/contracts/**`, `sidecars/**`, `integrations/reaper/**` | Wire contracts |
| `.claude/rules/reaper-bridge.md` | `integrations/reaper/**` | The harness and in-REAPER checks for steps 2 and 4 |

A rule loads on a Read, Write or Edit of a matching file, not on a `grep` or a PR description. So two rules stay in force from here for the whole task: a PR that changes what `apps/ui` draws needs a **Screenshots** section (mock, before and after, per changed state), or the owner rejects it; and anything crossing a Wails binding, live event, sidecar output, REAPER event or file the host reads back needs a Zod schema, a golden payload, a `wireContracts.test.ts` row and a passing mock. Read the rule file before writing the PR or the contract.
