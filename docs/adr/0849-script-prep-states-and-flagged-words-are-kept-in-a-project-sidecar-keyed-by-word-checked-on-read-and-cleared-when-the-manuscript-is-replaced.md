# 0849. Script prep states and flagged words are kept in a project sidecar keyed by word, checked on read and cleared when the manuscript is replaced

**Status:** Proposed
**Date:** 2026-10-11
**Supersedes:** none. [ADR 0792](0792-a-pronunciation-records-the-source-it-came-from-and-there-is-no-query-status-query-csv-or-open-queries-badge.md) rules that a pronunciation records its source, and [ADR 0820](0820-a-bookmark-is-a-spot-kept-in-a-project-sidecar-checked-on-read-and-cleared-when-the-manuscript-is-replaced.md) the sidecar pattern this follows; neither is repeated here.

## Context

The Studio Next mock's Script page gives each chapter a prep state (not started, in progress, prepped) and lets the narrator flag a word in the text for pronunciation, then say how it is said and where the value came from (`docs/research/mockups/studio-next/src/domain/schemas.ts` `PrepState` and `Pronunciation`; `src/state/commands/script.ts`; `src/selectors/bible.ts`). The host keeps neither. The old chapter status (`manuscriptSetChapterStatus`) is the recording stage, a different thing, and a flagged word is not a Story Bible name, so neither the reader's notes nor the Story Bible is the place for them.

## Decision

1. **One sidecar for both.** The prep states and the flagged words are kept in `<project>/narration-utils/script-prep.json` (schema version 1), beside `marks.json` and `bookmarks.json`, because both are the narrator's preparation of the current text and both lose their meaning when the text is replaced. It is narrator data read through `persist`: a corrupt file is kept aside and a fresh one starts, a newer version is refused and never overwritten, and a write is atomic.
2. **A word is its text, not a place.** A flag is a range of one paragraph; its word is the manuscript's own text for the range, lower-cased as the key, so one say-value serves every place the word is flagged, as in the mock. The say-value is kept while any flag of the word remains and dropped with the last one (the mock's `addWord` and remove rule), so a value never outlives every reason it was set.
3. **The value carries its source.** A say-value is stored with the id of a registered pronunciation source, or `manual` when the narrator typed it (ADR 0792). The host refuses a source it does not list.
4. **The host works out the status.** Each word carries `set`, `not_set` or `not_flagged`, so no page repeats the mock's `pronStatus` rule.
5. **Stale, never moved.** Every flag is checked against the current text on every read; one whose line is gone, whose range no longer fits or whose words changed is reported stale with the reason, as marks and bookmarks are (ADR 0382, ADR 0820).
6. **Cleared with the manuscript.** A confirmed replace and Clear project data remove the file (`resetDerived`); a re-import without a reset keeps it.
7. **Caps.** At most 10000 flags, 5000 chapter states, 80 UTF-16 units a flagged range, 200 a say-value (one line, no control character), and 4 MiB a file. A file that breaks a cap or a rule is corrupt.

## Consequences

- Prep state and flagged words survive a re-import without a reset and are lost with a replace, the same as marks and bookmarks.
- Two places with the same word share one say-value; a narrator who wants two readings of one spelling cannot keep both. The mock has the same limit.
- The mock's per-chapter "Mark reviewed" banner is not kept: the host has no source for it.
- A hand-edited file can name any source id that matches the id pattern; the threat model records the file.
