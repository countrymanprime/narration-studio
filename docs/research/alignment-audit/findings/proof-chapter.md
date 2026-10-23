# Proof (chapter view): alignment findings

Part of the [alignment audit](../../alignment-audit.md). Findings are grouped by the round that produced them; a later round's finding that replaces an earlier one says `Supersedes`. Evidence paths are `<page>/<state>/<width>.png` of the light capture, `dark:<page>/<state>/<viewport>.png` for dark, `tall:<page>-w<width>.png` for the below-the-fold captures; the images are not committed (regenerate the repo-viewport ones with `pnpm --dir src/studio/ui visual:page <page>`).

## Round 4: gap fill

### R4PC-1 The "Last narrated take" link underlines two broken lines at 390

- Page / state: proof-chapter / every setup state
- Widths: 390 (theme: both)
- Gut reaction: a whole sentence is one underlined link, so it looks like two struck-through lines of small print that break at "9/15/2026," with the time alone on line two.
- What is wrong: the link text ("Last narrated take: Chapter 1 - 3 audio items - 9/15/2026, 2:30:00 PM") is 12 px, wraps at y=538 and 556 (390 capture), centred under the intro sentence, which is left aligned; the second line is just "2:30:00 PM". Extends R3PC-9 / XPC-16.
- Where: `src/studio/ui/src/components/proof/CompareRun.tsx:332-345` (link variant, text-wrap default)
- Severity: polish (390 only)
- Fix: break after the colon deliberately (label line, value line) or truncate the date.
- Evidence: `S/proof-chapter/compare-setup/w390.png` (y=535-562)
- Shared: Button link variant
- Scanner: none

### R4PC-2 The load-failed card has nothing to go back to

- Page / state: proof-chapter / load-failed
- Widths: 1280 (seen), all (theme: both)
- Gut reaction: a bare "Proof" heading and a small card; I do not know which chapter failed, and the only exit is Retry.
- What is wrong: no breadcrumb ("Proof > Chapter n"), heading says only "Proof", card is ~720 px wide in a 1217 px content area (x=310-1030) while the loaded page runs the full 1280 cap, so the page changes shape between error and success. Message ("The manuscript could not be read from this project.") and the card title say two different things.
- Where: `src/studio/ui/src/components/proof/ProofChapterPage.tsx` error branch (near the loading branch, lines 132-141)
- Severity: polish
- Fix: reuse the loaded page's breadcrumb and title row; add a "Back to Proof" link beside Retry.
- Evidence: `S/proof-chapter/load-failed/w1280.png`
- Shared: page-local
- Scanner: none

### R4PC-3 The "Why suggested" cell is a four-sentence wall with a warning glued on

- Page / state: proof-chapter / preview-warnings
- Widths: 1024 dark seen (all widths) (theme: both)
- Gut reaction: one table cell holds three grey sentences stacked with no spacing and an orange warning paragraph under them, 75 px tall, so the row looks like a different kind of row than the one-line rows around it.
- What is wrong: reasons are 12 px lines at 0 gap, the warning starts a hanging-indent paragraph (icon at x=463, text at x=475), 3 lines; row height ~115 px vs 41 px for plain rows; the chapter name and numbers are vertically centred against it while the reasons start at the top.
- Where: `src/studio/ui/src/components/proof/PreviewPanel.tsx` (reason list + warning in the last cell)
- Severity: polish (extends XPC-4 / R3PC-12)
- Fix: bullet or 4 px spacing between reasons; put the warning in its own full-width row under the chapter.
- Evidence: `dark:proof-chapter/preview-warnings/small-desktop.png` (y=530-645)
- Shared: page-local
- Scanner: none

### R4PC-4 Start comparison has a thick double focus ring in some captures and not others

- Page / state: proof-chapter / compare-setup (dark 1440 and 1024, 768)
- Widths: 1440, 1024, 768 (theme: dark)
- Gut reaction: the primary button looks outlined twice, a white ring plus a gap, while the same button in `never`, `no-daw`, `hints-chips` has no ring.
- What is wrong: only compare-setup shows the ring (the harness probably focused it); at 768 it is a blue ring, at 1440 white; the ring is 2 px with a 2 px gap and is not clipped. May be intended focus-visible styling.
- Where: Button focus-visible (`primitives/Button`), state-dependent focus
- Severity: polish (may be intended)
- Fix: confirm in the catalog driver that the focus is deliberate; the ring colour should be one token in dark.
- Evidence: `dark:proof-chapter/compare-setup/desktop.png` (Start), `.../tablet.png`
- Shared: Button
- Scanner: none

## Round 3: coverage gaps and scanner cross-check

### R3PC-1 Why do the empty Preview states just say a sentence and leave me nowhere to go?

- Page / state: proof-chapter / preview-no-manuscript, preview-nothing-eligible, preview-computing
- Widths: 1920, 1280, 1024, 768, 390 (theme: both)
- Gut reaction: the card says "Import a manuscript to see preview suggestions." in plain grey text and there is no button or link to import one; "Computing suggestions..." has no spinner or skeleton; "No eligible text was found... Narration chapters with at least one paragraph are needed." tells me what is missing but not where to fix it. The card collapses from a 190-300 px table to a 43 px sentence strip, so the page below jumps.
- What is wrong: each of the three states is one 14 px grey `<p>` at the card's left padding (x=33 at 768, x=249 at 1440), no action, no icon, no status glyph; at 1920 the sentence ends at x=345 of a 1246 px card. The `goToManuscript` handler exists on the panel and is used by the row's "open" icon, but the empty state does not offer it.
- Where: `src/studio/ui/src/components/proof/PreviewPanel.tsx:120-137` (three bare `<p className="text-sm">` children)
- Severity: looks wrong
- Fix: give the empty states one shape: icon, the sentence at 14 px, and a button ("Open the manuscript", "Retry"); show a skeleton row while computing.
- Evidence: `S/proof-chapter/preview-no-manuscript/w768.png` (y=624-728), `.../preview-nothing-eligible/w1920.png`, `.../preview-computing/w1280.png`
- Shared: page-local (Panel empty body)
- Scanner: none

