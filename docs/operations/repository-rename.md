# The repository was renamed

The GitHub repository was **renamed on 2026-10-19** to `countrymanprime/narration-studio`. Use that name in everything you write;
the earlier name works only through GitHub's redirect. The product's earlier name was retired from the repository, the code and
the release names before the first public release (`scripts/ci/old-name.test.mjs` keeps it out).

If git, the GitHub tools or a session launch cannot reach the repository, start with [If a session cannot connect](#if-a-session-cannot-connect).

## If a session cannot connect

| Symptom | Likely cause |
| --- | --- |
| `git fetch` or `git push` says `repository not found`, a 404, or asks for credentials | `origin` still names the earlier repository and the redirect is not working for this client |
| A `mcp__github__*` call is refused as outside the session's repository scope | The session's scope was chosen by name at start and lists only the earlier name |
| `create_session` fails with `ref_not_found` or a source error | The `source_url` in a prompt, Routine or scheduled task still names the earlier repository |
| `gh` or a script gets a `301` from `api.github.com` | The REST API redirects a renamed repository, and a client that does not follow redirects fails |

GitHub redirects web, `git clone`, `git fetch` and `git push` from the earlier name to the new one, but only while nobody creates
a repository with the earlier name. Never create a repository under that name. Use the new name in everything you write, and treat
the redirect as a safety net.

### Fix a checkout (do these in order, stop at the first that works)

1. See what you have: `git remote -v`.
2. Check the new name exists: `git ls-remote https://github.com/countrymanprime/narration-studio HEAD`. If that fails, ask the
   owner for the name. Do not guess a name and do not create a repository.
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
and Claude environments that still hold the earlier URL are owner settings, not files: list them with `list_triggers` and fix the
prompt with `update_trigger`, or report them on [#992](https://github.com/countrymanprime/narration-studio/issues/992) for the owner.

## After the rename

Found on 2026-10-19:

- **Git, the MCP tools and `gh`** follow the redirect only for sessions that were scoped to the earlier name when they started and
  then added the new repository with `add_repo`. A session started with the earlier name selected cannot use the new one until it does.
- **Routine prompts** that held the earlier `source_url` were updated by the coordinator.

### Builds released before the rename

The updater asks `api.github.com/repos/countrymanprime/narration-studio/releases` (`Repository` in
`src/studio/desktop/internal/update/check.go`) and refuses redirects, so a build released before the rename, which asks under the
earlier name, gets a `301`. It shows "GitHub says the repository has moved, so this version of the app can no longer check for
updates." (`TestARepositoryThatMovedIsSaidPlainly`) and never sees a release. The fix for those builds is a manual download from the
[releases page](https://github.com/countrymanprime/narration-studio/releases), the supported path in the [README](../../README.md).
Following that redirect would loosen a deliberate trust limit (the [threat model](../architecture/threat-model.md) row for the
update), so it is not done.
