# Master & QC: alignment findings

Part of the [alignment audit](../../alignment-audit.md). Findings are grouped by the round that produced them; a later round's finding that replaces an earlier one says `Supersedes`. Evidence paths are `<page>/<state>/<width>.png` of the light capture, `dark:<page>/<state>/<viewport>.png` for dark, `tall:<page>-w<width>.png` for the below-the-fold captures; the images are not committed (regenerate the repo-viewport ones with `pnpm --dir src/studio/ui visual:page <page>`).

## Round 4: gap fill

### R4MS1-1 Why does the Result column look different in cancelled and error than in every other state?

- Page / state: master / cancelled, error (also custom-profile at 768)
- Widths: 1280, 1024 (7px), 768 (pill folds), dark and light
- What is wrong: gut reaction: the grey "Not measured" pills do not sit under the "RESULT" heading like the "Waiting" pills do. Measured on a 1:1 crop of cancelled 1024 (x800-1024): Waiting pill right edge 197, RESULT heading right edge 196, Not measured pill right edge 190; the same 7-8px at 1280 and in dark 1024. At 768 and in error at 1024 the label folds to two lines ("Not / measured", 86x32px blob, x657-743) and pokes 2-4px past the column; the fill is barely visible on the row colour, so only the folded text shows.
- Where: `masterqc/files/FilesTable.tsx:33,55-57,195` (same `StatusBadge` in the same right-aligned cell); `ui/primitives/StatusBadge.tsx` pill `min-h`, no nowrap. Cause of the 7px not found.
- Severity: looks wrong
- Fix: `whitespace-nowrap` on the Result cell and a fixed cell width so every pill shares the right edge.
- Evidence: `S/master/cancelled/w1024.png` x880-885,y230-290; `.../cancelled/w768.png` x655-745 y262-380; `dark:master/cancelled/small-desktop.png`
- Shared: `StatusBadge` pill in `Table`
- Extends: XMS-2

### R4MS1-2 Why does one long error message make every chapter name in the table wrap?

- Page / state: master / error, custom-profile (Chapter 3 "not a RIFF/WAVE file")
- Widths: 1440, 1024, 768 (theme: light and dark)
- What is wrong: gut reaction: the table re-flows for all 15 rows because one row has a long sentence. In error at 768 (dark) every name wraps ("Chapter 2 — The Pool of / Tears", "Chapter 6 — Pig and / Pepper") with about 100px of empty message column beside each; in cancelled at 768 only four wrap. At 1440 dark error, 8 of 15 names wrap in a ~170px File column against a 250px message column; at 1024 the "Not measured" pills fold in error but not in cancelled, and the LENGTH heading moves from x410 to x320 (90px) between the two states at the same width. Rows are 34, 40, 42, 47px.
- Where: `masterqc/files/FilesTable.tsx:171-173` (`colSpan={4}` cell holds the whole message, so its max-content sets column widths under auto table layout) and `rows.ts:57-63` (message text)
- Severity: looks wrong
- Fix: fixed column widths (File flexible, metrics 5 x fixed) and clamp or wrap the message inside its span, or move the error text out of the row into the detail card.
- Evidence: `dark:master/error/tablet.png` x16-751 y180-560; `.../error/desktop.png` x20-620 y160-640 (crop x200+); `S/master/error/w1024.png` y160-420 vs `.../cancelled/w1024.png`
- Shared: `Table` primitive
- Extends: XMS-2, XMS-3 (this is the cause, with numbers)

### R4MS1-3 Why does the file-rules table get worse when the window gets wider (1024 to 1280)?

- Page / state: master / file-rules
- Widths: 1280 versus 1024 (theme: light)
- What is wrong: gut reaction: at 1280 the card is 810px wide with 390px of bare grey to its right, yet its Source column is 130px (To verify rows are 5-6 lines of 11px text, 100-110px tall, "ACX requires" wraps to three lines); at 1024 the single column is 920px wide, Source is 180px and rows are 3-4 lines. The aside that justifies the narrower column is scrolled out of view, so the card looks stopped short.
- Where: `masterqc/page/MasterPage.tsx` two-column grid at >=1180 (the main column is `minmax(0,1fr)` next to the 360px aside); `master/DeliveryProfilePanel.tsx` per-cell `min-w`
- Severity: looks wrong
- Fix: let the rule table span both columns (it is the widest content on the page) or stack Source under "ACX requires" below 1360.
- Evidence: `S/master/file-rules/w1280.png` x57-626 (0.7 crop) y40-560; `.../w1024.png` x70-886 y45-675
- Shared: page-local
- Extends: XMS-7

### R4MS1-11 The disabled Export report button's reason sits 130px below it

- Page / state: master / empty (default) and every state with the Report card (seen in the tall captures)
- Widths: 1440, 1920, 1024, 768 (theme: both)
- What is wrong: gut reaction: the button is greyed and nothing says why. EXPORT REPORT (peach, disabled) is top right of the Report card; "Check some files first: the report covers the files measured here." is the second paragraph under a three-line description, 130px below at 1440 and in the same grey as the description, followed by a checkbox.
- Where: `master/ReportPanel` (reason in body, not next to the button)
- Severity: looks wrong
- Fix: reason as a line directly under the header or a hint beside the button.
- Evidence: `S/tall/master-w1440.png` y1000-2070 (Report card x233-1050)
- Shared: pattern also on Multi-platform export ("Build 0 packages")
- Extends: R3MS-5

### R4MS2-5 Master to spec: file names and "Not started" wrap in every row at 768 while the Title column sits empty

- Page / state: master / to-spec-picked
- Widths: 768 (theme: dark seen; light 768 recorded by round 2)
- What is wrong: "00 Opening credits.wav" and "00 Closing credits.wav" break onto two lines ("00 Opening / credits.wav"), "Not started" breaks as "Not / started" in all five rows, so every row is 53px tall, and yet the Title column holds an input only in two rows (x369-547) and is blank in three; the Remove buttons end at x725 while Add files... ends at x735 (10px).
- Where: `master/MasterToSpecPanel.tsx:84-140` (auto-layout table, no `whitespace-nowrap` on status, no fixed columns). Extends XMS-8.
- Severity: looks wrong
- Fix: Status `whitespace-nowrap`, Title column `min-w` for the input or merge Title under File, actions column flush to the panel padding.
- Evidence: `dark:master/to-spec-picked/tablet.png` y 130-430
- Shared: page-local

### R4MS2-6 A sentence hangs under the table card, outside every card, a few pixels off the card's text

- Page / state: master / package-loading, profile-load-failed, multi-export-empty, multi-export-selected, multi-export-results (any state without measured files), report-needs-files
- Widths: all (theme: both)
- What is wrong: "Nothing measured yet. Check your rendered chapter files (WAV) to see them here." is bare text on the grey page, x56 at 1280 (x70 at 1024, x16 at 768/390), while the card above has its text at x64 / x85 / x33; it is a card's empty state without the card, and it is stacked with a second bare line (the red profile error) in profile-load-failed.
- Where: `masterqc/page/MasterPage.tsx` (the empty/measured note rendered outside `FilesTable`; around lines 252-301). Extends R3MS-1.
- Severity: looks wrong
- Fix: render it as the table card's body (an empty row inside the card) so it inherits the 16px inset.
- Evidence: `S/master/package-loading/w1024.png` y 170-195; `S/master/profile-load-failed/w768.png` y 50-110
- Shared: page-local

### R4TB-3 Delivery package card: four identical "..." marks and the same count said twice

- Page / state: master / default, aside "Delivery package · ACX"
- Widths: 1920, 1440, 1024, 768 (stacked after Report) (theme: both)
- What is wrong: "why are there four grey blobs with dots in them?" Each of the four lines (Chapters are one file each / Every file under 120 min / mono or stereo · 44.1 kHz · 192 kbps+ CBR / 14 chapters not ready) starts with the same 26x18 grey pill holding "...", so nothing says whether a line is a requirement, a pending check or a result; the third line is a spec, not a check. Then "14 chapters not ready" is repeated by the sentence under the button, "0 failing and 14 not ready.", about 30 px lower, in smaller grey text.
- Where: `src/studio/ui/src/components/masterqc/page/PackageChecks.tsx:43` (wait item "N chapters not ready") and `:69` (summary sentence); the pending mark comes from the `state: 'wait'` row renderer in the same file
- Severity: looks wrong
- Fix: show one status line ("14 of 14 chapters not ready") and give requirement lines a neutral bullet; keep a pill only for lines that have a result.
- Evidence: `S/tall/master-w1440.png` x 1065-1420, y 130-330; `S/crops/r4tb/m-aside.png` (2x zoom)
- Shared: page-local

### R4MS1-4 The rule-by-rule Result pills have ragged right edges and one of them folds

