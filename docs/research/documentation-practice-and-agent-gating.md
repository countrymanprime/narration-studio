# Documentation practice, slop control and agent gating

Researched 2026-10-10 for a plan to add documentation skills and gates for agents. Sources were fetched by three research passes. "Unverified" marks a claim no fetched page backed.

## What the repo already has

| Concern | Existing mechanism | Gap |
| --- | --- | --- |
| Markdown style | `markdownlint-cli2` on changed files ([ADR 0415](../adr/0415-while-pages-is-paused-docs-are-checked-by-lychee-and-a-changed-file-markdownlint-not-by-building-the-site.md)) | No prose or slop rules |
| Links and anchors | `lychee --offline` on every PR (`.github/workflows/docs.yml`) | Does not check backticked file paths or identifiers |
| Index and diagram integrity | `adr-index`, `prd-references`, `mermaid-diagrams`, `layout` scripts in `pnpm check` | None found |
| Docs follow code | `feature-cleanup` step 4 (prose advice), PR template (no docs checkbox), `doc-screenshot-sync` | Nothing fails when code changes and docs do not |
| Comment conventions per language | None. Ruff has no `D` rules, golangci-lint runs `standard` plus `depguard` and `gosec`, ESLint has no TSDoc plugin | No stated rule for doc comments in Go, TS, Python or Lua |
| Doc structure | A directory convention (`architecture`, `guides`, `operations`, `prds`, `research`, `utilities`, `adr`) | Not stated as a rule, so pages mix types |

Stale items in existing skills, found while reading them:

- `doc-screenshot-sync` and `feature-cleanup` name `docs/guides/using-the-app.md`. That path is now the folder `docs/guides/using-the-app/`.
- `full-verification-gate` step 3 says the Lua directory has no automated tests. `CLAUDE.md` and [ADR 0066](../adr/0066-the-lua-bridge-is-tested-by-a-harness-under-lua-5-4-and-reaper-api-behaviour-is-checked-in-reaper.md) say the bridge harness covers it.

## Best practice by stack

