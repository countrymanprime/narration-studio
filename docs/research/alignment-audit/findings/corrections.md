# Corrections to earlier rounds

Part of the [alignment audit](../../alignment-audit.md). Where a later reviewer found an earlier finding wrong or mis-measured.

## Round 3: booth

- XBO-13 says the toast X is "x=1388-1404" and the toast ends 1420; the scanner rect for record-turned-away at 1440 is [1387, 503.4, 17, 20.4] and, for the same state, shows two Dismiss buttons 8px apart (503.4 and 495.4): two toasts exist in the DOM at once (the "REAPER is starting" info toast under "Narration Studio is busy"). One is mid-animation in the capture, so only one is visible, but both overlap by 249x10 for a moment. XBO-13's measurement of one toast stands.
- XBO-3 says the A button stays on row 1 at 1024 record-connect and the panel button drops; my 1024 captures of daw-not-linked, daw-not-running, record-turned-away and builtin-recording show the same split (A on row 1, panel button alone on row 2 at x=12), so it is not specific to record-connect; the 768 captures of all notice states put both on row 2 (see R3BO-2).
- XBO-22: the picker is `!w-[190px]` at 1280 and below, but the Resume chip and the status text next to it also lose space at 1024: the label there reads "CHAPTER 1 DOWN THE RA..." with about 100px free to its right, same as 1280 (confirmed in `p-setup.png` bottom and `s-setup.png`).
- XBO-4: at 1920 the notice is x=20-1900 and the side panel stops where the notice starts (y~822 of 1080); at 1280 the notice is x=16-1264 and the side panel is not shown (drawer), so the "strip at x=1900-1920" and "cut side panel" apply at 1920 and 1440 only.
- XBO-1 says the 390 notice is up to 45%: confirmed (`t-a.png`: record-turned-away notice y=185-545 of 844, text window about 70px). The 1024 notice cases also lose a line of reading text but not the active line.

## Round 3: editing

- XED-4: the cause is not "click toggles the drawer closed". The shared-load capture (`lib/capture.ts:276-300`) never ran the narrow branch. Corrected in R3ED-1.
- XED-38: seen now (selection 1440): the focus ring shows as two blue rules, top (y=95) and bottom (y=582), across the card; confirmed.
- XED-22: popover is anchored to the bar and opens down/outward over Delete; confirmed. (An interim note of mine saying it opens upward was wrong and was removed.)
- XED-25: in dark the toast is also a dark chip (hairline border); only the selection toolbar inverts to a cream chip.
- XED-13: confirmed, and the unhighlighted row is the second one (the selection); the inspector shows the first effect (R3ED-7).
- XED-15: the stray bottom rule is confirmed at 1440/1280/1024/768/390 and in dark; the blank under it is 290/230/237/493/285px scaled respectively.
- XED-31/XED-32/XED-5/XED-9/XED-10/XED-12/XED-18/XED-21/XED-27/XED-28/XED-36/XED-37 all reproduced where I looked; XED-27 key hints: at 1440 the 2nd row "S Timeline | X Clear" is centred at x=577-662, and with the drawer open row 2 starts at x=302 (not centred).

## Round 3: engine-1

- ENX-16 (dialogs jump between states): confirmed for create regions at 1920 too (top y=107/127/111/91 in the 1100 px crop scale: preview 134, empty 150, error 137, success 121), but the window clipping in R3EN1-2 is a separate, worse cause when the body scrolls.
- ENX-1 says "STATUS starts at x=945 (confirmed) / 954 (missing)": at 1920/1280/1024/768 the offsets stay constant for the same state (STATUS x=225 confirmed, 234 missing in the 720 px panel crops), so the jump is between the two states only, not between widths.
- ENX-17 attributes the stretched row to link-chapters only; the same 70vw cause makes every other dialog stretch (R3EN1-1), so one cap in `Dialog.tsx` fixes all of them.
- ENX-24 (Tracks card double bottom border): confirmed at 1920/1280/1024/768 and dark; I measured the rule at the card bottom (y≈805 at 1920 crop) with the table's last row border merged into the card's rounded border, same as stated.
- ENX-3 says the button repeats 12 times: in chapter-link-confirmed it is 12 rows (one linked and 11 unlinked), in chapter-link-missing also 12, correct. The label wraps to 2 lines in all of them at all five widths and in dark.
- ENX-28 says chapter-tags-idle shows the faded disabled primary and the success state a full-strength one: confirmed in light and dark at all widths (chapter-tags-ready is also faded until the checkbox is ticked), so the faded look means "checkbox not ticked", not "idle".