- Page / state: master / file-rules
- Widths: 1920, 1440, 768, 390 (theme: both)
- What is wrong: gut reaction: three pill widths in one left-aligned column. "Met" 51px, "Not met" 70px, "Not checked by the app" 78px wide by 2 lines (x100-160) at 1920 although the Result column has ~110px; at 768 the same pill is a four-line 80x55px blob (x42-122, y930-988). "Conflicting sources" folds to two lines at 768 (x655-735, y708-736), now seen (scanner W1).
- Where: `master/DeliveryProfilePanel.tsx` Result cell; `StatusBadge` pill allows wrap
- Severity: polish at 1920, looks wrong at 768
- Fix: `whitespace-nowrap` and a Result column wide enough for the longest label ("Not checked" without "by the app").
- Evidence: `S/master/file-rules/w1920.png` x300-420 y600-700; `.../w768.png` x40-125 y925-990, x650-740 y700-740
- Shared: `StatusBadge`
- Extends: XMS-7

### R4MS1-5 Why do four "..." chips sit beside the Delivery package checks when nothing is loading?

- Page / state: master / cancelled, chapters-load-failed, empty (default), error
- Widths: 1280-1920 aside, 1024-768 stacked (theme: both)
- What is wrong: gut reaction: it looks like the list is still loading. Four identical grey squares with "..." (17-26px) stand where check or cross badges go; "14 chapters not ready" gets a fifth; below the button "0 failing and 14 not ready." says the same count again. In custom-profile (dark 1440) two rows have checks and two have "..." with the third wrapped and its chip centred between lines.
- Where: `masterqc/page/PackageChecks.tsx:15` (`wait: { icon: '…', word: 'Waiting' }`)
- Severity: polish
- Fix: a hollow circle or dash glyph with the word "Not checked" for tooltip, and drop the second count line.
- Evidence: `dark:master/cancelled/desktop.png` x640-890 y95-235 (crop x200+); `S/tall/master-w768.png` y2200-2430
- Shared: page-local
- Extends: XMS-16

### R4MS1-6 Why does the table repeat "No file measured yet · not mastered", "Waiting" and a dash on all fifteen rows?

- Page / state: master / empty (default)
- Widths: all (theme: both)
- What is wrong: gut reaction: a wall of the same sentence. Each of 15 rows states the same fact three ways: the dash in Length, "No file measured yet · not mastered" under RMS/PEAK, and a Waiting pill; only Chapter 3 differs ("Waiting on 3 pickups"). The bare sentence "Nothing measured yet. Check your rendered chapter files (WAV)..." under the card says it a fourth time and Book consistency a fifth ("No measured files yet.").
- Where: `masterqc/files/FilesTable.tsx:171-173`, `rows.ts:133`
- Severity: polish
- Fix: one empty-state line in the card; show per-row text only when it differs.
- Evidence: `S/master/empty/w768.png` y215-860; `S/tall/master-w1440.png` y150-690
- Shared: page-local
- Extends: R3MS-3

### R4MS1-7 The Result and metric headings wrap on different lines at 768

- Page / state: master / cancelled, error, custom-profile
- Widths: 768 (theme: both)
- What is wrong: gut reaction: the heading row looks broken. NOISE FLOOR and HEAD / TAIL fold to two lines (x509-545, x594-636) while FILE, LENGTH, RMS, PEAK, RESULT stay on one, so the heading row is 40px with ragged baselines; at 390 HEAD / TAIL is three lines.
- Where: `masterqc/files/FilesTable.tsx:140-146` (`TableHeader`, wrap allowed)
- Severity: polish
- Fix: `whitespace-nowrap` on headers; shorten to "Floor" and "Head/tail" if needed.
- Evidence: `S/master/cancelled/w768.png` x270-750 y180-220
- Shared: `Table` header
- Extends: XMS-11 (that was Diagnostics only)

### R4MS1-8 Selected toggle and primary button are the same solid orange

- Page / state: master / book-spread, diagnostics-empty, -findings, -error, -cancelled, chapters-load-failed
- Widths: all (theme: both)
- What is wrong: gut reaction: which of these is a setting and which is the action? In the Diagnostics card the selected "RENDERED CHAPTERS" toggle is filled with the same orange as "CHOOSE FILES TO CHECK..." (x720-870 at 1024 dark) and "CHECK FILES..." in the table card; the unselected toggle is an outline button, identical to "CHECK THE 6 MEASURED FILES". Three button styles carry two meanings.
- Where: `master/DiagnosticsSection.tsx` toggle pair (uses `Button variant primary` when selected)
- Severity: polish (may be intended)
- Fix: a selected look unlike the primary (filled neutral or underline) so the single orange is the action.
- Evidence: `dark:master/diagnostics-empty/small-desktop.png` x35-870 y55-200
- Shared: `Button`, segmented toggle
- Extends: R3MS-5

### R4MS1-9 The error line and its Retry sit in three places, none of them an edge

- Page / state: master / chapters-load-failed
- Widths: 1280, 1024 (inline), 768, 390 (own row) (theme: both)
- What is wrong: gut reaction: the red sentence is floating. It starts on the page grey at the card's outer edge (x70 at 1024) 15px left of the card text (x85); at 1280/1440/1024 RETRY follows the sentence 110px (1024) to 15px (1440) short of the card's right edge, at 768 the sentence runs to within 2px of the edge (x749 of 751) and RETRY drops alone to the left (x16-77). Below it two grey lines say nothing is measured, and the next card says it again.
- Where: `masterqc/page/MasterPage.tsx:252-273`
- Severity: polish
- Fix: put the error and Retry inside the table card as a banner row with Retry at the right edge.
- Evidence: `S/master/chapters-load-failed/w1024.png` y300-370; `.../w768.png` y345-410; `dark:master/chapters-load-failed/desktop.png` (crop x200+) y255-280
- Shared: page-local
- Extends: XMS-19

### R4MS1-10 Table text inside Diagnostics starts 8px right of the card's own text

