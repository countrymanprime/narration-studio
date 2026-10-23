# Booth page breaks and a cold read

**Written 2026-10-23.** Issue: [#2251](https://github.com/countrymanprime/narration-studio/issues/2251) items 12 and 13. **Questions:** (12) How should the Booth show where pages break, from a words-per-page figure, and let the narrator mark "I will read to here"? (13) How should a cold read work, where the app follows the narrator's voice with a ghost cursor and the real cursor takes over when recording starts?

**Status.** A design note, not a build: both items leave a choice open that the owner's text does not settle. Each question below has options and a recommendation, and nothing here is measured.

## What exists

- The Booth already estimates finished time from `WPH = 9300` words per finished hour (`components/schedule/estimates.ts`; the progress line in `booth/frame/progressLine.ts`). Nothing in the app counts pages.
- A **bookmark** is a host-kept spot in a chapter (a paragraph and a word), with a ribbon in the Booth's margin, a jump menu entry and a context-menu entry (`booth/bookmarks/`, shared with Script).
- The reading position is the voice's while a listening session runs, and the narrator's clicks and keys otherwise (`useBoothPage`: `heard` against `local`). A session runs with a take; Record starts both.
- Per-viewer choices (text size, font) live in browser storage; per-project choices live in `settings.json` (a project-scope key, a row in [data files](../reference/data-files.md)).

## 12. Page breaks and "read to here"

### The formula

"Standard" has two common meanings. Print and manuscript pages are 250 words (double-spaced; the common manuscript convention). A finished audiobook hour is about 9,300 words (`WPH`), which is about 37 pages of 250.

| Option | Break every | Notes |
| - | - | - |
| A. 250 words | 250 words, counted from the chapter's first word | The figure most narrators and publishers quote. Simple, deterministic, matches `WPH`'s idea of a standard. |
| B. Layout pages | Where a printed edition breaks | Needs the publisher's page map; the app has none. |
| C. Time | Every N minutes of finished audio at `WPH` | Same as A with a different unit. |

**Recommendation: A**, with the figure narrator-settable (below). A page break is a word offset: break *n* is before word `n x words_per_page` of the chapter, found with the same word count the progress line uses, so the break survives a change of text size and window width (nothing depends on layout).

### Where the value lives

| Option | Where | Notes |
| - | - | - |
| 1. Project setting | `settings.json`, project scope, e.g. `Booth.words_per_page` (default 250, 50 to 1000) | A book's page size is the book's. Needs the settings field rows, `config/defaults.json`, the Settings panel row and a `data-files.md` change, which other streams edit too. |
| 2. Browser storage | Per viewer, like the text size | Quick, but a second machine or a reinstall forgets it, and the figure then differs between narrators of one project. |

**Recommendation: 1.** It is the only one of the two a project can share. It adds one row to each append-only list on the serial-point list, so it should land alone and not inside a Booth PR running beside others.

### The marker in the text

A subtle break is a hairline across the text column with a small mono label ("Page 12", about 0.4em, `--text-muted`) in the margin the bookmark ribbons already use, at the start of the paragraph holding the break word. It must not move text (no extra height: the Booth just tightened paragraph spacing to a line, and a marker with height would undo it) and must read in light and dark. Breaking mid-paragraph is the honest place, so the rule draws through the paragraph at the sentence that holds the break word and the label sits in the margin. The progress line gains "Page 12 of 87" beside "¶ 38 of 71" (a choice: either replaces the other on a narrow window).

### "I will read to here"

| Option | What it is | Notes |
| - | - | - |
| X. A bookmark of a kind | A bookmark with a `stop` kind, drawn as a ribbon with a different glyph | Reuses storage, ribbons, jump menu, Script visibility and the leave and undo handling. One per chapter would be enforced by replacing the old one. Needs a `kind` on the bookmark contract (a wire contract change: schema, golden, mock, API version). |
| Y. A separate per-chapter target | A single `read_to` spot kept with the chapter's other Booth state | A smaller contract, but a second thing to persist, show and undo. |
| Z. Page-bound | "Read to the end of page N" chosen from the break marker | Easiest to set, but a stopping place is often a sentence or a scene break, not a page edge. |

**Recommendation: X, offered from a page marker's context menu and from the text's** ("Read to here"), so Z is a shortcut into the same thing. The Booth would then offer, as it does at the end of the chapter, to stop the take when the reading reaches the marker, which needs a question settled with the owner: **stop the take there, or only mark it**? The narrator may be reading on past it deliberately. Recommended: only a tone and a toast ("Reached your stopping place"), never an automatic stop.

### State matrix for 12

Zero and one page (a chapter shorter than a page shows no break); `words_per_page` at its limits (50, 1000) and a bad value; a chapter with one very long paragraph; right-to-left and emoji text (words counted as the progress line counts them); the text size at 24 and 72 px; a take running (markers must not move the view); the stopping place deleted, moved by an edit to the text, and set twice.

## 13. Cold read

The shape the owner described: the app follows the narrator by recognition, a **ghost cursor** shows where it hears them, nothing is recorded, and when recording starts the ghost goes and the view returns to the real cursor.

### What "the real cursor" is

Today there is one position. With a listening session it is the voice's, with none it is the narrator's. A cold read needs two: the **real cursor** (where the next take starts, set by clicks, keys and "Start from here") and the **ghost** (where recognition hears the narrator). The ghost must never write the real cursor, the resume line, the passage map, the bookmarks or the suspected-line check.

| Option | How | Notes |
| - | - | - |
| P. Second listening session | Start the existing session (`useTeleprompterSession`) with the microphone the Booth listens to, without a take, and draw its cursor as the ghost | Reuses the recognition and its engine and model choices. Needs the session to start without `recording`, and `heard` in `useBoothPage` to feed a `ghost` value, not `at`. Every consumer of `session.cursor` has to be checked (the passage map writer, the suspected-lines check, `onTakeStopped`). |
| Q. A lighter recogniser for the ghost | A small model (Moonshine, the app's smaller engine) for the cold read only | Cheaper on the machine while a DAW is also open; a second engine path to test. Issue #2251 item 6 asks whether Moonshine is on at all, so the answer to that comes first. |
| R. Pace only | Move the ghost at an estimated reading speed | Needs no microphone, but it is not recognising anyone, so it is not what was asked. |

**Recommendation: P** first, with the engine chosen in Settings as now. Choose Q later only if P makes a laptop slow while the DAW is open (the owner's item 28 describes exactly that for the Editing page's background checks).

### The ghost

A caret and word tint in a dashed or low-contrast style, distinct from the real cursor's filled word with a caret, and in a second colour channel (shape plus tone: dashed outline, `--text-muted` fill) so it does not rely on colour. The view follows the **ghost** during the cold read, so the narrator can read on without touching anything. When Record starts: the ghost is removed, the view eases back to the real cursor (`useBrowseView` already restores a view on a seek), and the take starts from the real cursor as before. A control, **Cold read** (a toggle in the footer beside the microphone, and a jump-menu entry), is off by default and unavailable during a take.

### Questions for the owner

1. After a cold read, may the narrator *adopt* the ghost as the real cursor ("Start from here")? Recommended: yes, one press, since a cold read often ends at the place the take should begin; without it the ghost's work is lost.
2. Does a cold read count as listening for the microphone-in-use indicator and the privacy statement ("nothing you say is sent anywhere")? Recommended: yes, show the same indicator, and keep the recognition on the machine.
3. Should the cold read stop by itself after a pause? Recommended: no, only the toggle, a take or leaving the Booth stops it.

### State matrix for 13

No microphone; the microphone is taken by another program; the model is not installed; a DAW that is recording; the voice reads a different chapter's text (the ghost must stay put, not jump); the narrator reads the same phrase twice; very fast or very slow reading; silence; the narrator leaves the Booth mid-read (the session stops, as a take's does); Record pressed at the instant a phrase is confirmed (the ghost vanishes before the take's first word); the window loses focus.

## Order

12 first (it is independent of recognition and the storage question is the only shared-file cost), 13 after the answer on Moonshine (#2251 item 6) and the three questions above. Neither is started in the pull request that carries this note.