## Round 3: engine-2

- ENX-29 gut reaction and title say "the panel title wraps one letter per line". The panel title "Audio engine" stays on one line at 390 (all 18 states); it is the card title "REAPER project" that breaks, to "REAPE / R / projec / t" when the long "Link a different REAPER project file" button sits beside it. In no-daw-link and no-rpp, with the shorter "Link a REAPER project file" button, the title breaks into two lines ("REAPER / project"), not four. Title width is not the panel's.
- ENX-27 says the Plays/Silent column "wobbles by 3 px". Measured on retake-lanes-list w1920: right edges are identical (x=1484 for both words), left edges differ by 3 px (1453 vs 1450) only because the words differ in width. The word is right-aligned; the defect is the missing fixed slot/badge, not a drifting edge.
- ENX-23 treats lost column headers as a scroll behaviour only; in link-chapters-error and -success the state opens already scrolled to the bottom (description and table header out of view, first visible row cut by the header rule), so the headers are missing in the default view of those two states, not only after a user scroll.
- ENX-16 lists dialog height/position as the variable part; the width is also a variable (R3EN2-2): 1342 px at 1920 to 538 px at 768 for the same dialog.

## Round 3: master-delivery

- **XMS-2**: not only error / measured. At 1280 and 768 in the error state eight to eleven long chapter names wrap (`Chapter 4 — The Rabbit Sends / in a Little Bill`) even on rows whose message is only "No file measured yet", because the one long message in row 1 widens the message column for all rows and starves File; at 1920 nothing wraps. Rows alternate 39 and 53px. In empty at 1920, 1280 and 1024 nothing wraps (all messages are short), so the cause is the longest message, not the width.
- **XMS-8**: the Remove-versus-Add-files gap is 17px at 1440, 16px at 1280 and 60px at 1920 (Remove right edge x1385, Add files x1445); the Role column x was 586 (picked), 712 (running), 736 (ready) at 1920.
- **XMS-13**: the dialog is 1342px wide at 1920 (x289-1631), not just the 1006px of 1440; its field column starts a constant 254px from the dialog's left edge at every width, so at 1920 about 940px of the dialog is empty.
- **XMS-18**: the mid-word path break ("...\Wonderland\A / CX", "...\M / y ACX, tighter peak") also happens at 1920; I did not open 1024 or 768 for it.
- **XDL-11**: build-failed does not overflow at 390. The states whose Delivery card runs past the page edge are default, failing-chapter and many-chapters (one-row header; values end x378, "Built in" chip x325-370); measured, building, build-failed, ready and custom-profile show a stacked header and a card that fits (values end x357-368).
- **XDL-5**: also clipped at 1024 (new finding R3DL-5), a supported width round 2 did not open.
- **XDL-4**: the truncation depends on the pill: with "Pass" pills (ready, building, built, host-quiet) every name fits in full at 1920 ("Chapter 3 — A Caucus-Race and a Long Tale"), with "Not mastered" or "Waiting on 3 pickups" the same names are cut.
- **XMS-14** (label column shift) and **XMS-17** (divider y119 vs y127) reproduced at 1920 as stated; **XMS-1** (Title input about 35px with one letter at 390) reproduced.

## Round 3: production-1

- XPR1-2: also true at 1280 (round 2 did not open it). Titles are cut at about 198 px: "Chapter One — Down the Rab…", "Chapter Two — The Pool of T…" and "Chapter Four — In Which Alic…" (`import-confirm/w1280.png` y 390-545), scanner W3 scrollW 237>198 and 207>198.
- XPR1-12: confirmed; the note is three lines at 1920 as well (y 40-70 in the 1100 px view), so the "buttons float at the middle of a 3-line block" applies at every supported width.
- XPR1-13: the triple message also exists in the no-deadline variant, see R3PR1-7.
- XPR1-21: in dark the unselected radio is a near-invisible dark disc against the dialog, worse than in light (`dark:production/chapter-remove-confirm/small-desktop.png` x 172-188 y 416-432).
- XPR1-31: the "right column stops while the left scrolls" statement only holds from 1180 px up; below it the right column is not a column (R3PR1-3).
- Coverage note on XPR1-8: at 1280 the This week / Recording check pair is equal height but headers are 51 vs 60 px, so the rules do stagger there too (`chapter-sync-toast-undo/w1280.png` y 498 vs 509), consistent with the finding.
- No round-2 finding was found mis-measured at the cells I opened.

