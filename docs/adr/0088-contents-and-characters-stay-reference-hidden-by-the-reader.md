# 0088. Contents and Characters stay stored as reference chapters; hiding them in the reader is the reader PRD's own phase

**Status:** Accepted
**Date:** 2026-09-21

## Context

The import-structure work asked whether a detected Contents (table of contents) section and an accepted Characters section should be
dropped at import, given a new `contents` classification, or kept as `reference` and hidden from the reader. The owner took the
recommendation where no ruling existed: keep both as `reference` and hide them in the reader (Characters stays stored and hidden the
same way; the Story Bible entries are its readable form).

Both are already true at the storage/classification layer: `isReferenceHeading` in `apps/desktop/internal/importer/model.go`
classifies a Characters heading and a recognised Contents/TOC heading as `contentKind: "reference"` unconditionally (ADR 0004,
ADR 0005). The Manuscript page's chapter-navigation panel already excludes `reference` chapters
(`apps/ui/src/components/manuscript/state.ts`, ADR 0005). What ADR 0005 has never covered is the reader itself: `Manuscript.tsx`
renders every chapter it is handed, `reference` included, so a narrator who pages through the book still meets Contents and
Characters as ordinary, readable chapters.

Fixing that read-through view belongs to the reader work that owns `Manuscript.tsx` and reverses the reader half of ADR 0005 (since
delivered, see [the manuscript guide](../guides/using-the-app/script.md) and
[ADR 0090](0090-the-page-flip-reader-hides-reference-chapters-superseding-the-reader-half-of-adr-0005.md)). It had not landed when
this was decided, so the import work could not change what the reader displays without duplicating or pre-empting that design. This
ADR records the decision the storage side has already settled, and leaves the reader wiring to the reader work.

## Decision

- Contents/TOC sections and Characters sections stay `contentKind: "reference"`. No new `contents` kind is added: a distinct wire
  value would touch the `service.go` validator, the TS enum, the `Home.tsx` section-kind options and both denylist consumers
  (`apps/desktop/app.go`'s counts, `state.ts`'s panel filter) for no behavioural gain over the existing `reference` value, since
  nothing today needs to tell a Contents section apart from any other reference section.
- An accepted Characters section is not dropped and gets no special non-chapter treatment beyond the existing `reference`
  classification; the Story Bible entries created from its candidates are its readable form.
- Hiding these `reference` chapters from the reader's own page-flip view (not just the chapter-navigation panel) was left to the
  reader work, which reverses the reader half of ADR 0005 and has since been delivered as
  [ADR 0090](0090-the-page-flip-reader-hides-reference-chapters-superseding-the-reader-half-of-adr-0005.md). The decision and the
  storage-side classification were settled here, and the read-through hiding was deferred rather than built twice.

## Consequences

- No code change was needed for the storage-side half of this decision; it was already the existing behaviour, pinned by
  `TestNewDraftGivesContentsItsOwnGroupInsteadOfLeakingIntoPriorSection`, the docx and markdown TOC-recognition tests, and an
  explicit regression test for the Characters heading itself (`TestNewDraftClassifiesACharactersHeadingAsReference`,
  `model_test.go`).
- Until the reader work landed, a narrator importing still met Contents and Characters as readable chapters in the page-flip
  reader; that was not a regression this decision introduced.
- This ADR does not itself supersede ADR 0005: the reader half of ADR 0005 is reversed by ADR 0090.
