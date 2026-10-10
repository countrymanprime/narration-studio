---
name: docs-style
description: Rules for writing or editing any documentation in this repo (docs/, READMEs, ADRs, PRDs, skills, CLAUDE.md, code comments) so it stays accurate, thorough and short. Load before writing prose or doc comments.
---

# docs-style

## Why this exists

Agent-written docs drift two ways: they go stale when code changes, and they fill up with filler that says nothing a reader can check. This skill is the writing standard that keeps both out. `doc-unslop` reviews against it and `doc-impact-check` finds which docs a change owes.

## Rules

1. **State only what code, a command or a test can show.** Name the file, symbol, command or ADR that proves each claim. A claim with no checkable source is a guess; cut it or find the source.
2. **Link, do not copy.** One fact lives in one place. If a generated page (`docs/ui/`, `model-provenance.md`, the ADR index) or another doc already says it, link to it. Copied tables, lists of files and command output go stale first.
3. **One page, one type** (Diátaxis). Put it where its type lives and do not mix:
   - Reference: what exists, mirroring the code (`docs/architecture/`, `docs/utilities/`, `docs/design/`, `docs/reference/`).
   - How-to and procedure: steps to reach a goal (`docs/operations/`, `docs/guides/`).
   - Explanation: why it is built this way (`docs/architecture/` prose, and ADRs for decisions).
   - Plan: intent, not a claim that it exists (`docs/prds/`, `docs/roadmap.md`).
   - Evidence: dated research (`docs/research/`). Date it and do not keep it current.
4. **Say what is, in the active voice, once.** No restating the heading, no summary of what you just said, no "this section describes". Put conditions before instructions. Use sentence-case headings and descriptive link text.
5. **Date anything that can age.** "Currently", "now", "recently" need a date or version, or go. Prefer a fact that stays true (`requires Go 1.26`) over a status.
6. **No embellishment.** See `doc-unslop` for the patterns. Ban sales words ("seamless", "robust", "powerful"), inflated significance, vague attribution ("studies show") and chat residue.
7. **Record decisions in an ADR, not in prose.** A "why" paragraph with no ADR behind it is opinion. Use `adr-author`.
8. **Keep size proportional.** A skill body stays under 500 lines (Anthropic's limit). A source file's docs stay under the 800-line ceiling in the repo rules. For `CLAUDE.md` and skills, delete any line whose removal would not cause a mistake.
9. **Say what is pending.** A check not run, a result awaiting the owner or audio hardware: write "pending" with who owns it. Never imply it passed.

## Code comments by language

Comment the contract and the non-obvious why. Do not narrate what the code shows. Details and checks in `references/`:

- Go: [references/go.md](references/go.md)
- TypeScript and React: [references/ts-react.md](references/ts-react.md)
- Python: [references/python.md](references/python.md)
- Lua: [references/lua.md](references/lua.md)

## Where a change's docs go

`doc-impact-check` maps changed paths to the docs they owe. Trust-boundary changes also owe `docs/architecture/threat-model.md` and `SECURITY.md` ([CLAUDE.md](../../../CLAUDE.md), step 6).

## What this skill is not

It does not lint. `markdownlint`, `lychee`, `scripts/ci/docs-slop.mjs` (filler phrases) and `scripts/ci/docs-references.mjs` (dead backticked paths) run in `pnpm check` and `docs.yml`. It does not judge a diff for filler; that is `doc-unslop`.
