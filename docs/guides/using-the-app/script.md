[Using the app](README.md) › Script

# Script

The Script page is where you prep the book before recording, under **Prep** in the navigation. On a wide window it has
three parts side by side:

- **Chapters** on the left: every narration chapter, the one in view marked, each with a dot for how far its prep is
  (**Not started**, **In progress** or **Prepped**; the key is under the list). A **?** beside a chapter means it has
  questions for the author still open. Press a chapter to go to it. When the project has opening credits, an
  **Opening credits** row comes first, and when it has closing credits, a **Closing credits** row comes last; each goes
  to those credits in the reader, and its dot is the prep state you set on them.
- **The reader** in the middle: the whole book as one scrolling text. Each chapter starts with a dashed line that ends
  the one before ("End of chapter 1 · 2,140 words"), then a card with the chapter's label and title, its word count,
  its finished audio, its marks and open queries, and **My prep**, where you set the chapter's prep state.
  Your marks are drawn in the text in their own colours and lines. A Story Bible name is tinted and underlined in its
  type's colour, the same as in the Booth, and a name still marked Needs Review or Draft is amber. A word flagged for
  pronunciation has a blue dotted underline. A speaker's lines carry a chip with their name in the speaker's own
  colour: a dashed border means the speaker is only suggested, and a grey dashed chip with a question mark means nobody
  is set. Find matches are lit in their own yellow-green, and the current match has a ring. The header names the chapter in view and the line you are on, and has **Bookmarks**, **Find**
  (Ctrl+F) and the **text settings** (font, size, line spacing, 1.7 at first, and column width).
- **The rail** on the right, with five tabs: **Words**, **Story Bible**, **Notes**, **Queries** and **Bookmarks**.

While the manuscript is being read, the page shows the same three columns as grey blocks; if it cannot be read, the page says so with **Retry**.

A bar under the reader lists its keys: select text to mark it, add a note or query, or look it up; **↑** **↓** scroll;
**←** **→** change the prep state of the chapter in view; **Alt+↑** **Alt+↓** go to the previous or next chapter (the
credits included) and say where you land, such as "Chapter 2, The Pool of Tears, ¶ 1 of 26"; **B**
bookmarks the line, says "Bookmark added." and opens the bookmark's label and note (the selection toolbar's **Bookmark here** adds it with Undo instead), or says the spot already has one; **Alt+[** **Alt+]** go to
the previous or next bookmark; **Ctrl+F** opens Find. A key you rebind
under **Keyboard & pedals** in [Settings](settings.md) shows its new key here.

Each chapter card has its own prep buttons and **Record in Booth**, so a keyboard user would pass four stops per chapter on the
way to the rail. The first Tab stop after the reader's header is **Skip to the side panel**, which is seen only while it has focus:
Enter moves focus to the open tab of the rail (or opens the rail, where it is a drawer).

![Script - the Skip to the side panel button under the reader header, with focus on it](../../images/ui/script-skip-to-side-panel.webp)

![Script - Find on "Alice": the count, the matches lit in the text and the results list](../../images/ui/script-find.webp)

At 1280 px and narrower the rail opens as a drawer over the text from the header's side panel button, and below 1180 px the
chapter list does the same from its **Chapters** button. A drawer opens inside the page, under the navigation, so the
navigation stays usable; a press anywhere outside the drawer, or on the navigation, closes it.

An old link to the Manuscript page (`/manuscript`, with a line or chapter after `#`) still works: it opens the Script
page at the same place, as do the links from Proof and the Story Bible.

![Script - the reader on Chapter 1, the chapter list beside it and the rail on its Words tab](../../images/ui/script-reader.webp)

![Script - the chapter list, for jumping between chapters](../../images/ui/script-chapter-list.webp)

![Script - the text settings: font, size, line spacing and column width](../../images/ui/script-reader-large.webp)

## Select text

Select words in the reader and a dark toolbar appears over them:

- **Mark** puts one of your marks on them, with a note (a query for the author is a mark too), marks a word for its
  pronunciation (**Pronunciation (a word)**), or opens **Define marks…**, where you name your marks and choose each
  one's colour and line.
- **Story Bible** makes a new entry of the kind you choose from the words; the kinds are the Story Bible's own types,
  including any you added there.
- **Bookmark here** (the bookmark button).
- **Record from here** (the record button) opens the [Booth](booth.md) on the chapter, starting at the words you selected.
- **Look up** opens the words in the rail: a Story Bible name on its **Story Bible** tab, any other word on **Words**.
  A word you have not marked yet gets **Add to my words** on its card, which marks the word you selected.

![Script - Define how you mark up: each mark type with its name, colour and line](../../images/ui/script-define-marks.webp)

Right-click the text for the same actions, in labelled groups: **Mark as** (your marks and **Pronunciation (a word)**),
**Add to the Story Bible as** (left out when the words are already an entry's name or alias, where the entry's own row finds them),
then **Look up**, **Find**, **Copy**, **Bookmark here** and **Record from here**. Where you click adds more: on a speaker's line, **Speaker: …** to change who
speaks it; on one of your marks, open it, change its type, resolve or reopen a query, or delete it; on a marked word,
**Show in Words** or **Remove from my words**. Right-click a chapter in the list or its card in the reader to go to it,
record it in the Booth or set its prep state, and a word on the **Words** tab to show it or remove it. Click a marked
word in the text to open it on the **Words** tab.

![Script - the selection toolbar on one word: Mark, Story Bible, Bookmark here, Record from here and Look up](../../images/ui/script-selection-popup.webp)

![Script - the right-click menu on a selected word, in labelled groups](../../images/ui/script-context-menu.webp)

![Script - the mark composer after selecting text](../../images/ui/script-add-note.webp)

