# Engine panel and its dialogs: alignment findings

Part of the [alignment audit](../../alignment-audit.md). Findings are grouped by the round that produced them; a later round's finding that replaces an earlier one says `Supersedes`. Evidence paths are `<page>/<state>/<width>.png` of the light capture, `dark:<page>/<state>/<viewport>.png` for dark, `tall:<page>-w<width>.png` for the below-the-fold captures; the images are not committed (regenerate the repo-viewport ones with `pnpm --dir apps/ui visual:page <page>`).

## Round 3: coverage gaps and scanner cross-check

### R3EN1-1 Dialogs grow to 70% of the viewport, so a two-line dialog is 1342 px wide at 1920 with its actions 1000+ px from what they act on

- Gut reaction: Why is this tiny "Open a tool" dialog as wide as a billboard, with the button miles from the name and the Close button on the other side of the screen?
- Page / state: engine / cleanup-tools-idle/-launched/-error, chapter-tags-idle/-ready/-not-rendered/-success/-error, `create-regions-*`, link-chapters-conflict.
- Widths: 1920 (dialog 1342 px, x=290-1632), 1280 (896 px), 1440 (about 1008 px; round 2 saw it); theme: both.
- What is wrong: the dialog width is a percentage of the viewport and not of its content. Cleanup tools at 1920: tool name at x=21, OPEN button at x=1027-1071 of a 1064 px row, about 950 px away, with the only content being two one-line descriptions. Chapter tags at 1920: a paragraph runs about 170 characters per line (2 lines, then the orphan "beside it."), "Chapter 2 ... not rendered yet" is 1,000 px apart on one row, and Close sits at the left edge while "Embed chapter tags" is at the right edge, 1,070 px apart, with the checkbox row between them. Create regions at 1920: the table's 5 columns spread over 1,060 px with START/END 450 px from REGION. The same dialogs at 768 (538 px) look correctly proportioned, which is the width they were designed for. This is the root of ENX-17, not only a link-chapters problem.
- Where: `primitives/Dialog.tsx:149` (`max-w-[70vw]`, no max-width in rem; `size === 'full'` is the only other option).
- Severity: looks wrong
- Fix: cap tool dialogs at about `max-w-[44rem]` (the width of the engine panel they were opened from) and keep 70vw only for the wide table dialogs.
- Evidence: `crop:R3EN1/L-cleanup-tools-idle-w1920-280-100.png`, `L-chapter-tags-not-rendered-w1920-280-150.png`, `L-create-regions-preview-w1920-280-40.png`, against `L-chapter-tags-not-rendered-w768-0-80.png`.
- Shared: Dialog

### R3EN1-2 Dialog bodies are scroll containers that cut content in half at both edges, with no cue; several states open scrolled

- Gut reaction: Why is this checkbox sliced in half, why does the dialog start in the middle of its own table, and where did the dropdown go?
- Page / state: engine / create-regions-empty (checkbox), create-regions-error and -success (selects), link-chapters-conflict (table), cleanup-tools-launched (status sentence at 390).
- Widths: 1024 and 1280 (create-regions), 768-1920 (conflict), 390 (cleanup); theme: both (dark d1024 shows the same cut).
- What is wrong: (a) create-regions-empty at 1024: the "Move an existing region that shares a chapter's title..." checkbox row is cut through its middle by the footer rule (only its top 6 px shows, y=603); the option that changes what gets written is hidden below the fold at 1024 and 1280. (b) create-regions-error at 1280: the description is cut mid-line under the header ("written until you create them." only); at 1024 both selects are cut by the header edge (y=120-150). create-regions-success at 1024: the paragraph and both selects are scrolled out entirely and the table header sits directly under the title; at 1280 the opening-credits select is cut in half (y=118-145). (c) link-chapters-conflict opens scrolled to the bottom at every width: no column header, Chapters 1 and 2 are not visible, and the first visible row is sliced under the title bar (1280: "Chapter 7" at y=145-160; 1024: a select box cut at y=140; 768: "Little Bill" and a select cut at y=165). At 1920 the first row is Chapter 3. (d) The slide-over body does the same under its own header (dark confirmed/missing d1440: the "Click Track" row is sliced at y=60 under the "Audio engine" bar, no shadow or fade). Nothing says the body scrolls: no shadow, no fade, no scrollbar gutter in these captures.
- Where: `primitives/Dialog.tsx:176` (`min-h-0 flex-1 overflow-x-hidden overflow-y-auto`, header and footer are flat bars with no edge shadow), dialog `maxHeight: 80dvh` (`:143-149`); the scrolled position comes from focus moving to the primary action after the click (cause for the scroll offset not found in source; it is how the captures are left).
- Severity: looks wrong
- Fix: a 1 px shadow or fade under the header and above the footer while the body can scroll; keep the first control and column header at the top when a dialog opens; put the "Move an existing region" option above the long "Not planned" list so it is never below the fold.
- Evidence: `crop:R3EN1/L-create-regions-empty-w1024-90-20.png` (cut checkbox y≈600), `L-create-regions-error-w1024-90-20.png`, `L-create-regions-success-w1024-90-20.png`, `L-create-regions-success-w1280-150-20.png`, `L-link-chapters-conflict-w1280-150-0.png`, `L-link-chapters-conflict-w1024-80-0.png`, `L-link-chapters-conflict-w768-0-0.png`, `D-create-regions-empty-small-desktop-80-20.png`, `D-chapter-link-missing-desktop-440-0.png`.
- Shared: Dialog, SlideOver body
- Scanner: W4 (h2 overlaps td/p/span), W3

### R3EN1-3 Result messages are not tied to what produced them and carry no tone: success is bold black text, errors are red

- Gut reaction: I pressed Open on the second tool, so why is the message about the first tool, under neither row, in plain black text?
- Page / state: engine / cleanup-tools-launched, cleanup-tools-error, chapter-tags-success, chapter-tags-error, create-regions-success, create-regions-error.
- Widths: all; theme: both.
- What is wrong: in cleanup-tools-launched the sentence "Repair Pops/Clicks is open in REAPER. Nothing has changed yet..." is printed below the last row (the Magnolius DeClick row) in plain body text, and neither OPEN button changes (both still say OPEN), so the screen does not say which tool is running. In cleanup-tools-error the red "Magnolius DeClick is not installed in REAPER..." sits under the list at full width, not under the Magnolius row. Chapter tags success prints "Wrote C:\Books\...chapters.mp3" in bold dark text, the same weight as the heading "Chapters from your last chapter render"; the error beside it is regular red. Create regions success is "Sent 2: 2 created, 0 already existed, 0 moved, 0 ambiguous, 0 failed." also bold black, four zero counts in a sentence. Only failure has a tone; success has no icon, colour or position of its own.
- Where: `engine/CleanupToolsDialog.tsx:86-99` (one status paragraph after the `ul`), `engine/ChapterTagsDialog.tsx:122` (`font-semibold`, `var(--text)`) against `:127` (error), `engine/CreateChapterRegionsDialog.tsx:171-174` (`font-semibold`).
- Severity: looks wrong
- Fix: put the status inside the row it belongs to (replace OPEN with a "Running" or error line under that row), use one result style (icon plus success/danger tone, regular weight) in every dialog, and show only non-zero counts.
- Evidence: `crop:R3EN1/L-cleanup-tools-launched-w1920-280-100.png`, `L-cleanup-tools-error-w1920-280-100.png`, `L-chapter-tags-success-w1920-280-150.png`, `L-create-regions-success-w1920-280-40.png`.
- Shared: page-local, per dialog

### R3EN1-4 Chapter links: eleven identical filled CONFIRM buttons, every select preset to the track that is already linked

- Gut reaction: Why is the whole table a column of bright orange buttons, and why does every chapter already say "Chapter 1" in its dropdown?
- Page / state: engine / chapter-link-confirmed, chapter-link-missing, default (the table), editing-check-unmapped (same control in the panel).
- Widths: 1920, 1280, 1024, 768 (and dark d1440/d1024/d768); theme: both.
- What is wrong: each unlinked chapter shows a select that already holds "Chapter 1" (the first track) and a solid accent CONFIRM button, so 11 rows repeat the same filled button and the same value. The track "Chapter 1" is already linked to Chapter 1 in the first row, so one click on any CONFIRM would link a second chapter to a track that is taken. The only filled buttons in the card are the 11 CONFIRM buttons, so the eye goes to the least important thing in the row. There is no "Choose track…" state to tell a decided row from an undecided one.
- Where: `mapping/MappingConfirm.tsx:44` (`chosen` starts at `options[0]`), `:77-85` (primary-looking Confirm in every row).
- Severity: looks wrong
- Fix: start the select on an empty "Choose track…" option and keep Confirm disabled and secondary until a track is picked; hide tracks already linked.
- Evidence: `crop:R3EN1/L-chapter-link-confirmed-w1920-1200-0.png` (rows y≈190-1080), `L-chapter-link-missing-w1920-1200-0.png`, `D-chapter-link-confirmed-desktop-440-0.png`.
- Shared: MappingConfirm (Editing check, Production)

### R3EN1-5 Chapter links: three of the five columns have no visible heading

- Gut reaction: Why does the header row say only "Chapter" and "Status" and then nothing over the buttons?
- Page / state: engine / chapter-link-confirmed, chapter-link-missing, default.
- Widths: all; theme: both.
- What is wrong: the header row has two visible labels (CHAPTER x=62, STATUS x=225 at 1920 crop) and then 460 px of blank header above the Open links, the Editing check buttons and the select/Confirm cell. The columns are hidden labels (screen-reader only), so a sighted narrator cannot tell what the link column, the button column and the control column are, and the header rule runs over empty space. In chapter-link-missing the same blank header sits over the sentence "Linked track is missing from this project".
- Where: `engine/ChapterLinksTable.tsx:96-98` (`<TableHeader hiddenLabel="Open" />`, `hiddenLabel="Editing check"`, `hiddenLabel="Link"`).
- Severity: looks wrong
- Fix: show real headings ("Open in", "Check", "Track"), or drop the header row and make each row a labelled card (see ENX reorganisation).
- Evidence: `crop:R3EN1/L-chapter-link-confirmed-w1920-1200-0.png` (header y≈81), `L-chapter-link-missing-w1920-1200-0.png` (y≈361).
- Shared: page-local

