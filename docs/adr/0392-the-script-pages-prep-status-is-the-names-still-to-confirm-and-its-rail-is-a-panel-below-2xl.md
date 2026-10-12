# 0392. The Script page's prep status is the names still to confirm, and its rail is a panel below `2xl`

**Status:** Superseded by [ADR 0760](0760-the-studio-next-mock-is-the-only-spec-for-every-page-it-covers-tokens-primitive-sizes-and-layouts-included.md) (the Studio Next Script page, swapped in by SN-B8: a chapter's prep is the narrator's own state shown as a dot, there is no names-to-confirm count, and the rail is a column from 1281 px and a drawer below)
**Date:** 2026-09-27

## Context

The Script page (`/script`) replaces the Manuscript page. It is built to mock 02: a chapter list "with prep status", the reader, and a rail of Pronunciations, Characters and Queries. Three things were left open:

- **What a chapter's prep status is.** Mock 02 draws a tick or a percentage per chapter. Nothing in the app measures a chapter's prep: A per-chapter prep rollup (open queries, stale markup) is not built. The one per-chapter prep fact the app has today is the pronunciation queries list: every name the author has not confirmed, with the chapter it is first heard in.
- **Where the rail goes on a narrower window.** The app is captured at 1440, 1024 and 768 px (ADR 0037). The reader's chapter card lays its header out in fixed columns (ADR 0190) and needs about 800 px; at 1440 px, beside the navigation's labelled rail, three columns leave the reader about 680 px, and the card's title column collapses to nothing (found by the visual suite's retail-sample and markup-dialog states).
- **Where the reader's components live.** The plan was to move `components/manuscript/*`. The Booth is built at the same time and its read-aloud components import the reader's (`EntitySummary`, `annotations`) from `components/manuscript/`, so moving that folder here would edit the Booth's files.

## Decision

1. **A chapter's prep status is its count of names still to confirm**: the queries whose first line is in that chapter, matched by id or title, shown as a warning badge ("3 to confirm") under the chapter's name. A chapter with none shows nothing, not a tick, because nothing yet says its prep is done. A per-chapter prep rollup would replace the count, in the same place, if one is built.
2. **The chapter list is a column from `xl` (1280 px) and the rail from `2xl` (1536 px).** Below `xl` the list is the existing Chapters & Search panel, which shows the same prep count; below `2xl` the rail opens as a panel from a **Prep rail** button in the reader's band. The rail rows are also captured at a 1680 px `wide` width, the one where mock 02's three columns show. The Queries tab lists the same queries the Story Bible's panel does, and its **Manage queries** opens that panel (`storybible/PronunciationQueries.tsx`, imported, not copied), so there is one place to export, mark sent and mark answered.
3. **Only the page moves.** `Manuscript.tsx` becomes `components/script/ScriptPage.tsx` with the new `ScriptChapterList` and `ScriptRail` beside it. The reader's parts (`ReaderCard`, `ParagraphView`, `ChapterNav`, `EntitySummary`, and the rest) stay in `components/manuscript/` and are imported, as ADR 0407 item 2 allows ("stays where it is and is imported").

## Consequences

- The count is honest but partial: a chapter whose names are all confirmed and whose markup is stale still shows nothing. A per-chapter prep rollup would close that gap.
- In the demo project every Story Bible name starts as "researched", so most chapters show a count until the narrator confirms names; that is the true state of the demo's prep.
- The rail's rows open the same entity summary a highlighted name opens; editing a pronunciation stays in the Story Bible (Open in Story Bible), so the rail adds no second editor.
- The folder name `manuscript/` now holds the reader's components, not a page. A later rename is a mechanical move, best done once the Booth's imports have settled.
