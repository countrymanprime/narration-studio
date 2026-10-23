# Editing: alignment findings

Part of the [alignment audit](../../alignment-audit.md). Findings are grouped by the round that produced them; a later round's finding that replaces an earlier one says `Supersedes`. Evidence paths are `<page>/<state>/<width>.png` of the light capture, `dark:<page>/<state>/<viewport>.png` for dark, `tall:<page>-w<width>.png` for the below-the-fold captures; the images are not committed (regenerate the repo-viewport ones with `pnpm --dir apps/ui visual:page <page>`).

## Round 4: gap fill

### R4TA-7 Editing: the take count is shown twice for every paragraph, eight identical chips down the page

- Page / state: editing default
- Widths: 1920, 1440, 1280, 1024, 768
- Gut reaction: why does every paragraph say "4" twice, and why is the same fat chip repeated under all eight?
- What is wrong: each paragraph has a circled "4" in the time gutter (22 px ring) and, under the text, a 244 px outlined chip "4 TAKES ●○○○ TAKE 1 TO CHOOSE v". In this chapter all eight chips are identical, so the page is a column of the same box. The chip itself holds five things (icon, count, four dots, "TAKE 1", a nested grey "TO CHOOSE" pill, chevron) in 11-12 px caps; the dots have no label. The circled 4 and the chip toggle the same takes list.
- Where: `components/editing/takes/TakeBadge.tsx:28` (the ring) and `components/editing/takes/TakeChip.tsx` (the chip)
- Severity: looks wrong
- Fix: keep one entry point (the chip, shown only for paragraphs that need a choice) and drop the ring, or have the ring alone and show the chip only when the paragraph is open.
- Evidence: `crops/r4ta/e1440-b.png` (1:40, 1:49 and 2:05 paragraphs)
- Shared: page-local (editing takes)

### R4TA-8 Editing: the key-hint bar advertises Delete, Add FX and Keep take while the note above it says they are off

- Page / state: editing default (edit-off band shown)
- Widths: 1920, 1440, 1024
- Gut reaction: it says "Delete, Mute and Add FX are off" and, one line below, shows a Delete key and an Add FX key.
- What is wrong: the band "Delete, Mute and Add FX are off. Experimental: switched off in Settings." sits directly over the transport bar, which still draws a full DELETE WORDS AND AUDIO button, and the hint bar underneath lists `Delete` "Delete words and audio", `F` "Add FX", `T` "Takes", `Keep take`, `H`. Three bands (note, bar, hints) tell three different stories about what is available.
- Where: `components/editing/keys/editingKeyHints.ts`; the band in `page/EditingBody.tsx`
- Severity: looks wrong
- Fix: filter the hint list by the same switch that draws the off band; or dim hints that are off.
- Evidence: `crops/r4ta/e1440-c.png`, `e1920-b.png`
- Shared: page-local

### R4TA-10 Editing legend: the entry that is dropped at 768 and 1280 is the only one with a count

- Page / state: editing default
- Widths: 768 ("Extra" gone), 1280 (relabelled "Extra", "Low")
- Gut reaction: the red "liceA" box has no legend entry on screen.
- What is wrong: the legend has four items "Not in the script · 1", "In the script, not read · 0", "Misread · 0", "Low confidence · 0". At 768 the first (the only non-zero one, which explains the red "liceA") is cut off and a dashed tick fragment hangs before "Not read"; at 1280 the labels are shortened to "Extra" and "Low", which are not nouns. Extends XED-5.
- Where: `components/editing/flags/Legend.tsx:28`
- Severity: looks wrong
- Fix: drop zero-count items first, never the non-zero one; keep full labels or use tooltips.
- Evidence: `crops/r4ta/e768-a.png`, `e1280-a.png`
- Shared: page-local

### R4TA-9 Editing: the name highlight on "(Alice" swallows the opening parenthesis

- Page / state: editing default, paragraph at 3:20
- Widths: 1440, 1024 (all)
- Gut reaction: the green box starts on the bracket, while every other name box starts on the letter.
- What is wrong: the highlighted token is "(Alice" with the "(" inside the green box and underline; elsewhere the boxes exclude the quote mark (for example "‘without ... Alice ‘" and "Alice," stay clean). Same cause as the "Alice;" and "Hare." boxes in R3 notes.
- Where: word tokenising for the script highlight, `components/editing/script/Word.tsx` (punctuation attached to the word)
- Severity: polish
- Fix: strip leading and trailing punctuation from the highlighted range.
- Evidence: `crops/r4ta/e1440-d.png`
- Shared: page-local

## Round 3: coverage gaps and scanner cross-check

### R3ED-2 At 390 the no-audio banner is a 610px column of one-word lines and the page behind it is unreachable

- Page / state: editing, unlinked, never-checked
- Widths: 390 light (and the same markup at 1024 and 768: link and button become a right-hand column beside 3-4 text lines)
- Why does this page show only a banner? The message wraps one to two words per line in a 77px column (about 22 lines), the underlined link sits in a second column at y=396, "Read again" is cut by the key-hint panel (stub at y=640-645 in never-checked; not visible in unlinked), and header, script and transport bar are below the fold of a card that does not scroll to them. At 1440 the banner is fine (2 lines, link and button right, 46px dead gap before them).
- Where: `page/NoAudioBanner.tsx:18-22` (`flex-wrap` row, message `flex-1 min-w-0 [overflow-wrap:anywhere]` with no basis), `page/EditingBody.tsx:496-515`
- Severity: breaks use
- Fix: `basis-full` on the message so link and button wrap under it; or keep the banner to two lines and move the explanation into the empty script area.
- Evidence: `unlinked/w390.png`, `never-checked/w390.png`
- Shared: page-local. Scanner: A6 (21px link beside 32px button). Supersedes: XED-1

### R3ED-10 Dialog bodies are cut under the footer at 1280 and 1024 and at 390 whole rows never show

- Page / state: delete-dialog, fx-dialog
- Widths: 1280 (fx info box cut after its first line; delete info box last line), 1024 (delete info box shows as a 4px strip; fx A/B button sliced by the footer rule), 390 (delete: radios, selects, checkbox, info box hidden; fx: ADDS, JOINS, A/B, info box hidden), dark 1024 too
- Why does the dialog stop mid-sentence? The body scrolls under a fixed footer with no shadow or fade; on a 768-1024px tall window nothing says there is more.
- Where: `primitives/Dialog.tsx:149-152` (`maxHeight: 80dvh`, shell `max-w-[70vw]`), `range/cut/CutDialog.tsx`, `range/fx/FxDialog.tsx`
- Severity: breaks use at 390; looks wrong at 1280/1024
- Fix: scroll shadow under the header and above the footer; shrink content (the 70vw shell makes facts 1-line at wide widths and 5-line at 390).
- Evidence: `delete-dialog/w1024.png`, `fx-dialog/w1280.png`, `fx-dialog/w390.png`
- Shared: Dialog. Supersedes: XED-20 (extended to 1280)

### R3ED-12 At 390 the takes card and chip are cut by the script scroller

