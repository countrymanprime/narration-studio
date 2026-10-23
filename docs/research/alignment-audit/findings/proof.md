# Proof: alignment findings

Part of the [alignment audit](../../alignment-audit.md). Findings are grouped by the round that produced them; a later round's finding that replaces an earlier one says `Supersedes`. Evidence paths are `<page>/<state>/<width>.png` of the light capture, `dark:<page>/<state>/<viewport>.png` for dark, `tall:<page>-w<width>.png` for the below-the-fold captures; the images are not committed (regenerate the repo-viewport ones with `pnpm --dir apps/ui visual:page <page>`).

## Round 4: gap fill

### R4TB-5 Proof's read-only Script and Heard boxes are drawn as text fields

- Page / state: proof / default, Inspector (selected note)
- Widths: all (theme: both)
- What is wrong: "are these two inputs I can type in?" "Nothing in the script" and "liceA" sit in 30 px tall boxes with a 1 px border, surface fill and 8 px padding, identical to the "Note with the decision" textarea 150 px below; the Heard value is bold and underlined so it also looks like a link, and the empty case is grey placeholder-style text ("Nothing in the script"). Nothing tells the narrator these are quotes, not fields.
- Where: `apps/ui/src/components/proof/inspector/Inspector.tsx:39-45` (`<p>` with `rounded border bg-[var(--surface)] px-2 py-1.5`)
- Severity: polish
- Fix: draw quotes as a left-ruled blockquote on the card background (no border/box), keeping the box only for editable fields.
- Evidence: `S/tall/proof-w768.png` x 30-740, y 1560-1700; `S/tall/proof-w1440.png` (chunk 0, inspector x 1045-1420, y 160-250)
- Shared: page-local

### R4TB-6 Three mark styles in Script vs heard, no key, and the dashed box looks like a button

- Page / state: proof / default, notes table, "Script vs heard" column
- Widths: all (theme: both)
- What is wrong: "why is one word boxed, one squiggled, one dotted?" Rows show a red wavy underline on a pink wash (Misread), a dashed red outline around "Oh dear!" (Skip) and a blue dotted underline under "White Rabbit" (Pronunciation); the Type chip beside each already says which it is, so the marks repeat the type in a different, unlabelled code, and the dashed box with a 4 px radius looks like a focusable control or a tag. May be intended as the reader's mark language; if so the table needs no second code and the dashed one reads as an input.
- Where: `apps/ui/src/components/primitives/Highlight.tsx:53-59` (`Misread: 'wavy'`, `Skipped: 'dotted'`, `Restart: 'dashed'`)
- Severity: polish
- Fix: keep underline-only marks in the table (drop the boxed outline) or add a one-line key under the filter chips.
- Evidence: `S/crops/r4tb/p-table.png` (1.1x zoom of the notes table, rows 1-4)
- Shared: `Highlight` primitive

## Round 3: coverage gaps and scanner cross-check

### R3PF-1 The takes view draws the same take twice and the waveform disappears under it

- Page / state: proof / takes-lanes and evidence-changed (the `Takes at this spot` view)
- Widths: w1920, w1280, d1024, d768 (also w1440 per XPF-15) (theme: both)
- What is wrong: "why did my waveform stop halfway, and why does it say 'Take 1 - Kept' twice?" At 1920 the waveform runs from x=249 to x=706 and then a 785x75 pale green box labelled "Take 1 - Kept" (y=484-558) covers the rest of the trace; 28 px below it a second, thin green bar (y=580-598) carries the same label "Take 1 - Kept", and under that sit three unlabelled grey bars of different lengths (y=604-626). One take is drawn as a tall overlay on the trace and again as the labelled band of the lanes; the grey bars are the other three takes with no name or length.
- Where: `components/proof/ProofPage.tsx:365-370` (`bands` passes the active take to the waveform, tone `ok`) and `components/proof/spot/TakeLanes.tsx:31-37` (the same take drawn again as a labelled `h-5` band), lanes at `TakeLanes.tsx:42-53` (6 px bars, label only in `title`)
- Severity: looks wrong
- Fix: draw the active take once (the labelled band, thin, under the trace) and let the waveform show through; give each other lane its name ("Take 2") at the left edge of its bar, not in a tooltip.
- Evidence: `proof/takes-lanes/w1920.png` x=240-1490, y=480-630; crop `crops/r3pf/tl1920.png`; `dark:proof/takes-lanes/small-desktop.png` y=455-600
- Shared: page-local (Proof waveform)
- Supersedes nothing: extends XPF-15 ("takes view is unlabelled")

### R3PF-2 Locked pages look unlocked when the rail collapses

- Page / state: proof and pickups / no-manuscript (every page behind a manuscript)
- Widths: w1280, w1024 (any width under 1360) (theme: both)
- What is wrong: "why does this nav look fully enabled when the project has no manuscript?" At 1920 every item except Production has a lock icon at x=184; at 1280 and in dark 1024 the same nav shows ten identical icons with no lock, and the current page icon (Proof or Pickups) is highlighted although it is locked. A narrator on a laptop is told nothing about which stages are unavailable. The same rule hides the badge counts (Proof 4, Pickups 3) in the rail.
- Where: `components/layout/AppShell.tsx:285` - `max-[1360px]:[&_button>span]:invisible` hides every span in a nav button including the lock and the count; they appear only on hover
- Severity: looks wrong
- Fix: keep the lock and count visible in the collapsed rail (overlay the lock on the icon corner and the count as a dot) and dim the locked icons.
- Evidence: `proof/no-manuscript/w1920.png` (locks, x=184) vs `.../w1280.png` (none); `dark:proof/no-manuscript/small-desktop.png`; `pickups/no-manuscript/w1280.png`
- Shared: `AppShell` rail

### R3PF-3 The check card's third "stat" is an unlabelled sentence aligned to the labels, not the values

