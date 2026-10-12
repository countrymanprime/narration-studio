---
name: adr-author
description: Scaffolds a new numbered ADR for an architecturally significant decision from the repo's template and handles the bookkeeping when a new decision supersedes an old one.
---

# adr-author

## When to use this

When an architecturally significant decision has just been made and applied to the code (a plan was approved and executed, or the user explicitly asked to record a decision). Significant means reversing it would restructure code across modules, or change a dependency, an interface between parts, a platform, a persistence strategy, a quality attribute or a construction technique every contributor follows (a CI gate, a test strategy, the release pipeline). The owner's examples: Go over Rust because Rust toolchain downloads made builds slow; pinning the Wails v3 beta because v3 has features v2 lacks.

If you cannot fill the template's **Significance** line, do not write an ADR. Record the decision where `docs/adr/README.md`, "When to write an ADR", sends it:

- What a page, dialog or control does, its copy, its shortcut: the PRD while it is being built, then the user guide page, plus a test.
- A token value, size, colour or component look: `docs/design/design-system.md`.
- A file the app writes and reads back: `docs/reference/data-files.md`.
- A threshold, default, field, error code or one function's rule: a doc comment and a test beside the code.
- The docs workflow, the agent train, repo housekeeping: `CONTRIBUTING.md`, `docs/operations/`, or `.claude/`.

Do not use this for a decision that's only proposed/being discussed — write it after the code change lands, not before. Proposals belong in a PRD.

## In an agent-train worker stream

An open product question in a PRD is answered in the PRD's Decisions Log (the PRD's recommendation, marked as defaulted). Write a Proposed ADR only when the question is architecturally significant; then comment on the decisions register [#993](https://github.com/countrymanprime/narration-utils/issues/993) so the owner can accept or change it. The Decision section still states what the code does, not what is hoped.

## Creating a new ADR

1. Read `docs/adr/README.md`'s index table to find the next available number (zero-padded, four digits, sequential — do not reuse or skip numbers). Check it again before your last push and take the next free number on a clash ([the agent train's serial points](../../../docs/operations/agent-train.md#serial-points)).
2. Read `docs/adr/template.md` for the section structure.
3. Write the new file at `docs/adr/NNNN-short-kebab-title.md` using that structure. The Significance line names what the decision changes and why reversing it is costly. The Context section states what was actually observed (a bug, a user request, a constraint hit during implementation) — link to it if there's a source — and ends with the Considered options line: each option weighed and why it lost. The Decision section names concrete files/components, not just the abstract principle. The Consequences section is honest about tradeoffs, not just upside.
4. Add a row to the index table in `docs/adr/README.md`, in numeric order. Run `node scripts/ci/adr-index.mjs --write` and `node scripts/ci/adr-topics.mjs --write`; if the topics check says no topic claims the ADR, add a title pattern or a pin in `scripts/ci/adr-topics.json`.
5. Never backdate or renumber an existing ADR to "make room" — new decisions always get the next number.

## Superseding an existing ADR

1. Identify the ADR being superseded and confirm its Decision genuinely conflicts with the new one (if it doesn't conflict, this might be a new, independent ADR instead — don't supersede something you don't need to).
2. Create the new ADR as above, adding `**Supersedes:** ADR-NNNN` under its front matter (right after the Date line).
3. Edit **only** the old ADR's `**Status:**` line, changing it to `Superseded by ADR-MMMM`. Do not touch its Context/Decision/Consequences — those stay as the historical record of what was decided and why, even though it no longer applies.
4. Update both ADRs' rows in the `docs/adr/README.md` index table (old one's Status column, new row for the new one).

## Marking an ADR as moved

Only in the owner's ADR audit. When an ADR's content has been copied to its proper home (the design system, a user guide page, `docs/reference/data-files.md`, a doc comment), edit **only** its `**Status:**` line to `Moved to <path>` (with an anchor where one exists), then run `node scripts/ci/adr-index.mjs --write` and `node scripts/ci/adr-topics.mjs --write`. The file stays: code and docs link to it.

## Constraints

- Never edit an ADR's Decision or Consequences text after it's Accepted, for any reason other than fixing a typo that doesn't change meaning. A change of mind is always a new, superseding ADR.
- Keep each ADR to one decision. If asked to record two unrelated decisions from the same session, write two ADRs.
