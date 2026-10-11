# 0792. A pronunciation records the source it came from, and there is no query status, query CSV or open-queries badge

**Status:** Proposed (register row DQ-11 and ADR row A11 in the [ADR register](../prds/studio-next-adr-register.prd.md); the owner accepts or rejects it on [#992](https://github.com/countrymanprime/narration-utils/issues/992))
**Date:** 2026-10-11
**Supersedes:** [ADR 0346](0346-a-pronunciation-carries-a-status-and-note-and-the-narrators-own-sits-beside-the-dictionarys-as-the-alternate.md), [ADR 0347](0347-the-pronunciation-query-export-is-csv-with-its-ids-last-and-a-formula-guard-and-is-a-download.md), [ADR 0352](0352-a-re-imported-query-answer-is-matched-by-entry-id-and-alias-index-and-a-blank-note-column-leaves-the-note-alone.md) and [ADR 0725](0725-the-rail-draws-a-count-badge-only-from-a-count-the-host-reports-and-the-product-is-named-studio.md), to the extent the register states: the query status, the query CSV export and import, and the rail badge that counts open queries.

## Context

The Story Bible tracks a workflow around each name. [ADR 0346](0346-a-pronunciation-carries-a-status-and-note-and-the-narrators-own-sits-beside-the-dictionarys-as-the-alternate.md) gives a pronunciation a `status` of `researched`, `query_sent` or `author_confirmed` and a note. [ADR 0347](0347-the-pronunciation-query-export-is-csv-with-its-ids-last-and-a-formula-guard-and-is-a-download.md) exports the names still to confirm as a CSV for the author. [ADR 0352](0352-a-re-imported-query-answer-is-matched-by-entry-id-and-alias-index-and-a-blank-note-column-leaves-the-note-alone.md) matches a re-imported answer by entry id and alias index. [ADR 0725](0725-the-rail-draws-a-count-badge-only-from-a-count-the-host-reports-and-the-product-is-named-studio.md) draws a rail badge from the number of open pronunciation queries.

The owner ruled DQ-11 on 2026-10-11: "No query or confirmed workflow; pronunciation has a source, as in the mock." In the mock, `docs/research/mockups/studio-next/src/providers/pronunciation.ts` gives a `PronunciationProvider` with `sources()`, `defaultSource()` and `candidate(word, source)`. A source has a kind (`generated`, `lookup` or `manual`) and may need the network or a local dictionary. A candidate is a pronunciation or the reason the source cannot give one. `src/domain/schemas.ts` stores how a word is said with the id of the source behind it, and a pronunciation with no source recorded was typed by the narrator. The mock has no query status, query list or export, and its rail has no Story Bible count. The [Script and Story Bible PRD](../prds/studio-next-script-and-story-bible.prd.md) ("Proposed Solution" item 1) says the same.

## Decision

1. **A pronunciation stores its text and the id of its source.** The source is a registered one or `manual`. The UI shows the source's icon and name and lets the narrator switch the source or type the pronunciation. Screens ask the pronunciation provider for sources and candidates, and never know how a candidate was made.
2. **There is no query or confirmed workflow.** The `query_sent` and `author_confirmed` states, the list of names still to confirm, the author query CSV export and import, and the rail badge that counts open queries are not part of the product. The mock's rail has no Story Bible count.
3. **Superseded to that extent only.** [ADR 0346](0346-a-pronunciation-carries-a-status-and-note-and-the-narrators-own-sits-beside-the-dictionarys-as-the-alternate.md) stands for the rest of what it decides, such as the narrator's own pronunciation beside the dictionary's as the alternate, until the owner's rulings and the Story Bible slices say otherwise. [ADR 0725](0725-the-rail-draws-a-count-badge-only-from-a-count-the-host-reports-and-the-product-is-named-studio.md) stands for the other rail counts, which belong to the shell PRD.
4. **Existing data is not migrated.** An old `note` stays readable as a note, and a stored `status` is ignored on read (per the PRD's Risks section).
5. **The removal is not done by this ADR.** It lands with the Story Bible swap slice (SNB-8), which deletes the queries page, the export and import bindings with their schemas, goldens and wire rows, and the badge. Until that slice lands, the old behaviour is in force.

## Consequences

- A name has one provenance (a source or the narrator's typing) and no state to chase. The narrator does not wait on an author's answer to finish a name.
- Authors can no longer answer a list of questions by CSV. The owner's ruling accepts that.
- [ADR 0346](0346-a-pronunciation-carries-a-status-and-note-and-the-narrators-own-sits-beside-the-dictionarys-as-the-alternate.md), [ADR 0347](0347-the-pronunciation-query-export-is-csv-with-its-ids-last-and-a-formula-guard-and-is-a-download.md), [ADR 0352](0352-a-re-imported-query-answer-is-matched-by-entry-id-and-alias-index-and-a-blank-note-column-leaves-the-note-alone.md) and [ADR 0725](0725-the-rail-draws-a-count-badge-only-from-a-count-the-host-reports-and-the-product-is-named-studio.md) keep their Status lines. The Story Bible swap slice edits them once the owner accepts this ADR, per the register's migration-period rule.
- The swap changes bindings and a persisted file's read path, so it follows the `wire-contract-change` steps.
- To change the rule, write a new ADR that supersedes this one.