## Round 3: production-2

- XPR2-39 (toast): also present at 1920 (over the chart), 1280 (over the pipeline header and the first two rows, x812-1260) and at d768 (x300-748, y947-1003); round 2 said it is gone at 768. See R3PR2-10.
- XPR2-41 (loading): the skeleton keeps its three-column second row at 1280 (x80-574, 590-919, 935-1264) and at 1024 (x80-464, 480-736, 752-1008), where the loaded page is 2-up / one column; at 1280 the third row is a big block with two stacked blocks where the page has the pipeline full width, then 2-up. At 1920 the left pipeline block ends at y785 and the right stack at y833.
- XPR2-1 (stat tiles): in addition to the label collision, the four values are on two baselines (R3PR2-4); the collision and the cut "about 155/mi" occur at 1920 and 1280 too (the panel is 320 px at every width).
- XPR2-3 (import names): the truncation also hits at 1280 ("Chapter One Down the Rabb...", "Chapter Two — The Pool of T...", "Chapter Four In Which Alice ..."), and at 1920 only row Four is truncated, while an 85 px gap sits before "1,733 words".
- XPR2-12 (chips): the chips are also 20 x 20 hit areas (R3PR2-21); at 1920 they sit on the row lines from "Chapter 1" to "Chapter 3" and again at Chapter 7-12.
- XPR2-21 (import icons): at 1920 and 1024 the "i" icons end on the same right edge as the selects (x1167 / x851); the 8 px offset round 2 measured is only at 1440. I did not re-measure 1440.
- XPR2-47 (candidate dialog): the title "Import manuscript?" and the body "Import it now?" ask the same question twice, and "the import button" it points to is behind the scrim.
- XPR2-20 (import preview): at 1920 the Import options card ends at y651 while the list ends at y795, 174 px blank under it; the preview title ("Chapter One — Down the Rabbit-Hole") names a heading that is inside the collapsed Narration chapters group.
- XPR2-33 (G4 hit): the 12 / 84 px gap hit is the options fieldset, only visible when the options are open (options state).
- XPR2-45 (dark stage bar tones): confirmed at d1440 / d1024 / d768 (Proofed is brighter than Edited in dark); still may be intended.
- Round 2's statement "no defect appears only in dark" misses the dark rail sun / gear (R3PR2-27) and the light-cream toast on a dark page (R3PR2-10).

## Round 3: proof-chapter

