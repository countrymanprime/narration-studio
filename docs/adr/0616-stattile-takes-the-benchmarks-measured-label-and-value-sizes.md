# 0616. StatTile takes the benchmark's measured label and value sizes

**Status:** Proposed (the mock-fidelity work on [#509](https://github.com/countrymanprime/narration-utils/issues/509))
**Date:** 2026-09-28
**Supersedes:** none (first sizing decision recorded for `StatTile`; it previously shipped without one)

## Context

Measured against benchmark mock 01, `StatTile` had two sizes the app didn't match:

- the eyebrow label: Barlow Condensed ≈11 px, 600 weight, uppercase, tracking ≈0.1 em (the app drew 11.52 px at 0.08 em tracking);
- the value: Plex Mono 22 px, weight 500 (the app drew 20 px at weight 600, bolder and a step smaller than the mock).

[ADR 0590](0590-the-mock-fidelity-token-batch-fills-badges-with-opaque-soft-tokens-and-names-the-mocks-sizes-and-type.md) named `--font-size-label` (11 px) and `--tracking-label` (0.1em) for exactly this eyebrow role ("the eyebrow, table header and tag label"), so the label change is a straight token substitution. The value size has no token (ADR 0590's type batch covers page and card titles and the label, not a figure's own value), so it stays a local, documented arbitrary value on the primitive that owns it, the same convention `Field.tsx`/`TextField.tsx`/`Select.tsx` already use for `text-[0.88rem]`.

## Decision

`StatTile.tsx`'s `EYEBROW` style moves from `text-[0.72rem] tracking-[0.08em]` to `text-[length:var(--font-size-label)] tracking-[var(--tracking-label)]`. Its value moves from `text-xl font-semibold` (20 px/600) to `text-[1.375rem] font-medium` (22 px/500). Both keep IBM Plex Mono for the value and Barlow Condensed for the label, unchanged from before this ADR.

## Consequences

- Every `StatTile` consumer (`ProductionPage.tsx`, `RecordingCheckReport.tsx`, `RecordingCheckCard.tsx` via `StatStrip`) inherits the measured sizes without its own change.
- The value size has no shared token yet; a second primitive that needs the same 22 px/500 mono figure should get a token in a follow-up type batch rather than repeating the arbitrary value: a difference a primitive causes is fixed in the primitive.
- A future change to either size writes a new ADR superseding this one.
