---
name: code-standards
description: The per-language standard for code an agent writes in this repo (Go, TypeScript/React, Python, Lua) - when to extract a function or type, error handling, naming, tests and what the linters already enforce. Load before writing or reviewing non-trivial code under src/, and when a reviewer asks whether code is too big, too abstract or too clever.
---

# code-standards

## Why this exists

The linters fail the build on syntax-level problems. Design skills judge structure at package level. Neither says how to write a function, when a second caller justifies an abstraction, or what a test should look like. This skill holds those per-language habits so a plan and a review start from the same answer. Where a rule is a judgement and no tool checks it, the reference says so.

## When to use this

Before writing or reviewing code under `src/` or `scripts/` beyond a one-line fix. Skip it for docs-only changes.

## What it does not repeat

| Question | Where it lives |
| --- | --- |
| Does the change keep one responsibility, use ports, respect the fences? | `solid-design-review`, `design-principles` |
| How to split a Go package | `go-package-split` |
| Which UI primitive to use, and the UI rules | `frontend-primitives` |
| The smallest complete change, reuse order, what never to skip | [ponytail.md](../agent-train/references/ponytail.md) |
| Doc comments and prose | `docs-style` and its `references/` |
| Wire contracts, REAPER commands, sidecars | `wire-contract-change`, `reaper-command-add`, `sidecar-add` |
| What "done" requires | `.claude/rules/definition-of-done.md` |

## Standards that hold in every language

1. **Extract on the second use or for a name.** Pull code into a function when a second caller exists or when the name explains a block better than its comments. A helper with one caller and no explanatory name stays inline. Do not add a type, option, interface or config for a case nobody has.
2. **A function does one thing at one level.** If you must scroll or number its steps to read it, split by step. Length is a signal, not a limit: no tool in this repo caps function size, so a long function needs a reason a reviewer can see (a flat table, a state machine).
3. **Handle an error where you can act on it; otherwise pass it up with context.** Never swallow one. A caught error is logged, shown, retried or converted to a typed result. Validate at trust boundaries (a file from someone else, a sidecar output, a bridge reply, a download) and trust values inside them.
4. **Name by role, not by type or history.** `chapterOrder`, not `list2`; no `Manager`, `Helper` or `Util` for a thing with a more exact name. A boolean reads as a question (`isStale`). Match the neighbouring files' vocabulary, and the product's words in `docs/design/design-system.md`.
5. **Comments carry only the why.** The contract and non-obvious reason go in a comment; what the code does goes in its names. A comment that restates the next line is deleted. Format rules are in `docs-style`.
6. **A test is a small story: arrange, act, assert one behaviour.** Name it for the behaviour, not the function. Cover the edge states `definition-of-done.md` lists (empty, huge, Unicode, failed). Use real fakes behind ports, not mocks of internals. A test never needs another test to run first.
7. **Delete rather than comment out.** Dead code, unused parameters and commented blocks go; git keeps them.
8. **Let the tool format.** Never hand-format against `gofmt`, Prettier, ruff or StyLua.

## Per language

Load the reference for each language you touch. Each lists what the repo's tools enforce, then the judgement rules.

- Go (`src/studio/desktop`): [references/go.md](references/go.md)
- TypeScript and React (`src/studio/ui`): [references/typescript-react.md](references/typescript-react.md)
- Python (`src/studio/libs/python`, `src/studio/sidecars`, `scripts`): [references/python.md](references/python.md)
- Lua (`src/studio/integrations/reaper`): [references/lua.md](references/lua.md)

## Using it in a review

Cite a rule by its number and tie it to a line. Distinguish an enforced rule (the tool fails) from a judgement (a finding needs a fix or a one-line reason in the PR). Do not raise a style preference the tools and references do not hold.

## What this skill is not

It does not replace the linters, `solid-design-review` or code review, and it starts no repo-wide cleanup: it applies to code you write or touch.
