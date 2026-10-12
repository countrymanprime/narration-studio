# 0820. A bookmark is a spot kept in a project sidecar, checked on read and cleared when the manuscript is replaced

**Status:** Proposed
**Date:** 2026-10-11
**Supersedes:** none. It follows the sidecar pattern of [ADR 0382](0382-script-markup-is-a-chapter-keyed-sidecar-of-line-offsets-checked-on-read-and-drawn-without-changing-the-text.md), which is itself Proposed; this decision restates the rules it takes from 0382 below, so it does not depend on 0382 being accepted.

## Context

The Studio Next mock gives the narrator bookmarks: a mark on a character offset in one paragraph, with a short label and a note, made from the Script reader or the Booth, listed in reading order, stepped through with wrap-around, and cleared when the manuscript is replaced (`docs/research/mockups/studio-next/src/domain/schemas.ts` `Bookmark`, `src/state/commands/bookmarks.ts`, `src/selectors/bookmarks.ts`). The mock keeps them in memory. The PRD (`studio-next-script-and-story-bible.prd.md`, Phase 5, rulings SNB-Q3 to SNB-Q5) asks the host to keep them, as the source of truth, before any page uses them.

The repo already has reader bookmarks (`chapter`, `line` and `note` kinds in the reader state of `manuscript-notes.json`, bindings `ManuscriptCreateBookmark` and `ManuscriptDeleteBookmark`). They have no offset, label or note text, so they are not the mock's bookmark ([the bookmarks parity note](../research/studio-next-parity-bookmarks-and-extraction.md#old-equivalents)). They stay until the page swap removes them.

## Decision

1. **The file.** A project's bookmarks are kept in `<project>/narration-utils/bookmarks.json` (`bookmarks.File`, `apps/desktop/internal/bookmarks`): `{"schemaVersion": 1, "bookmarks": [...]}`, each bookmark `{id, chapterId, paragraphId, offset, label, note, createdAt}`. It is read through `persist` as narrator data: a file that does not parse, or that holds a bookmark breaking a rule below (an empty id, chapter or paragraph, a negative offset, a label or note over its limit or with a control character, a repeated id), is kept aside as `bookmarks.json.corrupt-<time>` and an empty list starts; a file with a newer `schemaVersion` is refused and never overwritten. A write goes to a temporary file and is renamed into place. Its content never reaches a log or an error.
2. **A bookmark is a spot.** `offset` is in UTF-16 code units into the paragraph's text (a JS string index), from 0 to the text's length. A chapter bookmark is a spot at the start of its first line; there is no other kind. `BookmarksAdd(chapterId, paragraphId, offset)` refuses, with a sentence and without saving, a chapter the manuscript lacks, a paragraph not in that chapter, and an offset outside the text or between the two halves of a surrogate pair. Adding at a spot that already has a bookmark returns that bookmark, as the mock does.
3. **The limits.** `BookmarksUpdate(id, label, note)` trims both. A label is at most 60 UTF-16 units of one line of text; a note is at most 500, and may hold line breaks and tabs (a Windows line break is read as one). Any other control character is refused. Both are plain text: the bindings take ids, offsets and text, never a path, and nothing in the file is opened, run or fetched.
4. **The stale rule.** Every read checks each bookmark against the current manuscript. One whose paragraph is no longer in its chapter comes back `stale` with `staleReason` `paragraph_missing` and `paragraph` null; one whose offset no longer fits its line comes back `stale` with `offset_out_of_range`. A stale bookmark keeps its stored offset and is never moved to a guess; it can still be labelled and removed. Stale is never stored.
5. **Reading order.** `BookmarksList` and `BookmarksRemove` (which answers the bookmarks left) give the bookmarks in the manuscript's order of lines, then by offset; one whose line is gone goes last.
6. **Clearing on replace.** Replacing the manuscript (`ManuscriptImportCommit` with `confirmedReset`) and Clear project data remove the file (`resetDerived` in `apps/desktop/internal/manuscript/service.go`). An import that resets nothing keeps it.
7. **The wire.** `Bookmark` and `BookmarksApi` (`apps/ui/src/api/contracts/bookmarks.ts`), `bookmarkSchema` and `bookmarksSchema` (strict, `apps/ui/src/api/schemas/bookmarks.ts`), the goldens `bookmarks-*.json` written by `bindings_bookmarks_contract_test.go`, and host API 86. The mock's `pid` and `at` are `paragraphId` and `createdAt` on the wire, the names the markup layer's spans use, and the wire adds the derived `paragraph`, `stale` and `staleReason`.

## Consequences

- The bookmarks UI, the journalled Add bookmark and the Booth ribbons read and write one host store through one API, and the browser mock answers the same shapes.
- A bookmark survives a re-import that keeps line ids and is flagged, not moved, when its line changed under it. Unlike markup, which keeps the words it covers, a bookmark stores no text, so a line edited to the same length with other words keeps its bookmark fresh: a bookmark is a place, not a quotation.
- The schema is strict, so a field added later needs a host API bump and a UI that reads it.
- The whole file is read on every call (no size cap), as markup and the notes are; a narrator's bookmarks are expected to number in the hundreds at most.
- Clearing on replace loses every bookmark of the old manuscript. Carrying them across by title or text, as chapter sync carries links, would need a new ADR.