- Page / state: master / diagnostics-error, -cancelled, -findings, -running
- Widths: 1440, 1024, 768 (theme: both)
- What is wrong: gut reaction: the table is nudged in. The intro, "The files are", the toggles, the status/red line and the table's rule lines start at x35 (x33 at 768) but cell text starts x43-44; the rule lines run to the card padding while text is inset, so a left edge is missing.
- Where: `masterqc/diagnostics/DiagnosticsTables.tsx:41,91` (cell padding on a table that is already inside the card's padding)
- Severity: polish
- Fix: `-mx` the table cells or use zero first-cell padding.
- Evidence: `dark:master/diagnostics-error/desktop.png` x35-60 y225-300 (crop x200+)
- Shared: `Table`
- Extends: XMS-9 (same class, different card)

### R4MS1-12 At 1920 each table row has a 270px blank run between the file name and its first value

- Page / state: master / empty (default), all table states
- Widths: 1920 (theme: light)
- What is wrong: gut reaction: names and numbers are too far apart to follow across. Names end at about x560, the Length dash is at x830 and the message text starts under RMS at x~920; in the measured state the numbers then sit right of the headings (XMS-3). With the 1161px column the five metric columns are spread by their headings rather than packed.
- Where: `masterqc/files/FilesTable.tsx` auto-layout, no `max-w` on the table; `MasterPage.tsx` container
- Severity: polish
- Fix: `max-w` on the table or zebra/hover rows already exist; at least cap File and pack metrics next to Result.
- Evidence: `S/tall/master-w1920.png` x300-1461 y100-800 (0.54 crop)
- Shared: `Table`
- Extends: XMS-3

### R4MS1-13 OPEN DELIVERY becomes a banner-wide orange bar at 1024 and 768

- Page / state: master / empty (default), any state, below the Report card
- Widths: 1024 (838px), 768 (702px) (theme: both)
- What is wrong: gut reaction: a huge orange stripe. The same button is 250-358px wide in the aside at 1280+ but fills the stacked card at 1024/768, 34px tall, the loudest object on the page.
- Where: `masterqc/page/PackageChecks.tsx` (full-width button class)
- Severity: polish
- Fix: auto width, left aligned.
- Evidence: `S/tall/master-w1024.png` x53-891 y2080-2125 (crop y1700+); `S/tall/master-w768.png` x33-735 y468-503 (crop y1900+)
- Shared: page-local
- Extends: XMS-5

### R4MS1-14 Silence cleanup options: the intro line is stuck to the first input

- Page / state: master / diagnostics-cleanup-options
- Widths: 1024, 768 (theme: dark; 1440 light was round 2/3)
- What is wrong: gut reaction: the first row is cramped under the intro. "Saved at once for this project..." is 6-10px above the first input and 20px above its label, while later rows are 42-50px apart; at 1024 the right 290px of each row is empty while the last two labels wrap.
- Where: `master/SilenceCleanupDialog` intro `mb` versus row `gap`
- Severity: polish
- Fix: 16px under the intro and equal row pitch.
- Evidence: `dark:master/diagnostics-cleanup-options/tablet.png` x116-652 y380-440; `.../small-desktop.png` x136-764 y225-270
- Shared: page-local
- Extends: XMS-13

### R4MS1-15 Thresholds has no way to change them while the next card has OPEN SETTINGS

- Page / state: master / `diagnostics-*` and empty (default)
- Widths: all (theme: both)
- What is wrong: gut reaction: two sibling cards with the same note but only one has an action. Thresholds shows "These are starting values, not a delivery specification" with nothing to click; Silence cleanup candidates ends with a 36px OPEN SETTINGS button. (May be intended if thresholds are not user-editable.)
- Where: `master/ThresholdsPanel.tsx`, `master/SilenceCleanupPanel.tsx`
- Severity: polish
- Fix: say "fixed in this version" or add the link.
- Evidence: `S/tall/master-w1440.png` y1260-1700
- Shared: page-local
- Extends: R3MS-4

### R4MS2-1 Why are three sibling cards stacked in a column different heights in the header?

- Page / state: master / report-exported, report-needs-files, `multi-export-*` (the stacked cards under 1280)
- Widths: 1024, 768, 390 (theme: both)
- What is wrong: the Report card's header band is 58-59px tall (the 36px Export report button sets it, y309-367 at 768) while the Delivery package and Multi-platform export headers directly below are 49px (y538-587); same card, same title style, three different title-to-rule distances in one scroll.
- Where: `masterqc/*` panel header uses `PANEL_HEADER_CLASS` (`panelStyles.ts:8`), which has no fixed min height, so an action button changes it. Extends XMS-15.
- Severity: polish
- Fix: give `PANEL_HEADER_CLASS` a min-height equal to the button row (about 58px) or make header actions 28-32px.
- Evidence: `S/master/report-needs-files/w768.png` y 305-600; `dark:master/report-exported/small-desktop.png` y 50-360
- Shared: `PANEL_HEADER_CLASS`

### R4MS2-2 The output folder name is cut after "narration-" in the Report text

- Page / state: master / report-exported, report-needs-files, `multi-export-*`, every state with the Report card
- Widths: 768, 390 (theme: both)
- What is wrong: the paragraph "...into this project's narration-/utils/delivery folder" wraps at the hyphen in the word `narration-studio`, so the folder name reads as two names, "narration-" at the end of one line and "utils/delivery" at the start of the next (at 390 and at 768 where the line break falls there).
- Where: Report panel description (`masterqc/page/MasterPage.tsx`, Report section; exact line not opened), plain text with a breakable hyphen and slash
- Severity: polish
- Fix: wrap the folder in a `whitespace-nowrap` code span (a non-breaking hyphen, U+2011, for the display).
- Evidence: `S/master/report-needs-files/w390.png` y 130-160; `dark:master/report-exported/tablet.png` y 410-445
- Shared: page-local

### R4MS2-3 Export report is disabled at the top right and the reason is a plain line 700px away

- Page / state: master / report-needs-files, `multi-export-*`, diagnostics-empty
- Widths: 1920, 1280, 1024, 768, 390 (theme: both)
- What is wrong: the greyed-out peach "Export report" sits in the header at the far right (x1345-1445 at 1920) and "Check some files first: the report covers the files measured here." is an ordinary body line below the description at the left, beside nothing; in the same state the "Include each file's full location" checkbox stays enabled although nothing can be exported. Nothing connects the dead button to its reason.
- Where: Report panel (`masterqc/page/MasterPage.tsx` Report section, exact lines not opened)
- Severity: polish
- Fix: put the reason in the disabled button's `title` as well as in a line directly under the header, and disable the checkbox with the button.
- Evidence: `S/master/report-needs-files/w1920.png` x 230-1230 y 760-960 and the right half x 900-1600 y 700-1080
- Shared: `Button` disabled state (see R3MS-5)

### R4MS2-4 The Delivery package card says "14 chapters not ready" and then "0 failing and 14 not ready"

- Page / state: master / every state with the aside or the stacked cards (running, `report-*`, `multi-export-*`, package-loading)
- Widths: all (theme: both)
- What is wrong: the last row of the check list reads "14 chapters not ready" and the caption under the Open Delivery bar repeats it ("0 failing and 14 not ready."), so one fact appears twice within 90px, in two sizes, and the "0 failing" half is the only new part.
- Where: `masterqc/page/PackageChecks.tsx` (rows) and the caption beneath it (exact line not opened)
- Severity: polish
- Fix: drop the caption, or turn the last row into the caption's wording and delete the other.
- Evidence: `S/master/report-needs-files/w1024.png` y 300-480; `S/master/running/w1280.png` (aside, y 60-230)
- Shared: page-local

### R4MS2-7 "RMS by file against the My ACX, tighter peak range"

- Page / state: master / multi-export-selected, multi-export-results (custom profile active)
- Widths: 1280, 1440 dark (theme: both)
- What is wrong: the Book consistency subtitle drops the profile name into a sentence ("against the My ACX, tighter peak range"): capital M mid-sentence and a comma inside the name makes it read as a list.
- Where: `masterqc/page/Consistency.tsx` (subtitle template, exact line not opened)
- Severity: polish
- Fix: quote the name or reword: `RMS by file against the range of "My ACX, tighter peak"`.
- Evidence: `S/master/multi-export-selected/w1280.png` y 395-420
- Shared: page-local

### R4MS2-8 Multi-platform export lists each package twice and puts the results above the button that made them

- Page / state: master / multi-export-results (and multi-export-running, R3MS-14)
- Widths: 1280, 1024, 768, 390 (theme: both)
- What is wrong: after a build the card shows two checkbox rows (ACX, My ACX, tighter peak), then two result blocks with the same names (check icon at x93 versus checkbox label at x106, i.e. 13px off at 1024), then the Build 2 packages button and "Built 2 packages." in green; the divider between the result blocks exists but there is none above the first; the outcome is read top-to-bottom before the button that caused it.
- Where: `master/MultiPlatformExportPanel.tsx:33-44`
- Severity: polish
- Fix: show the result inline in each checkbox row (icon plus path under the name) and keep the button last.
- Evidence: `S/master/multi-export-results/w1024.png` y 370-650 and `.../w1280.png` aside zoom `S/crops/r4ms2/mx-1280z.png`
- Shared: page-local

### R4MS2-9 While the package loads, Open Delivery is already live and the skeleton is wrong

- Page / state: master / package-loading
- Widths: 1920, 1280, 1440 dark (theme: both)
- What is wrong: the Delivery package card shows three grey skeleton bars (the loaded card has four rows, and one of them is a bold caption) above a fully coloured Open Delivery button, so the call to action is lit while nothing it summarises is known; in dark the bars are barely lighter than the card.
- Where: `masterqc/page/PackageChecks.tsx` (loading branch)
- Severity: polish
- Fix: four skeleton rows, button disabled with the other loading placeholders, a skeleton colour with at least 1.3:1 against the card in dark.
- Evidence: `S/master/package-loading/w1280.png` x 640-890 y 50-190; `dark:master/package-loading/desktop.png`
- Shared: page-local

### R4MS2-10 At 390 the Mastering chain subtitle is squeezed into a 190px column beside the title

- Page / state: master / package-loading (every state with the chain)
- Widths: 390 (theme: light)
- What is wrong: the title and the 160-character subtitle are side by side, so the subtitle becomes a five-line column at x160-350 (header about 120px tall) and the Book consistency subtitle takes two lines beside its title; the chips below stack with dangling arrows.
- Where: `master/MasteringChain.tsx` header, `Consistency.tsx` header (title and subtitle in one flex row). Extends XMS-15.
- Severity: polish
- Fix: allow the subtitle to wrap under the title below 640px.
- Evidence: `S/master/package-loading/w390.png` y 280-500
- Shared: `PANEL_HEADER_CLASS`

### R4MS2-11 The per-file card's bottom edge is a doubled 2px line with square ends

- Page / state: master / package-loading (strip with no table), measured (last row)
- Widths: 768 (measured in light; seen in dark 768 measured and in running 768) (theme: both)
- What is wrong: in package-loading the card's bottom border measures 2px (rows y180-181, rgb 220,215,203) where the Book consistency card two panels below is 1px; the extra line is the controls strip's own border-bottom sitting on the card border, and it runs square past the rounded corners. In measured the last table row's border sits on the card border the same way (2px at y886-887).
- Where: `masterqc/files/FilesTable.tsx:52` (`border-b` on the controls strip) and the table's last-row border
- Severity: polish
- Fix: `last:border-b-0` on the strip when nothing follows and on the last row, so only the card border draws.
- Evidence: `S/crops/r4ms2/pl-corner.png` (3x) against `pl-corner2.png`; `dark:master/measured/tablet.png` y 880-892
- Shared: `Table` primitive and `FilesTable`

### R4MS2-12 The profile error repeats itself

- Page / state: master / profile-load-failed
- Widths: all (theme: both)
- What is wrong: "The delivery profile could not be read: The delivery profiles could not be read from this project." says the same thing twice in one line (prefix plus the error text), then an outlined Retry sits at the line end at x615-677 at 768 and not at the container's right edge. May be mock-only (the mock's message is itself a full sentence), so mark as may be intended.
- Where: `masterqc/page/MasterPage.tsx:255` (prefix) with `api/mockApi.ts:342` (message)
- Severity: polish
- Fix: show the prefix only, with the detail as secondary text, or put the real error in a `title`.
- Evidence: `S/master/profile-load-failed/w768.png` y 50-80
- Shared: page-local

