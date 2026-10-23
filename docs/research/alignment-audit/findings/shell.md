# App shell (rail, top bar, jump menu, menus): alignment findings

Part of the [alignment audit](../../alignment-audit.md). Findings are grouped by the round that produced them; a later round's finding that replaces an earlier one says `Supersedes`. Evidence paths are `<page>/<state>/<width>.png` of the light capture, `dark:<page>/<state>/<viewport>.png` for dark, `tall:<page>-w<width>.png` for the below-the-fold captures; the images are not committed (regenerate the repo-viewport ones with `pnpm --dir apps/ui visual:page <page>`).

## Round 4: gap fill

### R4SM-19 Why does the "Undo history" slide-over use a different title style from the page it covers?

- Page / state: shell/history-panel-open
- Widths: 768 (theme: dark; light expected same)
- Gut reaction: a small 14 px sans title in a 64 px band next to the 20 px condensed card titles on the page.
- What is wrong: title style differs from every Panel title; its header rule (y 64) does not meet the top bar's rule (y 52) beside it (XSL-13); the body is two lines of equal weight ("Ctrl Z undoes the last one", "Nothing to undo yet.") then 900 px blank; the page behind is not dimmed.
- Where: `primitives/SlideOver.tsx` header
- Severity: polish
- Fix: use the Panel title style and put the empty-state sentence first, the shortcut hint as a footer
- Evidence: `S/crops/r4sm/dh768.png`
- Shared: `SlideOver`
- Extends: XSL-13

## Round 3: coverage gaps and scanner cross-check

### R3SL-2 Why does the engine chip say only "REAPER" in amber when a different project is open, and why can't I tell the three states apart at 390?

- Page / state: shell / engine-mismatch, engine-builtin, zoom-level
- Widths: 1440 (amber chip "REAPER", no words), 390 (a 20 px dot in green, amber or grey) (theme: both)
- Gut reaction: a warning that doesn't say what it is warning about.
- What is wrong: linked, wrong project and built-in differ only by dot and fill colour; the amber chip reads "REAPER" exactly like the green one. At 390 every state is a bare dot, colour only.
- Where: `layout/EngineChip.tsx:47,72-86`
- Scanner: H1 (67.5 x 22)
- Severity: looks wrong
- Fix: text "REAPER: other project" in the amber state, and keep a 2-letter label at 390
- Evidence: `S/crops/r3sh/z_chips1440.png`, `S/crops/r3sh/m390_d.png`
- Shared: `HeaderChip`, `EngineChip`
- Supersedes: extends XSL-12

### R3SL-1 Why does the NARRATION STUDIO wordmark start 8 px to the right of the nav labels?

- Page / state: shell / every state (rail at 1440, 1920)
- Widths: 1920, 1440; hover-expanded 1280/1024 (theme: both)
- Gut reaction: the wordmark and the labels below it are two near-misses on the left.
- What is wrong: measured by ink scan at 1440: logo x 16-47, wordmark x 58, group labels x 18, nav labels x 50-51, nav icons 19-38 (20 px glyphs; Script 21-36). The wordmark (58) and the nav label column (50) differ by 8 px; the logo (16) and icons (19) differ by 3 px.
- Where: `layout/AppShell.tsx` brand row vs `primitives/NavButton.tsx:12`
- Scanner: none
- Severity: polish
- Fix: align the wordmark to the nav label x (50) and the logo to the icon x
- Evidence: `S/crops/r3sh/z_rail1440_a.png` (3x of x 0-240)
- Shared: left rail
- Supersedes: extends XSL-8

### R3SL-3 Why are the engine, zoom and Jump targets so small to hit?

- Page / state: shell / every state
- Widths: all (theme: both)
- Gut reaction: three clickable things in the bar are visibly thinner than the Jump field beside them.
- What is wrong: the REAPER chip is 67.5 x 22, the zoom chip 51 x 22, the 390 dot about 20 x 22; the hamburger at 390 with the zoom chip is 19.5 x 36 (XSL-10). All are under 24 px on one axis.
- Where: `primitives/HeaderChip.tsx:21`
- Scanner: H1
- Severity: polish
- Fix: pad the chip button to a 32 px hit area (transparent padding)
- Evidence: `S/crops/r3sh/z_chips1440.png`
- Shared: `HeaderChip`

### R3SL-4 Why are the "i" and readiness controls on the Production table such tiny circles?

