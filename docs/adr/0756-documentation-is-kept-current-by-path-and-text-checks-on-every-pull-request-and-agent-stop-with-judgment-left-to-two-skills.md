# 0756. Documentation is kept current by path and text checks on every pull request and agent stop, with judgment left to two skills

**Status:** Accepted (issue [#943](https://github.com/countrymanprime/narration-utils/issues/943); pull requests #944, #947, #948 and #949)
**Date:** 2026-10-10

## Context

Agents change code and leave the docs that describe it behind, and agent-written prose collects filler. On 2026-10-10:

- Nothing failed when code changed and its docs did not. `feature-cleanup` step 4 was advice.
- The first run of the new reference check found 15 backticked paths that no longer existed. Ten were stale paths in current docs (moved components, a removed primitive, a deleted button). The other five were deliberate mentions of deleted things.
- `.claude/skills/` was gitignored, so cloud sessions and worktrees did not get the seven project skills.
- Two skills still said the Lua bridge had no automated tests ([ADR 0066](0066-the-lua-bridge-is-tested-by-a-harness-under-lua-5-4-and-reaper-api-behaviour-is-checked-in-reaper.md) says it does) and pointed at a guide path that had become a folder.
- Doc-comment conventions for Go, TypeScript, Python and Lua were written down nowhere, and the existing backlog was 385 undocumented exported Go names and 177 Python names.

The research is in [documentation practice and agent gating](../research/documentation-practice-and-agent-gating.md).

## Decision

Documentation is kept current by checks that compare paths and text, run in `pnpm check`, on every pull request and, for the first, on every agent stop. Two skills do the judgment a script cannot. Details of each check are in [The docs-impact check](../operations/ci-and-releases.md#the-docs-impact-check) and the sections after it; [Documentation gates](../operations/documentation-gates.md) is the one-page map.

- **Docs impact** (`scripts/ci/docs-impact.mjs`, `docs-impact-map.json`): code under a mapped path needs a change to one of its docs, or a `Docs: none — <reason>` line in the pull request description or a commit message. A vague reason does not count. The same script is a `Stop` and `SubagentStop` hook in `.claude/settings.json`: it blocks once per stop, never when `stop_hook_active` is set, and not when git cannot compare.
- **Docs prose** (`scripts/ci/docs-slop.mjs`, `docs-slop-phrases.json`): a phrase list with `error` entries (near-zero legitimate use, fail) and `warn` entries (real technical uses, print only), run on changed Markdown.
- **Docs references** (`scripts/ci/docs-references.mjs`): a backticked repo path or root `pnpm` script in a current doc must exist.
- **Doc comments** (`scripts/ci/doc-comments.mjs`): a public Python name or exported Go name the change adds needs a docstring or doc comment. It checks added lines only, so the backlog never blocks an unrelated change.
- **Skills** (`.claude/skills/`, now tracked): `docs-style` holds the writing and doc-comment rules per language, `doc-unslop` reviews changed prose for filler and unverifiable claims without adding facts, and `doc-impact-check` finds the docs a diff owes beyond what the script maps.

Each check starts blocking at zero findings on the existing tree, except the doc-comment check, which is a diff ratchet. Scripts are Node, in the pattern of `scripts/ci/`, not Vale: no new binary, and the phrase list and path rules are tested like any other code.

## Consequences

- A change to mapped code cannot merge, or finish in an agent session, without a doc change or a stated reason. The hook asks again only once per stop.
- The checks compare paths and phrases. An empty edit to a mapped doc satisfies docs impact, a phrase list cannot judge a sentence, and a path check cannot tell a path from a backticked word shaped like one. `doc-impact-check` and `doc-unslop` exist for that, and review still applies.
- The docs-impact map is ten rules and needs a new rule when a doc starts describing a new area. A rule over a wide folder fails a refactor that changes no documented behaviour; the opt-out line is for that.
- Only changed Markdown is scanned, so renaming a code file does not flag an unchanged doc that names it.
- A line that says a path was deleted, removed, replaced or renamed near a backticked path is skipped by the reference check, and that can hide a real stale path written next to such a word.
- TypeScript and Lua have no doc-comment check, because a coverage check needs TypeDoc or an ESLint plugin, or `lua-language-server`, which the repo does not have. Add one with a new ADR when a checker enters the toolchain.
- The phrase list ages as models change what they overuse. It lives in one reviewed JSON file.
- Tracking `.claude/skills/` puts the skills' Markdown under markdownlint, lychee, the layout guard and these checks.
- To change a gate's rules, edit its map or list and its tests in a pull request. To drop a gate, supersede this ADR.