### R4TB-4 Report: the one button is in the header, its option and its precondition are at the bottom

- Page / state: master / default, Report panel (always the last left-column panel, ~y 1900 at 1440)
- Widths: 1920, 1440, 1024, 768 (theme: both)
- What is wrong: "why is the Export button up there when everything about it is down here?" Export report (disabled, peach) sits in the panel header; the checkbox that changes what it writes ("Include each file's full location") is 170 px below it, and the reason the button is disabled ("Check some files first: the report covers the files measured here.") is a grey line between the paragraph and the checkbox, so the narrator sees a washed-out button and has to read down a 3-line paragraph to learn why.
- Where: `src/studio/ui/src/components/master/ReportExportPanel.tsx:43-47` (Button in `actions`), `:55-62` (precondition and checkbox in body)
- Severity: polish
- Fix: put the option and the button on one row at the bottom of the body, with the precondition beside the button; or keep the header button and move the checkbox into the header row.
- Evidence: `S/tall/master-w1024.png` y 2000-2100 (chunk 1 bottom / chunk 2 top), `S/tall/master-w1440.png` y 1810-2100
- Shared: page-local

## Round 3: coverage gaps and scanner cross-check

### R3MS-1 Why are progress and error messages in three different places on one page?

- Page / state: master / running, diagnostics-running, to-spec-running, error, diagnostics-error, chapters-load-failed
- Widths: 1920 (and shared layout at 1280-768) (theme: light; dark layout seen at 1440 for diagnostics-running)
- What is wrong: the measure progress bar is outside any card, flush to the table card edges (x300-1461, y820-835 at 1920) with Cancel underneath at x1393-1461; the Diagnostics bar is inside its card with 16px padding (x317-1445, y283-297); the Master to spec bar is inside its card (x317-1445). Errors differ the same way: Master errors are bare red text on the grey page at x300, Diagnostics errors are red text inside the card at x317.
- Where: `masterqc/page/MasterPage.tsx:286,297-301` (bare `MeasureProgress` and error text), `master/DiagnosticsSection.tsx` and `master/MasterToSpecPanel.tsx` (bar in card body)
- Severity: looks wrong
- Fix: one placement: progress and error inside the panel that started the work, under its header, with the same 16px inset.
- Evidence: `S/master/running/w1920.png` y 820-862; `.../diagnostics-running/w1920.png` y 283-324; `.../error/w1920.png` y 830; `.../diagnostics-error/w1920.png` y 288
- Shared: page-local
- Scanner: none

### R3MS-2 Why do column headings sit over blank cells while one sentence floats under two of them?

- Page / state: master / empty, running, cancelled, error, diagnostics-running, diagnostics-error, diagnostics-cancelled
- Widths: 1920, 1280, 1024, 768 (theme: light)
- What is wrong: in the per-file table the RMS / PEAK / NOISE FLOOR / HEAD-TAIL headings (x915-1329 at 1920) have nothing under them, and each row's message ("No file measured yet · not mastered", x889-1081) begins under RMS and ends under PEAK; in the Diagnostics summary table "Being checked now." / "Not checked: ..." begins at x625-657, between the LENGTH heading and the file name, under no heading at all, with five empty metric columns to its right.
- Where: `masterqc/files/FilesTable.tsx:171-173` (colSpan message cell), `masterqc/diagnostics/DiagnosticsTables.tsx:41,91` (status message in a cell without a span)
- Severity: looks wrong
- Fix: when no row has numbers, hide the metric headings, or span the message across all metric columns from the column after the file name every time.
- Evidence: `S/master/empty/w1920.png` y 195-240; `.../diagnostics-running/w1920.png` y 365-410
- Shared: `Table` primitive
- Scanner: none
- Supersedes: nothing (extends XMS-3)

### R3MS-3 Why does the page say the same thing three or four times in the cancelled and error states?

- Page / state: master / cancelled, error, diagnostics-cancelled, diagnostics-error
- Widths: 1920, 1280, 768 (theme: light)
- What is wrong: in error at 1920 the stop is stated by the row ("Could not be measured: the measurement stopped unexpectedly on this file · not mastered"), by a red banner under the table ("The measurement stopped unexpectedly. Choose the files again to measure them."), and by the detail card ("Could not be measured: ... on this file."), while the other two rows say "The measurement was cancelled" (copy says cancelled although the cause was an error). Diagnostics cancelled says "Diagnostics cancelled. 0 of 3 files were checked." and then repeats "Not checked: the diagnostics were cancelled." on all three rows; Diagnostics error shows the red banner and the red row message and two rows of "cancelled".
- Where: `MasterPage.tsx:252-273`, `FilesTable.tsx:171-173`, `DiagnosticsTables.tsx:41`
- Severity: looks wrong
- Fix: one summary line per section; per-row text only when it differs ("Not started"); do not call an error "cancelled".
- Evidence: `S/master/error/w1920.png` y 275-355 and 830-945; `.../diagnostics-cancelled/w1920.png` y 288-445; `.../diagnostics-error/w1920.png` y 288-445
- Shared: page-local
- Scanner: none

### R3MS-4 Why do the Thresholds values start 20px left of the Silence cleanup values right below them?

- Page / state: master / diagnostics-empty (every state with both panels)
- Widths: 1920, 1280, 1024, 768, 390 (theme: light)
- What is wrong: two identical label / value lists stacked 260px apart: the Thresholds values start at x460 (1920), 240 (1280, 1024), 177 (768); the Silence cleanup values start at x480, 260, 196: the label column is 143px in one and 163px in the other, so the two value columns do not line up. At 390 the label column is 130px and values wrap to three lines ("At or above full scale (0.0 / dBFS), in runs of 3 or more / samples") while the labels stay on one line.
- Where: `master/ThresholdsPanel.tsx` and `master/SilenceCleanupPanel.tsx` (each sizes its own label column; exact classes not opened)
- Severity: looks wrong
- Fix: one shared definition-list component with a fixed label column (for example 11rem).
- Evidence: `S/master/diagnostics-empty/w1920.png` x 317-860 y 405-520 and y 650-800; `.../w768.png`; `.../w390.png` y 485-700
- Shared: page-local (two sibling panels)
- Scanner: none

### R3MS-7 Why do the locked-page padlocks and attention counts vanish when the rail collapses?

- Page / state: master and delivery / no-manuscript, failing-chapter, measured (any state with rail badges)
- Widths: 1280 and 1024 versus 1920 (theme: light)
- What is wrong: at 1920 the rail shows a padlock on all ten pages in no-manuscript (including the current one) and count badges (Proof 10, Pickups 3, Master & QC 1) in failing-chapter; at 1280 the icon rail shows ten identical icons with no padlock and no count, so a locked page looks available and a failing check count is gone.
- Where: `NavRail` in the UI shell components folder (icon-only variant drops the trailing slot)
- Severity: looks wrong
- Fix: overlay a 12px dot or lock glyph on the icon in the icon rail.
- Evidence: `S/delivery/no-manuscript/w1920.png` x 8-207 y 110-665 versus `.../no-manuscript/w1280.png` x 0-64; `.../failing-chapter/w1920.png` x 170-195 y 480-610 versus `.../w1280.png`
- Shared: shell navigation rail
- Scanner: W3 on the rail was FALSE as a clip, but it is this same hidden content

### R3MS-14 Why is the same package listed twice in Multi-platform export while building?

