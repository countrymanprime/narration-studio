# 0263. A character reference approves a saved region's snapshot, not the live region

**Status:** Accepted
**Date:** 2026-09-26

## Context

Region listing and reference approvals needed three answers before any code: how a reference is identified, how the app lists regions for approval, and what voice data is stored and what a manuscript replace does to it. This ADR records the direction chosen for each, built in `apps/desktop/internal/character` (`Refs #509`).

Region GUID availability and how a saved `.rpp` serializes it were unverified without a real, REAPER-saved project. `apps/desktop/internal/tracks/parse.go` already parses region MARKER lines with their GUIDs (`Region.GUID`, added for an unrelated chapter-region feature), and the fixtures in `internal/tracks/testdata/reaper/` confirm the serialized shape, so that unverified assumption is resolved: a saved project's regions do carry a stable GUID this package can rely on.

## Decision

A character voice reference (`character.Reference`) names a region by its REAPER GUID, plus a `RegionSnapshot` (the region's name and time range) taken at the moment of approval. The snapshot, not the live region, is what a later baseline ([ADR 0354](0354-a-continuity-baseline-is-a-leave-one-out-percentile-of-approved-unchanged-references-and-a-chain-difference-only-lowers-a-flag.md)) reads from; on every listing (`Service.References`), the currently saved region (re-parsed) is compared against the snapshot, and a mismatch - a different name, a different time range, or the region no longer existing at all - is reported as `ChangedSinceApproval`, never silently accepted as if nothing changed. A project that cannot be parsed at all is treated the same way: every reference reads as changed, because an unverifiable reference is never reported as still valid.

Regions are listed by parsing the narrator's saved `.rpp` directly (`tracks.Parse`, already built), never through a live Lua bridge command. This works standalone and is fully testable with fixtures, at the cost of being blind to a region added since the last save. That cost is accepted, and a live Lua bridge command is revisited only if the saved-file read proves inadequate once a narrator uses it.

Approvals are the Go host's own data, `<project>/narration-utils/characters/references.json` (`character.Dir`), written directly by `apps/desktop/internal/character` with no sidecar process involved, atomically (temp file then rename, the same pattern `internal/stages`'s `DecisionStore` already uses). It stores only the snapshot and approval metadata (character id, region GUID, approved timestamp, an optional note) - no embeddings, no audio. Revoking a reference (`Service.Revoke`) removes its record and anything derived from it outright: there is no soft-delete or revoked-but-kept state to reason about once features are derived from a reference. Character ids are opaque strings this package never validates against the Story Bible; a character deleted or merged away there leaves any reference approved under its old id exactly as it was; only an explicit Revoke removes it.

Because a reference names a region of the REAPER project accompanying one specific manuscript, `apps/desktop/internal/manuscript`'s `resetDerived` now also clears `character.Dir(project)`, alongside every other manuscript-derived directory it already clears (the Story Bible, Transcript Compare, findings, the analysis ledger and cache, recording coverage, stage decisions): a replaced manuscript's characters are not the ones a stale reference was approved against.

Plain narration is approved the same way as any character, under the reserved id `character.NarrationCharacterID = "narration"`, a plain string like any other character id and never a Story Bible entity id (those are content hashes).

## Consequences

- Feature extraction, baselines and findings ([ADR 0348](0348-character-continuity-acoustic-features-are-a-dependency-free-go-package-with-a-percentile-voicing-gate.md), ADR 0354) have a stable, tested `References()` call to read approved and up-to-date reference clips from, with "changed since approval" already computed rather than something each later phase would have to reinvent.
- No bindings existed when this was written, so this ADR covers no wire contract and bumps no host API version; the character review UI ([ADR 0431](0431-character-review-ui-ships-region-approval-and-cue-correction-only-with-no-in-app-reaper-playback.md)) adds both.
- A region renamed, moved or deleted in REAPER after approval never silently changes what a future baseline reads from: the narrator must re-approve, which is a deliberate, visible action (`Approve` on the same character and region id refreshes the snapshot and clears `ChangedSinceApproval` in place, rather than creating a duplicate reference).
- Extending region identity to a live Lua bridge command or resolving a region's underlying audio source (needed once candidate audio is located) are open follow-ups, not covered here; a future ADR should record whichever is adopted if it changes this one's assumptions.
- This ADR does not cover stable character ids, dialogue cues or appearance maps: that work is rules-based extraction inside `sidecars/manuscript-guide/core/manuscript_guide.py`, which this change left alone rather than guess at; see [ADR 0345](0345-a-story-bible-entity-keeps-its-id-by-name-overlap-and-dialogue-cues-are-precision-first-rules.md).