- Page / state: shell states that show Production (all shell states)
- Widths: all (theme: both)
- Gut reaction: 15 px "?" buttons jammed beside column titles.
- What is wrong: "About the Fin. column" is a 15 x 15 button, "More information" 15 x 15, the per-chapter Stage readiness chips 20 x 20, at x 678/y 701 and x 833-1233 (1440 pipeline).
- Where: `primitives/Tooltip.tsx:115` (`size-[15px]`), `production/readiness/ReadinessChip.tsx:23`
- Scanner: H1
- Severity: polish
- Fix: 24 px minimum hit area
- Evidence: `S/crops/r3sh/v/l_shell_zoom-level_w1280.png` (pipeline header)
- Shared: `Tooltip` info button

### R3SL-5 Why does the 125% zoom chip look different from the engine chip beside it?

- Page / state: shell / zoom-level
- Widths: 1920, 1440, 1280, 1024 (theme: both)
- Gut reaction: one chip is a grey blob with a larger mono number, the other a green pill with condensed caps.
- What is wrong: "125%" is 13 px IBM Plex Mono on `--surface-2`, a near-invisible fill (about 1.1:1 against the bar), while the REAPER pill is 11.5 px Barlow Condensed caps in a tinted fill; same height 22 but different type and weight.
- Where: `layout/AppShell.tsx:334`
- Scanner: none
- Severity: polish
- Fix: same face as the other chip, and a border on neutral chips
- Evidence: `S/crops/r3sh/z_chips1440.png` (third panel)
- Shared: `HeaderChip` neutral

### R3SL-6 Why is the jump field's own label cut off with "..."?

- Page / state: shell / every state
- Widths: 1920-1024, 768 (icon only) (theme: both; may be intended)
- Gut reaction: "Jump to or run..." reads as truncated although there is room.
- What is wrong: the literal label ends with an ellipsis and the key caps follow; the zoom shows 12 px free between text and "Ctrl".
- Where: `layout/AppShell.tsx:325`
- Scanner: W1 (false positive for wrapping)
- Severity: polish
- Fix: "Jump to..." or "Search or run commands"
- Evidence: `S/crops/r3sh/z_bar1440.png`
- Shared: AppShell header

### R3SL-7 Why does the last row of the page list touch the dialog's bottom edge, also in dark?

- Page / state: shell / jump-menu-off-pages
- Widths: 1024 light (XSL-16), also dark 1024 (theme: both)
- Gut reaction: "Go to Settings" is cut by the edge.
- What is wrong: dark 1024 shows the last row baseline 9 px from the bottom border and 4 px of its hover band cut.
- Where: `primitives/Dialog.tsx:152`
- Scanner: none
- Severity: polish
- Fix: bottom padding on the list
- Evidence: `S/crops/r3sh/m_dk_sh_jump-menu-off-pages.png`
- Shared: Dialog headerless
- Supersedes: extends XSL-16

### R3SL-8 Why does the context menu at 390 open at the top-left over the title?

- Page / state: shell / context-menu-open
- Widths: 390 (theme: light)
- Gut reaction: the menu is glued to the top-left, covering the project name.
- What is wrong: opens at x 8-247, y 53-221 under the header; row 3 wraps to two lines like at 1440.
- Where: `primitives/ContextMenu.tsx:40`
- Scanner: W1
- Severity: polish
- Fix: as XSL-14
- Evidence: `S/crops/r3sh/m390_b.png` (middle)
- Shared: ContextMenu

## Round 2: strict review

### XSL-1 Why are the padlocks so black and heavy next to the labels?

- Page / state: shell / jump-menu-off-pages, nav-off-note; schedule / no-manuscript; any no-manuscript page
- Widths: 1920, 1440 (and the hover-expanded rail at 1280/1024) (theme: both)
- What is wrong: each locked item carries a solid 16 x 20 px lock at x 176-192 (1440), as dark and heavy as the 20 px nav icon, so nine locks run down the rail like a column of bars; the locked labels are unchanged (same colour and weight as an enabled page), so the lock is the only cue and it is louder than the text.
- Where: `primitives/NavButton.tsx:12` (`[&_svg]:text-[1.25rem] [&_svg]:w-[1.375rem]!` applies to the lock svg too) against `:71` (`text-[0.6875rem]` intended)
- Severity: looks wrong
- Fix: scope the 20 px icon rule to the leading icon (`> svg:first-child`) so the lock is about 11 px, and dim the locked label
- Evidence: `shell/nav-off-note/w1440.png` (locks x 176-192, y 117-660), `S/crops/xsh/lock1440.png`
- Shared: `NavButton`