- Page / state: proof / chapter-no-recording, check-never, check-stale, check-checking, chapter, evidence-changed
- Widths: w1280, w1440, w1920, d1024, d768 (theme: both)
- What is wrong: "why is 'Not checked yet' up next to the little caption instead of beside the number?" RECORDED and SCRIPT ESTIMATE are caption-over-value pairs (caption y=238, value y=261 at 1920). The third column is 14 px plain text with no caption whose first line sits at y=240, level with the captions, so it reads as a third caption with no value; in check-stale it is three lines (y=240/264/288) that run past the pair's bottom. In check-checking the same column holds "Checking the recording against the script..." plus the bar, so its meaning changes by state while the two stat blocks stay put.
- Where: `components/proof/checkcard/CheckCard.tsx:249-275` - `grid sm:grid-cols-[auto_auto_1fr]`, third cell `flex-col gap-1 text-sm` with no caption and `items-start` alignment
- Severity: looks wrong
- Fix: give the third cell a caption ("Last check") and put its first line on the value row, or move the sentence under the two stats on its own row.
- Evidence: `proof/check-never/w1920.png` x=266-575, y=230-272; `proof/check-stale/w1920.png` y=230-300
- Shared: page-local

### R3PF-4 The load-error toast repeats the card, its dismiss target is 17x20 and its edge stripe is square on a rounded box

- Page / state: proof / load-error (pickups unreadable has no toast, but the same primitive appears in pickups empty)
- Widths: w1920, w1280, w1024, w768, d1024, d768 (theme: both)
- What is wrong: "why does it tell me the same sentence twice?" The card says "The app received data it could not read." and the toast at the bottom right (x=1569-1900, y=1007-1051 at 1920) says it again word for word. Its close X is a 17x20 target (scanner H1) at x=1867-1884, and the red left stripe is a 4 px border on a rounded box so its corners curve and the stripe looks chipped (visible in dark, where the toast is a bright cream block on the dark page).
- Where: `components/primitives/Toast.tsx:53,72` - `border-l-4` on `rounded-[var(--radius-button)]`, `<button aria-label="Dismiss message" className="flex-none">` with no padding
- Severity: looks wrong
- Fix: do not toast a failure the page already shows in place; give the dismiss button the 32 px `IconButton` size and put the stripe on an inner element.
- Evidence: `proof/load-error/w1920.png` (card y=137-293, toast y=1007-1051); `dark:proof/load-error/tablet.png` x=417-748, y=950-996
- Shared: `Toast` primitive
- Scanner: H1 `button.flex-none("Dismiss message")` 17x20.4

### R3PF-5 The chapter strip's tiles are 19 px wide targets at 390 and "Open" and "Close" overhang them

- Page / state: proof / default, empty, find-open, note-thread, notes-filtered (all states with the strip)
- Widths: w390 (theme: light) - secondary width
- What is wrong: "I can't tap one chapter tile, they are slivers." Fourteen buttons are 19.4x54 each (x=33 to 357, one per 23.4 px), "Open" and "Close" are 28 px words in 19 px tiles, and "12" touches "Close" (`12Close`). The picture is in XPF-11; the new fact is that the tiles are the chapter navigation and are far under a 24 px hit area.
- Where: `components/proof/frame/ChapterStrip.tsx:36-45` - 14 `flex-1` tiles with no minimum width and no scroll
- Severity: looks wrong (390 only)
- Fix: below 600 px make the strip a horizontally scrolling row of 40 px tiles, or a select.
- Evidence: `crops/r3pf/strip390.png` (from `proof/default/w390.png` y=60-390)
- Shared: page-local
- Scanner: H1 x14 `button.flex.min-w-0.flex-1.flex-col`

### R3PF-8 One action, three names: Cancel in the card, Stop in the dialog, and a close X; and the two progress bars look unrelated

- Page / state: proof / check-checking
- Widths: w1920, w1280, d1024, d768 (theme: both)
- What is wrong: "which button stops it?" While a check runs the card shows CANCEL (x=1405, y=150) and the dialog on top shows STOP (x=307, y=595) and an X (x=1595, y=464); Cancel stops the run, Stop asks "Stop checking?", X closes the dialog and leaves the run going. The two progress bars are different objects: 14 px orange on a grey track with "0%" in the card, 6 px orange on a near-white track with a 4 px dot in the dialog. At 1920 the card bar already shows a 39 px fill beside the label "0%". The dialog is 1342 px wide at 1920 for one name and one 176 px bar, so the bar is 800 px from the name it belongs to (XPF-18 measured 480 px at 1440).
- Where: `components/proof/checkcard/CheckCard.tsx:259-264` (`ProgressBar running`), `components/recordingcheck/RunningView.tsx:19-36` (`w-[11rem]` bar, `Stop`), `CheckRecordingsDialog.tsx:120-132`
- Severity: looks wrong
- Fix: one verb ("Stop checking") in one place (the dialog), a determinate-looking bar that starts empty, and a dialog capped at about 560 px for the running view.
- Evidence: `proof/check-checking/w1920.png` x=289-1631, y=432-648 and card y=150-240; `dark:proof/check-checking/small-desktop.png`
- Shared: page-local; the dialog also opens from Pickups and Proof chapter

### R3PF-6 Waveform pins are 12 and 16 px targets, top-aligned so unequal dots do not share a centre line

- Page / state: proof / chapter, takes-lanes, evidence-changed
- Widths: all (theme: both)
- What is wrong: "why is the big dot lower than the small ones?" The pins are round buttons of 16 px (selected) and 12 px (others) all `top-0`, so their centres differ by 2 px (the large pin at x=253, y=467 hangs below the 249 and 497 pins) and the 12 px pins are the only way to select a note on the waveform.
- Where: `components/proof/frame/WaveformWindow.tsx:264,276-282` - `absolute top-0 ... -translate-x-1/2` with a size that changes with selection
- Severity: polish
- Fix: anchor pins on `top-1/2 -translate-y-1/2` in a 24 px wrapper so the dot grows around one centre and the target stays 24 px.
- Evidence: `crops/r3pf/tl1920.png` x=10-590, y=85-100
- Shared: page-local
- Scanner: A7 `div[role=group]("Chapter waveform")`, H1 x3 pins

### R3PF-7 The REAPER status chip is a 67x22 target on every page

