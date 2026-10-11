# 0651. Proof's book level draws no waveform header, because its notes span more than one chapter

**Status:** Rejected (owner, 2026-09-29): Proof's waveform always belongs to the chapter being viewed and follows a chapter selector. Each chapter is its own track, so notes never span chapters and there is no book-level waveform to withhold; the chapter's waveform is built, and the selector changes it. Was: Proposed (the mock-fidelity work on [#509](https://github.com/countrymanprime/narration-utils/issues/509); the owner confirms the reason on #510)
**Date:** 2026-09-28
**Supersedes:** none. It extends [ADR 0470](0470-proof-follows-mock-04-pickup-edit-waived-are-words-over-the-stored-status-and-the-chapter-view-leads-with-its-notes.md)'s waveform reasoning from the chapter view to the book level.

## Context

Benchmark mock 04 (`docs/research/mockups/audiobook-studio-benchmark/04-proof-pickups.webp`) draws a 760×109 waveform card above the notes table, with a pin at each note's time, coloured by its type. `mocks.ts` scores mock 04 against `proof/default`, the book level (every finding across the project, not one chapter).

The mock itself draws one chapter's Proof view ("Proof · Ch 5 · Advice from a Caterpillar"), and [ADR 0470](0470-proof-follows-mock-04-pickup-edit-waived-are-words-over-the-stored-status-and-the-chapter-view-leads-with-its-notes.md) already gave that exact card to `ProofChapterPage.tsx`: a strip of the chapter's notes over its recording. `NotesStrip.tsx` builds that strip from a chapter's `TrackItem`s (`chapterSpan`), the same way `WaveformStrip.tsx` now draws it with real peaks in the chapter view.

The book level has no single chapter to span. `ProofPage.tsx` lists findings from every chapter at once (mock 04's own book-level equivalent draws none of this: its "Notes · 14" is the same chapter's count as its waveform), and its chapter picker (`chapterChoice`) only opens a chapter's own view; it names no "current" chapter whose recording a strip could draw. Drawing a waveform for one arbitrarily chosen chapter while the table below lists notes from every chapter would show a picture that doesn't describe the rows under it, the same invented-data problem ADR 0470 already refused for a chapter with no peaks ("the strip shows the pins over a plain rule rather than an invented one").

## Decision

**The book-level Proof page draws no waveform header.** This is a recorded difference from the mock, not a gap this ADR closes: mock 04's waveform belongs to one chapter's recording, which the book level, by design, does not have. `mock-match`'s score for `proof/default` stays under the state's own ink for this one element; the PR that carries this ADR records the remaining percentage and this reason in its Mockup check table, and the owner confirms it on #510.

If the book level later gets its own "current chapter" (the one last opened, or the one the chapter picker names), `NotesStrip` can be wired to it then; nothing here forecloses that. `NotesStrip.tsx` stays as ADR 0470 left it: built, tested by its own consumer once one exists, and not deleted, since Proof's chapter view already uses the same pattern (now with real peaks, via `WaveformStrip.tsx`).

## Consequences

- `proof/default`'s score stays below 100% by the waveform card's own share of the mock's pixels; the PR names the percentage this leaves and files the reason on #510 for the owner's sign-off.
- No new component is built and no existing one changes to work around this: `FindingsList.tsx`, `NotesHeader.tsx` and `ProofPage.tsx` are unchanged by this decision, beyond not adding a strip they have no data to draw correctly.
- To change this, give the book level a real "current chapter" concept first (its own decision, likely closed-loop proofing's), then write an ADR that supersedes this one.
