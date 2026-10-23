# Settings: alignment findings

Part of the [alignment audit](../../alignment-audit.md). Findings are grouped by the round that produced them; a later round's finding that replaces an earlier one says `Supersedes`. Evidence paths are `<page>/<state>/<width>.png` of the light capture, `dark:<page>/<state>/<viewport>.png` for dark, `tall:<page>-w<width>.png` for the below-the-fold captures; the images are not committed (regenerate the repo-viewport ones with `pnpm --dir src/studio/ui visual:page <page>`).

## Round 4: gap fill

### R4SE2-1 The search magnifier sits outside the search box, 8 px to its left

- Page / state: every state (header block); seen in not-installed l1280, d1440, d1024, d768, search-results, search-empty
- Widths: 768, 1024, 1280, 1440, 1920 (theme: both)
- Gut reaction: "why is the magnifying glass floating next to the box instead of inside it?"
- What is wrong: a 16 px search icon is a separate sibling to the left of the 260 px field (icon x about 517, field x 531 at 1280) so the field has a placeholder "Search settings" with no icon, and the icon looks like a stray glyph at the left of the filter row; every other search field in the app is a single boxed control.
- Where: `settings/page/SettingsPage.tsx:216-221` (`<Icon name="find" />` beside `<SearchField>` in a `gap-2.5` flex row); `primitives/SearchField.tsx` has no leading icon slot.
- Severity: looks wrong
- Fix: put the icon inside the field (left padding 2.25rem) or drop it; the placeholder already says "Search".
- Evidence: `settings/recording-not-installed/w1280.png` (x 500-720, y 50-75); `dark:settings/search-empty/tablet.png` (y 75-100)
- Shared: SearchField primitive / SettingsPage header

### R4SE2-3 Confirm dialogs grow with the window: 1340 px wide at 1920 for one sentence (extends XSE2-28)

- Page / state: `models-remove-confirm` (l1920), `pages-navigate-away-confirm`, `speech-costly-confirm`, `project-data-confirm` (same Dialog)
- Widths: 1920 (1340 px), 1440 (about 1006 px), 1280 (about 700 px) (theme: both)
- Gut reaction: "a banner across the whole screen to ask one question, with Cancel and Remove at opposite ends of it."
- What is wrong: at 1920 the Remove dialog spans x 288-1630. The body is one 15 px line ("It is chosen for: Transcription model. ... You can download it again.") that ends about x 910, so 700 px of the dialog are empty; Cancel is at the far left and the destructive Remove 1300 px away at the far right. XSE2-28 measured 1006 at 1440 only.
- Where: `primitives/Dialog.tsx:149` (`max-w-[70vw]` for the default size)
- Severity: looks wrong
- Fix: cap confirm dialogs at about 520-560 px (`max-w-[min(70vw,34rem)]`), buttons grouped right.
- Evidence: `settings/models-remove-confirm/w1920.png` (band y 395-500, full width); `settings/pages-navigate-away-confirm/w1280.png` (dialog x 148-765 of 900-scaled crop)
- Shared: Dialog / ConfirmDialog primitive

### R4SE2-4 Voice sample output: the select, Refresh and Test sound rearrange at each width and the Test sound button is orphaned (new measurements for XSE2-8)

- Page / state: `recording-sample-output-builtin`, `recording-builtin`, `recording-sample-output-long-name`, `recording-sample-output-daw`
- Widths: 1280 (builtin: select 189 px + Refresh on row 1, Test sound alone on row 2; with no outputs the select shrinks to 99 px under a pink alert), 1920 (daw: Microphone select 303 with Refresh alone below while 300 px lie free beside it), 1024 / 768 (Microphone select 302 vs Voice select 266 so the two Refresh buttons start at x 348 vs 313) (theme: both)
- Gut reaction: "the same two buttons are beside the select in one row, under it in the next, and one of them is stranded."
- What is wrong: the select is content width, so every state gives different widths (99, 189, 213, 266, 299, 302, 303, 424 px) and different wraps; the right edges of Microphone select, Voice select and the grey panel above never coincide (1440 dark: 767, 847, 862).
- Where: `settings/controls/SampleOutputBody.tsx:105-149`, `controls/MicBody.tsx:59-77`
- Severity: looks wrong
- Fix: one field class (`w-full max-w-md`) for both selects and one button row under each.
- Evidence: `settings/recording-sample-output-builtin/w1280.png` (y 280-340), `settings/recording-builtin/w1280.png` (y 440-520), `dark:settings/recording-sample-output-builtin/small-desktop.png`
- Shared: page-local

### R4SE2-5 Descriptions wrap to a single orphan word ("takes.", "below.", "app.") while the card has 120-250 px free beside them

- Page / state: `recording-linked`, `recording-several`, `recording-not-installed`, `recording-builtin` and the other Record with states
- Widths: 768 ("takes." under "Where this project's recordings live. Changing it later does not move existing", 250 px free to its right), 1024 and 768 ("below." alone, "app." alone) (theme: both)
- Gut reaction: "why does one lonely word drop to its own line when there is room?"
- What is wrong: text is capped at about 60ch (445 px) while the card inner width is 735 px at 768; the linked panel above it ends at x 612, the radio descriptions at 593, the card at 735, so three different right edges. At 1024 the radio title "Built-in recorder. Recordings live in the app." breaks before "app." in a 245 px column.
- Where: the 60ch/52ch caps of XSE2-35 (see that finding for the class); radio label in `primitives/RadioGroup.tsx`
- Severity: looks wrong (1024 / 768), polish elsewhere
- Fix: `text-wrap: pretty` or `balance` on descriptions, and let the control column use the card width below 860 px.
- Evidence: `dark:settings/recording-linked/tablet.png` (y 180-330), `dark:settings/recording-linked/small-desktop.png` (y 40-270)
- Shared: SettingRow primitive

### R4SE2-6 Capabilities table text sits 8-10 px inside the column it hangs from and fills only the left half at 768

- Page / state: `recording-advanced`, `recording-reaper-path-invalid`
- Widths: 768 (text x 47 vs card title x 37; columns end x 405 of a 730 px card, right 45% empty), 1440 (table text x 540 vs the input and switch above at x 532) (theme: both)
- Gut reaction: "the table doesn't line up with the title or the inputs above it, and it stops half way."
- What is wrong: cells carry 8-10 px left padding so "Compare the recording with the manuscript" starts to the right of the REAPER path box and the Experimental switch that share its column; at 768 the three columns (WHAT 190, SETTING 100, NOW 90) use 400 px of a 695 px table with the rest blank; rows are 73 / 52 px.
- Where: `settings/controls/CapabilitiesBody.tsx` table (XSE2-4 owns the table; cell padding class not located)
- Severity: looks wrong
- Fix: first column flush at the column x (cell `pl-0`), WHAT takes the free width.
- Evidence: `dark:settings/recording-advanced/tablet.png` (y 640-740), `dark:settings/recording-reaper-path-invalid/desktop.png` (x 530-560, y 130-450)
- Shared: page-local (table cell padding)

### R4SE2-2 The clear (X) button inside a filled search field is a bordered 36 px square, a box inside a box

- Page / state: `search-results`, `search-empty`
- Widths: 768-1920 (theme: both; very visible in dark)
- Gut reaction: "the X looks like a second input pasted into the right end of the field."
- What is wrong: the field is 40.8 px high and the X is an outlined icon button with its own border, 4 px from the right edge and 2 px from top and bottom, so two borders sit 4 px apart; the focus ring wraps both. Reads as clutter rather than a quiet clear affordance.
- Where: `primitives/SearchField.tsx:40-52` (default bordered `IconButton` absolutely placed at `right: .25rem`)
- Severity: polish
- Fix: a borderless ghost icon button (no outline, hover fill only), 28 px.
- Evidence: `settings/search-results/w1280.png` (x 990-1020, y 70-95 real), `dark:settings/search-empty/small-desktop.png` (x 635-670, y 60-92)
- Shared: SearchField primitive (also used by the Booth speaker picker and manuscript search)

### R4SE2-7 The error banner sits between the breadcrumb and the page title, and the title jumps down 56 px

- Page / state: `save-failed`, `unreadable`
- Widths: 1280, 1440 (theme: both)
- Gut reaction: "the warning is wedged between 'Settings / App & updates' and its own heading."
- What is wrong: the amber banner (15 px bold line + 16 px body) is inserted after the breadcrumb and before the category title, so the breadcrumb is separated from the title by 56 px in this state only and the title y differs from every other state; XSE2-30 covers its size and inset, not its position.
- Where: `settings/page/SettingsPage.tsx:259-270` (banner rendered between `crumb` and `CategoryPane`)
- Severity: polish
- Fix: put the banner above the breadcrumb, or at the top of the pane header.
- Evidence: `settings/save-failed/w1280.png` (y 85-190)
- Shared: page-local

### R4SE2-8 Empty search state: a centred dashed box in a left-aligned page, the nav shows nothing selected, the 768 picker still names Recording & DAW

- Page / state: `search-empty`
- Widths: 1280, 1440 (nav, dashed box), 768 / 1024 (picker) (theme: both)
- Gut reaction: "an oddly small dashed box, then 450 px of nothing."
- What is wrong: the only dashed border and the only centred text in Settings; 60 px tall, with the hint words ("whisper", "voice", "reaper") plain text, not clickable; below it the page is blank for 450 px; at 768 the Category card above reads "RECORDING & DAW" for results that come from no category.
- Where: `settings/page/Results.tsx:27` (`border-dashed ... p-6 text-center`)
- Severity: polish (may be intended)
- Fix: left-align it like the rest, make the example words buttons that fill the search.
- Evidence: `settings/search-empty/w1280.png` (y 110-180), `dark:settings/search-empty/tablet.png`
- Shared: EmptyState primitive

### R4SE2-9 Category picker at 768 uses a solid text triangle and is 60 px tall; the top bar mixes outlined and filled icon buttons

- Page / state: all states at 768 and 390 (picker), 768 / 390 (top bar)
- Widths: 768, 390 (theme: both)
- Gut reaction: "a big heavy box with a black triangle, unlike every other dropdown that has a thin chevron."
- What is wrong: the Category card is a 60 px high box with a filled ▼ glyph at x 727, while selects use the native chevron and the Advanced disclosure uses a thin ›; in the top bar the menu button is outlined white and the search button filled grey, side by side, both 36 px.
- Where: `settings/page/CategoryNav.tsx:55-70` folded Category button (hand-drawn, "native-control-ok" comment at :55)
- Severity: polish
- Fix: use the same chevron icon and a 40.8 px height; one icon button style in the bar.
- Evidence: `dark:settings/search-empty/tablet.png` (y 120-180), `settings/recording-sample-output-daw/w390.png` (y 5-45)
- Shared: CategoryNav / top bar

### R4SE2-10 Disabled "Clear credits" and "Clear sample" look like two different button families

- Page / state: `project-credits-retail-sample-refused` (w1280, scrolled to the bottom of the card)
- Widths: 1280 (theme: light)
- Gut reaction: "a faded red outline and a faded grey one under the same card: which one is destructive?"
- What is wrong: both are disabled; Clear credits is `danger` (faded red text and border), Clear sample `secondary` (faded grey). They sit 60 px apart on one left edge in two different sub-cards, the first is 32 px wide of the Save sample / Clear sample row's grammar, the second follows a primary. Disabled treatments are too alike for either to read as a decision.
- Where: `settings/CreditsPanel.tsx:356-363` (danger), `settings/RetailSamplePanel.tsx:128-135` (secondary)
- Severity: polish
- Fix: one disabled style; keep Clear credits visually apart from Save/Clear sample.
- Evidence: `settings/project-credits-retail-sample-refused/w1280.png` (x 580-740, y 240-265 and 500-530)
- Shared: Button primitive disabled state

### R4SE2-11 The same "Experimental: switched off in Settings. Turn on Experimental DAW actions under Advanced, below." sentence sits under two radios

- Page / state: `recording-linked`, `recording-several`, `recording-not-installed`
- Widths: all (theme: both)
- Gut reaction: "I read the same two lines twice in a row."
- What is wrong: REAPER and Built-in options each repeat the identical 2-3 line sentence, so a 3-option radio holds two paragraphs of repetition and the third line ("Record is not available with Audacity yet.") is the only distinct one; at 1024 each copy is 3 lines (6 lines of identical text).
- Where: `dawAvailability.ts` supplies the string; `settings/controls/EngineBody.tsx` renders it under each option
- Severity: polish
- Fix: one note under the group ("REAPER and the built-in recorder are experimental: turn on ... under Advanced").
- Evidence: `dark:settings/recording-linked/small-desktop.png` (y 40-270)
- Shared: page-local

## Round 3: coverage gaps and scanner cross-check

### R3SE1-1 Download / install dialogs say everything twice, and the elapsed seconds float off the text line

- Page / state: `about-download-progress`, `about-download-failed`, `about-installing`
- Widths: all (checked w1920, w1280, dark 1024, dark 768) (theme: both)
- What is wrong: why does this box repeat itself? The sentence under the title ("The checksum in the release and GitHub's own record of the file disagree, so the update was not used.", "Downloading Narration Studio 0.2.7...", "Installing version 0.2.7. Narration Studio restarts in a moment.") appears again, word for word, in the grey "Live activity" box 60 px lower, so a narrator reads the same line twice; the log box is a fixed 144 px tall and under one or two lines the rest is an empty grey slab (about 90 px blank in all three states). The elapsed counter ("2s", "1s", "0s") is a smaller mono 12 px string pinned to the top-right and sits 2-3 px higher than the baseline of the status text it belongs to (dark 768: "2s" at y=394, sentence at y=397). In `about-installing` the explanatory line ("This step cannot be cancelled. Close appears when it finishes.") is a third text line above the status line with a different colour and spacing (12 px gap above, 8 px below).
- Where: `src/studio/ui/src/components/primitives/WorkDialog.tsx:67-75` (status row, `justify-between` with `text-sm` vs `text-xs` mono counter, no `items-baseline`), `:81-90` (`h-36` log box, logs fed from the same `job.message` by `settings/UpdateDownloadDialog.tsx:70-72`).
- Severity: looks wrong
- Fix: show the status line only once (hide the log until it has a second line or use the log alone), `items-baseline` on the status row, size the log box to its content with a 3-line minimum.
- Evidence: `settings/about-download-failed/w1280.png` (y 995-1190), dark `.../about-installing/tablet.png` (y 420-670), `about-download-progress/tablet.png` (y 400-620).
- Shared: WorkDialog primitive (also used by Proof compare runs).

### R3SE1-2 Entry types: each type is two evenly spaced rows, so the pairs are not visible