### XSL-2 Why does the narrow rail forget which pages are locked and which have counts?

- Page / state: shell / every state at 1280, 1024, 1300, 1230; schedule/no-manuscript at 1024
- Widths: 1280, 1024, 1300, 1230 (theme: both)
- What is wrong: at 1440 Proof shows "4", Pickups "3" and locked pages show a lock; at <1360 those same rows are bare icons, so a locked page looks exactly like an enabled one and the open-pickups count disappears; the schedule/no-manuscript capture at 1024 shows nine unlocked-looking icons beside an empty-state card.
- Where: `layout/AppShell.tsx:285` (`max-[1360px]:[&_button>span]:invisible` hides every trailing span, badge and lock) and `primitives/NavButton.tsx:41`
- Severity: looks wrong
- Fix: draw count as a corner dot and lock as a small corner glyph on the collapsed icon
- Evidence: `schedule/no-manuscript/w1024.png` (rail x 0-63), `shell/engine-builtin/w1280.png` (Proof/Pickups y 488/530)
- Shared: left rail
- Supersedes: SHL-4

### XSL-3 Why are the three things in the top bar three different sizes and styles?

- Page / state: shell / every state
- Widths: 768 (hamburger 36 with white fill and dark border at x 20-56; search 32 with grey fill and light border at x 638-670; engine chip 22), 1024-1920 (Jump field 32 grey, chip 22), 390 (36 / 32 / 20 dot) (theme: both)
- What is wrong: the strip mixes a white 36 px outlined button, a grey 32 px outlined button and 22 px filled pills, all vertically centred at y=26, so left and right ends look unrelated; the Jump field's border is lighter than the hamburger's, and the pills have text of about 10 px beside the 15 px project name.
- Where: `layout/AppShell.tsx:297-309` (IconButton default), `:325` (`h-8 ... bg-[var(--bg)]`), `primitives/HeaderChip.tsx:21` (22 px)
- Severity: looks wrong
- Fix: one height (32) and one fill/border recipe for hamburger and Jump; pills 24 with a 32 hit area
- Evidence: `S/crops/xsh/top768.png`, `shell/engine-builtin/w768.png`, `S/crops/xsh/top1440r.png`
- Shared: AppShell header, `HeaderChip`

### XSL-4 Why is the command palette 1000 px wide with its counts and shortcuts hiding at the far right?

- Page / state: shell / jump-menu-open, jump-menu-off-pages, jump-menu-back-enabled, jump-menu-forward-enabled, zoom-menu-open
- Widths: 1920 (1342 wide), 1440 (1006), 1280, 1024 (714) (theme: both)
- What is wrong: "Go to" at x=229 and its "15 ›" at x=1205 are 970 px apart at 1440; "Back" and its Alt + arrow chips on the single result row are the same distance; the rows have no divider or hover band that crosses the gap in the screenshot, so the eye cannot track from label to value.
- Where: `primitives/Dialog.tsx:149` (`max-w-[70vw]`), used by `layout/JumpMenu.tsx:210-217`
- Severity: looks wrong
- Fix: cap the palette at about 40 rem and centre it
- Evidence: `shell/jump-menu-open/w1440.png`, `.../w1920.png`, `.../jump-menu-back-enabled/w1440.png` (y 490)
- Shared: `Dialog`

### XSL-5 Why does the search box slide up and down as I type?

- Page / state: shell / jump-menu-open (y 272), jump-menu-off-pages (y 166), jump-menu-back-enabled (y 418), zoom-menu-open (y 208)
- Widths: all (390: 246/138/390) (theme: both)
- What is wrong: the dialog is centred vertically so the field moves with the result count.
- Where: `primitives/Dialog.tsx:143` (`Parts.Viewport ... items-center`)
- Severity: looks wrong
- Fix: anchor the headerless dialog from the top (`items-start pt-[12vh]`)
- Evidence: `shell/jump-menu-open/w1440.png`, `.../jump-menu-off-pages/w1440.png`, `.../jump-menu-back-enabled/w1440.png`
- Shared: Dialog headerless
- Supersedes: SHL-2

### XSL-6 Why does the list repeat the same words on every row, with rows of two different heights?

