# Pickups: alignment findings

Part of the [alignment audit](../../alignment-audit.md). Findings are grouped by the round that produced them; a later round's finding that replaces an earlier one says `Supersedes`. Evidence paths are `<page>/<state>/<width>.png` of the light capture, `dark:<page>/<state>/<viewport>.png` for dark, `tall:<page>-w<width>.png` for the below-the-fold captures; the images are not committed (regenerate the repo-viewport ones with `pnpm --dir src/studio/ui visual:page <page>`).

## Round 4: gap fill

### R4TB-7 Pickups and Delivery content stops at 60% of the window, and the Settings category card stops at 40%

- Page / state: pickups / default; delivery / default; settings / default (stacked widths excluded)
- Widths: 1280, 1440, 1920 (theme: both)
- What is wrong: "why does the page end halfway down the window?" At 1440 Pickups paints to y=461 of 1000 and Delivery to y=847; at 1920 Pickups ends at y=365, so more than two thirds of the window is empty grey beside an icon rail that runs full height. Not a defect in the content itself, but there is no visual end to the page (no footer line, no empty-state hint) and on Pickups the 3-row table and the 3-line session card are each their own island: table card 510 px wide beside a 225 px card, neither reaching a common bottom.
- Where: `src/studio/ui/src/components/pickups/PickupsPage.tsx` grid (`items-start`), same as XPK-6
- Severity: polish
- Fix: let the Pickups table card fill the row height or give the page a bottom anchor; extends XPK-6 (that finding measured the different heights, this one is the empty page below them).
- Evidence: `S/tall/pickups-w1440.png` y 0-1000 (content to y~461), `S/tall/pickups-w1920.png`
- Shared: page-local

## Round 3: coverage gaps and scanner cross-check

### R3PK-1 The table's text starts 7 px left of the card title

