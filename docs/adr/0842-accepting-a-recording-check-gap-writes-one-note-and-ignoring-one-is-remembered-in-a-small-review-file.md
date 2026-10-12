# 0842. Accepting a recording-check gap writes one note, and ignoring one is remembered in a small review file

**Status:** Proposed
**Date:** 2026-10-11
**Supersedes:** none. It adds to [ADR 0830](0830-the-recording-check-names-its-gaps-missing-extra-or-misread-and-a-confidence-is-null-with-a-reason-until-words-are-scored.md) and [ADR 0120](0120-findings-are-read-and-decided-through-four-generic-bindings-and-a-decision-carries-the-evidence-version-it-was-made-against.md), and leaves both unchanged.

## Context

The Studio Next mock's recording check card lets the narrator accept a finding, which makes an ordinary note with the suggested decision chosen, or ignore it, which makes no note and keeps the finding as ignored (`docs/research/mockups/studio-next/src/state/commands/checkcard.ts`). The host has no counterpart: a check's gaps (`CoverageGap`, ADR 0830) are derived from the stored report and are not findings in the findings store, so there is nothing to accept or ignore (`docs/research/studio-next-proof-audit.md`, SNQ-6 row).

## Decision

1. `CoverageGapAccept(chapterId, gapId)` writes one finding for a gap of the chapter's current check through the findings store's public API (`MergeAnalyzerFindings`, then `RecordDecision`) and answers it. The finding has analyzer `recording-check`, category `pickup`, the gap's paragraph, kind and words as its manuscript anchor and evidence, and a null confidence with the gap's `confReason`. Its decision is `accepted`, so it is an ordinary Proof note: `FindingsSummary` counts it as total and decided, never as cleared (ADR 0793).
2. The finding's id is `StableID("recording-check", chapter id, gap id, evidence key)`, so accepting the same gap again answers the same finding and writes nothing new. The evidence key is the id of the ledger record the result was read from, so a new check run is a new key.
3. `CoverageGapIgnore(chapterId, gapId)` writes no finding. It records an `ignored` entry in `narration-utils/coverage/gap-reviews.json`, keyed by chapter, evidence key and gap id. An accepted gap also has an entry, so `CoverageGapReviews(chapterId)` answers `{gapId: "accepted" | "ignored"}` from one place. A gap with an entry is out of the card's to-review count.
4. `CoverageGapReviews` answers only entries whose evidence key is the current result's and whose gap id is in it. A run that changes the evidence key makes the older entries match nothing, so they stop being read; they stay in the file. An accepted note stays in the findings store as any note does.
5. A gap is decided once. Accept after ignore, and ignore after accept, are refused with a sentence; the narrator decides an accepted gap on its note.
6. Both bindings take ids only and refuse, writing nothing, when the chapter's result is stale or was never made (text, recording or save moved), when the gap is not in it, or when an id is not a plain name. A path-shaped id is an unknown gap.
7. Running a check decides nothing: `CoverageStart` and a finished run create no finding and no review entry.
8. `gap-reviews.json` is narrator data read through `persist`: a corrupt file is kept aside and an empty set starts, a newer version is refused and never overwritten, and a write is temp-file-then-rename. A replace with a confirmed reset and Clear project data remove it, since it names chapters and gaps a new manuscript resets (`resetDerived`).

## Consequences

- The recording check card (SN-Q64) accepts and ignores through three bindings and a finding the review page already lists.
- A new persisted file, three bindings and a `hostAPIVersion` bump; the file is listed in [data files](../reference/data-files.md) and `SECURITY.md` has a bullet.
- Ignoring is per check run: after a new check the narrator sees the gaps again, as the mock's findings come back with a new check.