- Page / state: shell / jump-menu-off-pages, zoom-menu-open, jump-menu-back-enabled
- Widths: 1440, 1024, 768 (theme: both)
- What is wrong: nine "Go to ..." rows each repeat "Import a manuscript to unlock this page." (52 px rows) next to 36 px rows for Production and Settings; the group heading "GO TO" is followed by a first row "Go to Production"; the zoom list shows five rows each carrying the sub-line "zoom", one-line rows with chords for Zoom in/out, and a first row "‹ All commands" in the same bold as commands; the single typed result sits under a heading of its own ("GO TO" over "Back").
- Where: `layout/JumpMenu.tsx:151` (`description: entry.disabledReason ?? entry.hint`) with `primitives/Listbox.tsx` rows
- Severity: looks wrong
- Fix: show the reason once under the group heading, drop the "zoom" hint, make the back row a muted link
- Evidence: `shell/jump-menu-off-pages/w1440.png` (y 225-760), `.../zoom-menu-open/w1440.png` (y 245-715)
- Shared: JumpMenu + Listbox

### XSL-9 Why does the "unlock" note sit on top of the header?

- Page / state: shell / nav-off-note
- Widths: 768 (note at x 12-348, y 0-54 over the hamburger and project name), 390 (theme: both; 1440 and 1024 place it beside the item)
- What is wrong: below 860 there is no rail, so the popover anchors to a hidden button and opens at the top-left, covering the hamburger.
- Where: `primitives/NavButton.tsx:81` (`Popover` anchored to the button) with the rail `aside` at `layout/AppShell.tsx:284` (`hidden ... min-[860px]:flex`); the capture likely presses the hidden rail button, so a real drawer press may anchor correctly (not confirmed)
- Severity: looks wrong (unconfirmed for the real drawer path)
- Fix: capture the drawer open and check; otherwise anchor to the drawer item
- Evidence: `shell/nav-off-note/w768.png`, `.../w1440.png`
- Shared: NavButton + Popover
- Supersedes: SHL-6

### XSL-10 Why is the hamburger squashed and the engine chip cut off once the zoom chip appears at 390?

- Page / state: shell / zoom-level
- Widths: 390 (hamburger x 12-32, 20 px wide and 36 tall; engine chip cut at x=383) (theme: light)
- What is wrong: the bar overflows; the left button is a narrow pill and the right chip is half off screen.
- Where: `layout/AppShell.tsx:294` (header `px-3 max-md:gap-2`; no `min-w-0` or flex-none on the hamburger)
- Severity: looks wrong (390 only, secondary)
- Fix: hide the zoom chip text or the project name earlier, and `flex-none` the hamburger
- Evidence: `shell/zoom-level/w390.png`, `S/crops/xsh/z390.png`
- Shared: AppShell header
- Supersedes: SHL-1

### XSL-20 At exactly 1360 px the rail is wide but its labels are hidden (source only)

- Page / state: shell / every page at 1360
- Widths: 1360 only (not seen) (theme: both)
- What is wrong: `min-[1360px]:w-54` and `max-[1360px]:` label hiding both apply.
- Where: `layout/AppShell.tsx:284-285` (components.css:16 correctly uses 1359)
- Severity: looks wrong (unconfirmed)
- Fix: use `max-[1359px]`
- Evidence: none
- Shared: left rail
- Supersedes: SHL-11

### XSL-7 Why is the group rule in the narrow rail nearer the next icon than the last?

- Page / state: shell / every state at 1280, 1024; global/nav-rail-collapsed
- Widths: 1280, 1024, 1300, 1230 (theme: both; may be intended: the comment cites the mock)
- What is wrong: the rule at y=178 is 31 px below the Schedule item's bottom (147) and 8 px above the Script item's top (186); its x span is 12-50 while the item highlight is 8-55, so it is narrower than what it separates.
- Where: `components.css:17-23` (`top: 1.875rem`, `inset-inline: 0.25rem`) on `.section-label::after` inside `AppShell.tsx:225-231` (`h-9` heading kept as spacing)
- Severity: polish
- Fix: centre the rule in the heading space (about 18 px each side) and match the highlight width
- Evidence: `S/crops/xsh/rail1280a.png` (rule y 535/3 = 178)
- Shared: left rail

### XSL-8 Why do the logo, the group names and the icons not share a left edge?