- Page / state: master / multi-export-running
- Widths: 1920 (and shared layout) (theme: light)
- What is wrong: "ACX" appears as a faded checked checkbox (x1495-1510, y155) and again 42px lower as a row with a dark filled minus-circle (x1496-1511, y197, label x1522 versus x1518), then the Build button (with spinner), Cancel and the progress bar sit 8px under that second row with a 5 percent fill and no label.
- Where: `master/MultiPlatformExportPanel.tsx:33-37,44`
- Severity: looks wrong
- Fix: replace the checkbox row with the progress row for the selected package, or show the progress inline on the same line as the checkbox.
- Evidence: `S/master/multi-export-running/w1920.png` x 1479-1835 y 52-304
- Shared: page-local
- Scanner: none

### R3MS-5 Why are disabled and running buttons a washed-out peach that looks like a different colour?

- Page / state: master / diagnostics-empty (Export report), running and diagnostics-running (Check files, Choose files, the selected "Rendered chapters" toggle), report-needs-files, `multi-export-*` (Build 0 packages)
- Widths: all (theme: light and dark)
- What is wrong: disabled primary buttons are a pale peach that measures 2.36:1 (light, Export report, sampled at x1337-1437 y892-914 of the 1920 capture) and 2.82:1 (dark); while a check runs, the selected "Rendered chapters" toggle turns the same peach and the unselected "Raw recordings" goes near-invisible grey, so you cannot tell which source is selected; "Choose files to check..." beside them is peach too, so three of four controls look half-dead at once.
- Where: `ui/primitives/Button.tsx` disabled style (opacity on `primary`), the toggle pair in `DiagnosticsSection.tsx`
- Severity: polish (may be intended)
- Fix: a disabled style with a defined grey surface and text, and keep the selected toggle's selected look when disabled.
- Evidence: `S/master/diagnostics-running/w1920.png` x 406-687 y 214-251 and x1273-1445 y98-134; `.../diagnostics-empty/w1920.png` x1329-1445 y 883-917
- Shared: `Button` disabled state
- Scanner: none

### R3MS-6 Why does the page jump 68px at each side when there is no manuscript?

- Page / state: master / no-manuscript versus every other state
- Widths: 1920 (theme: light)
- What is wrong: the no-manuscript card runs x232-1904 (1672px wide, 16px gutters) while every working Master state is a centred column x300-1461 plus aside to 1835; the card is 242px tall with 78px of padding above and below its three lines, and the remaining 770px of the screen is bare grey. Delivery's no-manuscript card is the same fluid card, so only Master changes width between states.
- Where: shared empty-state card; `MasterPage.tsx` page container versus the empty-state branch
- Severity: polish
- Fix: put the empty card inside the same max-width container as the working layout.
- Evidence: `S/master/no-manuscript/w1920.png` x 232-1904 y 69-310; `.../empty/w1920.png` x 300-1835
- Shared: empty-state card
- Scanner: none

### R3MS-8 Why does "Light theme" look like the Settings cog in dark mode?

- Page / state: master and delivery / every dark state
- Widths: 1440 and 1024/768 (theme: dark)
- What is wrong: in dark the theme toggle is a toothed sun disc at x28,y826 and the Settings gear is a toothed disc at x28,y868, 42px apart, the same cream fill and the same size; at 1024 (labels hidden) the two read as a double cog.
- Where: `app-shell/NavRail` theme toggle icon and settings icon
- Severity: polish
- Fix: use a distinct sun glyph (rays, not teeth) or a half-filled circle.
- Evidence: `dark:master/empty/desktop.png` x 18-40 y 815-880; `S/crops/r3ms/dk/m-empty.png` left rail
- Shared: shell navigation rail
- Scanner: none

### R3MS-9 The "REAPER: Linked" pill is a 22px-high button

- Page / state: master and delivery / all (topbar)
- Widths: all (theme: both)
- What is wrong: the REAPER status pill is a button 67.5x22 at x1192-1260, y14-36 (1440/1280) beside a 32px search box.
- Where: topbar status chip (`h-[1.375rem]` button)
- Severity: polish
- Fix: min hit area 24x24 (padding or `::after`).
- Evidence: `S/master/diagnostics-empty/w1280.png` x 1192-1260 y 14-36
- Shared: topbar chip
- Scanner: H1

### R3MS-10 The "ACX" profile chip next to the page title is a 36x22 button

- Page / state: master / every state with the table header
- Widths: all (theme: both)
- What is wrong: the profile chip beside "Master & QC" is a 36.5x22 button (x229-266) next to 36-41px stepper and select controls (R3MS-11 is the same pattern for a custom profile).
- Where: `masterqc/page/MasterPage.tsx:212-250` chip (`h-[1.375rem]`)
- Severity: polish
- Fix: 24px minimum hit area.
- Evidence: `S/master/empty/w1280.png` x 229-266 y 86-110
- Shared: chip primitive
- Scanner: H1

### R3MS-11 The custom-profile chip "My ACX, tighter peak" is a 110x22 button

- Page / state: master / custom-profile, multi-export-results, multi-export-selected
- Widths: all (theme: both)
- What is wrong: same chip, 109.9x22 at x806-916 (1920), sitting 8px from the 36px stepper and next to the refresh button.
- Where: as R3MS-10
- Severity: polish
- Fix: as R3MS-10
- Evidence: `S/master/custom-profile/w1920.png` x 806-916 y 86-110
- Shared: chip primitive
- Scanner: H1

### R3MS-12 Why does "Master & encode" sit at the end of a sentence at one width and alone on a row at the next?

- Page / state: master / to-spec-picked
- Widths: 1920 (inline), 1280 (own row), 1024 (inline), 768 and 390 (own row) (theme: light)
- What is wrong: at 1920 the button (x1038-1166) is glued 12px after "...to the platform's RMS window and peak limit" on the checkbox row; at 1280 the same button is alone below it (x97-226, y471-507); at 390 it is alone under a three-line checkbox label. The primary action of the panel moves between four positions as the window changes.
- Where: `master/MasterToSpecPanel.tsx` (checkbox + button row, `flex-wrap`)
- Severity: polish
- Fix: put the button in the panel header actions next to "Add files...".
- Evidence: `S/master/to-spec-picked/w1920.png` y 435-470; `.../w1280.png` y 435-510; `.../w390.png` y 440-555
- Shared: page-local
- Scanner: none
- Supersedes: nothing (extends XMS-8 which noted 1440 versus 1024)

### R3MS-13 Master to spec shows plain status words where Master shows pills

- Page / state: master / to-spec-picked, to-spec-running, `multi-export-*`
- Widths: 1920 (theme: light)
- What is wrong: the per-file table's Result is a rounded pill ("Waiting", "Pass", "Not measured") while the Master to spec table four panels lower shows bare text: "Not started" and "Mastering..." in grey, "Ready" in green, all 14px with no shape; "Mastering..." has the same grey as "Waiting", no spinner and no emphasis. The panel is also the only table whose action column (Remove) ends 60px short of the card edge (x1385 vs x1445).
- Where: `master/MasterToSpecPanel.tsx:84-140`
- Severity: polish
- Fix: reuse `StatusBadge` and flush the actions column right.
- Evidence: `S/master/to-spec-picked/w1920.png` x 1175-1445 y 165-420; `.../multi-export-selected/w1920.png` x 1247-1445 y 780-960
- Shared: `StatusBadge`
- Scanner: none

### R3MS-15 Finding severity is a plain word glued after the title

- Page / state: master / diagnostics-findings
- Widths: 1920, 1280, 1024, 768 (theme: light)
- What is wrong: "WARNING" (bold black caps) and "INFO" (brown caps) sit 8px after "Clipping" / "Level shift" / "Room-tone change" at x540-600 with no colour, badge or icon, so the two severities differ only by a word.
- Where: `masterqc/diagnostics/DiagnosticsTables.tsx:104-121`
- Severity: polish
- Fix: a `StatusBadge` (warning amber, info grey) at the row's left or right edge.
- Evidence: `S/master/diagnostics-findings/w1920.png` x 479-620 y 510-690
- Shared: `StatusBadge`
- Scanner: none

### R3MS-16 SILENCE and PACING headings are 21px apart while every other pair is 100-150px apart

- Page / state: master / diagnostics-findings, diagnostics-running, diagnostics-error
- Widths: 1920, 1280 (theme: light)
- What is wrong: in the Diagnostics summary table the numeric columns end at x625 (Length), 765, 906 and 1039 (Silence); the Pacing text starts at x1060, only 21px after the Silence figures (e.g. "212 (3:07)  Not available: no transcript timing for this audio"), so the two read as one cell.
- Where: `DiagnosticsTables.tsx:41` (no gap between right-aligned and left-aligned columns)
- Severity: polish
- Fix: `pl-8` on the Pacing column.
- Evidence: `S/master/diagnostics-findings/w1920.png` x 989-1360 y 305-445
- Shared: `Table` primitive
- Scanner: none

### R3MS-17 Paragraphs run 1,100px wide (about 150 characters per line) at 1920

