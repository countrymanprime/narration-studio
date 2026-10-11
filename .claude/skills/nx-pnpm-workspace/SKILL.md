---
name: nx-pnpm-workspace
description: Adding or changing an Nx project, target or tag, running a subset of the gate, adding or bumping a pnpm dependency, or touching pnpm-workspace.yaml, nx.json, scripts/quality.mjs or the lockfile? How this repo's Nx targets, the quality script, the pnpm supply-chain settings and CI's affected-project scoping fit together, and the commands that run the same thing CI runs.
---

# nx-pnpm-workspace

## Why this exists

One gate (`pnpm check`) runs Go, Python, Lua, TypeScript and docs checks through Nx targets that call a Node script, and CI runs the same targets with a different scope. A new project or target that skips a piece of that wiring passes locally and is silently never run in CI, or the reverse. pnpm 11 also rejects a lockfile entry younger than three days, which an ordinary `pnpm add` can produce.

## When to use this

- A new or changed `project.json` (a project, a target, a tag, `implicitDependencies`).
- Running part of the gate, or working out why CI ran or skipped a project.
- `pnpm add`, `pnpm update`, a Dependabot lockfile conflict, or an edit to `pnpm-workspace.yaml`, `nx.json`, `package.json`, `knip.jsonc` or `scripts/quality.mjs`.
- A new file or folder that no project owns.

## How it fits together

| Piece | What it does |
| --- | --- |
| `pnpm-workspace.yaml` | Only `apps/ui` and `apps/desktop` are pnpm workspaces. Everything else (Python, Lua, Go) is reached through Nx targets. `allowBuilds` names `esbuild` and `nx`. |
| `package.json` | `packageManager` pins pnpm (`pnpm@11.27.0`, equal to `scripts/toolchain.json`). `check` is `node scripts/quality.mjs check`; `check:fast` is `staged`. |
| `project.json` per folder | One Nx project each: `narration-utils` (the root, which also carries `knip` and the release `implicitDependencies`), `narration-utils-ui`, `narration-utils-shell` (`apps/desktop`), `narration-common`, the three sidecars, `reaper`, `config`, `fixtures` (`tests/fixtures`), `docs-site`, `repo-scripts` and two research projects (`character-continuity-acoustic-trial`, `character-continuity-cue-eval`). Targets use `nx:run-commands`. |
| Tags | `toolchain:node`, `toolchain:python`, `toolchain:go`, `toolchain:lua`, `toolchain:docs`, `data`, `root`. CI selects projects with `tag:` selectors. No module-boundary rule is configured. |
| `implicitDependencies` | How Nx knows a change in `config`, `narration-common` or a sidecar affects the Go host or a sidecar. A project missing from the list is not rerun when its input changes. |
| `scripts/quality.mjs` | The one entry point. `python` and `pytest` run the repo's `.venv` interpreter with isolated temp dirs; `go-lint` runs gofmt, vet, golangci-lint, `checklocks` and the doc-comment check; `fix-*`/`check-*` are the lint-staged hooks; `check` is the full gate. |
| `check` (the full gate) | `docs-impact`, `docs-slop`, `docs-references --strict`, then `nx run-many -t lint format architecture knip test test-node build --skip-nx-cache --parallel=1 --nx-bail`, then `gate-stamp record`. |
| `.github/actions/nx-run` + `scripts/ci/nx-scope.sh` | CI runs the same targets, never from the Nx cache. On a pull request it runs only `nx show projects --affected` unless a workspace-wide file changed (the regex in `nx-scope.sh`: `nx.json`, `package.json`, the lockfiles, `pnpm-workspace.yaml`, `pyproject.toml`, `project.json`, `scripts/quality.mjs` and others), the caller passes `always: true`, or the event is not a pull request. |
| `lint-staged.config.mjs`, `.husky/pre-commit` | On commit: ui prettier and eslint, ruff, gofmt and vet, StyLua, `markdownlint-cli2 --fix`. A commit message is checked by commitlint (conventional commits; keep body lines short). |
| `scripts/ci/gate-stamp.mjs` | Records that the full gate passed on the exact working tree. Informational: no hook or CI job reads it, and `pnpm check` is not a precondition for a push (`full-verification-gate`). |

