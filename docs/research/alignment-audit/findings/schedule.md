# Schedule: alignment findings

Part of the [alignment audit](../../alignment-audit.md). Findings are grouped by the round that produced them; a later round's finding that replaces an earlier one says `Supersedes`. Evidence paths are `<page>/<state>/<width>.png` of the light capture, `dark:<page>/<state>/<viewport>.png` for dark, `tall:<page>-w<width>.png` for the below-the-fold captures; the images are not committed (regenerate the repo-viewport ones with `pnpm --dir apps/ui visual:page <page>`).

## Round 4: gap fill

### R4SM-13 Why does the Milestones table at 390 cut its date box mid-text and push the Status chip off-screen?

- Page / state: schedule on-pace (tall)
- Widths: 390 (secondary) (theme: both)
- Gut reaction: the one editable cell shows "11/10/202" with a grey scroll shadow on its right and nothing tells me Status is hidden.
- What is wrong: Status and the row actions are off-screen; the "Whole book" measure wraps to two lines (11 px) while the name is one line (row 47 tall).
- Where: `schedule/MilestoneTable.tsx:55-66` (table inside an `overflow-x-auto` scroller)
- Severity: looks wrong (390)
- Fix: at <= 480 px drop Measures into a second line under the name and keep Due + Status visible
- Evidence: `S/tall/schedule-w390.png` y1200-1350 (crop `s390_a.png`)
- Shared: page-local

### R4SM-14 Why does the "Final delivery" row jump between a 14 px bold name and 11 px grey figures, and why is the heading row 22-30 px right of the card title?

- Page / state: schedule on-pace (no toasts), lone Final row
- Widths: 1920, 1280, 1024, 768 (theme: both)
- Gut reaction: the card title sits at the card edge but the table underneath is indented, and the row mixes three typefaces and sizes (bold sans, tiny grey sans, mono date, mono chip).
- What is wrong: heading row x 99 vs title x 68 (1280), 112 vs 85 (1024), 55 vs 33 (768); the 40-45 px first column is the empty Done-toggle column even though this row has no toggle; row cells: name 14 px bold, "Whole book" about 11 px muted, native date box 36 tall, status chip 22 tall, so four different heights in one 47 px row; right of the Status chip the row is empty for 150 px (1280) because the row has no actions. This is the lower Milestones table on an on-pace seed, seen without toasts for the first time (round 3 only had the toast-covered long-text capture).
- Where: `schedule/MilestoneTable.tsx:59,70-100`
- Severity: looks wrong
- Fix: remove the empty toggle column for a row that cannot be toggled or align the table to the card title; one type size for name and measures
- Evidence: `S/tall/schedule-w1280.png` y1060-1170 (crop `s1280_b.png`); `schedule-w768.png` y1120-1280
- Shared: page-local
- Extends: XSH-4, XSH-11, XSH-17

## Round 3: coverage gaps and scanner cross-check

### R3SH-1 Why does the Final delivery date box look like an empty form field in a grey card, and why is "No date" a different kind of chip from "Oct 4"?

- Page / state: schedule / no-due-date, milestone-dialog (behind), on-pace
- Widths: 1920, 1440, 1280 (theme: both)
- Gut reaction: the one real row of the table looks like an unfinished form, an open "mm/dd/yyyy" box with a native calendar glyph, next to a flat grey "No date" chip.
- What is wrong: at 1280 the date box is 132 x 36, bordered white, with a native Chrome date picker glyph; every other value on the page is plain mono text. The status chip beside it flips between a green "Oct 4" and a grey "No date" with different fill and no icon, so the Status column changes kind by state. The grey chip is #efeeea on the card #fbfaf6: contrast is about 1.1:1 and it reads as a hole.
- Where: `schedule/MilestoneTable.tsx:112-116` (`DueField`), status cell uses `StatusBadge` neutral
- Scanner: none
- Severity: looks wrong
- Fix: draw the due date as text with an edit affordance (pencil or click to edit), and give the neutral status the same border or fill depth as the success chip
- Evidence: `S/schedule/no-due-date/w1280.png` (x 750-940, y 640-665 at 1x of the 1100 view), `S/crops/r3sh/v/l_schedule_milestone-dialog_w1280.png`
- Shared: `StatusBadge` neutral tone

