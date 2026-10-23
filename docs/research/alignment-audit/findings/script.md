# Script: alignment findings

Part of the [alignment audit](../../alignment-audit.md). Findings are grouped by the round that produced them; a later round's finding that replaces an earlier one says `Supersedes`. Evidence paths are `<page>/<state>/<width>.png` of the light capture, `dark:<page>/<state>/<viewport>.png` for dark, `tall:<page>-w<width>.png` for the below-the-fold captures; the images are not committed (regenerate the repo-viewport ones with `pnpm --dir apps/ui visual:page <page>`).

## Round 3: coverage gaps and scanner cross-check

### R3SC-1 Chapter titles break with one orphan word ("... Long / Tale", "... Little / Bill", "... Croquet- / Ground") and make rows 56 vs 76 px

- Page / state: script, every state with the list visible (chapter-list, reader, find, ...)
- Widths: 1920, 1440, 1280 (list is 240 px wide; at 1024/768/390 the list is a 360 px drawer where nothing wraps) (light, dark)
- What is wrong: why does the list read as ragged, with "Tale", "Bill" and "Ground" alone on a second line? Chapters 3, 4 and 8 are 76 px tall while the rest are 56 px, so the circles and eyebrows step down the column unevenly. The selected row (Chapter 3 or the bold current row) is the worst: bold title wraps to "A Caucus-Race and a Long / Tale".
- Where: `script/page/chapters/ChapterList.tsx:~100-112` (`<span>{title}</span>` inside a `flex-col` with no clamp or `text-wrap: balance`), panel width fixed in `script/page/layout/ScriptColumns.tsx:64`.
- Scanner: W1 (`button.flex.w-full.items-center.gap-2`, "label wraps onto 3 lines", h 76).
- Severity: looks wrong
- Fix: truncate with ellipsis and a tooltip, or `text-wrap: balance`, or widen the list to 280.
- Evidence: `script/chapter-list/w1280.png` (rows y=214-290 and 281-330 at 1.164 scale), `script/reader/w1920.png` (x=155-250, y=140-215), dark `dark:script/chapter-list/desktop.png` (y=190-290).
- Shared: page-local.

### R3SC-2 Right-click menu opens on top of the word that was clicked

- Page / state: script, `reader-context-menu`
- Widths: 1920 (menu left edge x~979 lands inside the selected "tired" x~958-1000 and hides its right half), 1440/1024/768 dark (menu 20px right of the word, clamped to y=9, covering the top bar) (light, dark)
- What is wrong: why does the menu cover the very word I am acting on, while at other widths it floats a screen away? The anchor is not "just below-right of the pointer" but whatever the viewport clamp gives, so the word, the menu and the selection never share an obvious relation. At 1920 the menu top is 50px above the word and its left edge cuts the selection.
- Where: `script/page/tools/select/MarkMenu.tsx` / `KindMenu.tsx` (position computed from the pointer then clamped to the viewport; cause not located in detail).
- Scanner: none.
- Severity: looks wrong
- Fix: anchor at the pointer with a 4px offset, flip above or below by available height, never overlap the selection rect.
- Evidence: `script/reader-context-menu/w1920.png` (x=548-707, y=180-612 at 0.573 scale, selection x=548-573, y=224-241), `dark:script/reader-context-menu/small-desktop.png` (menu x=525-779, y=9-759).
- Shared: menu primitive (to verify).

### R3SC-3 The "Bookmark added" toast straddles the edge of the open Lookups sheet

