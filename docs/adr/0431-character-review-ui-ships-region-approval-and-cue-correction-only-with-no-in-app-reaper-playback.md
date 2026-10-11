# 0431. Character review UI ships region approval and cue correction only, with no in-app REAPER playback

**Status:** Accepted
**Date:** 2026-09-28

## Context

The character review work was scoped as bindings and contract, mock, host API bump, character bible view, region list with play, approve and revoke, attribution correction, Review character filter, and reference-versus-candidate audition. The owner ruling on #509 (2026-09-28) benched the whole acoustic-drift half of this milestone after the real-corpus (LibriVox) re-run of the acoustic trial failed its own reject gate (1.21x/1.17x separation against a 3.81x/6.86x synthetic baseline): the acoustic engine's wiring, the `character_continuity` findings themselves, the Review page's character filter, and reference-versus-candidate audition are all out. Still in scope: the Story Bible character view and region approval, without findings.

That leaves the region list, approve/revoke, and attribution correction to build. The benchmark mock's "list + clips" look (drawn for the Series tab) shows a play button beside each reference clip. Nothing in the repository plays a REAPER region's real recorded audio into the app: `apps/desktop/internal/character` only reads region identity from the saved `.rpp` (ADR 0263); no binding decodes or streams take audio; `internal/bridge`'s navigation commands (`FindingsGoTo`/`FindingsLoop`) are Finding-shaped (an item GUID and a time range resolved through `findingNavigation`), not built to seek REAPER to an arbitrary project-time region. Building real playback would mean either a new Lua bridge command (`integrations/reaper`, tested under the ADR 0066 harness) or a browser-side audio decode path for take files - both new architecture, and both `integrations/reaper`/`internal/bridge` territory the agent-train's lane table assigns to lane B, not the UI lane building this change.

## Decision

This change ships only what `internal/character` already provides plus the Story Bible UI over it: the region list, approve, revoke, and (over the guide data) dialogue-cue attribution correction via `correct-cue`. The "Play" affordance beside a reference clip is shown, matching the mock's list-and-clips layout, but pressing it tells the narrator this is a future integration rather than pretending to play anything - the same notice pattern the "Voice samples" placeholder it replaces already used. No new Lua bridge command, no new DAW port capability, and no browser audio-decode path are added in this change.

"Remove voice data" is delivered here too: it is a pure consequence of the `internal/character` data layer (revoking every reference), needs no acoustic machinery, and has nowhere else to live once the character bible view exists.

## Consequences

- The character bible view is real and useful without audio playback: approving, revoking and correcting attribution all work end to end, backed by real bindings and wire contracts.
- REAPER playback of a reference clip is a genuine gap, not a silently-dropped requirement: this ADR is the record of why, so a later worker adding it (lane B, a new Lua command under the ADR 0066 harness) supersedes this decision instead of rediscovering the constraint.
- The non-acoustic half is done. The findings-dependent rows (the Review character filter, audition) stay benched until the owner revisits the ruling.
- "Remove voice data" is satisfied by this change; the remaining end-to-end dismiss-with-note semantics stay benched with the findings wiring.