- Page / state: pickups / list, add-popover, marked-recorded, session-left-out
- Widths: w1920, w1280, w1024, w768, d1024, d768 (theme: both)
- What is wrong: "why is the checkbox and the 'Chapter 3' band further left than the 'Pickups' title?" The title and the header toolbar start at x=249 (1920), the checkboxes at x=243 and the group band text "Chapter 3 A Caucus-Race..." at x=243; the TIME header at 287, so the table's first text edge is 6-7 px outside the card's own text edge (Proof's XPF-22, same cause).
- Where: `components/pickups/list/PickupsTable.tsx:272,303` - flush `Table` in a padded `Panel`; header uses `px-4`, table cells `px-2.5`
- Severity: looks wrong
- Fix: cell padding that equals the panel's 16 px, or hang the header title with the same 10 px inset.
- Evidence: `pickups/list/w1920.png` x=233-260, y=69-300
- Shared: `Table` primitive with Proof
- Scanner: G2 `table.border-collapse("Pickups")` text x 90 vs title 97

### R3PK-2 Three toasts say the same long sentence and sit on the session card

- Page / state: pickups / empty
- Widths: w1920, w1280, d1024, d768 (theme: both)
- What is wrong: "why three identical boxes?" Each removal posts its own 450 px toast, "Removed 02:11.0 from pickups. A line from a check or a note stays off the list, so there is no Undo.", so the explanation appears three times (y=875-1060 at 1920); in dark the toasts are bright cream blocks on the dark page and at d1024 the stack (x=556-1004, y=562-748) overlaps the bottom of the session card (the line "There are no pickups to include yet." is at y=546, directly above the top toast). XPK-11 has the same stack covering at 390 and 1024.
- Where: `components/primitives/Toast.tsx:88` (stack `max-w-28rem`) and the pickups list-change message in `components/pickups/pickupListChanged.ts`
- Severity: looks wrong
- Fix: merge toasts of one kind into one ("Removed 3 lines from pickups") and say the no-Undo sentence once.
- Evidence: `pickups/empty/w1920.png` x=1452-1900, y=875-1060; `dark:pickups/empty/small-desktop.png` x=556-1004, y=562-748
- Shared: `Toast`

### R3PK-3 The disabled "Open 0 in Booth" button's label is almost invisible

- Page / state: pickups / scoped, empty, loading, unreadable
- Widths: all (theme: both, worst in dark)
- What is wrong: "is that a button or a stripe?" A 326x36 pale terracotta bar with white 11 px letters (light) or a muddy brown bar with dark letters (dark, 1024 y=458) whose contrast is under 2:1; the flag button under it is greyed to the same level. It also shows during loading as "Open 0 in Booth" though nothing has loaded.
- Where: `components/pickups/list/SessionPanel.tsx:107-111` - `aria-disabled` styled by lowering opacity of the primary colours
- Severity: polish
- Fix: a disabled style that keeps text contrast (outlined or neutral fill) and hide the count while loading.
- Evidence: `pickups/scoped/w1920.png` x=1561-1887, y=216-252; `dark:pickups/scoped/small-desktop.png` y=365-400
- Shared: `Button` disabled state

### R3PK-4 The chapter is written three ways

- Page / state: pickups / scoped, add-popover vs proof chapter picker
- Widths: w1920, w1280, d1024 (theme: both)
- What is wrong: "why is it 'Chapter 1 - Down...' there and 'Chapter 1 Down...' here?" The Pickups chapter picker reads "CHAPTER 1 DOWN THE RABBIT-HOLE" and the add popover caption "Chapter 1 Down the Rabbit-Hole" (no dash), the Proof picker "CHAPTER 1 - DOWN THE RABBIT-HOLE" and Proof's table band "Chapter 1 · 4 open". XPK-12 covers the band only.
- Where: `components/chapterName.ts`/`chapterHeading.ts` used differently by `components/pickups/list/AddPickup.tsx` and `PickupsTable.tsx:383`
- Severity: polish
- Fix: one chapter label function with the dash.
- Evidence: `pickups/scoped/w1920.png` x=384-637, y=80-116; `pickups/add-popover/w1920.png` x=1192-1400, y=148-162
- Shared: shared formatting

### R3PK-5 The add popover writes into "Chapter 1" while the page says All chapters, and that is not a control

- Page / state: pickups / add-popover
- Widths: w1920, w1280, w1024, d1024, d768 (theme: both)
- What is wrong: "where is this going?" The list shows chapter 3 and the picker says ALL CHAPTERS, the popover caption says "Chapter 1 Down the Rabbit-Hole" in grey body text with no chevron, so it reads as a heading yet is the target; the time field is pre-filled "05:12.0" for a note that does not exist and takes the focus ring while the text fields have no helper.
- Where: `components/pickups/list/AddPickup.tsx` (chapter caption is static text)
- Severity: polish
- Fix: a small chapter select in the popover (defaulting to the current chapter).
- Evidence: `pickups/add-popover/w1024.png` x=656-991, y=129-382
- Shared: page-local

### R3PK-6 A widow ("yet.") ends the unreadable session note

- Page / state: pickups / unreadable
- Widths: w1920, w1280 (theme: both)
- What is wrong: "why is one word on its own line?" "The list could not be read, so the session is not known / yet." leaves the single word "yet." on line 2 in a 326 px column (y=341 at 1920).
- Where: `components/pickups/list/SessionPanel.tsx` note under the flag button
- Severity: polish
- Fix: `text-wrap: balance`, or shorten to "The list could not be read."
- Evidence: `pickups/unreadable/w1920.png` x=1561-1880, y=313-350
- Shared: page-local

### R3PK-7 A left-out line looks exactly like an included one

- Page / state: pickups / session-left-out, marked-recorded
- Widths: w1920, w1280, d1024 (theme: both) (may be intended)
- What is wrong: "I unchecked it and nothing else changed." Row 1 is unticked and the count drops to 2, but its text, chip, buttons and status keep full weight (marked-recorded dims only the checkbox); the strip of 4 buttons stays live on a line the session will skip.
- Where: `components/pickups/list/PickupsTable.tsx:303,300` - only the checkbox reads `included`
- Severity: polish
- Fix: mute the line text and Time when `included` is false.
- Evidence: `pickups/session-left-out/w1920.png` y=204-262
- Shared: page-local

## Round 2: strict review

### XPK-1 In tall rows the checkbox, time, type and buttons float in the middle of the paragraph

- Page / state: pickups / list, add-popover, marked-recorded, scoped(n/a), session-left-out
- Widths: w768-w1440 (theme: both)
- What is wrong: "why is the checkbox next to the middle of line 3 and not the top?" Row 1's line is six lines tall (y=204-358) and every other cell is vertically centred on it: checkbox at y=281, time at 281, MISREAD chip at 281, the four buttons at y=263-299, while the text starts at y=221. Rows 2 and 3 are one line so the cells line up with the text, so the same column changes alignment between rows.
- Where: `components/pickups/list/PickupsTable.tsx:300-345` (`TableCell` default vertical-align middle)
- Severity: looks wrong
- Fix: `align-top` with a 1-line offset on controls so they sit on the first text line.
- Evidence: `pickups/list/w1440.png` (x=243-1037, y=204-358), `S/crops/xpf/p1.png`
- Shared: Table cells (also proof notes)
- Supersedes: none

### XPK-2 "Speech / . 0.97" wraps with a leading dot even at 1920

- Page / state: pickups / list, add-popover, marked-recorded, session-left-out
- Widths: w1024, w1280, w1440, w1920 (theme: both)
- What is wrong: "why does the second line start with a dot?" The From column is sized to the word "Speech" so "Speech - 0.97" breaks to "Speech / . 0.97"; at 1920, with a 735px line column and 40px spare, row 2 is 57px tall only because of this wrap. Row 3 ("Audio") does not wrap, so rows are unequal.
- Where: `components/pickups/list/PickupsTable.tsx:322-324` (`sourceLabel(pickup)` plain text in an auto column)
- Severity: looks wrong
- Fix: render source and score as two spans (name, then muted score on its own line) or `whitespace-nowrap`.
- Evidence: `S/crops/xpf/p2.png`, `pickups/list/w1920.png` (x=1218-1270, y=215-310)
- Shared: page-local

### XPK-3 Table columns move between states and leave widow words

- Page / state: pickups / list vs marked-recorded vs session-left-out
- Widths: w768, w1024, w1440 (theme: both)
- What is wrong: "why did the columns shift when I marked one recorded?" From starts x=751 in list and x=726 in marked-recorded (w1440); Status x=816 vs 791; at 768 From x=456 vs 434. The line column narrows by 25px so "...as if she had known them all her life." breaks to "life." alone on a second line and the row goes 57 to 59px. The Recorded pill is a differently shaped block (pill plus "Not in the DAW yet", 3 lines) than the Open pill centred in the row.
- Where: `components/pickups/list/PickupsTable.tsx:272-293` (auto layout, no colgroup), `:326-332` (status cell)
- Severity: looks wrong
- Fix: fixed column widths, status cell with one-line note.
- Evidence: `pickups/marked-recorded/w1440.png` (x=726-860, y=140-310) vs `.../list/w1440.png` (x=751-860)
- Shared: Table
- Supersedes: none

### XPK-4 Session card: a flag button alone under the main button, and a stretched card under 1180px

- Page / state: pickups / list, add-popover, marked-recorded, scoped, session-left-out, empty, loading, unreadable
- Widths: w1280/w1440/w1920 (lone button); w768-w1024 (stretched) (theme: both)
- What is wrong: "why is that flag sitting on its own under the button?" At 1440 the flag IconButton (x=1081-1117, y=264-300) hangs alone under the 326px "Open 3 in Booth" button with the rest of the row empty and no label. At 1024 and 768 the same card is 894px / 702px wide: a 36px button 894px wide and "About ... not measured yet" with its value 880px from its label. At 1440 the Pickups card ends at y=472 against 316.
- Where: `components/pickups/list/SessionPanel.tsx:106-122` (IconButton in a bare div), `:94-96`
- Severity: looks wrong
- Fix: flag button beside the Booth button (grid `1fr auto`), and cap the session card width below 1180px.
- Evidence: `S/crops/xpf/p3.png`, `pickups/list/w1024.png` (x=97-991, y=590-674)
- Shared: page-local
- Supersedes: PKP-6

### XPK-5 Pickups table at 390: columns cut off, words broken mid-word

- Page / state: pickups / list, add-popover, marked-recorded, scoped(n/a), session-left-out
- Widths: w390 (theme: light)
- What is wrong: "why is the table cut off and 'uncomfortabl/e' broken?" The table keeps 640px inside the 326px card; From, Status and every button are off screen, only a faint edge shadow at x=370 hints at it; the Line column is about 120px wide so row 1 is 500px tall (marked-recorded shows "uncomfortabl" / "e"); the header "LINE TO RE-RECORD" wraps to two lines.
- Where: `components/pickups/list/PickupsTable.tsx:271-272` (`scroll-x-edges overflow-auto`, `min-w-[40rem]`)
- Severity: looks wrong
- Fix: below 600px stack each pickup as a card (time, type, text, then the action row).
- Evidence: `pickups/marked-recorded/w390.png` (y=250-740), `.../list/w390.png`
- Shared: Table min-width pattern (same cause as XPF-12)
- Supersedes: PKP-1

### XPK-6 The Pickups card is shorter or taller than its session neighbour in five states

- Page / state: pickups / scoped, empty, unreadable, loading (also marked-recorded)
- Widths: w1280-w1920 (theme: both)
- What is wrong: "why are the two cards different heights?" scoped: left ends y=200, right y=348; empty: 276 vs 348; unreadable: 276 vs 367; loading: 328 vs 316 (the right card is shorter). The session card also grows with the helper text, so its height changes between states.
- Where: `components/pickups/PickupsPage.tsx` grid and `SessionPanel.tsx:124-132` (variable helper text)
- Severity: looks wrong
- Fix: `items-stretch` with equal-height cards or a fixed-height session card.
- Evidence: `pickups/unreadable/w1440.png` (y=130-370), `.../scoped/w1440.png`
- Shared: page-local

### XPK-7 Chapter picker changes width and glues its arrow to the label

- Page / state: pickups / loading, unreadable vs list; proof every state with the stepper
- Widths: w1024, w1440, w1920 (theme: both)
- What is wrong: "why does the chapter picker shrink while loading?" The trigger is 123px wide (x=384-507) in loading and unreadable and 253px (x=384-636) in list; the previous/next arrows and the right icons shift with it. In the wide state the label "ALL CHAPTERS v" is centred (x=462-558) with 80px of empty box either side, like a text field. In scoped the trigger shows "CHAPTER 1 DOWN THE RABBIT-HOLE" without the dash used on Proof.
- Where: `components/primitives/ChapterStepper.tsx:66-71` (`min-w-[min(var(--chapter-ch),21.25rem)]` depends on data; caret inside the label string)
- Severity: looks wrong
- Fix: fixed minimum width for the trigger and a separate caret element at the right edge; use the shared chapter-name formatter.
- Evidence: `pickups/loading/w1440.png` (x=384-507) vs `.../list/w1440.png` (x=384-636), `proof/default/w1440.png` (y=103)
- Shared: ChapterStepper (also Editing, Booth)
- Supersedes: PKP-2 and PKP-3

### XPK-9 Add popover covers the table header, has no heading and spills past the card at 390

- Page / state: pickups / add-popover
- Widths: w768, w1440, w390 (theme: both)
- What is wrong: "what is this box sitting on top of my table?" The popover (x=696-1030, y=129-382 at 1440) sits flush under the card header so it hides the From and Status headers and rows 1 and 2; its first line "Chapter 1 Down the Rabbit-Hole" (no dash, and chapter 1 while the list is chapter 3) has the same grey and size as the two field labels, so there is no title and no hierarchy; there is no cancel or close button; at 390 its right edge is x=381 against the card edge x=375 and its left x=47 is 14px off the card text. The time field has a blue focus ring where the page uses orange.
- Where: `components/pickups/list/AddPickup.tsx:52-58` (`min-w-[18rem]`, heading as a muted span)
- Severity: looks wrong
- Fix: a semibold title with a close button, 8px gap below the trigger, width clamped to the card.
- Evidence: `S/crops/xpf/q1.png`, `pickups/add-popover/w390.png`
- Shared: Popover primitive
- Supersedes: none

### XPK-10 Empty state shows a lone, unlabelled arrow button

- Page / state: pickups / empty
- Widths: w390-w1440 (theme: both)
- What is wrong: "what does this arrow do?" Under "Mark a proof note 'Needs pickup' and it appears here" a bare 36px arrow icon button sits centred at x=622-658, y=216-252 with no label; the three stacked toasts below say "Removed ... so there is no Undo".
- Where: `components/pickups/list/PickupsTable.tsx:361-366`
- Severity: looks wrong
- Fix: a labelled "Go to Proof" button.
- Evidence: `pickups/empty/w1440.png` (y=130-280)
- Shared: page-local

### XPK-11 Three toasts sit on top of the session card at 390 and 1024

- Page / state: pickups / empty
- Widths: w390, w768, w1024 (theme: both)
- What is wrong: "why is a stack of notices covering the flag button?" At 390 three 90px toasts (y=575-820) hide the flag button and "There are no pickups..." line; at 1024 the first toast overlaps the card's bottom 11px; each toast repeats the same sentence with a different time.
- Where: toast host and the empty-state removal toasts (`components/pickups/list/...` removal path)
- Severity: looks wrong
- Fix: collapse repeated toasts into one ("Removed 3 lines").
- Evidence: `pickups/empty/w390.png` (y=555-820), `.../w1024.png`
- Shared: Toast host

### XPK-8 Toolbar buttons drop under the title at 390, and the stepper wraps differently by state

- Page / state: pickups / every state
- Widths: w390 (theme: light)
- What is wrong: "why are the two icons on their own line at the far left?" The ear and "+" buttons wrap to a second row at x=33-113 (y=125-160) with blank space to their right; in scoped and empty-ish states the whole stepper also moves under the title ("Pickups" then stepper row) while in list it stays beside the title.
- Where: `components/pickups/list/PickupsTable.tsx:213-218` (`flex-wrap justify-between`, no `ml-auto` on the buttons)
- Severity: polish (390 only)
- Fix: `ml-auto` on the button group and a fixed wrap order.
- Evidence: `pickups/list/w390.png`, `.../scoped/w390.png` (stepper at y=135)
- Shared: PANEL_HEADER_CLASS
- Supersedes: PKP-4

### XPK-12 Group band reads "Chapter 3 A Caucus-Race..." and "3  open" in a different font

- Page / state: pickups / every list state
- Widths: all (theme: both)
- What is wrong: "why is there no dash after Chapter 3?" The band shows "Chapter 3 A Caucus-Race and a Long Tale - 3  open" with no dash (Proof writes "Chapter 1 - Down the Rabbit-Hole") and the count is set in the mono face with a double space.
- Where: `components/pickups/list/PickupsTable.tsx:383` (`<b>{name}</b>`, MONO count) and chapter-name formatter
- Severity: polish
- Fix: shared chapter-name formatter and one font.
- Evidence: `S/crops/xpf/p1.png` (band at y=230)
- Shared: chapterName
- Supersedes: PKP-5 (a)

### XPK-13 Last row's border pokes into the card's rounded corners

- Page / state: pickups / list and every state with rows
- Widths: all (theme: both)
- What is wrong: "why is the bottom edge a heavier square line?" The bottom border of the last row doubles the card border and meets the rounded bottom corners square (x=233, y=472).
- Where: `components/pickups/list/PickupsTable.tsx:212,271` (frame without overflow clip)
- Severity: polish
- Fix: `overflow-hidden` on the frame.
- Evidence: `S/crops/xpf/p2.png` (bottom edge)
- Shared: Table-in-card pattern
- Supersedes: PKP-5 (b)

### XPK-14 Session values are bold monospace sentences

- Page / state: pickups / every state
- Widths: all (theme: both)
- What is wrong: "why does 'not measured yet' shout like a number?" The count and the phrases "not measured yet" and "not known" use the same bold mono as numbers, so the status text is as heavy as the value it describes; "About" does not say what is measured (minutes) and in empty state reads "About: not measured yet" for zero lines.
- Where: `components/pickups/list/SessionPanel.tsx:96-104` (`<b className="font-['IBM_Plex_Mono'...]">`)
- Severity: polish
- Fix: mono only for numbers, muted regular for status text, label it "Length".
- Evidence: `S/crops/xpf/p3.png`
- Shared: page-local

### XPK-15 Skeleton does not match the table, and toolbar buttons stay live while loading or unreadable

- Page / state: pickups / loading, unreadable, no-manuscript
- Widths: all (theme: both)
- What is wrong: "the loading rows are a different shape from the table." Four 36px skeleton bars are inset 16px inside the card (x=249-1031) while the table is flush; the session card shows "OPEN 0 IN BOOTH" while loading; "+" and the hearing button are fully live while the list is loading or unreadable; the left card ends at y=328 against the session card's 316.
- Where: `components/pickups/list/PickupsTable.tsx:257-259`
- Severity: polish
- Fix: skeleton rows with the table's cell layout, disable toolbar buttons and hide the count while loading.
- Evidence: `pickups/loading/w1440.png`
- Shared: page-local

### XPK-16 Delete sits 4px from "Mark recorded", all four buttons are unlabelled

- Page / state: pickups / list, marked-recorded, session-left-out
- Widths: all (theme: both)
- What is wrong: "I could hit delete by accident." Play, Booth, Done and a red Delete share a 160px strip with 4px gaps; none has a label and the check icon changes to a filled check for the done state (marked-recorded, x=962-996).
- Where: `components/pickups/list/PickupsTable.tsx:333-352` (`gap-1`, no separation of the destructive action)
- Severity: polish
- Fix: more gap or a divider before Delete, or move Delete to the row's context menu.
- Evidence: `S/crops/xpf/p2.png` (right side)
- Shared: IconButton row pattern

### XPK-17 A "LEFT OUT" type chip and a "left out of the session" checkbox use the same words

- Page / state: pickups / list, session-left-out
- Widths: w1440 (theme: both)
- What is wrong: "does LEFT OUT mean unchecked?" Row 2 has a red LEFT OUT chip (a script line the narrator skipped) while the session-left-out state means an unchecked row; in that state the unchecked row 1 is not visually distinct (no dimming) and has a MISREAD chip.
- Where: `components/pickups/list/PickupsTable.tsx:311-313` (`PickupType`)
- Severity: polish (may be intended)
- Fix: rename the type chip ("Skipped") or dim unchecked rows.
- Evidence: `pickups/session-left-out/w1440.png` (y=204-420)
- Shared: page-local

### XPK-18 The right column is 358px on Pickups and 380px on Proof

- Page / state: pickups / list vs proof / default
- Widths: w1280-w1920 (theme: both)
- What is wrong: "why does the side card start at a different place when I switch pages?" Pickups' session card is x=1065-1423 (358px) and Proof's inspector x=1045-1423 (380px) at 1440, so the main card edges are 1047 vs 1027.
- Where: `components/pickups/PickupsPage.tsx` grid column vs `components/proof/ProofPage.tsx:431` (`380px`)
- Severity: polish
- Fix: one shared side-column width.
- Evidence: `pickups/list/w1440.png` vs `proof/default/w1440.png`
- Shared: page grid convention

### XPK-19 Dark: cards nearly vanish into the page on Pickups too

- Page / state: pickups / all states
- Widths: w1440 (theme: dark)
- What is wrong: "I can barely see the card edges." Same fill/border issue as XPF-28 on the table frame (x=233-1047) and session card; zero or error states look like text on the page.
- Where: dark tokens in `styles.css`
- Severity: polish
- Fix: wider surface step.
- Evidence: `dark:pickups/unreadable/desktop.png`
- Shared: dark tokens