| Stack | Rules that matter | Machine check | Source |
| --- | --- | --- | --- |
| Go | Every exported name has a comment starting with its name, in full sentences. One `// Package x` comment per package. Doc links are `[Name]`. `ExampleXxx` functions with `// Output:` are run by `go test`. | `go test` for examples, `gofmt` for layout. Missing comments: revive `exported` (unverified, not fetched). | [go.dev/doc/comment](https://go.dev/doc/comment), [go.dev/blog/examples](https://go.dev/blog/examples) |
| TypeScript | TSDoc tags, no JSDoc types. `@param name - text`, `@returns`, `@remarks`, `@example`, `@deprecated`, `{@link}`. Turn on TypeDoc `notDocumented` for shared wire-contract modules only. | `eslint-plugin-tsdoc` (syntax), TypeDoc validation with `treatWarningsAsErrors`. | [tsdoc.org](https://tsdoc.org/), [typedoc.org validation](https://typedoc.org/documents/Options.Validation.html) |
| React and Storybook | `tags: ['autodocs']` builds the props table from TSDoc on props, so the comment is the single source. MDX only for prose a story cannot express. `a11y.test: 'error'` fails CI, `'todo'` does not. | The existing `pnpm --dir apps/ui atlas` (axe, `play()`) | [Autodocs](https://storybook.js.org/docs/writing-docs/autodocs), [a11y testing](https://storybook.js.org/docs/writing-tests/accessibility-testing) |
| Python | One docstring style throughout (Google: one-line summary under 80 characters, then `Args:`, `Returns:`, `Raises:`). Module docstring on every module. Describe behaviour and side effects, not implementation. | ruff `D` rules with `lint.pydocstyle.convention`, scoped by `per-file-ignores`. Doctest: `python -m doctest`. | [Google guide 3.8](https://google.github.io/styleguide/pyguide.html), [ruff settings](https://docs.astral.sh/ruff/settings/), [doctest](https://docs.python.org/3/library/doctest.html) |
| Lua (REAPER) | LuaLS annotations: `---@param`, `---@return`, `---@class (exact)`, `---@alias`. Keep REAPER API stubs in a `---@meta` file. Narrow `---@diagnostic disable` with a reason. | `lua-language-server --check`. The exit code is unverified, so parse its report. | [LuaLS annotations](https://luals.github.io/wiki/annotations/), [usage](https://luals.github.io/wiki/usage/) |

Stack-agnostic:

- **Diátaxis**: each page is one of tutorial, how-to, reference or explanation. This is a convention, with no tool to check it ([diataxis.fr](https://diataxis.fr/)).
- **Docs as code**: docs in git, reviewed with the code, tested automatically, and a feature without docs does not merge ([Write the Docs](https://www.writethedocs.org/guide/docs-as-code/)).
- **MADR 4.0**: Context and Problem Statement, Considered Options, Decision Outcome. The repo's [ADR](../adr/README.md) format already does the equivalent ([adr.github.io/madr](https://adr.github.io/madr/)).
- **arc42 and C4** map to `docs/architecture`. They add nothing the codebase map and Mermaid diagrams lack ([arc42](https://arc42.org/overview), [C4](https://c4model.com/)).
- **Google developer style**: second person, active voice, sentence-case headings, conditions before instructions, descriptive link text ([highlights](https://developers.google.com/style/highlights)).

## Keeping docs short and free of AI filler

How the "humanizer"/"unslop" family of skills works ([blader/humanizer SKILL.md](https://raw.githubusercontent.com/blader/humanizer/main/SKILL.md)):

- It is a prompt, with no script and no score. It lists 26 named patterns in six groups (staging, rhythm, inflation, formatting, chat residue, re-explaining).
- Workflow: mark the tells, draft, check, rewrite. Its best rule is: keep every supported claim and add no new facts, names, numbers or citations.
- Some patterns justify an edit on one sighting. Others count only when several appear together.
- It edits prose only and leaves code, paths, YAML and link targets alone.
- Its check is the same model re-reading its own work, which is weak. I did not read the other "unslop" skills' source.

Wikipedia's [Signs of AI writing](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing) says the signs are descriptive and shift between model generations. One or two "AI words" are coincidence, and many in one passage is a signal. Detectors are unreliable.

Agent-facing files: Anthropic's [skill authoring guide](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices) and [Claude Code best practices](https://code.claude.com/docs/en/best-practices) say to keep a skill body under 500 lines, ask of each line whether removing it causes a mistake, link instead of copying, and use scripts for deterministic checks. A study reported in an arXiv abstract found LLM-generated context files lowered task success and raised cost by over 20% ([arxiv 2602.11988](https://arxiv.org/abs/2602.11988), abstract only, Python tasks only).

Split of mechanisms:

- **Deterministic**: a banned-phrase list with near-zero legitimate use (for example "delve", "serves as", "it is worth noting", "in conclusion", "seamless", "I hope this helps"). Words with real technical uses ("robust", "leverage", "comprehensive") warn only. Skip code blocks, quotations and ADR titles. Do not gate on em-dash or triad counts. Vale's `existence` rule fits this ([docs.vale.sh](https://docs.vale.sh/checks/existence)). A Node script in `scripts/ci` fits the repo's existing pattern without a new binary.
- **LLM review, diff only**: flags what a list cannot: restating the heading, narrating the document, explaining what the code shows, unverifiable claims ("ensures", "robust"), time claims without a date ("currently"), and sections that duplicate a generated or linked source. It proposes cuts, not rewrites, and may not add facts.

Accuracy rules: state only what a reader can check against code, a command or a test. Link to the source. Keep one source of truth. Generate reference material (`docs/ui/` already is).

## Gating agents so docs stay current

| Mechanism | Strength | Weakness | Cost here |
| --- | --- | --- | --- |
| Docs-impact map script: changed code path implies a doc path must change, with an opt-out that needs a reason | Deterministic, visible failure | Gameable by a trivial doc edit; needs a maintained map | Low: one Node script, same shape as `scripts/ci/*` |
| Claude Code `Stop` and `SubagentStop` hook runs the same script and exits 2 ([hooks docs](https://code.claude.com/docs/en/hooks)) | Catches the agent before it says "done" | Loops forever unless it honours `stop_hook_active` (community source only); exit 1 does nothing | Low: one `settings.json` entry |
| PR template checkbox and CODEOWNERS | Explicit, auditable opt-out ([Kubernetes release-note pattern](https://kubernetes.dev/docs/guide/release-notes)) | Agents tick boxes mechanically; CODEOWNERS forces review, not change | Low |
| Reference check: every backticked path or command in a doc exists | Catches renamed or deleted files that lychee misses | False positives on backticked words that are not paths | Medium: custom script (no source found for an existing tool) |
| Generated reference and golden fixtures (`docs/ui/`, wire contracts) | Strongest: the doc fails when behaviour changes | Covers only what is generated | Already in place |
| `last_reviewed` plus source-file front matter | Ties a page to its code | An agent can bump the date unread ([example](https://skillsmp.com/creators/smarkwal/jarhc/agents-skills-docs-review)) | Medium; defer |
| Swimm, Mintlify automations | Symbol-coupled docs; auto PRs | Commercial, own doc format, fix drift after merge ([Swimm](https://docs.swimm.io/features/keep-docs-updated-with-auto-sync/)) | High; not recommended |

Constraints from the sources:

- A GitHub path-filtered required check that is skipped stays pending forever. `docs.yml` already avoids this by running on every PR, so a new docs job should follow it ([GitHub docs](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks)).
- Guidance in `CLAUDE.md` is advisory and hooks are deterministic, so the enforcement belongs in the hook and in `pnpm check`.

## Not found

No source for a tool that checks backticked symbols in docs, for Rust or Go proposal-process doc gates, for measured agent gaming of docs gates, or for the exit code of `lua-language-server --check`.