- Page / state: proof and pickups / every state (top bar)
- Widths: w1920, w1440, w1280 (theme: both)
- What is wrong: "the REAPER pill looks like a status and is a button, but it is short." The linked chip is 22 px tall, below the 32 px of the search field beside it, so the top bar has a 32 px field and a 22 px button on the same centre line.
- Where: top-bar chip, `button.inline-flex.h-[1.375rem]` in `components/layout/` (shell)
- Severity: polish
- Fix: pad it to the 32 px `sm` height (the painted pill can stay 22 px).
- Evidence: `proof/empty/w1920.png` x=1833-1900, y=15-37
- Shared: app shell top bar
- Scanner: H1 `button.inline-flex.h-[1.375rem]("REAPER: Linked")`

### R3PF-9 The evidence-changed panel shows identical Before and Now text and greys the decision buttons without saying why

- Page / state: proof / evidence-changed
- Widths: w1920, w1280 (theme: light; dark inherits) (may be fixture data)
- What is wrong: "what changed? I can't see a difference." BEFORE "a white rabbit with pale eyes" and NOW "a white rabbit with pale eyes" are the same string, so the panel gives the narrator nothing to decide on; below it the four decision buttons are greyed (y=950-1038 at 1920) and nothing next to them says they wait for "Use the new evidence".
- Where: `components/proof/inspector/` evidence block (cause not found: the fixture and the disabled reason are not shown in the markup)
- Severity: polish
- Fix: mark the differing words (the existing strike and underline treatment from SCRIPT and HEARD) and put the reason under the disabled buttons.
- Evidence: `proof/evidence-changed/w1920.png` x=1541-1887, y=120-335 and y=950-1040
- Shared: page-local

### R3PF-10 "To review" pills and the Resolution column nearly vanish on the selected row