### R3PC-2 Why do the three icon buttons in every Preview row look like a keypad?

- Page / state: proof-chapter / every Preview state with candidates (current, `compare-*`, preview-warnings excepted, `render-*`, `stage-panel-*`)
- Widths: 1920, 1440, 1280, 1024 (theme: both); at 768 the same three squares sit in the third column
- Gut reaction: nine identical 36 px outlined squares stacked 3 x 3 with 11 px between rows, no visual break between one row's actions and the next row's; the rows are separated only by a hairline 5 px above and below the buttons, so the eye reads one block of squares, not "actions for chapter 1 / 2 / 3". The scanner even flags them as a double stack.
- What is wrong: buttons are 36x36 (x=1254 / 1294 / 1334 at 1440, 4 px apart), rows are 47 px, so each button is 5.5 px from the row rules and 11 px (1440, y=630 and 677) from the next row's buttons. Icon-only (open, copy, pin) with no label until hover. The icons are 14 px glyphs inside 36 px frames. Compare the row text, which is 14 px and only about 17 px tall.
- Where: `src/studio/ui/src/components/proof/PreviewPanel.tsx:171-205` (`flex items-center gap-1` wrapper of three `IconButton`), row height set by the 36 px buttons; `primitives/IconButton`
- Severity: looks wrong (may be intended as the app's standard icon action column)
- Fix: ghost 28-32 px icon buttons, or 8 px of extra row padding, so the row hairlines read as separators; keep one gap value between the three.
- Evidence: crop `S/crops/r3pc/current_w1440_1100_600_330_200.png` (three rows, 11 px between button groups), `S/proof-chapter/stage-panel-suggestions/w1024.png` (y=693 and 740)
- Shared: IconButton default size; page-local usage
- Scanner: A9

### R3PC-3 Why is the Compare card's title bar taller than every other card's?

- Page / state: proof-chapter / every state with the Compare card
- Widths: 1920, 1440, 1280, 1024, 768 (theme: both)
- Gut reaction: down the page the cards have title bars of 50 px (Native takes, Preview, Proofing readiness) and one of 56 px (Compare), so the stack's rhythm hiccups at the biggest card.
- What is wrong: measured from the card top border to the header rule at x=700, 1440: Compare 156 to 212 = 56 px, Preview 521 to 571 = 50 px; Native takes 156 to 206 = 50; Proofing readiness 50 (dark 1440, y=454-492 at 0.76 scale). The 32 px step strip plus the panel's 11 px vertical padding makes the Compare header 54-56 px against `min-h-[3.125rem]` (50 px).
- Where: `src/studio/ui/src/components/primitives/panelStyles.ts:8-9` (`min-h-[3.125rem]`, `py-[0.6875rem]`), `CompareRun.tsx:306-324` (the 32 px segmented strip in `actions`)
- Severity: polish
- Fix: make the strip 28 px (or the header 56 px everywhere); one header height.
- Evidence: `S/proof-chapter/current/w1440.png` (header rules y=212 vs y=571), `S/proof-chapter/native-takes-keeper/w1440.png` (rule y=206 for Native takes)
- Shared: Panel header
- Scanner: none

### R3PC-4 The x on each vocabulary pill is a 16x19 target inside a 30 px pill

- Page / state: proof-chapter / compare-hints-chips (Alice), compare-hints-many-pills (8 pills)
- Widths: 1920, 1440, 1280, 1024, 768 (theme: both)
- Gut reaction: the little x looks fine, but it sits flush against the pill's right edge and is hard to hit; next to the other buttons on the page (36 px) it is a speck.
- What is wrong: each `Remove <term>` button is 16x19.2 (e.g. x=159.8, y=383.5 at 1440 for Alice; Zeph x=980) while the pill is about 30 px tall; hit area is under 24 in both axes and 11 px shorter than the pill.
- Where: `src/studio/ui/src/components/primitives/TagInput.tsx:99-110` (bare `<button>` around a `FontAwesomeIcon`, no padding)
- Severity: polish
- Fix: give the button `p-1 -m-1` (or `min-h-6 min-w-6`) so the target is 24 px and the painted glyph is unchanged.
- Evidence: `S/proof-chapter/compare-hints-many-pills/w1280.png` (y=1036 of the 1100-scale montage), `dark:proof-chapter/compare-hints-many-pills/desktop.png` (x marks at y=302)
- Shared: TagInput
- Scanner: H1

### R3PC-5 The little (i) next to each setup label is 15x15

- Page / state: proof-chapter / every setup state (4 per Compare card: Whisper model, Chunk length, Parallel workers, Vocabulary hints)
- Widths: 1920, 1440, 1280, 1024, 768, 390 (theme: both)
- Gut reaction: a tiny circled i beside the label, much smaller than the 36 px toggles under it.
- What is wrong: `More information` buttons are 15x15 (e.g. x=344/725/1136, y=269 at 1440), under 24 px, `cursor-help`, 1 px border; the Parallel workers (i) sits 8 px from the label while the toggles below are 36 px.
- Where: `src/studio/ui/src/components/primitives/Tooltip.tsx:115` (`size-[15px]`)
- Severity: polish
- Fix: 24 px hit area (`p-[4.5px] -m-[4.5px]`), keep the 15 px painted circle.
- Evidence: `S/proof-chapter/current/w1440.png` (y=269), `dark:proof-chapter/compare-setup-alt/desktop.png`
- Shared: Tooltip trigger (all pages)
- Scanner: H1

### R3PC-6 Clicking the empty part of the vocabulary box does nothing: the real input is a 19 px line inside a 54 px box

- Page / state: proof-chapter / every setup state
- Widths: 1920, 1440, 1280, 1024, 768, 390 (theme: both)
- Gut reaction: the whole grey box looks like one text field, but the editable part is only the "Add a term..." strip; the border, the 8 px padding and the empty area around pills are dead.
- What is wrong: the `Add a vocabulary term` input is 780x19 at x=566, y=387 (1440) inside a bordered box 54 px tall (empty) to 90 px (two rows of pills); there is no click handler on the wrapper (only chips and the input have handlers), so only the 19 px line focuses it.
- Where: `src/studio/ui/src/components/primitives/TagInput.tsx:91-94` (wrapper `div`, no `onClick` to focus the input), `:135` (input `p-0 leading-[1.35]`)
- Severity: polish
- Fix: wrapper `onClick` focuses the input (or make the input `self-stretch`).
- Evidence: `S/proof-chapter/current/w1440.png` (box y=370-422, input y=387-406)
- Shared: TagInput
- Scanner: H1

### R3PC-7 The toast's dismiss X is a bare 17x20 glyph

- Page / state: proof-chapter / compare-toast, compare-setup-alt, compare-hints-chips, render-measured
- Widths: 1920, 1440, 1280, 1024, 768, 390 (theme: both)
- Gut reaction: a toast with a thin x jammed at the right edge, no padding or outline, very unlike the 36 px outlined X buttons on dialogs and the slide-over.
- What is wrong: `Dismiss message` is 17x20.4 (x=1227, y=747 at 1440, page coordinates), no hover frame; the glyph is the full button.
- Where: `src/studio/ui/src/components/primitives/Toast.tsx:72` (`<button aria-label="Dismiss message" className="flex-none">`)
- Severity: polish
- Fix: `size-6` hit area with centred glyph.
- Evidence: crop `S/crops/r3pc/z_toast.png`, `S/proof-chapter/compare-toast/w1440.png` (bottom right)
- Shared: Toast
- Scanner: H1

### R3PC-8 The REAPER chip in the top bar is a 22 px button

- Page / state: proof-chapter / every state (also compare-no-daw "REAPER: Open the engine panel")
- Widths: 1920, 1440, 1280, 1024, 768 (67.5x22); 390 (20x22, only a dot) (theme: both)
- Gut reaction: it is a pill that looks like a status label, but it is a button; at 390 it shrinks to a green dot inside a pill with no text.
- What is wrong: `button.h-[1.375rem]` is 67.5x22 at x=1352.5, y=14.5 (1440), under 24 px; at 390 it is 20x22 and shows only a dot, so the connection state is colour-only (green) there.
- Where: `src/studio/ui/src/components/primitives/HeaderChip.tsx:21` (`h-[1.375rem]`)
- Severity: polish
- Fix: 24 px minimum height; keep the text at 390.
- Evidence: `S/proof-chapter/current/w1440.png` (top right), `S/proof-chapter/compare-setup/w390.png` (x=358, y=14)
- Shared: HeaderChip (shell)
- Scanner: H1

### R3PC-9 "Last narrated take" is a 16 px high link that is 377 px wide

- Page / state: proof-chapter / every setup state
- Widths: 1920, 1440, 1280, 1024, 768 (theme: both)
- Gut reaction: the only way back to the last results is a thin underlined line of grey text on the far right, easy to miss and hard to hit.
- What is wrong: the link button is 377x16 (x=1030, y=230 at 1440) with `disabled:pointer-events-none`; it is a 12 px line on a card with 36 px buttons. This adds a hit-area point to XPC-16 (which is about its look).
- Where: `src/studio/ui/src/components/proof/CompareRun.tsx:332-345` (`Button variant="link"`)
- Severity: polish
- Fix: see XPC-16 (make it a secondary button); at minimum `min-h-6`.
- Evidence: `S/proof-chapter/current/w1440.png` (y=230-246)
- Shared: Button link variant
- Scanner: H1

### R3PC-10 Options dialog controls are three different heights, and the first label is not centred on its select

- Page / state: proof-chapter / options-open
- Widths: 1920, 1440, 1280, 1024, 768 (theme: both)
- Gut reaction: the chunk select, the colour swatches and the hex boxes are nearly the same height but not the same: the select pokes above the label, the swatch is a hair taller than the hex field next to it.
- What is wrong: select 40.8 px, swatch `size-[2.35rem]` 37.6 px, hex text field 36 px (x=446.6 / 483, y=366.6, 1440 page coordinates); in the first row the label's centre sits about 3 px above the select's centre (`Default chunk length` y=124 vs select centre y=127 in `z_opt.png`) while the colour rows are centred. Row pitch is 49-50 px but the intro sentence sits 10 px above the first row. This is in addition to XPC-10's width findings.
- Where: `src/studio/ui/src/components/primitives/TextField.tsx:11` (`COLOR_CLASSES size-[2.35rem]`), `src/studio/ui/src/components/proof/proofOptions/ProofOptions.tsx:95` (row label `w-56`, no `items-center` on the select row)
- Severity: polish
- Fix: one control height token (`--control-height`) for select, swatch and field; centre the row.
- Evidence: crop `S/crops/r3pc/z_opt.png`, `S/proof-chapter/options-open/w1920.png`
- Shared: TextField colour variant, ProofOptions row
- Scanner: A6

### R3PC-11 In the slide-over, the OPEN THIS NOTE button is jammed against the line above it

- Page / state: proof-chapter / stage-panel-evidence-not-ready
- Widths: 1920, 1440, 1280, 1024, 768 (theme: both)
- Gut reaction: the bordered button sits 4 px under "from heard as" and 8 px above the grey "Based on the saved REAPER project" text, while the paragraphs above are 12 px apart.
- What is wrong: gaps inside the evidence card are 12 px between paragraphs but 4 px above and about 8 px below the button (`z_note.png` y=405-440).
- Where: slide-over evidence card in `src/studio/ui/src/components/stages/` (action button rendered inline after the evidence line); cause not located in detail
- Severity: polish
- Fix: `mt-2 mb-2` around the button or put it on the heading row.
- Evidence: crop `S/crops/r3pc/z_note.png`, `S/proof-chapter/stage-panel-evidence-not-ready/w1920.png`
- Shared: StageEvidence
- Scanner: none

### R3PC-12 The PARAGRAPHS column says "paragraphs 1 to 24" in every row

- Page / state: proof-chapter / every Preview state
- Widths: 1920, 1440, 1280, 1024, 768 (theme: both)
- Gut reaction: the header already says PARAGRAPHS, and every cell repeats the word in mono type, so the column is the widest in the table and mostly filler; at 768 it eats the room that makes chapter names and reasons wrap.
- What is wrong: cells read `paragraphs 1 to 24` (about 140 px at 1440) under a `PARAGRAPHS` header; the "Why suggested" column also repeats the same sentence ("Starts and ends on paragraph boundaries.") in all three rows.
- Where: `src/studio/ui/src/components/proof/PreviewPanel.tsx:166` (`describeParagraphs(...)` in a nowrap mono cell)
- Severity: polish
- Fix: "1-24" in the cell; show "Why suggested" text only when it differs from the default.
- Evidence: `S/proof-chapter/current/w768.png`, `.../current/w1440.png`
- Shared: page-local
- Scanner: none

### R3PC-13 The loading skeleton does not look like the page it becomes

- Page / state: proof-chapter / loading
- Widths: 1920, 1280, 1024, 390 (theme: both)
- Gut reaction: a title and three equal grey bars, and then the real page arrives as a short breadcrumb, a title row with buttons and cards of 330 / 190 / 130 px, so everything jumps.
- What is wrong: skeleton is "Proof" at y=83, one short bar and three bars of equal height (`Skeleton tall`), no breadcrumb, no title-row position; the loaded page puts its title at y=119. XPC-12 covers the title y; this is about the blocks.
- Where: `src/studio/ui/src/components/proof/ProofChapterPage.tsx:132-141`
- Severity: polish
- Fix: skeleton shaped like title row + three cards of the real heights.
- Evidence: `S/proof-chapter/loading/w1920.png`, `dark:proof-chapter/loading/desktop.png`
- Shared: LoadingRegion usage
- Scanner: none

## Round 2: strict review

### XPC-21 Native take name truncated to "T"; take row has no room (390)

- Page / state: proof-chapter / native-takes-keeper (unassigned section), native-takes-unassigned
- Widths: 390 (secondary) (theme: light)
- What is wrong: the take name shows as "T" at x=83-90 beside a 180 px select and ASSIGN, so the narrator cannot tell which take is being assigned; the rest of the row wraps nowhere.
- Where: `NativeTakesPanel.tsx:157,167` (`flex-wrap` li, name `min-w-0 flex-1 truncate`)
- Severity: breaks use (390 only)
- Fix: name `min-w-[6rem] shrink-0`, so the select and button wrap to a second line.
- Evidence: `proof-chapter/native-takes-keeper/w390.png` (y=478-505)
- Shared: page-local
- Supersedes: PRC-2

### XPC-1 Why is there a gap under two of the three setup columns, and why does LARGE sit alone on a second row?

- Page / state: proof-chapter / current, never, stale, compare-setup, compare-setup-alt, compare-toast, `compare-hints-*`, `preview-*`, no-daw, `native-takes-*`, `stage-panel-*`, `render-*` (every state with the setup form)
- Widths: 1024, 768 (looks wrong); 1440, 1920, 1280 (polish: uneven blank) (theme: both)
- What is wrong: the three columns are equal thirds (starts x=249 / 642 / 1034 at 1440), but the model group is about 336 px wide, chunk about 193 px and workers about 172 px, so at 1440 the right column is empty from x=1206 to 1407 and the chunk column from 835 to 1018. At 1024 and 768 the five model buttons no longer fit their third (about 270 px / 220 px at 768), so LARGE (and TURBO at 768) wraps alone to a second row at y=351, which leaves a roughly 42 px empty band under Chunk length and Parallel workers and pushes the hints down.
- Where: `src/studio/ui/src/components/proof/CompareRun.tsx:343` (`grid gap-5 md:grid-cols-3`, equal columns) and `:354,:371,:392` (each ToggleGroup is `flex-wrap gap-1.5`)
- Severity: looks wrong
- Fix: use `grid-cols-[auto_auto_auto] justify-start gap-x-8` (or give the model column 1.5fr) so the model row never wraps at supported widths; at 768 stack the three groups instead of leaving a half-empty row.
- Evidence: `proof-chapter/current/w1024.png` (LARGE at x=97-159, y=337-369; blank under x=402-880), `.../current/w768.png` (TURBO/LARGE on row 2, y=395-430), `.../current/w1440.png` (empty right of workers, x=1206-1407, y=290-328)
- Shared: page-local
- Supersedes: PRC-5 (round 1 called it polish; it is visible and ranked looks wrong here)

### XPC-2 Why are the pin/copy/open buttons not at the table edge, and why do the columns jump between states?

- Page / state: proof-chapter / current vs preview-warnings vs preview-shorter (all Preview states)
- Widths: 1440, 1920, 1280, 1024 (theme: both)
- What is wrong: the three icon buttons end at x=1370 at 1440 while the table rule ends at x=1407 (37 px empty to their right; at 1920 the gap is 49 px: buttons end 1642, rule 1691). The column starts also change with content: Paragraphs starts at x=616 (default), 537 (preview-shorter) and 444 (preview-warnings); Why suggested at 962, 863 and 725; the buttons start at x=1254, 1259 and 1281. Three states, three different grids for the same table.
- Where: `src/studio/ui/src/components/proof/PreviewPanel.tsx:140-146` (no column widths; `Table` is `w-full` auto layout, so the last cell absorbs slack and the `flex items-center gap-1` wrapper at `:195` is left-aligned inside it)
- Severity: looks wrong
- Fix: add a `colgroup` with fixed widths (Chapter flexible, Paragraphs 11rem, Length 5rem, Words 5rem, Why flexible, actions `w-[8.5rem]`) and right-align the actions cell (`justify-end`).
- Evidence: `proof-chapter/current/w1440.png` (buttons x=1254-1370, rule to 1407, y=630-760), `.../preview-warnings/w1440.png` (buttons 1281-1397, Paragraphs x=444), `.../preview-shorter/w1440.png` (x=1259-1375)
- Shared: page-local (Table primitive has no column-width API)
- Supersedes: PRC-7

### XPC-3 Why does the table text start further in than the card title above it, and further in again in the pinned card?

- Page / state: proof-chapter / every Preview state; preview-pinned, preview-pin-stale; preview-computing/no-manuscript/nothing-eligible
- Widths: 1440, 1024, 768 (theme: both)
- What is wrong: "Preview" title and the table rule start at x=249, but the table header "CHAPTER" and the row names start at x=259 (10 px cell padding), so the text column is not aligned with the title or the rules above it. The pinned-preview inset card at x=249 puts its text at x=262 (13 px), a third value. In the loading / no-manuscript / nothing-eligible states the single line of text sits at x=249, so the text edge jumps 10 px when the table appears. The Compare card beside it uses 249 for text.
- Where: `src/studio/ui/src/components/primitives/Table.tsx` cells (`px-2.5`) inside `PreviewPanel.tsx:140` (table not outdented to cancel the cell padding); `PreviewPanel.tsx:231` (`InsetCard` padding)
- Severity: looks wrong
- Fix: pull the table out by the cell padding (`-mx-2.5`) so the first column's text lands on x=249, and give the pinned card the same inset or no inset card.
- Evidence: `proof-chapter/current/w1440.png` ("Preview" x=249 vs "CHAPTER" x=259, y=548/606), `.../preview-computing/w1440.png` (text at 249), `.../preview-pinned/w1440.png` ("Pinned preview" x=262, y=808)
- Shared: Table primitive cell padding; page-local usage

### XPC-4 Why do the chapter names wrap, and one row get twice as tall, when there is empty space beside them?

- Page / state: proof-chapter / preview-warnings, preview-shorter (1440); current (1024, 768)
- Widths: 1440, 1024, 768 (theme: both)
- What is wrong: at 1440 in preview-warnings "Chapter 2 — The Pool of / Tears" wraps to two lines (column ends x=430) while Paragraphs starts at x=444 and the Why column is wide, because the auto layout hands the width to the long warning text. That row is 100 px tall, preview-shorter's row is 83 px, against 47 px for ordinary rows, and the chapter name, numbers and the buttons are centred while the reasons text is top-stacked. At 1024 "Chapter 3 — A Caucus-Race and a / Long Tale" wraps and the reasons wrap to two lines per row; at 768 every chapter name and every reason wraps to 2-3 lines (rows 59-66 px) while the Paragraphs column (x=185-340) is mostly empty mono text.
- Where: `PreviewPanel.tsx:143-185` (no `whitespace` or width control on Chapter / Why cells; numeric cells `nowrap` mono at `:166`)
- Severity: looks wrong
- Fix: fixed column widths as in XPC-2 and give Why the flexible share; shorten the Paragraphs text ("1-24") below 1024.
- Evidence: `proof-chapter/preview-warnings/w1440.png` (y=625-722), `.../preview-shorter/w1440.png`, `.../current/w1024.png` (y=700-760), `.../preview-warnings/w768.png` (y=730-920)
- Shared: page-local

### XPC-5 Why is the Compare header a tower of one-word lines next to the step strip? (390)

- Page / state: proof-chapter / every state with the Compare card (current, never, `stage-*`, `render-*`, `compare-*`, `preview-*`)
- Widths: 390 (secondary) (theme: light)
- What is wrong: the title wraps to "Comp / are / the / recor / ding / with / the / script" in a column about 45 px wide beside the 3-step strip; the header is about 200 px tall and the word "recording" breaks mid-word.
- Where: `src/studio/ui/src/components/primitives/Panel.tsx:96-111` and `panelStyles.ts:20` (title `[overflow-wrap:anywhere]`, wrapper `flex-1 min-w-0`)
- Severity: looks wrong (390 only)
- Fix: give the title `min-w-[10rem]` / `basis-48` so the actions drop to a second row.
- Evidence: `proof-chapter/current/w390.png` (y=265-460, x=33-77), `.../compare-results-changed-since/w390.png`, `.../compare-running/w390.png`
- Shared: Panel / PanelHeader `actions`
- Supersedes: PRC-1

### XPC-6 Native takes: why are the buttons a screen away from the take they act on, and why do they have different widths and heights?

- Page / state: proof-chapter / native-takes-keeper, native-takes-unassigned
- Widths: 1440, 1024, 768 (theme: both; dark not opened)
- What is wrong: each row is play button at x=249, name at x=300, and the action pinned to the far right x=1305-1407, about 700 px of nothing between "Take 003" and "MARK KEEPER" at 1440 (hard to see which take a button belongs to; only a hairline joins them). Like items have different widths: "KEEPER ✓ (UNDO)" is 128 px (x=1279-1407) and "MARK KEEPER" 102 px (x=1305-1407), so their left edges are ragged. Heights in one row differ: the play button is 42x32, the keeper/Assign buttons 36, the Select 40.8 (row 3 at y=376-416 vs Assign 378-412), so rows are unequal (keeper rows 40-44 px tall, unassigned rows 49 px). The disabled ASSIGN is also paler than its select so the pair reads as one unfinished control. The play button is wider than tall, unlike every other icon button on the page (36x36).
- Where: `src/studio/ui/src/components/proof/NativeTakesPanel.tsx:122-132` (play `Button size="sm"` ghost), `:133-135` (`flex-1 truncate` name), `:136-146` keeper `Button`, `:157-185` Select + Assign
- Severity: looks wrong
- Fix: constrain the list to a table-like grid (play 36 sq, name, fixed-width action column); make the keeper toggle a fixed `min-w-[8.5rem]` and align Select and Assign to one height (`--control-height`).
- Evidence: `proof-chapter/native-takes-keeper/w1440.png` (rows y=250-415, buttons right edge x=1407), crops `S/crops/xpc/nk1.png`, `nk2.png`; `.../native-takes-unassigned/w1440.png` (select 1149-1333 vs Assign 1341-1407); `.../native-takes-keeper/w1024.png`
- Shared: page-local (Button size sm and Select heights are tokens)

### XPC-7 Proofing readiness looks like an afterthought: a tiny grey line, a lone WHY button, then a second unrelated section

- Page / state: proof-chapter / stage-panel-suggestions, `stage-panel-evidence-*`, render-none, render-chosen, render-measured, render-stale
- Widths: 1440, 1920, 1024, 768 (theme: both)
- What is wrong: the card is 1190 px wide at 1440 and everything in it sits in the left 200-250 px. The status is a 12 px grey line ("Can't tell yet: not checked yet") or a 20 px pill ("Suggested: Finalized"), with its actions on the next row (CONFIRM / DISMISS / WHY, 32 px high, smaller than the 36 px buttons of the Compare card); in the "not ready" state the only button is WHY on a row of its own. Below a rule, a bold "Rendered file" heading, its filename line, optionally a "Measured" line and the stale error, then CHANGE / CLEAR / MEASURE on yet another row. Related info is split across separate lines (file name, then measured date, then buttons) and the stale warning is a full-width red sentence in an otherwise grey card. This is the chapter's conclusion yet it is the last, plainest card, far from the compare run that produces its evidence.
- Where: `src/studio/ui/src/components/proof/ProofingStagePanel.tsx:52-70` (StageSuggestion then RenderAssociationSection stacked in one Panel), `RenderAssociationSection.tsx:33-60` (`space-y-2`, `flex flex-wrap gap-2`)
- Severity: looks wrong
- Fix: two columns at >=1024 (readiness status + actions left, Rendered file right), status line at 14 px with the action buttons on the same row as the status, one 36 px button size, filename + chosen + measured in one line.
- Evidence: `proof-chapter/render-none/w1440.png` (card y=622-884, content x=249-504), `.../stage-panel-suggestions/w1920.png` (pill y=874-894, buttons y=899-930), `.../render-stale/w1440.png`, `.../render-measured/w1024.png`
- Shared: StageSuggestion (also used on Home), page-local layout

### XPC-8 Vocabulary hints box: why does the wand button drop to the bottom row, and why do the hint sizes not match?

- Page / state: proof-chapter / compare-toast, compare-hints-pending-suggestions, compare-hints-chips, compare-hints-many-pills (wrapped); compare-hints-typing and the empty box
- Widths: 1440, 1024, 768, dark 1440 (theme: both)
- What is wrong: with two rows of pills the wand button sits at the bottom right (y=434 at 1440, box y=370-460), so it is vertically offset from the first row and the empty top-right corner (x=1333-1407, y=380-405) is blank; in a one-row box it is centred. Row spacing between pills is 14 px (rows at y=392 and 434) while the box's own top/bottom padding is 8 px, so the pills look loose inside the box. The empty-state sentence ("No hints yet - add one...", 12 px) and the inline input ("Add a term...", 14 px) are different sizes on one line; the typed draft ("Dawnspire") is 14 px sans next to mono pills. Accepted pills are 29-30 px tall and suggested (dashed) pills 28 px. The box is 54 px tall for a single row of 30 px pills.
- Where: `src/studio/ui/src/components/primitives/TagInput.tsx:91` (`flex min-h-11 flex-wrap items-center gap-2 p-2`, so rows and wand align by wrap order), `:97,:117` pill `py-[0.3rem]` vs the accepted-pill border, `:124` `text-xs` empty text vs `:135` `text-[0.88rem]` input
- Severity: looks wrong
- Fix: put the wand in its own fixed top-right slot (absolute or a two-column flex), use `gap-x-2 gap-y-1.5`, and use one text size for the empty text, the input and the draft.
- Evidence: `proof-chapter/compare-toast/w1440.png` (wand x=1362-1398, y=417-453), `.../compare-hints-many-pills/w1024.png` (wand y=458-494), `.../compare-hints-typing/w1440.png`; crop `S/crops/xpc/a.png`
- Shared: TagInput primitive

### XPC-9 Compare results: the card says "Compare" but shows one sentence; the warning sits apart from the button it affects

- Page / state: proof-chapter / compare-results-summary, compare-results-changed-since
- Widths: 1440, 768, 390, dark 1440 (theme: both)
- What is wrong: there are no results tables on this page: after a run the card collapses to one sentence ("2 discrepancies in Chapter 1 (1 more in other chapters).") and two buttons, with no link or button that takes the narrator to those discrepancies. In changed-since the sentence reads "Chapter 1: 2 discrepancies in Chapter 1" (track name repeats the chapter). The "REAPER project may have changed" warning is a separate second row at y=283, left, while the Export button it affects (disabled, pale) is at the right of row one (x=1104-1252); the disabled Export gives no visible reason. At 768 the buttons drop under the sentence, left-aligned, and the warning is a third row; the card height changes by 28 px between the two states, so the Preview card jumps.
- Where: `src/studio/ui/src/components/proof/CompareRun.tsx:491-540` (results block: `flex flex-wrap justify-between`, warning `<p>` outside the row), `:496-498` (`trackName` prefix)
- Severity: looks wrong
- Fix: put the warning in the same row as the buttons (or as a banner above them), add a "View in Notes" link next to the summary, drop the track-name prefix when it equals the chapter, show the disabled reason as text.
- Evidence: `proof-chapter/compare-results-changed-since/w1440.png` (y=230-300), `.../compare-results-summary/w1440.png`, `.../compare-results-changed-since/w768.png`
- Shared: page-local

### XPC-10 Compare options dialog is 1006 px wide for four short rows, with a Close button at the opposite corner from the X

- Page / state: proof-chapter / options-open
- Widths: 1440, 768, 390 (theme: light)
- What is wrong: at 1440 the dialog is x=217-1223 (1006 px) and everything is left-aligned in the first 430 px; x=650-1223 is blank on every row. Controls have unrelated widths: the chunk Select is 76 px wide and the hex inputs 128 px, so the left edge is shared (x=471) but the right edges are not. "Saved at once for this project..." sits 10 px above the first row while the rows are spaced 49 px. The footer has CLOSE at the bottom left (x=233) and a second X at the top right, two close controls at opposite corners. The dialog also covers the sidebar edge (x=217 vs sidebar border at 215).
- Where: `src/studio/ui/src/components/proof/proofOptions/` (dialog) via `ProofOptions` rendered at `CompareRun.tsx:433`; dialog width from the shared dialog primitive
- Severity: looks wrong
- Fix: cap the dialog around 32rem, give all controls one width, move the single close action to the footer right (drop the header X or the footer button).
- Evidence: `proof-chapter/options-open/w1440.png` (dialog x=217-1223, y=262-638), `.../options-open/w768.png`
- Shared: Dialog primitive and Options rows (also used by Preview options and other Proof tools)

### XPC-12 The title jumps between loading, error and loaded

- Page / state: proof-chapter / loading, load-failed vs every loaded state
- Widths: 1440, 768 (theme: light)
- What is wrong: loaded title "Proof - Chapter 1..." is at x=232, y=119 (under a breadcrumb). While loading, "Proof" is at x=232, y=83 and the skeleton blocks start x=232; on error it is x=468, y=107 in a centred 720 px column (card x=468-1188). At 768 the error card is inset 40 px (x=40) while loading and loaded content is 16 px. So three states, three left edges (232 / 468) and three title heights (83 / 107 / 119).
- Where: `src/studio/ui/src/components/proof/ProofChapterPage.tsx:132,144` (`mx-auto max-w-7xl` with `Heading` and no breadcrumb), `:128` (`LoadError` has its own centred container)
- Severity: looks wrong
- Fix: render the breadcrumb row and the title in the same wrapper for all three states and draw the error as a card inside it.
- Evidence: `proof-chapter/loading/w1440.png` (title y=83), `.../load-failed/w1440.png` (card x=468-1188, title y=107), `.../load-failed/w768.png`, `.../loading/w768.png`
- Shared: LoadError (all pages)

### XPC-13 The never-checked banner repeats what the pill beside the title already says

- Page / state: proof-chapter / never (and the two stacked info cards in `stage-panel-*` states)
- Widths: 1440, 768, 390 (theme: both)
- What is wrong: a title-less full-width card (x=232-1423, y=157-209) says "This chapter hasn't been checked yet. Run Check recording..." directly under a title row that already shows "NOT CHECKED YET" and a CHECK RECORDING button. A whole card (53 px) is used for one grey sentence, and in the stage-panel states (Chapter 9, no linked track) two such single-sentence cards are stacked ("No linked track" and "hasn't been checked yet") above the Compare card. At 390 the title row becomes three stacked lines (label, "as of last save", button) plus the banner repeating the same message.
- Where: `src/studio/ui/src/components/proof/ProofChapterPage.tsx:164-170` (`Panel` without title), `:156-163`
- Severity: looks wrong
- Fix: fold the sentence into the title row (as the pill's description) and merge the unlinked and unchecked messages into one status strip.
- Evidence: `proof-chapter/never/w1440.png` (y=157-209), `.../stage-panel-suggestions/w768.png` (two cards y=0-160), `.../never/w390.png` (y=250-322)
- Shared: page-local

### XPC-15 Compare "Start comparison" disabled with no visible reason

- Page / state: proof-chapter / compare-no-daw, native-takes-keeper, native-takes-unassigned (Built-in engine)
- Widths: 1440, 768 (theme: light)
- What is wrong: the button is pale (disabled) at x=1250-1407, y=453-487 with nothing near it saying why; the reason exists only as an aria description (the DOM scanner shows a `sr-only` span "Link a REAPER project (.rpp) f..."). A narrator sees a dead button next to a form they filled in.
- Where: `CompareRun.tsx:431-438` (`CapabilityGate` wraps the button; the reason is `sr-only` / tooltip)
- Severity: looks wrong
- Fix: show the reason as 12 px text left of the button.
- Evidence: `proof-chapter/compare-no-daw/w1440.png`, `.../native-takes-unassigned/w768.png` (y=827-862)
- Shared: CapabilityGate

### XPC-20 Preview collapses at 390: one word per line, columns off-screen

- Page / state: proof-chapter / every Preview state; preview-warnings, preview-shorter worst
- Widths: 390 (secondary) (theme: light)
- What is wrong: the table is 588 px wide inside a 324 px scroll box. Chapter column is about 65 px ("Chapter / 1 - / Down / the / Rabbit- / Hole"), Words, Why and the action buttons are off-screen, and in preview-warnings the table is scrolled left (x=-77) so the Chapter column is not visible at all and the Why column wraps a warning into a 440 px tall row of 70 px lines.
- Where: `PreviewPanel.tsx:140-141` (`overflow-auto` around an unconstrained `Table`)
- Severity: looks wrong (390 only)
- Fix: below 600 px render candidates as stacked cards.
- Evidence: `proof-chapter/compare-results-changed-since/w390.png` (y=530-840), `.../preview-warnings/w390.png`, `.../render-stale/w390.png` (y=50-460)
- Shared: page-local
- Supersedes: PRC-3

### XPC-11 Stage slide-over: narrow close button, no dimmed page, two-line title pushes everything down

- Page / state: proof-chapter / stage-panel-evidence-recommended, -not-ready, -unknown
- Widths: 1440, 768, 390, dark 1440 (theme: both)
- What is wrong: the X at the top right is about 26x35 (x=1397-1422, y=17-52), narrower than the square 36 px X on the dialog. The slide-over title is a 14 px bold two-line string ("Stage suggestion: Chapter 9 - The Mock Turtle's Story") in a 68 px header, in a different type style from every card title and from the dialog title (`Compare options`). The page behind is not dimmed or inert-looking (the Options dialog dims it), so page text stays crisp and clipped at x=1120 mid-word ("Starts and ends on paragraph", "Last narrated tak"). In the recommended state CONFIRM FINALIZED (135 px) and DISMISS (70 px) sit left, fine, but WHY-opened content ends at y=530 and the rest of the 900 px column is blank.
- Where: slide-over component used by `StageEvidence` (`src/studio/ui/src/components/stages/`), cause not located in detail
- Severity: polish
- Fix: reuse the dialog header (36 px square close, same title style), add the scrim.
- Evidence: `proof-chapter/stage-panel-evidence-recommended/w1440.png` (X at 1397-1422, y=17-52), `.../w768.png`, `dark:proof-chapter/stage-panel-evidence-not-ready/desktop.png`
- Shared: StageEvidence slide-over

### XPC-14 Compare step strip looks like tabs but does nothing, and is the only sentence-case control in the row

- Page / state: proof-chapter / every Compare state
- Widths: 1440, 768 (theme: both)
- What is wrong: "1 - Setup / 2 - Running / 3 - Results" is drawn as a segmented toggle (same box and fill as the QUIET / NORMAL / VERBOSE and model buttons), but it is inert (`onChange` is a no-op) and it uses sentence-case 12 px type where every other toggle in the card is uppercase condensed. A narrator will click it. Strip height is 32 px in a 56 px header, its right edge x=1407 matches the card, fine. May be intended as a status display.
- Where: `src/studio/ui/src/components/proof/CompareRun.tsx:306-324` (`ToggleGroup look="segmented"` with `onChange={() => {}}`)
- Severity: polish (may be intended)
- Fix: draw it as a non-interactive step indicator (no button borders, numbered dots) or make the completed steps clickable.
- Evidence: `proof-chapter/compare-results-summary/w1440.png` (x=1143-1407, y=168-200); crop `S/crops/xpc/b.png`
- Shared: ToggleGroup `look="segmented"`

### XPC-16 "Last narrated take" link reads as a footnote on the far right, away from Start

- Page / state: proof-chapter / every setup state
- Widths: 1440, 1920, 1280, 1024, 768 (theme: both)
- What is wrong: the only way to reopen the previous results is a 12 px underlined grey link at the top right of the card (x=1030-1407, y=237), on the same row as the 12 px description and far from the Start button at the bottom right; it is long (about 380 px) and includes a locale timestamp ("9/15/2026, 2:30:00 PM"). At 768 and 390 it drops under the description and wraps mid-timestamp ("9/15/2026, / 2:30:00 PM"). The description line is 12 px while the field labels below are 13 px.
- Where: `CompareRun.tsx:332-345` (`flex flex-wrap items-center justify-between gap-2 text-xs`, `Button variant="link"`)
- Severity: polish
- Fix: make it a secondary button beside Start comparison ("Review last run") with the timestamp as its caption.
- Evidence: `proof-chapter/current/w1440.png` (y=230-245), `.../current/w390.png` (y=535-565)
- Shared: page-local

### XPC-17 Page is capped at 1280 px and centred while the rest of the shell runs full width

- Page / state: proof-chapter / all states
- Widths: 1920 (theme: light)
- What is wrong: at 1920 the title and cards sit at x=428-1708 with empty bands of 213 px (left of the page content, from the sidebar edge at 215) and 212 px on the right; the breadcrumb and title therefore sit 196 px right of where they sit on the Proof list (x=233). The setup grid then stretches its thirds over 1246 px so the workers column is only 172 px of 415.
- Where: `ProofChapterPage.tsx:132,144,155` (`mx-auto max-w-7xl`)
- Severity: polish
- Fix: same cap on Proof and Pickups, or drop it.
- Evidence: `proof-chapter/current/w1920.png` (title x=428)
- Shared: page-width convention
- Supersedes: PRC-4

### XPC-18 Live activity log has square corners and sits 6 px under its toggle

- Page / state: proof-chapter / compare-running
- Widths: 1440, 768, 390 (theme: light)
- What is wrong: the log box (x=249-1407, y=331-475) is square-cornered next to rounded buttons and cards; it starts 6 px below the QUIET/NORMAL/VERBOSE row (y=289-325) while the progress bar above is 14 px under its sentence. The log's first line has a full-width bottom rule that doubles with the box border. The "Live activity" caption and toggles use 36 px buttons so the caption is not centred on the bar (it is, y=307; the toggles are heavy for a log filter).
- Where: `CompareRun.tsx:463` (`border`, no radius; `mb-1.5` between header and box)
- Severity: polish
- Fix: add the field radius and `mb-2`; drop the last-row rule.
- Evidence: `proof-chapter/compare-running/w1440.png` (corners at x=249/1407, y=331/475)
- Shared: page-local
- Supersedes: PRC-6

### XPC-19 Title row: status text and button are 3 px off the title's centre line

- Page / state: proof-chapter / all loaded states
- Widths: 1440, 1280, 1024 (theme: both)
- What is wrong: title text centre y=119, "CHECK CURRENT as of last save..." text y=122 and the CHECK AGAIN button y=104-140 (centre 122): the right group is 3 px lower than the title. At 768 the group wraps below the title, left-aligned, with 16 px free on its right.
- Where: `ProofChapterPage.tsx:157-162` (`items-start` outer row, right group `items-center`)
- Severity: polish
- Fix: `items-center` on the outer row, or align both to the title baseline.
- Evidence: `proof-chapter/current/w1440.png` (y=104-140)
- Shared: page-local

### XPC-22 Pinned preview card: viewport-clipped capture hides its controls; inset card text does not line up with the table

- Page / state: proof-chapter / preview-pinned, preview-pin-stale
- Widths: 1440, 1024, 768 (theme: light)
- What is wrong: the pinned card sits 12 px under the table with its own border and 13 px inset, so there is a card inside a card with a different text edge than the table above (x=262 vs 259 vs 249); the "Pinned preview" heading is 14 px bold, the close X is a 36 px button in a 24 px line so the heading row is 52 px. The stale message in pin-stale (y=840) is 14 px warn text above the range line, while the range line and reasons are 14 and 12 px: three text sizes in 60 px. The Start/End +/- buttons are below the capture at every width, so I could not check their grid.
- Where: `PreviewPanel.tsx:229-306`
- Severity: polish
- Fix: capture the page fully for these states; once visible, give the +/- controls a fixed 2x2 grid.
- Evidence: `proof-chapter/preview-pinned/w1440.png` (y=777-900), `.../preview-pin-stale/w1440.png`
- Shared: page-local

### XPC-23 Hairline rules double up inside the Compare card

- Page / state: proof-chapter / every setup state
- Widths: 1440, 1024, 768 (theme: both)
- What is wrong: the hints box has a border at y=422 and, 17 px lower, a full-width rule at y=439 above the Start button, so two near-parallel horizontal lines frame an empty strip; the Start button then sits alone, right-aligned, in a 62 px band under that rule. The first strip under the hints box is blank except for the rule.
- Where: `CompareRun.tsx:428` (`border-t pt-3` footer under `space-y-4`)
- Severity: polish
- Fix: drop the rule or put Start in the same row as "Last narrated take".
- Evidence: crop `S/crops/xpc/a.png` (y=520-600 of the 2x crop), `proof-chapter/current/w1440.png` (y=422-440)
- Shared: page-local