- Page / state: takes-open (and any line with takes)
- Widths: 390
- The "TAKES 1 C..." pill is clipped at x=322 and the Suggested card (x=139-329) has no right border or radius: the scroller cuts it, text wraps at 190px; the segmented "Chapter . Leave" wraps to two lines. At 768 take evidence wraps to 4 lines per take; waveforms start at three x (343/262/341) and end at two. At 1440: pill x=262, Suggested card x=271, rows x=281 (three left edges); waveform starts 428/365/426; evidence lines 2/3/3.
- Where: `takes/TakeChip.tsx:57-65` (no `max-w-full`), `takes/TakeLines.tsx:64-73`, `takes/Suggested.tsx`
- Severity: breaks use at 390; looks wrong at 1440-768
- Fix: let the chip shrink; fixed-width name, chip and percent cells.
- Evidence: `takes-open/w390.png`, `takes-open/w1440.png`
- Shared: page-local. Scanner: A4/A5/W1 (390). Supersedes: XED-2, XED-9

### R3ED-1 Timeline drawer was never captured below 1360, so its layout is unreviewed

- Page / state: editing, drawer-timeline
- Widths: 1280, 1024, 768, 390 light; 1024, 768 dark
- Why does the "Timeline drawer" state show no timeline? Because the capture is the default page resized from a 1440 load: no strip (needs 1360) and no drawer. 1440/1920 show the strip correctly.
- Where: `tests/visual/lib/capture.ts:276-300`, `tests/visual/drivers/editing.ts:168-181`, `tests/visual/catalog/editing.ts:109-114` (no `reloadPerViewport`)
- Severity: looks wrong (visual-suite gap)
- Fix: `reloadPerViewport: true` on the row, recapture, then review the Timeline tab in the overlay.
- Evidence: `drawer-timeline/w1024.png` = default page with cursor box on "was".
- Shared: visual suite. Supersedes: XED-4 (cause corrected)

### R3ED-3 The selection toolbar sits under the selection, hiding the next line, and for a line-start selection it hangs left over the time gutter

- Page / state: selection, fx-menu, drawer-effects-inspector, voice-sample-mark*, voice-sample-saved, voice-sample-refused
- Widths: all (light and dark)
- Why does a toolbar cover the words I am editing? It is placed 6px under the last selected rect, then shifted left by 200px (clamped to 8px). At 1440 for "was beginning to get" it covers "having nothin|...|ad peeped" of line 2 (x=370-600 scaled .764); at 1024 and 768 it covers two lines; at 390 it spans x=57-354 of a card ending 357 and hides the 3rd line. For "So she was" (inspector) it starts at x=200 against a text column at x=262, covering the time gutter and the take ring and the first words; for the one-word selection "liceA" it is dimmed and covers the gutter ("4" ring and "0:00") at every width.
- Where: `bar/SelToolbar.tsx:23` (`x: max(8, min(r.right - b.left - 200, b.width - 300))`, `y: r.bottom + 6`) and `:33`
- Severity: looks wrong
- Fix: anchor above the first selected line and clamp to the text column; or dock it in the bar and drop the duplicate.
- Evidence: `selection/w1440.png` (toolbar y=143-178), `drawer-effects-inspector/w1440.png`, `voice-sample-refused/w1440.png`, `selection/w390.png`
- Shared: page-local. Supersedes: XED-23

### R3ED-4 The Add FX popover and the saved-sample toast both land on the bar and the key hints

- Page / state: fx-menu; voice-sample-mark-open, voice-sample-saved
- Widths: all; worst 1280, 1024
- Add FX popover: its card straddles the bar's Add FX button and runs past the card: 1440 x=815-1010, y=538-682 against card bottom 665 (hangs 17px, 6px above the window edge), over "DELETE WORDS AND AUDIO" (only "AND AUDIO" shows) and the hints; 1280 hangs 18px past the card's right edge; 1024 21px; 768 and 390 opens from the first icon over the summary, chip and hints. The "Manage in REAPER..." row is muted with a two-line note inside it, so a link reads as an error. Toast: 1440 x=866-1085 against card edge 1075, covering "Keep take (T picks which)" and half of "Hide others"; 1024 it ends 26px outside the card and 7px from the window edge; the X is a bare glyph.
- Where: popover anchoring in `bar/SelectionActionButton.tsx`; toast host `primitives/Toast.tsx:88` (`fixed right-5 bottom-5`)
- Severity: looks wrong
- Fix: open the menu upward from the bar and keep it inside the card; place the toast above the hint row inside the card's right edge.
- Evidence: `fx-menu/w1440.png`, `fx-menu/w1024.png`, `voice-sample-saved/w1024.png`
- Shared: popover and toast primitives. Supersedes: XED-22, XED-25

### R3ED-5 The word context menu opens over the words it was opened on, and its flyout opens over the menu or over the text

- Page / state: word-menu-fx
- Widths: 1440, 1280, 1024, 768, 390 (light and dark)
- Why can't I see what I right-clicked? At 1440 the menu's left edge x=435 (scaled .764) sits on the selected words ("was begin|") and its top is level with line 1; at 1024 its top (y=93 of 768) is above the header's bottom and hides the chapter select's right end ("RABBIT" cut) and the "Extra" chip; at 768 the Add FX flyout opens LEFT over the script text and the waveform; at 390 the flyout opens ON the menu and hides Mute, Delete, Mark as, Add note, Mark for pickup and half of Show takes. The menu is 17 ungrouped rows (no dividers; "(T)" "(H)" in labels versus keycaps; rows 26/36/38px).
- Where: menu primitive and section registry (`menu/`, `takes/takesMenuSection.ts`); cause of the placement not isolated
- Severity: looks wrong
- Fix: group with dividers (listen, edit, takes, go to), flip the flyout to the free side or drill in at <=768, keep the menu clear of the header.
- Evidence: `word-menu-fx/w1440.png`, `w1024.png`, `w768.png`, `w390.png`
- Shared: menu primitive. Supersedes: XED-21

### R3ED-6 Below 1281px the drawer is an unscrimmed overlay that hides the button that opened it and the header

- Page / state: every `drawer-*` state
- Widths: 1280, 1024, 768, 390
- Why is the toggle gone? The overlay (x=757-1068 at 1280, y=67-655 inside a card y=59-663) covers the legend, the strip toggle and the drawer toggle; at 768 it starts x=369 and slices the chapter select ("RABBIT-HO") and hides the next-chapter button; at 390 it is 7px inside the card so the card border and the card's own bar rules show around it. Script text behind is cut mid-word ("sister|", "the bool|") and the hint row is cut. Close is the only way back.
- Where: `drawer/DrawerLayout.tsx:5,12` (`absolute inset-y-2 right-2 ... w-[min(360px,calc(100%-16px))]`, columns from `min-[1281px]`)
- Severity: looks wrong
- Fix: scrim plus a modal sheet below 1281, or reflow the script beside it.
- Evidence: `drawer-cleanup/w1280.png`, `w768.png`, `w390.png`, `drawer-effects/w390.png`
- Shared: page-local. Supersedes: XED-3

### R3ED-7 The effects table, the selection and the inspector disagree