### R3SH-6 Why does the three-toast stack also hide the Add "+" so the table can't be reached?

- Page / state: schedule / long-text
- Widths: 1280, 1024, 768, 390 (theme: both)
- Gut reaction: the one action that creates milestones is under the dark toast pile and only a sliver of its border shows.
- What is wrong: the toast stack (330 x 3 x 46) sits at x 905-1085 and y 540-670 (1280 view), covering the "+" completely at 1024/768 (only a 6 px edge visible at x 956 and y 598-610); the page content is not pushed up and the three toasts have an "Undo" link each whose hit area is 33 x 20.
- Where: `primitives/Toast.tsx:88`
- Scanner: W4 (Status th under toast), H1
- Severity: looks wrong (extends XSH-10 from "covers table" to "covers the Add button")
- Fix: stack at most 2, or place on the opposite corner when the page's primary button is there
- Evidence: `S/crops/r3sh/v/l_schedule_long-text_w1024.png`, `.../w768.png`
- Shared: toast container
- Supersedes: extends XSH-10

### R3SH-2 Why do the "No due date set" pill and the verdict pill disappear against the page?

- Page / state: schedule / no-due-date (all widths); at 1280 and above also on-pace
- Widths: 1920, 1440, 1280, 1024, 768 (theme: both; worst in light)
- Gut reaction: there is a ghost rounded rectangle at the top right with tiny text; I only notice it because of its shadow-free edge.
- What is wrong: the grey pill (about 74 x 22, text about 10 px) is #f2f1ed on a #edece8 page, so its edge is almost invisible; the green and red pills have a tint but the neutral one has none. It also sits 4 px higher than the title centre (XSH-13) and repeats the subtitle "No due date set" 24 px beneath it.
- Where: `schedule/VerdictPill.tsx` neutral tone, `primitives/HeaderChip.tsx:12` (`--surface-2`)
- Scanner: none
- Severity: polish
- Fix: drop the pill when it repeats the subtitle, or give it a border
- Evidence: `S/crops/r3sh/v/l_schedule_no-due-date_w1440.png` (top right), `S/schedule/no-due-date/w1280.png` (x 1005-1085, y 60-78 of the 1100 view)
- Shared: `HeaderChip` neutral
- Supersedes: extends XSH-13

### R3SH-3 Why is the side cards' content at 1920 sitting in a 1.3 m wide chart with the milestone table spread across 1790 px?

- Page / state: schedule / every loaded state
- Widths: 1920 (theme: both; may be intended)
- Gut reaction: everything is stretched like a rubber band; the data is small but the page is as wide as the window.
- What is wrong: no max width on the page: the chart is 1300 px wide, the milestone table columns (Milestone x=180, Measures x=515, Due x=817, Status x=903, all on a 1100 view of 1790) leave 130-300 px gaps, and the verdict pill ends 1500 px from the due line it describes.
- Where: `layout/AppShell.tsx:353` (content `p-4` with no `max-w`); `schedule/MilestoneTable.tsx:55-66`
- Scanner: none
- Severity: polish
- Fix: cap schedule content at about 1400 px, or fix the table widths (XSH-3)
- Evidence: `S/crops/r3sh/v/l_schedule_on-pace_w1920.png`
- Shared: AppShell content region

### R3SH-4 Why do the hover-expanded and 1280 side cards line up as one tall page, with the Contract card missing a second row when there is no due date?

