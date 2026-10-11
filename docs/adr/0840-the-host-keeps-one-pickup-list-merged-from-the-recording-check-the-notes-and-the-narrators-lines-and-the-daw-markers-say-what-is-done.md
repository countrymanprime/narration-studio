# 0840. The host keeps one pickup list, merged from the recording check, the notes and the narrator's lines, and the DAW's markers say what is done

**Status:** Proposed
**Date:** 2026-10-11
**Supersedes:** none. It builds on [ADR 0830](0830-the-recording-check-names-its-gaps-missing-extra-or-misread-and-a-confidence-is-null-with-a-reason-until-words-are-scored.md), [ADR 0842](0842-accepting-a-recording-check-gap-writes-one-note-and-ignoring-one-is-remembered-in-a-small-review-file.md) and [ADR 0793](0793-proofs-percent-is-the-cleared-share-of-its-notes-beside-decided-and-cleared-counters-and-a-note-is-open-until-fixed-waived-or-dismissed.md), and leaves them unchanged.

## Context

The Studio Next mock's Pickups page lists every line to record again from four sources (a speech check, an audio check, a proof note decided "Needs pickup", and a line the narrator typed), with an include set for the next session, a removed set and a done state that the DAW's markers own (`docs/research/mockups/studio-next/src/selectors/pickups.ts`, `src/state/commands/pickups.ts`). On the host a pickup was only `{position, tag, note}` from a proofer CSV or a `PICKUP:` marker; the sources, the sets and hand-added lines had no model (`docs/research/studio-next-proof-audit.md`, finding 3). The Pickups page (SN-Q82) and the Booth's pickup session (SNO-8) both need the same list, so it cannot live in one page's state.

## Decision

1. The host answers one merged list (`PickupsList`) built on read from data it already keeps, so no source is copied and none can drift from its own store:
   - **speech**: the gaps of each chapter's current recording check (ADR 0830). A stale or absent check adds none, because its gaps no longer describe the recording, and the answer names those chapters and why. The unread start and end are unfinished recording, not pickups.
   - **proof**: findings decided "Needs pickup", meaning status `accepted` and a fix that is a pickup by the Proof page's own rule (ADR 0470), kept only while the stage engine's definition of open (`proofing.PickupItem.Open`) holds, so the list and the proofing signal count a note the same way (DQ-16).
   - **audio**: the same decision on a note whose type is a sound (mouth, plosive, noise, breath; ADR 0844).
   - **you**: lines the narrator added by hand.

   A gap the narrator accepted on the check card (ADR 0842) is one pickup, not two: the speech pickup names the note it became.
2. Every pickup has an id that does not change between listings: the gap's id within its chapter, the finding's id, or a hash of the chapter and the typed line. Two identical typed lines are one pickup.
3. The narrator's own changes are kept in `narration-utils/pickups/pickup-list.json`: lines added, pickups removed, pickups left out of the session, and done states the DAW could not take yet. It is narrator data read through `persist`. Removing a pickup hides it from the list only; its note or check keeps its own record. Replacing the manuscript and Clear project data remove the file, since its ids name chapters and paragraphs a new manuscript resets.
4. The DAW's pickup markers are the DAW-side truth for done. When the DAW answers and holds a marker at a pickup's position, the marker's name (`PICKUP:` or `PICKUP_DONE:`) is the pickup's done state, and marking done goes through the marker write-through of SN-D44, whose refusal is the answer. When the DAW is away, the done state is kept in the file and written to the marker the next time the list is read with the DAW answering.
5. The bindings take ids and plain text only. A typed line is bounded and refused with control characters; it is stored as text and never opened.

## Consequences

- The Pickups page and the Booth read one list in one shape, and an edit from either is seen by the other.
- A confidence is the source's own number or null with its reason; the list never invents one.
- The list and the proofing signal still count different things: the signal also counts undecided notes and `PICKUP:` markers, which are not pickups until the narrator decides them. Only a decided note is counted by both, by the same `Open` rule.
- A pickup the host cannot place in the project (a typed line, a note with no time) has no marker to own its done state, so the file keeps it.
- Five bindings and a `hostAPIVersion` bump. The file is one the app writes and reads back, so it adds no trust boundary.
