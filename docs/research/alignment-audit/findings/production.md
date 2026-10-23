# Production: alignment findings

Part of the [alignment audit](../../alignment-audit.md). Findings are grouped by the round that produced them; a later round's finding that replaces an earlier one says `Supersedes`. Evidence paths are `<page>/<state>/<width>.png` of the light capture, `dark:<page>/<state>/<viewport>.png` for dark, `tall:<page>-w<width>.png` for the below-the-fold captures; the images are not committed (regenerate the repo-viewport ones with `pnpm --dir apps/ui visual:page <page>`).

## Round 4: gap fill

### R4TA-1 Production, 390: the chapter table is silently cut at the card edge and chapter names break mid-word

- Page / state: production default (on-pace), tall capture
- Widths: 390 (both themes expected; light seen)
- Gut reaction: why does the table just stop at "EDIT"? Where are Proof, Pickups, Master and QC, and why is "Caterpillar" written "Caterpill / ar"?
- What is wrong: the card is 356 px wide and the table keeps a 44 rem (704 px) minimum width. The Edit column is cut through its chip at x=390; Proof, Pickups, Master and QC are off-screen with no fade, shadow, arrow or note, and the status chips of a row (the whole point of the table) can only be read by finding a sideways scroll inside the card. The Chapter column is about 70 px, so "Chapter 1 —", "Down", "the", "Rabbit-", "Hole" take five lines and "Caterpillar" is split as "Caterpill" / "ar" (row heights 80 to 130 px against 36 px for "Opening credits").
- Where: `components/production/pipeline/PipelineTable.tsx:95-96` (`overflow-x-auto`, `min-w-[44rem] table-fixed`); XPR1-5 covers the narrow name column, not the hidden columns or the mid-word split
- Severity: breaks use (390 is secondary, so rank below supported widths)
- Fix: pin the Chapter column (sticky, about 9 rem) and add an edge fade or a "scroll for more" hint, or at 390 show each chapter as a card with its stages as a row of chips.
- Evidence: `tall/production-w390.png` y=1150-2600 (crop `crops/r4ta/p390-b.png`, `p390-c.png`)
- Shared: page-local (PipelineTable)

### R4SM-1 Why does the little "Recorded vs plan" chart on Production print "today" on top of the grey note, with the dashed line striking through both?

- Page / state: production (default, on-pace seed, below the fold)
- Widths: 1920, 1440, 1280, 1024, 768 (theme: both)
- Gut reaction: the three labels in the corner of the chart are tangled: "Recorded days not measured yet today" reads as one muddled phrase with a line through it.
- What is wrong: in the 360-450 px wide card the note ("Recorded days not measured yet", x 542-685 at 1024) ends 4 px before "today" (x 689) on nearly the same line; the dashed plan line runs through "measured yet" and "today"; the dotted estimate line ends in a tick that touches "today"; "done Oct 31 (est.)" sits on the estimate line's tip; "due Nov 10" last letter touches the red due line. At 1440 the zoom shows "today" printed over "measured yet". The Schedule page's larger chart avoids this because it moves "today" away from the lines (`todayBelow`/`todayLeft`); Production uses the centred-above placement.
- Where: `production/overview/ProgressChart.tsx:34,89-93,160` (note is mid-height left; today label centred above the dot when the Schedule option is off)
- Severity: looks wrong
- Fix: use the Schedule placement on Production too, and on narrow charts drop the note into the card footer instead of the plot
- Evidence: `S/tall/production-w1440.png` x880-1420 y930-1230 (crop `S/crops/r4sm/p1440_c.png`); `production-w1024.png` y1700-2100 right card
- Shared: `ProgressChart`
- Extends: R3SH-8 (Schedule has the same note but the collision is only on Production)

### R4SM-2 Why does the Chapter pipeline at 768 squeeze every chapter title into 3-4 lines while the seven stage columns each carry 28 px of empty gutter?

- Page / state: production default, on-pace
- Widths: 768 (looks wrong); 390 (see R4SM-3)
- Gut reaction: the table looks like a newspaper column next to a spreadsheet: names broken into slivers ("Chapter 3 — A / Caucus-Race / and a Long / Tale", "Mad Tea- / Party"), every row 53-95 px tall, yet the stage chips sit in wide airy columns.
- What is wrong: table is `min-w-[44rem] table-fixed`; the seven stage columns are fixed 80 px (chips 52 px) and FIN. 64 px, so the name column gets only about 80-100 px at a 736 px card; rows are 53-95 px tall against 34 px at 1024; "Opening credits" wraps; "Tea-Party" breaks at the hyphen; at 1440 (R4SM-4) the opposite happens.
- Where: `production/pipeline/PipelineTable.tsx:29-30,96-101` (`STAGE_WIDTH 5rem`, `FIN_WIDTH 4rem`, `table-fixed`, `min-w-[44rem]`)
- Severity: looks wrong
- Fix: stage columns 3.75-4 rem at <= 800 px (chips are 52 px), or hide the Prep/Master/QC columns under a toggle; give the name column a floor of 12 rem and let the table scroll sideways instead
- Evidence: `S/tall/production-w768.png` y950-2300 (crops `p768_b.png`, `p768_c.png`)
- Shared: `PipelineTable`

### R4SM-3 Why at 390 does the pipeline table scroll sideways with the EDIT chip chopped in half and names broken inside words ("Caterpill / ar")?

- Page / state: production default
- Widths: 390 (secondary) (theme: both)
- Gut reaction: the table is cut off at the right with half a chip showing, and chapter names are 4-6 lines tall.
- What is wrong: name column about 65 px; rows 53-137 px; "Caterpillar" breaks mid-word; the EDIT column is cut at the card edge, PROOF/PICKUPS/MASTER/QC are off-screen with no fade or arrow; the horizontal scroller is a focusable group with no visible hint.
- Where: `production/pipeline/PipelineTable.tsx:95-101`
- Severity: looks wrong (390)
- Fix: at <= 480 px show a stacked row (name over a chip strip), or add a right-edge fade and sticky first column
- Evidence: `S/tall/production-w390.png` y1050-2600 (crops `p390_b.png`, `p390_c.png`)
- Shared: `PipelineTable`

### R4SM-4 Why does the pipeline at 1440 wrap chapter titles onto two lines while there is a 1280-wide layout that fits them on one?

- Page / state: production default, on-pace
- Widths: 1440 (theme: both)
- Gut reaction: at the width a narrator most likely uses, the table is the untidiest: rows 38 px (Opening credits) and 47 px (everything else) alternate, titles break after "Down the / Rabbit-Hole", and there is dead space between the title and the FIN. column.
- What is wrong: at 1440 the board puts Next up and Recorded vs plan in a 360 px right column, which narrows the pipeline to about 790 px: name column about 220 px, so 11 of 14 names wrap to two lines (row heights 47 vs 38); at 1280 the same table is full width and every name fits on one line at 27 px rows. So the more room, the worse the table.
- Where: `production/ProductionPage.tsx` (board grid: pipeline + 22.5rem column from 1280/1440), `production/pipeline/PipelineTable.tsx:96`
- Severity: looks wrong
- Fix: keep the side column to widths >= 1600, or let the name column take the stage columns' slack (stage 4 rem)
- Evidence: `S/tall/production-w1440.png` y580-1380 x200-1440 (crop `p1440_b.png`)
- Shared: board grid

### R4SM-5 Why do the little "?" and red "x" badges sit half outside the stage chips, in a different column on each row?

- Page / state: production default
- Widths: 1920, 1440, 1280, 1024, 768 (theme: both)
- Gut reaction: stray bubbles stuck to the corners of chips, like sticky notes on a grid.
- What is wrong: a 16-18 px "?" bubble overlaps the top-right of the chip (QC on chapters 1-3, EDIT on 7-8, PROOF on 9-10, PREP on 11-12), and hangs 6-10 px beyond the QC chip's right edge toward the card edge; the red "x" circle covers the right end of the 50%/37% chips on chapters 4-6. They are not in a fixed column, so the eye cannot scan them, and they are smaller than 24 px (R3SL-4).
- Where: `production/pipeline/PipelineTable.tsx` and `production/readiness/` (badge positioned absolute on the chip)
- Severity: looks wrong
- Fix: reserve a fixed 20 px slot inside each stage cell (chip left, badge right) or move the badge into the chip as an icon
- Evidence: `S/tall/production-w1280.png` y880-1780 (crop `p1280_b.png`); `production-w768.png` y950-1950
- Shared: pipeline stage cell

### R4SM-6 Why does the second strip of figures end in a lone "Effective rate" with half the row empty, and its divider stop mid-card?

- Page / state: production default
- Widths: 1024, 768 (390 likewise) (theme: both)
- Gut reaction: three tiles laid out in a two-column grid, so the third drops to a row by itself with a blank right half and a divider that ends in mid-air.
- What is wrong: the strip uses `--strip-half = ceil(tiles/2)` columns between 36 rem and 64 rem: 3 tiles become 2 columns, so "Effective rate" sits alone (x 70-478 of 70-886), the bottom rule under "Work time logged" runs only to x=478 and the right half is empty. The six-tile strip above becomes a clean 3x2.
- Where: `production/overview/KpiRow.tsx:19-20` (`--strip-half`)
- Severity: looks wrong
- Fix: for an odd count at the half step use 3 columns (or 1), never ceil(n/2)
- Evidence: `S/tall/production-w1024.png` y380-600 (crop `p1024_a.png`); `production-w768.png` y475-670
- Shared: `KpiRow`

### R4SM-7 Why does the START SESSION button run off the right of the screen at 390?

- Page / state: production default
- Widths: 390 (theme: both)
- Gut reaction: the main button is cut in half by the window edge and the explanatory note beside it is nowhere.
- What is wrong: the action row (timer chip, Stop timer, export icon, Start session) is wider than the 358 px content, START SESSION ends at x=390 with its right padding clipped (the row scrolls or overflows), and the "Experimental: switched off in Settings" note that explains why it looks disabled is off-screen. At 768/1024 the same row is followed by a 3-line, 24-character note that wraps ragged beside the button.
- Where: `production/pipeline/PageHeader.tsx:68-122` (action row without wrap; note `max-w-[24ch]`)
- Severity: looks wrong (390: breaks use)
- Fix: let the action row wrap at narrow widths and put the note on its own row under the buttons
- Evidence: `S/tall/production-w390.png` y180-230 (crop `p390_a.png`); `production-w768.png` y185-235
- Shared: `PageHeader`

### R4SM-8 Why are the titles and rules of two cards side by side 4-9 px out of step?

- Page / state: production default (This week / Recording check; Next up / Recorded vs plan)
- Widths: 1920, 1280 (row 3 pair); 1280, 1024, 768 (Next up pair) (theme: both)
- Gut reaction: the left card's header line is a few pixels higher than the right card's, so the two heads look misprinted.
- What is wrong: "Recording check" and "Recorded vs plan" carry a 36 px icon button in the header so their header band is 8-9 px taller; the title of "This week" is at y 413 and "Recording check" at y 417 (1280), rules at y 431 vs 439; "Next up" rule y 405 vs "Recorded vs plan" y 410 (1280), 160 vs 168 (1024), 543 vs 552 (768). The body rows below also start 6-9 px apart. At 1024/768 the same two pairs stack and the header heights still differ (This week about 34 px vs Recording check about 53 px).
- Where: `primitives/Panel.tsx` header with an `action` slot (extends XSH-5)
- Severity: looks wrong
- Fix: fix the header band at one height (min-h to the icon button size) for every Panel
- Evidence: `S/tall/production-w1280.png` y380-480 and y1240-1330; `production-w1024.png` y1700-1900
- Shared: `Panel` header

### R4TA-2 Recorded vs plan: the "today" label is printed on top of the grey "not measured yet" sentence and the projection line

- Page / state: production default
- Widths: 1440, 1280, 1024, 768 (not 1920 where the plot is wider; seen at 1920 only as small)
- Gut reaction: why are two pieces of text written over each other in the chart?
- What is wrong: "today" (above the dot) overlaps the right end of "Recorded days not measured yet" (about 6 px of overlap at 1440), the sentence is drawn along the 2 h gridline so the line runs through its middle, and the dotted orange projection line then cuts through the word "today". Three things (label, sentence, projection) share one 40 px area. XPR2-18 says labels are struck by lines in general; this is the specific text-on-text collision at the default state of every width from 1440 down.
- Where: `components/production/overview/ProgressChart.tsx:89-93` (`todayBelow` / `todayLeft` placement; the "not measured" caption is a separate text with no collision test against it)
- Severity: looks wrong
- Fix: draw the "not measured yet" note as a caption under or above the plot (not inside it), or move "today" to the side the code already knows is clear.
- Evidence: `tall/production-w1440.png` x=1100-1280, y=1060-1130 (crop `crops/r4ta/p1440-c.png`); same at `production-w768.png` y=2440-2500
- Shared: ProgressChart (also drawn by Schedule)

### R4TA-3 Production at 1280 and below: "Next up", the thing to do, is the very last block, 1500-2400 px down

- Page / state: production default
- Widths: 1280, 1024, 768 (390 by the same grid)
- Gut reaction: the page shows my next job at the bottom, below a 14-row table I have to scroll past.
- What is wrong: at 1440 and above Next up sits right of the pipeline, beside the first rows. Below 1281 px the right column is re-flowed under the table (`max-[1281px]:grid grid-cols-2`), so the only call to action ("Open Booth", "Review pickups") is at y~1990 at 1280 and y~2300 at 1024/768, after the KPI tiles, timer strip, book bar, This week, Recording check and 16 table rows. The header already has the primary Start session, so the two actions are 2000 px apart.
- Where: `components/production/ProductionPage.tsx:432-453` (grid order of the lower board)
- Severity: looks wrong (organisation)
- Fix: put Next up directly under the KPI strip at <=1280 (order-first on the right column) and let the table follow.
- Evidence: `crops/r4ta/p1280-b.png`, `p1024-a.png`/`p1024-b.png`/`p1024-c.png`, `p768-b.png`
- Shared: page-local

### R4SM-9 Why does the grey legend band in "Where the book stands" stop short of the card's bottom, leaving a white strip?

- Page / state: production default and no-due-date
- Widths: 1920 (37 px strip), 768 (11 px strip) (theme: both)
- Gut reaction: the card is stretched taller than its content, so the grey footer floats above a blank white margin.
- What is wrong: the card stretches to match This week / Recording check; the legend band (grey) ends at y 388 while the card ends y 425 at 1920; at 768 a second hairline appears 11 px under the band.
- Where: `production/overview/StageBar.tsx` (band) inside the stretched row
- Severity: polish
- Fix: let the band be `mt-auto` so it hugs the card foot, or make the card not stretch
- Evidence: `S/global/nav-rail-collapsed/w1920.png` x210-840 y270-430; `.../w768.png` y560-615
- Shared: `StageBar`

### R4SM-10 Why is there a tiny dark-green sliver at the left of the stacked bar when "Delivered" is 0:00?

- Page / state: production default, shell/engine-mismatch
- Widths: all (theme: both)
- Gut reaction: a stray dark mark at the start of the bar that looks like a rendering glitch.
- What is wrong: the Delivered segment is 0 wide but draws a 3-4 px dark sliver with a rounded cap at x 85 (1024); the legend lists "Delivered 0:00" with a dark dot so it is data, but at 0 it should not paint.
- Where: `production/overview/StageBar.tsx`
- Severity: polish
- Fix: skip segments of zero width
- Evidence: `S/crops/r4sm/em1024.png` x85-90 y405-420
- Shared: `StageBar`

### R4SM-11 Why does "Next up" lay out its two items differently, and why do the right column and the pipeline end at different heights at 1920?

- Page / state: production default
- Widths: 1280, 1024, 768 (item layout); 1920 (foot) (theme: both)
- Gut reaction: item 1 has its button and a grey note on one line, item 2 has its button alone under three lines; the card has blank under the last button; at 1920 the right column ends 26 px below the pipeline card.
- What is wrong: item 1 = [Open booth][Experimental: switched off in Settings.] on one row at 1280/1024, but under the button on its own line at 1440/768; item 2 = text then button alone. The foot of Next up has 25-35 px of blank under the last button. At 1920 the right column's last card ends y 1263, the pipeline card y 1237.
- Where: `production/pipeline/NextUp.tsx:35` and the board grid in `ProductionPage.tsx`
- Severity: polish
- Fix: same slot (button row, note under) for every item; align row bottoms with `items-stretch`
- Evidence: `S/crops/r4sm/p1280_b.png` lower right; `S/tall/production-w1920.png` x1400-1920 y880-1280
- Shared: page-local

### R4SM-12 Why do "This week" and "Recording check" at 1024 and 768 span the full width for two or three short rows?

- Page / state: production default
- Widths: 1024, 768 (theme: both; may be intended)
- Gut reaction: a thin strip of words with a 700 px gap between the label at the left and the value at the right.
- What is wrong: each card is 816-736 px wide with 2-3 rows ("Recorded this week" ... "Not measured yet"), 90 px tall in body; the row's label and its value are 600+ px apart so the eye has to track across a blank band. At 1280 they sit side by side and read well.
- Where: board grid (`ProductionPage.tsx`), `overview/WeekCard.tsx`, `overview/CheckCountsCard.tsx`
- Severity: polish
- Fix: keep the two cards in one row down to 768 (each 360 px is enough for these rows)
- Evidence: `S/tall/production-w1024.png` y850-1130 (crop `p1024_b.png`)
- Shared: board grid

### R4TA-4 Production at 1920: 480-600 px of nothing between a chapter name and its numbers, with no row guide

- Page / state: production default
- Widths: 1920 (1440 has the opposite problem, XPR2-10)
- Gut reaction: I cannot follow "Chapter 6" across to its chips.
- What is wrong: the Chapter column takes about 600 px for names that need about 250, so "0:17" and the first chip start 480 px to the right of the end of the name; rows are only separated by 1 px rules, with no zebra or hover guide, and the chips are 50 px wide in columns about 100 px apart. The table reads as two clusters (names at the left, a grid of small chips at the right).
- Where: `PipelineTable.tsx:96` (`table-fixed` splits the free width between all columns)
- Severity: polish (may be intended)
- Fix: cap the table at about 1000 px or give the stage columns a fixed width and let the name column keep the rest as a flexible track; add a hover row tint.
- Evidence: `crops/r4ta/p1920-b.png`
- Shared: page-local

### R4TA-5 Production: right column and table card never end together (extends XPR2-15)

