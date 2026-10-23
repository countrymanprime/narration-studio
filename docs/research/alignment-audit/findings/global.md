# Cross-page: alignment findings

Part of the [alignment audit](../../alignment-audit.md). Findings are grouped by the round that produced them; a later round's finding that replaces an earlier one says `Supersedes`. Evidence paths are `<page>/<state>/<width>.png` of the light capture, `dark:<page>/<state>/<viewport>.png` for dark, `tall:<page>-w<width>.png` for the below-the-fold captures; the images are not committed (regenerate the repo-viewport ones with `pnpm --dir apps/ui visual:page <page>`).

## Round 4: gap fill

### R4TA-11 Story Bible: in the default read state, Personality notes, Reference clips and Dialogue cues are live form controls among plain text

- Page / state: story-bible default (entry selected, not editing)
- Widths: all (1920, 1440, 1280, 1024, 768, 390)
- Gut reaction: I have not pressed Edit, so why is half the page boxes and inputs and half of it flat text?
- What is wrong: Description, How they talk, Properties and Relationships are flat text in read mode, but "Personality notes" is a bordered, bold-weight editable textarea (its text is heavier than the Description above it), "Reference clips" shows a region select, a text input and a disabled "Approve as reference" button, and "Dialogue cues" shows a select. The column alternates between "reading" and "form" rows with no divider between modes, and the textarea's bold value reads as a different type style from every other value.
- Where: `components/storybible/GuideDetail.tsx:899-912` (`Field textarea` is drawn regardless of `editing`; `disabled` is only `editingDisabled`); reference and cue sections at `:909-911`
- Severity: looks wrong
- Fix: draw Personality notes as flat text in read mode like Description; group the two always-live forms (Reference clips, Dialogue cues) under one "Voice" heading or behind an "Add reference" button.
- Evidence: `crops/r4ta/b1440-a.png` (y=590-690), `b1440-b.png`, `b768-b.png`
- Shared: page-local (GuideDetail); `Field` primitive

### R4TA-12 Story Bible list header: three icon-only buttons (wand, file-import, plus) with no words beside a 335 px title row

- Page / state: story-bible default
- Widths: 1920, 1440, 1280, 1024, 768, 390
- Gut reaction: what does the wand button do, and the one with a page and an arrow?
- What is wrong: the card header shows "Story Bible" then three 36 px glyph buttons (scan wand, import page-arrow, plus); none has visible text, and only the plus is sensibly guessable. The wand and the import button are not distinguishable by glyph, and there is spare room (title uses 110 of 335 px) for a word. At 768 and 390 where the card is wide the buttons still show only glyphs.
- Where: `components/storybible/Guide.tsx:354-362` (`actions`: `ScanButton`, `ImportButton`, `IconButton label="Add entity"`)
- Severity: looks wrong
- Fix: label the two non-obvious ones ("Scan", "Import") at widths that have room, or merge scan and import into one "Add from manuscript" menu.
- Evidence: `crops/r4ta/b1440-c.png`, `b768-a.png`
- Shared: page-local (also an app-wide icon-only pattern)

### R4SM-16 Why in dark do the empty "-" stage chips and the pinned-project pin almost disappear?

