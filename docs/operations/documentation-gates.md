# Documentation gates

How the repository keeps documentation current and free of filler. The decision is [ADR 0756](../adr/0756-documentation-is-kept-current-by-path-and-text-checks-on-every-pull-request-and-agent-stop-with-judgment-left-to-two-skills.md); how each check is wired into CI is in [CI and releases](ci-and-releases.md#the-docs-impact-check).

## The checks

| Check | Fails when | Runs in | Way out |
| --- | --- | --- | --- |
| Docs impact (`scripts/ci/docs-impact.mjs`) | Code under a mapped path changed and none of its docs did | `pnpm check`, `Docs / Docs impact`, the `Stop` and `SubagentStop` hook | `Docs: none — <specific reason>` in the pull request description, a commit message, or your final message |
| Docs prose (`scripts/ci/docs-slop.mjs`) | Changed Markdown has an `error` phrase from `docs-slop-phrases.json` | `pnpm check`, `Docs / Docs prose` | Cut the sentence. Do not edit the list to pass |
| Docs references (`scripts/ci/docs-references.mjs`) | A doc names, in backticks, a repo path or root `pnpm` script that does not exist | `pnpm check`, `Docs / Docs prose` | Fix the path, or say it was deleted next to the path |
| Doc comments (`scripts/ci/doc-comments.mjs`) | The change adds a public Python name without a docstring or an exported Go name without a doc comment | Python `lint` targets, `quality.mjs go-lint` | `# noqa: D1xx` for a Python name that needs none |
| Markdown style and links | markdownlint on changed files; lychee offline on all | `Docs / Markdown lint`, `Docs / Links (offline)` | Fix the file |

## Working with them

1. Write with [docs-style](../../.claude/skills/docs-style/SKILL.md): state what code, a command or a test shows, link instead of copying, one page type per page.
2. Run [doc-impact-check](../../.claude/skills/doc-impact-check/SKILL.md) before `feature-cleanup`. It runs the docs-impact script and covers the docs the map does not.
3. Run [doc-unslop](../../.claude/skills/doc-unslop/SKILL.md) on the Markdown you touched. It cuts and does not add facts.
4. If no doc is owed, say why in the pull request description. A reason names what did not change; "not needed" does not count.

The hook asks once per stop. If it blocks, update the doc or repeat the `Docs: none` line in your final message.

## Changing a gate

- The docs-impact map is `scripts/ci/docs-impact-map.json`. Add a rule when a doc starts describing a new area; its test fails when a rule names a doc or code path that does not exist. Keep [the skill's map](../../.claude/skills/doc-impact-check/references/map.md) in step.
- The phrase list is `scripts/ci/docs-slop-phrases.json`. Measure a change with `node scripts/ci/docs-slop.mjs --all` and keep `error` entries to phrases with near-zero legitimate use.
- `node scripts/ci/docs-references.mjs --all --strict` measures the whole tree.
- Doc-comment rules are in `scripts/ci/doc-comments.mjs` and `apps/desktop/.golangci-docs.yml`.
- Every script has a `.test.mjs` beside it, run by `pnpm check`.

## What they do not catch

An empty edit to a mapped doc, a doc that names a renamed code file when the doc itself did not change, a sentence that is wrong but contains no listed phrase, and TypeScript or Lua doc comments. Review and the two judgment skills cover those.