### R3EN1-6 Editing check, "can't be checked yet": two competing filled buttons, an enabled CHECK EDITING under a message saying it cannot run, lowercase sentence start, three identical empty cards

- Gut reaction: It says this chapter can't be checked, so why is the big orange "Check editing" button right under it, and why are there three copies of the same paragraph?
- Page / state: engine / editing-check-unmapped (also production/editing-check-partial when unmapped).
- Widths: 1920, 1280, 1024, 768, 390; theme: both.
- What is wrong: the red box holds "This chapter can't be checked yet" and the sentence "link this chapter to the REAPER track it is edited on" starting lowercase as if continuing the heading, then a select (41 px) and a filled CONFIRM (36 px). Directly below, outside the box, is a second filled accent button CHECK EDITING that cannot do anything for this chapter. Two accent buttons are in the first 400 px, one of them wrong. The cards Empty space, Click and Breath each repeat "No candidates from the last scan. A met or not-met status shows only while this chapter is in Editing." (three identical 3-line paragraphs, about 380 px of the 1080 px viewport). At the foot a disabled outlined MATCH LEVELS… button has no explanation of why it is off.
- Where: `editing/EditingCheckPanel.tsx:329` (`Check editing` primary, not disabled when unmapped), the unmapped box in the same file, `mapping/MappingConfirm.tsx` for the select and Confirm.
- Severity: looks wrong
- Fix: when the chapter is unmapped show only the link step (select and Confirm as the one primary), hide or disable CHECK EDITING and the three cards behind it, and capitalise the sentence.
- Evidence: `crop:R3EN1/L-editing-check-unmapped-w1920-1000-0.png` (CHECK EDITING y≈353-389, cards y≈405-770, MATCH LEVELS y≈845), `D-editing-check-unmapped-desktop-440-0.png`.
- Shared: Editing check panel

### R3EN1-7 Tracks card contradicts the Chapter links card on the same screen

- Gut reaction: Why does the Tracks card say Chapter 1 is "Not linked" when the table below says Chapter 1 is linked?
- Page / state: engine / chapter-link-confirmed (Tracks row "Chapter 1" shows chapter "Not linked", while the Chapter links row 1 is "Linked" to "Chapter 1"); chapter-link-missing is consistent.
- Widths: 1280, 1024, 768, 1920 (seen in all four) and dark; theme: both.
- What is wrong: the Tracks card header row says track Chapter 1 maps to chapter "Not linked", 1/1 playable, while a row 800 px lower in the Chapter links card says that chapter is Linked. In default (same data, linked) the Tracks card says "Chapter 1". May be the fixture not refreshing after the confirm, but a narrator sees two cards disagreeing.
- Where: `engine/EnginePanel.tsx` TrackList chapter column against `engine/ChapterLinksTable.tsx`; the same fact is shown twice (ENX-26).
- Severity: looks wrong (may be a fixture artefact)
- Fix: derive both cards from one source or drop the Chapter column from Tracks.
- Evidence: `crop:R3EN1/L-chapter-link-confirmed-w1280-560-0.png` (y≈142 against y≈405), `L-chapter-link-confirmed-w1024-300-0.png`.
- Shared: page-local

### R3EN1-12 At 390 the dialog footers wrap their button labels onto two and three lines (secondary width)

- Gut reaction: Why is "Create 2 regions" a three-line pill squeezed beside Cancel?
- Page / state: engine / create-regions-preview and -error, `link-chapters-*` ("Read current stamps"), rpp-picker (long path button); cleanup-tools-launched at 390 also cuts its status sentence under the footer.
- Widths: 390; theme: light.
- What is wrong: dialog buttons have no `whitespace-nowrap` and the footer is one row, so "CREATE 2 REGIONS" is 3 lines in a 74 px button (y=693-742), "READ CURRENT STAMPS" 3 lines, and the rpp path button wraps over two lines. The cleanup tools status text is cut mid-sentence by the footer at 390 ("the repair happens only when you apply it there." half visible).
- Where: `primitives/Button.tsx:33` (no nowrap), `primitives/Dialog.tsx:195` (actions row without wrap/stack below `md`).
- Severity: looks wrong at 390 (secondary)
- Fix: stack the footer actions (primary full-width on top) below 480 px and add `whitespace-nowrap`.
- Evidence: `crop:R3EN1/L-create-regions-preview-w390-0-0.png` (footer y≈693-742), `L-link-chapters-conflict-w390-0-0.png` (Read current stamps y≈622-669), `L-cleanup-tools-launched-w390-0-0.png`.
- Shared: Button, Dialog
- Scanner: W1

Counts: looks wrong 8 (R3EN1-1 to -7, -12 counted at 390 so secondary), polish 4 (R3EN1-8 to -11). By id: R3EN1-1,2,3,4,5,6,7 looks wrong; -12 looks wrong (390); -8,-9,-10,-11 polish.

### R3EN2-1 Every unlinked chapter's dropdown already says "Chapter 1", so Confirm links the wrong track

- Gut reaction: Why does "Chapter 2 - The Pool of Tears" offer "Chapter 1" as its track, and why does every row say the same thing?
- Page / state: engine / sync-off (and every state with an unlinked row: default, chapter-link-missing).
- Widths: 1920, 1440, 1280, 1024, 768, 390; theme: both.
- What is wrong: all unlinked rows show the select preset to the first track ("Chapter 1" at 1920 x=491..606 in the panel, rows y=889 and 985 and below), so the page reads as twelve chapters all proposing the same track with an active CONFIRM under each. One click links Chapter 2 to Chapter 1's track; nothing says "choose a track".
- Where: `mapping/MappingConfirm.tsx:44` (`useState(... : (options[0]?.value ?? ''))` preselects the first option; no placeholder option).
- Severity: looks wrong
- Fix: add a "Choose track" placeholder as the initial value and disable Confirm until a track is picked, or pre-select the track whose name matches the chapter.
- Evidence: `crop:r3en2/so1.png` (sync-off w1920 and w1280, rows at y≈889 and 985); `engine/sync-off/w1440.png` (y≈890).
- Shared: MappingConfirm (Editing check, Production track panel)

### R3EN2-2 Every dialog is 70% of the window wide whatever it holds: a one-field dialog is 1342 px wide at 1920

