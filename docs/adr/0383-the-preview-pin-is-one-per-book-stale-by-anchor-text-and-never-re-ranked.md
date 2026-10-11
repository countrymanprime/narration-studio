# 0383. The preview pin is one per book, stale by anchor-text comparison, and never re-ranked by Suggest's own rules

**Status:** Accepted
**Date:** 2026-09-28

## Context

The Proofing preview pin (tracking issue [#728](https://github.com/countrymanprime/narration-utils/issues/728))
lets the narrator settle on one suggested window and keep it, then move its edges by paragraph. Three design questions had no single obviously-right answer and needed a decision before implementation
(`apps/desktop/internal/preview/pin.go`, `store.go`, `rangeeval.go`; `bindings_preview_pin.go`):

1. **How many pins?** The brief was "a pin per book", but "narrator pin and edge adjustment" could also read as one
   pin per chapter, matching how `Suggest` already answers one candidate per chapter.
2. **How is staleness detected?** The sibling `prepmarkup` package (ADR 0069) already
   solves an adjacent problem - a narrator mark whose underlying text may have changed - with UTF-16 offset
   anchoring and a `nonSpaceStart` whitespace-tolerant re-check, because its marks are sub-paragraph spans.
3. **Does a pinned-and-adjusted window follow the same rules Suggest uses to rank and gate its own three
   candidates** (the Sample preset's hard-gate exclusion, the one-per-chapter, three-candidate cap), or does settling on
   one window take it out from under those rules entirely?

## Decision

1. **One pin per book, not one per chapter.** `preview.PinStore` (`store.go`) holds a single `PinnedRange`;
   `PreviewPinSet` replaces whatever was pinned before, in any chapter. This follows the "a pin per book" wording over the
   per-chapter reading: "settling on a preview" describes one decision the narrator is making, the
   same way choosing which five minutes to share is a single choice, not one per chapter of the book.
2. **Staleness is a plain per-paragraph text comparison, not prepmarkup's offset anchoring.** `PinnedRange`
   stores each pinned paragraph's whole text (`AnchorText map[string]string`) at pin (or last adjustment) time;
   `CheckStale` (`pin.go`) compares it, unchanged, against the paragraph's current text. A pin never covers part of
   a paragraph (whole paragraphs only, inherited from `Suggest`'s own candidates), so there is no sub-paragraph
   offset to reconcile and no whitespace-tolerance rule to port from `prepmarkup` - "is this still the same text"
   is the whole question. `StaleTextChanged` (the paragraph is still there, reworded) and
   `StaleParagraphMissing` (the paragraph is gone, most often a re-import renumbering chapter and paragraph ids)
   are reported separately: `StaleParagraphMissing` also blocks recomputing a candidate at all
   (`bindings_preview_pin.go`'s `resolvePin`), since there is nothing left to evaluate, while `StaleTextChanged`
   still recomputes evidence against the current, changed text and reports it as stale evidence - never a silent
   pass, never a guess at which words replaced the old ones.
3. **A pinned-and-adjusted window is scored by `EvaluateRange` (`rangeeval.go`), not by re-running `Suggest`.**
   `EvaluateRange` reuses `Suggest`'s own per-window building blocks (`windowCandidate`, `attachFindings`,
   `attachAudioChecked`) so the evidence looks identical, but it is never subjected to the one-candidate-per-chapter cap or
   the Sample preset's hard-gate exclusion of windows with an open finding: those are ranking and gating rules for
   what `Suggest` *offers*, not limits on what the narrator may *keep* once they have already chosen. A narrator
   who pins a window Suggest would have hard-gated (an open finding inside it) still sees that finding as a
   warning - findings evidence is never suppressed - but the window itself is not silently replaced or refused.

## Consequences

- Pinning a second candidate (in the same chapter or a different one) always replaces the first; the UI's
  "Pinned preview" section (`PreviewPanel.tsx`) is singular, matching the store.
- `AdjustRange` (`pin.go`) only needs to resolve one chapter's paragraph order at a time, since a pin is never
  compared against another chapter's pin.
- `resetDerived` (`apps/desktop/internal/manuscript/service.go`) clears `preview.PinFile`, the same reason
  `chaptersync` and `stages` clear their own chapter-id-keyed state: a re-import renumbers ids, so an old pin's
  ids would silently point at different text or nothing at all without this.
- A future "pin more than one preview" request (a Could, not asked for here) is a new decision superseding this
  one, not a bug fix: the one-per-book store, the wire shape (`PinnedPreview.present`, singular) and the UI section
  would all need to change together.