- Page / state: master / `diagnostics-*`, `report-*`, silence cleanup, checks
- Widths: 1920 (theme: both)
- What is wrong: the Diagnostics intro ("Clipping, level shifts, ... nothing here is saved,") runs x317-1405, the Report paragraph x317-1436, the Silence cleanup intro x317-1436: lines near 150 characters with the second line 20 characters long ("played or changed.").
- Where: panel body text without a max width
- Severity: polish
- Fix: `max-w-[70ch]` on panel prose.
- Evidence: `S/master/diagnostics-empty/w1920.png` y 160-200 and 930-980
- Shared: panel body
- Scanner: none

### R3MS-18 Book consistency ticks run to the labels

- Page / state: master / book-spread
- Widths: 1920, 1280 (theme: both)
- What is wrong: each of the six ticks is 88px tall on a 58px band (y151-238 on y166-224): 15px above and 14px below, and the bottom of the tick is 2px above the "-23.0" / "-18.0" labels at 1920; at 1280 the first tick (x263) stands directly over the "-23.0" label (x220-270); the labels are 24px mono against 14px body text.
- Where: `masterqc/page/Consistency.tsx:25-36`
- Severity: polish
- Fix: ticks 10px taller than the band, labels at body size with 6px gap.
- Evidence: `S/master/book-spread/w1920.png` x 497-1265 y 145-262; `.../w1280.png` x 220-749 y 140-218
- Shared: page-local
- Scanner: none
- Supersedes: nothing (extends XMS-20)

### R3MS-19 The chapter select's caret overlaps its truncated label at 390 (not seen)

- Page / state: master / running (every state with the stepper)
- Widths: 390 (theme: light)
- What is wrong: the scanner reports the select's text overlapping its caret by 7.8px; I did not open a capture that shows it (at 1920 the label "CHAPTER 1 - DOWN THE RABBIT-HOLE" and caret are clear).
- Where: stepper select in `MasterPage.tsx:212-250`
- Severity: polish (may be intended)
- Fix: reserve `pr-6` for the caret.
- Evidence: not opened; `S/scan-out/master/running/w390.json`
- Shared: `Select`
- Scanner: W4

### R3MS-20 Dark dialog barely lifts off the page

- Page / state: master / diagnostics-cleanup-options
- Widths: 1440 (theme: dark)
- What is wrong: the dialog surface (x217-1223, y239-661) is within a few levels of the dimmed page behind it; only a 1px border separates them, so the dialog and the Diagnostics card behind read as one dark mass (the light dialog is white on grey).
- Where: `Dialog` surface token in dark
- Severity: polish
- Fix: raise the dark dialog surface one step and add a shadow.
- Evidence: `dark:master/diagnostics-cleanup-options/desktop.png` x 217-1223 y 239-661
- Shared: `Dialog`
- Scanner: none

## Round 2: strict review

### XMS-1 Why does this table fall apart into one-letter columns at 390? (File column and Title field collapse)

- Page / state: master / empty, running, measured, error and every state with the table (File); to-spec-picked (Title field)
- Widths: 390 (secondary) (theme: both)
- What is wrong: "Opening credits" wraps to "Openin / g / cre / dits" and "Chapter 1 — Down the Rabbit-Hole" takes nine lines (rows about 220px), with Head/tail and Result off-screen; in Master to spec the Title input shows only "C" (about 35px wide at x 303-338) next to full-width Role selects.
- Where: `src/studio/ui/src/components/masterqc/files/FilesTable.tsx:163` (`[overflow-wrap:anywhere]` gives the cell a one-character minimum, no min-width on the table) and `src/studio/ui/src/components/master/MasterToSpecPanel.tsx:119` (`TextField` is `w-full` with no floor in an auto table cell)
- Severity: breaks use
- Fix: `min-w-[10rem]` on the File cell and on the Title cell so the box scrolls sideways, or stack role and title under the file name below 480px.
- Evidence: `master/measured/w390.png` y 320-700; `master/to-spec-picked/w390.png` x 303-338, y 230 and 296
- Shared: `Table` primitive and `TextField` `w-full` in tables
- Supersedes: MST-1, MST-2

### XMS-2 Why do the chapter names break onto two lines when there is empty space in the row, and why are the rows different heights?

- Page / state: master / error (1440), measured (1280, 768), error (768), cancelled
- Widths: 1440 (error), 1280, 768 (theme: both)
- What is wrong: at 1440 in error "Chapter 1 — Down the Rabbit- / Hole" and nine other names wrap while a 60px gap sits between name and Length; rows are 39, 42, 47, 53px (y 258-340 at 1440); at 768 and 1280 the same in measured ("Chapter 3 — A Caucus-Race and a Long / Tale") and the "Not measured" pill folds to two lines ("Not / measured", a tall rounded blob 76x28 at x 664-740, y 268-296 at 768).
- Where: `FilesTable.tsx:171-173` (a `colSpan={4}` message cell, "Could not be measured: ... · not mastered", takes the free width and starves the File and Result cells) and `FilesTable.tsx:192` (Result cell has no `whitespace-nowrap`; `StatusBadge.tsx:54` allows wrapping)
- Severity: looks wrong
- Fix: `whitespace-nowrap` on the Result cell, a min width on File, and let the message cell be the one that wraps or truncates.
- Evidence: `master/error/w1440.png` y 258-900; `.../measured/w768.png` y 335-375; `.../measured/w1280.png` y 335-375; `.../error/w768.png` y 255-410
- Shared: `StatusBadge` wrap (`StatusBadge.tsx:54`)
- Supersedes: MST-3

### XMS-3 Why do the table's columns jump around when the state changes, and why is the spacing between RMS, Peak and Noise floor so uneven?

- Page / state: master / empty vs measured vs error vs cancelled vs running; measured at 1440/1920
- Widths: 1440, 1920, 1280 (theme: both)
- What is wrong: the Length header sits at x=606 (empty), 562 (measured), 490 (error), 590 (cancelled), and the "No file measured yet" message starts at x=650, 606, 535, 633; in measured at 1920 the gaps between right-aligned columns are 96 (Length to RMS), 84 (RMS to Peak), 160 (Peak to Noise floor), 153 (Noise floor to Head/tail), so "-21.2 -3.6" sit close and "-66.8" floats far from both; the Result pills (right edge 1038) overhang the panel's button right edge (1033) by about 5px.
- Where: `FilesTable.tsx:136-153` (auto layout, no column widths; widths follow whichever cell is longest in that state)
- Severity: looks wrong
- Fix: fixed widths per numeric column (`w-24` each, `w-28` Head/tail) and one Result width, with the message cell spanning from the same x every time.
- Evidence: `master/{empty,measured,error,cancelled}/w1440.png` header row y 198; `master/measured/w1920.png` y 198-275; 2x crop `S/crops/xms/a.png`
- Shared: `Table` primitive (auto layout)
- Supersedes: MST-11 (the Master-to-spec part is XMS-8)

### XMS-4 Why is the right quarter of the page empty for ten screens?

- Page / state: master / every state at 1280+; worst `diagnostics-*`, file-rules, `report-*`, `to-spec-*`, book-spread
- Widths: 1280, 1440, 1920 (theme: both)
- What is wrong: the aside holds two panels (about 540px tall) and the left stack continues for about 5000px; x 1050-1440 (1440) and 1460-1920 (1920) is bare after the first screen; the multi-export crops only show the aside because the scroll was placed on it.
- Where: `src/studio/ui/src/components/masterqc/page/MasterPage.tsx:210-211,310` (second column is not `sticky`, `items-start`)
- Severity: looks wrong
- Fix: make the aside `xl:sticky xl:top-4`, or move lower panels into a full-width row; see XMS-6 for the grouping.
- Evidence: `master/diagnostics-findings/w1440.png`, `.../book-spread/w1440.png`, `.../to-spec-picked/w1440.png` x 1050-1440
- Shared: page-local
- Supersedes: MST-4

### XMS-5 Why is the "can I deliver?" answer at the very bottom of the page on a small window?

- Page / state: master / all states
- Widths: 1024, 768 (theme: both)
- What is wrong: below the xl breakpoint the Delivery package list (failing/not ready, Open Delivery) and Multi-platform export come after Report, so the verdict is the last of eleven panels; at 1280 they are visible only because the grid is still two columns.
- Where: `MasterPage.tsx:210-211` (single column below `xl`, aside last in DOM order)
- Severity: looks wrong
- Fix: at narrow widths put the Delivery package panel directly under the table (or as a summary strip in the table header).
- Evidence: `master/multi-export-results/w1024.png`, `.../w768.png` (aside after Report); `.../report-exported/w768.png` y 506-1000
- Shared: page-local

### XMS-6 Why are there ten same-looking panels with no grouping, and four orange buttons shouting at once?

