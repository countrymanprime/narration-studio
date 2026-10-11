# 0803. An extraction suggestion at 75 percent or more is applied and flagged Review, and one under 75 percent needs verification

**Status:** Accepted (owner ruling 2026-10-11; register row DQ-10 and ADR row A14 in the [ADR register](../prds/studio-next-adr-register.prd.md))
**Date:** 2026-10-11
**Supersedes:** [ADR 0020](0020-entity-extraction-precision-over-recall.md) and [ADR 0042](0042-proofing-suggestions-derive-from-current-entities-and-skip-auto-extracted-needs-review.md), to the extent that this rule replaces them (register row DQ-10). [ADR 0079](0079-every-downloadable-asset-is-listed-installed-verified-and-removed-through-one-registry-of-providers.md) is extended, not replaced.

## Context

[ADR 0020](0020-entity-extraction-precision-over-recall.md) makes Story Bible extraction favour precision over recall, so an unconfident entity is "Needs Review" and a weak candidate is dropped. [ADR 0042](0042-proofing-suggestions-derive-from-current-entities-and-skip-auto-extracted-needs-review.md) leaves auto-extracted Needs Review entities out of Proofing's suggestions. The owner ruled DQ-10 on 2026-10-11: the mock's rule is the spec. In the mock, `VERIFY_BELOW = 0.75` in `docs/research/mockups/studio-next/src/config/extraction.ts`, and `reasonsOf` and `autoStatus` in `docs/research/mockups/studio-next/src/selectors/extraction.ts` apply it (tests: `extraction.test.tsx`, `analysis-tools.test.tsx`, `import.test.tsx`).

## Decision

1. **A suggestion at 75 percent or more is applied and flagged Review.** It gets the status `accepted-auto`. It stays listed under Suggested until the narrator has looked at it.
2. **A suggestion needs verification when any of these holds** (`reasonsOf`): the confidence is null or under 0.75; the quote is not found in the text; a property, claim or speaker has no quote; or the entry it belongs to (for an alias, property, relationship or claim) is not in the Story Bible. It gets the status `needs-verification`. A null confidence is never confident.
3. **The narrator's decisions are `accepted` and `rejected`.** The statuses are `accepted-auto`, `needs-verification`, `accepted` and `rejected` (per the [Extraction and Analysis Tools PRD](../prds/studio-next-extraction-and-analysis-tools.prd.md), "Proposed Solution" item 1). A rejected suggestion stays as a tombstone so it is not offered again.
4. **The threshold and the reasons live in one place.** The Studio Next mock keeps them in a config module and one selector; the rebuild does the same, and no other code compares a confidence with 0.75.
5. **Analysis tools stay behind a click.** The optional tools (GLiNER, BookNLP, the local language model) are assets of the one registry in [ADR 0079](0079-every-downloadable-asset-is-listed-installed-verified-and-removed-through-one-registry-of-providers.md), installed only after a consent screen that shows what, how big, from which host and under which licence, with progress, cancel and remove. Nothing is downloaded without that click, and with nothing installed the rules baseline runs (SNX-Q5). There is no second installer (per the PRD, "Proposed Solution" item 6).
6. **[ADR 0020](0020-entity-extraction-precision-over-recall.md) and [ADR 0042](0042-proofing-suggestions-derive-from-current-entities-and-skip-auto-extracted-needs-review.md) stand where this rule does not reach.** Locked and manual entities, dialogue-cue rules and the id rules of [ADR 0345](0345-a-story-bible-entity-keeps-its-id-by-name-overlap-and-dialogue-cues-are-precision-first-rules.md) are untouched. How Proofing's "Suggest from manuscript" reads the tiers is not decided here; per the [Extraction and Analysis Tools PRD](../prds/studio-next-extraction-and-analysis-tools.prd.md), the extraction slice states it.

## Consequences

- A narrator reviews fewer suggestions, and a confident wrong one is applied, flagged Review, until the narrator rejects it. The flag is the safeguard that [ADR 0020](0020-entity-extraction-precision-over-recall.md) had in the stricter extraction.
- A quote the text does not contain is never accepted automatically, whatever the confidence.
- [ADR 0020](0020-entity-extraction-precision-over-recall.md) and [ADR 0042](0042-proofing-suggestions-derive-from-current-entities-and-skip-auto-extracted-needs-review.md) keep their Status lines. The extraction slice edits them after the owner accepts this ADR and the rule lands.
- [ADR 0079](0079-every-downloadable-asset-is-listed-installed-verified-and-removed-through-one-registry-of-providers.md) stays the one place an asset is listed, installed, verified and removed; the tools are catalogue entries.
- To change the rule, write a new ADR that supersedes this one.
