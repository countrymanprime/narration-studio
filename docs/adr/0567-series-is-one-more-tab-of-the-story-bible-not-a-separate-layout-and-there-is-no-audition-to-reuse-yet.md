# 0567. Series is one more tab of the Story Bible, not a separate layout, and there is no audition to reuse yet

**Status:** Accepted
**Date:** 2026-09-28

## Context

The owner ruled on #509 that the Series view has no nav entry of its own; it is "a tab in the Story Bible". The series voice bible concept mock (owner-approved as the build spec) has its own dedicated two-pane layout (a "Series voices" list, a character detail with audition controls) that does not resemble the Story Bible's existing category-tab-plus-entity-detail layout at all. The original plan was to reuse a reference-versus-candidate audition component, but none was built: `VoiceReferencesSection` is the approve/revoke reference-clip list, and no binding plays audio in-app at all yet.

## Decision

- **"Series" is one more entry in the Story Bible's existing category `TabList`** (`Guide.tsx`, alongside All/Character/Location/...), not a new page or a second layout. Selecting it swaps the whole content area (the category table and entity detail) for the `SeriesTab` component, rather than adding a third column or a nested tab structure. This is a deliberate, documented departure from the concept mock's own two-pane arrangement (a concept mock does not block a build: build against the recommended concept and pivot later), traded for reusing the Story Bible's own established navigation instead of inventing a second one, matching the owner's "it's a tab" wording literally.
- **The reuse is `VoiceReferencesSection`'s clip-formatting, not a component instance.** `formatRegionTime` (mm:ss) is exported from `VoiceReferencesSection.tsx` and imported by `SeriesTab.tsx`, so a clip's time range reads identically in both places. `SeriesTab` does not render `VoiceReferencesSection` itself: that component is single-character, editable (approve/revoke) and fetches its own single-project data, none of which fits a read-mostly, cross-book, multi-character list. There is no audition to reuse because none was built and this change adds no audio playback either - a clip's "Play" affordance is out of scope here for the same reason `VoiceReferencesSection`'s already is.
- **Per-book drift evidence is left out of the UI entirely**, not stubbed or greyed out: it is benched and has no data (ADR 0565), so there is nothing to show a placeholder for.

## Consequences

- A narrator who has seen the concept mock will find the shipped tab visually plainer (card rows instead of the mock's audition rail and voice-note panel); the PR records this difference explicitly rather than claiming a pixel match.
- If an audition component is ever built (unbenching the acoustic engine, or narrator audio playback landing independently), the Series tab is the natural second consumer - `SeriesTab`'s clip rows are already the right shape (`id`, `regionGuid`, `projectPath`) to hand to it.