- Page / state: `deep-link`, `filter-project` (Project page, Entry types row)
- Widths: 1024-1920 (control column under 512 px), dark 1024 and dark 768 (theme: both)
- What is wrong: why do the rows look like one long unrelated list? Each type is a name box on one line and "colour select, Can speak, N entries, delete" on the next line, and the gap inside a type (about 40 px from box to select) is the same as the gap between two types (about 44 px from the select to the next name box), so a reader cannot tell which select belongs to which name. The coloured swatch is only on the name line. In the w1280 capture 6 types take about 400 px of height for 6 names; the right half of the select line is blank, and the "New type" box (190 px) and "+" sit on a third kind of row.
- Where: `src/studio/ui/src/components/settings/page/StoryBibleTypesPanel.tsx:65-100` (`flex flex-wrap`, breakpoint `@lg` = 512 px of the row's own column, which the half-width settings column never reaches).
- Severity: looks wrong
- Fix: one row per type (swatch, name, colour, Can speak, count, delete) in a grid; if it must stack, group each pair with a tinted block or a 20 px gap between types against 8 px inside.
- Evidence: `settings/deep-link/w1280.png` (y 800-910 of the pair crop), dark `deep-link/tablet.png` (y 40-215).
- Shared: page-local (StoryBibleTypesPanel). Related: XSE1-15, XSE1-1.

### R3SE1-3 Marks dialog: the two selects are 4 px taller than the name box and delete button in every row

- Page / state: `marks-dialog`
- Widths: 1920, 1280, dark 1024, dark 768 (also 1440/1024 by the same rule) (theme: both)
- What is wrong: why do the dropdowns stick out above and below the text box? In each of the six rows the name input and the red delete button are 36 px tall, the Colour and Line selects are 40.8 px, all centred on one line, so the select borders overshoot the neighbours by 2.4 px top and bottom (crop `crop:r3se1/mk1280.png`: input y 135-190, select y 130-193 at 1.6x). On a list of identical rows it reads as ragged.
- Where: `primitives/Select.tsx:48` (`h-[var(--control-height)]` = 40.8) against `script/page/tools/select/MarksDialog.tsx:69-95` (TextField, `IconButton` size md = `--button-height` 36).
- Severity: looks wrong
- Fix: one control height for the row (select and field both `--control-height`, or both 36); apply the same rule to Entry types (select 40.8 next to a 36 box, R3SE1-2).
- Evidence: `settings/marks-dialog/w1280.png` (y 150-440), dark `marks-dialog/small-desktop.png` (y 205-300).
- Shared: Select primitive vs TextField/IconButton heights (token mismatch).

### R3SE1-4 Microphone: Refresh button drops under the select when the column is narrow, unlike the Voice sample row

- Page / state: `folded-category-list` (Recording & DAW page), `filter-project`
- Widths: w1920, w1280 and 1024 (stacked); 768 (one row: A6, select 40.8 vs button 32 on one centre line, not visible in the capture) (theme: both)
- What is wrong: why is the button under the dropdown here and beside the hint in the next row? The select is 258 px and "Refresh the list" 112 px in a ~380 px control column, so the 8 px gap and the button just do not fit and the button wraps to its own line at x=700 (w1280), a different 112 px-wide small button 8 px under a tall select. Directly below, "Test sound" and its hint "Plays on the default output" share one line. Same button, two placements, and at 768 a third (inline, 8 px shorter than the select).
- Where: `settings/controls/MicBody.tsx:62-75` (`flex flex-wrap items-center gap-2`), compare `controls/SampleOutputBody.tsx:140-156`.
- Severity: looks wrong
- Fix: put the select and the Refresh button in one non-wrapping row (select `flex-1`), hint text below.
- Evidence: `settings/folded-category-list/w1280.png` (Microphone y 1315-1385 of the pair crop); scanner A6 `scan-out/settings/folded-category-list/w768.json`.
- Shared: page-local (MicBody).
- Scanner: A6

### R3SE1-5 Updates box: duplicate status lines, and the error sits above the button in one state and below it in another

- Page / state: `about-update-available`, `-ready`, `-install-blocked`, `-install-refused`, `about-check-failed`, `about-development-build`
- Widths: all (w1920, w1280, dark 1024, dark 768) (theme: both)
- What is wrong: why does this read like five loose lines? In `-ready` the box shows "Version 0.2.7 is available" (bold), "A release candidate - 400 MB" (muted), "Version 0.2.7 is downloaded and checked." (regular, repeating the first line) and a 12 px "Last checked 2026-09-21 UTC", four type styles in 150 px. In `-install-blocked` the long explanation paragraph (two lines) lands between the status and the "Last checked" line, so the date line is stranded between a paragraph and the buttons. Failures change position: in `about-check-failed` the red "Could not reach GitHub..." is above the Check now button, in `about-install-refused` the red "Narration Studio is busy..." is below the buttons, 16 px under the Check now row. The check-failed message is also not under the "Updates" heading in the same weight as "Version ... available".
- Where: `settings/UpdatesPanel.tsx:108-160` (status lines in a `space-y-2` region, `errorAlert` rendered after the button rows at `:161`, `status.failure` in the region at `:139-141`).
- Severity: looks wrong
- Fix: one status headline, one muted detail line, the date in the same line as the detail ("Release candidate - 400 MB - checked 21 Sep"), the buttons next, and every error in the same place (directly under the headline).
- Evidence: `settings/about-install-refused/w1280.png` (y 1130-1400 of the pair crop), `about-check-failed/w1280.png` (y 1245-1345), dark `about-install-blocked/tablet.png` (y 700-1000).
- Shared: page-local (UpdatesPanel). Related: XSE1-6, XSE1-7.

### R3SE2-1 Unselected radio buttons are faint grey dots with no outline

- Page / state: every state with a radio: `recording-*` (Record with, Start tone), `voice` / `voice-key-saved` (Show definitions from), reader-text (Motion), `unreadable`
- Widths: all (theme: both, worse in dark)
- Gut reaction: "which of these can I click? The unselected options look like disabled grey dots, not radio buttons."
- What is wrong: the unselected radio is a 16 px disc filled `--surface-3` with a `--border` ring, about 1.3:1 against the card in light (disc about rgb 221,216,205 on 251,250,247) and about 1.35:1 in dark (disc 54,48,35 on 29,26,21, the ring is the same colour as the fill so no outline shows). Only the selected one has a ring. Next to the 15 px label text they read as bullets or a disabled state.
- Where: `primitives/RadioGroup.tsx:66` (`border-[var(--border)] bg-[var(--surface-3)]`)
- Severity: looks wrong
- Fix: draw the unselected radio with an empty `--surface` fill and a `--line-strong` ring (3:1 or better), keep the filled dot for selected.
- Evidence: `settings/page-top/w1920.png` (x about 970, y 330-440), `dark:settings/recording-builtin/small-desktop.png` (radios at left of the options), `settings/voice/w1920.png` (y 570-650)
- Shared: RadioGroup primitive

### R3SE2-2 Nav group labels sit midway between groups, and ELSEWHERE has 5 px more room than the others

- Page / state: every state at 1024 and wider (the category nav card)
- Widths: 1920, 1440, 1280, 1024 (theme: both)
- Gut reaction: "does THIS PROJECT belong to the item above it or the one below? And why is ELSEWHERE spaced differently?"
- What is wrong: each small group label is 32-33 px below the last item of the group above and 31-32 px above its own first item, so the label does not visibly attach to its group (measured at 1920: DELIVERY to THIS PROJECT 33 px, THIS PROJECT to PROJECT 32 px, PROJECT to THIS COMPUTER 33 px). The last group label ELSEWHERE is 38 px below APP & UPDATES: the three data groups carry `first:pt-1` (each label is the first child of its own wrapper, so every one gets 4 px, not only the first group) but the ELSEWHERE label does not, so it has 10 px.
- Where: `settings/page/CategoryNav.tsx:70` (`pt-2.5 ... first:pt-1` on each group label) versus `:79` (same classes without `first:pt-1`); the intent was a small top inset only on the first label.
- Severity: looks wrong
- Fix: space between groups (`mt-3`) larger than between a label and its items (`pb-1`), apply the 4 px only to the first group, and give ELSEWHERE the same rule.
- Evidence: `settings/page-top/w1920.png` (x 0-230, y 355-590 real), `dark:settings/speech/small-desktop.png` (left card)
- Shared: CategoryNav (page-local)

### R3SE2-3 "Reset Recording & DAW to defaults" is a 16 px underlined black link that floats above the title baseline

- Page / state: `recording-builtin`, `recording-sample-output-builtin`, `recording-sample-output-long-name`, `recording-sample-output-daw` and any state where the category has a changed setting
- Widths: all, seen at 1920 (builtin, scrolled 25 px) and the 768 half of the dark composite for recording-builtin (theme: both)
- Gut reaction: "why is there a big underlined sentence in the corner, in a different font from every other link?"
- What is wrong: the link is the app's one 16 px body-font link, bigger than the 13 px meta links and the 13 px breadcrumb, and its text centre sits about 6 px above the centre of the 30 px category title next to it (1920: link y about 168, title y about 174; the title and link are `items-start`, not baseline aligned). Long label "Reset Recording & DAW to defaults" is as wide as the title.
- Where: `settings/page/CategoryPane.tsx:67` (`<Button variant="link">` inherits 16 px; wrapper `items-start` at `:60`)
- Severity: looks wrong
- Fix: make it a small secondary text button (13 px, muted, 28 px high) in the section header, `items-center`, label "Reset to defaults".
- Evidence: `settings/recording-sample-output-builtin/w1920.png` (x 1160-1410, y 160-180), `dark:settings/recording-builtin/small-desktop.png` right half (y 60-75)
- Shared: CategoryPane

### R3SE2-4 Error toast lands on top of page content and repeats the banner; its Dismiss X is 17 x 20

- Page / state: `unreadable`
- Widths: 1280, 1024, 768 (and 1440 per dark d1440 composite) (theme: both)
- Gut reaction: "a black box is sitting on the page hiding part of the card, and it says the same thing as the red banner."
- What is wrong: the toast ("The settings file could not be read: it is not valid JSON") sits bottom right at 1024 over the Connection card, covering the "REAPER linked" badge and the first line of its text (scanner W4: 87 x 22 badge overlapped 67 x 8 px by the toast); at 1280 it covers the right end of the card's buttons row. The red banner at the top of the pane already says it. The X to dismiss it is 17 x 20 (H1), smaller than the 36 px toast it closes.
- Where: `primitives/Toast.tsx:52-73` (toast content, `<button aria-label="Dismiss message" className="flex-none">` has no padding); the banner is `settings/page/SettingsPage.tsx:259-270`.
- Severity: looks wrong
- Fix: do not raise a toast for a state the banner already shows; give the toast X a 32 px hit area.
- Evidence: `settings/unreadable/w1280.png` (x 750-1083, y 632-670), `settings/unreadable/w1024.png` (crop x 300-1024, y 700-768), `crop:r3se2/z2.png`
- Scanner: W4, H1
- Shared: Toast primitive

### R3SE2-5 Models cards at 1024 and 768 are four-line stacks that use 40% of their width

- Page / state: `models-remove-refused`, `models-remove-confirm`
- Widths: 1024, 768 (seen in dark; the layout is the same in light) (theme: both)
- Gut reaction: "every model is a tall card with a lot of empty space to the right, so five items fill two screens."
- What is wrong: below the 1020 px container width the table turns into one card per asset: name + size, a "STATUS" line, an optional "In use" line, a "USED BY" line and an icon button alone on a last row. The content stops at about x=410 of a 670 px card (1024) so the right 40% is empty, and each card is about 140-170 px tall (the table row it replaces is 50 px). At 1024 the container is 672 px, wide enough for name + status + actions on one row.
- Where: `settings/models/AssetRow.tsx:98-113`, `page/ModelsPane.tsx:190` (`@max-[1020px]` card switch)
- Severity: looks wrong
- Fix: lower the card breakpoint (about 640 px), or put STATUS and the action in a two-column card (name left, status and button right).
- Evidence: `dark:settings/models-remove-refused/small-desktop.png` (card column), `dark:settings/models-remove-confirm/tablet.png`
- Shared: Models table/card pattern (see also XSE2-27)

### R3SE2-6 Credits template select reads "Chapter announcement (Chapter announcement)" and is cut at "(Chapter an"

- Page / state: `project-credits-chapter-announcement`
- Widths: 1920, 1440, 1280 (full "Chapter announcement (Chapter announcement)"), 1024 (cut at "(Chapter an", dark composite left half) (theme: both)
- Gut reaction: "why is the name said twice?"
- What is wrong: the option label is built as name + "(kind)". The dedupe only skips when the name already contains the "(kind)" text, so a template named exactly like its kind prints it twice. In the Name field right below it says "Chapter announcement" a third time.
- Where: `settings/CreditsPanel.tsx:17-20` (`templateLabel`)
- Severity: looks wrong
- Fix: skip the suffix when the name equals the kind label (case-insensitive) as well.
- Evidence: `settings/project-credits-chapter-announcement/w1920.png` (x 685-1050, y 810-850), `dark:settings/project-credits-chapter-announcement/small-desktop.png` (left half, template select)
- Shared: page-local

### R3SE2-7 Retail sample summary repeats the chapter title and breaks mid-phrase; the refusal shows "24282 words"

- Page / state: `project-credits-retail-sample`, `project-credits-retail-sample-refused`
- Widths: 1920, 1440, 1280, dark 1024, dark 768 (theme: both)
- Gut reaction: "that sentence is a wall: the chapter name is printed twice and the second line starts with a dash."
- What is wrong: "Chapter 3 - A Caucus-Race and a Long Tale, line 1 to Chapter 3 - A Caucus-Race and a Long Tale, line 3: 205 words, about 1m 19s." is 16 px dark text, wraps after "Chapter 3" so line 2 begins with the dash, and leaves "19s." alone on line 3 (1920/1280). It is 16 px dark while the paragraph above it is 13 px muted. The refusal in the refused state says "this range is 24282 words, about 2h 36m" with no thousands separator, while the same page formats 29,189 words.
- Where: `settings/RetailSamplePanel.tsx:96` (string with both titles, `toLocaleString` used for the count); the red refusal text arrives from the host (not formatted in the UI; cause not found in this component).
- Severity: looks wrong
- Fix: "Chapter 3, lines 1-3 (205 words, 1 min 19 s)" when start and end chapter match; format numbers the same way everywhere.
- Evidence: `settings/project-credits-retail-sample/w1920.png` (x 685-1052, y 665-715), `settings/project-credits-retail-sample-refused/w1920.png` (y 865-900)
- Shared: page-local

### R3SE2-8 The narrator can be typed in two places on the same screen

- Page / state: `project-credits`, `project-credits-chapter-announcement`, `project-credits-retail-sample*`, `project-data-confirm`
- Widths: all (theme: both)
- Gut reaction: "I already filled in Narrator name above, why does the credits form ask again?"
- What is wrong: the Narrator name row (empty box, "Also set in Credits setup dialog") is 900 px above the credits form's own "Narrator (override the global default)" box. Two boxes for the narrator with different labels (the form box shows "Ada Finch" in the retail-sample captures; the row above was out of view there, and empty in the chapter-announcement capture), so a user cannot tell which one wins.
- Where: `settings/CreditsPanel.tsx:45` (`narrator` in `VALUE_FIELDS`) and the Narrator name settings row in `registry/rows.ts` (same value).
- Severity: looks wrong
- Fix: keep one narrator control (the settings row) and show it in the credits form as a read-only line with an Edit link, or drop it from `VALUE_FIELDS`.
- Evidence: `settings/project-credits-chapter-announcement/w1920.png` (y 610-700 vs the credits form below), `settings/project-credits-retail-sample/w1920.png` (Narrator field y 490-525)
- Shared: page-local. May be intended (one is a per-project override); the labels do not say so.

### R3SE2-9 "Use suggestion" wraps to two lines inside a 103 px button

- Page / state: `project-credits` (every Project values field with a detected value), `project-credits-retail-sample-refused`
- Widths: 1920, 1440, 1280, 1024, 390 (scanner: button 103 x 36.3 at 1440, 94.7 x 36.3 at 1024; a 28 px button with a wrapped label) (theme: both)
- Gut reaction: "a small button with its label stacked on two lines beside a sentence."
- What is wrong: the button sits in a `flex items-center gap-2` row with a long "Detected from ... " sentence, the sentence takes the width and the sm button shrinks until "USE / SUGGESTION" wraps and the button grows from 28 to 36 px. This row is below the visible part of every capture of those states, so I confirmed it only from the DOM measurement (scanner W1/A4), not on a screenshot.
- Where: `settings/CreditsPanel.tsx:346-350` (`<Button size="sm">` in a flex row without `flex-none`/`whitespace-nowrap`)
- Severity: looks wrong
- Fix: `flex-none whitespace-nowrap` on the button and let the sentence wrap.
- Evidence: scanner raw `scan:settings/project-credits/w1440.json` (W1 "Use suggestion", rect 1275,1528,103x36); no screenshot shows it.
- Scanner: W1, A4
- Shared: page-local

### R3SE2-14 The REAPER radio, the connection card and the card's own note say the same thing, and contradict each other

- Page / state: `recording-not-installed`, `recording-linked`, `recording-found`, `recording-several`
- Widths: all (theme: both)
- Gut reaction: "it tells me three times, and the first two lines disagree with the card."
- What is wrong: not-installed: the REAPER option reads "REAPER was not found on this computer. Install it, or set where it is under Advanced..." then "Experimental: switched off in Settings. Turn on Experimental DAW actions under Advanced, below." and the grey card below says again "REAPER was not found on this computer. Install it, or choose another recorder." Linked/several/found: the radio says "Experimental: switched off in Settings" while the card beside it shows "REAPER linked ... REAPER is open and answering" and an active Test connection. Each radio carries two to four lines of grey text, making the option 90-115 px tall.
- Where: `settings/controls/EngineBody.tsx` (option notes) and the connection card; capability sentence from the host.
- Severity: looks wrong
- Fix: one status sentence per option; show the experimental-off reason once, on the card, only when it blocks the action.
- Evidence: `settings/recording-not-installed/w1920.png` (x 675-1065, y 255-610), `settings/recording-linked/w1920.png` (y 255-590)
- Shared: page-local

### R3SE2-15 Stacked layout (1024 and 768): the control starts with no gap under the meta line

- Page / state: `recording-found`, `recording-sample-output-*`, `speech*`, `voice*` (any row at 1024 or below)
- Widths: 1024, 768 (theme: both)
- Gut reaction: "the box under the description looks like part of the description."
- What is wrong: below the 761 px container the label block and the control column stack with no divider and only 4-8 px between the last meta line ("This project  Used by Booth Editing ...") and the control (for example Voice sample output in the DAW states: the 15 px sentence "Voice samples play on this computer's default output..." starts directly under "Used by ..." with the same left edge, so it reads as a third meta line; Microphone select starts 8 px under "Also set in Booth > Levels menu"). At 1920/1440 the same elements are separated by a whole column.
- Where: `settings/row/SettingRowView.tsx:49-60` (single-column mode, gap not set between the two blocks)
- Severity: looks wrong
- Fix: 12-16 px gap, or put the control directly under the title and the meta line after it.
- Evidence: `dark:settings/recording-found/tablet.png` (right half, y 560-600), `settings/page-top/w768.png` (y 420-440, 880-930)
- Shared: SettingRowView

### R3SE2-16 DAW sentence beside Test sound is 15 px dark text, bigger and darker than the row's notes

- Page / state: `recording-found`, `recording-linked`, `recording-not-installed`, `recording-several`, `unreadable` (Voice sample output with a DAW)
- Widths: 1920, 1440, 1280 (and 1024, 768 stacked) (theme: both)
- Gut reaction: "this line looks like a heading for the button, but it's the explanation."
- What is wrong: "Voice samples play on this computer's default output. REAPER's own audio device is not used or changed." is body-size primary text (15 px, `--text`), while every other control note in the same card ("Where voice samples play...", "Plays on the default output") is 13 px muted. It is also the only row whose right column starts with text instead of a control.
- Where: `settings/controls/SampleOutputBody.tsx:23,104,119` (`dawSentence`, `sm:max-w-[52ch]`)
- Severity: looks wrong
- Fix: render it as the muted 13 px note under the Test sound button.
- Evidence: `settings/recording-linked/w1920.png` (x 675-1050, y 740-780), `settings/unreadable/w1920.png` (y 830-855)
- Shared: page-local

### R3SE2-18 App & updates: the About card has no section label and its inner boxes sit on three different left edges

- Page / state: `save-failed` (App & updates)
- Widths: 1920 (seen), dark 1024/768 for the rows above (theme: both)
- Gut reaction: "this card after NOTIFICATIONS has no heading and its text doesn't line up with the rows above."
- What is wrong: UPDATES and NOTIFICATIONS have labels, the About card that follows does not. Inside, the grey "Narration Studio / Version 0.2.6" box edge is at x about 275 and its text at about 287, the licence sentence below it starts at x=275 (flush with the box edge, not its text), and the row titles above start at x about 279; so box edge, box text, loose paragraph and row text are four different left edges within 12 px. The Updates grey panel is nested again inside the card with its own padding.
- Where: `settings/AboutPanel.tsx`, `settings/UpdatesPanel.tsx` (embedded via `extra` in `page/CategoryPane.tsx:79`)
- Severity: looks wrong
- Fix: add an "About" section label; one inset for card content; no panel-in-panel.
- Evidence: `settings/save-failed/w1920.png` (x 235-1085 scaled, y 700-960 scaled)
- Shared: page-local. Supersedes nothing (see round 1 SET-20, which this confirms).

### R3SE1-6 Dates in three formats for the same events

- Page / state: `import-choose`, `manuscript` (Project page), all `about-*`
- Widths: all (theme: both)
- What is wrong: the Manuscript row says "Imported Jan 1 - 29,189 words" (behind the dialog, y=196 at w1920) while the dialog opened from it says "Replaces the manuscript imported 1/1/2026." (y=304), and the update box says "Last checked 2026-09-21 UTC". A narrator sees "Jan 1", "1/1/2026" and an ISO date with "UTC" in one session; the UTC date also looks like a log line next to prose.
- Where: `settings/ManuscriptSection.tsx:9` (`en-US` month and day), `production/ManuscriptImport.tsx:232` and `production/ImportChooseDialog.tsx:60` (`toLocaleDateString()`), `settings/UpdatesPanel.tsx:13-14` (`slice(0, 10) UTC`).
- Severity: polish
- Fix: one helper (`Jan 1, 2026`, local time) for all three.
- Evidence: `settings/import-choose/w1920.png` (y 190-200 and 304), dark `about-update-available/tablet.png` (y 812).
- Shared: page-local (3 call sites).

### R3SE1-7 On/off switch is a 36 x 20 px target

- Page / state: every state with a switch row (`app`, all `about-*`, `deep-link`, `filter-changed`, `delivery-profile-editor` toggles, `folded-category-list`)
- Widths: all (theme: both)
- What is wrong: the visible track is 36 x 20 px, under the 24 px minimum in both dimensions of height; it sits beside the label "On" which is separate text.
- Where: `primitives/Switch.tsx:24` (`h-5 w-9`).
- Severity: polish
- Fix: pad the hit area to 44 x 24 (negative-margin wrapper) or make the label part of the control.
- Evidence: `settings/app/w1280.png` (switch at the Check for updates row); scanner `#29`.
- Shared: Switch primitive.
- Scanner: H1

### R3SE1-8 "Used by <page>" links are 18.7 px high text buttons

- Page / state: every settings row with a Used-by line (`app`, `appearance`, `deep-link`, `delivery`, `filter-project`, `global-keyboard*`, `models*`, all `about-*`)
- Widths: all (theme: both)
- What is wrong: each page name is an underlined inline button 18.7 px high and 30-70 px wide ("Proof" 29.9 x 18.7, "Script" 32.8 x 18.7), set 4 px apart in a run of 4-6; the painted text is the whole target and neighbours are 4-6 px away.
- Where: `settings/row/SettingRowView.tsx:32-45` (inline button, no padding).
- Severity: polish
- Fix: `py-1` with matching negative margin, or a 24 px min height for each link.
- Evidence: `settings/appearance/w1280.png` (Used by lines y 242, 356 of the pair crop); scanner `#30-#35, #37, #40, #42, #44`.
- Shared: SettingRowView.
- Scanner: H1

### R3SE1-9 Top-bar REAPER status chip is 22 px high

- Page / state: every state (top bar)
- Widths: 1920-1280 (and every width the chip shows) (theme: both)
- What is wrong: the "REAPER: Linked" pill is 67.5 x 22 px and is a button.
- Where: top-bar chip, `button.inline-flex.h-[1.375rem]` (found by scanner `#28`, component under `components/layout`, cause not located further).
- Severity: polish
- Fix: 24 px minimum hit area (padding or `min-h-6`).
- Evidence: `settings/app/w1280.png` (top right, y 770-790 of the pair crop).
- Shared: top bar (not settings).
- Scanner: H1

### R3SE1-10 "Override for this project" link is 19.5 px high

- Page / state: `appearance`, `deep-link`, `global-keyboard*` (Note colour, Narrator name, Build Story Bible, Language)
- Widths: all (theme: both)
- What is wrong: 138 x 19.5 px underlined inline button placed after the sentence "This project uses the computer setting."
- Where: row scope note in `settings/ScopedSetting.tsx` / `SettingRowView` (inline underline button).
- Severity: polish
- Fix: as R3SE1-8.
- Evidence: `settings/deep-link/w1280.png` (Narrator name row, y 1188 of the pair crop); scanner `#36, #38, #39, #41`.
- Shared: ScopedSetting.
- Scanner: H1

### R3SE1-11 "Show the whole category" link is 19.5 px high and a third text style

- Page / state: `filter-changed`, `filter-project`
- Widths: all (theme: both)
- What is wrong: 157 x 19.5 px bold, letter-spaced, underlined text button on the group label line (already noted as a style oddity in XSE1-22); target is under 24 px.
- Where: `settings/page/Results.tsx` (group header).
- Severity: polish
- Fix: normal link style, `min-h-6`.
- Evidence: `settings/filter-changed/w1280.png` (y 885-895 of the pair crop); scanner `#43`.
- Shared: page-local.
- Scanner: H1

### R3SE1-12 Note colour: the swatch button is 37.6 px, the hex box 36 px

- Page / state: `appearance`, `global-keyboard*` (Note colour row)
- Widths: all (theme: both)
- What is wrong: the colour swatch is a 2.35 rem (37.6 px) square beside a 36 px hex input, so the swatch overshoots by 0.8 px top and bottom; in the 4x crop (`crop:r3se1/note.png`) the swatch box is visibly larger than the text box and its inner colour square is not centred on the text.
- Where: `primitives/TextField.tsx:11` (`COLOR_CLASSES size-[2.35rem]`) against the text field height.
- Severity: polish
- Fix: make the swatch `h-9 w-9` (control height token).
- Evidence: `crop:r3se1/note.png`; `settings/appearance/w1920.png` (y 940-985).
- Shared: TextField colour variant.
- Scanner: A6

### R3SE1-13 Import review row titles are 20 px high buttons that look like text

- Page / state: `manuscript`
- Widths: 1920, 1440, 1280, 1024, 768 (theme: both)
- What is wrong: the chapter title ("Chapter One - Down the Rabbit-Hole") is the button that opens the preview, drawn as plain bold text 20 px high and 500-600 px wide next to a 40.8 px select; nothing shows it is clickable, and the target is half the select next to it.
- Where: `production/ImportReview.tsx:155-215` (`button.min-w-0.flex-1.truncate`).
- Severity: polish
- Fix: row-height (40 px) hit area with a hover tint.
- Evidence: `settings/manuscript/w1280.png` (rows y 1093-1255 of the pair crop); scanner `#45-#49, #51, #53, #54`.
- Shared: ImportReview (also Production import).
- Scanner: H1

### R3SE1-14 The two "i" help buttons in the import review are 15 x 15 px

- Page / state: `manuscript` (Front matter and Reference material group headers)
- Widths: all (theme: both)
- What is wrong: 15 x 15 px circled-i buttons at the far right of the group header, 650 px from the label they explain; a 15 px target for help.
- Where: `production/ImportReview.tsx` (`button.ml-1.inline-flex.size-[15px].cursor-help`).
- Severity: polish
- Fix: 24 px hit area; put the icon next to the group name.
- Evidence: `settings/manuscript/w1280.png` (y 1296 of the pair crop; dark 768 `manuscript/tablet.png` (x 626, y 678 and 768)); scanner `#50, #52`.
- Shared: ImportReview.
- Scanner: H1

### R3SE1-15 Start tone is a two-radio Off/On pair where every other on/off setting is a switch

- Page / state: `folded-category-list`, `filter-project` pages (Recording & DAW, Take cues; visible at the bottom of the w1920 and w1280 captures of Recording)
- Widths: all (theme: both)
- What is wrong: a narrator scanning the page sees switches ("Check for updates", "Tell me when a long task finishes", "Build the Story Bible"), checkboxes ("Can speak", "Asks", "Offer better analysis") and here a radio pair "Off / On" for the same kind of yes/no, three controls for one idea. With the unselected-radio blob (XSE1-25) it also takes 50 px of height for two words.
- Where: `settings/controls/TakeToneBody.tsx:19` (RadioGroup with 2 options).
- Severity: polish (may be intended: the choice plays a sound when turned on)
- Fix: a switch, with the hint "Plays once when turned on".
- Evidence: `settings/folded-category-list/w1920.png` (y 670-700 of the pair crop).
- Shared: page-local.

### R3SE1-16 Changed-row accent bar lies on the card border and stops short of the corners

- Page / state: `filter-changed`
- Widths: all (theme: both)
- What is wrong: a 3 px blue bar is drawn on the card's left edge, replacing the 1 px border there, starting 10 px under the top edge and ending 10 px above the bottom edge, so the rounded corner curves away from a bar that does not follow it (crop `crop:r3se1/bar.png`, `bar-top.png`); the border line looks interrupted rather than the card being marked.
- Where: `settings/row/SettingRowView.tsx:96` (`absolute inset-y-2.5 left-0 w-[3px]`).
- Severity: polish (may be intended)
- Fix: inset the bar 1 px inside the border or draw it as a left border on the whole card.
- Evidence: `settings/filter-changed/w1280.png` (card left edge, y 905-1010 of the pair crop).
- Shared: SettingRowView. Related: XSE1-21.

### R3SE1-17 Narrator name: an empty 320 px box with no placeholder

- Page / state: `deep-link`, `filter-project`
- Widths: all (theme: both; clearest in dark 768)
- What is wrong: with no value the row shows a bare empty box under the label and "This project uses the computer setting." on the line below; nothing in the box says what to type, so it looks like a broken or missing field.
- Where: `settings/row/ValueControl.tsx:165-176` (placeholder only for `daw.reaperPath`).
- Severity: polish (may be intended)
- Fix: placeholder "Your name as the narrator".
- Evidence: dark `dark:settings/deep-link/tablet.png` (y 605-640); `settings/deep-link/w1280.png` (y 1140-1170 of the pair crop).
- Shared: ValueControl.

### R3SE2-10 "Used by <page>" links are 19-21 px tall, 30-70 px wide

- Page / state: all category states (24 states carry them)
- Widths: all (theme: both)
- Gut reaction: "tiny underlined words I have to aim at."
- What is wrong: each page name in the "Used by" meta line is its own button (18.7 px tall in cards, 21 px in the Models table, widths 30-70 px), six to ten in a row with 6-8 px gaps, below the 24 px minimum. May be intended (inline text links).
- Where: `settings/row/SettingRowView.tsx:32-39`, `settings/models/AssetRow.tsx:74`
- Severity: polish
- Fix: pad each link to a 24 px high hit area (`py-[3px]`, `-my-[3px]`).
- Evidence: `settings/page-top/w1920.png` (y 310-330, "Used by Booth Editing Pickups Proof Master & QC")
- Scanner: H1
- Shared: SettingRowView

### R3SE2-11 Inline action links are 19.5 px tall: Override for this project, Use computer setting, Models & downloads, Show the whole category

- Page / state: `speech*`, `voice*`, `project*`, `override`, `reader-text`, `search-results`, `speech-model-offer`
- Widths: all (theme: both)
- Gut reaction: "the way to override a setting is a tiny underlined sentence."
- What is wrong: these links are the only way to start an override or leave the page; each is 124-157 px wide and 19.5 px tall (H1). May be intended (inline text links), but they are actions, not references.
- Where: `settings/row/SettingRowView.tsx:137-165`, `row/AssetNote.tsx`, `page/Results.tsx`
- Severity: polish
- Fix: same 24 px hit-area padding as R3SE2-10.
- Evidence: `settings/speech/w1920.png` (x about 1060-1180, y 295-310 scaled)
- Scanner: H1
- Shared: Button link variant

### R3SE2-12 Top-bar REAPER status chip is 67 x 22

- Page / state: all states (24 variants of "REAPER: Linked / Open the engine panel")
- Widths: all (theme: both)
- Gut reaction: "a small pill that is also a button."
- What is wrong: the chip is a button 67.5 x 22 px at the right of the top bar, under 24 px in height (H1). It is shell chrome shared by every page.
- Where: `primitives/HeaderChip.tsx:21` (`h-[1.375rem]`)
- Severity: polish
- Fix: 24 px minimum height, or a 28 px hit area behind the 22 px look.
- Evidence: `settings/recording-found/w1920.png` (top right, y 14-36)
- Scanner: H1
- Shared: HeaderChip

### R3SE2-13 Switches are 36 x 20 and the info icon 15 x 15

- Page / state: switches in 17 states (Two-pass check, Build the Story Bible, Experimental DAW actions, Check changed chapters); info icon in `pages-panel-open`
- Widths: all (theme: both)
- Gut reaction: "the small control to flip a setting is smaller than the 36 px buttons next to it."
- What is wrong: the switch track is 36 x 20 (H1) beside 40.8 px selects and 32 px buttons; the (i) icon in the Recording check panel is 15 x 15 with 4 px margin and wraps to its own line at 1280/768 ("Share of each paragraph that must be read" then (i) alone).
- Where: `primitives/Switch.tsx:24` (`h-5 w-9`), `primitives/Tooltip.tsx:115` (`size-[15px]`)
- Severity: polish
- Fix: extend the clickable area to 24 px or more, keep the (i) glued to the last word.
- Evidence: `settings/speech-advanced/w1920.png` (switch y 440-465), `settings/pages-panel-open/w1280.png` (info icon y 460-485)
- Scanner: H1
- Shared: Switch and Tooltip primitives

### R3SE2-17 Invalid REAPER path keeps a blue focus box while the message under it is red

- Page / state: `recording-reaper-path-invalid`
- Widths: 1920 (seen), other widths per round 2 (theme: both)
- Gut reaction: "the box that's wrong is the one blue box on the page; the red is only in the message."
- What is wrong: the field with the invalid path (`...\notes.txt`) draws the normal 2 px blue focus ring and a normal border; only the helper text beneath goes red with an icon. At 1920 the ring also runs 10 px to the left of the "Used the next time..." text because the box is wider than the column (see XSE2-1).
- Where: `settings/controls/ValueControl.tsx:175` (input has no `aria-invalid` border state)
- Severity: polish
- Fix: danger-coloured border on `aria-invalid`.
- Evidence: `settings/recording-reaper-path-invalid/w1920.png` (x 675-1060, y 150-250 scaled)
- Shared: ValueControl

### R3SE2-19 `unreadable`: the Microphone row is an empty row

- Page / state: `unreadable`
- Widths: 1920 (seen) (theme: both)
- Gut reaction: "a setting with a title and nothing to set."
- What is wrong: with the settings file unreadable, the Microphone row keeps its title and description but its right column is empty (no select, no Refresh, no explanation) while the neighbouring rows still show disabled controls. At 1920 the row is a 100 px band with half of it blank.
- Where: cause not found (`settings/controls/MicBody.tsx:59-77` is the Microphone body; why it renders nothing while the store is broken was not traced)
- Severity: polish
- Fix: render the same disabled select as the other rows.
- Evidence: `settings/unreadable/w1920.png` (y 720-810 scaled)
- Shared: page-local

### R3SE2-20 Preview voice is named two ways on the same row

- Page / state: `voice`, `voice-key-saved`
- Widths: 1920, 1280 (theme: both)
- Gut reaction: "is that the same voice?"
- What is wrong: the select says "LJ Speech (US English, high)" and the sentence under it says "LJ Speech (U.S. English) must be downloaded before it is used.", with "US" vs "U.S." and the quality suffix missing.
- Where: cause not found (option label comes from the voice list, the sentence from `settings/row/AssetNote.tsx`)
- Severity: polish
- Fix: one name source for both.
- Evidence: `settings/voice/w1920.png` (x 675-1010, y 255-330 scaled)
- Shared: page-local

## Round 2: strict review

### XSE2-1 REAPER program box runs out of its card and off the window

- Page / state: Recording & DAW > Advanced; `recording-advanced`, `recording-reaper-path-invalid`
- Widths: 1024 (box 688 to 1024+, card ends 1007), 390 (box from x=37 to 390+, scrolls sideways). At 1440 the box is 416 px wide and ends at x=1382, 8 px short of the column's right edge (1390) and not equal to the 264 px selects above it. (theme: both)
- What is wrong: "The path box sticks out of the card like a mistake": a fixed 26rem box in a 300 px (1024) or 316 px (390) column, the focus ring is cut at the window edge in the invalid state.
- Where: `src/studio/ui/src/components/settings/row/ValueControl.tsx:175` (`w-[26rem] max-w-full`), column in `SettingRowView.tsx:113` is shrink-to-fit so `max-w-full` clamps to nothing.
- Severity: breaks use
- Fix: `w-full max-w-[26rem] min-w-0` and `self-stretch` on the control column.
- Evidence: `settings/recording-advanced/w1024.png` (y 130-170, right edge), `.../recording-reaper-path-invalid/w1024.png`, `.../recording-advanced/w390.png` (y 245-270), `.../recording-reaper-path-invalid/w390.png`.
- Shared: SettingRowView text rows. Supersedes: SET-1

### XSE1-1 Half of every tall settings row is empty (label column vs control column)

- Page / state: `appearance` (Reader text), `global-keyboard*` (Shortcuts), `delivery`, `delivery-profile-custom` (Delivery profile), `folded-category-list` and `filter-project` (Record with), `deep-link` (Credits, Entry types)
- Widths: 1024, 1280, 1440, 1920 (theme: both). At 768 the same rows stack (label above control) and look consistent.
- What is wrong: why is half of this card empty? The label block is ~90 px tall and ends at y~650 while the control column runs to y~900 on Reader text; Shortcuts left text ends y=345 against a 540 px editor; Delivery profile left ends y=380 against a 14-line limits list to y=615; Record with ends y=350 against a radio list to y=617. The control column starts at the card midpoint (x=966 at 1440, x=688 at 1024), not after a 12-16rem label column as the design-system "Settings rows" section says.
- Where: `src/studio/ui/src/components/settings/row/SettingRowView.tsx:49` (`CELL`: `@min-[761px]:grid-cols-2`, no label-column cap, no full-width variant); description capped `max-w-[60ch]` at `:104`.
- Severity: looks wrong
- Fix: grid `minmax(12rem,16rem)_minmax(0,1fr)` and let wide bodies (Shortcuts, limits list, reader text, credits) span both columns below the label.
- Evidence: `appearance/w1440.png` (y 560-900); `global-keyboard/w1440.png` (y 270-860); `delivery/w1440.png` (y 250-640); `folded-category-list/w1440.png` (y 250-640); `deep-link/w1024.png` (Marks and Credits, left columns half empty).
- Shared: SettingRowView (every Settings row). Supersedes: SET-6

### XSE1-2 Selects and text boxes have a different width in every row

- Page / state: `app`, `delivery`, `delivery-profile-custom`, `appearance`, `global-keyboard`, `folded-category-list`, `deep-link`, `filter-project`
- Widths: 1024-1920 (theme: both); also visible at 768/390 (select stops at x=301 of a 353 gutter, narrator box ends x=357).
- What is wrong: the right edges do not line up, so the control column looks ragged: Update channel 264 px (x 966-1230), Delivery profile 260 (966-1226) and Default profile 247 (966-1213) in the same card, Microphone 303 (966-1269), Zoom 85 (966-1051), Reader text Font 425 (966-1391), Shortcuts "Find" box 425, Narrator name box 320 (966-1286), Entry types name box 218 and colour select 89 with the New type box 195.
- Where: `primitives/Select.tsx:37-48` (content-width default), `settings/row/ValueControl.tsx:104,175`, `controls/DeliveryBodies.tsx:48` (`max-w-[260px]`), `controls/MicBody.tsx`, `controls/AppearanceBodies.tsx`.
- Severity: looks wrong
- Fix: one field class (`w-full max-w-[16.5rem]` or the doc's `max-w-md`) used by every control.
- Evidence: `delivery/w1440.png` (selects y 267 and 703); `appearance/w1440.png` (Font select x 966-1391); `folded-category-list/w1440.png` (Microphone y 659-699).
- Shared: Select primitive + SettingRowView. Supersedes: SET-5

### XSE1-3 Shortcuts: a scrolling box inside a card inside a card, rows clipped at its bottom edge

- Page / state: `global-keyboard`, `global-keyboard-conflict`, `global-keyboard-recording`
- Widths: 1024, 1280, 1440, 1920 (also 768/390 where the box is 520 px tall) (theme: both)
- What is wrong: why is there a box with its own scrollbar-less edge inside this card? The Shortcuts row draws a bordered "Keys and pedals" panel (x 966-1391) inside the card, and inside that a 32 rem scroller that slices the last row in half ("Zoom in" at y 817-845 shows only the top of its chips and CHANGE). In the capture states the confirming buttons ("Replace / Try another key / Cancel", "Reset to default / Cancel") are cut through the middle at y~845 and the user must scroll the inner box to reach them. Three nested frames (card, panel, capture panel) with different paddings (card 20, panel 12, capture 12) and the panel's own heading, buttons and help text make a second page inside the row.
- Where: `controls/ShortcutsBody.tsx:17-20` (`max-h-[32rem] overflow-y-auto`), `KeyboardPanel.tsx:117-162` (capture panel), `:255-271`.
- Severity: looks wrong
- Fix: drop the nested scroller and panel frame (let the card grow, full width), or scroll the capture panel into view when it mounts.
- Evidence: `global-keyboard-conflict/w1440.png` (y 810-850); `global-keyboard-recording/w1440.png` (y 780-850); `global-keyboard/w1440.png` (y 800-850).
- Shared: page-local (KeyboardPanel). Supersedes: SET-10

### XSE1-4 Shortcut rows: the CHANGE button jumps between rows, wraps under the chips at 1024, and capture buttons stack ragged

- Page / state: `global-keyboard*`
- Widths: 1440 (Forward row), 1024 (Back, Forward rows), 390 (all rows), capture panels at 1024/768/390 (theme: both)
- What is wrong: CHANGE should be one column but it is not. At 1440 "Back" and "Open Settings" have CHANGE at x=1308-1378 but "Forward" (chips wrap) has it at x=1272-1342 on a second line under its label (row 93 px vs 61 px). At 1024 the chips of Back/Forward fill the line and CHANGE drops to its own row at the left (x=701), so label, chips and button are three rows. In the recording panel at 1024/390 the buttons are three ragged rows: "Replace / Add as another key", "Unbind / Reset to default", then "Cancel" alone at the far right; at 1440 conflict "Cancel" is separated from its siblings by 100 px of space.
- Where: `KeyboardPanel.tsx:261-271` (`flex flex-wrap items-center justify-between`; wrapped group left aligns), capture buttons `KeyboardPanel.tsx:117-162`.
- Severity: looks wrong
- Fix: fixed grid (label | chips | CHANGE) with `ml-auto` on the button group, and one wrapping button row with Cancel last.
- Evidence: `global-keyboard/w1440.png` (Forward y 655-720); `global-keyboard/w1024.png` (y 525-640); `global-keyboard-recording/w1024.png` (y 600-720).
- Shared: page-local. Supersedes: SET-9

### XSE1-5 Models table: action buttons do not share a right edge, columns jump between states, names wrap with space free

- Page / state: `models`, `models-downloading`, `models-empty`, `models-failed`, `models-needs-repair`
- Widths: 1280, 1440, 1920 (theme: both). Below 1020 px it is cards.
- What is wrong: the right-most buttons look randomly placed. In `models` the single download/trash buttons sit at x=1366-1402; in `models-needs-repair` the one-button rows sit at x=1326-1362 while the repair+remove pair sits at 1326-1402; in `models-failed` the same (1326-1362 vs 1326-1402). The Status column starts at x=858 (models), 934 (empty), 715 (failed), 841 (needs-repair) so the table is a different shape each state. Names wrap ("Open English WordNet 2025 (US English / dictionary)", "In use: Language model for the Story / Bible") while 100 px sits unused between columns; row heights vary 50/53/69/89 px (failed row grows to 69 with a 3-line red message in a 400 px cell). In `models-downloading` the row grows 5 px when the progress bar appears, so the rows move.
- Where: `models/AssetRow.tsx:98-99` (`w-px whitespace-nowrap` cell with `inline-flex`, no `justify-end`), `page/ModelsPane.tsx:190` (auto table layout, no column widths).
- Severity: looks wrong
- Fix: fixed column widths (name 40%, status 25%, used by 25%, actions 10%) and `justify-end` on the action cell.
- Evidence: `models-needs-repair/w1440.png` (actions x 1326-1402, y 390-600); `models-failed/w1440.png` (y 585-830); `models-empty/w1440.png` (status col x=934); `models/w1920.png`.
- Shared: Table primitive consumers, page-local layout. Supersedes: SET-8

### XSE1-6 Update buttons: "Check now" is on its own row below, Install/Release notes pair on the row above

- Page / state: `about-update-available`, `about-update-ready`, `about-install-blocked`, `about-install-refused`, `about-installing` (behind the dialog), `about-download-failed`
- Widths: all (1440: Install and restart x 517-667 and Release notes 679-794 on y=725, Check now alone at y=773, 48 px lower) (theme: both)
- What is wrong: why is the third button dropped onto its own line when 600 px is free beside it? Two secondary actions in one row and one in another make a ragged block (widths 150/115/91). In `about-install-blocked` the same, and "Show the downloaded file" (x 517-706) + "Release notes" + "Check now" give widths 189/115/91.
- Where: `UpdatesPanel.tsx:145` and `:154` (two separate `flex flex-wrap gap-3` rows).
- Severity: looks wrong
- Fix: one wrapping row containing all three; primary first, Check now last.
- Evidence: `about-update-ready/w1440.png` (y 705-790); `about-install-blocked/w1440.png` (y 780-870).
- Shared: page-local. Supersedes: SET-14

### XSE1-7 About card: boxes inside a box, uneven padding, licence line outside the grey panels, no section label

- Page / state: `app`, all `about-*`
- Widths: all (theme: both)
- What is wrong: the third card looks unfinished next to the two row cards above it. It is a white card holding two grey panels (version, updates) and one loose licence sentence between them; the grey panels start 16 px under the card top (y 683 in `app`) but the last one ends 32 px above the card bottom (803 vs 835 in `about-update-ready`); the panels' text starts at x=517 while the licence line starts at x=505 and the rows above use 509. It has no section label (the cards above are "UPDATES" and "NOTIFICATIONS"), no row grid (label/value) and its text is 14 px where rows use 15/13. The whole card is one 900 px wide column of left-aligned text with the right half empty.
- Where: `AboutPanel.tsx:12` (`mb-4`), `UpdatesPanel.tsx:108` (`mb-4`) inside `controls/AboutSection.tsx:20` (`Panel label="This version" className="flex flex-col gap-3"`); panels `p-3 text-sm`.
- Severity: looks wrong
- Fix: give it a "THIS VERSION" section label and render version, status and actions as ordinary rows (label left, value right) in a flush panel; remove both `mb-4`.
- Evidence: `about-update-ready/w1440.png` (y 420-840); `app/w1440.png` (y 665-900); `about-development-build/w1440.png` (y 575-835).
- Shared: page-local. Supersedes: SET-20

### XSE1-8 Delivery profile editor: cells top aligned (labels 8 px above inputs), table clipped at 390 and 768, Changed badge breaks the row height

- Page / state: `delivery-profile-editor`
- Widths: 1440, 1024, 768, 390 (theme: both)
- What is wrong: why do the labels float above the inputs? In the RMS row the toggle and "RMS" sit at y=338, the input centre is y=346, "-23 to -18 dBFS" at y=337, "none" at y=385 against an input centre of y=393 (8 px). Row heights are 47 (RMS), 47 (Peak, with the Changed badge), 47, 39 (Sample rate), 47 -- unequal for like content. The ACX column is cut by the dialog edge at 768 ("A..." at x=630) and the Lowest/Highest inputs are cut in half at 390 (x=313). At 1024 the dialog scrolls with the last row ("Room tone, tail") sliced at y=620. Behind the dialog, the Custom profiles row has the same issue as XSE1-9.
- Where: `DeliveryProfileEditor.tsx:118` (`overflow-x-auto`), `:141,159` (`valign="top"` cells), narrow dialog from `primitives/Dialog.tsx:148`.
- Severity: looks wrong
- Fix: `valign="middle"` for every cell in a row; below ~800 px stack each rule into a card (toggle + name, then the three limits).
- Evidence: `delivery-profile-editor/w1440.png` (y 300-690); `.../w768.png` (x 590-650); `.../w390.png` (y 380-690); crop `crop:xse1/dp2.png`.
- Shared: page-local (Table primitive). Supersedes: SET-4, SET-11

### XSE1-9 Custom profile row: duplicate and edit icons on one line, delete on the next line, then a text button below ("double-stacked")

- Page / state: `delivery-profile-editor` (visible behind the dialog, Advanced open, dark desktop at y 790-900; same in light at y>830)
- Widths: 1440 (checked); other widths not visible behind the dialog (theme: both)
- What is wrong: why are two icon buttons in a row and the third one under them on its own line? In the Custom profiles row the description "Custom · based on ACX (September 2026) · revision 1" ends at x=1198, duplicate (x 1253-1301) and edit (1320-1368) buttons sit beside it, and the red delete button (x 966-1000, y~855) wraps to the next line at the control column's left edge, with "Duplicate ACX" below that. Three action rows with three different left/right edges.
- Where: `DeliveryProfilesPanel.tsx:269-286` (`li` is `flex flex-wrap` with `flex-1` spacer; the third IconButton wraps).
- Severity: looks wrong
- Fix: `flex-nowrap` for the three icon buttons in one `flex gap-2` group, description on its own line above.
- Evidence: `dark:settings/delivery-profile-editor/desktop.png` (bottom right, y 800-900); crop `crop:xse1/dpd.png`.
- Shared: page-local. Supersedes: none (new)

### XSE1-10 Dialogs are full-window wide at 1440 but 271 px at 390, footers inconsistent, buttons wrap

- Page / state: `about-download-confirm`, `-download-progress`, `-download-failed`, `-install-confirm`, `-installing`, `import-choose`, `manuscript`, `marks-dialog`, `delivery-profile-editor`
- Widths: 1440 (1006 px dialogs for a two-line confirm), 390 (271 px wide, 60 px side margins, "REPLACE AND RESET" and "Install version 0.2.7 and restart?" wrap) (theme: both)
- What is wrong: a two-sentence confirm stretches across 1006 px with a line of text at x=235 and a lone button at x=1157 that are 900 px apart; it is centred on the window, not on the page. The footer order differs: confirm dialogs have Cancel left / primary right, the download-progress dialog has Cancel on the right alone, `import-choose` has Cancel alone on the left. Header heights differ with and without the X (64 px confirm vs 60 px progress). In `about-download-failed` the progress bar stays accent orange at 40% after the failure (no error colour) and there is no X, just Close.
- Where: `primitives/Dialog.tsx:143-150` (`max-w-[70vw]`, `p-4` viewport), `UpdateDownloadDialog.tsx`, `ConfirmDialog`.
- Severity: looks wrong
- Fix: size by content (`max-w-[min(40rem,calc(100vw-2rem))]` for confirms), one footer rule (secondary left, primary right) and a failed bar tone.
- Evidence: `about-download-confirm/w1440.png` (y 347-553); `about-download-failed/w1440.png` (bar y 367-381); `about-install-confirm/w390.png`; `manuscript/w390.png` (footer).
- Shared: Dialog primitive. Supersedes: SET-3

### XSE1-11 Marks dialog: delete button drops to its own line under each row at 768 and 390

- Page / state: `marks-dialog`
- Widths: 768 (each row: swatch, name, colour, style, Asks on one line; the red trash button alone on the next line at x=134-170), 390 (three lines per row) (theme: both). 1024/1440 are one tidy line.
- What is wrong: why is the delete button under the row instead of at its end? At 768 the dialog has 400 px free width in a 538 px dialog, yet each mark takes two rows (y 233 and 279) with the delete button orphaned left, the row spacing is 92 px against 49 px at 1024. At 390 every mark is three rows; swatch and name sit in x 77-313 but the colour/style selects start at x=77 under the swatch, not under the name.
- Where: `script/page/tools/select/MarksDialog.tsx:69-78` (`li` is `flex flex-wrap items-center gap-2`, name `min-w-[10rem] flex-1`).
- Severity: looks wrong
- Fix: grid `swatch | name | colour | style | asks | delete` with the name shrinking (`minmax(8rem,1fr)`), stacking only below 520 px.
- Evidence: `marks-dialog/w768.png` (y 215-790); `marks-dialog/w390.png` (y 170-690).
- Shared: MarksDialog (also on Script page). Supersedes: none (new)

### XSE1-12 Import review: columns do not line up, subtitles truncated with space free, selects cut at 390

- Page / state: `manuscript` (also reached from `import-choose`)
- Widths: 1440 (words column), 768 (titles truncated), 390 (selects cut) (theme: both)
- What is wrong: "1,862 words" ends at x=607 on rows with a Subtitle checkbox but "1,410 words" ends at x=692 on rows without, so the numbers do not form a column; the selects (x 705-870) stay aligned. At 768 titles read "Chapter One -- Do...", "Chapter Two -- The..." while a 166 px select and a 90 px Subtitle checkbox hold the space; at 1440 "Chapter Four -- In Which Alice Considers ..." is cut with the subtitle needing 80 px more. At 390 the rows are `words | Subtitle | Narra...` and the select is cut by the dialog edge; the chapter titles are squeezed out entirely.
- Where: `production/ImportReview.tsx:155-215` (single non-wrapping `flex` row; checkbox slot conditional at `:188-201`; select `flex-none`).
- Severity: looks wrong
- Fix: fixed grid `title(1fr) | words(88px) | subtitle(96px, always reserved) | select(176px)`; stack the row below 520 px.
- Evidence: `manuscript/w1440.png` (rows y 395-610); `manuscript/w768.png` (y 430-640); `manuscript/w390.png` (y 520-690).
- Shared: ImportReview (also on Production import). Supersedes: SET-2, SET-15

### XSE1-13 At 1024 the connection card buttons stack in a column (different widths) and radio labels wrap

- Page / state: `folded-category-list`, `filter-project` (Record with)
- Widths: 1024 (theme: both). 1440 and 768 have both buttons on one row.
- What is wrong: "CHANGE LINKED FILE" (x 700-842) sits above "TEST CONNECTION" (700-828): two buttons stacked left-aligned with different widths, 12 px from the card edge, then 300 px of blank to the right. In the same column "Built-in recorder. Recordings live in the / app." wraps and the hint lines wrap to three lines ("... Experimental DAW / actions under Advanced, / below.") with the single word "below." alone on a line.
- Where: `controls/recordingControls.tsx` (connection card, `flex flex-wrap`), cause is XSE1-1 (half-width column, 300 px).
- Severity: looks wrong
- Fix: widen the control column (XSE1-1) or give buttons equal `min-w` and a 2-column grid.
- Evidence: `folded-category-list/w1024.png` (y 555-715); `filter-project/w1024.png` (y 440-660).
- Shared: page-local (RecordingBody).

### XSE1-14 Models at 1024 and 768: grey cards with the action at the bottom left, disk panel wraps raggedly

- Page / state: `models`, `models-downloading`, `models-empty`, `models-failed`, `models-needs-repair`
- Widths: 1024, 768 (and 390) (theme: both)
- What is wrong: each model is a full-width (670 px) card whose content fills only the left 40%; the download/trash/repair buttons sit on their own row at the bottom-left (x 347-383), away from the name they act on. Cards are grey (surface-2) while the disk panel above and every other card on the page is white. The disk panel wraps: "495 MB used by 3 items" + path on one line and "OPEN FOLDER" alone on the second line at x=353, so the line above is ragged and the right of the card is blank. Failed/repair rows differ in height (160-210 px). The status badge for `models-downloading` shows "Downloading 39%" and a bar with "39%" repeated beside it.
- Where: `page/ModelsPane.tsx:163` (`flex flex-wrap` disk row), `:190` (Table to block at `@max-[1020px]`), `models/AssetRow.tsx:19-22` (`CARD_ROW`, `CARD_CELL`).
- Severity: looks wrong
- Fix: cards as a two-column grid (name/status left, actions top right), white surface, disk row with Open folder pinned right.
- Evidence: `models/w1024.png` (y 220-560); `models-needs-repair/w1024.png` (y 555-755); `models-downloading/w768.png` (y 520-650).
- Shared: AssetRow (page-local).

### XSE1-15 Marks and Entry types: pencil button wraps under the chips, delete buttons at different x, colour select out of line with the name box

- Page / state: `deep-link`, `filter-project`, `import-choose`, `marks-dialog` (behind), `delivery` n/a
- Widths: 1024-1920 (Marks chips); 1440 (Entry types) (theme: both)
- What is wrong: the Marks row has six chips on two lines and the edit pencil alone on a third line (x 966-1002, y 437-473) away from the chips it edits; at 768 the pencil sits at the end of the chips line. In Entry types the delete buttons are at x=1227-1259 for most rows but x=1213-1248 for "Place / 1 entry"; the colour select starts at x=966 (under the swatch) while the name box starts at x=990; the name box is 218 px and the "New type" box is 195 px; the "+" button follows the New type box at x=1173.
- Where: `page/MarksPanel.tsx:23-34` (chips `flex-wrap`, button after), `page/StoryBibleTypesPanel.tsx:67-98` (count `ml-auto` with min width only at `@lg`, swatch indent, widths `w-[100px] @lg:w-[130px]`, `max-w-[200px]`).
- Severity: looks wrong
- Fix: pencil in the row header (top right) instead of under chips; fixed `min-w` on the entries count at every width; align the select and name box to one x.
- Evidence: `deep-link/w1440.png` (Marks y 355-495; Entry types y 55-300); `import-choose/w1440.png` (rows y 665-900).
- Shared: page-local. Supersedes: SET-12 (Entry types part)

### XSE1-16 At 1920 the settings content stops at x=1412 while the top bar runs to 1900

- Page / state: `models`, `models-needs-repair` (w1920; same cap on every state)
- Widths: 1920 (1680 not captured) (theme: both)
- What is wrong: why is the right quarter of the window empty? Page title, nav and cards occupy x 232-1412; the search/REAPER chip of the top bar ends at x=1900; 490 px of blank page to the right of the cards, and the table does not use it.
- Where: `page/SettingsPage.tsx:207` (`max-w-[1180px]`, no `mx-auto`).
- Severity: looks wrong
- Fix: centre the 1180 container or let cards grow to a wider max; compare with other pages.
- Evidence: `models/w1920.png`; `models-needs-repair/w1920.png`.
- Shared: page container. Supersedes: SET-23

### XSE1-17 Models: "Story Bible analysis tools" is a different kind of list glued to the table

- Page / state: `models`, `models-downloading`, `models-empty`, `models-failed`, `models-needs-repair`
- Widths: 1280-1920 (all widths, below the table) (theme: both)
- What is wrong: why does the second list look unrelated to the first? The tools section label sits 24 px under the table's last rule, then each tool is a bold title + inline grey "Not available yet" pill + a two-line paragraph + a tiny grey sentence, separated by hairlines, with no card, no table columns, no actions, and its text wraps at 480 px leaving 400 px blank. The first list (table) and this list have different row structure, different heading scale and no shared columns, and the section label has no space above it from the table (24 px at 1440 against 16 px between other blocks).
- Where: `page/ModelsPane.tsx:218` (`AnalysisToolsSection bare`), `AnalysisToolsSection` in `settings/analysis/`.
- Severity: looks wrong
- Fix: render the tools as table rows (name/status/used by/action) in the same table or as cards in a labelled panel.
- Evidence: `models/w1440.png` (y 600-900); `models/w1920.png` (y 600-1080).
- Shared: page-local. Supersedes: none (new)

### XSE1-19 Header: the search icon floats outside the box, the box and the filter are different heights, and at 390 the three pieces have three right edges

- Page / state: all (header), worst at 390 (`app`, `models`, ...)
- Widths: 1024-1920 (icon, heights), 390 (edges) (theme: both)
- What is wrong: why is the magnifier outside the field? At 1440 the icon sits at x=887 and the box starts at x=907, and the top bar already has a "Jump to or run..." search. The search box is 36 px tall (y 68-104) and the segmented control 32 px (y 70-102) with its "All" chip inset; the "In this project" chip has more side padding than "Changed". At 390 the header is title / search (x 18-306) / filter (x 17-251) while cards run to x=374: three rows, three right edges. At 768 the title, icon, box and filter fill one row but the 260 px box is only 260 wide while the filter ends at x=752 (card edge).
- Where: `page/SettingsPage.tsx:214-231` (`flex flex-wrap`, `w-[260px] max-w-full`, Icon outside SearchField).
- Severity: looks wrong (390: polish)
- Fix: put the icon inside the field, give both controls `h-9` (36 px), make the search `flex-1` and the filter `w-full` below 761 px.
- Evidence: crop `crop:xse1/hdr1.png`; `app/w390.png` (y 100-190); `app/w768.png` (y 65-105).
- Shared: page-local (SearchField/ToggleGroup). Supersedes: SET-19

### XSE2-2 Narrator name box touches the card border at 1024 and sticks 4 px out at 390

- Page / state: `project-credits*`, `project-data-confirm`, `override` (Narrator name row)
- Widths: 1024 (box 688 to 1007 = card edge; the Credits inset card below it ends at 987, 20 px short), 390 (ends x=357, gutter is 353)
- What is wrong: "Why does this box have no padding on the right when everything else does?" `w-80` (320 px) in a 300 px column overflows the card's 20 px padding.
- Where: `ValueControl.tsx:175` (`w-80 max-w-full`), same cause as XSE2-1.
- Severity: looks wrong
- Fix: same as XSE2-1.
- Evidence: `settings/project-credits/w1024.png` (y 390-425, right edge x=1007), `.../project-credits/w390.png` (y 340-376).
- Shared: SettingRowView. Supersedes: part of SET-1

### XSE2-3 Half of every tall settings card is empty

- Page / state: `recording-found/linked/not-installed/several` (Record with: left half empty y 350-640 at 1440), `recording-advanced` (Capabilities: 500+ px empty), `reader-text` (Reader text, left empty under 3 text lines for ~280 px), `project-credits*` (Credits: left empty for ~2000 px), `override`/`project` (Entry types, ~300 px), `pages-panel-open`, `recording-advanced` (Experimental DAW actions: right half empty under a lone switch)
- Widths: 1280-1920 (and 1024 for Credits, Capabilities, Reader text). (theme: both)
- What is wrong: "why is half of this card empty?" The label block is ~100 px tall while the control column is up to 2000 px; the labelled left column does not follow the content and the row is a single equal-halves grid, not label column + wide control.
- Where: `row/SettingRowView.tsx:49` (`@min-[761px]:grid-cols-2`, no label cap), left block `:97-108`.
- Severity: looks wrong
- Fix: label column `minmax(12rem,16rem)` as the design system says; rows whose body is a table/form/list span full width under the label.
- Evidence: `settings/recording-found/w1440.png` (x 488-960, y 360-640 empty), `.../recording-advanced/w1440.png` (y 540-900), `.../reader-text/w1440.png` (y 260-520), `.../project-credits/w1440.png` (y 800-900), `.../recording-advanced/w1920.png`.
- Shared: SettingRowView. Supersedes: SET-6

### XSE2-4 Capabilities table is jammed into half a card

- Page / state: `recording-advanced`, `recording-reaper-path-invalid`
- Widths: 1024 ("Compare / the / recording / with the / manuscript" in 5 lines), 1280-1920 (3 lines), 390 (same 5 lines); 768 is fine (theme: both)
- What is wrong: "the table is squeezed while 500 px beside it is blank". Row heights differ (74 / 53 / 52 px at 1440; 105 / 72 at 1024) because the first column wraps, the "Now" column has ~130 px of blank at its right, and the explanatory line below the table repeats the card description ("Auto follows ...").
- Where: `controls/CapabilitiesBody.tsx:61-107` (Table in the control column), cause is XSE2-3.
- Severity: looks wrong
- Fix: let the body span the card, fixed column widths (What flexible, Setting 8rem, Now 9rem), drop the duplicate sentence.
- Evidence: `settings/recording-advanced/w1024.png` (x 690-990, y 480-760), `.../recording-advanced/w1440.png` (y 520-700), `.../recording-advanced/w390.png` (y 690-840).
- Shared: page-local. Supersedes: SET-7

### XSE2-5 Retail sample selects show "Chapter 3 - A" (1024) or cut mid-glyph (1440, 390)

- Page / state: `project-credits-retail-sample`, `project-credits-retail-sample-refused`, `project-credits` (retail block)
- Widths: 1024 (130 px selects: "Chapter 3 - /", "Chapter 12 -"), 1440 (193 px: "Chapter 3 - A Caucus-l"), 390 ("...a Lon;" last glyph sliced); 768 is fine (theme: both)
- What is wrong: "I cannot tell which chapter is picked." Two chapter selects share a row with a Start line select, so the chapter name is cut while the page has free width beside it.
- Where: `settings/RetailSamplePanel.tsx:102-117` (`grid gap-3 sm:grid-cols-2`), inside the half-width column (XSE2-3).
- Severity: looks wrong
- Fix: one full-width chapter select per row with the line select beside it as a short 6rem field.
- Evidence: `settings/project-credits-retail-sample/w1024.png` (y 620-745), `.../w1440.png` (y 640-750), `.../project-credits-retail-sample-refused/w1024.png` (y 490-620), `.../w390.png`.
- Shared: page-local. Supersedes: SET-17

### XSE2-6 Connection card: buttons wrap into a different arrangement in every state, orphaning "Test connection"

- Page / state: `recording-found` (Link / Choose on row 1, Test connection alone on row 2 at 1440 and 1920), `recording-several`, `recording-linked` (1024: Change linked file and Test connection each on its own row; 768: one row), `recording-not-installed`
- Widths: all (theme: both)
- What is wrong: "why is this one button on its own line?" The action group wraps by whatever fits: 2+1 at 1440, 1+1+1 at 1024 (found), 3 in a row at 768. The same Test connection button is first, second or third and sits on rows of its own.
- Where: `controls/EngineBody.tsx:260` (`flex flex-wrap items-center gap-2`) inside the half column and `max-w-[60ch]` (`:236`).
- Severity: looks wrong
- Fix: one fixed order (primary action, secondary, Test connection last and right aligned), same widths for like buttons.
- Evidence: `settings/recording-found/w1440.png` (y 560-630), `.../recording-found/w1024.png` (y 380-490, three stacked), `.../recording-linked/w1024.png` (y 645-715), `.../recording-found/w1920.png`.
- Shared: page-local.

### XSE2-7 Neutral status badge has no pill, so its label sits 10 px right of the text under it

- Page / state: `recording-linked` ("Not running"), `recording-builtin` ("Built-in recorder"), also "Not installed" in Models
- Widths: all (theme: both; in dark the pill is equally invisible)
- What is wrong: "there is a stray small caption indented from the card text": the neutral badge fill is `surface-2` on a `surface-2` card, so only its 9 px side padding shows. Label x=988, sentence below x=978; the success/warning badges in the same card start at x=978.
- Where: `primitives/StatusBadge.tsx:34` (`neutral: fill var(--surface-2)`), used in `controls/EngineBody.tsx:263`.
- Severity: looks wrong
- Fix: outline look, or `surface` fill, for neutral badges drawn on a surface-2 card.
- Evidence: `settings/recording-linked/w1440.png` (x 975-1060, y 415-425), `.../recording-builtin/w1440.png` (y 455-462), `.../recording-linked/w390.png` (y 360-372).
- Shared: StatusBadge neutral tone.

### XSE2-8 Microphone and Voice sample output rows arrange select + buttons three different ways

- Page / state: all `recording-*` states
- Widths: 1024-1920 (768 the select and buttons share a line; 390 stacked) (theme: both)
- What is wrong: "double-stacked": at 1440 the Microphone select (303 px) has the Refresh button alone under it; in Voice sample output the select (264 px) shares a line with Refresh + Test sound (builtin) or the select sits under a red alert box. At 1024 the Microphone select is the full column (302) while the Voice sample output select is 268 or 299. In the DAW state Test sound sits alone beside grey text. Selects (40.8 px) and sm buttons (32 px) share a row with different heights.
- Where: `controls/MicBody.tsx:59-77` (`flex flex-wrap`, select content width), `controls/SampleOutputBody.tsx:132-149` (select `min-w-0 max-w-full`, two buttons), `:105-108`.
- Severity: looks wrong
- Fix: same field class for all selects (`w-full max-w-md`), one button row below the field for both rows.
- Evidence: `settings/recording-builtin/w1440.png` (Microphone y 560-640, Voice sample output y 680-830), `.../recording-sample-output-builtin/w1024.png` (y 160-480), `.../recording-sample-output-long-name/w1440.png` (select 966-1390 with text cut at "Interface, fr").
- Shared: page-local. Related: SET-5

### XSE2-9 Controls in a card end at six different right edges

- Page / state: every settings state with a select / text box (`recording-*`, speech*, voice*, project, reader-text)
- Widths: all wide widths (theme: both)
- What is wrong: "the right edge of the control column is ragged": selects 264 px (x 966-1230), Microphone 303 (to 1269), Voice sample output 424 (long name, to 1390), Zoom 85 (to 1051), Font full width (to 1391), Narrator name 320 (to 1286), REAPER path 416, number box 96 beside "processes", hex box 112, Entry type name 218 with colour select 88.
- Where: `ValueControl.tsx:104` (`w-[16.5rem]`), `:125`, `:160`, `:175`; `MicBody.tsx:63`; `AppearanceBodies.tsx:82`; `primitives/Select.tsx:37-48` (content width by default).
- Severity: looks wrong
- Fix: shared field widths: select/text `w-full max-w-md`, short fields (number, hex, zoom) a deliberate 8rem.
- Evidence: `settings/reader-text/w1440.png` (y 190-700), `.../recording-found/w1440.png`, `.../speech-advanced/w1440.png` (y 430-800).
- Shared: Select primitive default plus SettingRowView. Supersedes: SET-5

### XSE2-10 Entry types: two stacked lines per type, columns that do not line up, delete buttons at three x positions

- Page / state: `project`, `override`, `project-credits*`, `project-data-confirm` (Entry types)
- Widths: 1280-1920 (and the same stack at 1024/768) (theme: both)
- What is wrong: "why is each type two rows and why do the trash cans zigzag?" Row 1 = swatch + name box (x 990-1208), row 2 = colour select (966-1054) + Can speak + count + trash; the trash is at x=1227-1259 for "6 entries" and "0 entries" but 1213-1248 for "1 entry" (text is shorter), and disabled (faded) for in-use types and solid red for empty ones. "New type" box is 195 px, 218 px for the name boxes; plus button right edge (1208) matches the names but not the trash cans (1259). The swatch hangs left of the colour select.
- Where: `settings/page/StoryBibleTypesPanel.tsx:67-110` (`@lg:flex-nowrap` never reached in the 425 px column, `min-w-[70px]` only at `@lg`, count `ml-auto @lg:ml-0`), `:162` (New type `max-w-[200px]`).
- Severity: looks wrong
- Fix: render as a real table full width: swatch, name, colour, Can speak, entries (fixed 6rem, right aligned), delete (fixed column).
- Evidence: `settings/override/w1440.png` (y 395-880; trash x 1241 / 1230), `.../project/w1024.png`, `.../override/w768.png` (y 650-1020).
- Shared: page-local. Supersedes: SET-12

### XSE2-11 Credits editor: a 2000 px single-column form nested in half a card, with no section structure

- Page / state: `project-credits`, `project-credits-chapter-announcement`, `project-credits-retail-sample*`
- Widths: all (theme: both)
- What is wrong: "a form inside a card inside a card". The inset card (x 966-1390 at 1440) holds Templates / Name / Kind / Body / Preview / Project values (Book number, Copyright, Year, Copyright holder, Publisher, Narrator) / Retail sample as one narrow column. Section headings (Templates, Preview, Project values, Retail sample) are the same 14 px medium weight as field labels (Name, Year), so there is no hierarchy; only Preview has a background. Template buttons New / Duplicate / Delete are 36 px high next to "Close credits editor" (32 px) and the template select is the full width. At 1024 the inset (x 688-987) ends 20 px before the Narrator name box above (to 1007).
- Where: `settings/CreditsPanel.tsx:235` (`space-y-5 text-sm`), `:243,301,330` (`h3 font-medium`), `:246-263`; `controls/CreditsBody.tsx:100-104` (InsetCard in the control column); `RetailSamplePanel.tsx:87-138`.
- Severity: looks wrong
- Fix: open the editor full card width under the label; two-column grid for the six short fields; dividers and a bigger heading style between sections; sm buttons.
- Evidence: `settings/project-credits/w1440.png` (y 680-900), `.../project-credits-retail-sample/w1440.png` (y 50-820), `.../project-credits/w1024.png` (y 380-768).
- Shared: page-local.

### XSE2-12 Credits summary: labels bigger than the row title, badges and values at ragged x

- Page / state: `project-data-confirm` (summary visible behind the dialog), `project` (closed editor)
- Widths: 1440, 1024 (Opening 815 / badge 815, Closing 817), 768, 390 (theme: both)
- What is wrong: "Opening credits / Closing credits / Retail sample" are bold ~17 px while the row's own title "Credits" is 15 px; the badge after each label starts at a different x (Opening 1094, Closing 1085 at 1440) and "Retail sample" has plain muted text instead of a badge, so the three lines are not a table.
- Where: `controls/CreditsBody.tsx:19-34,78-83` (`<b>` with no size/width, `flex-wrap gap-2`).
- Severity: looks wrong
- Fix: three-row grid: label (text-sm, fixed 9rem) | status badge | detail.
- Evidence: `settings/project-data-confirm/w1440.png` (y 540-625), `.../project-data-confirm/w1024.png` (y 590-680), `.../project-data-confirm/w768.png` (y 825-910).
- Shared: page-local. Supersedes: SET-21

### XSE2-14 Preview voice / model offer cluster changes shape with width and state

- Page / state: `speech-model-offer`, `voice`
- Widths: 1440 (badge alone on a line, sentence, then Download + link), speech-model-offer 1440 (badge and sentence on one line, Download + link below), 768 (badge + sentence + Download in one row, "Models & downloads" link orphaned on the next line at voice w768 y=545), 390 (3 lines) (theme: both)
- What is wrong: "sometimes a line, sometimes a row, and a link on its own": the badge, sentence, button and link are a `flex-wrap` group with no grid; the "Not on this computer" row sits right under the select with a 4 px gap while the note/override link sit 14 px apart.
- Where: asset note rendered by `row/AssetNote.tsx` inside `SettingRowView.tsx:135`.
- Severity: looks wrong
- Fix: fixed layout: badge + sentence on one line, Download and link as the next line, always.
- Evidence: `settings/voice/w1440.png` (y 305-440), `.../voice/w768.png` (y 495-560), `.../speech-model-offer/w1440.png` (y 315-410), `.../speech-model-offer/w768.png`.
- Shared: AssetNote.

### XSE2-15 Definitions radios: badge and trash on their own line at 1440/1024, inline at 768, "Online" inline in one state

- Page / state: `voice`, `voice-key-saved`
- Widths: 1440 (Installed + trash on a separate line under Local dictionary, x=966, label text at x=992), 1024 (same, labels wrap), 768 (inline), voice-key-saved 1440 ("Online" inline right of the label while the other two radios have badges on a line below) (theme: both)
- What is wrong: "radio, then a floating badge below it": the extras are `flex-wrap` siblings of a radio whose label fills the column, so each option has a different height (28 / 61 / 28 px) and badges start under the radio circle not under the text.
- Where: `controls/DefinitionsBody.tsx:79-91`.
- Severity: looks wrong
- Fix: put the badge/button in a fixed right-aligned cell of each option (or always under the text with 26 px indent).
- Evidence: `settings/voice/w1440.png` (y 515-690), `.../voice-key-saved/w1440.png` (y 345-490), `.../voice/w768.png`.
- Shared: page-local. Supersedes: SET-22

### XSE2-17 Every row repeats three grey lines on the left and two on the right

- Page / state: all category states
- Widths: all (theme: both)
- What is wrong: "a dense wall of small grey text": description, then scope + "Used by" links + "Also set in ...", then under the control "This project uses the computer setting." + "Override for this project". Scope is said twice ("All projects" left, "This project uses the computer setting" right). The left meta block bottoms out at a different y than the control (e.g. Voice Preview voice: meta y=349, control ends y=422), so nothing shares a baseline. Rows with an "Override" note are 30-40 px taller than rows without one in the same card, so like rows (selects) have unequal heights (110 vs 127 px in Speech advanced).
- Where: `row/SettingRowView.tsx:97-108` (meta), `:137-165` (override line).
- Severity: looks wrong
- Fix: one meta line (scope as a badge, Used by after the control note); override as a single small control next to the select (a "This project" toggle), not a sentence.
- Evidence: `settings/speech-advanced/w1440.png` (y 290-880), `.../voice/w1440.png` (y 250-460).
- Shared: SettingRowView. Supersedes: part of SET-6, SET-25

### XSE2-18 Section labels repeat: "RECORDING TOOL" and "DEFINITIONS AND PRONUNCIATIONS" appear twice on one page

- Page / state: `recording-advanced` (REAPER, RECORDING TOOL, WHAT THE RECORDING TOOL CAN DO after the first RECORDING TOOL), `voice-key-saved` (second DEFINITIONS AND PRONUNCIATIONS after Advanced), `speech-advanced`
- Widths: all (theme: both)
- What is wrong: "I just read that heading": Advanced sections reuse the basic section names; the Advanced disclosure is a small chevron (x=497, text x=516, so 28 px indented from the labels at x=488) and the opened content is not grouped or fenced in any way.
- Where: `settings/page/CategoryPane.tsx:72-83`, `registry/rows.ts:40,87,117,130`.
- Severity: looks wrong
- Fix: name Advanced groups differently or open them in a framed region under the disclosure.
- Evidence: `settings/recording-advanced/w1440.png` (y 60-420), `.../voice-key-saved/w1440.png` (y 310 and 686).
- Shared: CategoryPane.

### XSE2-20 Search results: category shown as current while the results come from another one

- Page / state: `search-results`
- Widths: 768 and 390 (folded button reads "Category RECORDING & DAW" above Speech-to-text results); 1024+ the nav shows no highlight, which is consistent (theme: both)
- What is wrong: the folded category card says RECORDING & DAW while the page below is a search result for "whisper" from SPEECH TO TEXT.
- Where: `settings/page/CategoryNav.tsx:28,64` (`currentLabel` ignores `browsing`).
- Severity: looks wrong
- Fix: show "Search results" in the folded button while browsing.
- Evidence: `settings/search-results/w768.png` (y 120-180), `.../search-results/w390.png` (y 200-260), `.../search-empty/w390.png`.
- Shared: page-local.

### XSE2-21 Set on a page: "OPEN <PAGE>" buttons have three widths and sit apart from the disclosure that acts on the same setting

- Page / state: `pages`, `pages-panel-open`, `pages-navigate-away-confirm`
- Widths: 1280-1920 (buttons 129 / 133 / 95 px wide at x=966; the disclosure "Change it here for now" at x=509 is 120 px lower), 1024, 768 (button under the text, left aligned, disclosure under it) (theme: both)
- What is wrong: "the two things I can do with this setting are in opposite corners". Buttons are left aligned in the right column at different widths, so their right edges are ragged; the right half under each button is blank (y 310-440 at 1440).
- Where: `settings/page/PagesPane.tsx:20-49`.
- Severity: looks wrong
- Fix: put Open and Change it here in one action row; one button width.
- Evidence: `settings/pages/w1440.png` (y 270-760), `.../pages/w1024.png`.
- Shared: page-local.

### XSE2-22 Recording check panel: nested form with its own grid, different input right edges, wrapped info icon

- Page / state: `pages-panel-open`, `pages-navigate-away-confirm`
- Widths: 1440 (input 802-1250 with no unit, 802-1204 with unit "words" at 1214-1250), 1024, 768 (inputs 266-714 vs 266-668 + unit), 390 (theme: both)
- What is wrong: "why are the boxes different widths?" The input stretches, the unit takes space; the first label wraps and its (i) falls on its own line (y=559) while the others keep it inline. The panel uses a label | input | unit grid unlike the outer Settings row, and its "Check changed chapters" / "Two-pass" switch rows have a different layout again (label right of the switch). Number boxes are full width for values like `0.8`.
- Where: `settings/ScopedSetting.tsx:143-162`, `page/ScopedFieldsPanel.tsx`.
- Severity: looks wrong
- Fix: cap number inputs at 8rem with the unit after; keep the (i) glued to the last word.
- Evidence: `settings/pages-panel-open/w1440.png` (y 515-900), `.../pages-panel-open/w768.png` (y 540-720).
- Shared: ScopedSetting. Supersedes: SET-16

### XSE2-25 Models: Used by wraps with free space, rows are unequal heights

- Page / state: `models-remove-refused`, `models-remove-confirm`
- Widths: 1920, 1440, 1280 ("Production Booth Editing Proof" / "Pickups" alone on line 2 although the table has 40+ px free right of it and the Status column is 250 px wide) (theme: both)
- What is wrong: "Pickups sits alone"; rows are 50 / 53 / 52 / 50 px; the table is auto layout so Status starts at x=858 and Used by at x=1111; at 1024 and 768 the "Pickups" link drops under in a card too. Download button (neutral border) and trash (red border) are 36 px squares in a 50 px row.
- Where: `settings/models/AssetRow.tsx:74` (`max-w-[14.375rem]`), `page/ModelsPane.tsx:190`.
- Severity: looks wrong
- Fix: fixed column widths, no `max-w` on the links cell.
- Evidence: `settings/models-remove-refused/w1920.png` (y 475-680), `.../w1440.png`, `.../w1024.png` (y 640-770).
- Shared: Table consumers. Related: SET-8

### XSE2-26 Models page: four different left insets and an oversize alert

- Page / state: `models-remove-refused`, `models-remove-confirm`
- Widths: 1280-1920 (theme: both)
- What is wrong: Disk-use text x=505, alert text x=501 (16.5 px type, bigger than the page's body text), table text x=498, analysis tool list text x=488 (flush with the section labels and no card), so the list below the table looks unrelated. The alert wraps to leave the single word "one." on line 2 at 1440/1280 and has no icon or close; at 1024 the alert text is 13 px from the border but the Disk panel's is 17 px. At 1024 the Disk panel puts "Open folder" on a second row (alone) while 1440 is inline.
- Where: `page/ModelsPane.tsx:162-175,189-221` and `InsetCard`/`Panel` paddings.
- Severity: looks wrong
- Fix: one container inset; alert uses the same 13 px body type and the Panel padding.
- Evidence: `settings/models-remove-refused/w1440.png` (y 220-380 and y 690-720), `.../w1024.png` (y 220-410).
- Shared: page-local.

### XSE2-27 Models cards (below 1020 px container): the action is a row away from the asset it acts on

- Page / state: `models-remove-refused`, `models-remove-confirm`
- Widths: 1024, 768, 390 (theme: both)
- What is wrong: the download / trash icon button is the last line of each card (y=602 at 1024), under STATUS and USED BY; the badge value starts at x=399 and the "Used by" links at x=404 (5 px apart), and the "Speech to text" filter chip is two lines at 390.
- Where: `settings/models/AssetRow.tsx:98-113` and `Cell` card layout.
- Severity: looks wrong
- Fix: action in the card's top-right next to the name.
- Evidence: `settings/models-remove-refused/w1024.png` (y 470-640), `.../w390.png` (y 700-800).
- Shared: Table/card pattern. Supersedes: SET-13 (390 chip)

### XSE2-28 Confirm dialogs are 1006 px wide for one sentence

- Page / state: `speech-costly-confirm`, `models-remove-confirm`, `pages-navigate-away-confirm`, `project-data-confirm`
- Widths: 1440 (x 217-1223; Cancel at x=233, confirm at x=1097-1207, 860 px apart), 1920 wider; at 1024 and 768 the dialog is 700 px (1024) / 536 px (768) (theme: both)
- What is wrong: "a huge empty banner with the buttons at opposite ends"; the text line is 700 px long in a 1000 px box. The "Unsaved settings" dialog has three buttons: Cancel left, Discard & continue + Save & continue right, no shared width.
- Where: `primitives/Dialog.tsx:149` (`max-w-[70vw]`).
- Severity: looks wrong
- Fix: confirm dialogs `max-w-[34rem]`.
- Evidence: `settings/speech-costly-confirm/w1440.png`, `.../pages-navigate-away-confirm/w1440.png` (y 357-543), `.../project-data-confirm/w1440.png`.
- Shared: Dialog primitive.

### XSE2-29 At 390 the dialog is 271 px wide and "Discard & continue" breaks onto three lines

- Page / state: `pages-navigate-away-confirm` (DISCARD / & / CONTINUE; SAVE & / CONTINUE), `project-data-confirm`, `speech-costly-confirm`, `models-remove-confirm` (secondary width)
- Widths: 390 (theme: both)
- What is wrong: the 70vw cap leaves 60 px on each side; the three buttons squeeze to 63-90 px and the second one is 3 lines tall.
- Where: `primitives/Dialog.tsx:149`.
- Severity: looks wrong
- Fix: `max-w-[calc(100vw-2rem)]` below 600 px.
- Evidence: `settings/pages-navigate-away-confirm/w390.png` (y 465-515).
- Shared: Dialog primitive. Supersedes: SET-3

### XSE2-35 Section content widths: description and control notes cap at 60ch/52ch so text and cards end at different x

- Page / state: all states at 768 and 390 (also 1024 for notes)
- Widths: 768 (description ends x~490, Connection card x~613, selects 300 / 340 wide, card edge 752) (theme: both)
- What is wrong: in the stacked layout every block ends at its own x: description 480-490 px, Connection card 575 px wide, mic select 303 + Refresh, Voice sample output text 52ch; the card's right third is blank.
- Where: `SettingRowView.tsx:104` (`max-w-[60ch]`), `EngineBody.tsx:236`, `SampleOutputBody.tsx:104,119,153` (`sm:max-w-[52ch]`).
- Severity: looks wrong
- Fix: let stacked blocks fill the column or share one max width.
- Evidence: `settings/recording-found/w768.png`, `.../recording-sample-output-builtin/w768.png`.
- Shared: SettingRowView, page-local controls.

### XSE1-18 Models empty state: "Nothing is downloaded yet" wraps early with an orphan "MB.", and repeats the disk panel above it

- Page / state: `models-empty`, `models-failed`
- Widths: 1440, 1024, 768 (theme: both)
- What is wrong: the paragraph wraps at x=984 in a 900 px card and leaves "MB." alone on the third line (50ch cap), while the title and button sit at the same left edge; the disk panel just above says "0 MB used by 0 items" which says the same thing. In `models-failed` the card still says "Nothing is downloaded yet" above a failed row.
- Where: `page/ModelsPane.tsx:180` (`max-w-[50ch]`), `:162-174`.
- Severity: polish
- Fix: widen the cap (62ch) so the sentence ends on "600 MB.", hide the 0 MB panel when empty.
- Evidence: `models-empty/w1440.png` (y 305-490); `models-failed/w1440.png`.
- Shared: page-local.

### XSE1-20 Folded category list at 768 and 390: the whole list opens inline and pushes the page down 480 px; chevron is a text glyph

- Page / state: `folded-category-list` (and every state <761 px)
- Widths: 768, 390 (theme: both)
- What is wrong: open, the nav is a 530 px tall card between the header and the page title, so the heading and first row are off screen; the toggle shows a typed "▴ / ▾" character at x=727 while Advanced uses a drawn chevron; "Category" label (muted 13 px) and the value (16 px condensed) sit on different baselines (y=151 vs y=152). The list rows are 40 px with 24 px indentation from the card edge vs 12 px for the group labels at x=35.
- Where: `page/CategoryNav.tsx:57-66` (text glyph), `:36` (item `px-2.5`), group label `px-2.5`.
- Severity: polish
- Fix: open as a popover/sheet or collapse after pick; use `Icon name="chevron"`.
- Evidence: `folded-category-list/w768.png` (y 120-650); `folded-category-list/w390.png`.
- Shared: page-local.

### XSE1-21 Category nav: active-row accent bar follows the rounded corner like a bracket; badge insets differ

- Page / state: every state with the nav (>=1024)
- Widths: 1024-1920 (theme: both)
- What is wrong: in the crop the selected item's 3 px accent bar curves at its top and bottom as a "(" shape instead of a straight edge, and starts 8 px inside the card border; count badges end at x=448 against the item's right edge x=459 (11 px inset, text starts at 8 px).
- Where: `page/CategoryNav.tsx:36` (`shadow-[inset_3px_0_0_var(--accent)]` on a `rounded-[6px]` button).
- Severity: polish
- Fix: use a straight 3 px pseudo-element or drop the radius on the left.
- Evidence: crop `crop:xse1/nav1.png`; `folded-category-list/w1440.png` (nav y 155-195).
- Shared: page-local.

### XSE1-22 Filter result rows: "Saved" sits under the switch, Reset is 20 px off, and the switch hangs below the title when "Changed" shows

- Page / state: `filter-changed`, `filter-project`
- Widths: 1440, 1024 (theme: both)
- What is wrong: in the Changed row the badge makes the title line 7 px taller, so the title centre is y=209 but the switch is at y=216; the reset arrow is at x=1053 (20 px right of "Off"), "Saved" is on its own line at x=966, y=251 and the meta "This computer / Used by" is at y=281 under the description at x=509, a third place for feedback. In `filter-project` the results come from four categories with different row structures and the "Show the whole category" link beside each group label is bold, letter-spaced and underlined, a third text style on the label line. `filter-changed` leaves 600 px of blank below one card.
- Where: `row/SettingRowView.tsx:98-102` (badge in label row), `:107`, results header in `page/Results.tsx`.
- Severity: polish
- Fix: fixed first-line height for the label row; put Saved beside the Reset arrow.
- Evidence: crop `crop:xse1/fc1.png`; `filter-changed/w1440.png` (y 180-310).
- Shared: SettingRowView. Supersedes: SET-25

### XSE1-23 Credits summary and narrator row: labels bigger than the row title, badges at ragged x, 4 px input overrun at 390

- Page / state: `deep-link`, `filter-project`
- Widths: 1440, 1024, 768, 390 (theme: both)
- What is wrong: "Opening credits", "Closing credits", "Retail sample" are bold ~17 px, larger than the row title "Credits" (15 px) beside them; their badges start at x=1102, 1095 and the "Not chosen" text at 1077, so nothing lines up. The highlighted Credits row (pink flash) is a separate band from the Narrator name row above it but has no gap, and its bottom-left corner is square against the rounded card. At 390 the Narrator name box ends x=357 while the card text edge is 353.
- Where: `controls/CreditsBody.tsx:22-31`, `row/ValueControl.tsx:175`.
- Severity: polish
- Fix: `text-sm font-semibold` labels with a fixed min width, badge column aligned, input `w-full max-w-80`.
- Evidence: crop `crop:xse1/dl2.png`; `deep-link/w1440.png` (y 540-840); `deep-link/w390.png` (y 340-380).
- Shared: page-local. Supersedes: SET-21, SET-1 (390 part)

### XSE1-24 Reader text: slider track is 9 px inside the select above it; preview box and font select have different right edges at 390 and 768

- Page / state: `appearance`
- Widths: all (1440: track x 975-1382, select/preview 966-1391; 390: track 46-344, select 37-353; 768: select ends x=701 while the card text ends x=733 and the track ends x=691) (theme: both)
- What is wrong: three different right edges inside one control: select, slider track, value labels ("20 px" ends at x=1391).
- Where: `primitives/Slider.tsx:68` (`px-[9px]`), `page/ReaderTextPanel.tsx`.
- Severity: polish
- Fix: pull the slider out by `-mx-[9px]` so the track matches the select edges.
- Evidence: crop `crop:xse1/a1.png`; `appearance/w390.png` (y 860-1000 region) and `appearance/w768.png` (y 865-1000).
- Shared: Slider primitive. Supersedes: SET-18

### XSE1-25 Unselected radios are solid beige dots with no ring

- Page / state: `appearance` (Theme, Motion), `folded-category-list`, `filter-project` (Record with)
- Widths: all (theme: both; in dark they are almost black on black)
- What is wrong: unchecked radios (x 966-982) look like beige blobs the same tone as the card border; the checked one is a ring. A narrator scanning a three-option list sees a filled dot as "selected" first.
- Where: radio styling in `primitives/RadioGroup` / `styles.css` radio rule.
- Severity: polish (may be intended)
- Fix: use a 1.5 px border ring for unchecked.
- Evidence: `appearance/w1440.png` (y 270-345); `appearance` dark (dots nearly invisible).
- Shared: radio primitive.

### XSE1-26 Loading: skeleton has none of the page's structure, and the title is 6 px lower than when loaded

- Page / state: `loading`, `models-loading`
- Widths: 1440, 1024, 768, 390 (theme: both)
- What is wrong: four identical grey slabs (64 px each, 12 px gap) where the page will show a description, section labels and cards of 60-400 px; in `loading` there is no description line and the title is at y=180 vs 174 when loaded, so the page jumps when it fills. At 390 the skeletons span x 16-374 under a title at x=16 while loaded cards have x=16-374: consistent.
- Where: `page/SettingsPage.tsx:158-159`, `:67` (LoadingRegion with `Skeleton tall`).
- Severity: polish
- Fix: reserve the description line and section label heights; use a skeleton per section card.
- Evidence: `loading/w1440.png` (y 120-510) vs `app/w1440.png`.
- Shared: page-local. Supersedes: SET-24

### XSE1-27 Models error card: body text is 16 px while every other body here is 13-15, buttons hug the text

- Page / state: `models-error`
- Widths: all (theme: both)
- What is wrong: the red-bordered card puts a bold line, a 16 px sentence and Retry/Open the folder 8 px under it; the heading to description gap above it is 14 px (y 198 to 220) vs 16 elsewhere, and it takes 130 px of an otherwise empty page.
- Where: `page/ModelsPane.tsx:86-91` (`InsetCard`, `flex flex-col gap-1.5`).
- Severity: polish
- Fix: 14 px body, 12 px gap before the buttons.
- Evidence: `models-error/w1440.png` (y 220-340).
- Shared: InsetCard.

### XSE1-28 Models filter tabs: "Speech to text" wraps at 390 and chip heights differ

- Page / state: every `models*` state
- Widths: 390 (theme: light checked)
- What is wrong: the segmented control is full width and the "Speech to text" chip breaks into two lines (y 592 and 606), making that chip taller than its neighbours.
- Where: `page/ModelsPane.tsx:189` (`ToggleGroup look="segmented"`, no `whitespace-nowrap`).
- Severity: polish (390 only)
- Fix: `whitespace-nowrap`, let the group scroll horizontally.
- Evidence: `models/w390.png` (y 585-615).
- Shared: ToggleGroup. Supersedes: SET-13

### XSE1-29 Update status rows differ in meta lines between rows of the same card

- Page / state: `app`, `about-*`
- Widths: all (theme: both)
- What is wrong: in the Updates card "Check for updates on startup" and "Update channel" have only "This computer" in the meta line while the Notifications row has "This computer  Used by Production Proof Master & QC"; the rows' heights differ (125, 105, 125 px) and the switch row's gap between description and meta is 24 px while the select row's is 20.
- Where: `row/SettingRowView.tsx:107-115`.
- Severity: polish
- Fix: reserve a 2-line meta slot or drop "This computer" where it is the only entry.
- Evidence: `app/w1440.png` (y 250-650).
- Shared: SettingRowView.

### XSE1-30 Pages that arrive scrolled hide the header and cut the first card

- Page / state: `about-check-failed`, `about-download-failed`, `-confirm`, `-progress`, `about-install-blocked`, `global-keyboard*`, `deep-link`, `marks-dialog`
- Widths: 1440 (and the same at 1024/768) (theme: both)
- What is wrong: the capture is scrolled so that the page title is cut (about-check-failed: "App & updates" is sliced at y=52 by the top bar) or the header is behind the scrim; reviewers and users see an unlabelled card. Behind dialogs the nav card is cut by the dialog at a random row.
- Where: scroll driver in `tests/visual` (`KEEPS_DESKTOP_SCROLL`) and the `scroll-mt-24` on rows (`SettingRowView.tsx:~117`).
- Severity: polish (may be intended by the driver)
- Fix: scroll the pane to the row top with the heading in view, or scroll the dialog target only.
- Evidence: `about-check-failed/w1440.png` (y 50-90); `about-download-failed/w1440.png`.
- Shared: visual-test driver.

### XSE2-13 Reader text: a four-field sub-form inside one row, with a second label style and tracks inset from the select

- Page / state: `reader-text`
- Widths: all (theme: both)
- What is wrong: "the row title says Reader text, then Font / Size / Line spacing / Column width appear again as labels": sub-labels are muted 13 px, row titles bold 15 px, so two form hierarchies in one card. Slider tracks start x=975 and end 1382 while the Font select and preview box span 966-1391 (9 px inset each side), the values ("20 px", "1.7", "Medium") are right-aligned to 1391, not to the track end. The card's left half is empty (XSE2-3). Note colour below uses a 38 px swatch next to a 36 px hex box, Zoom a 85 px select: three control shapes in neighbouring rows.
- Where: `primitives/Slider.tsx:68` (`px-[9px]`), `settings/page/ReaderTextPanel.tsx:23`, `AppearanceBodies.tsx:82`.
- Severity: polish (inset) / looks wrong (two label styles)
- Fix: pull the slider out by -9 px; give each setting (Font, Size, Spacing, Width) its own settings row, or one label style.
- Evidence: `settings/reader-text/w1440.png` (y 170-520), `.../reader-text/w1024.png`, `.../reader-text/w390.png` (y 280-520, track 46-344 vs select 37-353).
- Shared: Slider primitive. Supersedes: SET-18

### XSE2-16 Merriam-Webster key row: badge, dots, two buttons wrap at 1024/390; "Key saved" said three times

- Page / state: `voice-key-saved`
- Widths: 1440 (one line), 1024 (Remove key drops under, x=688), 390 (second line) (theme: both)
- What is wrong: the status is shown by the "Key saved" badge, the dots, and a "Key saved." line; the long privacy paragraph is 12 px in the right column (4 lines at 1440, 5 at 1024) while the left description is 13 px. Buttons are 32 px next to a 22 px badge.
- Where: `controls/MwKeyBody.tsx:71-124`.
- Severity: polish
- Fix: drop the "Key saved." line; put the paragraph under the title in the left column.
- Evidence: `settings/voice-key-saved/w1440.png` (y 720-860), `.../voice-key-saved/w1024.png` (y 530-730).
- Shared: page-local.

### XSE2-19 Three stacked titles say the same thing; page title and category title are the same size

- Page / state: every non-dialog state
- Widths: 1024-1920 (768/390: breadcrumb + title under a Category card) (theme: both)
- What is wrong: "Settings" (30 px, x=232), "Settings / Recording & DAW" (13 px, x=488), "Recording & DAW" (30 px, x=488). The second 30 px heading steals the first one's rank, and the filter/search above act on the nav below.
- Where: `settings/page/SettingsPage.tsx:209,256-258`, `page/CategoryPane.tsx:61`.
- Severity: polish
- Fix: remove the breadcrumb or demote the category title; move the filter into the nav card.
- Evidence: `settings/page-top/w1440.png` (y 60-210).
- Shared: page-local.

### XSE2-23 Marks: Edit button on its own row beneath the pills

- Page / state: `project`, `project-credits*`, `project-data-confirm`
- Widths: 1440, 1280, 1024 (pills 3 rows), 768 (button inline at the end of the line) (theme: both)
- What is wrong: "why is the pencil alone under the tags?" The 36 px icon button sits below the wrapped pills at x=966; at 768 it is on the same line as the last pill. Pills wrap 4 + 2 at 1440 leaving blank right of "Query for author" (x 1224-1390).
- Where: `settings/page/MarksPanel.tsx:34` (pill list), button `row` wrapper.
- Severity: polish
- Fix: pencil in the row header or after the label.
- Evidence: `settings/project-credits/w1440.png` (y 370-475), `.../project-credits/w1024.png` (y 160-310), `.../project-credits/w768.png`.
- Shared: page-local.

### XSE2-24 Manuscript row: "Imported ..." and the Replace button swap between side by side and stacked

- Page / state: `project`
- Widths: 1440/1280 (text and red button on one line), 1024 (stacked), 768 (inline again, x=37) (theme: both)
- What is wrong: the same two items change arrangement; the button is outline red while the other danger action ("Clear project data", below the fold) is solid; no inconsistent spacing with "This project" meta line.
- Where: `controls/ProjectBodies.tsx` (row body).
- Severity: polish
- Fix: fixed stack (text above button) at every width.
- Evidence: `settings/project/w1440.png` (y 265-305), `.../project/w1024.png` (y 270-340).
- Shared: page-local.

### XSE2-30 Error banners are larger than the page text and have a different inset

- Page / state: `unreadable`, `save-failed`, `models-remove-refused`
- Widths: all (theme: both)
- What is wrong: "Your settings could not be read." banner text is ~17 px and bold; inset 13 px from the amber/red border while the cards use 20 px; Retry button is a 28 px sm button but the page's other buttons are 32/36. On `save-failed` the banner pushes the page title ("App & updates") 80 px down; the dimmed content under `unreadable` keeps its full contrast on the heading.
- Where: `settings/page/SettingsPage.tsx:259-270` (InsetCard banners), `primitives/InsetCard`.
- Severity: polish
- Fix: body-size type and card padding for banners.
- Evidence: `settings/unreadable/w1440.png` (y 155-275), `.../save-failed/w1440.png` (y 155-240).
- Shared: InsetCard.

### XSE2-31 Header block: search and filter at 390 do not span the page; 768-1024 title row crowded

- Page / state: all states at 390
- Widths: 390 (search box ends x=306 and filter x=251; the Category card to 374) (theme: both)
- What is wrong: three different right edges at the top of every state.
- Where: `settings/page/SettingsPage.tsx:216-218` (`w-[260px] max-w-full`).
- Severity: polish
- Fix: `flex-1` search and `w-full` segmented control below 761 px.
- Evidence: `settings/page-top/w390.png` (y 100-185), `.../search-empty/w390.png`.
- Shared: page-local. Supersedes: SET-19

### XSE2-32 Content stops at 1180 px, left aligned

- Page / state: all, seen on `recording-advanced`, `recording-found`, `models-remove-refused`, `reader-text`, `pages-panel-open`
- Widths: 1920 (content ends x=1412; top bar's search/chip to 1900) and 1280 shows the page full (theme: both)
- What is wrong: a 500 px dead band on the right at 1920.
- Where: `settings/page/SettingsPage.tsx:207` (`max-w-[1180px]`, no `mx-auto`).
- Severity: polish
- Fix: centre, or fill.
- Evidence: `settings/recording-advanced/w1920.png`, `.../recording-found/w1920.png`.
- Shared: page container. Supersedes: SET-23

### XSE2-33 Zoom select is 85 px and its meta takes three lines; Motion and Start tone are bare radios

- Page / state: `reader-text`
- Widths: all (theme: both)
- What is wrong: the Zoom row's meta has three lines (This computer / Used by ... / Also set in Zoom chip ...) while the select is 85 px and the rest of the column blank; at 768 the "Also set in" runs to the card edge (x=730) while description is capped at 490.
- Where: `settings/controls/AppearanceBodies.tsx:81-89`, `SettingRowView.tsx:107`.
- Severity: polish
- Fix: shared field width and a one-line meta.
- Evidence: `settings/reader-text/w1440.png` (y 660-800), `.../reader-text/w768.png` (y 790-940).
- Shared: page-local. Supersedes: SET-25 (Zoom part)

### XSE2-34 Changed row: accent bar and badge push the switch below the title

- Page / state: `override` ("Changed" badge on Build the Story Bible)
- Widths: 1440, 1024, 768, 390 (theme: both)
- What is wrong: the title line is taller than rows without the badge (badge 22 px), so On switch (y=174) is 6 px above the title center vs aligned in other rows; "This project uses [switch] On  Use computer setting" is a second switch with its own label on a different row. The blue left bar is `inset-y-2.5` while the row is rows-high, leaving 10 px gaps at top and bottom; the bar is 3 px wide but the row's own left padding stays 20 px.
- Where: `row/SettingRowView.tsx:98-102,121-128`.
- Severity: polish
- Fix: fixed first-line height; full-height bar.
- Evidence: `settings/override/w1440.png` (y 150-260), `.../override/w1024.png`.
- Shared: SettingRowView. Supersedes: SET-25 (Changed part)

### XSE2-36 Search results: section label and "Show the whole category" link have mixed styles; result card ends under the results

- Page / state: `search-results`
- Widths: 1440, 1024, 768, 390 (theme: both)
- What is wrong: the group label "SPEECH TO TEXT" (condensed caps, 11 px) is followed by a link in the same caps style with a different weight (underlined, x=598), so label and action look like one string; the page below the 2-row result is empty for 450 px (expected), and the filter/search at the top are the same blue-focus state with an extra clear button that shifts the field 4 px.
- Where: `settings/page/Results.tsx`.
- Severity: polish
- Fix: right-align the link in the header row.
- Evidence: `settings/search-results/w1440.png` (y 155-180).
- Shared: page-local.

### XSE2-37 Speech advanced: "0 processes" number box with unit versus selects, hint under the box

- Page / state: `speech-advanced`
- Widths: 1440 (box 966-1061 + "processes" at 1070; hint "From 0 to 32 processes" under) (theme: both)
- What is wrong: the number row is 25 px taller than its select neighbours (hint line) and the box is 96 px wide beside 264 px selects; the unit/hint line is 12 px vs 13 px notes.
- Where: `ValueControl.tsx:109-140`.
- Severity: polish
- Fix: keep the hint in the row's note slot.
- Evidence: `settings/speech-advanced/w1440.png` (y 635-760).
- Shared: ValueControl.
