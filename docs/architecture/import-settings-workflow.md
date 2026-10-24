# Import heading and subtitle review

Two-line manuscript headings ("Chapter One / A New Beginning") are split into a title and a subtitle by a heuristic
that sometimes misreads. This page records a documented
set of the heuristic's failure modes and the per-heading override in the import review that lets the narrator correct
one without hand-editing the manuscript.

## Failure modes

23 constructed cases (5 controls, 18 misreads across 8 failure modes) are fixtures under
`tests/fixtures/heading-misreads/`, written by its `generate.py`. `cases.json` records for each case what the author
meant (`intended`) and what the importer reads (`observed`), and `src/studio/desktop/internal/importer/heading_misreads_test.go`
holds the importer to it: `TestHeadingMisreadFixtures` runs `BuildDraft` on every file, and `TestHeadingMisreadOverrides`
applies each case's `override` and expects `intended`. A change to the heuristic that moves an `observed` value updates
`cases.json` in the same change. No real manuscripts were collected (the owner's choice), so a case shows that a mode
exists, not how often authors hit it.

The heuristic looks only inside the heading: every line after a heading's first is its subtitle (`headingParts`), and a
plain-text heading is a block of one line, or of two lines whose first is a chapter marker (`classifyTxtHeading`).

| Mode | Shape | Now |
| --- | --- | --- |
| F1 | A title the author wrapped onto two lines (DOCX, Markdown, EPUB) | Split; the narrator turns the subtitle off and the lines join ([the override](#the-override)) |
| F2 | A three-line Part / Chapter / Title stack (DOCX) | Split after its first line |
| F3 | An epigraph straight under a plain-text heading | Read as the subtitle; turning it off returns it to the text |
| F4 | A subtitle in its own paragraph | Read when it is in Word's "Subtitle" style or an EPUB `<p class="subtitle">` (#387); a Markdown `*emphasis*` line or a plain-text block of its own is not, because an epigraph looks the same |
| F5 | A subtitle set as a lower-level heading | Read as the subtitle in all three formats (#387, #388); an EPUB heading that starts no chapter is kept as text, no longer dropped |
| F6 | A title and subtitle glued together | Split, with the repair notice, after a two-word number or before a one-letter "A" or "I"; all-caps glue ("ONETHE STORM") is not, since without a dictionary it cannot be told from a number word that runs on |
| F7 | "Chapter One: The Storm" on one line | One title by design: `alice.docx` and `alice.md` rely on it (`TestDocxFixtureRetainsTitleAndNarrativeChapters`) |
| F8 | A plain-text title above the number, or a three-line block | Not a heading; a file with no heading becomes one chapter named after the file |

The modes still read wrong (F2, F3 and F4's ambiguous shapes, all-caps F6, F7, F8) were closed as not planned with #387
on 2026-10-11. PDF has no chapter structure yet (`TestPDFFixtureIsRejectedUntilChapterBoundariesAreReliable`).

## The override

- **The split itself:** `headingParts` in `src/studio/desktop/internal/importer/headings.go` separates a heading's title
  from its subtitle and repairs glued headings, called from both `docx.go` and `markdown.go`. The result lands in
  `Paragraph.ChapterSubtitle` (`model.go`).
- **The narrator's override:** a global default ("Read a heading's second line as its subtitle") plus a per-heading
  Subtitle checkbox in the import review list (`src/studio/ui/src/components/production/ImportReview.tsx`'s
  `TitleSubtitle`/`hasSubtitleChoice` rows). Turning a row's checkbox off joins its second line back into the title,
  or returns a plain-text line to the body, by where its line came from ([Correcting a subtitle](import-review.md#correcting-a-subtitle)).
- **The commit path:** `ManuscriptImportCommit` takes a `subtitleOverrides` map keyed by section id; the review UI collects the narrator's per-row choices into it before commit.

## Tests

Go: `TestHeadingMisreadFixtures` (the 23 constructed cases stay pinned) and `TestHeadingMisreadOverrides` (the
override fixes the three F1 cases and the one F3 case from `cases.json`, and leaves every case unchanged with no
override set). Vitest: `ImportReview.test.tsx` covers the per-row checkbox and the global default. Visual:
`production/import-review-subtitles-off` and `production/import-review-text-subtitle` in the Playwright visual suite.