- Page / state: script, `rail-bookmarks`, `bookmark-added`
- Widths: 1280 (toast x~1051-1260, y~736-780 against sheet right x~1256, bottom y~775), 1024 (toast x=795-998, y=704-748 against sheet right 999, bottom 743), 768 (toast x=538-748, y=958-1003 against sheet bottom 998) (light, dark)
- What is wrong: why is the toast half on the sheet and half off it? Its bottom runs 5px past the sheet's bottom border and its right edge is 4px past the sheet's right edge, so it looks mis-docked rather than floating clear. At 1920 it sits 3px above the rail panel's bottom border instead.
- Where: toast host `primitives/Toast.tsx` (fixed bottom-right with its own offset, independent of the sheet's 8px inset).
- Scanner: W4 ("Bookmark added." overlaps hints) - the hint overlap is XSC-20; the straddle is new.
- Severity: polish
- Fix: dock the toast to the same 8px inset as the sheet or place it above it with a 12px gap.
- Evidence: `script/rail-bookmarks/w1280.png` (x=903-1083, y=632-670 at 0.859 scale), `dark:script/rail-bookmarks/small-desktop.png`, `.../tablet.png`.
- Shared: Toast.

### R3SC-4 An open Lookups sheet hides the reader's title and toolbar, and the scrim dims only the reader

- Page / state: script, all `rail-*` states and `rail-words`
- Widths: 1280, 1024, 768 (light, dark)
- What is wrong: why can I no longer see which chapter I am in, and why is the chapter list bright while the reader is dimmed? The sheet (x=876-1256 at 1280) covers the right half of the reader header, including the panel, bookmark, search and text buttons, and the reader title is cut at 1024/768. The scrim covers the reader panel only: the chapter list stays full brightness at 1280 and the top bar stays bright at every width, so the screen is lit in three tones.
- Where: `script/page/layout/ScriptColumns.tsx:17-18,64` (sheet and scrim scoped to the reader panel).
- Scanner: W4 (`b.truncate` reader title overlaps the Lookups sheet).
- Severity: polish (may be intended)
- Fix: dim the whole page area or none of it; keep the reader title clear of the sheet.
- Evidence: `script/rail-notes/w1280.png` (sheet x=753-1079, list x=69-275 undimmed), `dark:script/rail-notes/tablet.png` (title cut at x=270).
- Shared: page-local.

### R3SC-5 Dark theme: dialogs and sheets have no elevation, so the page shows through at their edge

- Page / state: script, `mark-composer`, `define-marks`, all `rail-*`, `chapter-list`
- Widths: 1024, 768 (dark)
- What is wrong: why does the dialog look like a hole drawn in the page? Its surface is about the same tone as the dimmed page, only a 1px border separates them, and pieces of the page text ("Alic", "and", "her", "conv") run right up to its left edge at 768. The light theme separates them with a light card on a dim scrim.
- Where: dialog and sheet surface/scrim tokens in dark mode (`primitives/Dialog.tsx`, `styles.css`; cause not located).
- Scanner: none.
- Severity: polish (may be intended)
- Fix: lighten the dark surface a step or darken the scrim so the page text drops away.
- Evidence: `dark:script/mark-composer/tablet.png` (x=116-652, y=330-695), `define-marks/small-desktop.png`.
- Shared: Dialog primitive and dark tokens.

### R3SC-6 Dark loading skeleton is almost invisible

- Page / state: script, `loading`
- Widths: 1024, 768 (and 1440 per the same tokens) (dark)
- What is wrong: why does the page look empty instead of loading? The skeleton bars are about 1.2:1 against the panel, so the screen reads as a blank panel with a title bar.
- Where: `script/page/layout/ScriptSkeleton.tsx:17-34` (skeleton fill token).
- Scanner: none.
- Severity: polish
- Fix: raise the skeleton fill contrast in dark mode.
- Evidence: `dark:script/loading/small-desktop.png` (bars x=101-869, y=137-397).
- Shared: skeleton token.

### R3SC-7 Reader text is sliced mid-line by the hint bar, with no fade

- Page / state: script, all reader states
- Widths: 1920, 1280 (cut line at y~622 of 688 at 1280), 1024, 768 (light, dark)
- What is wrong: why is the last line of text cut in half across its x-height? The hint bar is opaque and the scroll area ends at its top edge, so every capture shows half a line of body text, same as the list cut in XSC-23.
- Where: `script/page/reader/Reader.tsx:~492` scroll area under the `KeyHints` bar.
- Scanner: W4 (hint bar vs reader paragraphs; mechanical overlap).
- Severity: polish (may be intended)
- Fix: add bottom padding equal to the bar height or a fade mask above the bar.
- Evidence: `script/reader/w1920.png` (y~575 of 619), `dark:script/reader/small-desktop.png` (y=688).
- Shared: page-local.

### R3SC-8 Speaker chip is a 23 px-tall hit area inside body text

- Page / state: script, every reader state with a speaker tag ("Hatter")
- Widths: all (light, dark)
- What is wrong: why is this tiny dashed tag in bold serif the only thing on the line that is a control? It is 49.7x23, 1px under the minimum, set in a different face and weight from the 20px body text.
- Where: `editing/script/SpeakerChip.tsx:12` (shared with the Editing page).
- Scanner: H1 (`button.mr-1.inline-block`, 49.7x23).
- Severity: polish
- Fix: min-height 24, or pad the hit area with a pseudo-element.
- Evidence: `script/reader/w1920.png` (x=400-428, y=414-429 at 0.573), dark `reader/tablet.png` (x=84-134, y=725-748).
- Shared: SpeakerChip.

### R3SC-9 "REAPER: Linked" pill is a 22 px control

- Page / state: script, all states (shell top bar)
- Widths: all (light, dark)
- What is wrong: why is this status pill a button when it is 22px tall, smaller than the 32px search pill beside it? Different height, same row.
- Where: `primitives/HeaderChip.tsx:21` (`h-[1.375rem]`).
- Scanner: H1 (67.5x22).
- Severity: polish
- Fix: 24px minimum hit area; match the 32px pill height.
- Evidence: `script/reader/w1280.png` (x=1025-1083, y=14-31).
- Shared: HeaderChip (shell).

### R3SC-10 Toast dismiss "x" is a 17x20 target

- Page / state: script, `bookmark-added`, `rail-bookmarks`, `invalid-payload`
- Widths: all (light, dark)
- What is wrong: why is the close mark so close to the text and so small to hit? 17x20 with the glyph about 12px.
- Where: `primitives/Toast.tsx:72` (`className="flex-none"`, no size).
- Scanner: H1 (17x20.4).
- Severity: polish
- Fix: `size-6` minimum with padding.
- Evidence: `script/rail-bookmarks/w1280.png` (x=1055-1068, y=643-658), `toast_inv3.png` crop in `crop:r3sc/`.
- Shared: Toast.

### R3SC-11 Toast "Undo" is a 33x20 underlined text button

- Page / state: script, `rail-bookmarks`
- Widths: all (light, dark)
- What is wrong: why is the one recovery action in the toast smaller than a normal button? 33.2x20.4, underlined text with no padding.
- Where: `primitives/Toast.tsx` action button (`flex-none font-semibold underline`).
- Scanner: H1 (33.2x20.4).
- Severity: polish
- Fix: pad to 24px high.
- Evidence: `rail-bookmarks_rail1920.png` crop (x=384-417, y=1030-1046), `script/rail-bookmarks/w1280.png`.
- Shared: Toast.

### R3SC-12 Bookmark ribbon is a 16x26 hit area stuck beside a highlighted word

- Page / state: script, `bookmark-added`, `rail-bookmarks`
- Widths: all (light, dark)
- What is wrong: why is the ribbon a thin sliver 16px wide, 4px from the first letter? Under 24px wide, touching the green highlight at 768/1024.
- Where: `script/bookmarks/ui/BookmarkRibbon.tsx:41` (`h-[26px] w-4`).
- Scanner: H1 (16x26).
- Severity: polish
- Fix: `w-6` with the glyph centred, ribbon pulled 4px further into the gutter (see XSC-21).
- Evidence: `script/bookmark-added/w1920.png` (x=389-399, y=225-238), dark `bookmark-added/tablet.png` (x=66-80, y=394-414).
- Shared: BookmarkRibbon (Booth has its own copy at `booth/bookmarks/BookmarkRibbons.tsx:69`).

## Round 2: strict review

### XSC-1 Mark dialogs are far too wide on desktop (a two-field form 1000px wide)

- Page / state: script, `mark-composer`, `define-marks`
- Widths: 1920, 1440, 1280, 1024 (light and dark)
- What is wrong: why is a form with one select and one textarea a billboard? At 1440 the dialog is x=217-1223 (1006px) and its left edge lands 2px from the sidebar edge (x=215) so it looks glued to it; the select and note box are 970px long, the mark-name inputs 612px. At 1024 it is 714px, at 768 536px: the width just tracks the viewport.
- Where: `primitives/Dialog.tsx:149` (`max-w-[70vw]` for every non-full dialog).
- Severity: looks wrong
- Fix: cap these two dialogs (about 560px for the composer, 720px for define-marks); a `size="md"` with a fixed max-width.
- Evidence: `mark-composer/w1440.png` (x=217-1223, y=268-632), `define-marks/w1440.png`.
- Shared: Dialog primitive (other pages' dialogs also get `70vw`).

### XSC-2 Define-marks: trash button drops onto its own line at 768 and each mark takes three lines at 390

- Page / state: script, `define-marks`
- Widths: 768 (each row 92px tall; trash alone under the swatch at x=134-170), 390 (name / two selects / Asks+trash = 137px per mark, list scrolls and the 4th mark's Asks row is cut at the footer). Light.
- What is wrong: why is the delete button sitting alone under every row, like a stray? Row 1 holds swatch, name, two selects, checkbox; the 36px trash wraps by a few pixels. At 390 there is no designed layout, only wrapping.
- Where: `script/page/tools/select/MarksDialog.tsx:71` (`flex flex-wrap items-center gap-2`), `:78` (`min-w-[10rem] flex-1` name).
- Severity: looks wrong
- Fix: use a grid (`swatch | name | colour | line | asks | trash`) that drops to two rows at narrow widths with the trash in the first row.
- Evidence: `define-marks/w768.png` (y=215-420), `define-marks/w390.png` (y=170-690).
- Shared: page-local.
- Supersedes: SCR-7

### XSC-3 Define-marks rows have no headings, mixed control heights and an icon-only Add

- Page / state: script, `define-marks`
- Widths: 1440, 1024 (light, dark)
- What is wrong: it reads as a bare wall of identical inputs: nothing says which box is name, colour or line style, or what "Asks" (checkbox) means. In every row the two selects are 40px tall (y=283-323) while the name input is 34-36px (y=285-321) and the trash is 36px, so the controls do not share top and bottom edges. The `+` add button is a lone icon square on its own row, far from the "Define how you mark up" heading.
- Where: `script/page/tools/select/MarksDialog.tsx:71-114`; the select uses `--control-height` 40.8, the input and button use 36.
- Severity: looks wrong
- Fix: column header row (Name, Colour, Line, Asks), one control height per row, and a labelled "Add mark type" button.
- Evidence: `define-marks/w1440.png` y=283-323 (crop `crops/xsc/marks1440.png`), `+` at x=235-271, y=579-615.
- Shared: Select vs Input heights are a primitives matter (`primitives/Select`, `Input`).

### XSC-4 Queries filter is full width but its three buttons are bunched on the left

- Page / state: script, `rail-queries`
- Widths: 1440 (box x=1057-1411, segments end x=1245), 1024, 768, 390 (light, dark)
- What is wrong: why is the segmented control full width when the buttons only fill the first half? Open 0 / Resolved 0 / All fit in 190px and leave a 165px empty strip inside the border; "All" has no pill so it also looks unlike the other two.
- Where: `script/page/rail/threads/ThreadsPanel.tsx:43-53` (flex-col stretches the group) with `primitives/ToggleGroup.tsx:36-37` (`inline-flex`, no `flex-1`).
- Severity: looks wrong
- Fix: `w-fit`, or make the pills equal-width `flex-1`.
- Evidence: `rail-queries/w1440.png` (x=1057-1411, y=120-153).
- Shared: ToggleGroup `segmented`.
- Supersedes: SCR-6

### XSC-5 Selection toolbar floats over other lines instead of sitting on the selected word

- Page / state: script, `selection-tools`
- Widths: 1440 (toolbar y=480-524, selection y=705-739), 1280, 1024 (toolbar y=408-452, word y=672-705), 768 (y=536-579 vs 671-705) (light, dark)
- What is wrong: why is this black bar hovering two lines above the word and hiding the paragraph the narrator is reading? It is 160-225px away from the selection, so it does not read as belonging to it.
- Where: `script/page/tools/select/SelectionTool.tsx:56-59,89` (`fixed`, top computed from the selection rect); the state is captured with the anchor taken at the first width, so this may be the harness; cause not confirmed.
- Severity: looks wrong (may be harness)
- Fix: recompute on scroll/resize or anchor with a popover primitive.
- Evidence: `selection-tools/w1440.png`, `w1024.png`, `w768.png`.
- Shared: page-local.
- Supersedes: SCR-2

### XSC-6 Selection toolbar stays on top of the open Lookups drawer and hides its content

- Page / state: script, `rail-words`
- Widths: 1280, 1024, 768, 390 (light)
- What is wrong: why is a black bar cutting across the drawer? At 390 it covers "LOOK UP ON THE WEB" and the three buttons (y=402-460); at 1280 it hides the label at x=595-962, y=347-390.
- Where: `script/page/tools/select/SelectionTool.tsx:89` (`z-[var(--z-popover)]`) above the drawer at `layout/ScriptColumns.tsx` (`--z-panel`); not dismissed when the drawer opens.
- Severity: looks wrong
- Fix: dismiss the toolbar when `drawer` changes.
- Evidence: `rail-words/w390.png`, `w1280.png`, `w1024.png`.
- Shared: page-local.
- Supersedes: SCR-1

### XSC-7 Find results: the location label wraps in every row, rows are different heights and the list is cut mid-row

- Page / state: script, `find`
- Widths: 1440, 1024, 768, 390 (light, dark)
- What is wrong: why does every result say "Chapter 1 ·" and then "¶ 1" on a second line, with a dangling dot, even at 1024 where 700px is free? The label is 92px and needs about 105px. Rows are 45px or 52px depending on whether the excerpt wraps. The 220px list ends with the fifth row sliced in half (y=395-403 at 1440).
- Where: `script/page/tools/find/FindBar.tsx:103` (`w-[92px] flex-none font-mono text-xs`), `:89` (`max-h-[220px]`).
- Severity: looks wrong
- Fix: `w-28` or drop the middle dot and put the ¶ in a second column; show whole rows (snap height) or a scroll fade.
- Evidence: `find/w1440.png` (x=516-593, y=198-215; cut row y=393-403), `find/w1024.png`.
- Shared: page-local.
- Supersedes: SCR-5

### XSC-8 Find bar at 390: the search box shrinks to about 90px

- Page / state: script, `find`
- Widths: 390 (light)
- What is wrong: why can I only see 'Alice' in a 90px slot? Counter, two arrows, list toggle and close take 240px of 332px (input x=33-120).
- Where: `script/page/tools/find/FindBar.tsx:59` (`flex flex-nowrap items-center gap-2`).
- Severity: looks wrong (390)
- Fix: put the counter and buttons on a second row at 390, or hide the counter.
- Evidence: `find/w390.png` (y=140-180).
- Shared: page-local.

### XSC-9 Reader header cuts the chapter title to "Chapter 1 — …" at 390

- Page / state: script, every reader state at 390
- Widths: 390 (light, dark)
- What is wrong: why can't I see which chapter I am in? Five 36px icon buttons take about 200px and the title is cut ("Opening cre…").
- Where: `script/page/reader/Reader.tsx:124-132` (`truncate` title, `flex-nowrap` toolbar).
- Severity: looks wrong (390)
- Fix: title on its own line at narrow width, or fold rarely used buttons into a menu.
- Evidence: `reader/w390.png` (y=80-125).
- Shared: page-local.
- Supersedes: SCR-4

### XSC-10 The chapter card's stats line breaks in the middle of a fact ("… · 0" then "without pronunciation")

- Page / state: script, all reader states with a chapter card
- Widths: 1920, 1440, 1280, 1024, 768, 390 (light, dark)
- What is wrong: why is there a lonely "0" at the end of the first line? The sentence "2,140 words · about 14 min finished audio · 0 marks · 0 open queries · 0 without pronunciation" wraps after the number, so the count is separated from its label, at every width including 1920 (card 600px wide).
- Where: `script/page/chapters/ChapterCard.tsx:59` (one `<p>` with " · " separators), same in `CreditsSection.tsx:54`.
- Severity: looks wrong
- Fix: render each stat as a nowrap item (flex-wrap with gap) or shorten the copy.
- Evidence: `reader/w1440.png` (x=526-978, y=285-305), crop `crops/xsc/stats1440.png`.
- Shared: page-local (ChapterCard and CreditsSection).

### XSC-11 The three panel headers do not line up: rules at y=133, y=107 and none

- Page / state: script, all three-column states (1440, 1920); drawers below that
- Widths: 1920, 1440, 1280 (light, dark)
- What is wrong: why do the lines across the three panels sit at different heights? Reader header 65px (rule y=133, title y=92), rail tab strip 39px (rule y=107, labels y=87), chapter list has no header (first row y=95). The drawers add a 49px header ("CHAPTERS", "LOOKUPS AND MARKS") that matches none of them.
- Where: `script/page/reader/Reader.tsx:124` (`px-4 py-2` plus two-line title), `script/page/layout/RailPanel.tsx:34-38` (tab strip), `chapters/ChapterList.tsx:78`.
- Severity: looks wrong
- Fix: one panel-header height (give the list a header and make the tab strip the same height), or align the tab labels to the title row.
- Evidence: `reader/w1440.png` (rules at y=107 and y=133), crop `crops/xsc/hdr1440.png`; `chapter-list/w1024.png` (drawer header y=77-131).
- Shared: page-local (PANEL_FRAME header styles).

### XSC-12 Word card in the rail: the Add button sits alone on a row, two different "Source" controls, mixed button heights

- Page / state: script, `rail-words`
- Widths: 1920, 1440, 1280, 1024, 768, 390 (light, dark)
- What is wrong: why is a bordered `+` square stranded under the three look-up buttons? It belongs in the same row as Definition / Forvo / Youglish (there is 120px free at 1440). Above, "DEFINITIONS FROM [SOURCE: WEB PAGE]" and "HOW I WILL SAY IT [SOURCE ▾]" are two unrelated source buttons that look alike. Heights vary: source buttons 32px, Save 36px, chips 32px, speaker and record 36px, plus 36px. "How I will say it" label and the dropdown are on one row while the field they act on is a row below.
- Where: `script/page/rail/words/ExternalLinks.tsx:13` (`flex flex-wrap`), `rail/words/WordCard.tsx:57-69` (three `flex items-center` rows), `rail/words/WordsTab.tsx:29`.
- Severity: looks wrong
- Fix: put the add button in the chip row (or turn it into "Add link"); one control height for the card; put the source dropdown on the input row.
- Evidence: `rail-words/w1440.png` (`+` x=1070-1106, y=392-428; chips y=348-380), crop `crops/xsc/words1440.png`.
- Shared: page-local.

### XSC-13 Rail panels end after a few rows and leave 450-700px of blank panel

- Page / state: script, `rail-words` (no selection), `rail-story-bible`, `rail-notes`, `rail-queries`, `rail-bookmarks`, credits states
- Widths: 1920, 1440; as sheets 1280/1024/768/390 the sheet is 700px tall and mostly empty (light, dark)
- What is wrong: why is the right panel a tall empty box? Words table stops at y=427 (panel to y=883), Story Bible at y=303, Notes at y=170, Queries at y=190, Bookmarks at y=195.
- Where: `script/page/layout/RailPanel.tsx:49` (panel fills, content hugs top).
- Severity: looks wrong
- Fix: give the empty states a designed block (icon, one sentence, the action), or let the rail height follow content; at the sheet sizes use a content-height sheet.
- Evidence: `rail-notes/w1440.png`, `rail-story-bible/w390.png` (y=360-820 blank).
- Shared: page-local.

### XSC-15 Credits setup shows the same warning twice with two different "Fill in" buttons

- Page / state: script, `credits-setup-banner`
- Widths: 1920-390 (light, dark)
- What is wrong: why am I told twice that the credits need 3 values? A red banner ("The credits need 3 values — …") and, 250px lower, an amber strip in the card ("3 unresolved tokens: …"), each with its own Fill in (red banner: filled; amber strip: outline). The banner's red dot sits centred between its two text lines rather than on the first; the banner is 21px under the header but 53px above the card.
- Where: `script/page/chapters/CreditsSection.tsx:62-70` (the strip) and the setup banner component in the same folder (banner markup); spacing cause not located.
- Severity: looks wrong
- Fix: keep one prompt; if both stay, same button style and equal spacing.
- Evidence: `credits-setup-banner/w1440.png` (banner y=154-276, card y=328, strip y=526-573), `w1024.png`.
- Shared: page-local.

### XSC-16 Credits sentence is jammed under the card, indented by nothing, and the card has no top margin

- Page / state: script, `credits-cards`, `credits-setup-banner`
- Widths: 1440, 1024, 768, 390 (light, dark)
- What is wrong: why does "[Title], written by [Author], narrated by [Narrator]." touch the bottom of the card (5px gap) and start 32px in (x=541), lined up with neither the card edge (509) nor its content (522)? Then 84px of blank before the divider. The credits card starts 9px under the header rule (y=143) while a chapter card starts 39px below it.
- Where: `script/page/chapters/CreditsSection.tsx:77` (`relative pb-3 pl-8`), `:45` (`mt-6 first:mt-0`).
- Severity: looks wrong
- Fix: put the line inside the card or give it the card's inset and a gap; add the same top margin as the chapter card.
- Evidence: `credits-cards/w1440.png` (x=541, y=405-432; card y=143-401), crop `crops/xsc/credit1440.png`.
- Shared: page-local.
- Supersedes: SCR-9

### XSC-18 Retail-sample marker: the left rule is missing at 1440, broken into pieces elsewhere, and the chip is crammed

- Page / state: script, `retail-sample`
- Widths: 1440 (rule not visible at all), 1280 (x=477), 1024, 768 (x=62) (light, dark)
- What is wrong: why does the orange "this is the sample" bar exist at 1024 but not at 1440? At 1440 the text starts at the panel padding (x=509) so the rule at `-left-1` is clipped. Where it shows, it is cut into segments with 2-3px gaps at each paragraph. The "Retail sample" chip is 18px under the header and 4px above the dashed divider with a different baseline from the divider text.
- Where: `script/page/layout/BookmarkGutter.tsx:58` (`absolute inset-y-0 -left-1 w-[3px]`), `reader/Reader.tsx:492` (`px-5`).
- Severity: looks wrong
- Fix: draw the rule inside the padding (left 8px) and join segments; give the chip its own row with 12px margin.
- Evidence: `retail-sample/w1440.png` (no rule; crop `crops/xsc/retail1440.png`), `retail-sample/w1024.png` (x=222, y=415-690).
- Shared: page-local.

### XSC-19 Right-click menu is a 25-row wall that fills the whole window and covers the top bar

- Page / state: script, `reader-context-menu`
- Widths: 1440 (menu y=135-891, 756px tall, 9px from the bottom edge), 1280 (top y=34, covers the search pill), 1024 (y=8-760), 768, 390 (y=78-835) (light, dark)
- What is wrong: why does a context menu need the whole screen? Three sections plus a flat tail (Look up, Find, Copy, Bookmark, Record, Jump menu…, Find a page…) with no icons or submenus; "Jump menu… Ctrl K" and "Find a page, chapter or command" are the same command. The menu opens far from the click (word at 769,405; menu x=790, y=135). Separators are inset 7px, item text 15px.
- Where: `script/page/tools/select/MarkMenu.tsx` / `KindMenu.tsx` (cause not located in detail).
- Severity: looks wrong
- Fix: group Mark as and Story Bible into submenus, drop the duplicate palette item, open at the pointer.
- Evidence: `reader-context-menu/w1440.png`, `w1280.png` (menu covers y=0-50).
- Shared: menu primitive (to verify).

### XSC-23 Chapter list: the legend eats 90px, a chapter is cut in half and three entries are hidden

- Page / state: script, every state with the list visible
- Widths: 1440 (legend y=797-883; "CHAPTER 11 / Who Stole the Tarts?" sliced at y=793; chapters 12 and Closing credits scrolled away), 1280 (cut at chapter 9), 1920 (fits) (light, dark)
- What is wrong: why does the list stop mid-chapter above a three-line legend that stacks vertically with 150px of free width beside each entry? The legend dots are x=255 while chapter circles are x=257.
- Where: `chapters/PrepLegend.tsx:10` (`flex-col items-start`, `py-2.5`), `chapters/ChapterList.tsx:78` (`overflow-auto p-2`).
- Severity: looks wrong
- Fix: one-row legend (or put it in the list header); fade or snap the scroll edge.
- Evidence: `reader/w1440.png` (x=233-471, y=760-883), crop `crops/xsc/legend1440.png`.
- Shared: page-local.

### XSC-24 Key hints are three centred, ragged rows

- Page / state: script, all reader states
- Widths: 1440 (3 rows, y=815-875), 1280/1024/768 (2 rows), 390 (4 rows), 1920 (orphan "Ctrl F find" row) (light, dark)
- What is wrong: why do the hint rows have different widths and start x? Row 1 x=559-961, row 2 x=573-943, row 3 x=631-886 at 1440; at 1920 "Ctrl F find" sits alone in a third row.
- Where: `primitives/KeyHints.tsx:20` (`flex flex-wrap justify-center gap-x-4 gap-y-1`), used in `script/page/layout/scriptKeyHints.ts`.
- Severity: looks wrong
- Fix: left-align on a fixed-column grid, or cut the list to what fits one row.
- Evidence: `reader/w1440.png` (y=813-875), crop `crops/xsc/keys1440.png`, `reader/w1920.png` (y=1015-1055).
- Shared: KeyHints primitive (also Editing).

### XSC-25 Words table: columns jump between states and "White Rabbit" wraps while the next column has space

- Page / state: script, `rail-words`, `retail-sample`, `credits-cards`; `rail-words` at 390
- Widths: 1440 (Say it at x=1187 with 5 rows, x=1155 with 2 rows in `retail-sample`), 390 (Word column x=55-155 so "White / Rabbit" breaks; Say-it column has 30px spare) (light, dark)
- What is wrong: why does the middle column slide 32px left when the chapter changes, and why does a two-word name wrap to two lines? The table sizes columns by content (or equal thirds at 390), so row heights are unequal (39 vs 58px).
- Where: `script/page/rail/words/WordsTab.tsx:40-70` (auto table layout; cause of widths not isolated).
- Severity: looks wrong
- Fix: fixed column template (Word 1fr, Say it 1fr, Status 64px) with `nowrap` for the name.
- Evidence: `rail-words/w1440.png` (headers y=213), `retail-sample/w1440.png` (headers y=213, Say it x=1155), `rail-words/w390.png` (y=610-650).
- Shared: page-local.

### XSC-29 Header and text column are on different axes from 1024 up

- Page / state: script, all reader states
- Widths: 1920 (title x=505, text column x=698-1298, buttons x=1375-1491), 1280, 1024 (title x=97, text x=244) (light, dark)
- What is wrong: why does the heading hug the left corner while the text sits in a column in the middle and the buttons are far right? Three unrelated alignments in one panel; at 1920 there are 190px of blank either side of the text and the rail stays 380.
- Where: `script/page/reader/Reader.tsx:124-132` (full-width header) vs `:492` (`mx-auto` measure).
- Severity: looks wrong
- Fix: put the header's title and tools on the same centred measure, or left-align the text column.
- Evidence: `reader/w1920.png` (y=80-135 vs y=170-1000).
- Shared: page-local.

### XSC-40 Invalid-payload: the error appears twice and the card does not match the page it replaces

- Page / state: script, `invalid-payload`
- Widths: 1920, 1440, 1024, 768, 390 (light, dark)
- What is wrong: why do I see "The app received data it could not read." both in the card and in the toast, with the page title floating outside the card on the grey background? The card is a 720px box at the top (y=137-293) with 600px of grey below; at 768 and 390 the side gutter is 40px, while the loaded page uses 16px.
- Where: error boundary view for the page (cause not located in `script/page`).
- Severity: looks wrong
- Fix: one message, title inside the card, same gutters as the page.
- Evidence: `invalid-payload/w1440.png` (card x=468-1188), `w390.png` (x=40-350).
- Shared: error-state primitive.

### XSC-41 No-manuscript: a short full-width card with a lock beside every nav item, including the current one

- Page / state: script, `no-manuscript`
- Widths: 1920, 1440 (card x=232-1424, y=68-310), 1024, 768, 390 (light, dark)
- What is wrong: why is a 240px-high strip pinned at the top with 590px of grey under it, and why is SCRIPT itself locked while I am on it? Every nav item has a lock at x=184. The content is centred in a card that spans the whole width, while the error state uses a 720px card.
- Where: shell nav lock state and the empty state in `script/page/ScriptPage.tsx` (not located).
- Severity: looks wrong
- Fix: vertically centre a narrower card; do not lock the current page.
- Evidence: `no-manuscript/w1440.png`.
- Shared: nav (lock), empty-state pattern.

### XSC-14 Empty-state sentences sit 12px right of the other rail content and break with one-word orphans

- Page / state: script, `rail-notes`, `rail-queries`, credits states (Words empty)
- Widths: 1440 (text x=1069 vs section label x=1057), 1024, 768, 390 (x=57 vs 45) (light, dark)
- What is wrong: why does the sentence start further in than the heading above it, and why does "Mark." sit alone on line two ("No notes in this chapter yet. Select text and choose / Mark.")? The empty text has its own inset on top of the panel padding.
- Where: cause not found (panel padding `p-3` at `layout/RailPanel.tsx:49`; the empty-state wrapper adds a further 12px, in `rail/threads/ThreadsPanel.tsx` and `rail/words/WordsTab.tsx:78`).
- Severity: polish
- Fix: remove the extra inset; reword to avoid the orphan or use `text-wrap: balance`.
- Evidence: `rail-notes/w1440.png` (x=1069, y=135-170), `rail-queries/w1440.png` (y=183), `credits-cards/w1440.png` (y=205).
- Shared: page-local.

### XSC-17 Credits card padding and mic button are 4px off the chapter card beneath it

- Page / state: script, `credits-cards`, `credits-setup-banner`
- Widths: 1440, 390 (light, dark)
- What is wrong: why does the mic button of the card sit 4px left of the one in the next card, as if they were not the same component? Opening credits: label x=522, mic right x=994 (13px inside). Chapter card: label x=526, mic right x=990 (17px).
- Where: `script/page/chapters/CreditsSection.tsx:48` (`InsetCard fill`) vs `chapters/ChapterCard.tsx:48-50` (`frame="roomy"`).
- Severity: polish
- Fix: `frame="roomy"` in CreditsSection.
- Evidence: `credits-cards/w1440.png` (y=155-190 vs y=540-575).
- Shared: page-local.
- Supersedes: SCR-8

### XSC-20 "Bookmark added" toast sits on top of the key hints and rail content

- Page / state: script, `bookmark-added`, `rail-bookmarks`
- Widths: 1024 (toast x=837-1007, y=703-748 over "chapter" hint), 768 (y=959-1004 over hints), 390 (x=203-373, y=779-824), 1440 (over the rail bottom) (light, dark)
- What is wrong: why does the toast chop the last hint ("chapte…", "bookmark")? It floats 4-20px from the panel edge instead of clear of it.
- Where: toast host (shell, `layout/` Toast primitive; cause not located).
- Severity: polish
- Fix: anchor the host clear of the hint bar or move it to the top.
- Evidence: `bookmark-added/w1024.png`, `w768.png`, `w390.png`.
- Shared: Toast.

### XSC-21 Bookmark ribbon is stuck to the reader border and to the first letter

- Page / state: script, `bookmark-added`, `rail-bookmarks`
- Widths: 1440 (ribbon x=491-505 against border x=489 and text x=509), 390 (x=19-34 vs border x=17, text x=38) (light, dark)
- What is wrong: why is the ribbon squeezed into the 20px padding with no margin on either side?
- Where: `script/page/layout/BookmarkGutter.tsx` (ribbon in the left gutter) with `reader/Reader.tsx:492` (`px-5`).
- Severity: polish
- Fix: indent the ribbon 4-6px and widen the padding at narrow widths.
- Evidence: `bookmark-added/w1440.png` (y=392-415), `bookmark-added/w390.png`.
- Shared: page-local.
- Supersedes: SCR-13 (ribbon part)

### XSC-22 Bookmark row: edit and delete buttons touch each other and the row border

- Page / state: script, `rail-bookmarks`
- Widths: 1440, 1024, 768, 390 (light, dark)
- What is wrong: why are the pencil and the red trash a pair of crowded squares? Gap between them 2px, to the row border 3px, against 11px of inset on the text side; the full sentence is bold while the heading above ("CHAPTER 1 — DOWN THE RABBIT-HOLE") is a different style. At 390 the sentence is cut ("ran clos…").
- Where: bookmark row in `script/bookmarks/` (cause not located; folder is `.tsx`-less in my listing).
- Severity: polish
- Fix: `sm` icon buttons, 6px gap, matching inset.
- Evidence: `rail-bookmarks/w1440.png` (x=1340-1406, y=153-193), crop `crops/xsc/bm1440.png`.
- Shared: page-local.
- Supersedes: SCR-13 (row part)

### XSC-26 Rail tab strip: bookmark tab is higher, wider than a text tab, and clipped at 390

- Page / state: script, all `rail-*` states
- Widths: 1440 (icon centre y=85 vs text y=87; its underline x=1338-1375 vs text tabs), 390 (strip scrolls 2px, last tab touches the sheet edge) (light, dark)
- What is wrong: why is the bookmark icon not on the same line as the words next to it?
- Where: `script/page/layout/RailPanel.tsx:35,39` (`px-1` list, `inline-flex items-center` icon span), `primitives/Tabs.tsx`.
- Severity: polish
- Fix: align the icon with the label baseline; remove `px-1`.
- Evidence: `rail-bookmarks/w1440.png` (x=1345-1370, y=75-95), crop `crops/xsc/railtabs.png`.
- Shared: Tabs.
- Supersedes: SCR-11

### XSC-27 Rail table and list text is 10px right of its section label

- Page / state: script, `rail-words`, `rail-story-bible`
- Widths: 1440 (label x=1057, table text x=1067), 390 (x=45 vs 55) (light, dark)
- What is wrong: why does the first column not start under the label above it while the rules run full width?
- Where: cause not found; cells use `px-2.5` in `script/page/rail/words/WordsTab.tsx` and `rail/bible/BibleTab.tsx`.
- Severity: polish
- Fix: drop the cell padding or inset the label.
- Evidence: `rail-story-bible/w1440.png` (y=130-170), `rail-words/w1440.png` (y=460-520).
- Shared: page-local.
- Supersedes: SCR-12

### XSC-28 Reader header text is 4px left of the content it heads

- Page / state: script, all reader states
- Widths: 1440 (title x=505, divider/card/text x=509), 768 (x=33 vs 37) (light, dark)
- What is wrong: why do the title and the card below not share a left edge? Header uses 16px padding, the body 20px; the tool buttons end at x=1011, the card at x=1007.
- Where: `script/page/reader/Reader.tsx:124` (`px-4`) vs `:492` (`px-5`); find bar also `px-4` (`tools/find/FindBar.tsx:58`).
- Severity: polish
- Fix: same horizontal padding in header, find bar and body.
- Evidence: `reader/w1440.png` (title x=505, card x=509), crop `crops/xsc/hdr1440.png`.
- Shared: page-local.

### XSC-30 Chapter card repeats the title shown in the header right above it

- Page / state: script, all reader states
- Widths: all (light, dark)
- What is wrong: why do I read "Chapter 1 — Down the Rabbit-Hole" and then, 60px below, "CHAPTER 1 / Down the Rabbit-Hole" in huge type? With the dashed "END OF OPENING CREDITS" line between, the top of the page is three headings before any text.
- Where: `script/page/reader/Reader.tsx:126` (header title) and `chapters/ChapterCard.tsx:54-58`.
- Severity: polish (organisation)
- Fix: show the header title as just the position (or shorten), or fold stats into the header.
- Evidence: `reader/w1440.png` (y=80-250).
- Shared: page-local.

### XSC-31 MY PREP segmented control: different widths per option and 130px of dead space beside it

- Page / state: script, all card states
- Widths: 1440 (Not started 92px, In progress 83px, Prepped 75px; control x=591-857 in a card to x=990) (light, dark)
- What is wrong: why are like options different widths and why is the group tucked left with empty space to its right? Segments are content-sized.
- Where: `script/page/chapters/PrepSegment.tsx` / `ChapterCard.tsx:62` (`flex flex-wrap items-center gap-3`).
- Severity: polish
- Fix: equal-width segments, or full-width equal thirds.
- Evidence: `reader/w1440.png` (y=324-356), crop `crops/xsc/stats1440.png`.
- Shared: ToggleGroup.

### XSC-32 Text-settings: slider tracks are inset from labels and the select

- Page / state: script, `text-settings`
- Widths: 1440 (labels/select x=691-995, track x=701-985, value ends x=994), 390 (light, dark)
- What is wrong: why do the sliders not run as wide as the font select above them? 9px inset at each end.
- Where: `primitives/Slider.tsx:68` (`px-[9px]`).
- Severity: polish
- Fix: keep the thumb inset but align the track to the label edges.
- Evidence: `text-settings/w1440.png` (y=250-385).
- Shared: Slider (also Editing drawer).
- Supersedes: SHARED-1

### XSC-33 Text-settings popover: off-centre at 390 and its top sits over the header rule

- Page / state: script, `text-settings`
- Widths: 390 (popover x=21-356 in a card x=17-373: 4px left, 17px right), 1440/1024/768 (popover top y=131 across the rule at y=133) (light, dark)
- What is wrong: why does the sheet hug the left edge at 390 and cut across the header line at the others?
- Where: `script/page/tools/text/TextSettings.tsx` (popover positioning; cause not located).
- Severity: polish
- Fix: clamp with 16px side margins; start the popover below the header rule.
- Evidence: `text-settings/w390.png`, `text-settings/w1440.png` (y=125-135).
- Shared: popover primitive.

### XSC-34 Drawers at 390 are lopsided

- Page / state: script, `rail-*`; `chapter-list` (not opened at 390, taken from source and round 1)
- Widths: 390 (rail sheet x=33-365 in a card x=17-373: 16px left, 8px right) (light)
- What is wrong: why is the sheet nearer one edge than the other?
- Where: `script/page/layout/ScriptColumns.tsx:17-18` (`w-[min(380px,calc(100%-24px))]` with an 8px side inset needs `-16px`).
- Severity: polish
- Fix: `calc(100%-16px)`.
- Evidence: `rail-queries/w390.png` (x=33-365).
- Shared: page-local.
- Supersedes: SCR-3

### XSC-35 Skip-to-side-panel has no padding and lands on the divider

- Page / state: script, `skip-to-side-panel`
- Widths: 1440 (x=876-1015, y=138-170), 1024, 768, 390 (covers "END OF OPENING CREDI…") (light, dark)
- What is wrong: why does the label touch its border and cover the dashed line?
- Where: `script/page/layout/SkipToRail.tsx:33` (`focus:not-sr-only` resets padding).
- Severity: polish
- Fix: add the button padding back; position over the header.
- Evidence: `skip-to-side-panel/w1440.png`, `w390.png`.
- Shared: page-local.
- Supersedes: SCR-10

### XSC-36 Dialog footers overshoot the content edge by 2px

- Page / state: script, `define-marks`, `mark-composer`
- Widths: 1440 (Done/Save right x=1207 vs close button, inputs x=1205) (light, dark)
- What is wrong: why is the primary button 2px further right than everything above it?
- Where: cause not found (`primitives/Dialog.tsx` actions).
- Severity: polish
- Fix: same horizontal padding in footer and body.
- Evidence: `define-marks/w1440.png` (x=1152-1207, y=647-683).
- Shared: Dialog.
- Supersedes: SCR-14

### XSC-37 Mark composer: the title is just the selected word, labels are a different style, and the textarea placeholder wraps at 390

- Page / state: script, `mark-composer`
- Widths: 1440, 1024, 768, 390 (light, dark)
- What is wrong: why is the dialog called "Rabbit"? The user sees no verb ("Mark") and no sentence context. Labels "Type" and "Note (optional)" are sentence-case body text while the rest of the app uses small caps labels. At 390 the dialog is 270px wide in a 390 screen (60px each side) and the placeholder wraps to two lines.
- Where: `script/page/tools/select/MarkComposer.tsx:61-66`.
- Severity: polish
- Fix: title "Mark “Rabbit”", quote the passage, use the shared field label style, widen at 390.
- Evidence: `mark-composer/w1440.png` (x=235-300, y=300), `mark-composer/w390.png`.
- Shared: page-local.

### XSC-38 Selection toolbar: uneven item spacing and an unlabelled colour dot

- Page / state: script, `selection-tools`
- Widths: 1440, 1024, 768, 390 (light, dark)
- What is wrong: why is the gap between Mark and Story Bible bigger than between the bookmark icon and the dot, and what is the pink circle? Items are 513-566, 598-689, 718-732, 757-773, 799-846 (gaps 32, 29, 25, 26); the dot has no label.
- Where: `script/page/tools/select/SelectionTool.tsx:89-132`.
- Severity: polish
- Fix: equal gaps, divider before the icon-only items, label or tooltip for the dot.
- Evidence: `selection-tools/w1440.png` (x=497-864, y=480-524), crop `crops/xsc/sel1440.png`.
- Shared: page-local.

### XSC-39 Find bar: the input is a different height from the buttons beside it

- Page / state: script, `find`
- Widths: 1440, 1024 (light, dark)
- What is wrong: why is the text box taller than the arrows? Input about 38-40px (y=141-179), buttons 36px (y=142-178); the blue focus ring makes it look worse.
- Where: `script/page/tools/find/FindBar.tsx:59-80` (Input vs IconButton heights).
- Severity: polish
- Fix: `size` the input to the 36px button height.
- Evidence: `find/w1440.png` (y=141-179), crop `crops/xsc/find1440.png`.
- Shared: Input vs IconButton heights.

### XSC-42 Loading skeleton does not match the loaded page

- Page / state: script, `loading`
- Widths: 1920, 1440, 1024, 768, 390 (light, dark)
- What is wrong: why does everything jump when it loads? Skeleton bars start at y=81 (list, rail) and y=89 (reader) instead of a common top; the reader lines run left-aligned to 1277 at 1920 where the real text is a centred 600 column; no tab strip, header rule, legend or hint bar; the list shows 5 equal blocks where the real rows differ in height.
- Where: `script/page/layout/ScriptSkeleton.tsx:17-34` (`p-3`/`p-5`, `max-w-3xl`).
- Severity: polish
- Fix: mirror header, tab strip, centred measure and legend.
- Evidence: `loading/w1440.png`, `loading/w1920.png`.
- Shared: page-local.

### XSC-43 Story Bible rail rows: dangling "first —", no action, kind column floats right

- Page / state: script, `rail-story-bible`
- Widths: 1440 (kind text x=1211, 1024 x=787), 390 (x=181) (light, dark)
- What is wrong: why does the Place row end with "first —", and why can I not open or add anything from the list?
- Where: `script/page/rail/bible/BibleTab.tsx` / `EntryCard.tsx`.
- Severity: polish
- Fix: hide "first" when missing; row link to the entry.
- Evidence: `rail-story-bible/w1440.png` (y=283).
- Shared: page-local.

### XSC-44 Chapter list: status circle floats between the eyebrow and title; credits rows are a different height

- Page / state: script, all list states
- Widths: 1440, 1280, 1920 (light, dark)
- What is wrong: why does the circle line up with neither "CHAPTER 1" nor the title? It is centred on the row (y=143 against eyebrow y=133 and title y=153); "Opening credits" and "Closing credits" are 36px rows among 56-78px chapter rows.
- Where: `chapters/ChapterList.tsx:100-105,166` (`ROW_CLASS`).
- Severity: polish
- Fix: align the circle to the title line; keep an eyebrow on credits rows.
- Evidence: `reader/w1440.png` (x=241-463, y=115-170).
- Shared: page-local.

### XSC-45 Sun icon next to the gear in the dark theme

- Page / state: script, any state in dark theme
- Widths: 1440, 1024 (dark)
- What is wrong: why do the two bottom nav items look like the same gear? "LIGHT THEME" shows a sun with ticks (x=18-40, y=815-838) that reads as a gear, directly above Settings.
- Where: shell `layout/` nav icon for the theme toggle (not located).
- Severity: polish (shell, may be intended)
- Fix: a clearer sun glyph.
- Evidence: `dark:script/reader/desktop.png` (x=18-40, y=815-880), `script/reader-dark/w1024.png`.
- Shared: shell nav.

### XSC-46 Top bar and panels do not share an edge

- Page / state: script, three-column states
- Widths: 1440 ("PROJECT" x=236 vs panel x=233; pill right x=1420 vs rail x=1423) (light, dark)
- What is wrong: why is the top bar 3px inside the panels?
- Where: shell top bar padding vs `layout/ScriptColumns.tsx:64` page padding; may be intended.
- Severity: polish
- Fix: same horizontal inset.
- Evidence: `reader/w1440.png` (y=15-35).
- Shared: shell.
