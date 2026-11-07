---
name: docs-style
description: Rules for writing or editing any documentation in this repo (docs/, READMEs, ADRs, PRDs, skills, CLAUDE.md, code comments) so it stays accurate, complete for its reader, and free of filler. Load before writing prose or doc comments.
---

# docs-style

## Why this exists

Agent-written docs drift three ways: they go stale when code changes, they fill up with filler that says nothing a reader can check, and they get so terse that a reader new to the subject cannot use them. This skill is the writing standard that keeps all three out: cut words that carry nothing, keep the words that carry context, an example or a next step. `doc-unslop` reviews against it and `doc-impact-check` finds which docs a change owes.

## Rules

1. **State only what code, a command or a test can show.** Name the file, symbol, command or ADR that proves each claim. A claim with no checkable source is a guess; cut it or find the source. A sentence that gives the reader context, an example or a next step is not a new claim; it needs no source beyond the facts in it.
2. **Link, do not copy.** One fact lives in one place. If a generated page (`docs/ui/`, `model-provenance.md`, the ADR index) or another doc already says it, link to it. Copied tables, lists of files and command output go stale first.
3. **One page, one type** (Diátaxis). Put it where its type lives and do not mix:
   - Reference: what exists, mirroring the code (`docs/architecture/`, `docs/utilities/`, `docs/design/`, `docs/reference/`).
   - How-to and procedure: steps to reach a goal (`docs/operations/`, `docs/guides/`).
   - Explanation: why it is built this way (`docs/architecture/` prose, and ADRs for decisions).
   - Plan: intent, not a claim that it exists (`docs/prds/`, `docs/roadmap.md`).
   - Evidence: dated research (`docs/research/`). Date it and do not keep it current.
   - Onboarding, the one deliberate mix: a short tutorial (before you start, numbered steps with their results, what next) followed by the page's how-to sections (`docs/guides/using-the-app/getting-started.md`).

   The skeleton for each type is in [references/readers-and-types.md](references/readers-and-types.md).
4. **Say what is, in the active voice, once.** No restating the heading, no summary of what you just said, no "this section describes". A page may repeat in one sentence a fact it needs from another page, with a link to where the fact lives, so it can be read on its own. Put conditions before instructions. Use sentence-case headings and descriptive link text.
5. **Date anything that can age.** "Currently", "now", "recently" need a date or version, or go. Prefer a fact that stays true (`requires Go 1.26`) over a status.
6. **No embellishment.** See `doc-unslop` for the patterns. Ban sales words ("seamless", "robust", "powerful"), inflated significance, vague attribution ("studies show") and chat residue.
7. **Record the reason for a choice where the current state lives.** Only a decision that reshapes the whole repo is an ADR (`docs/adr/README.md`, "When to write one"); almost nothing is. Put the reason beside the choice: a doc comment, the design system, or an explanation section.
8. **Keep size proportional to the reader.** A skill body stays under 500 lines (Anthropic's limit). A source file's docs stay under the 800-line ceiling in the repo rules. For `CLAUDE.md`, skills and rules, whose reader is an agent, delete any line whose removal would not cause a mistake. For a user guide, too short is a failure as much as too long: a step with no result, a term a newcomer does not know, or a page with no example or way on. The length table in [references/readers-and-types.md](references/readers-and-types.md#length) gives rules of thumb per type.
9. **Say what is pending.** A check not run, a result awaiting the owner or audio hardware: write "pending" with who owns it. Never imply it passed.
10. **Write for a named reader.** The first sentence or two of a user-facing page say who it is for and what it gets them. Give that reader what they lack: what they need before they start, a worked example with concrete values, the result of each step (a screenshot where the result is visual), the exact message of a likely failure with its fix, and a `## What next` list of two to five links before the footer. The readers and what each comes with are in [references/readers-and-types.md](references/readers-and-types.md#readers). Before calling a guide page done, run [references/review-checklist.md](references/review-checklist.md).

11. **Describe what exists.** Write what a thing is and does now, or what it will do once the change is done. Leave out what it lacks, what it replaced and any state that is gone ("no longer", "there is no", "retired", "formerly", "used to"): git history and dated research hold the past. Keep a negation only where it is the rule itself, a prohibition the reader must follow ("never merge", "commit no other images"). `docs-slop` warns on the phrases.

## Code comments by language

Comment the contract and the non-obvious why. Do not narrate what the code shows. Details and checks in `references/`:

- Go: [references/go.md](references/go.md)
- TypeScript and React: [references/ts-react.md](references/ts-react.md)
- Python: [references/python.md](references/python.md)
- Lua: [references/lua.md](references/lua.md)

## Where a change's docs go

`doc-impact-check` maps changed paths to the docs they owe. A change to a trust boundary (untrusted input crossing in, a new privilege or network egress) also owes `docs/architecture/threat-model.md`, and `SECURITY.md` when a reporter's scope changes. A file the app writes and reads back owes a row in `docs/reference/data-files.md` instead ([CLAUDE.md](../../../CLAUDE.md), step 6).

## What this skill is not

It does not lint. `markdownlint`, `lychee`, `scripts/ci/docs-slop.mjs` (filler phrases) and `scripts/ci/docs-references.mjs` (dead backticked paths) run in `pnpm check` and `docs.yml`. It does not judge a diff for filler; that is `doc-unslop`.
