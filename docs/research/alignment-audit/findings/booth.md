# Booth: alignment findings

Part of the [alignment audit](../../alignment-audit.md). Findings are grouped by the round that produced them; a later round's finding that replaces an earlier one says `Supersedes`. Evidence paths are `<page>/<state>/<width>.png` of the light capture, `dark:<page>/<state>/<viewport>.png` for dark, `tall:<page>-w<width>.png` for the below-the-fold captures; the images are not committed (regenerate the repo-viewport ones with `pnpm --dir apps/ui visual:page <page>`).

## Round 4: gap fill

### R4BO1-1 Narrow footer stacks three status rows: controls, then the sentence, then a lone meter

- Page / state: booth / builtin-setup, builtin-refusal (also `daw-not-*` at 768)
- Widths: 768 (dark seen, same in light); 1024 builtin-refusal gets two rows
- What is wrong: "The footer is a tall stack of little rows." At 768 builtin-setup the footer is Record + timer + Levels on row 1 (y=845-880), the amber sentence "Choose the microphone the Booth listens to..." alone on row 2 at x=16 (y=907), then "Room not measured yet" with its meter alone and right-aligned on row 3 (y=947), about 130px before the hint strip, with ~280px of dead space above the first text line. Row 1 has ~400px free beside the controls that the sentence (350px) would fit in only if the Levels button group were not also holding the grid; the meter row has 500px free to its left. Extends XBO-10 (which describes the lone meter row) with the three-row result.
- Where: `frame/BoothFooter.tsx:84-110` (flex-wrap row; the sentence and the meter group each `flex-none`/wrap to their own row).
- Severity: looks wrong
- Fix: at narrow widths put the sentence under the Record row at full width and the meter in the same row as the timer (`ml-auto`), or move the meter into the Levels popover.
- Evidence: `dark:booth/builtin-setup/tablet.png` (y=830-960), `.../builtin-refusal/tablet.png`
- Shared: page-local

### R4BO1-2 Built-in recorder notice talks about a DAW and about "waiting" for a setting inside this app

- Page / state: booth / builtin-refusal (all widths, light and dark)
- Widths: all
- What is wrong: "Why does the built-in recorder card send me to DAW settings, and who is it waiting for?" The card is titled "Recording in the built-in recorder is experimental" but its second button reads "DAW SETTINGS", and the status row reads "Waiting for Record to be turned on in the built-in recorder. Last checked 0 s ago." with a CHECK AGAIN button: polling language that belongs to REAPER's remote switch, for a switch that lives in this app's own Settings. A narrator with no DAW sees two DAW words on a card about the built-in recorder.
- Where: `record/RecordSetup.tsx:149` (hard-coded "DAW settings"), `:154-156` (`CheckLine` rendered when `check.onCheckAgain` is set; same for in-app plan).
- Severity: looks wrong
- Fix: label the button "Recording settings" (or "Open settings") for the in-app plan and drop the Waiting/Check again row when `plan.inApp` (nothing external can change).
- Evidence: `dark:booth/builtin-refusal/desktop.png` (card y~640-800 at 1440), `booth/builtin-refusal/w1440.png`
- Shared: page-local (RecordSetup)

### R4BO2-1 The REAPER chip says "fine" or "linked" while the card and footer say it is not

- Page / state: booth / record-other-project, record-turned-away, record-connect (dark and light)
- Widths: all (checked 1280, 1024, 768, 1440 dark)
- What is wrong: "The badge and the box disagree." other-project shows a green "REAPER" chip (healthy) while the card says "REAPER has a different project open" and Record is disabled; turned-away shows "REAPER · not running" while the card title says "REAPER started" and the footer says "not answering"; connect shows "REAPER · linked" (amber) with "not connected" below. Three statuses on one screen, none matching.
- Where: `record/SetupChip.tsx:53-54` (`ready` is only `state === 'connected' || 'app'`, so a connection to the wrong project is green)
- Severity: looks wrong
- Fix: tone from the same plan the notice uses (wrong project = warning), and one wording ("linked, not connected") shared by chip, card and footer.
- Evidence: `dark:booth/record-other-project/desktop.png` (chip top right), `booth/record-turned-away/w1280.png`, `booth/record-connect/w1280.png`
- Shared: page-local (SetupChip)
- Extends: XBO-5, XBO-11

### R4BO2-2 Primary action is a filled orange button in one notice and a plain outlined one in the next

- Page / state: booth / refusal vs record-connect, record-turned-away, record-other-project
- Widths: all (dark 1440/1024/768, light 1280)
- What is wrong: "Which one am I meant to press?" In refusal "Turn on Record" is filled orange next to outlined "DAW settings". In connect, turned-away and other-project the one real action ("Open in REAPER and connect", "Link the open project") is outlined exactly like "Check again" and "DAW settings", so the card has no visual lead and the same card family changes character between states.
- Where: `record/RecordSetup.tsx:145` (default primary) vs `:207`, `:349` (`variant="secondary"`)
- Severity: looks wrong
- Fix: primary for the single recovery action in every notice, secondary for the rest.
- Evidence: `dark:booth/refusal/desktop.png` (filled), `.../record-connect/desktop.png` and `.../record-other-project/desktop.png` (outlined)
- Shared: page-local

### R4BO2-3 The sentence after the buttons belongs to the first button but sits after the second, and its row flips with width

- Page / state: booth / record-other-project, record-connect, record-turned-away
- Widths: 1440 and 1024 (inline), 1280 and 768 (own row), dark and light
- What is wrong: "Whose caption is this?" In other-project "Choose the project file REAPER has open." follows DAW SETTINGS but describes LINK THE OPEN PROJECT. In connect/turned-away the description of the button is inline at 1440 but drops to its own row at 1280 (button alone at y~422, description y~447 of 563) and at 768 wraps with a one-word orphan ("REAPER."), so the button/caption pairing changes with each width.
- Where: `record/RecordSetup.tsx:205-214` (buttons then caption in one `flex-wrap` row), `:349-352`
- Severity: looks wrong
- Fix: put the caption under the button it describes in every width (a two-line button group), and DAW settings in its own trailing slot.
- Evidence: `crops/r4bo2/c.png`, `g2.png`, `p.png`
- Shared: page-local

### R4BO2-4 At 1280 the "busy" toast covers a line of the script

- Page / state: booth / record-turned-away
- Widths: 1280 (no side panel to straddle; at 1440 it sits on the divider, XBO-13)
- What is wrong: "A box is sitting on my script." The toast is at x~810-1260, y~330-380 (of 800) over the third reading line, hiding "but it had no" while the card below says the same sentence in red and the title says it again (third repeat).
- Where: `primitives/Toast.tsx` stacking above the notice via `useToastClearance` (`record/RecordSetup.tsx:20-24`), placed at the bottom-right of the text window, not in a gutter
- Severity: looks wrong
- Fix: suppress the toast when the notice already carries the message, or dock toasts above the footer outside the reading window.
- Evidence: `crops/r4bo2/h.png`
- Shared: `Toast`
- Extends: XBO-5, XBO-13

### R4BO2-5 A and panel buttons jump to the far left under Previous during a take, but sit right in setup

- Page / state: booth / recording, voice-samples-recording, record-connect (1024)
- Widths: 768 (all three), 1024 (record-connect)
- What is wrong: "Why are two buttons stacked at the left, and why did they move?" In dark d768 recording and voice-samples-recording the A and panel buttons sit at x=16-97, y=55-90, directly under the 36px Previous button (double stack, gap 8) while the REC and REAPER chips sit right on row 1. In setup d768 the same two buttons are right-aligned on row 2; in roll-confirm they sit directly after the chips mid-row (x=215-297). Their position follows whichever chips are present, and the panel toggle ends up far from the drawer it opens (drawer at the right).
- Where: `frame/BoothTop.tsx:76` (`flex-wrap`, spacer `flex-1` at :94 only helps on the row it lands on)
- Severity: looks wrong
- Fix: one right-aligned `ml-auto` group holding chips and both tools.
- Evidence: `crops/r4bo2/m.png` (recording d768), `af.png` (voice-samples-recording d768), `aa.png` (roll-confirm d768), `k.png` (setup d768)
- Shared: page-local
- Extends: R3BO-2 (which did not list plain recording or voice-samples-recording)

