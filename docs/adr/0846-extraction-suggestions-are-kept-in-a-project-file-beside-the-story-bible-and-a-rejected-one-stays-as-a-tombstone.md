# 0846. Extraction suggestions are kept in a project file beside the Story Bible, and a rejected one stays as a tombstone

**Status:** Proposed
**Date:** 2026-10-11
**Supersedes:** none. [ADR 0803](0803-an-extraction-suggestion-at-75-percent-or-more-is-applied-and-flagged-review-and-one-under-75-percent-needs-verification.md) rules the 75% threshold and is not repeated here.

## Context

The Studio Next mock keeps extraction suggestions with the book data: each has a kind, a payload, the quotes that back it, a confidence, a source and a status, and a rejected one stays so it is not offered again (`docs/research/mockups/studio-next/src/state/extractionCore.ts`, `src/domain/extraction.ts`). The pure rule, evidence check and fingerprint are in `internal/extraction`. The host has no place yet to keep the suggestions between runs.

## Decision

1. **The file.** Suggestions are kept in `<project>/ManuscriptGuide/suggestions.json` (`store.File`, `apps/desktop/internal/extraction/store`): `{"version": 1, "suggestions": [...]}`, each suggestion `{id, kind, payload, entryId, evidence, confidence, source, status, unverifiedQuote, reason, fp, flag, note, chapterId, applied, createdAt}`. It is read through `persist` as narrator data: a file that does not parse, or that breaks a rule below, is kept aside as `suggestions.json.corrupt-<time>` and an empty list starts; a file with a newer `version` is refused and never overwritten. A write goes to a temporary file and is renamed into place.
2. **Where it sits.** The file is inside `ManuscriptGuide/`, beside `manuscript_guide.json`, so replacing the manuscript or Clear project data removes it with the Story Bible (`resetDerived` already removes that folder). A re-import that resets nothing keeps it.
3. **The rule runs at ingest.** An ingest looks every quote up in the manuscript (the named paragraph, then its chapter, then the book) and stores the offsets and text the check finds, never a source's own. It attaches the entry if the Story Bible has one, and stores the status and reason strings the rule gives (ADR 0803). `Settle` attaches a waiting suggestion to an entry added later and recomputes the status of undecided suggestions only; an accepted or rejected one is never touched.
4. **Tombstones.** The fingerprint (`extraction.Fingerprint`) ignores case, spacing and typographic quotes. An offer whose fingerprint equals the one a stored suggestion was first offered with, or the fingerprint of its payload now, is dropped, whatever its status. A rejected suggestion therefore stays in the file with its fingerprint. A tombstone is never removed except by a replace or a clear.
5. **Decisions change the status only.** `Accept` (with an optional edited payload of the same kind), `Reject` and `Review` change the status, clear the reason and return the suggestion as it was, so the caller can undo with `Restore`. A rejected suggestion cannot be accepted; only an automatic acceptance can be reviewed. Changing the Story Bible is the apply step's, not the store's.
6. **Claims are applied as properties.** The real Story Bible entry has `properties` and `personality_notes` but no separate says, does and knows fields. An accepted claim is applied as a property keyed `Says` (claim `talk`), `Does` (`act`) or `Knows` (`know`), the mock's labels, with the claim's text as the value. The apply step follows this and does not choose again.
7. **The caps.** At most 20000 suggestions, tombstones included; 32 MiB per file; 8 KiB per text; 200 aliases or chapters per payload; 20 quotes per suggestion. Each is at least the importer's (5000 rows, 8 KiB a field, 2 MiB a file), so an import that passed can always be stored. A read that breaks a cap, a rule of the fields (an unknown kind, status or source; a confidence outside 0 to 1; a negative offset or one that does not fit its quote; a payload that does not fit its kind; a repeated id) loads nothing. An ingest that would break one stores nothing and says why.
8. **Text is data.** Quotes, notes and payload text are stored and drawn as text. The package opens only its own file and runs and fetches nothing; no text is used as a path.

## Consequences

- The apply step, the wire and the UI read and write one store, and the Go type is what the wire's golden is written from.
- A hand-edited file can change what the narrator is asked to verify; a suggestion never edits a locked entry (the apply step's rule). The threat model records this as row 6v.
- The whole file is read on every call; at the cap that is tens of megabytes, which a narrator's project is not expected to reach.
- Clearing on replace loses every suggestion and tombstone of the old manuscript, so the same suggestions can be offered again for a new one.
