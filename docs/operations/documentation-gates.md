# Documentation gates

How the repository keeps documentation current and free of filler. How each check is wired into CI is in [CI and releases](ci-and-releases.md#the-docs-impact-check).

## The checks

| Check | Fails when | Runs in | Way out |
| --- | --- | --- | --- |
| Docs impact (`scripts/ci/docs-impact.mjs`) | Code under a mapped path changed and none of its docs did | `pnpm check`, the `Docs impact` step of `Docs / Docs checks`, and a hook in `.claude/settings.json` | `Docs: none — <specific reason>` in the pull request description or a commit message |
| Guide impact (`scripts/ci/guide-impact.mjs`) | A page's UI folder changed and neither its page of the [how-to guide](../guides/using-the-app/README.md) nor any image in `docs/images/ui/` did | `pnpm check`, the `Guide impact` step of `Docs / Docs checks` | `No guide change: <specific reason>` in the pull request description or a commit message |
| Docs prose (`scripts/ci/docs-slop.mjs`) | Changed Markdown has an `error` phrase from `docs-slop-phrases.json` | `pnpm check`, the `Docs prose` steps of `Docs / Docs checks` | Cut the sentence. Do not edit the list to pass |
| Docs references (`scripts/ci/docs-references.mjs`) | A doc names, in backticks, a repo path or root `pnpm` script that does not exist | `pnpm check`, the `Docs prose` steps of `Docs / Docs checks` | Fix the path, or say it was deleted next to the path |
| Doc comments (`scripts/ci/doc-comments.mjs`) | The change adds a public Python name without a docstring or an exported Go name without a doc comment | Python `lint` targets, `quality.mjs go-lint` | `# noqa: D1xx` for a Python name that needs none |
| Markdown style and links | markdownlint on changed files; lychee offline on all | the `Markdown lint` and `Links (offline)` steps of `Docs / Docs checks` | Fix the file |

## Not used, and why

- **A count of em dashes or triads.** One or two are coincidence; the phrase list and the `doc-unslop` review judge filler instead.
- **Vale.** A Node script in `scripts/ci` does the phrase check with no new binary.
- **`last_reviewed` front matter.** An agent can bump the date without reading the page.
- **Swimm or Mintlify.** Commercial, with their own doc format, and they fix drift after the merge rather than block it.
- **A TypeScript or Lua doc-comment check.** The repo has no TypeDoc or TSDoc ESLint plugin, and `lua-language-server --check` is not in CI ([the docs-style references](../../.claude/skills/docs-style/SKILL.md#code-comments-by-language)).
- **A path-filtered docs job.** A required check that a path filter skips stays pending, so `docs.yml` runs on every pull request.

## Working with them

1. Write to the house style: state what code, a command or a test shows, link instead of copying, one page type per page. [Which document](../README.md#which-document) says where each kind of fact goes.
2. Run `node scripts/ci/docs-impact.mjs` before you push. It names the docs a mapped path still owes; the [map](../../scripts/ci/docs-impact-map.json) covers some areas, not all, so read the docs near your change too.
3. Cut filler from the Markdown you touched; `node scripts/ci/docs-slop.mjs` lists the phrases it catches.
4. If no doc is owed, say why in the pull request description. A reason names what did not change; "not needed" does not count.

The agent workflow for the same steps is the [doc-impact-check](../../.claude/skills/doc-impact-check/SKILL.md) skill.

## Changing a gate

- The guide-impact map is `scripts/ci/guide-impact-map.json`: one rule per UI folder under `src/studio/ui/src/components/`, naming the guide pages it owes. Its test fails on a folder with no rule.
- The docs-impact map is `scripts/ci/docs-impact-map.json`. Add a rule when a doc starts describing a new area; its test fails when a rule names a doc or code path that does not exist. Keep the judgment map in `.claude/skills/doc-impact-check/references/map.md` in step.
- The phrase list is `scripts/ci/docs-slop-phrases.json`. Measure a change with `node scripts/ci/docs-slop.mjs --all` and keep `error` entries to phrases with near-zero legitimate use.
- `node scripts/ci/docs-references.mjs --all --strict` measures the whole tree.
- Doc-comment rules are in `scripts/ci/doc-comments.mjs` and `src/studio/desktop/.golangci-docs.yml`.
- Every script has a `.test.mjs` beside it, run by `pnpm check`.

## What they do not catch

An empty edit to a mapped doc, a doc that names a renamed code file when the doc itself did not change, a sentence that is wrong but contains no listed phrase, and TypeScript or Lua doc comments. Review covers those.