- XPC-1: also true at 390 (light), where TINY SMALL MEDIUM TURBO fill row 1 and LARGE sits alone on row 2 (`S/proof-chapter/compare-setup/w390.png`, y=655-690); the model, chunk and workers groups stack as three blocks (A5/A4 hits are the stack, not a defect). At 1280 and 1440 the third column is empty from x~1190 as stated; I confirmed 1280 too.
- XPC-2 / XPC-4: also true at 1280. Paragraphs column starts at x=461 (default), 383 (preview-shorter), 290 (preview-warnings) on 1280, and at 1280 preview-warnings "Chapter 2 - The Pool of / Tears" wraps with the 3-line warning wrapped again (`S/proof-chapter/preview-warnings/w1280.png`). At 1024 round 2 mentions only chapter 3 wrapping; in the dark 1024 capture every row's "Why suggested" wraps to two lines ("Starts and ends on paragraph / boundaries."), rows 47/47/53 px per scan. At 768 (dark tablet) preview-warnings has "Chapter 2 / - The Pool / of Tears" in three lines and a five-line warning.
- XPC-8: the scan (A1/G4) says at 390 the many-pills box is 209 px tall with a 46.8 px gap, so the wand and input drop to a third row; that part is off-screen in every capture and unverified by eye. At 1280 and 1920 I confirmed the wand sits at the bottom right of the two-row box with the empty top-right corner.
- XPC-11: also at 1920 the slide-over (x=1600-1920) does not push the page, which is centred at 428-1708, so 108 px of page content (the step strip's "3 - Results", "Last narrated take", the right end of the Start button as "STAR", the pin buttons) is hidden with no scrim; at 1280 and 1024 it hides "Parallel workers" and everything right of x~955. The title is also 14 px bold on two lines at every width.
- XPC-22: the Start/End controls are now seen (light 1920, dark 1440 and 1024): "Start:" and "End:" labels with 36 px +/- buttons, the Start "+" disabled and paler; all content occupies the left 380 px of a 1158 px card, with the X alone at the right edge, a 52 px heading row, and in pin-stale a 14 px warning, a 14 px summary line and a 12 px warning in 70 px (warn icons also differ in size). The card also sits 10-12 px under the table's last row rule, so two parallel horizontal lines run 12 px apart across the card. In the dark and light 1920 captures no row's pin button looks "pressed" for the pinned Chapter 1 (range 1 to 4 vs rows 1 to 24); may be fixture data.
- XPC-6: dark 1440 and 1024 confirm the select (40.8 px, bright text) beside a dim 36 px ASSIGN reads as two unrelated controls; the play button is 42x32.
- XPC-18 / XPC-16 / XPC-14: confirmed at 1920 and 1280; no change.

## Round 3: proof-pickups

- XPF-3 says the progress ring shows "a faint speck". At d1024 the ring is a dashed empty circle (`dark:proof/chapter-no-recording/small-desktop.png` x=787-822, y=85-122) while the text beside it says "1 of 1 cleared": a complete state drawn as an empty ring. The defect is that the ring does not show progress at all, not only that it is faint (ring source `components/proof/frame/ProofHeader.tsx:21`, `size-9 rounded-full` conic gradient).
- XPF-4 says "From wraps 'Local AI compare / 0.82'". At w1280/w1024/w768 it wraps as "Local AI compare" / "· 0.82" (the separator dot leads the second line) and in dark d1024 the dot ends line one; see R3PF-15.
- XPF-2 lists "w1440, w1024, w768, w390". It also holds at w1280 (a half-cut checkbox at y 562, `proof/check-recordings-dialog/w1280.png`) and at d1024/d768 (`dark:...`). At w1920 the dialog is not cut (round 2 saw it open).
- XPF-18 measured the bar-to-name gap as 480 px at 1440; at 1920 it is about 800 px (dialog 1342 px wide).
- XPF-13 says the toolbar sits "right, level with the chips" at w1920. That holds for default; in find-open at w1920 the sort select moves to x=1006 and the find box takes its slot, so the toolbar position also changes with Find (x=1189 closed, x=1006 open); in the empty state at w1280 it drops under the chips although 250 px are free (`proof/empty/w1280.png` y=293-333).
- XPF-10 "address-checking is the same skeleton as loading" is confirmed at w1920, w1280, d1024, d768; it is also confirmed there is no hint bar in either skeleton, so the bottom of the page moves when the real state loads.
- XPK-4 says the lone flag button under "Open 3 in Booth" is a Pickups-only problem; it appears in every state except no-manuscript, at every width, including w1920 where the card is 358 px wide.
- XPK-11 "three toasts sit on top of the session card at 390 and 1024": at d1024 and w1280 they do not cover live content but still repeat (R3PK-2); at w1920 they are clear of the cards.
- XPF-24 (pill text 2 px below the row's centre line) was measured by round 2 at 1440 only; at w1920 and w1280 I see the label and the row text on one centre line within 1 px, so treat it as a w1440-only defect.

## Round 3: schedule-shell-misc

- XSH-2 says the side cards are full-width at 1280; confirmed (Contract 1184 px wide at 1280, seen).
- XSL-3 says the hamburger is white at 768: confirmed, and at 390 the search icon button is also 32 px grey with the hamburger 36: confirmed.
- XSL-7 / XSL-8: the icon centres are all x=28.5 (measured), so only the glyph widths differ; the left-edge defect is the wordmark (R3SL-1), not the icons.
- XSH-13: at 1280 the pill's top is y=69 and the title centre y=71, a 2 px gap, not 4 px (1440 measure of 4 px stands).
- XPJ-1: at 1920 the picker sits at y 140-150 (logo) rather than y=260; the logo height still differs by state.
- Not opened by me: startup is clean in the scanner (0 hits) but I could not read my startup montages (limit).

## Round 3: script

- XSC-1 (mark dialogs too wide): also true at 1920, where the dialog is 1344 px wide (70vw) and centred on the viewport, so it straddles the chapter list and the rail (`mark-composer/w1920.png` x=288-1632 at full scale; define-marks the same). At 1280 it is 896 px.
- XSC-2 (define-marks trash drops to its own line): confirmed in dark at 768 (`define-marks/tablet.png`, trash at x=134-170, y=262-297 under every swatch); at 1024 dark the rows are one line (trash right edge x=852).
- XSC-5 (selection toolbar away from the word): at 1920 the toolbar is about 220px above the selection; at 1280 it is about 175px above and covers line 2 of the paragraph ("and of havin..."); dark 1024/768 the same, so this is not width-specific. Harness cause still unconfirmed.
- XSC-7 (find label wraps): also true at 1920 and 1280 (`find/w1920.png`, `w1280.png`): every row still shows "Chapter 1 ·" with "¶ n" on a second line even with 700+ px free; fifth row is cut at the list bottom at both widths.
- XSC-18 (retail-sample rule): at 1920 the rule is visible (x~388 at 0.573 scale, 12px left of the text) and broken into separate segments at each paragraph, as at 1024/768; only 1440 loses it.
- XSC-20 (toast): the 1280 and 1920 toast also sits at the sheet/panel corner; see R3SC-3.
- XSC-34 (drawer lopsided at 390, chapter-list not opened): measured now. The chapter drawer is x=25-357 in a 390 viewport (25 px left, 33 px right) with the reader card at x=17-373, so the sheet is 8px inside the card on the left and 16px on the right. Its list ends with "CHAPTER 10" sliced by the legend at y=730, and the legend is three stacked rows (x=46-110, y=745-805). The legend dots sit at x=46 against row circles at x=49.
- XSC-45 (sun next to gear in dark): confirmed at 1280 and 1024 dark (collapsed rail, two gear-like glyphs at y=623/660 of 688 and y=708/750 of 768).
- XSC-13 (blank rail): at 1280 and 1920 the Notes and Queries panels hold one sentence over about 480 px of empty panel; confirmed.
- XSC-40 (invalid-payload): at 1280 the card is x=268-886 (about 618 wide) not 720, so the card width changes with the viewport; the toast right edge is 20px from the window while the card gutter is 40px at 768.

## Round 3: settings-1

- XSE1-10 (dialog width): at 1920 the confirm and progress dialogs are 1308 px wide (x 306-1614, centred on the window, not on the settings column that ends at x=1412); at 1280 they are 768 px and one-line sentences are ok. The footer rule differs as in round 2.
- XSE1-3 (shortcut scroller): besides slicing the bottom row, the inner scroller also slices the top edge. In `global-keyboard-conflict` and `-recording` at w1920 and w1280 a 40-50 px sliver of the previous row (the bottom edge of a CHANGE button and key chips) shows as a stray dash at the top of the box (y ~352 of the pair crop). At w1280 and w1920 the recording panel's second button row ("Reset to default", "Cancel") is cut at the bottom of the box, so Cancel shows only its top half; at 1920 and 1280 this is the default view of the state, not only at 1440.
- XSE1-12 (import review): the title truncation also occurs at w1280 ("Chapter One - Down the Rab...", scanner W3 `#76-#81`, clip 39 px and 9 px), not only at 768 and 1440. At w1920 "Chapter Four - In Which Alice Considers a Great Many Things About Cats, Di..." is clipped by 291 px of text next to a 1,733 words label.
- XSE1-1 (empty half of the row): the same half-empty card appears for Reader text, Shortcuts, Delivery profile, Record with (w1280 and w1920), Narrator name/Credits and Start tone; in `global-keyboard*` at w1920 the label column holds only 4 short lines against a 600 px well.
- XSE1-16 (1920 cap at x=1412): confirmed at w1920 for all the settings states (nav x 232-460, content to 1412); the models table at w1920 has the same 924 px width as at 1440, so the extra 480 px is empty in every state, not only `models` and `models-needs-repair`.
- XSE1-9 / dark: the pink "Credits" highlight band is a brown tint in dark 768 and also square at the bottom corners of the rounded card (confirmed, `deep-link/tablet.png` y 690-960).
- Coverage note on round 2: round 2 said the w1920/w1280 layouts of the other states are "the same grid"; they are, except the shortcut and capture panels, import review (right preview pane appears at w1280 and w1920 only, 2-column dialog) and the profile editor (5 columns spread over a 1306 px dialog at w1920: RULE column 200 px for "Room tone, head" and an ACX reference column about 400 px wide for 120 px of text).

## Round 3: settings-2

- XSE2-6 (Connection card buttons): at w1920 `recording-linked` shows all three buttons (Change linked file, Start REAPER, Test connection) on one line; the 2+1 and 1+1+1 wraps are the 1440 and 1024 arrangements, so "wraps differently at every width" is accurate but 1920 is the only width where it does not wrap.
- XSE2-32 (content stops at 1180, "1920: content ends x=1412"): at w1920 the content column does not grow: control column is 425 px at 1280, 1440 and 1920 alike, so the page does not use extra width at all; the page looks the same at three widths.
- XSE2-17 says the left meta block bottoms out at a different y than the control; confirmed in `speech-advanced` w1920 (Two-pass check row about 125 px vs First-pass model row about 109 px at 1920).
- XSE2-3: the B1 hit "Preview voice" at 1024 (content ends at 92 of 219 px, `voice`) is also true, not only the tall rows XSE2-3 lists.
- Nothing in round 2 was mis-measured in the cells I could check; the 44 cells I could not open are listed above.

## Round 3: storybible-1

- SBX-4 says the row-2 Source button wraps at 1024 and at 768 is inline. Confirmed at 1024 (alias: `ENTERED BY ME` drops under the input at x433-591, y342-372). At 768 both rows are inline; additionally at 1024 the name-own row (`entry-names-own-pronunciation`, one name) keeps the Source inline but its IPA input is only 168 px wide (x569-737), narrower than the 158 px Source button beside it.
- SBX-18 says the footer floats with the list card leaving about 350 px empty below at 1440. I measured the list card against the detail card at all four desktop widths (light, surface-colour scan of the card edge column): the list card is full height at every width (bottom y882 at 1440, y1062 at 1920, y782 at 1280, y750 at 1024, identical to the detail card), so the blank space under a short list exists at 1920, 1280 and 1024 too, not only 1440. The 768 and 390 layouts are the exceptions (R3SB1-2).
- SBX-6 attributes the header drift to edit mode only; the same Character pill is also 235 px from the name at 1440 in edit and 560 px at 1920 (name x607 vs pill x1167 in actual pixels) and at 1024 it wraps under the name at x433 with the name at x456; this matches SBX-6 and nothing needs changing beyond the 1920 figure.
- SBX-9 describes a 100 px dead gap at 1440; measured here the Value input ends at x901 (1100-wide capture) and the move/remove group starts at x978 (scaled to about 1280/1400 in page pixels: 77 px at 1440), and at 1920 about 130 px. At 768 the inputs fill the row (Name 205, Value 272, buttons 609-725) with no dead gap, so the gap is a wide-window problem only.

## Round 3: storybible-2

- SBX-24 (record button "filled dark disc"): not re-checked here (name-clash unopened); leave as is.
- SBX-16 and SBX-18 hold at w1440 (confirmed in search-narrowed d1440) but the list card hugs its rows at w1920 and w1280, so SBX-18's "stretched" description is only true at w1440/w1024 (R3SB2-13).
- SBX-17: confirmed; measurements added in R3SB2-7.

## Round 4: booth-1

- R3BO-2 says at 768 "both drop and sit under Previous at x=11-65". Only true when the bar has no Resume chip: following and builtin-recording at 768 (dark) put A + panel at x=16/62 on row 2 under Previous with the chips staying on row 1. In every state that shows the "Resume at" chip (daw-not-linked, daw-not-running, builtin-setup, builtin-refusal, builtin-take-ended, dark default) row 2 is the Resume chip at the left and chips + A + panel right-aligned, with no stack under Previous. So the position of the same two buttons switches between left-under-Previous and right-aligned from state to state (an extra inconsistency, worth stating in R3BO-2/XBO-3).
- R3BO-2 says at 1024 only the panel button drops (daw-not-linked): confirmed for daw-not-linked (panel alone on row 2 at x=14), but daw-not-running (dark d1024) drops both A and panel (x=14, 55) because its chip is wider; so the 1024 break depends on chip text length.
- XBO-4 / R3BO-5 hold in dark; at d1440 builtin-refusal the meter stays on the footer row (no lone meter row), so the "lone meter row" part of R3BO-5 is a 1280 and below effect.
- R3BO-1 (bookmark flag offset) not re-examined here (bookmarks-ribbon dark was opened by round 3).

## Round 4: booth-2

- XBO-10 lists the lone meter row only at 1024/768; it also occurs at 1280 for record-other-project (see R4BO2-7).
- R3BO-2 lists 8 states; plain recording and voice-samples-recording at 768 show the same double stack (R4BO2-5). Also in setup at 768 the tools are right-aligned, so the stack is not general.
- R3BO-1..10: no contradictions found in the cells I opened.
- XBO-19: confirmed at d768 voice-samples-panel (drawer x=448-768, three reading lines clipped to 5-6 words); not a new finding.
- Round-3 note that dark differs only in colour: confirmed for all 31 cells, with one exception, R4BO2-9 (the skeleton loses its contrast in dark).

## Round 4: delivery

- **R3DL-2** (status beside Cancel while running): not true for host-quiet and host-quiet-cancelled. There the pre-build status is removed (`stale`, `OutputPanel.tsx:49-52`; 1280 host-quiet and cancelled show Build, Cancel and nothing else on that line). It is true for building (Cancel then "Every chapter passes.") and for build-failed.
- **R3DL-4** (many-chapters): the captures show 5002 chapters in the count ("0 of 5002") and a long list, but the current `Preflight.tsx:15,48` caps the list at 100 rows with a "Show the other 4902 chapters" button; the 4,650px tall figure in the scanner capture predates or is a different build from this code. Re-check against a fresh capture before fixing. The 1280/1024 names are cut at different places because pills differ in width ("Waiting on 3 pickups" 100px versus "Not mastered" 76px), which makes Chapter 3 shorter than its neighbours.
- **R3DL-5** (rules table clipped at 1024): also true in dark (d1024). Extra detail: the row dividers stop at x541 while the card's inner edge is x555, so the scroll box is narrower than the card by the card padding and the cut-off "Measured: -23 to" has no right margin at all; at dark 768 the Source notes are cut mid-word at x735 ("ACX Che", "judge", "is no").
- **XDL-9** (toast): the toast also covers the "14 of 14" count and the first Pass pill of "Before you build" at 768 and 1024 (dark built tablet y960-1010), not only the list end.
- **XDL-12 / R3DL-4**: at 768 and 390 "Before you build" has a 700px (768) gap between chapter name and pill with no row rules; in tall w1440 the aside card ends 25px under the last row, in host-quiet-cancelled dark 1440 it is stretched to the left column with a 150px blank tail.
- **Not new** (already filed, reproduced): rail theme-toggle icon looks like a second gear in dark (R3 line 194, SHL-12); padlock on the current page in no-manuscript (R3MS-7); disabled primary at about 2:1 (R3MS-5, applies to Delivery's Build button in measured, default, many-chapters, failing-chapter, loading).

## Round 4: master-1

- R3MS-18 (consistency tick over the "-23.0" label): not only at 1280; the first tick stands on the "0" of "-23.0" at dark 1024 (x253 over label x210-260) and dark 768 (x183 over x145-190). At 768 the band has 140-160px side margins and the caption sits flush left (XMS-20).
- R3MS-19 (select caret overlaps its label at 390): not visible in cancelled and error at 390 (label "CHAPTER 1 — DOWN THE ..." ends in an ellipsis about 12px before the caret). Treat the scanner hit as a false positive for those states; running 390 was not opened.
- XMS-2: wrapped chapter names are state-dependent, not constant: in cancelled at 768 four names wrap, in error at 768 all fifteen (R4MS1-2).
- XMS-7: at 1280 the Source column is narrower (130px) than at 1024 (180px) (R4MS1-3); at 768 "Conflicting sources" also folds (R4MS1-4).
- R3MS-8 (theme icon looks like the Settings cog): confirmed at dark 1024 (x28 y622 vs y658).
- R3MS-2, R3MS-3, R3MS-4, R3MS-5, R3MS-15, R3MS-16: confirmed in dark at 1440/1024/768 (diagnostics-empty, -error, -cancelled, -findings, -running), no dark-only layout difference. Dark-only note: the disabled unselected toggle ("RAW RECORDINGS") in diagnostics-running is near-invisible on the card (R3MS-5), and the "Not measured" pill fill nearly equals the row colour in dark.

## Round 4: master-2

- R3MS-7 says a padlock is shown on all ten pages in no-manuscript. In dark 1440 (`dark:master/no-manuscript/desktop.png`, rail zoom `S/crops/r4ms2/nm-d-rail.png`) there are nine padlocks: Production has none; the open page (Master & QC) carries one. Re-check the light 1920 count before quoting ten.
- R3MS-13 / XMS-8: the Remove column ends 30px short of the card edge at 1024 (x961 vs Add files... x991) and 10px short at 768 (x725 vs x735); 60px is the 1920 figure only.
- R3MS-12: at 1024 (dark) the Master & encode button is inline at the end of the checkbox sentence (x818-946), confirming round 3's 1920/1024 inline claim.
- XMS-18 (mid-word path break) occurs only at 1280, 1920 and 390; at 1024 and 768 both paths fit on one line (`S/master/multi-export-results/w1024.png`).

## Round 4: proof-chapter

- XPC-1 at 1024 dark: LARGE alone on row 2 of the Whisper group (confirmed), and at 768 two buttons (TURBO, LARGE) wrap; gutters between the three setup groups are 33 px and 98 px at 1024, not equal.
- R3 'Still unopened: load-failed light 1280' is now seen: same layout as 1440.
- Nothing in rounds 2/3 found wrong in the cells I opened.

## Round 4: settings-2

- R3SE2-3 (Reset link): at 1280 the link baseline sits about 9 px above the title baseline (link y 66, title y 75 in the 1280 capture), slightly more than the 6 px measured at 1920; confirmed visible in recording-builtin w1280.
- R3SE2-1 (radio dots): confirmed in all 44 cells where a radio appears; in dark d1440/d1024 the unselected disc is close to invisible on the card (about 1.2:1), worse than the 1.35 stated.
- XSE2-28: dialog width is `70vw`, so 1006 px is the 1440 value only (1340 at 1920, about 700 at 1280); see R4SE2-3.
- XSE2-8: at 1920 the DAW state also stacks Refresh under the select with 300 px free beside it, so "stacked at 1440 only" is wrong.

## Round 4: shell-misc

- R3SH-8 ("note touches the 2h tick label", 1280/1024/768): measured on the tall captures the note starts about 14 px right of the "2h" label at 1280 (not 4 px), so it does not touch the label; the real defect is the plan line and 2h gridline running through it (XSH-8) and, on Production only, the "today" collision (R4SM-1).
- R3SH-3 (1920: chart and side cards): checked at zoom, the chart card and the "How this is worked out" card end on the same y within 1 px; the finding is only about the stretched width.
- R3SL-2 / R3SL-3 (engine chip): first sight of engine-mismatch at 1024: the amber chip is 61 x 22 and sits next to a 36 px Jump field; no banner or text elsewhere in the view explains the mismatch; that confirms R3SL-2, no change.
- Round 3 said the dark 1280/1920 cells were "not captured"; global/theme-dark/w1920.png is the dark-theme state rendered in the light run and was usable (seen, R4SM-16).
- Round 3 coverage note on the Milestones table: tall/schedule-w*.png (on-pace seed) shows only the lone Final row, not the long-name rows; the Arabic and five-line rows at 768/1024/390 are still unseen.

## Round 4: storybible

- R3SB2-13 ("list card hugs its rows at w1280"): in search-narrowed, review-filter and voice-samples-empty the list card is STRETCHED to the bottom at w1280 (empty space of about 270 px under Voice data in search-narrowed, 200 px in review-filter). Only w1920 hugs the rows (ends y~495 in search-narrowed, y~610 in review-filter). The tall w1440 capture also hugs. So the rule is height-dependent, not width-dependent.
- SBX-7: at w390 in review-filter the Mark reviewed button (x109-225) does not overlap the pills (x32-94); the pills are 10 px vertical strips and the dot is orphaned (R4SB-11).
- SBX-1 / R3SB2 owner example: in name-clash the stacked partner is the record disc, not the play square; elsewhere the play square.
- SBX-24 (record button): in light name-clash it is a dark filled disc with no glyph; in dark it is a pale filled disc (reads as "on"), confirmed.

## Round 4: tall-a

- XPR2-15 (right column stops 210 px above the pipeline column): in the tall capture at 1440 the gap is about 140 px, and at 1920 the right column is taller than the table (see R4TA-5); the measurement depends on the window height.
- XPR2-11 ("Fin. is a left-aligned header over right-aligned numbers"): in the tall captures at 1440, 1280 and 1920 the FIN. header and its info icon end flush with the right-aligned times (header right edge equals the "0:14" right edge), so I could not reproduce the left-aligned header; the 6 px indent against the card title is still true.
- R3SB1-3 ("At 768 the stacked list is a 3-row window"): in the 2600 px tall capture the 768 list shows all eight entries with no window; the 3-row window is a function of window height, not of width (the claim stands only for short windows).

## Round 4: tall-b

- XPF-7 says the notes card ends 119 px above the inspector at 1440 in a 1000 px window. In the 2600 px capture the inspector card is a rounded card with a 16 px margin that runs to y=2550 (about 1850 px of empty card below "ADD NOTE"), and at 1024/768 the inspector's own lower 350 px is empty too, so the stretch is not only "next to the notes card": the inspector card has no content-height end at any width (`ProofPage.tsx:520`, `row-span-2`).
- XPF-8 says "uneven gaps between cards" below 1180; in the tall capture the gap between the notes card and the inspector is 370 px at 1024 and 400 px at 768 (the header card is stretched to 520-540 px with a 400 px blank interior above the table), so the stretching depends on window height, not on content.
