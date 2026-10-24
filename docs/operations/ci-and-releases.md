# CI and releases

## Local setup

Run `pnpm run bootstrap` once after cloning. It installs the root release
tooling and Husky hooks in addition to the existing application dependencies.
The hooks enforce Conventional Commit messages and check staged TypeScript,
Python, Go, and Lua files. Use `pnpm run check` for the full quality suite (every Nx
project's lint, format, test and build targets; see [Nx projects and the quality
gate](#nx-projects-and-the-quality-gate)).

`<app name>`, `<app>`, `<data>`, `<executable>`, `<asset prefix>`, `<install folder>`, `<uninstall key>`, `<launcher folder>`, `<launcher script>` and `<env prefix>` stand for values in `config/brand.json` ([Product and technical names](../architecture/codebase-map.md#product-and-technical-names)). `gh api` fills `{owner}` and `{repo}` from the checkout.

## What the repository enforces, and what CI is for

GitHub Actions cannot configure repository settings from a workflow, so this section records what is set on the
repository (read with `gh api repos/{owner}/{repo}/rulesets`, and `.../environments` and `.../actions/permissions`, on
2026-09-21) and what that means for CI. The docs follow the settings, not the other way round.

- **`Main Protection` ruleset** (active): deleting `main`, force-pushing to it and re-creating it are blocked. The
  admin role and the owner bypass it.
- **`Pull Request` ruleset** (active): squash merges only; one approval; **code-owner review is required**
  (`.github/CODEOWNERS` names `@countrymanprime` for every path); a new push dismisses stale approvals; the last push
  must be approved; every review thread must be resolved; its `require_extra_approval_for_unattributed_changes` option is on. The admin role can bypass it through a pull request, and the
  owner `@countrymanprime` is exempt, so the solo maintainer merges their own pull requests.
- **No ruleset requires a status check.** CI is advisory: a red job does not block a merge and a green one does not
  permit it, so the maintainer reads the run before merging (the table below says what each check is). Requiring
  checks is an owner-only setting. If it is ever turned on, the names to require are the ones in the table, and two
  things need a decision first: `ci.yml` skips documentation-only pull requests (`paths-ignore: docs/**, **/*.md`),
  which would leave a required check pending on them, and the visual and atlas jobs have to have stopped failing
  without a code change (see [Keeping a red run meaningful](#keeping-a-red-run-meaningful)). The one check that is
  safe to require today is **`Docs / Docs checks`**: it runs on every pull request, so it is never skipped, and it
  reads only the repository, so it does not flake ([The docs link check](#the-docs-link-check)). It is one job holding the five
  docs checks as steps, so requiring it requires all five.
- **Two settings the workflows rely on are the owner's to change:** "Require actions to be pinned to a full-length commit
  SHA" (off now; `zizmor` already enforces the same rule, and the setting is a backstop to enable after the pinning
  change has run once with Dependabot) and immutable releases (off, and they stay off: they would break the release-candidate prune, see [#186](https://github.com/countrymanprime/narration-studio/issues/186)).
  The owner checklist is in [Tracking work on GitHub](github-workflow.md#owner-checklist-for-the-release-supply-chain-work).
- **Nothing in CI checks a pull request title.** Conventional Commit messages are enforced by the local commitlint hook (Husky
  `commit-msg`) on the commits you make, but the title of a pull request becomes the squash commit and decides the next version, and
  no job reads it: the maintainer does, prompted by the pull request template. A title-check job was considered and not added: with
  no required checks it could only advise, and a new action or script in the release path is a change to review on its own.
  Adding one later means a small, SHA-pinned job in `ci.yml`.
- **Draft pull requests run a light tier** ([Draft and ready tiers](#draft-and-ready-tiers)). A draft runs `js`, `quick-ubuntu`,
  `quick-windows` and `go-test` and reports `CI light passed`; it skips the visual suite, the atlas, the UI bundle and `Build (Windows)`, and it
  shows no `CI passed`. Marking the pull request ready runs the full tier. No other workflow has a draft condition.
- **A pull request's runs stop when they stop mattering.** Every workflow a pull request starts has a `concurrency` group
  with `cancel-in-progress`, so a newer push cancels the run before it. Nothing cancels the runs of a pull request that is
  merged or closed: the coordinator cancels them by hand (`.claude/skills/agent-train/SKILL.md`). Runs on
  `main` and the release workflows are never cancelled. A push cancels the run before it, so a refresh push that changes nothing a
  reviewer needs ("merge `main` into the branch" with no conflict) throws away a run that was part way through ([Wasted runs](#wasted-runs)).
- **Windows is the only platform the app is built for** (a timing and maturity choice, not a design limit; see [Supported platforms](../../README.md#supported-platforms)). `Build (Windows)` is the only native
  build, on pull requests and in releases. The Linux runners that run the docs, Lua, UI, Python and lint checks host those
  checks; they build no Linux app.

The checks a pull request shows, by the name GitHub displays (`ci.yml` calls `_quality.yml` as `quality` and
`_ui-dist.yml` as `ui-dist`):

| Check | What it runs |
| --- | --- |
| `quality / scope` | Ubuntu, about a minute: asks Nx (`scripts/ci/nx-scope.sh`, the rule every `nx-run` step uses) whether the change affects `ui`, `desktop`, or `reaper` or the shell. `go-test` runs only when the shell is affected, `quick-windows` when `reaper` or the shell is, and the `js-test`, `ui-visual` and `ui-atlas` jobs only when the UI is. A job that does not run is skipped, takes no runner, and passes in `CI passed`. Its UI answer is `ui-affected`. A pull request whose workflow changes are only `uses:` pin bumps is the one case where a change under `.github/workflows` is not `all` ([Nx projects and the quality gate](#nx-projects-and-the-quality-gate)): it starts the jobs that contain a changed pin, and `js-static` and `quick-ubuntu` start unless the bump is the whole change and does not reach them |
| `quality / js-static` | `lint`, `format`, `architecture` (the import rules) and `test-node` (the node:test suites of `src/studio/ui/scripts`) of `ui`; `lint`, `format`, `architecture`, `typecheck`, `test-node` (the build scripts of the public site) and `test` (Vitest over its extension code) of `web`; then Knip over the whole repository |
| `quality / js-test (shard 1/3)` to `(shard 3/3)` | the Vitest run of `src/studio/ui` with coverage on the gated logic files (`node scripts/ci/coverage-gate.mjs vitest src/studio/ui --shard=i/3`), a third of the files each, split by cost (`src/studio/ui/scripts/vitest-shards.mjs`; Vitest's own split by path hash gave one shard 48% of the time). A shard checks no coverage floor; it uploads a blob of its results and coverage |
| `quality / js-test` | merges the three blobs (`coverage-gate.mjs vitest src/studio/ui --merge=3`: fails when one is missing) and checks every Vitest floor of `scripts/ci/coverage-floors.json` over the merged coverage, the same numbers as the unsharded run `pnpm check` does. Skipped when the UI is not affected |
| `quality / ui-visual (shard 1/3)` to `(shard 3/3)` | the Playwright visual suite of the mock-backed app, a third each by estimated time, not by test count ([Visual shards](#visual-shards)), with the per-capture checks; one shard, the one the split names, also runs `aria`. Each uploads its capture records and shard manifest, its screenshots, a timing report, and traces when it fails |
| `quality / ui-atlas (shard 1/2)`, `(shard 2/2)` | the Storybook component atlas, half the stories each: every story in light and dark at a wide and a narrow viewport, with axe |
| `quality / quick-ubuntu` | one step each, every step runs even after a red one: `repo-scripts` (the plain-Node tests of `scripts/`: labels, milestones, release tooling, the layout and project guards); `docs-site` (the public docs site, [below](#the-public-docs-site): ruff and pytest of `tools/docs-site` only: Pages publishes `src/web`, so the MkDocs build is not run in CI); `python` (ruff and pytest for `src/studio/libs/python`, the sidecars, `scripts/` and `tests/fixtures`); `reaper (Lua)` (StyLua and ruff on `src/studio/integrations/reaper`, then its bridge harness under Lua 5.4: a fake `reaper` driven through the file protocol, and the mutation checks; [The DAW port](../architecture/daw-integration.md#the-daw-port)) |
| `quality / rename rehearsal` | Ubuntu, every pull request: makes a detached git worktree of the commit in the temp folder, installs its dependencies from the store and cache the job filled, renames it to a made-up name with `rename-app`, runs the brand sync check, both name guards (`scripts/ci/brand-name.mjs`, `scripts/ci/old-name.mjs`), the Node script and site build tests, the docs-site tests, `go vet ./...` and the Go, Python, Lua and UI tests that read the brand (`scripts/brand/rehearse-rename.mjs`), and removes the worktree; the checkout is never written to. A file that spells the product's name instead of reading it from `config/brand.json` fails here. A run that is not a pull request (main-health) adds `--full`: every Go, UI, shared-library Python and Lua test, the built site with its old-name check and the strict MkDocs build |
| `quality / quick-windows` | Windows, one step each: `reaper (Lua)` again (paths from `package.config`, CRLF), then `go lint` (gofmt, go vet, golangci-lint, checklocks) |
| `quality / go-test (root)` | Windows: the Go tests of the module's root package (`src/studio/desktop`) under the race detector, alone because it is most of the cost (405 s of the 622 s the raced packages took on run 39138316593). `coverage-gate.mjs go src/studio/desktop -race --group=root` |
| `quality / go-test (rest)` | Windows: the Go tests of every other package (the race detector on those with concurrency, the rest without), then `test-schedules`. `--group=race,plain`. Each of the two jobs checks the coverage floors of the packages it ran; together they run every package once. The job limit stays 25 minutes, the limit set before the split |
| `ui-dist / build` | builds the UI bundle the Windows build reuses |
| `Build (Windows)` | the native Windows build, starting as soon as `ui-dist / build` finishes |
| `CI passed` | the full tier only (a ready pull request, a manual run, `main-health`): needs every job above and fails if any failed or was cancelled (skipped passes); then, when the UI is affected, runs the whole-run checks over the three shards' records (`pnpm --dir src/studio/ui run visual:check-run`, which was the `quality / ui-visual` job): every expected capture present, none blank, no undeclared duplicate, no stale `sameAs`, and the shards held every test of the suite exactly once: the one check for a ruleset to require ([#544](https://github.com/countrymanprime/narration-studio/issues/544)). A draft pull request shows no `CI passed`. Documentation-only pull requests do not run `CI`, so requiring it also needs `ci.yml`'s `paths-ignore` changed |
| `CI light passed` | a draft pull request only: sums up the four light-tier jobs. It is not `CI passed` and never a merge condition |

`codeql.yml`, `dependency-review.yml`, `docs.yml`, `security.yml` and `zizmor.yml` run their own checks and are advisory too
([every workflow](#every-workflow), [Tracking work on GitHub](github-workflow.md)). A pull request that changes only `docs/**` or
Markdown runs none of the `CI` checks, and not CodeQL either, so a docs-only change is reviewed by reading and by the link check
([The docs link check](#the-docs-link-check)); `docs.yml` and the labeler have no path filter and always run. `zizmor.yml`,
`dependency-review.yml`, `security.yml`, `osv-scanner.yml` and `codeql.yml` start on a pull request only when it changes
what they read ([every workflow](#every-workflow) lists the paths), so they show no check at all on a pull request that
changes none of it. That leaves nothing pending: `CI passed` needs only `quality`, `ui-dist` and `build-windows`, and no
ruleset requires any other check. If the owner ever requires one of the path-filtered checks, a pull request that
does not start it waits on it forever, which is the reason given above for `ci.yml`.

**The `production` environment** (read live on 2026-09-21) has `@countrymanprime` as its one required reviewer, **Prevent self-review**
left off and administrator bypass left on, so the owner can promote an emergency or solo release. It has **no deployment branch or tag
restriction** (`deployment_branch_policy` is null); `promote-release.yml` checks for itself that the candidate tag is an ancestor of `main`
and a pre-release. Restricting the environment to `main` and tags matching `v*` would also stop a run from another branch and is an
optional owner setting ([owner settings](github-workflow.md#repository-settings-that-only-the-owner-can-change)); it is not on today.

## Every workflow

Each file in `.github/workflows`, what starts it, and the checks it shows on a pull request (`_` files are reusable and start nothing themselves):

| Workflow | Starts on | Jobs and check names | Blocking? |
| --- | --- | --- | --- |
| `ci.yml` (`CI`) | pull request (opened, synchronize, reopened, ready for review) that is not docs- or Markdown-only; manual; called by `main-health.yml` | `quality / *` and `ui-dist / build` (the reusable `_quality.yml` and `_ui-dist.yml`), `Build (Windows)`, `CI passed` (full tier), `CI light passed` (draft) | no ruleset requires it |
| `prerelease.yml` (`Prerelease`) | push to `main` that is not docs- or Markdown-only; manual | `ui-dist / build`, `version`, `Windows build` (needs `ui-dist` and `version`) and `Windows release` (needs the build); no quality jobs, the pull request's `CI` run is the quality gate ([#544](https://github.com/countrymanprime/narration-studio/issues/544) tracks making it a required one); both run only when `version` found a releasable change. A manual run can tick `cold-freeze` to freeze the sidecars without the [freeze cache](#the-sidecar-freeze-cache) | not a pull request check |
| `promote-release.yml` | manual, with an RC tag; behind the `production` environment | `promote` | not a pull request check |
| `docs.yml` (`Docs`) | every pull request (no path filter), weekly (Monday 07:17 UTC), manual | `Docs checks`, one job whose steps are `Markdown lint (changed files)`, `Docs impact`, `Guide impact` and `Docs prose` (pull requests only, [below](#the-docs-impact-check)) and `Links (offline)` (pull requests and manual), each running even after a red one; and `Links (online, advisory)` (weekly and manual) ([below](#the-docs-link-check)) | a red step fails `Docs checks` (every step runs, so one run lists every finding); no ruleset requires it (owner-only setting) |
| `zizmor.yml` | pull request that changes a file under `.github/`, push to `main`, manual | `zizmor` | advisory in GitHub terms (not required); a finding at the `regular` persona fails the run |
| `security.yml` (`Security scan`) | pull request that changes `src/studio/desktop/`, `scripts/toolchain.json`, the SARIF dedupe script, the toolchain action or this file; nightly (06:41 UTC); manual | `govulncheck` | advisory: it does not fail on a finding |
| `osv-scanner.yml` (`OSV scan`) | pull request that changes `pnpm-lock.yaml`, `uv.lock`, `src/studio/desktop/go.mod` or this file; nightly (06:41 UTC); manual | `osv-scanner (pull request)` (only for a same-repository pull request that is not Dependabot's) or `osv-scanner` (every other trigger) | advisory: it does not fail on a finding |
| `codeql.yml` (`CodeQL`) | pull request to `main` that is not docs- or Markdown-only (same-repository, not Dependabot), nightly (05:23 UTC), manual | `CodeQL scope` (reads the diff), then `Analyze (go)`, `Analyze (javascript-typescript)` and `Analyze (python)` for the languages the pull request changes files of (`scripts/ci/codeql-scope.mjs`: Go for `src/studio/desktop/` and `scripts/toolchain.json`; JavaScript and TypeScript for `.js`, `.mjs`, `.ts`, `.tsx`, `.vue` and `.html` files; Python for `.py` files); all three on the nightly and manual runs, and for a change to the workflow, the toolchain action or an unreadable diff | advisory |
| `dependency-review.yml` | pull request to `main` that changes a lockfile (`pnpm-lock.yaml`, `uv.lock`, `src/studio/desktop/go.sum`, any `package-lock.json`), a manifest (`src/studio/desktop/go.mod`, any `package.json` or `pyproject.toml`), a workflow or a composite action | `review` (fails on a high-severity advisory, or on a licence outside the allow-list, that a pull request adds to a **runtime** dependency; needs the dependency graph; [the licence policy](github-workflow.md#the-dependency-licence-allow-list)) | advisory |
| `labeler.yml` | `pull_request_target` (opened, synchronize, reopened, ready for review) | `label` | not a check that gates anything |
| `pages.yml` (`Pages`) | push to `main` and pull requests that touch the site's paths, manual | `build`, `deploy` ([below](#the-pages-workflow)); `deploy` runs only off a pull request, on `main` | `build` on a pull request that touches the site: it builds `dist-site/` and checks its links, and uploads and deploys nothing |
| `train-health.yml` (`Train health`) | hourly (minute 23), manual | `heartbeat`: warns on #510 when #509's `Last pass:` line is over two hours old | not a pull request check |
| `main-health.yml` (`Main health`) | every three hours (minute 37), manual | `Has main moved since the last run` (skips the run when the last finished run was on the same commit; a manual run always runs), the whole of `ci.yml` run on `main`, then `Tick HOLD when main is red` on a failure | not a pull request check |
| `test-ratchet.yml` (`Test ratchet`) | pull request (opened, synchronize, reopened) | `Test ratchet`: prints each deleted test file, added skip or focus marker and lowered coverage floor, and raises a warning annotation. It never fails, and no label clears or changes it | no ruleset requires it; it is read before merging ([merge safety checks](verification-tooling.md#merge-safety-checks)) |
| `pr-risk.yml` (`PR risk`) | same-repository pull request (opened, synchronize, reopened) | `rate`: adds or removes the `risk:high` label | not a check that gates anything; a `risk:high` pull request is not merged without the owner |
| `sync-labels.yml`, `sync-milestones.yml` | push to `main` that changes `.github/labels.json`, `config/roadmap.json` or `scripts/github/**`, and the workflow file; manual | `sync` | run after a merge, never on a pull request |

The tests of `scripts/github/*.test.mjs` (the label and milestone sync) run in the `repo-scripts` step of `quality / quick-ubuntu`. Nothing runs on a schedule except
CodeQL, the two security scans, the online link check, and the two health checks (`train-health.yml`, `main-health.yml`). There is no `github-scripts` job and no changed-file classification: Nx `affected` decides what a pull
request runs (see [Nx projects and the quality gate](#nx-projects-and-the-quality-gate)).

Issues, labels, milestones, and the project board are covered in
[Tracking work on GitHub](github-workflow.md).

## Workflow security

The workflows build and publish an unsigned executable, so they are treated as code that needs its own checks.
[zizmor](https://docs.zizmor.sh) reads every workflow, composite action and `dependabot.yml` on every pull request that
changes a file under `.github/` and on every push to `main` (`zizmor.yml`; it reads nothing outside `.github/`) and reports unpinned actions, credentials left in `.git/config`, template injection,
excessive permissions and dangerous triggers. Its configuration is `.github/zizmor.yml`; every suppression there
names its reason. The check is blocking: a finding at the `regular` persona fails it. Run it locally with
`uvx zizmor --persona regular .` (add `--gh-token "$(gh auth token)"` for the online audits).

**Every action is pinned to a commit.** A `uses:` line that names another repository is a full 40-character commit SHA
with a comment holding the full release tag, for example `actions/checkout@3d3c42e5… # v7.0.1`; a tag such as `@v7` can
be moved to different code after the fact, a SHA cannot. References to this repository's own composite actions and
reusable workflows (`./.github/...`) stay as they are. zizmor's `unpinned-uses` audit is the gate, so an unpinned line
fails the `zizmor` check and names the line. To pin a new action run `pinact run` (the `pinact` Go tool, `go install
github.com/suzuki-shunsuke/pinact/v3/cmd/pinact@latest`, with `GITHUB_TOKEN` set; it converts the tag to its SHA and
writes the comment); `pinact run --verify --check` re-checks that every SHA matches its comment. Dependabot
(`github-actions`, weekly, with a 7-day cooldown) proposes the newer SHA and rewrites the comment. A new action needs
a reason: it runs with the job's token, so prefer a script in `scripts/` or a tool the toolchain already installs.

**Pin check (2026-09-21).** All 17 distinct `owner/repo@sha` pins in `.github/workflows` and `.github/actions` (45 lines; none
unpinned) were checked against GitHub: each comment's tag exists and resolves, through an annotated tag where there is one, to exactly
the pinned commit. The pins are uniform in form, not in version: two `setup-node` majors are in use (`v7.0.0` in
`promote-release.yml`, `v4.4.0` in the `setup-toolchain` composite action), and the composite actions also hold `setup-go` and
`setup-python` `v5.6.0`, `cache` and `download-artifact` `v4.3.0` and `pnpm/action-setup` `v4.3.0` while the workflows are on the
latest `checkout`, `upload-artifact` and `setup-node`. The likely cause is Dependabot's `github-actions` entry, which has
`directory: /` and, per GitHub's [options reference](https://docs.github.com/en/code-security/dependabot/working-with-dependabot/dependabot-options-reference),
searches `/.github/workflows` and a root `action.yml` only, not `.github/actions/*/action.yml`; adding `directories: ["/", "/.github/actions/*"]`
would include them. That is a configuration change with its own review, so it is not made in a documentation pull request.

The permission model, so a change can be judged against it:

- Every workflow declares `permissions` at the top, and a job that needs more raises it for that job only. The
  top-level default is `contents: read` (`zizmor.yml`, `promote-release.yml` and `pages.yml` use `{}`).
- The `publish` job (`Windows release`) of `prerelease.yml` holds `contents: write` (create the release) and the three attestation permissions (`id-token`, `attestations`,
  `artifact-metadata`: write). The `windows-build` job, which runs the third-party build tooling (PyInstaller, Wails, NSIS, pnpm),
  holds only the workflow's `contents: read`; `promote-release.yml`'s one job holds `contents: write` (create the stable tag and
  release) and `attestations: read`, behind the `production` environment.
- Every `actions/checkout` sets `persist-credentials: false`, so the token is not left in `.git/config` for later steps.
  Promote therefore creates the stable tag through the API (`gh api .../git/refs`) instead of `git push`.
- Values an outsider can influence (a tag input, a branch name) reach a shell through `env:`, never straight into a
  `run:` body.
- `labeler.yml` uses `pull_request_target` so forks can be labelled; it checks out nothing and runs no pull request
  code (the comment at its top says why that is safe).

Install-time settings are written in the repository so a default that changes upstream cannot change them silently:

- **`pnpm-workspace.yaml`:** `minimumReleaseAge: 4320` (a version must be three days old before pnpm resolves it),
  `strictDepBuilds: true` (an install fails on a dependency build script that `allowBuilds` does not name) and
  `blockExoticSubdeps: true` (no transitive dependency from a git repository or tarball URL). pnpm 11 checks the age
  of every lockfile entry even under `--frozen-lockfile` ("Lockfile passes supply-chain policies"), so a lockfile that
  holds a version younger than three days fails CI. That can happen with a Dependabot **security** update, which skips
  the Dependabot cooldown; list that one `name@version` in `minimumReleaseAgeExclude` in the same pull request, and
  remove it once the version is three days old.
- **`.github/dependabot.yml`:** a `cooldown` on every ecosystem, so Dependabot waits before proposing a new release:
  7 days for `npm` and `github-actions`, 3 days for `uv` and `gomod`. Security updates ignore the cooldown.
- **Python:** `uv sync --locked` installs only what `uv.lock` pins, and Dependabot's cooldown covers uv updates, so
  `exclude-newer` is not set. `uv audit` is a preview command and stays a local, non-gating check.

## Vulnerability scanning

`security.yml` (govulncheck) and `osv-scanner.yml` (OSV-Scanner) are two workflows. Each runs on a pull request that changes what
it reads and every night, which is the baseline on `main`: a push to `main` no longer starts a scan, and a new advisory against
an unchanged module or lockfile is found by the nightly run. Both are **advisory**:
neither fails the run on a finding, neither is a required check, and the first month is a baseline (the owner's decision). Findings show under **Security > Code scanning** (categories `govulncheck` and `osv-scanner`) and in
the run log; a fork or Dependabot pull request scans but does not upload, because its token is read-only.

- **govulncheck** (Windows, the version pinned in `scripts/toolchain.json`) reports only Go vulnerabilities the code can
  reach, so it is the low-noise one. Run it by hand with `govulncheck -C src/studio/desktop ./...`. v1.8.0 repeats identical
  entries in a result's `stacks`, which SARIF forbids and Code scanning rejects, so the workflow runs
  `scripts/ci/dedupe-sarif-stacks.mjs` on the file before the upload (it drops exact duplicates only). The text run prints
  even when the upload fails.
- **OSV-Scanner** (`google/osv-scanner-action`, pinned by SHA) checks `pnpm-lock.yaml`, `uv.lock` and
  `src/studio/desktop/go.mod` against the OSV database; `uv.lock` is read natively, so Python is covered without `pip-audit`
  (which does not read it). On a pull request it reports only advisories the pull request adds; the nightly run
  reports all of them. A lockfile added later has to be listed in `scan-args`. Run it by hand with
  `osv-scanner scan source --lockfile pnpm-lock.yaml --lockfile uv.lock --lockfile src/studio/desktop/go.mod`.
- `uv audit --preview-features audit-command` is a preview command and stays a local, non-gating check.
- **Baseline (2026-09-21):** govulncheck reports nothing; OSV-Scanner reports two advisories in `pnpm-lock.yaml`
  (`esbuild` 0.21.5, GHSA-67mh-4wv8-2f99, and `smol-toml` 1.6.1, GHSA-7w5x-hrqm-74c2), none in Go or Python.
  Dependabot proposes the fixes.
- **Moving to blocking** is a decision after a clean month: the pull-request mode of OSV (`fail-on-vuln: true`) fails
  only on what the pull request adds, and govulncheck stays advisory.

## Version lifecycle

The pre-release workflow runs after each push to `main` that changes more than `docs/**` or Markdown (and by hand). It does not run the quality
jobs again: the pull request's `CI` run already checked the code, and no ruleset yet requires that run to be green before a merge, so
merging with a red one is the owner's call ([#544](https://github.com/countrymanprime/narration-studio/issues/544)). Nx Release
uses the squash commit title to calculate the synchronized application version:
`feat` is minor; `fix`, `perf`, `refactor`, `docs`, `test`, `build`, `ci`,
`chore`, and `revert` are patch. Pre-1.0 breaking changes are handled as the
next minor release. The workflow tags `v<version>-rc`, builds the Windows
package, and its `publish` job creates the GitHub pre-release with the Windows
zip and the Windows setup program ([The Windows setup program](#the-windows-setup-program)). No other platform is built or
attached: the macOS and Linux preview builds were removed ([Supported platforms](../../README.md#supported-platforms)).

The one platform, `windows-x64`, ships an asset named `<asset prefix>-<version>-<platform>.<ext>`, with a
`.sha256` beside it, and its setup program and its third-party notices, named and checksummed the same way. All three files are
required: a build that lost its setup program or its notices is not promotable:

| Platform      | Asset                                               | Contents                                                                                                                                                  |
| ------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `windows-x64` | `<asset prefix>-<version>-windows-x64.zip`         | `<executable>.exe` (what the in-app updater downloads)                                                                                                 |
| `windows-x64` | `<asset prefix>-<version>-windows-x64-setup.exe`   | the NSIS setup program (what a narrator runs first; [below](#the-windows-setup-program))                                                                  |
| `windows-x64` | `<asset prefix>-<version>-THIRD-PARTY-NOTICES.txt` | the licences of everything the program contains, the AGPL text and the source offer ([Third-party notices](#third-party-notices)); **not** inside the zip |

`<version>` is the bare version (`0.2.7`), the same on a candidate (`v0.2.7-rc`) and its promotion (`v0.2.7`), so promote
re-publishes the files without renaming them, and downloads of different releases can be told apart by name
. The program inside keeps a name with no version
(`<executable>.exe`, which the REAPER launcher looks for); the version is also stamped **into** the program
([The version inside the program](#the-version-inside-the-program)), where the app can show it and compare it with a newer release
. The build folder keeps unversioned
names too (`<asset prefix>-windows-x64-setup.exe`, `THIRD-PARTY-NOTICES.txt`); packaging gives the released ones.

`scripts/release/assets.mjs` owns that table, packages each asset in CI
(`pnpm release:package <platform>`, named for the root `package.json` version unless a version follows the platform), and checks a
downloaded release (`pnpm release:verify-assets <dir> <version>`, offline: sizes and checksums only; promote adds `--attestations`). A file
named for another version is refused as an unexpected file.

Use **Promote pre-release** with the RC tag when it is ready. Approval on the
`production` environment gates the job, which then validates main ancestry and
refuses to continue unless every Windows file is attached, matches its
checksum and has build provenance (see [Build provenance](#build-provenance)). A file that is not one of them stops it. It creates the
stable tag and GitHub release from the exact same downloaded assets and never
rebuilds an approved candidate. Release candidates
published before per-asset checksums (they carry `SHA256SUMS.txt`), ones published before attestations, and ones published before the
version was in the asset names, cannot be promoted this way.

## The version inside the program

The root `package.json` version is the single source: `sync-version.mjs` copies it to the two `package.json` files and to
`src/studio/desktop/wails.json` (`info.productVersion`, which the build renders into the Windows version resource and the installer), and
`scripts/release/wails-build.mjs` stamps it into the Go variable `main.version` with `-ldflags "-X main.version=<version>"`. CI (`.github/actions/build-native`) and a local
build (`pnpm --dir src/studio/desktop run build`, or the Nx `package` target) both go through that script, so a build never reports a
version that depends on who built it. `Bootstrap` returns it and Settings > App & updates shows it.

- The version is **bare semver** (`0.2.7`). A release candidate and its promotion are the same bytes, so they report the same
  version; `wails-build.mjs` refuses a version with a suffix, and sets every Go flag itself, so a caller cannot replace the stamp.
- A build with no stamp (`go run`, `go test`, `pnpm --dir src/studio/desktop dev`) reports `0.0.0-dev`.
- `<executable> --version` prints the stamped version and exits without opening a window. On Windows the program is a GUI
  application, so a console shows nothing; a program that reads its standard output (a test, the update flow) gets the text.
- The program is named by `wails.json` `outputfilename` (`<executable>`, `.exe` on Windows; `brand:sync` writes it from the brand). Clean old build output before you
  test the REAPER launcher: a program under an older name in `src/studio/desktop/build/bin/` is no longer looked for.

### What the in-app updater depends on

The app replaces itself from these releases ([in-app update](../architecture/in-app-update.md)), so the shape of a Windows release is
a contract: the asset is `<asset prefix>-<version>-windows-x64.zip`, `<version>` being the tag's bare version, with a
`<asset prefix>-<version>-windows-x64.zip.sha256` beside it in `sha256sum` format naming that zip; the zip holds exactly one entry, `<executable>.exe`; the tag is `v<version>-rc` for a
candidate (a pre-release) and `v<version>` for its promotion; and the program reports its own bare version for `--version`.
The updater refuses anything else, so changing one of these means changing `src/studio/desktop/internal/update` in the same pull request
(`scripts/release/assets.mjs` and the updater's `PlatformFor` and `Platform.AssetName` mirror each other). The setup program is not part of
that contract: the updater matches its zip and checksum by exact name and ignores every other asset. A copy built before the version was in the
names looks for `<asset prefix>-windows-x64.zip`, finds nothing on a newer release and is updated once by hand
.

## The Windows setup program

A narrator installs from `<asset prefix>-<version>-windows-x64-setup.exe` (the prefix is the brand's `identity.releaseAssetPrefix`, today <!-- brand:identity.releaseAssetPrefix -->narration-studio<!-- /brand -->), an NSIS installer that the build script compiles on Wails v3 ([ADR 0001](../adr/0001-the-app-is-written-in-go.md)).

- **How it is built.** `.github/actions/build-native` passes `--installer` to `scripts/release/wails-build.mjs` on `windows-x64`, after a
  step that installs NSIS when `makensis` is not already on the runner: the official 3.11 zip from SourceForge, checked against a SHA-256 pinned in the step (the digest SourceForge lists for the file), with `choco install nsis` at the same version as the fallback, because the Chocolatey feed answered 503 for four minutes on 2026-10-19. The step fails when `makensis -VERSION` cannot run afterwards. The script
  renders `wails_tools.nsh` for the release version (`wails3 update build-assets`, from `wails.json`), writes the WebView2 bootstrapper
  beside `project.nsi` (`wails3 generate webview2bootstrapper`) and runs `makensis -DARG_WAILS_AMD64_BINARY=<the program> project.nsi` in
  `src/studio/desktop/build/windows/installer`. It removes a setup program left by an earlier build first and fails when `makensis` cannot start
  or the file is not there afterwards, and `assets.mjs package` refuses to package Windows without it. The log shows `makensis version:`
  and makensis's own `Output:` line, and the job summary lists the release files with their sizes.
- **What it does.** Per user (no elevation, `%LOCALAPPDATA%\Programs\<install folder>`, uninstall entry under `HKCU`), `<executable>.exe`
  as the program name, a Start Menu shortcut and a second one, "`<app name>` for Audacity", that passes `--daw Audacity` ([Audacity boundary](../architecture/daw-integration.md#audacity-boundary)),
  a desktop shortcut the narrator can untick, the WebView2 runtime installed by Microsoft's
  bootstrapper only when it is missing, and an uninstaller that removes the program, the update copies (`.new`, `.old`, `.failed`) and the
  shortcuts and leaves settings, downloaded assets, the WebView2 data and project folders alone. The definition is
  `src/studio/desktop/build/windows/installer/project.nsi`; `wails_tools.nsh` beside it is rendered on every installer build and is not checked in. The
  publisher, product name and version come from `src/studio/desktop/wails.json` (`info`), whose version `sync-version.mjs` keeps equal to the
  release version and whose names `pnpm run brand:sync` keeps equal to `config/brand.json`. The program, the uninstall key, the setup
  file and the install folder are identity values in `brand.nsh`, which the same sync writes beside `project.nsi`: a rename of the
  product changes the names a narrator sees and not where an install lives. The workflows read the same values from
  `node scripts/brand/env.mjs BRAND_EXECUTABLE` (one value per call, never through `$GITHUB_ENV`), so none spells the product's
  name or an identity value.
- **What CI showed on Wails v2** (the `Build (Windows)` job of pull request 224, 2026-09-21): `makensis` was not on the runner; the pinned step installed `nsis.install` 3.11.0 and printed `makensis version: v3.11`; Wails printed `Building 'amd64' installer: Done.`; the setup program was 196,676,207 bytes and the zip 195,290,110; the bootstrapper check printed `Valid, CN=Microsoft Corporation`. The NSIS step adds about 15 seconds and the installer build about a minute.
- **Why per user.** The in-app updater renames the running program in its folder and never asks for elevation; under Program Files
  it would answer that it cannot replace itself. Per machine is not offered.
- **The WebView2 bootstrapper** the setup program embeds comes from inside the pinned `wails3` CLI (Wails v2 downloaded it from
  Microsoft while it built and nothing pinned it; the CLI is verified by the Go checksum database). The build still checks that
  `installer/MicrosoftEdgeWebview2Setup.exe` has a valid Authenticode signature from Microsoft Corporation before the release is packaged.
- **Unsigned.** The setup program is not signed (the owner's decision); the release notes say so and tell a narrator to choose **More info**
  then **Run anyway** on the SmartScreen warning (`scripts/release/generate-notes.mjs`). No workflow here signs anything.
- **What the notes list.** The changes since the release before this one: a candidate lists since the previous tag of either kind (the last
  candidate, or its promotion, which sits on the same commit); a stable release lists since the previous stable release, so a narrator on the
  stable channel sees everything since the version they had. The first release lists the whole history (`scripts/release/generate-notes.mjs`).
- **Tests.** `scripts/release/installer.test.mjs` holds the definition to the decisions of the ADR (the file names, per user, what the
  uninstaller deletes, no network, no signing, that the file is tracked); `assets.test.mjs` and `wails-build.test.mjs` cover packaging, the
  checksum, the promote checks and the missing-installer failure. `makensis` is not on a development machine as a rule (it can be: NSIS runs on Linux,
  and the Wails v3 migration compiled `project.nsi` there against a cross-built program), so the compile is proven by the `Build (Windows)` job; an install on a clean machine is the owner's check (the first stable rehearsal).
- **Install and uninstall by hand** for a check: run the setup program; `<asset prefix>-<version>-windows-x64-setup.exe /S` installs silently
  (both shortcuts) and `"%LOCALAPPDATA%\Programs\<install folder>\uninstall.exe" /S` removes it.

## The Windows release-gate evidence workflows

Three manual workflows (`workflow_dispatch` only; no ruleset requires them, nothing calls them, none publishes anything) turn the owner-pending checks of [section 9 of the Windows QA checklist](windows-qa-checklist.md#9-release-gate-checks) into recorded runs on clean GitHub-hosted Windows runners. They are evidence for the owner, not a gate: a red run does not block a merge or a release.

| Workflow | Check | What it does |
| --- | --- | --- |
| `windows-release-checks.yml` | 9.2, 9.3, 9.4 | Downloads the setup program and `<executable>.exe` of two published releases (`scripts/release/fetch-release-assets.sh`, which checks the whole asset set against its `.sha256` files with `scripts/release/assets.mjs verify` before anything is unpacked or run. That is the integrity half of what promote runs: promote also passes `--attestations` to prove who built the files, which this script does not, so a replaced release with matching checksums would pass; the newest and the one before, or the tags given as inputs). `scripts/release/windows-install-check.ps1` installs silently, asserts a per-user install (`HKCU` entry, none under `HKLM`, `%LOCALAPPDATA%\Programs`), both Start Menu shortcuts and the desktop one, starts the app, uninstalls and asserts removal; for 9.3 it installs the older release first, seeds `global-settings.json` and `recent-projects.json`, runs the newer setup over it and checks both files, the install folder, the reported version and the shortcuts. It accepts the uninstall key `<uninstall key>` ([#1816](https://github.com/countrymanprime/narration-studio/issues/1816) phase 2). The third job runs `go test -tags rehearsal` on the two real `<executable>.exe` builds ([in-app update](../architecture/in-app-update.md)). |
| `windows-encode-check.yml` | 9.1 | `scripts/release/install-ffmpeg-asset.ps1` downloads the file in `config/encoder-assets.json`, checks its size and SHA-256 and the kept binary's, then `<env prefix>FFMPEG=<ffmpeg.exe> go test ./internal/encodeport/...` encodes synthetic chapters and the ACX format and sample-rate checks read them. |
| `windows-reaper-transport.yml` | 9.7 | Installs the REAPER evaluation build silently. The `installer-sha256` input is required and the installer is not run unless its SHA-256 matches (`installer-size` adds a size check); the hash and signature are recorded in `reaper-installer.txt`, and a run with a wrong or unknown pin is meant to fail with the hash it saw (this path has not been run yet), which the owner checks against REAPER's published one before pinning. It then runs `src/studio/integrations/reaper/spikes/transport_timing.lua` through `run-reaper.ps1` (which gained a branch that dismisses REAPER's "Error opening devices" dialog on a runner with no audio hardware) in an isolated `-cfgfile`, and records, for Play, Stop, Record, Pause during Record, Pause again and Stop, when `GetPlayState()` and the real bridge's heartbeat showed the change. The runner has no audio hardware: a state REAPER refuses to enter is a finding in the report, not a failure. |
| `real-reaper-bridge.yml` | none yet | Manual prototype (`risk:high`). Windows job: same pinned install as `windows-reaper-transport.yml` (`installer-sha256` required, not yet run). Linux job: REAPER 7.82 under `xvfb` from a SHA-256-pinned tarball (`scripts/ci/real-reaper/run-linux-check.sh`; ran green locally on 2026-10-19, not yet on a GitHub runner). Both fetch one pinned LibriVox chapter (`tests/fixtures/audio/librivox-alice/sources.json`), start REAPER isolated with `src/studio/integrations/reaper/spikes/ci_real_reaper_launcher.lua`, and drive the real bridge over the file protocol with `scripts/ci/real-reaper/drive.py`. The Linux job also installs `jackd2` and runs REAPER on `jackd -d dummy` (a sound server with no hardware) so playback and recording rows run, then runs the scenario suites in `scripts/ci/real-reaper/scenarios_*.py` (one scenario per Experimental behaviour, asserting on project state and rendered samples). The job summary lists a PASS, FAIL or SKIP per action and per capability, and any FAIL fails the job. Design and limits: [real-REAPER CI integration](../research/real-reaper-ci-integration.md). |
| `real-audacity3-foundation.yml` | none (evidence, not a gate) | Manual dispatch (`pattern` input) and a pull request that touches `src/studio/desktop/internal/audacityreal/`, `src/studio/desktop/internal/audacitybridge/`, `src/studio/tests/audacity3/real/foundation/` or the workflow. Runs `src/studio/tests/audacity3/real/foundation/run.sh` on `ubuntu-24.04`: the SHA-256-pinned Audacity 3.7.7 AppImage (extracted, never uploaded), Xvfb, a PulseAudio null sink, the pinned LibriVox chapter; tests A3-T1 to T13, T24 to T29 and T34 of [the capability matrix](../research/audacity-3-capability-matrix.md#test-plan). Each test records pass, fail, skip and measurement rows and the raw reply bytes into `results.json`, uploaded as the `real-audacity3-foundation` artifact and summarised in the job summary. The earlier prototype is `real-audacity3.yml`. See the [suite's README](../../src/studio/tests/audacity3/real/foundation/README.md). |
| `real-audacity3-edits.yml` | none yet | Manual, `ubuntu-24.04` (`risk:high`; not run on a GitHub runner yet). Runs `src/studio/tests/audacity3/real/edits/run.sh`: the hash-pinned Audacity 3.7.7 AppImage under `xvfb` with a PulseAudio null sink, each test on a fresh Audacity. A raw Python pipe client measures recording, punch and roll, backups, cuts, stacks, macros, gain, click repair, undo, export and the German interface (A3-T14 to T23, T32), and Go tests (`real_edits_linux_live_test.go`, tag `audacityreal`) run the shipped adapter against it. Writes `results.json` and a job summary; never uploads the AppImage or an extracted tree. Results: [Audacity 3 real edits](../research/audacity-3-real-edits-results.md). |
| `real-audacity3-windows.yml` | none yet | Manual, `windows-latest` (`risk:high`; the script has never run). `src/studio/tests/audacity3/real/edits/windows.ps1` downloads `audacity-win-3.7.7-64bit.zip`, stops unless its SHA-256 matches, enables `mod-script-pipe` in a portable profile, starts Audacity twice and runs A3-T30 over the named pipes: reply bytes, `C:/` and backslash paths, 100 labels, a modal dialog. The runner has no audio device, so nothing records. |

What these cannot show stays with the owner: a launch from REAPER after an in-app update, a physical click or keystroke on REAPER's transport, MIDI and HID prompts (9.5) and a real microphone (9.6). Each run uploads its report as an artifact and writes it to the job summary; the checklist records the latest run link per check.

## The packaged-app smoke test

A release must start on a machine that has none of the repository. Wails is a GUI program, so CI cannot start it and look at a
window; instead the executable has a non-interactive mode, `<executable> --smoke` (`src/studio/desktop/smoke.go`), that runs before
the update relaunch logic, the single-instance lock and the window exist, checks what the release carries, prints a JSON report
and exits: `0` when every check passed, `1` when one failed, `2` for a bad command line. It downloads nothing.

| Check                           | What it proves                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `resources`                     | the embedded resources unpack into the per-user cache (the same code the app runs at launch)                                                                                                                                                                                                                                                                                                                                            |
| `asset-cache`                   | the asset cache folder (`<user cache>/<data>/assets`) can be created and written                                                                                                                                                                                                                                                                                                                                               |
| `sidecar:<name>`                | each of the three frozen sidecars is in the unpacked tree and starts (`--help` exits 0)                                                                                                                                                                                                                                                                                                                                                 |
| `guide:cmudict`, `guide:espeak` | the frozen Story Bible sidecar reads the CMU dictionary and starts the espeak-ng phonemizer Piper speaks through, from `piper/espeak-ng-data` (`manuscript-guide self-check`); a freeze that loses either data set fails here, and a self-check that stops reporting one of them fails too                                                                                                                                              |
| `guide:synthesis`               | only with `--piper-model FILE`: the frozen guide loads that voice and speaks one word                                                                                                                                                                                                                                                                                                                                                   |
| `teleprompter:capabilities`     | the frozen Teleprompter sidecar's `--capabilities` report names every ASR and capture row this build declares for the platform; Windows only, `--verify` is also asked, and the `moonshine` row must report `loadable: true` — the native library actually loads (no model, no network), the guarantee the retired `--check-moonshine` flag used to make alone ([live_asr.py](../../src/studio/sidecars/manuscript-teleprompter/core/live_asr.py)) |
| `guide:capabilities`            | the frozen Story Bible sidecar's `capabilities` subcommand names every TTS and pronunciation row this build declares                                                                                                                                                                                                                                                                                                                    |
| `compare:capabilities`          | the frozen Transcript Compare sidecar's `--capabilities` report names every batch ASR row this build declares                                                                                                                                                                                                                                                                                                                           |
| `catalogs`                      | the four approved asset catalogs load and name assets                                                                                                                                                                                                                                                                                                                                                                                   |
| `reaper`                        | the launcher (`<launcher script>`), the startup script REAPER runs from `__startup.lua` (`<launcher folder>_Startup.lua`) and their scripts are present and the launcher points at this executable (the shipped list is `scripts/release/reaper-files.mjs`, which names `narration_undo.lua`, `narration_levels.lua` and `narration_preroll.lua` among the feature files, and the generated `narration_brand.lua`)                                                                                                              |

CI runs it in the `Smoke test the packaged app` step of `.github/actions/build-native`, on `windows-x64` only, after the Wails
build and before the release asset is packaged, so both `Build (Windows)` in `ci.yml` and the Windows release build of
`prerelease.yml` fail on a build that cannot start. There is no path filter to
restrict it to package changes: the build itself runs on every non-docs change, and the check adds a few seconds. The step points
`LocalAppData` at an empty folder, writes the report to a file (a GUI-subsystem program's standard output can be lost) and shows it
in the log and the job summary. To run it locally, build as in `README.md`, then
`<executable>.exe --smoke --report smoke.json` (set `LocalAppData` to an empty folder to leave your own cache alone; add
`--piper-model <the installed .onnx>` to hear one word spoken by the frozen sidecar).

**Decision: CI does not speak a word.** A real synthesis needs the 114 MB voice, and downloading that on every run would cost
more than the risk it covers. What a freeze loses (the espeak-ng data, the dictionary) is what `guide:espeak` and `guide:cmudict`
exercise without a voice; the one-word synthesis is a local check with `--piper-model`, run whenever the freeze arguments change
(`scripts/release/prepare-resources.py`). Seed the voice with `pnpm run assets:seed -- tts`.

`scripts/release/verify-installable.mjs`, which runs before the native build, keeps its checks separate: the three sidecars, the
Piper and ONNX Runtime folders of the frozen guide, the guide's `piper/espeak-ng-data`, `cmudict/data` and cmudict package metadata
(`cmudict-<version>.dist-info`), on Windows the Teleprompter's `moonshine_voice/moonshine.dll` and `moonshine_voice/onnxruntime.dll`
(loaded with `ctypes`, so PyInstaller cannot find them; `--collect-binaries moonshine_voice`, [Manuscript Teleprompter](../architecture/manuscript-teleprompter.md)),
the four asset catalogs, and the REAPER files. Each has a test in
`scripts/release/verify-installable.test.mjs`. `prepare-resources.py` gives the guide `--collect-data piper --collect-data cmudict`
and `--copy-metadata cmudict`; PyInstaller has no hook for them (the guide grows by about 48 MB; `piper/hebrew` and `piper/tashkeel`
come with the package data and English does not need them, a saving left for a later change). The guide is also frozen with
`--exclude-module` for `gliner`, `booknlp`, `transformers` and `torch`, and verify-installable fails a guide tree that holds any of them: the
optional GLiNER and BookNLP downloads load them from its own install folder.

**Known gap, not fixed here:** the IPA shown for a name the CMU dictionary lacks comes from the `phonemizer` package, which needs a
system `libespeak-ng` that no build ships (it fails with "espeak not installed on your system" on a developer machine too), so
such a name gets no pronunciation in any build. That is a Story Bible behaviour, separate from previews, which speak through Piper's
own bundled espeak-ng; `guide:espeak` checks the latter. Using Piper's phonemizer for the IPA fallback would close it.

The smoke test's `resources` step unpacks into the same per-user cache the app uses, so do not run it while the app is open.

## Build provenance

Every release asset is attested: `actions/attest` records, in GitHub's attestation store, which workflow, commit and
run built a file (SLSA build provenance, level 2: the build runs in the calling job, so it is not the isolated
level 3). The subjects are identified by digest:

| Platform | Signed by (the workflow the certificate names)        | Subjects                                                                                                                                                                                                                                                   |
| -------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Windows  | `.github/workflows/prerelease.yml`, the `publish` job | `<asset prefix>-<version>-windows-x64.zip`, `<asset prefix>-<version>-windows-x64-setup.exe`, the notices, their `.sha256` files, and `<executable>.exe` (so the executable can be checked after the zip is extracted, which an in-app update can do) |

- The step runs before anything is published. Windows builds in `windows-build`, which records the SHA-256 of every file
  as a job output; `publish` downloads the files, refuses any that do not match those digests (or that the build did not
  record), and attests before the prune and `gh release create`, so it attests the bytes that were built. If it fails the job fails and nothing
  unattested is published; re-run the workflow to retry.
- The job that attests holds `id-token: write`, `attestations: write` and `artifact-metadata: write`.
- Promote does not attest again: it re-publishes the same bytes, and an attestation belongs to a digest, not to a release.
- Attestations prove which workflow, commit and run produced a file. They do not prove the source is benign, and they do
  not change how Windows SmartScreen or antivirus software treats an unsigned executable. The first stable release is
  unsigned and Windows-only: signing is the owner's call, and no workflow here signs.
- A release candidate published before this change has no attestations, so promote refuses it (it cannot be promoted
  once attestations are enforced, as a candidate with `SHA256SUMS.txt` could not be promoted after `README.md#supported-platforms`). Only the
  newest ten candidates are kept in any case.
- **Promote verifies before it publishes.** `node scripts/release/assets.mjs verify <dir> <version> --attestations` (the
  `--attestations` flag needs `GITHUB_REPOSITORY` and an authenticated GitHub CLI, so `pnpm release:verify-assets` stays
  offline) runs `gh attestation verify` for the archive and the checksum of every platform present, pinned with
  `--repo`, `--signer-workflow <repository>/<workflow from the table above>`, `--source-ref refs/heads/main` and
  `--deny-self-hosted-runners`. `--repo` alone would accept an attestation from any workflow of the repository, a
  pull request's included. The signer workflows live in the `PLATFORMS` table of `scripts/release/assets.mjs`; rename a
  workflow file and that table is the one place to change (its tests fail first). If a promote is refused, the message
  names the file and gh's reason: a file with no attestation was not built by these workflows.
  The same step refuses any file in the downloaded release that is not one of the known assets or checksums, because
  promote publishes every file it downloaded.
- **What the certificate says.** The signer is the workflow in the certificate's subject alternative name,
  `https://github.com/<repository>/.github/workflows/<file>@<ref>`; for a file attested inside a reusable workflow it is
  the reusable workflow, and the calling workflow appears only in `buildConfigURI`. This was read from real attestations
  made by a throwaway workflow before the flags were written.

### Verifying a download

With the [GitHub CLI](https://cli.github.com), in the folder holding the file:

```bash
gh attestation verify <asset prefix>-0.2.7-windows-x64-setup.exe --repo countrymanprime/narration-studio
```

Success prints the workflow, commit and run that built the file; a modified or unattested file fails. To insist on the
release workflow and `main`, add `--signer-workflow countrymanprime/narration-studio/.github/workflows/prerelease.yml --source-ref refs/heads/main`.
`gh attestation download <file> --repo ...` saves the attestation as a
`.jsonl` bundle that `--bundle <file>` then verifies without asking GitHub for it. The same works for the executable
inside the zip after extracting it, which is what an in-app update can check. The release notes say the same in one line.
The `.sha256` beside a file only detects a damaged download: it is not evidence of where the file came from.

## The docs link check

`docs.yml` (workflow `Docs`) runs [lychee](https://github.com/lycheeverse/lychee) (`lycheeverse/lychee-action`, pinned to a commit, lychee 0.24.2) over every Markdown file in the repository, configured by `.lychee.toml` and `.lycheeignore` at the root. Its pull request checks are one job, `Docs checks`, whose steps run one after another and each even after a red one (`if: !cancelled()`, as `quick-ubuntu` does), so a run lists every finding. They were five jobs with a runner and a checkout each; the step names are the old job names. The weekly online check is a job of its own.

- **`Links (offline)`** (a step of `Docs / Docs checks`) runs on **every** pull request: the trigger has no `paths` filter, on purpose. `ci.yml` skips documentation-only pull requests, so a docs job that shared its filter would also skip a _code_ change that renames a file a document links to, and a check that GitHub skips because of a path filter stays pending if it is ever required (see the note at the top of this document). Offline mode reads only the tree and never opens a network connection: a relative link must resolve to a file, and a `#fragment` to a heading of that file (checked; `include_fragments = "anchor-only"` works with `--offline`). A local run over the 227 Markdown files and 1,356 links takes 0.13 seconds (the Actions run adds the runner set-up), so it is cheap enough to block on, and it is deterministic. **It blocks in the sense that a dead link turns the check red**; a red check does not stop a merge while no ruleset requires it, so the maintainer reads it like the others, and adding `Docs / Docs checks` to the `Pull Request` ruleset's required checks is an owner-only setting that is safe to make. `Pages / build` also link-checks the built site on a pull request that touches `src/web` or the UI; `src/studio/ui/src/docsGuide.test.ts` checks the guide's own anchors regardless.
- **`Markdown lint (changed files)`** (a step of `Docs / Docs checks`) also runs on every pull request, and also fails the run on a finding, but checks Markdown _style_, not links: heading levels, list marker and indent consistency, trailing whitespace, multiple blank lines, fenced code language, bare URLs, and the rest of `.markdownlint-cli2.jsonc`'s starter rule set (`markdownlint-cli2`, exact version pinned in the root `devDependencies`). It scopes itself to only the `.md` files the pull request adds or changes against the merge base with its base branch (`scripts/ci/changed-markdown.mjs`, `scripts/ci/lint-markdown-changed.mjs`) — not a full-repo baseline, so pre-existing debt in an untouched file never blocks an unrelated change, only in one a pull request itself touches. A rename lands on its new path; a deletion has nothing left to lint. The job writes a job summary naming the fix command on a failure. `pnpm lint:md` runs the same check locally against `origin/main` (or `--base <ref>`), and `pnpm lint:md:fix` adds `--fix`; lint-staged also runs `markdownlint-cli2 --fix` on staged `*.md` files on commit, so most violations never reach a pull request at all. See CI and releases for why this replaced building the docs site on every pull request, and why the rule set turns off line length, table style and a handful of rules that fired only on the repo's own deliberate style (template formatting, angle-bracket placeholders, bold lead-in labels, footnote-style citation markers).
- **`Links (online, advisory)`** starts weekly and by hand. It also follows the `http(s)` links (with `actions/cache` on `.lycheecache`, one day), reports the ones that rotted in the job summary, and **never fails**: a link on someone else's server is not a regression in this repository. `429 Too Many Requests` is accepted. The `GITHUB_TOKEN` is passed only to lift GitHub's anonymous rate limit.

**Diagrams.** lychee reads a Mermaid block as text, so `scripts/ci/mermaid-diagrams.test.mjs` (in the `repo-scripts` step of `quality / quick-ubuntu`, and so in `pnpm check`) hands every ` ```mermaid ` block of every tracked Markdown file to Mermaid's own parser (`mermaid.parse`, the `mermaid` devDependency of the root package) and fails with the file, the line and the parser's message. It needs no browser: Mermaid's sanitizer only wants a DOM, and the test gives it jsdom (already a dependency of the UI's tests) before it imports Mermaid. It proves the syntax, not that the names in a picture are still true; the five diagrams of [the codebase map](../architecture/codebase-map.md#how-the-parts-connect) and the four flows each say which files they were checked against, and the test fails if one of the five owning docs loses its diagram.

What it does not see: a path in a code comment (a path to a planning document in a Go or Python file) is not a Markdown link, so `scripts/ci/prd-references.test.mjs` (in the `repo-scripts` step of `quality / quick-ubuntu`) fails when a source file cites a PRD that is not in the tree ([Lifecycle of a PRD](../prds/README.md#lifecycle-of-a-prd) deletes them by design). Mermaid diagrams are text to lychee.

The baseline on 2026-09-21: 0 dead repository links; 7 external links rotted or unreachable, six of them pull requests of the owner's private repositories cited as history in the UI atlas kit's rollout ledger (deleted with the kit, [Visual bug fixes require screenshot verification](../../.claude/rules/ui-visual-verification.md)) and one real finding, the README's link to the published site `https://countrymanprime.github.io/narration-studio/`, which answers 404 until the owner enables GitHub Pages ([#231](https://github.com/countrymanprime/narration-studio/issues/231)). To add a link the checker should not chase, add a regular expression to `.lycheeignore` with its reason; to run the check locally, install lychee (`cargo install lychee --locked`) and run `lychee --config .lychee.toml --offline .` (drop `--offline` for the online run).

## The docs-impact check

[Documentation gates](documentation-gates.md) is the one-page map of this check and the four after it. This section and the next three give how each is wired.

A change to code that `docs/` describes has to touch one of those docs, or say why none is owed (issue #943). `scripts/ci/docs-impact.mjs` reads `scripts/ci/docs-impact-map.json`: each rule lists code paths, paths to leave out (tests, stories), and the docs that describe them. A rule fails when the change touches its code and none of its docs. The map is a starting set of ten rules, not every doc in the tree; add a rule when a doc starts describing a new area. `scripts/ci/docs-impact.test.mjs` fails when a rule names a doc or a code path that no longer exists.

- **Opt-out.** A line `Docs: none — <reason>` in the pull request description (or a commit message, which is what `pnpm check` reads) waives the check. A reason under 12 characters, or one such as "not needed", "n/a" or "trivial", does not count.
- **Where it runs.** The `Docs impact` step of `Docs / Docs checks` runs on every pull request, with no path filter and on `edited` too, so adding the opt-out line re-runs it. `pnpm check` runs the same script against `origin/main` first.
- **Hook.** `.claude/settings.json` also runs it when a coding session stops; [`.claude/skills/README.md`](../../.claude/skills/README.md#hooks) describes how.
- **Limits.** It compares paths, so an empty edit to a mapped doc satisfies it. Review judges whether the doc changed in substance. A rule over a wide folder fails a refactor that changes no documented behaviour; that is what the opt-out is for.

### The guide-impact check

The `Guide impact` step of `Docs / Docs checks` runs `scripts/ci/guide-impact.mjs` the same way: on every pull request and on `edited`, and in `pnpm check` against `origin/main`. `scripts/ci/guide-impact-map.json` maps each folder under `src/studio/ui/src/components/` to the pages of the how-to guide it draws. A change to a folder's code (tests, stories and fixtures aside) fails when it touches neither one of those pages nor any image in `docs/images/ui/`. The opt-out is a line `No guide change: <reason>`, with the same length and vagueness rules as `Docs: none`. `primitives` and `devtools` have no rule; the periodic guide sweep catches what a shared component moves ([UI PRs update the how-to guide](../../CONTRIBUTING.md#ui-prs-update-the-how-to-guide)).

### The docs prose checks

The two `Docs prose` steps of `Docs / Docs checks` run two scripts over the Markdown a pull request adds or changes, and `pnpm check` runs the same two against `origin/main`, reading uncommitted and untracked Markdown as well so a run before the commit sees what the commit will hold:

- **`scripts/ci/docs-slop.mjs`** reads the phrase list in `scripts/ci/docs-slop-phrases.json`. An `error` phrase (a filler opener, an inflated-importance phrase, a sales word or chat residue) fails the run. A `warn` phrase (words such as `robust`, `leverage` and `ensures`) is printed in the job summary and never fails, because each has real uses. It skips code, link targets, quotations, comments, front matter and the files the list's `ignore` names (the skills and report that quote the phrases). `node scripts/ci/docs-slop.mjs --all` measures the list against every tracked Markdown file; on 2026-10-10 that was no errors and 71 warnings. Do not weaken the list to get past a finding: cut the sentence or state the checkable fact ([doc-unslop](../../.claude/skills/doc-unslop/SKILL.md)).
- **`scripts/ci/docs-references.mjs`** fails when a doc names, in backticks, a repo path or a root `pnpm` script that does not exist. It accepts a Go `package.Symbol`, a path relative to a sub-project, a pnpm built-in such as `pnpm licenses`, and a path git ignores. It skips ADRs, PRDs, research, `docs/ui/`, fenced code, quotations, placeholders and any line that says the path was deleted, removed, retired, replaced or renamed (or points to `git log`), which is how a doc names a path that is gone on purpose. On 2026-10-10 the first run found 15 hits, ten of them stale paths that this change fixed.

Both are smell detectors: a phrase list cannot judge a sentence, and a path check cannot tell a path from a backticked word shaped like one. The `doc-unslop` skill does the judgment.

### The doc-comment check

`scripts/ci/doc-comments.mjs` fails when a change adds a public Python name without a docstring or an exported Go name without a doc comment. It is a ratchet by diff, not by count: only a violation on a line the change adds fails, so the existing backlog (385 exported Go names and 177 Python names on 2026-10-10) never blocks an unrelated change and new code cannot add to it. Editing the body of an old function does not flag it.

- **Python:** ruff D100-D104 and D106 with the Google convention, filtered to added lines because ruff has no new-issues-only mode. It runs as the last `lint` command of `narration-common` and the three sidecars, so it runs wherever Python lint runs. Tests, spikes, `conftest.py`, `__init__` and magic methods are skipped.
- **Go:** revive `exported` through `src/studio/desktop/.golangci-docs.yml` filtered to added lines by the script (golangci-lint's own `--new-from-merge-base` has no rename detection, so a moved file would count as new), at the end of `quality.mjs go-lint`. Test files are skipped and the stutter check is off.
- **Base:** `origin/main`, or `origin/$GITHUB_BASE_REF` in CI. It exits 2 when git cannot find the merge base. Both jobs check out full history.
- **Not covered:** TypeScript and Lua (see the docs-style references for why). Add them when a checker is in the toolchain.

## Third-party notices

`scripts/licenses/notices.py` writes `THIRD-PARTY-NOTICES.txt`: the licence and licence text of every third-party component the Windows release contains, the AGPL-3.0-or-later text of the program itself, and the **source offer** that AGPL and the GPL-family packages in the frozen Story Bible sidecar ask for (this repository, at the release's tag). The owner's licence decision ([Contributing](../../CONTRIBUTING.md)) makes bundling Piper, `phonemizer` and eSpeak NG fine, so the job of the file is to carry their notices, not to avoid them. Run it after `scripts/release/prepare-resources.py` has frozen the sidecars:

```bash
uv run python scripts/licenses/notices.py --version 0.1.0 --tag v0.1.0-rc --out THIRD-PARTY-NOTICES.txt
```

Each part is read from the thing the release is built from, so nobody keeps a list that can drift (**the shipped Python set is derived from the frozen bundle**, proven on the local build):

| Ecosystem         | Source of truth                                                                                                                                                                                                                                                                                                                                | Notes                                                                                                                                                                                                                                                                                                                                                                  |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Python            | The `Analysis-00.toc` and `PYZ-00.toc` PyInstaller writes for each of the three freezes (`.release-build/<sidecar>/work/<sidecar>/`): every module, binary and data file it took, with its source path. The `site-packages` ones are the shipped packages; `importlib.metadata` of the same environment gives their licences and licence files | 74 distributions on the local build. The freeze takes more than the runtime needs (`hypothesis`, `pytest`, `setuptools`, `fastapi`: [#245](https://github.com/countrymanprime/narration-studio/issues/245)); the report lists what is really there rather than what `pyproject.toml` says                                                                               |
| npm               | `pnpm licenses list --prod --json` in `src/studio/ui`, with each package's licence file                                                                                                                                                                                                                                                              | 44 packages                                                                                                                                                                                                                                                                                                                                                            |
| Go                | `go list -deps` of the desktop program for `windows/amd64` with the build's tags, minus the main module and the standard library, with each module's licence file classified by its text                                                                                                                                                       | 8 modules on Wails v3 (18 on v2: its asset server's echo, gorilla and friends are gone); `giraffesyo/pdf` is behind the `pdf_candidate` tag and not in a build. Wails vendors code with its own licence files inside its module (`internal/webview2/webviewloader`, `internal/go-common-file-dialog`), as v2 did; the report names the module's top-level licence only |
| By hand           | `scripts/licenses/manual.json`: the Python runtime, the PyInstaller bootloader, OpenSSL, libffi, the Visual C++ runtime, the FFmpeg libraries and the OpenBLAS and GCC runtime vendored inside the PyAV and numpy wheels, eSpeak NG's data inside Piper, the Silero VAD model, WebView2                                                        | What no package manager knows. The FFmpeg entry records what was measured (`avutil_license()` reports LGPL v3 or later) and what is not verified (whether libx264 and libx265 make the build GPL, and libx265's exact licence)                                                                                                                                         |
| Models and voices | `config/*-assets.json`                                                                                                                                                                                                                                                                                                                         | Not in the package; listed as downloaded on request, with their licence and source                                                                                                                                                                                                                                                                                     |

The run **fails, and writes nothing**, rather than guess: when a licence cannot be named (`UNKNOWN`, or pnpm's `Unknown`; a person decides and records it under `licenses` in `scripts/licenses/reviewed.json`, as for PyInstaller, and an entry that names a component whose licence is known, or one that is not shipped, is itself an error so a stale decision cannot hide a change); when a component ships no licence text (MIT, BSD and Apache ask for it to travel: three are recorded with their reason under `noText`, [#246](https://github.com/countrymanprime/narration-studio/issues/246)); when a frozen module no installed distribution owns, or a vendored native folder (`av.libs`) has no entry in `manual.json`; when the environment is not the one that was frozen (a different version of a package, or one that is not installed); when a table of contents is missing or is not one; or when the report lacks a direct dependency: the nine Python packages the sidecars import (moonshine-voice among them: the report is of the Windows release), every production dependency in `src/studio/ui/package.json` and every direct requirement of `src/studio/desktop/go.mod` that the Windows build links. A GNU licence text is classified by its title at the top, not by the licences it quotes (GPL-3.0 names the Affero licence in section 13). `scripts/licenses/tests/test_notices.py` pins each reader and each of those refusals on fixtures and, where `go` and the UI's `node_modules` exist, runs the real npm and Go readers against the tree. **On the release.** The Windows build writes the file after the freeze (the `Write the third-party notices` step of `.github/actions/build-native`, which also installs the UI's packages for `pnpm licenses`, on Windows only; every pull request's `Build (Windows)` runs it, so a change that makes the generator refuse fails the pull request that caused it) into `src/studio/desktop/build/bin`, and `scripts/release/assets.mjs package` copies it to `release-assets/THIRD-PARTY-NOTICES.txt` with a `.sha256`, refusing to package a build that has no notices before it zips anything. It is then attested with the other files (`release-assets/*`), verified by `assets.mjs verify` (a Windows release without it, or with a changed one, is not promotable) and by `verify --attestations`, and the release notes point at it (`## Licences and source`). The source offer names the tag the build came from (`v<version>-rc`) **and its commit**: a release candidate's tag is pruned once ten newer ones exist (`prerelease.yml`), and a promotion re-attaches these same bytes, so the commit is what keeps the offer true for the promoted release.

**It is not in the update zip.** The in-app updater refuses a zip that holds anything but `<executable>.exe` ([in-app update](../architecture/in-app-update.md), [The install and the rollback](../architecture/in-app-update.md#the-install-and-the-rollback)), and an already installed client would refuse every update to a two-file zip. So the notices are their own asset, and a copy in the setup program, or a change to the updater, is left to the owner (Proposed; [#250](https://github.com/countrymanprime/narration-studio/issues/250)). `scripts/release/verify-installable.mjs` is unchanged: it checks the resources the app needs to start, and the notices are written after it runs.

## The Pages workflow

`pages.yml` publishes the public site to GitHub Pages, at `https://countrymanprime.github.io/narration-studio/`: the landing
page at the root, the condensed guides under `/docs/`, the windowed demo of the app under `/demo/` and the Storybook component atlas under `/storybook/`. It builds
`src/web` ([The public demo site](public-demo-site.md)) into `dist-site/`. The owner lifted the hold on publishing (the former D75)
on 2026-10-21. The MkDocs site of `tools/docs-site` ([below](#the-public-docs-site)) is no longer what Pages serves.

- **Triggers.** A push to `main` that changes `src/web/`, `src/studio/ui/src/`, `src/studio/ui/.storybook/`, the UI's `package.json` or `vite.config.ts`, `docs/images/ui/`,
  `docs/guides/`, `check_site.py`, `pnpm-lock.yaml` or the workflow, and `workflow_dispatch`. A pull request that changes the same paths
  runs `build` only: it uploads nothing and never reaches `deploy`.
- **Two jobs.** `build` (read-only token) checks out with `persist-credentials: false`, runs the `setup-toolchain` action (pnpm, no Python),
  builds the site with `SITE_PUBLISHED=1` (`pnpm --dir src/web run build:site`; the flag drops the "Preview ... not published" notice that
  other builds carry, `src/web/build/shell.mjs`), runs `tools/docs-site/check_site.py` over `dist-site/` with `--base /narration-studio/`
  and uploads `dist-site/` with `actions/upload-pages-artifact` (not on a pull request). `deploy` needs it, runs only off a
  pull request and on `refs/heads/main` (a manual start from a branch builds and stops), holds `pages: write` and `id-token: write` (the only job
  that does), uses the `github-pages` environment and calls `actions/deploy-pages`. The top-level `permissions` is `{}` and there is no
  secret. One deployment runs at a time and a running one is never cancelled; a pull request's build is cancelled by its next push.
- **It works under a project sub-path.** Pages serves this repository at `/narration-studio/`, not at `/`. Every link and asset URL in
  `dist-site/` is relative, so the build needs no base setting; the link check runs with the base to prove it, and fails on a link that
  starts with `/` outside it. A `#/route` fragment (a link into a demo page) is a client route, not an id, and the check skips it.
  Checked by serving `dist-site/` with `node src/web/build/serve.mjs dist-site --base /narration-studio/` (404 for anything outside the
  base) and loading the landing page, a docs page, the demo and Storybook in Chromium: no failed request, no page error. The fonts are bundled, so
  the site makes no third-party request.
- **The sub-path is the repository's name.** The link check's `--base` and `--site-url` come from the workflow's repository context, and the
  demo's base and the docs site's addresses from `config/brand.json`'s `repository` ([repository rename](repository-rename.md)).
- **Owner step.** Settings > Pages > Source must be **GitHub Actions** ([the table](github-workflow.md#repository-settings-that-only-the-owner-can-change)).
  Until then `deploy` fails with GitHub's "Pages is not enabled" message and `build` passes. The first deploy runs on the merge of the pull
  request that enabled this workflow; afterwards re-run the latest run once the setting is on.
- **Change it like any workflow:** every action is pinned to a commit (`pinact run --verify --check`), `zizmor` must be clean, and a
  new artifact path or job goes through review of the token scopes above.
- **A build that publishes nothing** is `site-preview.yml`: manual, read-only, uploads `dist-site/` as an artifact.

## The public docs site

This MkDocs build of the repository's own `docs/` folder is **not published** (Pages serves `src/web`, [above](#the-pages-workflow)); it is kept as a strict, link-checked reading view of `docs/`. It is built by MkDocs 1.6.1 with the
Material 9.7.7 theme (
the [spike](../research/docs-site-generator-spike.md) behind it). `tools/docs-site` holds configuration only and no page or picture: a test
fails if it gains one, or if `docs_dir` stops being `docs/`.

- **What is published** is `tools/docs-site/include.txt`, one path or glob per line (`dir/`, `file.md`, `*` inside a folder, `**` across
  folders): the guide, the roadmap, the component atlas, the tool pages, nine architecture pages, the design system, every ADR and the
  screenshots they embed. `docs/research/`, `docs/prds/`, `docs/operations/` and `docs/workflows/` stay out until someone lists them, so
  publishing a page is a reviewed change to that file. A line that matches nothing fails the build.
- **Links.** A relative link to a page that is not published, to a folder with no published index, or to a file outside `docs/` (`../../apps/...`,
  `../../SECURITY.md`, `../config/roadmap.json`) is rewritten at build time to the GitHub file view of that path at the commit being built
  (`DOCS_SITE_REF`, `main` locally) by `tools/docs-site/hooks.py`. A link to something that does not exist is not rewritten, so the
  strict build reports it. Links inside code spans and fenced blocks are examples and are left alone.
- **The link check.** `mkdocs build --strict` fails on any warning (a missing page, a `#heading` that is not on the page it names, a link it
  cannot place), then `tools/docs-site/check_site.py` reads the built HTML and fails on any internal `href`, `src` or `#fragment` that does not
  resolve, under the `/narration-studio/` base. Both run in `nx run docs-site:build-site`, which no workflow calls now that `pages.yml` publishes `src/web`: neither
  `pnpm check` nor the `docs-site` step of `quality / quick-ubuntu` runs it (they run only `lint` and `test` there); run it by hand. This is the first link check the
  repository had (`Docs / Docs checks` (its `Links (offline)` and `Markdown lint (changed files)` steps) are what a pull request runs instead). Proof it fails:
  `tools/docs-site/tests/test_build.py` builds a tiny tree in which a dead page link, a dead heading link and a stale include line each fail
  the build.
- **Build and browse it.** `pnpm exec nx run docs-site:build-site` writes `tools/docs-site/build/site` (ignored); serve that folder from a
  directory that has it as `<app>/` to see the site under its real base path. the Nx targets run `uv run --locked --only-group docs`, which installs MkDocs (the `docs`
  uv group, not a default group) into `.venv` on first use; `NO_MKDOCS_2_WARNING=true` silences Material's MkDocs 2.0 notice.
- **Navigation** is generated from the folders; `mkdocs.yml` (`extra.nav_titles`, `extra.nav_order`) names the sections and orders the top
  level, and a page's title is its first heading. Search is local; the site loads no font and asks no third-party service (the repository link
  is a footer link, not Material's repository widget, which would call `api.github.com` on every page).
- **Diagrams.** A fenced ` ```mermaid ` block in a page draws as a diagram on GitHub natively and on the site through Material's Mermaid support. Material loads its Mermaid script from `unpkg.com` when the page has no `mermaid` global, which would make every visitor's browser ask a third party (the site asks none), so `hooks.py` copies the browser bundle of the pinned `mermaid` package (a root devDependency, `node_modules/mermaid/dist/mermaid.min.js`, with its licence) to `assets/vendor/` and `mkdocs.yml` lists it in `extra_javascript`. The build fails with "run `pnpm install`" if the bundle is missing, so a `docs-site` job needs the root `pnpm install` (its `pnpm-filter: workspace` gives it). `tools/docs-site/tests/test_build.py` proves the fence becomes a diagram, that the script is the site's own, and that the real site never names `unpkg.com`.
- **The Storybook** is copied beside the built site by `pages.yml` and linked from the generated atlas page (`hooks.py` appends the link;
  `docs/ui/atlas/index.md` is generated and not edited).
- **Dependencies** are the `docs` group of `pyproject.toml` (`mkdocs`, `mkdocs-material`, and `pytest`/`ruff` so the docs job installs that
  group alone), exact versions, locked with hashes in `uv.lock`, Dependabot's `uv` entry and its 3-day cooldown apply, and nothing of it is
  in the app. Do not raise the pins without re-running the spike: Material requires `mkdocs<2`.
- **Not proven until the owner enables Pages:** that the deployed address serves this build.

## Nx projects and the quality gate

Every folder of the [role-based layout](../architecture/codebase-map.md) is an Nx project with its own
`project.json`; Nx runs the commands, it does not replace them. The targets are the ones the old serial
runner called:

| Project                                                             | Folder                     | Targets                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ui`                                                | `src/studio/ui`                  | `lint`, `format`, `architecture` (the import rules of [Verification and code-health tooling](verification-tooling.md)), `test`, `test-node` (`node --test` over `src/studio/ui/scripts`: the `docs/ui` generator), `build`, `visual` (Playwright screenshots), `atlas`                                                                                                                                                                                                                                            |
| `web`                                              | `src/web`                | `lint`, `format`, `architecture` (the app modules the site may import), `typecheck`, `test` (Vitest), `test-node` (`node --test` over `src/web/build`), `build-site` and `serve-site` (the public site in `dist-site/`, [public demo site](public-demo-site.md); named off the default `build` on purpose, so `pnpm check` does not build it), `test-site` (the Playwright smoke test, run by hand). Depends on `ui`: a UI change reruns the site's checks |
| `desktop`                                             | `src/studio/desktop`             | `lint` (gofmt, go vet, golangci-lint v2: errcheck, staticcheck, gosec and the `standard` set; checklocks), `test` (`-race` in the `ci` configuration, on the packages with concurrency; see [Go lint and the race detector](verification-tooling.md#go-lint-and-the-race-detector)), `test-schedules` (the teleprompter and shutdown tests on one and on four CPUs, five times each; run by the CI `go-test` job, not by `pnpm check`), `package` (`scripts/release/wails-build.mjs`, not part of the gate) |
| `narration-common`                                                  | `src/studio/libs/python`              | `lint` (ruff), `test` (pytest)                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `manuscript-guide`, `manuscript-teleprompter`, `transcript-compare` | `src/studio/sidecars/<name>`          | `lint`, `test`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `reaper`                                                            | `src/studio/integrations/reaper`      | `lint` (StyLua, and ruff for the harness runner), `test` (the Lua bridge harness and its mutation checks, [reaper-bridge](../architecture/reaper-bridge.md))                                                                                                                                                                                                                                                                                                                                                |
| `repo-scripts`                                                      | `scripts`                  | `lint`, `test` (pytest), `test-node` (`node --test`)                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `docs-site`                                                         | `tools/docs-site`          | `lint` (ruff), `test` (pytest), `build-site` (the strict MkDocs build of `docs/` and the link check; [above](#the-public-docs-site)) — named off the default `lint format architecture knip test test-node build` set on purpose: Pages publishes `src/web`, not this MkDocs site, so `pnpm check` runs only `lint` and `test` here                                                                                                                                                                                             |
| `config`, `fixtures`                                                | `config`, `tests/fixtures` | none (fixtures: `lint`); they exist so a change to them affects the projects that read them                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `workspace`                                                          | the repo root              | `knip` (unused files, exports and dependencies, gated at zero: see below); also the `nx release` project                                                                                                                                                                                                                                                                                                                                                                                                    |

- **`pnpm check`** runs `nx run-many` over `lint format architecture typecheck knip test test-node build`, one project at a time and never from
  the Nx cache, so a green gate means every check ran. `check:fast` and the Git hooks still use
  `scripts/quality.mjs` on staged files.
- **Look around** with `pnpm exec nx show projects`, `pnpm exec nx graph`, and
  `pnpm exec nx show projects --affected --files=<path>`. Run one project's check with, for example,
  `pnpm exec nx run manuscript-guide:test`.
- **CI** jobs are listed [above](#what-the-repository-enforces-and-what-ci-is-for) as GitHub shows them (What the repository enforces, and what CI is for
  shaped them). Each job runs its targets through
  `.github/actions/nx-run`: on a pull request `nx affected` against the base branch, otherwise every selected
  project, one task at a time (parallel tasks starve the runners and trip the UI tests' timeouts).
  `scripts/ci/nx-scope.sh` decides: everything runs when the event is not a pull request, or the change
  touches a file no project owns but all depend on (`nx.json`, `package.json`, `pnpm-lock.yaml`,
  `pnpm-workspace.yaml`, `pyproject.toml`, `uv.lock`, the root `project.json`, `stylua.toml`, `.prettierrc.json`,
  `.prettierignore`, `.editorconfig`, `.gitattributes`, `scripts/quality.mjs`, `scripts/toolchain.json`, `scripts/ci/coverage-gate.mjs`,
  `scripts/ci/coverage-floors.json`, anything under
  `.github/workflows` or `.github/actions`). The Playwright jobs keep
  their own `run:` steps (they pass a shard) and skip them through
  `.github/actions/nx-affected` when the UI is not affected. The `repo-scripts` and `docs-site` steps always run,
  because the layout and project guards read every tracked file and the docs site reads `docs/`, which no project owns.
- **Pin-only workflow changes.** A change under `.github/workflows` or `.github/actions` is `all`, so a Dependabot bump of
  `actions/upload-artifact` ran every job. `quality / scope` calls `nx-scope.sh --pins` (through `nx-affected`'s `pins: true`; callers
  without the flag see the old `all`/`affected` contract) and `scripts/ci/workflow-pins.mjs <base>`. When every changed line in those two
  folders is a `uses: <owner>/<repo>@<40-hex sha> # v<version>` line replaced by one for the same action, in a file that was only
  modified, and nothing else is a workspace-wide file, the change is not `all`. The jobs that contain a changed pin start (written
  `<workflow file>#<job id>`; a changed local action maps to every job that uses it and to the users of any action that uses it),
  through the `ui`, `shell` and `winquick` outputs of `scope`, ORed with what Nx says is affected (`scripts/ci/pin-flags.mjs`; the
  families are in that file, and `ci.yml#ci-passed` belongs to `ui` so that its download-artifact pin runs the visual shards). When nothing
  outside those folders changed either, `js-static` and `quick-ubuntu` start only if a changed pin is in them. A job that starts runs in
  full. Anything else is `all`: a `run:`, `if:`, `with:` or `needs:` line, a step, job or file added, removed or renamed, a changed line
  outside any job, a pin swapped for another action or an unversioned one, a diff that does not parse. The families are coarse: a bump in one
  UI job starts all four. `ui-dist`, `Build (Windows)` and the other workflows are not gated and run on their own triggers.
- **No changed-file classifier.** `scripts/ci/changed-files.mjs` (and its test, both deleted) sorted a pull request into `bootstrap` and
  `package` scopes for a four-platform bootstrap and installer matrix that no longer exists. No workflow, script, Nx target or
  document called it, and Nx `affected` with `nx-scope.sh` does the job, so both files were deleted (2026-09-21) rather than wired
  in; Knip stays at zero. `git log --follow scripts/ci/changed-files.mjs` has the history.
- **Failure diagnostics.** A failing visual test leaves `src/studio/ui/test-results/<test>/trace.zip` (Playwright
  `trace: 'retain-on-failure'`: DOM snapshots, network and console for every action; a passing test keeps nothing,
  and no retry is involved, [What the suites do not prove](../design/design-system.md#what-the-suites-do-not-prove)). When a step of the
  `ui-visual (shard i/3)` job fails, the job uploads that folder as the `ui-visual-traces-<i>` artifact for three days. Open a trace
  with `pnpm exec playwright show-trace <trace.zip>` from `src/studio/ui`, or drop it on trace.playwright.dev. The atlas
  config (`playwright.atlas.config.ts`) keeps no trace yet.
- **Dependencies** are `implicitDependencies` in each `project.json`: the desktop app reads the sidecars,
  `config`, `fixtures` and `reaper` (its Go tests read their goldens and data); the sidecars read `narration-common` and `config`.
  The desktop app does **not** list the UI project: no Go code reads a file under `src/studio/ui` (the Go sources only name it in comments),
  so a UI-only pull request does not rerun the Go lint and tests. Only the native build needs the UI, and
  `desktop:package` says so with `dependsOn` on `ui:build`. `scripts/ci/projects.test.mjs` fails if
  a Go file under `src/studio/desktop` names a path under `src/studio/ui` in a string, so the graph cannot go out of date quietly: if it fails,
  put `ui` back in the shell's `implicitDependencies`. A change that is shared (`tests/fixtures`, `config`) still
  affects both projects.
  `scripts/ci/projects.test.mjs` fails if a Python, Go, Lua or `src/` TypeScript file is not covered by a project
  lint target, because the repo-wide `ruff .`, `staticcheck ./...` (now golangci-lint) and `stylua --check` runs are gone.
- **Releases** are unchanged: `nx release version` still versions the root project. `nx release` counts a commit
  when it affects the root project or a project the root depends on, so `workspace` lists every project except
  the UI and desktop projects (they were already separate projects that never counted); the guard test keeps that
  list complete when you add a project.
- **Adding a project**: add a `project.json` (copy a neighbour), give it `lint` and `test` targets that call the same
  tools, list what it reads under `implicitDependencies`, and add its name to the root project's
  `implicitDependencies` unless it should not count toward the release version.

## Keeping a red run meaningful

A red check has to mean something is wrong, so nothing is retried and nothing is quarantined ([What the suites do not prove](../design/design-system.md#what-the-suites-do-not-prove)).
A test that fails without a code change is a bug in the test, and it is fixed at its cause; "re-run it once" hides
exactly that. What the suites do so that timing is not a variable:

- **Frontend tests** (Vitest and Testing Library in `src/studio/ui`) wait for the state they assert: `findBy*`, or `waitFor`
  on the thing itself, never a synchronous read straight after waiting for something else (a component can settle in a
  later commit than the one the test waited for). Two limits are set once and never per test: `testTimeout` 15 s in
  `vite.config.ts` (Vitest's 5 s default is a unit-test value) and Testing Library's `asyncUtilTimeout` 5 s in
  `src/test-setup.ts` (its 1 s default failed 2 of 25 consecutive full runs on a quiet machine). A wait ends when its
  condition holds, so the limits cost nothing on a passing run. `slowTestThreshold` is left alone so a test that gets
  slow stays visible. Under heavy CPU oversubscription the two Story Bible tests of `App.test.tsx` can still reach
  the 15 s limit; that is the render cost of the whole app in jsdom, not a timing bug.
- **Visual drivers** (`src/studio/ui/tests/visual/app.drivers.ts`) reach a state through real UI interaction and wait for a
  condition, never a sleep and never a page-wide fake clock. `goToPage` clicks inside the navigation, then waits for the
  destination's heading and, for Home, Manuscript and Proofing, for their content; a state with content of its own waits
  for it; a confirm dialog is awaited by name through `confirmDialog`, which accepts `dialog` or `alertdialog`. A driver
  that photographs the page it just left shows up as `identical screenshots` and a stale `sameAs` in the run's validation:
  fix the driver, do not add a `sameAs`. To prove a new or changed driver, run the suite with a slowed page CPU:
  `UI_CPU_THROTTLE=20 pnpm --dir src/studio/ui run screenshots` (any factor of 1 or more; a mistyped value is an error). A
  racing driver fails or photographs the wrong page there on demand instead of once in twenty CI runs. At 20x the two
  Story Bible confirm states exceed Playwright's 30 s test timeout inside the capture's own steps: they fail loudly, they
  do not photograph the wrong page.
  `UI_THEME=dark pnpm --dir src/studio/ui run screenshots` starts every capture in the dark theme, which is how the whole suite
  is looked at in dark (the palette work checks every state in both themes). Its end-of-run validation fails on
  `theme-dark` and `reader-dark` matching their default states, so copy `src/studio/ui/screenshots/app` aside after the run and read the PNGs; the
  default run stays the gate.
- **Go tests** that guard an ordering between goroutines run on one and on four CPUs (`test-schedules`), because the
  default scheduler hid the shutdown bug that failed four CI runs. Tests do not assert a wall-clock duration: the
  monotonic clock ticks every 0.5 to 15.6 ms on Windows, so a fast operation can measure exactly zero.
- **Classifying a red run**: `gh run view <id> --log-failed`. `identical screenshots` or `sameAs no longer holds` is a
  driver (or a real duplicate); `Unable to find` or `Test timed out` in a frontend test is a wait that does not match the
  state, or a genuinely slow test; a Go failure that comes and goes with the CPU count is an ordering bug.
- **Aria snapshots** ([Verification and code-health tooling](verification-tooling.md)):
  one `ui-visual` shard also runs `pnpm --dir src/studio/ui run aria` after the screenshots (its own config, the same mock build, no
  retries, traces in `test-results/aria`), so a dialog that loses its role or name, a modal that stops hiding the page, or a
  changed navigation list fails there (comparison-only on CI). See [Verification and code-health tooling](verification-tooling.md#aria-snapshots).
- **Axe on app states**:
  the visual suite runs axe after each screenshot and fails on a violation that `src/studio/ui/tests/visual/axe-debt.ts` does not
  declare, and on a declared rule that is no longer reported. `UI_AXE=1` (PowerShell: `$env:UI_AXE='1'`) with `pnpm --dir src/studio/ui screenshots` measures without
  failing (the teardown prints the count per rule and where), `UI_AXE=0` skips it; on CI either value fails the run. To clear an entry, fix the page and delete
  it (and lower `MAX_AXE_DEBT_RULES`); to add one, say why and name the issue that tracks it.

The known limits of the gates are stated in [Design system](../design/design-system.md#what-the-suites-do-not-prove): axe
cannot judge gradients or text over semi-transparent overlays, and pixel baselines are not adopted (a spike, after the
suite has been stable for 50 runs, [#153](https://github.com/countrymanprime/narration-studio/issues/153)).

## Dead-code check (Knip)

`nx run workspace:knip` (also `pnpm knip`) runs [Knip](https://knip.dev) over `src/studio/ui`, `src/web`, `src/studio/desktop`, `scripts/`
and `tools/`, configured in `knip.jsonc`. It fails on an unused file, export or dependency, and on an unlisted
dependency or binary; the repository is at zero, and CI runs it on every pull request in the `js-static` job. Fix a finding
by deleting the code or dropping the `export`. Add an `ignore`, `ignoreIssues`, `ignoreDependencies` or
`ignoreBinaries` entry only with a written reason in the file (generated code, external tools). It does not read Go,
Python or Lua. The standing exceptions are the generated `src/studio/ui/wailsjs`, the wire-contract types, `@nx/js` (loaded by
`nx release`) and the binaries `go`, `gofmt`, `wails3` and `playwright`. Scripts are entries and their exports are
reported too (`includeEntryExports`), so a helper
exported by habit is flagged once nothing imports it. When a dependency that
Knip cannot see through arrives (a schema library, `@base-ui/react`), run it once and add the false positive with its
reason rather than the whole package to an ignore list.

## Coverage ratchet

Coverage is gated on the logic directories, not everywhere.
The `test` target of `desktop` (Go statements), `ui` (Vitest v8 lines),
`narration-common`, `manuscript-teleprompter`, `transcript-compare` and `manuscript-guide` (pytest-cov lines) runs
`scripts/ci/coverage-gate.mjs`, which runs the tests with coverage on and compares each listed directory or file with its
floor in `scripts/ci/coverage-floors.json`. A directory below its floor, or one with no data because it was renamed or
removed, fails the run.

- **Adding a logic directory:** add an entry at 80 or above. A lower floor needs a written `reason`; the gate's test
  (`scripts/ci/coverage-gate.test.mjs`) rejects one without.
- **After adding tests:** run `node scripts/ci/coverage-gate.mjs <go|vitest|pytest> <projectRoot> --update` (the same
  arguments as the project's `test` target) to raise floors to the rounded-down measurement. Floors never go down by
  `--update`; lowering one is a reviewed edit.
- **A floor that differs by operating system:** `floor` is the Windows number, which CI enforces ([Supported platforms](../../README.md#supported-platforms)).
  An entry may add `nonWindowsFloor`, below `floor`, with a `nonWindowsReason`; off Windows that one applies, and
  `--update` raises whichever applies on the host. Use it only where the platforms really measure differently: a test that
  stands a file where a folder belongs reaches one more statement on Windows, where a path through a file reads as "not
  found", than elsewhere, where it fails with `ENOTDIR` first (`internal/findings` and `internal/stages`). The test ratchet
  flags a lowered `nonWindowsFloor` as it does a lowered `floor`; dropping one only makes the gate stricter.
- **Not gated on purpose:** UI components, host glue and sidecar-launch code (the list is in the floors file's
  `$comment`).
- `vitest --coverage` also works by hand and writes `src/studio/ui/coverage/` (ignored).

## CI performance

Pull requests run the quality jobs and the UI bundle build in parallel. The
Windows native build needs only the UI bundle, so it starts as soon as that
finishes instead of waiting for lint and tests. No other platform is built
([Supported platforms](../../README.md#supported-platforms)), and the Go quality job runs on Windows only. pnpm's
content-addressable store, uv's package cache, Go's module/build caches, the
compiled `wails3` and golangci-lint binaries (keyed on `scripts/toolchain.json`), and
Playwright's Chromium download (keyed on the Playwright version) are restored by
the workflows; they never cache `node_modules`, `.venv`, test results or release assets. The one build output that is
cached is the [sidecar freeze](#the-sidecar-freeze-cache).
`setup-node`, `setup-python`, and `setup-go` provision the exact pinned Node,
Python, and Go versions. The Wails v3 CLI, `wails3` v3.0.0-beta.26 (built with `CGO_ENABLED=0`, [ADR 0001](../adr/0001-the-app-is-written-in-go.md)), is installed only in jobs that run a
native build, and on Linux `setup-toolchain` installs GTK 4 and WebKitGTK 6.0, which Wails v3 links through cgo, only for CodeQL's Go
compile (a Linux host for analysis, not a Linux build; [Supported platforms](../../README.md#supported-platforms)), golangci-lint v2.14.0 (built with the pinned Go, config in `src/studio/desktop/.golangci.yml`) only in the Go quality job, and the standalone
StyLua v2.1.0 binary where needed, as declared in `scripts/toolchain.json`; none
of them use Cargo. Lua 5.4 for the REAPER harness is the `lupa` wheel in the `lua` dependency group of `pyproject.toml` (hashed in `uv.lock`); the Lua job installs only that group. Platform-specific sidecars must be built on their target OS,
so the built UI bundle is shared between jobs as a one-day artifact rather than
rebuilt per platform.

### The sidecar freeze cache

Freezing the three Python sidecars with PyInstaller is most of the Windows build. `.github/actions/build-native` restores
the finished freeze (the executables in `.release-build/*/dist` and the tables of contents `THIRD-PARTY-NOTICES` is
written from) from `actions/cache`, keyed on the runner OS and architecture, the Python patch version and a hash of
`src/studio/sidecars/`, `src/studio/libs/python/`, `pyproject.toml`, `uv.lock` and `scripts/release/prepare-resources.py`. Only an exact key
counts (there are no fallback keys), and `prepare-resources.py --reuse` installs a sidecar from it only when its
executable and both tables of contents are there; otherwise that sidecar is frozen as before. The rules:

- **A build output, never a test verdict.** The packaged smoke test, the installability check and the notices run on
  every build, hit or miss.
- **Saved only from `main`**, after the smoke test and the notices passed. A pull request restores `main`'s entry and
  never writes one, so a pull request cannot change what a release is built from.
- **A cold freeze on demand.** Run `Prerelease` by hand with `cold-freeze` ticked; `build-native`'s `reuse-freeze: 'false'`
  does the same for any caller.

The Go toolchain is not cached on Windows: `setup-go` installs it on `D:` behind a junction in the tool cache, so a cache
of the tool cache would hold the link, not Go.

### Visual shards

Playwright's `--shard=i/n` cuts the test list into runs of equal count. The visual suite's tests are not equal (an overlay test is a few seconds,
a state with extra viewports is more, and the `aria` step ran on the shard that was already the longest), so the three shards ran 12 m 14 s to
14 m 22 s on 2026-10-18 and the longest was the critical path. `scripts/ci/visual-shards.mjs split` replaces it:

- It lists the suite (`playwright test --list`, a few seconds, no browser) and estimates each test from `src/studio/ui/tests/visual/shard-weights.json`: the mean
  time of tests with the same spec file and the same first two parts of the title (page and state, or page and overlay), else the mean of its spec file.
- It gives each test, longest first, to the shard with the least estimated time so far, with `aria` (49 s) placed like one more test. The result depends only
  on the listed tests and the weights file, so the three shard jobs agree without talking to each other. It fails if the shards do not hold every test exactly once.
- A shard runs its list with `playwright test --test-list`. Each shard records `shard-<i>.json` (its count, the suite's total, a digest of the list) in the records
  it uploads, and `CI passed` fails unless all three exist, split the same list and add up to it. A test that fell between shards would otherwise only be missed
  if it wrote a capture record, which the overlay guard and the other specs do not.
- A stale weight makes a shard slower, never a test unrun. Rebuild the weights when the shards drift apart by more than a minute: download the three
  `ui-visual-timings-<i>` artifacts of a recent green run (each is the shard's `--reporter=json` report) and run
  `node scripts/ci/visual-shards.mjs weights timings-1.json timings-2.json timings-3.json`. The `Visual shards` line of each job's log prints the estimate per shard
  to compare with the actual times.
- `playwright --shard` stays available locally; the CI split is only for the three-job run. `pnpm check` and a developer's run are one process and need no split.

### Measuring a run

`node scripts/ci/run-timings.mjs <run-id> [--steps]` prints a run's wall clock and, per job, when it started after the run
was created, how long it ran and on which runner, as a Markdown table (with `--steps`, every step too). It reads the
Actions API through `gh`. Queueing shows up as a large "Started after": the repository is public on the free plan, 20
hosted jobs at once across the account.

### Draft and ready tiers

`ci.yml` decides the tier from the pull request's draft flag (`github.event.pull_request.draft`); a manual run, `main-health` and every
non-pull-request trigger are the full tier.

| | Draft pull request | Ready pull request (and everything else) |
| --- | --- | --- |
| Runs | `quality / js`, `quick-ubuntu`, `quick-windows`, `go-test` | all of those, `ui-visual` (3 shards and the whole-run check), `ui-atlas` (2 shards), `ui-dist / build`, `Build (Windows)` |
| Summary check | `CI light passed` | `CI passed` |
| Starts again on | each push | each push, and when the draft is marked ready (`ready_for_review`) |

`CI passed` is reserved for the full tier. A draft shows a differently named check, so a green on a draft cannot be read as the full gate, and
the merge conditions ([agent train, step 4](../../.claude/skills/agent-train/SKILL.md)) keep asking for the full run: `Build (Windows)` and
`ui-dist` succeeded on the head, which a draft's run never produces. Nothing in the light tier is weaker than the same job in the full tier:
the Nx cache stays off, nothing is retried and no test is skipped. The light tier only leaves out whole jobs. Marking a pull request ready runs
the light jobs again next to the heavy ones; that repeat is the price of keeping one definition of the full run.

The intended use: open the pull request as a draft, push until the targeted checks pass, then mark it ready.

### Wasted runs

Of the last 40 `ci.yml` runs on 2026-10-18, 9 passed, 10 failed and 21 were cancelled; the cancelled runs were 41% of the wall-clock
the 40 runs used. Every workflow a pull request starts already has a `concurrency` group with `cancel-in-progress`, so a newer push stops the
run before it; the cost is the pushes. Rules for whoever pushes:

- **Do not push "merge `main` into the branch" without a conflict.** A pull request run already tests `refs/pull/<n>/merge`, the pull request merged
  into the current `main`, so a branch that is behind `main` is tested against `main` anyway. Merge `main` in when GitHub reports a conflict, or when
  a green run is wanted on a head that contains a specific `main` change (a fix for a red base).
- **Batch pushes.** Push after the targeted checks pass locally, not after each edit.
- **Open as a draft** and mark ready when the targeted checks pass ([Draft and ready tiers](#draft-and-ready-tiers)).

`main-health` catches what a pull request run cannot: two pull requests that are each green alone and break together once both are merged
(`startupRequests.spec.ts` on 2026-10-18; the nightly run was red in 3 of its last 8 runs). It runs the full tier on `main` every three hours,
only when `main` has moved since the last finished run, so a semantic conflict is found within hours and a quiet day costs nothing. Running
CI on every push to `main` (with `cancel-in-progress`, so a burst of merges is one run) would find it within about 20 minutes of the merge, at
~90 job-minutes per settled burst; it is not turned on. Adding it is a `push: branches: [main]` trigger on `main-health.yml` with `cancel-in-progress: true`.

### Merge queue

A merge queue would test each pull request merged on top of the ones queued before it, which is exactly the "green alone, red together" case.
It is **not available here**: merge queue is offered for repositories owned by an organization (and for private repositories on GitHub
Enterprise Cloud), and `countrymanprime/narration-studio` is owned by a user account (`owner.type` is `User`, read 2026-10-18). Moving the repository to an
organization would make it possible. The setup then: add `merge_group: types: [checks_requested]` to `ci.yml` (a `merge_group` run ignores `paths-ignore`, so
documentation-only pull requests also run it); add a ruleset rule "Require merge queue" on `main` with `CI passed` as a required check;
keep the merge method squash. The queue replaces "merge `main` in, wait for a green run, merge": the pull request run stays the fast signal and the queue's
run is the one that gates the merge.

### Measurements (2026-10-18)

These replace the 2026-09-27 sample, which predated the overlay guard and the visual suite's growth. All are for ready pull requests with the UI affected.

| Metric | 2026-09-27 | 2026-10-18 |
| --- | --- | --- |
| `quality / ui-visual` shard | median 4 m 50 s, p90 5 m 55 s (n=12) | 13.2 to 15.1 min; shard 1 is the longest because it carries `aria` (about 49 s) |
| Critical path | not recorded | shard 1, then `ui-visual` (the whole-run check, about 31 s), then `CI passed` |
| One `CI` run | not recorded | about 90 job-minutes, 45% of them the visual suite |
| Share of the overlay guard in shard 3 | not recorded | about 40% of its tests: the shell's top-bar hints, History, Jump to and the navigation drawer, repeated on 10 pages at 5 sizes with 3 scroll passes each |
| Outcome of the last 40 `ci.yml` runs | 4 of 40 successful (10%) | 9 passed, 10 failed, 21 cancelled (the cancelled runs used 41% of the wall-clock) |
| Green alone, red together | not recorded | three pull requests went red on one test after two pull requests that were green separately were merged |
| Nightly `main-health` | not recorded | red in 3 of the last 8 runs |

One sampled run, 39130959136 (a green pull-request run, 2026-10-18): shards 14 m 22 s (plus 49 s of `aria`), 12 m 14 s and
12 m 56 s; `Build (Windows)` 4 m 43 s; `ui-atlas` 8 m 14 s and 6 m 9 s. Playwright shards by test count, not by time, so the shards are as slow as
their most expensive tests. Numbers after the changes of the CI speed-up series are recorded on the pull requests that made them, in a `## Handoff` comment.

## Runtime provenance

**Model and voice downloads are pinned.** Every file in `config/whisper-assets.json` and `config/tts-assets.json` is
fetched from a Hugging Face URL that names a 40-character commit (`/resolve/<commit>/...`), never a tag or a branch that
can be moved, over https, with a 64-character SHA-256 and a size that the installer checks in a staging directory before
anything is activated. `src/studio/desktop/internal/assets/pins_test.go` fails on a tag or branch in a URL, a non-https URL, a
malformed checksum or a missing size, and its own cases prove each rule on a bad fixture. When adding a voice or model,
resolve its commit (`git ls-remote https://huggingface.co/<owner>/<repo> refs/tags/<tag>`, or the `X-Repo-Commit`
response header) and put it in the URL. The Piper voice's `version` stays `1.0.0` (it names the install directory, so
existing installs stay valid); only the download URLs moved from the tag `v1.0.0` to its commit, with the same hashes.
The Whisper path that loads a model by name from the hub when no `--model-dir` is given is not covered here.

`scripts/release/prepare-resources.py` freezes only the two first-party Python
tool entry points. It does not bundle optional voices, models, dictionaries, or
unreviewed third-party binaries. Before publishing a release that adds such an
artifact, add its publisher, version, immutable URL, SHA-256, code/artifact
license, installation location, attribution, and update policy to the release
record, following `docs/architecture/model-provenance.md` ("Required dependency record").