- Page / state: production default
- Widths: 1920, 1440
- Gut reaction: the two sides of the board finish at different heights, and the direction flips with width.
- What is wrong: at 1440 Recorded vs plan ends about 140 px above the bottom of the table card (empty beige to its left of a 140 px strip); at 1920 the opposite: the right column (Next up + chart) is 25 px taller than the table card. XPR2-15 recorded only the 1440 gap (210 px).
- Where: `ProductionPage.tsx:432` (`items-start` grid, columns are not stretched)
- Severity: polish
- Fix: `items-stretch` and let the chart card fill, or pin the column to the table height.
- Evidence: `crops/r4ta/p1440-b.png` (right column ends y=265 vs table y=362), `p1920-a.png` (right 311 vs left 298)
- Shared: page-local

### R4TA-6 Production at 390: "HOURS PER FINISHED HOUR" breaks with an orphan "HOUR", and the book legend is three ragged rows

- Page / state: production default
- Widths: 390
- Gut reaction: one tile has a two-line label while its neighbour has one, so the big numbers sit at different heights.
- What is wrong: the label is two lines ("HOURS PER FINISHED" / "HOUR") so "12.3 : 1" sits 17 px lower than "20:00" beside it; the sub-lines of the two tiles end at different y. The "Where the book stands" legend wraps as 2 + 2 + 1 items with different left edges for row starts (R3PR1-2 covers the 1440 wrap).
- Where: `components/production/overview/*` KPI tile label (`uppercase tracking-wide`), no `min-h` on the label
- Severity: polish (390)
- Fix: shorten the label ("Hours per hour") or reserve two lines on every tile label.
- Evidence: `crops/r4ta/p390-a.png`
- Shared: KPI tile

## Round 3: coverage gaps and scanner cross-check

### R3PR1-1 Missing-track panel still offers playback and healthy-looking facts under the red error

- Page / state: chapter-track-panel-missing
- Widths: 1920, 1280, 1024, 768, 390, dark 1440/1024/768 (theme: both)
- What is wrong: why does a panel that says "The linked track is not in the saved project" still show Play, Skip 30 s, "0:00 / 10:00", a full-width "SELECT IN REAPER" and "Items 1 playable of 1 / Span 0:00 to 10:12" as if the track were fine, with the same blue dot as the linked state? At 1280 the red box ends at y 255, the facts run y 282-407 and the play row y 432-466, so a third of the panel contradicts the error. Play and Select have nothing to act on.
- Where: `production/ChapterTrackPanel.tsx:197` (player section shows whenever `trackIndex >= 0`, not gated on `state.kind === 'missing'`), `:171-196` (facts unconditioned), `:323` (dot colour is the track colour, never the state)
- Severity: looks wrong
- Fix: when missing, drop the play row and Select in REAPER, label the facts "Last known", and draw the dot hollow or danger-coloured.
- Evidence: `production/chapter-track-panel-missing/w1280.png` x 960-1280 y 90-540; dark `dark:production/chapter-track-panel-missing/desktop.png` x 1138-1422 y 95-540
- Shared: page-local

### R3PR1-2 Where-the-book-stands legend wraps at 1440 and leaves "Not recorded yet" alone on a second row

- Page / state: all board states at 1440 and 390 (at-risk, daw-not-linked, toast-undo, banner, removed-list, closing, sync-consent behind the scrim)
- Widths: 1440 (card 233-728, 495 px; two rows), 390 (three rows); one row at 1920, 1280, 1024, 768 (theme: both)
- What is wrong: why is one legend entry dropped under the other four? The first four items fill x 249-705 and "Not recorded yet 1:18" sits alone at x 249, y 549, so the grey band is 64 px tall against 36 px at the other widths and the left card changes height by 28 px between breakpoints. The row also reads as two unrelated lines because the second item has no neighbours.
- Where: `production/overview/StageBar.tsx:39` (`flex flex-wrap gap-x-4 gap-y-1`, five fixed-width entries)
- Severity: looks wrong
- Fix: lay the legend out as a 2- or 3-column grid with a stable entry order (or put the total at the right of the bar) so it never leaves a lone item.
- Scanner: A1/A2/A3 on `ul.flex.flex-wrap.gap-x-4` (rect 233,505,495,64)
- Evidence: `production/at-risk/w1440.png` x 233-728 y 505-570; `dark:production/chapter-track-panel-linked/desktop.png` x 233-728 y 395-445
- Shared: page-local

### R3PR1-3 Import review below 1180 px: preview and Import options fall to the bottom, after the character list

- Page / state: import-confirm, import-confirm-markdown, import-review-characters, import-review-collapsed
- Widths: 1024, 768 (single column below 1180 px) (theme: both; seen in dark, the class is theme-independent)
- What is wrong: why does the control that changes the rows above ("Read a heading's second line as its subtitle", and in the Markdown state "Markdown chapter heading level") sit a full scroll away from them? In the collapsed state at 1024 the "IMPORT OPTIONS" label is cut at the fold (y 601, footer rule y 623) and the options card is below it; in the characters state the chapter preview comes after the three character rows (y 570-620). The preview of "Chapter One" also never follows the row you act on.
- Where: `production/ImportReview.tsx:263` (`grid gap-4 min-[1180px]:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]`, right column is the last child)
- Severity: looks wrong
- Fix: below 1180 px put Import options above the outline list (it is a pre-condition for the rows) and keep the preview directly under the active row or in a collapsible.
- Evidence: `dark:production/import-review-collapsed/small-desktop.png` y 485-623; `.../import-review-characters/small-desktop.png` y 560-620; `.../import-review-collapsed/tablet.png` y 555-810
- Shared: page-local

### R3PR1-4 Editing check: "Clean up in Editing" is separated from the Empty-space card it belongs to, and still invites hearing candidates when there are none

- Page / state: `editing-check-*` (all nine)
- Widths: 1920, 1280, 1024, 768, dark 1024/768 (theme: both)
- What is wrong: why does a link about the Empty-space candidates sit under the Click and Breath cards, 350 px below the card it acts on? In editing-check-complete-clean the card says "Met. Checked; no open empty-space candidate remains." and the link under Breath still says "Clean up in Editing to hear each candidate and trim, keep or skip it." There is nothing to hear.
- Where: `editing/EditingCheckPanel.tsx:350-356` (link rendered once after the `ClassSummary` map, not tied to a class or to `candidates.length`)
- Severity: looks wrong
- Fix: render the link inside the Empty-space card and only when it has candidates; keep Match levels as its own row.
- Evidence: `production/editing-check-complete-clean/w1280.png` x 960-1280 y 266-795 (card y 266-416, link y 766); `editing-check-complete-candidates/w1920.png` link at y 450 (screen 1100 px scale)
- Shared: page-local

### R3PR1-5 Editing-check states do not say what state they are in

- Page / state: editing-check-partial, editing-check-never-checked, editing-check-running
- Widths: 1920, 1280, 1024, 768 (theme: both)
- What is wrong: why does a cancelled run look identical to a finished one? Partial (cancel pressed mid-run, items cached) renders the same three cards as complete-candidates; only the button text changes ("CHECK AGAIN" 99 px vs "CHECK EDITING" 110 px). Never-checked says "This chapter's editing has not been checked yet." and then "Based on the saved REAPER project, file modified Sep 21, 2026 (29 days ago)" under it, a basis for a check that never ran. Running keeps the old "Not met. 1 empty-space candidate" card live under "Checking item 1 of 3…", so the old result reads as the new one.
- Where: `editing/EditingCheckPanel.tsx:111-126` (`ClassSummary` always prints the basis line when a signal exists; no cancelled or in-progress note, no dimming of stale cards)
- Severity: looks wrong
- Fix: say "Stopped after 1 of 3 items" in partial, drop the basis line when the reading is "not checked", and dim or label cards "Previous result" while a run is active.
- Evidence: `editing-check-partial/w1280.png` y 214-440; `editing-check-never-checked/w1280.png` y 266-416; `editing-check-running/w1280.png` y 224-490
- Shared: page-local

### R3PR1-6 Ambiguous track panel offers two competing ways to fix the same conflict

- Page / state: chapter-track-panel-ambiguous
- Widths: 1920, 1280, 1024, 768, dark 1440/1024/768 (theme: both)
- What is wrong: why are there two answers to one question? Two bordered rows ("Chapter 1 / KEEP THIS ONE", "Chapter 2 / KEEP THIS ONE") already resolve it, then a "LINK" block below repeats it as a select defaulting to "Chapter 1" with a CONFIRM button (select 40.8 px, button 36 px). The select's first option duplicates the first row and a narrator cannot tell which control wins.
- Where: `production/ChapterTrackPanel.tsx:228-248` (conflict rows) and `:269-290` (`MappingConfirm` always rendered)
- Severity: looks wrong
- Fix: while status is ambiguous with 2+ links hide the Link select block, or fold it under "Pick a different track".
- Evidence: `chapter-track-panel-ambiguous/w1280.png` x 960-1280 y 130-405; dark `.../desktop.png` y 130-405
- Shared: page-local

### R3PR1-7 Triple "no date" message at the top of every no-deadline state

- Page / state: every board and overlay state except at-risk (removed-list header, toast-undo, banner, daw-not-linked, sync-consent, remove-confirm, track panels, `editing-check-*`)
- Widths: 1920, 1280, 1024, 768, dark (theme: both)
- What is wrong: why is the same fact said three times in 80 px? Subtitle "no delivery date set" (y 119), a grey pill "No due date set" below it (y 152), and the Due tile "Not set / Set it on the Schedule" (y 258 at 1280). The pill is the only one of the three with no action.
- Where: `production/pipeline/PageHeader.tsx:88` (subtitle), the verdict pill row, and the Due tile
- Severity: looks wrong
- Fix: keep the Due tile (it carries the action), drop the pill and shorten the subtitle to "12 chapters · 29,189 words".
- Evidence: `chapter-sync-toast-undo/w1280.png` x 80-370 y 105-165 and x 1068-1264 y 195-268
- Shared: page-local (extends XPR1-13)

### R3PR1-8 Pipeline table text starts 6 px left of the card title above it