- Page / state: shell / every state at >=1360; hover-expanded rail (global/nav-rail-open, shell/nav-off-note at 1024)
- Widths: 1920, 1440 (rail 216); 1280, 1024 (hover) (theme: both)
- What is wrong: logo x=16, group labels x=18, nav icons x=19-39 with the active bar at x=8; in the hover-expanded rail the icons move to x=22-42 and labels to x=53 while the group labels stay at x=18, so the labels now sit 4 px left of the icons.
- Where: `layout/AppShell.tsx:285` (`max-[1360px]:[&_button]:pl-[0.78125rem]` has no hover reset), `:225-231` heading `px-[0.625rem]`, `primitives/NavButton.tsx:12` (`pl-[0.625rem]`)
- Severity: polish
- Fix: one rail inset for logo, labels and icons; reset the button padding on hover/focus
- Evidence: `S/crops/xsh/rail1440a.png`, `S/crops/xsh/lock1024.png` (icons x 22-42), `global/nav-rail-open/w1280.png`
- Shared: left rail

### XSL-11 Why does the top bar start 4 px to the right of the page title?

- Page / state: shell / every state
- Widths: 1920-768 (bar inset 20, page 16); 390 (12 vs 16) (theme: both)
- What is wrong: "PROJECT" starts at x=236 and "Production" at x=232 (1440); at 768 the hamburger starts at x=20 and content at x=16; on the right the engine chip ends at x=1420 and the cards at x=1424.
- Where: `layout/AppShell.tsx:294` (`px-3 md:px-5`) vs `:353` (content `p-4`)
- Severity: polish
- Fix: one gutter for bar and content
- Evidence: `shell/engine-builtin/w1440.png` (y 26 vs 86), `.../w768.png`
- Shared: AppShell
- Supersedes: SHL-3

### XSL-12 Why are the engine and zoom chips small, and why is the engine chip a bare dot at 390?

- Page / state: shell / every state; zoom-level
- Widths: all; at 390 the engine chip is a grey/green dot about 20 x 22 with no name (theme: both)
- What is wrong: the chip is 22 px tall with about 10 px text beside a 32 px Jump field, and below `md` its label is hidden so only a dot says what engine is in use.
- Where: `primitives/HeaderChip.tsx:21`, `layout/EngineChip.tsx:47,86` (`max-md:hidden`)
- Severity: polish
- Fix: 24 px chip with a 32 px hit area; keep a two-letter label at 390
- Evidence: `S/crops/xsh/e390.png`, `S/crops/xsh/top1440r.png`
- Shared: HeaderChip
- Supersedes: SHL-10

### XSL-13 Why do the slide-over's header rule and title not line up with the top bar?

- Page / state: shell / history-panel-open
- Widths: 1440, 1024, 768, 390 (theme: both)
- What is wrong: the panel's rule is at y=63 while the bar's is at y=51, so the lines step 12 px where they meet; the title "Undo history" (about 13 px, y=32) is 6 px lower than the project name (y=26) and much smaller than any page heading; the body is two plain paragraphs 36 px apart ("Ctrl Z" is plain text rather than key caps as elsewhere); the panel is 320 px at every width (82% of the screen at 390), has no dim over the page so the page is cut mid-word (DELIVERY CH...), and in dark its edge nearly vanishes.
- Where: `primitives/SlideOver.tsx:69` (`min-h-[3.75rem]`) against `layout/AppShell.tsx:294` (`h-13`)
- Severity: polish
- Fix: size the header to 52 px, use the heading style, use `Kbd` for Ctrl Z, add the dialog backdrop
- Evidence: `shell/history-panel-open/w1440.png` (y 51 vs 63), `.../w390.png`, `dark:shell/history-panel-open/desktop.png`
- Shared: SlideOver
- Supersedes: SHL-7

### XSL-14 Why is the right-click menu text smaller than the palette's, and why does one row wrap?

- Page / state: shell / context-menu-open
- Widths: 1440, 1024, 768 (theme: both)
- What is wrong: the menu is 13 px regular where the palette is 15 px semibold; "Find a page, chapter or command" wraps to two lines next to its chord (50 px row vs 34), so the chord floats at mid-height; it opens at x=224, y=53 at every width (driver artifact: the pointer is kept) over the project name.
- Where: `primitives/ContextMenu.tsx:40` (`w-64`) and `:42` (`text-[0.82rem]`)
- Severity: polish
- Fix: shorten to "Find..." or widen to `w-72`; align type with the palette
- Evidence: `shell/context-menu-open/w1440.png` (x 224-480, y 53-221)
- Shared: ContextMenu
- Supersedes: SHL-8

### XSL-15 Why does what I type start further right than the list below it?