- Page / state: global/theme-dark 1920 (Production pipeline); project/picker-pinned dark 1024
- Widths: 1920, 1024 (theme: dark)
- Gut reaction: a grid of faint smudges; and the one thing that says "this project is pinned" is a dark-brown pin on a near-black button.
- What is wrong: empty chips (#2a2722 on #1e1b17) and the row hairlines are about 1.2:1; the pinned toggle is an orange outline around a dark fill with a dark-brown glyph (about 2:1) while the unpinned one has a light glyph, so pinned is less visible than unpinned.
- Where: `primitives/StatusChip` neutral tone (dark token), `project/ProjectPicker` pin toggle
- Severity: polish
- Fix: lift the neutral chip fill one step and give the pinned glyph the accent colour
- Evidence: `S/crops/r4sm/td1920_z.png`, `dpp1024.png`
- Shared: neutral chip token, picker pin toggle

### R4SM-17 Why does the "Delete entry" confirm have two equally weighted outline buttons, 560 px apart, and in dark no visible dimming behind it?

- Page / state: global/confirm-dialog
- Widths: 1024 (theme: both; dimming dark only, may be capture timing)
- Gut reaction: I cannot tell which button is the safe one, and in dark the dialog looks like a hole in the page.
- What is wrong: Cancel (black outline) and Delete entry (red outline) are the same size and weight with nothing between them; in the dark capture the dialog is as dark as the page and the backdrop leaves the page's orange Save button and pills at full brightness (in the dark zoom-menu capture at 768 the page is dimmed, so this may be a capture taken during the fade).
- Where: `primitives/Dialog.tsx:142` (`bg-[var(--backdrop)]`), the destructive button style
- Severity: polish
- Fix: fill the destructive button (or fill Cancel as the default) and keep the pair together at the right
- Evidence: `S/crops/r4sm/dcd1024.png`, `lcd1024.png`
- Shared: Dialog, confirm footer
- Extends: XGL-1

### R4SM-18 Why does Settings (seen through global/theme-light) use a different meta-line layout in each setting card?

- Page / state: global/theme-light at 1280 (Settings > Appearance & keys)
- Widths: 1280 (theme: light; settings slice)
- Gut reaction: in Theme and Motion "This computer" and "Used by ..." are separate lines; in Reader text they are one run "This computer   Used by Script Booth   Also set in Script > Text settings".
- What is wrong: the same meta data takes 2, 2 or 1 lines; the search field (40 px, y 47-73) and the All/Changed/In this project segmented control (about 36 px, y 50-73) have different heights and top edges; the sidebar "Set on a page" row carries a blue "8" pill with no analogue elsewhere.
- Where: `settings/` setting row meta component (cause not located)
- Severity: polish
- Fix: one meta row (scope chip, then used-by) for every card
- Evidence: `S/crops/r4sm/tl1280.png`
- Shared: settings row

### R4TA-13 Story Bible list: the selected-row highlight overshoots the filter block by 8 px on both sides

- Page / state: story-bible default
- Widths: 1440, 768, 390 (all)
- Gut reaction: the peach bar sticks out past the search box and chips above it.
- What is wrong: filter input and chips start at x=33 (768), the selected row's highlight starts at x=25 and ends at x=743 against the filter's right edge of 735, while the row title sits at x=35 (2 px right of the filter's text and 10 px inside the highlight). Three left edges (25 / 33 / 35) and two right edges in one column; the unselected rows' text shares x=35 with the title, so only the highlight breaks the grid. (SBX-17 compares suggestion rows with entry rows, not this.)
- Where: `components/storybible/Guide.tsx:458` (`<ul ... gap-0.5 p-0>` inside a `p-2` scroller) versus the filter block's `px-4`
- Severity: polish
- Fix: give the list scroller `px-4` (or the filter block `px-2` plus row `px-2`) so the highlight and the controls share an edge.
- Evidence: `crops/r4ta/b768-a.png` (Alice row, y=318-378)
- Shared: page-local

### R4TA-14 Story Bible at 390: the section caption wraps with an orphan "each" beside its refresh button

- Page / state: story-bible default
- Widths: 390
- Gut reaction: "Names the app links in the text, and how I say / each" and a button squeezed into the corner.
- What is wrong: the caption takes two lines with "each" alone on line 2 because the 36 px refresh button owns the right end; the IPA (R3SB1-5) breaks at the slash in the row below, so the Names block is five lines to show one name. Adds the caption orphan to R3SB1-5 / R3SB2-14.
- Where: `components/storybible/GuideDetail.tsx` names section header
- Severity: polish (390)
- Fix: shorten the caption ("Names and how I say them") or let it wrap under the button.
- Evidence: `crops/r4ta/b390-b.png`
- Shared: page-local

## Round 3: coverage gaps and scanner cross-check

### R3GL-2 Why do all five Production tiles have a short hover area?

- Page / state: global / tooltip (and every state that shows the KPI strip)
- Widths: 1920, 1440, 1280, 768, 390 (theme: both)
- Gut reaction: only the left half of each tile lights up when I hover it.
- What is wrong: all five KPI buttons stop 30 px short of the tile's right edge (Finished audio 81-247 of 80-277; Editing 476-622 of 475-672; Pickups 673-807 of 672-869; Delivery 870-1006 of 869-1067; Due 1068-1227 of 1067-1264); dark tooltip shot shows the same.
- Where: `production/overview/KpiRow.tsx:24-33`
- Scanner: H2
- Severity: looks wrong
- Fix: XGL-3's `size-full`, applied to all tiles
- Evidence: `S/crops/r3sh/m_dkg_tooltip.png`, `S/crops/r3sh/m_gl3_tooltip.png`
- Shared: `TooltipTarget`
- Supersedes: extends XGL-3

### R3GL-3 Why does the shortcut sheet clip a row under its own footer button?

- Page / state: global / shortcut-sheet
- Widths: 1920 (Shift key cap under "Show all shortcuts"), 390 (label under the button) (theme: both)
- Gut reaction: the list scrolls under the footer and the last visible row is half hidden.
- What is wrong: scanner shows a kbd "Shift" overlapping the footer button by 36 x 14; the montage at 1920 shows the framed list ending at the footer with the last row cut mid-glyph ("Undo the last change" at y 331 of the list's 335).
- Where: `primitives/Dialog.tsx:163` (body scroll region) and `help/ShortcutSheet.tsx`
- Scanner: W4
- Severity: looks wrong
- Fix: add bottom padding to the scroll region, fade edge
- Evidence: `S/crops/r3sh/m_gl3_shortcut-sheet.png`
- Shared: Dialog

### R3GL-1 Why are the toast's "Undo" and close targets so small?

- Page / state: global / toast; schedule / long-text; project / picker-removed, no-recents
- Widths: all (theme: both)
- Gut reaction: the Undo link is a 33 x 20 underlined word and the X is a 17 x 20 glyph, much smaller than any other control.
- What is wrong: sizes measured by the scanner; they sit 12 px apart (x 1183 and 1227).
- Where: `primitives/Toast.tsx:69-74`
- Scanner: H1
- Severity: polish
- Fix: 32 px hit boxes
- Evidence: `S/crops/r3sh/z_actions1440.png`
- Shared: Toast

### R3GL-4 Why does the dark theme flatten the Production hover tint?

- Page / state: global / tooltip dark
- Widths: 1024, 768 (theme: dark)
- Gut reaction: the hovered tile gets a grey half-box that stops short, and in dark the tooltip is a near-white sticker.
- What is wrong: the hover fill (x 75-229 of 75-361) is a different grey from the tile and the tooltip is a light card with dark text in a dark app, 240 px wide over the rail icon column.
- Where: `primitives/Tooltip.tsx`
- Scanner: H2
- Severity: polish
- Fix: invert the tooltip in dark
- Evidence: `S/crops/r3sh/m_dkg_tooltip.png`
- Shared: Tooltip

## Round 2: strict review

### XGL-4 Why is the panel title one word per line?

- Page / state: global / toast (Proof > Compare the recording with the script)
- Widths: 390 ("Comp / are / the / recor / ding / with / the / script" in a 62 px column) (theme: both)
- What is wrong: the step strip takes the line and the title is crushed; unreadable.
- Where: `primitives/panelStyles.ts:9` (title/actions share a wrapping row, no basis on the title)
- Severity: breaks use (390)
- Fix: give the title group `flex-[1_1_8rem]` so the actions wrap beneath
- Evidence: `global/toast/w390.png` (y 60-275)
- Shared: `Panel` header
- Supersedes: GLB-2

### XGL-1 Why is a one-sentence confirm a 1000 px dialog?

- Page / state: global / confirm-dialog (storybible/delete-confirm); also shortcut-sheet, new-project, jump menus
- Widths: 1920, 1440 (1006 wide), 1280, 1024 (714) (theme: both)
- What is wrong: "Delete 'Alice' and its aliases ... This cannot be undone." occupies 520 px of a 1006 px dialog, with Cancel at x=233 and Delete entry at x=1207 970 px apart; a close X in the header duplicates Cancel.
- Where: `primitives/Dialog.tsx:149` (`max-w-[70vw]`), `primitives/ConfirmDialog.tsx`
- Severity: looks wrong
- Fix: dialog size presets (confirm 28 rem, form 36 rem, sheet 48 rem)
- Evidence: `global/confirm-dialog/w1440.png` (x 217-1223, y 357-543)
- Shared: `Dialog` (XSH-7, XSL-4, XPJ-5)

### XGL-2 Why is the shortcut sheet so far from its keys, and why the blue frame?

- Page / state: global / shortcut-sheet
- Widths: 1440, 1024, 768 (blue frame); 390 (rows change shape and clip) (theme: both)
- What is wrong: labels at x=235 and chords right-aligned at x=1205 (970 px between); the list has a 2 px blue frame touching the dialog's side edges (x 217-1223, y 155-742) from the scroll region's focus ring, which makes it look selected; at 390 "Back" puts its chips on two lines under the label while "Open Settings" stays on one row, with "or" stranded at the start of a line, and "Open Companion" is sliced by the frame's bottom (y=690).
- Where: `primitives/Dialog.tsx:163` (body `focus-visible:ring-2 ... ring-inset`, `tabIndex=0`), `help/ShortcutSheet.tsx`
- Severity: looks wrong
- Fix: dialog width cap; take the ring off the container (focus the first row); keep one row layout
- Evidence: `global/shortcut-sheet/w1440.png`, `.../w390.png` (y 205-690)
- Shared: `Dialog`

### XGL-3 Why does the hover colour only cover part of the tile?

- Page / state: global / tooltip (Production, Finished audio tile)
- Widths: 1440 (fill x 233-399 of a tile 233-431), 1024 (81-247 of 81-389), 768 (17-183 of 17-261) (theme: light)
- What is wrong: the hover fill and click target stop short of the tile's right edge and bottom.
- Where: `production/overview/KpiRow.tsx:24-33` (`TooltipTarget` without `size-full`); `primitives/Tooltip.tsx:46`
- Severity: looks wrong
- Fix: pass `className="size-full"` to the TooltipTarget
- Evidence: `global/tooltip/w1440.png` (y 179-282)
- Shared: `TooltipTarget`
- Supersedes: GLB-1

### XGL-5 Why doesn't the toast stack line up with the page edge?

- Page / state: global / toast; project / `picker-*`
- Widths: 1440 (toast right edge x=1420 vs card edge 1423 and 1407), 768 (x=748 vs 744), 390 (x=370 vs 366/374) (theme: both)
- What is wrong: the toast inset is 20 px; page gutters are 16 or 24 depending on the page, so the toasts are 4-8 px off.
- Where: `primitives/Toast.tsx:88` (`right-[calc(1.25rem+...)]`)
- Severity: polish
- Fix: use the page gutter token
- Evidence: `global/toast/w768.png`, `project/picker-no-recents/w768.png` (x 300-748)
- Shared: toast container
- Supersedes: GLB-3

### XGL-6 Why does the tooltip hang off the left of its tile and over the rail?

- Page / state: global / tooltip
- Widths: 1440 (x 196-436 against the tile at 233; it crosses the rail edge at 215), 1024 (x 44-284 over the rail icons), 768 (x 8-248 over the Export and Start buttons) (theme: light)
- What is wrong: the tooltip centres on the hovered text, not on the tile, so it covers neighbours; it also hides the page's subtitle line.
- Where: `primitives/Tooltip.tsx` (positioner centres on trigger; the trigger is the narrow inline-flex span, see XGL-3)
- Severity: polish
- Fix: fix XGL-3 first; then anchor to the tile
- Evidence: `global/tooltip/w1440.png`, `.../w768.png`
- Shared: `Tooltip`

### XGL-7 Why are the dialog's buttons 2 px outside the text above?

- Page / state: global / confirm-dialog; project / new-project-dialog; shell dialogs with an action band
- Widths: 1440 (Cancel x=233 vs body text x=235; Create right edge 1207 vs field edge 1205) (theme: both); the milestone dialog puts its buttons inside the body at x=1205 instead
- What is wrong: body inset is 17.6 px, action band inset is 16 px, so footers and bodies are 2 px off and the milestone dialog follows a third pattern (buttons inside the form).
- Where: `primitives/Dialog.tsx:163` (`p-[1.1rem]`) vs `:190` (`px-4`); `schedule/MilestoneDialog.tsx:255-262`
- Severity: polish
- Fix: one inset token for header, body and footer; use `actions` for the milestone dialog
- Evidence: `global/confirm-dialog/w1440.png` (y 490-526), `project/new-project-dialog/w1440.png`
- Shared: `Dialog`

### XGL-8 Settings (seen through global/theme-light) has its own small misalignments

- Page / state: global / theme-light (settings page; a settings reviewer may report these too)
- Widths: 1440, 768 (theme: light)
- What is wrong: the magnifier icon sits outside the search box, 22 px left of it (x=886 vs box 908); the sub-nav groups use 14 px above "THIS PROJECT" and "THIS COMPUTER" but 33 px below "SHARED TOOLS"; the note "Also set in The theme button in the navigation rail" has a stray capital; at 768 the Category control ends in a native black triangle unlike the app's chevrons.
- Where: Settings page components (`settings/`; not read)
- Severity: polish
- Fix: for the settings reviewer
- Evidence: `global/theme-light/w1440.png` (x 880-1170, y 68-104; sub-nav y 135-600), `.../w768.png` (y 120-182)
- Shared: page-local (settings)