### R4BO2-7 The meter row is orphaned at 1280 as well; three footer rows at 1024 and 768 with a notice

- Page / state: booth / record-other-project, record-connect, record-turned-away
- Widths: 1280 (meter alone), 1024 and 768 (three rows)
- What is wrong: "The footer is a stack of three little rows." At 1280 other-project the meter and Room-tone chip sit alone on a second right-aligned row (y~745 of 800, 220px right of Record) with the sentence on row 1; at 1024 and 768 the dark notice states show Record row, then the "why" sentence alone at x=14-16 (2 lines at 768), then the meter alone, then two rows of key hints: five rows at the bottom, 130 px of the 1024 height.
- Where: `frame/BoothFooter.tsx:84-110` (`flex-wrap`; the sentence is not truncated)
- Severity: looks wrong
- Fix: drop the sentence while a notice is up (it duplicates the card) so the footer stays one row.
- Evidence: `crops/r4bo2/i.png`, `n.png`, `o.png`, `q.png`
- Shared: page-local
- Extends: XBO-10 (listed only 1024/768 and light), XBO-5

### R4BO1-3 The bar offers "Resume at paragraph 1" while the reading position already is paragraph 1

- Page / state: booth / builtin-take-ended (all widths; light and dark)
- Widths: all
- What is wrong: "Resume where? I am already there." Chip "Resume at ¶ 1" and "from your last reading" sit in the bar next to "¶ 1 of 24 - 0%" (bar x=427-555 at 1440 dark, 1280 light). It adds a target of 22px (R3BO-8) and says nothing useful.
- Where: `resume/` chip logic (cause not found in detail; the chip is shown for any saved position).
- Severity: polish (may be intended)
- Fix: hide the chip when the saved paragraph equals the current one.
- Evidence: `dark:booth/builtin-take-ended/desktop.png` (top bar), `booth/builtin-take-ended/w1280.png`
- Shared: page-local

### R4BO1-4 Companion: the pickups count is monospace prose over a sans sentence