- Page / state: every board state
- Widths: 1920, 1440, 1280, 1024, 768, 390 (theme: both)
- What is wrong: why does "Chapter pipeline" start to the right of its own table? Title at x 249, "CHAPTER" label and "Opening credits" at x 243 at 1440 (1280: title 97, rows 91). The table's cell padding is 10 px, the card header's is 16 px.
- Where: `production/pipeline/PipelineTable.tsx:12-13,96` (table spans the card flush; cell padding is smaller than `--panel-pad`)
- Severity: looks wrong
- Fix: make the first column's left padding equal the card header's inset (or inset the title to the cell's).
- Scanner: G2 `table.border-collapse` (text x 243 vs title x 249)
- Evidence: `production/at-risk/w1440.png` crop x 215-715 y 630-780 (`crops/r3pr1/pipe1440.png` x 28 vs 35)
- Shared: page-local

### R3PR1-9 daw-not-linked looks the same as linked

- Page / state: daw-not-linked
- Widths: 1920, 1280, 1024, 768, dark 1024/768 (theme: both)
- What is wrong: why does "REAPER not linked" look like "REAPER linked"? The only differences are a grey dot instead of a green one on the 22 px chip at the top right and the chip's tooltip; the page body, the header note ("Experimental: switched off in Settings. Open DAW settings") and START SESSION are identical to the linked boards. A narrator gets no sentence saying the DAW is not connected and no action on the page.
- Where: `primitives/HeaderChip.tsx:21` (chip is the only state carrier); header note in `production/pipeline/PageHeader.tsx`
- Severity: looks wrong
- Fix: show one line under the title ("REAPER is not linked. Link it in the audio engine panel") with a button when the DAW is not linked.
- Evidence: `daw-not-linked/w1280.png` x 1192-1260 y 15-38 against `at-risk/w1280.png` same region
- Shared: `HeaderChip`

### R3PR1-10 Credits panel shows an unfixable red error and a Recording check button for a row with no track

- Page / state: credits-panel
- Widths: 1920, 1280, 1024, 768, dark 1024/768 (theme: both)
- What is wrong: why is "3 tokens not filled in: Title, Author, Narrator" in red with nothing to click? The only controls are Open in Script, a status select and RECORDING CHECK (which runs on a row that says "Recorded: No track linked yet"). The fix lives in the Credits setup dialog or Settings > Credits and the panel does not point to either.
- Where: `production/CreditsRowPanel.tsx:28-29,77-80`
- Severity: looks wrong
- Fix: add a "Fill in credits" action next to the error and disable or hide Recording check until a track is linked.
- Evidence: `credits-panel/w1280.png` x 960-1280 y 70-305
- Shared: page-local

### R3PR1-12 Dark theme: "Light theme" sun and Settings gear look like the same icon

- Page / state: every state in dark (rail foot)
- Widths: 1440 (rail with labels), 1024, 768 (icon rail) (theme: dark)
- What is wrong: why do two stacked buttons show almost the same cog? At 1024 the sun is at y 708 and the gear at y 750, 42 px apart, both a ring of short teeth; only the labels at 1440 ("LIGHT THEME", "SETTINGS") tell them apart. In the icon-only rail there is no label.
- Where: `layout/AppShell.tsx:248-256` (`iconFor('themeLight')` vs `faGear`)
- Severity: looks wrong
- Fix: use a plain sun with long rays or a half-filled circle for the theme toggle.
- Evidence: `dark:production/at-risk/small-desktop.png` x 0-64 y 690-770 (zoom `crops/r3pr1/rail-dark.png`); `.../at-risk/desktop.png` x 0-215 y 810-880
- Shared: `AppShell`

### R3PR2-1 Stage bar legend breaks onto a second row with one orphan item at 1440

- Page / state: on-pace, no-data, live-updates-degraded and every state with the board (dark too)
- Widths: 1440 (legend row 1 holds Delivered, Proofed, Edited, Recorded; "Not recorded yet 1:18" alone on row 2 at x249, y549), 390 (one item per row); at 1920 and 1280 it is one row; theme: both
- What is wrong: Why is the last legend item dropped under the others, alone, with the grey band suddenly 64 px tall instead of 40? The 1.5fr card is 496 px wide at 1440, the five items need about 650, so the fifth wraps and the card's body grows to match.
- Where: `production/overview/StageBar.tsx:38` (`ul flex flex-wrap gap-x-4 gap-y-1`)
- Scanner: A1 / A2 / A3
- Severity: looks wrong
- Fix: give the five items a 2-column or 3+2 grid with fixed cells, or drop the hours text under the swatch so all five fit on one row.
- Evidence: `production/on-pace/w1440.png` x233-728, y505-570; `dark:production/recording-check-pickups/desktop.png` y430-445
- Shared: page-local

### R3PR2-2 Report dialog: Cancel and Export sit on the bottom edge on a 768-tall window

- Page / state: report-dialog
- Widths: 1024 (768 px tall: dialog y78-690, buttons y657-690, the dialog's bottom border is cut), also d1024; 1280 (800 tall) buttons y679-715 against dialog bottom 718: 3 px below; 1920 fine; theme: both
- What is wrong: Why are the two buttons touching the bottom of the dialog, with no lower padding and the corner clipped? The footer lives inside the body that scrolls, and the popup caps at 80 vh, so on short windows the footer is pushed to the edge instead of staying pinned with its 16 px padding.
- Where: `production/report/ReportDialog.tsx:160` (footer `div ... border-t px-4 pt-3 pb-4` inside the content wrapper, which `headerless` places in the scrolling body), `primitives/Dialog.tsx:155` (`maxHeight 80dvh`) and `:176` (body `overflow-y-auto`)
- Severity: looks wrong
- Fix: pass the footer as the Dialog `actions` so it is outside the scroller (same fix as XPR2-24 at 390).
- Evidence: `production/report-dialog/w1024.png` y645-690; crop `crops/r3pr2/rd_foot.png` (dark d1024); `report-dialog/w1280.png` crop `rd_foot1280.png`
- Shared: page-local (Dialog `headerless`)

### R3PR2-3 KPI tiles: the clickable and hover area is only as wide as the text

- Page / state: on-pace, no-data and every state with the KPI card
- Widths: 1920, 1440, 1280, 768, 390 (button 135-166 px wide inside tiles 198-278 px wide, 102 px tall), theme: both
- What is wrong: Why does a tile only light up under its text? The tile `button` is `size-full`, but its parent is the Tooltip's `inline-flex` span, which shrinks to the text, so `size-full` fills the span and not the cell; the hover wash and the click target stop 60-110 px short of the tile's right border.
- Where: `production/overview/KpiRow.tsx:26-31` (button `block size-full`), `primitives/Tooltip.tsx:46` (`TooltipTarget` renders `inline-flex`)
- Scanner: H2 (six KPI tiles)
- Severity: looks wrong
- Fix: `className="flex w-full"` on the TooltipTarget (or `inline={false}` block variant) so the button fills the `li`.
- Evidence: scan rects `scan-out/production/on-pace/w1440.json` (e.g. button x1226-1366 in tile x1225-1424); `production/on-pace/w1440.png` y178-282
- Shared: `TooltipTarget`

### R3PR2-4 Recording-check result tiles: the four values sit on two different baselines

- Page / state: recording-check-complete, -incomplete, -pickups, -stale, -cascade
- Widths: 1920, 1280, 1024, 768 and dark (e.g. complete w1920: "100%" and "13:48" at y395, "24" and "about" at y375), theme: both
- What is wrong: Why do the big numbers zigzag? "TEXT PRESENT" wraps to two label lines so tiles 1 and 3 (whose labels also wrap, "AUDIO CHECKED") start their value 20 px lower than tiles 2 and 4, whose one-line labels ("PARAGRAPHS", "PACE") leave the value higher. This is on top of the label collision in XPR2-1.
- Where: `production/RecordingCheckReport.tsx:106-110` (four `StatTile`s) with `primitives/StatTile.tsx:42-48` (no reserved label height)
- Severity: looks wrong
- Fix: reserve two label lines (or `min-h` the label) in the strip, or put the label under the value.
- Evidence: `production/recording-check-complete/w1920.png` x1619-1920, y340-470; `dark:production/recording-check-stale/small-desktop.png` y485-610
- Shared: `StatTile`

### R3PR2-5 Import review: the title of a row is drawn three different ways, and "is read as text" runs into the quote

- Page / state: import-review-text-subtitle, import-review-subtitles-off, import-review-repaired
- Widths: 1920, 1280, 1024, 768, theme: both
- What is wrong: Why does "Chapter One" look light while "Chapter Two" next to it is bold? Row titles come in three styles: whole title bold (`Chapter One Down the Rabbit-Hole`, `Chapter Three`), bold label plus grey rest (`Chapter Two — The Pool of Tears`), and the text-line row in plain weight (`Chapter One · "Curiouser and curiouser!" cried Alice is read as text`). In that last row the note "is read as text" follows the quoted sentence with only a space, so it reads as part of what Alice cried; at 1280 and below it is clipped away ("Chapter One · "Curiouser and…"), so the reason the row differs is never shown.
- Where: `production/ImportReview.tsx:160-175` (three branches, only two apply `font-semibold`), `:52` (`TEXT_LINE_NOTE`)
- Severity: looks wrong
- Fix: one weight for the name part in every branch, put the note in its own muted chip after the title, and let it survive truncation.
- Evidence: `production/import-review-text-subtitle/w1920.png` x326-760, y400-415; `.../w1280.png` y392-410; `import-review-subtitles-off/w1920.png` y400-460
- Shared: page-local

### R3PR2-6 Import review: the same counts are said four times and the repairs are last

- Page / state: import-review-repaired (and the three headers of the other two states)
- Widths: 1920 (the state that shows repairs); at 1280 and 1024 the repairs list is below the fold, at 768 the preview card is cut under it; theme: both
- What is wrong: Why is this dialog so wordy and why do I have to scroll to find the thing the state is about? "5 narration chapters ... 2 repairs made to the source" appears in the lead sentence, again in the 12 px counts line, again as four chips ("5 chapters / 221 paragraphs / 3 character suggestions / 2 repairs"), again on each group header ("5 chapters", "1 section", "3 of 3 checked", "2 made to the source"); two headings 80 px apart say the same job ("Check the chapter outline", then "REVIEW WHAT WAS FOUND"); and the 2 repairs, which the narrator is asked to accept, are the last group, under Story Bible suggestions.
- Where: `production/ImportReview.tsx:70-76` (sentence + counts), chips and legend below it (`:263-270`), group order in the outline
- Severity: looks wrong
- Fix: keep chips (they are the summary) and delete the counts line; put "Repairs" first when there are any; one heading.
- Evidence: `production/import-review-repaired/w1920.png` y270-440 and y725-800; `.../w1280.png` y640-655 (Repairs row cut at the footer)
- Shared: page-local

### R3PR2-7 Recording-check panel: one fact, two formats, two wordings

- Page / state: recording-check-complete, -incomplete, -pickups, -stale, -cascade
- Widths: all, theme: both
- What is wrong: Why does the panel say "2140 of 2140 words" and, 80 px below, "2,140 of 2,140 words"? The verdict sentence comes from the host (`%d`, no thousands separator) while the tile is formatted in the UI. Likewise "24 of 24 fully read" in the tile against "24 of 24 fully recorded" in the Paragraph detail row, and "Pickups (0): None from this check." sits directly above "Pickup list: 3 open (project-wide)".
- Where: `apps/desktop/internal/coverage/judgement.go:33` (`%d` words), `production/RecordingCheckReport.tsx:107` (`toLocaleString`), Paragraph detail summary in the same file
- Severity: looks wrong
- Fix: format the number the same way in both (host sends raw counts), one verb ("read"), and label the 3 as project-wide next to the 0.
- Evidence: `production/recording-check-complete/w1920.png` x1619-1900, y280-300, y395-420, y560-575 and y775
- Shared: page-local (host string)

### R3PR2-8 Stage readiness: a run-on criterion, then the same criterion again, then a contradiction

- Page / state: stage-evidence-not-ready, -changed (and -recommended for the repeated title)
- Widths: 1920, 1280, 1024, 768, theme: both
- What is wrong: Why does the grey box read "Every paragraph of the chapter's text is in the recording, in order not met" and then the very next block repeats "Every paragraph of the chapter's text is in the recording, in order" with "Not met" at the right? In the changed state the box says "Moved to Editing, but the evidence has changed" and directly under it "Nothing moves until you decide.", and the amber box says "was Met, now Not met" with capitals in the middle of a sentence. The panel title "Stage readiness", the small caps "STAGE READINESS" and "Chapter 6" say the heading twice.
- Where: `production/readiness/verdict.ts:145,149` (`${unmet(...)} not met` appended without a separator), `production/readiness/ReadinessPanel.tsx:77`
- Severity: looks wrong
- Fix: "Not ready to move to Editing: <criterion>" in the box, drop the duplicate evidence title or the box line, sentence-case the was / now text, one heading.
- Evidence: `production/stage-evidence-not-ready/w1920.png` x1619-1900, y195-430; `stage-evidence-changed/w1920.png` y195-410
- Shared: page-local

### R3PR2-9 At 390 buttons wrap onto two lines in four places

- Page / state: recording-check-running, `import-review-*` (footer and group headers), no-data / on-pace (Next up)
- Widths: 390 (secondary), theme: both
- What is wrong: Why are two-word buttons two lines tall? "Continue in background" (162 px wide, 36 px tall, wraps), "Replace and reset" (100 px wide), "Review pickups" and "Start timer" (95 px) and "Open Booth", plus the import group headers "REFERENCE MATERIAL / 2 sections" and "STORY BIBLE CHARACTER SUGGESTIONS / 3 of 3". Buttons in the same footer stay one line.
- Where: `primitives/Dialog.tsx` footer `flex gap-2` (no wrap), `production/pipeline/NextUp.tsx:189-220`, `primitives/Disclosure.tsx` header
- Scanner: W1
- Severity: looks wrong (390 only)
- Fix: let dialog footers stack below about 28 rem; `whitespace-nowrap` plus a full-width stack in Next up.
- Evidence: `production/import-review-repaired/w390.png` y690-745; scan rects `scan-out/production/recording-check-running/w390.json` [75,563,162,36]
- Shared: `Dialog` footer (extends XPR2-4 and XPR2-17)

### R3PR1-11 Closing credits row simply disappears when the closing template is missing

- Page / state: credits-closing-not-set-up
- Widths: 1920, 1280, dark 1024/768 (theme: both)
- What is wrong: why does the table end at Chapter 12 with no hint that closing credits exist? The row is absent (catalogued as intended) and nothing on the page says the template is not set up or where to add it (Settings > Credits). At 1280 the table ends at y 453; the removed-list state shows a "Closing credits" row at y 291 for the same book. May be intended.
- Where: pipeline row construction (see catalog row `credits-closing-not-set-up`); no placeholder row
- Severity: polish
- Fix: keep the row as a dashed placeholder "Closing credits: set up in Settings > Credits".
- Evidence: `credits-closing-not-set-up/w1280.png` y 40-475
- Shared: page-local

### R3PR1-13 Import review: three left edges and a 12 px step before the first row

- Page / state: import-confirm, import-confirm-markdown, import-review-characters, import-review-collapsed
- Widths: 1920, 1440, 1280, 1024 (theme: both)
- What is wrong: why do the headings step in? At 1920 "Check the chapter outline" starts x 306, the chips x 314, "REVIEW WHAT WAS FOUND" x 310, the caret x 315, the row names x 326, and in the characters state the check boxes x 331 against "Select all" x 327. Five left edges inside 25 px.
- Where: `production/ImportReview.tsx` (heading, chip row, fieldset padding and `pl-5` rows each add their own inset)
- Severity: polish
- Fix: one content inset for heading, chips, section labels and rows; indent only the rows under a caret by a fixed step.
- Evidence: `crops/r3pr1/imp-left.png` (crop of `import-confirm/w1920.png` x 296-656 y 230-570)
- Shared: page-local

### R3PR1-14 Remove-from-recording confirm is the primary orange while the other destructive confirm is a red outline

- Page / state: chapter-remove-confirm, import-confirm family
- Widths: 1920, 1280, dark 1024/768 (theme: both)
- What is wrong: why does "REMOVE FROM RECORDING" look like a normal Save while "REPLACE AND RESET" (which wipes Story Bible and notes) is red? Both dialogs destroy data; the panel trigger "Remove from recording…" is red outline as well, so the dialog button changes colour from the button that opened it.
- Where: `production/RemoveFromRecordingDialog.tsx` (confirm button variant not found by grep), `production/ImportReview.tsx` footer
- Severity: polish
- Fix: one destructive confirm style for both.
- Evidence: `chapter-remove-confirm/w1280.png` x 902-1070 y 502-540; `import-confirm/w1280.png` x 931-1070 y 665-700
- Shared: `ConfirmDialog` / `Button` variants

### R3PR1-15 Section-header info icons: on two of four rows, detached at the far right, 15 px hit area

- Page / state: import-confirm, import-confirm-markdown, import-review-characters, import-review-collapsed; board (Fin. column)
- Widths: 1920, 1440, 1280, 1024, 768, 390 (theme: both)
- What is wrong: why is the (i) for "Front matter" 480 px away from its label? In the collapsed list the info buttons sit at x 764 on the Front matter and Reference material rows only, Narration chapters and Story Bible have none, so the right edge looks ragged. The buttons are 15x15 and the pipeline "FIN. (i)" is the same 15 px control.
- Where: `primitives/Tooltip.tsx:115` (`size-[15px]`); `production/ImportReview.tsx` section header
- Severity: polish
- Fix: put the info icon directly after the count text and give it a 24 px hit box.
- Scanner: H1 `button.ml-1.inline-flex.size-[15px]` ("About front matter", "About reference material", "About the Fin. column")
- Evidence: `import-review-collapsed/w1280.png` x 750-775 y 385-440; `at-risk/w1440.png` x 460-480 y 665-680
- Shared: `Tooltip` info button

### R3PR1-16 Header REAPER chip is a 67 x 22 px button

- Page / state: every board state, plus daw-not-linked
- Widths: all (theme: both)
- What is wrong: why is the one control that opens the audio engine panel the smallest thing in the top bar, beside a 36 px "Jump to" button? 22 px tall (1.375rem) and 67 px wide.
- Where: `primitives/HeaderChip.tsx:21`
- Severity: polish
- Fix: min 24 px height with padding or a pseudo-element hit area.
- Scanner: H1 `button.inline-flex.h-[1.375rem]` (rect 1352,14,67,22 at 1440)
- Evidence: `at-risk/w1440.png` crop x 1000-1440 y 0-50
- Shared: `HeaderChip`

### R3PR1-17 Stage readiness "?" and check chips are 20 x 20 px

- Page / state: all board states (pipeline cells)
- Widths: all (theme: both)
- What is wrong: why is the hit target on the badge half the size of the pill it hangs from? 20x20 round button at the pill corner (rects e.g. 1017,737 at 1440), overlapping the next cell (see XPR1-34).
- Where: `production/readiness/ReadinessChip.tsx:26` (`size-5`)
- Severity: polish
- Fix: 24 px minimum or extend the hit area inwards.
- Scanner: H1 `button.inline-flex.size-5` ("Stage readiness: Not checked / Not ready")
- Evidence: `at-risk/w1440.png` x 1010-1040 y 730-760
- Shared: `ReadinessChip`

### R3PR1-18 Toast Undo (33 x 20) and Dismiss (17 x 20) are tiny and sit over the page they affect

- Page / state: chapter-sync-toast-undo
- Widths: 1920, 1280, 1024, 768, 390 (theme: both)
- What is wrong: why is the only way to take back "Linked 2 tracks to chapters" a 33 x 20 px underline? Dismiss is 17 wide. At 1280 the toast also covers the PROOF and PICKUPS cells of the first pipeline row (x 963-1260, y 735-780).
- Where: `primitives/Toast.tsx:61-72`
- Severity: polish
- Fix: give both a 24 px minimum hit box; keep the toast clear of the table by anchoring it to the viewport corner with a margin that matches the page gutter.
- Scanner: H1 on "Undo" and "Dismiss message"; W4 on the toast text (XPR1-36)
- Evidence: `chapter-sync-toast-undo/w1280.png` x 960-1260 y 735-780
- Shared: `Toast`

### R3PR1-19 "Open DAW settings" and "Settings > Credits" are inline text buttons 19.5 and 16 px tall

- Page / state: every board state ("Open DAW settings" under the header note); credits-setup-dialog (both)
- Widths: all (theme: both)
- What is wrong: why does the note's only action have a 19.5 px hit height, and the "Settings > Credits" link 16 px, at the bottom of a dialog? Both are `button.inline.underline` styled as links.
- Where: `production/pipeline/PageHeader.tsx` (note), `credits/CreditsSetupDialog` footer text
- Severity: polish
- Fix: pad inline link buttons to 24 px.
- Scanner: H1 `button.inline.cursor-pointer.underline` (rects 1236,107,112,19.5 and 1080,711,95,16)
- Evidence: `at-risk/w1440.png` x 1237-1349 y 108-125; `credits-setup-dialog/w1280.png` x 210-310 y 578-596
- Shared: inline link button style

### R3PR1-20 Import row title is a 20 px button inside a 40.8 px row

- Page / state: import-confirm, import-confirm-markdown, import-review-characters
- Widths: 1920, 1440, 1280, 1024, 768 (theme: both)
- What is wrong: why does the clickable part of a row cover half its height? The title button (preview trigger) is 20 px tall beside a 40.8 px select; the 20 px band does not span the row (rows are 47 px apart), so clicking next to the title does nothing.
- Where: `production/ImportReview.tsx:159` (`min-w-0 flex-1 cursor-pointer truncate text-left`)
- Severity: polish
- Fix: make the title button `self-stretch` so the whole row height previews.
- Scanner: H1 and A6 on `button.min-w-0.flex-1.cursor-pointer.truncate` (rect 326,388,497,20)
- Evidence: `import-confirm/w1920.png` x 326-830 y 380-430
- Shared: page-local

### R3PR1-21 Settings-unset reason names "Settings > Editing" in plain text, not a link

- Page / state: editing-check-settings-unset
- Widths: 1920, 1280, 1024, 768 (theme: both)
- What is wrong: why does the card tell me to go to "Settings > Editing" with no way to click there? The catalog row says "with a link to Settings > Editing", but the sentence renders as ordinary text.
- Where: `editing/EditingCheckPanel.tsx:118-120` (`signal.reason` printed as text); the mock string at `main.tsx:356`
- Severity: polish
- Fix: link the phrase, or add a "Open Settings > Editing" button under the card.
- Evidence: `crops/r3pr1/su-zoom.png`; `editing-check-settings-unset/w1280.png` y 289-360
- Shared: page-local

### R3PR1-22 Match-levels dialog says "1 item ... differ", and "1.80 s" splits over two lines

- Page / state: editing-check-gain-match-confirm; editing-check-complete-candidates, -partial, -running
- Widths: 1920, 1280, 1024, 768 (theme: both)
- What is wrong: why does the dialog read "1 item on this chapter's linked track differ from -20 dBFS RMS" (singular noun, plural verb) and why is "1.80" at the end of a line with "s between two phrases" on the next (x 1247 / 992 at 1280, 320 px panel)? R2 already has the orphan "dB." (XPR1-29); the same missing non-breaking space is on seconds.
- Where: `editing/CleanupAction.tsx:78` (`pluralize` fixes the noun only); signal reason text
- Severity: polish
- Fix: "differs" for one, a non-breaking space before units.
- Evidence: `editing-check-gain-match-confirm/w1280.png` y 380-400; `editing-check-partial/w1280.png` y 309-327
- Shared: page-local

### R3PR1-23 "Match levels…" is greyed out with its reason only in a hover tooltip

- Page / state: `editing-check-*` except gain-match-confirm
- Widths: 1920, 1280, 1024, 768 (theme: both)
- What is wrong: why is this button pale with no word about why? The unavailable state shows only a tooltip and an `sr-only` description; the enabled state grows an "Experimental" pill, so the button's neighbourhood changes between states. May be intended (capability gate).
- Where: `primitives/CapabilityGate.tsx:67-93`; `editing/CleanupAction.tsx:58-66`
- Severity: polish
- Fix: print the reason as a muted line under the disabled button.
- Evidence: `editing-check-complete-candidates/w1920.png` y 480-495 against `editing-check-gain-match-confirm/w1920.png` x 925-1045 y 468-483 (screen 1100 px scale)
- Shared: `CapabilityGate`

### R3PR1-24 Slide-over leaves the page half-covered with cut-off header buttons

- Page / state: all slide-over states (credits-panel, track panels, `editing-check-*`)
- Widths: 1920, 1440, 1280, 1024 (theme: both)
- What is wrong: why is the START SESSION button sliced through the middle by the panel edge, and the Recording check / Next up cards half hidden behind it, with the page behind still looking live? The overlay has no scrim above 768. May be intended.
- Where: `primitives/SlideOver.tsx`
- Severity: polish
- Fix: dim and inert the page behind the panel or push content left.
- Evidence: `chapter-track-panel-linked/w1920.png` x 880-920 y 40-70 (screen scale); `chapter-track-panel-linked/w1280.png` x 890-960 y 80-115
- Shared: `SlideOver`

### R3PR1-25 Import activity log numbers do not match the review that follows

- Page / state: import-activity-log vs import-confirm
- Widths: all (theme: both)
- What is wrong: why does the log say "Read 228 paragraphs, 7 of them headings" and "Found 7 chapters in 8 sections" and the next step say "221 paragraphs · 5 narration chapters"? May be mock data.
- Where: mock fixtures for the activity log (`main.tsx`) and the preview
- Severity: polish
- Fix: derive both from one preview object.
- Evidence: `import-activity-log/w1280.png` y 428-505 against `import-confirm/w1280.png` y 165-215
- Shared: page-local

### R3PR2-10 Toast for a standing condition: covers the board at 1920, 1280 and 768, has a 17 px close and no refresh action

- Page / state: live-updates-degraded
- Widths: 1920 (toast x1452-1900, y1003-1060 over the Recorded vs plan chart), 1280 (x812-1260, y723-780 over the pipeline header and first rows), d768 (x300-748, y947-1003 over the Chapter pipeline title; round 2 said it is gone at 768), 1440 and 1024 per XPR2-39; theme: both (in dark it is a light cream slab on a dark page)
- What is wrong: Why does a "this page may be out of date" warning float over the data it is warning about, say "Reopen the page to refresh it" and offer no way to do it, and disappear for good when the 17 x 20 X is hit? Nothing on the page stays marked afterwards.
- Where: `primitives/Toast.tsx:72` (`button.flex-none` with no size), `:88` (fixed bottom-right), caller `ProductionPage.tsx`
- Scanner: H1 (Dismiss message 17x20), W4
- Severity: polish
- Fix: a banner under the header with a "Reload" button for a condition that persists; if it stays a toast, 36 px close button.
- Evidence: `production/live-updates-degraded/w1920.png` x1452-1900, y1003-1060; `.../w1280.png` y723-780; `dark:production/live-updates-degraded/tablet.png` y947-1003
- Shared: `Toast`

### R3PR2-11 Load error: three headings, and a message that quotes itself

- Page / state: load-error
- Widths: all (1920 card x708-1428 with 490 px blank each side), theme: both
- What is wrong: Why does the page say "Production", then "This page could not be loaded", then "The production overview could not be read: The app received data it could not read."? Three statements of failure, a capital letter after a colon, and the reason is just the same sentence again. A 720 px card sits in the middle of 1700 px.
- Where: `production/ProductionPage.tsx:356` (`...could not be read: ${load.message}`), `layout/LoadError.tsx:30` (panel title)
- Severity: polish
- Fix: drop the middle heading or the prefix; show the detail in muted small text under the single sentence.
- Evidence: `production/load-error/w1920.png` x708-1428, y100-295
- Shared: `LoadError`

### R3PR2-12 No-manuscript: the lock cue exists only in the expanded rail, and the project name is printed twice

- Page / state: no-manuscript, manuscript-candidate-offer
- Widths: 1920 (and 1440): nine padlocks right-aligned at x184 on every locked nav item; 1280 and 1024: collapsed rail, no padlock, icons look as enabled as Production; theme: both
- What is wrong: Why do the locks disappear when the window gets narrower? The collapsed rail shows nine items that look clickable but are locked. Also "Alice's Adventures in Wonderland" is printed under the page title and again in the top bar two lines above.
- Where: shell nav (`layout/` rail item), `production/pipeline/NoManuscript.tsx:11-22`
- Scanner: A5 on the nav (false positive for height, but it showed the lock rows)
- Severity: polish
- Fix: a small lock badge on the collapsed icon; drop the subtitle.
- Evidence: `production/no-manuscript/w1920.png` x0-215, y60-670; `.../w1280.png` x0-64
- Shared: shell rail

### R3PR2-13 Stage bar starts with a stray dark dot

- Page / state: on-pace, no-data, every state with the board
- Widths: 1920, 1440, 1280, 1024, 768; theme: both (dark green dot light, dark in dark)
- What is wrong: Why is there a little green dot left of the bar, separated from it by a gap? "Delivered 0:00" is drawn as a 2 px segment, rounded, with a white seam to the next segment, so it looks like a rendering glitch.
- Where: `production/overview/StageBar.tsx:33` (`block h-full min-w-0.5`)
- Severity: polish
- Fix: skip segments with 0 hours (the legend still lists Delivered).
- Evidence: crop `crops/r3pr2/bar1920.png` (4x), `production/no-data/w1920.png` x249-252, y364-376
- Shared: page-local

### R3PR2-14 On-pace header: "due Oct 14 (18 days)" and "done Oct 4"

- Page / state: on-pace
- Widths: 1920, 1440, 1024, 768; theme: both
- What is wrong: Why is the due date in the past when it is 18 days away? The header says "delivery due Oct 14 (18 days)", the Due tile "Oct 14 / 18 days · on track", the chart "due Oct 14" while the report dialog opened from the same fixture says "as of Oct 21" and "delivery due Nov 8 (18 days)". May be fixture data, but a narrator reading the picture sees a contradiction.
- Where: `production/pipeline/PageHeader.tsx:77`, fixture dates
- Severity: polish (may be fixture)
- Fix: align the fixture clock with the due date.
- Evidence: `production/on-pace/w1440.png` y110-160; `report-dialog/w1920.png` y80-130
- Shared: page-local

### R3PR2-15 Import review: the name is a 20 px button in a 41 px row

- Page / state: `import-review-*` (all rows)
- Widths: 1920-768, theme: both
- What is wrong: Why does only a thin strip of the row select the preview? The title button is 20 px tall (x326-908, y398-418) inside a row whose select is 40.8 px, so the click that previews a heading must land on the text line and the 10 px above and below are dead.
- Where: `production/ImportReview.tsx:158-166` (`button.min-w-0.flex-1 truncate` in `flex items-center`)
- Scanner: H1, A6
- Severity: polish
- Fix: `self-stretch` plus `py` so the button fills the row height.
- Evidence: `production/import-review-subtitles-off/w1920.png` y388-428
- Shared: page-local

### R3PR2-16 Info buttons are 15 px

- Page / state: all board states (About the Fin. column), `import-review-*` (About front matter, About reference material)
- Widths: all, theme: both
- What is wrong: Why is a tiny "i" the only way to learn what a column means? 15 x 15 px.
- Where: `production/pipeline/PipelineTable.tsx:107` area, `production/ImportReview.tsx` aside Tooltip, `primitives/Tooltip.tsx`
- Scanner: H1
- Severity: polish
- Fix: 24 px minimum hit area with the glyph kept small.
- Evidence: `production/on-pace/w1920.png` x940-958, y550-566; `import-review-repaired/w1920.png` x1150-1168, y473
- Shared: `Tooltip`

### R3PR2-17 "Check options" summary is 20 px inside a 38 px bordered box

- Page / state: all recording-check slide-over states
- Widths: all, theme: both
- What is wrong: Why does a box that looks like a button only open when I hit the text line? The bordered box is 38 px high and 258 px wide, the `summary` inside is 20 px.
- Where: `production/RecordingCheck.tsx:323-324` (`details` with `summary.cursor-pointer`)
- Scanner: H1
- Severity: polish
- Fix: padding on the `summary`, not on the `details`.
- Evidence: `production/recording-check-never/w1920.png` x1619-1902, y86-124
- Shared: page-local

### R3PR2-18 Text links in the panels are 19.5-20 px tall

- Page / state: `recording-check-*` ("Open pickups" 88x20, "Open Proof" 73x20), header ("Open DAW settings" 112x19.5)
- Widths: all, theme: both
- What is wrong: Why is the "Open pickups" link a thin underlined word in a dashed box that is 74 px tall? The box is the card, the link is the only control inside.
- Where: `production/PickupListCount.tsx`, `production/TakeReviewPickups.tsx`, `production/pipeline/PageHeader.tsx:121-130`
- Scanner: H1
- Severity: polish
- Fix: make the whole dashed card the link or give the link padding to 24 px.
- Evidence: `production/recording-check-complete/w1920.png` x1619-1900, y595-740
- Shared: page-local

### R3PR2-19 Toggle switches are 36 x 20

- Page / state: recording-check-rules ("Check changed chapters in the background"), stage-suggestion-options (first row)
- Widths: all, theme: both
- What is wrong: Why is the switch the smallest control in an otherwise 40 px form? 36 x 20 beside 40.8 px inputs.
- Where: `primitives/Switch.tsx` (`span[role=switch]`)
- Scanner: H1
- Severity: polish
- Fix: 24 px minimum hit area (wrap in the label).
- Evidence: `production/recording-check-rules/w1920.png` x306-344, y674-694
- Shared: `Switch`

### R3PR2-20 REAPER status pill is a 22 px button in the top bar

- Page / state: every page state
- Widths: all, theme: both
- What is wrong: Why is the pill 22 px tall beside the 32 px search field? The pill is a button (67 x 22).
- Where: shell top bar (`layout/`, `h-[1.375rem]`)
- Scanner: H1
- Severity: polish
- Fix: 32 px like the search box.
- Evidence: `production/on-pace/w1920.png` x1832-1900, y15-37
- Shared: shell

### R3PR2-21 Readiness chips are 20 x 20 buttons

- Page / state: on-pace, no-data, every state with the pipeline
- Widths: all, theme: both
- What is wrong: Why must I hit a 20 px circle that is also cut by the row line (XPR2-12)? 20 x 20.
- Where: `production/readiness/ReadinessChip.tsx`, `production/pipeline/PipelineTable.tsx:130-135`
- Scanner: H1
- Severity: polish
- Fix: move into the cell and give a 24 px target.
- Evidence: `production/on-pace/w1920.png` x1497-1517, y616-636
- Shared: page-local

### R3PR2-22 Running dialog: three kinds of ellipsis, elapsed time at the far edge, Cancel in the primary slot

- Page / state: recording-check-running
- Widths: 1920, 1280, 1024, 768, theme: both
- What is wrong: Why is it "Starting the recording check..." (three dots) above "Transcribing item 1 of 2…" (one ellipsis character) and the status line "Transcribing item 2 of 2..." (three dots)? The "0s" is at x=1606 at 1920, 1300 px from its label, and the rightmost button, where the primary normally sits, is the destructive Cancel.
- Where: `apps/desktop/internal/coverage/run.go:94` ("..."), UI log strings in `production/RecordingCheck.tsx`, `actionsAlign="end"`
- Severity: polish
- Fix: one ellipsis style, elapsed time under the label, Cancel to the left.
- Evidence: `production/recording-check-running/w1920.png` y420-720
- Shared: page-local

### R3PR2-23 Model dialogs: the same size twice, and a button that names a model nobody mentioned

- Page / state: recording-check-model-required, -recheck-model-required
- Widths: all, theme: both
- What is wrong: "Download: 464 MB · Systran" and "Disk needed: 464 MB" are the same figure two lines apart; in the recheck dialog the footer says "Check with tiny only" but the dialog never mentions tiny, and the first pass elsewhere is "small". At 768 the path breaks inside words ("faster-whisper/s|mall", "la|rge-v3-turbo").
- Where: dialog body in `production/RecordingCheck.tsx` (model prompt), path in a mono span without `break-all` rules
- Severity: polish
- Fix: one size line, name the fallback model in the button ("Check with the small model only") and break paths at slashes.
- Evidence: `production/recording-check-recheck-model-required/w1920.png` y490-690; `dark:production/recording-check-recheck-model-required/tablet.png` y570-580
- Shared: page-local

### R3PR2-24 Refused check: the red box says the same thing twice and picks "Chapter 1" for Chapter 7

- Page / state: recording-check-refused
- Widths: all, theme: both
- What is wrong: The bullet "Link this chapter to the REAPER track it is recorded on first." and the 12 px "Details: Confirm which REAPER track holds this chapter first." are the same instruction; the picker below defaults to "Chapter 1" while the panel is for Chapter 7; under the red box come two more boxes (Check options, status), three treatments in 330 px.
- Where: `production/RecordingCheck.tsx` refused block, `mapping/MappingConfirm.tsx`
- Severity: polish
- Fix: keep one sentence, preselect the chapter's own name or leave the picker empty with a placeholder.
- Evidence: `production/recording-check-refused/w1920.png` x1619-1902, y85-320
- Shared: page-local

### R3PR2-25 Recording-check panel: options first, action last, and nothing marks the row it is about

- Page / state: `recording-check-*` at every width
- Widths: all, theme: both
- What is wrong: Why is "Check options" at the top and the button that uses them at the bottom of the text, and why, with Chapter 7 in the title, is no pipeline row marked? With options open (options state, 1920) the verdict starts at y=933 and Check again is below the first screen.
- Where: `production/RecordingCheck.tsx:319-400` order of blocks; page behind has no selected-row style
- Severity: polish
- Fix: status and primary action first, options folded under the action; highlight the row.
- Evidence: `production/recording-check-options/w1920.png` y85-1080; `recording-check-never/w1920.png`
- Shared: page-local

### R3PR2-26 Stage suggestion options: scroll edges with no padding and no lead-in

- Page / state: stage-suggestion-options
- Widths: 1920 (first select 2 px under the box top y175, last select 862-903 touching the bottom y903), 1280 (first row cut at the top, last select y611-652 against y651), 1024 (same), theme: both; may be a capture scroll offset
- What is wrong: Why does the first and the last control touch the edge of the scroll area, and where is the sentence saying what "Required" changes? Fourteen identical selects in a box with no header copy.
- Where: `proof/proofOptions/ProofOptions.tsx:146` (flat `flex-col gap-3`), `primitives/Dialog.tsx:176` body padding is lost on the focus ring box
- Severity: polish
- Fix: scroll padding (`py-4`) and a one-line description.
- Evidence: crops `crops/r3pr2/sso_top.png`, `sso_bot.png`; `production/stage-suggestion-options/w1920.png`
- Shared: `ProofOptions`

### R3PR2-27 Dark theme: the "Light theme" sun and the Settings gear look alike

- Page / state: every state, collapsed rail (d1024, d768) and expanded rail (d1440)
- Widths: dark only
- What is wrong: Why are there two cogs on top of each other? The sun glyph (solid circle with eight points) sits directly above the gear (y708 and y750 at 1024).
- Where: shell rail theme toggle icon
- Severity: polish
- Fix: a clearly different sun (ring with rays) or the toggle moved.
- Evidence: crop `crops/r3pr2/rail1440.png` (4x); `dark:production/load-error/small-desktop.png` x20-45, y695-765
- Shared: shell rail

### R3PR2-28 Pipeline Record column: 50%, 37% and a half-moon for the same state

- Page / state: on-pace
- Widths: 1920 (Chapter 4 "50%", Chapter 5 "37%", Chapter 6 half-moon; Edit: half-moons for 7 and 8)
- What is wrong: Why does the Record badge show a number for two chapters and a symbol for the third, all in progress? May be intended (unmeasured).
- Where: `production/pipeline/PipelineTable.tsx` badge render
- Severity: polish (may be intended)
- Fix: always a number or always the glyph, with the number in the tooltip.
- Evidence: `production/on-pace/w1920.png` x1057-1110, y850-950
- Shared: page-local

## Round 2: strict review

### XPR1-1 Import review rows at 390: chapter names vanish and the type select runs off the dialog

- Page / state: import-confirm, import-confirm-markdown, import-review-characters, import-review-collapsed (rows partly)
- Widths: 390 (theme: both)
- What is wrong: why can't I see which chapter I am changing? Each row shows only "1,862 words / Subtitle / Narration chap…", the title column is 0 px and the select is cut at the dialog edge (x about 331, select starts about x275).
- Where: `production/ImportReview.tsx:155-203` - row `flex items-center gap-3`, title `min-w-0 flex-1 truncate` (:159), words/checkbox/Select all `flex-none`, nothing wraps.
- Severity: breaks use
- Fix: below about 40rem put the title on its own line and the words/subtitle/select on a second line, or let the select shrink.
- Evidence: `production/import-confirm/w390.png` y 530-690; `import-review-characters/w390.png` y 200-350
- Shared: page-local
- Supersedes: PRD-1

### XPR2-1 Recording check stat tiles are jammed into 300 px

- Page / state: production / recording-check-complete, -incomplete, -pickups, -stale, -cascade (the result panel)
- Widths: 768, 1024, 1280, 1440, 1920 (anything 640 px and wider), theme: both
- What is wrong: Why are four stat tiles squeezed into a strip that cannot hold them? The labels collide ("PARAGRAPHSAUDIO" at x=1289), "27 of 42" breaks onto three lines ("27 / of / 42") while "13:48" sits on one, and "about 155/min" runs past the panel edge and is cut to "155/mi" at x=1440.
- Where: `production/RecordingCheckReport.tsx:106` `grid grid-cols-2 ... sm:grid-cols-4` switches on the viewport, but the panel is `w-[min(20rem,100vw)]` (`primitives/SlideOver.tsx:17`), so the 4-up grid is always 300 px wide at every width above 640
- Severity: breaks use
- Fix: keep two columns (or container-query on the panel), and open this slide-over with `size="wide"`; a table of figures needs about 28 rem.
- Evidence: `production/recording-check-incomplete/w1440.png` x 1139-1440, y 365-490; `recording-check-complete/w768.png` x 466-768, y 340-465; clean 2-up at `recording-check-incomplete/w390.png`
- Shared: page-local (SlideOver width is shared)
- Supersedes: PRD-2

### XPR2-2 At 390, Start session is cut off and the page scrolls sideways while the timer runs

- Page / state: on-pace (timer running), report-dialog backdrop
- Widths: 390, theme: both
- What is wrong: Why does the Start session button run off the screen edge? The cluster (timer chip, Stop timer, export, Start session) is 591 px wide in a 390 px page; Start session ends at x=390, the "Experimental..." note and the "Open DAW settings" link are off-screen.
- Where: `production/pipeline/PageHeader.tsx:109` `flex flex-none flex-wrap` - `flex-none` stops the wrap
- Severity: breaks use
- Fix: drop `flex-none`, give the cluster `min-w-0 basis-full` under 640 px.
- Evidence: `production/on-pace/w390.png` y 190-225
- Shared: page-local
- Supersedes: PRD-3

### XPR2-3 Import review at 390: chapter names vanish and the type select runs off the dialog

- Page / state: import-review-repaired, -subtitles-off, -text-subtitle
- Widths: 390 (names gone, select cut at the dialog edge, x=331), 768 (names cut to "Chapter One Down ...", "Chapter Two — The...", "Chapter One · "Curi…"), theme: both
- What is wrong: Why does a list of chapters show no chapter names? Each row is one non-wrapping line (title `flex-1 truncate`, words, Subtitle, 166 px select, all `flex-none`) so at 390 the title gets 0 px and the select is clipped; at 768 titles get 60-110 px.
- Where: `production/ImportReview.tsx:155-206` (row `flex items-center gap-3`; title :159, words :181, checkbox :188, Select :201)
- Severity: breaks use
- Fix: below about 40 rem let the row wrap: title on its own line, words / Subtitle / select on a second line.
- Evidence: `production/import-review-repaired/w390.png` y 520-690; `import-review-text-subtitle/w768.png` y 430-640
- Shared: page-local
- Supersedes: PRD-1

### XPR2-4 Recheck-model dialog at 390: "CHECK WITH TINY ONLY" is stacked on four lines

- Page / state: recording-check-recheck-model-required
- Widths: 390, theme: both
- What is wrong: Why is one button four words tall? Three buttons share a 271 px footer; the middle one is squeezed to 62 px and wraps to "CHECK / WITH / TINY / ONLY" (96 px tall) while its neighbours are 36 px.
- Where: `primitives/Dialog.tsx:195` footer `flex ... gap-2` with no wrap; width from `:149` `max-w-[70vw]`
- Severity: breaks use (390 only)
- Fix: let the footer stack its buttons below about 28 rem and fix XPR2-6.
- Evidence: `production/recording-check-recheck-model-required/w390.png` y 592-655
- Shared: `Dialog` footer

### XPR1-2 Import review: chapter titles cut to "Chapter One — Do…" at 768 and 1024 while the select takes a fixed 166 px

- Page / state: import-confirm, import-confirm-markdown, import-review-characters
- Widths: 768 (every title cut to "Do…", "The…", "In …"), 1024 ("Considers a Grea…"), 1440 and 1920 (Chapter Four cut with "...") (theme: both)
- What is wrong: why is the title the thing that gets cut when the type select is a wide 166 px box for a value like "Narration chapter"? At 768 the title column is about 70 px.
- Where: `ImportReview.tsx:159` (title `flex-1 truncate`) vs :201 (Select `flex-none`, 166 px)
- Severity: looks wrong
- Fix: narrower select (about 140 px), or two-line rows at narrow dialog widths.
- Evidence: `import-confirm/w768.png` y 430-640 (titles end x about 290); `import-confirm/w1024.png` y 537
- Shared: page-local
- Supersedes: PRD-1 (768 part)

### XPR1-3 Import review: words / Subtitle / select columns stagger between rows

- Page / state: import-confirm, import-confirm-markdown, import-review-characters
- Widths: 1024, 1440, 1920 (right edge of "1,862 words" at 607, "1,410 words" at 692 at 1440), 768 (theme: both)
- What is wrong: why do the word counts zigzag? The Subtitle checkbox is only drawn on rows with a subtitle and nothing reserves its space, so the numbers move about 85 px between rows.
- Where: `ImportReview.tsx:188-199` - `hasSubtitleChoice(section) &&` with no placeholder
- Severity: looks wrong
- Fix: reserve a fixed-width checkbox slot, or lay the row out as a CSS grid with fixed columns.
- Evidence: `production/import-confirm/w1440.png` x 539-695, y 410-600; `w1920.png` x 835-990
- Shared: page-local
- Supersedes: PRD-11

### XPR1-4 Recorded vs plan / Next up keep two columns at 390 and the chart is cut off

- Page / state: chapter-removed-list, credits-closing-not-set-up (and every board state, lower page)
- Widths: 390 (theme: both)
- What is wrong: why is "Finish / recording / Chapter 4 —" one word per line and the chart cut at the right ("Recorded days no")? Both cards are about 170 px wide and OPEN BOOTH wraps to two lines.
- Where: `production/ProductionPage.tsx:453` (`max-[1281px]:grid max-[1281px]:grid-cols-2`) - no single-column rule at phone width
- Severity: looks wrong
- Fix: `grid-cols-1 min-[640px]:max-[1281px]:grid-cols-2`.
- Evidence: `production/chapter-removed-list/w390.png` y 510-844; `credits-closing-not-set-up/w390.png`
- Shared: page-local
- Supersedes: PRD-4

### XPR1-5 Pipeline chapter column squeezed to 70-130 px at 768 and 390, names wrap to 3-5 lines

- Page / state: chapter-removed-list, credits-closing-not-set-up, editing-check-running (table behind the panel)
- Widths: 768 ("Chapter 8 — / The Queen's / Croquet- / Ground", rows 74-95 px tall), 390 (one word per line) (theme: both)
- What is wrong: why do the chapter names stack into a narrow tower while the numbers beside them keep their full width? The chapter column gets only what is left after seven fixed stage columns.
- Where: `production/pipeline/PipelineTable.tsx:96-102` - `min-w-[44rem] table-fixed`, `<col />` for Chapter, fixed `STAGE_WIDTH`/`FIN_WIDTH` for the rest
- Severity: looks wrong
- Fix: give the Chapter column a floor of about 12rem and let the table scroll sideways.
- Evidence: `chapter-removed-list/w768.png` y 60-440; `credits-closing-not-set-up/w390.png` y 50-480
- Shared: page-local
- Supersedes: PRD-10

### XPR1-6 Pipeline rows have unequal heights at 1440 because chapter names wrap with space unused elsewhere

- Page / state: all board states at 1440 and 1280-with-column: at-risk, daw-not-linked, chapter-removed-list, credits-closing-not-set-up, toast-undo, banner
- Widths: 1440 (rows 39 px for "Opening credits" and "Closing credits", 53 px for every name that wraps: "Chapter 1 — Down the / Rabbit-Hole"). At 1920 and 1280 every row is one line at 39 px (theme: both)
- What is wrong: why do half the rows get taller for the same kind of content? The table is squeezed by the 375 px Next up column, the Chapter column is about 190 px, and all stage pills (52 px) keep 80 px columns that have blank space either side.
- Where: `production/pipeline/PipelineTable.tsx:96-102` and `ProductionPage.tsx:453` (right column width)
- Severity: looks wrong
- Fix: narrow the stage columns (about 64 px) so names fit on one line at 1440, or move Next up under the table at 1440.
- Evidence: `production/daw-not-linked/w1440.png` y 575-900 (rows 595, 641, 694 ...); `at-risk/w1920.png` y 690-1070 for the one-line version
- Shared: page-local

### XPR1-7 Board columns do not share one grid: three different column splits in four rows

- Page / state: at-risk, daw-not-linked, toast-undo, banner, removed-list (any board state)
- Widths: 1440 and 1920 (theme: both)
- What is wrong: why do the card edges not line up going down the page? At 1440 the gutters are at x 629/1027 (timer strip), 728/1077 (three cards: 497+331+331) and 1047/1065 (pipeline and Next up). At 1920 the three cards split at 935/1418 while the pipeline splits at 1527/1544.
- Where: `ProductionPage.tsx:422` (the three-card row, `items-stretch` with its own template) and `:453` (pipeline plus right column); strips use `StatStrip` columns
- Severity: looks wrong
- Fix: use one 12-column grid for the card rows; for example 6/3/3 over the strip tiles and 8/4 for the pipeline row. Take the Next up column to the same x as Recording check.
- Evidence: `production/at-risk/w1440.png` card edges at y 413-585 vs 603-900; `at-risk/w1920.png`
- Shared: page-local

### XPR1-8 Sibling card headers are different heights, so rules and titles stagger

- Page / state: at-risk (Where the book stands / This week / Recording check), daw-not-linked, toast-undo, banner, removed-list (Next up vs Recorded vs plan)
- Widths: 1280, 1440, 1920, 1024 (theme: both)
- What is wrong: why is one card's title lower than its neighbours'? The card with a 36 px icon button has a 59 px header and the others 50 px: rules at y=462/462/471 at 1440, titles at 439 vs 443; at 1280 This week rule at 613 and Recording check at 622; Next up vs Recorded vs plan rules at 541 and 549 at 1440 (removed-list).
- Where: `primitives/panelStyles.ts:10` (`PANEL_HEADER_CLASS min-h-[3.125rem]` grows with `actions`), actions in `production/overview/CheckCountsCard.tsx:41-48` and the Recorded-vs-plan card
- Severity: looks wrong
- Fix: set one header min-height (59 px) on every Panel in a row, or use the 32 px icon button.
- Evidence: `at-risk/w1440.png` y 440-475 across x 233-1423; `chapter-removed-list/w1440.png` Recorded vs plan header y 380-440; `at-risk/w1280.png` y 575-630
- Shared: `Panel` header
- Supersedes: PRD-8

### XPR1-9 Cards stop short of their row; legend band does not reach the card bottom; nub at the bar start

- Page / state: at-risk, daw-not-linked, toast-undo, banner (Where the book stands / This week), removed-list (right column)
- Widths: 1440, 1920 (40 px of white under the legend band), 1024 and 768 (band ends 2-3 px above the card border with square corners) (theme: both)
- What is wrong: why does the grey band float with white under it, and why does "This week" end 60 px after its two rows? In removed-list the right column (Next up plus chart) ends at y 673 while the left column goes on to 883, leaving a blank column. A zero-width "Delivered 0:00" segment also draws a tiny dark nub at the left end of the stacked bar (x about 249, y 483).
- Where: `ProductionPage.tsx:422` (`items-stretch`), `overview/StageBar.tsx:21,39` (flush Panel, legend band `bg-[var(--surface-2)]` not `mt-auto`), `overview/WeekCard.tsx:15`; `Panel.tsx:60-68` `fill` not used; zero-width segment not filtered in StageBar
- Severity: looks wrong
- Fix: pass `fill` to Panel, let the legend `mt-auto` and the panel `overflow-hidden`; make the right column `h-full` (or sticky) and skip zero segments.
- Evidence: `at-risk/w1920.png` x 233-935 y 412-586; `toast-undo/w1440.png` y 390-472 (band ends 455); `chapter-removed-list/w1440.png` x 1065-1423 y 673-880 (blank); `at-risk/w1440.png` x 249 y 478-490 (nub)
- Shared: `Panel`, `StageBar`
- Supersedes: PRD-9

### XPR1-10 Credits banner sits 34 px above the KPI strip while every other gap is 16 px

- Page / state: credits-setup-banner
- Widths: 1440 (banner bottom y 247, KPI top y 281), 1024, 768, 390 (theme: both)
- What is wrong: why is there a gap here twice as big as anywhere else on the page? The banner adds its own bottom margin on top of the 16 px gap of the page stack.
- Where: `credits/CreditsSetupBanner.tsx:41` (`<Panel tone="review" className="mb-4">`) inside `ProductionPage.tsx:365` (`flex flex-col gap-4`)
- Severity: looks wrong
- Fix: remove `mb-4`.
- Evidence: `production/credits-setup-banner/w1440.png` y 247-281; `w768.png` y 353-387
- Shared: page-local
- Supersedes: PRD-7

### XPR1-11 Timer figures strip: lone third tile with a half-width rule, and unequal baselines at 390

- Page / state: at-risk (any state with the work-time strip)
- Widths: 1024 and 768 (Effective rate sits alone on row two, rule across only the left 50%, right half blank), 390 ("HOURS PER FINISHED / HOUR" wraps, so "19.6 : 1" is at y 673 while "32:00" beside it is at y 625) (theme: both)
- What is wrong: why does the last tile sit alone under a half-length line with empty space beside it?
- Where: `primitives/StatStrip.tsx:20-27` (2 columns below 64rem, tile `border-t border-l`), `TimerFigures` in `ProductionPage.tsx:68-104`
- Severity: looks wrong
- Fix: three columns from 36 rem up, `col-span-full` on the odd tile otherwise, and a two-line min-height on the label.
- Evidence: `production/at-risk/w1024.png` x 80-1007 y 401-597; `w768.png` y 475-672; `w390.png` y 600-840
- Shared: `StatStrip`
- Supersedes: PRD-16

### XPR1-12 Header action note wraps while there is free space; button and note do not share a row

- Page / state: every board state with the header (at-risk, daw-not-linked, toast-undo, banner, sync-consent behind the scrim)
- Widths: 768 (note "Experimental: switched off in / Settings." and "Open DAW settings" on three lines at x 201-380 with 370 px free to the right), 1024, 1280, 1440 (note is 3 lines tall, buttons float at its vertical middle, y 97 vs note 77-117) (theme: both)
- What is wrong: why does "Settings." sit alone on a second line when the row is empty beside it? The note is limited to `max-w-[24ch]` so it is always a 3-line block, taller than the 36 px buttons beside it.
- Where: `production/pipeline/PageHeader.tsx:109,122` (action group `flex flex-none flex-wrap`, note span `max-w-[24ch]`)
- Severity: looks wrong
- Fix: put the note on one line under the buttons (full width at 768), or shorten it to a tooltip on a disabled Start session.
- Evidence: `production/at-risk/w768.png` x 201-380 y 180-235; `at-risk/w1440.png` x 1237-1420 y 70-125
- Shared: page-local

### XPR1-14 Next up action buttons re-flow differently at every width and mix three button looks

- Page / state: chapter-removed-list, credits-closing-not-set-up, at-risk (right column)
- Widths: 1440 (OPEN BOOTH / note / START TIMER stacked), 1280 (OPEN BOOTH, note and START TIMER on one row), 1024 (OPEN BOOTH with note, START TIMER alone on row two), 768 (stacked) (theme: both)
- What is wrong: why are the buttons on different rows each time and why is the START TIMER row separated from OPEN BOOTH by a sentence? "Experimental: switched off in Settings." is pushed between the two actions of the same card. Primary is solid, START TIMER and REVIEW PICKUPS are outlined at different widths (98/78 px) with no common column.
- Where: `production/overview/NextUpCard.tsx` (action row `flex-wrap`, note inline) - cause not read in detail
- Severity: looks wrong
- Fix: keep the actions in one row (or one fixed column), with the experimental note under the row.
- Evidence: `chapter-removed-list/w1280.png` y 560-740; `w1024.png` y 540-690; `w1440.png` y 100-215
- Shared: page-local

### XPR1-16 Every dialog is 70% of the viewport wide whatever it holds

- Page / state: chapter-remove-confirm, chapter-sync-consent, credits-setup-dialog (both), editing-check-gain-match-confirm, import-activity-log
- Widths: 1440 (1006 px for a two-line message; 970 px wide input for a book title), 1024 and 768 (about 536-714 px, good), 390 (271 px with 60 px dead margins) (theme: both)
- What is wrong: why is a one-sentence question stretched across the whole screen with 1000 px lines? At 390 the opposite: a 271 px box wraps every label and button.
- Where: `primitives/Dialog.tsx:148-149` (`w-full ... max-w-[70vw]`)
- Severity: looks wrong
- Fix: give small dialogs a content width (about 32-40 rem) and `100vw - 2rem` on phones; keep `size="full"` for import review.
- Evidence: `chapter-remove-confirm/w1440.png` x 217-1223; `credits-setup-dialog/w1440.png` input x 235-1205; `chapter-remove-confirm/w390.png`
- Shared: `Dialog`
- Supersedes: PRD-5

### XPR1-17 Dialog footers wrap and mix widths at 390

- Page / state: credits-setup-dialog (both), chapter-remove-confirm, chapter-sync-consent (footer fine), import-confirm family
- Widths: 390 (theme: both)
- What is wrong: why do the buttons break onto two lines of different heights? "DON'T ASK FOR / THIS PROJECT" and "NOT / NOW" wrap while SAVE is one line; "REMOVE FROM / RECORDING" wraps next to a one-line CANCEL; "REPLACE / AND RESET" next to "BACK" and "CANCEL" in import.
- Where: `primitives/Dialog.tsx:195` (footer `flex ... gap-2`, no wrap), buttons from `ConfirmDialog.tsx:68-80`
- Severity: looks wrong
- Fix: stack footer buttons (full width, primary first) below about 28 rem and fix XPR1-16.
- Evidence: `credits-setup-dialog/w390.png` y 705-742; `chapter-remove-confirm/w390.png` y 592-627; `import-confirm/w390.png` y 704-742
- Shared: `Dialog` footer
- Supersedes: PRD-17

### XPR1-19 Dialog body shows a full-width blue focus box

- Page / state: chapter-sync-consent (all widths), also the Title input ring in credits-setup-dialog
- Widths: 1440, 1024, 768, 390 (theme: both)
- What is wrong: why is the whole text block outlined in blue like an error? The scroll body is auto-focused and draws an inset focus ring edge to edge over the header and footer rules (x 217-1223, y 318-580). In the credits dialog the Title input ring bleeds about 2 px outside the input on both sides.
- Where: `primitives/Dialog.tsx:176` (`focus-visible:ring-inset` on the body)
- Severity: looks wrong
- Fix: do not focus the body on open (focus the primary action or the dialog), or inset the ring from the dividers.
- Evidence: `chapter-sync-consent/w1440.png` y 316-582; `w390.png` y 158-682
- Shared: `Dialog`

### XPR1-20 Sync-consent dialog: lead paragraph runs into the first heading; two-column list has a blank middle

- Page / state: chapter-sync-consent
- Widths: 1440 (paragraph ends y 365, "WILL BE LINKED (2)" at y 385; later sections are 28 px apart), 1024, 768, 390 (theme: both)
- What is wrong: why is the heading glued under the paragraph? And why does "Chapter 2 → Chapter 2" start at x 732, in the middle of a 1000 px dialog, with a 340 px gap after "Chapter 1 → Chapter 1"?
- Where: dialog body built in `production/useChapterTools.tsx` / `chapterSyncToastText.ts`; the cause line was not located
- Severity: looks wrong
- Fix: add the section gap under the paragraph; set the pair list to a content-width grid or one column.
- Evidence: `chapter-sync-consent/w1440.png` x 235-1000 y 335-415; `w390.png` y 322-350
- Shared: page-local
- Supersedes: PRD-26

### XPR1-21 Remove-from-recording dialog: unselected radio is a filled grey disc

- Page / state: chapter-remove-confirm
- Widths: 1440, 1024, 768, 390 (theme: both)
- What is wrong: why does "Front matter" look disabled or pre-filled? The unselected radio draws a solid grey dot with no ring (x 243, y 490), while the selected one has a ring and orange dot. The description lines under the labels (x 261) also start 18 px right of the radio and are not tied to it.
- Where: radio rendering in `primitives/Radio*` (cause not located; used by `production/RemoveFromRecordingDialog.tsx`)
- Severity: looks wrong
- Fix: draw an empty ring for unselected radios.
- Evidence: `chapter-remove-confirm/w1440.png` x 235-251 y 482-498
- Shared: radio primitive (cause not found)

### XPR1-22 Track panel: buttons have no grid, header and facts misaligned

- Page / state: chapter-track-panel-linked, -missing, -ambiguous (and the panel behind chapter-remove-confirm)
- Widths: 1440 and 390 (linked, ambiguous), 1440 (missing); 768 and 1024 seen only behind the dialog (theme: not opened in dark)
- What is wrong:
  - Why are these buttons all different? "SELECT IN REAPER" is full width (283 px), "ANOTHER TRACK…" and "UNLINK" are auto widths (about 118 and 68 px) next to a plain "Chapter 1" label, the media row (Skip 30 s 69 px, Play 42 px, Skip 30 s 69 px) leaves 90 px blank on the right, and "REMOVE FROM RECORDING…" is auto width again.
  - The status word ("LINKED"/"MISSING"/"AMBIGUOUS") sits at y 96 while "CHAPTER 1" is at y 100, so the two are not on one baseline.
  - The blue dot and the "Track 1" subline appear only in linked/missing, so the heading x moves from 1159 to 1138 between states.
  - "AS OF LAST SAVE SEP 21, 2026, 10:00 AM" is a mono eyebrow while "LINK" and "CHAPTER" are condensed eyebrows.
  - The ambiguous-state select (41 px) sits beside CONFIRM (36 px).
- Where: `production/ChapterTrackPanel.tsx` (action rows; `Fact` at :335-341); mapping row in `mapping/MappingConfirm.tsx`
- Severity: looks wrong
- Fix: one 2-column grid of equal-width buttons (Select in REAPER / Another track / Unlink / Remove), one heading row with baseline alignment, one eyebrow style; same control height for select and button.
- Evidence: `chapter-track-panel-linked/w1440.png` x 1138-1422 y 90-680 (media row y 336-372, link row y 484-520); `chapter-track-panel-ambiguous/w1440.png` y 362-403
- Shared: page-local (selection/button heights are shared tokens)
- Supersedes: PRD-23 (select vs button), partly PRD-15

### XPR1-24 Slide-over headers differ: 63 px vs 67 px, close 36 vs 32 vs a 30 px sliver, titles break mid-word

- Page / state: credits-panel, `chapter-track-panel-*`, `editing-check-*` (all)
- Widths: 1440, 1024, 768, 390 (theme: both)
- What is wrong: why does the X move and change size between panels? Credits close is 36 px at y 15-50 with header rule at y 63, track panel close is 32 px with rule at y 67, editing-check close is squeezed to about 30 x 36 px (x 1391-1421) by its two-line title. Titles wrap awkwardly: "Track: Chapter 1 — Down the Rabbit- / Hole", "Editing check: Chapter 7 — A Mad / Tea-Party".
- Where: `primitives/SlideOver.tsx:69,73` (header `min-h-[3.75rem]`, IconButton not `flex-none`, title without `min-w-0`)
- Severity: looks wrong
- Fix: one header height, `flex-none` on the close button, a non-breaking hyphen or a smaller subtitle for the chapter name.
- Evidence: `credits-panel/w1440.png` x 1386-1422 y 15-50; `chapter-track-panel-linked/w1440.png` x 1390-1422 y 17-52; `editing-check-never-checked/w1440.png` x 1391-1421 y 17-52
- Shared: `SlideOver`
- Supersedes: PRD-12

### XPR1-25 Credits row panel: "Open in Script" link touches the status select; select is 40.8 px beside a text link

- Page / state: credits-panel
- Widths: 1440 (link ends x 1231, select starts x 1231; link text 18 px tall beside the 40 px select), 1024, 768, 390 (theme: both)
- What is wrong: why is the link jammed against the box? The inline link and the select share a line with no gap. The panel's "ACX minimum (opening) · 7 words · about / 3s" also strands "3s" on its own line.
- Where: `production/CreditsRowPanel.tsx:67-75` (inline `Link` then `Select` inside `space-y-4`)
- Severity: looks wrong
- Fix: put the link on its own line (or a `flex items-center gap-3` row) and keep "about 3s" together.
- Evidence: `credits-panel/w1440.png` x 1138-1350 y 170-215 and y 85-118
- Shared: page-local
- Supersedes: PRD-13

### XPR1-26 Editing-check panel: source toggle chips touch, wrap onto two lines, unequal widths; caption jammed under them

- Page / state: all `editing-check-*` states
- Widths: 1440, 1024, 768, 390 (theme: both)
- What is wrong: why are the two chips glued together and why are both labels two lines? Chips are 171 and 112 px with no gap ("ITEMS ON THIS / CHAPTER'S TRACK", "THE RENDERED / FILE"); the caption "Source analyzed: items on the chapter's track" is 2-4 px below them and repeats the active chip, then there is a 24 px gap to the action button.
- Where: `editing/EditingCheckPanel.tsx:269` (`<ToggleGroup>` without className) and `primitives/ToggleGroup.tsx:30-35` (default `'flex'` container, no gap)
- Severity: looks wrong
- Fix: `className="gap-1.5 flex-wrap"` or `look="segmented"` with shorter labels, equal widths, and drop the repeated caption.
- Evidence: `editing-check-never-checked/w1440.png` x 1139-1422 y 142-198; `w390.png` y 142-198
- Shared: `ToggleGroup` default look
- Supersedes: PRD-14

### XPR1-27 Editing-check panel: three near-identical cards form a wall of text

- Page / state: editing-check-never-checked, -complete-candidates, -complete-clean, -partial, -settings-unset, -stale, -unsupported, -running
- Widths: 1440, 1024, 768, 390 (theme: both)
- What is wrong: why does half the panel say "Can't tell yet. Not yet validated on the corpus: this build never reports it met." twice? Click and Breath always show the same grey card with the same sentence and the same footer, and the one real result (Empty space) looks the same as the placeholders. At 390 and 768 the panel scrolls before Match levels is reached. The "Met."/"Not met." lead is only bold black or red text, not a badge.
- Where: `editing/EditingCheckPanel.tsx` (check cards, about :300-420, per-check card with source note "Based on the saved REAPER project, file modified ...")
- Severity: looks wrong (organisation)
- Fix: one compact row per check (name, verdict badge, one shared note), group the unvalidated ones in one line, and show the source note once.
- Evidence: `editing-check-never-checked/w1440.png` x 1139-1422 y 266-740; `editing-check-complete-candidates/w1440.png`
- Shared: page-local

### XPR1-30 Credits setup dialog: huge inputs, hint and checkbox spacing inconsistent

- Page / state: credits-setup-dialog, credits-setup-dialog-narrator-default
- Widths: 1440 (Title input 970 px, Narrator checkbox row 20 px under its hint while other fields have 28 px between blocks; "Don't ask for this project" left, "Not now" and "Save" right), 1024, 768 (theme: both)
- What is wrong: why is a one-line book title in a 970 px field, and why does the checkbox hug the hint line above it? Field groups are label, input, hint with 28 px between groups, but the "Use for all my projects" row is 20 px below its hint and the closing note is a third text style (11 px muted, 30 px under).
- Where: credits dialog markup (`credits/CreditsSetupDialog*.tsx`, cause not located)
- Severity: looks wrong
- Fix: give the form a 28-32 rem width and the same group spacing for the checkbox.
- Evidence: `credits-setup-dialog/w1440.png` x 235-1205 y 320-640
- Shared: page-local (width from `Dialog`)

### XPR1-31 Import review: right column starts above the list and leaves a large blank area; preview scrolls away

- Page / state: import-confirm, import-confirm-markdown, import-review-characters, import-review-collapsed
- Widths: 1440 (preview card top y 317, list label top y 337; blank area x 887-1205 y 610-740; collapsed list ends y 523 with 160 px blank below), 1920 (blank right column y 570-900), characters state at 1440 and 1920 (preview card scrolled out of view while the list scrolls; "IMPORT OPTIONS" label cut at the top edge) (theme: both)
- What is wrong: why do the two columns start at different heights? The preview card is 20 px above "REVIEW WHAT WAS FOUND", and the right column stops while the left keeps scrolling. In the markdown state the "Markdown chapter heading level [H1]" row sits flush at x 887 (card text is at 900) with a 64 px select next to 40.8 px selects. The "IMPORT OPTIONS" label (x 891) and "REVIEW WHAT WAS FOUND" (x 238) are inset 3-4 px from the cards beneath them.
- Where: `production/ImportReview.tsx` layout (two-column container, about :120-150 and :225-300) - preview column not `sticky`, no shared top
- Severity: looks wrong
- Fix: start both columns at the same y, make the right column sticky, and use one inset for labels and cards.
- Evidence: `import-confirm/w1440.png` x 887-1205 y 317-740; `import-review-characters/w1440.png` y 150-300; `import-confirm-markdown/w1440.png` y 480-525; `import-review-collapsed/w1440.png` y 375-690
- Shared: page-local

### XPR2-5 The top card row and the pipeline row do not share a column grid

- Page / state: on-pace, no-data (and every state with the board)
- Widths: 1440, 1920, theme: both
- What is wrong: Why don't the cards line up down the page? The top row is 1.5fr / 1fr / 1fr (cards x 232-728, 746-1076, 1094-1423 at 1440), the next row is 1fr + 22.5rem (pipeline 232-1047, Next up 1065-1423), so the right column starts at x=1094 and then x=1065; at 1920 the edges are 1436 and 1545. The gutters are 18 px in both rows, so the staggered edges are the only reason it looks unplanned.
- Where: `production/ProductionPage.tsx:422` (`min-[1281px]:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)]`) against `:453` (`min-[1281px]:grid-cols-[minmax(0,1fr)_22.5rem]`)
- Severity: looks wrong
- Fix: make the top row `minmax(0,1fr) 22.5rem` with This week and Recording check sharing the right column, or put both rows on one grid.
- Evidence: `production/on-pace/w1440.png` card edges at x=1076/1094 against x=1047/1065; `on-pace/w1920.png`
- Shared: page-local

### XPR2-6 Every dialog is 70% of the window whatever it holds

- Page / state: manuscript-candidate-offer, recording-check-model-required, -recheck-model-required, -rules, -running, stage-suggestion-options
- Widths: 1440 (1006 px), 1024 (714 px), 768 (536 px); 390 leaves a 271 px dialog with 60 px margins, theme: both
- What is wrong: Why is a one-sentence question 1006 px wide? The candidate dialog is x 217-1223 for "Found manuscript.docx ... import button." (one 750 px line); the rules dialog has 600 px of empty white to the right of four inputs; the running dialog stretches a progress bar across 970 px.
- Where: `primitives/Dialog.tsx:149` `w-full ... max-w-[70vw]` (`size="full"` is the only alternative)
- Severity: looks wrong
- Fix: content widths for small dialogs (`w-[min(32rem,100%-2rem)]`), keep `size="full"` for the import review.
- Evidence: `production/manuscript-candidate-offer/w1440.png` x 217-1223; `recording-check-rules/w1440.png`; `recording-check-running/w1440.png`
- Shared: `Dialog` primitive
- Supersedes: PRD-5

### XPR2-7 "Where the book stands" and "This week" are hollow, and the grey legend band does not reach the card bottom

- Page / state: on-pace, no-data
- Widths: 1280 (This week under y=680 empty), 1440 (band ends y=570, card y=586; This week blank y 540-586), 1920 (band 545, card 586: 40 px of white under a grey band), 1024 and 768 (band ends 2 px above the border with a white sliver and square corners), theme: both
- What is wrong: Why does the grey strip stop short of the card edge with white under it? The row is stretched to the tallest card but the bodies do not grow; the legend band is not pinned to the bottom and the frame has no `overflow-hidden`, so it floats, square-cornered inside rounded corners.
- Where: `production/ProductionPage.tsx:422` `items-stretch`; `overview/StageBar.tsx:61,79` (`Panel flush`, `ul bg-[var(--surface-2)]`); `overview/WeekCard.tsx:104`; `primitives/Panel.tsx` `fill` unused; `primitives/panelStyles.ts:6` no `overflow-hidden`
- Severity: looks wrong
- Fix: `fill` on the three panels, `mt-auto` on the band, `overflow-hidden rounded` on the frame.
- Evidence: `crops/xpr2/band768.png` (sliver under band); `production/on-pace/w1920.png` y 505-590; `on-pace/w1440.png` y 520-590
- Shared: `Panel`
- Supersedes: PRD-9

### XPR2-8 The three sibling cards have different header heights, so rules and titles do not line up

- Page / state: on-pace, no-data
- Widths: 1280 (This week header rule y=613, Recording check y=622, titles y=589 / 594), 1440 and 1920 (rules y=462 / 462 / 471, titles y=439 / 439 / 443), theme: both
- What is wrong: Why is the third card's title lower than its neighbours' and its divider 9 px lower? Its header holds a 36 px icon button so it grows to 59 px while the other two stay 50 px, and the rows below start at different y (489 against 498).
- Where: `primitives/panelStyles.ts:9` (`min-h-[3.125rem]`, grows with `actions`); action at `overview/CheckCountsCard.tsx:166-172`; the same happens in the right column at 1280 and below (Recorded vs plan header 59 px against Next up 50 px, `overview/ProgressChart.tsx:102`)
- Severity: looks wrong
- Fix: one header height for every card in a row (size the icon button `sm` or set the header to the taller value).
- Evidence: `production/on-pace/w1440.png` y 425-475; `on-pace/w1280.png` y 575-640; `chapter-removed-list/w1280.png` y 490-545 (Next up 517 vs chart 521)
- Shared: `Panel` header
- Supersedes: PRD-8

### XPR2-9 The disabled-Start reason is shown twice, and the header note is a 3-line block beside 36 px buttons

- Page / state: on-pace, no-data, loading, live-updates-degraded, every dialog backdrop
- Widths: 1920, 1440, 1280, 1024 (note beside the buttons), 768 and 390 (below), theme: both
- What is wrong: Why does the page say "Experimental: switched off in Settings." twice? Once in the header (x 1237-1407, y 70-124, wrapped to three lines beside buttons that are 36 px tall) and again under Open Booth in Next up. In the header the text block is taller than the buttons it explains and has its own link, so the row looks ragged (buttons centred on y=97, text running y 70-124).
- Where: `production/pipeline/PageHeader.tsx:121-130` (`max-w-[24ch]` note + link in the action cluster); `production/pipeline/NextUp.tsx:208` (same reason again)
- Severity: looks wrong
- Fix: say it once: a single line under the header buttons (or a tooltip on the disabled button), and drop it from Next up.
- Evidence: `crops/xpr2/hdr1440.png`; `production/on-pace/w1440.png` y 70-125 and y 797
- Shared: page-local

### XPR2-10 Chapter names wrap to two lines at 1440 while the stage columns are 80 px wide for a 52 px cell

- Page / state: on-pace, no-data and every state with the pipeline
- Widths: 1440 (9 of 14 rows wrap, "Chapter 7 — A Mad Tea- / Party"), 1920 and 1280 and 1024 fit on one line; 768 (3-5 lines) and 390 (one word per line), theme: both
- What is wrong: Why are most rows two lines tall when the heading rows ("Opening credits") are one? The Chapter column gets the leftover 190 px at 1440 while seven stage columns take 80 px each around a 52 px badge, so about 200 px of air is spread across the stage columns; row heights are then 38 and 53 px for like content.
- Where: `production/pipeline/PipelineTable.tsx:28-30,96-102` (`STAGE_WIDTH 5rem`, `FIN_WIDTH 4rem`, `table-fixed`, `min-w-[44rem]`); the 768/390 form is PRD-10
- Severity: looks wrong
- Fix: stage columns 4rem (badge 52 px fits), Chapter `min-w-[14rem]`, and let the existing horizontal scroll take the rest.
- Evidence: `dark:production/recording-check-never/desktop.png` y 130-880 (full table at 1440, rows 38 / 53 px); `production/chapter-removed-list/w768.png` y 60-440
- Shared: page-local
- Supersedes: PRD-10

### XPR2-11 Pipeline table text starts 6 px left of the card title, and Fin. is a left-aligned header over right-aligned numbers

- Page / state: on-pace, no-data
- Widths: 1440 (title "Chapter pipeline" x=249, "Opening credits" and the CHAPTER header x=243), 1920 and 1280 same, theme: both
- What is wrong: Why does the table start left of its own title? The panel header insets 16 px, the table cells 10 px. Also the "FIN. (i)" header text is left aligned (x 433-477) while the values "0:14" are right aligned (x 446-477), so the column's left edges differ by 13 px.
- Where: `primitives/tableStyles.ts:11` (`px-2.5`) against `primitives/panelStyles.ts:9` (`px-4`); `production/pipeline/PipelineTable.tsx:107` (`<TableHeader>` without `align="right"`) over `:123` (`<TableCell numeric>`)
- Severity: looks wrong
- Fix: cell padding 16 px at the card's edges (first and last cell) and `align="right"` on the Fin. header.
- Evidence: `crops/xpr2/table1440.png` (title x=48/2, text x=37/2)
- Shared: `Table` (G2 inset), page-local (Fin.)

### XPR2-12 The readiness chips sit on the row dividers and in four different columns

- Page / state: on-pace, no-data
- Widths: 1920 (chip centres at the top border of 39 px rows, y=740 / 779 / 818), 1440 (chips at the QC column corner x=1027, 18 px from the card edge), theme: both
- What is wrong: Why do the little "?" circles cut across the row lines? Each chip is a 20 px circle moved `-top-2 -right-2` from the cell, so on 39 px rows its centre is on the divider; on the done rows it sits at the QC cell, on others at Prep, Edit, Proof, so the column of round marks wanders across the table.
- Where: `production/pipeline/PipelineTable.tsx:130-135` (`absolute -top-2 -right-2`); chip size `readiness/ReadinessChip.tsx` (20 px)
- Severity: looks wrong
- Fix: put the chip inside the cell's right edge (`top-1/2 -translate-y-1/2`), or give the chips their own column.
- Evidence: `production/on-pace/w1920.png` x 1495-1520, y 730-830; `crops/xpr2/table1440.png` x 1585-1625
- Shared: page-local

### XPR2-13 At 1024 and 768 This week and Recording check become two full-width bars with 700 px between label and number

- Page / state: on-pace, no-data, live-updates-degraded
- Widths: 1024, 768, theme: both
- What is wrong: Why is "Out of date ........ 0" stretched across 930 px? Under 1180 each card gets a full row, label at x=97 and value at x=990; a narrow 3-row list is drawn the whole width. At 1280 the same two cards sit side by side and look right.
- Where: `production/ProductionPage.tsx:422` (`grid-cols-[minmax(0,1fr)] ... min-[1180px]:grid-cols-2` with only the first child spanning two columns)
- Severity: looks wrong
- Fix: keep This week and Recording check 2-up from 640 px (`min-[640px]:grid-cols-2`, stage bar spanning both).
- Evidence: `production/no-data/w1024.png` y 550-770; `no-data/w768.png` y 625-950
- Shared: page-local

### XPR2-14 Next up: a grey sentence is wedged between its two buttons, so they sit on different rows

- Page / state: on-pace, no-data
- Widths: 1440, 1920 (buttons stacked: Open Booth y=649, note y=683, Start timer y=716), 1280 and 1024 and 768 (Open Booth, note and Start timer inline or wrapped differently), theme: both
- What is wrong: Why are the two actions for the same chapter on different rows with a sentence between them? The button group is `flex-wrap`, the note is a flex child between the buttons, so in a narrow card it breaks the pair apart and the layout changes with the width (inline row at 1280, three rows at 1440).
- Where: `production/pipeline/NextUp.tsx:189,205-220` (`flex flex-wrap items-center gap-2` with the note between the buttons)
- Severity: looks wrong
- Fix: buttons together in one row, the reason under them (or in a tooltip, see XPR2-9).
- Evidence: `production/no-data/w1440.png` x 1123-1410, y 640-730; `chapter-removed-list/w1280.png` y 610-650
- Shared: page-local

### XPR2-15 The right column of the lower board stops 210 px above the pipeline column

- Page / state: on-pace, no-data (scrolled view in chapter-removed-list)
- Widths: 1440 and 1920, theme: both
- What is wrong: Why is there an empty strip down the right of the page? Next up and Recorded vs plan end at y=672 while the pipeline and Removed card end at y=884; 210 px of bare page below the chart.
- Where: `production/ProductionPage.tsx:453` (`items-start`; the right column is not stretched, the chart is not `fill`)
- Severity: looks wrong
- Fix: make the chart card `fill` so the column ends where the pipeline ends, or keep the column sticky.
- Evidence: `production/chapter-removed-list/w1440.png` x 1065-1423, y 672-884
- Shared: page-local

### XPR2-16 Timer strip: the third tile sits alone under a half-width rule at 1024 and 768

- Page / state: on-pace
- Widths: 1024 and 768 (Effective rate alone on row 2 with a rule over x 80-545 and nothing over the right half), 390 (label "HOURS PER FINISHED HOUR" wraps so "12.3 : 1" is 24 px lower than "20:00"), theme: both
- What is wrong: Why does the second strip look unfinished? It is 2 columns for 3 tiles, so the odd one hangs alone and the border does not span; at 390 the wrapped label pushes one value out of line with its neighbour.
- Where: `primitives/StatStrip.tsx:20-27` (`--strip-half` columns), `primitives/StatTile.tsx:42` (no reserved label height); data `production/ProductionPage.tsx:68-104`
- Severity: looks wrong
- Fix: 3 columns from 36 rem for three items, or `col-span-full` for the odd tile.
- Evidence: `production/on-pace/w1024.png` y 475-670; `on-pace/w390.png` y 580-820
- Shared: `StatStrip`
- Supersedes: PRD-16

### XPR2-17 Next up and Recorded vs plan stay side by side at 390 and the chart is cut off

- Page / state: on-pace, no-data (scrolled view in chapter-removed-list)
- Widths: 390, theme: both
- What is wrong: Why is the chart cut off? The right stack is forced to 2 columns at every width up to 1281, so at 390 Next up gets 170 px (one word per line, OPEN BOOTH on two lines) and the chart loses its right side ("Recorded days no", no "Oct 29").
- Where: `production/ProductionPage.tsx:453` (`max-[1281px]:grid-cols-2`)
- Severity: looks wrong (390)
- Fix: `grid-cols-1 min-[640px]:max-[1281px]:grid-cols-2`.
- Evidence: `production/chapter-removed-list/w390.png` y 510-844
- Shared: page-local
- Supersedes: PRD-4

### XPR2-18 Recorded vs plan: labels are struck through by lines, and the plot is inset 20 px from the card's title

- Page / state: on-pace, no-data (scrolled view)
- Widths: 1440 ("today" crossed by the dotted line at x≈1310, y≈606), 1920, 1280 ("today" crossed at x≈1080); title x=1081 while the "3h" labels start x=1101 and the last gridline ends x=1395 (12 px short of the 1407 content edge), theme: both
- What is wrong: Why is "today" crossed out? The label is drawn above the dot where the forecast line leaves it; "Recorded days not measured yet" sits on the 2h gridline. The plot is inset more on the left (20 px) than the right (12 px) and more than every other card (16 px).
- Where: `production/overview/ProgressChart.tsx:118,161,176-182` (annotations without a background, `PAD` constants)
- Severity: looks wrong
- Fix: `paint-order: stroke` halo on SVG text, move "today" off the line, align `PAD.left/right` to 16.
- Evidence: `crops/xpr2/chart1440.png`; `production/chapter-removed-list/w1440.png` x 1080-1410, y 460-650
- Shared: page-local (the Schedule page uses the same chart)
- Supersedes: PRD-24

### XPR2-19 Import review: the words column and the select stagger between rows, and long titles are truncated with room elsewhere

- Page / state: import-review-subtitles-off, -text-subtitle (also -repaired for the sections without the checkbox)
- Widths: 1440 (word counts end at x=607 for rows with a Subtitle checkbox, x=692 for rows without), 1024, 768, theme: both
- What is wrong: Why do the numbers jump left and right from row to row? Only rows with a subtitle choice draw the checkbox and nothing reserves its space, so the word counts zigzag by 85 px. "Chapter Four In Which Alice Considers a…" is cut at x=527 while the right-hand column (preview and options) has 400 px of unused height beside it.
- Where: `production/ImportReview.tsx:180-206` (checkbox only when `hasSubtitleChoice`, no placeholder; title `truncate`)
- Severity: looks wrong
- Fix: render an empty fixed-width slot when there is no checkbox (or a 4-column grid), and give the list column more of the width.
- Evidence: `production/import-review-subtitles-off/w1440.png` y 400-610; `import-review-text-subtitle/w1440.png`
- Shared: page-local
- Supersedes: PRD-11

### XPR2-20 Import review: the preview card and the list start at different heights, and the right column is a loose stack

- Page / state: `import-review-*` at 1440
- Widths: 1440 (preview card top y=317, "REVIEW WHAT WAS FOUND" legend y=342, first row y=370), theme: both
- What is wrong: Why does the preview begin above the list it belongs to? The card top is 25 px above the legend of the left column; the card has no heading ("Preview" is missing) and its height changes with its text (3 lines, 4 lines) which pushes "IMPORT OPTIONS" from y=472 to y=492. No row in the list shows it is the one being previewed (Narration chapters is folded).
- Where: `production/ImportReview.tsx:263-264` (two independent columns, `mt-4` on one, `mt-3`/`mt-4` inside the other)
- Severity: looks wrong
- Fix: same top margin on both columns, a "Preview" legend on the card, and mark the previewed row.
- Evidence: `crops/xpr2/rep_r.png`; `production/import-review-text-subtitle/w1440.png` y 310-640
- Shared: page-local

### XPR2-22 Import review below 1180 hides the preview and options under the list

- Page / state: `import-review-*`
- Widths: 1024, 768, 390, theme: both
- What is wrong: Why can't I see what I am deciding about? Under 1180 px the preview and the options drop below the whole outline, past the scroll fold, so the narrator reclassifies chapters with no preview and finds "Import options" only by scrolling.
- Where: `production/ImportReview.tsx:263` (`min-[1180px]:grid-cols-[2fr_1fr]`)
- Severity: looks wrong
- Fix: put "Import options" above the outline when stacked, keep the preview as a collapsible panel under the selected row.
- Evidence: `production/import-review-text-subtitle/w1024.png` and `w768.png` (list only); `import-review-repaired/w768.png` y 820-860 (preview card appears cut at the bottom)
- Shared: page-local

### XPR2-23 Report dialog: content stops short of the dialog edge at 1920, and the headerless dialog has its own title and padding

- Page / state: report-dialog
- Widths: 1920 (dialog x 289-1631, rules, close button and Export end at x=1281, 350 px of blank), 1440 (strip 14 px, close at x 1156-1190, Export ends 1193 against 1205 / 1207 elsewhere), theme: both
- What is wrong: Why is there an empty white band on the right of the dialog and why do the header and footer lines stop before the edge? The content is a fixed `w-[min(62rem,100%)]` box in a 70vw dialog; its 26 px title is bigger than every other dialog title (16 px).
- Where: `production/report/ReportDialog.tsx:84-93,160`; `openReportDialog.tsx` (`headerless`)
- Severity: looks wrong
- Fix: `w-full` wrapper and the shared dialog header.
- Evidence: `production/report-dialog/w1920.png` x 1281-1631; `report-dialog/w1440.png` x 1190-1223
- Shared: page-local (consequence of XPR2-6)
- Supersedes: PRD-6

### XPR2-24 Report dialog at 390: the preview and the Export button are below the first screen

- Page / state: report-dialog
- Widths: 390, theme: both
- What is wrong: Why can't I see Export? The dialog (y 85-758) ends after the file path; preview and footer are inside the same scrolling block.
- Where: `production/report/ReportDialog.tsx:84-160`; `primitives/Dialog.tsx:176`
- Severity: looks wrong (390)
- Fix: footer outside the scroll area.
- Evidence: `production/report-dialog/w390.png` y 85-758
- Shared: page-local
- Supersedes: PRD-20

### XPR2-25 Options dialogs: the label column is a fixed 224 px, labels wrap with 600 px free, and the lone Close is at the left

- Page / state: recording-check-rules, stage-suggestion-options
- Widths: 1440 (label "Share of each paragraph that must be / read" wraps at x≈455 with the dialog 1000 px wide; inputs start x=471; right 600 px empty), 1024, 768, 390, theme: both
- What is wrong: Why does a label wrap when there is half a screen of room, and why is the only button at the left? Every row has a `w-56` label and the single action falls into the default `justify-between` footer.
- Where: `proof/proofOptions/ProofOptions.tsx:95` (`w-56`) and `:135-142` (one action, no `actionsAlign="end"`); `primitives/Dialog.tsx:195`
- Severity: looks wrong
- Fix: a two-column grid (`auto 1fr`) and `actionsAlign="end"`.
- Evidence: `production/recording-check-rules/w1440.png` y 390-570, Close x=233; `stage-suggestion-options/w1440.png`
- Shared: `ProofOptions` (also on Proof), `Dialog` footer
- Supersedes: PRD-19

### XPR2-27 Stage suggestion options: 14 identical "Required" rows with "(proofing)" repeated on each, ungrouped

- Page / state: stage-suggestion-options
- Widths: 1440, 1024, 768, 390, theme: both
- What is wrong: Why is this a wall of the same row? Eight labels read "Rendered file: ... (proofing)", so the stage is repeated instead of being a heading; rows are 53 px apart with a 40 px select each and nothing separates the recording signals from the proofing ones. The last select is clipped by the scroll area edge (y 741).
- Where: `proof/proofOptions/ProofOptions.tsx:95` (flat list of fields); labels from the host field definitions
- Severity: looks wrong
- Fix: group by stage (Recording, Editing, Proofing headings), drop the repeated suffix, two columns at 1440.
- Evidence: `production/stage-suggestion-options/w1440.png` y 160-741; `w768.png`
- Shared: `ProofOptions`

### XPR2-28 Dialog footers are not consistent: Cancel left and primary right in some, both right in the running dialog, a lone Close at the left in others

- Page / state: manuscript-candidate-offer, `recording-check-*`-model-required, -running, -rules, stage-suggestion-options, `import-review-*`
- Widths: 1440, 1024, 768, theme: both
- What is wrong: Why does the primary action move around from dialog to dialog? Candidate and model dialogs: Cancel left, Import / Download right. Running: "Continue in background" and "Cancel" both at the right, no X in the header. Rules and stage options: a single Close at the left. Import review: Cancel left, Back and Replace right.
- Where: `primitives/Dialog.tsx:43,86,195` (`actionsAlign` default `between`); running dialog uses `actionsAlign="end"` (cause in `production/RecordingCheck.tsx`, not traced)
- Severity: looks wrong
- Fix: one footer rule: dismissing action left, primary right; a lone action right.
- Evidence: `production/recording-check-running/w1440.png` y 590-630 against `recording-check-model-required/w1440.png` y 575-610
- Shared: `Dialog` footer

### XPR2-30 Model download dialogs: the facts are an unaligned list and the last line looks like plain text

- Page / state: recording-check-model-required, -recheck-model-required
- Widths: 1440 (values start at x=275, 282, 296, 296, 288, 283 on successive lines), 1024, 768, 390, theme: both
- What is wrong: Why do the values start at a different x on every line? Bold "Model:", "Version:", "Download:" are inline labels followed by text, so the values do not form a column; "Model card · Provenance" at the bottom reads like a plain line. At 390 the path breaks mid-word ("faster-whi / sper/small"). The lead paragraph ends in an orphan "cache." at 1440.
- Where: dialog body in the recording-check model prompt (`production/RecordingCheck.tsx`, cause lines not traced)
- Severity: looks wrong
- Fix: a two-column definition list (`dl` grid) with the links styled as links.
- Evidence: `production/recording-check-model-required/w1440.png` y 405-545
- Shared: page-local (the asset prompt is probably shared, not verified)

### XPR2-31 Slide-over close button is squeezed to 22-28 px wide

- Page / state: `recording-check-*` (complete, incomplete, cascade, pickups, stale 22-24 px; never, refused 28 px)
- Widths: 1440, 768, 390 (24 px), theme: both
- What is wrong: Why is the X a thin rectangle on some panels and a square on others? The 36 px button is not `flex-none` and loses width to a two-line title; Stage readiness (36 px) is unaffected.
- Where: `primitives/SlideOver.tsx:69-74` (title without `min-w-0`, button without `flex-none`)
- Severity: looks wrong
- Fix: `flex-none` on the button, `min-w-0` on the title.
- Evidence: `production/recording-check-incomplete/w1440.png` x 1399-1421, y 17-52 against `stage-evidence-recommended/w1440.png` x 1386-1421
- Shared: `SlideOver`
- Supersedes: PRD-12

### XPR2-34 Refused check: an unlabeled "Chapter 1" select next to a 36 px Confirm

- Page / state: recording-check-refused
- Widths: 1440, 1024, 390, theme: both
- What is wrong: Why does a track picker say "Chapter 1" and why are select and button different heights? The select (y 215-256, 41 px) has no visible label naming it a REAPER track, and the Confirm button beside it is 36 px (y 217-253); the select is 115 px wide in a 280 px box.
- Where: `mapping/MappingConfirm.tsx` (select and Button in a row; `--control-height` against `--button-height`)
- Severity: looks wrong
- Fix: label "REAPER track", matching heights, select `flex-1`.
- Evidence: `production/recording-check-refused/w1440.png` y 200-260
- Shared: `Select` / `Button` height tokens
- Supersedes: PRD-23

### XPR2-35 Stage readiness: two disabled buttons always drawn, "Stage readiness" said twice, and nothing to do in the "can't tell" state

- Page / state: stage-evidence-not-ready, -unknown, -changed, -recommended
- Widths: 1440, 1024, 768, 390, theme: both
- What is wrong: Why are there Dismiss and Confirm buttons if neither can be pressed, and where is the thing that fixes it? In not-ready, unknown and changed both buttons are faded (and Revert is added in changed); the title bar says "Stage readiness" and the first line says "STAGE READINESS" again above "Chapter 6"; the unknown state is a 12 px sentence ("no track linked") with 400 px of white under it and no link to the recording check, although its catalog description promises one. The footer sits 400 px below the content it decides.
- Where: `production/readiness/ReadinessPanel.tsx:77,122-133` (SectionLabel repeat; buttons always rendered, `disabled` only); the missing action is `onCheckNow` used only in the error branch (:52-59)
- Severity: looks wrong
- Fix: hide impossible buttons, drop the duplicated label, add "Open recording check" in unknown, keep the footer under the content.
- Evidence: `production/stage-evidence-unknown/w1440.png` y 60-880; `stage-evidence-changed/w1440.png` y 845-885
- Shared: page-local

### XPR2-46 Report preview is an unstyled page, and a white slab in dark

- Page / state: report-dialog
- Widths: 1440, 1920, 1024, 768, theme: both (white block in dark)
- What is wrong: Why does the preview look like a 1995 web page? It is the default Times heading and a bare `dl` ("Chapters / 12 / Words / 29189") with no spacing or alignment; in dark it is a pure white 666 x 520 box in a dark dialog. The left column (checkboxes and format) ends at y=625 while the preview runs to 720.
- Where: `production/report/ReportDialog.tsx:126-132` (`iframe ... bg-white`, host-built HTML in `preview.html`, styling not in the UI)
- Severity: looks wrong
- Fix: give the report HTML a small stylesheet (and a dark-aware frame), align the two columns' bottoms.
- Evidence: `dark:production/report-dialog/desktop.png` x 524-1190, y 200-720; `production/report-dialog/w1440.png`
- Shared: page-local

### XPR1-13 Deadline status is repeated three times at the top of the page

- Page / state: at-risk
- Widths: 1440, 1024, 768, 390 (theme: both)
- What is wrong: why does the same message appear three times in 130 px? The subtitle says "delivery due Sep 29 (3 days · ✕ overdue or behind)", the red pill says "Behind · done Oct 4, due Sep 29 · needs 3.8 h/day", and the Due tile says "Sep 29 / 3 days · ✕ behind". The pill sits on its own row detached from the date it describes. At 390 the subtitle breaks inside the parenthesis leaving "overdue or behind)" alone.
- Where: `production/pipeline/PageHeader.tsx` (subtitle and pill), Due tile in `ProductionPage.tsx` KPI strip
- Severity: polish (organisation, may be intended)
- Fix: keep one place for the status: the pill beside the date in the subtitle, and the Due tile only for the date.
- Evidence: `production/at-risk/w1440.png` x 232-700 y 110-165 and x 1225-1423 y 195-265; `at-risk/w390.png` y 110-180
- Shared: page-local

### XPR1-15 Recorded vs plan chart: labels struck by lines, plot not on the card gutters

- Page / state: chapter-removed-list, credits-closing-not-set-up
- Widths: 1440 and 1280 ("today" crossed by the dotted line at about x 1310 y 606; "Recorded days not measured yet" struck by the 2h gridline at y 694 in credits-closing), 1024 and 768 ("today" touching the line) (theme: both)
- What is wrong: why is text drawn through a line? The y-axis labels start at x 1100 where the card text starts at 1081, and the chart leaves 90 px blank under the x labels at 768/1440.
- Where: `production/overview/ProgressChart.tsx` annotations (about :118-125)
- Severity: polish
- Fix: offset labels above the line or give them a paint-order stroke; align the plot to the card padding.
- Evidence: `credits-closing-not-set-up/w1440.png` x 1085-1400 y 640-800; `chapter-removed-list/w1440.png` y 600-615
- Shared: page-local
- Supersedes: PRD-24

### XPR1-18 Dialog footer is 1.6 px wider than header and body content

- Page / state: all dialogs of this slice (activity log, remove confirm, credits, gain match, import)
- Widths: 1440 (log dialog: header close button right edge 1205, progress bar 1205, footer CLOSE right edge 1207; left edge 233 vs text 234.6) (theme: both)
- What is wrong: why is the right button edge 2 px outside the text above it? Header and body use `1.1rem` and the footer `px-4`.
- Where: `primitives/Dialog.tsx:163` (`px-[1.1rem]`), `:176` (body `p-[1.1rem]`), `:195` (footer `px-4`)
- Severity: polish
- Fix: use `px-[1.1rem]` on the footer.
- Evidence: `import-activity-log/w1440.png` x 1146-1207 y 592-628
- Shared: `Dialog`
- Supersedes: PRD-21

### XPR1-23 Track panel fact row: wrapped value is left-aligned while the others are right-aligned

- Page / state: chapter-track-panel-linked, -missing (and behind chapter-remove-confirm)
- Widths: 768 and 1440 ("Linked  Sep 1, 2026, 12:00 PM, by / you": value starts x 1191, "you" sits under it on the left, other values end at x 1422), 390 (theme: both)
- What is wrong: why is "you" hanging under the date on the left? The fact row is `justify-between` with no `text-right`.
- Where: `production/ChapterTrackPanel.tsx:337-340` (`Fact` value span)
- Severity: polish
- Fix: `text-right` and `min-w-0` on the value.
- Evidence: `chapter-track-panel-linked/w1440.png` y 284-312
- Shared: page-local
- Supersedes: PRD-15

### XPR1-28 Editing-check running: Cancel under the progress bar, Match levels cut off

- Page / state: editing-check-running
- Widths: 1440, 1024, 768, 390 (theme: both)
- What is wrong: why is the progress bar a full-width strip with a lone small Cancel below? The result is that Match levels slides below the fold at 1440 (cut at y 885-900). At 390 the pipeline behind the panel is cut at x 70 with names wrapping per letter.
- Where: `editing/EditingCheckPanel.tsx` (running block, progress bar plus Cancel)
- Severity: polish
- Fix: put Cancel on the same row as "Checking item 1 of 3…" and keep the progress bar slim.
- Evidence: `editing-check-running/w1440.png` x 1139-1422 y 215-300 and y 885-900
- Shared: page-local

### XPR1-29 Gain-match confirm: orphan "dB." and a 1006 px dialog for two short sentences

- Page / state: editing-check-gain-match-confirm
- Widths: 768 ("more than 2 / dB." orphan), 390 (wraps to 5 lines), 1440 (two short lines in 1006 px; two unrelated sentences separated only by a line break) (theme: both)
- What is wrong: why does "dB." sit alone on a line? There is no non-breaking space between the number and the unit, and the two sentences (what differs, what Match does) are separate lines with no spacing. The "Experimental" pill next to Match levels in the panel behind the scrim is the only place that flag is shown.
- Where: dialog text in `editing/EditingCheckPanel.tsx` (gain-match confirm) - cause line not located; dialog width in `Dialog.tsx:148`
- Severity: polish
- Fix: `2 dB` with a non-breaking space; two paragraphs with spacing.
- Evidence: `editing-check-gain-match-confirm/w768.png` x 134-640 y 470-550
- Shared: page-local

### XPR1-32 Import review: duplicate summaries and two stacked headings

- Page / state: import-confirm, import-confirm-markdown, import-review-characters, import-review-collapsed
- Widths: 1440, 1024, 768, 390 (theme: both)
- What is wrong: why is the same information given three times? The summary says "5 narration chapters ... 1 front matter section · 2 reference sections · 3 of 3 character suggestions checked", then the chips right below repeat "5 chapters / 221 paragraphs / 3 character suggestions", and two headings ("Check the chapter outline", "REVIEW WHAT WAS FOUND") are stacked with 20 px between. Character suggestion rows are 24 px pitch while outline rows are 47 px pitch.
- Where: `production/ImportReview.tsx` top block (summary paragraph, chips, headings)
- Severity: polish (organisation)
- Fix: keep one summary (the chips) and one heading, and one row pitch.
- Evidence: `import-confirm/w1440.png` x 235-690 y 170-345; `import-review-characters/w1440.png` y 580-710
- Shared: page-local

### XPR1-33 Import activity log: log box cut mid-row, close button right edge and "0s" baseline off

- Page / state: import-activity-log
- Widths: 1440 and 1024 (last row "Found 7 chapters in 8 sections" is half cut at y 554), 768, 390 (rows wrap; "Opening Word document / Alice.docx") (theme: both)
- What is wrong: why is the last log line sliced in half? The log box shows 5.5 rows with a 2 px border cutting the last row. "0s" is 2 px above the baseline of "Manuscript import complete." The dialog has no X in its header while the import-review dialog has one.
- Where: log container height in `production/ImportActivity*` / `ManuscriptImport.tsx` (fixed `max-h`, cause not located)
- Severity: polish
- Fix: set the log height to a whole number of rows and align "0s" to the baseline.
- Evidence: `import-activity-log/w1440.png` x 235-1205 y 417-560 and y 336-350
- Shared: page-local

### XPR1-34 Pipeline status badges hang off cell corners

- Page / state: all board states (credits-closing, removed-list, closing at 1024 and 1440)
- Widths: 1024, 1280, 1440 (theme: both)
- What is wrong: why do the "?" and red "X" circles sit half on the pill and half on the neighbour? The 15-18 px badges straddle the top-right corner of PROOF/EDIT/PREP/RECORD pills (x about 787, 707, 547, 627) and in the last column sit on the QC pill's edge, so the badge hit area overlaps the next column.
- Where: `production/pipeline/PipelineTable.tsx` cell badge (about the cell component, absolute `-top -right`) - may be intended
- Severity: polish
- Fix: place the badge inside the pill's top-right or reserve a column.
- Evidence: `credits-closing-not-set-up/w1440.png` x 535-800 y 580-780
- Shared: page-local

### XPR1-35 KPI info icon sits above the label baseline

- Page / state: all board states
- Widths: 1440, 1280, 1920 (info "i" at y 198 vs label baseline y 202 in "RECORDING"; the "FIN. ⓘ" header icon also sits 1-2 px high) (theme: both)
- What is wrong: why is the small "i" higher than its label?
- Where: `primitives/StatTile.tsx` / info button (cause not read in detail)
- Severity: polish (may be intended)
- Fix: `items-baseline` or `translate-y` to centre the icon on the cap height.
- Evidence: `at-risk/w1440.png` x 600-615 y 190-210
- Shared: `StatTile`

### XPR1-36 Toast covers page content and is not tied to the gutter

- Page / state: chapter-sync-toast-undo
- Widths: 1440 (toast x 1123-1420 y 835-880 covers the REVIEW PICKUPS button), 1024, 768, 390 (toast spans x 75-370, covers "This week" title) (theme: both)
- What is wrong: why does the message sit on top of a button? The toast is a transient overlay, so this may be intended. Its right edge at 1440 is x 1420 against the cards' 1423 (3 px).
- Where: toast host (`useChapterSyncToast.ts` / toast primitive) - cause not located
- Severity: polish (may be intended)
- Fix: align the right edge to the page gutter; keep clear of the scrolling content or add bottom padding.
- Evidence: `chapter-sync-toast-undo/w1440.png` x 1123-1420 y 818-880
- Shared: toast primitive

### XPR2-21 Import review: group rows, names and info icons do not share edges

- Page / state: import-review-repaired, -subtitles-off, -text-subtitle
- Widths: 1440 (group titles start x=262, the row names under them x=255; the "i" icons end x=863, the selects end x=871; the legend text starts x=238, the "Check the chapter outline" heading x=235), theme: both
- What is wrong: Why do the group title and the rows under it start at different x, and why does the info icon not line up with the select? Disclosure uses a 7 px different inset from the `pl-5` rows, and the aside icon is inset 8 px from the right edge the controls use.
- Where: `production/ImportReview.tsx:149` (`pl-5`), `:270` (`SectionLabel as="legend" className="px-1"`); `primitives/Disclosure.tsx` aside slot
- Severity: polish
- Fix: one inset for title and rows; icon on the same right edge as the select; drop the `px-1` on the legend.
- Evidence: `crops/xpr2/rep_l.png` (title x=75/2, row name x=60/2, icon right 1292/2 against select right 1292/2 plus 8)
- Shared: `Disclosure`

### XPR2-26 Recording check rules: the first value has no unit while the other three say "words", and the intro is three different type styles with no gaps

- Page / state: recording-check-rules
- Widths: 1440, 1024, 768, 390, theme: both
- What is wrong: Why is "0.8" the only number without a unit, and why are the first lines jammed? The intro is a 14 px sentence, a bold 12 px line 0 px below it, then a 12 px paragraph; the first row is 50 px tall because its label wraps, the others 48.
- Where: `production/RecordingCheckRules.tsx:6-12` (note) and `description` in `proof/proofOptions/ProofOptions.tsx:122`; unit slot from the field definitions (cause not found)
- Severity: polish
- Fix: show "of the words" (or a % ) beside 0.8; one 8 px rhythm for the intro lines.
- Evidence: `production/recording-check-rules/w1440.png` y 295-420
- Shared: `ProofOptions`

### XPR2-29 Dialog footer is narrower than the header and body, and the focused body shows a ring edge to edge

- Page / state: manuscript-candidate-offer, recording-check-rules, stage-suggestion-options (all dialogs)
- Widths: 1440 (header X right edge x=1205, footer button right edge x=1207; blue focus ring x 217-1223 across the header and footer rules), theme: both
- What is wrong: Why is the blue box touching the dialog walls? The body takes focus and draws an inset ring flush to the dialog edge; the footer uses 16 px padding while header and body use 17.6 px.
- Where: `primitives/Dialog.tsx:163,176,195`
- Severity: polish
- Fix: `px-[1.1rem]` on the footer; put the ring on an inset element or move focus to the dialog.
- Evidence: `production/manuscript-candidate-offer/w1440.png` y 420-476; `recording-check-rules/w1440.png`
- Shared: `Dialog`
- Supersedes: PRD-21

### XPR2-32 Recording check slide-over uses two different disclosure styles

- Page / state: recording-check-never, -options, -complete, etc.
- Widths: 1440, 1024, 768, 390, theme: both
- What is wrong: Why does one fold look like a bordered box with a ▶ and the other like a caps label with a chevron? "Check options" is a native `<details>` in a bordered box (bold sentence-case, 8 px triangle), "Paragraph detail" is the shared `Disclosure` (caps, chevron, no box).
- Where: `production/RecordingCheck.tsx:323-324` (`<details ...><summary>`) against `production/RecordingCheckReport.tsx:174` (`Disclosure`)
- Severity: polish
- Fix: use `Disclosure` for both.
- Evidence: `production/recording-check-complete/w1440.png` y 88-122 and y 765-785
- Shared: page-local

### XPR2-33 Check options: five full-width selects and ten lines of help in one column

- Page / state: recording-check-options
- Widths: 1440, 1024, 768, 390, theme: both
- What is wrong: Why is this a long unstructured column? Speech model, Chunk length, Parallel processes, Crossover, Chapters at once each get a caps label above a 40 px select; two of them have a 3-line explanation under them and the summary sentence "Small in 5 min chunks that overlap by 6 / s, ..." breaks inside "6 s". Only one divider groups anything.
- Where: `production/RecordingCheck.tsx:323-400` (stacked fields)
- Severity: polish
- Fix: group (Model / Speed) with two columns, put the help in a `?` tooltip, and use a non-breaking space in "6 s".
- Evidence: `production/recording-check-options/w1440.png` y 90-795
- Shared: page-local

### XPR2-36 Stage readiness evidence rows: "Met" / "Not met" sits 3 px above the first line, and the tick says it too

- Page / state: stage-evidence-recommended, -not-ready
- Widths: 1440, 1024, 768, 390, theme: both
- What is wrong: Why is "Met" higher than the line it belongs to? The row is `items-start`, the 12 px mono value sits at the top (y=313) while the 14 px bold label's first line is at y=316; "✓" and "Met" repeat each other.
- Where: `production/readiness/ReadinessPanel.tsx:30-38`
- Severity: polish
- Fix: `items-baseline`, and drop one of the two.
- Evidence: `production/stage-evidence-recommended/w1440.png` x 1140-1422, y 305-325
- Shared: page-local
- Supersedes: PRD-22

### XPR2-37 Recording check result: pickup blocks and the Check again row put actions on different rows from the text, and the two dashed link cards look like errors

- Page / state: recording-check-pickups, -cascade, -complete
- Widths: 1440, 768, 390, theme: both
- What is wrong: Why is "Go to paragraph 11" under its description while "Check again" is a row above? Each pickup card puts its button on a new line in 280 px, then two dashed boxes ("Repeated reads (Proof)... Open Proof", "Pickup list: 3 open ... Open pickups") repeat the same layout with a link on its own line. Five blocks in a row with three different treatments (solid grey, dashed, none).
- Where: `production/RecordingCheckReport.tsx:144-165` (`InsetCard fill flex-wrap`), `:170-171` (`TakeReviewPickups`, `PickupListCount`)
- Severity: polish
- Fix: description and button on one row at a wider panel width; one card style for pickups and links.
- Evidence: `production/recording-check-pickups/w1440.png` y 615-890
- Shared: page-local

### XPR2-38 Running dialog: log rows have no top margin, log box is half empty, and the dialog has no way out in the header

- Page / state: recording-check-running
- Widths: 1440, 1024, 768, 390 ("Starting the recording check..." wraps at 390), theme: both
- What is wrong: Why is a 970 px progress bar and a log with an empty lower half shown for a 1-second job? The dialog is 1006 px wide (XPR2-6), the live-activity box is 145 px tall with three 25 px rows and 70 px blank, and the "1s" is a lone figure at the far right.
- Where: `production/RecordingCheck.tsx` (work dialog; cause lines not traced)
- Severity: polish
- Fix: size the dialog to 32-36 rem; let the log box fit its rows.
- Evidence: `production/recording-check-running/w1440.png` y 256-640
- Shared: page-local

### XPR2-39 Toast covers the content it is about

- Page / state: live-updates-degraded
- Widths: 1440 (toast x 972-1420, y 823-880 over Next up's Review pickups button), 1024 (covers the Recording check icon button at x 955-990, y 715-750), theme: both
- What is wrong: Why does the notice sit on top of a button? It is a bottom-right toast with no safe margin; at 768 and 390 it is gone before the shot.
- Where: `primitives/Toast.tsx` (position); cause not traced
- Severity: polish
- Fix: place it above the page bottom bar or give the content bottom padding; consider a banner for a standing condition.
- Evidence: `production/live-updates-degraded/w1440.png` x 972-1420, y 823-880
- Shared: `Toast`

### XPR2-40 No-manuscript: the heading is smaller and 3 px higher than on the loaded page, and the calendar icon beside Import is unexplained

- Page / state: no-manuscript, manuscript-candidate-offer
- Widths: 1440 (title text 108 px wide at y=83 against 131 px at y=86), 1024, 768, 390, theme: both
- What is wrong: Why does "Production" shrink when there is no manuscript, and why is a bare calendar icon next to Import manuscript? The empty-state heading uses the default size and the icon (set a due date) looks like part of the import action. A 261 px card sits in an otherwise empty page.
- Where: `production/pipeline/NoManuscript.tsx:11,19-22` (`<Heading title="Production">` without `size="hero"`)
- Severity: polish
- Fix: `size="hero"`; label the icon or move due date elsewhere.
- Evidence: `production/no-manuscript/w1440.png` y 70-340
- Shared: page-local
- Supersedes: PRD-25 (heading part)

### XPR2-41 Loading: a different layout from the page it becomes, and the header already claims "switched off"

- Page / state: loading
- Widths: 1440, 1024, 768, 390, theme: both
- What is wrong: Why does the page re-arrange when it loads? The skeleton has 4 tiles then 3 cards, the page has a 6-tile card, a 3-tile strip and 3 cards; at 1024 the skeleton is 4-up and the page 3x2. The header shows Start session faded with "Experimental: switched off in Settings." and "Open DAW settings" before anything has loaded.
- Where: `production/overview/ProductionSkeleton.tsx:36-45` (`min-[1024px]:grid-cols-4`); header `production/pipeline/PageHeader.tsx:117-130` shown while `loading`
- Severity: polish
- Fix: skeleton with the KPI card and strip shapes; hide the reason while capabilities are unknown.
- Evidence: `production/loading/w1440.png` y 175-460; `loading/w1024.png`
- Shared: page-local
- Supersedes: PRD-25 (skeleton part)

### XPR2-42 Load error: title and card are inset 40 px, a different page gutter from every other state

- Page / state: load-error
- Widths: 1440 (title x=468, card 468-1188, title y=107 against y=86 on the page), 1024 (x=184), 768 and 390 (x=40 against 16), theme: both
- What is wrong: Why does the heading jump to the right and down when the page fails? A centred 720 px column with extra `p-6`, default heading size.
- Where: `layout/LoadError.tsx:56` (`mx-auto max-w-3xl space-y-4 p-6`)
- Severity: polish
- Fix: follow the page gutters (may be intended as a centred error card).
- Evidence: `production/load-error/w1440.png`; `load-error/w390.png` x=40
- Shared: `LoadError`
- Supersedes: PRD-18

### XPR2-43 KPI tiles: sub-lines are 1 px off between tiles 1-3 and 4-6, and the target "i" is a tiny serif glyph above the label line

- Page / state: on-pace, no-data
- Widths: 1440 and 1920 (hint baseline y≈259 in tiles 1-3, y≈258 in tiles 4-6; the "i" at y=198 against the label at y=202), theme: both
- What is wrong: Why does the small text step by a pixel between tiles, and why is that italic "i" floating? The three left tiles carry a unit beside the value (`/ 3:08`, `left`) which lifts the line box, and the info button draws a bold serif italic character 4 px above the caps label baseline.
- Where: `primitives/StatTile.tsx:48-56` (unit span line-height), `production/target/TargetInfoButton.tsx:99,110` (`absolute top-1 right-1`, `font-serif italic`)
- Severity: polish
- Fix: fixed line-height on the value row; use the shared info icon aligned to the label baseline.
- Evidence: `crops/xpr2/kpi1440.png` (hint rows at y 143 and 141 of the 1.6x crop; "i" at x=614, y=45)
- Shared: `StatTile`

### XPR2-44 Header verdict pill sits on its own row, leaving the title block three lines tall beside one-line buttons

- Page / state: on-pace, no-data
- Widths: 1440, 1280, 1024 (pill y=152, buttons y 79-115), theme: both
- What is wrong: Why does the pill hang under the counts instead of beside the title? Title, counts and pill are stacked at 8 px gaps and the actions are on the first row, so the header is 100 px tall and the pill is the only thing on its row; 32 px of space follows before the KPI card at 1440 (pill bottom 161, card top 179).
- Where: `production/pipeline/PageHeader.tsx:68,95-106` (`flex-col gap-2`)
- Severity: polish
- Fix: pill on the counts line (it is the verdict of that line).
- Evidence: `crops/xpr2/hdrleft1440.png`
- Shared: page-local

### XPR2-45 Stage bar tones change order in dark

- Page / state: on-pace, no-data (dark)
- Widths: 1440 dark, theme: dark
- What is wrong: Why does "Proofed" look brighter than "Edited" in dark when it is darker in light? The mixed tones (`color-mix(... 70%, var(--surface))`) lighten toward the surface, which is dark in the dark theme, so the lightness order flips (bar segment 2 is the brightest light blue). May be intended.
- Where: `production/overview/StageBar.tsx:50-56`
- Severity: polish
- Fix: mix toward a theme-independent colour.
- Evidence: `dark:production/on-pace/desktop.png` x 249-712, y 478-492
- Shared: page-local

### XPR2-47 Candidate dialog has both an X and a Cancel, and the whole sentence is one 750 px line

- Page / state: manuscript-candidate-offer
- Widths: 1440, 1024, 768, 390, theme: both
- What is wrong: Why two ways to say no and a line that long? X (x 1169-1205) and Cancel (x 233) do the same thing; the body is a single 750 px line which wraps to two at 1024 and four at 390.
- Where: `production/ManuscriptImport.tsx` (confirm dialog), `primitives/Dialog.tsx:149`
- Severity: polish
- Fix: width per XPR2-6; keep one of the two dismissals.
- Evidence: `production/manuscript-candidate-offer/w1440.png` y 357-543
- Shared: `Dialog`

### XPR2-48 Import review header paragraph ends in an orphan word, and the summary lines are three type sizes

- Page / state: import-review-text-subtitle, -repaired, -subtitles-off
- Widths: 1440 ("results." alone on line 2, x 235-282), 768 and 390 (breaks mid-sentence), theme: both
- What is wrong: Why is one word on its own line and why do three lines above the heading use three sizes? 14 px sentence, 12 px counts line, a 12 px lead; and the 14 px paragraph runs to the edge (x=1205) with `results.` dropped.
- Where: `production/ImportReview.tsx:70-76`
- Severity: polish
- Fix: `text-wrap: balance`, one size for the two summary lines.
- Evidence: `production/import-review-text-subtitle/w1440.png` y 170-235
- Shared: page-local