## The rail

- **Words** lists the words marked for pronunciation in the chapter in view. A word's card has **How I will say it**
  with its source (a dictionary, eSpeak or the one you typed), the **Definition**, **Forvo** and **YouGlish** pages for
  it, and its definition from where **Definitions from** says: the web page (the default), the offline dictionary
  ([Settings, Models and downloads](settings.md#models-and-downloads)) or the online service on your own key. The choice is saved
  for every project, and Settings' **Definitions and pronunciations** panel changes the same one.
- **Story Bible** lists the entries met in the chapter, one row each with its type's swatch, its type and the chapter it first appears in (**Chapter 1**); a row opens the entry's summary. The entry's header is one row:
  its name, its type, **first:** and its chapter, then **Find in the manuscript**, **Add a note** and **Open in Story Bible**, which goes there.
  **Look up** on selected words with no entry shows them as a card instead, with their definition from where **Definitions from** says, **Create an entry**
  (the kinds are the Story Bible's own types) and the **Definition**, **Forvo** and **YouGlish** pages.
- **Notes** and **Queries** list the chapter's marks with a note and its questions for the author; one goes to its
  place in the text.
- **Bookmarks** lists your bookmarks under their chapters, each with its line; one goes to its place, its pencil
  button edits its label and note, and its bin button deletes it. The reader's margin shows a ribbon where each one is.

A Story Bible name met in the chapter is listed on **Words** too, marked with the Story Bible icon and read-only there: its pronunciation is the entry's, edited in the Story Bible.

![Script - the rail's Queries tab, with no queries in this chapter](../../images/ui/script-rail-queries.webp)

![Script - the rail's Story Bible tab: the entries met in this chapter](../../images/ui/script-rail-story-bible.webp)

![Script - a word looked up in the rail's Words tab: a box for how to say it, its source and the web look-ups](../../images/ui/script-word-lookup.webp)

![Script - the rail's Notes tab](../../images/ui/script-note-sidebar.webp)

![Script - the rail's Bookmarks tab with a bookmark placed from the selection toolbar](../../images/ui/script-bookmark.webp)

The reader follows the Light, Dark or System theme.

![Script reader in the Dark theme](../../images/ui/script-reader-dark.webp)

## Importing, credits and the retail sample

Importing keeps the storytelling formatting from a Word, Markdown, plain-text or EPUB manuscript —
italics, bold and underline — and line breaks inside a paragraph (verse, addresses), so the reader
matches the original. Chapter titles and subtitles that Word (or an EPUB's own table of contents)
stores separately are shown as a title with its subtitle. An EPUB's title pages, table of
contents and back matter (endnotes, glossary, and the like) are recognized from the book's own
markup and never imported as chapters; the title and author in them are offered when you set up
the credits. A Word document's title pages are treated the same way. A
plain-text file with no chapter markings, or an EPUB with no table of contents or headings,
still imports as one narration chapter rather than failing or importing nothing narratable — the
import log says so. Pages your manuscript heads as a Title Page, Half Title, Copyright, "Praise for…", "Also by…" or Opening Credits
are not imported, because an audiobook doesn't read them; the title and author in them go to the credits. A Dedication,
Epigraph, Foreword, Preface, Introduction, Prologue, Acknowledgements or About the Author stays a chapter, and you can
switch any chapter off in the import review. Those pages don't replace the Opening credits row below: that row stays above
Chapter 1. Replace the manuscript (**Replace manuscript…** under Manuscript in [Settings](settings.md)) to pick this up in an older project.

**Opening credits** sit above the first chapter and **Closing credits** after the last chapter's text, when the
credit template library (Settings, This Project, [Credits](settings.md#credits)) has an opening or a
closing template. The reader draws them as it draws a chapter: a dashed line ending what comes before, a
**Credits** card with the word count, the finished audio and **My prep** (kept with the project like a
chapter's), then the credits text with the project's values filled in. A token with no value yet stays in
brackets, in the amber of an entry still to review, and the card lists the unresolved tokens with a **Fill in** that opens the same "Set up
the credits" dialog Production offers — see [Production](production.md#importing-the-manuscript) for what it asks
and when. A banner above Opening credits does the same while any token stays unresolved and setup has not been
dismissed for the project. The credits are read-only and are not chapters: Find does not search them. Record the
credits as their own files, as ACX expects, not inside a chapter file: a chapter's Proof view compares a
chapter's recording with that chapter's text only, so credits recorded inside it are reported as extra
words. Each credits card has a **Record in Booth** button once it has anything to read (see below).

![Script - the Opening credits card, folded, above Chapter 1](../../images/ui/script-credits.webp)

The [retail sample](settings.md#retail-sample), once picked, is marked where it is: a **Retail sample**
tag above each chapter it is in, and a bar in the margin beside each of its lines.

A heading that isn't really a chapter (a part title, an epigraph or a false split your source read in
as one) is removed from recording from its track panel on [Production](production.md#a-chapters-track), not from here: choosing
**Not a chapter** takes it out of this chapter list and search too. Its text is untouched and **Restore** on Production brings it back as a
chapter.

![Script, the retail sample marked on lines 1 to 3 of Chapter 3](../../images/ui/script-retail-sample.webp)

Each narration chapter's card has a **Record in Booth** button (the microphone), as do the Opening
credits and Closing credits cards once they have something to read. It opens the [Booth](booth.md) on that
chapter or those credits.

The reader shows only the manuscript's narratable chapters. A table of contents or a Characters
section the importer recognized stays in the project's data (the Story Bible has the readable form
of Characters) but is never a page you page through in the reader, and a saved or shared link into
one tells you so instead of landing there.

---

[← Schedule](schedule.md) · [Index](README.md) · [Story Bible →](story-bible.md)
