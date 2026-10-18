# The import review dialog

**Status: implemented.** When a narrator chooses a manuscript (or accepts the offer of one in the project folder), the host reads it into a draft and the app shows a review dialog, "Import <file>", before anything is written. This page is how that dialog is built and what it promises. The decisions are Correcting a subtitle (correcting a subtitle), (the grouping, the subtitle, the repairs), [Design principles](principles.md) (real progress only), [ADR 0002](../adr/0002-local-models-and-tools-come-first-so-the-app-is-free-to-use.md) (one review, offered never silent), [Primitive components](../design/design-system.md#primitive-components) (width, no sideways scroll) and [state.ts](../../apps/ui/src/state.ts) (reference material is filtered at the listing layer only).

## Deviations from the Studio Next mock

The dialog is built to the mock's import flow (`docs/research/mockups/studio-next/src/pages/production/ImportFlow.tsx`). The mock is a frozen reference ([which mocks are the spec](../prds/studio-next-rebuild.prd.md#which-mocks-are-the-spec)), so where the app differs, the difference and its reason are here. Step 2 is below the step 1 table.

**Step 1, "Choose your manuscript" (built to the mock).**

| Mock | App | Why |
| --- | --- | --- |
| Drop a file and it is read | In the desktop app the host reads a dropped file itself: it checks that it is one supported manuscript, begins the import and tells the window, so the review opens as it does after **Choose a file…**. A drop it cannot use is said in words under the zone. In a browser, a dropped file starts the import only when the window can say where it is, which a web `File` cannot | The host reads a manuscript from a path, and the page must not hold or send one (the host takes a path only from its own dialog or the file Bootstrap offered; threat model row 6aa), so the operating system's drop is read in Go (`manuscript_drop.go`) and the page learns a file name and a job id from `manuscript:dropped`. |
| "Choose a file…" opens a browser file input | It opens the host's own file chooser (`selectManuscript`) | A browser input has no path either. |
| Header label, title and subtitle above the body | The dialog title carries "Import manuscript · step 1 of 2"; the heading and hint are in the body | The shared `Dialog` has one title row. |
| Step 1 of 2 for an import, 3 for a replace | Step 1 of 2 for both | A replace has no step 3: the host clears what was built on the manuscript, so there is no "what changes" to show (see below). |

**Step 2, "Check the chapter outline" (built to the mock's structure).** The dialog is named "Import <file> · step 2 of 2" and has the mock's heading, a row of pills (chapters, paragraphs, character suggestions, repairs), two columns (the outline on the left, the options on the right), a **Back** button and **Import reviewed manuscript** (**Replace and reset** when it replaces a manuscript).

| Mock | App | Why |
| --- | --- | --- |
| One flat table of headings, with a Words column | Headings grouped by what each will be (Narration chapters, Front matter, Reference material), each row with its word count | The groups are the app's way to review the importer's kind decisions: the chapters it got right fold away in a long book. |
| A preview pane with the selected heading's first lines | The same, in the right column, for the heading whose title was pressed (the first until then) | Built to the mock. The text is the section's first paragraph, cut at 170 characters (`firstText`). |
| "Items need review" pill | "N repairs" pill, shown only when the importer repaired something | The app has no other "needs review" measure. |
| One "Subtitle detected" banner for one heading | A banner for the book (how many headings have a second line, and the default), plus a Subtitle box on each row | A book has many such headings, and each can be wrong on its own. |
| "Review character suggestions after import" checkbox | A list of the suggested names, each checked, with Select all and Select none | The narrator chooses which names become Story Bible entries before they exist. |
| Cancel in the header, Back in the footer | Cancel and Back both in the footer, Cancel left | The shared `Dialog` puts its actions in one row; Escape and the header X cancel as well. |
| None | A content type select on each row, the Markdown heading level, "Build the Story Bible after import" and the Repairs list | App-only behaviour with no mock equivalent, kept ([Importing the manuscript](../guides/using-the-app/production.md#importing-the-manuscript)). |

**Replace.** The mock's replace flow ends with a step "What this changes in your project" that keeps marks and notes on unchanged text. The real replace clears the Story Bible, notes, bookmarks, statuses and saved comparison results (`requiresReset`), so the app keeps its warning in the review dialog and its **Replace and reset** button. Owner decision, 2026-10-18.

## What the dialog shows

What the narrator sees and does in the dialog (the summary lines, the groups, the subtitle choice, the import options) is in [the Production guide](../guides/using-the-app/production.md#importing-the-manuscript). The rules behind it are in `importReviewModel.ts` (below):

- The headline counts **narration chapters only**. Front matter, reference material, the character suggestions and the repairs are on the second line, and a line with nothing to say is left out. A PDF (the host rejects new ones, but an old preview shape exists) has no sections, so it keeps the host's title count as "proposed chapters". Replacing a manuscript adds what is cleared to the first line.
- One `Disclosure` per kind, in this order: Narration chapters, Front matter (written as `opening`), Reference material (written as `reference`), Story Bible character suggestions, Repairs. A group with no rows is not drawn. Each note (the info icon on Front matter and Reference material) is one short string that is true for its group.
- Which group starts open (`isGroupOpen`): Narration chapters while there are at most `MANY_NARRATION_CHAPTERS` (8), the character suggestions once one is unchecked, Repairs while there are at most 3, every other group always. A group the narrator opened or closed by hand keeps that.
- A row is the section's title, its subtitle in a fainter colour, a **Subtitle** checkbox when it has one, and a select for its kind. A long line is cut short with an ellipsis and the whole line is in the row's `title` attribute; the select's accessible name is the heading as it will be written.

## Correcting a subtitle

The importer reads every line after a heading's first as its subtitle, which is wrong for a title the author wrapped onto two lines and for an epigraph straight under a plain-text heading ([the heading misreads note](../research/import-heading-misreads.md), cases F1 and F3). The narrator corrects it before anything is written:

- **The default**, "Read a heading's second line as its subtitle", is on (the importer's guess). Turned off, every row's subtitle is off, except a row the narrator set by hand, which keeps its own answer.
- **Each row with a subtitle** has a checkbox named for its line ("Subtitle — Down the Rabbit-Hole"), starting from the default.
- **Off means what the host says for that section** (`subtitleOff` in the preview). `title`: the line joins the title, and the row shows the joined title ("Chapter One Down the Rabbit-Hole"). `body`, a plain-text heading's second line: the line becomes the chapter's first paragraph and is narrated, and the row says so ("Chapter One · “Curiouser and curiouser!” cried Alice is read as text").
- The commit sends `subtitleOverrides`, `false` for each section whose subtitle is off (`subtitleOverridesToCommit`), and the host applies it to the draft before the manuscript is canonicalized (`importer.ApplySubtitleOverrides`). A section id the preview does not have fails the commit before anything is cleared or written.

## Where the data comes from

The preview job (`ManuscriptImportPreview`, `apps/ui/src/api/contracts/manuscript.ts`) carries, besides the format, size and titles:

- `sections[]`: `id`, `title`, `subtitle?`, `wordCount?`, `firstText?`, `subtitleOff?` (`title` or `body`, with every subtitle: where its line goes when it is turned off), `contentKind`, `paragraphCount`. The subtitle is the **first paragraph's** (`DraftSection.Subtitle`, `apps/desktop/internal/importer/model.go`), which is the paragraph `manuscript.canonicalize` writes the chapter from, so the review shows exactly what the chapter will be called. A repeated title is merged into its first section and takes its first subtitle; a heading with no text has none (see [import quirks](docx-import-quirks.md#where-the-subtitle-shows)). `wordCount` is the words in the section's paragraphs and `firstText` how its first paragraph with text begins, cut to 170 characters with an ellipsis (`importer.FirstTextMax`), so the outline can show how long a heading is and what it opens on. Both are counted on the draft before the narrator's subtitle choices, so a line returned to the text is not in the count. A host that predates them sends neither, and the review then draws no word counts and a placeholder in the preview.
- `characterCandidates[]`.
- `notices?`: the importer's repairs (a title and subtitle that were run together and had to be split, [Manuscript import: formatting quirks and how they are handled](docx-import-quirks.md)), as sentences, only when there are some (`previewPayload`, `apps/desktop/internal/manuscript/service.go`).

`subtitleOff` and `notices` are optional and additive, so they need no `hostAPIVersion` bump. They are in the Zod schema (`schemas/manuscript.ts`) and in the golden files the Go contract tests write (`manuscript-import-preview.json`, and `manuscript-import-preview-repaired.json` for a Word file whose heading had to be repaired), so the mock cannot send a shape the host does not.

The preview log ("Preview activity") is not on the review screen; the commit dialog keeps its own progress bar and log. The host still reports every stage as it happens (`docs/architecture/principles.md`).

## How it is built

| Piece | Where | Role |
| --- | --- | --- |
| `useManuscriptImport` | `apps/ui/src/components/production/ManuscriptImport.tsx`  | Holds the choices (`importSelection`: kinds, suggestions, the subtitle default and rows), which groups the narrator opened or closed by hand (`groupOpen`) and the heading level, sends the choices with the commit, and passes the dialog message. Both the choices and `groupOpen` are dropped when a new file is chosen, and kept across a heading-level re-read (the dialog is swapped for a progress dialog meanwhile, so state below it would be lost). |
| `ImportSummary`, `ImportReview` | `components/production/ImportReview.tsx` | The dialog message and the dialog body. Controlled: they show the state they are given and report a change. |
| `importReviewModel.ts` | `components/production/` | The pure half: the kind a section will be written as, the counts, which group starts open, plurals and the two summary lines. The message, the group headers and the rows all read the same function, so they cannot disagree. |
| `Disclosure` | `components/primitives/Disclosure.tsx` | The group: the whole title row is the button and its summary is part of its name. An `aside` beside the button holds the info icon (a control inside a button is not valid). |
| `Tooltip` (the info icon) | `components/primitives/Tooltip.tsx` | A button with the note as its description and a popover; `label` names it ("About reference material"). Escape closes it wherever focus is. |

Reclassifying a row moves it to the group of its new kind. The select is put back in focus in its new place (so a keyboard narrator keeps their place), and the group it moved into opens.

**"Build the Story Bible after import".** `ImportReview` takes an optional `buildStoryBible: { checked, onChange }` and, when it is given, draws a checkbox "Build the Story Bible after import" in the Import options group. `useManuscriptImport` passes it, pre-checked from the `ManuscriptGuide.build_after_import` setting (on by default, owner decision D8). On a successful import the import dialog closes itself and `ManuscriptImport` starts `api.guideBuild({})`, followed in its own "Build the Story Bible" `WorkDialog` by the same `useWorkJob` hook the Story Bible page uses; like that page's rebuild it can go on in the background (`docs/architecture/interaction-feedback.md#job-end-events`), and a build that fails never unmakes the reported import. Measured (p50 of 5, `en_core_web_sm`, Windows dev venv), the build is most of the wait: about 6 s for the Alice fixture and the full 26,000-word book, about 15 s for a 79,000-word novel-length manuscript, against 0.05 s for the import itself and about 0.5 s per checked character suggestion ([Story Bible build after import](story-bible-concurrent-build.md)).

## Tests and states

- Go: `model_test.go`, `docx_test.go`, `markdown_test.go` (the subtitle), `subtitle_override_test.go` in `importer` (joining, returning to the body, refusing an unknown section) and in `manuscript` (the written chapter), `heading_misreads_test.go` (`TestHeadingMisreadOverrides`: the constructed cases the override fixes read as intended, and no override changes any case), `service_test.go` (the review's subtitle equals the written chapter's; the repairs travel in the preview) and the contract tests (`manuscript-import-preview-text-subtitle.json` pins `subtitleOff: "body"`).
- Vitest: `ManuscriptImport.test.tsx` (the dialog with the mock host: sections, kinds, commit payloads, heading-level re-read, reset, cancel, subtitles, the summary, the groups kept across a re-read and reset for a new file), `ImportReview.test.tsx`, `importReviewModel.test.ts`, and `App.test.tsx` for the import flow end to end.
- Mock: `mockImportPreview.ts` (a Word book with every kind of section, a Markdown variant behind `?mockImportPreview=markdown`, `?mockImportPreview=repaired`, and a plain-text variant behind `?mockImportPreview=text` whose first chapter's subtitle is an epigraph). The mock passes the same schemas as the host.
- Visual (`apps/ui/tests/visual`): `production/import-confirm`, `import-confirm-markdown`, `import-review-collapsed`, `import-review-characters`, `import-review-repaired`, `import-review-subtitles-off` (the default off, one row back on) and `import-review-text-subtitle` (an epigraph read as text). A long subtitle in the mock (Chapter Four) keeps the truncation under the overflow gate at every viewport.
- Aria (`tests/aria/dialogs.spec.ts`): the dialog's role tree, and that the note on Reference material closes on the first Escape (opened by hover) and the dialog on the second.
