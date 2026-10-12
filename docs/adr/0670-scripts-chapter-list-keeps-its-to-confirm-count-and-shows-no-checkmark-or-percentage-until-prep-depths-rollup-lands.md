# 0670. Script's chapter list keeps its to-confirm count and shows no checkmark or percentage until prep-depth's rollup lands

**Status:** Superseded by [ADR 0760](0760-the-studio-next-mock-is-the-only-spec-for-every-page-it-covers-tokens-primitive-sizes-and-layouts-included.md) (the Studio Next Script page, swapped in by SN-B8, shows the narrator's own prep state per chapter and no to-confirm count)
**Date:** 2026-09-28
**Supersedes:** none

## Context

The Script page's rail and chapter list (part of the mock-fidelity work) are composed against benchmark mock 02
(`docs/research/mockups/audiobook-studio-benchmark/02-prep-script.webp`). The mock's chapter list draws a ✓ beside every
chapter but the one being read, and a right-aligned "80%" in `--accent-strong` beside the active one.

`ScriptChapterList.tsx`'s own comment already explains why today's list shows neither: the only prep signal the app has
per chapter is `toConfirm`, a count of names first heard in it whose pronunciation the author has not confirmed. A count
of zero does not mean a chapter is fully prepped - nothing today tracks the other prep steps (markup placed,
pronunciations checked, queries answered) well enough to call a chapter "done", and a per-chapter prep rollup, which
would, does not exist yet. Showing a ✓ or a percentage now would be a fabricated claim, not a drawn one.

## Decision

`ScriptChapterList.tsx` keeps its `toConfirm` count and its "N to confirm" `StatusBadge`, with nothing shown for a
chapter with none, rather than adding a ✓ or a percentage to match mock 02. This is filed on #510 for the owner: the
mock's per-chapter completion mark is real product work (the prep rollup), not a Script-page styling gap, and this
ADR does not invent the data to draw it early.

## Consequences

- Script's `prep-rail-pronunciations` mock-match score (85.71%, `apps/ui/tests/visual/mock-match/mocks.ts`) stays
  under the 90% bar for this reason among others; it is named in the PR's Mockup check and on #510 rather than
  worked around with placeholder data.
- This change still migrates what it owns outright: the rail's Characters and Queries lists move to `Table`
  (matching Pronunciations, already a table since an earlier pass), and `ParagraphView.tsx` draws a paragraph's
  speaker bar (a 3 px inset shadow in the speaker's own colour token, `speakerColor.ts`) before its chip, the same
  device the retail-sample band already used for its own inset bar.
- Whichever change ships the prep rollup can revisit this ADR and draw the mock's ✓/percentage once the data
  backing it exists, without Script-page code needing to change again beyond reading the new field.