- Page / state: booth / companion-default, companion-listening
- Widths: companion 380 and the 1440/1024/768 renders
- What is wrong: "Why is this one line typewriter?" "3 pickups remaining of 3" is IBM Plex Mono 13px, directly above the sans 14px sentence "Jump to one or mark it done...", and every other section body in the column is sans; the mono line also has a 29px row height against 20px sans lines.
- Where: `pickups/PickupsCompanionSummary.tsx:7-8` (`ROW` with the mono family, copied from mock 07's list).
- Severity: polish (may be intended: mock 07)
- Fix: use the sans body style for the count and keep mono only for tags.
- Evidence: `dark:booth/companion-listening/desktop.png` (Pickups section y~500, zoom crop `crops/r4bo1/a.png` at the time)
- Shared: page-local

### R4BO1-5 Dark skeletons nearly vanish, and the bars sit on a different grid from the page they stand in for

- Page / state: booth / address-checking, companion-loading
- Widths: 1440, 1024, 768 (dark); layout part also in light
- What is wrong: "It looks like an empty window." In dark the grey bars (about #2a2620 on #141311) are barely visible: companion-loading shows two blocks and two labels in the top 30% with nothing else; address-checking shows three text bars starting at x~352 of 1440 (x=267 of 1024, x=176 of 768) while the real text starts at 25-40, and no skeleton for the hint strip. The live "Go to Production" button sits above bars that look disabled. Adds the dark contrast to XBO-14.
- Where: `companion/CompanionSkeleton.tsx` and the address skeleton (skeleton token, cause of colour: shared Skeleton fill; not read in detail).
- Severity: polish
- Fix: raise the skeleton fill one step in dark, use the same text column x and the five-section count of the real page.
- Evidence: `dark:booth/companion-loading/desktop.png`, `dark:booth/address-checking/desktop.png`
- Shared: Skeleton fill token

### R4BO1-6 "Closing credits are not set up" card: buttons crowd the paragraph, dead padding around

- Page / state: booth / credits-missing
- Widths: 1440, 1024, 768 (dark; same box in light)
- What is wrong: "The buttons are glued to the sentence and the card is loose around it." Heading to body gap is ~17px, body to buttons only ~13px, while the card has ~70px of empty space above the heading and ~55px below the buttons (card 232px tall for ~110px of content), and the card is pinned to the top of an otherwise empty window. Primary and secondary buttons are different widths (189 vs 159 at 1440; XBO-15 lists it).
- Where: `UnresolvedCreditsWarning.tsx` / `page/CreditsWarning.tsx` card (gap classes; cause not read in detail).
- Severity: polish
- Fix: 16-24px between body and buttons (larger than heading-body), symmetrical 32px card padding, card centred or capped width.
- Evidence: `dark:booth/credits-missing/desktop.png` (zoom crop of x=380-1060, y=40-260)
- Shared: page-local

### R4BO1-7 The chip says "REAPER not running" but the card and the footer talk about something else

- Page / state: booth / daw-not-running (light and dark, all widths)
- Widths: all
- What is wrong: "Which is the real problem?" The top chip reads "REAPER - not running", yet the notice card is the generic "Recording in REAPER is experimental... Waiting for Record to be turned on in REAPER" (identical to daw-not-linked) and the footer reads "Experimental: switched off in Settings". Nothing on the page tells the narrator the actual blocker (REAPER is off) except the 22px chip; the story for this state expects "REAPER is not running" as the footer sentence (`frame/BoothFrame.stories.tsx:76`). May be a fixture where the experimental gate was left off.
- Where: `page/BoothNextPage.tsx` notice selection (the experimental gate takes precedence over the not-running reason); `frame/BoothFooter.tsx` why.
- Severity: polish (may be capture fixture)
- Fix: put the not-running reason first in both card and footer, show the experimental notice after it.
- Evidence: `dark:booth/daw-not-running/desktop.png` vs `.../daw-not-linked/desktop.png` (identical card and footer)
- Shared: page-local

### R4BO2-6 The line above a setup notice is sliced in half by the card's top edge

- Page / state: booth / record-other-project (1280, 1024 dark, 768 dark), record-connect (1024 dark, 768 dark), record-turned-away (1280)
- Widths: 1280, 1024, 768
- What is wrong: "Why is half a line of text showing above the box?" The bottom fade of the reading window ends under the card, so the next line shows only its upper half (glyph tops) just above the card border; it looks like a rendering glitch.
- Where: `reading/BoothText.tsx` fade mask vs `record/RecordSetup.tsx:27` card on top, with no relation between the window's height and the line height
- Severity: polish
- Fix: end the text window at the card's top edge (the notice inside the flex column, not overlapping) so the mask finishes at the border.
- Evidence: `crops/r4bo2/i2.png`, `n.png` (y~285), `o.png`
- Shared: page-local

### R4BO2-8 A 200-300px empty band above the first line, while a notice squeezes what is below

- Page / state: booth / setup and notice states
- Widths: 768 (310px at setup, 230px with a notice), 1024 (200px)
- What is wrong: "Why is the top half empty?" The active line sits about a third down, so d768 setup shows a black band y=100-410 then the text; with a notice the band stays and the card covers the lines below. The card body also ends with the widow "now." (other-project, 768).
- Where: `reading/BoothText.tsx:214` (`py-[30vh]`)
- Severity: polish (may be intended: fixed reading line)
- Fix: size the lead-in with the available height (clamp to e.g. 15vh) when a notice or the footer grows.
- Evidence: `crops/r4bo2/k.png`, `q.png`
- Shared: page-local
- Extends: R3BO-6

### R4BO2-9 Loading skeleton is almost invisible in the dark theme

- Page / state: booth / loading
- Widths: 1024, 768 (dark)
- What is wrong: "It looks like a blank black page." The bars are a gradient between `--surface-2` and `--border`, a few percent lighter than the background; the three text bars and both bar blocks are barely there. Bar gutters are 20px and the bar is 52px high, against 16px and 56px in the real frame.
- Where: `primitives/Skeleton.tsx:8` (gradient tokens), `page/BoothSkeleton.tsx:24` (`px-5`, `min-h-13`)
- Severity: polish
- Fix: a skeleton fill with 1.3:1 or better against the page in both themes; match `px-4 min-h-14`.
- Evidence: `crops/r4bo2/v.png`, `w.png`
- Shared: `Skeleton`
- Extends: XBO-14

### R4BO2-10 The saved position is shown three times in one strip

- Page / state: booth / resume (also setup, all states with a Resume chip)
- Widths: 1024, 1440 (768 on two rows)
- What is wrong: "Same thing three times." Mid-chapter the bar reads "¶ 14 of 24 · 59%", then the chip "Resume at ¶ 14", then "from the saved project", all describing the same place with the reading position already there.
- Where: `frame/BoothTop.tsx:86-92`
- Severity: polish (may be intended: chip is the offer)
- Fix: hide the chip once the reader is at that paragraph.
- Evidence: `crops/r4bo2/x.png`
- Shared: page-local

### R4BO2-11 "finished left" reads as a typo

- Page / state: booth / every state
- Widths: all
- What is wrong: "~13:48 finished left" in the monospace progress line sounds like a mistake ("finished" and "left" are both adjectives); a narrator expects "~13:48 left".
- Where: `frame/progressLine.ts:23`
- Severity: polish
- Fix: "~13:48 left to finish" or "~13:48 left".
- Evidence: `crops/r4bo2/a2.png`
- Shared: page-local

### R4BO2-12 During a take the footer still shows an idle grey meter and "Room not measured yet"

- Page / state: booth / recording, voice-samples-recording
- Widths: all (dark 1440, 1024)
- What is wrong: "The meter is dead while I am recording." The flat grey bar and the "Room not measured yet" chip stay at the right of the footer with no level moving.
- Where: `frame/BoothFooter.tsx:84-110` (cause of the meter state not read)
- Severity: polish (may be intended: the meter is not fed by this host)
- Fix: hide the room-tone meter while recording.
- Evidence: `crops/r4bo2/d.png`, `l.png`
- Shared: page-local

## Round 3: coverage gaps and scanner cross-check

### R3BO-1 Bookmark flag sits a line or two below the line it marks

- Page / state: booth / bookmarks-ribbon
- Widths: 1440 and 1280 (light and dark); right at 1920 and 1024
- What is wrong: "Why is the bookmark not next to the first line?" The bookmark is on "Alice was beginning..." (line 1, y~339 at 1280), but the flag is drawn at y=401-427 (beside line 3, about 62px low). At 1440 it is at y=411 beside line 2 (one line, about 54px low); at 1920 (y 237 beside line 1) and 1024 (beside line 1) it is correct. The offset differs with width, so the flag cannot be trusted to show where the mark is.
- Where: `apps/ui/src/components/booth/bookmarks/BookmarkRibbons.tsx:111-139` (`measure()` reads the word's top once from `getBoundingClientRect` and re-measures only on column resize; a text-size or font reflow after the first measure leaves a stale `top`). Cause not confirmed in a running app.
- Severity: looks wrong (may be capture timing; the stale measure is real in the code path)
- Fix: re-measure after fonts load and on every text-size change (also observe the text node, not just the column).
- Evidence: `booth/bookmarks-ribbon/w1280.png` (flag y=401, Alice y=339), `.../w1440.png` (flag y=411, Alice line y~360 in the 1440 crop), crops `crops/r3bo/rib1280b.png`, `rib1440b.png`, `rib1024b.png` (aligned)
- Shared: page-local
- Scanner: H1 hit at rect [1164, 401.4, 16, 26] (w1280) and [1084, 411.4, 16, 26] (w1440) only shows the position, not the offset

### R3BO-2 Top bar: the two icon buttons that drop to row 2 land directly under the Previous-chapter button

- Page / state: booth / daw-not-linked, daw-not-running, record-turned-away, builtin-recording, builtin-take-ended, following (768), record-connect, builtin-setup, record-other-project
- Widths: 1024 (states with a long REAPER chip) and 768 (most states); 390 always
- What is wrong: "Why are there two buttons stacked in a column at the left?" The 36px Previous-chapter button at x=16, y=10 has the 36px panel (or A) button right under it at x=16, y=54 (gap 8px), so the bar reads as a double-stacked pair of icon buttons at the left while the rest of the bar is on row 1. At 1024 daw-not-linked the A button stays on row 1 at the right and the panel button alone drops to x=12, y=37; at 768 both drop and sit under Previous at x=11-65.
- Where: `frame/BoothTop.tsx:76` (`flex flex-wrap`) and `:94` (spacer `flex-1` stays on row 1), same cause as XBO-3 but the visible result (stack under the first button) is not in XBO-3.
- Severity: looks wrong
- Fix: right-aligned `ml-auto flex flex-none` group for chips and tools, or collapse Tools into one menu button at narrow widths.
- Evidence: `crops/r3bo/s-daw-not-linked.png` (left: 1024, panel button under Previous), `s-record-turned-away.png`, `s-builtin-recording.png`, `t-a.png` (390: panel under Previous? the A/panel pair at right on row 3)
- Shared: page-local
- Scanner: A9 `button.size-[var(--button-height)]` same x 16, gap 8, w1024/w768, 8 states

### R3BO-3 Suspected lines: three identical 32px square X buttons stacked in a column for three one-line rows

- Page / state: booth / following (Suspected section in the side panel)
- Widths: 1440, 1920 (also the drawer widths)
- What is wrong: "Why do these lines each have a big box with an X?" Each 14px text row gets a 32x32 outlined X (x=1392-1424, y=95, 133, 171 at 1440; gap 6px) so the right edge is a column of three boxes, taller than the rows of text beside them (rows are 38px apart for 20px of text). The X buttons are the heaviest thing in the panel and look like the "double-stacked" icon buttons from round 1.
- Where: `apps/ui/src/components/booth/suspected/SuspectedLines.tsx:93` (`IconButton ... size="sm"` inside `li.flex.items-center.gap-2.text-sm`).
- Severity: looks wrong
- Fix: a 24px ghost X (no border) or a single "Dismiss all" plus per-row text button; keep the row height at the text height.
- Evidence: `crops/r3bo/susp.png` (3x zoom), `booth/following/w1440.png` (x=1392, y=95-203)
- Shared: `IconButton` size sm
- Scanner: A9 `button.size-[var(--button-height-sm)]` x 1392 gap 6

### R3BO-4 Model-download dialog: facts are loose text lines, labels and values do not share a column, and the path breaks mid-word

- Page / state: booth / model-required
- Widths: 768, 390 (path break); all widths (no value column); light and dark
- What is wrong: "It reads like a pasted log." The body is seven separate lines "Model: Small / Version: 536b... / Download: 464 MB - Systran / Disk needed / Saved to / License / Model card - Provenance" with a bold label and the value starting wherever the label ends (value x=216, 230, 218... at 1440 dark), no two-column definition grid; "Model card - Provenance" has no label at all. At 768 (dark tablet) the path wraps as "faster-whisper/s" then "mall" (an `overflow-wrap:anywhere` break inside the folder name) and at 390 the dialog is 271px with the same break.
- Where: `apps/ui/src/components/booth/WhisperModelPrompt.tsx` (body lines; not read in detail, cause is the unstructured lines plus `Dialog.tsx` body `[overflow-wrap:anywhere]`).
- Severity: looks wrong
- Fix: a `dl` grid `max-content 1fr` with the label column right- or left-aligned, the path in a monospace box that wraps at `/`, and "Model card" as a labelled link row.
- Evidence: `crops/r3bo/dk-model-required.png` (1440 dark: values at ragged x; bottom-right 768: "whisper/s|mall"), `crops/r3bo/p-model-required.png` (1920/1280 light)
- Shared: page-local (WhisperModelPrompt)

### R3BO-5 Footer shows two different "why" sentences run together on one line, then the meter is dropped to a lone row

- Page / state: booth / builtin-refusal (and builtin-setup, which shows only the amber one)
- Widths: 1920, 1280 (1024/768/390 wrap further, see XBO-10)
- What is wrong: "Two sentences glued together in two colours." Grey "Experimental: switched off in Settings." and amber "Choose the microphone the Booth listens to in Levels, so the text follows your voice." sit on the same line with a 12px gap and no separator (x=128 to 535 at 1920; x=192 to 802 at 1280), so they read as one sentence. At 1280 (wide enough for the whole footer at 1440) the Room-tone meter drops alone to a second row at y=1150 right-aligned, as at XBO-10, because the two sentences push it over.
- Where: `frame/BoothFooter.tsx:84-110` (`why` and the mic hint both rendered inline in the same flex row).
- Severity: looks wrong
- Fix: one status slot that shows the highest-priority sentence (the amber mic prompt), the other in the Record button's tooltip.
- Evidence: `crops/r3bo/p-builtin-refusal.png` (top: 1920, bottom: 1280), `crops/r3bo/s-builtin-refusal.png` (1024: sentence on its own row, meter row below)
- Shared: page-local

### R3BO-6 The reading text jumps up when a setup notice appears or goes

- Page / state: booth / every notice state vs. setup
- Widths: 1920 (about 35px), 1280 (about 57px), also 1024/768
- What is wrong: "The line I am about to read moves when the card shows up." The reading window is the height left over by the notice and footer, so the active word is centred higher: "Alice" is at y=201 (1920 scale) in daw-not-linked and y=236 in setup; at 1280 y=777 vs 834 in the 2-image composites (about 57px). The narrator sees the page slide when REAPER connects or fails.
- Where: `reading/BoothText.tsx:214` (`h-full` text window, `py-[30vh]`) inside the flex column that places the notice (`page/BoothNextPage.tsx:553-565`) in the column.
- Severity: polish (may be intended: the notice shrinks the window)
- Fix: overlay the notice or keep the text window height fixed and let the notice cover its fade zone.
- Evidence: `crops/r3bo/p-setup.png` (1920: Alice y=236) vs `crops/r3bo/q3.png` top (Alice y=201) at the same width
- Shared: page-local

### R3BO-7 Marked note says the same thing twice: inline note and the side panel's Reference

- Page / state: booth / marked-note
- Widths: 1440, 1920 (panel visible)
- What is wrong: "Didn't it already say that?" The inline note "Word stress: Lean on it: she is bored, not sleepy." is repeated as the side panel's top section "REFERENCE / Word stress "tired" / Lean on it: she is bored, not sleepy." about 400px to the right.
- Where: `side/Reference.tsx` + `reading/BoothText.tsx:267` (note) on the same marked word.
- Severity: polish (may be intended: panel is the reference, note is the in-line cue)
- Fix: keep the note short ("Word stress") inline and the sentence in the panel.
- Evidence: `crops/r3bo/p-marked-note.png` (top: panel y=40-70, note y=390)
- Shared: page-local

### R3BO-8 Status chips in the top bar are 22px tall buttons

- Page / state: booth / every state with a Resume chip, a REAPER or Built-in chip, "3 tokens have no value"; companion header "REAPER: Linked"
- Widths: all
- What is wrong: "The chip looks small and fiddly to press." The Resume (86.6x22), Recording-setup (53-112 x 22), credits (120.7x22) and companion REAPER chips are clickable but only 22px tall (x=617-703 and 1119-1172 at y=17 at 1440), against the 36px icon buttons in the same row.
- Where: `primitives/HeaderChip.tsx:21` (`h-[1.375rem]`), also `record/SetupChip.tsx`.
- Severity: polish
- Fix: pad the hit area to 24-32px (negative-margin padding) or draw the chip at 28px.
- Evidence: `crops/r3bo/s-following.png`, `booth/setup/w1440.png` (y=17-39)
- Shared: `HeaderChip`
- Scanner: H1 (9 distinct chip hits)

### R3BO-9 Toast "Undo" is a 33x20 text link

- Page / state: booth / bookmarks-ribbon ("Bookmark added. Undo")
- Widths: 1280, 1440, 1920
- What is wrong: "The link is hard to hit and is stuck beside the X." Undo is an underlined 33.2x20.4 text button at x=1184-1217, y=655 with the 17x20 close X 10px right of it (XBO-13): two tiny targets in a dark pill.
- Where: `primitives/Toast.tsx:62-65` (`button.flex-none.font-semibold.underline`, no padding).
- Severity: polish
- Fix: 32px-high ghost button for Undo with 8px gap to a 24px close.
- Evidence: `crops/r3bo/p-bookmarks-ribbon.png` (toast at bottom right)
- Shared: `Toast`
- Scanner: H1 `button.flex-none("Undo")` [1183.8, 655.3, 33.2, 20.4]

### R3BO-10 Companion read-along: every word is its own 6-23px wide button

- Page / state: booth / companion-listening (and the resume card words in companion-default)
- Widths: companion 380 and the wide-window variants
- What is wrong: "Each word is a button." 87 word buttons are 6-23px wide and 27px tall ("I" is 6.4px, "a" 8.5px); the focus ring and click target are smaller than a finger, and a click in the gap between words does nothing.
- Where: `booth/ReadAlongView.tsx` (one `button.cursor-pointer.rounded-[0.1rem]` per word).
- Severity: polish (may be intended: karaoke seek; hit slop via line click would fix it)
- Fix: make the paragraph the target and compute the word from the click x, or add horizontal padding to the word hit box.
- Evidence: digest rects, e.g. `[797, 301.4, 8.5, 27]`; `crops/r3bo/p-companion-listening.png`
- Shared: page-local
- Scanner: H1 (87 hits)

## Round 2: strict review

### XBO-1 Setup notice plus footer crush the teleprompter to 60-100px at 390 and make it small at 768

- Page / state: booth / record-connect, record-turned-away, refusal, daw-not-running, daw-not-linked, builtin-refusal, builtin-setup, record-other-project
- Widths: 390 (worst), 768, 1024; light (dark same layout)
- What is wrong: "Where did my script go?" The notice takes up to 45% of the window and the footer another ~155px at 390, so the reading pane is about 60px (one faded line "Alice was beginning" at y~175 on record-connect/390) and the notice's own list is cut mid-line at the bottom (y~575 "Settings then starts the link each time this app"). At 768 the text pane is about 400px with the active line near the fade.
- Where: `apps/ui/src/components/booth/record/RecordSetup.tsx:27` (`max-h-[45%]`, inner `overflow-y-auto` :34); `frame/BoothFooter.tsx:84-110` (rows stack at 390); `reading/BoothText.tsx:214` 90px fades; nothing gives the text pane a minimum height.
- Severity: breaks use
- Fix: at reflow fold the notice to title + disclosure (the `short` mode already exists for height) and give the text pane a `min-h`.
- Evidence: `booth/record-connect/w390.png` (text y=130-200, notice y=200-585), `.../refusal/w390.png`, `.../record-connect/w768.png` (notice y=530-830)
- Shared: page-local
- Supersedes: BTH-1

### XBO-2 Toast sits on top of the dialog's Cancel / Download buttons

- Page / state: booth / model-required
- Widths: 390 (light); at 768 and 1440 it lands clear but straddles other things (XBO-13)
- What is wrong: "Why can't I press Cancel?" The toast (y=548-625) covers the upper half of Cancel and Download model (buttons at y~600-630) in a 271px-wide dialog.
- Where: `primitives/Toast.tsx:88` (`fixed ... z-[var(--z-toast)]`, bottom anchored) above `primitives/Dialog.tsx` viewport `z-[var(--z-dialog)]`.
- Severity: breaks use
- Fix: queue toasts while a modal dialog is open, or lift the toast region clear of an open dialog.
- Evidence: `booth/model-required/w390.png`
- Shared: Toast over Dialog, any page
- Supersedes: BTH-2

### XBO-3 The top bar's right-hand tools jump to the left edge as soon as the bar wraps

- Page / state: booth / recording, voice-samples-recording, leave-dialog, roll-confirm, model-required, pickup-session, credits-unresolved, record-connect (longer chip "REAPER · linked")
- Widths: 768, 1024 (record-connect), 390
- What is wrong: "Why did the A and panel buttons move to the other side when I pressed Record?" At 768 recording the two icon buttons sit alone on row 2 at x=16-98, y=54-90 while at 768 setup they are at the right edge (x=670-752). At 1024 record-connect the panel button drops alone to row 2 at x=16-52 while the A button stays on row 1.
- Where: `frame/BoothTop.tsx:76` (`flex flex-wrap`, chips and buttons are separate flex children) and `:94` (`<span className="flex-1">` spacer stays on row 1).
- Severity: looks wrong
- Fix: put REC chip, setup chip, text button and panel button in one `ml-auto flex flex-none` group so they wrap together and stay right.
- Evidence: `booth/recording/w768.png` (buttons y=54-90 at x=16-98), `.../record-connect/w1024.png` (panel button x=16-52, y=54-90), `.../pickup-session/w768.png`, `.../pickup-session/w390.png`, `.../setup/w768.png` for the right-aligned reference
- Shared: page-local
- Supersedes: BTH-3

### XBO-4 Notice card runs the full window width: 1260px lines, 600px of empty space beside the buttons, and it cuts the side panel short

- Page / state: booth / all setup notices
- Widths: 1440, 1920, 1280 (light and dark)
- What is wrong: "Why is this one card so much wider than everything above it?" At 1920 the notice spans x=20-1900 with the explanation as one 1260px line and the buttons stuck at the left, while the text above is 1040px and the side panel above ends at y=822, leaving a strip at x=1900-1920 beside the card where the page background shows. At 1440 the notice y=642-800 hides the bottom 160px of the side panel too (panel ends y=642).
- Where: `record/RecordSetup.tsx:27` (`mx-5 mb-2 ... max-h-[45%]`, no max width) mounted outside the text/side row (`page/BoothNextPage.tsx:553-565`).
- Severity: looks wrong
- Fix: mount the notice inside the text column, cap it near 70ch, keep the side panel full height.
- Evidence: `booth/refusal/w1920.png` (notice y=822-980, strip at x=1900-1920), `.../daw-not-linked/w1440.png`, `.../record-other-project/w1440.png`
- Shared: page-local
- Supersedes: BTH-10 (partly: the 20 vs 16 inset is XBO-27)

### XBO-5 The same message is said three times on one screen

- Page / state: booth / record-turned-away, daw-not-linked, daw-not-running, record-other-project, builtin-setup, refusal
- Widths: all (light)
- What is wrong: "Didn't it already tell me that?" turned-away at 1440 shows "REAPER started, but its project was turned away" as the card title (y=585) and again as a red sentence (y=613), then the footer repeats "REAPER is not answering..." (y=837); other-project's footer sentence "REAPER has a different project open than the one linked here..." (y=837) repeats the card title and body.
- Where: `record/RecordSetup.tsx:221-237` (title plus alert paragraph), footer `frame/BoothFooter.tsx:90-100` (`why`).
- Severity: looks wrong
- Fix: while a notice is up, drop the footer `why`; drop the alert paragraph or the title.
- Evidence: `booth/record-turned-away/w1440.png`, `.../record-other-project/w1440.png`, `.../daw-not-linked/w1440.png`
- Shared: page-local

### XBO-6 Buttons of different height inside one notice card

- Page / state: booth / all setup notices
- Widths: all (light)
- What is wrong: "Why is Check again smaller than the buttons above it?" Turn on Record / DAW settings are 36px (y=711-747); Check again is 32px (y=755-787 at 1440); the connect card's Open in REAPER is 36 and Link in Settings / Copy path are 28-32. In the other-project card the button row is also centred on the text beside it but the status row's button is not on that centre line.
- Where: `record/RecordSetup.tsx:142-147`, `:186`, `:247`, `:267` (`Button` without `size` vs `size="sm"`; `CheckLine` button not read).
- Severity: looks wrong
- Fix: one button size in a notice (sm or default) and one baseline for the row.
- Evidence: `booth/daw-not-linked/w1440.png` (buttons y=711-747, Check again y=755-787), `.../record-connect/w1440.png`
- Shared: `CheckLine` (layout/CheckLine) and `Button` sizes

### XBO-7 Confirm dialogs: 1006px wide for one line at 1440, wrapped labels at 390, header/footer padding not matching

- Page / state: booth / leave-dialog, roll-confirm, model-required
- Widths: 1440, 1920 (too wide); 390 (too narrow); light and dark
- What is wrong: "A one-line question in a billboard." The popup is always 70vw: "Stop recording?" floats in a 1006px card with the text at x=235 and the only action at x=1090-1207; at 390 "KEEP RECORDING" and "STOP AND LEAVE" wrap to two lines in 114px-wide buttons (leave-dialog y=470-510). The title text and body start at x=235 but Cancel / Keep recording's border starts at x=233, and the X button ends at x=1205 while the primary action ends at x=1207 (header/body padding 1.1rem = 17.6px vs the action row's px-4 = 16px).
- Where: `primitives/Dialog.tsx:148-150` (`w-full ... max-w-[70vw]`), header `:44` (`px-[1.1rem]`), body `:57` (`p-[1.1rem]`), actions `:76` (`px-4`).
- Severity: looks wrong
- Fix: size to content (`w-[min(32rem,100vw-2rem)]`), one padding token for all three bands, let actions wrap or stack at narrow widths.
- Evidence: `booth/leave-dialog/w1440.png`, `.../leave-dialog/w390.png`, `.../roll-confirm/w1440.png` (Keep recording x=233 vs title x=235; X right 1205 vs Roll again right 1207)
- Shared: `Dialog` primitive
- Supersedes: BTH-4

### XBO-8 Speaker picker covers Record and the timer; its "sample" column has no common right edge; empty search box

- Page / state: booth / voice-samples-picker
- Widths: 1440, 1024, 768, 390 (light and dark)
- What is wrong: "Where did the Record button go?" At 1440 the popup runs y=459-843 into the footer (top y=808) and hides Record, the timer and the Levels button; at 768 it overlaps the footer by 6px and at 1024 hides the left of the footer and the first hint row (y=654-728). Inside, "1 sample" ends at x=307 on rows with a play button but "no sample" ends at x=347 on the rest, so the status column is ragged by 40px; the search input is empty with no placeholder.
- Where: cause not found (likely `reading/SpeakerChip.tsx` popup content plus `primitives/Popover` collision padding).
- Severity: looks wrong
- Fix: limit the popup height to the space above the footer, give the status a fixed trailing slot (reserve the play button width), add a placeholder or label.
- Evidence: `booth/voice-samples-picker/w1440.png` (rows y=601-809), `.../w1024.png`, `.../w768.png`, `dark:booth/voice-samples-picker/desktop.png`
- Shared: Popover placement (also on other pages with a popup near the bottom)
- Supersedes: BTH-17

### XBO-9 The Levels (microphone) button and the meter it controls are on opposite ends of the footer

- Page / state: booth / every state with the footer
- Widths: 1440, 1920, 1280, 1024 (light)
- What is wrong: "What is that little microphone for?" The microphone icon at x=194-230 has no label (its name "Levels" shows only on hover, builtin-recording/1440) and opens the input/mic/punch settings, but the live input meter and Room tone it relates to are at x=1169-1424. In between sits the "why" or "The text cannot follow your voice" sentence at x=246+ (listening-no-mic, daw-not-linked), so the sentence reads as the label of the wrong control.
- Where: `frame/BoothFooter.tsx:84-110` (Record, timer, `LevelsMenu`, why, `LevelsInline` with `ml-auto`).
- Severity: looks wrong
- Fix: group Record, timer, mic and meter as one left cluster (meter next to the mic), put room tone and text on the right; give the mic button a visible "Levels" label at least at wide widths.
- Evidence: `booth/listening-no-mic/w1440.png` (mic x=194-230, text x=246-600, meter x=1169), `.../setup/w1440.png`, `.../builtin-recording/w1440.png`
- Shared: page-local

### XBO-10 Footer wraps into a lone, right-aligned meter row; key hints wrap into an orphaned centred second row

- Page / state: booth / all states
- Widths: 1024 (hints), 768, 390, and 1024 / 768 with a long "why" sentence
- What is wrong: "Why does the meter sit by itself on the line below Record?" At 768 listening-no-mic, the 580px sentence pushes the meter and Room tone to their own row at x=497-752, y=947 (the third row of the footer area, 90px away from Record). At 1024 the key hints put "F11 Full screen, Exit" alone and centred on row 2 (y=750) under a row of seven. At 390 the hints are four ragged rows (3+3+3+1, "Exit" alone, y=826) with different widths of gaps per row. At 1024 record-connect the notice-state footer leaves a 36px gap row above the meter.
- Where: `frame/BoothFooter.tsx:84` (`flex flex-wrap gap-4`, `LevelsInline` has `ml-auto min-w-0` so it wraps as one block); `primitives/KeyHints.tsx:20` (`flex-wrap justify-center`).
- Severity: looks wrong
- Fix: put the "why" sentence on its own line or in a tooltip when it would force a wrap; give hints a grid (even columns) or drop the least-used ones at narrow widths instead of orphaning.
- Evidence: `booth/listening-no-mic/w768.png` (meter y=947), `.../setup/w1024.png` (hints row 2 at y=750), `.../setup/w390.png`, `.../record-connect/w1024.png`
- Shared: `KeyHints` primitive and page-local footer

### XBO-11 Top-bar chips are three different shapes and heights side by side

- Page / state: booth / following, voice-samples-recording, pickup-session, resume, builtin-take-ended
- Widths: 1440, 1024, 768 (light and dark)
- What is wrong: "Why do these three badges not look like one family?" The REC pill is squarer and 26px tall (x=1234-1269, y=15-41) next to the REAPER pill, fully round and about 20px tall (x=1279-1332, y=18-38); "Resume at ¶ 14" is a round 22px pill, while "Pickups · 1 open" is a square-cornered outlined 26px chip (x=401-499, y=15-41) in the same row; the setup chip and the 36px icon buttons next to them are 22 vs 36px.
- Where: `frame/BoothTop.tsx:78-90` (`Badge shape="booth"` for Pickups and REC) vs `primitives/HeaderChip.tsx:21` (`h-[1.375rem]`) for resume and setup chips; a second chip family `record/SetupChip.tsx`.
- Severity: looks wrong (may be partly intended: REC is meant to look urgent)
- Fix: one chip height and radius for status chips; make clickable chips 24px+ so hit area matches paint.
- Evidence: `booth/following/w1440.png` (REC vs REAPER at x=1234-1332), `.../pickup-session/w1440.png` (Pickups chip vs Resume pill on one bar)
- Shared: `Badge`, `HeaderChip`
- Supersedes: BTH-13 (chips part)

### XBO-12 Pickup row shows "Th…" and ends short of its container

- Page / state: booth / pickup-session
- Widths: 1440, 1920 (light and dark)
- What is wrong: "I can't read what the pickup says." The accent row packs a letter-spaced mono label ("Chapter 3 · 2:11") then the script span truncated to "Th…" then "Automatic" into 251px; the row also stops 4px short of its dismiss button and that button's right edge x=1424 aligns to nothing the row shares.
- Where: `booth/pickups/PickupSession.tsx:48-52` (`whitespace-nowrap` label, `min-w-0 flex-1 truncate` script, trailing "Automatic").
- Severity: looks wrong
- Fix: two-line row (label + Automatic on line 1, script on line 2).
- Evidence: `booth/pickup-session/w1440.png` (row x=1137-1388, y=95-127)
- Shared: page-local
- Supersedes: BTH-7

### XBO-13 Toast straddles the text/side-panel divider and sits 4px off the bars' right edge; close button is 17x20

- Page / state: booth / builtin-take-ended, model-required, bookmarks-ribbon, record-turned-away
- Widths: 1440 (also 1024, 768 for the 4px)
- What is wrong: "The toast lies half over the text and half over the panel." At 1440 it spans x=972-1420, y=731-788: it begins inside the reading column (over the fade) and crosses the divider at x=1120 into the side panel; its right edge is 1420 while top bar and footer content end at 1424. The X is a bare 17x20 target with no padding (x=1388-1404).
- Where: `primitives/Toast.tsx:88` (`right-[calc(1.25rem+...)]`, bottom 1.25rem) and `:72` (`<button className="flex-none">`).
- Severity: looks wrong
- Fix: anchor the toast to the side panel / a fixed corner with the page's 16px inset; give the close button a 24px hit area.
- Evidence: `booth/builtin-take-ended/w1440.png`, `.../record-turned-away/w1440.png` (toast y=477-542 over the text and the panel), `.../bookmarks-ribbon/w1440.png`
- Shared: `Toast`
- Supersedes: BTH-13 (toast part)

### XBO-14 Loading skeleton does not match the real frame; the two loading states do not match each other

- Page / state: booth / loading, address-checking, companion-loading
- Widths: all (light and dark)
- What is wrong: "The page jumps when it loads." The skeleton bar is 52px tall and inset 20px (real: 57px, 16px), the side-panel blocks are 3 tall cards inset 12px (real: text sections), the footer is 56px with no hint strip (real: 57 + hints), the text placeholder is a 416px column at x=352-768 (real: text at x=40, 1040px wide). `loading` shows two skeleton blocks in the bar, `address-checking` shows the real "Booth" title and a "Go to production" button, so the same wait looks different. The companion skeleton has 2 blocks (real: 5 sections) and a 80px-wide button block (real 100px, 32px tall; skeleton 28px).
- Where: `booth/page/BoothSkeleton.tsx:25` (`px-5 min-h-13`), `:31-32` (`max-w-[26em]`), `:41` (`p-3`), `:48`; `companion/CompanionSkeleton.tsx`.
- Severity: looks wrong
- Fix: build skeletons from the real tokens and structure; one header for both loading states.
- Evidence: `booth/loading/w1440.png` vs `.../setup/w1440.png`; `.../address-checking/w1440.png`; `.../companion-loading/companion.png` vs `.../companion-default/companion.png`
- Shared: page-local
- Supersedes: BTH-6

### XBO-15 Empty / error states each use a different frame

- Page / state: booth / no-manuscript, credits-missing, load-failed, address-checking
- Widths: all (light and dark)
- What is wrong: "Is this the same app?" no-manuscript is inside the app shell (rail, project bar) with a full-width card at 16px inset and the "Booth" heading centred inside the card; credits-missing has no shell, a 24px inset, a full-width card at y=24 with no page heading; load-failed has no shell, a 24px "Booth" title above a 720px left-aligned card (x=360-1080 at 1440; x=24 at 768/390); the primary/secondary buttons are 189px vs 159px (credits) and 84px vs 125px (load-failed) with the secondary not matching the primary's width at 390 (190 vs 158, stacked, centred).
- Where: `page/BoothUnavailable.tsx`, `page/CreditsWarning.tsx`, the page's load-error branch (cause not found for the three wrappers' padding); `UnresolvedCreditsWarning.tsx`.
- Severity: looks wrong
- Fix: one empty/error card (width, inset, heading position, button group) shared by all.
- Evidence: `booth/no-manuscript/w1440.png` (card x=233-1423), `.../credits-missing/w1440.png` (card x=24-1416), `.../load-failed/w1440.png` (title x=360, card x=360-1080), `.../credits-missing/w390.png`
- Shared: page-local

### XBO-16 Companion Script box is cut mid-line with no bottom edge; the box looks different in default vs listening; heading is repeated

- Page / state: booth / companion-default, companion-listening
- Widths: companion 380, w1440 (light and dark)
- What is wrong: "It looks cropped, not scrollable." In default the resume card has top and side borders but its bottom border is scrolled away so text is sliced at y~345; in listening the same box is unframed text sliced at y~343. In listening the chapter title appears twice back to back: bold "Chapter 1 — Down the Rabbit-Hole" at y=95 then the reader's own "Chapter 1 / Down the Rabbit-Hole" heading at y=172-196. Buttons are three different widths (Play 100, Stop reading 96, Follow 70) with Follow washed out as a disabled pill.
- Where: `booth/CompanionShell.tsx:216` (`mt-2 max-h-[12rem] overflow-y-auto`) and `:211` (`<p className="mb-2 font-semibold">{chapterTitle}`); the reader's own header via `ReadAlongView`.
- Severity: looks wrong
- Fix: give the scroll box its own border and bottom fade, drop one of the two titles.
- Evidence: `booth/companion-default/companion.png` (card x=14-366, bottom cut y~345), `.../companion-listening/companion.png` (title y=95 and y=172), `crops/xbo/comp-cut.png`
- Shared: page-local
- Supersedes: BTH-8

### XBO-17 Companion hotkeys block: two floating pairs, and the Space key is drawn two ways in one panel

- Page / state: booth / companion-default, companion-listening
- Widths: companion 380, w1440
- What is wrong: "Why is it bold SPACE up there and plain Space down here?" The Play button draws a heavy white cap "SPACE" in capitals inside the accent button (y=128) while the hotkeys row below draws a small outlined "Space" (y=624). The hotkeys are a four-column grid `[auto 1fr auto 1fr]` so "Esc Esc" starts at x=185 aligned to nothing above; the heading is a long caps line "HOTKEYS (WHILE THIS WINDOW HAS FOCUS)" in the section-label style.
- Where: `booth/CompanionShell.tsx:226-241` (`grid-cols-[auto_1fr_auto_1fr]`), `primitives/Kbd` used with different styling in a Button vs a dl.
- Severity: looks wrong
- Fix: one key/action per row on a two-column grid (key column right-aligned); one Kbd look.
- Evidence: `crops/xbo/comp-hot.png`, `crops/xbo/comp-top.png`, `booth/companion-listening/companion.png` (y=580-650)
- Shared: `Kbd`

### XBO-18 Text starts at 40 / 28 / 280 while every bar starts at 16, and the pickup bar is drawn 8px from the window edge

- Page / state: booth / all; pickup-session
- Widths: 1440 (text x=40), 1024 and below (28), 1920 (280), pickup bar x=20 / 8
- What is wrong: "The words don't line up with anything." Text starts at x=28 under bars whose content starts at x=16 and a notice at x=20; in a pickup session the left bar is at x=20 at 1440 (20px left of the text at 40), but at x=8-12 at 768 and 390, touching the window edge, with the text at 28.
- Where: `reading/BoothText.tsx:214` (`px-7`), `:233` (`-ml-5 border-l-4 pl-4`), `:219` (`mx-auto max-w-[26em]`).
- Severity: looks wrong
- Fix: one gutter for text and bars at reflow; keep the pickup bar inside it.
- Evidence: `booth/pickup-session/w768.png` (bar x=8-12, text x=28), `.../w390.png`, `.../setup/w1024.png` (text x=28, hint row from x=65)
- Shared: page-local
- Supersedes: BTH-16

### XBO-19 Side panel as a drawer: overlays the text mid-word with no scrim, and at 390 leaves slivers

- Page / state: booth / voice-samples-panel, voice-samples-recording (drawer open)
- Widths: 1280, 1024, 768 (clipped text), 390 (slivers)
- What is wrong: "Half a word poking out beside the panel." At 1024 the drawer (x=704-1024) cuts the first line at "sit|" and the following lines at "o|", "rea|"; there is no scrim or shadow beyond a thin edge. At 390 the drawer is 320 of 390px and leaves a 70px strip of text with "Ali", "to", "sitt" cut off.
- Where: `booth/side/BoothSidePanel.tsx:78` (`absolute inset-y-0 right-0 z-10 shadow-lg`, `w-80`, no scrim, no narrow-width rule).
- Severity: looks wrong at 1024-768 (may be intended as an overlay), 390 secondary
- Fix: add a scrim or push the text, and make the drawer full width at 390.
- Evidence: `booth/voice-samples-panel/w1024.png` (clipped words x=640-704), `.../voice-samples-panel/w390.png`, `.../voice-samples-recording/w768.png`
- Shared: page-local

### XBO-20 Text popover uses the OS select next to a custom picker; slider track is inset 9px

- Page / state: booth / text-popover, levels-menu
- Widths: all (light and dark)
- What is wrong: "The font box looks like a different app." The Font control is a native `<select>` with the system chevron at x=1360 and a blue focus ring, while the chapter picker beside it is a custom bordered box with a black ▼; the slider track runs x=1068-1352 against the select (x=1059-1361) and the "40 px" value ending at 1361, and in Levels the meter spans x=211-627 while the sliders run x=220-618 and their "–" values end at x=623.
- Where: `frame/BoothTop.tsx:35-37` (`Select`, `Slider`), `primitives/Select`, `primitives/Slider` (internal classes not read).
- Severity: looks wrong (select style), polish (inset)
- Fix: one select look across the page; let the slider track run edge to edge.
- Evidence: `booth/text-popover/w1440.png` (popover x=1043-1377, y=58-215), `.../levels-menu/w1440.png`, `.../levels-menu/w390.png`
- Shared: `Select`, `Slider`
- Supersedes: BTH-15

### XBO-21 Levels popover mixes label styles and spacing

- Page / state: booth / levels-menu
- Widths: all (light and dark)
- What is wrong: "Some labels are small caps, some are normal." The popover has INPUT, MICROPHONE, PUNCH in caps section labels but "Input level" and "Monitor level (output)" as sentence-case 14px labels; INPUT→meter gap is 12px while meter→MICROPHONE is 20px; the helper text under each slider is 12px and wraps to two lines, and at 390 the popover is x=8-368 (8px gutters, page uses 16).
- Where: `frame/LevelsMenu.tsx` popover body (lines ~225-245, not fully read).
- Severity: looks wrong
- Fix: one label style and one vertical rhythm (section gap, label gap).
- Evidence: `booth/levels-menu/w1440.png` (popover x=195-643, y=384-806), `.../levels-menu/w390.png`
- Shared: page-local

### XBO-22 Chapter picker clipped to 190px at 1280-768 with hundreds of px free in the bar

- Page / state: booth / every chapter state
- Widths: 1280, 1024, 768 (light and dark)
- What is wrong: "Why does the chapter name end in …?" "CHAPTER 1 DOWN THE RA…" while the bar has a 280px empty gap between the resume line and the REAPER chip at 1280.
- Where: `booth/page/BoothNextPage.tsx:75` (`MEDIUM_PICKER` `!w-[190px]`), applied `:474`.
- Severity: looks wrong
- Fix: use `max-w` only when the bar would wrap.
- Evidence: `booth/setup/w1280.png` (picker x=56-246), `.../setup/w1024.png`
- Shared: page-local
- Supersedes: BTH-14

### XBO-23 "Coming up": the pronunciations are not in a column

- Page / state: booth / every state with the side panel
- Widths: 1440, 1920, drawer widths (light and dark)
- What is wrong: "The sounds are staggered." IPA starts right after each name: x=1175, 1225, 1186; the mono IPA sits about 1px above the bold name.
- Where: `booth/side/ComingUp.tsx:12-16` with `ROW_CLASS` (`side/SideSection.tsx`).
- Severity: looks wrong
- Fix: grid `auto 1fr auto` with `items-baseline`.
- Evidence: `booth/setup/w1440.png` (y=243, 268, 294), `crops/xbo/side.png` was lost, re-seen in the full view
- Shared: `ROW_CLASS`
- Supersedes: BTH-9

### XBO-24 Bookmark ribbon is 30x40 in a 16x26 box and touches the window edge

- Page / state: booth / bookmarks-ribbon
- Widths: all; 390 and 768 worst
- What is wrong: "A giant ribbon pinned to the edge." The ribbon icon scales with the 40px reader text (x=1077-1107, y=420-460 at 1440), overflows its 16x26 box and at 768 ends at x=767 and at 390 at x=389 touching "beginning".
- Where: `script/bookmarks/ui/BookmarkRibbon.tsx:41-44` (button `h-[26px] w-4`).
- Severity: looks wrong
- Fix: fixed icon size.
- Evidence: `booth/bookmarks-ribbon/w768.png`, `.../w390.png`
- Shared: `BookmarkRibbon`
- Supersedes: BTH-5

### XBO-25 Record becomes Stop and everything to its right moves

- Page / state: booth / recording, builtin-recording, following, voice-samples-recording, leave-dialog, roll-confirm
- Widths: all
- What is wrong: "Why did the timer and mic jump left when I pressed Record?" Record is 92px wide (x=16-108), Stop 76px (x=16-92), timer moves x=123 to x=108, mic x=194 to x=178.
- Where: `record/RecordControl.tsx:19-21`.
- Severity: polish
- Fix: `min-w` that fits both labels.
- Evidence: `booth/setup/w1440.png` vs `.../recording/w1440.png`
- Shared: page-local
- Supersedes: BTH-11

### XBO-26 "1 SAMPLE" toggle is content-width above a full-width sample row

- Page / state: booth / voice-samples-panel, voice-samples-picker, voice-samples-recording
- Widths: all with panel visible
- What is wrong: toggle x=1137-1214 sits above a row x=1137-1423; no chevron; row is outlined 32px like the toggle but 2x wider.
- Where: `side/VoicesNearby.tsx:93-96` vs `:131-134`.
- Severity: polish
- Fix: full width with a chevron.
- Evidence: `booth/voice-samples-panel/w1440.png` (y=202-274)
- Shared: page-local
- Supersedes: BTH-12

### XBO-27 Notice inset 20px vs bars 16px

- Page / state: booth / all setup notices
- Widths: all
- What is wrong: notice edges x=20..1420 against bars x=16..1424; Record button x=16 right under a card edge x=20.
- Where: `record/RecordSetup.tsx:27` (`mx-5`).
- Severity: polish
- Fix: `mx-4`.
- Evidence: `booth/daw-not-linked/w1440.png`
- Shared: page-local
- Supersedes: BTH-10 (inset part)

### XBO-28 Footer meter sits 2px above the Room tone chip's centre

- Page / state: booth / every state
- Widths: 1440, 1024
- What is wrong: meter y=836, chip text y=838-839.
- Where: `frame/LevelsMenu.tsx:252-262`; likely the inline wrapper `span.whitespace-nowrap` (cause not confirmed).
- Severity: polish
- Fix: `inline-flex` wrapper.
- Evidence: `booth/setup/w1440.png`, `.../w1024.png`
- Shared: page-local
- Supersedes: BTH-18

### XBO-29 Hint strip content shifts and is centred while everything above is left-aligned

- Page / state: booth / pickup-session vs others
- Widths: 1440
- What is wrong: the hint row starts at x=182 in setup and x=130 in pickup-session (extra "Next pickup"), and is centred under left- and right-aligned bars so its ends line up with nothing.
- Where: `primitives/KeyHints.tsx:20` (`justify-center`), hint set from `input/hints`.
- Severity: polish
- Fix: left-align on the 16px inset.
- Evidence: `booth/pickup-session/w1440.png` vs `.../setup/w1440.png`
- Shared: `KeyHints`

### XBO-30 Side panel is mostly empty below its sections; text starts a third of the way down

- Page / state: booth / setup-family states
- Widths: 1440, 1920
- What is wrong: sections end at y~365 of 808, leaving 55% of the panel blank; at the start of a chapter the first reading line is at y=380 with 300px of blank above it (the page looks half-empty, may be intended: the active line is centred for the narrator).
- Where: `side/BoothSidePanel.tsx:78`, `reading/BoothText.tsx:219` (`py-[30vh]`).
- Severity: polish
- Fix: none required for the panel; consider a shorter lead-in.
- Evidence: `booth/setup/w1440.png`
- Shared: page-local

### XBO-31 Top-bar duplicates in a pickup session; pickups heading repeated

- Page / state: booth / pickup-session
- Widths: 1440
- What is wrong: "PICKUPS · 1 OPEN" appears both as the top-bar chip (y=15-41) and as the side panel heading (y=82).
- Where: `frame/BoothTop.tsx:78-85` and the pickups section heading.
- Severity: polish (may be intended)
- Fix: keep one.
- Evidence: `booth/pickup-session/w1440.png`
- Shared: page-local

### XBO-32 Companion sections: label-to-body gap varies (26 vs 29px), placeholder section occupies the prime position, wide window shows a narrow column

- Page / state: booth / companion-default, companion-listening
- Widths: companion 380, w1440
- What is wrong: SCRIPT label y=70 to title y=95 (25), NOTE label y=382 to text y=408 (26), PICKUPS label y=474 to line y=503 (29); "Note at playhead / Coming soon" is a placeholder sitting between the working Script and Pickups sections; at 1440 the 480px column and header stand in a wide grey page.
- Where: `booth/CompanionShell.tsx:104-120`, `:221-224`; `primitives/CompactShell.tsx:11` (`max-w-[30rem]`).
- Severity: polish (may be intended)
- Fix: one label gap; move the placeholder below or remove it.
- Evidence: `booth/companion-default/companion.png`, `.../companion-default/w1440.png`
- Shared: page-local

### XBO-33 Marked-note card and reading text use different scales

- Page / state: booth / marked-note
- Widths: 1440, 1024, 768
- What is wrong: the inline note is an 18px serif card (x=40-396, y=660-697) directly under 40px text with a gap of about 20px and 50px, and an accent left bar with a rounded right side; at 1024 and 768 the card is dimmed in the fade zone, so the note is nearly unreadable there.
- Where: `reading/BoothText.tsx:267` (`text-[0.42em]`, `px-[0.8em]`).
- Severity: polish
- Fix: place it outside the fade or reserve space.
- Evidence: `booth/marked-note/w1024.png` (card y=597-635 faded)
- Shared: page-local
