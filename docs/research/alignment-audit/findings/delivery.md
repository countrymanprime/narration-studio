# Delivery: alignment findings

Part of the [alignment audit](../../alignment-audit.md). Findings are grouped by the round that produced them; a later round's finding that replaces an earlier one says `Supersedes`. Evidence paths are `<page>/<state>/<width>.png` of the light capture, `dark:<page>/<state>/<viewport>.png` for dark, `tall:<page>-w<width>.png` for the below-the-fold captures; the images are not committed (regenerate the repo-viewport ones with `pnpm --dir apps/ui visual:page <page>`).

## Round 4: gap fill

### R4DL-2 "0 failing, 14 not ready" with no reason, where the neighbouring states name the chapter

- Page / state: delivery / default, many-chapters (also loading's "Can't tell which chapters pass yet." has no cause)
- Widths: 1920, 1440, 1280, 1024, 768, 390 (theme: both)
- What is wrong: Build is dimmed and says "0 failing, 5002 not ready" (or "14 not ready") and then the panel stops; in measured and failing-chapter a red line below says which chapter and why ("Opening credits: no measured file yet.", "Chapter 1 ...: sample rate 48 kHz (limit 44.1 kHz)."), so the same blocked button is explained in one state and silent in the next. A narrator is left to guess that nothing has been measured at all.
- Where: `delivery/page/chapterStates.ts:55` (`firstNotReady` returns nothing when the measurement has no files), `delivery/page/OutputPanel.tsx:101-105` (red line only when `failure` exists)
- Severity: looks wrong
- Fix: when no file is measured say it ("Nothing is measured yet. Measure the files in Master & QC.") in the same red-or-muted line slot, with a link to Master & QC.
- Evidence: `S/delivery/many-chapters/w1280.png` Output panel y455-470 (no line) versus `.../measured/w1280.png` y470 (red line); dark `dark:delivery/many-chapters/desktop.png`
- Shared: page-local

### R4TB-1 "13 rules" under four chips that add up to 19

- Page / state: delivery / default (ACX built in), Profile rules card
- Widths: 1440, 1024, 768, 390 (theme: both)
- What is wrong: "why do these numbers not add up?" The chips read "9 checked by the app", "2 not checked by the app", "2 listen", "6 to verify" (9+2+2+6 = 19) and the disclosure under them says "13 rules". The first three chips split the 13 rules (9+2+2); "to verify" is a second axis (rule's verification state) drawn in the same row, same chip shape, so it reads as a fourth bucket and the row contradicts the count by 6.
- Where: `apps/ui/src/components/master/DeliveryProfilePanel.tsx:73-88` (the `to verify` Mark is rendered with the three coverage marks) and `:92` (summary `plural(profile.rules.length, 'rule')`); counts from `deliveryProfile.ts:103`
- Severity: looks wrong
- Fix: put "6 to verify" on its own line labelled as a different thing ("of which 6 still to verify against the platform's page"), or drop it from the chip row and show it in the rules list.
- Evidence: `S/tall/delivery-w1440.png` (y~800-870 in the 900-px-tall crop, x 25-340), `S/tall/delivery-w768.png` y 800-815
- Shared: page-local (same panel at Master? not shown there)

### R4DL-1 The profile menu is locked during a build but looks exactly as live as before

- Page / state: delivery / building, host-quiet, host-quiet-cancelled (built-in profile)
- Widths: 1920, 1280, 1024, 768, 390 (theme: both)
- What is wrong: why does the select still look clickable while a build runs? In building at 1280 the PROFILE select (x478-568, y57-85) is drawn the same as in ready (compared at 3x: same border, same text colour, no dim), yet `ProfileCard` passes `disabled={busy || locked}` to it; only a custom profile gets the explanatory chip "Locked while it builds" (it replaces the name box), the built-in one keeps the plain "Built in" chip, so nothing says why a press on the select does nothing.
- Where: `delivery/profile/ProfileCard.tsx:115-118` (chip only on the custom branch), `delivery/profile/ProfileMenu.tsx:33`
- Severity: polish
- Fix: show "Locked while it builds" in place of "Built in" for both profile kinds and give the disabled select the same 55% dim as a disabled Button.
- Evidence: `S/delivery/building/w1280.png` x600-880 y55-90 versus `.../ready/w1280.png` same box
- Shared: `ProfileMenu` select (native select has no disabled style)

### R4DL-3 Two different outlined-button styles in one panel: Cancel is a dark outline, Check again a thin grey one

- Page / state: delivery / host-quiet, host-quiet-cancelled
- Widths: 1280, 1024, 768, 390 (theme: both)
- What is wrong: Cancel (x201-268 at 768) has a near-black 1px outline and white fill; CHECK AGAIN directly under it (x33-131, y258-288) has a thin grey outline with no fill, the same size caps text. They are siblings in one status block and look like two kinds of control.
- Where: `delivery/page/OutputPanel.tsx:82` (`variant="secondary"` Cancel) versus `:119` (`variant="ghost" size="sm"` Check again); `primitives/Button.tsx:15-16` (`--btn-line` versus `--line-strong`). The aside's own Check again (`Preflight.tsx:65`) is ghost too.
- Severity: polish
- Fix: use one variant for both, or make Check again a text link inside the sentence.
- Evidence: `S/delivery/host-quiet-cancelled/w768.png` y160-290; dark `dark:delivery/host-quiet-cancelled/tablet.png`
- Shared: `Button` variants

### R4DL-4 The quiet-host notes give two different ages for the same press

- Page / state: delivery / host-quiet-cancelled
- Widths: 1280, 1024, 768, 390 (theme: both)
- What is wrong: the red line ends "(asked again just now)" and two lines lower the grey note says "You checked again 2 s ago: the host still did not answer." (in the 1440 dark capture both say "just now"/"1 s ago"): the same click is described twice, with clocks that disagree by seconds, and the third line adds "Cancel was sent, but the host did not confirm it". Three lines say "the host did not answer" in different words.
- Where: `delivery/page/OutputPanel.tsx:111-128` with `useHostRead.ts:93-102` (`askedText` and `checkedText` each read their own timestamp)
- Severity: polish
- Fix: drop the grey "You checked again" line and let the red sentence carry the age; keep only the cancel note.
- Evidence: `S/delivery/host-quiet-cancelled/w1280.png` y480-545; `S/delivery/host-quiet-cancelled/w768.png` y245-345
- Shared: page-local (extends R3DL-3)

### R4DL-5 The running bar is a stub at the left edge that reads as "4% done"

- Page / state: delivery / building, host-quiet, host-quiet-cancelled
- Widths: all (theme: both)
- What is wrong: the bar under the Build row shows a 22-28px orange block at x0 of a long grey track and nothing else; with `value={null}` the fill is meant to slide, but in any still view (and for reduced motion, where it is set to the 4% minimum and does not move) it looks like a stuck progress bar, most visibly in host-quiet where the build really has gone quiet. May be intended for the indeterminate case.
- Where: `delivery/page/OutputPanel.tsx:106` (`value={null} running`), `primitives/ProgressBar.tsx:46-48`
- Severity: polish
- Fix: for reduced motion draw a striped full-width track or a "Building..." text instead of a fixed sliver.
- Evidence: `S/delivery/building/w1280.png` x68-612 y464-476; dark `dark:delivery/building/small-desktop.png` y240-258 of the crop
- Shared: `ProgressBar`

### R4DL-6 Rules table: the Source cell's badge is top-aligned with notes but centred when it stands alone

- Page / state: delivery / profile-rules
- Widths: 1280, 1440, dark 1440 (theme: both)
- What is wrong: in "To verify" rows the badge sits at the top of a 5-line note while the Rule, ACX requires and How cells are centred in the row; in "Verified" rows the lone pill is centred in a 40px row. So the badge changes its vertical anchor with content and the Source column has no consistent line (RMS: badge y205 vs rule y231; Sample rate: badge and rule share y~448). Also `acx.sample_rate - each / file` wraps in a ~100px Rule column while ACX requires has spare room, which is why those rows are two code lines tall.
- Where: `master/DeliveryProfilePanel.tsx:110-122` (TableCell default middle alignment, per-cell `min-w`)
- Severity: polish
- Fix: top-align every cell of a rule row (`align-top`) so badge, rule name and requirement share the first line, and give the Rule column a min width that holds the code line.
- Evidence: `S/delivery/profile-rules/w1280.png` x68-612 y190-540; `dark:delivery/profile-rules/desktop.png` x155-645 y170-420
- Shared: `Table` (extends XDL-5)

### R4DL-7 Dark skeleton bars are close to invisible

- Page / state: delivery / loading
- Widths: 1440, 1024, 768 (theme: dark)
- What is wrong: the three bars in "Before you build" are a slightly lighter brown than the dark card (about 1.2:1), so the aside looks empty rather than loading; in light they are clearly visible.
- Where: `primitives/Skeleton.tsx` (surface token)
- Severity: polish
- Fix: use a dark skeleton fill one step lighter (`--surface-3`) and add the 45px row height.
- Evidence: `dark:delivery/loading/desktop.png` x675-880 y90-135
- Shared: `Skeleton`

### R4TB-2 The source date breaks at its own hyphen

- Page / state: delivery / default, Profile rules intro sentence
- Widths: 1024 (theme: both)
- What is wrong: "why does the date split across two lines?" The sentence "... read 2026-" ends the first line and "09-20. Each file is judged..." starts the next; at 768 and 390 the date stays whole only by luck of the wrap point.
- Where: `DeliveryProfilePanel.tsx:44` (`read ${readOn}` plain text in a `<p>`, no `whitespace-nowrap` on the date)
- Severity: polish
- Fix: wrap the date in a `whitespace-nowrap` span (or use a non-breaking hyphen).
- Evidence: `S/tall/delivery-w1024.png` x 56-560, y 745-770 (crop y 720-750 at 0.93 scale)
- Shared: page-local

### R4TB-8 Delivery "Before you build" at 768: fourteen identical "Not mastered" pills 600 px from the names

- Page / state: delivery / default
- Widths: 768 (also 1024, 1440 aside) (theme: both)
- What is wrong: "why is this a list of fourteen of the same thing?" Every row is the chapter name at x=33 and a "Not mastered" pill at x=651-735, with no row rules, 45 px per row, so the eye has to jump 400 px across blank card per row; when all rows are in one state the pill repeats 14 times and "Chapters passing 0 of 14" above already says it. Extends XDL-4 (names truncated at 1440/1024); at 768 the names are not truncated but the row has no guide.
- Where: `apps/ui/src/components/delivery/page/Preflight.tsx` row markup (45 px rows, `justify-between`)
- Severity: polish
- Fix: hairline between rows or zebra, or collapse a run of identical states into "Chapters 1-12 and credits: not mastered".
- Evidence: `S/tall/delivery-w768.png` chunk 1 (y 1000-1640), x 33-735
- Shared: page-local

## Round 3: coverage gaps and scanner cross-check

### R3DL-1 Delivery is a 1,671px fluid page while Master is a 1,161px centred column

- Page / state: delivery / every state (versus master)
- Widths: 1920 (theme: both)
- What is wrong: Delivery's cards run x232-1528 with a 358px aside to 1903, so the label and its value in "Checks on every chapter" are 1,262px apart (x249 versus x1511); the sibling page in the same nav group caps its content at x300-1835. At 1440 the same sheet is 700px (XDL-3), so the gap grows with the window.
- Where: `delivery/page/DeliveryPage.tsx:80` (no max width)
- Severity: looks wrong
- Fix: cap Delivery at the same container as Master and use a two-column definition list (XDL-3).
- Evidence: `S/delivery/default/w1920.png` x 249-1511 y 150-460
- Shared: page container
- Scanner: none

### R3DL-3 The most important host-quiet message is the last and the greyest

- Page / state: delivery / host-quiet-cancelled
- Widths: 1920 (theme: light)
- What is wrong: three statements stack with three different gaps (bar to red line 28px, red to grey 39px, grey to grey 32px): the red "Can't tell how the build is going..." with CHECK AGAIN at its end, grey "You checked again just now: the host still did not answer." and last, in the same grey, "Cancel was sent, but the host did not confirm it, so the build may still be running." Cancel stays enabled under it.
- Where: `delivery/page/OutputPanel.tsx`
- Severity: looks wrong
- Fix: one status block with the warning first and the actions at a fixed edge.
- Evidence: `S/delivery/host-quiet-cancelled/w1920.png` y 655-785
- Shared: page-local
- Scanner: none
- Supersedes: nothing (extends XDL-8)

### R3DL-4 Why does the left column stop at y876 while the page keeps going?

- Page / state: delivery / many-chapters
- Widths: 1920, 1280, 1024 (theme: both)
- What is wrong: with 5,002 chapters the "Before you build" list is an unbounded column of 45px rows (the page is about 4,650px tall in the scanner's capture) with no cap, scroll box or sticky; the three left cards end at y876 and the column under them is bare for the rest of the page. About half the visible names are truncated ("Chapter 9 — A Caucus-Race and a L...") although the pill is the same width on every row.
- Where: `delivery/page/Preflight.tsx:75-96`, `DeliveryPage.tsx:80`
- Severity: looks wrong
- Fix: cap the aside (`max-h` with its own scroll) or virtualise, and let the names wrap.
- Evidence: `S/delivery/many-chapters/w1920.png` x 1545-1903 y 69-1080
- Shared: page-local
- Scanner: B1

### R3DL-5 The Profile rules table is cut off inside its card at 1024, a supported width

- Page / state: delivery / profile-rules
- Widths: 1024 (also 768) (theme: light)
- What is wrong: at 1024 the card is 551px wide and the four-column table is wider: the third heading reads "HOW THE APP CHECKS" and stops at x615, "Measured: -23 to" is cut mid-value, and the SOURCE column (To verify / Verified notes) is entirely out of view with no edge shadow or arrow; rows are 66-145px tall with the "ACX requires" text vertically centred in blank space. Round 2 recorded only 1440, 768 and 390 for this table.
- Where: `master/DeliveryProfilePanel.tsx:96-130` (per-cell `min-w`, no scroll cue)
- Severity: looks wrong
- Fix: stack Source under "How the app checks it" below 1180, or add the edge shadow and a Source minimum width.
- Evidence: `S/delivery/profile-rules/w1024.png` x 97-615 y 270-760
- Shared: `Table` in a scroll box; same as XMS-7
- Scanner: A5

### R3DL-2 Why does "Every chapter passes." sit beside a failed build?

- Page / state: delivery / build-failed, building, host-quiet, host-quiet-cancelled
- Widths: 1920, 390 (theme: light)
- What is wrong: in build-failed the status next to the Build button says "Every chapter passes." and the red text below says "could not create "C:\Users\Narrator\Desktop\Wonderland ACX": access is denied" (lowercase start, no icon, no frame, the folder path repeated from the line above); in building and host-quiet "Every chapter passes." sits beside Cancel while the build is running.
- Where: `delivery/page/OutputPanel.tsx`
- Severity: polish
- Fix: replace the pre-build status with the build state once a build starts; sentence-case, iconed error.
- Evidence: `S/delivery/build-failed/w1920.png` y 610-680; `.../building/w1920.png` y 610-680
- Shared: page-local
- Scanner: none

### R3DL-6 The toast dismiss button is 17x20px

- Page / state: delivery / built
- Widths: 1920, 1024 (theme: both)
- What is wrong: the toast "Built the ACX package with 15 files." has an X button 17x20 (x1868-1885, y1029-1046 at 1920), inside a 42px-tall dark box.
- Where: toast component
- Severity: polish
- Fix: 28px minimum button.
- Evidence: `S/delivery/built/w1920.png` x 1625-1900 y 1015-1060
- Shared: `Toast`
- Scanner: H1

### R3DL-7 CHECK AGAIN changes position at every width

- Page / state: delivery / host-quiet, host-quiet-cancelled
- Widths: 1920, 1024, 768 (theme: light)
- What is wrong: at 1920 the outlined CHECK AGAIN button (x866-966) sits 4px after the red sentence on its line; at 1024 the sentence wraps and the button sits on the second line after "again just now)." at x199, not at the text's left edge x97; at 768 it drops to its own row at x33.
- Where: `delivery/page/OutputPanel.tsx` (inline flex-wrap)
- Severity: polish
- Fix: place the button in a fixed actions row under the status.
- Evidence: `S/delivery/host-quiet/w1920.png` y 690-720; `.../w1024.png` y 690-740; `.../w768.png` y 690-745
- Shared: page-local
- Scanner: none

## Round 2: strict review

### XDL-1 Why are the limit boxes in the custom profile a ragged mess?

- Page / state: delivery / custom-profile
- Widths: 1440, 768, 390 (theme: both)
- What is wrong: "RMS [-24] to [-18] dBFS", "Peak no lowest to [-3.5] dBFS", "Room tone, tail [1] to [5] s", "File length no lowest to [120] min": the last box ends at x=990 (RMS, Peak, Noise floor), x=1016 (tail), x=998 (file length) because the unit text differs in width; row pitch is 44px for inputs, 36px for "Off", 28px for text rows (y 194, 238, 282, 318, 354, 426, 462, 498, 526); at 390 the first boxes start at x=116 (RMS) and x=143 (tail).
- Where: `delivery/profile/LimitRow.tsx:43-55` (`justify-between`, unit inline), `FormatRows.tsx:23,80`
- Severity: looks wrong
- Fix: fixed-width unit column (`w-12`), `min-h` on every row, boxes in a two-column grid.
- Evidence: `delivery/custom-profile/w1440.png` x 769-1031 y 175-535; `.../w390.png` y 280-480
- Shared: label-left/control-right rows
- Supersedes: DLV-2

### XDL-2 Why is the profile name shown twice, in a tall select and a shorter box?

- Page / state: delivery / custom-profile
- Widths: 1440, 768, 390 (theme: both)
- What is wrong: "My ACX, tighter peak" appears in the select (x 685-862, 41px tall) and again in the name box (x 871-1031, 36px tall); at 390 "PROFILE" is alone on a line, the select starts at x=200 and the name box at x=218, both right-aligned with different left edges.
- Where: `delivery/profile/ProfileCard.tsx:114-134,182-185`, `Select.tsx:48`, `TextField.tsx:13`
- Severity: looks wrong
- Fix: one control height; show the name as an editable field only (or a "Rename" action); full-width both when stacked.
- Evidence: `delivery/custom-profile/w1440.png` y 80-121; `.../w390.png` y 120-230
- Shared: `Select` 40.8px vs `TextField` 36px
- Supersedes: DLV-3

### XDL-3 Why are the labels at the far left and the values 700px away at the far right?

- Page / state: delivery / default, built, building, failing-chapter and every built-in profile state
- Widths: 1440, 1280, 1024 (theme: both)
- What is wrong: "RMS", "Peak", "Noise floor", "Sample rate" at x=249 and their monospace values ending at x=1031 are 700px apart with nothing to follow the eye, 28px rows, no dividers; labels are in the sans font and values in mono, and the unset placeholder "Chosen when you build" is also mono and grey so it looks like code.
- Where: `delivery/profile/LimitRow.tsx:43` and `FormatRows.tsx:84` (`justify-between` over the full card)
- Severity: looks wrong
- Fix: two-column definition list (label 12rem, value left-aligned) or a four-column grid (rule, limit) with a row divider.
- Evidence: `delivery/default/w1440.png` x 249-1031 y 150-460
- Shared: label-left/value-right rows
- Supersedes: nothing (new)

### XDL-4 Why is the "Before you build" list so loose, with names cut off, and an empty tail?

- Page / state: delivery / default, failing-chapter, custom-profile, many-chapters, ready, built
- Widths: 1440, 1280, 1024 (theme: both)
- What is wrong: 45px rows for single short names; "Chapters passing" sits 37px above the first row while rows are 45px apart; names such as "Chapter 3 — A Caucus-Race a…", "Chapter 4 — The Rabbit Sends in a …", "Chapter 8 — The Queen's Croquet-…" are cut because the pill is wide, while "Chapter 5 — Advice from a Caterpillar" runs right up to its pill; the card stretches to the left column's height and leaves about 85px blank under the last row; the Pass pill is narrow and the "Waiting on 3 pickups" pill is 118px, so the name column width changes by row; the gap between columns is 18px (1047-1065) against 16px between cards.
- Where: `delivery/page/Preflight.tsx:75-96` (`min-h-[2.8125rem]`, `truncate` on the name) and `DeliveryPage.tsx:80` (fixed `22.5rem` track)
- Severity: looks wrong
- Fix: let names wrap to two lines or widen the aside; 32px rows; align the summary row to the list pitch.
- Evidence: `delivery/default/w1440.png` x 1065-1423 y 140-880
- Shared: page-local
- Supersedes: DLV-7

### XDL-5 Why do the rule table rows float, and why is Source clipped at 768?

- Page / state: delivery / profile-rules
- Widths: 1440, 768, 390 (theme: light)
- What is wrong: rows are 66 to 130px; Source wraps to five or six lines and the Rule, ACX requires and How checked cells are vertically centred in that height (RMS at y 320, its badge at y 292); the code line "acx.noise_floor · each / file" wraps; at 768 Source is cut mid-word at x=735 with no scroll cue; at 390 only Rule and ACX requires show and each row is about 127px of mostly blank.
- Where: `master/DeliveryProfilePanel.tsx:96-130` (default middle valign, `min-w-[9/12/12/10rem]`)
- Severity: looks wrong
- Fix: `valign="top"`, a wide Source minimum, edge shadow, drop "each file" into a column.
- Evidence: `delivery/profile-rules/w1440.png` y 255-900; `.../w768.png` x 610-735; `.../w390.png`
- Shared: `Table` primitive; same as XMS-7
- Supersedes: DLV-6

### XDL-6 Why does the Build button say "14 not ready" while the explanation is four screens down?

- Page / state: delivery / all states
- Widths: 768 (theme: both)
- What is wrong: below `lg` the "Before you build" list is placed after Profile rules, so the Build button and its "0 failing, 14 not ready" status sit 900px from the list that explains it.
- Where: `DeliveryPage.tsx:80` (`lg:grid-cols-...` single column below lg; `Preflight` is last)
- Severity: looks wrong
- Fix: put the list directly under Output on narrow widths (or put the counts in a clickable summary).
- Evidence: `delivery/default/w768.png` y 890-1024; `.../custom-profile/w768.png` y 950-1024
- Shared: page-local

### XDL-11 Cards run off the right edge at 390

- Page / state: delivery / default, failing-chapter, many-chapters, build-failed (not custom-profile or host-quiet at 390)
- Widths: 390 (secondary) (theme: light)
- What is wrong: the cards are about 405px wide in a 390px page so the right border is missing and values (x=378) sit in the cut padding; in custom-profile and host-quiet at 390 the cards fit, so the width differs by state.
- Where: `DeliveryPage.tsx:80` (no base `grid-cols-[minmax(0,1fr)]`; track grows to the Preflight row's min-content)
- Severity: looks wrong
- Fix: `grid-cols-[minmax(0,1fr)]` at base.
- Evidence: `delivery/default/w390.png`; compare `.../custom-profile/w390.png`
- Shared: grid without a base `minmax(0,1fr)` track
- Supersedes: DLV-1

### XDL-7 Why are the two top cards' header lines at different heights?

- Page / state: delivery / all states
- Widths: 1440, 1920, 1280, 1024 (theme: both)
- What is wrong: the Delivery header (heading plus select) is 65px and ends y=132; "Before you build" (32px icon button) ends y=127; the "Delivery" title is 28px type against 24px for panel titles below it.
- Where: `ProfileCard.tsx:180` and `panelStyles.ts:8`
- Severity: polish
- Fix: same header height for side-by-side cards.
- Evidence: `delivery/default/w1440.png` y 127-132
- Shared: `PANEL_HEADER_CLASS`
- Supersedes: DLV-5

### XDL-8 Why do the build messages hang off the button instead of sitting in a grid?

- Page / state: delivery / host-quiet, host-quiet-cancelled, build-failed, failing-chapter, building
- Widths: 1440, 390 (theme: both)
- What is wrong: after Build and Cancel the red text, "Check again" button, grey notes and progress bar are all different widths and left-aligned: "Check again" ends the sentence at x=866-966, the progress bar spans 249-1031, status lines are 16 to 32px apart; at 390 "Check again" falls to its own row (y 815-845); errors are unframed red text with no icon.
- Where: `delivery/page/OutputPanel.tsx` (flex-wrap rows)
- Severity: polish
- Fix: one status area under the build row with fixed spacing, the button at a fixed edge.
- Evidence: `delivery/host-quiet-cancelled/w1440.png` y 610-780; `.../host-quiet/w390.png` y 700-845
- Shared: page-local

### XDL-9 Built output: the folder button, the file list and the toast

- Page / state: delivery / built
- Widths: 1440, 768, 390 (theme: light)
- What is wrong: at 390 the folder icon button sits alone on its own row under "15 files / in C:\..." instead of on the right as at 768; the 15 rows are 26px apart with a pill each and 700px between name and pill (like XDL-3); the confirmation toast covers the end of the aside list at 1440 and part of the Profile rules text at 768 (may be intended, transient).
- Where: `OutputPanel.tsx:139-146`
- Severity: polish
- Fix: icon button `ml-auto` on the first line; keep the list in a two-column grid.
- Evidence: `delivery/built/w390.png` y 455-550; `.../w768.png` y 405-440 and 955-1000
- Shared: page-local
- Supersedes: DLV-8

### XDL-10 Channels value drops under its label at 390

- Page / state: delivery / default, built, host-quiet
- Widths: 390 (secondary) (theme: both)
- What is wrong: "mono or stereo, the same in every file" falls flush left under "Channels" (x=33) while every other value is right-aligned.
- Where: `FormatRows.tsx:84` (`flex-wrap justify-between`)
- Severity: polish
- Fix: `ml-auto text-right` on the value.
- Evidence: `delivery/default/w390.png` y 440-480
- Shared: label-left/value-right rows
- Supersedes: DLV-4

### XDL-12 Loading and no-manuscript

- Page / state: delivery / loading, no-manuscript
- Widths: 1440 (theme: light)
- What is wrong: in loading the aside card is full height with three 18px skeleton bars and a blank 650px below; no-manuscript is a 240px card under a big empty page, title centred while Delivery's normal title is left.
- Where: `Preflight.tsx:66-71`; shared empty-state card
- Severity: polish (may be intended)
- Fix: skeleton rows that match the list pitch.
- Evidence: `delivery/loading/w1440.png` x 1065-1423 y 140-880; `.../no-manuscript/w1440.png`
- Shared: page-local
