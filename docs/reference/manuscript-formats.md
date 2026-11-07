# Manuscript formats

Which files the app can import as a book's manuscript, how it finds the chapters in each, and what to fix in a file
before you import it. This page is for a narrator preparing a manuscript, or checking why an import came out
differently from what they expected. The import itself is in
[Importing the manuscript](../guides/using-the-app/production.md#importing-the-manuscript).

Checked against `src/studio/desktop/internal/importer/` and `src/studio/desktop/internal/manuscript/` on 2026-11-06.

## Which files

| Format | Extensions | How chapters are found | Title and author suggested from |
| --- | --- | --- | --- |
| [Word](#word-docx) | `.docx` | Heading styles, or the document's own table of contents | File > Info, or a first paragraph in the Title style |
| [EPUB](#epub-epub) | `.epub` | The book's own table of contents, else headings at the start of each file | The book's metadata |
| [Markdown](#markdown-md-markdown) | `.md`, `.markdown` | `#` headings at the level you choose | A `---` front matter block |
| [Plain text](#plain-text-txt) | `.txt` | Lines such as "Chapter 3", "Prologue" or "IV" between blank lines | Nothing |

The extension can be in any case (`.DOCX` works). Any other file is refused with "Choose a Word (.docx), Markdown
(.md), plain text (.txt) or EPUB (.epub) manuscript."

**PDF is not supported yet.** A `.pdf` file is refused with "PDF import is temporarily unavailable pending the approved
corpus parity gate. Use DOCX or Markdown." Work on it is tracked in
[#3090](https://github.com/countrymanprime/narration-studio/issues/3090). Until then, export the manuscript from the
program it was written in as Word or EPUB.

**Which format to choose.** If you have a choice, Word with heading styles or an EPUB with a table of contents gives
the cleanest chapter list, because the chapters are marked in the file. Plain text works but has to guess chapters from
how lines look.

## What every format shares

- **Formatting kept:** bold, italic and underline, so the reader shows the emphasis you will voice. Fonts, colours and
  sizes are not kept.
- **Pages that are not read aloud** are recognised by their heading and left out of the recording: Title page, Half
  title, Copyright, Cover, Opening credits, and anything starting "Praise for", "Also by" or "Books by". The title and
  author on them are offered when you set up the credits.
- **Pages that are read aloud** stay chapters: Dedication, Epigraph, Foreword, Preface, Introduction and Prologue. You
  can switch any chapter off in the import review.
- **Reference pages** are kept for you but not recorded: Contents, Glossary, Pronunciation guide, Reading group guide,
  Discussion questions, Family tree, Maps, and Characters or Cast.
- **Subtitles** (one checkbox in the import review, on by default, shown only when a chapter has a subtitle): on, a
  heading's second line is the chapter's subtitle. Off, the subtitle is joined to the title, or, in a plain-text file,
  goes back into the chapter's text and is narrated.
- **A glued heading** such as "CHAPTER ONEBad Ideas" is split into "CHAPTER ONE" and "Bad Ideas", and the import log
  says so.
- **A file with no text** is refused with "The manuscript has no readable text paragraphs."

## Word (.docx)

**Chapters.** Paragraphs in Word's heading styles (Heading 1 to Heading 9, Title, TOC Heading, or your own style with
an outline level) start chapters. If the document has a table of contents built by Word (styles TOC 1 to TOC 9) and at
least 80% of its entries match a heading, its order becomes the chapter list. When some entries match no heading, the
log says how many did.

**Before you import:** make sure each chapter title uses a heading style, not bold body text. In Word, put the cursor
in the title and pick **Heading 1** on the Home tab. A document with no heading styles imports with no chapters to
record.

**Subtitles.** A line break inside the heading (Shift+Enter) puts the rest on a subtitle line. A paragraph in Word's
Subtitle style, or a smaller heading directly under the chapter heading, is a subtitle too.

**Kept:** bold, italic and underline (including the Strong and Emphasis styles), and line breaks inside a paragraph
(Shift+Enter), so verse and addresses keep their lines. Tabs in body text become spaces.

**Not imported:** footnotes and endnotes, and images. Table cells are read as ordinary paragraphs.

**Title and author** are suggested from File > Info (Title and Author), or from a first paragraph in the Title style,
with a Subtitle-style paragraph after it as the book's subtitle. They are suggestions for the credits; nothing in the
manuscript changes.

**Errors you may see:**

| Message | What to do |
| --- | --- |
| "Could not read this Word document: …" | The file is damaged or password-protected. Open it in Word, remove the password (File > Info > Protect Document), and save a copy. |
| "This .docx file is missing its document contents." | The file is not a real Word document. Save it again from Word as .docx. |
| "This Word document expands to more text than the app will read (over 256 MB)…" | The file is damaged or is not a manuscript. Save a fresh copy from Word. |

## EPUB (.epub)

**Chapters.** The book's own table of contents (EPUB 3, then EPUB 2) gives the chapters, at every level of nesting.
Without a usable one, each file in the book that starts with a top-level heading starts a chapter, and the log says
"No usable table of contents was found; chapters were detected from headings at the start of each file instead." With
neither, the whole book imports as one chapter named after the file. Sections the book marks as outside its reading
order are skipped, and the log counts them.

The book's own markup decides each section's kind first: a cover, title page, front matter or copyright page is not
read aloud; a table of contents, glossary, index, bibliography, endnotes or back matter is reference; a dedication,
epigraph, acknowledgments, chapter, prologue or epilogue is read aloud.

**Subtitles.** A line break inside the heading, a paragraph marked as a subtitle, or a smaller heading alone under the
chapter heading.

**Kept:** italic, bold, underline and line breaks, including emphasis the book sets with its stylesheet when the style
is a plain italic or bold rule. Other styled text imports without emphasis, and the log counts how many styles were
not recognised.

**Not imported:** images, audio, video and their descriptions, and footnote reference marks. A list, a table cell or a
block quote becomes one paragraph each.

**Title and author** are suggested from the book's metadata: title and subtitle, author (never the narrator listed in
it), publisher, rights, year, and series and book number.

**Errors you may see:**

| Message | What to do |
| --- | --- |
| "This EPUB is copy-protected, so its text can't be read. Import a DRM-free copy, or a Word or Markdown version." | Ask the publisher or author for a DRM-free file, or for the Word manuscript. Font protection alone does not block an import. |
| "This EPUB is too large to import (over 64 MB)." | Ask for a copy without large images, or for the Word manuscript. |
| "Could not read this EPUB file: it is not a valid zip archive." | The file is damaged or is not an EPUB. Download it again. |
| "This file is missing META-INF/container.xml; it is not a valid EPUB." and similar messages naming the container or package document | The file is damaged. Download it again or export a fresh EPUB. |
| "This EPUB has no readable chapters in its spine." or "This EPUB has no readable text." | The book has no text the app can read, for example only images of pages. Use the Word manuscript. |
| "Could not read "…"; it was skipped." in the log | One part of the book could not be read and is missing. Check that chapter in the review before you import. |

## Markdown (.md, .markdown)

**Chapters.** Headings written with `#` at the level you choose start chapters. **Markdown chapter heading level** in
the import review sets it, from H1 to H6, H1 by default. Choosing another level reads the file again and drops the
choices you made for the old chapters. Deeper headings become section labels inside a chapter. Headings written with
underlines (`===` or `---` under the line) are not read as headings.

A list of two or more links to headings in the same file is read as a table of contents, and puts the chapters in its
order when at least 80% of its entries match. For example:

```markdown
- [Chapter One](#chapter-one)
- [Chapter Two](#chapter-two)
```

**Before you import:** check that every chapter title starts with the same number of `#` signs, and set the heading
level to match. A file with no `#` headings imports with no chapters to record.

**Subtitles.** A `<br>` inside the heading, or a single smaller heading directly under the chapter heading.

**Kept:** `*italic*` or `_italic_`, `**bold**`, `***bold italic***`, `<u>underline</u>`, and line breaks made with `<br>`,
two spaces at the end of a line, or a backslash at the end of a line. Other lines in a paragraph are joined; a blank
line starts a new paragraph. A marker with no partner stays as typed. Lists, links and images are not interpreted and
stay as typed.

**Title and author** are suggested from a front matter block that starts on the very first line:

```markdown
---
title: The Lighthouse Keeper
author: A. N. Author
series: Harbour Lights
---
```

The block is removed from the text. Only `title`, `author` and `series` are read.

**Errors you may see:** "Could not read this Markdown file: …" means the file could not be opened; the rest of the
message is the system's reason.

## Plain text (.txt)

**Chapters.** A block of one or two lines, with a blank line before and after, whose first line is "Chapter …",
"Part …" or "Book …", "Prologue", "Epilogue" or "Afterword", or a bare number, Roman numeral or number word ("12",
"XII", "Twelve", with or without a full stop or colon). A line in capitals alone is not a heading. With no headings at
all, the whole file imports as one chapter named after the file, and the log says so.

```text
Chapter 1
The Lamp Room

The stairs turned eleven times before they reached the light.
```

Here "Chapter 1" starts the chapter and "The Lamp Room" is its subtitle.

**Subtitles.** The second line of a two-line heading block. With **Subtitles** off it goes back into the chapter's
text and is narrated, which suits an epigraph set under a chapter number.

**Kept:** `_word_` becomes italic. There is no bold or underline in plain text. Line breaks inside a paragraph are kept
(for verse) unless the file looks hard-wrapped, in which case the lines of each paragraph are joined.

**Project Gutenberg files:** the licence text before "\*\*\* START OF …" and after "\*\*\* END OF …" is removed, and the log
says so.

**Text encoding:** the app reads UTF-8 and UTF-16 (with a byte-order mark), and falls back to Windows-1252. The log
says when it fell back, or when some characters may be wrong; if accented letters look wrong in the review, save the
file as UTF-8 and import it again.

**Notices you may see in the log:**

| Notice | What it means |
| --- | --- |
| "This file looks hard-wrapped; lines within a paragraph were joined with a space." | Lines were broken at a fixed width; they were joined back into paragraphs. |
| "This file had no blank lines separating paragraphs; each line was imported as its own paragraph." | Add blank lines between paragraphs if you want longer paragraphs. |
| "No chapter headings were found; the whole file was imported as one chapter, "…"." | Add "Chapter …" lines with blank lines around them to split the book. |

## The manuscript file in the project folder

If the project folder holds a file named `manuscript.docx`, `manuscript.epub`, `manuscript.md`, `manuscript.markdown` or
`manuscript.txt` and nothing has been imported yet, Production offers to import it. With several, it offers them in
that order.

## Dropping a file on the import

The drop zone takes one file at a time. It says "Drop one manuscript at a time." for several, "This file is empty." for
an empty file, and "This file could not be read from where it was dropped. Use Choose a file… instead." when it cannot
read the file from where it came (press **Choose a file…** instead).

## What next

- [Importing the manuscript](../guides/using-the-app/production.md#importing-the-manuscript): the two steps of the
  import and the review.
- [Script](../guides/using-the-app/script.md): what the imported text looks like, and how to take a heading that is not
  a chapter out of the recording.
- [Story Bible](../guides/using-the-app/story-bible.md): scanning the imported manuscript for characters and places.
