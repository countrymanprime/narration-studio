# 0202. A confident two-way match is a real link, labelled auto, undoable, and never made over a manual one

**Status:** Accepted
**Date:** 2026-09-25
**Supersedes:** the "a suggestion is never treated as a link until the narrator confirms it through `MappingStore.Confirm`" clause of [ADR 0100](0100-analysis-evidence-is-two-hash-keys-one-ledger-record-per-run-and-a-narrator-confirmed-track-map.md)

## Context

ADR 0100 made `narration-utils/chapter-track-map.json` a store of narrator-confirmed links only: the matcher could suggest, and only a click could link. The owner asked on 2026-09-24 for the opposite default. Once a DAW project is hooked up, chapters should be synced to tracks by name without a click per chapter. The owner then decided: "auto-links are real links: a confident two-way match links, labelled 'Auto-linked', undoable; a fuzzy match never links; hand-made links are never overwritten." This change builds the store and the planner that the decision needs. The consent and the first sync are separate.

## Decision

- **The mapping store records who made each link.** `evidence.TrackMapping` gains `origin` (`manual` or `auto`) and `match` (`{score, kind}` with kind `exact`, `contained` or `previous-link`; `null` for a manual link). `mappingSchemaVersion` becomes 2. A version 1 file reads as manual links. `Confirm` and `SetChapter` write manual links. `AutoLink` writes auto links.
- **Both origins are links for every consumer.** This covers the recording check, stage evidence, the teleprompter, Actual recorded and regions. Nothing downstream reads `origin` to decide what audio a chapter is. The label exists only for the narrator and for sync's own rules.
- **Sync never overwrites or removes a link.** `MappingStore.AutoLink` skips any request whose track or chapter already has a link of either origin, whatever the caller planned. `chaptersync.Build` leaves linked tracks and chapters out of everything else it plans.
- **A link is made only for a confident match in both directions, from a track name.** `chaptersync.Build` links a chapter when `chaptermatch.ForChapter` says `matched` (an exact or single whole-token prefix match, with no other candidate within `NearEqualMargin`) and `chaptermatch.ForTrack` on that track also says `matched` to the same chapter. Other matches go to **Needs you** with the best candidate and a reason: `ambiguous`, `uncertain` (fuzzy, ambiguous-prefix, take or pickup), `region`, `not-mutual` or `rejected`. A pickup track is recorded as a chapter's pickup track and never linked. A credits-named track is listed as unmatched with its `credits` marker until credits rows have link ids.
- **Undo sticks.** `MappingStore.Undo` removes an auto link, refuses a manual one, and records the (track GUID, chapter title) pair in a `rejected` list. Neither `AutoLink` nor the planner makes that pair again. A narrator's own `Confirm` or `SetChapter` of the pair lifts the rejection.
- **The planner is pure and the last sync is a snapshot.** `chaptersync.Build(Input) Plan` reads chapters, the parsed project, the links, the rejections, the carried links and the previous snapshot. It returns `autoLink`, `needsYou`, `noTrack`, `unmatched`, `pickupTracks`, `new`, `changed`, `renamed` and `missing`, plus the next snapshot. The snapshot (per track: GUID, name, and a fingerprint of its items and active takes from the parsed project alone) lives in `narration-utils/chapter-sync.json`, which is disposable data (`persist.Disposable`). `resetDerived` clears it.

## Consequences

- A wrong auto-link sends a recording check to the wrong audio until the narrator undoes it. The bounds are the two-way rule, fuzzy matches never linking, a rejected pair never coming back, and ADR 0100's `mapping_changed` staleness, which already invalidates results on any relink.
- The wire payloads that carry a `TrackMapping` (`ChapterTrackMapList/Confirm/Clear`, `ChapterTrackSet`, `ChapterTrackUnlink`, `ChapterTrackLinks`) gain two additive fields. `hostAPIVersion` does not move. The goldens, the Zod schema and the mock change with them.
- The first sync, with no snapshot, reports no new, changed or missing tracks. It is the consent preview, not a change.
- The snapshot fingerprint notices an item added, moved, trimmed, muted or switched to another take. It does not notice a source file rewritten in place. Freshness of a link's audio is judged by the recording check's own fingerprint (`evidence.ComputeChapterFingerprint`), which does.
- Letting a fuzzy match link, or letting sync replace a manual link, would need a new ADR that supersedes this one.
