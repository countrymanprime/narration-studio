# 0844. The narrator can retype a finding, and the choice is kept beside the decisions as an append-only entry

**Status:** Proposed
**Date:** 2026-10-11
**Supersedes:** none. It adds to the review history of [ADR 0120](0120-findings-are-read-and-decided-through-four-generic-bindings-and-a-decision-carries-the-evidence-version-it-was-made-against.md) and leaves the cleared count of ADR 0793 alone.

## Context

The Studio Next mock's Inspector has a select, `#ptype` ("Type of finding"), over ten words: misread, skip, mouth, pron, pacing, repeat, plosive, noise, takes and breath. A real finding has an analyzer-assigned `category` and, for some analyzers, an `evidence.kind`. Nothing lets the narrator say a note is a different kind of problem than the analyzer thought (`docs/research/studio-next-proof-audit.md`, "Inspector: type select").

## Decision

1. `FindingReviewState` gains an optional `type`, one of the ten words above (`findings.NoteTypes`). It is absent until the narrator chooses one.
2. The choice is an entry in the `types` list of `review.json`, beside `decisions`, carrying the finding id, the `evidence_version` it was made against, the word and a timestamp. Entries are appended and never edited. The latest entry per finding wins. An entry with an empty word returns the finding to the analyzer's own word.
3. `FindingsSetType(id, evidenceVersion, type)` records it. It refuses an empty id, a word outside the ten, a finding the store no longer has and a stale `evidenceVersion`, the last with the sentence `FindingsReview` uses. Choosing the word the analyzer's mapping already gives records an empty word, so `review.type` stays absent.
4. A retype is not a decision. It does not change `status`, `note`, `timestamp`, the summary counts or what the stage engine counts as open. A decision after a retype keeps the type; a retype after a decision keeps the status and note.
5. A type is kept while the finding's `evidence_version` matches the entry's, as a decision is. When the evidence changes the finding shows the analyzer's word again.
6. The word shown when none is chosen comes from `findings.DefaultNoteType`, mirrored by `defaultFindingNoteType` in the UI:

| category | evidence.kind | word |
| - | - | - |
| transcript_discrepancy | SKIPPED | skip |
| transcript_discrepancy | anything else | misread |
| pronunciation, entity, character_continuity | | pron |
| duplicate_read | | repeat |
| take_comparison | | takes |
| pacing, silence_cleanup | | pacing |
| audio_quality | mouth_click or mouth | mouth |
| audio_quality | plosive | plosive |
| audio_quality | breath | breath |
| audio_quality | anything else | noise |
| delivery_qc, level_consistency | | noise |
| pickup, or a category the host does not know | | misread |

## Consequences

- The findings store stays the audit log: no new store, and a corrupt `review.json` is handled as before (kept aside, refused for a write).
- Older readers ignore `types` and `review.type`; the change is additive and bumps `hostAPIVersion` for the new binding.
- The ten words are fixed in the contract. A new word is a new ADR and a change to the Go list, the schema enum and the select together.