- Page / state: drawer-effects-inspector
- Widths: 1440, 1280, 1024, 768, 390 (light and dark)
- Why is the detail about different words from the ones I selected? Selection is "So she was" (0:23-0:24, the table's second row) but the second row is not highlighted and the inspector below shows the first effect ("was beginning to get", 0:01-0:02). The effect name wraps in a 54px row ("Podcast / Voice.RfxChain") while the same name sits on one line in the inspector title and again in the "Chain" row; at 390 the COVERS column is cut ("COV", "0.2" clipped at the overlay edge) with no scroll cue.
- Where: `effects/EffectsList.tsx:27-60`, `effects/EffectInspector.tsx:46-83`
- Severity: looks wrong
- Fix: inspect the effect under the selection and highlight its row; truncate the name; make the table scroll or drop a column below 480.
- Evidence: `drawer-effects-inspector/w1440.png` (table y=165-250, inspector title y=286)
- Shared: page-local. Supersedes: XED-13

### R3ED-8 Inspector actions on two rows and two settings layouts; primary actions cut by the drawer bottom

- Page / state: drawer-effects-inspector, drawer-cleanup
- Widths: 1440 (cut), 1280 (Remove sliced mid-height), 1024 (Preview/Compare sliced), 390
- "Gain" is label-over-slider, "Mode" is label-beside-input; PREVIEW and COMPARE are on one row and the 22px open-in-DAW icon sits alone on the row below at the left, with REMOVE THIS EFFECT at the right of that row; ADD EFFECT is half hidden at 1440 (y=647-665). In drawer-cleanup PREVIEW and APPLY TO 0 SELECTED lose their lower third at 1440 (y=645-665) and Strength is below the fold at 1280/1024. Apply is whole only at 1920 and 768.
- Where: `drawer/Drawer.tsx:74` (scroller, no sticky footer), `effects/EffectSettings.tsx:44,181,356`, `cleanup/CleanupInspector.tsx:112`
- Severity: looks wrong
- Fix: sticky footer for the tab's primary actions; one settings-row layout; Preview, Compare and Open in DAW together.
- Evidence: `drawer-effects-inspector/w1440.png` (y=600-665), `drawer-cleanup/w1440.png` (y=640-665), `drawer-effects-inspector/w1280.png`
- Shared: page-local. Scanner: A4 (Effect section). Supersedes: XED-11, XED-14

### R3ED-9 With the drawer open (1440) or at <=1024 the bar's actions drop to a second row directly under the transport buttons

- Page / state: `drawer-*`, daw-off, unlinked, never-checked, selection, takes-open
- Widths: 1440 with drawer, 1024 (prompt wraps), 768, 390
- Why do four icons sit right under prev/play like a second toolbar? The icons are at x=202-452 on row 2 (1440 with drawer) or x=47-269 (768), the same x as the 36px transport buttons above them with an 8px gap, and the rest of that row (55-60%) is empty; the prompt wraps leaving "select" alone at 768; at 390 transport, summary, chip and actions are four rows.
- Where: `bar/SelectionBar.tsx:30-65` (`flex-wrap`, prompt `flex-[1_1_200px]`, actions `flex-none`)
- Severity: looks wrong
- Fix: keep actions on the transport row (prompt truncates), or put them right-aligned on row 2.
- Evidence: `drawer-cleanup/w1440.png` (bar y=548-615), `selection/w768.png`, `daw-off/w768.png`
- Shared: page-local. Scanner: A9. Supersedes: XED-26

### R3ED-11 Every dialog is `70vw` wide, so a two-sentence confirm is 1006-1340px wide, and the page title jumps between loading/error frames

- Page / state: all dialogs; address-checking, loading, load-failed, chapter-load-failed, no-manuscript
- Dialogs: shell widths from `max-w-[70vw]` are 1340 at 1920, 1006 at 1440, 896 at 1280, 713 at 1024, 536 at 768, 271 at 390; "Normalise?" sentences run 660px (scaled) single lines; the voice-sample fields are 748px (scaled) wide for a 15-char label; Normalise puts Cancel at the far left and the primary at the far right (620px between) while delete/fx/voice dialogs right-align both.
- Frames: title "Editing" x (1440, real): 265 loaded, 247 address-checking (bare page), 265 loading, 650 load-failed (centred 356px card; at 1920 it is 356px in a 1700px area), 265 chapter-load-failed (panel 7px under the header), centred in no-manuscript whose card is 14-17px closer to the window edge than the loaded card at every width (x=232-1423 vs 249-1407 at 1440; x=16 vs 33 at 768 and 390). Skeleton lines are 587/538/352 of a 587px block, not the 1000px text column, so loaded text appears 60px right of where the skeleton was; skeleton card is 55% empty with no bar band.
- Where: `primitives/Dialog.tsx:149`; `layout/LoadError.tsx:56`; `EditingPage.tsx:144-176`; `page/EditingSkeleton.tsx`; `page/EditingBody.tsx:496`
- Severity: looks wrong
- Fix: cap dialogs by content (about 560-640px); one page frame for all five non-loaded states.
- Evidence: `suggestion-step/w1440.png`, `load-failed/w1440.png`, `chapter-load-failed/w1440.png`, `no-manuscript/w1440.png`, `address-checking/w1440.png`
- Shared: Dialog primitive, LoadError. Supersedes: XED-17, XED-19, XED-29, XED-30

### R3ED-14 Takes panel controls: mixed heights, one dark-outlined button, and the panel sits flush on the bar

- Page / state: takes-open, suggestion-step (behind the dialog)
- Widths: 1920 (only width where the control rows are on screen), also behind dialogs
- Row A "[play][Take 1 v][Take 2 v][A THEN B]" has selects 40.8px and a 32px button; row B "[open][HIDE THE OTHER 4 TAKES][TRIM WHITE SPACE][TRIM BREATHS][NORMALISE]" has NORMALISE outlined in black while the other three are grey (the disabled-looking ones are the same look as enabled non-primary), and sits ~4px above the bar rule with no bottom padding. Favourite buttons in the chains list are 3px apart.
- Where: `takes/TakeCompare.tsx:28-40`, `takes/Suggested.tsx`
- Severity: looks wrong
- Fix: one control height; padding under the panel; a distinct primary style.
- Evidence: `takes-open/w1920.png` (y=870-990), crop `crops/R3ED/tkz.png`
- Shared: page-local. Scanner: A6, A9. Supersedes: part of XED-9

### R3ED-15 No-audio states keep the 60px script indent with no gutter, show unexplained word boxes and carry the wrong banner copy

- Page / state: unlinked, never-checked
- Widths: 1920-390
- The script starts at x=262 (title x=202 at 1440) with nothing in the 60px gutter; grey muted text; word boxes still drawn in two colours with no legend (the legend is replaced by a grey pill "No audio to edit" that hugs the stepper at x=528, not right-aligned); boxes include trailing punctuation ("Alice;", "Hare."); the banner says "is not linked to a track in REAPER" even for the state called "never checked". Dark and light the same.
- Where: `script/Paragraph.tsx:37`, `flags/Legend.tsx` pill, `page/noAudioText.ts`, `page/NoAudioBanner.tsx`
- Severity: looks wrong
- Fix: drop the gutter column when there is no audio; keep the legend; say what actually happened.
- Evidence: `unlinked/w1440.png`, `never-checked/w1440.png`
- Shared: page-local.

### R3ED-17 Dark theme: disabled looks and skeletons

- Page / state: drawer-effects, drawer-effects-chains, drawer-effects-inspector, address-checking, loading (dark)
- Why does ADD EFFECT look clickable in dark? "Select the words first." disables it: light shows pale peach, dark shows a solid orange block. The "1 effect" legend swatch is near-invisible dark brown, the empty coverage bar is an outline only, "Custom" strength is dim grey, and skeleton bars are about 1.2:1 against the page.
- Where: `primitives/Button.tsx` disabled tokens (cause not isolated), `layout` skeleton tokens
- Severity: looks wrong
- Fix: one disabled treatment per theme with contrast; skeletons at >=1.5:1.
- Evidence: `dark:editing/drawer-effects/desktop.png`, `.../address-checking/desktop.png`
- Shared: Button, skeleton tokens.

### R3ED-13 The edit-off band appears in some sibling states and not others

- Page / state: drawer-effects-chains vs drawer-effects, drawer-cleanup, default
- Widths: 1440, 1920, 1280
- Why does the script area change height between states? The sentence "Delete, Mute and Add FX are off." sits above the bar in default, drawer-cleanup, drawer-effects (y=574 at 1440) but not in drawer-effects-chains (bar rule at y=548, one more script line visible, ~26px). The band has ~8px below the text and 14px above and cuts the last script line with no fade in every state that shows it.
- Where: `page/EditOffNotice.tsx:10`, `page/EditingBody.tsx:535`
- Severity: polish (the cause of the difference may be the capability fixture; may be intended)
- Fix: reserve the band's height or move the sentence into the bar.
- Evidence: `drawer-effects-chains/w1440.png` vs `drawer-effects/w1440.png`
- Shared: page-local.

### R3ED-16 Small hit areas on visible controls

- Controls (scanner H1, all REAL): "REAPER: Linked" and "Audacity" status pills 67.5x22 / 72x22; takes chip toggle ("4 takes. Show them" / "Fold them") 22x22; voice-sample dot 20x20; effect marker pills 27.8x18.5; effect time links 70x19.5; "Open the audio engine panel" link 185x21; toast Undo 33x20 and Dismiss 17x20.
- Severity: polish
- Fix: 24px minimum hit area (padding or `::after`).
- Evidence: `default/w1440.png` (pill top right, take chips), `voice-sample-saved/w1440.png` (toast), `drawer-effects-inspector/w1440.png` (markers)
- Shared: Chip/pill, toast and link primitives.

### R3ED-18 The sample dot reflows the paragraph and the Favourite buttons act before the thing they name

- Page / state: voice-sample-mark*, drawer-effects-chains
- A solid 7px dot after "get" with ~12px of air each side re-wraps line 1 ("of having nothing" moves to line 2); the chains list: "Your REAPER FX chains" is 11px muted sentence style under "Select the words first." (reads as its second line while the section labels are 9px caps), FAVOURITE (black outline, looks primary) sits left of the chain name, 3px apart, and the note has literal ">" chevrons ("Settings > Set on a page > Favourite effects...") with an orphan "project.".
- Where: `voicesample/SampleMark.tsx`, `effects/AddEffect.tsx:63-70`
- Severity: polish
- Fix: reserve the dot's width; caps heading; name then action at the right; plain-language note.
- Evidence: `voice-sample-mark/w1440.png`, `drawer-effects-chains/w1440.png`
- Shared: page-local. Supersedes: XED-16

## Round 2: strict review

### XED-1 No-audio banner is one word per line and swallows the page at 390

- Page / state: editing, unlinked, never-checked
- Widths: 390 (light). Fine at 1440, wrapped but ok at 1024/768.
- What is wrong: why is the banner 600px tall with a column of single words? The message is about 60px wide (x=66-125), the "Open the audio engine panel" link sits beside it, and "Read again" is pushed under the bottom edge so the header and script are not reachable.
- Where: `page/NoAudioBanner.tsx:19-22` - message span `flex-1 min-w-0 [overflow-wrap:anywhere]` in a `flex-wrap` row with no basis. Same markup in `page/DawOffBanner.tsx:13-15` (shorter text, so it only reads as a tall banner).
- Severity: breaks use
- Fix: `basis-full` on the message so link and button wrap under it.
- Evidence: `editing/unlinked/w390.png` (y=82-690), `editing/never-checked/w390.png`.
- Shared: page-local. Supersedes: EDT-1

### XED-2 Takes chip is wider than the script column at 390 and is clipped

- Page / state: editing, takes-open, default and any line with takes
- Widths: 390 (light). Carried from round 1; not re-seen by me (takes-open 390 did not load for me). The chip is 321px wide in the 1440 crop, so a 205px column cannot hold it.
- What is wrong: the chip runs past the card edge and wraps its label.
- Where: `takes/TakeChip.tsx:57-65` (no `max-w-full`), inside `script/Paragraph.tsx:37` (`grid-cols-[76px_minmax(0,1fr)]`).
- Severity: breaks use
- Fix: let the chip shrink and drop the segment bar below 420px.
- Evidence: round 1 `editing/takes-open/w390.png`; `crops/xed/takes.png` for chip width.
- Shared: page-local. Supersedes: EDT-2

### XED-3 The overlay drawer slices the script and the header, with no scrim, at 1280 and below

- Page / state: editing, every `drawer-*` state
- Widths: 1280, 1024, 768, 390 (light).
- What is wrong: why is the text cut in half by a floating panel? At 1280 the drawer (x=880-1240) cuts every script line mid-word ("by her sister", "the boo|") and cuts the key-hint row ("T" fragment at x=865); at 1024 it hides the transport prompt; at 768 it starts at x=369 and cuts the chapter select ("RABBIT-HOL") and hides the next-chapter button. Nothing dims the page behind, and the drawer is inset 8px from the card top, right and bottom (x=880-1240, y=76-763 against a card of y=68-771), so it looks like a different panel from the flush 1440 drawer.
- Where: `drawer/DrawerLayout.tsx:5,12` (`absolute inset-y-2 right-2 ... w-[min(360px,calc(100%-16px))]`, columns only from `min-[1281px]`).
- Severity: looks wrong
- Fix: add a scrim and make it a modal sheet below 1281px, or reflow the script column beside it.
- Evidence: `editing/drawer-effects/w1280.png`, `.../w1024.png`, `.../w768.png`, `.../w390.png`.
- Shared: page-local. Supersedes: EDT-14 (upgraded)

### XED-4 drawer-timeline at 1280 and below: capture shows no drawer (verification gap) and I could not see what is drawn

- Page / state: editing, drawer-timeline
- Widths: 1280, 1024, 768 (round 1 found no drawer). I could not open these shots (the read returned no image). I checked `probe:editing/drawer-timeline/w1024.json`: no element mentioning a drawer, tablist or "Waveform and takes". So the DOM at 1024 has no open drawer; the capture is the default page with the cursor placed.
- What is wrong: the state meant to show the Timeline drawer at narrow widths never shows it, so that layout has no review or visual-suite coverage. The driver (`apps/ui/tests/visual/drivers/editing.ts:168-181`) branches at 1360, but the layout breakpoint for the drawer-as-overlay is 1281 (`drawer/DrawerLayout.tsx:12`); at 1280 and 1024 the branch clicks "Clean up and effects" then tab "Timeline", which `drawer-effects/w1280.png` shows exists. Cause of the missing drawer not found; likely the click toggles the drawer closed (it was already open from a preceding state) or the tab click closes it.
- Where: `apps/ui/tests/visual/drivers/editing.ts:168-181`; `page/EditingBody.tsx:404-413` (`showTimeline` toggles closed when drawer is open on timeline).
- Severity: looks wrong (unverified layout)
- Fix: wait for the drawer region in the driver (`#drawer`) as `drawer-effects` does, and re-capture.
- Evidence: `editing/drawer-timeline/w1024.png` (not seen by me), probe json above.
- Shared: visual suite driver.

### XED-5 Legend is cut in half when the header is crowded

- Page / state: editing, every `drawer-*` state at 1440; every state at 768 and 390
- Widths: 1440 with drawer, 768, 390 (light).
- What is wrong: why does the legend start with a stray ")" or "xtra"? At 1440 with the drawer open the row begins with a lone glyph at x=692 then "Misread · 0" (the "Not in the script" and "not read" chips are gone, with 12px of free space either side); at 768 a tick mark sits at x=461 before "Not read"; at 390 it starts "xtra Aa Not read" at x=49.
- Where: `flags/Legend.tsx:28` (`flex-nowrap justify-end overflow-hidden`), in `page/EditingHeader.tsx:30` (`min-w-0 flex-1`).
- Severity: looks wrong
- Fix: drop whole chips when they do not fit, or `justify-start` with a fade; never clip a chip.
- Evidence: `editing/drawer-effects/w1440.png` (x=690-935, y=99), `editing/daw-off/w768.png` (x=461,y=176), `editing/daw-off/w390.png` (x=49,y=341).
- Shared: page-local. Supersedes: EDT-4

### XED-6 Header at 390 is three stacked rows with the drawer button stranded at the right

- Page / state: editing, all populated states
- Widths: 390 (light).
- What is wrong: title alone on row 1 (y=97) with 224px empty beside it, stepper on row 2, legend and the drawer toggle on row 3 with the toggle at the far right (x=305-341); the buttons that act on the page are the furthest thing from the title.
- Where: `page/EditingHeader.tsx:28-52` (`flex flex-wrap`; buttons are the last child, legend is `flex-1`).
- Severity: looks wrong (390 is secondary)
- Fix: put the drawer toggle on the title row (`ml-auto` with `order`), legend under the stepper.
- Evidence: `editing/daw-off/w390.png` (y=80-355), `editing/fx-menu/w390.png`.
- Shared: page-local.

### XED-7 Status banners are above the header, so the page title jumps 66-76px between states

- Page / state: editing, daw-off, unlinked, never-checked vs the rest
- Widths: 1440, 1024, 768 (light).
- What is wrong: "Editing" is at y=99 normally, y=165 under the DAW-off banner and y=175 under the no-audio banner. The two banners are also different heights (54 and 64px) and the "No audio to edit" pill that replaces the legend hugs the stepper (x=692) while the legend it replaces is right-aligned (ends x=1299).
- Where: `page/EditingBody.tsx:496-515` (banners rendered before `EditingHeader`), `flags/Legend.tsx` pill.
- Severity: looks wrong
- Fix: render banners between the header and the script; right-align the pill like the legend.
- Evidence: `editing/daw-off/w1440.png`, `editing/unlinked/w1440.png`, `editing/fx-menu/w1440.png` for the normal title y.
- Shared: page-local.

### XED-8 Timeline strip: lane names are cut off and the status chip is overpainted

- Page / state: editing, drawer-timeline (strip at 1440+)
- Widths: 1440 (and 1920 per round 1) (light).
- What is wrong: why does "Retake on lane" lose "2" and "Pickup read" show "MU" jammed into the lane? The label column is 96px, names are no-wrap mono, so the long name is cut by the lane track and the MUTED chip is painted over. The chips that do fit sit at different x (ACTIVE at 107, MUTED at 117 in the 2x crop) because they follow the name's width.
- Where: `strip/TimelineStrip.tsx:81` (`w-24`) and `:127-128` (`whitespace-nowrap` name plus chip in one row).
- Severity: looks wrong
- Fix: stack name over chip as the drawer variant does, or give a fixed `w-40` column with `truncate`.
- Evidence: `crops/xed/strip.png` (lower left), `editing/drawer-timeline/w1440.png` y=630-695.
- Shared: page-local. Supersedes: EDT-3

### XED-9 Take rows do not share a grid

- Page / state: editing, takes-open, suggestion-step (rows visible behind the dialog)
- Widths: 1440, 1024, 768 (light).
- What is wrong: why do the three waveforms start and end at different places? The waveform begins after a name column of changing width (Take 1 + two chips, Take 2 + one chip, "Retake on lane 2") so bars start at x=560, 478, 557, and only the first row has a "90%" so bars end at different x too; the evidence lines under each row have different line counts (2, 3, 3) because the "Matched: This take was not aligned..." sentence is long mono text running edge to edge, so rows are unequal height (about 108 vs 135px); the long mono text under the buttons reads as a wall.
- Where: `takes/TakeLines.tsx:64-73` (`flex flex-wrap items-center gap-2`, `min-w-[3rem] flex-1`, `ml-auto` percent) and `takes/TakeEvidence.tsx`.
- Severity: looks wrong
- Fix: fixed-width name, chip and percent cells; put the evidence into a small key-value grid.
- Evidence: `crops/xed/takes.png`; `editing/suggestion-step/w1440.png` (y=580-760).
- Shared: page-local. Supersedes: EDT-10 (upgraded)

### XED-10 Drawer sections have three different left edges

- Page / state: editing, drawer-cleanup, drawer-effects-inspector (and chains)
- Widths: 1440, 390 (light and dark).
- What is wrong: why is the list indented more than its own heading? Tabs start at x=1067, title and section labels at 1069, the found-list rows and the "IN THE AUDIO" block at 1081; at the right the Review buttons end at 1387, the rules at 1395, the Strength control at 1383 and the Apply button at 1383. "HOW RETRIES ARE KEPT" toggle ends at x=1346, 40px short of everything else.
- Where: `drawer/Drawer.tsx:46` (`p-3`) wrapping `cleanup/CleanupTab.tsx:118`/`cleanup/CleanupInspector.tsx:65` (another `p-3`) and `drawer/FoundList.tsx:17,29` (`p-3` plus `px-2`).
- Severity: looks wrong
- Fix: one padding owner; remove the inner `p-3`/`px-2`; right-align the retries toggle.
- Evidence: `crops/xed/cl_top.png`, `crops/xed/cl_bot.png`, `editing/drawer-cleanup/w390.png`, dark `dark:editing/drawer-cleanup/desktop.png`.
- Shared: page-local. Supersedes: EDT-7

### XED-11 Primary drawer actions are cut off at the bottom edge

- Page / state: editing, drawer-cleanup, drawer-effects-inspector
- Widths: 1440, 1024, 390 (light); 1440 dark.
- What is wrong: why is the Apply button cut in half? "PREVIEW" and "APPLY TO 0 SELECTED" are sliced by the drawer edge at y=845-871 (1440), "ADD EFFECT" likewise, and "PREVIEW / COMPARE" at 1024 (y=706-731). They are the last items in a scroller with no sticky footer and no fade.
- Where: `drawer/Drawer.tsx:74` (`overflow-y-auto` scroller), `cleanup/CleanupInspector.tsx:112`, `effects/AddEffect.tsx:52`.
- Severity: looks wrong
- Fix: sticky footer for the tab's primary actions.
- Evidence: `crops/xed/cl_bot.png` (bottom), `crops/xed/insp.png` (bottom), dark drawer-cleanup desktop (y=845).
- Shared: page-local.

### XED-12 Cleanup tab: ragged chip rows and an empty-state sentence between the chips and their own heading

- Page / state: editing, drawer-cleanup
- Widths: 1440, 390 (light, dark).
- What is wrong: five kind chips wrap 3 + 2 with unequal widths (GAPS 70, BREATHS 88, CLICKS 78 on row one; PLOSIVES 92, NOISE 72 on row two), so there is no grid; "No finding passes these thresholds." sits between the chips and the "Gaps 0 to fix" heading with a 28px gap, so it reads as belonging to nothing; the Strength control has unequal segments (Light, Standard, Heavy, Custom) with "Custom" in grey; the found-list rows are unequal height (the Low confidence row wraps to 2 lines, 60px against 50px).
- Where: `cleanup/CleanupHeader.tsx:12` (`flex-wrap gap-1.5`), `cleanup/CleanupTab.tsx:117-125`, `drawer/FoundList.tsx:34-36`.
- Severity: looks wrong
- Fix: a 3-column or horizontally scrolling chip grid of equal width; put the sentence under the heading.
- Evidence: `crops/xed/cl_bot.png`, `crops/xed/cl_top.png`.
- Shared: page-local.

### XED-13 Effects table: cramped, wrapping, overhanging and with no selected row

- Page / state: editing, drawer-effects-inspector
- Widths: 1440, 1024, 768 (wraps), 390 (clipped).
- What is wrong: why does "Podcast Voice.RfxChain" wrap into two lines when there is a whole inspector below? Time, Effect, On, Covers share 330px, so the effect wraps and both rows are 53px tall for one-line content; the header and rules run to x=1399, past the section's 1395; "COVERS" header text stops at 1389 while values sit at 1343-1375 (right edge not shared); the table text starts at x=1079, 10px inside "EFFECTS · 2" at 1069; the first row is not highlighted although the inspector below shows it, so the table and its detail are not tied together; at 390 the column is cut ("COV", "0.2" cut at x=349).
- Where: `effects/EffectsList.tsx:27-60`.
- Severity: looks wrong
- Fix: truncate the effect name with a title, highlight the selected row, wrap the table in `overflow-x-auto` or drop the On column below 480px.
- Evidence: `crops/xed/insp.png` (top), `editing/drawer-effects-inspector/w390.png` (y=215-330).
- Shared: page-local. Supersedes: EDT-8

### XED-14 Effect inspector: two row layouts for settings, a duplicated title and actions split over two rows

- Page / state: editing, drawer-effects-inspector
- Widths: 1440, 1024, 768, 390 (light).
- What is wrong: "Gain" is label-over-slider with the value at the far right, "Mode" is label-left input-right: same list, two layouts; the "Chain" row repeats the heading directly above it; the key/value list puts values far right with 190px of air; Preview and Compare sit on one row and the open-in-DAW icon button sits alone under them next to "Remove this effect" - an action that acts on the same DAW effect is on a different row from the thing it acts on and an unlabeled icon floats; the up/down chevron buttons carry no label.
- Where: `effects/EffectInspector.tsx:46-83`, `effects/EffectSettings.tsx:44,181,356`.
- Severity: looks wrong
- Fix: one settings-row layout, drop the duplicate Chain row, group Preview, Compare and Open in DAW, with Remove alone at the right.
- Evidence: `crops/xed/insp.png` (y=800-1250 in the crop).
- Shared: page-local.

### XED-17 Dialog facts: three different left edges, labels 3-4px low, squeezed at 390

- Page / state: editing, delete-dialog, fx-dialog
- Widths: 1440, 1024, 768, 390 (light).
- What is wrong: why do the values not line up with anything? In the delete dialog the WORDS chip starts at x=285, the facts values at x=343, and in the fx dialog the chain select at x=397 - three label gutters in one dialog; the small-caps labels sit 3-4px below their values (CUT RANGE y=369 vs 365, ENDS 401 vs 398, SPLITS AT 451 vs 447, JOINS 579 vs 576); the first value is mono at a larger size than the rest; at 390 the 96px label column leaves 130px for values so "0:01 to 0:02 · 1.6 s" breaks over three lines; the dialogs are 1006px wide so facts run as 600px single lines. In the delete dialog Crossfade and Keep audio selects are different widths (85 and 94px) and the unselected radio and the checkbox are pale peach so they look disabled (may be intended).
- Where: `range/cut/CutDialog.tsx:83-119`, `range/fx/FxDialog.tsx:81-125` (`grid-cols-[96px_minmax(0,1fr)]`, `dt.pt-0.5`).
- Severity: looks wrong
- Fix: one label column for the whole dialog, `items-baseline`, stack label over value under 480px, cap dialog width near 640px.
- Evidence: `editing/delete-dialog/w1440.png` (x=235-345, y=360-470), `editing/fx-dialog/w1440.png` (y=210-590), both `w390.png`.
- Shared: the dialogs share the facts grid. Supersedes: EDT-9

### XED-18 Add-FX dialog: piece labels are not under their pieces

- Page / state: editing, fx-dialog
- Widths: 1440, 1024, 768 (light).
- What is wrong: why does the highlighted piece sit under nothing? The peach "Piece 2" segment is x=594-846 but its label "Piece 2 · Podcast Voice.RfxChain" is at x=360-541, left of it; "Piece 1" and "Piece 3" are packed left too, so the labels read as a caption row with no relation to the bar. At 390 the three labels stack in a column.
- Where: `range/fx/FxDialog.tsx` (pieces strip, cause line not isolated) - cause not found precisely.
- Severity: looks wrong
- Fix: position each label under its segment (grid with the same fractions as the bar).
- Evidence: `editing/fx-dialog/w1440.png` (y=385-425), `.../w390.png` (y=395-445).
- Shared: page-local.

### XED-19 Dialog footers are laid out four different ways

- Page / state: editing, suggestion-step (Normalise), delete-dialog, fx-dialog, voice-sample-dialog, voice-sample-refused
- Widths: 1440, 1024, 768, 390 (light).
- What is wrong: Normalise puts Cancel at the left edge and the primary at the far right; delete and add FX put both buttons at the right behind a footer rule; voice sample and the refused dialog put both right with no rule. Cancel sits at x=233 against body text at 235 and the primary ends at 1207 against the close button's 1205 (2px). At 390 the delete button label wraps to two lines ("DELETE 4 WORDS AND / AUDIO").
- Where: Normalise dialog (confirm dialog primitive; cause file not isolated), `range/cut/CutDialog.tsx`, `voicesample/*` footers.
- Severity: looks wrong
- Fix: one dialog footer component: rule, both buttons right, same padding.
- Evidence: `editing/suggestion-step/w1440.png` (y=505-540), `editing/delete-dialog/w1440.png` (y=715-770), `editing/voice-sample-refused/w1440.png` (y=520-560).
- Shared: dialog primitive.

### XED-20 Dialog bodies are cut under the footer with no scroll cue

- Page / state: editing, delete-dialog, fx-dialog
- Widths: 1024, 390 (light).
- What is wrong: at 1024 the delete dialog's blue info box is hidden behind the footer and the fx dialog's A/B button is cut through its middle (y=602-628); at 390 the facts stop mid-row ("Chapter 1 Down / the Rabbit-Hole" cut at the footer).
- Where: dialog body scroller without a fade or shadow (`range/*Dialog.tsx` body, dialog primitive).
- Severity: looks wrong
- Fix: a visible scroll shadow, or shorter content so it fits at 768-1024 (the page is 768px tall).
- Evidence: `editing/delete-dialog/w1024.png`, `editing/fx-dialog/w1024.png`, `editing/delete-dialog/w390.png`.
- Shared: dialog primitive.

### XED-21 Word context menu is a 17-item wall with no groups

- Page / state: editing, word-menu-fx
- Widths: 1440, 1024, 768, 390 (light).
- What is wrong: Play, Add FX, Mute, Delete, Mark as, Add note, Mark for pickup, Show takes, four Keep items, Hide others, voice sample, Copy, Jump menu and Find all in one column 655px tall with no divider; shortcuts are shown two ways ("(T)", "(H)" in the label versus Ctrl K chips on the last two); only two rows have a submenu arrow; "Find a page, chapter or command" wraps to two lines and makes that row taller than the rest; "Hide the other takes" is a two-line disabled item. At 390 the Add FX submenu opens over the menu and hides Mute, Delete, Mark as, Add note, Mark for pickup and Show takes until it closes.
- Where: menu section registry (`menu/`, `takes/takesMenuSection.ts`) - cause not isolated.
- Severity: looks wrong
- Fix: group (listen / edit / takes / share / go-to) with dividers, one shortcut style, submenu to the side or a drill-in at 390.
- Evidence: `editing/word-menu-fx/w1440.png` (x=568-822,y=160-815), `.../w390.png`.
- Shared: menu primitive.

### XED-22 The toolbar's Add FX popover covers the bar's own Delete button and runs off the card

- Page / state: editing, fx-menu
- Widths: 1440, 1024 (light).
- What is wrong: it opens at x=1067-1323, y=705-891 over "DELETE WORDS AND AUDIO" and the key hints, and its bottom (891) is below the card's bottom (871) and 9px above the window edge. At 1024 it covers the bar buttons. "Manage in REAPER..." looks disabled but is a link, with a small two-line note inside the menu.
- Where: popover anchoring in `bar/SelectionBar.tsx` / `bar/SelectionActionButton.tsx` (opens down; should flip up above the bar).
- Severity: looks wrong
- Fix: open upward from the bar and keep inside the card.
- Evidence: `editing/fx-menu/w1440.png`, `editing/fx-menu/w1024.png`.
- Shared: popover primitive.

### XED-23 Floating selection toolbar covers the words it acts on and the time gutter

- Page / state: editing, selection, fx-menu, drawer-effects-inspector, `voice-sample-*`
- Widths: 1440, 1024, 768, 390 (light).
- What is wrong: it is drawn over the second line of the selected paragraph (1440 inspector: hides "So she was consi|dering", y=390-430), over the time gutter at 768 and 1024 (x=46-346), and at 390 it ends 3px from the card edge (x=57-354 against 357) and covers the selection. Round 1 saw the same.
- Where: `bar/SelToolbar.tsx:33` (`absolute`, positioned from the selection rect).
- Severity: looks wrong
- Fix: place above the first selected line, clamp to the text column.
- Evidence: `editing/drawer-effects-inspector/w1440.png` (y=385-430), `editing/voice-sample-saved/w390.png` (y=305-348).
- Shared: page-local.

### XED-24 Voice-sample popover sits on top of the selection toolbar and is off-centre at 390

- Page / state: editing, voice-sample-mark-open
- Widths: 1440, 1024, 768, 390 (light).
- What is wrong: the card (x=689-1023, y=190-325) covers the toolbar's right half including Delete; at 390 it spans x=9-343 in a 390 screen, 9px from the left edge and outside the card gutter (card x=33).
- Where: voice-sample marker popover (`voicesample/*`) - anchor cause not isolated.
- Severity: looks wrong
- Fix: anchor below the dot clear of the toolbar; clamp to the card.
- Evidence: `editing/voice-sample-mark-open/w1440.png`, `.../w390.png`.
- Shared: popover primitive.

### XED-26 Transport bar splits at 1024 and below: actions on a row of their own, prompt wraps with an orphan word

- Page / state: editing, daw-off, unlinked, never-checked, selection states
- Widths: 1024, 768, 390 (light).
- What is wrong: at 768 the prompt "Click a word to place the cursor, drag or Shift+arrows to / select" wraps to leave "select" alone while the three icon buttons and Delete drop to a second row at the left with 450px empty to their right; at 1440 the same group is at the right of the transport row. At 390 prompt, transport and actions are three rows.
- Where: `bar/SelectionBar.tsx:30-65` (`flex-wrap`, prompt `flex-[1_1_200px]`, actions `flex-none`).
- Severity: looks wrong
- Fix: shorten the prompt below 1024 or put the actions on the transport row and let the prompt truncate.
- Evidence: `editing/daw-off/w768.png` (y=840-930), `editing/unlinked/w1024.png` (y=625-675).
- Shared: page-local.

### XED-27 Key-hint footer wraps into centred rows with ragged left edges

- Page / state: editing, all populated states
- Widths: 1440, 1280, 1024, 768, 390 (light, dark).
- What is wrong: at 1440 the second row is only "Timeline  Clear" in the middle (x=757-901); at 390 four rows start at x=82, 62, 62, 52; the same footer has the sentence above it flush left.
- Where: `primitives/KeyHints.tsx:20` (`flex-wrap justify-center`).
- Severity: looks wrong
- Fix: left-aligned grid.
- Evidence: `crops/xed/bar.png` (lower right), `editing/daw-off/w390.png` (y=700-805).
- Shared: KeyHints primitive. Supersedes: EDT-16

### XED-29 Editing's card sits 33px from the sidebar; Script and Editing's own empty state sit 16px

- Page / state: editing, populated states vs no-manuscript; address-checking draws at x=248 with no card
- Widths: 1440, 768 (light).
- What is wrong: card at x=249-1407 (33px gutters) but no-manuscript card at x=232-1423; Script columns start x=233.
- Where: `page/EditingBody.tsx:496` (`px-4 pb-3` on top of the shell's 16px).
- Severity: looks wrong
- Fix: drop the extra `px-4`.
- Evidence: `editing/fx-menu/w1440.png` (x=249), `editing/no-manuscript/w1440.png` (x=232).
- Shared: page-shell gutter pattern. Supersedes: EDT-6

### XED-30 Error and loading screens use five different frames

- Page / state: editing, load-failed, chapter-load-failed, loading, address-checking, no-manuscript
- Widths: 1440, 768, 390 (light).
- What is wrong: load-failed is a 356px panel centred at x=650-1006 with the title above it at x=650 (Script's is 720px); chapter-load-failed is a full-width panel inside the card; loading is a bordered card, address-checking has no card at all (title x=248 vs 265), no-manuscript has a centred title. Skeleton bars stop at 768px and are short of the loaded layout (no gutter, no takes chip), the loading skeleton shows two header buttons at 1440, one at 768; the title skeleton sits at x=346-570 beside "Editing".
- Where: `layout/LoadError.tsx:56` (`mx-auto max-w-3xl`, no `w-full`), `EditingPage.tsx:144-176`, `page/EditingSkeleton.tsx`.
- Severity: looks wrong
- Fix: `w-full` on LoadError; render the same card frame in all five.
- Evidence: `editing/load-failed/w1440.png`, `editing/chapter-load-failed/w1440.png`, `editing/loading/w1440.png`, `editing/address-checking/w1440.png`.
- Shared: LoadError. Supersedes: EDT-5, EDT-15

### XED-31 Active-line band and the 1000px text cap leave a dead strip at the right

- Page / state: editing, selection, fx-menu, inspector states
- Widths: 1440, 1920 (light).
- What is wrong: the active band is x=257-1257 inside a card to x=1407 (1920: text to 1257 in a card to 1523, with the legend and buttons at the far edge); the band's left edge (257) is 8px inside the card edge (249) and starts left of the title (265).
- Where: `script/Paragraph.tsx:37` (`max-w-[1000px]`, `border-l-[3px]`), `script/ScriptDoc.tsx:96`.
- Severity: looks wrong (1920), polish (1440)
- Fix: let the band fill the column or centre it.
- Evidence: `editing/fx-menu/w1440.png` (band right edge x=1257), `editing/drawer-effects/w1920.png`.
- Shared: page-local. Supersedes: EDT-12

### XED-32 Below 860px the 76px time gutter eats a quarter of the script width

- Page / state: editing, all script states
- Widths: 390 (light).
- What is wrong: script starts x=126 and is 205px wide, 3-4 words per line, with the right edge empty.
- Where: `script/Paragraph.tsx:37` (`grid-cols-[76px_...]`), `script/ScriptDoc.tsx:96` (`pr-7 pl-2`).
- Severity: looks wrong (390 is secondary)
- Fix: time above text in one column below `tiny`.
- Evidence: `editing/daw-off/w390.png`, `editing/fx-menu/w390.png`.
- Shared: page-local. Supersedes: EDT-11

### XED-33 At 390 the script is a 115px sliver under banner, header and bar

- Page / state: editing, daw-off, suggestion-step
- Widths: 390 (light).
- What is wrong: banner, three-row header, edit-off sentence, three-row bar and four-row key hints leave script visible at y=375-490.
- Where: stack in `page/EditingBody.tsx:496-560`.
- Severity: looks wrong (390 secondary)
- Fix: collapse key hints and the off-notice at 390.
- Evidence: `editing/daw-off/w390.png`.
- Shared: page-local.

### XED-15 Effects tab leaves the bottom half of the drawer blank under a stray rule

- Page / state: editing, drawer-effects, drawer-effects-chains
- Widths: 1440, 1920, 1024, 768, 390 (light).
- What is wrong: content ends at y=470 and a section rule at y=487 floats in the middle of an empty panel that runs to y=871 (at 1920 to y=1051). In the chains state the rule is at y=645.
- Where: `drawer/Drawer.tsx:46` (every section carries `border-b`, including the last).
- Severity: polish
- Fix: no bottom rule on the last section.
- Evidence: `editing/drawer-effects/w1440.png`, `editing/drawer-effects/w1920.png`.
- Shared: page-local.

### XED-16 Favourite buttons are nearly touching and the chain list has a different heading style

- Page / state: editing, drawer-effects-chains
- Widths: 1440, 1024, 768, 390 (light).
- What is wrong: the two "FAVOURITE" buttons are 32px tall with a 2px gap (y=507-537, 539-569), so they look double-stacked; "Your REAPER FX chains" is muted sentence-case text while "ADD AN EFFECT" above it is a small-caps heading; the long "Favourites are saved..." note runs under them as a paragraph.
- Where: `effects/AddEffect.tsx:63-70` (`flex-col gap-1`, `li` without spacing).
- Severity: polish
- Fix: 8px between rows and the small-caps section heading.
- Evidence: `editing/drawer-effects-chains/w1440.png` (y=480-630).
- Shared: page-local.

### XED-25 Toast straddles the card edge and covers key hints

- Page / state: editing, voice-sample-mark-open, voice-sample-saved
- Widths: 1440, 1024, 768, 390 (light).
- What is wrong: "Saved voice sample for Hatter. Undo X" is x=1133-1420 at 1440, half over the card and half over the page, covering "Keep take (T picks which)" and "Hide others"; at 390 it is off-centre (x=82-356); the close X is a bare glyph.
- Where: toast host (shared).
- Severity: polish
- Fix: align to the card's bottom-right or to the viewport centre consistently.
- Evidence: `editing/voice-sample-saved/w1440.png` (y=835-880).
- Shared: toast primitive.

### XED-28 The off-notice above the bar is unbalanced and not part of the bar

- Page / state: editing (any state where Delete/Mute/Add FX are off)
- Widths: 1440, 768, 390 (light).
- What is wrong: 8px above the sentence, about 4px below it before the bar rule (`pt-2`, no bottom padding), so the sentence hugs the line under it; at 390 it wraps into two lines.
- Where: `page/EditOffNotice.tsx:10` (`px-3.5 pt-2`).
- Severity: polish
- Fix: `py-2`, or move the sentence into the bar.
- Evidence: `crops/xed/bar.png` (top).
- Shared: page-local.

### XED-34 Drawer header and card header are 4px apart in y

- Page / state: editing, `drawer-*` at 1440
- Widths: 1440, 1920 (light, dark).
- What is wrong: drawer close X at y=77-113, the card's icon buttons at y=81-117; drawer title 20px and "Editing" 28px, so the two header baselines differ.
- Where: `drawer/Drawer.tsx:60` (`py-2`) vs `page/EditingHeader.tsx:28` (`pt-3`).
- Severity: polish
- Fix: same top padding.
- Evidence: `editing/drawer-effects/w1440.png` (y=77-117).
- Shared: page-local.

### XED-35 Voice-sample dialog: 43px select over a 36px input, and a checkbox style that differs from the cut dialog

- Page / state: editing, voice-sample-dialog
- Widths: 1440, 1024, 768, 390 (light).
- What is wrong: Character select 43px, Label input 36px, Note textarea; the checkbox is solid orange here but faded peach in the cut dialog; at 390 the quote wraps to three lines ("was / beginning to / get").
- Where: `voicesample/*` form.
- Severity: polish
- Fix: one control height; one checkbox style.
- Evidence: `editing/voice-sample-dialog/w1440.png` (y=275-480).
- Shared: Select, Input primitives.

### XED-36 Small alignments in the script

- Page / state: editing, default
- Widths: 1440 (light).
- What is wrong: the mini-wave card under a paragraph is 232px wide above a 321px takes chip (ragged right edge, y=300-380 vs 395-420); the speaker chip pushes only the first line right (x=398 against 343); the time stamp sits about 3px below the first text baseline.
- Where: `script/Paragraph.tsx:40-43`, `takes/TakeChip.tsx`, `script/SpeakerChip.tsx`.
- Severity: polish
- Fix: match widths; hang the chip in the gutter.
- Evidence: `editing/fx-menu/w1440.png` (y=300-420, 645-665).
- Shared: page-local.

### XED-37 Slider track starts 9px inside its label

- Page / state: editing, drawer-effects-inspector
- Widths: 1440, 390 (light).
- What is wrong: Gain track runs x=1078-1386 against label x=1069 and value to 1395.
- Where: `primitives/Slider.tsx:68` (`px-[9px]`).
- Severity: polish
- Fix: `-mx-[9px]` on the control.
- Evidence: `crops/xed/insp.png` (y=870).
- Shared: Slider primitive. Supersedes: SHARED-1

### XED-38 Focus ring on the script scroller is clipped (carried, not re-seen)

- Page / state: editing, selection, takes-open
- Widths: all (light).
- What is wrong: only top and bottom rules show; left and right are cut by the card.
- Where: `script/ScriptDoc.tsx:96`, `page/EditingBody.tsx:498`.
- Severity: polish
- Fix: `ring-inset`.
- Evidence: round 1 `editing/selection/w1440.png`.
- Shared: page-local. Supersedes: EDT-13
