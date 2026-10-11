---
name: adr-author
description: Scaffolds a new numbered ADR from the MADR template and handles the bookkeeping when a new decision supersedes an old one.
---

# adr-author

## When to use this

When a decision has just been made and applied to the code (a plan was approved and executed, or the user explicitly asked to record a decision) and it belongs in `docs/adr/` per that folder's own rules — one decision per ADR, concrete not aspirational.

Do not use this for a decision that's only proposed/being discussed — write it after the code change lands, not before. Proposals for future (not-yet-built) work belong in `docs/architecture/*.md` instead.

## In an agent-train worker stream

No human is watching, so a question a PRD leaves open is not left unwritten: take the PRD's stated recommendation, write the ADR with `**Status:** Proposed`, and comment on [#510](https://github.com/countrymanprime/narration-utils/issues/510) so the owner can accept or change it. This is the one case where a decision is recorded before the owner has settled it; the Decision section still states what the code does, not what is hoped. Accepted ADRs follow the rest of this skill.

## Creating a new ADR

1. Read `docs/adr/README.md`'s index table to find the next available number (zero-padded, four digits, sequential — do not reuse or skip numbers). In an agent-train worker stream, take the number from your lane's ADR block instead (see the Lanes table in [the agent train](../../../docs/operations/agent-train.md#lanes)), check `docs/adr/` for the next free number inside it at write time and again before your last push, and renumber inside the block on a clash.
2. Read `docs/adr/template.md` for the section structure.
3. Write the new file at `docs/adr/NNNN-short-kebab-title.md` using that structure. The Context section states what was actually observed (a bug, a user request, a constraint hit during implementation) — link to it if there's a source. The Decision section names concrete files/components, not just the abstract principle. The Consequences section is honest about tradeoffs, not just upside.
4. Add a row to the index table in `docs/adr/README.md`, in numeric order. Run `node scripts/ci/adr-index.mjs --write` and `node scripts/ci/adr-topics.mjs --write`; if the topics check says no topic claims the ADR, add a title pattern or a pin in `scripts/ci/adr-topics.json`.
5. Never backdate or renumber an existing ADR to "make room" — new decisions always get the next number.

## Superseding an existing ADR

1. Identify the ADR being superseded and confirm its Decision genuinely conflicts with the new one (if it doesn't conflict, this might be a new, independent ADR instead — don't supersede something you don't need to).
2. Create the new ADR as above, adding `**Supersedes:** ADR-NNNN` under its front matter (right after the Date line).
3. Edit **only** the old ADR's `**Status:**` line, changing it to `Superseded by ADR-MMMM`. Do not touch its Context/Decision/Consequences — those stay as the historical record of what was decided and why, even though it no longer applies.
4. Update both ADRs' rows in the `docs/adr/README.md` index table (old one's Status column, new row for the new one).

## Constraints

- Never edit an ADR's Decision or Consequences text after it's Accepted, for any reason other than fixing a typo that doesn't change meaning. A change of mind is always a new, superseding ADR.
- Keep each ADR to one decision. If asked to record two unrelated decisions from the same session, write two ADRs.