- Page / state: master / measured, book-spread, `diagnostics-*`, `report-*`
- Widths: all supported widths (theme: both)
- What is wrong: related things are far apart and unrelated things adjacent: "Master all to spec…" is in the table header but its panel opens about 1000px below; Thresholds and Silence cleanup candidates are separate cards from Diagnostics, which they configure; Multi-platform export (a mastering output) sits beside the QC verdict; the Diagnostics "Rendered chapters" toggle, "Choose files to check…", "Check files…", "Open Delivery" and "Master & encode" are all solid orange, so nothing reads as the main action.
- Where: `MasterPage.tsx:286-308` (flat list of panels), `masterqc/files/MeasureRun.tsx` and `DiagnosticsSection.tsx` (primary buttons)
- Severity: looks wrong
- Fix: three labelled groups (Measure, Master and export, Diagnose and report); one primary per group; fold thresholds and cleanup into Diagnostics as sub-sections.
- Evidence: `master/book-spread/w1440.png` y 53-890; `.../diagnostics-empty/w1440.png`; `.../to-spec-picked/w1440.png`
- Shared: page-local

### XMS-7 Why is the every-rule table cut off at 768 and why does the Source column become a tower of tiny text?

- Page / state: master / file-rules, measured and every state that shows the rule list (990-1440 too)
- Widths: 768 (cut), 1440 (tower), 390 (theme: both)
- What is wrong: at 768 the Source column is sliced mid-word at the card edge ("RMS definition to / compare with A") with no cue it scrolls; at 1440 Source is 150px wide so "To verify" rows are 125-130px tall, six to seven lines of 11px text, while This file and ACX requires have spare width; the "Not checked by the app" badge becomes a four-line circle-ish pill (x 45-120, y 930-985 at 768); at 390 each row is about 150px with a blank lower half.
- Where: `src/studio/ui/src/components/master/FileRulesPanel.tsx:79-115` (per-cell `min-w-[8/11/12/9rem]`, no widths on headers) and `StatusBadge.tsx:54-62`
- Severity: looks wrong
- Fix: Source `min-w-[16rem]` and shrink the others, `whitespace-nowrap` on the badge, an edge shadow on the scroll box.
- Evidence: `master/file-rules/w768.png` x 650-735; `.../w1440.png` x 884-1030 y 195-600; `.../w390.png`
- Shared: `Table` in scroll boxes; same as XDL-5
- Supersedes: MST-5

### XMS-8 Why do the Master to spec rows have a tall select, a short input and a button that does not line up with "Add files"?

- Page / state: master / to-spec-picked, to-spec-running, `multi-export-*` (the table at the end of each crop)
- Widths: 1440, 1024, 768 (theme: both)
- What is wrong: in one row the Role select is 41px, the Title input 36px and Remove 36px; the table text starts at x=259 while the panel title, checkbox and Master & encode start at x=249; Remove buttons end at x=1016 but Add files ends at x=1033; Title is blank in three of five rows so the column looks ragged; the columns jump (Role x=439 picking, 527 running, 543 done; Title 617/717/746) and "Not started" wraps to two lines at 768; at 1440 Master & encode sits on its own row while at 1024 it sits beside the checkbox.
- Where: `MasterToSpecPanel.tsx:84-140` (auto-layout table, mixed `Select` 40.8px and `TextField` 36px), `Select.tsx:48`, `TextField.tsx:13`
- Severity: looks wrong
- Fix: one control height, fixed column widths, Status `whitespace-nowrap`, table inset to the panel padding, actions column flush to the panel edge.
- Evidence: `master/to-spec-picked/w1440.png` y 140-420; `.../to-spec-running/w1440.png`; `.../multi-export-results/w1440.png` y 740-890; `.../to-spec-picked/w768.png` y 160-410
- Shared: `Select` 40.8px vs `TextField` 36px
- Supersedes: MST-11 (Master-to-spec part)

### XMS-9 Why is the page title row split across two rows, and why does the table text start 6px left of the title?

- Page / state: master / every state at 768+
- Widths: 1440, 1280, 1024, 768 (and 390, where it stacks into five rows) (theme: both)
- What is wrong: the refresh icon sits on the title row while "Master all to spec…", "Choose other files…" and "Re-check 3 files" sit alone on a second row under it; the title "Master & QC" starts at x=249 but table text starts at x=243 (6px) and the Result pills end at x=1038 while the header buttons end at x=1033; at 390 the header wraps to title, stepper and refresh, ACX chip alone, "Master all to spec…" alone, then two more buttons on a third row.
- Where: `MasterPage.tsx:212-250` (heading and controls passed separately), `FilesTable.tsx:131-132` (`FilesHeader`), `Table` cell padding vs `PANEL_HEADER_CLASS` (`panelStyles.ts:8`)
- Severity: looks wrong
- Fix: one header row (title, stepper, chip left; the run buttons and refresh right) and inset the table to the panel padding.
- Evidence: `master/measured/w1440.png` x 233-1049 y 70-250; 2x crop `S/crops/xms/a.png`; `.../measured/w390.png` y 70-300
- Shared: `PANEL_HEADER_CLASS`, `Table` cell padding

### XMS-10 Why is Cancel at the bottom of a 16-row table, away from the Check button that started it?

- Page / state: master / running
- Widths: 1440 (and every width) (theme: both)
- What is wrong: while measuring, "Check files…" in the header is just greyed out and the progress bar plus Cancel appear under the whole table (y 820-880 at 1440, at the fold); in the table every row still says "Waiting", including the one being measured.
- Where: `MasterPage.tsx:286` (`MeasureProgress` after the file panels), `FilesTable.tsx` row status
- Severity: looks wrong
- Fix: show progress and Cancel in the header where the button was; give the active row its own status.
- Evidence: `master/running/w1440.png` y 150-175 and 820-880
- Shared: page-local

### XMS-11 Why do two tables stacked in Diagnostics use different column grids, and why does the file name wrap with room to spare?

- Page / state: master / diagnostics-findings, diagnostics-running, diagnostics-error, diagnostics-cancelled
- Widths: 1440, 768, 390 (theme: both)
- What is wrong: the summary table (File, Length, Clip regions, Level shifts, Silence, Pacing) and the findings table (Time, Finding, Measured, Threshold, Source) sit 40px apart with different column x; at 1440 "Chapter 02 (silent).wav" wraps and "CLIP / REGIONS", "LEVEL / SHIFTS" headers wrap to two lines while the table is 784px wide; "Not available: no transcript timing for this / audio" leaves a one-word second line; rows are 48, 53 and 39px; column headers sit at different x in running (CLIP REGIONS 615-698) than in findings (537-563) and error (602-686).
- Where: `DiagnosticsTables.tsx:41,91` and `DiagnosticsSection.tsx:57,270`
- Severity: looks wrong
- Fix: fixed column widths shared by both tables, `whitespace-nowrap` on headers, a wider File column.
- Evidence: `master/diagnostics-findings/w1440.png` y 295-480; `.../diagnostics-running/w1440.png` y 325-475; `.../diagnostics-error/w1440.png`
- Shared: `Table` primitive

### XMS-12 Why do cells in the same finding row start on different lines?

- Page / state: master / diagnostics-findings
- Widths: 1440, 1024, 768 (theme: both)
- What is wrong: in each finding row the Time is vertically centred (y 577), the Finding title is at the top (y 551), Measured at the top or middle, Threshold at the top, Source at 559 or 663; "Clipping" and "Chapter 01.wav" do not share a baseline in any of the three rows.
- Where: `DiagnosticsTables.tsx:104-121` (default middle `valign`, mixed content heights)
- Severity: looks wrong
- Fix: `valign="top"` on every cell, as `FileRulesPanel` does.
- Evidence: `master/diagnostics-findings/w1440.png` y 540-840
- Shared: `Table` valign default
- Supersedes: MST-10 (row alignment part)

### XMS-13 Why does the Silence cleanup dialog wrap its labels with 700px of empty space beside them?

- Page / state: master / diagnostics-cleanup-options
- Widths: 1440 (dialog x 217-1223), 390 (theme: both)
- What is wrong: "How far below speech level a breath / sits" and "How far above the silence around it a / click stands" wrap in a 220px label column while the dialog is 1006px wide with everything in the left 55%; rows are 48, 48, 50, 52px apart; the intro line is 14px above the first label while rows are about 24px apart; there is a header close X and a footer Close button on the left, two controls for the same thing.
- Where: `DiagnosticsSection.tsx` (options form around `:270`; exact class not found), `Dialog` primitive width
- Severity: looks wrong
- Fix: cap the dialog at about 36rem, give labels `flex-1`, space the intro like the rows, drop one close control or right-align Close.
- Evidence: `master/diagnostics-cleanup-options/w1440.png` y 240-660
- Shared: `Dialog` width
- Supersedes: MST-9