- Page / state: shell / every jump menu state
- Widths: all (theme: both)
- What is wrong: the field's text starts at x=238 (1440) while the group heading and rows start at x=229; the field's box edge is at x=225 inside rows that start at x=217.
- Where: `layout/JumpMenu.tsx:160` (`p-2` around the field) against `primitives/Listbox.tsx` rows (`px-3`)
- Severity: polish
- Fix: match the field text inset to the rows
- Evidence: `shell/jump-menu-open/w1440.png` (y 274 vs 317)
- Shared: JumpMenu
- Supersedes: SHL-9

### XSL-16 Why is the last row of the long list touching the dialog's bottom edge?

- Page / state: shell / jump-menu-off-pages
- Widths: 1024 ("Go to Settings" at y 681 with the dialog edge at y 690) (theme: light)
- What is wrong: the list scrolls inside a dialog capped at 80% of the height and the last row has no inset below, so it looks clipped.
- Where: `primitives/Dialog.tsx:152` (`maxHeight: '80dvh'`) + `Listbox`
- Severity: polish
- Fix: bottom padding on the list
- Evidence: `shell/jump-menu-off-pages/w1024.png` (y 670-690)
- Shared: Dialog headerless

### XSL-17 Why does the expanded rail cut the project name in half?

- Page / state: shell / nav-off-note at 1024, global/nav-rail-open (1280, 1024) (may be intended)
- Widths: 1280, 1024 (theme: light)
- What is wrong: the rail grows to 236 px over the top bar and page without a dim, so "Alice's Adventures in Wonderland" reads "...ntures in Wonderland"; the hover fill on Pickups is the same grey as the current-page fill (only the orange bar tells them apart).
- Where: `layout/AppShell.tsx:285` (`max-[1360px]:hover:w-59`, `absolute inset-y-0`)
- Severity: polish
- Fix: start the page header after the rail, or dim the page while open
- Evidence: `global/nav-rail-open/w1280.png`, `.../w1024.png`
- Shared: left rail

### XSL-18 Why do the count pills look like smudges and not line up with the locks?

- Page / state: shell / every state at >=1360 (also schedule, global)
- Widths: 1920, 1440 (theme: both)
- What is wrong: the "4" and "3" are 16 px pills filled with the same grey as the surface, so only the digit shows; their right edge is x=195 while a lock's is x=192, 3 px apart in the same column; on the current page the pill matches the highlight and disappears entirely.
- Where: `primitives/NavButton.tsx:65` (`bg-[var(--surface-2)]`, 16 px) vs `:71`
- Severity: polish
- Fix: a visibly distinct pill fill, one right inset for count and lock
- Evidence: `S/crops/xsh/rail1440b.png` (pills x 180-195), `S/crops/xsh/lock1440.png`
- Shared: NavButton

### XSL-19 Why do some rail icons look thin and small and others heavy?

- Page / state: shell / every state
- Widths: all (theme: both)
- What is wrong: Production, Schedule, Story Bible, Master and Delivery are heavy solid glyphs; Booth, Proof and Pickups are thin outlines and narrower (Proof is a 16 px step line), so the column does not read as one set.
- Where: `layout/AppShell.tsx` item icons (`icons.catalog`)
- Severity: polish
- Fix: pick one weight per set
- Evidence: `S/crops/xsh/rail1440a.png`, `rail1440b.png`
- Shared: icon catalog

### XSL-21 In dark, why are there two gears at the bottom of the rail?

- Page / state: shell / every dark state; global/theme-dark, nav-rail-collapsed-dark
- Widths: 1440, 1024 (theme: dark)
- What is wrong: the "Light theme" sun (x 18-40, y 826) is a ring with short rays at 20 px and reads as a gear directly above Settings (y 868); in the collapsed rail they stack as two gears.
- Where: `layout/AppShell.tsx:252` (`iconFor('themeLight')`)
- Severity: polish
- Fix: a sun with longer rays
- Evidence: `S/crops/xsh/darkfoot.png`, `global/nav-rail-collapsed-dark/w1024.png` (y 707/749)
- Shared: left rail
- Supersedes: SHL-12

### XSL-22 Why is the "unlock" note a wide box 34 px from its lock?

- Page / state: shell / nav-off-note
- Widths: 1440, 1024 (theme: both)
- What is wrong: the note is 334 x 53 for one sentence (text ends x=490, box ends x=554) and starts at x=220, 5 px off the rail edge, and not near the lock (x 176-192).
- Where: `primitives/NavButton.tsx:81` (`Popover side="right"`)
- Severity: polish
- Fix: size to content, 8 px from the item
- Evidence: `shell/nav-off-note/w1440.png` (x 220-554, y 469-521)
- Shared: Popover
