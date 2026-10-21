# Alignment and layout audit of every page (2026-10-21)

Researched 2026-10-21 against `main` at `e0dc53f`. The owner keeps finding alignment and layout defects one page at a time and asked for a full written list before anything is fixed. This note changes no application code and fixes nothing.

**Question.** What is misaligned, clipped, overlapped, unevenly sized or off the design tokens on each page of the app, at each width, and which of it comes from a shared primitive?

**Answer in one paragraph.** The audit lists 194 findings: 18 that break use, 83 that look wrong and 93 polish. Four shared primitives cause most of the worst ones: the `Panel` header (a title that collapses to one letter per line beside a wide action), the `Dialog` width (always 70% of the window), the `Select` and `TextField` height mismatch (40.8 px against 36 px) and the `Table` primitive (auto layout, no column widths, no scroll cue, mid-word breaking). Nearly all the `breaks use` findings are at 390 px, which the product reaches only by 400% zoom (the desktop shell's minimum window is 960 px, see `apps/ui/tests/visual/viewports.ts`); at 768 px and wider the defects are mostly alignment, gutters, uneven heights and blank space. The ranked top 20 and the cross-page fixes follow the per-page findings.

## Method

1. Read `CLAUDE.md`, `.claude/rules/ui-visual-verification.md` and the design-system reference (`docs/design/design-system.md`).
2. Captured every catalogued `{page, state}` of the real app on mock data with the repo's own visual suite (`apps/ui/tests/visual/app.spec.ts`, 736 states from `apps/ui/tests/visual/state-catalog.ts`), using the installed headless Chromium and no `playwright install`:
   - Light and dark at the repo viewports 1440, 1024 and 768 px plus each row's extra viewports (`pnpm --dir apps/ui visual:page <pages>`): 736 states per theme, all passed, 2,872 PNGs across both themes.
   - Light only at 1920, 1440, 1280, 1024, 768 and 390 px, with the suite's viewport list replaced for that run only (a local edit of `apps/ui/tests/visual/viewports.ts`, reverted; nothing in `apps/` is changed by this pull request): 1,129 test runs and 2,714 PNGs. Two states failed the suite's own gates at 390 px: `storybible / alias-pronunciation-editing` (input "Name" 10 px wide) and `master / to-spec-picked` (inputs "Title for Chapter 0N.wav" 34.8 px wide). Both are findings SB-1 and MST-1.
3. Ran a geometry probe in the page at every capture of the second run (2,714 state-width records over 426 states). It flags clipped content, hit areas under 24 px, cards of unequal height, rows shorter than their siblings, columns whose left edges differ, controls that overflow their container and labels that wrap inside buttons. It is heuristic and noisy: most hits are visually hidden text or intended clamps, so no finding rests on a probe line alone.
4. Eight reviewers, each owning pages, opened the PNGs, confirmed each defect by eye and found the owning component by reading the source (`file:line`). A reviewer who could not find the cause wrote "cause not found". The lead re-opened two of the screenshots and checked the shared-primitive claims against `Dialog.tsx`, `Panel.tsx`, `Select.tsx`, `TextField.tsx`, `Slider.tsx` and `HeaderChip.tsx`.
5. Counted tokens and spacing literals with `grep` over `apps/ui/src/components`.

**Pages and states covered.** Production, Schedule, Script, Story Bible, Booth, Editing, Proof (list and chapter view), Pickups, Master & QC, Delivery, Settings (every category state), the project picker and startup states, the engine panel and its dialogs, the recording-check slide-over, the import dialogs, the app shell (rail, top bar, jump menu, zoom menu, switch-project popover) and the `global` states (toast, tooltip, shortcut sheet, confirm dialog, theme and rail states). Every catalogued state was captured at every width above.

**What was looked at, honestly.** A capture is not a review. The reviewers viewed almost every state at 1440 and 390 px, a smaller share at 768 px, and 1920, 1280 and 1024 px mainly for each page's main states and where the layout band changes. Dark was viewed for the main states of each page (about five states per page) and showed no dark-only defect. The appendix lists, per reviewer, what was opened and what was only inferred from a sibling state.

## Not covered

- States and widths the appendix lists as not opened (for example Master `cancelled`, `diagnostics-empty`, `report-needs-files`; 16 engine dialog error and idle states; Editing `voice-sample-mark`; Story Bible detail panels at 390 px, where the driver leaves the list in view).
- The open navigation drawer below 860 px: no catalogued state shows it, so it was read from `NavDrawer.tsx` only.
- Dark theme at 1920, 1280 and 390 px, and dark for most states: the second run was light only.
- The exact width 1360 px (rail threshold): SHL-11 is from source, not from a screenshot.
- Hover and focus states beyond what the catalog captures. The hover-highlight check is therefore indirect (GLB-1 was found in the catalog's `tooltip` state); other `TooltipTarget` wrappers around full-size children were not audited.
- Below-the-fold content: captures are viewport-sized except `fullPage` rows, so lower parts of long pages were seen only in states scrolled to them.
- Real REAPER, the Wails host and WebView2: the audit used headless Chromium on mock data. Scrollbars there are classic (about 15 px) scrollbars; the probe found no content drawn under a scrollbar and the reviewers saw none, but the app's CSS never sets `scrollbar-gutter` (no match in `apps/ui/src`), so a scrollbar that appears on content change shifts the layout in any host that draws classic scrollbars.
- The Storybook atlas (`pnpm --dir apps/ui atlas:page`) and the axe and aria suites: not run, as the task is alignment only.
- Real narrator content (very long chapter names, 500-chapter books): only what the mock fixtures contain, plus `delivery / many-chapters`.

**Context for severity.** `breaks use` here means content unreachable or unreadable, a collapsed control, or an overlap that hides content. Most of those are at 390 px. The design system says 390 px is a reflow check reached by zoom, so owners may reasonably rank them below the alignment defects at 1440 px and 768 px; the ranking below lists both, and each finding names its widths.

## Findings by page

Each finding gives the state, the widths, what is wrong, the owning file, a severity and a one-line fix. Screenshot paths are `<page>/<state>/<width>.png` of the light capture (`dark:<page>/<state>/<viewport>.png` for dark); the images are not committed except those under [Screenshots](#screenshots), and `pnpm --dir apps/ui visual:page <page>` regenerates the repo-viewport ones. A finding that says "unconfirmed" or "cause not found" is exactly that.

| Page | Breaks use | Looks wrong | Polish | Total |
| --- | --- | --- | --- | --- |
| Production | 3 | 13 | 10 | 26 |
| Schedule | 0 | 5 | 1 | 6 |
| Script | 0 | 6 | 8 | 14 |
| Story Bible | 1 | 9 | 8 | 18 |
| Booth | 2 | 6 | 10 | 18 |
| Editing | 2 | 7 | 7 | 16 |
| Proof | 1 | 4 | 8 | 13 |
| Proof (chapter view) | 1 | 2 | 4 | 7 |
| Pickups | 0 | 1 | 5 | 6 |
| Master & QC | 2 | 3 | 7 | 12 |
| Delivery | 0 | 4 | 4 | 8 |
| Settings | 2 | 15 | 8 | 25 |
| Engine panel (slide-over and its dialogs) | 2 | 2 | 2 | 6 |
| App shell: navigation, top bar, jump menu, menus | 1 | 4 | 7 | 12 |
| Project picker | 0 | 1 | 2 | 3 |
| Cross-page | 1 | 1 | 1 | 3 |
| Cross-page | 0 | 0 | 1 | 1 |
| **All** | **18** | **83** | **93** | **194** |

### Production

#### PRD-1 Import review: chapter name column collapses to nothing at 390, row controls run off the dialog

- Page / state: import-confirm, import-confirm-markdown, import-review-characters, import-review-text-subtitle, import-review-subtitles-off (dialog "Import ... step 2 of 2")
- Widths: 390 (names gone), 768 (names cut to "Chapter One — Do…", "Chapter Two — The…"), also 1440 for the text-truncated Chapter Four (theme: both)
- What is wrong: each outline row is one non-wrapping line (title button `flex-1 truncate`, words, Subtitle checkbox and a 166 px select all `flex-none`), so at 390 the title gets 0 px: the rows show only "1,862 words / Subtitle / Narration chap…", with the select cut off at the dialog edge (x≈331) and the chapter being reclassified unnamed.
- Where: `apps/ui/src/components/production/ImportReview.tsx:155-203` (row `flex items-center gap-3`; title `min-w-0 flex-1 truncate` at :159; words `flex-none` :181; checkbox `flex-none` :188; Select `flex-none` :201) - no wrap or stacking at narrow width
- Severity: breaks use
- Fix: let the row wrap below ~40rem (title on its own line, words/Subtitle/select on a second line) or make the select `min-w-0` with a shrinking width.
- Evidence: `production/import-confirm/w390.png` (rows at y≈538-690, select clipped at right edge x=331); `import-review-characters/w390.png`; `import-confirm/w768.png` (names truncated at x≈290)
- Shared: page-local

#### PRD-2 Recording-check slide-over: 4-up stat grid crushed into a 320 px panel

- Page / state: recording-check-complete, -incomplete, -cascade, -pickups, -stale (SlideOver "Recording check")
- Widths: 768, 1024, 1280, 1440, 1920 (anything at or over 640 px viewport); 390 is fine (2 columns). theme: both
- What is wrong: the Text present / Paragraphs / Audio checked / Pace tiles use `sm:grid-cols-4` (a viewport breakpoint) inside a 320 px panel, so the labels collide ("PARAGRAPHSAUDIO"), "27 of 42" wraps onto three lines, "TEXT PRESENT" wraps, and "about 155/min" runs past the right edge of the panel and is clipped ("155/mi").
- Where: `apps/ui/src/components/production/RecordingCheckReport.tsx:106` (`grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4`) - viewport breakpoint where the panel's own width is what matters
- Severity: breaks use
- Fix: keep two columns (or use a container query on the panel width) so each tile gets at least ~140 px.
- Evidence: `production/recording-check-incomplete/w1440.png` (tiles at x=1139-1440, y≈370-480); `recording-check-cascade/w768.png` (x 467-768, y≈390-510); good reference `recording-check-cascade/w390.png`
- Shared: page-local (SlideOver width is `w-[min(20rem,100vw)]`, `SlideOver.tsx:17`)

#### PRD-3 Header action cluster overflows at 390 while the stage timer runs (page scrolls sideways, Start session cut off)

- Page / state: on-pace, report-dialog (state with `running` timer)
- Widths: 390 (768 and above wrap correctly). theme: both
- What is wrong: with the timer chip, Stop timer, Export icon and Start session in one `flex-none flex-wrap` group, the group does not wrap below its content width: Start session is cut at x=390, the "Experimental: switched off in Settings." note and "Open DAW settings" link are off-screen to the right (probe: container right 591 > 390, the page's scroll region is 591 wide).
- Where: `apps/ui/src/components/production/pipeline/PageHeader.tsx:109` (`flex flex-none flex-wrap items-center gap-2`) - `flex-none` stops the group shrinking so `flex-wrap` never triggers; the note `max-w-[24ch]` span is at :122
- Severity: breaks use
- Fix: drop `flex-none` (use `min-w-0`) or give the group `basis-full` below 640 px so it wraps.
- Evidence: `production/on-pace/w390.png` (button cut at right edge, y≈207); compare `at-risk/w390.png` (same row fits without the timer)
- Shared: page-local

#### PRD-4 Next up and Recorded-vs-plan stay side by side at 390 (about 170 px each)

- Page / state: chapter-removed-list, credits-closing-not-set-up (the scrolled states that show the area); all states with the board
- Widths: 390 (768 is fine, see below). theme: both
- What is wrong: the right-hand stack is forced to `grid-cols-2` at every width up to 1281, including phones, so Next up squeezes to one word per line ("Finish / recording / Chapter 4 — / The Rabbit...", OPEN BOOTH wraps to two lines) and the chart is cut off at the right ("Recorded days no", the "Oct 29" label is missing).
- Where: `apps/ui/src/components/production/ProductionPage.tsx:453` (`max-[1281px]:grid max-[1281px]:grid-cols-2`) - no single-column rule under ~640 px
- Severity: looks wrong
- Fix: `grid-cols-1 min-[640px]:max-[1281px]:grid-cols-2`.
- Evidence: `production/chapter-removed-list/w390.png` (y≈510-844); `.../w768.png` for the same area correct
- Shared: page-local

#### PRD-5 Every dialog is 70% of the viewport wide whatever it holds

- Page / state: chapter-remove-confirm, manuscript-candidate-offer, chapter-sync-consent, credits-setup-dialog(-narrator-default), recording-check-model-required, recording-check-recheck-model-required, recording-check-rules, stage-suggestion-options, import-activity-log, editing-check-gain-match-confirm
- Widths: 1440 (1006 px), 1920 (1342 px), 390 (271 px, with 60 px of dead margin each side). theme: both
- What is wrong: `w-full` plus `max-w-[70vw]` makes a two-line confirm ("Remove Chapter 1 from recording?") span 1342 px at 1920 with one 1000+ px text line, while at 390 the same rule leaves a 271 px dialog that wraps every label and buttons.
- Where: `apps/ui/src/components/primitives/Dialog.tsx:148-149` (`flex w-full flex-col ... max-w-[70vw]`) - width is viewport-relative, not content-relative
- Severity: looks wrong
- Fix: give small dialogs a content width (e.g. `w-[min(32rem,100%-2rem)]`) and let `size="full"` keep the wide one; on phones use `100vw - 2rem`.
- Evidence: `production/chapter-remove-confirm/w1920.png` (dialog x 289-1631); `.../w390.png` (dialog x 60-331); `manuscript-candidate-offer/w1440.png` (x 217-1223 for one sentence)
- Shared: `Dialog` primitive (all pages)

#### PRD-6 Export status report dialog: content stops short of the dialog's right edge, header and footer styled differently

- Page / state: report-dialog
- Widths: 1440 (14 px strip), 1920 (about 350 px empty strip), 1280 and up. theme: both
- What is wrong: the report content is `w-[min(62rem,100%)]` (992 px) inside a dialog that is 70vw wide, so at 1920 the dialog is x 289-1631 but the header rule, footer rule, close button and Export button all end at x≈1281 with blank white to the right; at 1440 the close button is at x 1156-1190 and Export ends at 1193, not 1205/1207 like every other dialog. Its own header (26 px title, `py-4`) also differs from the shared dialog header (16 px semibold title, 60 px min-height).
- Where: `apps/ui/src/components/production/report/ReportDialog.tsx:84` (`w-[min(62rem,100%)]`) with `headerless: true` in `openReportDialog.tsx:10`; header at :85-93, footer :160 - fixed width inside a viewport-relative dialog
- Severity: looks wrong
- Fix: make the wrapper `w-full` (and set the dialog width on `Dialog`, see PRD-5) so the dividers and buttons reach the edges.
- Evidence: `production/report-dialog/w1920.png` (header rule ends x=1281, close button at x≈1245); `.../w1440.png` (close button x 1156-1190 vs dialog right edge 1223)
- Shared: page-local (consequence of PRD-5)

#### PRD-7 Credits banner: 32 px gap below it instead of 16 px

- Page / state: credits-setup-banner
- Widths: 1440 (banner bottom y=247, KPI top y=281), 768, 390 (both about 34 px). theme: both
- What is wrong: the red-bordered banner adds its own bottom margin on top of the page's 16 px flex gap, so it floats 32 px above the KPI row while every other block on the page is 16 px apart.
- Where: `apps/ui/src/components/credits/CreditsSetupBanner.tsx:41` (`<Panel tone="review" className="mb-4">`) inside `ProductionPage.tsx:365` (`flex flex-col gap-4`) - redundant `mb-4`
- Severity: looks wrong
- Fix: remove `mb-4`.
- Evidence: `production/credits-setup-banner/w1440.png` (gap y 247-281 vs 16 px gaps lower down); `.../w768.png`
- Shared: page-local

#### PRD-8 Sibling cards in the "Where the book stands / This week / Recording check" row have header rules at different heights

- Page / state: at-risk and every state with the board (no-data, on-pace, ...)
- Widths: 1280 (This week vs Recording check), 1440, 1920 (all three). theme: both
- What is wrong: Recording check's header holds a 36 px icon button so it is about 59 px tall while the other two are 50 px, so the divider under the titles is at y=462 / 462 / 471 at 1440 (and y=613 vs 622 at 1280) and the card titles sit at different y (439 vs 443).
- Where: `apps/ui/src/components/primitives/panelStyles.ts:10` (`PANEL_HEADER_CLASS min-h-[3.125rem]`, grows with `actions`), action added in `apps/ui/src/components/production/overview/CheckCountsCard.tsx:41-48`; the file's own comment says 55 px for a 32 px button but `IconButton md` is 36 px (`IconButton.tsx:21`)
- Severity: looks wrong
- Fix: give every header in a row the same min-height (use the `sm` 32 px icon button or set the header min-height to the taller value).
- Evidence: `production/at-risk/w1440.png` (rules at y≈462, 462, 471; titles y 439 / 439 / 443); `.../w1280.png` (y 613 vs 622)
- Shared: `Panel` header (also on any card row with an action button)

#### PRD-9 "Where the book stands" and "This week" leave blank space under their content; legend band does not reach the card bottom

- Page / state: at-risk and others
- Widths: 1440 (legend band ends y≈570, card y=586; This week blank y 540-586), 1920 (band ends y≈545 vs card bottom 586 = 40 px blank). At 1024-1280 the card is not stretched but the band ends 2-3 px above the card border with square corners. theme: both
- What is wrong: the cards in the row are stretched (`items-stretch`) to the tallest neighbour but their bodies do not grow, so the grey legend band floats with white beneath it and the This week rows float at the top with a hollow bottom.
- Where: `apps/ui/src/components/production/ProductionPage.tsx:422` (`items-stretch`), `overview/StageBar.tsx:21,39` (`Panel flush`, legend `ul bg-[var(--surface-2)]`), `overview/WeekCard.tsx:15`; `Panel`'s `fill` prop (Panel.tsx:60-68) is not used here
- Severity: looks wrong
- Fix: pass `fill` to Panel and let the legend band `mt-auto`; add `overflow-hidden` to the flush panel so the band follows the rounded corners.
- Evidence: `production/at-risk/w1920.png` (card x 233-934, band bottom y 545, card bottom 586); `.../w1440.png`
- Shared: `Panel` (no `overflow-hidden` on the frame, `panelStyles.ts:6`)

#### PRD-10 Chapter pipeline: chapter-name column is squeezed to 90-130 px below ~860 px, names wrap to 3-5 lines

- Page / state: chapter-removed-list (scrolled to the table), credits-closing-not-set-up, recording-check-running (and every state at that width)
- Widths: 768 (names on 2-3 lines, "Chapter 8 — / The Queen's / Croquet- / Ground"), 390 (one word per line: "Chapter / 11 — / Who / Stole / the / Tarts?"). 1024 and up are fine. theme: both
- What is wrong: the table is `min-w-[44rem] table-fixed` with 7 stage columns of a fixed width and the Chapter column taking the leftover, so under about 860 px the Chapter column is what is left (about 90-130 px) and rows get 3-6 lines tall.
- Where: `apps/ui/src/components/production/pipeline/PipelineTable.tsx:96-102` (`min-w-[44rem] table-fixed`, `<col />` for Chapter, `FIN_WIDTH`/`STAGE_WIDTH` for the rest)
- Severity: looks wrong
- Fix: give the Chapter column a floor (`min-w-[12rem]` via the col or `th`) and let the existing horizontal scroll take the rest.
- Evidence: `production/chapter-removed-list/w768.png` (rows at y≈80-430); `.../w390.png` (y 50-270)
- Shared: page-local

#### PRD-11 Import review: the "words" column is not aligned between rows with and without the Subtitle checkbox

- Page / state: import-confirm, import-confirm-markdown, import-review-*
- Widths: 1440 (right edge of "1,862 words" at x=607, of "1,410 words" at x=692), 1920 (x 903 vs 988), 1024, 768. theme: both
- What is wrong: only rows that have a subtitle choice render the checkbox, and nothing reserves its space, so the word counts and the select staggers by about 85 px between rows.
- Where: `apps/ui/src/components/production/ImportReview.tsx:188-199` (checkbox rendered only when `hasSubtitleChoice(section)`, no placeholder)
- Severity: looks wrong
- Fix: render an empty fixed-width slot (or a grid with fixed columns) when the row has no checkbox.
- Evidence: `production/import-confirm/w1440.png` (rows at y 410-597)
- Shared: page-local

#### PRD-12 Slide-over close button shrinks to 22-24 px wide

- Page / state: `recording-check-*` (cascade, complete, incomplete, stale at 22-24 px; never/refused 28 px), credits-panel, `editing-check-*` (about 30 px); the Track panel (32 px) and Stage readiness (36 px) are not affected
- Widths: 390 (24 px), 768 (24 px), 1440 (22-28 px). theme: both
- What is wrong: the close button is `size-[36px]` but not `flex-none`, so a two-line title squeezes it to a 22-28 px wide x 36 px tall sliver, a narrower hit area than the other panels' 36 px square and visibly off-square.
- Where: `apps/ui/src/components/primitives/SlideOver.tsx:73` (IconButton in the `flex ... justify-between gap-3` header at :69, title at :70 without `min-w-0`/the button without `flex-none`); size class `IconButton.tsx:21`
- Severity: looks wrong
- Fix: `className="flex-none"` on the close IconButton and `min-w-0` on the title.
- Evidence: `production/recording-check-cascade/w1440.png` (X at x 1399-1421, y 17-52); `.../w390.png` (x 349-372); `chapter-track-panel-linked/w1440.png` (x 1390-1422 for comparison)
- Shared: `SlideOver` (every slide-over page)

#### PRD-13 Credits row panel: "Open in Script" link and the status select touch

- Page / state: credits-panel
- Widths: 390, 768, 1440 (link ends x=1231, select starts x=1231; link is 18 px tall text beside a 40 px select). theme: both
- What is wrong: the link and the select are laid out on one line with no gap and mismatched heights, so "Open in Script" butts into the select's border (and wraps next to it at 320 px).
- Where: `apps/ui/src/components/production/CreditsRowPanel.tsx:67-75` (inline `Link` followed by `Select` in a `space-y-4` block; `space-y` does nothing for inline siblings)
- Severity: looks wrong
- Fix: make the link `block`, or put both in a `flex items-center gap-3` row.
- Evidence: `production/credits-panel/w1440.png` (y≈194); `.../w390.png`
- Shared: page-local

#### PRD-14 Editing-check slide-over: Source toggle chips touch each other and wrap onto two lines

- Page / state: editing-check-never-checked, -complete-candidates, -complete-clean, -gain-match-confirm, -partial, -running, -settings-unset, -stale, -unsupported
- Widths: 390, 768, 1440 (left chip x 1139-1310, right chip x 1310-1422, no gap; "ITEMS ON THIS CHAPTER'S TRACK" and "THE RENDERED FILE" each on two lines; "Source analyzed:" caption 4 px below). theme: both
- What is wrong: the two-option toggle uses the default look, which is a plain `flex` row with no gap or wrap, so the chips butt together and the long caps labels wrap; widths are unequal (171 vs 112 px).
- Where: `apps/ui/src/components/editing/EditingCheckPanel.tsx:269` (`<ToggleGroup ... />` without `className`) and `apps/ui/src/components/primitives/ToggleGroup.tsx:35` (`'flex'` for the default look, whose own comment says the caller passes `gap-1.5 flex-wrap`)
- Severity: looks wrong
- Fix: pass `className="gap-1.5 flex-wrap"` or use `look="segmented"` with shorter labels ("Track items" / "Rendered file").
- Evidence: `production/editing-check-never-checked/w1440.png` (y 142-178, x 1139-1422); `.../w390.png`
- Shared: `ToggleGroup` default look (check other callers)

#### PRD-15 Track panel: a wrapped fact value is left-aligned while the others are right-aligned

- Page / state: chapter-track-panel-linked, -missing, -ambiguous (n/a), chapter-remove-confirm (behind the dialog)
- Widths: 390, 768, 1440 ("Linked  Sep 1, 2026, 12:00 PM, by / you": value starts at x=1191 and "you" falls under it on the left; the other values end at x=1422 right-aligned). theme: both
- What is wrong: the Fact row is `justify-between` with no `text-right` and no `min-w-0`, so once the value wraps its second line is left-aligned and the label/value pair looks broken.
- Where: `apps/ui/src/components/production/ChapterTrackPanel.tsx:337-340` (`Fact`: value span has no `text-right`)
- Severity: polish
- Fix: add `text-right` to the value span.
- Evidence: `production/chapter-track-panel-linked/w1440.png` (y 284-312); `.../w390.png`
- Shared: page-local

#### PRD-16 Timer figures strip: a short second row has a rule under the left cell only, and tiles at 390 do not share a baseline

- Page / state: at-risk, on-pace, report-dialog (any state with the Work time / PFH / Effective rate strip)
- Widths: 768, 1024 (third tile alone on a second row, with a rule over x 17-384 and nothing over the other half); 390 (the label "HOURS PER FINISHED HOUR" wraps, so "19.6 : 1" is at y=654 while "32:00" beside it is at y=625). 1280+ is fine (3 across). theme: both
- What is wrong: at 36 rem to 64 rem the strip is 2 columns, so the odd tile sits alone with a half-width divider and a blank half-row; at 390 the label wrapping pushes one value lower than its neighbour.
- Where: `apps/ui/src/components/primitives/StatStrip.tsx:20-27` (`--strip-half` columns, tile `border-t border-l`), `StatTile.tsx` (label does not reserve two lines); data from `ProductionPage.tsx:68-104` (`TimerFigures`)
- Severity: polish
- Fix: for three items use 3 columns from 36 rem (or `col-span-full` on the odd tile) and give the label a `min-h` of two lines when the strip is 2-up.
- Evidence: `production/at-risk/w768.png` (y 476-672); `.../w390.png` (y 600-840); `at-risk/w1024.png`
- Shared: `StatStrip` (also on other pages that use it)

#### PRD-17 Dialog footer buttons wrap or crowd at 390

- Page / state: credits-setup-dialog(-narrator-default), chapter-remove-confirm, chapter-sync-consent
- Widths: 390. theme: both
- What is wrong: in a 271 px dialog the credits dialog's three buttons wrap ("DON'T ASK FOR / THIS PROJECT", "NOT / NOW") and "REMOVE FROM / RECORDING" wraps to two lines while its neighbour "CANCEL" is one line.
- Where: `apps/ui/src/components/primitives/Dialog.tsx:195` (footer `flex ... gap-2`, no wrap), buttons from `ConfirmDialog.tsx:68-80` and the credits dialog; made worse by PRD-5's 70vw width
- Severity: looks wrong
- Fix: let the footer stack (`flex-col-reverse`/wrap) below ~28rem and fix PRD-5.
- Evidence: `production/credits-setup-dialog/w390.png` (footer y 705-742); `chapter-remove-confirm/w390.png` (y 592-627)
- Shared: `Dialog` footer

#### PRD-18 Load error: different left edge and gutter than the page

- Page / state: load-error
- Widths: 1440 (title and card start at x=468 and are 720 wide; the Production page title is at x=232), 768 and 390 (title at x=40; every other state's title is at x=16). theme: both
- What is wrong: the error is drawn in a centred `max-w-3xl` column with an extra `p-6`, so the page title jumps right and the heading size changes between loaded and error states.
- Where: `apps/ui/src/components/layout/LoadError.tsx:56` (`mx-auto max-w-3xl space-y-4 p-6`)
- Severity: polish
- Fix: drop the `mx-auto max-w-3xl p-6` so it follows the page gutters, or document it as intentional.
- Evidence: `production/load-error/w1440.png` (title x=468); `.../w390.png` (title x=40) vs `at-risk/w390.png` (x=16)
- Shared: `LoadError` (every page's load-error state)

#### PRD-19 Options dialogs: fixed 224 px label column and a lone Close button on the left

- Page / state: recording-check-rules, stage-suggestion-options
- Widths: 1440, 1920 (labels wrap at x≈460 with 500+ px free; controls start at x=471 and the right 600 px of the dialog is empty), 390. theme: both
- What is wrong: each row has a `w-56` label, so "Share of each paragraph that must be read" and "Rendered file: integrated loudness (proofing)" wrap onto two lines with a mostly blank dialog, and the single Close button is at the left (x=233), where every other dialog puts its primary action at the right.
- Where: `apps/ui/src/components/proof/proofOptions/ProofOptions.tsx:95` (`<span className="w-56 ...">`) and :135-142 (one action, so `Dialog.tsx:195`'s default `justify-between` sends it left)
- Severity: looks wrong
- Fix: let the label column be `min-w-0 flex-1` (or a grid with an `auto` first column) and pass `actionsAlign="end"` for a single button.
- Evidence: `production/recording-check-rules/w1440.png` (label wraps at y 397-417; Close at x 233); `stage-suggestion-options/w1440.png`
- Shared: `ProofOptions` (also used on the Proof page) and the `Dialog` footer default

#### PRD-20 Report dialog at 390: the preview and the Cancel / Export buttons are below the first screen

- Page / state: report-dialog
- Widths: 390. theme: both
- What is wrong: the headerless dialog's whole content (options, format, preview pane, footer) scrolls as one block, so at 390 the first view ends at the file path and Export / Cancel are not visible without scrolling (I saw no footer in the shot; I did not see the scrolled view).
- Where: `apps/ui/src/components/production/report/ReportDialog.tsx:84-160` (footer inside the same scrolling wrapper), `Dialog.tsx:176` (body `overflow-y-auto`)
- Severity: polish
- Fix: keep the footer outside the scrolling area.
- Evidence: `production/report-dialog/w390.png` (dialog ends y=758 with no buttons)
- Shared: page-local

#### PRD-21 Dialog footer is 1.6 px narrower than the header and body, and the body focus ring runs edge to edge

- Page / state: all dialogs (e.g. import-activity-log, chapter-remove-confirm, recording-check-rules)
- Widths: 1440 (header X right edge x=1205, progress bar right edge x=1205, footer Close/Cancel right edge x=1207, left edge x=233 vs body text at x=234.6). theme: both
- What is wrong: header and body use `1.1rem` padding but the footer uses `px-4` (1rem), so the button edges are about 1.6 px outside the content edges; when the body is focused (it auto-focuses when it is the scroll area) the ring is drawn flush to the dialog's left and right edges, over the header and footer dividers.
- Where: `apps/ui/src/components/primitives/Dialog.tsx:163` (`px-[1.1rem]`), `:176` (body `p-[1.1rem]`, `focus-visible:ring-inset`), `:195` (`px-4 pt-3 pb-4`)
- Severity: polish
- Fix: use `px-[1.1rem]` on the footer; inset the focus ring (outline offset) or move focus to the dialog.
- Evidence: `production/import-activity-log/w1440.png` (X at x 1169-1205 vs Close x 1146-1207); `recording-check-rules/w1440.png` (blue ring x 217-1223)
- Shared: `Dialog` primitive

#### PRD-22 Stage readiness evidence rows: "Met" / "Not met" sits 3 px above the first line of its text

- Page / state: stage-evidence-recommended, stage-evidence-not-ready
- Widths: 1440, 390. theme: both
- What is wrong: rows are `items-start`, so the 12 px mono verdict aligns to the row top while the 14 px bold label's first line sits about 3 px lower ("Met" at y=313 vs "Every paragraph..." at y=316).
- Where: `apps/ui/src/components/production/readiness/ReadinessPanel.tsx:30-38` (`flex items-start`; value `flex-none font-mono text-xs`)
- Severity: polish
- Fix: `items-baseline` on the row (or `mt-0.5` on the value).
- Evidence: `production/stage-evidence-recommended/w1440.png` (y 313-316); `stage-evidence-not-ready/w1440.png` (y 345 vs 348)
- Shared: page-local

#### PRD-23 Select next to a button: 40.8 px control beside a 36 px button

- Page / state: chapter-track-panel-ambiguous (Link: select + Confirm), recording-check-refused (select + Confirm)
- Widths: 1440, 390 (select y 362-403 = 41 px, Confirm y 364-399 = 36 px). theme: both
- What is wrong: the select uses `--control-height` (40.8 px) and its button `--button-height` (36 px); they are centred but the top and bottom edges differ by about 2.4 px.
- Where: `apps/ui/src/components/mapping/MappingConfirm.tsx` (select + Button in one row; token pair in `styles.css`)
- Severity: polish
- Fix: use the `sm`/matching height for the button or the select in that row.
- Evidence: `production/chapter-track-panel-ambiguous/w1440.png` (y 362-403); `recording-check-refused/w1440.png` (y 216-253)
- Shared: `Select` vs `Button` height tokens

#### PRD-24 Recorded-vs-plan chart: text drawn on top of lines

- Page / state: chapter-removed-list, credits-closing-not-set-up, recording-check-running (chart visible), 1280 too
- Widths: 1440 (the dotted forecast line runs through the word "today" at x≈1310, y≈606; "Recorded days not measured yet" is struck by the 2h gridline at y≈694); 1280 ("today" crossed at x≈1080). theme: both
- What is wrong: the annotations are placed without clearing the gridlines or the forecast line, so the text is struck through.
- Where: `apps/ui/src/components/production/overview/ProgressChart.tsx` (SVG `<text>` annotations around :118-125)
- Severity: polish
- Fix: offset the labels above the line or add a background (`paint-order: stroke`) to them.
- Evidence: `production/chapter-removed-list/w1440.png` (y 600-615 and 546); `credits-closing-not-set-up/w1440.png` (y 694, 756)
- Shared: page-local

#### PRD-25 No-manuscript page: title is smaller and about 3 px higher than the Production title; skeleton shows 4 KPI tiles where the page has 6

- Page / state: no-manuscript and manuscript-candidate-offer (title); loading (skeleton)
- Widths: 1440 (title text 108 px wide at x 232-340, y=83, against 131 px at y=86 on the loaded page), 390 same. Skeleton: 1440, 1280, 1024 (4 tiles, then 3 cards, then the table) versus the real 6 KPI tiles. theme: both
- What is wrong: the empty state's Heading uses the default size where the board uses the hero size, so the "Production" heading visibly changes size and jumps between states; the skeleton grid does not match the loaded layout so the page jumps when it loads.
- Where: `apps/ui/src/components/production/pipeline/NoManuscript.tsx:11` (`<Heading title="Production">` with no `size="hero"`, compare `PageHeader.tsx:68`); `overview/ProductionSkeleton.tsx:9` (`min-[1024px]:grid-cols-4`)
- Severity: polish
- Fix: pass `size="hero"`; make the skeleton 6 tiles in the same strip.
- Evidence: `production/no-manuscript/w1440.png` (title y≈83); `at-risk/w1440.png` (y≈86); `loading/w1440.png` (4 tiles at y 178-274)
- Shared: page-local

#### PRD-26 Sync-consent dialog: lead paragraph runs straight into the first section heading

- Page / state: chapter-sync-consent
- Widths: 1440 (paragraph ends y=365, "WILL BE LINKED (2)" at y=385, 20 px, against 28 px between later sections), 390 (the heading touches the paragraph, y 325-346). theme: both
- What is wrong: the lead paragraph has no bottom margin, so the first section heading sits tight under it and the grouping reads as part of the paragraph.
- Where: the dialog body built in `apps/ui/src/components/production/useChapterTools.tsx` / `chapterSyncToastText.ts` (consent body); cause line not located (I did not trace which element lacks the margin)
- Severity: polish
- Fix: add the same bottom spacing as between sections.
- Evidence: `production/chapter-sync-consent/w1440.png` (y 335-395); `.../w390.png`
- Shared: page-local

### Schedule

#### SCH-1 Contract card: "Paid" select and "Amount" input have different left edges, the select is right-aligned while labels are left, and at 1280 and below the label is ~900px from its control (confirmed)

- Page / state: schedule / on-pace, at-risk, long-text, overdue (all states that show the rate; no-due-date shows only the select)
- Widths: 1440, 1920, 1280, 1024, 768, 390 (theme: both).
- What is wrong: at 1440 the labels start at x=1081, the "Paid" select spans x 1234-1407 and the "Amount" input x 1172-1292 followed by "per finished hour" to x=1407, so the two controls start 62px apart and nothing forms a control column; at 1280/1024/768 the card is full width so "Paid" (x=97) and its select (x=1075) are ~980px apart across the card.
- Where: `apps/ui/src/components/schedule/ContractPanel.tsx:53-80` (each row `flex items-center justify-between gap-3`, `<dd>` right-aligned, input fixed `w-[7.5rem]!` plus a unit text, select intrinsic width).
- Severity: looks wrong
- Fix: two-column grid `grid-cols-[8rem_1fr]` with controls starting at the same x (select `w-full`), unit text after the input inside the second column.
- Evidence: `schedule/on-pace/w1440.png` (Paid y~230, Amount y~278), `.../overdue/w1280.png` (rows y 143-230), `.../on-pace/w768.png`.
- Shared: `justify-between` label/control rows: same family as DLV-2 and DLV-4. I found no other card on my three pages that mixes a select and a number box this way (the Thresholds list and "How this is worked out" use text values, so right-alignment is fine there); I did not audit other pages.

#### SCH-2 Select is 41px tall, text inputs are 36px: mixed control heights in the same form

- Page / state: schedule / Contract card (select y 210-251, input y 261-297) and milestone-dialog (Name, Due 36px; Measures select ~41px)
- Widths: all (theme: both).
- What is wrong: neighbouring controls in one card or dialog have different heights, and Name (42 with focus ring) / Due (36) / Measures (41) in the dialog do not read as one stack.
- Where: `apps/ui/src/components/primitives/Select.tsx:48` (`--control-height` 40.8px) vs `apps/ui/src/components/primitives/TextField.tsx:13` (`h-9`, 36px; `sm` `h-8`).
- Severity: looks wrong
- Fix: set TextField md to `--control-height` (or Select to 36px) so both share one token.
- Evidence: `schedule/on-pace/w1440.png` (x 1172-1407), `schedule/milestone-dialog/w1440.png` (fields at y 292, 376, 455).
- Shared: Select vs TextField (also DLV-3, master to-spec `to-spec-picked/w1440.png`).

#### SCH-3 Chart annotation "Recorded days not measured yet" is struck through by the 2h gridline and crosses data lines at narrow widths

- Page / state: schedule / every state with the chart (on-pace, at-risk, overdue, no-due-date, long-text)
- Widths: 1440/1920/1024/768 (struck through by the 2h gridline); 390 (crosses the dashed plan line and, in at-risk, the "done Oct 4 (est.)" label touches the due line) (theme: both).
- What is wrong: the muted label sits exactly on the 2h horizontal gridline so the line runs through the letters, and at 390 the text runs into the dashed plan line ("days not measured yet" is crossed).
- Where: `apps/ui/src/components/production/overview/ProgressChart.tsx:161` (`y={(PAD.top + y(0)) / 2}` lands on the middle gridline; fixed x `PAD.left + 8`, no halo or collision handling).
- Severity: looks wrong
- Fix: offset the label above the gridline or give it a surface-coloured halo (`paint-order: stroke`), and hide it when narrower than its text.
- Evidence: `schedule/on-pace/w1440.png` (x 297-459, y 470), `.../overdue/w390.png` (x 81-243, y 374), `.../at-risk/w390.png` (done label x 240-322, y 297).
- Shared: ProgressChart is also on the Production overview.

#### SCH-4 Loading skeleton does not match the loaded layout (two equal columns instead of 2/3 + 1/3, and two columns where the real page stacks)

- Page / state: schedule / loading
- Widths: 1440 (50/50: left block x 232-820, right x 836-1424; real page is 232-1047 and 1065-1423), 1024 and 768 (skeleton shows two columns, real page is one) (theme: light).
- What is wrong: content jumps sideways and the right column changes width when data arrives; the skeleton also shows a short left block (140-418) against the real chart's height 143-768.
- Where: `apps/ui/src/components/schedule/ScheduleSkeleton.tsx:18` (`md:grid-cols-2`) vs `apps/ui/src/components/schedule/SchedulePage.tsx:226` (`min-[1281px]:grid-cols-[minmax(0,1fr)_22.5rem]`).
- Severity: looks wrong
- Fix: reuse the page's grid classes in the skeleton.
- Evidence: `schedule/loading/w1440.png`, `.../w390.png` for comparison with on-pace.
- Shared: page-local.

#### SCH-5 Stacked "Milestone added" toasts cover the Add button, the Status column and the row actions in the long-text state

- Page / state: schedule / long-text (table bottom)
- Widths: 1440, 1280, 1920, 768, 390 (theme: both).
- What is wrong: three toasts stack over the right edge of the Milestones header and rows, hiding "+" (at 768/390 only a sliver shows), the Status chips and the row action buttons.
- Where: toast stack container (global, bottom right); the fixture fires three toasts at once. The cause of three stacked toasts (versus one) was not found.
- Severity: looks wrong
- Fix: collapse duplicate toasts and offset the stack away from the content.
- Evidence: `schedule/long-text/w1440.png` (toasts x 1213-1420, y 730-880), `.../w768.png` (y 853-1005 covering "+").
- Shared: the toast region (global).

#### SCH-6 Milestone dialog is ~1000px wide at 1440 with full-width fields; Milestones table columns are spread wide at 1920

- Page / state: schedule / milestone-dialog (1440); on-pace, long-text (1920)
- Widths: 1440 dialog (x 217-1223, fields 235-1205), 1920 table (theme: light).
- What is wrong: Name, Due and Measures inputs stretch 970px for short values and the Note box is wider than it is useful; at 1920 the Milestones table puts MEASURES at x=899 and DUE at x=1425 with 330px blank after STATUS in the "Final delivery" row.
- Where: dialog frame in `apps/ui/src/components/schedule/MilestoneDialog.tsx` (width comes from the shared Dialog; exact class not pinned down), table `apps/ui/src/components/schedule/MilestoneTable.tsx:55-63` (`min-w` only; no column widths).
- Severity: polish
- Fix: cap the dialog (about 32rem) and give the table fixed widths for Measures, Due and Status.
- Evidence: `schedule/milestone-dialog/w1440.png`, `schedule/on-pace/w1920.png` (y 845-930).
- Shared: Dialog width (also MST-9).

### Script

#### SCR-1 Selection toolbar stays on screen above the rail drawer and covers its content

- Page / state: script, `rail-words` (selection kept while the rail drawer opens)
- Widths: 1280, 768, 390 (light).
- What is wrong: the black selection toolbar (Mark / Story Bible / bookmark / Look up) is a fixed popover with a higher layer than the drawer, so at 390 it sits across the middle of the open "Lookups and marks" drawer and hides "LOOK UP ON THE WEB" and the three buttons under it.
- Where: `apps/ui/src/components/script/page/tools/select/SelectionTool.tsx:92-96` (`fixed ... z-[var(--z-popover)]`, 55) vs the drawer panel at `--z-panel` (20) from `apps/ui/src/components/script/page/layout/ScriptColumns.tsx:17-18`; it is only dismissed by Escape or a mouse press, not by a drawer opening.
- Severity: looks wrong (if a narrator can open the rail from the keyboard with a selection)
- Fix: dismiss the selection toolbar when `drawer` changes.
- Evidence: `script/rail-words/w390.png` (toolbar y=402-460), `script/rail-words/w768.png` (y=347-391), `script/rail-words/w1280.png`.
- Shared: page-local.

#### SCR-2 Selection toolbar is placed 130-240px above the selected word

- Page / state: script, `selection-tools`
- Widths: 1440 (toolbar y=480-524, word y=705-739), 1280 (y=424-467 vs word y=672-705), 768 (y=536-579 vs word y=671-705); at 390 the selected word is not on screen. Light.
- What is wrong: the toolbar covers other lines of text instead of sitting on top of the selection.
- Where: `apps/ui/src/components/script/page/tools/select/SelectionTool.tsx:56-59` (`top = rect.top / zoom - ABOVE` on a `fixed` element, computed once per render from the selection rectangle). The state is `reloadPerViewport` (POPUP_ANCHORED_AT_FIRST_WIDTH) so this may be the capture scrolling the reader after the selection; cause not confirmed.
- Severity: looks wrong (unconfirmed; may be harness)
- Fix: recompute on scroll/resize or anchor the toolbar to the selection with a popover primitive.
- Evidence: `script/selection-tools/w1440.png`, `w1280.png`, `w768.png`.
- Shared: page-local.

#### SCR-3 Chapter and rail drawers are off-centre at 390

- Page / state: script, `chapter-list` (chapters drawer), `rail-*` (rail drawer)
- Widths: 390 (light). At 768 the 360/380px cap hides it.
- What is wrong: the Chapters drawer is 8px from the card's left edge (x=25) and 16px from its right (x=357 vs card x=373); the rail drawer is the mirror (x=33 left gap 16, right gap 8).
- Where: `apps/ui/src/components/script/page/layout/ScriptColumns.tsx:17-18` (`left-2`/`right-2` with `w-[min(360px,calc(100%-24px))]`; two 8px margins need `-16px`). The Editing drawer uses `-16px` (`apps/ui/src/components/editing/drawer/DrawerLayout.tsx:5`).
- Severity: polish
- Fix: use `calc(100%-16px)` in both drawers.
- Evidence: `script/chapter-list/w390.png` (card x=17-373, drawer x=25-357), `script/rail-queries/w390.png` (drawer x=33-365).
- Shared: page-local (Editing's drawer is correct).

#### SCR-4 Reader header truncates the chapter title to "Chapter 1 — …" at 390

- Page / state: script, every reader state
- Widths: 390 (light); 768 fits.
- What is wrong: five 36px icon buttons (chapters, columns, bookmarks, find, text settings) take about 200px of the header, so the title that says which chapter you are in is cut to "Chapter 1 — …" (and "Opening cre…").
- Where: reader header in `apps/ui/src/components/script/page/reader/Reader.tsx` (icon row beside the title; `apps/ui/src/components/script/page/ScriptPage.tsx:487-491` shows two of the buttons only below 1180/1281px). Cause: title shares one row with the buttons and has `truncate`; exact line not located.
- Severity: looks wrong
- Fix: drop the subtitle row beside the buttons, put the title on its own line at 390, or move rarely used buttons into a menu.
- Evidence: `script/reader/w390.png` (y=80-125), `script/credits-setup-banner/w390.png`.
- Shared: page-local.

#### SCR-5 Find results list: location label wraps onto two lines

- Page / state: script, `find`
- Widths: 1440, 768, 390 (light).
- What is wrong: every result row shows "Chapter 1 ·" with "¶ 1" under it because the label is fixed at 92px and is wider (about 105px as mono 12px), so rows are two lines tall even when the text is one line, and the " · " dangles at the end of line one.
- Where: `apps/ui/src/components/script/page/tools/find/FindBar.tsx:103` (`w-[92px] flex-none font-mono text-xs`).
- Severity: looks wrong
- Fix: widen to `w-[7rem]` or format the label without the middle dot.
- Evidence: `script/find/w1440.png` (x=516-593, y=198-215), `script/find/w768.png`.
- Shared: page-local.

#### SCR-6 Queries filter group stretches full width but its buttons stay clustered at the left

- Page / state: script, `rail-queries`
- Widths: 1440 (group x=1057-1411, segments end at x=1245), 390 (group x=45-353, segments end at x=240) (light).
- What is wrong: the segmented control is a bordered box across the whole rail but "Open 0 / Resolved 0 / All" fill only the first 55%, leaving a 165px empty strip inside the border.
- Where: `apps/ui/src/components/script/page/rail/threads/ThreadsPanel.tsx:43-53` puts the ToggleGroup in a `flex flex-col` (children stretch), while `apps/ui/src/components/primitives/ToggleGroup.tsx:36-37` (`inline-flex`) does not give the pills `flex-1`.
- Severity: looks wrong
- Fix: add `w-fit` (or `self-start`) to the group, or make the pills `flex-1`.
- Evidence: `script/rail-queries/w1440.png` (y=120-153), `script/rail-queries/w390.png`.
- Shared: ToggleGroup `segmented` (also check Master/Settings uses).

#### SCR-7 Mark definitions dialog: trash button wraps to its own line at 768, rows split into three lines at 390

- Page / state: script, `define-marks`
- Widths: 768 (each row: swatch, name, colour, line, Asks on row 1; trash alone under the swatch at x=134-170), 390 (name / selects / Asks+trash); 1440 is fine (single row). Light.
- What is wrong: the row is `flex-wrap` and just too wide, so the trash orphan drops by a few pixels at 768 and leaves a 36px empty line per type (about 90px per row, 560px total).
- Where: `apps/ui/src/components/script/page/tools/select/MarksDialog.tsx:71` (`flex flex-wrap items-center gap-2`) with `:78` (`min-w-[10rem] flex-1` name).
- Severity: looks wrong
- Fix: reduce the name's `min-w` or allow the selects to shrink so trash stays on row 1 at 768; use a two-line grid at 390.
- Evidence: `script/define-marks/w768.png`, `script/define-marks/w390.png`.
- Shared: page-local.

#### SCR-8 Credits card padding differs from the chapter card's

- Page / state: script, `credits-cards`, `credits-setup-banner`
- Widths: 1440, 390 (light).
- What is wrong: the Opening-credits card's label and mic button are 13px inside its border (label x=522, mic right edge x=994 in a card x=509-1007) while the chapter card under it uses 17px (label x=526, mic right x=990); at 390 the same (x=50 vs 54).
- Where: `apps/ui/src/components/script/page/chapters/CreditsSection.tsx:48` (`<InsetCard fill ...>` default frame) vs `apps/ui/src/components/script/page/chapters/ChapterCard.tsx:48-50` (`frame="roomy"`).
- Severity: polish
- Fix: pass `frame="roomy"` in CreditsSection.
- Evidence: `script/credits-cards/w1440.png` (y=170-205 vs y=555-570).
- Shared: page-local.

#### SCR-9 Credits text is indented 32px, off both the card and the page text edge

- Page / state: script, `credits-cards`, `credits-setup-banner`
- Widths: 1440 (text x=541), 390 (x=69) (light).
- What is wrong: "[Title], written by [Author], narrated by [Narrator]." starts 32px in from the column edge (x=541 at 1440) while the card above starts at 509, its inner content at 522 and the normal paragraphs at 509, so the line lines up with nothing.
- Where: `apps/ui/src/components/script/page/chapters/CreditsSection.tsx:77` (`relative pb-3 pl-8`) and `:92`.
- Severity: polish
- Fix: align to the card's content edge, or to the page text edge.
- Evidence: `script/credits-cards/w1440.png` (y=419).
- Shared: page-local.

#### SCR-10 Skip-to-side-panel button has no padding when it appears

- Page / state: script, `skip-to-side-panel`
- Widths: 1440 (light); same at every width the button shows.
- What is wrong: when focused the button's label touches its border (x=877 with the text starting at x=878) and it lies over the chapter divider line and the top of the chapter card.
- Where: `apps/ui/src/components/script/page/layout/SkipToRail.tsx:33` (`sr-only focus:not-sr-only focus:absolute`): `not-sr-only` resets padding to 0, overriding the Button's own padding.
- Severity: polish
- Fix: add `focus:px-3` (the Button's padding) to the class.
- Evidence: `script/skip-to-side-panel/w1440.png` (x=876-1015, y=138-170).
- Shared: page-local.

#### SCR-11 Rail tab strip: bookmark icon sits 2px high and the strip is 2px too wide at 390

- Page / state: script, all `rail-*` states
- Widths: 1440 (icon centre y=85 vs text y=87), 390 (strip scrollW 334 > clientW 332; the bookmark tab's underline runs to the drawer edge at x=363) (light).
- What is wrong: the icon tab is not on the same baseline as the text tabs, and at 390 the last tab touches the edge and the strip scrolls by 2px.
- Where: `apps/ui/src/components/script/page/layout/RailPanel.tsx:38-44` (`inline-flex items-center` icon span) and `:35` (`px-1` list); tab classes in `apps/ui/src/components/primitives/Tabs.tsx`.
- Severity: polish
- Fix: align the icon with `translate-y`/`items-baseline` and drop `px-1` or the tab gap at 390.
- Evidence: `script/rail-bookmarks/w1440.png` (x=1345-1370, y=75-95), `script/rail-bookmarks/w390.png`.
- Shared: Tabs primitive for the tab strip.

#### SCR-12 Rail table and list text is inset 10px from its section label

- Page / state: script, `rail-words`, `rail-story-bible`
- Widths: 1440 ("DEFINITIONS FROM"/"IN THIS CHAPTER" at x=1057; table headers and word names at x=1067), 390 (x=45 vs 55) (light).
- What is wrong: labels sit at the panel padding, the table/list text 10px further in while the rules run full width, so the text is not on the label's left edge.
- Where: cause not found; the rows live in `apps/ui/src/components/script/page/rail/words/WordsTab.tsx` and `apps/ui/src/components/script/page/rail/bible/BibleTab.tsx` (cell padding `px-2.5`).
- Severity: polish
- Fix: inset the labels to match the cells or remove the cell padding.
- Evidence: `script/rail-story-bible/w1440.png` (y=130-170), `script/rail-words/w1440.png`.
- Shared: page-local.

#### SCR-13 Bookmark ribbon touches the reader's left border; bookmark row buttons nearly touch the row edge

- Page / state: script, `bookmark-added`, `rail-bookmarks`
- Widths: 1440 (ribbon x=490-505 against the panel edge x=489), 390 (ribbon x=19-34 against x=17); row: pencil/trash buttons end 3px from the row border at 1440 and 390 (light).
- What is wrong: the ribbon is flush to the panel border with no margin; in the rail row the 34px icon buttons fill the 40px row so their gap to the row border (3px) is far smaller than the text's left inset (11px).
- Where: `apps/ui/src/components/script/page/layout/BookmarkGutter.tsx` (ribbon in the left gutter) and the bookmark row in `apps/ui/src/components/script/bookmarks/` (cause not located precisely).
- Severity: polish
- Fix: give the ribbon a 4-6px left margin; use `sm` icon buttons in the row.
- Evidence: `script/rail-bookmarks/w1440.png` (x=490, y=720; row x=1340-1406, y=153-190), `script/bookmark-added/w390.png`.
- Shared: page-local.

#### SCR-14 Dialog footers: Done and Save buttons end 2px right of the content edge

- Page / state: script, `define-marks`, `mark-composer`
- Widths: 1440 (Done/Save right edge x=1207; the trash buttons, the textarea and the close button end at x=1205) (light).
- What is wrong: the primary button in these footers overshoots the dialog content's right edge by about 2px.
- Where: cause not found (`Dialog` actions in `apps/ui/src/components/primitives/Dialog.tsx` with `actionsAlign="end"` at `apps/ui/src/components/script/page/tools/select/MarksDialog.tsx:68`); the Editing dialogs end at x=1205, so the Script ones differ.
- Severity: polish
- Fix: align the footer's right padding with the body's.
- Evidence: `script/define-marks/w1440.png` (x=1152-1207, y=647-683), `editing/delete-dialog/w1440.png` (Delete button right at x=1205).
- Shared: Dialog primitive (to verify).

### Story Bible

#### SB-1 Entry header collapses beside its actions: Name input 8-10px wide, pills one letter per line (390), pills wrap mid-word (768)

- Page / state: storybible, any entry that shows the Mark reviewed button. alias-pronunciation-editing (the failing suite check), review-filter, entry-needs-review, entry-pronunciation-missing (White Rabbit / March Hare / Hatter).
- Widths: 390 (title and pills unusable), 768 (pills wrap) (theme: both, not theme dependent)
- What is wrong: the header's left group (title or Name input plus kind and review pills) gets only what the actions leave over, so at 390 the Name input is 8px wide (invisible, the entry cannot be renamed), the "Character" and "Needs review" pills are drawn one letter per line (~10px wide, 120px tall), and "White Rabbit" wraps; at 768 "Charact/er" and "Needs/review" wrap inside the pills.
- Where: `apps/ui/src/components/storybible/GuideDetail.tsx:147` (EntryFrame) left group is `flex min-w-0 flex-1 flex-wrap`, so its flex-basis is 0 and `PANEL_HEADER_CLASS` (`apps/ui/src/components/primitives/panelStyles.ts:8`, `flex-wrap`) never wraps it under the actions; the actions group (`GuideDetail.tsx:156`, Mark reviewed + search + save + cancel + divider + delete, about 290px) takes the whole line. The Name wrapper at `GuideDetail.tsx:605` (`min-w-0 flex-[1_1_12rem]`) then shrinks to the leftover 8px. The pills (`badgeClass('pill')` Menu trigger at `GuideDetail.tsx:624`, StatusBadge) have no `shrink-0`/`whitespace-nowrap`.
- Severity: breaks use
- Fix: give the left group a real minimum (e.g. `basis-[12rem]` or `min-w-[min(100%,12rem)]` instead of basis 0) so the actions wrap to their own row, and make the pills `shrink-0 whitespace-nowrap`.
- Evidence: `storybible/alias-pronunciation-editing/w390.png` (header at y=68-260: dot at top, two vertical pills x=32-82, no Name input), `.../review-filter/w390.png` (y=590-830, "White / Rabbit" and vertical pills), `.../alias-pronunciation-editing/w768.png` (pills at x=253-413, y=571-596 wrapped), `.../alias-pronunciation-editing/w1024.png` (header already wraps to two rows here, which is the intended behaviour).
- Shared: yes, same pattern in `apps/ui/src/components/primitives/Panel.tsx:97` (PanelHeader). Also on: proof `CompareRun.tsx:306` at 390 (title "Compare the recording with the script" is one word or half-word per line beside the 3-step strip, `global/toast/w390.png` y=60-270). See GLB-2.

#### SB-2 Properties editor at 390: Name and Value inputs are 62-84px wide and clip their text

- Page / state: storybible / entry-properties-editing (edit mode with properties)
- Widths: 390 (also tight at 768, fine at 1024+) (theme: both)
- What is wrong: three columns of inputs plus a three-button group share a 322px table, so the Value inputs are 62px wide and show "Seven", "Oxforc" (clipped), "Wren"; the Name column is 84px.
- Where: `apps/ui/src/components/storybible/PropertiesSection.tsx:92-109` (EditRow: two TextField cells, then a `flex justify-end gap-1` cell with three IconButtons at fixed width); the Table has no column widths (auto layout) and the button cell does not wrap or stack.
- Severity: looks wrong
- Fix: at narrow widths stack the row (inputs full width, buttons on their own line) or drop the move up/down buttons into a menu.
- Evidence: `storybible/entry-properties-editing/w390.png` (rows at y=398-530; inputs x=43-127 and x=147-211; probe `clipped-x` "Property 2 value" scrollW 67 > clientW 62).
- Shared: page-local

#### SB-3 Series tab at 390: a clip row with two badges squeezes its text to one word per line

- Page / state: storybible / series-tab-populated (Hatter ref (moved) row)
- Widths: 390 (768 is fine) (theme: both)
- What is wrong: "Hatter ref (moved)" truncates to "Hatter …" and its meta line wraps one word per line in a 66px column while "This book" and "Changed since approval" take 200px beside it.
- Where: `apps/ui/src/components/series/SeriesTab.tsx:165-176` (InsetCard `flex items-center gap-2`; badges are siblings of the `min-w-0 flex-1` text, never wrap or drop below).
- Severity: looks wrong
- Fix: `flex-wrap`, or put the badges on their own line under the text below sm.
- Evidence: `storybible/series-tab-populated/w390.png` (card y=475-663, text column x=59-125).
- Shared: page-local

#### SB-4 Name rows: text sits 5-6px above the centre of the 36px button next to it (read view)

- Page / state: storybible, any entry in read view (entity-selected, entry-locked, character-voice-references, entry-needs-review, voice-samples-empty, review-filter)
- Widths: all (1440 measured: name and Source chip centred at y=198, the play button spans y=186-222 so centre 204; second row of Hatter: text 246, button centre 252) (theme: both)
- What is wrong: the name, IPA text and Source chip are vertically top-aligned while the Play button and the Rescan button are 36px, so the row looks lopsided.
- Where: `apps/ui/src/components/storybible/GuideDetail.tsx:769` (`<li className="flex items-start gap-2">`) with the read-only value row from `source/NamePronunciation.tsx:~127` having no min height. In edit mode the input (40px) happens to match, so it only shows in read view.
- Severity: looks wrong
- Fix: `items-center` on that li (or `min-h-9` on the read row), keeping `items-start` only when a note or badge is below.
- Evidence: `storybible/entity-selected/w1440.png` (y=186-222, x=585-1407), `.../entry-locked/w1440.png` (y=230-266), `.../character-voice-references/w1440.png`.
- Shared: page-local

#### SB-5 Name rows do not share columns: input and Source button edges differ per row; one row wraps its Source button, the next does not

- Page / state: storybible / alias-pronunciation-editing, entry-editing, entry-pronunciation-*, review-filter (read view)
- Widths: 1440 (edit: row 1 input ends x=1197, Source button 1205-1319; row 2 input ends x=1110, Source 1117-1275), 1024 (row 1 inline, row 2 "Entered by me" wrapped under the input at x=433-590, y=356), 768 (both inline). Read view at 1440: Source chip right edge x=1362 in row 1 but 1320 in the "Rabbit" row (which has an extra check button) (theme: both)
- What is wrong: the number of trailing buttons differs per row (play, record, mark-reviewed, remove), so the input widths and Source button positions do not line up from one name to the next, and the wrap point differs per row.
- Where: `GuideDetail.tsx:769-840` (each `li` is `flex items-start gap-2` with a variable button count after a `flex-1` NamePronunciation) and `source/NamePronunciation.tsx:~123` (`flex flex-wrap items-center gap-2` with `min-w-[8rem]` on name and input).
- Severity: looks wrong
- Fix: give every row the same fixed action slots (reserve space for all trailing buttons, or move them into one right-aligned column) and give the Source tag a fixed width.
- Evidence: `storybible/alias-pronunciation-editing/w1440.png` (y=186-310), `.../alias-pronunciation-editing/w1024.png` (y=209-396), `.../review-filter/w1440.png` (y=186-270).
- Shared: page-local

#### SB-6 Entry header in edit mode: the kind pill floats far from the Name and sits 5px lower

- Page / state: storybible, every edit state (entry-editing, alias-pronunciation-editing, name-clash, entry-properties-editing, entry-suggestions via edit)
- Widths: 1440 (Name input x=604-~720, pill at x=928-1014), 1920 (pill at x=1168-1254), 768 (pill at x=316-402 mid-header), 1024 wraps below (theme: both)
- What is wrong: the Name input wrapper grows to fill the row (basis 12rem, `flex-1` grow), so the pill is pushed 200-500px from the name it describes; the pill's centre is at y=104 while the name text is at y=99. In read view the pill hugs the title at x=658.
- Where: `GuideDetail.tsx:605` (`min-w-0 flex-[1_1_12rem]` on the Name wrapper, grows) inside the baseline-aligned group at `GuideDetail.tsx:147`; the read title is not flex-grown.
- Severity: looks wrong
- Fix: give the Name wrapper a max width (e.g. `max-w-[24rem] flex-[0_1_24rem]`) so the pill follows it, and align both on the same centre line.
- Evidence: `storybible/entry-editing/w1440.png` (header y=70-128), `.../entry-editing/w768.png` (y=558-600), `.../alias-pronunciation-editing/w1440.png`.
- Shared: page-local

#### SB-7 "Needs verification" suggestion rows do not match entry rows (inset, type size, selected shape, right edge)

- Page / state: storybible / verification-filter, loose-suggestion, entry-suggestions list
- Widths: 1440 and 390 (theme: both)
- What is wrong: suggestion rows start at x=257 vs x=251 for entry rows, the second line is 16px and the title is larger than the entry rows' 15px/14px, and the selected suggestion fill is a square full-width block (x=241-543, no radius) while a selected entry is a rounded row; their confidence pills end at x=527 and the entry's "Verify · 2" pill at x=533.
- Where: `apps/ui/src/components/storybible/suggested/panel/LooseSuggestionRows.tsx:26-31` (`px-4 py-2`, no rounding, no text size) versus `Guide.tsx:482` (`rounded-lg px-2.5 py-2`, `text-[0.9375rem]`/`text-sm`) inside the same `p-2` list (`Guide.tsx:450`).
- Severity: looks wrong
- Fix: reuse the entry row classes (px-2.5, rounded-lg, same type sizes) for the suggestion rows.
- Evidence: `storybible/loose-suggestion/w1440.png` (list y=425-690), `.../verification-filter/w1440.png`, `.../verification-filter/w390.png` (rows at x=41 vs White Rabbit at x=35).
- Shared: page-local

#### SB-8 Voice data footer is not pinned to the bottom of the list card when the list is short

- Page / state: storybible / category-place, search-narrowed, category-organization, review-filter, verification-filter, loose-suggestion
- Widths: 1440 and 1024 (theme: both)
- What is wrong: with few rows the "Voice data" footer sits right under the last row (y=520 at 1440 in category-place) and leaves ~350px of empty card below it, instead of staying at the card's bottom edge as in the full list (y=856).
- Where: `apps/ui/src/components/storybible/Guide.tsx:450` (`guide-list-scroll min-h-0 overflow-y-auto p-2`, no `flex-1`), footer at `Guide.tsx:509`.
- Severity: looks wrong
- Fix: add `flex-1` to the scroll region (the footer then sits at the bottom).
- Evidence: `storybible/category-place/w1440.png` (footer at y=504-538), `.../search-narrowed/w1440.png`, `.../review-filter/w1440.png`.
- Shared: page-local

#### SB-9 Every Dialog is 70vw wide, even a one-line confirm

- Page / state: storybible / delete-confirm, remove-voice-*-confirm, voice-sample-delete-confirm, voice-sample-rename/move, voice-download-*, import-dialog; project / new-project-dialog; global / confirm-dialog, shortcut-sheet
- Widths: 1440 (dialog x=217-1223, 1006px wide, for a 520px sentence), 1920 (x=289-1631, 1342px), 768 (538px), 390 (271px, message wraps to 3-4 lines, buttons tight) (theme: both)
- What is wrong: the dialog takes 70% of the viewport whatever it holds, so Cancel and Delete sit 900px apart with a short sentence between, the shortcut sheet has labels at x=235 and keycaps at x=1205, and at 390 the same rule makes the dialog narrower than the content wants.
- Where: `apps/ui/src/components/primitives/Dialog.tsx:148-149` (`w-full ... max-w-[70vw]` for every size except `full`).
- Severity: looks wrong
- Fix: add a width scale (`sm` about 28rem for confirms, `md` about 36rem for forms, `lg` for the shortcut sheet), with `max-w-[calc(100vw-2rem)]` as the ceiling.
- Evidence: `storybible/delete-confirm/w1440.png`, `.../delete-confirm/w1920.png`, `.../delete-confirm/w390.png`, `global/shortcut-sheet/w1440.png`, `project/new-project-dialog/w1440.png`.
- Shared: Dialog primitive (all pages).

#### SB-10 Dialog description sits flush against the content under it

- Page / state: storybible / voice-sample-move; any Dialog with both `description` and children
- Widths: 1440 and 390 (theme: both)
- What is wrong: "Move "Tea party, quick" to another character." is at y=404 and the "Move to" label directly beneath at y=424 with no gap (20px line pitch, 0px margin); the Rename dialog's label-to-field spacing is 4px, so the Move dialog's description reads as part of the label.
- Where: `Dialog.tsx:178-184` (`Parts.Description` and `{children}` are adjacent siblings in the padded body, no `mb-*` or gap); `MoveVoiceSampleDialog.tsx:62` supplies the description.
- Severity: polish
- Fix: `mb-3` on the Description element.
- Evidence: `storybible/voice-sample-move/w1440.png` (y=395-435), `.../voice-sample-move/w390.png` (y=385-415).
- Shared: Dialog primitive

#### SB-11 Dialog footer buttons are inset 1.6px more than the header and body edges

- Page / state: every Dialog (delete-confirm, remove-*, import, rename, move, new-project)
- Widths: all (1440: header X right edge x=1205, body inputs end x=1205, footer button right edge x=1207; Cancel left x=233 while title text starts x=235) (theme: both)
- What is wrong: header and body use 1.1rem (17.6px) side padding, the action row uses `px-4` (16px), so the footer buttons stick out about 2px to each side of the content above.
- Where: `Dialog.tsx:163` and `:176` (`px-[1.1rem]`, `p-[1.1rem]`) versus `Dialog.tsx:195` (`px-4`).
- Severity: polish
- Fix: use `px-[1.1rem]` in the action row.
- Evidence: `storybible/delete-confirm/w1440.png` (Cancel at x=233-302, title at x=235; Delete entry right at 1207, X at 1205).
- Shared: Dialog primitive

#### SB-12 "Add" buttons and inputs in sibling tables start at different x

- Page / state: storybible / entry-properties-editing, entry-pronunciation-missing (edit mode with properties and relationships)
- Widths: 1440 (Properties "+" at x=585-621, Relationships "+" at x=595-631; table inputs start x=595 while "Add a name" and Description start x=585), 768 (+ at x=33, table inputs at x=43) (theme: both)
- What is wrong: the Properties Add button is outside its table (left edge = form edge) but the Relationships Add button is inside a table cell, 10px in; both tables' inputs are 10px in from the form's other fields.
- Where: `PropertiesSection.tsx:63` (`mt-3` button outside the Table) versus `Relationships.tsx:308-322` (Add button in `TableCell colSpan={3}`); the table cell padding is the 10px.
- Severity: polish
- Fix: put both Add buttons outside the table (or both in the cell), and let table content align with the form edge (negative margin or flush cell padding).
- Evidence: `storybible/entry-pronunciation-missing/w1440.png` (y=590-625 and y=820-855), `.../entry-properties-editing/w1440.png` (x=595 inputs, y=385-520).
- Shared: Table primitive cell padding (`apps/ui/src/components/primitives/Table.tsx`)

#### SB-13 Sibling tables use unrelated auto column widths

- Page / state: storybible / entry-needs-review, entry-suggestions (read view), entry-properties-editing, relationship-picker (edit)
- Widths: 1440 (Properties VALUE column at x=858, Relationships TO column at x=1159 in read view, x=1069 in edit view, x=1005 in relationship-picker; Properties edit inputs end at x=838/1180, then a 100px gap before the arrow buttons at x=1281; Relationships To button ends x=1290 then a 71px gap before the trash button at x=1361) (theme: both)
- What is wrong: the Properties and Relationships tables, one above the other, put their second column at different x, and the column positions jump when the entry goes into edit mode; edit-mode inputs do not fill the space before the button column.
- Where: `PropertiesSection.tsx:~28-50` and `Relationships.tsx:220-326` (both `Table` with no `colgroup` or widths; `Button className="w-full justify-between"` at `Relationships.tsx:133` fills only its auto column).
- Severity: looks wrong
- Fix: give both tables the same fixed column template (for example 40% / 1fr / auto) in read and edit mode.
- Evidence: `storybible/entry-needs-review/w1440.png` (Properties header y=364, Relationships header y=500), `.../entry-pronunciation-missing/w1440.png` (y=518 and y=703), `.../entry-properties-editing/w1440.png`.
- Shared: page-local (Table primitive has no column API)

#### SB-14 Voice data drawer: "Check again" jumps between the heading's right and its own left-aligned row

- Page / state: storybible / voice-data-panel (empty) vs voice-data-samples (populated), and the entry's Voice samples section
- Widths: 1440 and 390 (drawer is 320px wide) (theme: both)
- What is wrong: with no samples "Check again" is right-aligned on the heading row (x=1323-1421, y=253); once the count "1 · 0.1 MiB" appears it no longer fits and wraps to a second row, left-aligned (x=1139-1238, y=282), so the control moves from right to left between states.
- Where: `apps/ui/src/components/storybible/voicesamples/VoiceSamplesBody.tsx:111-125` (`flex flex-wrap` with a `flex-1` spacer; the spacer drops to 0 width when the button wraps).
- Severity: polish
- Fix: `ml-auto` on the button instead of a spacer so it stays right-aligned when it wraps.
- Evidence: `storybible/voice-data-panel/w1440.png` vs `.../voice-data-samples/w1440.png`; `.../voice-data-samples/w390.png`.
- Shared: page-local

#### SB-15 Voice data drawer: the divider hugs the "Voice samples use ..." line, and the two Remove buttons are different widths

- Page / state: storybible / voice-data-panel, voice-data-samples, remove-*-confirm backdrop
- Widths: 1440 and 390 (theme: both)
- What is wrong: the rule above the Remove buttons is 3px under the "Voice samples use 0 MiB of 200 MiB." text (y=580 text, y=590 rule) while other sections are spaced 16px apart; "Remove voice samples..." (x=1139-1309) and "Remove voice data..." (x=1139-1286) are stacked with ragged right edges.
- Where: `apps/ui/src/components/storybible/VoiceDataPanel.tsx:114` (`<p className="m-0 ...">`; `m-0` overrides the `space-y-4` margin from the container at `VoiceDataPanel.tsx:106`), buttons at `VoiceDataPanel.tsx:118-124` (`flex flex-wrap gap-2`, no equal width).
- Severity: polish
- Fix: drop `m-0` on that paragraph (or add `mb-4`); give the two buttons `flex-1` or one width.
- Evidence: `storybible/voice-data-panel/w1440.png` (y=575-690), `.../voice-data-panel/w390.png`.
- Shared: page-local

#### SB-16 Stacked layout at 768: the entries list is a 3-row window with nested scrolling

- Page / state: storybible / every state with a list, at 768 (and 1024 height 768)
- Widths: 768 (list panel y=69-530 of which the filters take 245px, leaving 2.5 rows visible at y=308-477) (theme: both)
- What is wrong: the filter block takes more than half of the list card, the list itself scrolls inside a ~170px window, and the entry panel below it is another scroll region.
- Where: `Guide.tsx:384` (`grid ... [&>*]:max-md:min-h-96` / the `(max-height:899px)` override only frees heights below 900px tall viewports; at 768x1024 the grid stays `h-full` and splits the viewport) and `Guide.tsx:391-419` (chip groups always visible).
- Severity: polish
- Fix: let the list panel auto-size to its rows (cap at about 60% height) in the stacked layout, or collapse the filter chips behind a disclosure.
- Evidence: `storybible/entry-editing/w768.png` (list y=308-477), `.../category-organization/w768.png`.
- Shared: page-local

#### SB-17 Series tab and loading/error states: frame and gutter inconsistencies

- Page / state: storybible / series-tab-empty, series-tab-load-failed, series-tab-loading, loading, invalid-payload
- Widths: 1440 (and 390 for series) (theme: both)
- What is wrong: (a) the ENTRIES / SERIES tabs start at x=242 while the "Story Bible" title above starts at x=232, and the series card content at x=249; (b) series-tab-empty and series-tab-load-failed stretch the card to the page bottom (y=169-883) with a short form or error in the top 120px; (c) load-failed draws a bordered error card inside the series card (x=249-1407 inside 233-1423), a double frame; (d) `loading` draws the detail skeleton straight on the page background (x=584-1408, no card frame) while the list card is framed, so the page jumps when data arrives; (e) invalid-payload is a 720px centred card with its title above it on the page background, unlike every other page's framed header.
- Where: (a, b) `Guide.tsx:373-383` (`Heading`, `viewTabs`, `Panel flush className="min-h-0 flex-1"`); (c) `SeriesTab.tsx:122-130`; (d) `GuideSkeleton.tsx` / `Guide.tsx:515`.
- Severity: polish
- Fix: align tabs to the title edge; size the series panel to its content; render the error without its own frame; wrap the skeleton in the detail card.
- Evidence: `storybible/series-tab-empty/w1440.png`, `.../series-tab-load-failed/w1440.png`, `.../loading/w1440.png`, `.../invalid-payload/w1440.png`.
- Shared: page-local

#### SB-18 Voice download failed: progress bar stays partly filled and the elapsed counter squeezes the message

- Page / state: storybible / voice-download-failed (and voice-download-progress for the counter)
- Widths: 390 (message wraps to 5 lines in a 190px column beside "0s" at x=298-313); 1440 fine (theme: both)
- What is wrong: the failure state keeps a 40% filled progress bar under the failure text, and the message and the "0s" counter share a row, leaving the message a narrow column at 390; the Live activity box repeats the same sentence.
- Where: cause not found with certainty (the download dialog component was not opened); the visible layout is the WorkDialog body (`apps/ui/src/components/primitives/WorkDialog.tsx`).
- Severity: polish
- Fix: hide the bar in the failed state and put the elapsed time under the message below sm.
- Evidence: `storybible/voice-download-failed/w390.png` (y=265-300 message and counter, bar y=378-394).
- Shared: WorkDialog primitive

### Booth

#### BTH-1 Setup notice plus footer leave the teleprompter 70-100px tall at 390 and hide the reading line

- Page / state: booth / record-connect, record-turned-away, refusal, daw-not-running, builtin-refusal, record-other-project (all `RecordSetup` notices)
- Widths: 390 worst (also 768 where the text pane shrinks to about 550px of 1024); light (dark identical)
- What is wrong: the notice (up to 45% of the page) + footer (~155px at 390 because Record row, why-sentence, meter row and a 4-row key-hint block stack) leave the reading pane about 70px (record-connect) to 100px high, so the word being read sits under the 90px top fade or under the toast and the notice's own text is cut mid-line at its bottom.
- Where: `apps/ui/src/components/booth/record/RecordSetup.tsx:27` (`max-h-[45%]` bar, inner `overflow-y-auto` at :34) with `apps/ui/src/components/booth/frame/BoothFooter.tsx:77-105` (footer rows) and the 90px fades at `apps/ui/src/components/booth/reading/BoothText.tsx:214`; nothing reserves a minimum height for the text pane.
- Severity: breaks use
- Fix: at reflow width collapse the notice to its title plus a disclosure (or cap it near 30% and give the pane `min-h`), and drop the footer's duplicate `why` sentence while the notice repeats it.
- Evidence: `booth/record-connect/w390.png` (text pane y=130-200, "Alice was beginning" washed out at y~173, notice text cut at y~575 "Settings then starts the link each time this app"); `.../record-turned-away/w390.png` (toast y=117-173 covers the reading line); `.../refusal/w390.png`, `.../builtin-refusal/w390.png` (2 lines visible).
- Shared: page-local (the notice and footer are Booth only)

#### BTH-2 Toast covers the Cancel / Download model buttons of the dialog on top of it

- Page / state: booth / model-required
- Widths: 390 (light). At 768 and 1440 the toast sits clear of the dialog.
- What is wrong: the "Recording did not start..." toast (z-toast above the dialog layer, bottom-anchored 20px above the footer) overlaps the dialog's action row at 390, hiding the top half of Cancel and Download model; the dialog is also only 273px wide so the details wrap to 4-line paths.
- Where: `apps/ui/src/components/primitives/Toast.tsx:88` (fixed region, `z-[var(--z-toast)]`, bottom offset from `useToastClearance`) vs `apps/ui/src/components/primitives/Dialog.tsx:145-150` (centred popup, max-w 70vw).
- Severity: breaks use
- Fix: do not raise a toast while a modal dialog is open (queue it) or lift the toast region clear of an open dialog; widen the dialog at reflow.
- Evidence: `booth/model-required/w390.png` (toast y=548-625, buttons at y~600-630 partly hidden at x=76-315).
- Shared: Toast region over Dialog (any page that toasts under a dialog). Also on: none other seen.

#### BTH-3 Top-bar right cluster splits when the bar wraps: chips and the two icon buttons end up on the left of row 2 (or mid-row at 390)

- Page / state: booth / recording, builtin-recording, following, voice-samples-recording, leave-dialog, roll-confirm (resume line gone), model-required ("No resume point"), pickup-session, credits-unresolved
- Widths: 768 and 390 (light); 1024 and wider are fine
- What is wrong: at 768 the REC and REAPER chips stay on row 1 at the right but the Text-settings and side-panel buttons wrap alone onto row 2 at x=16-98 (recording), or REAPER + both buttons sit at x=16-161 on row 2 instead of the right edge (model-required, pickup-session, credits-unresolved); at 390 recording the A and panel buttons sit at x=124-205 instead of x=292-374 where they are in `setup`. The buttons therefore jump from the right edge to the left as soon as Record is pressed.
- Where: `apps/ui/src/components/booth/frame/BoothTop.tsx:76` (`flex flex-wrap` with items as separate flex children) and :94 (`<span className="flex-1" />` spacer stays on row 1 while the buttons wrap); the right-hand chips and buttons are not wrapped in one nowrap group.
- Severity: looks wrong
- Fix: wrap REC chip, setup chip, text button and panel button in one `ml-auto flex flex-none` group so they wrap together and stay right-aligned.
- Evidence: `booth/recording/w768.png` (buttons at x=16-98, y=54-90), `.../recording/w390.png` (buttons x=124-205, y=82-118), `.../model-required/w768.png`, `.../pickup-session/w768.png`, `.../pickup-session/w390.png` (4 rows, bar 162px tall), `.../credits-unresolved/w768.png`; compare `.../setup/w768.png` and `.../setup/w390.png` where they are right-aligned.
- Shared: page-local

#### BTH-4 Confirm dialogs are always 70vw wide: 1008px for a one-line question at 1440, 270px with wrapped button labels at 390

- Page / state: booth / leave-dialog, roll-confirm, model-required
- Widths: 1440 (too wide), 390 (too narrow); light
- What is wrong: the popup is `w-full` with `max-w-[70vw]`, so it is always 70vw; "Stop recording?" / "Roll again from 1?" float in a 1006px card with a gap of about 600px between the text and the right-hand action, and at 390 "KEEP RECORDING" and "STOP AND LEAVE" wrap onto two lines inside their buttons.
- Where: `apps/ui/src/components/primitives/Dialog.tsx:148-150` (`w-full ... max-w-[70vw]`) and the actions row at :186-195 (`gap-2`, no wrap).
- Severity: looks wrong
- Fix: size by content for non-`full` dialogs, for example `w-[min(32rem,calc(100vw-2rem))]`, and let the action row wrap or stack at narrow widths.
- Evidence: `booth/leave-dialog/w1440.png` (dialog x=217-1222), `.../leave-dialog/w390.png` (dialog x=60-331, buttons two-line), `.../roll-confirm/w1440.png`.
- Shared: yes, `Dialog` primitive, every page with a confirm dialog.

#### BTH-5 Booth bookmark ribbon is drawn at the reader's font size (30x40px) in a 16x26px button, and runs off the right edge at 390

- Page / state: booth / bookmarks-ribbon
- Widths: all; worst at 390 (light)
- What is wrong: the ribbon icon scales with the 40px reader text (about 30x40 painted) while its button is `h-[26px] w-4`, so the clickable area is a small part of the painted ribbon, it overflows its box to the right, and at 390 it ends at x=389 (probe: right 399 > 390, clipped by `overflow-hidden`); at 768 it ends at x=767, touching the viewport edge.
- Where: `apps/ui/src/components/script/bookmarks/ui/BookmarkRibbon.tsx:41-44` (button `h-[26px] w-4`, `<Icon name="bookmark" />` sized in `em` and inheriting the Booth text size); margin placement in `apps/ui/src/components/booth/bookmarks/BookmarkRibbons.tsx` (mounted via `margin` prop of `BoothText`, `reading/BoothText.tsx:214` px-7).
- Severity: looks wrong
- Fix: set a fixed icon size (`text-base`) on the ribbon button so it matches its 16x26 box and the 28px margin.
- Evidence: `booth/bookmarks-ribbon/w1440.png` (ribbon x=1077-1107, y=420-460), `.../w768.png` (x=737-767), `.../w390.png` (x=359-389, abutting "beginning").
- Shared: `BookmarkRibbon` (Script page margin uses the same component at a smaller inherited size; not checked).

#### BTH-6 Loading skeleton does not match the real Booth frame, so the page jumps when it arrives

- Page / state: booth / loading, address-checking (and companion-loading for the same pattern, see BTH-9)
- Widths: all; shown at 1440, 768, 390 (light)
- What is wrong: the skeleton's top bar is 52px tall (real 57), inset 20px (real 16), its side-panel blocks are inset 12px (real 16) and end at x=1428 (real 1424), the footer is 56px tall (real 92, no key-hint row), and the text placeholder is a 416px column centred at x=352-768 while the real text starts at x=40 and runs 1040px wide.
- Where: `apps/ui/src/components/booth/page/BoothSkeleton.tsx:25` (`px-5 min-h-13`), :31-32 (`max-w-[26em]` at 16px font), :41 (`p-3`), :48 (footer `px-5`, no hints); real frame `frame/BoothTop.tsx:76` (`min-h-14 px-4`), `frame/BoothFooter.tsx:78`.
- Severity: looks wrong
- Fix: use the real tokens (px-4, min-h-14, p-4) and add a key-hint strip; size the text skeleton from the reader size.
- Evidence: `booth/loading/w1440.png` (skeleton text x=352-768, footer starts y=843), compare `.../setup/w1440.png` (text x=40, footer top y=808); `.../address-checking/w1440.png`, `.../loading/w390.png`, `.../address-checking/w768.png`.
- Shared: page-local (Booth skeleton). Also on: address-checking.

#### BTH-7 Pickup session row shows the pickup text as "Th..."

- Page / state: booth / pickup-session
- Widths: 1440 and 1920 (side panel inline), light and dark; in the drawer at narrower widths not checked
- What is wrong: the accent-filled row packs a nowrap mono label ("Chapter 3 · 2:11"), a truncating script span and an "Automatic" tag into 251px, so the script is cut to two letters and the row says nothing about the line; the row also stops 4px short of the dismiss button and 36px short of the panel's right edge.
- Where: `apps/ui/src/components/booth/pickups/PickupSession.tsx:48-52` (`whitespace-nowrap` label, `min-w-0 flex-1 truncate` script, trailing "Automatic" span).
- Severity: looks wrong
- Fix: put the script on its own line (two-line row) or drop "Automatic" to a badge below, so the script gets the width.
- Evidence: `booth/pickup-session/w1440.png` (row x=1137-1388, y=95-127, "Th..." at x~1300), `dark:booth/pickup-session/desktop.png`.
- Shared: page-local

#### BTH-8 Companion script box is cut mid-line with no bottom edge

- Page / state: booth / companion-default, companion-listening (and wider captures)
- Widths: companion 380, w1440, w768 (light)
- What is wrong: the Script text sits in a `max-h-[12rem] overflow-y-auto` box with no border or fade of its own; in companion-default the resume card inside has top and side borders but its bottom border is scrolled out of view, so the card looks open, and text is sliced through the line at y=345-357 just above the next section's rule.
- Where: `apps/ui/src/components/booth/CompanionShell.tsx:216` (`mt-2 max-h-[12rem] overflow-y-auto`).
- Severity: looks wrong
- Fix: give the scroll box its own bottom edge (border or a fade mask) so the cut reads as scrolling, or size it to whole lines.
- Evidence: `booth/companion-default/companion.png` (card x=14-366, bottom cut at y~345), `.../companion-listening/companion.png` (line cut at y~343), `.../companion-default/w1440.png`.
- Shared: page-local

#### BTH-9 "Coming up" rows: pronunciations are not in a column and sit about 1px off the name's baseline

- Page / state: booth / every state with the side panel inline
- Widths: 1440, 1920 and the drawer at 1280/1024/768/390 (light and dark)
- What is wrong: name, IPA and "set" are loose flex items, so the IPA starts right after each name (x=1175, 1225, 1186 at 1440) and ragged-edges the list; the smaller mono IPA is centred rather than baseline-aligned, so it sits about 1px above the bold name.
- Where: `apps/ui/src/components/booth/side/ComingUp.tsx:12-16` with `ROW_CLASS` (`flex items-center gap-2`) at `side/SideSection.tsx`.
- Severity: polish
- Fix: use a grid (`auto` / `1fr` / `auto`, `items-baseline`) with the name column sized to the longest name.
- Evidence: `booth/setup/w1440.png` (rows at y=243, 268, 294, IPA starts x=1175/1225/1186); probe `column-misaligned` confirmed.
- Shared: `ROW_CLASS` of the side panel sections.

#### BTH-10 Setup notice is inset 20px while every other Booth bar is inset 16px, and it cuts the side panel short

- Page / state: booth / refusal, daw-not-linked, daw-not-running, record-connect, record-other-project, builtin-refusal, record-turned-away
- Widths: all; clearest at 1440 (light and dark)
- What is wrong: the notice card spans x=20-1420 under the whole page (top bar and footer content start at x=16 and end at 1424), so its edges do not line up with them, and because it sits below the text-plus-side-panel row the side panel ends at y=642 while a 20px strip at x=1420-1440 shows the page background beside the card.
- Where: `apps/ui/src/components/booth/record/RecordSetup.tsx:27` (`mx-5 mb-2`) mounted outside the flex row at `apps/ui/src/components/booth/page/BoothNextPage.tsx:553-565`.
- Severity: polish
- Fix: use `mx-4` (the bars' `px-4`) and consider mounting the notice inside the text column so the side panel keeps its full height.
- Evidence: `booth/refusal/w1440.png` (card left x=20 vs footer Record x=16; side panel bottom y=642), `dark:booth/refusal/desktop.png`.
- Shared: page-local

#### BTH-11 Record becomes Stop 16px narrower and drags the timer and Levels button left

- Page / state: booth / recording, builtin-recording, following, voice-samples-recording, leave-dialog, roll-confirm
- Widths: all (light)
- What is wrong: the button changes width (Record 16-108, Stop 16-92) so the timer moves from x=123 to x=108 and the Levels button from x=194 to x=178 the moment a take starts.
- Where: `apps/ui/src/components/booth/record/RecordControl.tsx` (label swap, no fixed width); footer row `frame/BoothFooter.tsx:78`.
- Severity: polish
- Fix: give the record button a `min-w` that fits both labels.
- Evidence: `booth/setup/w1440.png` vs `.../recording/w1440.png` (timer 123 vs 108, mic 194 vs 178).
- Shared: page-local

#### BTH-12 "1 SAMPLE" toggle hugs the left while the opened sample row is full width

- Page / state: booth / voice-samples-panel (and voice-samples-picker, voice-samples-recording side panel)
- Widths: all with the panel visible (light)
- What is wrong: the count button is content-width (x=1137-1214) under the Hatter row while the star sample row beneath it spans x=1137-1423, so two stacked controls of one disclosure have different widths and the toggle shows no open/closed cue.
- Where: `apps/ui/src/components/booth/side/VoicesNearby.tsx:93-96` (`self-start`) vs :131-134 (`w-full justify-start`).
- Severity: polish
- Fix: make the toggle `w-full justify-start` with a chevron, or make both content-width.
- Evidence: `booth/voice-samples-panel/w1440.png` (toggle y=202-234, sample row y=242-274), `.../w1280.png`.
- Shared: page-local

#### BTH-13 Top-bar chips are 22px tall beside 36-40px buttons, and the toast dismiss is 17x20px

- Page / state: booth / Resume chip, setup chip (REAPER / Built-in / not linked), toast close in take-ended, model-required, bookmarks-ribbon
- Widths: all (light)
- What is wrong: the clickable chips are 22px high (probe: 87x22, 112x22, 52x22) next to 36px icon buttons and a 40px picker, so they look undersized and are hard hits; the toast's close X is a bare 17x20 button.
- Where: `apps/ui/src/components/primitives/HeaderChip.tsx:21` (`h-[1.375rem]`); `apps/ui/src/components/primitives/Toast.tsx:72` (`<button className="flex-none">`).
- Severity: polish
- Fix: keep the pill look but pad the hit area to at least 24px (`before:` overlay or `min-h-6`), and give the toast close a 24px target.
- Evidence: `booth/setup/w1440.png` (chips y=18-38 vs buttons y=10-46), `.../builtin-take-ended/w1440.png` (X at x=1388-1404).
- Shared: `HeaderChip` and `Toast`, used on other pages.

#### BTH-14 Chapter name is clipped to 190px at 1280 and below even when the bar has hundreds of px free

- Page / state: booth / every chapter state
- Widths: 1280 (about 286px of empty bar between the resume text and the REAPER chip), 1024, 768 (light)
- What is wrong: "CHAPTER 1 DOWN THE RA..." is cut with an ellipsis while the bar is half empty at 1280/1024, so the narrator cannot read the chapter name.
- Where: `apps/ui/src/components/booth/page/BoothNextPage.tsx:75` (`MEDIUM_PICKER` forces `!w-[190px]`) applied at :474 whenever `side.drawer`.
- Severity: polish
- Fix: apply the 190px width only when the bar actually wraps (reflow), or use `max-w` instead of a fixed width.
- Evidence: `booth/setup/w1280.png` (picker x=56-246, empty bar x=833-1119), `.../setup/w1024.png`.
- Shared: page-local

#### BTH-15 Slider track sits 9px inside the controls above it in the Text and Levels popovers

- Page / state: booth / text-popover, levels-menu
- Widths: all (light)
- What is wrong: the Font select spans x=1059-1361 and the "40 px" value ends at 1361 but the Size slider track runs x=1068-1352; in Levels the meter spans x=211-627 while the sliders run x=220-618, so left and right edges differ by the thumb radius.
- Where: `apps/ui/src/components/primitives/Slider.tsx` (track inset by the thumb) used from `frame/BoothTop.tsx:35` and `frame/LevelsSliders` (cause: thumb-sized padding on the track; exact class not read).
- Severity: polish
- Fix: let the track run edge to edge and inset only the thumb travel, or add the same inset to the neighbouring controls.
- Evidence: `booth/text-popover/w1440.png` (popover y=58-215), `.../levels-menu/w1440.png`, `.../levels-menu/w390.png` (meter x=25-351, sliders x=34-342).
- Shared: `Slider` primitive.

#### BTH-16 Text gutter (28px) differs from the bars (16px), the notice (20px), and the pickup bar lands 8px from the window edge at 390

- Page / state: booth / setup at 1024/768/390, pickup-session
- Widths: 1024 and below (where the text column is full width), worst 390
- What is wrong: the reading text starts at x=28 while top bar, footer and key hints start at x=16 and the notice at x=20; in a pickup session the paragraph's 4px bar is pulled out 20px (`-ml-5`) so at 390 it is drawn at x=8-12.
- Where: `apps/ui/src/components/booth/reading/BoothText.tsx:214` (`px-7`) and :233 (`-ml-5 border-l-4 pl-4`).
- Severity: polish
- Fix: pick one gutter (16px) for the text at reflow and keep the pickup bar inside it.
- Evidence: `booth/setup/w390.png` (text x=28, bar buttons x=16), `.../pickup-session/w390.png` (bar x=8), `.../pickup-session/w768.png` (bar x=8).
- Shared: page-local

#### BTH-17 Speaker picker opens over the footer and covers the Record button

- Page / state: booth / voice-samples-picker
- Widths: 1440 (popup y=459-843, footer top y=808; Record, timer and Levels hidden), 768 (6px overlap) (light and dark)
- What is wrong: the popup is placed under its chip and runs 35px into the footer, hiding Record and the timer while the picker is open; it also opens with an empty, unlabelled-looking search box.
- Where: cause not found (Popover placement/collision handling; picker markup not located in the files read).
- Severity: polish
- Fix: constrain the popup's max height to the space above the footer (collision padding equal to the footer height) or flip it above the chip.
- Evidence: `booth/voice-samples-picker/w1440.png` (popup bottom y=843, red Record visible only as an orange sliver at x=40-100, y=820-855), `.../w768.png`, `dark:booth/voice-samples-picker/desktop.png`.
- Shared: Popover placement.

#### BTH-18 Footer meter bar sits 2px above the room-tone chip's centre

- Page / state: booth / every state with the footer
- Widths: 1440, 1024 (light)
- What is wrong: the level bar centre is at y=836 while the room-tone chip's text centre is at y=838-839 (1440), so the pair is not centred on one line.
- Where: cause not found (`apps/ui/src/components/booth/frame/LevelsMenu.tsx:252-262`, `items-center` row with a `w-28` bar wrapper and a `whitespace-nowrap` badge wrapper; the badge's inline wrapper probably adds descender space).
- Severity: polish
- Fix: make the badge wrapper `inline-flex` or `flex` so the row's centring is exact.
- Evidence: `booth/setup/w1440.png` (bar y=836, chip y=828-849), `.../setup/w1024.png` (bar y=682, chip text y=684).
- Shared: page-local

### Editing

#### EDT-1 No-audio banner squeezes its text to one word per line at 390 and hides the script

- Page / state: editing, `unlinked` and `never-checked` (any state that shows the no-audio banner)
- Widths: 390 (theme: light). At 768/1440 the banner is fine.
- What is wrong: the banner's message span is `flex-1 min-w-0` with no basis, so it never wraps below the link and button; at 390 the text column is about 60px wide (one word per line, 20+ lines), the "Open the audio engine panel" link sits beside it, "Read again" is pushed below the fold and the banner fills the whole card so the header and script are not reachable.
- Where: `apps/ui/src/components/editing/page/NoAudioBanner.tsx:19-22` (`<span className="min-w-0 flex-1 [overflow-wrap:anywhere]">` inside `flex flex-wrap`). Same markup in `apps/ui/src/components/editing/page/DawOffBanner.tsx:13-15`, which looks acceptable at 390 only because its message is shorter and it has no link.
- Severity: breaks use
- Fix: give the message `basis-full` (or `min-w-[14rem]`) so it takes its own row below ~480px and the link and button wrap under it.
- Evidence: `editing/unlinked/w390.png` (banner spans y=82 to 690, text column x=66-125), `editing/never-checked/w390.png`; compare `editing/unlinked/w1440.png`.
- Shared: page-local (DawOffBanner shares the pattern).

#### EDT-2 Takes chip is wider than the script column at 390 and is clipped

- Page / state: editing, `default`, `takes-open` and every state with a script line
- Widths: 390 (light). Probe: chip right edge 401 > 390.
- What is wrong: the "4 takes / Take 1 / To choose" chip button keeps its natural width (about 320px) inside a text column of about 205px (the 76px time gutter plus left padding eat the card), so it runs past the right edge and is cut by the reader's edge; the suggestion card under it is also cut at x=329 ("TAKE 1 C" visible in `takes-open`). The button label also wraps to three lines (probe: h 41).
- Where: `apps/ui/src/components/editing/takes/TakeChip.tsx:57-65` (inline-flex chip, no `max-w-full`/shrink), inside the grid in `apps/ui/src/components/editing/script/Paragraph.tsx:37` (`grid-cols-[76px_minmax(0,1fr)]`).
- Severity: breaks use (the chip is how takes are opened)
- Fix: let the chip shrink (`max-w-full`, hide the segment bar below 420px) and stack the line's time gutter above the text at 390.
- Evidence: `editing/takes-open/w390.png` (top, y=200-215, chip and card cut at x=329); `probe:editing/takes-open/w390.json` offscreen-right entries.
- Shared: page-local.

#### EDT-3 Timeline strip lane labels overflow into the lanes

- Page / state: editing, `drawer-timeline` (strip beside the text at 1440+; same component inside the drawer)
- Widths: 1440, 1920 (strip shown from STRIP_MIN_WIDTH); drawer variant at narrow widths not captured (see Coverage). Light.
- What is wrong: the label column is a fixed `w-24` (96px) but labels are `whitespace-nowrap` mono text plus a status chip, so "Retake on lane 2" is cut after "lane" by the lane track, and "Pickup read" is followed by a "MU[TED]" chip that is overpainted by the lane; the lane tracks are all aligned (x=365) but the labels are not readable.
- Where: `apps/ui/src/components/editing/strip/TimelineStrip.tsx:81` (`labelWidth = inDrawer ? 'w-[7.5rem]' : 'w-24'`) and `:127-128` (label `whitespace-nowrap`, chip in the same row).
- Severity: looks wrong
- Fix: make the label column `min-w-24 max-w-40` with `truncate` on the label, or put the MUTED/ACTIVE chip under the label as the drawer variant already does.
- Evidence: `editing/drawer-timeline/w1440.png` (y=630-695, x=261-365).
- Shared: page-local.

#### EDT-4 Legend is clipped mid-chip when the header is crowded (drawer open, 390)

- Page / state: editing, `drawer-effects-inspector`, `drawer-cleanup`, `drawer-effects-chains` (drawer open at 1440), and every state at 390
- Widths: 1440 with drawer open, 390; at 768/1024/1280 a stray fragment of the first chip also shows ("Aa" cut at x=460, the lone ")" at x=690 at 1440).
- What is wrong: the legend is a right-aligned (`justify-end`) `overflow-hidden` row, so when it is too wide it loses its left end: at 1440 with the drawer open it starts with a lone ")" glyph then "Misread · 0"; at 390 it starts "xtra  Aa Not read".
- Where: `apps/ui/src/components/editing/flags/Legend.tsx:30` (`flex flex-nowrap items-center justify-end overflow-hidden whitespace-nowrap`), inside `apps/ui/src/components/editing/page/EditingHeader.tsx:30` (`min-w-0 flex-1`).
- Severity: looks wrong
- Fix: drop whole chips that do not fit (compact mode earlier when the drawer is open, container query on `@container/hd`), or `justify-start` with a fade, never clip a chip.
- Evidence: `editing/drawer-cleanup/w1440.png` (x=690-935, y=99), `editing/default/w390.png` (x=49-70, y=180), `editing/daw-off/w768.png` (x=460, y=175).
- Shared: page-local.

#### EDT-5 Load-error panel shrinks to its content on Editing but is 720px on Script

- Page / state: editing, `load-failed` (and the same wrapper anywhere `LoadError` is placed in a flex column)
- Widths: 1440 (light); same on 1920. Compare `script/invalid-payload`.
- What is wrong: on Editing the "This page could not be loaded" panel is 356px wide centred at x=650-1006, while on Script the same component is 720px (x=468-1188), and the Editing title sits at x=650 instead of the page edge.
- Where: `apps/ui/src/components/layout/LoadError.tsx:56` (`mx-auto max-w-3xl space-y-4 p-6`): auto side margins inside Editing's `flex flex-col` wrapper (`apps/ui/src/components/editing/EditingPage.tsx:144-145`) shrink-to-fit instead of reaching max-w-3xl.
- Severity: looks wrong
- Fix: add `w-full` to the LoadError root (`mx-auto w-full max-w-3xl`).
- Evidence: `editing/load-failed/w1440.png` (panel x=650-1006), `script/invalid-payload/w1440.png` (x=468-1188).
- Shared: LoadError (layout). Also on: any page that wraps LoadError in a flex column.

#### EDT-6 Editing's own cards sit 33px from the sidebar; Script and the empty states sit 16px

- Page / state: editing, all populated states vs Script and Editing's own `no-manuscript`
- Widths: all (light and dark).
- What is wrong: the Editing card's left edge is x=249 and right edge x=1407 at 1440 (33px gutters, 32px at 768: card x=33-735) but Editing's `no-manuscript` card is x=232-1423 and every Script column starts at x=233 and ends at x=1423 (16px gutters), so the page jumps 17px when you move between Script and Editing.
- Where: `apps/ui/src/components/editing/page/EditingBody.tsx:496` (`px-4 pb-3` wrapper) plus the shell's own 16px padding; the same `px-4` repeats at `apps/ui/src/components/editing/EditingPage.tsx:167,224`.
- Severity: looks wrong
- Fix: drop the `px-4` (keep `pb-3`) so Editing uses the shell's gutter like Script.
- Evidence: `editing/default/w1440.png` (card edge x=249), `script/reader/w1440.png` (x=233), `editing/no-manuscript/w1440.png` (x=232).
- Shared: page-shell gutter pattern (check the other pages' wrappers).

#### EDT-7 Drawer sections have three different left gutters

- Page / state: editing, `drawer-cleanup`, `drawer-effects`, `drawer-effects-inspector`, `drawer-effects-chains`
- Widths: all with drawer open (1440 measured; 1280/768/390 same structure). Light.
- What is wrong: at 1440 "HOW RETRIES ARE KEPT" and the section headings start at x=1069, the found-list rows' icon column and "IN THE AUDIO", "Gaps", "No finding passes..." start at x=1081 (12px further in), and the Review buttons end at x=1387 while rules end at x=1395 and the Apply button/Strength control end at x=1383; at 390 the same: 53 vs 65.
- Where: `apps/ui/src/components/editing/drawer/Drawer.tsx:46` (section `p-3`) wrapping `apps/ui/src/components/editing/cleanup/CleanupTab.tsx:118` and `cleanup/CleanupInspector.tsx:65` (inner `p-3`, so 24px) while `apps/ui/src/components/editing/drawer/FoundList.tsx:17` has `p-3` plus rows `px-2` (`:29`).
- Severity: looks wrong
- Fix: pick one padding owner (the section) and remove the inner `p-3` in CleanupTab/CleanupInspector; drop the `px-2` on the found rows or inset the section label to match.
- Evidence: `editing/drawer-cleanup/w1440.png` (x=1069 vs 1081, y=453 vs 515), `editing/drawer-cleanup/w390.png`.
- Shared: page-local.

#### EDT-8 Effects table is clipped at 390 (Covers column cut)

- Page / state: editing, `drawer-effects-inspector`
- Widths: 390 (light); fits at 768 and 1440.
- What is wrong: the effects table is wider than the drawer, so the "COVERS" header reads "COV" and the percentages are cut at the right edge (x=327-349); nothing indicates it scrolls.
- Where: `apps/ui/src/components/editing/effects/EffectsList.tsx:27-60` (table inside `flex flex-col gap-2`, no `overflow-x-auto`/narrow layout).
- Severity: looks wrong
- Fix: let the Time/Effect cells wrap tighter (smaller `Effect` min width) or wrap the table in `overflow-x-auto` with a visible edge.
- Evidence: `editing/drawer-effects-inspector/w390.png` (y=215-330).
- Shared: page-local.

#### EDT-9 Dialog fact rows (label vs value) are misaligned vertically and squeeze values at 390

- Page / state: editing, `delete-dialog`, `fx-dialog`
- Widths: 1440 and 390 (light).
- What is wrong: the small-caps labels sit 3-4px lower than their values (CUT RANGE y=369 vs value y=365; SPLITS AT y=451 vs 447; ENDS 401 vs 398), and the first value is mono at a larger size than the others; at 390 the fixed 96px label column leaves the value about 130px wide, so "0:01 to 0:02 · 1.6 s" breaks over three lines and the delete button label wraps ("DELETE 4 WORDS AND / AUDIO").
- Where: `apps/ui/src/components/editing/range/cut/CutDialog.tsx:83` and `apps/ui/src/components/editing/range/fx/FxDialog.tsx:81` (`grid-cols-[96px_minmax(0,1fr)]`), each `<dt className="pt-0.5">` (`CutDialog.tsx:95,103,111,119`, `FxDialog.tsx:96,104,112,119,125`) with no baseline alignment.
- Severity: polish (rows); looks wrong (390 squeeze)
- Fix: use `items-baseline` on the grid (drop `pt-0.5`) and stack label above value below 480px.
- Evidence: `editing/delete-dialog/w1440.png` (x=235-345, y=360-470), `editing/delete-dialog/w390.png`, `editing/fx-dialog/w1440.png`.
- Shared: the two dialogs share the `facts` grid; also check other range dialogs using the same pattern.

#### EDT-10 Take rows: waveform bars start and end at different x

- Page / state: editing, `takes-open`
- Widths: 1440 (and 768 for the starts) (light).
- What is wrong: the mini waveform in each take row starts after a label whose width varies (Take 1 has ACTIVE + SUGGESTED chips, Take 2 only MUTED) and ends before a right-aligned "90%" that only the first row has, so the bars span x=560-1133 (Take 1), x=478-1157 (Take 2), x=557-1157 (Retake) while the play/check buttons align at x=1191/1231.
- Where: `apps/ui/src/components/editing/takes/TakeLines.tsx:64-73` (`flex flex-wrap items-center gap-2` row with `min-w-[3rem] flex-1` bar and `ml-auto` percent).
- Severity: polish
- Fix: give the label cell and the percent cell fixed widths so the bars share a start and end.
- Evidence: `editing/takes-open/w1440.png` (y=498, 585, 688).
- Shared: page-local.

#### EDT-11 Time gutter takes 25% of the card at 390; text is 3-4 words per line

- Page / state: editing, `default`, `selection`, `drawer-*` states
- Widths: 390 (light and dark).
- What is wrong: each line reserves a 76px time/badge gutter plus the card padding, so the script starts at x=126 and is about 205px wide ("Alice was / beginning to get / very tired of sitting"), with the right 28px (`pr-7`) empty too.
- Where: `apps/ui/src/components/editing/script/Paragraph.tsx:37` (`grid-cols-[76px_minmax(0,1fr)]`) and `apps/ui/src/components/editing/script/ScriptDoc.tsx:96` (`pr-7 pl-2`).
- Severity: looks wrong
- Fix: below `tiny` put the time and badge above the text (single column) and trim `pr-7` to `pr-3`.
- Evidence: `editing/default/w390.png` (x=33-126 empty, text x=126-330).
- Shared: page-local.

#### EDT-12 Script area reads as left-heavy at 1440/1920: 1000px cap, controls at far right

- Page / state: editing, `default` and most states
- Widths: 1920 (blank right 650px), 1440 (150px) (light).
- What is wrong: lines stop at `max-w-[1000px]` and are left-aligned while the legend and the two header buttons sit at the card's right edge, leaving a 650px empty band right of the text at 1920 (x=1257-1887) and the active-line highlight stops at x=1257 inside a card that ends at 1407/1887.
- Where: `apps/ui/src/components/editing/script/Paragraph.tsx:37` (`max-w-[1000px]`), no centring in `apps/ui/src/components/editing/script/ScriptDoc.tsx:96`.
- Severity: polish (1440), looks wrong (1920)
- Fix: centre the column (`mx-auto`) or let the highlight span the container.
- Evidence: `editing/default/w1920.png`, `editing/selection/w1440.png` (highlight x=258-1257).
- Shared: page-local.

#### EDT-13 Focus ring on the script scroller is clipped on left and right

- Page / state: editing, `selection`, `drawer-timeline`, `takes-open` (any keyboard-focused script)
- Widths: all; seen at 1440/768/390 (light).
- What is wrong: the 2px focus ring shows only as a full-width blue line along the top and bottom of the script region; the left and right sides are cut by the card's `overflow-hidden`, so it reads as two stray rules.
- Where: `apps/ui/src/components/editing/script/ScriptDoc.tsx:96` (`focus-visible:ring-2` on a region that touches the `overflow-hidden` card from `apps/ui/src/components/editing/page/EditingBody.tsx:498`).
- Severity: polish
- Fix: use `ring-inset`.
- Evidence: `editing/selection/w1440.png` (y=124 and y=761, x=249-1407).
- Shared: page-local.

#### EDT-14 Overlay drawer is inset 7-8px inside the card at 1280 and below but flush at 1440

- Page / state: editing, `drawer-effects` (1280), `drawer-effects-inspector` (768)
- Widths: 1280/768/390 vs 1440 (light).
- What is wrong: from 1440 the drawer fills the card's height (y=68-871) and right edge (x=1407); at 1280 it is an overlay inset 8px from the card top, right and bottom (x=880-1240, y=76-763 against a card of x=97-1247, y=68-771) with a shadow, so it looks like a different panel.
- Where: `apps/ui/src/components/editing/drawer/DrawerLayout.tsx:5` (`absolute inset-y-2 right-2 ... w-[min(360px,calc(100%-16px))]`).
- Severity: polish
- Fix: none required if intended (it is a floating sheet); otherwise align its top/bottom to the card.
- Evidence: `editing/drawer-effects/w1280.png` vs `editing/drawer-effects-chains/w1440.png`.
- Shared: page-local.

#### EDT-15 Skeleton for address-checking has no card; loading skeleton has one

- Page / state: editing, `address-checking` vs `loading`
- Widths: 1440, 768 (light).
- What is wrong: the loading skeleton is inside the bordered card (x=249-1407), but the address-checking skeleton draws the title and bars straight on the page background at x=248 (1440) / x=32 (768), so the title jumps between the two when the link resolves.
- Where: `apps/ui/src/components/editing/EditingPage.tsx:165-176` (skeleton with card) vs the address-checking branch that renders a different wrapper (cause not found precisely; it is the branch where `chapters` is still null with a bad chapter id).
- Severity: polish
- Fix: render both skeletons inside the same card.
- Evidence: `editing/address-checking/w1440.png`, `editing/loading/w1440.png`.
- Shared: page-local.

#### EDT-16 Key-hint bar wraps with a centred orphan row

- Page / state: editing (bar), also Script's key hints
- Widths: 1440 (Timeline/Clear alone on row 2), 1280, 1024, 768 (light and dark).
- What is wrong: hints wrap into rows of unequal length and the short last row is centred (Editing 1440: "Timeline  Clear" at x=757-901 under a 1100px row), which looks like a misaligned line.
- Where: `apps/ui/src/components/primitives/KeyHints.tsx:20` (`flex flex-wrap justify-center gap-x-4 gap-y-1`).
- Severity: polish
- Fix: `justify-start`, or grid columns so rows align.
- Evidence: `editing/default/w1440.png` (y=831-855).
- Shared: KeyHints primitive. Also on: Script (`apps/ui/src/components/script/reader/w1440.png`, three rows).

### Proof

#### PRF-1 Notes toolbar overflows its card when Find is open at 390

- Page / state: proof / find-open (the same row is in every Proof state with Find open)
- Widths: w390, reflow (theme: light)
- What is wrong: the 176px Find field pushes the toolbar past the card's right edge, so the clear "X" sits at x=352-388 over the border (card edge is x=375). The search, export and Proofer-sheet buttons are not visible.
- Where: `apps/ui/src/components/proof/notes/NotesPanel.tsx:192-210` (toolbar `flex items-center gap-1.5` has no wrap or shrink; the Find field is a fixed `w-44` at line 196)
- Severity: breaks use
- Fix: let the toolbar wrap (`flex-wrap`) or make the Find field `min-w-0 flex-1`, and drop its fixed width below 860px.
- Evidence: `proof/find-open/w390.png` (row at y~443, right end x=352-389)
- Shared: page-local (NotesPanel is also on proof/chapter views)

#### PRF-2 Chapter strip tiles cannot hold "Open" and "Close" at 390

- Page / state: proof / default, empty, find-open, note-thread, notes-filtered, chapter-with-all views
- Widths: w390, reflow (theme: light)
- What is wrong: 14 tiles share ~326px (about 19px each), so the "Open" and "Close" labels spill outside their tiles (x=28-55 against a tile at x=33-52, and "12Close" touch), while the numbers fit.
- Where: `apps/ui/src/components/proof/frame/ChapterStrip.tsx:51-55` (`px-1`, `flex-1 min-w-0`, label span `truncate` has no width of its own, so it is not clipped; `STRIP_DENSE_OVER = 18` is only for more than 18 chapters)
- Severity: looks wrong
- Fix: below 430px use the dense labels ("In"/"Out"), or make the strip `overflow-x-auto` with a min tile width of 28px.
- Evidence: `proof/default/w390.png` (strip at y=205-258, x=28-362)
- Shared: page-local

#### PRF-3 Notes table is clipped at 390 with no scroll cue

- Page / state: proof / default, find-open, evidence-changed, note-thread (all states with notes)
- Widths: w390, reflow (theme: light)
- What is wrong: the table keeps a 640px minimum inside the 326px card, so "Script vs heard" is cut mid-word at the right edge ("a white ral", "pink") and the From and Resolution columns are off-screen, reachable only by an invisible horizontal scroll.
- Where: `apps/ui/src/components/proof/notes/NotesTable.tsx:136` (`Table className="min-w-[40rem]"`) inside `NotesPanel.tsx:217` (`overflow-auto`, no scroll shadow, unlike Pickups' `scroll-x-edges`)
- Severity: looks wrong
- Fix: use the `scroll-x-edges` shadow the Pickups table has, or hide From and Resolution columns (show a resolution dot) below 430px.
- Evidence: `proof/default/w390.png` (rows at y=560-780, right edge x=375-390)
- Shared: Table + `scroll-x-edges` pattern (Pickups table has the same min-width, see PKP-1)

#### PRF-4 Proof progress ring is invisible and leaves a blank slot

- Page / state: proof / default, empty-notes states, chapter, evidence-changed (every state with notes)
- Widths: all (theme: both)
- What is wrong: the 36px ring in the header shows only a hairline speck (about x=833, y=93 at w1440) or a faint circle outline, so "1 of 5 cleared" has an empty 44px slot in front of it; at 390 the stat line starts at x=77 instead of the title's x=33.
- Where: `apps/ui/src/components/proof/frame/ProofHeader.tsx:18-26` (`mask: radial-gradient(circle, transparent 70%, #000 71%)` has no size, so it defaults to farthest-corner (radius about 25px) and 70% of that is 17.8px, which is larger than the 18px ring; only the corners are painted, and they are clipped by `rounded-full`)
- Severity: looks wrong
- Fix: mask with `radial-gradient(circle closest-side, transparent 70%, #000 71%)`.
- Evidence: `proof/default/w1440.png` (x=825-840, y=88-100); `proof/chapter-no-recording/w1440.png` (faint circle at x=807-843, y=86-122); `proof/default/w390.png` (stat indent at y=152)
- Shared: page-local (ProofHeader)

#### PRF-5 Short Proof pages stretch their cards and leave blank space inside them

- Page / state: proof / empty (w390 clearest), loading, address-checking, default at tall viewports
- Widths: w390, w768, w1440 loading (theme: light)
- What is wrong: below 1180px the grid has no row template, so extra viewport height is shared among the cards. At 390 the "Proof" card has about 80px of empty space under the strip and there is a 80px gap above "No notes yet."; on loading, the skeleton cards run to the bottom of the window (y=883) while the loaded cards hug their content, so everything jumps.
- Where: `apps/ui/src/components/proof/ProofPage.tsx:431` and `apps/ui/src/components/proof/frame/ProofSkeleton.tsx:11` (`grid flex-1 gap-4` with auto rows stretches; the 1180+ layout sets `grid-rows-[auto_minmax(0,1fr)]` only at `min-[1180px]`)
- Severity: polish
- Fix: add `content-start` (`align-content: start`) to the grid, and `items-start` on the cards.
- Evidence: `proof/empty/w390.png` (card interior y=215-290, gap y=565-650); `proof/loading/w1440.png` (both cards end at y=883)
- Shared: page-local

#### PRF-6 Check recordings dialog body is cut mid-sentence with no scroll cue

- Page / state: proof / check-recordings-dialog (the same dialog opens from Pickups and the Proof chapter)
- Widths: w1440 at 900px tall, w768 (theme: light)
- What is wrong: the form is taller than `80dvh - 8rem`, so its body scrolls inside the dialog and the left column stops after "Chunks overlap so a word on an edge is whole in one of them; each worker transcribes its own chunks. Chapters share the" (cut at y~650 at w1440, y~715 at w768), hiding "Chapters at once", while the right column's chapter list is a second nested scroller.
- Where: `apps/ui/src/components/recordingcheck/CheckRecordingsDialog.tsx:165-167` (`max-h-[calc(80dvh-8rem)]` then `overflow-y-auto`; no fade or scrollbar affordance), `RunOptions.tsx:139`
- Severity: looks wrong
- Fix: show a scroll shadow (`scroll-y-edges`) or shrink the form's spacing so the options fit; consider letting the dialog use 90dvh.
- Evidence: `proof/check-recordings-dialog/w1440.png` (y=620-650, x=235-660); `.../w768.png` (y=660-715, x=134-375)
- Shared: Dialog body with a nested scroller

#### PRF-7 Notes toolbar sits in different places depending on width

- Page / state: proof / default and all states with notes
- Widths: w390 (right-aligned, x=54-357), w1280/w1440 (left, x=249), w1024+/w1920 (right, same row as the filters) (theme: light)
- What is wrong: when the toolbar wraps, the `flex-1` spacer either stays at the end of the first line (toolbar goes left) or wraps with the toolbar (toolbar goes right). At 390 it is indented 21px from the chips and "Sources" line above it.
- Where: `apps/ui/src/components/proof/notes/NotesPanel.tsx:191-192` (spacer span plus toolbar div instead of `ml-auto`)
- Severity: polish
- Fix: replace the spacer with `ml-auto` on the toolbar and decide one wrapped position (left-aligned with `basis-full` is consistent with the chips).
- Evidence: `proof/default/w390.png` (select starts x=54, chips at x=33), `w1440.png` (select at x=249, y=313)
- Shared: page-local

#### PRF-8 Sort select and Find field are taller than the icon buttons beside them

- Page / state: proof / default, find-open
- Widths: w1024, w1280, w1440, w1920 (theme: both)
- What is wrong: the "By time" select is 40.8px (`--control-height`) and the Find field about 38px, next to 36px icon buttons, so their tops and bottoms differ by 2-3px in one row.
- Where: `apps/ui/src/components/proof/notes/NotesPanel.tsx:193-209` (Select and SearchField at control height, IconButton at button height); `proof/find-open/w1440.png` y=293-333 vs 296-330
- Severity: polish
- Fix: use the small control height (32px) or the 36px button height for all items in the toolbar.
- Evidence: `proof/default/w1440.png` (y=293-333 select, icons y=296-330)
- Shared: Select / SearchField vs IconButton height tokens

#### PRF-9 Notes table text is 6px left of the card's own content

- Page / state: proof / default, chapter, note-thread
- Widths: w768-w1920 (theme: both)
- What is wrong: "Notes · 5", the filters, the sort select and the Sources line start at x=249 (card edge + 16px), but the table's TIME header and cell text start at x=243 (cell padding is 10px), so the headline edges differ by 6px; the "Chapter 1 · 4 open" band text sits at x=243 too.
- Where: `apps/ui/src/components/proof/notes/NotesPanel.tsx:174,30` (`px-4`) vs `apps/ui/src/components/primitives/tableStyles.ts` (`px-2.5` cells)
- Severity: polish
- Fix: pad the table's first and last cells to 16px in a flush card (`first:pl-4 last:pr-4`) or use `px-2.5` on the header rows.
- Evidence: `proof/default/w1440.png` (x=243 vs 249, y=267 vs 386)
- Shared: Table in flush cards

#### PRF-10 Time column header is left-aligned over right-aligned times; dash is misaligned

- Page / state: proof / default, find-open, notes-filtered
- Widths: w1024-w1440 (theme: light)
- What is wrong: `00:12.4` values are right-aligned (`numeric`), the "TIME" header is left-aligned, and the no-time dash "—" lands at the column's right edge (x=293 at w1440) while the times fill x=243-297.
- Where: `apps/ui/src/components/proof/notes/NotesTable.tsx:113,140` (`TableCell numeric` vs `TableHeader` without `align="right"`)
- Severity: polish
- Fix: right-align the Time header or left-align the numeric cells.
- Evidence: `proof/find-open/w1440.png` (y=516, x=293 vs 243)
- Shared: page-local

#### PRF-11 Window handles and pins stick out past the waveform's left edge

- Page / state: proof / chapter, takes-lanes, evidence-changed
- Widths: w768-w1920 (theme: light)
- What is wrong: the overview window starts at x=243 and the first pin dot is centred at x=249 (half outside), while "Showing" and the card content start at x=249; at the right end of the recording they overhang the card's inner edge the same way.
- Where: `apps/ui/src/components/proof/frame/WaveformWindow.tsx:158,264,283` (`-translate-x-1/2` on handles and pins at `left: 0%`)
- Severity: polish
- Fix: clamp the pins and handles inside the track (or add 8px of padding on the track).
- Evidence: `proof/chapter/w1440.png` (x=241-257, y=437-495)
- Shared: page-local

#### PRF-12 Last and selected table rows have square corners over the card's rounded corners

- Page / state: proof / chapter-no-recording, notes-filtered, default
- Widths: w1440 (theme: light)
- What is wrong: the selected row fill and bottom border run into the Notes card's bottom corners (card at y=679, x=233) because the scroll region under the rounded frame is not clipped.
- Where: `apps/ui/src/components/proof/notes/NotesPanel.tsx:172` (card has `rounded` but no `overflow-hidden`) with the scroll div at `:217`
- Severity: polish
- Fix: `overflow-hidden` on the section (or `rounded-b` on the scroll div).
- Evidence: `proof/chapter-no-recording/w1440.png` (x=233, y=640-680); same on Pickups, see PKP-5
- Shared: Table-in-card pattern

#### PRF-13 Load error is a narrow 720px column with the title outside the card

- Page / state: proof / load-error, proof-chapter / load-failed
- Widths: w1440 (theme: light)
- What is wrong: the error card is centred in a 720px column (x=468-1188) with "Proof" above it, while every other state (and no-manuscript) draws full-width cards at x=233; the title jumps and the card is not where the page's cards are.
- Where: `apps/ui/src/components/layout/LoadError.tsx:30` (Panel in a max-width centred wrapper)
- Severity: polish
- Fix: draw the error as a full-width card inside the page's normal container.
- Evidence: `proof/load-error/w1440.png` (x=468-1188)
- Shared: LoadError (shown on every page)

### Proof (chapter view)

#### PRC-1 "Compare the recording with the script" wraps mid-word at 390

- Page / state: proof-chapter / every state that shows the Compare card (current, never, stale, compare-*, preview-*, hints, native-takes, stage panels, render-*)
- Widths: w390, reflow (theme: light)
- What is wrong: the panel title breaks as "Comp / are / the / recor / ding / with / the / script" in a ~45px column while the "1 · Setup / 2 · Running / 3 · Results" strip takes the rest of the row, making a 200px-tall header.
- Where: `apps/ui/src/components/primitives/Panel.tsx:96-111` (PanelHeader title wrapper is `flex-1 min-w-0` and the title has `[overflow-wrap:anywhere]` at `panelStyles.ts:20`, so it can shrink to one character instead of pushing the actions onto the next line)
- Severity: looks wrong
- Fix: give the title wrapper a minimum width (about 10rem) or `flex-[1_1_12rem]` so the header wraps and the actions drop below the title.
- Evidence: `proof-chapter/current/w390.png` (card header, y=265-460, x=33-77); same in compare-running/w390.png, compare-results-changed-since/w390.png
- Shared: Panel / PanelHeader `actions` (any Panel with wide actions at phone width)

#### PRC-2 Unassigned native take loses its name at 390

- Page / state: proof-chapter / native-takes-keeper, native-takes-unassigned
- Widths: w390, w768 probable (theme: light)
- What is wrong: in "Not yet assigned to a line" the take name is truncated to "T" (should read "Take 002") because the paragraph select and Assign button take the row.
- Where: `apps/ui/src/components/proof/NativeTakesPanel.tsx:157,167` (`li` is `flex flex-wrap`, but the name is `min-w-0 flex-1 truncate`, so it shrinks to nothing instead of the select and button wrapping)
- Severity: breaks use
- Fix: give the name `min-w-[6rem]` (or `shrink-0`) so the select and button wrap to a second line.
- Evidence: `proof-chapter/native-takes-keeper/w390.png` (row at y~490, x=83-97)
- Shared: page-local

#### PRC-3 Preview table collapses at 390: one word per line and columns off-screen

- Page / state: proof-chapter / every state with Preview (preview-*, current, compare-*)
- Widths: w390, reflow (theme: light)
- What is wrong: with the table at its natural width inside an `overflow-auto` box, the Chapter column is about 65px ("Chapter / 1 — / Down / the / Rabbit- / Hole"), Words, Why suggested and the three action buttons are off-screen, and in preview-warnings the "Why suggested" column is about 80px so a warning wraps to a 400px tall row.
- Where: `apps/ui/src/components/proof/PreviewPanel.tsx:140-141` (`overflow-auto` around a `Table` with no min-width or column widths; nowrap mono "paragraphs 1 to 24" and the action column push the width)
- Severity: looks wrong
- Fix: below 600px render each candidate as a stacked card (name, range and length, why, actions) or hide Words and Paragraphs.
- Evidence: `proof-chapter/preview-default/w390.png` (rows y=565-840), `.../preview-warnings/w390.png` (y=340-800, table scrolled left: x=-77)
- Shared: page-local

#### PRC-4 Proof chapter page is capped at 1280px and centred while Proof and Pickups run full width

- Page / state: proof-chapter / all states
- Widths: w1680, w1920 (theme: light)
- What is wrong: at 1920 the chapter page title and cards start at x=428 and end at x=1708 while the Proof list page starts at x=233 and ends at x=1903, so the title and content jump when moving from Proof to a chapter.
- Where: `apps/ui/src/components/proof/ProofChapterPage.tsx:132,144,155` (`mx-auto max-w-7xl`)
- Severity: polish
- Fix: drop `max-w-7xl` or add the same cap to Proof and Pickups.
- Evidence: `proof-chapter/compare-hints-many-pills/w1920.png` (title x=428) vs `proof/chapter/w1920.png` (title x=249)
- Shared: page-width convention

#### PRC-5 Whisper model buttons wrap and the three setup columns stop lining up at 1024

- Page / state: proof-chapter / current, compare-setup, compare-hints-*
- Widths: w1024, w768 (theme: light)
- What is wrong: five model buttons need about 340px but the equal three-column grid gives about 270px, so "LARGE" drops to a second row alone; Chunk length and Parallel workers sit at y=309 while the model row is two rows tall, leaving a 40px blank under them and pushing the vocabulary hints down.
- Where: `apps/ui/src/components/proof/CompareRun.tsx:343` (`grid gap-5 md:grid-cols-3`, equal columns)
- Severity: polish
- Fix: size the grid `md:grid-cols-[auto_auto_auto]` or `grid-cols-[1.4fr_1fr_1fr]` so the model group keeps one row down to 1024.
- Evidence: `proof-chapter/compare-hints-many-pills/w1024.png` (y=290-370), `current/w768.png`
- Shared: page-local

#### PRC-6 Live activity log has square corners

- Page / state: proof-chapter / compare-running
- Widths: all (theme: light)
- What is wrong: the log box (x=249-1407, y=331-475 at w1440) is square-cornered while the vocabulary box, buttons and cards are rounded.
- Where: `apps/ui/src/components/proof/CompareRun.tsx:463` (`border` with no radius)
- Severity: polish
- Fix: add the field radius token.
- Evidence: `proof-chapter/compare-running/w1440.png` (corners at x=249/1407, y=331/475)
- Shared: page-local

#### PRC-7 Preview columns move between states and the action buttons float off the right edge

- Page / state: proof-chapter / preview-warnings vs current/preview-default
- Widths: w1440 (theme: light)
- What is wrong: columns are auto-sized, so Paragraphs starts at x=616 in the default list but x=444 with one warning row, and the pin/copy/open buttons end at x=1370 (37px short of the table's right edge x=1407) in the default list but x=1397 in the warning state.
- Where: `apps/ui/src/components/proof/PreviewPanel.tsx:141-146` (no fixed column widths, `Table` with `w-full`)
- Severity: polish
- Fix: set explicit column widths (`colgroup`) and right-align the actions column.
- Evidence: `proof-chapter/current/w1440.png` (buttons x=1254-1370) vs `.../preview-warnings/w1440.png` (x=1281-1397)
- Shared: page-local

### Pickups

#### PKP-1 Pickups table hides From, Status and every row action at 390

- Page / state: pickups / list, add-popover, marked-recorded, scoped, session-left-out
- Widths: w390, reflow (theme: light)
- What is wrong: the table keeps 640px inside a 326px card, so the line text is squeezed to about 120px (13-line wraps) and the From, Status and play/record/done/delete buttons are off-screen to the right; only a faint edge shadow at x=370 hints at it.
- Where: `apps/ui/src/components/pickups/list/PickupsTable.tsx:271-272` (`scroll-x-edges overflow-auto`, `Table className="min-w-[40rem]"`)
- Severity: looks wrong
- Fix: below 600px stack each pickup as a card (checkbox, time, type, text, then the action row), or drop From and Status into the second line.
- Evidence: `pickups/list/w390.png` (rows y=250-740, right edge x=355-390)
- Shared: Table min-width pattern (same cause as PRF-3)

#### PKP-2 Chapter picker changes width between loading, error and loaded

- Page / state: pickups / loading, unreadable vs list
- Widths: w1440 (theme: light)
- What is wrong: the chapter button is 123px wide (x=384-507) while chapters are loading or unread and 253px (x=384-636) once loaded, so the prev/next arrow and the title row jump.
- Where: `apps/ui/src/components/primitives/ChapterStepper.tsx:66` (`min-w-[min(var(--chapter-ch),21.25rem)]`; `--chapter-ch` is the longest chapter name and is empty with no chapters)
- Severity: polish
- Fix: set a fixed minimum width for the trigger instead of one derived from the data.
- Evidence: `pickups/loading/w1440.png` (x=384-507) vs `.../list/w1440.png` (x=384-636)
- Shared: ChapterStepper (also on Proof, Editing, Booth)

#### PKP-3 Chapter picker label is centred and the arrow is glued to it

- Page / state: pickups and proof, every state with the stepper
- Widths: all (theme: both)
- What is wrong: in the 253-264px wide trigger the label and "▼" sit together in the middle ("ALL CHAPTERS ▼" at x=462-558) although the trigger asks for `justify-between`; the empty sides make it look like a text field.
- Where: `apps/ui/src/components/primitives/ChapterStepper.tsx:66-71` (the caret is in the same label string, so `justify-between` has nothing to push apart)
- Severity: polish
- Fix: render the caret as its own element so `justify-between` puts it at the right edge.
- Evidence: `pickups/list/w1440.png` (y=98), `proof/default/w1440.png` (y=103)
- Shared: ChapterStepper

#### PKP-4 Pickups toolbar buttons drop under the title at 390

- Page / state: pickups / every state
- Widths: w390, reflow (theme: light)
- What is wrong: the ear and "+" buttons wrap to a second line at the far left (x=33-113, y=125-160) under the title, while at 768 and up they sit at the right of the title row; there is a blank block to their right.
- Where: `apps/ui/src/components/pickups/list/PickupsTable.tsx:213-218` (header is `flex-wrap justify-between`, the buttons div has no `ml-auto`)
- Severity: polish
- Fix: add `ml-auto` to the button group so it stays right-aligned when it wraps.
- Evidence: `pickups/list/w390.png`
- Shared: PANEL_HEADER_CLASS pattern

#### PKP-5 Pickups group row reads "Chapter 3 A Caucus-Race..." and the table bottom pokes out of the card's corners

- Page / state: pickups / list and every state with rows
- Widths: all (theme: light)
- What is wrong: (a) the group band and chapter select show "Chapter 3 A Caucus-Race and a Long Tale" without the dash that Proof uses ("Chapter 1 — Down the Rabbit-Hole"); (b) the last row's bottom border reaches the card's rounded bottom corners.
- Where: (a) `apps/ui/src/components/pickups/list/PickupsTable.tsx:383` and the stepper options (chapter label); (b) `PickupsTable.tsx:212,271` (`PANEL_FRAME_CLASS` with no overflow clip)
- Severity: polish
- Fix: use the shared chapter-name formatter with the em dash; add `overflow-hidden` to the frame.
- Evidence: `pickups/list/w1440.png` (y=183 and y=470)
- Shared: chapterName / Table-in-card pattern (see PRF-12)

#### PKP-6 Session panel: a lone icon button hangs under the main action

- Page / state: pickups / list, scoped, empty, unreadable, loading
- Widths: w768-w1440 (theme: light)
- What is wrong: the flag button (x=1081-1117, y=264-300) sits alone under the full-width "Open 3 in Booth" button with no label and no row to align to, leaving the right two thirds of the row empty; the Pickups card on the left also ends at y=472 while this card ends at 316.
- Where: `apps/ui/src/components/pickups/list/SessionPanel.tsx:106-122` (IconButton wrapped in a bare `div`)
- Severity: polish
- Fix: put the flag button in the header actions beside "Copy", or give it a labelled button of the same width.
- Evidence: `pickups/list/w1440.png`
- Shared: page-local

### Master & QC

#### MST-1 Master to spec: "Title for Chapter 0N.wav" inputs collapse to ~35px at 390 (the known suite failure, confirmed)

- Page / state: master / to-spec-picked (also to-spec-running shows the read-only titles wrapping "Chapter / 01" at 390)
- Widths: 390 (theme: light). At 768 and up the Title column is fine (x 369-547 at 768).
- What is wrong: the Title text field is a narrow box showing only "C" (painted about 34.8px wide, x~303-338) while the Role selects keep their full width and the table overflows its scroll box by about 150px (scrollWidth 470 vs 324).
- Where: `apps/ui/src/components/master/MasterToSpecPanel.tsx:119` (TextField in the Title cell) with `apps/ui/src/components/primitives/TextField.tsx:49` (`w-full`, no min-width). Cause confirmed: a percentage-width input in an auto-layout table cell has near-zero min-content, so the column shrinks to cell padding plus border while the Select's intrinsic width does not shrink. The wrapper at `MasterToSpecPanel.tsx:84` is `overflow-x-auto`, so the table scrolls instead of the column holding its width.
- Severity: breaks use
- Fix: give the title field a floor (`min-w-[10rem]` on the cell or the TextField) so the table scrolls sideways with a usable input, or stack role and title under the file name below 480px.
- Evidence: `master/to-spec-picked/w390.png` (rows "Chapter 01.wav" and "Chapter 02.wav", the "C" box at x~303-338, y~230 and ~296); compare `.../w768.png`.
- Shared: page-local fix, but the root is the `TextField` `w-full` default inside tables (same collapse as the Story Bible "Name" input noted in the brief).

#### MST-2 Per-file checks table: File column wraps one or two characters per line at 390

- Page / state: master / every state with the table (24 of 26: empty, running, measured, book-spread, custom-profile, error, ...)
- Widths: 390 (theme: light). At 768 and up the names are on one line.
- What is wrong: the first column collapses to about 20px so "Opening credits" becomes "Openin / g / cre / dits" and "Chapter 1 — Down the Rabbit-Hole" takes about nine lines, making rows 220px tall; Length/RMS/Peak/Noise floor stay at full width and the Head/Tail and Result columns are pushed off the right edge.
- Where: `apps/ui/src/components/masterqc/files/FilesTable.tsx:163` (`[overflow-wrap:anywhere]` on the File cell) inside the `overflow-x-auto` wrapper at `FilesTable.tsx:135`. Cause: `overflow-wrap:anywhere` lowers the cell's min-content to one character, so the auto table layout gives the File column almost nothing and breaks mid-word; `Table` has no min width.
- Severity: breaks use
- Fix: give the File cell a `min-w-[10rem]` (and use `overflow-wrap:break-word` rather than `anywhere`) so the table scrolls horizontally instead.
- Evidence: `master/measured/w390.png` (rows at y~320-440 and ~450-660), `.../empty/w768.png` is fine for comparison.
- Shared: `Table` primitive plus `[overflow-wrap:anywhere]` on a first column; check other tables that use it (`DiagnosticsTables`/`DiagnosticsSection.tsx:57` and `:118` do the same but have `min-w-[9rem]`, which is why those hold).

#### MST-3 "Not measured" result pill wraps to two lines ("Not / measured")

- Page / state: master / error, cancelled, and measured (Chapter 3 row) at 1280; error at 1440
- Widths: 1280 (measured), 1440 (error, cancelled); also 1024 narrow bands where the message text is long (theme: light).
- What is wrong: the status pill breaks into two stacked words with a taller, rounder shape, and the file names beside it wrap too ("Chapter 1 — Down the Rabbit- / Hole"), so rows are 42-53px instead of 39px.
- Where: `apps/ui/src/components/masterqc/files/FilesTable.tsx:192` (Result `TableCell align="right"` has no `whitespace-nowrap`) with `apps/ui/src/components/primitives/StatusBadge.tsx:54` (`max-w-full`, wrap allowed by design). Cause: the long colSpan message cell (`FilesTable.tsx:174`, "Could not be measured: ... · not mastered") takes the width and the badge is squeezed.
- Severity: looks wrong
- Fix: `whitespace-nowrap` on the Result cell and let the message cell wrap instead.
- Evidence: `master/error/w1440.png` (rows Chapter 1-3 at y~280-380, pill at x~960-1038); `master/measured/w1280.png` (Chapter 3 row, pill x~795-879, y~360).
- Shared: StatusBadge wrapping (`StatusBadge.tsx:54`); also see MST-5.

#### MST-4 Right column ends early and leaves a 390px (1440) to 460px (1920) empty strip beside every panel below the table

- Page / state: master / all states at xl widths; most visible in diagnostics-*, file-rules, report-*, to-spec-*, book-spread (every crop below the table)
- Widths: 1280, 1440, 1920 (theme: both).
- What is wrong: the left column holds about ten panels (table, checks, consistency, Master to spec, chain, Diagnostics, Thresholds, Silence cleanup, Report) while the "Delivery package" and "Multi-platform export" aside is two short panels at the top and is not sticky, so after the first screen the right 25-30% of the page is bare background.
- Where: `apps/ui/src/components/masterqc/page/MasterPage.tsx:210-211` and `:310` (`grid items-start xl:grid-cols-[minmax(0,1fr)_minmax(19rem,22.4rem)]`; the second column div has no `sticky top-*`).
- Severity: looks wrong
- Fix: make the aside `xl:sticky xl:top-4` (with max-height and overflow) or move the wide lower panels under a full-width row.
- Evidence: `master/diagnostics-findings/w1440.png` and `.../book-spread/w1440.png` (x 1050-1440 empty); `.../multi-export-results/w1440.png` shows the aside only because the crop was scrolled to it.
- Shared: page-local (Delivery's aside stretches instead; see DLV-7).

#### MST-5 File rules table: Source column is cut off at 768 and 390, badge "Not checked by the app" wraps to four lines

- Page / state: master / file-rules, measured, book-spread, custom-profile, diagnostics-findings (the "every rule" list)
- Widths: 768, 390 (theme: both); at 1440 the Source column is only ~150px wide and wraps to 6-8 lines.
- What is wrong: the table is 756px wide in a 702px box, so at 768 the Source column is sliced mid-word with no visible scroll cue (only a focus ring on the box); the "MP3 format" row's badge becomes a tall four-line pill ("Not / checked / by the / app"); at 1440 the This-file column is wide while Source is narrow, so the first rows are 125-130px tall.
- Where: `apps/ui/src/components/master/FileRulesPanel.tsx:79-115` (column `min-w-[8/11/12/9rem]` set per cell, no widths on the header, scroll box at `:79`), badge from `ResultMark` / `StatusBadge.tsx:54-62`.
- Severity: looks wrong
- Fix: widen Source (`min-w-[16rem]`) and shrink the This file/ACX requires minimums, add `whitespace-nowrap` to the result badge, and add an edge shadow (`scroll-x-edges`, used by Schedule's milestones) to this box.
- Evidence: `master/file-rules/w768.png` (Source column x~655-735, badge at x~45-120, y~940-985), `master/file-rules/w1440.png` (Source at x~884-1030).
- Shared: `Table` in horizontal-scroll boxes (also MST-10, DLV-6).

#### MST-6 Multi-platform export: folder paths break mid-word and result labels sit 3-4px right of the checkbox labels

- Page / state: master / multi-export-results, multi-export-running
- Widths: 1440, 390 (theme: light).
- What is wrong: the saved folder "C:\Users\...\Wonderland\ACX" wraps as "...\A / CX" and "...\M / y ACX, tighter peak"; the row's result icon/name (x~1110) does not line up with the "Build packages for" checkbox labels above (x~1106-1107), and the running row's grey dot is larger than the checkbox.
- Where: `apps/ui/src/components/master/MultiPlatformExportPanel.tsx:44` (`[overflow-wrap:anywhere]` on the path) and `:33-37` (`items-start gap-1` result row vs the checkbox row).
- Severity: polish
- Fix: break paths after `\` (insert `<wbr>`) and use the same icon width and gap as the checkbox row.
- Evidence: `master/multi-export-results/w1440.png` (path lines at y~243-262 and ~340-360, x 1110-1404), `.../multi-export-running/w1440.png` ("ACX" at x 1110, y~197).
- Shared: page-local.

#### MST-7 Delivery package checklist: icon badges differ in width and are centred on two-line items

- Page / state: master / measured, custom-profile, book-spread, error (the aside list)
- Widths: 1440, 1280, 390 (theme: both).
- What is wrong: the check, cross and "…" badges are 2px different widths so the item text starts at x=1121 for passes, 1119 for the "…" rows; where an item wraps ("Chapter 1 — Down the Rabbit-Hole fails 1 / check", "mono or stereo ... (the MP3 format is checked ...)") the badge sits between the two lines instead of beside the first.
- Where: `apps/ui/src/components/masterqc/page/PackageChecks.tsx:57` (`li` is `flex items-center gap-2`) with the glyph-width `StatusBadge` at `:58`.
- Severity: polish
- Fix: fixed-width badge (`w-6 justify-center`) and `items-start` on the `li`.
- Evidence: `master/measured/w1440.png` (list at x 1083-1400, y 146-285), `master/custom-profile/w1440.png` (badge at y~214 between text lines y 205 and 225).
- Shared: `StatusBadge` glyph badges.

#### MST-8 Panel header dividers do not line up across the two columns

- Page / state: master / all states with both columns; also delivery (see DLV-5)
- Widths: 1280, 1440, 1920 (theme: both).
- What is wrong: the table panel's header divider is at y~127 while the aside "Delivery package" panel's divider is at y~119, and in the running state the "Master to spec" and "Mastering chain" headers differ again (Mastering chain header grows when its subtitle wraps).
- Where: `apps/ui/src/components/primitives/panelStyles.ts:8` (`min-h-[3.125rem] py-[0.6875rem]`: height follows its tallest child: a 40px select/stepper vs plain text) and `MasterPage.tsx:210`.
- Severity: polish
- Fix: set one header height for panels that sit side by side (`min-h` equal to the tallest header).
- Evidence: `master/measured/w1440.png` (dividers at y~127 left and ~119 right).
- Shared: `PANEL_HEADER_CLASS`.

#### MST-9 Silence cleanup options dialog: intro line is jammed against the first field, and the dialog is ~1000px wide for five short fields

- Page / state: master / diagnostics-cleanup-options (Silence cleanup candidates, "Silence cleanup options")
- Widths: 1440 (dialog x 217-1223, half empty to the right of the inputs), 390 (intro and first label 8px apart) (theme: light).
- What is wrong: "Saved at once for this project..." sits about 14px above "Hold kept at each side..." while the remaining rows have about 24px gaps, so the first field looks glued to the intro; the dialog is a full-width form with all content in the left 55%.
- Where: dialog markup in `apps/ui/src/components/master/DiagnosticsSection.tsx` (the options form near `:270`; exact className not pinned down, cause of the dialog width not found), the `Dialog` primitive's width.
- Severity: polish
- Fix: add `mb-3` under the intro and cap the dialog at about 36rem.
- Evidence: `master/diagnostics-cleanup-options/w1440.png` (y 331-358), `.../w390.png` (y~245-262).
- Shared: Dialog width (also SCH-6).

#### MST-10 Diagnostics tables clip at 390 with no cue, and multi-line rows are vertically centred so first lines do not line up

- Page / state: master / diagnostics-findings, diagnostics-error, diagnostics-cancelled
- Widths: 390 (clipping), 1440/768 (row alignment) (theme: light).
- What is wrong: at 390 "Could not be checked: not a ..." and "Not checked: the diagnostic..." are cut at the edge and the Level shifts/Silence/Pacing columns are off-screen with only an unlabelled scroll box; in the Findings table the Time, Measured, Threshold and Source cells are middle-aligned so "Clipping" (y 551) and "Chapter 01.wav" (y 559) start on different lines.
- Where: `apps/ui/src/components/master/DiagnosticsTables.tsx:41,91` (default `valign` middle on the `TableCell`s at `:104-121`) and scroll boxes at `DiagnosticsSection.tsx:57,270,277`.
- Severity: polish
- Fix: `valign="top"` on the findings cells (FileRulesPanel already does this) and add `scroll-x-edges`.
- Evidence: `master/diagnostics-findings/w1440.png` (rows y 540-840), `.../diagnostics-error/w390.png` (rows at y~437-545).
- Shared: `Table` valign default (Delivery's rules table has the opposite default, see DLV-6).

#### MST-11 Master to spec: column positions jump between states and "Not started" wraps at 768

- Page / state: master / to-spec-picked vs to-spec-running vs multi-export-results
- Widths: 1440 (jump), 768 (wrap) (theme: light).
- What is wrong: the Role column starts at x=439 while picking, x=527 while running and x=543 when done (inputs/selects become text, widths re-flow), and at 768 the Status cell "Not started" wraps to two lines beside the Remove buttons.
- Where: `apps/ui/src/components/master/MasterToSpecPanel.tsx:86-140` (auto-width columns, no fixed widths).
- Severity: polish
- Fix: fixed column widths (`w-[14rem]` role, etc.) and `whitespace-nowrap` on Status.
- Evidence: `master/to-spec-picked/w1440.png`, `.../to-spec-running/w1440.png`, `.../to-spec-picked/w768.png` (Status x~567-612).
- Shared: page-local.

#### MST-12 Book consistency chart labels shrink to ~7px at 390 and the bar floats inset from the panel text

- Page / state: master / book-spread (also custom-profile, measured with measurements)
- Widths: 390 (labels), 1440 (bar inset 140px each side while the caption is left-aligned) (theme: light).
- What is wrong: "-23.0" and "-18.0" scale down with the SVG to about 7px; at 1440 the green band (x 373-908) is centred in an 817px panel with the "Spread 3.2 dB across 6 files" caption flush left at x=249.
- Where: `apps/ui/src/components/masterqc/page/Consistency.tsx:33-36` (svg `w-full h-auto` with a fixed viewBox, 11px labels in viewBox units) and `:25-27` (the 1 dB margin around the band).
- Severity: polish
- Fix: render labels as HTML under the bar or enforce a min SVG font size; left-align or centre the caption with the bar.
- Evidence: `master/book-spread/w390.png` (labels at y~175), `.../w1440.png` (y 170-235).
- Shared: page-local.

### Delivery

#### DLV-1 Delivery at 390: all three cards overflow the viewport by 15px (right border and padding cut off)

- Page / state: delivery / default, failing-chapter, many-chapters, build-failed and custom-profile (5px); not in host-quiet-cancelled (no wide pill)
- Widths: 390 (theme: light).
- What is wrong: the Delivery, Output, Profile rules and Before you build cards are 405px wide in a 390px page so their right border is off-screen, the values (RMS "-23 to -18 dBFS" ends x=378 vs 357 in states that fit) sit in the cut-off padding, and the page scrolls sideways.
- Where: `apps/ui/src/components/delivery/page/DeliveryPage.tsx:80` (`grid gap-4 lg:grid-cols-[...]` has no base `grid-cols-[minmax(0,1fr)]`, so the single implicit column grows to the min-content of the "Waiting on 3 pickups" / truncate row in `Preflight.tsx:88-90`). Confirmed in the probe: sections' right edge 405 > 390 only in the states that contain that pill.
- Severity: looks wrong
- Fix: `grid-cols-[minmax(0,1fr)]` (or `min-w-0` on the Preflight section) at base.
- Evidence: `delivery/default/w390.png` (no right border on any card; chip at x 325-372), compare `delivery/host-quiet-cancelled/w390.png` (cards end at x 374, chip x 306-356).
- Shared: grid without a base `minmax(0,1fr)` track; check other two-column pages that use `grid ... lg:grid-cols`.

#### DLV-2 Custom profile limit rows: inputs have ragged left and right edges and uneven row heights

- Page / state: delivery / custom-profile
- Widths: 1440, 768, 390 (theme: both).
- What is wrong: rows read "RMS [-24] to [-18] dBFS", "Peak no lowest to [-3.5] dBFS", "Room tone, tail [1] to [5] s", "File length no lowest to [120] min"; the last input ends at x=990 (RMS, Peak, Noise floor), x=1016 (tail) and x=998 (file length) because the unit width differs, so the inputs do not form a column; row pitch is 44px for rows with inputs, 36px for "Off", 28px for text rows.
- Where: `apps/ui/src/components/delivery/profile/LimitRow.tsx:43-55` (`justify-between` with the controls right-aligned; unit text is its own width, `w-24!` boxes) and the row gap set by `FormatRows.tsx:23`.
- Severity: looks wrong
- Fix: give the unit a fixed-width column (`w-10`) and rows a common `min-h`, so the boxes align to one right edge.
- Evidence: `delivery/custom-profile/w1440.png` (boxes at x 769-865/894-990, 795-891/920-1016, 903-999; row labels y 194-526), `.../w390.png`.
- Shared: label-left / control-right rows with `justify-between` (same as SCH-1).

#### DLV-3 Profile header: select is 41px tall and the name box beside it is 36px; at 390 they stack with different left edges

- Page / state: delivery / custom-profile
- Widths: 1440, 768, 390 (theme: both).
- What is wrong: the profile `<select>` (y 80-121) and the "My ACX, tighter peak" text box (y 82-118) sit side by side with different heights; at 390 the "PROFILE" caption is right-aligned alone on a line, then the select starts at x=200 and the name box at x=218.
- Where: `apps/ui/src/components/primitives/Select.tsx:48` (`h-[var(--control-height)]` = 40.8px) vs `apps/ui/src/components/primitives/TextField.tsx:13` (`md: h-9` = 36px), both used in `apps/ui/src/components/delivery/profile/ProfileCard.tsx:114-134`.
- Severity: looks wrong
- Fix: use one control height token for Select and TextField (and `w-full` for both in the stacked layout).
- Evidence: `delivery/custom-profile/w1440.png` (y 80-121), `.../w390.png` (y 118-230).
- Shared: Select 40.8px vs TextField 36px: same mismatch on Schedule Contract (SCH-2), Master to spec (select 41 vs title input 36, `to-spec-picked/w1440.png` y 221-259) and the Milestone dialog (SCH-6).

#### DLV-4 Channels row at 390 breaks left-aligned under its label while every other row is right-aligned

- Page / state: delivery / default, built, many-chapters, host-quiet-cancelled
- Widths: 390 (theme: light).
- What is wrong: "mono or stereo, the same in every file" is too wide for the row, so it wraps below "Channels" flush left at x=33, breaking the right-aligned value column.
- Where: `apps/ui/src/components/delivery/profile/FormatRows.tsx:27-29` (`flex-wrap justify-between`).
- Severity: polish
- Fix: `ml-auto text-right` on the value so a wrapped value stays on the right.
- Evidence: `delivery/default/w390.png` (y 446-474).
- Shared: same pattern as DLV-2.

#### DLV-5 Left and right cards have different header heights, so the divider lines are 5px apart

- Page / state: delivery / all states at 1280+
- Widths: 1440, 1920 (theme: both).
- What is wrong: the Delivery header (select inside) ends at y=132 and the "Before you build" header (32px icon button) ends at y=127.
- Where: `apps/ui/src/components/delivery/profile/ProfileCard.tsx:180` and `apps/ui/src/components/primitives/panelStyles.ts:8` (header height follows its tallest child).
- Severity: polish
- Fix: same fixed header height for side-by-side cards. Also on master (MST-8).
- Evidence: `delivery/default/w1440.png`.
- Shared: `PANEL_HEADER_CLASS`.

#### DLV-6 Profile rules table (opened): rows are 110-130px tall with the rule name floating mid-row, and at 390 the visible columns are mostly blank

- Page / state: delivery / profile-rules
- Widths: 390 (worst), 1440, 768 (theme: light).
- What is wrong: the narrow Source column wraps to 5-6 lines and stretches each row; Rule, ACX requires and How the app checks it are vertically centred in that height ("RMS" at y 320, Source badge at y 292); at 390 only Rule and ACX requires are visible and each row is about 127px of mostly empty space. Master's equivalent table (FileRulesPanel) is top-aligned instead.
- Where: `apps/ui/src/components/master/DeliveryProfilePanel.tsx:98-130` (cells use the default middle valign, `min-w-[9/12/12/10rem]`, scroll box `:96`).
- Severity: looks wrong
- Fix: `valign="top"` on all cells and a wider Source minimum.
- Evidence: `delivery/profile-rules/w1440.png` (rows y 275-860), `.../w390.png` (rows y 360-840).
- Shared: `Table` valign default (see MST-10).

#### DLV-7 "Before you build": chapter names are ellipsised at every width and the card has a blank tail

- Page / state: delivery / default, failing-chapter, custom-profile, many-chapters (rows with "Waiting on 3 pickups")
- Widths: 1440 and 1920 (the column is fixed 22.5rem, so a wider screen does not help) (theme: both).
- What is wrong: names such as "Chapter 3 — A Caucus-Race a…", "Chapter 4 — The Rabbit Sends in a …", "Chapter 8 — The Queen's Croquet-…" are cut while the pill column is wider than the names need; the card stretches to the left column height and leaves ~100px empty under "Closing credits".
- Where: `apps/ui/src/components/delivery/page/Preflight.tsx:88-90` (`truncate` on the name, pill `flex-none`) and `DeliveryPage.tsx:80` (`22.5rem` track).
- Severity: polish
- Fix: allow the name to wrap to two lines or give the aside 26rem at 1920.
- Evidence: `delivery/default/w1440.png` (x 1081-1315, y 326-596), `.../w1920.png`.
- Shared: page-local.

#### DLV-8 Built output at 390: the "Open folder" icon button wraps onto its own line

- Page / state: delivery / built
- Widths: 390 (theme: light).
- What is wrong: the Built / 15 files / path line wraps and the folder icon button (x 33-69) sits alone beneath it, left-aligned, instead of at the right as at 1440.
- Where: `apps/ui/src/components/delivery/page/OutputPanel.tsx:139-146` (`flex-wrap` row with `flex-1` spacer).
- Severity: polish
- Fix: keep the icon button on the first line (`order`/`ml-auto` with the path on its own line).
- Evidence: `delivery/built/w390.png` (y 460-550).
- Shared: page-local.

### Settings

#### SET-1 REAPER program input runs past the card and the window edge

- Page / state: Recording & DAW > Advanced; `recording-advanced`, `recording-reaper-path-invalid`
- Widths: 390/reflow, 1024 (theme: both). Probe also lists these two states at those widths only; 1280/1440 look fine.
- What is wrong: the text box is 416 px wide inside a card that is narrower, so it starts at the card's control column and is cut off by the viewport (right edge 453 px at 390; at 1024 it starts at x=688 and is clipped at x=1024, 17 px past the card's right edge at 1007), and the page scrolls sideways at 390. The focus ring is cut off too (reaper-path-invalid).
- Where: `apps/ui/src/components/settings/row/ValueControl.tsx:175` (`w-[26rem] max-w-full`) inside `SettingRowView.tsx:113,118` (column is `items-start`, the field wrapper is `flex-nowrap` and shrink-to-fit, so `max-w-full` has no definite width to clamp to). The same cause makes any `w-80` text box 4 px wider than the card's right padding at 390 (Narrator name input ends x=357 vs 353 gutter, `project-credits`, `deep-link` w390).
- Severity: breaks use
- Fix: give the field wrapper `w-full min-w-0` (or `self-stretch`) and make the box `w-full max-w-[26rem]`/`max-w-80` instead of a fixed width.
- Evidence: `settings/recording-reaper-path-invalid/w390.png` (input from x=37 off the right edge, y~280); `settings/recording-advanced/w390.png` (y~245); `settings/recording-advanced/w1024.png` (top card, input x 688-1024); `settings/deep-link/w390.png` (Narrator name input, y~358).
- Shared: SettingRowView text-field rows (every `text` setting).

#### SET-2 Import review dialog at 390: the section-type selects are cut off by the dialog edge

- Page / state: Project > Replace manuscript > step 2; `manuscript` (also reached via `import-choose`)
- Widths: 390/reflow (theme: light checked)
- What is wrong: each chapter row is `title | words | Subtitle checkbox | select`, all `flex-none` in a 271 px dialog, so the "Narration chapter" select is clipped at the right edge (only "Narra..." visible on rows with a Subtitle checkbox) and the chapter title is squeezed out entirely. The scroll area is `overflow-x-hidden`, so the cut part cannot be reached. Probe: `div.min-h-0.flex-1.overflow-x-hidden` scrollW 381 > clientW 271.
- Where: `apps/ui/src/components/production/ImportReview.tsx:155-215` (single non-wrapping `flex items-center gap-3` row; select `flex-none`), inside `primitives/Dialog.tsx:148` body `overflow-x-hidden` (see SET-3).
- Severity: breaks use
- Fix: below the compact band stack each row (title on its own line, then words / Subtitle / select wrapped), and let the select `min-w-0 flex-1`.
- Evidence: `settings/manuscript/w390.png` (rows y~540-690; select cut at x=332).
- Shared: ImportReview is also drawn on the Production/Script import path ("also on: production import review").

#### SET-3 Dialogs are capped at 70vw, so at 390 they are 271 px wide and buttons wrap to 2-3 lines

- Page / state: every Settings dialog; worst `pages-navigate-away-confirm`, `manuscript`, `delivery-profile-editor`, `marks-dialog`
- Widths: 390 (271 px wide, 60 px margins each side), 768 (538 px). (theme: both)
- What is wrong: "Discard & continue" breaks into three lines ("DISCARD / & / CONTINUE"), "Save & continue" into two, "Replace and reset" into two, and the title "Import Alice.docx . step 2 of 2" wraps; wide content (SET-2, SET-4) is cut. The viewport has a 16 px padding, so the dialog could use 358 px.
- Where: `apps/ui/src/components/primitives/Dialog.tsx:148-150` (`max-w-[70vw]` for the default size, plus `p-4` viewport on line 143).
- Severity: looks wrong
- Fix: `max-w-[min(70vw,..)]` replaced by a floor, e.g. `max-w-[max(70vw,calc(100vw-2rem))]` below 600 px, so small windows use the full width.
- Evidence: `settings/pages-navigate-away-confirm/w390.png` (footer buttons y~470-515); `settings/manuscript/w390.png` (footer "REPLACE AND RESET" 2 lines, y~725).
- Shared: Dialog primitive (all pages; the doc lists the 3-action confirm at 390 as known issue #150).

#### SET-4 Delivery profile editor table is cut off at 390 and 768

- Page / state: Delivery > Edit profile; `delivery-profile-editor`
- Widths: 390/reflow (Lowest/Highest/ACX columns mostly off-screen), 768 (the "ACX" reference column cut at the dialog edge) (theme: light)
- What is wrong: the rule table is 618 px wide in a 236 px (390) or ~500 px (768) scroll region with no visible scrollbar, so the limits a narrator is editing are hidden behind a hidden horizontal scroll; at 390 the "Lowest" input is clipped in half.
- Where: `apps/ui/src/components/settings/DeliveryProfileEditor.tsx:118` (`overflow-x-auto` table wrapper) with `min-w-[9rem]`/`min-w-[7.5rem]` cells (lines 141,159); narrow dialog from `Dialog.tsx:148`.
- Severity: looks wrong
- Fix: below ~600 px render each rule as a stacked card (toggle + name, then Lowest/Highest/ACX rows), or at least show the scroll cue.
- Evidence: `settings/delivery-profile-editor/w390.png` (y 355-690); `settings/delivery-profile-editor/w768.png` (right edge x~630).
- Shared: page-local (uses Table primitive).

#### SET-5 Selects and text boxes have six different widths; the doc says every select is the same width

- Page / state: all category states (`app`, `delivery`, `recording-found`, `appearance`, `project`, `pages`...)
- Widths: 1024-1920 (theme: both); at 390/768 the same widths are visible (e.g. select stops at x=301 of a 353 gutter at 390)
- What is wrong: selects measure 264 px (most), 260 and 247 (the two Delivery profile selects on one page), 303 (Microphone), 141 (Voice sample output), 85 (Zoom), and full column (Reader text Font, credits Templates); text boxes are 320, 416, 218 or full width. Right edges therefore form a ragged column in every card. The doc "Settings rows" says `choice` is "full width of its column, up to max-w-md, so every select is the same width".
- Where: `primitives/Select.tsx:37-48` (`fullWidth` defaults false, so width is the longest option); `settings/row/ValueControl.tsx:104` (`w-[16.5rem]`), `:175` (`w-80`/`w-[26rem]`); `settings/controls/DeliveryBodies.tsx:48` (`max-w-[260px]`); `controls/MicBody.tsx:59-63`, `controls/SampleOutputBody.tsx:132-136`, `controls/AppearanceBodies.tsx:81` (Zoom) leave the select at content width.
- Severity: looks wrong
- Fix: one shared field class (`w-full max-w-md`, `fullWidth`) used by every row control, as the doc specifies.
- Evidence: `settings/delivery/w1440.png` (selects ending x=1226 and x=1213); `settings/recording-found/w1440.png` (Microphone select x 966-1269); `settings/global-keyboard/w1440.png` (Zoom select x 966-1050, y~88); `settings/appearance/w1440.png` (Font select to x=1391 vs others to 1230).
- Shared: Select primitive default plus SettingRowView.

#### SET-6 Settings rows are two equal halves; tall controls leave the whole left half blank

- Page / state: `appearance` (Reader text), `global-keyboard` (Shortcuts), `recording-advanced` (Capabilities), `project-credits*` (Credits, up to ~2000 px tall), `delivery` (Delivery profile), `project` (Entry types), `pages-panel-open`
- Widths: 1024-1920 (theme: both). Probe `blank-space-in-column` lists these at all four wide widths.
- What is wrong: the label/meta column holds ~90-110 px of text while the control column is 360-2000 px tall, so a narrator sees a card with the left half empty beneath the label (e.g. Credits: label block ends y~795 while the editor runs to y~2800). The control column also starts at the card midpoint (x=966 at 1440, x=688 at 1024), not after a 12rem/16rem label column as the design-system "Settings rows" section describes, and the hint text is capped at 60ch so a gap opens between the two.
- Where: `apps/ui/src/components/settings/row/SettingRowView.tsx:49` (`CELL`: `@min-[761px]:grid-cols-2`, no label-column cap); doc layout is in `ScopedSetting.tsx` `ROW_CLASSES`.
- Severity: looks wrong
- Fix: use `grid-cols-[minmax(12rem,16rem)_minmax(0,1fr)]` (and let wide bodies span both columns, or put the label above them) as the doc says.
- Evidence: `settings/project-credits-retail-sample/w1440.png` (left half empty y 60-880); `settings/appearance/w1440.png` (Reader text y 560-900); `settings/recording-advanced/w1440.png` (Capabilities y 430-900).
- Shared: SettingRowView (every Settings row).

#### SET-7 Capabilities table is squeezed into the right half, one word per line at 390 and 1024

- Page / state: Recording & DAW > Advanced > Capabilities; `recording-advanced`, `recording-reaper-path-invalid`
- Widths: 1024 ("Compare / the / recording / with the / manuscript" 5 lines), 390 (same), 1440/1920 wraps to 3 lines; 768 fine (theme: both)
- What is wrong: a 3-column table (What / Setting / Now) lives in the 425 px control half, so the "What" cell wraps to 3-5 lines and row heights vary (74, 53, 52 px at 1440) while 500+ px sit empty on the left.
- Where: `apps/ui/src/components/settings/controls/CapabilitiesBody.tsx:61-100` (Table in the control column); cause is SET-6.
- Severity: looks wrong
- Fix: let this row's body span the full card width, or give the "What" column a `min-w-[12rem]` and put Now under the label.
- Evidence: `settings/recording-advanced/w1024.png` (x 690-990, y 480-760); `settings/recording-advanced/w390.png` (y 700-830).
- Shared: page-local.

#### SET-8 Models & downloads table: columns jump between states and a single action button is not right-aligned

- Page / state: `models`, `models-downloading`, `models-empty`, `models-failed`, `models-needs-repair`
- Widths: 1280-1920 table (below 1020 px container it becomes cards, which look consistent) (theme: both)
- What is wrong: the table is auto-layout, so the Status column starts at x=858 (models), 934 (models-empty), 715 (models-failed), 841 (needs-repair) at 1440, and the Name column wraps ("Open English WordNet 2025 (US English / dictionary)", "In use: Language model for the Story / Bible") while 100+ px sit unused in other columns. The action cell is `inline-flex` left-aligned in a `w-px` cell, so in states with a Retry+Dismiss or Repair+Remove pair, rows with one button have it at x~1344 while the pair's second button is at x~1384 and the all-single-button state ('models') has them at x~1384: the buttons do not share a right edge.
- Where: `apps/ui/src/components/settings/models/AssetRow.tsx:98-99` (`w-px whitespace-nowrap` + `inline-flex`, no `justify-end`/`text-right`); `page/ModelsPane.tsx:190` (Table without fixed column widths).
- Severity: looks wrong
- Fix: add `text-right`/`justify-end` on the action cell and fixed widths (`w-[26%]` etc.) on the Status and Used by columns.
- Evidence: `settings/models-needs-repair/w1440.png` (actions x 1326-1402, y 440-600); `settings/models-failed/w1440.png` (rows y 590-800); `settings/models/w1440.png` for comparison.
- Shared: Table primitive consumers; page-local layout.

#### SET-9 Shortcut rows: CHANGE button lands at a different x when the key chips wrap

- Page / state: Appearance & keys > Shortcuts; `global-keyboard`
- Widths: 1440 (also 1920/1280 by the same container width; 768 and 390 are consistent) (theme: both)
- What is wrong: in "Forward" the chips drop to a second line and the CHANGE button sits at x=1272-1342, while "Back" and "Open Settings" have it at x=1308-1378; the "Forward" label is also left of its chips on a different line than the button, so the row is two lines tall (93 px vs 61 px).
- Where: `apps/ui/src/components/settings/KeyboardPanel.tsx:261-271` (`flex flex-wrap items-center justify-between`; when the right group wraps it is alone on its line and aligned to the left, not the right).
- Severity: looks wrong
- Fix: add `ml-auto` (or `justify-end`) to the right-hand group so it stays right-aligned when wrapped.
- Evidence: `settings/global-keyboard/w1440.png` (Forward row y 655-720, CHANGE x=1272 vs 1308 above and below).
- Shared: KeyboardPanel (also shown on Script/Booth key help if reused).

#### SET-10 Inline shortcut-capture panel: its action buttons are cut by the nested scroller

- Page / state: `global-keyboard-conflict`, `global-keyboard-recording`
- Widths: 1440 (and the same container height at 1280/1920); 390 is not clipped (theme: both)
- What is wrong: the capture panel opens inside a `max-h-[32rem] overflow-y-auto` box, so "Replace / Try another key / Cancel" (conflict) and "Reset to default / Cancel" (recording) are sliced in half at the box's bottom edge (y~845) and a narrator has to scroll the inner box to reach the confirming button.
- Where: `apps/ui/src/components/settings/controls/ShortcutsBody.tsx:20` (`max-h-[32rem] overflow-y-auto`); panel from `KeyboardPanel.tsx:117-162`. The panel does not scroll itself into view.
- Severity: looks wrong
- Fix: scroll the capture panel into view when it mounts (or drop the max-height while capturing).
- Evidence: `settings/global-keyboard-conflict/w1440.png` (buttons y~820-847); `settings/global-keyboard-recording/w1440.png` (y~815-847).
- Shared: page-local.

#### SET-11 Delivery profile editor: labels, toggles and reference values sit 8 px above the input centres

- Page / state: `delivery-profile-editor`
- Widths: 1440, 768 (theme: light)
- What is wrong: cells are top-aligned, so e.g. in the RMS row the toggle and "RMS" label are centred at y=338, "-23 to -18 dBFS" at y=337, but the inputs and their units at y=346; "none" text sits at y=385 against input centre 393. Row heights vary 39/47/56 px (Sample rate row has no inputs and is 39 px).
- Where: `apps/ui/src/components/settings/DeliveryProfileEditor.tsx:141,159` (`valign="top"` cells, no input-height offset).
- Severity: looks wrong
- Fix: `valign="middle"` for all cells of the row (or give the text cells the control height line-height).
- Evidence: `settings/delivery-profile-editor/w1440.png` (rows y 320-690).
- Shared: page-local.

#### SET-12 Entry types: delete buttons do not share a column, colour select is out of line with the name box

- Page / state: Project > Story Bible > Entry types; `project`, `override`, `deep-link`, `pages-navigate-away`
- Widths: 1440 (container narrower than `@lg`); at 390 the delete button also sits at different x (theme: both)
- What is wrong: the delete button of "Character / 6 entries" is at x=1227-1259, "Place / 1 entry" at x=1213-1248 (the count text is shorter), the other rows (0 entries) at 1227-1259. The colour select starts at x=966 (under the swatch) while the name box starts at x=990, and the name box is 218 px while the "New type" box is 195 px.
- Where: `apps/ui/src/components/settings/page/StoryBibleTypesPanel.tsx:98` (count `ml-auto ... @lg:min-w-[70px]`; the 70 px min only applies at `@lg`), `:67-85` (swatch indent, `w-[100px] @lg:w-[130px]`, `max-w-[200px]` on New type, line 162).
- Severity: looks wrong
- Fix: give the count a fixed `min-w` at every width and `ml-auto`, align the colour select to the name box.
- Evidence: `settings/override/w1440.png` (rows y 395-870, trash at x 1241/1230); `settings/project/w1440.png`.
- Shared: page-local.

#### SET-13 Models filter tab "Speech to text" wraps to two lines at 390

- Page / state: every Models & downloads state at 390 (`models*`)
- Widths: 390/reflow (theme: light)
- What is wrong: the segmented control is full width and the "Speech to text" chip wraps inside the chip ("Speech to / text"), making that chip taller than the others.
- Where: `apps/ui/src/components/settings/page/ModelsPane.tsx:189` (`ToggleGroup look="segmented"` with `self-start`, chips not `whitespace-nowrap`; options in `registry/assets.ts` `ASSET_FILTERS`).
- Severity: looks wrong
- Fix: `whitespace-nowrap` on chips and let the group scroll or wrap as separate chips.
- Evidence: `settings/models/w390.png` (y~592).
- Shared: ToggleGroup primitive.

#### SET-14 "Check now" is always on its own row below the update buttons, even with 800 px free

- Page / state: App & updates; `about-update-available`, `about-update-ready`, `about-install-blocked`, `about-install-refused`
- Widths: all (1440: Download update 517-649, Release notes 661-776 on one line, Check now alone at y~773) (theme: both)
- What is wrong: two buttons share a line, the third drops to a second line leaving a ragged 48 px gap and an unbalanced block.
- Where: `apps/ui/src/components/settings/UpdatesPanel.tsx:145` and `:154` (two separate `flex flex-wrap` rows).
- Severity: looks wrong
- Fix: put Check now in the same wrapping row as the others.
- Evidence: `settings/about-update-available/w1440.png` (y 705-790); `settings/about-install-refused/w1440.png`.
- Shared: page-local.

#### SET-15 Import review: word counts do not form a column

- Page / state: Project > Replace manuscript > step 2 (`manuscript`); Production import review
- Widths: 1440 (theme: light)
- What is wrong: "1,862 words" ends at x=607 (rows with a Subtitle checkbox) while "1,410 words" and the others end at x=692, because the checkbox wrapper only renders on rows that have a subtitle; the section selects stay aligned (x 705-870) but the words and checkbox drift.
- Where: `apps/ui/src/components/production/ImportReview.tsx:188-201` (conditional `div.flex-none`), `:180-183` (words span).
- Severity: looks wrong
- Fix: reserve the checkbox slot (fixed-width empty cell) in every row, or place words in a fixed-width column.
- Evidence: `settings/manuscript/w1440.png` (rows y 400-600).
- Shared: ImportReview (also on: Production page import).

#### SET-16 Recording-check number inputs: different right edges and a wrapped info icon

- Page / state: Set on a page > Recording check rules > "Change it here for now"; `pages-panel-open`, `pages-navigate-away-confirm`
- Widths: 1440 (also visible at 390 where the input is full width) (theme: light)
- What is wrong: the number box is 448 px wide without a unit (x 802-1250) and 402 px with a unit (x 802-1204), so right edges differ row to row; the first label wraps and its (i) icon falls to its own line (537,559) while the others keep it inline. 3-digit values sit in 400 px boxes.
- Where: `apps/ui/src/components/settings/ScopedSetting.tsx:143-146` (label + `Tooltip` inline), `:150-162` (`flex-1` input beside an optional `flex-none` unit).
- Severity: looks wrong
- Fix: cap the input (`max-w-[12rem]`) so the unit does not change its width; keep the icon with the last word (`whitespace-nowrap` on the last word + icon).
- Evidence: `settings/pages-panel-open/w1440.png` (rows y 520-870).
- Shared: ScopedSetting (design-system "Settings rows" component).

#### SET-17 Retail sample selects cut the chapter name in mid-glyph

- Page / state: Credits editor > Retail sample; `project-credits-retail-sample`, `project-credits-retail-sample-refused`
- Widths: 1440 ("Chapter 3 - A Caucus-l"), 390 ("...Race and a Lon;" last letter half cut) (theme: light)
- What is wrong: the two-column grid of `fullWidth` selects (193 px at 1440) is too narrow for the chapter title, so which chapter is chosen cannot be read.
- Where: `apps/ui/src/components/settings/RetailSamplePanel.tsx:102-115` (`sm:grid-cols-2` with chapter select and line select side by side).
- Severity: looks wrong
- Fix: put each chapter select on its own full-width line and keep Start/End line next to it.
- Evidence: `settings/project-credits-retail-sample/w1440.png` (y 640-750); `settings/project-credits-retail-sample/w390.png` (y 650-810).
- Shared: page-local.

#### SET-18 Slider track is inset 9 px from its label and the select above it

- Page / state: Appearance & keys > Reader text; `appearance`, `reader-text`
- Widths: all (1440: track starts x=975 vs Font select/labels at x=966; ends 1382 vs 1391; 390: track 46-344 vs select 37-353) (theme: both)
- What is wrong: size/spacing/width sliders do not span the same width as the select and the preview box above and below them.
- Where: `apps/ui/src/components/primitives/Slider.tsx:68` (`Control` has `px-[9px]` so the thumb stays inside the box).
- Severity: polish
- Fix: pull the control out by `-mx-[9px]` (the thumb then sits on the label edge).
- Evidence: `settings/reader-text/w1440.png` (y 270-400); `.../w390.png` (y 395-520).
- Shared: Slider primitive (also on: Script text settings).

#### SET-19 Page header controls do not reach the card edges at 390

- Page / state: all states at 390
- Widths: 390/reflow (768 and wider are fine) (theme: both)
- What is wrong: search icon + 260 px box end at x=306, the "All / Changed / In this project" control ends at x=251, but the Category card and rows run to x=374, so the header block has three different right edges.
- Where: `apps/ui/src/components/settings/page/SettingsPage.tsx:216-218` (`w-[260px] max-w-full` search wrapper, `flex-wrap` group, no `w-full` at narrow).
- Severity: polish
- Fix: make the search wrapper `flex-1` and the segmented control `w-full` below `@min-[761px]`.
- Evidence: `settings/app/w390.png` (y 100-185).
- Shared: page-local.

#### SET-20 About card: 16 px top, 32 px bottom padding, and text at a different left edge from the rows

- Page / state: App & updates; all `about-*` and `app`, `save-failed`
- Widths: all (theme: both)
- What is wrong: the grey "Narration Studio / Updates" panels start 16 px under the card's top edge but end 32 px above its bottom edge (about-update-available: card y 451-835, panel ends 803); the panels' text starts at x=517 and the licence line at x=505, versus x=509 for the setting rows above; the card has no section heading while the rows above have "UPDATES"/"NOTIFICATIONS".
- Where: `apps/ui/src/components/settings/AboutPanel.tsx:12` (`mb-4`) and `UpdatesPanel.tsx:108` (`mb-4`) inside `controls/AboutSection.tsx:20` Panel; `text-sm p-3` instead of the row typography.
- Severity: polish
- Fix: drop both `mb-4`s and align padding to the row `px-5`.
- Evidence: `settings/about-update-available/w1440.png` (y 450-840).
- Shared: page-local.

#### SET-21 Credits summary: labels larger than the row title, badges at ragged x

- Page / state: Project > Narrator and Credits; `project`, `deep-link`, `project-data-confirm`
- Widths: 1440, 390 (theme: both)
- What is wrong: "Opening credits", "Closing credits" and "Retail sample" are bold ~17 px, bigger than the row's own title "Credits" (15 px), and their badges start at x=1094/1101 and "Not chosen" at 1077, so nothing lines up.
- Where: `apps/ui/src/components/settings/controls/CreditsBody.tsx:22-31` (inline `flex-wrap` summary with no fixed label width).
- Severity: polish
- Fix: label `text-sm font-semibold` with a fixed `min-w-[8rem]`, badge after it.
- Evidence: `settings/deep-link/w1440.png` (y 685-770).
- Shared: page-local.

#### SET-22 Voice: "Installed" / "No key saved" badges under radio options sit at the radio, not at the label

- Page / state: Voice & pronunciation > Show definitions from; `voice`, `voice-key-saved`
- Widths: 1440 (theme: light)
- What is wrong: badge + trash for the Local dictionary start at x=966 (the radio circle's left) while the option text is at x=992; "No key saved" likewise.
- Where: `apps/ui/src/components/settings/controls/DefinitionsBody.tsx:79-93` (badges rendered in the group's wrapper, not indented under the label).
- Severity: polish
- Fix: indent by the radio width (`pl-[26px]`).
- Evidence: `settings/voice/w1440.png` (y 590-680).
- Shared: page-local.

#### SET-23 Settings content is capped at 1180 px and left-aligned, so at 1920 the right 500 px is empty while the top bar spans the window

- Page / state: all, seen on `models-needs-repair`
- Widths: 1920 (1680 not captured) (theme: both)
- What is wrong: content ends at x=1412 but the top bar's search and REAPER chip run to x=1900.
- Where: `apps/ui/src/components/settings/page/SettingsPage.tsx:207` (`max-w-[1180px]`, no `mx-auto`).
- Severity: polish
- Fix: decide on centred or full width; check against other pages.
- Evidence: `settings/models-needs-repair/w1920.png`.
- Shared: page container (probably app-wide; other reviewers may list it).

#### SET-24 Loading state: page title sits 6 px lower than in loaded states

- Page / state: `loading`, `models-loading`
- Widths: 1440 (theme: light)
- What is wrong: the title is at y=180 instead of 174 and the description line is missing, so the layout moves when the data arrives.
- Where: `apps/ui/src/components/settings/page/SettingsPage.tsx:158-159`.
- Severity: polish
- Fix: reserve the description line height in the loading header.
- Evidence: `settings/loading/w1440.png` vs `.../app/w1440.png`.
- Shared: page-local.

#### SET-25 Row details: switch sits 7 px below the title in a changed row; Zoom meta takes three lines

- Page / state: `filter-changed` (Changed badge); `appearance` / `global-keyboard` (Zoom)
- Widths: 1440 (theme: light)
- What is wrong: with the Changed badge the title line is taller, so the switch (centre y=216) hangs below the title (y=209); in other rows they align (277 vs 278). Zoom's meta wraps to three lines ("This computer", "Used by ...", "Also set in ...") where Microphone's fits on one.
- Where: `apps/ui/src/components/settings/row/SettingRowView.tsx:98-102` (badge makes the first line taller), `:107` (meta `flex-wrap`, `UsedBy` is one inline-flex that wraps as a block).
- Severity: polish
- Fix: set a fixed first-line height for the label row; allow `UsedBy` links to wrap inline.
- Evidence: `settings/filter-changed/w1440.png` (y 195-225); `settings/appearance/w1440.png` / `.../global-keyboard/w1440.png` (Zoom, y 140-200).
- Shared: SettingRowView.

### Engine panel (slide-over and its dialogs)

#### ENG-1 Chapter links table is wider than the engine panel at 390 and cramped at 768/1024

- Page / state: engine / `chapter-link-confirmed`, `chapter-link-missing` (and the table at the foot of `default`).
- Widths: 390 (broken); 768 and 1024 (cramped); 1440 (wraps but readable); theme: light.
- What is wrong: the five-column table has no scroll wrapper and its content is wider than the panel at 390, so the panel body scrolls sideways (the cards are pushed off the left edge: "Chapter links" title at x=0, "RACK" for Track), chapter names break to one word per line ("Chapter 1 / — Down / the / Rabbit- / Hole"), "Open in Editing / Open in Proof" breaks per word, and the select and Confirm/Change/Clear column is cut off at the right edge. At 768/1024 "EDITING CHECK…" wraps to two lines in its button, "Not linked" wraps, and the last cell stacks "Chapter 1 + CHANGE" over "CLEAR" while unlinked rows stack select over CONFIRM (rows of unequal height).
- Where: `apps/ui/src/components/engine/ChapterLinksTable.tsx:91-145` (`Table` is `w-full`, `Table.tsx:18`, no overflow container, and the five cells have no min widths or stacked mobile layout). `apps/ui/src/components/primitives/SlideOver.tsx:78-80` (body is `overflow-y-auto`, so overflow becomes a sideways scroll).
- Severity: breaks use at 390 (actions unreachable without sideways scroll), looks wrong at 768-1440
- Fix: drop the Open/Editing-check columns into a second line under the chapter name below `md` (or wrap the table in `overflow-x-auto`), and make Change/Clear/Confirm one consistent cell.
- Evidence: `engine/chapter-link-confirmed/w390.png` (whole screen), `.../w768.png` (rows at y≈960-1010), `.../w1440.png` (Editing check button two-line at x≈1137-1226); `engine/chapter-link-missing/w390.png` (select cut at x≈385). Probe: `offscreen-left` on every panel card for the 390 states.
- Shared: page-local (the table), plus the SlideOver body

#### ENG-2 Dialogs are only 70% of the window wide, so their tables are cut off at 390

- Page / state: engine / `link-chapters-preview`, `link-chapters-success`, `link-chapters-conflict`, `create-regions-preview`, `create-regions-success` (also seen but fine: `render-config-*`, `chapter-tags-ready`, `cleanup-tools-idle`, `retake-lanes-list`). I did not view the `create-regions-empty`, `create-regions-error`, `link-chapters-error` states.
- Widths: 390 (273 px dialog), 768 (about 537 px) is cramped; theme: light.
- What is wrong: the dialog is `max-w-[70vw]` (273 px at 390, with about 58 px of empty backdrop each side) and its body is `overflow-x-hidden`, so wide tables are cut with no way to scroll. In Link chapters the "ITEMS TO STAMP" header reads "ITE / STAM" and the count column is gone; in the stamp list the STATUS column is cut ("Tex / cha…") and TEXT is not visible; in Create regions the END column is clipped and STATUS is unreachable. The Create-regions footer button wraps to three lines ("CREATE / 2 / REGIONS") next to the Experimental badge.
- Where: `apps/ui/src/components/primitives/Dialog.tsx:149` (`max-w-[70vw]` for every non-`full` dialog) and `Dialog.tsx:176` (`overflow-x-hidden` on the body). The tables are `LinkChaptersDialog.tsx`/`CreateChapterRegionsDialog.tsx`.
- Severity: breaks use (columns unreachable at 390)
- Fix: use `max-w-[calc(100vw-2rem)]` below `md` (70vw only from md up), and let the body scroll sideways (`overflow-x-auto`) or stack the table columns.
- Evidence: `engine/link-chapters-preview/w390.png` (header at x≈310), `.../link-chapters-success/w390.png` (STATUS at x≈310), `.../create-regions-preview/w390.png` (END clipped at x≈330, button at y≈717), `.../create-regions-success/w390.png`.
- Shared: `Dialog` (every dialog in the app at <=768)

#### ENG-3 Panel header title is squeezed to one letter per line when the action button is long

- Page / state: engine / every state that shows the "REAPER project" card (`default`, `sync-activity`, `rpp-picker`, `wrong-project`, `no-rpp`, `no-daw-link` ...), every dialog state behind the dimmed panel.
- Widths: 390; theme: light.
- What is wrong: the "REAPER project" title wraps mid-word ("REAPE / R / projec / t", four lines, header 130 px tall) because "LINK A DIFFERENT REAPER PROJECT FILE" does not wrap and takes the line.
- Where: `apps/ui/src/components/primitives/Panel.tsx:98` (title block `flex-1 min-w-0` has a zero flex basis, so the flex-wrap header never drops the actions to a second line) and `apps/ui/src/components/primitives/panelStyles.ts` (`PANEL_TITLE_CLASS` has `[overflow-wrap:anywhere]`, which lets the title break inside words). The button comes from `apps/ui/src/components/engine/EnginePanel.tsx:231-238`.
- Severity: looks wrong (the title is unreadable; the button still works)
- Fix: give the title block a basis (`flex-[1_1_8rem]`) so the actions wrap under it, and use `overflow-wrap:break-word` for card titles.
- Evidence: `engine/default/w390.png` (title at x≈36-83, y≈100-190), `.../rpp-picker/w390.png`, `.../wrong-project/w390.png`.
- Shared: `Panel`/`PanelHeader` (any card with a long action: also seen in Delivery/Settings cards that use `actions`; not verified on those pages)

#### ENG-4 Dialog description runs into the next element (no gap)

- Page / state: engine / `render-config-prefilled`, `render-config-success`, `chapter-tags-ready`, `create-regions-preview` (the two selects), `link-chapters-preview` (table starts 4 px under the text).
- Widths: all; theme: light.
- What is wrong: the muted description is followed immediately by the next control: "Output folder" label at y≈434 sits 6 px under the text at y≈414, then 19 px to its input; "Chapters from your last chapter render" is 8 px under the description; the Create-regions selects start 10 px under it.
- Where: `apps/ui/src/components/primitives/Dialog.tsx:178-182` (description has no bottom margin) and `apps/ui/src/components/primitives/Field.tsx:57` (`first:mt-3` only applies when the Field is the first child, so with a description above it there is no top margin).
- Severity: looks wrong (spacing; label looks like part of the paragraph)
- Fix: give the dialog description `mb-3` and drop `first:` from the Field margin.
- Evidence: `engine/render-config-prefilled/w1440.png` (y≈410-440), `.../chapter-tags-ready/w1440.png` (y≈354-374), `.../create-regions-preview/w1440.png` (y≈219-229).
- Shared: `Dialog` description + `Field`

#### ENG-5 Editing-check slide-over: segmented control labels wrap to two lines with unequal widths

- Page / state: engine / `editing-check-unmapped` (and any state that opens "Editing check…").
- Widths: 1440 (320 px panel) and 390; theme: light.
- What is wrong: "ITEMS ON THIS CHAPTER'S TRACK" and "THE RENDERED FILE" each wrap to two lines inside a tight control; the left segment is 172 px wide and the right one 112 px, with a 2 px gap, so they look uneven.
- Where: `apps/ui/src/components/editing/EditingCheckPanel.tsx:269-272` using `apps/ui/src/components/primitives/ToggleGroup.tsx:37` (inline-flex, fixed `h-[2.0625rem]`, content-width segments).
- Severity: polish
- Fix: make the segments equal width (`flex-1`) with shorter labels ("This track" / "Rendered file").
- Evidence: `engine/editing-check-unmapped/w1440.png` (x≈1139-1421, y≈143-178), `.../w390.png`.
- Shared: ToggleGroup (segmented variant)

#### ENG-6 Flush tables in a card inset 10 px, their card title and body text inset 16 px

- Page / state: engine / `default` (Tracks card), and the Link chapters, Create regions and stamp tables in dialogs.
- Widths: all; theme: light.
- What is wrong: the "Tracks" title is at x=772 but the table header "TRACK" is at x=766 and the right header "PLAYABLE ITEMS" ends at x=1410 against the title/button edge at 1405. In the dialogs the table text (x=245) is 10 px right of the paragraph above it (x=235) while the rule under each row runs to the full width.
- Where: `apps/ui/src/components/primitives/tableStyles.ts:12` (`TABLE_CELL_CLASS` `px-2.5`) with `Panel flush` (`EnginePanel.tsx:304`), against `panelStyles.ts` (header `px-4`).
- Severity: polish
- Fix: use `px-4` for first/last cells of a flush table so the text lines up with the title, and a negative margin on dialog tables.
- Evidence: `engine/default/w1440.png` (y≈630-670), `engine/link-chapters-preview/w1440.png` (y≈183-275).
- Shared: Table/Panel flush (also on Delivery profile card and Settings panes that use `Panel flush`; not checked there)

### App shell: navigation, top bar, jump menu, menus

#### SHL-1 Header overflows at 390 once the zoom chip shows: hamburger squeezed to 20 px, engine chip cut off

- Page / state: shell / `zoom-level`, `zoom-menu-open`. It applies to any narrow window where name, jump button, zoom chip and engine chip do not fit together (a long project name has the same effect).
- Widths: 390 (`w390`, `reflow`); theme: light (not checked in dark).
- What is wrong: with the 125% chip present the top bar is wider than the window, so the "Open navigation" hamburger shrinks to about 20x36 px (the probe reports `20x36`) and the engine chip is clipped at the right edge, with only a sliver (x≈380-390) visible.
- Where: `apps/ui/src/components/layout/AppShell.tsx:301-312` (project-name button sits in `TooltipTarget`, which renders an `inline-flex` wrapper with no `min-w-0`, `apps/ui/src/components/primitives/Tooltip.tsx:46`, so the `truncate`/`min-w-0` on the inner button never shrinks it). `AppShell.tsx:295` (the hamburger `IconButton` has no `flex-none`, so it gives way instead).
- Severity: breaks use (the engine chip opens the engine panel; the nav button is a 20 px target)
- Fix: give the `TooltipTarget` around the name `className="min-w-0"` (and `flex-none` on the hamburger) so the name truncates first.
- Evidence: `shell/zoom-level/w390.png` (hamburger at x≈12-32, chip at right edge) compared with `shell/engine-builtin/w390.png` (36 px hamburger, whole chip). Also `shell/zoom-menu-open/w390.png`. `main#main-content scrollW 402 > clientW 390` in the probe digest for these two states.
- Shared: top bar (every page at <=390 or at high zoom)

#### SHL-2 Jump menu search field jumps up and down as the list changes height

- Page / state: shell / `jump-menu-open`, `jump-menu-off-pages`, `jump-menu-back-enabled`, `zoom-menu-open`.
- Widths: all; theme: light.
- What is wrong: the dialog is centred vertically, so the field moves with every change in result count. At w1440 (900 px tall) the input sits at y≈272 with the command list, y≈166 after typing "go to" (11 rows), y≈418 after "> back" (1 row). At w390 it moves from y≈246 to y≈138 to y≈390.
- Where: `apps/ui/src/components/primitives/Dialog.tsx:143` (`Parts.Viewport` is `flex items-center justify-center`), used by `JumpMenu.tsx:210-217` (`headerless`).
- Severity: looks wrong (a command palette whose field moves under the pointer and the eyes)
- Fix: anchor the headerless dialog from the top (`items-start pt-[12vh]`) so the field keeps its place.
- Evidence: `shell/jump-menu-open/w1440.png`, `shell/jump-menu-off-pages/w1440.png`, `shell/jump-menu-back-enabled/w1440.png` (compare the input's y in the three).
- Shared: `Dialog` (headerless variant, used only by the jump menu)

#### SHL-3 Top bar insets are 20 px, page content is 16 px: crumb, project name and chips do not line up with the page

- Page / state: shell, every state (also every page).
- Widths: 768, 1024, 1280, 1440, 1920 at 20 px; below 768 the bar is 12 px against 16 px; theme: both.
- What is wrong: the "PROJECT" crumb starts at x=236 while the page title and cards start at x=232 (1440); at the right the engine chip ends at x≈1420 and the cards at x=1424 (1920: 1900 vs 1904). At 768 the hamburger starts at x=20 and content at x=16; at 390 the hamburger starts at x=12 and content at x=16.
- Where: `apps/ui/src/components/layout/AppShell.tsx:294` (header `px-3 md:px-5`, `max-md:gap-2`) against `AppShell.tsx:353` (the content area is `p-4`).
- Severity: polish (4 px, but it shows on every page)
- Fix: use the same gutter for the bar and the content (`px-4`), or change both together.
- Evidence: `shell/engine-builtin/w1440.png` (PROJECT at x≈236, "Production" at x≈232), `.../w1920.png` (chip right edge vs card right edge), `.../w768.png` (hamburger x≈20 vs "Production" x=16).
- Shared: AppShell header

#### SHL-4 Collapsed rail (below 1360 px) drops the Proof and Pickups count badges

- Page / state: shell / `engine-builtin` and every state at 1280, 1024 (and medium-only 1230, rail-only 1300).
- Widths: 1280, 1024 (and 1300, 1230); theme: both.
- What is wrong: at 1440 the rail shows "Proof 4" and "Pickups 3" pills, at 1280 and 1024 the same rows show only icons with no count or dot, so the open-pickups cue disappears on a normal laptop-width window.
- Where: `apps/ui/src/components/layout/AppShell.tsx:285` (`max-[1360px]:[&_button>span]:invisible` hides the pill span) and `apps/ui/src/components/primitives/NavButton.tsx:37-41` (comment: "wide rail only: the icon rail has no room"). The pill is still in the DOM.
- Severity: polish (documented as intended, but it is the only place the number shows)
- Fix: draw the count as a small dot or corner badge on the icon in the collapsed rail.
- Evidence: `shell/engine-builtin/w1440.png` (badges at x≈187, y≈488 and 530) vs `.../w1280.png` and `.../w1024.png` (no badge on the icons at y≈488/530).
- Shared: left rail

#### SHL-5 Project picker at 390: project names and paths are cut to a few letters

- Page / state: shell / `switch-project-open`.
- Widths: 390; theme: light. At 768 and 1440 the rows are fine.
- What is wrong: each row keeps Open + pin + remove (about 150 px of buttons) at the right, so the name shows as "Alice's Adventure…" and the path as "C:\Projects\Alic…", "Voltage and the U…": two projects whose names start alike could not be told apart. The date and icon are hidden below `sm`, which is what leaves room.
- Where: `apps/ui/src/components/project/ProjectPicker.tsx:266-282` (row is a single `flex items-center` with `min-w-0 flex-1 truncate` name/path next to the buttons; the name has a `title` only).
- Severity: looks wrong
- Fix: below `sm` wrap the three buttons under the name (the row as two lines) so the name and path get the full width.
- Evidence: `shell/switch-project-open/w390.png` (rows at y≈485-580).
- Shared: page-local

#### SHL-6 "Go to <page>" note from a locked rail item opens at the top-left, over the header, at 768 and 390

- Page / state: shell / `nav-off-note`.
- Widths: 768, 390 (at 1440 and 1024 it sits beside the item correctly); theme: light.
- What is wrong: the "Import a manuscript to unlock this page." note appears at x≈12-348, y≈0-54, on top of the hamburger/project name instead of beside a nav item.
- Where: `apps/ui/src/components/primitives/NavButton.tsx:80-82` (`Popover` anchored to the button). Below 860 px the only mounted copy of that button is inside the hidden `aside` (`AppShell.tsx:284`, `hidden ... min-[860px]:flex`); the drawer's copy only exists while it is open. Likely cause, and the capture driver may be pressing the hidden rail button, so a narrator using the drawer might not see this. Not confirmed.
- Severity: looks wrong (unconfirmed for the real drawer path)
- Fix: capture the drawer open with a locked item pressed to check where the note anchors; if it anchors, no fix is needed.
- Evidence: `shell/nav-off-note/w768.png` (note at the top-left), `.../w390.png`, against `.../w1440.png` (note beside "Proof").
- Shared: NavButton/Popover (also the cause of the coverage gap above: no drawer state)

#### SHL-7 Slide-over title bar is 60 px tall, the top bar next to it is 52 px

- Page / state: shell / `history-panel-open`; engine / every state (the engine panel and Editing check slide-over use the same header).
- Widths: 1440, 1024, 768 where the page bar stays visible beside the panel; theme: light.
- What is wrong: the panel's divider is at y≈63 while the top bar's is at y≈51, so the two header rules step by 12 px where they meet. The title ("Undo history", "Audio engine") also sits at y=32, 6 px lower than the project name at y=26.
- Where: `apps/ui/src/components/primitives/SlideOver.tsx:69` (`min-h-[3.75rem] ... py-[0.85rem]`) against `AppShell.tsx:294` (`h-13`). The Dialog header uses the same 60 px, so it is by design for dialogs only.
- Severity: polish
- Fix: size the slide-over header to the top bar (`h-13`) or let the panel start under the bar.
- Evidence: `shell/history-panel-open/w1440.png` (rules at x≈1100-1140, y≈51 vs y≈63), `engine/default/w1440.png`.
- Shared: SlideOver

#### SHL-8 Context-menu item "Find a page, chapter or command" wraps beside its shortcut

- Page / state: shell / `context-menu-open`.
- Widths: 1440, 768, 390, rail-only; theme: light.
- What is wrong: the label wraps to two lines next to the Ctrl F chord, so that row is 50 px against 34 px for the others and the chord floats at mid-height.
- Where: `apps/ui/src/components/primitives/ContextMenu.tsx:160` (`w-64` popup) with the item at `ContextMenu.tsx:54` (label `min-w-0 flex-1`); label text from `App.tsx:633`.
- Severity: polish
- Fix: shorten the label ("Find…") or widen the menu to `w-72`.
- Evidence: `shell/context-menu-open/w1440.png` (row at y≈144-164).
- Shared: ContextMenu

#### SHL-9 Jump menu: input text starts 9 px right of the row text

- Page / state: shell / `jump-menu-open` and the other jump-menu states.
- Widths: all; theme: light.
- What is wrong: placeholder/typed text starts at x≈238 (w1440), the group heading and row labels at x=229; the input box edge is at x=225, 8 px in from the rows' left edge at 217.
- Where: `apps/ui/src/components/layout/JumpMenu.tsx:160` (`p-2` around the field, then the field's own padding) against `apps/ui/src/components/primitives/Listbox.tsx:76` and `:102` (`px-3` rows and headings).
- Severity: polish
- Fix: match the field's text inset to the rows (`px-3` on the field or `p-0` around it).
- Evidence: `shell/jump-menu-open/w1440.png` (text at x≈238 vs "COMMANDS" at x≈229).
- Shared: page-local

#### SHL-10 Engine chip and zoom chip are 22 px tall buttons

- Page / state: shell, every state (engine chip on every page; zoom chip in `zoom-level`).
- Widths: all; theme: both. At 390 the engine chip is a dot of about 20x22 px.
- What is wrong: the clickable chip (opens the engine panel / zoom commands) is 22 px high (probe: `67x22`, `51x22`), under the 24 px minimum hit size, next to a 32 px Jump button.
- Where: `apps/ui/src/components/primitives/HeaderChip.tsx:74-75` (`h-[1.375rem]`), `apps/ui/src/components/layout/EngineChip.tsx:76-84`.
- Severity: polish
- Fix: keep the 22 px look but add a transparent hit area to 32 px (or make the chip `h-8` and draw an inner pill).
- Evidence: probe digest `digest:shell.txt` lines `button.inline-flex.h-[1.375rem]`; `shell/engine-builtin/w390.png` (dot at x≈367, y≈26).
- Shared: HeaderChip

#### SHL-11 At exactly 1360 px the rail is 216 px wide with its labels hidden (from source, not from a screenshot)

- Page / state: shell, every page at a window width of 1360.
- Widths: 1360 only; theme: both. No screenshot exists at 1360, so I have not seen it.
- What is wrong: the rail width rule uses `min-[1360px]:w-54` (full rail from 1360), while the label-hiding rules use `max-[1360px]` (collapsed up to and including 1360), so at 1360 both apply: a full-width rail whose labels, group headings and brand name are hidden.
- Where: `apps/ui/src/components/layout/AppShell.tsx:284-285` (`max-[1360px]:[&_button]:text-[0px]`, `[&_.section-label]:text-transparent`, `[&_.brand-name]:invisible`). `apps/ui/src/components.css:16` correctly uses `max-width: 1359px`, and the design doc says "below 1360".
- Severity: looks wrong (one width only; unconfirmed visually)
- Fix: change the `max-[1360px]` variants to `max-[1359px]`.
- Evidence: none; source only.
- Shared: left rail

#### SHL-12 Dark theme: the "Light theme" sun icon looks like a second gear next to Settings

- Page / state: shell / `engine-builtin`, `nav-off-note` (dark, all widths).
- Widths: 1440 and 1024 dark; theme: dark.
- What is wrong: in dark the theme item uses a sun with short rays that renders like a gear at 20 px, directly above the Settings gear, so the two rail-foot icons read as the same icon.
- Where: `apps/ui/src/components/layout/AppShell.tsx:252` (`iconFor('themeLight')`), icon defined in `icons.catalog`.
- Severity: polish
- Fix: use a clearly different sun glyph (e.g. circle with longer rays) for `themeLight`.
- Evidence: `dark:shell/engine-builtin/desktop.png` (icons at x≈29, y≈826 and 868), `.../small-desktop.png` (x≈32, y≈707 and 749).
- Shared: left rail

### Project picker

#### PRJ-1 Project picker at 390: project name and path are truncated to a few characters because three buttons take half the row

- Page / state: project / picker-pinned, picker-no-recents, picker-daw-running, picker-removed
- Widths: 390 (title "Voltage and the U...", path "C:\Projects\Volt..."; Open + pin + remove occupy x=198-349 of a 340px row; the date and the book tile are hidden) (theme: both)
- What is wrong: the identifying part of the name and folder is cut off while the actions keep full size.
- Where: `apps/ui/src/components/project/ProjectPicker.tsx:266-290` (row `flex items-center gap-3`, text `min-w-0 flex-1 truncate`, buttons `flex-none`).
- Severity: looks wrong
- Fix: below sm let the actions wrap to a second line under the text (or let the title wrap to two lines).
- Evidence: `project/picker-pinned/w390.png` (rows y=462-603), `.../picker-daw-running/w390.png`.
- Shared: page-local

#### PRJ-2 New Project dialog at 390: the default folder path breaks mid-word

- Page / state: project / new-project-dialog
- Widths: 390 ("C:/Users/Mock/Narrat / ionStudio" across two lines) (theme: both)
- What is wrong: the monospace path wraps anywhere, so "NarrationStudio" is split in two.
- Where: `Dialog.tsx:176` (`break-words` on the whole body) with the path rendered in `NewProjectDialog.tsx` without a no-break rule.
- Severity: polish
- Fix: `[overflow-wrap:anywhere]` only on the path with a `<wbr>` after each `/`, or `break-all` scoped to the path.
- Evidence: `project/new-project-dialog/w390.png` (y=445-485).
- Shared: Dialog primitive body rule

#### PRJ-3 Project picker content re-centres between states, so the heading jumps

- Page / state: project / picker-empty, picker-pinned, picker-removed, picker-daw-running, picker-no-recents
- Widths: 1440 (logo at y=260 with two rows, 296 with one row, 219 with the DAW banner); 390 (logo at y=202 vs 246) (theme: both)
- What is wrong: the column is vertically centred in the viewport, so adding or removing a row or banner moves the logo and heading by 20-40px; at 390 the toast stack (x=20-370) is also inset 4px from the content edge (x=24-366).
- Where: `ProjectPicker.tsx:198` (`flex min-h-full ... flex-col justify-center`); toast container `apps/ui/src/components/primitives/Toast.tsx:88` (`right-[calc(1.25rem...)]`).
- Severity: polish
- Fix: top-align with a fixed top offset (about 20vh), and align the toast gutter with the page gutter.
- Evidence: `project/picker-removed/w1440.png` (logo y=296) vs `.../picker-empty/w1440.png` (y=260), `.../picker-no-recents/w390.png` (toasts at y=683-796).
- Shared: page-local (toast inset is shared)

### Cross-page

#### GLB-1 KPI tiles on Production: hover fill and click target stop short of the tile

- Page / state: global / tooltip (Production page, "Finished audio" tile hovered)
- Widths: 1440 (hover fill x=233-399 of a tile spanning x=233-431), 390 (fill x=17-183 of a tile spanning x=17-195) (theme: light; not checked in dark)
- What is wrong: the tile's `size-full` button measures against the tooltip wrapper span, which is only as wide as its content, so the hover colour (and the click/hover region, and the tooltip anchor) covers the text, not the whole tile; the right 32px and the bottom of each tile do nothing.
- Where: `apps/ui/src/components/production/overview/KpiRow.tsx:24-33` (`<TooltipTarget text={tip}>` with no `className`) around `className="block size-full ..."`; `primitives/Tooltip.tsx:46` makes the trigger `inline-flex`. `CheckCountsCard.tsx:19` passes `className="w-full"` for the same reason.
- Severity: looks wrong
- Fix: `<TooltipTarget text={tip} className="size-full">` (add `h-full w-full`).
- Evidence: `global/tooltip/w1440.png` (tile at y=179-282), `.../tooltip/w390.png` (y=227-340).
- Shared: TooltipTarget used as a wrapper around a `size-full` child; other TooltipTarget callers may have the same issue (not audited here). Production page belongs to another reviewer.

#### GLB-2 Panel title crushed beside a wide action (seen on Proof at 390)

- Page / state: global / toast (Proof > Compare the recording with the script)
- Widths: 390 (title "Comp / are / the / recor / ding / with / the / script" in a 62px column, step strip 288px wide at x=93-357) (theme: light)
- What is wrong: the title wraps one word or half-word per line (even mid-word) because the step strip takes the line.
- Where: `apps/ui/src/components/primitives/Panel.tsx:97` and `panelStyles.ts:8` (same cause as SB-1); actions passed at `apps/ui/src/components/proof/CompareRun.tsx:306-324`.
- Severity: breaks use (title unreadable)
- Fix: same as SB-1 (basis for the title group so the actions wrap beneath it).
- Evidence: `global/toast/w390.png` (y=60-275).
- Shared: Panel header (also on: any Panel with a wide `actions` slot; storybible, see SB-1)

#### GLB-3 Toast stack inset is 20px while page gutters are 16px or 24px

- Page / state: global / toast; project / picker-no-recents
- Widths: 390 (toast x=146-370 with page content edge at x=374 on Proof, x=366 on the picker) (theme: both)
- What is wrong: toasts do not align with the page's right edge at narrow widths (4-8px off either way).
- Where: `Toast.tsx:88` (`right-[calc(1.25rem+...)]`) versus the page gutter `p-4` or `p-6`.
- Severity: polish
- Fix: use the page gutter token for the toast offset.
- Evidence: `global/toast/w390.png`, `project/picker-no-recents/w390.png`.
- Shared: Toast container

#### SHARED-1 Slider track is inset 9px from the labels and neighbouring controls (Editing drawer, Script text settings)

- Page / state: editing `drawer-effects-inspector`; script `text-settings`
- Widths: 1440, 390 (light).
- What is wrong: the Gain slider's track runs x=1078-1386 while its label starts at x=1069 and its value ends at x=1370/1395; the text-settings sliders run x=701-985 against a select at x=691-995.
- Where: `apps/ui/src/components/primitives/Slider.tsx:68` (`BaseSlider.Control ... px-[9px]`).
- Severity: polish
- Fix: pull the control out with `-mx-[9px]` so the thumb centre, not the track end, lands on the content edge, or accept as thumb overhang.
- Evidence: `editing/drawer-effects-inspector/w1440.png` (y=597), `script/text-settings/w1440.png` (y=261, 321, 380).
- Shared: Slider primitive.

## Top 20

Ranked by severity first, then by how many pages the cause reaches, then by how likely a narrator is to meet it at a width the app supports (768 px and up counts more than 390 px). A row that merges findings lists every ID.

| # | Findings | Where | Widths | What is wrong | Severity | Fix |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | SB-1, GLB-2, PRC-1, ENG-3 | `Panel.tsx:97`, `panelStyles.ts:8,20` (every `PanelHeader` with an `actions` slot) | 390, 768 | The title block has a zero flex basis next to a wide action group, so the title breaks one letter per line (Story Bible entry Name input 8 px wide, Proof "Compare…" title, engine "REAPER project"). | breaks use | Give the title block a real basis (`flex-[1_1_12rem]`) so actions wrap under it; use `overflow-wrap: break-word` for titles. |
| 2 | PRD-5, SET-3, SB-9, BTH-4, ENG-2, PRD-17 | `Dialog.tsx:148-150` (every non-`full` dialog) | 1920, 1440, 390 | `max-w-[70vw]`: a one-line confirm is 1,006 px wide at 1440 and 1,342 px at 1920, and 271 px at 390 where buttons wrap to 2–3 lines and tables are clipped. | looks wrong (breaks use for tables at 390) | A size scale (`sm` 28 rem for confirms, `md` 36 rem for forms) capped at `100vw - 2rem`. |
| 3 | SHL-1 | `AppShell.tsx:295,301-312`, `Tooltip.tsx:46` | 390 | With the zoom chip showing, the hamburger shrinks to 20 px and the engine chip is clipped, because the `TooltipTarget` around the project name has no `min-w-0`. | breaks use | `min-w-0` on that wrapper, `flex-none` on the hamburger. |
| 4 | MST-1 | `MasterToSpecPanel.tsx:119`, `TextField.tsx:49` | 390 | "Title for Chapter 0N.wav" inputs collapse to 35 px (suite failure). | breaks use | Floor the cell (`min-w-[10rem]`) so the table scrolls with a usable input. |
| 5 | MST-2 | `FilesTable.tsx:163` | 390 | The File column breaks one or two characters per line in 24 of 26 Master states. | breaks use | `min-w-[10rem]` and `break-word` instead of `anywhere`. |
| 6 | PRD-2 | `RecordingCheckReport.tsx:106` | 768–1920 | Four stat tiles in a 320 px slide-over (`sm:grid-cols-4` follows the viewport): labels collide, "27 of 42" wraps to three lines, "155/min" is clipped. | breaks use | Two columns, or a container query on the panel. |
| 7 | PRD-1, SET-2, SET-15, PRD-11 | `ImportReview.tsx:155-215` | 390, 768 | One non-wrapping row per chapter: the chapter name gets 0 px at 390, the select is cut off, and word counts do not form a column. | breaks use | Wrap or stack the row below ~40 rem; reserve the Subtitle slot. |
| 8 | ENG-1 | `ChapterLinksTable.tsx:91-145`, `SlideOver.tsx:78-80` | 390 (cramped 768, 1024) | The Chapter links table is wider than the engine panel; the panel scrolls sideways and the Confirm column is off-screen. | breaks use | Stack Open/Editing-check under the name below `md`, or scroll the table. |
| 9 | SET-1 | `ValueControl.tsx:175`, `SettingRowView.tsx:113,118` | 390, 1024 | The REAPER program box is 416 px wide inside a narrower card and runs off the window; the page scrolls sideways. | breaks use | Field wrapper `w-full min-w-0`, box `w-full max-w-[26rem]`. |
| 10 | PRD-3 | `pipeline/PageHeader.tsx:109` | 390 | While the stage timer runs, the header action group (`flex-none flex-wrap`) never wraps, so Start session is cut off and the page scrolls sideways. | breaks use | Drop `flex-none`; give the group `min-w-0`. |
| 11 | EDT-1 | `editing/page/NoAudioBanner.tsx:19-22` | 390 | The banner text gets about 60 px, one word per line, and fills the card so the script is unreachable. | breaks use | `basis-full` on the message so link and button wrap beneath. |
| 12 | EDT-2 | `editing/takes/TakeChip.tsx:57-65`, `Paragraph.tsx:37` | 390 | The takes chip (about 320 px) overflows a 205 px text column and is clipped; it is how takes are opened. | breaks use | `max-w-full`; stack the time gutter above the text. |
| 13 | PRF-1 | `proof/notes/NotesPanel.tsx:192-210` | 390 | Opening Find pushes the notes toolbar past the card edge; the other buttons go off-screen. | breaks use | `flex-wrap`; make the field `min-w-0 flex-1`. |
| 14 | PRC-2 | `proof/NativeTakesPanel.tsx:157,167` | 390 | An unassigned take's name truncates to "T" because the select and Assign button take the row. | breaks use | `min-w-[6rem]` on the name so the controls wrap. |
| 15 | BTH-1 | `booth/record/RecordSetup.tsx:27`, `BoothFooter.tsx:77-105` | 390 (768 tight) | Setup notice plus footer leave the teleprompter 70–100 px tall; the line being read sits under the fade. | breaks use | Collapse the notice below `md`; give the text pane a minimum height. |
| 16 | BTH-2 | `Toast.tsx:88`, `Dialog.tsx:145-150` | 390 | A toast raised under a dialog covers its Cancel and Download model buttons. | breaks use | Queue toasts while a modal is open, or lift the region above the dialog. |
| 17 | SET-6, SET-5, SET-7 | `SettingRowView.tsx:49`, `ValueControl.tsx:104,175` | 1024–1920 | Settings rows are two equal halves, so tall controls (Credits, Capabilities, Shortcuts, Reader text) leave the whole left half blank; selects and text boxes come in six widths. The design system describes a 12–16 rem label column instead. | looks wrong | `grid-cols-[minmax(12rem,16rem)_minmax(0,1fr)]`; one shared field width. |
| 18 | SCH-1, DLV-2, DLV-4, SET-9 | `ContractPanel.tsx:53-80`, `LimitRow.tsx:43-55`, `KeyboardPanel.tsx:261-271` | 390–1920 | Label-left, control-right rows built with `justify-between`: the "Paid" select starts 62 px right of the "Amount" input, and a wrapped control falls to the left edge. | looks wrong | A label/control grid with one control column; `ml-auto` on wrapping groups. |
| 19 | GLB-1 | `production/overview/KpiRow.tsx:24-33`, `Tooltip.tsx:46` | 390–1440 | The KPI tile's hover fill and click area stop 32 px short of the tile's right edge (the wrapper is content-width). | looks wrong | `className="size-full"` on the `TooltipTarget`. |
| 20 | MST-4, PRD-9 | `MasterPage.tsx:210-211,310`, `ProductionPage.tsx:422` | 1280–1920 | Blank space beside a taller neighbour: Master's right column stops after two panels and leaves 390–460 px bare; Production's cards stretch but their bodies do not, leaving a floating legend band. | looks wrong | Sticky aside; `fill` on `Panel` and `overflow-hidden` on its frame. |

Near misses (looks wrong, not in the 20): DLV-1 (Delivery cards 15 px wider than the page at 390), PRD-12 (slide-over close button squeezed to 22–28 px wide), EDT-6 (Editing's card is 33 px from the rail, Script's 16 px), EDT-4 (Editing legend clipped mid-chip), SB-8 (Story Bible footer not pinned), SB-13 and PRC-7 (tables whose columns jump between read and edit states), SHL-2 (jump-menu field moves as results change).

## Fixes that apply across many pages

| # | Shared cause | Where | Findings it explains | Suggested fix |
| --- | --- | --- | --- | --- |
| A | `PanelHeader` title has `flex-1 min-w-0` with a zero basis and `[overflow-wrap:anywhere]`; the header grows to its tallest action (a 36 px icon button makes it 59 px against 50 px) | `Panel.tsx:97`, `panelStyles.ts:8,10,20` | SB-1, GLB-2, PRC-1, ENG-3, PRD-8, MST-8, DLV-5, PKP-4 | Title basis; one header min-height for panels in a row; `overflow-hidden` on the frame (also PRD-9, PRF-12, PKP-5). |
| B | `Dialog`: `max-w-[70vw]` for every non-`full` size; body `overflow-x-hidden`; footer `px-4` against header and body `1.1rem` (about 1.6 px overhang); description has no bottom margin; headerless dialogs are vertically centred; a lone footer button defaults to the left | `Dialog.tsx:143,148-150,163,176,178-184,195` | PRD-5, PRD-6, PRD-17, PRD-19, PRD-21, SET-3, SB-9, SB-10, SB-11, BTH-4, ENG-2, ENG-4, SHL-2, SCH-6, MST-9, SCR-14 | A size scale, a wrapping footer, one horizontal padding, `mb-3` on the description, `actionsAlign="end"` for one action. |
| C | `Select` is `--control-height` (40.8 px); `TextField` `md` is `h-9` (36 px); `Button` and `IconButton` are 36 px | `Select.tsx:48`, `TextField.tsx:13` | SCH-2, DLV-3, PRD-23, PRF-8 (and the Master to-spec row) | One control-height token for `Select` and `TextField`; use it for buttons in a row with them. |
| D | `Table`: auto layout and no column API, cells `px-2.5` inside panels padded `px-4`, default mid-row `valign`, `min-w` tables with no scroll cue, first columns with `overflow-wrap:anywhere` | `Table.tsx`, `tableStyles.ts:12` | MST-1, MST-2, MST-5, MST-10, MST-11, DLV-6, ENG-1, ENG-6, PRF-3, PRF-9, PRC-3, PRC-7, PKP-1, SB-12, SB-13, SET-8 | Column widths (or `colgroup`) and a `valign` prop default; flush-panel first/last cell `px-4`; the `scroll-x-edges` cue on every scroll box; a stacked-card layout below `md`. |
| E | Label/control rows written as `flex justify-between` or `flex-wrap` plus a `flex-1` spacer: a wrapped group falls to the left edge and controls share no column | many (62 files use `justify-between`) | SCH-1, DLV-2, DLV-4, DLV-8, SET-9, SB-14, PRF-7, PKP-4, BTH-3, BTH-12 | `ml-auto` on the trailing group; a two-column grid for label/control forms (`SettingRowView`, `ScopedSetting`, `ContractPanel`, `LimitRow`). |
| F | `Slider` track has `px-[9px]` so it is inset from the label, value and select above it | `Slider.tsx:68` | SET-18, BTH-15, SHARED-1 | `-mx-[9px]` on the control. |
| G | Hit areas: `HeaderChip` is 22 px tall, the toast close is 17x20 px, the BTH-5 ribbon is painted larger than its button | `HeaderChip.tsx:21`, `Toast.tsx:72` | SHL-10, BTH-13, BTH-5 | Pad the hit area to 24 px or more without changing the look. |
| H | Icon buttons that give way instead of holding their size | `SlideOver.tsx:73`, `AppShell.tsx:295` | PRD-12, SHL-1 | `flex-none` on icon buttons in header rows. |
| I | Wrappers that do not pass layout to the child: `TooltipTarget` is `inline-flex` and content-width | `Tooltip.tsx:46` | GLB-1, SHL-1 | Accept a `className` at each caller or default to `min-w-0`; audit other `TooltipTarget` callers around full-size children. |
| J | Page gutters and widths differ: top bar 20 px against content 16 px; Editing 33 px; `LoadError` centred at 720 px; Proof chapter capped at `max-w-7xl`; Settings capped at 1180 px and left-aligned; Booth text 28 px, notice 20 px; toast inset 20 px | `AppShell.tsx:294,353`, `EditingBody.tsx:496`, `LoadError.tsx:56`, `ProofChapterPage.tsx:132`, `SettingsPage.tsx:207`, `BoothText.tsx:214`, `Toast.tsx:88` | SHL-3, EDT-6, EDT-5, PRD-18, PRF-13, PRC-4, SET-23, BTH-10, BTH-16, GLB-3 | Decide one page gutter and one max-width rule, then apply it in the shell. |
| K | Loading skeletons do not mirror the loaded layout, so the page jumps | `ProductionSkeleton.tsx`, `BoothSkeleton.tsx`, `ScheduleSkeleton.tsx`, `SettingsPage.tsx:158`, `ProofSkeleton.tsx` | PRD-25, BTH-6, SCH-4, SET-24, EDT-15, PRF-5, SB-17 | Build each skeleton from the page's own grid classes. |
| L | `ToggleGroup` default look is a plain `flex` row (no gap, no wrap); the segmented look is `inline-flex` | `ToggleGroup.tsx:35-37` | PRD-14, ENG-5, SCR-6, SET-13 | Default `gap-1.5 flex-wrap` and `whitespace-nowrap` on chips. |
| M | `KeyHints` wraps with a centred orphan row; `ChapterStepper` derives its width from the data and glues the caret to the label | `KeyHints.tsx:20`, `ChapterStepper.tsx:66-71` | EDT-16, PKP-2, PKP-3 | Left-align the hints; fixed minimum width and a separate caret. |

### Tokens and spacing

- `docs/design/design-system.md` says new and touched code should converge on `--space-*` (`--space-1` to `--space-6`, `apps/ui/src/styles.css:226-231`). No component references them: a search of `apps/ui/src` outside tests and stories finds the six definitions and no use.
- `apps/ui/src/components` holds 607 arbitrary pixel or rem values in class names (excluding stories and tests), 91 of them for padding, margin or gap. The most repeated are `px-[1.1rem]` (7), `px-[0.55rem]` (6), `py-[0.6rem]` (5), `p-[1.1rem]` (5) and `gap-[0.625rem]` (5). `1.1rem` is `--space-6`, so `Dialog` writes the token's value as a literal, and its footer then uses `px-4` instead (the 1.6 px overhang, PRD-21).
- Several findings are token drift made visible: 20 px bar insets against 16 px content (SHL-3, BTH-10), `Editing`'s extra `px-4` (EDT-6), 10 px table cells in 16 px panels (ENG-6, PRF-9, SB-12), and 3 px, 8 px and 9 px one-off insets (EDT-7, SET-18).
- The design system's "Settings rows" section describes `ScopedSetting.tsx` (12–16 rem label column, every select the same width), but the Settings page draws its rows with `settings/row/SettingRowView.tsx` (two equal columns). The doc and the page disagree (SET-5, SET-6); one of them needs to change.

## Screenshots

Cropped light captures for the worst findings, each under 30 KB. Others can be regenerated with `pnpm --dir apps/ui visual:page <page>`.

| Finding | Image |
| --- | --- |
| SB-1, GLB-2 (Panel header collapse), `storybible / alias-pronunciation-editing`, 390 px | ![Story Bible entry header at 390 px: the Name input has disappeared and the kind and review pills run one letter per line](alignment-audit/sb-entry-header-390.png) |
| PRD-5 (Dialog width), `production / chapter-remove-confirm`, 1920 px | ![A one-line remove confirmation drawn 1,342 px wide at 1920 px](alignment-audit/dialog-70vw-1920.png) |
| SHL-1, `shell / zoom-level`, 390 px | ![Top bar at 390 px with the hamburger squeezed and the engine chip clipped at the right edge](alignment-audit/shl-topbar-390.png) |
| MST-1, `master / to-spec-picked`, 390 px | ![Master to spec at 390 px with the Title inputs collapsed to a sliver](alignment-audit/mst-title-inputs-390.png) |
| PRD-2, `production / recording-check-incomplete`, 1440 px | ![Recording check slide-over with four stat tiles crushed: PARAGRAPHS and AUDIO labels touch, 27 of 42 wraps, 155/min is clipped](alignment-audit/prd-recording-check-tiles-1440.png) |
| PRD-3, `production / on-pace`, 390 px | ![Production header at 390 px with the Start session button cut off at the right edge](alignment-audit/prd-header-timer-390.png) |
| EDT-1, `editing / unlinked`, 390 px | ![Editing no-audio banner at 390 px with its text one word per line](alignment-audit/edt-banner-390.png) |
| SET-1, `settings / recording-advanced`, 390 px | ![Settings REAPER program text box running past the card and the window edge](alignment-audit/set-reaper-input-390.png) |
| PRF-1, `proof / find-open`, 390 px | ![Proof notes toolbar with Find open, pushed past the card edge](alignment-audit/prf-notes-toolbar-390.png) |
| SCH-1, `schedule / on-pace`, 1440 px | ![Schedule Contract card: the Paid select and Amount input start at different x](alignment-audit/sch-contract-1440.png) |

## Appendix: reviewer coverage notes

Each reviewer wrote down what they opened. The notes are kept as written; they are the authoritative list of what was and was not looked at.

### Production (coverage)

- Page `production`, 56 state directories in `production` (the brief says 54; the directory has 56).
- Light, w1440 and w768 and w390: viewed every state except these, which I viewed at w1440 and w390 only (not w768): recording-check-never, recording-check-pickups, recording-check-refused, recording-check-model-required, recording-check-recheck-model-required, recording-check-running, recording-check-stale, recording-check-complete, recording-check-incomplete, stage-evidence-recommended, stage-evidence-not-ready, stage-evidence-unknown, editing-check-* (all 8 at w1440; only complete-candidates at w390), credits-closing-not-set-up (w1440 only), daw-not-linked (w1440 only), manuscript-candidate-offer (w1440 only), import-review-collapsed/-repaired/-subtitles-off (w1440 only), import-confirm-markdown (w1440 only), credits-setup-dialog-narrator-default (w1440 only), recording-check-options (w1440 and w390). Those states share their component with a state I did view at the other widths, so I treated them as skimmed.
- w1920, w1280, w1024: at-risk (all three), on-pace (w1024, w1280), import-confirm (w1024, w1920), chapter-removed-list (w1024, w1280), chapter-remove-confirm (w1920), report-dialog (w1920). The other states were not viewed at these widths.
- Dark (`shots-a/dark`): at-risk desktop and tablet, recording-check-complete desktop, import-confirm desktop, credits-panel desktop. No dark-only defect found; every defect below that I saw in dark also shows in dark.
- All screenshots are viewport-sized (not full page), so the lower half of Production (chapter pipeline, Next up, Recorded vs plan) is only seen in the scrolled states (chapter-removed-list, credits-closing-not-set-up, recording-check-running, editing-check-running) and in the 1920 shot.
- Observations about the import states: they are captured on the Settings page (Settings is the page behind the dialog), not on Production. I audited the dialogs themselves.
- live-updates-degraded at w390: the notice toast is not visible in the shot (it is at w1440). I could not tell whether it is off-screen or has already faded, so I report nothing on it.
- The probe lines `button-label-wraps` for the icon rail at w1024/w1280 are the rail's collapsed labels (clipped, intentional); not reported. Other probe `clipped-x` lines on `sr-only` nodes are false positives.

### Settings (coverage)

- Page `settings`, 68 states. Light, w1440: I viewed every state's PNG (about-*, app, appearance, deep-link, delivery*, filter-*, folded-category-list, global-keyboard*, import-choose, loading, manuscript, marks-dialog, models*, override, page-top, pages*, project*, reader-text, recording-*, save-failed, search-*, speech*, unreadable, voice*). page-top and folded-category-list are visually identical to recording-linked at 1440.
- w390 (and reflow, which is the same size): viewed app, appearance, delivery, delivery-profile-editor, models, models-needs-repair, project, recording-found, recording-reaper-path-invalid, recording-advanced, global-keyboard, global-keyboard-recording, reader-text, pages-panel-open, pages-navigate-away-confirm, voice, override, deep-link, project-credits-retail-sample, manuscript, marks-dialog, about-update-available. SKIMMED/NOT viewed at 390: the other about-*, models-* (rest), speech*, recording-* (rest), filter-*, search-*, save-failed, unreadable, loading, delivery-profile-custom, project-credits*, project-data-confirm, voice-key-saved, import-choose, global-keyboard-conflict. The 390 verdicts for those are inferred from the shared components seen in the viewed states.
- w768: viewed app, models, models-failed, recording-advanced, delivery, delivery-profile-editor, global-keyboard. All other states at 768 not viewed.
- w1024: viewed folded-category-list, recording-advanced, models. w1280: viewed folded-category-list only. w1920: viewed models-needs-repair only. The other states at these widths were not viewed.
- Dark (shots-a): viewed app, models, global-keyboard (desktop) and project (tablet). No dark-only border/inset defect found; every finding below is `both` unless stated.
- Source read: SettingRowView, ValueControl, Select, ScopedSetting (head), Dialog, ImportReview rows, KeyboardPanel/ShortcutsBody, AssetRow/ModelsPane, UpdatesPanel/AboutPanel, SettingsPage header, StoryBibleTypesPanel, DeliveryProfileEditor, Slider.
- Design-system "Settings rows" doc vs code: the doc describes `ScopedSetting.tsx` (12rem/16rem label column, selects full width up to max-md). The Settings page rows are actually drawn by `row/SettingRowView.tsx` (two equal columns, selects fixed or content width). See SET-5 and SET-6. `ScopedSetting.tsx` is only reached from the "Set on a page" panels.
- Probe items I rejected as false positives: sr-only clipped-x/y, `button-label-wraps` (lh 13 lines are single-line labels), `icon-rail` clipped-x at 1024/1280, the `thead` clipped lines.

### Story Bible, project picker, startup, global (coverage)

- **storybible, all 44 states** in `storybible/` (the catalog lists 44, not 32). For every state I viewed w1440 and w390. I also viewed w768 for: entry-editing, category-organization, character-voice-references, import-dialog, entry-properties-editing, entry-needs-review, series-tab-populated, alias-pronunciation-editing. w1024 for: entity-selected, entry-editing, alias-pronunciation-editing. w1920 for: delete-confirm. w1280 was not viewed (the 1440 and 1024 shots cover its layout band).
- **States skimmed (viewed w1440 + w390 only, no 768/1024)**: category-all, category-character, category-place, delete-confirm, entry-locked, entry-saving, entry-unlocked, entry-names-own-pronunciation (opened only as the shared alias row, not separately), entry-pronunciation-missing/online, invalid-payload, loading, loose-suggestion, name-clash, no-manuscript, relationship-picker, remove-voice-*-confirm, review-filter, search-narrowed, series-tab-empty/loading/load-failed, verification-filter, voice-* states.
- **Limit of the 390 shots**: at 390 the page stacks list over detail. For most states the driver does not scroll the detail into view, so the w390 PNG shows only the list (entry-editing, entity-selected, entry-locked, name-clash, entry-saving, relationship-picker, voice-samples-limit, category-*). The detail at 390 is only visible in alias-pronunciation-editing, entry-properties-editing, entry-suggestions, voice-samples-entry, review-filter (partly), verification-filter (partly). I could not audit the detail panel of the other states at 390.
- **Dark** (`shots-a/dark`): storybible entity-selected desktop, alias-pronunciation-editing desktop, voice-data-samples desktop, entry-properties-editing tablet, verification-filter desktop. No dark-only defects found; every defect below is theme-independent.
- **project**: all 6 states at w1440 + w390; picker-pinned also w768; dark picker-empty desktop. new-project-dialog and picker-daw-running also w390.
- **startup** (1 state, invalid-payload): w1440, w390, dark desktop. No defect.
- **global**: all 9 states at w1440 (shortcut-sheet also w768/w390, nav-rail-open also w1024/w768/w390, toast/tooltip w390, theme-dark w390, nav-rail-collapsed w1024, nav-rail-collapsed-dark w768, theme-light w1440). `confirm-dialog` is the Story Bible delete dialog (see SB-9). `toast`, `tooltip`, `theme-*` and `nav-rail-*` are drawn over the Proof, Production and Settings pages, so I only report defects there when they belong to a shared primitive.
- **Not covered**: the nav-rail-open drawer at w768 and w390 (the PNGs show the page with no drawer open, so the suite does not capture the drawer there; only w1024 does). Hover/focus states other than those in the PNGs.
- **Failing suite check confirmed**: storybible/alias-pronunciation-editing at 390. Probe at `probe-out/storybible/alias-pronunciation-editing/w390.json`: the "Name" input is `scrollW 125 > clientW 8` (suite says 10px). Cause is SB-1.

### Engine panel and app shell (coverage)

- **shell** (12 state folders; the catalog lists 11 plus `jump-menu-forward-enabled`):
  - Viewed light w1440, w768 and w390 for: `engine-builtin` (also w1920, w1280, w1024), `jump-menu-open` (also w1024), `nav-off-note` (also w1024), `switch-project-open` (also w1024), `history-panel-open`, `context-menu-open` (also rail-only 1300), `zoom-level` (also reflow), `jump-menu-off-pages` (w1440, w390), `jump-menu-back-enabled` (w1440, w390), `zoom-menu-open` (w390 only).
  - Not viewed: `engine-mismatch` (the catalog says it is the same chip as other pages), `jump-menu-forward-enabled` (same layout as back-enabled), and `medium-only`/`rail-only` extras other than the context-menu one. For `jump-menu-off-pages` and `jump-menu-back-enabled` I did not view w768 or w1024. I viewed `zoom-menu-open` at w390 only. For `engine-builtin` I did not view the `reflow` image.
  - Dark: `engine-builtin` (desktop, small-desktop), `nav-off-note` (desktop). Tablet dark not viewed.
  - **No shell state shows the navigation drawer open** (hamburger below 860 px). I checked the drawer from source only (`components/primitives/NavDrawer.tsx`, `components/layout/AppShell.tsx:208-261`): panel `w-[min(17rem,86vw)]`, Close button at `top-3 right-3`, same `navigation` markup as the rail. I found no defect in the source, but I have no screenshot. That is a coverage gap.
- **engine** (36 states). Viewed in full (w1440 and w390, light) for: `default` (also w1024, w768), `chapter-link-confirmed` (also w1024, w768), `sync-activity`, `rpp-picker`, `wrong-project`, `link-chapters-preview`, `link-chapters-success`, `link-chapters-conflict`, `render-config-prefilled`, `render-config-success`, `create-regions-preview`, `chapter-tags-ready`, `cleanup-tools-idle`, `retake-lanes-list`, `editing-check-unmapped`.
  - Also viewed, partly: `chapter-link-missing` (w390), `create-regions-success` (w390), `retake-lanes-picked` (w768), `no-rpp` and `no-daw-link` (w1440 only).
  - Dark: `default` (desktop only).
  - **Not viewed (skimmed by name and catalog description only):** `sync-off`, `sync-background-wait`, `from-tracks-link`, `link-chapters-error`, `render-config-no-regions`, `render-config-error`, `create-regions-empty`, `create-regions-error`, `chapter-tags-idle`, `chapter-tags-not-rendered`, `chapter-tags-success`, `chapter-tags-error`, `cleanup-tools-launched`, `cleanup-tools-error`, `retake-lanes-none`, `retake-lanes-error`.
  - Not viewed for engine: w1920 and w1280 of any state (the panel and dialogs have fixed or percent widths, so I expect no change from w1440). Dark for everything except `default`.
- The `engine` panel is a 44rem slide-over and the dialogs are `max-w-[70vw]`, so the layout only changes at 768 and below. Findings marked "dialogs" or "panel" repeat in every state of that kind. I listed the states I saw.

### Booth (coverage)

- Page `booth`, all 36 states (setup, daw-not-linked, daw-not-running, refusal, record-connect, record-turned-away, record-other-project, builtin-setup, builtin-refusal, builtin-recording, builtin-take-ended, recording, following, voice-samples-picker, voice-samples-panel, voice-samples-recording, listening-no-mic, model-required, leave-dialog, roll-confirm, resume, levels-menu, text-popover, marked-note, bookmarks-ribbon, pickup-session, dark, companion-default, companion-listening, companion-loading, no-manuscript, credits-missing, credits-unresolved, load-failed, loading, address-checking).
- Light w1440 viewed for every state except `dark` (viewed in dark instead) and the three companion states (viewed at their 380 `companion` capture; companion-default also at w1440, companion-listening at w768).
- w390 viewed for: setup, refusal, record-connect, record-turned-away, record-other-project, daw-not-running, builtin-refusal, builtin-recording, builtin-take-ended, recording-family (following, leave-dialog, roll-confirm), model-required, voice-samples-picker, voice-samples-panel, levels-menu, text-popover, marked-note, listening-no-mic, bookmarks-ribbon, pickup-session, credits-unresolved, credits-missing, no-manuscript, loading, load-failed.
- w768 viewed for: setup, recording, leave-dialog, model-required, voice-samples-picker, voice-samples-panel, bookmarks-ribbon, pickup-session, credits-unresolved, daw-not-running, record-connect, no-manuscript, address-checking.
- w1920/w1280/w1024 viewed for setup; w1280 and w1024 for voice-samples-panel (drawer); w1024 for recording and no-manuscript.
- Dark (shots-a): setup, dark, refusal, pickup-session, voice-samples-picker (desktop); setup and record-connect (tablet). No dark-only defect found.
- SKIMMED / NOT VIEWED: w390/w768 of daw-not-linked, builtin-setup, resume, voice-samples-recording, address-checking (390), builtin-take-ended (768), record-turned-away/record-other-project (768), marked-note (768), levels-menu/text-popover (768), load-failed (768), loading (768); w1920/w1280/w1024 of every state except those listed (judged from w1440/w768 because the layout bands only change the side panel (drawer at <=1280) and top-bar wrapping); w1680/rail-only/medium-only extras; companion states at w1024/w1280/w1920/w390 (the companion is a fixed 380 column centred in a wider window).
- Probe lines used only after checking the screenshot and source: bookmark svg 50x40 in 16x26, offscreen-right 399>390, small-hit-area chips and toast dismiss, column-misaligned Coming up, selected-inset pickup button. Ignored as noise: all sr-only clipped-x/y, button-label-wraps on one-line buttons (h 36 lh 13 is just a nowrap label), the base-ui range input 14x14 / scrollW 16, selected-inset of the reading highlight (a word highlight, not a bar), the lock-rail rows of no-manuscript (shell page, other reviewers' area).

### Editing and Script (coverage)

**Editing (26 states), light unless noted.**
- All widths (1920/1440/1280/1024/768/390): `default`. Dark: `dark:editing/default` desktop and tablet.
- 1440 + 768 + 390: `selection`, `takes-open`, `drawer-effects-inspector` (768/390 seen, 1440 seen).
- 1440 + 390: `delete-dialog`, `word-menu-fx`, `drawer-cleanup`, `unlinked`, `never-checked`, `voice-sample-dialog`, `fx-dialog`, `voice-sample-mark-open`.
- 1440 + 768 + 390: `daw-off`. 1440 + 768: `address-checking`.
- 1440 + 1280 + 1024 + 768: `drawer-timeline`. 1440 + 1280 + 390: `drawer-effects`.
- 1440 only: `fx-menu`, `suggestion-step`, `no-manuscript`, `loading`, `load-failed`, `chapter-load-failed`, `voice-sample-refused`, `voice-sample-saved`, `drawer-effects-chains`.
- NOT viewed at all: `voice-sample-mark` (it is the same frame as `voice-sample-saved` without the popover, I judged it redundant; skimmed by inference, not looked at). 1920 and 1024 for every state except `default`/`drawer-timeline`; 768 for most dialogs. Where I say "also on" for those widths it is from source, not from a screenshot.
- Capture issue: `drawer-timeline` at 768/1280/1024 shows NO drawer (the page looks like `default` with the cursor on "was"), so the Timeline-tab drawer was never seen below 1440 even though the catalog says it is the narrow-width case. At 1440 it shows the strip, not the drawer.

**Script (21 states in the catalog, brief said 18), light unless noted.**
- All widths: `reader`. 1280/768/390 (+1440 from `reader`): `chapter-list`. Dark: `reader-dark` 1440, `dark:script/reader/tablet`.
- 1440 + 1280 + 768 + 390: `selection-tools`. 1440 + 768 + 390: `find`, `define-marks`.
- 1440 + 390: `mark-composer`, `text-settings`, `credits-setup-banner`, `retail-sample`, `reader-context-menu`, `rail-words` (+768, +1280), `rail-queries`, `rail-bookmarks`, `rail-story-bible`.
- 1440 only: `rail-notes`, `credits-cards`, `skip-to-side-panel`, `no-manuscript`, `loading`, `invalid-payload`. `bookmark-added` 390 only (1440 ribbon seen through `rail-bookmarks`).
- NOT viewed: 1920 and 1024 for everything except `reader`; 768 for the rail tabs other than Words, for `credits-*`, `retail-sample`, `invalid-payload`, `no-manuscript`, `loading`; 390 for `rail-notes`, `credits-cards`, `no-manuscript`, `loading`, `invalid-payload`, `skip-to-side-panel`.
- Script layout: columns are 240 / flexible / 380 with 16px gaps (`script/page/layout/ScriptColumns.tsx:67`). I checked column heights at 1920/1440: all three columns are the same height (y 68 to 883 at 1440, 68 to 1063 at 1920) and the gutters are 16/17px each side. The only blank space is inside the rail (content ends around y=430 and the panel runs to 883), which is content-driven; I did not list it as a defect.

### Proof, Proof chapter and Pickups (coverage)

Paths below: Shots are `<page>/<state>/<width>.png` unless stated.

- `proof` (17 states): viewed w1440 for default, empty, loading, load-error, no-manuscript, address-checking, chapter, chapter-no-recording, check-checking, check-never, check-recordings-dialog, check-stale, evidence-changed, find-open, takes-lanes, note-thread, notes-filtered. Also w768 and w390 (plus w1024, w1280, w1920 and reflow) for default; w390 for find-open, note-thread, empty and check-recordings-dialog; w768 for chapter, takes-lanes and check-recordings-dialog; w1920 for chapter. Dark: default (desktop) only.
- `proof-chapter` (34 states): viewed w1440 for current, never, stale, compare-setup, options-open, compare-hints-many-pills, compare-hints-pending-suggestions, compare-running, compare-results-summary, compare-results-changed-since, compare-toast, compare-no-daw, load-failed, native-takes-keeper, preview-warnings, preview-pinned, preview-pin-stale, render-chosen, render-stale, stage-panel-evidence-recommended, stage-panel-suggestions. w390 for current, preview-default, preview-warnings, native-takes-keeper, compare-running, compare-results-changed-since, compare-hints-many-pills, stage-panel-evidence-recommended. w768 for current; w1024 and w1920 for compare-hints-many-pills. Dark: current (desktop).
- `pickups` (9 states): w1440 for list, add-popover, marked-recorded, scoped, session-left-out, empty, loading, unreadable, no-manuscript. w768, w390, w1024 and w1280 for list; w390 for add-popover. Dark: list (desktop).
- Skimmed by sibling equivalence, not opened: proof-chapter compare-hints-chips, compare-hints-typing, compare-setup-alt, preview-computing, preview-nothing-eligible, preview-no-manuscript, preview-shorter, render-none, render-measured, stage-panel-evidence-not-ready, stage-panel-evidence-unknown, stage-panel-suggestions at w390/w768, native-takes-unassigned, loading, compare-no-daw at w768/w390. They share the same components as the states I viewed (Panel, Table, CompareRun, ProofingStagePanel).
- Not viewed: dark tablet for every page; shots-a at w1024 and w768 beyond the ones listed; proof states at w1280 other than default; pickups empty/unreadable/loading/no-manuscript at w768 and w390; proof `chapter`/`takes-lanes` at w1024.
- Probe digests were used as hints only. Nothing here comes from a probe line I did not confirm in a screenshot and in the source. The sr-only clipped-x lines and the sidebar-rail label wraps at 1024/1280 are false positives. The Proof header, strip, note rows and inspector are fine at 1440/1920.
- Dark: borders and fills are consistent with light on all three pages. In dark the card fill is nearly the page colour on proof-chapter and pickups, so card edges rely on the 1px border. That is a token matter, not an alignment defect, so it is not listed.

### Master & QC, Delivery and Schedule (coverage)

All shots are viewport crops (many are scrolled to the state's target), so what is above or below the crop was not seen.

- master (26 states): w1440 viewed for empty, running, measured, file-rules, book-spread, custom-profile, error, to-spec-picked, to-spec-running, diagnostics-findings, diagnostics-running, diagnostics-cleanup-options, multi-export-selected/running/results, no-manuscript, package-loading, profile-load-failed, chapters-load-failed, report-exported. w390 viewed for empty/measured/book-spread/custom-profile/running/to-spec-picked/to-spec-running/diagnostics-findings/diagnostics-running/diagnostics-error/diagnostics-cleanup-options/multi-export-results/report-exported. w768 for empty, book-spread, to-spec-picked, diagnostics-findings, file-rules. w1280 and w1024 for measured; w1920 for diagnostics-findings. Dark: measured desktop, file-rules tablet.
- master states SKIMMED or NOT viewed at every width: cancelled, diagnostics-cancelled, diagnostics-empty, report-needs-files (not opened; judged by the shared components seen in neighbouring states, so they may hold defects I did not see). multi-export-empty and 390/768 of several error states were not opened. No-manuscript seen only at 1440.
- delivery (14 states): w1440 viewed for default, many-chapters, built, building, build-failed, failing-chapter, custom-profile, profile-rules, host-quiet, loading, measured, ready. w390 for default, many-chapters, built, custom-profile, profile-rules, host-quiet-cancelled. w768 and w1920 for default. Dark: default desktop, custom-profile tablet. NOT viewed: no-manuscript, w1280 and w1024 of every state (inferred from w1440/w768), host-quiet-cancelled at 1440.
- schedule (8 states): w1440 viewed for on-pace, long-text, at-risk, milestone-dialog, overdue, no-due-date, loading. w1920 for on-pace and long-text; w1280 and w1024 for overdue/at-risk/long-text; w768 for on-pace, long-text, at-risk, milestone-dialog; w390 for on-pace, long-text, overdue, at-risk, milestone-dialog, loading, no-manuscript. Dark: on-pace desktop. NOT viewed: no-manuscript at 1440/768. The Milestones table body is below the crop in most states; I saw it only in long-text (all widths), milestone-dialog and no-due-date, so rows with real data in on-pace/at-risk/overdue were seen only as a clipped header.
- The geometry digests were used as hints only; each finding below was checked in a screenshot and in the source. I did not run the app.