### XMS-14 Why does the label move 11px right on the "Fail" row, and why are the labels 900px from the values at 1920?

- Page / state: master / measured, custom-profile ("Why it fails" / "Checks" panel)
- Widths: 1920 (gap), 1440, 768 (theme: both)
- What is wrong: the Pass badge is 42px wide and Fail/Not met is 53 to 77px, so "Sample rate" starts at x=382 while RMS, Peak, Noise floor start at x=371; at 1920 "RMS" at x=371 and its value "-21.2 dBFS" ending x=1280 are about 900px apart, then the limit text at x=1444, so the eye cannot follow a row.
- Where: `masterqc/files/FileChecks.tsx` (row is flex with a content-width badge, value and limit pushed apart)
- Severity: looks wrong
- Fix: fixed-width result column (`w-20`), and cap the row grid (badge, label, value, limit) at about 40rem or use a table.
- Evidence: `master/measured/w1920.png` x 317-1444 y 895-1065
- Shared: page-local

### XMS-19 Why is the red error text outside every card, hanging off the page edge?

- Page / state: master / chapters-load-failed, profile-load-failed, error, empty ("Nothing measured yet")
- Widths: 1440, 768 (theme: both)
- What is wrong: messages sit directly on the grey page at x=232 (1440) or x=16 (768) while panel text starts at x=249 and x=33; the error is plain red text with no box, and its Retry button hangs at the end of the sentence (x 973-1035) rather than at a fixed edge; "Nothing measured yet. Check your rendered chapter files..." floats between two cards.
- Where: `MasterPage.tsx:252-273,297-301` (bare `div`/`p`)
- Severity: looks wrong
- Fix: put each message inside a card or inline alert with the same inset; Retry at the right.
- Evidence: `master/chapters-load-failed/w1440.png` y 350-420; `.../profile-load-failed/w1440.png` y 50-110; `.../error/w768.png` y 985-1010
- Shared: page-local

### XMS-15 Why does the Mastering chain header look taller and different from the panels around it?

- Page / state: master / book-spread, `to-spec-*`, diagnostics-empty, package-loading, chapters-load-failed (any with the chain)
- Widths: 1440, 1280, 1024, 768 (theme: both)
- What is wrong: the title is followed by an 80-word subtitle that wraps to two lines, so the header is 69px tall (Book consistency, Thresholds 50px, Diagnostics 59px); the title sits top-aligned against line one rather than centred; the chips are tiny (about 10px text) with arrows between; at 390 the chips stack with a dangling arrow after each.
- Where: `master/MasteringChain.tsx` (subtitle inside the header), `panelStyles.ts:8`
- Severity: polish
- Fix: move the subtitle into the body and keep a common header height.
- Evidence: `master/to-spec-picked/w1440.png` y 540-665; `.../to-spec-picked/w390.png` y 590-820
- Shared: `PANEL_HEADER_CLASS`

### XMS-16 Why do the check icons not line up in the Delivery package list?

- Page / state: master / measured, custom-profile, error, package-loading
- Widths: 1440, 1280, 390 (theme: both)
- What is wrong: the check/cross badge is 30px wide, the "…" badge 26px, so text starts at x=1121 versus 1119; where an item wraps the badge is vertically centred between the lines instead of beside the first; in package-loading the skeleton shows three grey bars for a five-row list, so the panel jumps when it loads.
- Where: `masterqc/page/PackageChecks.tsx:57-58` (`items-center`, glyph badge width follows the glyph)
- Severity: polish
- Fix: `w-7 justify-center` badge and `items-start`; skeleton rows match the list.
- Evidence: `master/measured/w1440.png` x 1083-1400 y 135-295; `.../custom-profile/w1440.png` y 195-235; `.../package-loading/w1440.png` y 135-215
- Shared: `StatusBadge` glyph badges
- Supersedes: MST-7

### XMS-17 Why are the header lines under the two columns not level?

- Page / state: master / all states with the aside
- Widths: 1280, 1440, 1920 (theme: both)
- What is wrong: the table panel's divider is at y=127 and the Delivery package divider at y=119; in the lower stack Book consistency, Mastering chain, Diagnostics, Thresholds, Silence cleanup, Report headers are 50, 69, 59, 50, 50, 59px.
- Where: `panelStyles.ts:8` (`min-h-[3.125rem]` grows with the tallest child: select, buttons)
- Severity: polish
- Fix: one fixed header height.
- Evidence: `master/measured/w1440.png` y 119 and 127
- Shared: `PANEL_HEADER_CLASS`
- Supersedes: MST-8

### XMS-18 Why do the saved folders break mid-word and why is the status row 4px off the checkboxes?

- Page / state: master / multi-export-results, multi-export-running
- Widths: 1440, 390 (theme: both)
- What is wrong: "C:\Users\Narrator\Desktop\Wonderland\A / CX" and "...\M / y ACX, tighter peak" break after one letter; the result icon (x=1092) and name (x=1110) are 4px right of the checkbox label (x=1106); in running the grey dot is larger than the checkbox; Build 1 package, Cancel and the progress bar are stacked tight (9px gap) while the checkbox rows are 26px apart.
- Where: `master/MultiPlatformExportPanel.tsx:33-37,44` (`[overflow-wrap:anywhere]`, `gap-1` result row)
- Severity: polish
- Fix: break after `\` (`<wbr>`), match icon width and gap to the checkbox row.
- Evidence: `master/multi-export-results/w1440.png` x 1083-1407 y 120-480; `.../multi-export-running/w1440.png` y 120-290
- Shared: page-local
- Supersedes: MST-6

### XMS-20 Why does the consistency chart float in the middle with unlabeled ticks?

- Page / state: master / book-spread, custom-profile, measured
- Widths: 1440, 1024, 768, 390 (theme: both)
- What is wrong: the green band is 535px (x 373-908) in an 784px panel body with the "Spread 3.2 dB across 6 files" caption flush left at x=249, so it is neither centred with nor aligned to the text; six thick black ticks have no file names; at 390 "-23.0" and "-18.0" shrink to about 7px.
- Where: `masterqc/page/Consistency.tsx:25-36` (fixed viewBox with a 1 dB margin, `w-full h-auto`)
- Severity: polish
- Fix: full-width band, labels as HTML, caption aligned with it, hover or labels for ticks.
- Evidence: `master/book-spread/w1440.png` y 105-245; `.../w390.png` y 170-180
- Shared: page-local
- Supersedes: MST-12

### XMS-21 Why does the button sit awkwardly at the end of a sentence in Silence cleanup and Diagnostics?

- Page / state: master / diagnostics-empty, report-exported, report-needs-files (Silence cleanup), all Diagnostics states ("The files are" row)
- Widths: 1440, 768 (theme: both)
- What is wrong: "Set in Settings > Silence cleanup, ... options." runs into "Open settings" at x 837-950 with the text 11px and the button 36px, so the button looks stuck to the end of the line; at 768 it drops to the right on the same row; in Diagnostics the "The files are" label (15px) sits beside 36px toggle buttons with a different baseline, then an 11px note 12px below.
- Where: `DiagnosticsSection.tsx` (settings hint row and source-kind row)
- Severity: polish
- Fix: put the hint on its own line and the button in the panel header actions.
- Evidence: `master/diagnostics-empty/w1440.png` y 770-805, 180-215
- Shared: page-local

### XMS-22 Why do "no manuscript" and loading look unfinished?

- Page / state: master / no-manuscript, package-loading
- Widths: 1440 (theme: light)
- What is wrong: no-manuscript is a 240px centred card at the top with an empty grey page below it, titled in the centre while every other Master screen is left-aligned; in package-loading the table panel is only its header, with three skeleton bars of about 18px for a five-row list.
- Where: shared empty-state card, `PackageChecks.tsx`
- Severity: polish (may be intended)
- Fix: none required beyond skeleton matching; centre the card vertically or leave as is.
- Evidence: `master/no-manuscript/w1440.png`; `.../package-loading/w1440.png`
- Shared: page-local

### XMS-23 Diagnostics tables clip at 390 with no cue

- Page / state: master / diagnostics-findings, diagnostics-error
- Widths: 390 (secondary) (theme: both)
- What is wrong: "Could not be checked: not a..." and the Level shifts, Silence, Pacing columns are cut at x=357 with only a hidden scroll box.
- Where: `DiagnosticsSection.tsx:57,270,277`
- Severity: polish
- Fix: edge shadow (`scroll-x-edges`) on every scroll box.
- Evidence: `master/diagnostics-findings/w390.png` y 470-640
- Shared: `Table` in scroll boxes
- Supersedes: MST-10 (clipping part)