- Page / state: schedule / no-due-date
- Widths: 1280, 1024, 768, 1920 (theme: both)
- Gut reaction: the Contract card is a one-line card with an empty look; at 1280 it is 70 px tall under a 270 px chart band, then a worked-out card whose subtitle row "Pace needed for the due date" shows a bare "-".
- What is wrong: Contract is a 1150 px wide card holding one label and one select 1000 px apart; the card is shorter than every sibling and it does not change shape when Amount is hidden. The worked-out row "Pace needed for the due date" shows "-" while the others show 4:35, 1.5 h/day, so one value is a dash glyph in a mono column and looks like a missing number.
- Where: `schedule/ContractPanel.tsx:53-80`, `schedule/WorkedOut.tsx` (dash for no due date)
- Scanner: none
- Severity: polish
- Fix: say "Set a due date" in the row, and part of XSH-2's two-column layout
- Evidence: `S/schedule/no-due-date/w1280.png` (y 450-560 and 600-680 on the 1100 view), `S/crops/r3sh/m_dk_sch_desk_od_nd.png` (right half)
- Shared: page-local

### R3SH-5 Why does the first "Done" toggle have a border and a gap while the header cell above it is empty?

- Page / state: schedule / long-text
- Widths: 1440 (also 1280/1024/768/390 first row) (theme: both)
- Gut reaction: the leftmost column is a column of heavy outlined 36 px square buttons that look like checkboxes but each shows a faint circle-check, and nothing labels them.
- What is wrong: toggles are 36 x 36 with a 1 px border and an 18 px outline circle-check; on the long row it sits at mid-height of a 116 px row while the name starts at the top of its 5 lines (name block y 520-595, toggle y 540-575, header label "Milestone" is at x=228 and toggle at x=185-215: the toggle column is 45 px wide and has no header).
- Where: `schedule/MilestoneTable.tsx:59,70-76`
- Scanner: A5 (116/47)
- Severity: polish
- Fix: label the column "Done" visually or put the toggle inside the name cell (XSH-4's fix)
- Evidence: `S/crops/r3sh/z_tog1440.png`
- Shared: page-local
- Supersedes: complements XSH-4

### R3SH-7 Why is the 5-line milestone name row centre-aligned for everything except the name?

- Page / state: schedule / long-text
- Widths: 1440 (visible); 1280-390 (first lines only) (theme: both)
- Gut reaction: one row is 116 px tall; its Measures, Due and toggle sit in the middle, while the long name starts at the top and the Status and actions are at the top-right behind toasts, so the row has no common line.
- What is wrong: at 1440 the name block has lines at y 520, 540, 560, 575, 590; "Custom" and "Oct 2" at y 558 and the toggle at y 558, i.e. mid-row; the other rows (47 px) are single-line. The "WWWW" name has no `break-words` limit so it runs 460 px across and pushes Measures to x=712 in one row only.
- Where: `schedule/MilestoneTable.tsx:68-100` (`align-middle` cells, wrapped name)
- Scanner: A5 116/47
- Severity: polish (stress data; may be intended)
- Fix: top-align all cells of tall rows, or clamp the name to 2 lines with a title tooltip
- Evidence: `S/crops/r3sh/z_tbl1440.png`, `S/crops/r3sh/v/l_schedule_long-text_w1440.png`
- Shared: page-local

### R3SH-8 Why does the chart's y-axis note touch the axis labels?

- Page / state: schedule / every chart state
- Widths: 1280, 1024, 768 (theme: both)
- Gut reaction: "Recorded days not measured yet" starts at the "2h" label's right edge, so the line looks like "2h Recorded days not measured yet".
- What is wrong: note x starts 4 px right of the "2h" tick label (x 125 vs label end 114 at 1280) and runs on the 2h gridline (XSH-8 covers the strike-through; this is the label collision on the left). At 390 it spans across the dashed plan line.
- Where: `production/overview/ProgressChart.tsx:161`
- Scanner: none
- Severity: polish
- Fix: move the note inside the plot with 12 px inset and a halo
- Evidence: `S/crops/r3sh/v/l_schedule_on-pace_w1280.png` (x 100-270, y 285-300)
- Shared: ProgressChart

### R3SH-9 Why is "Done" in the milestone dialog in a different type style from the other labels, with the buttons on their own row?

- Page / state: schedule / milestone-dialog
- Widths: 1920, 1280, 1024, 768 (theme: both)
- Gut reaction: four muted field labels, then a body-colour "Done" tick beside a 16 px box, then Cancel / Add on the next row at the far right with nothing on their left.
- What is wrong: Name/Due/Measures/Note labels are muted 14 px; "Done" is darker body text; the checkbox row and the button row are two rows with the left half of the button row empty; at 1280 the dialog is 893 wide with the buttons 120 px under the checkbox.
- Where: `schedule/MilestoneDialog.tsx:240-262`
- Scanner: none
- Severity: polish
- Fix: put "Done" on the same row as the buttons (left) or make it a field
- Evidence: `S/crops/r3sh/v/l_schedule_milestone-dialog_w1280.png` (y 500-575)
- Shared: page-local

## Round 2: strict review

### XSH-1 Why are the Paid select and the Amount box not lined up?

- Page / state: schedule / on-pace, at-risk, overdue, long-text (Amount row exists whenever Paid is "Per finished hour"; no-due-date shows only the select)
- Widths: 1920, 1440, 1280, 1024, 768, 390 (theme: both)
- What is wrong: at 1440 the labels sit at x=1081, the select spans x 1234-1407 and the Amount box x 1172-1292 followed by "per finished hour" to x=1407, so the two controls start 62 px apart and nothing forms a control column; at 1280 and below the card is 1150 px wide and "Paid" (x=97) is about 980 px from its select (x=1075), with "Amount" on the next row 960 px from its box. The unit text under the select repeats the select's own value ("Per finished hour" twice, one above the other).
- Where: `schedule/ContractPanel.tsx:53-80` - each row is `flex items-center justify-between`, the `<dd>` is right-aligned, the input is `w-[7.5rem]!` plus a unit `<span>`, the select has its intrinsic width
- Severity: looks wrong
- Fix: two-column grid (`grid-cols-[8rem_1fr]`), both controls starting at the same x and the same width, unit text inside the second column; drop the repeated unit when the select already says it
- Evidence: `schedule/on-pace/w1440.png` (x 1065-1423, y 210-300), `.../on-pace/w1280.png` (y 590-680), `S/crops/xsh/contract1440.png`
- Shared: page-local (same `justify-between` rows family as Delivery)
- Supersedes: SCH-1

### XSH-2 Why do Contract and "How this is worked out" turn into two huge, empty-looking cards at 1280 and below?

- Page / state: schedule / every loaded state
- Widths: 1280, 1024, 768 (theme: both)
- What is wrong: at <=1280 each side card spans the full 1184/928/736 px: Contract holds three short rows with their values 900-1000 px from their labels, and the worked-out card has 9 label/value rows with the footnote on a single 1150 px line; the chart above is full width too, so the page is three full-width bands where at 1440 it is a 2/3 + 1/3 grid. At 1024 and 1280 there is room for the two cards side by side (about 450 px each at 1024).
- Where: `schedule/SchedulePage.tsx:226` - `min-[1281px]:grid-cols-[minmax(0,1fr)_22.5rem]` is the only breakpoint; the side column (`SchedulePage.tsx:240`) is a single flex column with no two-column step
- Severity: looks wrong
- Fix: at 769-1280 put Contract and "How this is worked out" in a two-column row under the chart (`md:grid-cols-2`), single column only below 768
- Evidence: `schedule/on-pace/w1280.png` (y 524-725 and 741+), `.../w1024.png`, `.../long-text/w1280.png` (worked-out card y 275-622)
- Shared: page-local

### XSH-3 Why do the table columns move from one state to the next?

- Page / state: schedule / on-pace, at-risk, overdue (one row), no-due-date, long-text, milestone-dialog (behind)
- Widths: 1920, 1440, 1024, 768 (theme: both)
- What is wrong: the same Final delivery row puts MEASURES at x=692 (on-pace 1440), 683 (no-due-date 1440), 933 (long-text 1440), 899 (on-pace 1920), 887 (no-due-date 1920), 1413 (long-text 1920) and DUE at 1051 / 1035 / 1077 / 1425 / 1401 / 1557, so Due and Status shift by 16-130 px when a state or a milestone name changes and at 1920 the Status text has 330 px of blank to its right with the actions column empty on the Final row.
- Where: `schedule/MilestoneTable.tsx:55-66` - an auto-layout table with only `min-w` on Milestone (10rem) and Measures (9rem, md+) and a `w-[9.5rem]` on Due; no widths on Measures, Status or Actions, so spare width is shared by content
- Severity: looks wrong
- Fix: give the table `table-fixed` with widths for Done (3rem), Measures (10rem), Due (10rem), Status (7rem), Actions (9rem) and let only Milestone flex
- Evidence: `schedule/on-pace/w1440.png` vs `.../no-due-date/w1440.png` vs `.../long-text/w1440.png` (header row y 862/785/654), `.../on-pace/w1920.png` vs `.../long-text/w1920.png` (y 862)
- Shared: `primitives/Table.tsx` auto layout; page-local widths
- Supersedes: SCH-6 (second half)

### XSH-4 Why does the table text start way to the right of the card title?

- Page / state: schedule / every state with the table
- Widths: 1920, 1440, 1280, 1024, 768 (theme: both)
- What is wrong: "Milestones" starts at x=249 (1440) while the MILESTONE header and every name start at x=292-299, a 43-50 px jump; the gap is an empty first column (the done toggle, header label hidden) that in the Final delivery row holds nothing at all, so that row has a 60 px blank at its left.
- Where: `schedule/MilestoneTable.tsx:59` - `TableHeader hiddenLabel="Done"` first column; `:108` the Final row's `<TableCell />`
- Severity: looks wrong
- Fix: put the done toggle in the Milestone cell (toggle then name), or let the first column be 36 px with no padding and start text at the title x
- Evidence: `schedule/no-due-date/w1440.png` (title x=249, MILESTONE x=292, y 740-830), `.../long-text/w1440.png` (toggle x 243-279, names x=299)
- Shared: flush `Table` inside `Panel` (the engine Tracks card has a smaller version, ENG-6)

### XSH-5 Why is the Milestones header taller than the Chart and Contract headers?

- Page / state: schedule / every loaded state
- Widths: 1920, 1440, 1280, 1024, 768, 390 (theme: both)
- What is wrong: the Chart and Contract card headers are 51 px (y 143-194 at 1440), Milestones is 59 px (y 786-845) because the 36 px "+" icon button forces extra height; so sibling card titles sit on different rhythms, and "Milestones" title is not centred on the button's row the same way.
- Where: `primitives/panelStyles.ts:9` (`min-h-[3.125rem] ... py-[0.6875rem]`) with the 36 px `IconButton` passed as `actions` at `schedule/SchedulePage.tsx:252`
- Severity: looks wrong
- Fix: make Panel header actions 32 px (small icon button) or fix the header to 50 px and centre the action
- Evidence: `schedule/on-pace/w1440.png` (y 143-194 vs 786-845), `.../no-due-date/w1440.png`
- Shared: `Panel` header (any card with a 36 px action: Production "Recording check" shows the same 8 px)

### XSH-6 Why is the dropdown a different height from the text boxes beside it?

- Page / state: schedule / Contract card (select y 210-251 = 41, input y 261-297 = 36); milestone-dialog (Name 36 + ring, Due 36, Measures 41, Note 80)
- Widths: all (theme: both)
- What is wrong: neighbouring controls in one card and one dialog have two heights, so the dialog's Name/Due/Measures stack reads as three different boxes; the Name box also looks bigger than Due because its focus ring is 2 px thick.
- Where: `primitives/Select.tsx:48` (`--control-height` 40.8) vs `primitives/TextField.tsx:13` (`h-9`, 36)
- Severity: looks wrong
- Fix: one control height token for TextField md, DateField and Select
- Evidence: `schedule/on-pace/w1440.png` (x 1172-1407, y 210-297), `.../milestone-dialog/w1440.png` (fields y 292-333, 376-412, 455-496)
- Shared: Select vs TextField vs DateField
- Supersedes: SCH-2

### XSH-7 Why is a four-field form a 1000 px wide dialog?

- Page / state: schedule / milestone-dialog
- Widths: 1920 (about 1340), 1440 (1006), 1280, 1024 (714); fine at 768 (536) and 390 (theme: both)
- What is wrong: Name, Due and Measures stretch 970 px for short values (a date box 970 px wide, with its calendar icon 900 px from its text) and Cancel/Add sit at the far right under 100 px of nothing; the Note box is 970 x 80.
- Where: `primitives/Dialog.tsx:149` (`max-w-[70vw]` for every non-full dialog); form `schedule/MilestoneDialog.tsx:195-263` adds no width
- Severity: looks wrong
- Fix: cap form dialogs at about 32-36 rem (a `size="form"` on Dialog)
- Evidence: `schedule/milestone-dialog/w1440.png` (x 217-1223), `.../w1024.png`
- Shared: `Dialog` (also XGL-1)
- Supersedes: SCH-6 (first half)

### XSH-8 Why does the grey note sit on top of the 2h line?

- Page / state: schedule / every state with the chart
- Widths: 1920, 1440, 1280, 1024, 768 (the line runs through the text); 390 (the text runs into the dashed plan line and, in at-risk, "done Oct 4 (est.)" sits on the red due line) (theme: both)
- What is wrong: "Recorded days not measured yet" is centred on the 2h gridline (text y=470, line y=473 at 1440), so the line strikes through the letters; at 390 it spans x 81-243 across the dashed line, and "done Oct 4 (est.)" at x 240-322 touches the due line at x=284.
- Where: `production/overview/ProgressChart.tsx:161` (`y={(PAD.top + y(0)) / 2}` lands on the middle gridline; fixed x `PAD.left + 8`, no halo)
- Severity: looks wrong
- Fix: put the note above the line or give it a surface-coloured stroke halo, and drop it when narrower than the text
- Evidence: `schedule/on-pace/w1440.png` (x 297-459, y 470), `.../at-risk/w390.png` (x 81-243 y 374; x 240-322 y 297)
- Shared: `ProgressChart` (also on Production)
- Supersedes: SCH-3

### XSH-9 Why does the loading placeholder not look like the page that arrives?

- Page / state: schedule / loading
- Widths: 1920 (placeholders x 232-1060 and 1076-1904 = 50/50; the page is 232-1527 and 1545-1903), 1440 (232-820 / 836-1424 vs 232-1047 / 1065-1423), 1024 and 768 (two columns where the page stacks), 390 (theme: both)
- What is wrong: the columns jump when the page arrives; blocks start at y=139 where the real cards start at y=143, the right column's two blocks (139-203, 219-283) stop 135 px short of the left block's bottom (418), and the placeholders have no card outline or header strip.
- Where: `schedule/ScheduleSkeleton.tsx:18` (`md:grid-cols-2`) against `schedule/SchedulePage.tsx:226`
- Severity: looks wrong
- Fix: reuse the page's grid classes, give the side column two blocks that sum to the chart height, and start at the same y
- Evidence: `schedule/loading/w1440.png`, `.../w1920.png`, `.../w768.png` against on-pace
- Shared: page-local
- Supersedes: SCH-4

### XSH-10 Why are three identical "Milestone added." toasts covering the table?

- Page / state: schedule / long-text
- Widths: 1920, 1440, 1280, 1024, 768, 390 (theme: both)
- What is wrong: three toasts with the same message stack over the Status chip and the row actions (at 1440 x 1213-1420, y 730-880; the actions in the first row are cut to slivers) and at 1280/1024/768/390 over the Add "+" button so only a sliver of it shows.
- Where: `primitives/Toast.tsx:88` (fixed bottom-right stack, no de-duplication); the fixture fires three adds. Why three appear is not pinned down.
- Severity: looks wrong
- Fix: collapse equal messages into one, and lift the stack off table actions
- Evidence: `schedule/long-text/w1440.png`, `.../w1280.png` (y 628-780), `.../w768.png` (y 853-1005)
- Shared: toast stack (global)
- Supersedes: SCH-5

### XSH-11 Why does the Final delivery row look like a different kind of row?

- Page / state: schedule / every state with the table
- Widths: 1920, 1440, 1280 (theme: both)
- What is wrong: in the Due column ordinary milestones are plain mono text ("Oct 2" at x=1325 at 1920) while the Final row is a bordered 132 px date box whose text starts 14 px further right; in the Measures column "Whole book" is 12 px muted but "Custom" is the 13-14 px body size; the Final row's name is the same bold as the others but its first cell is empty.
- Where: `schedule/MilestoneTable.tsx:112-116` (`TableCell muted`, `DueField`) against `:81-86`
- Severity: polish
- Fix: size muted cells like body cells here, and align the date box text to the plain date text (or draw milestone dates in the same box style, read-only)
- Evidence: `schedule/long-text/w1920.png` (y 975-1075), `S/crops/xsh/tbl1920.png`
- Shared: `TableCell muted` (12 px)

### XSH-12 Why are the three row icon buttons jammed together?

- Page / state: schedule / long-text, on any state with milestones
- Widths: 1280 (visible), 1440/1920 (mostly under toasts) (theme: both)
- What is wrong: note, edit and remove are three bordered 36 px squares with a 2 px gap (x 1141-1252 at 1280), so the red remove sits against edit like one segmented control; destructive next to routine with no space.
- Where: `schedule/MilestoneTable.tsx:91` (`inline-flex gap-0.5`)
- Severity: polish
- Fix: 8 px gap, or ghost (borderless) row buttons with a visible hover state
- Evidence: `schedule/long-text/w1280.png` (x 1141-1252, y 780-800), `S/crops/xsh/tbl1280.png`
- Shared: page-local; the same strip of 3 bordered icon buttons appears on Proof Preview rows (`global/toast/w1440.png` x 1254-1370)

### XSH-13 Why is the verdict a tiny sentence in a pill, floating 4 px above the title?

- Page / state: schedule / on-pace, at-risk, overdue, no-due-date
- Widths: 1920, 1440, 1280, 1024, 768 (right edge of the page, top-aligned); 390 (the pill drops onto its own row) (theme: both)
- What is wrong: the pill's text is about 10.5 px condensed, holding a whole sentence ("Behind · done Oct 4, due Sep 29 · needs 3.8 h/day"), and its vertical centre is y=79 against the title's y=83; the due-date line ("Due Sep 29 · 3 days left") it concerns sits under the title 1000 px away on the left. In no-due-date the pill says "No due date set", the same sentence as the subtitle directly under the title, in a flat grey pill with no icon unlike the other verdicts.
- Where: `schedule/SchedulePage.tsx:212-224` (`items-start`, `flex-1` spacer then `VerdictPill`); `schedule/VerdictPill.tsx` + `primitives/HeaderChip.tsx:21` (`text-[0.72rem]`)
- Severity: polish
- Fix: align the pill to the title's centre, bring the verdict next to the due line, enlarge its text, and drop the duplicate when no date is set
- Evidence: `schedule/at-risk/w1440.png` (pill y 68-90, title y 83), `.../no-due-date/w1440.png` (x 1332-1424), `S/crops/xsh/head1440.png`
- Shared: page-local pill

### XSH-14 Why is "Oct 4" in a different font from the other figures?

- Page / state: schedule / "How this is worked out" (all loaded states)
- Widths: all (theme: both)
- What is wrong: the right-hand column is monospace (4:35, 1.5 h/day) until the last row, "Oct 4", which is bold proportional text, so the column's numerals do not line up in character width and its right end sits differently.
- Where: `schedule/WorkedOut.tsx:131-133` (`<dd className="font-semibold">` without `font-mono`)
- Severity: polish
- Fix: use the same face as the other values (or make the dates mono)
- Evidence: `schedule/on-pace/w1440.png` (x 1370-1407, y 651)
- Shared: page-local

### XSH-15 Why does the Schedule title jump into the middle of a card when there is no manuscript?

- Page / state: schedule / no-manuscript
- Widths: 1440, 1024, 768, 390 (theme: both)
- What is wrong: every other state has the page title at x=232 (left, above the content); here "Schedule" is centred at y=148 inside a 242 px card and the page's top row is gone, while the rail still highlights Schedule as the current page and also draws its lock.
- Where: `layout/NeedManuscript.tsx` (page-level empty state)
- Severity: polish
- Fix: keep the page title row and put the call to action under it
- Evidence: `schedule/no-manuscript/w1440.png` (card y 69-310; rail row Schedule y 106-146 with lock), `.../w390.png`
- Shared: the NeedManuscript empty state on every gated page

### XSH-16 Why does the chart have a dead band on top and an uneven frame?

- Page / state: schedule / every chart state (may be intended)
- Widths: 1440, 1920 (theme: both)
- What is wrong: the plot's right gridline end is at x=1019 while the card's content edge is x=1031, but the left axis labels start 21 px in; there is a 31 px empty band between the card header (y=194) and the due-line top (y=225), and "due Oct 14" sits left of its line while "done Oct 4 (est.)" floats above its own.
- Where: `production/overview/ProgressChart.tsx` (`PAD`)
- Severity: polish
- Fix: equalise the left and right plot padding and trim the top
- Evidence: `schedule/on-pace/w1440.png` (x 270-1031, y 194-225)
- Shared: ProgressChart

### XSH-17 Why does the Milestones card look empty when only the Final row exists?

- Page / state: schedule / on-pace, at-risk, overdue, no-due-date
- Widths: 1920, 1440 (theme: both)
- What is wrong: a card with a title, a "+" and a header row holds one row; nothing says that the other rows are "none yet", and the "+" is the only way to add one, a 36 px icon far from the table.
- Where: `schedule/MilestoneTable.tsx:107-121`, `schedule/SchedulePage.tsx:252`
- Severity: polish
- Fix: a one-line empty hint ("No other milestones yet. Add one") above the Final row
- Evidence: `schedule/on-pace/w1920.png` (y 786-928)
- Shared: page-local

### XSH-18 Why does the no-due-date chart look broken?

- Page / state: schedule / no-due-date (may be intended)
- Widths: 1920, 1440, 1024, 768, 390 (theme: both)
- What is wrong: with no plan line the forecast is a near-vertical dotted stroke from "today" at 0h to "done Oct 4" at 3h and three quarters of the plot is empty, so the chart reads as a glitch; the 2h note sits in the empty part.
- Where: `production/overview/ProgressChart.tsx` (no plan series when `due` is null)
- Severity: polish
- Fix: widen the x range or label the empty state ("Set a due date to see a plan line")
- Evidence: `schedule/no-due-date/w1440.png` (x 289-1019, y 300-650)
- Shared: ProgressChart