- Page / state: proof / default, find-open, notes-filtered, note-thread, evidence-changed, takes-lanes
- Widths: all (theme: both, worst in dark)
- What is wrong: "what are those faint capsules?" The "To review" pill is a grey (#efece6-like) capsule 134 px wide on a near-same cream row, and in dark a charcoal capsule on the charcoal row (d1024 y=428); on the selected row it is darker than its surroundings by almost nothing. The Resolution cell is the main output of the table and it is the weakest thing in it, next to the saturated MISREAD chip.
- Where: `components/proof/notes/NotesTable.tsx` resolution cell (pill fill = `--surface-2` family)
- Severity: polish
- Fix: give the undecided pill a 1 px border or a text-only treatment, and keep fills for decided states (Waive, Pickup, Edit).
- Evidence: `crops/r3pf/pill.png` (from `dark:proof/default/small-desktop.png` x=700-1008, y=400-670); `proof/notes-filtered/w1920.png` x=1311-1445
- Shared: `Pill` and table cell

### R3PF-11 In the collapsed rail the theme toggle (a sun) and Settings (a gear) look like twins

- Page / state: proof and pickups / every state in dark
- Widths: d1024 (and w1280 in light with a moon and a gear) (theme: dark)
- What is wrong: "which of these two is settings?" The two last rail icons are a toothed sun (theme, y=708) and a toothed gear (settings, y=750) of the same weight and size, 42 px apart; in the collapsed rail there is no label and the two read as a repeated icon.
- Where: `components/layout/AppShell.tsx:285` rail footer (icons only below 1360)
- Severity: polish
- Fix: switch the dark-mode icon to a half-filled circle, or separate the two with the divider the rail already uses between groups.
- Evidence: `crops/r3pf/rail.png` (from `dark:proof/default/small-desktop.png` x=0-64, y=680-768)
- Shared: app shell rail

### R3PF-12 Two filled chips look "selected" at once

- Page / state: proof / chapter, takes-lanes, evidence-changed
- Widths: w1920, w1280, d1024, d768 (theme: both)
- What is wrong: "I filtered by All and by In view, which one is on?" The chip row shows "All 4" and "In view" both as solid dark chips (y=677 at 1920, x=359 and x=794) while the other four chips are outlined; the first five chips are an exclusive filter, "In view" is a separate toggle on the waveform window but is drawn identically and sits at the end of the same row.
- Where: `components/proof/notes/NotesPanel.tsx:181-189` - the same `Pill look="filter"` used for the exclusive chips and the window toggle
- Severity: polish
- Fix: set the toggle apart (a gap and a leading icon, or a checkbox-style switch) or put it in the toolbar with the sort select.
- Evidence: `proof/takes-lanes/w1920.png` x=359-867, y=662-692
- Shared: `Pill`

### R3PF-13 The "4 TAKES" chip floats inline after a sentence of variable length

- Page / state: proof / chapter, evidence-changed, takes-lanes
- Widths: w1920, w1440, d768 (theme: both)
- What is wrong: "why does that little chip sit in a different place on each row?" "4 TAKES" follows the sentence in the Script vs heard cell, so it is at x=933 on row 2 and x=621 on row 3 (1920 takes-lanes), and at 768 it drops under the wrapped line with the sentence's last word.
- Where: `components/proof/notes/NotesTable.tsx` script-vs-heard cell appends `TakesBadge` (`components/proof/spot/TakesBadge.tsx`)
- Severity: polish
- Fix: right-align the chip in the cell or give it its own narrow column next to From.
- Evidence: `proof/takes-lanes/w1920.png` x=480-990, y=840-895; `dark:proof/chapter/tablet.png` y=815-890
- Shared: page-local

### R3PF-14 Two date formats in one view

- Page / state: proof / check-stale (and every check card) vs note-thread
- Widths: all (theme: both)
- What is wrong: "why does one say Sep 21, 2026 and the other Oct 21 with no year?" The check card writes "As of last save · Sep 21, 2026, 10:00 AM", the note thread writes "Oct 21, 04:09 AM" (no year, 2-digit hour); the thread's author label also shows the date in a 12 h clock with a leading zero.
- Where: `components/proof/inspector/FindingThread.tsx:21` (`{ day, month, hour, minute }`) vs the check card's as-of text
- Severity: polish
- Fix: one shared stamp formatter.
- Evidence: `dark:proof/note-thread/small-desktop.png` x=887-982, y=525-535; `proof/check-stale/w1920.png` y=288
- Shared: page-local

### R3PF-15 "Local AI compare · 0.90" breaks at its own separator

- Page / state: proof / default, find-open, notes-filtered, note-thread
- Widths: w1280, w1024, w768, d1024, d768 (theme: both)
- What is wrong: "why does the dot end one line and the number start the next?" The From cell is plain text `from · score`; at 1280 it wraps to "Local AI compare" and "· 0.90" with the dot leading the second line, at d1024 the dot ends the first line; the cell is 113 px while the Resolution column beside it keeps ~100 px empty. Near the same seam the sentence column wraps a closing quote to a third line ("eyes”" alone, w1024).
- Where: `components/proof/notes/NotesTable.tsx:51` - `` `${row.from} · ${row.confidence.toFixed(2)}` `` as one string
- Severity: polish
- Fix: two spans, source on the first line and the score in `font-mono` on its own line, with `whitespace-nowrap` on the score.
- Evidence: `proof/find-open/w1280.png` x=602-698, y=455-490; `dark:proof/default/small-desktop.png` x=718-820, y=410-435
- Shared: page-local; extends XPF-4

### R3PF-16 At 1920 the no-manuscript card is 1670 px wide around a 400 px message

- Page / state: proof and pickups / no-manuscript
- Widths: w1920, w1440, w1280 (theme: both)
- What is wrong: "why is a three-word screen in a huge empty box?" The card spans the whole content width (x=233-1903, 242 px tall) with the title, one sentence and the Import button centred in it; load-error uses a 720 px column instead (XPF-26 has the frame mismatch).
- Where: no-manuscript frame (page-local `max-w` missing)
- Severity: polish
- Fix: cap at the 720 px column used by load-error.
- Evidence: `proof/no-manuscript/w1920.png` y=69-310
- Shared: shared empty-state frame

### R3PF-17 The 390 keyboard-shortcut bar covers two rows of a touch-width page

- Page / state: proof / every state
- Widths: w390 (theme: light) - secondary width
- What is wrong: "why is there a keyboard cheat sheet over my screen on a phone?" A fixed two-row bar (y=788-844, 56 px, about 7 % of the screen) lists the arrow keys, P, E, W, D, X, Ctrl Z; it permanently covers the bottom of the card (check-stale: the IN THE AUDIO chips are cut at y=790).
- Where: `components/primitives/KeyHint.tsx` bar (fixed bottom) with page hints in `components/proof/hints.ts`
- Severity: polish
- Fix: hide the bar under 860 px.
- Evidence: `proof/check-stale/w390.png` y=788-844
- Shared: `KeyHint`

## Round 2: strict review

### XPF-1 Find box pokes out of the card and the toolbar loses its buttons

- Page / state: proof / find-open (any state where Find is open)
- Widths: w390 (theme: light)
- What is wrong: "why is the search box hanging off the right side of the card?" The 176px field plus its clear button runs to x=389 while the card edge is x=375, so the clear X sits on the card border, and the search, export and Proofer-sheet buttons are not on screen at all.
- Where: `components/proof/notes/NotesPanel.tsx:192-210` - toolbar is `flex items-center gap-1.5` with no wrap and the field has a fixed `w-44`.
- Severity: breaks use
- Fix: `flex-wrap` on the toolbar and `min-w-0 flex-1` on the field below 860px.
- Evidence: `proof/find-open/w390.png` (toolbar row y=430-465, x=215-389)
- Shared: page-local
- Supersedes: PRF-1

### XPF-2 Check recordings dialog hides half its form with no hint it scrolls

- Page / state: proof / check-recordings-dialog (same dialog from Pickups and Proof chapter)
- Widths: w1440, w1024, w768, w390 (theme: both)
- What is wrong: "why does this dialog end in the middle of a sentence?" At 1440 the left column stops after "...Chapters share the" (y~650, text cut) and "Chapters at once" is missing; at 1024 the Parallel workers label is cut at the body edge (y~535) with its slider, checkbox and hint hidden; at 768 a half line is cut at y~715; at 390 the whole Chapters column, Parallel workers and the hint are not visible. The chapter list is a second, nested scroller (half line "Checked, as of last save" cut at y=530 at 1024). At 1920 everything fits, which shows how much is hidden.
- Where: `components/recordingcheck/CheckRecordingsDialog.tsx:165-167` (`max-h-[calc(80dvh-8rem)]` + `overflow-y-auto`, no edge shadow), `:184` (inner `overflow-y-auto` list)
- Severity: looks wrong
- Fix: add a scroll-edge shadow, scroll the whole body once (drop the inner list scroller), and use up to 90dvh.
- Evidence: `proof/check-recordings-dialog/w1440.png` (x=235-660, y=600-650), `.../w1024.png` (y=520-545), `.../w768.png` (y=690-715), `.../w390.png`, `.../w1920.png` (full form)
- Shared: Dialog body with nested scroller
- Supersedes: PRF-6

### XPF-3 The progress ring is a blank gap

- Page / state: proof / every state with notes (default, chapter, chapter-no-recording, evidence-changed, find-open, note-thread, notes-filtered, takes-lanes)
- Widths: all (theme: both)
- What is wrong: "why is there an empty circle before '1 of 5 cleared'?" The 36px ring shows only a faint speck or hairline circle (x=825-840, y=88-100 at 1440) and leaves a 44px hole; at 390 the stat line starts at x=77 instead of the title's x=33. In dark it is equally invisible (`dark:proof/default/desktop.png` x=830).
- Where: `components/proof/frame/ProofHeader.tsx:25` - `mask: radial-gradient(circle, transparent 70%, #000 71%)` defaults to farthest-corner so the hole is bigger than the ring.
- Severity: looks wrong
- Fix: `radial-gradient(circle closest-side, transparent 70%, #000 71%)`.
- Evidence: `S/crops/xpf/a.png` (right of the header), `proof/chapter-no-recording/w1440.png` (x=807-843, y=86-122), `.../default/w390.png` (y=152)
- Shared: page-local
- Supersedes: PRF-4

### XPF-4 Notes table columns are sized by their content, so rows wrap while columns sit half empty

- Page / state: proof / default, chapter, chapter-no-recording, find-open, notes-filtered, note-thread
- Widths: w768-w1920 (theme: both)
- What is wrong: "why does this row wrap onto two lines when there's a gap right next to it?" At 1440 the Script vs heard text wraps at x~735 and From wraps "Local AI compare / 0.82" while Time (243-318) and Type (318-430) are padded far past their content and the Resolution pill is stretched to 134px wide with ~35px of empty pill either side of "To review". Rows end up 39, 52, 39, 39px. The columns also move between states: Type starts x=318 in default but x=325 in chapter-no-recording, Script vs heard x=430 vs 448, From x=761 vs 705, Resolution x=883 vs 868. At 1920 the Resolution pill ends at x=1445 and 60px of blank row remains to the right edge.
- Where: `components/proof/notes/NotesTable.tsx:136-143` (auto table layout, `min-w-[40rem]`, `FixedChip ch={RESOLUTION_CHIP_CH}` at `:127`) - no colgroup widths.
- Severity: looks wrong
- Fix: set explicit column widths (Time 80, Type 100, From about 190 with a nowrap source and a separate score, Resolution 110) and let Script vs heard take the rest.
- Evidence: `S/crops/xpf/d1.png` (full table at 2x), `proof/chapter-no-recording/w1440.png` vs `.../default/w1440.png` (header y=386 vs 621), `.../default/w1920.png` (y=346-640)
- Shared: Table / tableStyles (also pickups, XPK-3)

### XPF-5 The note thread squeezes each message into a 135px strip

- Page / state: proof / note-thread (any note with comments)
- Widths: w1440, w1920 (wrapped to three lines); w768/w1024 (one line, but edit and delete drop under the date) (theme: both)
- What is wrong: "why is a three-line comment wrapped in a narrow column when the card is twice that wide?" At 1440 the message sits at x=1146-1280 (about 135px) between a 68px author label and the date/button column, so "Is the room or a misread? Ask the proofer." takes three lines; the date and the two 28px icon buttons stack in the right column, buttons below the date. The author label ("YOU" y=599, "PROOFER" y=680) sits 2-3px above the first text line's baseline. The two rows are 74 and 62px tall.
- Where: `components/proof/inspector/FindingThread.tsx:53` (`grid-cols-[68px_minmax(0,1fr)_auto]`; the `auto` column at `:57-62` holds date plus buttons)
- Severity: looks wrong
- Fix: header line (author left, date and actions right) over a full-width message.
- Evidence: `S/crops/xpf/d2.png`, `proof/note-thread/w1440.png` (x=1061-1407, y=585-730), `.../w1920.png`
- Shared: page-local

### XPF-6 Add-note row: a short button hanging off a tall box, and a segmented control that does not look segmented

- Page / state: proof / every state with an inspector (default, chapter, find-open, note-thread, notes-filtered, empty rows)
- Widths: w1280-w1920 side-by-side; w768-w1024 same row, wider (theme: both)
- What is wrong: "why is the Add note button stuck to the top of that box and so small?" The textarea is 58px tall (y=655-713) and the disabled ADD NOTE button 32px (y=655-686), top-aligned, so there is a 27px notch below it. Above it, "Proofer replied | My note" is drawn as one grey bar with only the active half filled, the inactive "My note" is bold black text at x=1193 not centred in its half and has no segment edge, so it reads as a label rather than a choice.
- Where: `components/proof/inspector/FindingThread.tsx:130-154` (`flex items-start gap-2` row; options at `:137-138`)
- Severity: looks wrong
- Fix: stretch the button to the textarea height or align it to the bottom, and use a two-segment control with equal halves and centred labels.
- Evidence: `S/crops/xpf/c2.png` (bottom 40%)
- Shared: Segmented control primitive, page-local row

### XPF-7 Left column stops short while the inspector keeps going

- Page / state: proof / default, chapter-no-recording, empty, check-never, check-stale, find-open, note-thread, notes-filtered
- Widths: w1280-w1920 (theme: both)
- What is wrong: "why is the whole bottom of the notes side empty?" At 1440 default the notes card ends at y=709 and the inspector at 828 (119px of page background beside it); in find-open the notes card ends at y=537 against 828; empty/check-never/check-stale leave 430-856 (about 430px) blank beside a 790px tall inspector that holds one line ("No notes yet."). At 1920 default the notes card ends at y=638 against 1035.
- Where: `components/proof/ProofPage.tsx:431` and `:520` (inspector `row-span-2` stretches; the left cells are `auto`/`1fr` but the notes card does not stretch) and `components/proof/frame/ProofSkeleton.tsx:11`
- Severity: looks wrong
- Fix: make the notes card fill the row (`h-full`, table scrolls inside) or stop the inspector at its content height.
- Evidence: `proof/default/w1440.png` (x=233-1027, y=709-828), `.../empty/w1440.png` (y=430-856), `.../default/w1920.png`
- Shared: page-local
- Supersedes: part of PRF-5

### XPF-8 Under 1180px the cards stretch with blank space inside them and uneven gaps between them

- Page / state: proof / empty, check-never, check-stale, address-checking and loading skeleton, chapter-no-recording
- Widths: w768, w1024, w390 (theme: light)
- What is wrong: "why is there a hole inside the Proof card, and why is the gap to the next card five times the others?" At 768 empty, the Proof card has 170px of empty space under the strip (y=215-385); between the notes card and the inspector there is a 178px gap (y=590-768); check-stale at 768 has 80px empty inside the card under "No recording..." and a 75px gap above the inspector, against 16px gaps elsewhere. At 390 empty, 80px is empty under the strip.
- Where: `components/proof/ProofPage.tsx:431` (`grid flex-1 gap-4` with auto rows shares the extra viewport height out between rows)
- Severity: looks wrong
- Fix: `content-start` on the grid so cards keep their height and the gap stays 16px.
- Evidence: `proof/empty/w768.png` (y=215-385, 590-768), `.../check-stale/w768.png` (y=485-590, 795-870), `.../empty/w390.png`
- Shared: page-local
- Supersedes: PRF-5

### XPF-9 Under 1180px the inspector is the last thing on a four-screen page

- Page / state: proof / default, chapter, find-open, note-thread, notes-filtered, evidence-changed, takes-lanes
- Widths: w768, w1024 (theme: both)
- What is wrong: "I tapped a note and nothing happened" - the inspector for the selected note is below the whole table (y=686 at 1024 default, y=920 at 768 note-thread), off screen, so choosing a note shows no result. In chapter views the inspector is under the check card, waveform and table (more than 1500px down).
- Where: `components/proof/ProofPage.tsx:431,520` (`min-[1180px]` two-column only)
- Severity: looks wrong
- Fix: at narrow widths make the inspector a bottom sheet or slide-over opened by the selection, or keep a sticky summary of the selected note under the toolbar.
- Evidence: `proof/default/w768.png` (inspector at y=686+), `.../note-thread/w768.png`
- Shared: page-local (layout rule)

### XPF-10 The loading skeleton is a different page from the real one

- Page / state: proof / loading, address-checking
- Widths: all (theme: both)
- What is wrong: "the page jumps as soon as it loads." The skeleton is one big card (title, one bar, a strip bar, a block) and a right card of four bars; the loaded page is two cards on the left with a chip row and toolbar. Both skeleton cards run to the window bottom (y=883) while the loaded cards end at 709. At 768 the skeleton is two cards with 160px empty gaps inside them. `address-checking` shows exactly the same skeleton in every width and in dark, so that state is not shown at all.
- Where: `components/proof/frame/ProofSkeleton.tsx:11-26` (one section and one aside; no notes-card shape) and `components/proof/ProofPage.tsx` (address-checking path)
- Severity: looks wrong
- Fix: draw the skeleton as the same two cards (header with strip, notes with toolbar and rows) and make address-checking render its own state.
- Evidence: `proof/loading/w1440.png`, `.../address-checking/w1440.png`, `.../address-checking/w768.png`
- Shared: page-local (also the Proof catalog driver)

### XPF-11 Chapter strip labels spill out of their tiles at 390

- Page / state: proof / default, empty, find-open, note-thread, notes-filtered
- Widths: w390 (theme: light)
- What is wrong: "why does 'Open' stick out of its box?" Fourteen tiles share about 326px (19px each); "Open" and "Close" are 28px wide, so they overhang into neighbours ("12Close" touches); numbers squash into 18px slivers.
- Where: `components/proof/frame/ChapterStrip.tsx:51-55` (`min-w-0 flex-1`, `truncate` on a span with no width; dense mode only above 18 chapters)
- Severity: looks wrong
- Fix: below 430px use "In/Out" or make the strip a horizontal scroller with a 28px minimum tile.
- Evidence: `proof/default/w390.png` (y=205-258), `.../empty/w390.png` (y=157-210)
- Shared: page-local
- Supersedes: PRF-2

### XPF-12 Notes table is cut off at the right edge at 390 with no sign it scrolls

- Page / state: proof / default, find-open, note-thread, notes-filtered, evidence-changed
- Widths: w390 (theme: light)
- What is wrong: "why does the sentence stop in the middle of a word?" The table keeps 640px inside a 326px card; "a white ral[...]" and "pink" are sliced at x=375-390, From and Resolution are off screen, and there is no edge shadow.
- Where: `components/proof/notes/NotesTable.tsx:136` (`min-w-[40rem]`) in `NotesPanel.tsx:217` (`overflow-auto`, no `scroll-x-edges`)
- Severity: looks wrong
- Fix: add `scroll-x-edges` or collapse From and Resolution into the second line under 430px.
- Evidence: `proof/default/w390.png` (rows y=560-780)
- Shared: Table + `scroll-x-edges`
- Supersedes: PRF-3

### XPF-13 The sort and icon toolbar jumps between left, below the chips and right

- Page / state: proof / default and every state with notes
- Widths: w390 (indented right, x=54), w768/w1280/w1440 (below the chips at the left, x=249), w1024/w1920 (right, level with the chips) (theme: light)
- What is wrong: "why is the toolbar under the chips here and beside them there?" At 1440 the chips end at x=756, 270px short of the card edge, and the 300px toolbar still drops to its own row; at 1024 and 1920 it sits on the chips row at the right; at 390 it is indented 21px from the chips and the Sources line.
- Where: `components/proof/notes/NotesPanel.tsx:191-192` (a `flex-1` spacer span plus toolbar div that wraps with it)
- Severity: looks wrong
- Fix: toolbar `ml-auto` and one wrapped position (left, `basis-full`).
- Evidence: `proof/default/w1440.png` (y=313), `.../w1024.png` (y=273), `.../w390.png` (y=431)
- Shared: page-local
- Supersedes: PRF-7

### XPF-15 Waveform: pins and window hang outside the card text edge, and the takes view is unlabelled

- Page / state: proof / chapter, takes-lanes, evidence-changed
- Widths: w768-w1920 (theme: both)
- What is wrong: "why is the first dot hanging off the left, and what are those grey bars?" The overview window starts at x=243 and the first pin is centred at x=249, half outside the 249 text edge; at the right the strip runs to 1011 (the card inner edge). In takes-lanes the green box "Take 1 - Kept" and a second bar labelled "Take 1 - Kept" repeat the same label; three grey bars below (takes 2 to 4) have no label and different lengths; a pin dot sits on the green box's top edge over its label; the main waveform stops at x=529 and the box replaces it.
- Where: `components/proof/frame/WaveformWindow.tsx:158,264,283` (`-translate-x-1/2` at `left:0%`) and the takes lanes in the same file
- Severity: looks wrong
- Fix: clamp pins and handles inside the track, label each lane (Take 2, 3, 4) and show the kept take once.
- Evidence: `S/crops/xpf/c3.png`, `proof/takes-lanes/w1440.png` (x=241-1011, y=437-630)
- Shared: page-local
- Supersedes: PRF-11

### XPF-16 Recording check card: half empty, says the same thing twice, and rows wobble

- Page / state: proof / chapter, chapter-no-recording, check-never, check-stale, check-checking
- Widths: w1280-w1920 (theme: both)
- What is wrong: "why is the right half of this card empty, and why does it say 'no recording' twice?" At 1440 the two chip groups (Against the script, In the audio) stack on the left (x=266-632) while x=640-1010 is blank for 130px of height. In no-recording states the card says "This chapter has no recording to check..." and, outside the card at y=435, "No recording for this chapter yet." The stat text "Checked against the script" sits at y=208, 2px off the RECORDED label row (y=206) and not on the value baseline (y=228); in check-stale three lines of text sit beside two stat values. The primary CHECK RECORDINGS button is faded while the badge says "Not checked".
- Where: `components/proof/checkcard/CheckCard.tsx:249` (`grid sm:grid-cols-[auto_auto_1fr]`), `:299`, and `ProofPage.tsx:472` (second message)
- Severity: looks wrong
- Fix: put the two chip groups side by side, drop the duplicate message, align the stat text to the value baseline.
- Evidence: `S/crops/xpf/c4.png`, `proof/chapter-no-recording/w1440.png` (y=133-460)
- Shared: page-local

### XPF-18 Running check dialog: Stop is on another row than the progress, bars differ, name truncates at 390

- Page / state: proof / check-checking
- Widths: w1440, w1024, w768, w390 (theme: both)
- What is wrong: "why is Stop under the name and the bar floating to the right?" The chapter name is at the left (x=235), the 176px bar at the far right (x=1029-1205) with 480px of gap at 1440, and STOP on its own row below at the left. The dialog's bar is 8px tall and the card's behind it 14px. At 390 the name shrinks to "Cha..." beside the 11rem bar.
- Where: `components/recordingcheck/RunningView.tsx:19-21` (`w-[11rem] flex-none`; name `truncate`), the Stop button below the list
- Severity: looks wrong
- Fix: put the bar under the name full width with Stop at the right of the same row, one bar style.
- Evidence: `proof/check-checking/w1440.png` (y=420-540), `.../w390.png` (y=435-455)
- Shared: ProgressBar usages
- Supersedes: none

### XPF-19 Dialog footer buttons stack into two rows at 768

- Page / state: proof / check-recordings-dialog
- Widths: w768 (theme: light)
- What is wrong: "why is Cancel up there and the main button down there?" Cancel sits at the right (x=565-634, y=806-841) next to the hint and CHECK 1 CHAPTER is alone on the next row at the left (x=134-258, y=854), the reverse of the 1440 order.
- Where: `components/recordingcheck/CheckRecordingsDialog.tsx:216-217` (`flex-wrap`, `mr-auto` hint)
- Severity: looks wrong
- Fix: hint above the buttons, both buttons on one right-aligned row.
- Evidence: `proof/check-recordings-dialog/w768.png` (y=800-890)
- Shared: Dialog footer pattern
- Supersedes: none

### XPF-14 Inspector controls are four different heights

- Page / state: proof / default, chapter, chapter-no-recording and every state with an inspector
- Widths: all (theme: both)
- What is wrong: "the heights don't match". Row 1: time label, type select 40.8 (y=85-125), arrows 36 (y=87-123). Row 3: four icon buttons 36 (y=270-305) with a REOPEN button 32 (y=271-302) at the right of the same row. Decision buttons 40. ADD NOTE button 32. In the notes toolbar: select 40.8, Find field about 38, icon buttons 36 (y=293-333 vs 296-330). "Notes - 5" title baseline sits 2px lower than the chips' text (y=267 vs 265).
- Where: `components/proof/inspector/Inspector.tsx:106-111`, `InspectorActions.tsx:111-140`, `FindingThread.tsx:141-154`, `NotesPanel.tsx:193-209` - Select/SearchField use `--control-height`, buttons use `--button-height`.
- Severity: polish
- Fix: one height per row (36px, or 32px small) for select, field and buttons.
- Evidence: `S/crops/xpf/c1.png`, `S/crops/xpf/b.png`, `proof/chapter-no-recording/w1440.png`
- Shared: Select/SearchField vs IconButton/Button height tokens
- Supersedes: PRF-8

### XPF-17 Check card stat blocks stack into a tall column at 390

- Page / state: proof / chapter-no-recording, check-never, check-stale, check-checking, evidence-changed, chapter
- Widths: w390 (theme: light)
- What is wrong: "why is a two-number stat a 200px tall column?" RECORDED and SCRIPT ESTIMATE stack label over value with a 20px gap each, then the message, then the chips, so the card is about 520px tall; CHECK RECORDINGS drops under the badge row instead of staying at the right.
- Where: `components/proof/checkcard/CheckCard.tsx:208-211,249`
- Severity: polish (390 only)
- Fix: two stat columns side by side at 390.
- Evidence: `proof/check-never/w390.png` (y=200-700)
- Shared: page-local

### XPF-20 Dialog form: inconsistent headings, help text far from its controls, sliders inset from the labels

- Page / state: proof / check-recordings-dialog
- Widths: w1440, w1024, w768, w1920 (theme: both)
- What is wrong: "this doesn't look like one form". The labels are uppercase small caps (SPEECH MODEL, CHUNK LENGTH), but "Audio to check" is sentence case in a bigger regular weight with "Not measured" in a mono face at the right; the slider tracks start at x=244 and end at x=701 while their labels span 235-710, so each track is 9px inside the text edges; the paragraph explaining chunks and workers sits below the Parallel workers checkbox, three controls away from Chunk length; at 1920 the chapter list uses 330px of a 640px column and ends at y=680 while the left column goes to 800.
- Where: `components/recordingcheck/RunOptions.tsx:139-142` (hint paragraph), `CheckRecordingsDialog.tsx:209-214` (footer summary), Slider primitive
- Severity: polish
- Fix: one label style, hint under the sliders it covers, track inset removed (thumb overhang into padding).
- Evidence: `proof/check-recordings-dialog/w1440.png` (x=235-710, y=395-650), `.../w1920.png`
- Shared: Slider primitive
- Supersedes: none

### XPF-21 Find field: nested box, redundant search button, blue focus ring

- Page / state: proof / find-open
- Widths: w768-w1920 (theme: both)
- What is wrong: "why are there two search things, and why is the ring blue?" The open field has a second bordered square (the clear X) drawn inside its own border, the magnifier icon button stays beside it and does nothing new, and the focus ring is blue (x=431-609) while other focus rings (Waive button) are orange.
- Where: `components/proof/notes/NotesPanel.tsx:196-209` (SearchField plus the search IconButton), SearchField focus style
- Severity: polish
- Fix: hide the magnifier when the field is open, flatten the clear button, use the `--focus` token.
- Evidence: `S/crops/xpf/d3.png`, `proof/find-open/w1440.png`
- Shared: SearchField / focus token
- Supersedes: none

### XPF-22 Table text starts 6px left of the card's own text

- Page / state: proof / default, chapter, note-thread (all with the table)
- Widths: w768-w1920 (theme: both)
- What is wrong: "why does the table start left of the heading?" "Notes - 5", the chips, the sort select and Sources start at x=249; TIME header and every row cell start at x=243, and the "Chapter 1 - 4 open" band text at x=243.
- Where: `components/proof/notes/NotesPanel.tsx:174` (`px-4`) vs `components/primitives/tableStyles.ts` (`px-2.5`)
- Severity: polish
- Fix: `first:pl-4 last:pr-4` for tables flush in cards.
- Evidence: `proof/default/w1440.png` (x=243 vs 249, y=267 and 386)
- Shared: Table in flush cards
- Supersedes: PRF-9

### XPF-23 Time header is left, the values are right-aligned, the dash lands elsewhere

- Page / state: proof / default, find-open, notes-filtered, note-thread
- Widths: w1024-w1920 (theme: light)
- What is wrong: "why is TIME nowhere near its times?" Values are right-aligned in the column (00:00.0 at x=268-322 at 1920, header at 243-270) and the no-time dash sits at the column's right edge (x=293 at 1440).
- Where: `components/proof/notes/NotesTable.tsx:113,140` (`TableCell numeric` vs plain `TableHeader`)
- Severity: polish
- Fix: right-align the header or left-align the cells.
- Evidence: `proof/find-open/w1440.png` (y=516), `.../default/w1920.png` (y=346-423)
- Shared: page-local
- Supersedes: PRF-10

### XPF-24 Row text and the Resolution pill are off the row's centre line by 2px

- Page / state: proof / default, notes-filtered, note-thread
- Widths: w1440 (theme: light)
- What is wrong: "why does the pill text look lower than the time?" In row 1 the time and sentence are at y=195 (2x crop) and the "To review" label at y=197; From text at y=178/214 around a one-line row centre; the pill's own text is not centred in its pill (sits 1px low).
- Where: `components/proof/notes/NotesTable.tsx:126-129` (`StatusBadge ... text-[13px]!` inside `FixedChip`)
- Severity: polish (may be intended: optical)
- Fix: align cell content on a shared centre line and use equal line-heights.
- Evidence: `S/crops/xpf/d1.png` (rows 1 and 3)
- Shared: StatusBadge in table rows

### XPF-25 Selected and last table rows meet the card's rounded corners square

- Page / state: proof / chapter-no-recording, notes-filtered, find-open, default
- Widths: w1440 (theme: both)
- What is wrong: "why does the bottom line poke out of the rounded card?" The selected row fill and the last border run straight into the bottom corners at x=233, y=679.
- Where: `components/proof/notes/NotesPanel.tsx:172` (section `rounded` without `overflow-hidden`), scroll div at `:217`
- Severity: polish
- Fix: `overflow-hidden` on the section.
- Evidence: `proof/chapter-no-recording/w1440.png` (x=233, y=640-680); same on Pickups
- Shared: Table-in-card pattern
- Supersedes: PRF-12

### XPF-26 Error and manuscript screens use a different frame than the page

- Page / state: proof / load-error, no-manuscript
- Widths: w390, w768, w1024, w1440 (theme: both)
- What is wrong: "why does the error card sit in the middle and why is 'Proof' outside it?" Load error is a 720px centred column (x=468-1188 at 1440, 184-904 at 1024) with the title above the card; at 390 and 768 its card starts at x=40, 24px in from the 16px page gutter of every other state. No-manuscript is full width with the title centred inside the card, while other states left-align the title.
- Where: `components/layout/LoadError.tsx:30` (max-width wrapper), no-manuscript page header
- Severity: polish
- Fix: draw both inside the normal container with the page title at the same place.
- Evidence: `proof/load-error/w390.png` (card x=40), `.../w1440.png`, `.../no-manuscript/w1440.png`
- Shared: LoadError, shared empty-page card
- Supersedes: PRF-13

### XPF-27 Empty and zero-note states keep live tools and say the wrong scope

- Page / state: proof / empty, check-never, check-stale, chapter-no-recording (zero notes)
- Widths: w1440 (theme: both)
- What is wrong: "why can I sort and export zero notes?" With "Notes - 0" and "All chapters" selected the card shows "No notes for this chapter" (wrong scope), still shows the sort select and four icon buttons at full strength, and the right-hand inspector is a 790px card with one grey line.
- Where: `components/proof/notes/NotesTable.tsx:105-107`, `NotesPanel.tsx:191-210`, `ProofPage.tsx:548`
- Severity: polish
- Fix: say "No notes yet" for all chapters, disable or hide the toolbar when empty, collapse the inspector to a placeholder.
- Evidence: `proof/empty/w1440.png` (y=293-430)
- Shared: page-local

### XPF-28 In dark the card edges and the selected row almost disappear

- Page / state: proof / every state
- Widths: w1440 (theme: dark)
- What is wrong: "I can hardly see where the cards are, and which row is selected." The card fill is nearly the page colour, so cards rely on a 1px border; the selected row in the notes table (y=444-491) is a faint brown tint; the segmented control's inactive half is black on black.
- Where: dark tokens `styles.css` (`--surface` vs `--bg`, `--row-selected`)
- Severity: polish
- Fix: widen the surface step and strengthen `--row-selected` in dark.
- Evidence: `dark:proof/default/desktop.png` (x=233-1027, y=444-491)
- Shared: dark tokens
