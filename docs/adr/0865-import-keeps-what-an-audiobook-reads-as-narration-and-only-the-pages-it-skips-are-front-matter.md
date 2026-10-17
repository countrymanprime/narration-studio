# 0865. Import keeps what an audiobook reads as narration, and only the pages it skips are Front Matter

**Status:** Accepted
**Significance:** An interface between parts: `contentKind` decides what is recorded, timed, proofed and delivered, and the importer, the EPUB table and every chapter-list page read it. Reversing it moves chapters in and out of recording across existing projects.
**Date:** 2026-10-17
**Amends:** ADR 0004 (what Front Matter holds), ADR 0005 and 0088 (which headings are reference), and the `epub:type` table of ADR 0102

## Context

The owner imported a real manuscript and found its front matter in as ordinary chapters, with no Opening credits section. Two causes. The importer gave `opening` only to its own "Cover" and "Front Matter" groups, so a headed Title Page or Copyright page was narration. And the Script, Production, Proof, Delivery and Master pages hid the generated Opening credits row whenever any chapter was `opening`, which the importer's Front Matter group always is, because the check read "the manuscript brought its own opening credits" as "has any `opening` chapter".

The owner's rule (2026-10-17): anything typically read in an audiobook is included for narration, dedications and epigraphs among it; the rest is decided by industry practice. ACX and Audible expect the opening credits, then the book as the reader would read it from the first page that has text meant to be heard. They do not ask for the half title, title page, copyright page, or the marketing lists (praise, also-by) to be read.

**Considered options:** all headed front matter as `opening` (my first pass; it dropped dedications and epigraphs from recording, which the owner rejected); guessing by position before chapter 1 (a Foreword and a Prologue sit there and are read).

## Decision

- **Not narrated, kind `opening` (Front Matter):** cover, half title, title page, copyright / copyright page, "Praise for ...", "Also by ...", "Other / More Books by ...", the importer's own "Front Matter" group, and a page headed "Opening Credits" or "Intro Credits" (`isFrontMatterHeading`, `importer/model.go`). EPUB `epub:type` `copyright-page`, `titlepage`, `cover` and `frontmatter` stay `opening`.
- **Narrated, kind `narration`:** dedication, epigraph, foreword, preface, introduction, prologue, epilogue, acknowledgements, about the author. `isReferenceHeading` no longer lists acknowledgements or about the author; EPUB `epub:type` `dedication`, `epigraph` and `acknowledgments` now map to `narration`.
- **Reference (unchanged):** contents, glossary, characters, pronunciation guide, reading group guide, discussion questions, family tree, maps.
- **The narrator has the last word.** Any section can be reclassified in the import review, and afterwards (ADR 0207).
- **Opening credits are generated, never imported as a chapter** (ADR 0150, 0183). A manuscript "owns" the opening credits only when an `opening` chapter is itself titled Opening Credits or Intro Credits (`ownsOpeningCredits`, `components/credits/creditsEntries.ts`), the one check the five chapter-list pages share. Other front matter leaves the Opening credits row drawn.

## Consequences

- A manuscript with a copyright page and a dedication gets one Front Matter section out of recording, a narrated Dedication, and an Opening credits row.
- Existing projects keep their stored kinds until the manuscript is replaced; the UI fix applies at once.
- The title, author and copyright lines the credits speak still come from the same import detection (ADR 0208, 0324), whichever section held them.
- Moving a heading between the lists is a one-line change in `model.go` and a test row; the EPUB table is the other place to keep in step.