## What to do

1. **Run what CI runs, with the same invocation.** `pnpm check` for the whole gate. For one project: `pnpm exec nx run <project>:<target> --skip-nx-cache`. For what a change affects: `pnpm exec nx show projects --affected --base=origin/main --head=HEAD`. Do not trust a green Nx cache hit as a pass.
2. **A new Nx project** (`sidecar-add` covers the sidecar case): copy a sibling's `project.json`; set `name`, `projectType`, a `toolchain:*` tag and `sourceRoot`; give it `lint` and `test` targets that go through `node scripts/quality.mjs …`, with the test through `scripts/ci/coverage-gate.mjs` where the folder has a floor in `scripts/ci/coverage-floors.json`. Then:
   - Add it to the root `project.json` `implicitDependencies` if a release should count its commits.
   - Add it to `implicitDependencies` of every project that consumes it (`apps/desktop` lists the sidecars, `reaper`, `config` and `fixtures`).
   - Make sure a CI job selects it by name or tag; a project no job selects never runs there.
3. **A new target name** only runs in the gate if it is in the `run-many -t` list in `scripts/quality.mjs` (`lint`, `format`, `architecture`, `knip`, `test`, `test-node`, `build`). Targets like `visual`, `aria`, `atlas`, `package` are run by their own CI jobs and by hand. Add a target to the list only with a reason: the full gate runs one task at a time.
4. **A new file nobody owns** (a root config, a shared script) that every project depends on belongs in the `workspace_wide` regex in `scripts/ci/nx-scope.sh`, or a pull request that changes only it runs nothing.
5. **Adding or bumping a pnpm dependency:**
   - Use the pinned pnpm (the installed version must equal `packageManager`; the cloud session-start script installs it). Run it from the workspace that owns the dependency (`pnpm --dir apps/ui add <name>`), pin it the way its neighbours are pinned, and commit `pnpm-lock.yaml`.
   - `minimumReleaseAge` is 4320 minutes: pnpm will not resolve a version younger than three days, and under pnpm 11 a **lockfile** entry that young fails CI even with `--frozen-lockfile`. A Dependabot security update can hit this: list that one `name@version` in `minimumReleaseAgeExclude` in the same pull request with its publish time and a "remove after" date, and remove it once it is old enough. Do not raise or drop `minimumReleaseAge`, `strictDepBuilds` or `blockExoticSubdeps`.
   - A dependency with an install script must be named in `allowBuilds` or the install fails (`strictDepBuilds`). A transitive dependency from a git URL or tarball is refused.
   - Regenerate the lockfile with pnpm (`pnpm install --lockfile-only`), never by hand; resolve a lockfile merge conflict by merging the base and regenerating.
6. **After a dependency change:** `pnpm knip` must stay at zero (delete the code, or add an ignore with a reason in `knip.jsonc`); check the licence (`scripts/licenses`); and if it is a Wails, Vite or Storybook pin, read the skill for that stack (`wails-v3` for the three-pin rule).
7. **Editing `scripts/quality.mjs`, `nx.json` or a root file:** these are workspace-wide, so the whole gate runs in CI. Run `pnpm check` locally, not `check:fast`.
8. **Commits:** commitlint checks the message (conventional type; `feat`, `fix`, `perf`, `refactor`, `docs`, `test`, `build`, `ci`, `chore`, `revert`, which `nx.json` maps to release bumps). Husky's pre-commit runs lint-staged and may rewrite staged files; stage again if it did.
9. `full-verification-gate`, then `feature-cleanup`.

## What this skill is not

It does not choose what the gate covers (`full-verification-gate` says when it must pass), explain a single target's tool (read that tool's config), or replace [CI and releases](../../../docs/operations/ci-and-releases.md) and [verification tooling](../../../docs/operations/verification-tooling.md), which hold the job-by-job detail.