- Gut reaction: Why is a dialog with one text box as wide as the whole screen, with the buttons miles apart?
- Page / state: engine / render-config-prefilled, -no-regions, -error, -success, retake-lanes-list, -picked, -none, -error, link-chapters-preview (select floats).
- Widths: 1920 (1342 px), 1440 (1006), 1280 (896 by CSS), 1024 (717), 768 (538); theme: both.
- What is wrong: at 1920 the Prepare chapter render dialog spans x=289..1631 for one input (input 1306 px wide, x=37..1343 inside the crop); Close and Configure render are 1310 px apart; the Retakes "none" dialog is two sentences in a 1342 px box with Close alone in the bottom-left corner; Retake rows put the lane name at the far left and "Plays" + button 1100 px away at the far right; in Link chapters the track select (115 px) floats at x=748 of a 1340 px row. Compare the 704 px engine panel behind it: the tool dialogs are wider than the panel that launched them at every width above 1006.
- Where: `primitives/Dialog.tsx:149` (`w-full ... max-w-[70vw]`): `w-full` makes every default-size dialog exactly 70vw; only the height is content-sized.
- Severity: looks wrong
- Fix: size tool dialogs to content with a cap (for example `w-[min(44rem,100%)]`, or the panel's 44rem), widening only for tables.
- Evidence: `crop:r3en2/render-config-prefilled_D1.png` (w1920), `crop:r3en2/retake-lanes-none_D1.png`, `crop:r3en2/link-chapters-preview_D1.png`, `crop:r3en2/retake-lanes-list_D1.png`.
- Shared: Dialog (every default-size dialog in the app)

### R3EN2-3 Chapter sync is a run-on sentence plus an unrelated two-column block that repeats the Tracks card

- Gut reaction: Why is this card a grey sentence, a rule, and then a half-empty two-column list that has nothing to do with the sentence?
- Page / state: engine / sync-activity, sync-background-wait, no-daw-link, wrong-project.
- Widths: 1920, 1440, 1280, 1024, 768 (stacks at 390); theme: both.
- What is wrong: the status is one muted line joined with dots ("On . last synced 24 Sep from the saved Alice.rpp . 1 chapter linked automatically, 1 by you"); in sync-background-wait a second muted line ("Background checks: waiting, REAPER is recording.") has the same style, so status and background state cannot be told apart. Under a rule, "TRACKS THAT ARE NOT CHAPTERS (1)" lists "Click Track", which the Tracks card directly below already lists as "Not linked"; its right column "SYNC ACTIVITY" starts at x=361 (panel coordinates, 1440) while the Tracks table's CHAPTER column below starts at x=326, so the two grids are 35 px apart. The header rule is full card width, the inner rule is inset 16 px, so one card carries two rule styles. In sync-background-wait the not-chapters list is alone in a card at full width.
- Where: `engine/ChapterSyncPanel.tsx:168` (`grid gap-4 border-t pt-3 sm:grid-cols-2`, equal halves, independent of the Tracks table) and the status lines above it; Panel header rule `primitives/panelStyles.ts:206`.
- Severity: looks wrong
- Fix: show status as a label + value pair (or badge) per fact, drop the not-chapters list or merge it into the Tracks table as a "Not a chapter" status, and align the activity column to a grid shared with Tracks.
- Evidence: `crop:r3en2/sa_zoom.png` (sync-activity w1440, y≈20-370 of the crop), `crop:r3en2/sync-background-wait_A.png`.
- Shared: page-local

### R3EN2-4 Wrong-project warning is coloured text with no box, and its two remedies have no buttons beside them

- Gut reaction: Why does it tell me to "link the open project or switch REAPER" and then give me only "Check again"?
- Page / state: engine / wrong-project.
- Widths: 1920, 1440, 1280, 1024, 768, 390; theme: both.
- What is wrong: the card shows the project name, its path, then an amber paragraph in the same 14 px as body text ("REAPER has a different project open than the one linked here. Link the open project, or switch REAPER to the linked file.", two lines), then a muted "Waiting for REAPER to open the linked project. Last checked 3 s ago." with a 32 px CHECK AGAIN button. The only "link the open project" control is the header button 150 px above ("Link a different REAPER project file"), and the card still says Alice.rpp is the project, so a problem state looks like the normal card with orange text; the REAPER tools and Chapter sync cards below stay fully active.
- Where: `engine/EnginePanel.tsx:249-258` (`<p role="status" style warn-text>` and `CheckLine`), header button at `:234`.
- Severity: looks wrong
- Fix: render the mismatch as a callout (tinted box with icon) holding the sentence and the two actions ("Link the open project", "Check again") as a button row, and dim or disable the REAPER tools while it is shown.
- Evidence: `crop:r3en2/wrong-project_A.png` (card y≈64-232 in the montage), `crop:r3en2/wp_zoom.png`.
- Shared: page-local (`layout/CheckLine`)

### R3EN2-5 REAPER project picker: two identical-looking path rows, no emphasis on the file name, and a competing header button

- Gut reaction: Why are these two long paths nearly the same, and why is there a "Link a different file" button above a list that asks me to choose a file?
- Page / state: engine / rpp-picker.
- Widths: 1920, 1440, 1280, 1024, 768 (rows one line each); 390 (rows wrap mid-name); theme: both.
- What is wrong: each row prints the full path in mono ("C:/Projects/Alice-in-Wonderland/Alice.rpp", ".../Alice-alt-mix.rpp"); the first 33 characters are identical and the distinguishing part is the last 7-14. Rows are ~45 px tall plain bordered buttons with no chevron, radio or "Use this" cue, no hint of which is currently linked, and a hover that only changes border colour. The header still offers "LINK A DIFFERENT REAPER PROJECT FILE", a second route to the same decision, and the list has its own "CHOOSE A REAPER PROJECT FILE" label under the card title. At 390 the path breaks mid-word ("Alice-in- / Wonderland / Alice.rpp", 66 px tall, scanner W1).
- Where: `engine/EnginePanel.tsx:287-300` (`RppPicker`, `p-3 ... font-mono [overflow-wrap:anywhere]`), header action `:234`.
- Severity: looks wrong
- Fix: file name in bold on the first line, folder in muted small on the second, a "Use" affordance (radio or trailing arrow), and hide the header button while the picker is open.
- Evidence: `crop:r3en2/rpp-picker_A.png`, `crop:r3en2/w390_2.png` (second panel).
- Shared: page-local

### R3EN2-6 Retake lanes: group heading and lane name are the same style, so the list has no hierarchy

- Gut reaction: Why does "Chapter 1 . line-000012 . 0:42" look exactly like "Lane 1", so I can't see what belongs to what?
- Page / state: engine / retake-lanes-list, -picked, -error.
- Widths: 1920, 1440, 1280, 1024, 768, 390; theme: both.
- What is wrong: the group heading and each lane title are both 14 px semibold in the body colour, only the lane block has a rule above it and the file line below. The heading carries the raw id ("line-000012") and a start time, which the narrator never sees elsewhere. The status word ("Plays" / "Silent") and the button are separate flex items with no fixed slot (left edges 1453 vs 1450 on w1920) and, at 1920, sit 1100 px from the name they describe (see R3EN2-2).
- Where: `engine/RetakeLanesDialog.tsx:149` (`h3 text-sm font-semibold`) and `:41-46` (`p text-sm font-semibold`).
- Severity: looks wrong
- Fix: make the group heading a section label (small caps, muted) or larger, show the manuscript line text instead of the id, give the lane name a normal weight, and put Plays/Silent in a fixed-width column or badge.
- Evidence: `crop:r3en2/retake-lanes-list_D1.png` (y≈385-560), `crop:r3en2/retake-lanes-list_D2.png`.
- Shared: page-local

### R3EN2-7 Prepare chapter render, success: the same instruction is printed twice in two type styles over a 12 px file list

- Gut reaction: Why does it tell me to press Render twice, once grey and once bold?
- Page / state: engine / render-config-success.
- Widths: 1920, 1440, 1280, 1024, 768, 390; theme: both.
- What is wrong: the result block stacks (1) a muted 14 px line "Render configured for 2 chapter files. Press Render in REAPER to create them.", (2) a bulleted 12 px mono list of the two .wav paths, (3) a semibold 14 px line "Render is configured - press Render in REAPER [Ctrl]+[Alt]+[R] or File > Render to create the files." Lines 1 and 3 say the same thing, and the three lines use three sizes/weights; the kbd chips sit mid-sentence and, at 768, push "or File > Render..." to a new line. The primary button below still reads CONFIGURE RENDER at full strength (ENX-28).
- Where: `engine/RenderConfigDialog.tsx:60-86` (muted message, `text-xs` list, `font-semibold` instruction).
- Severity: looks wrong
- Fix: keep one sentence plus the shortcut, make the file list the same size as body text, and give the block a success tone.
- Evidence: `crop:r3en2/rcs_z.png` (w1920 zoom), `crop:r3en2/render-config-success_D3.png`.
- Shared: page-local

### R3EN2-8 Prepare chapter render with no regions: a problem is shown as a quiet grey note under a rule

- Gut reaction: Why does it say "Render configured" and "No chapter regions were found" in the same grey sentence, as if all is well?
- Page / state: engine / render-config-no-regions.
- Widths: 1920, 1440, 1280, 1024, 768, 390; theme: both.
- What is wrong: the outcome ("Render configured. No chapter regions were found yet: create them before rendering.") is 14 px muted text under a thin rule, the same look as the neutral description at the top. It claims success and warns in one sentence, shows no warning colour, and the fix (Create chapter regions...) is a button behind the dialog on the panel, not offered here. The footer still shows an enabled primary CONFIGURE RENDER.
- Where: `engine/RenderConfigDialog.tsx:60-64` (success block `text-sm` muted for every `state.message`, no tone for `count === 0`).
- Severity: looks wrong
- Fix: when no regions were found use the warning tone with a warn icon, lead with "No chapter regions yet", and add a "Create chapter regions..." button that opens that dialog.
- Evidence: `crop:r3en2/render-config-no-regions_D1.png` (y≈575-610), `crop:r3en2/render-config-no-regions_D3.png`.
- Shared: page-local

### R3EN2-9 Link chapters at 768: the "ITEMS TO STAMP" header breaks onto two lines and the three header labels no longer share a baseline

- Gut reaction: Why is this one column header two lines tall and the other two floating at a different height?
- Page / state: engine / link-chapters-preview, -error, -success.
- Widths: 768 (dialog 538 px, light and dark tablet); theme: both.
- What is wrong: the right-aligned header "ITEMS TO / STAMP" wraps (rows at y=247 and 266 in the dark tablet crop) while "CHAPTER" and "REAPER TRACK" stay on one line at y=257, vertically centred in the taller row, so the three labels are on three different baselines and the header row is 2 lines tall. At 1024 and above it stays on one line. Chapter titles in the same table wrap to two lines ("Chapter 4 - The Rabbit Sends in a / Little Bill") while the select column keeps its own width, so the row cells have unequal fill.
- Where: `engine/LinkChaptersDialog.tsx:178` (`TableHeader align="right"` without `whitespace-nowrap`); `primitives/tableStyles.ts` header cell.
- Severity: looks wrong
- Fix: `whitespace-nowrap` on header cells and shorten to "To stamp", with `align-bottom` on the header row.
- Evidence: `crop:r3en2/link-chapters-preview_D3.png` (w768, second panel y≈185-210), `crop:r3en2/link-chapters-preview_D4.png` (dark tablet, y≈240-270).
- Shared: Table header

### R3EN2-10 Three title styles for one tool: panel 14 px sans, card 22 px condensed, dialog 16 px sans

- Gut reaction: Why does the panel title look smaller than the cards under it, and why do the dialogs it opens use yet another heading?
- Page / state: engine / every state (panel) and every dialog state.
- Widths: all; theme: both.
- What is wrong: "Audio engine" is 14 px semibold sans (x=755, y=32), card titles ("REAPER project", "Tracks") are Barlow Condensed ~22 px, dialog titles ("Link chapters to REAPER", "Retakes on lanes") are 16 px semibold sans at x=235 in a 63 px header, and dialog section headings are a fourth style (ENX-21). The owner's "inset vs card title" complaint therefore also applies between the panel and its dialogs: the dialog header is the same 63 px high as the panel header but has a different title size, and a 17.6 px inset against the panel's 18 px gutter.
- Where: `primitives/SlideOver.tsx:70` (`text-sm font-semibold`), `primitives/Dialog.tsx:164` (`font-semibold`, inherits 16 px), `primitives/panelStyles.ts` (card title).
- Severity: looks wrong (extends ENX-13 to the dialogs)
- Fix: pick one title token for slide-over and dialog headers and make the panel title the larger of the two.
- Evidence: `engine/sync-off/w1440.png` (panel title y=32), `engine/link-chapters-preview/w1440.png` (dialog title y=123).
- Shared: SlideOver, Dialog

### R3EN1-8 Create regions footer: the Experimental badge pushes the primary button off the right edge

- Gut reaction: Why is this dialog's main button not in the corner like every other dialog's?
- Page / state: engine / create-regions-preview, -error, -success (not -empty, where it is disabled but still shifted).
- Widths: 1920, 1280, 1024, 768; theme: both.
- What is wrong: in every other tool dialog the primary action ends at the dialog's right content edge (chapter tags: x=1072 at the 1920 crop). In create regions the 72 px "Experimental" pill sits in the corner, so the primary ends at x=1000, 72 px short, and the pill (about 66 x 22 px) sits 1-2 px lower than the button text centre. Cancel/Close and the primary are therefore not on the same grid as the siblings, and the badge reads as a second button.
- Where: `engine/CreateChapterRegionsDialog.tsx:87-91` (`CapabilityGate` rendered after the button in the actions row).
- Severity: polish
- Fix: put the badge in the dialog title row beside "Create chapter regions", keep the footer to Cancel and the primary.
- Evidence: `crop:R3EN1/L-create-regions-preview-w1920-280-40.png` (primary x=897-1000, pill 1006-1072), `L-chapter-tags-ready-w1920-280-150.png` (primary ends x=1072).
- Shared: CapabilityGate in dialog footers

### R3EN1-9 "(Undo)" is an inline underlined link, 33 x 20 px, inside parentheses at the end of a sentence

- Gut reaction: Why is the undo for an automatic link a tiny underlined word in brackets at the end of a log line?
- Page / state: engine / sync-activity (Chapter sync card, Sync activity column); scanner state outside my 18.
- Widths: 1440 (and every width where sync activity shows); theme: both.
- What is wrong: "24 Sep · Linked "Chapter 1" to Chapter 1 (Undo)": the control that removes an automatic link is a 33 x 20 px inline link (below the 24 px target) at x=1360-1393 of the log text, wedged against the parenthesis, with no button treatment, next to two lines that have no action.
- Where: `engine/ChapterSyncPanel.tsx:193-196` (`button.inline underline`, `aria-label="Undo: ..."`).
- Severity: polish
- Fix: a 24 px high small text button right-aligned on the line, or an icon button, without the parentheses.
- Evidence: `crop:R3EN1/L-sync-activity-w1440-736-440.png` (right end of the first activity line).
- Shared: page-local
- Scanner: H1

### R3EN1-10 Orphan words in dialog paragraphs

- Gut reaction: Why does one lonely word sit on its own line?
- Page / state: engine / cleanup-tools-idle and -launched ("it." at 1280 and 1920: "...until you apply / it."; "there." at 1024 launched), chapter-tags-idle/-ready ("beside it." alone at 1920 and 1440, "Prepare chapter render..." line starting a new line by hard break), `create-regions-*` at 1280 ("written until you create them.").
- Widths: 1920, 1280, 1024; theme: both.
- What is wrong: the description wraps leaving a one- or two-word last line, so the block looks ragged; the chapter-tags description ends with a hard line break so the "No chapter render is configured yet..." sentence starts a new line glued under the paragraph.
- Where: description `<p>` in `primitives/Dialog.tsx:178-182` (no `text-wrap: pretty`), `engine/ChapterTagsDialog.tsx` description.
- Severity: polish
- Fix: `text-wrap: pretty` on dialog descriptions and a margin instead of the hard break.
- Evidence: `crop:R3EN1/L-cleanup-tools-idle-w1280-150-150.png`, `L-cleanup-tools-launched-w1024-100-150.png`, `L-chapter-tags-ready-w1920-280-150.png`.
- Shared: Dialog description

### R3EN1-11 The dialog is centred on the viewport, not on the panel it opened from, so it cuts the panel's tool buttons in half

- Gut reaction: Why does the dialog cover half of the button row behind it and leave slivers of buttons peeking out?
- Page / state: engine / all dialog states at 768-1920.
- Widths: 1920 (slivers "CRE", "RETAKES", "CHA/AN" at the dialog's right edge, x=1632-1650), 1280, 1024, 768; theme: both.
- What is wrong: the dialog is centred in the window while the slide-over is pinned right, so at 1920 the right edge of the dialog falls in the middle of the REAPER tools row and of the Chapter links controls: two button rows and the Turn off button show as clipped slivers beside the dialog. The user cannot tell if those are live controls.
- Where: `primitives/Dialog.tsx:143` (`Parts.Viewport ... items-center justify-center`, no anchor to the slide-over).
- Severity: polish (may be intended for a modal)
- Fix: dim the slide-over with a heavier scrim in dialog state, or centre the dialog over the slide-over's column.
- Evidence: `crop:R3EN1/L-chapter-tags-idle-w1920-1150-150.png` (slivers right of the dialog at y≈160-215), `L-chapter-tags-idle-w1920-0-0.png`.
- Shared: Dialog

### R3EN2-11 Text links and Undo are 20 px tall hit areas, and "Open in Editing" / "Open in Proof" touch each other

- Gut reaction: Why are these two links stacked with no space, and why is Undo such a tiny target?
- Page / state: engine / sync-activity (Undo, Open in links in the Chapter links row), no-daw-link and any state with a linked chapter row.
- Widths: 1920, 1440, 1280, 1024, 768; theme: both.
- What is wrong: "Open in Editing" 98.6x20 and "Open in Proof" 88x20 sit at y=994.8 and y=1014.8 (0 px gap between boxes), "Undo" in the activity line is 33.4x20, all under 24 px high.
- Where: `engine/ChapterLinksTable.tsx:110-113` (`Link className="text-sm font-semibold underline"`), Undo `engine/ChapterSyncPanel.tsx` (inline underlined button).
- Severity: polish
- Fix: `inline-flex min-h-6 items-center` on the links with a 4 px gap, or turn them into ghost buttons.
- Evidence: `engine/sync-activity/w1440.png` (Undo at x≈1200,y≈548 scanner coordinates), `crop:r3en2/sync-activity_A.png` (Open in links).
- Shared: page-local
- Scanner: H1

### R3EN2-12 Dialogs are centred on the window, not on the panel, so slivers of the panel's buttons stick out of the dialog's right edge

- Gut reaction: Why can I see half a button and a cut-off "ERENT REAPER PROJECT FILE" poking out beside the dialog?
- Page / state: engine / every dialog state.
- Widths: 1920 (1631..1920), 1440 (1223..1440, "FERENT REAPER PROJECT FILE", "IONS...", "TURN ON/OFF"), 1280, 1024, 768; theme: both.
- What is wrong: the dialog (centred in the window, 70vw) covers the left part of the 704 px panel and stops partway across its content, so the right 130-290 px of the panel cards are visible, dimmed, with its header button, tools row and Turn on/off button cut mid-word at the dialog edge.
- Where: `primitives/Dialog.tsx:143` (viewport `flex items-center justify-center`), width from `:149`.
- Severity: polish
- Fix: size the dialog to fit entirely inside the panel's width (R3EN2-2) or fully cover it.
- Evidence: `engine/link-chapters-preview/w1440.png` (x≈1223-1405, y≈90-330).
- Shared: Dialog over SlideOver

### R3EN2-13 Dialog results are unmarked paragraphs and the scroll hides what is still to read

- Gut reaction: Why does a result look just like the description, and why can't I tell there is more below?
- Page / state: engine / retake-lanes-picked, -error, -none; link-chapters-error, -success; retake-lanes at 1024 and 390.
- Widths: 1920, 1440, 1280, 1024, 768, 390; theme: both.
- What is wrong: the picked message ("Lane 2 is now the only lane playing on Chapter 1...") is a plain 14 px paragraph with 8 px margin between the last lane row and the next group heading, no icon, tint or inset; the "none" outcome is a second paragraph in the same style as the intro. Because the message is track-wide but printed under only the first line's group, it reads as part of the list. At 1024 (768 px viewport) and 390 the retake list is cut by the footer: the closing paragraph is below the fold and there is no fade, shadow or scrollbar to say so; link-chapters-error/-success open scrolled to the bottom with the row under the header rule sliced (select cut at y=173 on w1920).
- Where: `engine/RetakeLanesDialog.tsx:112-125` (`feedback` paragraphs `mt-2 text-sm`), `:139-145` (`EmptyList`), body scroll in `primitives/Dialog.tsx` (overflow-y-auto, no edge shadow).
- Severity: polish
- Fix: give outcomes an inset tinted block with an icon; add an edge shadow to the scroll body.
- Evidence: `crop:r3en2/retake-lanes-picked_D1.png` (y≈560-590), `crop:r3en2/retake-lanes-none_D1.png`, `crop:r3en2/link-chapters-error_D1.png` (top row cut at y≈173).
- Shared: Dialog, page-local messages

### R3EN2-14 Disabled primary "STAMP 0 ITEMS" is white on a washed peach at 2.4:1

- Gut reaction: Why is the main button faded so much I can hardly read it?
- Page / state: engine / link-chapters-error, link-chapters-success.
- Widths: all; theme: light (dark version is a dim brown, legible).
- What is wrong: the label is #FDFCFB on #D19B7B, 2.36:1 measured from `w1440.png`. May be intended for disabled, but it is the only enabled-looking action a narrator is looking for after an error.
- Where: `primitives/Button.tsx` disabled primary style.
- Severity: polish
- Fix: disable with a grey fill and dark text, or keep the label at 3:1.
- Evidence: `engine/link-chapters-error/w1440.png` (button x≈1105-1207, y≈757-791).
- Shared: Button

### R3EN2-15 Dark theme: the dialog surface is almost the same value as the dimmed page behind it

- Gut reaction: Why does the dark dialog barely stand out from what is behind it?
- Page / state: engine / all dialog states.
- Widths: d1440, d1024, d768; theme: dark.
- What is wrong: dialog surface rgb(29,26,21) against the scrim over the page rgb(19,17,13) (rgb(24,22,17) over the panel cards): about 1.1:1, so only the 1 px border and the text outline the dialog; the panel buttons behind it keep nearly full-strength outlines.
- Where: `styles.css` (`--backdrop`, `--surface` in `:root[data-theme='dark']`), `primitives/Dialog.tsx:152`.
- Severity: polish
- Fix: lighten the dark dialog surface one step or darken the dark backdrop.
- Evidence: `dark:engine/render-config-no-regions/desktop.png` (dialog y≈388-690 vs page at y≈150).
- Shared: Dialog, `--backdrop`

### R3EN2-16 Panel content starts 18 px under the header and 18 px from the sides but only 16 px apart vertically

- Gut reaction: Why is the space above the first card bigger than the space between cards?
- Page / state: engine / all panel states.
- Widths: all; theme: both.
- What is wrong: measured on `sync-off/w1440.png`: header rule y=63, first card top y=82 (18 px), card bottom 210 to next top 227 (16 px), side gutter 18 px (card x=755..1421 in a panel x=736..1440). 2 px, may be intended.
- Where: `primitives/SlideOver.tsx` body padding against `engine/EnginePanel.tsx:164` (`space-y-4`).
- Severity: polish
- Fix: use `space-y-[18px]` or a 16 px body padding so the three distances match.
- Evidence: `engine/sync-off/w1440.png` (y=63-83, 210-227).
- Shared: SlideOver

### R3EN2-17 At 390 the dialogs break more: "Read current stamps" is 3 lines, its heading is 3 lines, and the folder path is cut (secondary width)

- Gut reaction: Why is this button three lines of squashed text, and why can't I see where the folder path ends?
- Page / state: engine / link-chapters-error, -success, render-config-prefilled, -error.
- Widths: 390; theme: light.
- What is wrong: "Currently stamped in REAPER" wraps to 3 lines and "READ CURRENT STAMPS" to 3 lines (button 100.7x49.4) in a 271 px body; the render-config input shows "C:/Projects/Alice-in-Wonderland" and the "\renders" tail is cut with no ellipsis; the dialogs sit as a 70% strip at the top-left. Table clipping at 390 is ENX-30.
- Where: `engine/LinkChaptersDialog.tsx:73-75` CurrentStamps heading and button row, `engine/RenderConfigDialog.tsx:58` (Field), `primitives/Dialog.tsx:149`.
- Severity: polish (secondary width)
- Fix: stack the heading and button below 480 px, and show the path field with the tail visible (`direction: rtl` ellipsis or two lines).
- Evidence: `crop:r3en2/w390_3.png` (panels 1, 2, 3), `crop:r3en2/w390_4.png` (panel 1).
- Shared: Dialog

## Round 2: strict review

### ENX-29 At 390 the Chapter links table is wider than the panel and the panel title wraps one letter per line (secondary width)

- Gut reaction: Why does the panel scroll sideways and spell its title one letter per line on a phone width?
- Page / state: engine / chapter-link-confirmed, chapter-link-missing, default, every state with the REAPER project card.
- Widths: 390; theme: light.
- What is wrong: the table is wider than the 390 px panel, so the body scrolls sideways (Chapter links title at x=0, "RACK" for Track, the select cut at the right edge at x=385); chapter names break to one word per line ("Chapter 1 / — Down / the / Rabbit- / Hole"), and "Open in Editing / Open in Proof" breaks per word. The "REAPER project" title wraps to "REAPE / R / projec / t" because the long button takes the line.
- Where: `engine/ChapterLinksTable.tsx:438-492` (no scroll wrapper, no stacked layout), `primitives/SlideOver.tsx:78-80`, `primitives/Panel.tsx:187` (`flex-1 min-w-0` title block next to `flex-wrap` actions) with `panelStyles.ts:213` (`[overflow-wrap:anywhere]`).
- Severity: breaks use (actions unreachable without sideways scroll)
- Fix: below 768 render each chapter as a stacked card (name and status on one line, actions on the next); give the Panel title a `flex-[1_1_8rem]` basis.
- Evidence: `engine/chapter-link-confirmed/w390.png` (table from x=0), `engine/default/w390.png` (title y≈100-190).
- Shared: Table, Panel header, SlideOver body
- Supersedes: ENG-1 (390 part), ENG-3

### ENX-30 At 390 the dialogs are 70% wide, so their tables are clipped (secondary width)

- Gut reaction: Why is the dialog a narrow strip with its table cut off?
- Page / state: engine / link-chapters-preview, -success, -conflict, create-regions-preview, -success.
- Widths: 390 (not re-opened in this pass; first-pass observation plus source), 768 is cramped (about 537 px, stamped table at 4 columns wraps in w768).
- What is wrong: the dialog is `max-w-[70vw]` (273 px at 390) with the body at `overflow-x-hidden`, so the stamped-lines table and the create-regions END/STATUS columns are cut with no scroll.
- Where: `primitives/Dialog.tsx:149` and `:176`.
- Severity: breaks use at 390
- Fix: `max-w-[calc(100vw-2rem)]` below `md` and `overflow-x-auto` on the body.
- Evidence: `engine/link-chapters-preview/w390.png`, `.../create-regions-preview/w390.png`; `.../link-chapters-success/w768.png` for the 768 cramping.
- Shared: Dialog
- Supersedes: ENG-2

### ENX-1 Chapter links table has no column grid; column x positions change from state to state

- Gut reaction: Why does every row look like a different table, and why do the columns jump when I link a chapter?
- Page / state: engine / chapter-link-confirmed, chapter-link-missing, sync-off, default (table at the foot).
- Widths: all (1920, 1440, 1280, 1024, 768); theme: both.
- What is wrong: the five columns are content-sized (auto table layout, no widths), so the Chapter column is the narrowest (about 150 px, 2-3 line names) while Status, Editing-check and the action cell take whatever their content asks. The grid also moves between states: at 1440 "STATUS" starts at x=945 (confirmed), 954 (missing) and 1006 (sync-off); the select/Confirm cell starts at x=1247, 1168 and 1227; row height is 96 px for an unlinked row at 1440 but 53 px at 1280 and 91 px for the linked row.
- Where: `engine/ChapterLinksTable.tsx:438-447` (header cells carry no width) with `primitives/Table.tsx:18` (`w-full`, no `table-fixed`, no `colgroup`). The widest cell, the action cell (`MappingConfirm`), decides the layout.
- Severity: looks wrong (the owner's main complaint)
- Fix: `table-fixed` with explicit column widths (see the Reorganisation suggestion), so the same x applies in every state and width.
- Evidence: `engine/chapter-link-confirmed/w1440.png` (header y≈81, columns at x=782/945/1017/1137/1247), `.../chapter-link-missing/w1440.png` (x=782/954/1057/1168), `.../sync-off/w1440.png` (STATUS x=1006), `.../chapter-link-missing/w1280.png` (53 px rows).
- Shared: page-local (Table primitive has no fixed layout option)
- Supersedes: ENG-1 (the 768-1920 part)

### ENX-2 The action cell is 2-3 lines tall and a different shape for linked, unlinked and missing rows

- Gut reaction: Why is the Clear button sitting under Change, and why are some rows twice as tall as others?
- Page / state: engine / chapter-link-confirmed, chapter-link-missing, default.
- Widths: 768, 1024, 1440, 1920 (wraps differently at 1280); theme: both.
- What is wrong: linked row = track name + CHANGE on one line, CLEAR wrapped under it (3 buttons' worth in 2 lines, x=1247-1386); unlinked row = select over CONFIRM, each 114 px / 74 px wide, left edges equal but right edges ragged; missing row = a two-line sentence "Linked track is missing from this project" over CHANGE and CLEAR. So the rows are 91, 96 and 82 px tall in one table and the buttons sit at three different y offsets. The select is 41 px tall, the buttons are 36 px.
- Where: `mapping/MappingConfirm.tsx:55-64` (linked: text + two buttons in `flex flex-wrap items-center gap-2`), `:76-85` (unlinked: select + button in the same wrapping flex), no fixed width on any child. `primitives/Select.tsx` (`h-[var(--control-height)]` 40.8 px) next to `Button` (36 px).
- Severity: looks wrong
- Fix: give the action column a fixed width wide enough for one line (select 11rem + Confirm, or track name + Change + Clear as icon-sized buttons) with `flex-nowrap`, and show the missing-track sentence as the Status cell (not in the action cell).
- Evidence: `engine/chapter-link-confirmed/w1440.png` (row 1 y≈106-186, rows 2+ y≈197-283), `.../chapter-link-missing/w1440.png` (row 1 y≈208-290), `.../chapter-link-confirmed/w768.png`.
- Shared: `MappingConfirm` (also in Editing check, the Production recording check, the Track panel's link control)
- Supersedes: ENG-1 (the wrapping part)

### ENX-3 "EDITING CHECK…" button wraps to two lines in every row and repeats 12 times

- Gut reaction: Why is this button label chopped onto two lines when there is empty space right beside it?
- Page / state: engine / every state that shows the table.
- Widths: 768, 1024, 1280, 1440, 1920; theme: both.
- What is wrong: the label "EDITING CHECK…" is broken into "EDITING / CHECK…" inside a 70-90 px wide button (button 36 px tall, text two lines) while the Status column next to it has 60+ px of free space and the action cell has a blank 100 px (unlinked rows have no "Open in" links, so the third column is an empty gap). The button is also offered on unlinked rows, where the panel it opens says "This chapter can't be checked yet".
- Where: `engine/ChapterLinksTable.tsx:466-470` (button in an auto-width cell; `Button` has no `whitespace-nowrap`, `primitives/Button.tsx:33`).
- Severity: looks wrong
- Fix: `whitespace-nowrap` and a fixed column; or make "Editing check" a row-level icon/menu action instead of a text button per row, and hide it for unlinked chapters.
- Evidence: `engine/chapter-link-confirmed/w1440.png` (buttons x≈1137-1226), `.../chapter-link-missing/w1280.png` (x≈897-987), `dark:engine/chapter-link-missing/tablet.png`.
- Shared: page-local
- Supersedes: ENG-1 (the button part)

### ENX-4 Status text wraps ("Not / linked") and is plain coloured text, not a badge

- Gut reaction: Why does 'Not linked' break into two lines when the column next to it is half empty?
- Page / state: engine / chapter-link-confirmed, chapter-link-missing, sync-off.
- Widths: 768-1920; theme: both.
- What is wrong: "Not linked" and "Track missing" break over two lines in the 60-70 px Status column at every width, so unlinked rows are two text lines tall for no reason. The Tracks card above uses a `StatusBadge` for "Muted" and plain muted text for "Not linked"; the Chapter links table uses coloured text for the same fact, so the same word looks different in two cards of one panel.
- Where: `engine/ChapterLinksTable.tsx:452` (`<TableCell style={{ color }}>`), column width left to auto layout (see ENX-1). `engine/EnginePanel.tsx:328` is the second "Not linked" rendering.
- Severity: looks wrong
- Fix: `whitespace-nowrap` on the cell and a column width of about 7rem; use `StatusBadge` (neutral / danger tone) in both tables.
- Evidence: `engine/chapter-link-confirmed/w1440.png` (x≈945-985, y≈221-256), `.../chapter-link-missing/w1440.png` ("Track missing" y≈237-258).
- Shared: page-local
- Supersedes: ENG-1 (the "Not linked" wrap part)

### ENX-5 "Open in Editing / Open in Proof" are two stacked underlined links in a column that is empty for unlinked rows

- Gut reaction: Why are these two links stacked touching each other, and why is the cell blank on every other row?
- Page / state: engine / chapter-link-confirmed (linked row), default.
- Widths: 768-1920; theme: both.
- What is wrong: the links stack because the cell is narrow, with no vertical gap (lines touch, y=136 and 156, 20 px pitch) and a hit area of about 17 px tall (below 24). They are text links in a column of bordered buttons, so the row mixes control types. Unlinked rows leave the cell blank, which is what makes the column look ragged.
- Where: `engine/ChapterLinksTable.tsx:455-464` (`flex flex-wrap gap-x-3`, no `gap-y`, `text-sm font-semibold underline`).
- Severity: looks wrong
- Fix: one "Open" link/menu with Editing and Proof inside, in the action column; or two nowrap links with `gap-y-1` and a 24 px hit area.
- Evidence: `engine/chapter-link-confirmed/w1440.png` (x≈1017-1116, y≈128-165).
- Shared: page-local

### ENX-6 Tables sit at a different x than their card title, and the two tables in one panel differ from each other

- Gut reaction: Why does the table text start further in than the card title, and not in the same place as the Tracks table above?
- Page / state: engine / default, chapter-link-confirmed (Tracks card and Chapter links card).
- Widths: all; theme: both.
- What is wrong: at 1440 the card titles start at x=771, the Tracks table header "TRACK" at x=766 (5 px left of the title, running to the card edge), and the Chapter links table header "CHAPTER" at x=782 (11 px right of the title). The right edge differs too: Tracks "PLAYABLE ITEMS" ends at x=1410, Chapter links ends at x=1405. The two tables in the same panel use different inset rules (flush vs padded). In dialogs the table text (x=245) is 10 px right of the paragraph above it (x=235).
- Where: `engine/EnginePanel.tsx:304` (`Panel flush`) against `engine/ChapterLinksTable.tsx:432` (plain `Panel`, body `p-4` plus `TABLE_CELL_CLASS px-2.5`, `primitives/tableStyles.ts:238`), header `px-4` at `primitives/panelStyles.ts:206`.
- Severity: looks wrong
- Fix: use `Panel flush` for both tables and give first/last table cells `px-4` so the text lines up with the card title.
- Evidence: `engine/default/w1440.png` (Tracks, y≈630-790), `engine/chapter-link-confirmed/w1440.png` (header x=782), `engine/link-chapters-preview/w1440.png` (text x=245 vs 235).
- Shared: Table + Panel (also Delivery profile and Settings panes that use `Panel flush`, not checked)
- Supersedes: ENG-6

### ENX-7 Card headers are 58 px tall when they hold a button and 50 px when they do not; titles shift 4 px

- Gut reaction: Why do some card headers look taller than others, with the title sitting lower?
- Page / state: engine / default and every state with the panel behind.
- Widths: all; theme: both.
- What is wrong: "REAPER project" (card top y=83) and "Chapter sync" (top y=404) have a 36 px button in the header, so their headers are 58 px (divider at y=141 and y=462) and the title sits at 30 px from the card top; "REAPER tools" and "Tracks" have no button, header 50 px (divider at y=277), title 26 px from the top. The body text then starts at different offsets under the divider (REAPER project filename at +27 px, tools buttons at +18 px, sync text at +27 px).
- Where: `primitives/panelStyles.ts:205-206` (`min-h-[3.125rem] py-[0.6875rem]`; the comment at `panelStyles.ts:200` says the 55 px header holds a 32 px button) with default-size buttons at `engine/EnginePanel.tsx:234` and `engine/ChapterSyncPanel.tsx:67,117` (no `size="sm"`; `--button-height` is 36 px, `--button-height-sm` 32 px).
- Severity: looks wrong
- Fix: pass `size="sm"` to header buttons (header 55 px as the panel spec says) or give every header a fixed 58 px height.
- Evidence: `engine/default/w1440.png` (dividers y=141, 277, 462, 651).
- Shared: Panel header (any card that puts a default-size button in `actions`)

### ENX-8 Chapter sync moves its on/off button between header and body, and the card changes height

- Gut reaction: Why does the Turn on button jump from the header into the body, and the card shrink?
- Page / state: engine / sync-off versus default, sync-activity, sync-background-wait.
- Widths: all; theme: both.
- What is wrong: when sync is on, "TURN OFF" is in the card header (right, y≈433); when off, "TURN ON" is in the body at y≈488 beside the sentence "Chapter sync is off." and the header is 50 px. The card jumps from about 182 px to 120 px and the same control changes place and the card's header/body spacing.
- Where: `engine/ChapterSyncPanel.tsx:62-72` (off: `Panel` without `actions`, button in a body flex row) against `:114-121` (on: `actions`).
- Severity: looks wrong
- Fix: put the toggle in the header in both states and show the "off" sentence as body text.
- Evidence: `engine/sync-off/w1440.png` (card y=404-523) against `engine/default/w1440.png` (card y=404-585).
- Shared: page-local

### ENX-9 REAPER tools: six content-sized buttons wrap 3 + 3 with a ragged right edge and a 4 px gap

- Gut reaction: Why are these buttons different widths, ragged on the right, with a big empty space beside them?
- Page / state: engine / default and every state with tracks.
- Widths: 768, 1024, 1280, 1440, 1920 (the same 3+3 at every width; at 390 it is 2+2+1+1); theme: both.
- What is wrong: the buttons are as wide as their labels (LINK CHAPTERS… 110 px, PREPARE CHAPTER RENDER… 186 px, CREATE CHAPTER REGIONS… 183 px, EMBED CHAPTER TAGS… 159 px, CLEANUP TOOLS… 125 px, RETAKES ON LANES… 143 px), so the two rows have different right edges (x=1272 and 1205 at 1440) and 133-200 px of empty card is left at the right. Gap between buttons is 4 px horizontally and about 6 px vertically while every other button group in the panel (CheckLine, MappingConfirm, dialogs) uses 8 px.
- Where: `engine/EnginePanel.tsx:186` (`Toolbar className="flex-wrap"`) and `primitives/Toolbar.tsx:34` (default `gapClassName = 'gap-1'`).
- Severity: looks wrong
- Fix: a 3-column grid (`grid grid-cols-3 gap-2`, buttons `w-full`), or a 2-column grid below 768, so every button has the same width and edge.
- Evidence: `engine/default/w1440.png` (rows y≈295-329 and 335-369), `.../default/w1024.png`, `.../default/w768.png`, `.../default/w390.png`.
- Shared: Toolbar default gap

### ENX-10 Nested slide-overs: Editing check opens on top of the engine panel and cuts its cards in half

- Gut reaction: Why is a second panel sitting on top of the first, cutting its cards in half?
- Page / state: engine / editing-check-unmapped (any "Editing check…").
- Widths: 768, 1024, 1440, 1920; theme: light (same structure in dark).
- What is wrong: the 320 px Editing check panel opens over the right edge of the 704 px engine panel, so the engine panel stays visible with its Tracks and Chapter links cards cut at x=1121 ("Not linke", "CHAPTER" header cropped) and its close button hidden. Two panels with different header treatments sit side by side (see ENX-11).
- Where: `engine/ChapterLinksTable.tsx:493` (`EditingCheckPanel` rendered inside the Chapter links `Panel`) opening `editing/EditingCheckPanel.tsx:264` (`SlideOver` default size).
- Severity: looks wrong
- Fix: give the second panel the engine panel's width and replace it (back button), or open it as a dialog.
- Evidence: `engine/editing-check-unmapped/w1440.png` (cut at x=1121), `.../w768.png`.
- Shared: SlideOver stacking
- Supersedes: ENG-5 (the overlap part; the segmented control is ENX-12)

### ENX-11 Slide-over headers differ between siblings: 63 px vs 68 px, and the close button is squeezed from 36 px to 27-31 px

- Gut reaction: Why is the close button squashed narrow, and why is this title cut mid-word?
- Page / state: engine / editing-check-unmapped; shell / history-panel-open; production / chapter-track-panel-linked, editing-check-partial.
- Widths: 1440 (also 768); theme: light.
- What is wrong: "Undo history" and "Audio engine" have a one-line title, header divider at y=63, close button 36 px wide (x=1386-1421). "Track: Chapter 1 — Down the Rabbit-Hole" and "Editing check: Chapter 1 — Down the Rabbit-Hole" wrap to two lines in a 320 px panel: divider moves to y=68, the close button shrinks to about 31 px (Track, x=1390-1421) and 27 px (Editing check over the engine panel, x=1394-1421), and the Track title is cut mid-word ("Rabbit-" / "Hole"). Close buttons also sit 2 px lower than the one-line headers.
- Where: `primitives/SlideOver.tsx:69-76` (title `Drawer.Title` has no `min-w-0`/`flex-1`, `IconButton` has no `flex-none`; header is `min-h-[3.75rem] ... py-[0.85rem]`).
- Severity: looks wrong
- Fix: `flex-none` on the close button, `min-w-0 flex-1 break-words` on the title, and a fixed header height with a two-line clamp.
- Evidence: `shell/history-panel-open/w1440.png` (divider y=63, close x=1386-1421), `production/chapter-track-panel-linked/w1440.png` (y=68, x=1390), `engine/editing-check-unmapped/w1440.png` (x=1394).
- Shared: SlideOver (every slide-over)

### ENX-15 Dialog description runs into the next element with no gap

- Gut reaction: Why is this label glued to the paragraph above it?
- Page / state: engine / `render-config-*`, chapter-tags-ready, -not-rendered, -success, `create-regions-*`, link-chapters-preview.
- Widths: all; theme: both.
- What is wrong: the description is followed immediately by the next block: "Output folder" label 6 px under it, "Chapters from your last chapter render" 0 px under it (y=374 under text ending y=340), Create-regions selects 10 px under it, Link-chapters table header 4 px under it.
- Where: `primitives/Dialog.tsx:178-182` (no bottom margin) and `primitives/Field.tsx:57` (`first:mt-3` only when the Field is the first child); `engine/ChapterTagsDialog.tsx:85` (`<p>` with no `mt`).
- Severity: looks wrong
- Fix: `mb-3` on the description; drop `first:` from the Field margin.
- Evidence: `engine/render-config-prefilled/w1440.png` (y≈410-440), `.../chapter-tags-ready/w1440.png` (y≈334-374), `.../create-regions-preview/w1440.png` (y≈199-250), `.../link-chapters-preview/w1920.png` (text y=201, header y=229).
- Shared: Dialog description + Field
- Supersedes: ENG-4

### ENX-16 Dialogs are centred and auto-height, so the dialog and its close button jump between states

- Gut reaction: Why did the dialog just jump to a different spot when I clicked?
- Page / state: engine / create-regions (preview, empty, error, success), chapter-tags (idle, ready, not-rendered, success, error), render-config (prefilled, no-regions, error, success), retake-lanes (list, picked, none, error).
- Widths: all; theme: both.
- What is wrong: each state is a different height, and the dialog is centred, so the top edge, title and close button move: create regions top at y=107, 127, 111, 91; chapter tags 265, 242, 228, 226; render config 322, 297, 308, 260; retake lanes 153, 139, 321, 129. A narrator who presses "Create 2 regions" sees the whole dialog move under the pointer.
- Where: `primitives/Dialog.tsx:143` (`Parts.Viewport ... items-center`), height from content (`maxHeight: 80dvh`, no min).
- Severity: looks wrong
- Fix: anchor dialogs to the top (`items-start pt-[10vh]`) or give each tool dialog a fixed min-height.
- Evidence: `engine/create-regions-preview/w1440.png`, `.../create-regions-empty/w1440.png`, `.../create-regions-success/w1440.png`; `.../chapter-tags-idle/w1440.png`, `.../chapter-tags-ready/w1440.png`.
- Shared: Dialog (also SHL-2)

### ENX-17 Link chapters: the track select floats mid-table with 400-700 px of empty row on each side

- Gut reaction: Why is the dropdown floating in the middle of a huge empty row, miles from the chapter name?
- Page / state: engine / link-chapters-preview, -conflict, -success, -error.
- Widths: 1440 (select at x=765-880 in a 970 px table), 1920 (x=1018-1133 in a 1300 px table), 768; theme: both.
- What is wrong: the middle column is auto-sized, so the select (115 px) sits half way across with an empty gap between the chapter name and the control, and "ITEMS TO STAMP" (a number or "–") is pushed to the far right edge. At 1920 the eye travels about 700 px from chapter to select. Select height (41 px) makes each row 52 px against the 34 px token row.
- Where: `engine/LinkChaptersDialog.tsx:173-201` (3-column `Table`, no column widths), dialog width `primitives/Dialog.tsx:149` (`max-w-[70vw]`).
- Severity: looks wrong
- Fix: `table-fixed`: Chapter 1fr, track select 14rem, count 6rem right-aligned; or cap the dialog at `max-w-3xl`.
- Evidence: `engine/link-chapters-preview/w1440.png`, `.../link-chapters-preview/w1920.png` (header "REAPER TRACK" x=1018, "ITEMS TO STAMP" x≈1504-1603).
- Shared: Dialog width

### ENX-18 Link chapters stamped-lines table: header and GUIDs wrap while the TEXT column has free width

- Gut reaction: Why are these IDs and headers broken over two lines when the Text column has room?
- Page / state: engine / link-chapters-success (and -conflict, "Currently stamped" block).
- Widths: 1440, 768; theme: both.
- What is wrong: "MANUSCRIPT ENTITY" breaks to two lines (y=476 and 495) and each ITEM GUID breaks over two lines ("{7A6B5C4D-3E2F-4190-8A1B- / 2C3D4E5F6071}") although the TEXT column has 100+ px unused, so every row is 53 px and the header is 40 px tall (against the 31 px token). Status ("Manuscript re-imported since stamping") wraps to two lines.
- Where: `engine/LinkChaptersDialog.tsx:88-103` and `:56-65` (`LineStatusRow`, default `TableCell`, no `whitespace-nowrap`, no widths, GUID not in the mono font).
- Severity: looks wrong
- Fix: fixed widths and `whitespace-nowrap` for ITEM and ENTITY; shorten the header to "Entity"; show the GUID in the mono font with `text-xs`.
- Evidence: `engine/link-chapters-success/w1440.png` (header y≈476-495, rows y≈507-720), `.../link-chapters-success/w768.png`.
- Shared: page-local

### ENX-19 Create regions: column positions change when the credits tracks change, and the unlabeled selects look identical

- Gut reaction: Why did the columns shift, and which of these two identical dropdowns is which credits track?
- Page / state: engine / create-regions-preview vs create-regions-empty.
- Widths: 1440, 768; theme: both.
- What is wrong: REGION | TRACK | START | END | STATUS shift with content: TRACK starts at x=528 in the preview and x=458 in the empty state, START right edge at 838 vs 802, END at 979 vs 957, STATUS at 999 vs 977. The two selects above the table are full-width (479 px each) with no visible label, both showing "None" (or "Chapter 2"), so the narrator cannot tell which is the opening and which is the closing credits track. The "Not planned" list repeats the same sentence 11 times.
- Where: `engine/CreateChapterRegionsDialog.tsx:95-98` (`Select ... fullWidth`, labels are aria-only), `:114-142` (auto-width table), `:144-155`.
- Severity: looks wrong
- Fix: visible labels ("Opening credits track", "Closing credits track") over each select; fixed column widths; group "Not planned" into one line ("11 chapters have no linked track").
- Evidence: `engine/create-regions-preview/w1440.png` (TRACK x=528), `.../create-regions-empty/w1440.png` (TRACK x=458), selects at y≈230-270.
- Shared: page-local

### ENX-20 Mixed control heights: 41 px selects beside 36 px buttons, 32 px "Check again", a 22 px Experimental badge

- Gut reaction: Why are the dropdown and the button next to it different heights?
- Page / state: engine / chapter-link-confirmed (select over Confirm), `create-regions-*` (selects above the 36 px footer buttons, badge beside the primary), wrong-project (Check again), `link-chapters-*`.
- Widths: all; theme: both.
- What is wrong: `Select` is 40.8 px tall, `Button` 36 px, `Button size="sm"` 32 px, so a select and a button in one cell or one row never share a top, bottom or centre line. In the create-regions footer the "Experimental" badge (about 22 px) sits 2 px lower than the primary button's text centre.
- Where: `primitives/Select.tsx` (`h-[var(--control-height)]`), `layout/CheckLine.tsx:36` (`size="sm"`), `engine/CreateChapterRegionsDialog.tsx:87-91` (CapabilityGate badge beside the button).
- Severity: looks wrong
- Fix: one control height inside tool UIs (36 px for select and buttons), and badge centred on the button's centre line.
- Evidence: `engine/chapter-link-confirmed/w1440.png` (select y≈197-238, Confirm y≈246-282), `engine/wrong-project/w1440.png` (Check again y≈250-282), `engine/create-regions-preview/w1440.png` (badge y≈747-770).
- Shared: Select / Button height tokens

### ENX-22 Link chapters shows the same error twice

- Gut reaction: Why is the same red error printed twice?
- Page / state: engine / link-chapters-error.
- Widths: all; theme: both.
- What is wrong: "The Narration Utils script in REAPER sent a message this app could not read…" appears at y=622 under the checkbox and again at y=715 under "Currently stamped in REAPER".
- Where: `engine/LinkChaptersDialog.tsx:214-218` and `:83-87` (both print `state.message` when `phase === 'error'`).
- Severity: looks wrong
- Fix: print the error once, in the place that matches the action that failed.
- Evidence: `engine/link-chapters-error/w1440.png` (y≈622 and 715), `dark:engine/link-chapters-error/desktop.png`.
- Shared: page-local

### ENX-25 REAPER project card: long action label, "different" shown when nothing is linked, and a second heading inside the card

- Gut reaction: Why does it say 'different' when nothing is linked, and why is there a heading under the heading?
- Page / state: engine / rpp-picker, no-rpp, no-daw-link, wrong-project.
- Widths: 1440, 768; theme: both.
- What is wrong: the header button reads "LINK A DIFFERENT REAPER PROJECT FILE" (255 px, 35 characters) even in rpp-picker and no-rpp, where no file is linked; its width changes to 190 px in no-daw-link ("Link a REAPER project file"), so the header changes shape. In rpp-picker a second heading, "CHOOSE A REAPER PROJECT FILE", sits directly under the card header with the same button above it. In wrong-project the warning, filename and Check-again row are three loose text blocks (y=212, 232, 266) with no inset card and a 32 px button.
- Where: `engine/EnginePanel.tsx:231-238` (label chosen only from `link.dawFileLinked`), `:276-298` (`RppPicker` has its own `SectionLabel`), `:248-260`.
- Severity: looks wrong
- Fix: short fixed label "Link file…" (or "Change") in the header, hide it while the picker is shown, and put the warning in an `InsetCard tone="warn"`.
- Evidence: `engine/rpp-picker/w1440.png`, `.../no-rpp/w1440.png`, `.../no-daw-link/w1440.png`, `.../wrong-project/w1440.png`.
- Shared: page-local

### ENX-12 Editing check: the two segments of the source toggle have different widths and both wrap

- Gut reaction: Why are the two halves of this toggle different widths with cramped two-line labels?
- Page / state: engine / editing-check-unmapped (also production/editing-check-partial).
- Widths: 1440, 768; theme: light.
- What is wrong: "ITEMS ON THIS CHAPTER'S TRACK" (172 px) and "THE RENDERED FILE" (112 px) each wrap to two lines inside a 36 px control with a 2 px gap, so the control is lopsided and the label text is tight against the edges.
- Where: `editing/EditingCheckPanel.tsx:269-272` using `primitives/ToggleGroup.tsx:37` (inline-flex, fixed height, content-width segments).
- Severity: polish
- Fix: equal-width segments (`flex-1`) with short labels ("This track" / "Rendered file").
- Evidence: `engine/editing-check-unmapped/w1440.png` (x≈1139-1421, y≈143-178).
- Shared: ToggleGroup (segmented look)
- Supersedes: ENG-5 (the toggle part)

### ENX-13 Panel title is smaller than the card titles under it

- Gut reaction: Why is the panel's own title the smallest text at the top?
- Page / state: engine / all states.
- Widths: all; theme: both.
- What is wrong: the slide-over title "Audio engine" is 14 px semibold sans; the cards below it use 19 px Barlow Condensed titles ("REAPER project", "Tracks"), so the panel's own heading is visually the weakest text in the header zone. The slide-over header is also 60 px against the 52 px top bar next to it (SHL-7).
- Where: `primitives/SlideOver.tsx:70` (`text-sm font-semibold`) against `primitives/panelStyles.ts:213` (card title).
- Severity: polish
- Fix: give the slide-over title the card-title type (or a larger one) and size the header to the top bar.
- Evidence: `engine/default/w1440.png` (title at x=755, y=32; card titles at y=113).
- Shared: SlideOver

### ENX-14 Dialog footer buttons sit 1.6 px outside the content edge

- Gut reaction: Why do the dialog buttons stick out slightly past the text above them?
- Page / state: engine / every dialog state (link chapters, render config, create regions, chapter tags, cleanup, retake lanes).
- Widths: all; theme: both.
- What is wrong: dialog header title and body text start at x=235 (1440) with a 17.6 px inset; the footer buttons start at x=233 and end at x=1207 against the body's right edge at 1205 (e.g. link chapters: Cancel left edge 233, Stamp right edge 1207, "Read current stamps" right edge 1205).
- Where: `primitives/Dialog.tsx:195` (`px-4`) against `:163` and `:176` (`px-[1.1rem]` / `p-[1.1rem]`).
- Severity: polish
- Fix: use `px-[1.1rem]` for the action row.
- Evidence: `engine/link-chapters-conflict/w1440.png` (footer y≈773, edges 233/1207 against 235/1205).
- Shared: Dialog

### ENX-21 Section headings inside the dialogs use five different styles

- Gut reaction: Why does every dialog title its sections differently?
- Page / state: engine / `link-chapters-*`, `create-regions-*`, `chapter-tags-*`, `cleanup-tools-*`, `retake-lanes-*`.
- Widths: all; theme: both.
- What is wrong: "Currently stamped in REAPER" is a 16 px semibold h3, "Not planned" a 14 px muted semibold line, "Chapters from your last chapter render" a 14 px semibold paragraph, "Combined book MP3 to add chapters to" a 14 px muted medium field label, "Chapter 1 · line-000012 · 0:42" a 14 px semibold h3, "Repair Pops/Clicks" a 14 px semibold paragraph. Dividers are also different: the link dialog and chapter tags use a top border plus `pt-3`, cleanup tools uses row borders, create regions and retake lanes use none.
- Where: `engine/LinkChaptersDialog.tsx:71-73`, `engine/CreateChapterRegionsDialog.tsx:146`, `engine/ChapterTagsDialog.tsx:85,106`, `engine/CleanupToolsDialog.tsx:64-68`, `engine/RetakeLanesDialog.tsx:150`.
- Severity: polish
- Fix: one `SectionLabel`-style heading inside dialogs and one divider rule.
- Evidence: `engine/link-chapters-conflict/w1440.png` (y≈679), `.../chapter-tags-ready/w1440.png` (y≈374 and 481), `.../create-regions-preview/w1440.png` (y≈418).
- Shared: Dialog content

### ENX-23 Dialog tables lose their column headers when the body scrolls

- Gut reaction: Why did the column headings disappear when I scrolled?
- Page / state: engine / link-chapters-conflict, link-chapters-success (any dialog with a long table).
- Widths: 1440, 768; theme: both.
- What is wrong: the dialog body scrolls under the fixed title bar, and the table head scrolls away with it. In the screenshots the rows at the top of the view (Chapter 5-12, then the stamped table) are shown with no header, and at 768 the stamped table header is already scrolled out.
- Where: `primitives/Dialog.tsx:173-177` (body `overflow-y-auto`); `engine/LinkChaptersDialog.tsx:90,174` (`TableHead` without `sticky`, which `primitives/Table.tsx:34` supports).
- Severity: polish
- Fix: `<TableHead sticky>` in the dialog tables.
- Evidence: `engine/link-chapters-success/w1440.png` (rows from y=170, header off-screen), `.../link-chapters-success/w768.png`.
- Shared: Dialog + Table

### ENX-24 Tracks card: the last row's rule doubles the card border and the square table corners poke out of the rounded card

- Gut reaction: Why does the bottom of this card look doubled and square-cornered?
- Page / state: engine / default, sync-activity, chapter-link-confirmed (above).
- Widths: all; theme: both.
- What is wrong: the Tracks table is `flush`, its last row keeps `border-b`, and the card has its own border, so the card bottom reads as a heavier/double line (y≈804-806 at 1440); the table's square corners are not clipped to the card radius.
- Where: `engine/EnginePanel.tsx:304-345` (`Panel flush` + `Table`), `primitives/tableStyles.ts:238` (`border-b` on every cell), `primitives/panelStyles.ts:203` (no `overflow-hidden`).
- Severity: polish
- Fix: `overflow-hidden` on a flush panel and `last:border-b-0` on the last row's cells.
- Evidence: `engine/default/w1440.png` (y≈800-808), `.../default/w1024.png`.
- Shared: Panel flush + Table

### ENX-26 The same chapter-to-track fact is shown three times in the panel

- Gut reaction: Why am I being shown the same chapter links three times, with the controls far down the panel?
- Page / state: engine / default.
- Widths: all; theme: both.
- What is wrong: Chapter sync says "1 chapter linked by you", the Tracks table has a Chapter column ("Chapter 1 / Not linked / Not linked") and the Chapter links table repeats it per chapter with the controls. The panel is a vertical stack of six cards (REAPER project, tools, sync, Tracks, Chapter links, and a loose note between them) where the chapter links alone are about 1,100 px tall, so the controls the narrator needs are below the fold.
- Where: `engine/EnginePanel.tsx:166-214` (order of the cards), `:304-345` (`TrackList` Chapter column), `engine/ChapterLinksTable.tsx:431`.
- Severity: polish
- Fix: see the Reorganisation suggestion (one table, one place).
- Evidence: `engine/default/w1440.png`, `engine/chapter-link-confirmed/w1440.png`.
- Shared: page-local

### ENX-27 Retake lanes: the playing lane still offers "Play this lane", and the Plays/Silent column has no fixed edge

- Gut reaction: Why can I press 'Play this lane' on the lane that is already playing?
- Page / state: engine / retake-lanes-list, retake-lanes-picked.
- Widths: 1440, 1024; theme: both.
- What is wrong: the lane that already plays shows an enabled "PLAY THIS LANE" button like the silent ones, and "Plays" / "Silent" are plain text in a content-sized slot (left edges at x=1044 / 1041 at 1440), so the column wobbles by 3 px. The state is shown by text only, no row emphasis.
- Where: `engine/RetakeLanesDialog.tsx:43-54` (`span` with no width, `Button` not disabled when `plays`).
- Severity: polish
- Fix: fixed-width status cell, highlight the playing row, disable or label the button "Playing".
- Evidence: `engine/retake-lanes-list/w1440.png` (rows y≈335-598), `.../retake-lanes-picked/w1440.png`.
- Shared: page-local

### ENX-28 After success the dialog's primary button stays full strength and unchanged

- Gut reaction: Why does the main button still look active after the job is done?
- Page / state: engine / render-config-success, create-regions-success, chapter-tags-success.
- Widths: all; theme: both.
- What is wrong: after "Render configured…", "Sent 2: 2 created…" or "Wrote …" the primary button ("CONFIGURE RENDER", "CREATE 2 REGIONS", "EMBED CHAPTER TAGS") remains in full accent colour, as if the dialog still had work to do, while Close is the real next action; the idle state of the same dialogs (chapter-tags-idle) shows the faded disabled look, so the two states read the wrong way round.
- Where: `engine/RenderConfigDialog.tsx:52`, `engine/CreateChapterRegionsDialog.tsx:88`, `engine/ChapterTagsDialog.tsx:67` (no state change of the primary action after success).
- Severity: polish
- Fix: disable or hide the primary action after success and make Close primary.
- Evidence: `engine/render-config-success/w1440.png` (button y≈587-623), `.../chapter-tags-success/w1440.png`, `.../create-regions-success/w1440.png`.
- Shared: page-local
