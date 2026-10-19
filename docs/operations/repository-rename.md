# The repository was renamed

The GitHub repository `countrymanprime/narration-utils` was **renamed on 2026-10-19**. The new name, `countrymanprime/narration-studio`,
is confirmed. Use it in everything you write; the old name works only through GitHub's redirect.

If git, the GitHub tools or a session launch cannot reach the repository, start with [If a session cannot connect](#if-a-session-cannot-connect).

## If a session cannot connect

| Symptom | Likely cause |
| --- | --- |
| `git fetch` or `git push` says `repository not found`, a 404, or asks for credentials | `origin` still names the old repository and the redirect is not working for this client |
| A `mcp__github__*` call is refused as outside the session's repository scope | The session's scope was chosen by name at start and lists only the old name |
| `create_session` fails with `ref_not_found` or a source error | The `source_url` in a prompt, Routine or scheduled task still names the old repository |
| `gh` or a script gets a `301` from `api.github.com` | The REST API redirects a renamed repository, and a client that does not follow redirects fails |

GitHub redirects web, `git clone`, `git fetch` and `git push` from the old name to the new one, but only while nobody creates
a repository with the old name. Do not ever create a repository named `narration-utils`. Use the new name in everything you
write, and treat the redirect as a safety net.

### Fix a checkout (do these in order, stop at the first that works)

1. See what you have: `git remote -v`.
2. Find the new name. Read it from this page. To check it exists: `git ls-remote https://github.com/countrymanprime/narration-studio HEAD`.
   If that fails, find where the old name now points with
   `curl -sIL -o /dev/null -w '%{url_effective}\n' https://github.com/countrymanprime/narration-utils`, and if that also
   fails, ask the owner for the name. Do not guess a name and do not create a repository.
3. Point `origin` at it, keeping the same URL form (https, no token in the URL):
   `git remote set-url origin https://github.com/countrymanprime/narration-studio`
4. Check: `git fetch origin main` and `git branch -vv`. Your branches and commits are unchanged by a rename; only the URL moves.
5. Push only to the branch you were given, as before.

### Fix the GitHub tools

Call every `mcp__github__*` tool with the new owner and repository. If a call is refused as outside the session's scope, run
`mcp__claude-code-remote__add_repo` with owner `countrymanprime` and the new repository name, clone it if it says to, and call
`register_repo_root`. A session's repositories are chosen when it starts: if `add_repo` is not available, tell the owner to start
a new session with the renamed repository selected, and carry on with whatever does not need it. Do not stand in for missing code
with made-up results.

### Fix a launch (coordinator and Routines)

`create_session` takes `source_url`. Use `https://github.com/countrymanprime/narration-studio`. The Routine prompts, scheduled tasks
and Claude environments that still hold the old URL are owner settings, not files: list them with `list_triggers` and fix the prompt
with `update_trigger`, or report them on [#992](https://github.com/countrymanprime/narration-utils/issues/992) for the owner.

Not recorded yet: whether the Claude GitHub App needs the repository
re-selected. The owner records the result under [After the rename](#after-the-rename).

## What names the repository

These are the places to change when the rename lands. GitHub keeps issue, pull request and release links working through the redirect,
so the many documentation links are tidiness, not breakage.

| Where | Why it matters |
| --- | --- |
| `Repository` in `apps/desktop/internal/update/check.go` | The updater asks `api.github.com` for this repository and refuses redirects on purpose. A build that still holds the old name gets a `301` and can never see a new release. Ship the new name in the first build released after the rename, and decide what happens to builds already installed |
| `gh attestation verify --repo` and `--signer-workflow` in the release notes (`scripts/release/`), [CI and releases](ci-and-releases.md#verifying-a-download), `github-workflow.md` and the public-site mock `docs/research/mockups/public-site/index.html` | Users copy these commands to verify a download against the repository name. The release notes take the repository as a parameter, so they follow the rename on their own; the pages and the mock do not |
| `gh api repos/countrymanprime/narration-utils/...` and `--repo` in [GitHub workflow](github-workflow.md) and [CI and releases](ci-and-releases.md) (rulesets, environments, Pages, private vulnerability reporting, project link) | Commands the owner copies to read or change a setting. They hit the `301` above when run by a client that does not follow redirects |
| `GITHUB_REPOSITORY` fallback in `scripts/ci/run-timings.mjs`, and the example in the error message in `scripts/release/assets.mjs` | The fallback is used only when `GITHUB_REPOSITORY` is unset (a local run); the error example is cosmetic |
| GitHub Pages URL and base path `/narration-utils/` in `.github/workflows/pages.yml`, `tools/docs-site/mkdocs.yml` and `check_site.py` | The site URL changes with the name. The site is paused ([CI and releases](ci-and-releases.md)) |
| `LINK_BASE` in `scripts/dev/owner-qa-list.mjs`, `REPOSITORY` in `scripts/licenses/notices.py`, `config/analysis-assets.json`, issue templates, test fixtures with release URLs | Links and notices that carry the name |
| `source_url` and issue links in `.claude/skills/agent-train/` and the worker templates | Launch prompts and the links the train posts |
| About 900 files with `github.com/countrymanprime/narration-utils/...` links | Work through the redirect, update when convenient |

These do **not** need to change with the rename, and changing them is a separate decision: the Go module path
`github.com/countrymanprime/narration-utils/shell` (about 1,900 imports; nothing outside the repository imports it), the Nx project
names `narration-utils*`, and the `narration-utils.exe` file name.

## For the owner: order of the rename

1. Tick `HOLD` on [#989](https://github.com/countrymanprime/narration-utils/issues/989) and let running sessions finish or pause.
2. Rename the repository in GitHub settings. Rulesets, Pages settings and secrets move with it.
3. Fix what holds the old name outside the repository: Routines and scheduled tasks, Claude environments and the GitHub App's repository list.
4. Open one pull request that changes the table above (updater constant first), and edit the first lines of this page to "renamed on <date>".
5. Clear `HOLD`.

## After the rename

Found on 2026-10-19:

- **Git, the MCP tools and `gh`** follow the redirect only for sessions that were scoped to the old name when they started and then
  added the new repository with `add_repo`. A session started with the old name selected cannot use the new one until it does.
- **Routine prompts** that held the old `source_url` were updated by the coordinator.
- **This repository** now names itself `countrymanprime/narration-studio` in the updater constant, the verify-download commands, the
  `gh api` and `--repo` commands, the scripts, the issue templates, the agent-train `source_url` and the Pages name and URLs. The
  Pages site is still paused; only its names changed. The Go module path, the Nx project names and `narration-utils.exe` keep the old
  name on purpose.
- **About 900 documentation links** to `github.com/countrymanprime/narration-utils/...` were left as they are. They work through the
  redirect, and rewriting them is churn without a benefit.

### Builds already installed with the old name

The updater asks `api.github.com/repos/countrymanprime/narration-utils/releases` and refuses redirects, so every build released
before the rename gets a `301` there. It shows "GitHub says the repository has moved, so this version of the app can no longer check
for updates." (`TestARepositoryThatMovedIsSaidPlainly`) and never sees a release. A new release does not change that: the old build
decides where it looks, and GitHub redirects the old API path for as long as nobody creates a repository with the old name.

The fix for those users is a manual download from the [releases page](https://github.com/countrymanprime/narration-studio/releases),
which is the supported path in the [README](../../README.md). A change to the updater rule could let a new build follow this one
redirect, but it would not reach the builds that already hold the old rule, and the rule is a deliberate trust limit (the
[threat model](../architecture/threat-model.md) row for the update). Not done here; if the owner wants it, it needs its own
decision: follow a `301` only when it stays on `api.github.com` over HTTPS and points to `/repositories/<id>/releases`, once, and
write the new name down.
