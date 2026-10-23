# Story Bible: alignment findings

Part of the [alignment audit](../../alignment-audit.md). Findings are grouped by the round that produced them; a later round's finding that replaces an earlier one says `Supersedes`. Evidence paths are `<page>/<state>/<width>.png` of the light capture, `dark:<page>/<state>/<viewport>.png` for dark, `tall:<page>-w<width>.png` for the below-the-fold captures; the images are not committed (regenerate the repo-viewport ones with `pnpm --dir apps/ui visual:page <page>`).

## Round 4: gap fill

### R4SB-1 Rescan: a lone refresh icon stacked 7-9 px over the first name row's trailing button (owner example), in name-clash, review-filter, voice-samples-empty and every state with a names list

- Gut reaction: two square icon buttons piled in a column at the far right with nothing saying they belong together; the refresh looks like it belongs to the row below, and the sentence it sits beside ("Names the app links...") is plain grey text.
- Page / state: name-clash, review-filter, voice-samples-empty (also search-narrowed, entry-needs-review etc.). Extends SBX-1 with per-state measurements.
- Widths: all six (theme: both).
- Measured: w1440 review-filter / voice-samples-empty: Rescan x801-836, y143-180; first row's play button x802-836, y188-222 (gap 8, same left edge). name-clash (row has play AND record): Rescan x801-836 over the record disc x802-836 (gap about 10), so the stack is over the record button, not the play square. w1024: Rescan y147-178 / button y183-213 (gap 7 read). w768: Rescan x699-735 y594-629 (review-filter) or y622-657 (voice-samples-empty); button y637-672 / y665-701 (gap 8). w390: Rescan x321-357 y316-352 beside a caption that wraps to two lines ("...how I say / each"), button x321-357 y361-397 (gap 9). The caption row is 36 px tall only because of the icon.
- Where: `apps/ui/src/components/storybible/GuideDetail.tsx:745-760` (caption `flex items-center justify-between` with the IconButton, then `ul.space-y-3` rows whose last control is also a 36 px square, `:777` `flex items-start gap-2`).
- Severity: looks wrong
- Fix: move Rescan into the entry header toolbar (it is an entry-level action) or to a text button "Rescan" in the Appears-in section it refreshes; if it stays, give it a different shape (ghost text button) and 16+ px of air from the row.
- Evidence: `crops/r4sb/rfz.png`, `nc1440z.png`, `vs768`, `storybible/name-clash/w768.png`
- Shared: page-local

### R4SB-2 Relationship picker: a floating list with no scrim and no title, parked over whatever is nearest, detached from its trigger at 768 and 390

- Gut reaction: a white box has dropped onto the page and is hiding other buttons; I cannot tell which row I am picking for.
- Page / state: relationship-picker.
- Widths: 1280 and 1024 (box over Reference clips: "REVOKE" shows as "EVOKE", the "Approve as reference" label is cut to "APPROVE AS REFERENC", the region select and the Unknown select are covered); 1440 (box x1005-1340, y140-595, bottom edge 30 px above the first To button, covers the Dialogue cues area); 1920 (x1248-1565, narrower than its own trigger x1245-1710); 768 (x393-728, y573-1015 sits on top of the detail header, hiding the Search/Save/Close buttons, the trigger is not in view); 390 (x8-343, y395-835 drawn over the Entries list, left gutter 8 vs the page's 16, trigger far below the fold). Dark d1440: popover background is the page colour, 1px border, no visible shadow, so it merges with the form beneath.
- What is wrong: no scrim, no label ("Choose an entry" exists only as an accessible name), no indication of the relationship being edited, no close control, an upward-opening position that overlaps other form controls, and a width unrelated to the trigger. March Hare's second line reads "Needs Review" (a status in the kind slot, title-cased) where every other row says Character or Place (extends SBX-21; the list shows "Type not set").
- Where: popover primitive used by `apps/ui/src/components/storybible/Relationships.tsx` (picker); selected row is a grey bar inset 16 px from the popover edge while option text is inset a further 40 px by the check-mark column.
- Severity: looks wrong
- Fix: dim the page like confirm dialogs, anchor to the trigger with trigger width, add a heading "Related entry for <relationship>", show the real kind (or no second line) for drafts.
- Evidence: `crops/r4sb/rp1440.png`, `rpz.png`, `rp768.png`, `rp390.png`, `rp1024.png`, `rpd.png`
- Shared: popover/combobox primitive (same cause as R3SB2-8 for the drawer scrim)

### R4SB-3 Name clash: the Add-a-name field has no visible label, spans the whole panel, and its only company is a loud rust Merge button

- Gut reaction: a bare text box with "White Rabbit" typed in it floats under the names; nothing says it is where you add a name, and the rust button is the strongest thing on the page for an action I did not ask for.
- Page / state: name-clash (edit mode), w1920-w768; w390 not visible (driver).
- Measured: w1440 field x585-1255 (the full panel), y~262-298, blue focus ring; the Names grid above ends at x836, the label "Look up elsewhere" is indented to x590 against the name column at x582; helper text `"White Rabbit" is already a name of White Rabbit.` 12px grey then MERGE INTO THIS ENTRY (rust fill, x860-1040, y~318-350) on the same line. The sentence names the same thing twice and does not say it is ANOTHER entry; there is no Add button, so Enter is the only way to add. Placeholder "Add a name" is replaced by the typed text, so once filled the field is unnamed.
- Where: `apps/ui/src/components/storybible/GuideDetail.tsx:848-870` (`TextField label="Add a name"` renders `aria-label` only, `primitives/TextField.tsx:45`; helper `<span role="status">`; merge button `mergeButton(...)`).
- Severity: looks wrong
- Fix: visible label "Add a name" with an inline Add button; clash text "Already a name of the entry White Rabbit" with Merge as a secondary button; align the field to the same left edge as the names above.
- Evidence: `crops/r4sb/nc1440z.png`, `ncd.png`, `nc768.png`
- Shared: page-local (TextField hidden-label pattern is shared)

### R4SB-4 Dialog footers use three layouts and the destructive action is the lighter button

- Gut reaction: every dialog puts its buttons somewhere else, and in the delete ones "Cancel" looks stronger than the thing that deletes.
- Page / state: remove-voice-data-confirm, remove-voice-samples-confirm, voice-sample-delete-confirm (Cancel pinned left x233, action pinned right: "REMOVE VOICE DATA" x1070-1207, "DELETE" x1140-1207 at w1440); voice-sample-move and voice-sample-rename (Cancel and primary both right: Cancel x1113-1180, Move x1197-1257); voice-download-progress (a lone Cancel at right, x1140-1207). Extends R3SB1-14 (delete confirm) to the remove confirms.
- Widths: all (theme: both).
- What is wrong: `Dialog` defaults to `justify-between`, the move and rename dialogs opt into `end`, so Cancel sits on opposite sides in sibling dialogs. In the confirms Cancel is a 1.5px dark-outlined button, the destructive button a thin red outline on cream with no fill (reads as secondary). In dark the dialog fill is almost the scrimmed page colour (1px border only), extending R3SB1-13.
- Where: `apps/ui/src/components/primitives/Dialog.tsx:86,195`; `voicesamples/MoveVoiceSampleDialog.tsx:61`; `voicesamples/EditVoiceSampleDialog.tsx:51`; confirm bodies in `useVoiceSampleActions.tsx:128`.
- Severity: looks wrong
- Fix: one footer rule (secondary left, action right, or both right everywhere), filled danger button for irreversible actions, Cancel ghost.
- Evidence: `crops/r4sb/rd1440.png`, `rs1440.png`, `sd1440.png`, `sm1440.png`, `sr1440.png`, `rdd.png`
- Shared: `Dialog` primitive

### R4SB-5 Confirm dialogs cover the thing they confirm, or it is below the fold

- Gut reaction: I am asked to delete a sample I cannot see.
- Page / state: remove-voice-samples-confirm and remove-voice-data-confirm at w1440/w768: the centred dialog (x218-1203 at 1440, x116-652 at 768) sits on the 320px drawer and hides its middle: the Reference clips heading and controls, the sample card meta, and at w768 half of the faded REMOVE VOICE SAMPLES button. voice-sample-delete-confirm: w1440 the sample row is visible but dimmed below the dialog; w768 the detail is scrolled to Properties/Personality notes so the sample (Voice samples section) is off screen; w390 only the list shows.
- Where: `Dialog.tsx:143` centred viewport; no scroll-into-view of the subject.
- Severity: looks wrong
- Fix: quote the subject inside the dialog (name, duration, chapter) and show the count being removed ("1 sample, 0.1 MiB"); keep the subject in view.
- Evidence: `crops/r4sb/rdz.png`, `rs768.png`, `sd768.png`
- Shared: Dialog primitive / confirm pattern

### R4SB-6 Entries list scroll cuts the first visible row in half under the chip block

- Gut reaction: a row is sliced through at the top of the list and I only see a sentence fragment.
- Page / state: voice-samples-empty (list scrolled to the selected White Rabbit), also review of w1024/w768.
- Measured: w1440 the first visible row is Caterpillar with only its meta line "Character . 1 name . 2 chapters" under the divider (y~420), title gone; w1280 Hatter clean; w1024 Hatter's title cut, meta at y371 (read) hard under the chip block; w768 the top row is a stub: only descender pieces at y300-310 over "Character . 2 names . 2 chapters". The window at w768 is only 2.5 rows. The list has no fade or inset so rows end at the 1px rule.
- Where: `apps/ui/src/components/storybible/Guide.tsx:450-460` (list scroller `overflow-y-auto` directly under the chip block, no top padding or mask).
- Severity: looks wrong
- Fix: scroll with `scroll-padding-top`, snap rows, or fade the edges.
- Evidence: `crops/r4sb/vsl.png`, `vs1024.png`, `vs768.png`
- Shared: page-local

### R4SB-7 no-manuscript: a centred mini-card that stops 240 px down, a centred title unlike every other state, and lock glyphs that disappear in the icon rail

- Gut reaction: the page is a small box at the top and then 580 px of nothing; the title is centred here but left-aligned everywhere else.
- Page / state: no-manuscript, all widths (d1440 same).
- Measured: w1440 card x232-1422, y68-310 (content centred: title y148, sentence y186, rust IMPORT MANUSCRIPT x757-899 y207-246), grey page below. The rail shows a lock on every item except Production, including the selected Story Bible row (selected AND locked); at w1024 the icon rail shows no locks at all. w390 the sentence wraps to two lines.
- Where: Story Bible empty branch in `Guide.tsx` (empty panel), rail items in `apps/ui/src/components/layout` nav.
- Severity: looks wrong (card), polish (lock/active, rail difference)
- Fix: use the page header and a left-aligned empty state sized to the card; do not lock the current page; show the lock in the icon rail too.
- Evidence: `crops/r4sb/nm1440.png`, `nmr.png`, `nm1024.png`
- Shared: empty-state pattern across the locked pages

### R4SB-11 Header pills drop to a second line at 1024, and at 390 the status dot sits alone above the title

- Gut reaction: the header at 1024 is two lines for no reason and at 390 the dot floats by itself.
- Page / state: review-filter, voice-samples-empty (entries with Mark reviewed). Extends SBX-6/SBX-7.
- Measured: w1024 title y85 and pills y111 (Character 380-440, Needs review 447-519) while x520-650 is free on the title line; header 56 px taller than the Alice header at w1024 (search-narrowed: title and pill on one row). w390: green dot alone at y68, title wraps to "White / Rabbit" (two 30 px lines), pills are 10 px strips, Mark reviewed x109-225 beside them (it does NOT overlap the pills here).
- Where: `GuideDetail.tsx:147,624,643` (see SBX-7).
- Severity: looks wrong (390), polish (1024)
- Fix: SBX-7 fix; keep dot and title in one nowrap group.
- Evidence: `crops/r4sb/rf1024.png`, `rf390.png`
- Shared: page-local

### R4SB-8 Download progress: the status sentence is repeated as the only log line in a 144 px box, and the dialog is the one without a close X

- Gut reaction: the same sentence twice, then a big empty grey box.
- Page / state: voice-download-progress (extends R3SB2-15, which covers the failed state).
- Measured: w1440 status line y~342 "Downloading and verifying the approved voice... 44 of 109 MB"; LIVE ACTIVITY log x232-1190, y~420-562 holds one row with the identical text and its own bottom rule, 80% empty; elapsed "2s" is 11 px grey at x1180, far right of a 944 px line; header has no X while every other dialog has one. w390: status wraps to two lines and "6s" sits 3 px above the first baseline (y303 vs 306); log row wraps too. Bar 40% matches 44/109.
- Where: `apps/ui/src/components/primitives/WorkDialog.tsx:44-95`.
- Severity: polish (looks wrong at 390)
- Fix: hide the log until it has more than the status; put elapsed under the bar left; size the log to content (max h-36).
- Evidence: `crops/r4sb/dpz.png`, `dp390.png`
- Shared: WorkDialog

### R4SB-9 Move dialog: intro sentence glued to the "Move to" label and an unexplained "1 of 20 samples"; control heights differ between Move and Rename

- Gut reaction: the sentence and the label read as one cramped paragraph; "1 of 20 samples" is about whom?
- Page / state: voice-sample-move, voice-sample-rename.
- Measured: w1440 description baseline y~397, label "Move to" y~417 (about 4 px gap, versus 12 px between select and caption); select 41 px (read) full width; the caption is the target's count with no subject; in Rename the Label input is 37 and Note textarea 80, title says "Rename" but the dialog also edits Note.
- Where: `voicesamples/MoveVoiceSampleDialog.tsx:58-92` (`gap-3`/`gap-1` inside body while the description is drawn by Dialog above with no bottom margin), `EditVoiceSampleDialog.tsx:48`.
- Severity: polish
- Fix: 12 px under the description; caption "Narration has 1 of 20 samples"; one control height; title "Edit voice sample".
- Evidence: `crops/r4sb/smz.png`, `sr1440.png`
- Shared: page-local

### R4SB-10 Voice sample "Check again" overhangs the row controls by 14 px

- Gut reaction: the top-right button is out of line with the row's own right-hand buttons.
- Page / state: voice-sample-delete-confirm / voice-sample-move underlay (also voice-data panel with samples).
- Measured: w1440 sample card x585-1407; CHECK AGAIN x1309-1407 flush with the card edge; the card's "..." ends x1393 and REVOKE (Reference clips card) x1394. Play button centre y597, title centre y591, "..." centre y595 (the three centre lines of R3SB2-10, confirmed).
- Where: `voicesamples/VoiceSamplesBody.tsx:111-126` heading row has no inset.
- Severity: polish
- Fix: share one right inset with the cards.
- Evidence: `crops/r4sb/sdz.png`
- Shared: page-local

### R4SB-12 Dark theme: the "Light theme" sun glyph is drawn like a gear, directly above the Settings gear

- Gut reaction: two gears stacked at the bottom of the rail.
- Page / state: every page in dark with the full rail (seen in review-filter d1440).
- Measured: x18, y~516 (sun, 8 spikes around a disc) and y~543 (gear); same size, tone and weight, 27 px apart.
- Where: theme toggle icon in the shell rail.
- Severity: polish
- Fix: use a clearly different sun or label-only affordance.
- Evidence: `crops/r4sb/rail2b.png`
- Shared: shell

## Round 3: coverage gaps and scanner cross-check

### R3SB1-1 Relationships: edit view shows two identical rows where read view shows an incoming arrow, and the arrow shifts one row's text 18 px

- Gut reaction: Why do the two relationships look like the same row copied twice when editing, and why does one row in read view start further right than the other?
- Page / state: entry-pronunciation-missing (edit, March Hare: `takes tea with / HATTER` twice), entry-needs-review and entry-suggestions (read: `takes tea with` then `<- takes tea with`)
- Widths: 1920, 1440, 1280, 1024, 768 (theme: both)
- What is wrong: in read view the second row begins with an incoming arrow, so its text starts at x473 against x455 for the first row (1440), and the arrow is the only sign it is the reverse of the first row. In edit view both rows are identical input plus `HATTER v` picker plus red trash (1440: inputs x455-801, pickers x817-973, trash x1040), so a narrator cannot tell which row is the incoming one, and editing or deleting the incoming row writes the relationship the other way round.
- Where: `sb/Relationships.tsx:229-241` (the `row.incoming` branch adds `<Icon name="incomingRelationship" />` inside the cell only when `!editing`); the edit branch at `Relationships.tsx:231-232` renders `LabelInput` for both.
- Severity: looks wrong
- Fix: reserve a fixed 18 px icon slot in the relationship cell for every row (blank for outgoing) and keep the incoming arrow in edit view too.
- Evidence: `storybible/entry-pronunciation-missing/w1440.png` (y555-625), `.../entry-needs-review/w1440.png` (y397-457, x455 vs x473), `.../entry-suggestions/w1440.png` (y542-590).
- Shared: page-local

### R3SB1-2 Kind filter with no match leaves the detail panel on an unrelated entry and nothing selected in the list

- Gut reaction: I clicked Organization, nothing matches, yet the big card still shows Alice, a Character, as if she belonged to it.
- Page / state: category-organization (empty list), category-place (list shows Queen's garden, detail still Alice)
- Widths: 1920, 1440, 1280, 1024, 768, 390 (theme: both)
- What is wrong: the active chip is Organization or Place, but the right-hand card keeps showing Alice with a `Character` pill; in category-place the only list row (Queen's garden) is not highlighted, so no row matches the entry on screen. The empty list says only `No entries match.` in a 13px muted line with no hint to clear the filter; at 768/390 the list card shrinks to one row and the detail card jumps up by about 100 px.
- Where: `sb/Guide.tsx:235` (`selected = rows.find(row => row.id === selectedId)` is not limited to the filtered rows), `sb/Guide.tsx:499-503` (empty row, plain text).
- Severity: looks wrong
- Fix: when the selected entry is filtered out, show the detail panel's empty prompt (or select the first match); give the empty state a "Show all" button.
- Evidence: `storybible/category-organization/w1440.png` (list y318-365 empty, detail Alice), `.../category-place/w1440.png`, `.../category-organization/w768.png` (list card 60-420 then detail), `.../category-place/w390.png`.
- Shared: page-local

### R3SB1-3 At 768 the stacked list is a 3-row window that hides the selected entry

- Gut reaction: I picked Hatter but the list shows Alice, Caterpillar and half of Cheshire Cat; where is the thing I selected?
- Page / state: character-voice-references (selected Hatter), entry-needs-review (March Hare), entry-pronunciation-missing (March Hare), entry-properties-editing and entry-suggestions (list top shown, selected row below the window)
- Widths: 768 (theme: both; d768 same)
- What is wrong: the entries card is cut to a window of about 3 rows (y308-475), the window starts at the top, and the last row is sliced through its meta line (`Cheshire Cat` with no second line, y455-477). The selected row is highlighted only if it happens to be in the top three; in the four states above it is below the window, so the card shows no highlight at all. The same slicing at 1024 and 1280 cuts `March Hare` through its meta line at the Voice data footer (needs-review w1024 y693).
- Where: `sb/Guide.tsx:450` (`guide-list-scroll min-h-0 overflow-y-auto p-2`) inside the stacked layout's fixed list height; the list does not scroll the selected row into view when the page opens.
- Severity: looks wrong
- Fix: scroll the selected row into view on open and on stacked layouts; size the window to whole rows (snap) instead of cutting a row.
- Evidence: `storybible/character-voice-references/w768.png` (y308-477), `.../entry-needs-review/w768.png`, `.../entry-pronunciation-missing/w768.png`, `.../entry-needs-review/w1024.png` (y683-700).
- Shared: page-local (carries round 1 SB-16; the hidden selection is new)

### R3SB1-4 Loose-suggestion panel: one 80 px card in a 620 px card, and the same sentence printed twice

- Gut reaction: Why is the whole right side empty with one small box at the top, and why does the title say the same thing as the box?
- Page / state: loose-suggestion (and verification-filter)
- Widths: 1920, 1440, 1280, 1024, 768, 390 (theme: both)
- What is wrong: the card title is the full suggestion text (`The Mouse (Character): Calls the party to sit down and dry off.`) and the only content, one suggestion card, repeats it (`NEW ENTRY  The Mouse (Character): Calls the party to sit down and dry off.`). Below it the card is blank for about 480 px at 1440 (card y52-675, content ends y197). At 390 the same sentence appears twice stacked.
- Where: `sb/Guide.tsx:519` (`Panel title={summaryOf(...)}`) with `sb/suggested/row/SuggestionRow.tsx:68-91` (renders the same summary as the card body).
- Severity: looks wrong
- Fix: title the panel `New entry suggestion` (or the entry name only) and put the claim in the card once, then show the quote and where it was found as the panel body.
- Evidence: `storybible/loose-suggestion/w1440.png` (title y73, card text y142, empty y200-675), `.../loose-suggestion/w1920.png`, `.../loose-suggestion/w390.png`.
- Shared: page-local (extends SBX-22 header size)

### R3SB1-5 At 390 the pronunciation breaks at the slash: `/` alone on one line, `'ælɪs/` on the next

- Gut reaction: Why is a lone slash sitting above the pronunciation like a typo, with Source and the play square squeezed beside it?
- Page / state: category-organization and category-place (read view, entry Alice); every read view with a pronunciation
- Widths: 390 (theme: both)
- What is wrong: the IPA text is an unbreakable-by-design string with `/` as a break opportunity, and its column is only about 70 px (x170-230), so `/'ælɪs/` wraps after the first slash; the Source pill (x241-313) and play square (x321-357) take the rest and the row grows to two lines, with Rescan stacked above at x321.
- Where: `sb/source/NamePronunciation.tsx:140` (`<span className="flex-1 font-['IBM_Plex_Mono'...]">`, no `whitespace-nowrap`, `min-w-[8rem]` name before it).
- Severity: looks wrong
- Fix: `whitespace-nowrap` on the IPA and wrap the Source pill or the name onto its own line instead.
- Evidence: `storybible/category-organization/w390.png` (y655-700), `.../category-place/w390.png` (y672-715).
- Shared: page-local

### R3SB1-6 At 768 the header Delete trash sits 12 px above Rescan, forming a column of two unrelated squares (red above neutral)

- Gut reaction: Why is a red delete button stacked right on top of the little refresh button at the right edge?
- Page / state: entry-pronunciation-online and any edit state whose header is one line at 768 (alias, entry-editing, entry-saving, entry-properties-editing)
- Widths: 768 (theme: both). At 1024 the header wraps to two lines and the gap grows to 39 px (trash y93-128, Rescan y167-203).
- What is wrong: Delete (x699-735, y559-595) and Rescan (same x, y607-643) share the right edge with only a 12 px gap and the header divider between them; with the record/play column of the names row (x699 again) the right edge becomes three stacked squares of different meaning. Scanner A9 reports it as `same x 699, gap 12 px`.
- Where: `sb/GuideDetail.tsx:701` (Delete in the header actions), `sb/GuideDetail.tsx:745-760` (Rescan right-aligned in the names heading row).
- Severity: looks wrong
- Fix: same as SBX-1: move Rescan out of the right edge column; keep Delete away from the section toolbar.
- Evidence: `storybible/entry-pronunciation-online/w768.png` (x699-735, y559-643), `.../alias-pronunciation-editing/w768.png` (y560-595 and y631-667), `.../entry-editing/w1024.png`.
- Shared: page-local
- Scanner: A9

### R3SB2-1 Series tab: title and tabs sit on the grey page, no card, no toolbar; the card is stretched to the bottom with 80-87% blank

- Gut reaction: switching to Series makes the page header jump and the screen looks half drawn.
- States/widths: series-tab-empty, -load-failed, -loading, -populated; w1920-w768, light and dark (w390 hugs).
- Measured (w1440): title x177,y63; tabs y100; card x177-1087,y129-675 with content ending y224 (empty), y261 (failed), y272 (loading): 74-82% blank. Entries mode puts title at x190,y76 inside its card with three toolbar squares. w768 card y242-1443, 83% blank.
- Where: `apps/ui/src/components/storybible/Guide.tsx:372-380` (Series branch: `flex-none space-y-4` header above `Panel flush ... flex-1`).
- Severity: looks wrong. Supersedes SBX-20 (confirmed with numbers).
- Fix: same card header in both modes; size the Series card to its content.

### R3SB2-2 Series empty form: input and button stacked, input 1158px wide, button disabled with no reason

- Gut reaction: a one-field form that spans the whole page with a lonely ghost button under it.
- w1440: input x190-1075 (885 read), CREATE SERIES ghost x190-275,y200-224 (4px shorter than the input); at w1920 the input is 1637px. In dark the disabled button looks like a normal outlined button.
- Where: `apps/ui/src/components/series/SeriesTab.tsx:128-139` (`flex flex-wrap items-end gap-2`, TextField has no max width).
- Severity: looks wrong. Fix: one row, input max about 24rem, button beside it, helper text when disabled.

### R3SB2-3 Load-failed: card inside a card, headline says "page" about a series, five left edges

- Gut reaction: an error box inside another box with the wrong word in its title.
- w1440: outer x177-1087,y129-675; inner x190-1075,y141-261 (13 read inset); title bar 38 read tall; left edges 177 / 185 / 190 / 203. w1024/w768 the same; 78-83% of the outer card blank.
- Where: `SeriesTab.tsx:121-125` wraps `LoadErrorPanel` (`apps/ui/src/components/layout/LoadError.tsx:30` title "This page could not be loaded") in `p-4` inside the Panel.
- Severity: looks wrong. Supersedes SBX-20 (part). Fix: render the error without the second frame and name the series.

### R3SB2-5 Series populated: three nested boxes with one text style, ragged pills, buttons almost touching, staircase form, 390 row collapse

- Gut reaction: boxes inside boxes inside boxes, and nothing says which is the series, the character or the clip.
- w1440: outer x177-1087 -> group x190-1075 -> clip x200-1065; "Wonderland", "Alice", "Alice ref A" are all 13px medium. Pills per clip row 1/0/2/0 (This book grey, Changed since approval amber); pills end x1054, rows x1065, groups and REMOVE x1075. REMOVE buttons y513-536 and y540-563 (about 5 real px apart). Project folder input full width, BROWSE (81 real) and ADD (48 real) on the next row. w768: the "Hatter ref" meta wraps ("finalized." alone) and the row is 111 vs 88. w390: "Hatter ref (moved)" truncates to "Hatter ..." and the meta wraps into an 8-line column about 70px wide, row about 190px (SB-3 true).
- Where: `SeriesTab.tsx:140-215`.
- Severity: looks wrong. Supersedes SB-3, SBX-20. Fix: one heading size per level, pills in a fixed right column, gap between REMOVE buttons, input + Browse + Add on one row, stack pills under the meta below 480px.

### R3SB2-6 Two filter chips are filled at once ("All" plus a status chip)

- Gut reaction: it looks like two filters are on, and nothing says All is a reset.
- verification-filter and search-narrowed (All filled while a text search runs), all widths, dark cream. Chip count "Needs verification . 6" against 4 rows listed.
- Where: `Guide.tsx:399` (`FilterChip on={activeKind === 'All'}`) and `:413`.
- Severity: looks wrong. Fix: turn All off when a status chip is on; label the count's noun.

### R3SB2-7 Suggestion rows differ from entry rows (confirmed with measurements)

- zoom (w1440): suggestion titles bold about 16px start 6 real px right of the entry title; meta 17 vs 13px; no category swatch; suggestion pills are outlined capsules ending 6 real px left of the entry's filled "Verify . 2" capsule; titles are ellipsised ("The Mouse (Character): Cal...") while the line below has free space; at w768 the same text is shown in full and the third row is cut through its glyphs at the window edge.
- Where: `suggested/panel/LooseSuggestionRows.tsx:26-31` vs `Guide.tsx:482`. Severity: looks wrong. Supersedes SBX-17.

### R3SB2-8 Voice data drawer has no scrim and cuts the page mid-content

- w1440/1024/768: the 320px drawer leaves the list, chips and Voice data button at full strength; text under its edge is cut ("how I say", chip row cut after "Organization", "Find an entry" cut). Dark: separated by a 1px line only.
- Where: `apps/ui/src/components/primitives/SlideOver.tsx:59` (`bg-transparent` backdrop). Severity: looks wrong. Fix: dim the page like the confirm dialogs do.

### R3SB2-9 Drawer controls: five control heights, stacked remove buttons of different widths, rule touching text, Check again moves

- Empty drawer (w1440 read): CHECK AGAIN 31, OPEN EDITING 30, select 41, input 35, APPROVE 36 real; form staircase 160 / 283 / 161 wide; "Voice samples use 0 MiB..." has a 1px rule against its baseline; REMOVE VOICE SAMPLES (faded, 170 wide) over REMOVE VOICE DATA (148). CHECK AGAIN sits hard right on the heading row when empty but on its own row below when samples exist. With samples both remove buttons sit above the orphan-sample block they also delete; the orphan heading wraps and its count drops to a third line.
- Where: `VoiceDataPanel.tsx:106-135`, `voicesamples/VoiceSamplesBody.tsx:111-126`. Severity: looks wrong. Supersedes SB-14, SB-15, SBX-11.

### R3SB2-10 Voice sample row: two layouts, three centre lines, 28px title offset, orphan link

- voice-data-samples zoom: play 35, title, "..." 32 sit on three centre lines (y315 / 299 / 310 zoom); Narration card has the time on its own line, the orphan card has it inline and "Open in Editing" alone on line 2. voice-samples-entry (w1440 zoom): starred row's title starts 28 real px right of the others; the red-bordered missing row is the strongest line on the page; w1024 row 3 drops "Open in Editing" onto its own line; w390 rows use four arrangements. The missing-row text says "press Edit" on a locked entry that has no Edit button.
- Where: `voicesamples/VoiceSampleRow.tsx:85-96`. Severity: looks wrong. Supersedes SB-15, SBX-15.

### R3SB2-11 Search clear button is a bordered box nested in the field with a doubled right border

- search-narrowed zoom (w1440): the X is a 35px bordered square inside the input frame; the input's own right border shows 5 real px beyond it; the 2px focus ring wraps both.
- Where: `apps/ui/src/components/primitives/SearchField.tsx` (clear control). Severity: polish. Fix: borderless icon button inside the frame.

### R3SB2-12 Filtered list does not contain the open entry and nothing is highlighted

- search-narrowed and verification-filter, all widths: the list shows Hatter (or suggestions) while the detail shows Alice, no row selected, no hint it was filtered out.
- Where: `Guide.tsx:460` (selection only drawn for rows in the filtered list). Severity: looks wrong. Fix: keep a "Showing Alice (filtered out)" line or clear the selection.

### R3SB2-13 List card height differs by width and by state next to a full-height detail card

- w1440 verification-filter / search-narrowed: list card stretched to y675 with 120-280 real px of empty card under Voice data; w1920 and w1280: the list card hugs its rows (ends y402/y309 at 1920, y641/y463 at 1280) while the detail card runs to the bottom; w1024 stretched. Same state, different rule per width.
- Where: `Guide.tsx:450` and the card wrapper (`min-h-0 flex-col` without `h-full`). Severity: looks wrong. Supersedes SBX-18. Fix: one rule at every side-by-side width (stretch and pin the footer).

### R3SB2-14 Names row at w390: IPA breaks after its opening slash, caption orphan word

- search-narrowed w390 (true scale): "/" on line 1, "'ælɪs/" on line 2 (x170-225) beside the Source chip (x241-313) and play square (x321-357); caption "Names the app links in the text, and how I say / each" wraps beside Rescan. Severity: polish (390 secondary). Where: `NamePronunciation.tsx:121-146`.

### R3SB2-15 Download failed: success-looking bar, missing Retry, duplicated sentence, blank log

- w1440 (read): title still "Downloading preview voice"; failure text in body colour; bar 40% rust under an error; text says "Press Retry." but the only button is CLOSE; the same sentence repeats as log row 2; log box 144px with 76 real px empty; the "0s" counter hard right of a 944px line. Six heights across widths (386 real at 1440 to 878 at 768).
- Where: `primitives/WorkDialog.tsx:44-95` (`h-36` log, flex-between counter). Severity: looks wrong. Supersedes SB-18.

### R3SB2-16 Download confirm facts list has no value column

- zc9 (2x): values start at x112 / 137 / 159 / 191 / 148 for Voice / Version / Download / Disk needed / Saved to; "Model card . Provenance" is plain text with no link styling; w768 and w390 break the path mid-token.
- Where: the confirm body in `voicesamples/useVoiceSampleActions.tsx` / the download dialog. Severity: polish. Fix: two-column definition list.

### R3SB2-17 Series empty dark: disabled button reads as enabled

- d1440/d1024: CREATE SERIES has legible light caps and outline; light is grey. Severity: polish. Where: `Button.tsx` ghost disabled style in dark.

### R3SB2-18 Small hit areas in the header and entry head (H1)

- REAPER pill 67.5x22, kind pill 66.7x22 and status pill 84.8x22, Dismiss message 17x20, inline "Open in Editing" 95x20. Severity: polish. Fix: 24px minimum or padded hit slop.

### R3SB1-7 Toasts sit on top of the content they refer to, and their dismiss X is a 17x20 hit area

- Gut reaction: The `Your pronunciation is in use.` pill is parked over the end of the Description box (and the Properties remove buttons), and its X is tiny.
- Page / state: alias-pronunciation-editing, entry-names-own-pronunciation (`Your pronunciation is in use.`), entry-locked (`Entry locked.`)
- Widths: 1920 (toast x957-1088,y583-607 touching the Home row's remove X at y567), 1440 (over the bottom-right corner of the Description and Personality boxes), 1280, 1024 (over How they talk box), 768 (over Description), 390 (over Description) (theme: both; the dark theme draws a light toast, the light theme a dark one: may be intended)
- What is wrong: the 28rem-wide toast is fixed bottom-right and covers the right edge of fields (their resize handles and borders) and the Properties action column; the X button is 17x20 (scanner H1 `hit area 17x20.4 < 24`) next to 32 px of text.
- Where: `primitives/Toast.tsx:88` (`fixed right-[calc(1.25rem...)] bottom-[calc(1.25rem...)]`), `primitives/Toast.tsx:72` (`<button aria-label="Dismiss message" className="flex-none">`, no padding or size).
- Severity: polish
- Fix: give the dismiss button a 32 px square hit area; offset the region above the panel's bottom edge or accept it as transient and say so.
- Evidence: `storybible/alias-pronunciation-editing/w1440.png` (x908-1085,y638-672), `.../entry-names-own-pronunciation/w1920.png` (x957-1088,y583-607), `.../entry-locked/w1280.png` (x963-1083,y632-670).
- Shared: yes, Toast primitive
- Scanner: H1

### R3SB1-8 Kind and status pills are 22 px buttons (or disabled buttons) and read like tags, not controls

- Gut reaction: Why does the `Character` label look like a plain tag in read view but turn into a dropdown with a chevron in edit view, and why is it so short?
- Page / state: every entry header (read: pill without chevron, disabled; edit: pill with chevron), `Needs Review` pill on March Hare
- Widths: all (66.7x22 and 84.8x22 at 1440; 1024 and 768 wrap under or beside the name) (theme: both)
- What is wrong: the pill is a Menu trigger 22 px tall (scanner H1 `hit area 66.7x22 < 24`), against 36 px icon buttons on the same header row; in read view it is disabled and indistinguishable from a static label, in edit view the same size gets a chevron. The `REAPER: Linked` header chip is a button at 67.5x22 for the same reason (app shell, same H1).
- Where: `sb/GuideDetail.tsx:622-640` (`Menu triggerClassName={badgeClass('pill')}`, disabled when not editing), shell `primitives/HeaderChip.tsx:21` (`h-[1.375rem]`).
- Severity: polish
- Fix: make the edit-mode trigger a 32 px select-style control; keep the read-view pill a non-interactive span.
- Evidence: `storybible/entity-selected/w1440.png` (x657-724,y92-114), `.../entry-editing/w1440.png` (x709-774), `.../entry-needs-review/w1440.png` (x548-612).
- Shared: yes, `badgeClass('pill')` / HeaderChip
- Scanner: H1

### R3SB1-9 Empty sections print scaffolding with nothing in it: three label-and-dash rows and a NAME/VALUE header over `No properties yet.`

- Gut reaction: Why does the panel spend 150 px on three stacked "How they talk / How they act / What they know" labels with a dash under each, and a table header over a single "No properties yet."?
- Page / state: entity-selected, entry-unlocked, `category-*` (Alice read view: three dashes); entry-needs-review and character-voice-references (Hatter: `No properties yet.` under NAME/VALUE headers); entry-pronunciation-missing (edit: empty table plus a `+` on its own row)
- Widths: all (1440: dashes at y258, 308, 357; empty table y426-491) (theme: both)
- What is wrong: empty fields keep their label and show `—` on a line of their own, three times in a row, with 35 px of rhythm each; an empty Properties table keeps both column headers above a one-cell message. The panel looks long and half-filled, and the real content (Description, Personality) is pushed down.
- Where: `sb/EntryText.tsx` (read branch prints the label and `—`), `sb/PropertiesSection.tsx:37-55` (header row rendered even when `shown.length === 0`).
- Severity: polish
- Fix: in read view collapse empty fields into one muted line (`Nothing written yet for: how they talk, act, know`) and hide the table header when the table is empty.
- Evidence: `storybible/entity-selected/w1440.png` (y238-360), `.../character-voice-references/w1440.png` (y432-505), `.../entry-needs-review/w1440.png` (y250-322).
- Shared: page-local

### R3SB1-10 In edit mode the name looks like heading text: the input has no visible box

- Gut reaction: I pressed Edit and the title still looks like a title; how do I know I can rename it?
- Page / state: entry-editing, alias-pronunciation-editing, entry-properties-editing, entry-saving, entry-names-own-pronunciation
- Widths: all (1440: `Alice` text at x465, no border; the Edit and Save buttons are the only change) (theme: both)
- What is wrong: the name input is drawn with a transparent border and background, so edit mode and read mode show the same heading; the field gets a border only on hover or focus. Every other editable field in the panel (names, Add a name, Description) has a visible box.
- Where: `sb/GuideDetail.tsx:615` (`h-auto! border-transparent! bg-transparent! px-1! ... hover:border-[var(--line-strong)]!`).
- Severity: polish (may be intended as an in-place heading edit)
- Fix: a resting 1 px `--line` border while editing.
- Evidence: `storybible/entry-editing/w1440.png` (x465-498,y76), `.../alias-pronunciation-editing/w1440.png` (`White Rabbit` x465).
- Shared: page-local

### R3SB1-11 Saving state dims three buttons and leaves every field, Source, play and Cancel looking live

- Gut reaction: It is saving, but only the corner buttons go pale; the fields, Cancel and the name buttons all look clickable, and nothing says Saving.
- Page / state: entry-saving
- Widths: 1920, 1440, 1280, 1024, 768, 390 (theme: both)
- What is wrong: Save becomes a pale ring with a spinner, Rescan and Delete go pale; Cancel (an X), the inputs, `SOURCE v`, play, record and `Add a name` keep their normal contrast. There is no text and no change on the pill.
- Where: `sb/GuideDetail.tsx` (`disabled={mutation.isBusy}` on Edit/Save/Delete/Rescan only; text fields use per-key `waiting()`), `sb/GuideDetail.tsx:660-704`.
- Severity: polish
- Fix: dim the whole form region or add an `aria-busy` pale overlay with a `Saving...` caption beside Save.
- Evidence: `storybible/entry-saving/w1440.png` (Save x970-998,y62-90; Delete x1048-1075,y62-90; Rescan x1048-1075,y110-138).
- Shared: page-local

### R3SB1-12 Alias rows are not marked as aliases in read view

- Gut reaction: `Hatter` and `Mad Hatter` look like two equal names; which one is the entry name and which one I added?
- Page / state: character-voice-references (Hatter), any entry with two names
- Widths: all (1440: `Hatter` y152, `Mad Hatter` y189, same style, same Source pill, same play) (theme: both)
- What is wrong: in edit view the alias row has a trash button and the primary does not, but in read view both rows are identical; nothing says which is the canonical name or that the second is an alias.
- Where: `sb/GuideDetail.tsx:769-795` (read rows share one markup; alias distinction is only the trash at line 826).
- Severity: polish
- Fix: label the second row `alias` in muted small text, or show the canonical name bold and aliases regular.
- Evidence: `storybible/character-voice-references/w1440.png` (y143-206), `.../character-voice-references/w1920.png`.
- Shared: page-local

### R3SB1-13 Import dialog: two unlabelled icon buttons at the far right, a pale peach primary, and (dark) a dialog the colour of its scrim

- Gut reaction: What do the clipboard and eye icons do, and why is the main button faded?
- Page / state: import-dialog
- Widths: 1920, 1440, 1280, 1024, 768, 390 (theme: both)
- What is wrong: `Choose a file...` is a labelled button, but the copy-prompt and show-example actions at the right (x859-887 and x893-921, 28 px) are icon-only with no caption beside a 340 px empty row; the primary `ADD TO THE STORY BIBLE` is drawn in a washed peach (disabled) with no hint of what enables it. In dark theme the dialog surface (#1d1a15) is within 5/255 of the dimmed page card behind it (#181611): only the 1 px border separates them.
- Where: `sb/suggested/import/ImportDialog.tsx:270-271` (`IconButton action="copyPrompt"` and `showExample`), `ImportDialog.tsx:232-245`.
- Severity: polish
- Fix: add short text labels (`Copy prompt`, `Show example`) as small secondary buttons; raise the dark dialog surface one step.
- Evidence: `storybible/import-dialog/w1440.png` (y307-335, y430-458), `dark:storybible/import-dialog/desktop.png` (pixel reads at x600,y450 and x20,y300).
- Shared: Dialog primitive (dark surface); page-local (icons)

### R3SB1-14 Delete confirm: Cancel is heavier than the destructive button

- Gut reaction: The eye goes to the black-bordered Cancel, and Delete entry is a thin red outline; both buttons are 36 px outlines.
- Page / state: delete-confirm
- Widths: 1920, 1440, 1280, 1024, 768, 390 (theme: both)
- What is wrong: Cancel has a 1.5 px dark border; `DELETE ENTRY` has a 1 px red border and no fill, so the two actions have the same shape and Cancel carries more weight. Cancel sits at the left edge (x179) and Delete at the right (x922), 740 px apart at 1440, for a one-line sentence in a 770 px dialog (SB-9).
- Where: `primitives/Dialog.tsx` footer actions, confirm built in `sb/GuideDetail.tsx` (`confirmation === 'delete'`).
- Severity: polish (may be intended to avoid a loud red fill)
- Fix: fill the destructive button (danger variant) or make Cancel a ghost button.
- Evidence: `storybible/delete-confirm/w1440.png` (y375-402), `.../delete-confirm/w1024.png`.
- Shared: Dialog primitive

### R3SB1-15 Load-failed state: the page title and card move into a narrow centred column

- Gut reaction: When the data fails to load, the title jumps to the middle of the page in a 550 px box instead of staying where the two cards would be.
- Page / state: invalid-payload
- Widths: 1920, 1440 (title x467, card x467-1187 at 1440 against the normal list card x232), 1280, 1024, 768, 390 (theme: both)
- What is wrong: the error uses a `max-w-3xl mx-auto` column, so the heading and the one-line panel appear at a different x and size from the real page; the panel holds one sentence and Retry and leaves the rest of the viewport empty, and there is no way to leave the page except the left nav.
- Where: `layout/LoadError.tsx:54-60` (`mx-auto max-w-3xl space-y-4 p-6`).
- Severity: polish
- Fix: keep the title at the page gutter and offer the usual exit (`Go to Production`).
- Evidence: `storybible/invalid-payload/w1440.png` (title x467,y107; card y138-290), `dark:storybible/invalid-payload/desktop.png`.
- Shared: yes, `LoadError`

### R3SB2-4 Series loading skeleton matches neither the empty form nor the populated list

- Gut reaction: the placeholder shows two fat slabs and a bar, then the page re-lays out.
- w1440: bar x190-780,y142-157; slabs x190-1075,y166-214 / y224-272, left-to-right gradient; no visible loading text; dark slabs about 1.2:1 on the card.
- Where: `apps/ui/src/components/series/SeriesSkeleton.tsx:4-12`.
- Severity: polish. Fix: mirror the first content (sentence line, input, button) or the group box.

## Round 2: strict review

### SBX-7 Entry header collapses beside its actions at 390 and wraps mid-word at 768 (Mark reviewed button overlaps the pills at 390)

- Gut reaction: Why is the header squashed into a mess, with pills as thin vertical strips and a button drawn over them, and the name field gone?
- Supersedes: SB-1
- Page / state: any entry showing Mark reviewed: alias-pronunciation-editing, review-filter, entry-needs-review, entry-pronunciation-missing, entry-suggestions
- Widths: 390 (Name input about 8px, "Character" and "Needs review" pills one letter per line, about 10px wide and 120px tall, and the Mark reviewed button x=52-168 is drawn on top of them), 768 ("Charact/er" and "Needs/review" wrapped inside the pills, x=253-413) (theme: both)
- What is wrong: the left group gets only what the action group leaves and the pills have no minimum, so at 390 the header is unusable (the entry cannot be renamed) and at 768 the pills wrap.
- Where: `sb/GuideDetail.tsx:147` (left group `min-w-0 flex-1`, basis 0, so `PANEL_HEADER_CLASS` `flex-wrap` never drops the actions to a new row); pills `sb/GuideDetail.tsx:624` (`badgeClass('pill')`) and the `StatusBadge` at line 643 have no `shrink-0 whitespace-nowrap`; Name wrapper `GuideDetail.tsx:605` shrinks to the leftover.
- Severity: breaks use
- Fix: give the left group a real basis (`basis-[14rem]`) so actions wrap under it; `shrink-0 whitespace-nowrap` on pills.
- Evidence: `storybible/alias-pronunciation-editing/w390.png` (y60-260), `.../alias-pronunciation-editing/w768.png` (y571-600), `.../alias-pronunciation-editing/w1024.png` (wraps correctly at 1024).
- Shared: yes, `primitives/Panel.tsx:97` PanelHeader (also proof CompareRun, see GLB-2)

### SBX-1 Names section: the Rescan button sits alone in the heading row and the row's own buttons stack under it, so the right edge is a column of squares

- Gut reaction: Why is a lone refresh button floating at the top right, with another square button (play/record) right under it, like a little column of unrelated buttons?
- Supersedes: new (owner's example). Related to SB-4.
- Page / state: every entry that has a names list (entity-selected, entry-locked, entry-needs-review, entry-editing, alias-pronunciation-editing, entry-pronunciation-missing/online, entry-names-own-pronunciation, character-voice-references, review-filter, `voice-*`)
- Widths: all; 1920, 1440, 1280, 1024, 768 (theme: both)
- What is wrong: "Names the app links in the text, and how I say each" gets a 36px Rescan icon button at the far right of its own 36px-tall row, and directly beneath it (x=1371-1407 at 1440) the first name row's Play button (read view) or Record button (edit view) is in the same right-edge column, so two unrelated square buttons are double-stacked: refresh at about x1389,y161 and play/record at y204 (mock capture `storybible/entry-pronunciation-missing/w1440.png`). Rescan acts on the whole entry, the buttons below act on one name, and nothing in the layout says so. In read view only the play button is at the edge while the Source chip floats left of it, so the column reads refresh / play with a chip beside the second one only.
- Where: `sb/GuideDetail.tsx:745-760` (section label row `mb-1.5 flex items-center justify-between`, Rescan IconButton md at the right end) directly above `sb/GuideDetail.tsx:761-769` (`ul` of `li flex items-start gap-2` whose trailing buttons end at the same right edge). The 36px button makes the label row 36px tall, so the label text (y=161) is vertically centred on the button, not on a heading baseline.
- Severity: looks wrong
- Fix: take Rescan out of the right edge of the names grid: put it in the section header toolbar as a labelled secondary button ("Rescan names", size sm, right-aligned in the heading row only) or in the card header; keep the per-name action column free of anything else.
- Evidence: `storybible/entry-pronunciation-missing/w1440.png` (refresh x1370-1407,y144-180; record x1371-1407,y186-222), `.../entity-selected/w1440.png` (refresh y144-180, play y186-222), `.../entry-locked/w1440.png` (y188-224 and y230-266, same stack), `dark:storybible/entry-pronunciation-missing/desktop.png`.
- Shared: page-local

### SBX-2 Source chip and IPA are detached from each other and from the name they describe (up to 1000px apart)

- Gut reaction: Why is the 'Source' chip way over on the right, nowhere near the pronunciation it describes?
- Supersedes: SB-5 (part)
- Page / state: entity-selected, entry-locked, entry-needs-review, review-filter, character-voice-references, `voice-samples-*` (any read view with a pronunciation)
- Widths: 1920 (name x=585, IPA x=722, chip x=1771-1843, play x=1851-1887), 1440 (IPA x=722, chip x=1291-1362, play x=1371-1407), 1024 (IPA x=570, chip x=875-947), 768 (chip x=619-691) (theme: both)
- What is wrong: the read-view IPA text is a `flex-1` span, so it stretches to the right edge and pushes the Source chip next to the play button; the chip is a different row element than the text it labels, and the gap grows with the window (about 570px at 1440, 1050px at 1920).
- Where: `sb/source/NamePronunciation.tsx:121-146` (row `flex flex-wrap items-center gap-2`; read branch `<span className="flex-1 font-[IBM_Plex_Mono...]">` at line ~140 takes all free width; `PronSourceTag` is after it at line ~143). In edit mode the same `flex-1` is the TextField wrapper (line 124), which is correct there because the input should fill.
- Severity: looks wrong
- Fix: in read view do not grow the IPA span (`flex-none`), so name, IPA and chip read as one line; give the whole row a fixed template instead: `[name 10rem][ipa minmax(0,1fr)][chip auto][actions auto]` where the chip sits right after the IPA (see Layout suggestion).
- Evidence: `storybible/entity-selected/w1920.png` (chip at x1771, y198), `.../entity-selected/w1440.png` (y186-210), `.../entity-selected/w1024.png`, `.../entity-selected/w768.png` (chip x619-691).
- Shared: page-local

### SBX-3 Name rows: text sits 6px above the centre of the 36px button beside it (read view); in a flagged row the badge under the name makes it taller than its neighbours

- Gut reaction: Why do the name and pronunciation text sit higher than the button beside them, and why does the row with a 'Needs review' badge look taller and messier than its neighbours?
- Supersedes: SB-4
- Page / state: all read views; review-filter / entry-suggestions (flagged alias row)
- Widths: all (1440: name, IPA and chip centred at y=198, play button y=186-222 so centre 204; Hatter second row text 246, button centre 252; review-filter "Rabbit" row text y=246, "Needs review" badge y=276, buttons y=234-270) (theme: both)
- What is wrong: name, IPA and chip are top aligned inside a row whose height is set by the 36px buttons, so the text looks 6px high; in a flagged row the extra badge stacks under the name inside the left column, the row grows to 62px and the controls on the right no longer sit on the text line they belong to.
- Where: `sb/GuideDetail.tsx:769` (`li flex items-start gap-2`), left column `sb/GuideDetail.tsx:770` (`min-w-0 flex-1 space-y-1`) holding NamePronunciation + the flagged `StatusBadge` at line ~782 + note; the read row in `NamePronunciation.tsx:121` has no min-height (the edit input is 36px so edit mode hides it).
- Severity: looks wrong
- Fix: `min-h-9` + `items-center` on the read text row, keep the buttons `self-start` against the first line, and put the "Needs review" badge inline after the chip (or into the chip slot) so the row stays one line.
- Evidence: `storybible/entity-selected/w1440.png` (y186-222), `.../entry-locked/w1440.png` (y230-266), `.../review-filter/w1440.png` (y234-290, badge at x585-668,y276).
- Shared: page-local

### SBX-4 Name rows do not share columns: each row has a different number of trailing buttons, so inputs, Source buttons, play and record buttons all land at different x; one row wraps its Source button

- Gut reaction: Why don't the rows line up with each other? Each name's input ends in a different place, the buttons shuffle left and right, and on a narrower window one row's Source button drops to the next line while its play button stays up.
- Supersedes: SB-5
- Page / state: alias-pronunciation-editing, entry-editing, `entry-pronunciation-*`, review-filter, `voice-samples-*` (any entry with two or more names)
- Widths: 1440 edit (row 1 input x=721-1197, Source x=1205-1319, play 1327-1363, record 1371-1407; row 2 input x=721-1109, Source x=1117-1275, play 1283-1319, record 1327-1363, trash 1371-1407), 1280 (same, input 569-1037 vs 569-949), 1024 (row 1 inline; row 2 "ENTERED BY ME" drops under the input at x=433-591,y=342-372 while its play/record/trash stay on line 1), 768 (inline, play x=655 vs 613), 390 (name above input, Source on third line) (theme: both)
- What is wrong: the right-aligned button group is 2 buttons wide in the first row, 3 in an alias row (trash) and 3-4 in a flagged one, and the Source button is 114px or 158px wide depending on its label ("SOURCE" vs "ENTERED BY ME"), so input right edges, Source buttons and play buttons zig-zag from row to row; at 1024 the same row has its controls on two different lines.
- Where: `sb/GuideDetail.tsx:769-840` (each `li` is `flex items-start gap-2` with 2-4 trailing IconButtons: play 794, record 811, mark reviewed 817, remove alias 826) around `sb/source/NamePronunciation.tsx:121-146` (`flex flex-wrap items-center gap-2`, `min-w-[8rem]` name and input, so the Source button wraps first when the actions column is wider). Source trigger width is its label: `sb/source/PronSourceTag.tsx:47-53`.
- Severity: looks wrong
- Fix: give every row the same fixed action slots (play, record, mark reviewed, remove each a 36px cell, reserved even when empty) and the Source button a fixed width (about 9.5rem, label ellipsised); never wrap the Source button, shorten instead.
- Evidence: `storybible/alias-pronunciation-editing/w1440.png` (y186-310), `.../alias-pronunciation-editing/w1280.png`, `.../alias-pronunciation-editing/w1024.png` (y209-396), `.../alias-pronunciation-editing/w768.png`, `.../alias-pronunciation-editing/w390.png`.
- Shared: page-local

### SBX-5 The names grid, Add-a-name field, Properties and Relationships each use a different column template, so nothing lines up down the panel

- Gut reaction: Why does everything start at a different x going down the panel (names, then Properties, then Relationships), and why does it all shift when I press Edit?
- Supersedes: SB-13
- Page / state: entry-editing, entry-needs-review, entry-properties-editing, entry-pronunciation-missing, relationship-picker, entity-selected
- Widths: 1440 (names: label x=585, IPA/input x=721; "Add a name" input x=585-1407; Properties VALUE column x=858, inputs x=595/858; Relationships read TO column x=1159, edit TO x=1069, relationship-picker TO x=1005), 1920 (Properties VALUE x=1011) (theme: both)
- What is wrong: the name label column is 136px, the Properties Name column is 32% (273px at 1440, 416px at 1920), the Relationship column is auto (about 464px in read view, 410px in edit), and the "Add a name" field ignores the label column; so the value-like column starts at x=721, 858, 1069 or 1159 depending on the section, and it moves when Edit is pressed.
- Where: `sb/source/NamePronunciation.tsx:122` (`min-w-[8rem]`), `sb/PropertiesSection.tsx:41` (`TableHeader style={{ width: '32%' }}`), `sb/Relationships.tsx:229-241` (`Table` with no widths; auto layout re-flows between read and edit because the edit cell holds an input and a `w-full` button).
- Severity: looks wrong
- Fix: one panel grid: `grid-template-columns: 10rem minmax(0,1fr) auto` shared by the names rows, Properties and Relationships (label / main / actions), with Add-a-name sitting in the main column.
- Evidence: `storybible/entry-pronunciation-missing/w1440.png` (names y=186, Properties header y=518 VALUE x=858, Relationships header y=703 TO x=1069), `.../entry-needs-review/w1440.png` (TO x=1159), `.../relationship-picker/w1440.png` (TO x=1005), `.../entity-selected/w1920.png`.
- Shared: page-local (Table primitive has no column API)

### SBX-6 Entry header: the kind pill drifts 300px from the name in edit mode, drops 5px below the title line, and the toolbar jumps and mixes heights between modes

- Gut reaction: Why is the 'Character' pill floating in the middle of the header far from the name and sitting a bit low, and why does the button cluster on the right change shape, with a short 'Mark reviewed' button next to taller icon buttons?
- Supersedes: SB-6 (extends)
- Page / state: all edit states (entry-editing, alias-pronunciation-editing, name-clash, entry-properties-editing, `entry-pronunciation-*`, entry-saving, relationship-picker, voice-sample-rename underlay)
- Widths: 1440 (pill x=928-1014, y=104 vs name text y=99), 1280 (pill x=709-796), 1024 (wraps under name at x=433, y=128; title x=457 so the pill starts 24px left of the name), 768 (pill x=253-330, mid-header), 1920 (similar drift) (theme: both)
- What is wrong: three things on one header. (a) In edit mode the Name wrapper is `flex-grow`, so the pill is pushed far from the name; in read view it hugs the title (x=658 at 1440). (b) The pill is centred at y=104 while the 26px name is centred at y=99. (c) The toolbar changes with mode: read has Find/Lock/Edit (x=1301/1345/1389), edit has Find/Save/Cancel | Delete (x=1244/1288/1332 and 1389), and Mark reviewed appears left of Find as a 32px button beside 36px icon buttons (button y=83-113, icons y=80-116) so the cluster is ragged.
- Where: `sb/GuideDetail.tsx:605` (`min-w-0 flex-[1_1_12rem]`, grows) in `EntryFrame` `sb/GuideDetail.tsx:147-156` (left group `items-baseline` plus `PANEL_SUBTITLE_CLASS` `flex-[1_1_10rem]` in `primitives/panelStyles.ts:27`, which also grows and has the pill `self-center` from line 148, mixing baseline and centre alignment); Mark reviewed `sb/GuideDetail.tsx:646-657` (`size="sm"`).
- Severity: looks wrong
- Fix: Name wrapper `flex-[0_1_24rem]`; pill and name on one `items-center` line; make Mark reviewed `size` md (or an icon button with tooltip) and keep Find in the same slot in both modes (move Lock to the end in both).
- Evidence: `storybible/entry-editing/w1440.png` (y70-128), `.../alias-pronunciation-editing/w1440.png` (Mark reviewed y83-113), `.../alias-pronunciation-editing/w1024.png` (y68-128), `.../entity-selected/w1440.png` vs `.../entry-editing/w1440.png` (Find x1301 vs x1244).
- Shared: yes, `PANEL_SUBTITLE_CLASS` / `PANEL_HEADER_CLASS` (primitives/panelStyles.ts:8,27), same grow pattern in other panel headers

### SBX-8 "Look up elsewhere" disclosure and its panel are indented to a third x position and lay out as ragged buttons

- Gut reaction: Why is the 'Look up elsewhere' arrow indented oddly, and why do its buttons and results sprawl out with nothing lined up and lots of empty space to the right?
- Supersedes: new
- Page / state: entry-pronunciation-online (open), and the closed disclosure under every name in every edit state
- Widths: 1440 (chevron x=590, label x=613, panel x=605; name label x=585, input x=721), 1024, 768 (theme: both)
- What is wrong: the disclosure trigger is inset 5px (chevron at x=590 against name text at x=585), its panel is inset 20px (x=605), and neither matches the input column at x=721; inside, "LOOK UP ONLINE" is a 36px button with a 12px note beside it, "Merriam-Webster respelling:" and its result (`\'a-ləs\` Al·ice) sit on a line whose "USE THIS" button is 36px tall next to 12px text, and "LISTEN ON COMMONS" is on a separate row at a different width; to the right of all of this 600px of the row is empty.
- Where: `sb/source/NamePronunciation.tsx:156-163` (`Disclosure` then `div space-y-2 pl-5`), `primitives/Disclosure.tsx:34-45` (trigger `gap-2`, 12px chevron, `py-1.5`, caps 13px label), `sb/OnlinePronunciationLookup.tsx:32-57` (`flex flex-wrap items-center gap-2` rows, `text-xs`), `sb/CommonsAudioLookup.tsx:30`.
- Severity: looks wrong
- Fix: align the trigger to the label column (no extra indent) and the panel to the input column (same grid as SBX-4), put Look up online and Listen on Commons in one row of equal-width small buttons, and show the result as a single row `ipa  headword  [Use this]` with `text-sm`.
- Evidence: `storybible/entry-pronunciation-online/w1440.png` (y232-410), `.../entry-editing/w1440.png` (closed trigger y245).
- Shared: page-local (Disclosure primitive used elsewhere)

### SBX-9 Properties edit rows: three icon buttons in a right cell 100px from the inputs; at 390 the inputs shrink to 62px

- Gut reaction: Why is there a big empty gap between the Value box and the little arrow/remove buttons, and why are the boxes tiny and cut off on a phone?
- Supersedes: SB-2 (adds the 1440 gap)
- Page / state: entry-properties-editing (390 also)
- Widths: 1440 (Name input x=595-838, Value input x=858-1180, buttons x=1281-1397, 100px dead gap), 390 (Name 84px, Value 62px, "Oxforc" clipped) (theme: both)
- What is wrong: inputs do not fill the space before the button cell, and the move up / move down / remove group takes 120px, so at 1440 there is a dead 100px band and at 390 the inputs lose their content; the disabled arrows (first up, last down) also change the visual weight of the group row by row.
- Where: `sb/PropertiesSection.tsx:92-109` (`EditRow` cells without widths; third cell `flex justify-end gap-1` with 3 md IconButtons), header widths `PropertiesSection.tsx:41`.
- Severity: looks wrong
- Fix: Value column `w-full`, button cell `w-px whitespace-nowrap`; at narrow width show move up/down in a "..." menu and keep only Remove.
- Evidence: `storybible/entry-properties-editing/w1440.png` (rows y388-517), `.../entry-properties-editing/w390.png`.
- Shared: page-local

### SBX-10 Relationships: the To picker's label is centred in a 285px button and its caret hugs the text; 71px dead gap before the trash button; read view puts To 400px from its label

- Gut reaction: Why is the relationship text left-aligned in its box but the entry picker next to it is centred with the arrow hugging the text, with a wide gap before the trash can? And why is 'Hatter' so far from 'takes tea with' in read view?
- Supersedes: SB-13 (part)
- Page / state: entry-pronunciation-missing, entry-editing with relationships, relationship-picker, entry-needs-review (read), entry-suggestions (read)
- Widths: 1440 (To button x=1069-1274 at March Hare, x=1005-1290 at Alice; trash x=1361-1397; text "HATTER ▾" centred; read view label x=595, To x=1159) (theme: both)
- What is wrong: the relationship text is left aligned in its input, but the neighbouring picker button centres its label and caret in uppercase, so the two cells of one row read as different controls; the trash button is 71-90px right of the picker; in read view "takes tea with" and "Hatter" are 560px apart.
- Where: `sb/Relationships.tsx:130-135` (`Button variant="secondary" className="w-full justify-between"`, the primary button class re-centres the text; the caret `span` is a literal "▾" character), auto-width table at `Relationships.tsx:229-241`.
- Severity: looks wrong
- Fix: left-aligned label with the caret pinned right (`justify-between` honoured, use `Icon name="openMenu"` like the Source button), fixed 14rem To column, trash directly after it.
- Evidence: `storybible/entry-pronunciation-missing/w1440.png` (y727-812), `.../relationship-picker/w1440.png` (y608-832), `.../entry-needs-review/w1440.png` (y520-598).
- Shared: page-local

### SBX-11 Reference-clip form: select, input and button are three stacked controls of different widths

- Gut reaction: Why are these three controls (a small dropdown, a full-width box, a small button) stacked at three different widths like a staircase?
- Supersedes: new
- Page / state: voice-samples-entry, character-voice-references, relationship-picker underlay, voice-data-panel / voice-data-samples (drawer)
- Widths: 1440 (select x=585-744 = 160px, note input x=585-1407, button x=585-746), drawer 320px (select 160px, input full, button 160px) (theme: both)
- What is wrong: the form is a `flex-wrap items-end` row, but the note input is full width, so the 160px select and the 160px button each get their own row and the form reads as a ragged staircase of three different widths with dead space to the right of two of them.
- Where: `sb/VoiceReferencesSection.tsx:111-127` (`mt-2 flex flex-wrap items-end gap-2`; TextField with no max or basis).
- Severity: looks wrong
- Fix: one row at 1440: select 14rem, input `flex-1`, button auto; below 1024 stack all three at `w-full`.
- Evidence: `storybible/character-voice-references/w1440.png` (y755-882), `.../voice-data-panel/w1440.png` (y426-556).
- Shared: page-local

### SBX-15 Voice sample rows: title offset by the star, row heights vary, and the Check again button jumps between the heading's right and its own row

- Gut reaction: Why does one sample's title start further right than the others (because of the star), why do rows have different heights, and why does 'Check again' jump between spots?
- Supersedes: SB-14, SB-15
- Page / state: voice-samples-entry (title x=672 in the starred row vs 644 in the others), voice-data-samples (drawer: time and note wrap to 3 lines at 150px), voice-data-panel vs voice-data-samples (Check again beside heading when empty at x=1323-1421,y=238-270, below it at x=1139-1237,y=267-297 when populated)
- Widths: 1440 (entry and drawer) (theme: both)
- What is wrong: the starred row's title starts 28px right of the other rows' titles because the star is inside the title flex; the missing-file row is 68px against 91px; in the 320px drawer the 36px play button leaves 150px for text, so the time wraps to its own line and "Chapter 1 · "Alice was beginning to get very tired" · Open in Editing" runs 4 lines; the Check again button changes position depending on whether the count text is shown.
- Where: `sb/voicesamples/VoiceSampleRow.tsx:85-96` (`InsetCard flex items-start gap-2.5`, star `span` inside `flex flex-wrap items-center gap-2` at line 96), `sb/voicesamples/VoiceSamplesBody.tsx:111-126` (`flex flex-wrap items-center gap-2` plus `flex-1` spacer, wraps when the count appears).
- Severity: looks wrong
- Fix: reserve a fixed 20px star column for every row, stack the drawer row's meta under the title, keep Check again in the heading row (wrap the count instead).
- Evidence: `storybible/voice-samples-entry/w1440.png` (y365-683), `.../voice-data-samples/w1440.png` (y304-441), `.../voice-data-panel/w1440.png` (y238-270).
- Shared: yes, voice sample row (drawer and entry)

### SBX-16 Entries list: filter chips wrap into five ragged rows (250px of the card), with the two filter groups never sharing a row

- Gut reaction: Why do the filter chips pile up into five uneven rows and eat a third of the list, with ragged right ends and room left on lines that were wrapped anyway?
- Supersedes: new
- Page / state: every list state (entity-selected, `category-*`, review-filter, verification-filter, search-narrowed, loading)
- Widths: 1440, 1280, 1024 (320px card) (chip rows at y=242 All/Character/Place, y=278 Organization/Lore, y=314 Item/Event, y=350 Needs review, y=386 Needs verification); 768 and 390 are one wide row set (theme: both)
- What is wrong: the kind chips and the two status chips are separate wrapping groups, so "Needs review · 1" and "Needs verification · 6" always start new rows even when the previous row has room (Item/Event row ends at x=411 of 535), row ends are ragged (Place at 493, Lore at 453, Event at 411), and the filter block takes y=228-400 of a 740px card, leaving 7 rows visible.
- Where: `sb/Guide.tsx:398` (kind group `flex flex-wrap gap-2`) and `sb/Guide.tsx:411` (status group, its own `flex flex-wrap gap-2` inside the `flex-col gap-2` parent at line 391).
- Severity: looks wrong
- Fix: one wrapping group, or collapse the kinds into a segmented control / dropdown; keep status chips on one row with a shared fixed chip width.
- Evidence: `storybible/entity-selected/w1440.png` (y228-400), `.../verification-filter/w1440.png`.
- Shared: page-local

### SBX-17 Entries list: suggestion rows do not match entry rows (inset, type size, selected shape, right edge)

- Gut reaction: Why do the suggestion rows look different from the normal entries (bigger text, different indent, square highlight)?
- Supersedes: SB-7
- Page / state: verification-filter, loose-suggestion (list)
- Widths: 1440 (suggestion title x=257 vs entry x=251; second line 16px vs 14px; selected suggestion fill x=241-543 square, selected entry rounded; confidence pill ends x=527 vs "Verify · 2" pill x=533) (theme: both)
- What is wrong: same list, two row geometries; titles ellipsise ("The Mouse (Character): Cal...") because the pill is placed inline.
- Where: `sb/suggested/panel/LooseSuggestionRows.tsx:26-31` (`px-4 py-2`, no rounding or type size) vs `sb/Guide.tsx:482` (`rounded-lg px-2.5 py-2`, `text-[0.9375rem]`/`text-sm`).
- Severity: looks wrong
- Fix: reuse the entry row classes.
- Evidence: `storybible/verification-filter/w1440.png` (y432-690), `.../loose-suggestion/w1440.png`.
- Shared: page-local

### SBX-18 Entries list footer: Voice data floats under a short list and leaves 350px of empty card below

- Gut reaction: Why is the Voice data button floating in the middle of an empty card instead of at the bottom?
- Supersedes: SB-8
- Page / state: category-place, search-narrowed, review-filter, verification-filter, loose-suggestion
- Widths: 1440 (button y=504-538 in category-place; y=856 when the list is full); the footer holds one left-aligned button with the right 70% empty (theme: both)
- What is wrong: the footer is not anchored to the bottom of the card when rows are few.
- Where: `sb/Guide.tsx:450` (`guide-list-scroll min-h-0 overflow-y-auto p-2`, no `flex-1`), footer `sb/Guide.tsx:509`.
- Severity: looks wrong
- Fix: `flex-1` on the scroll region.
- Evidence: `storybible/category-place/w1440.png`, `.../search-narrowed/w1440.png`, `.../review-filter/w1440.png`.
- Shared: page-local

### SBX-20 Series tab: title and tabs leave the card and jump 12px between Entries and Series; error panel is a card inside a card

- Gut reaction: Why do the title and tabs jump when I switch between Entries and Series, and why is there a card inside a card on the error screen?
- Supersedes: SB-17
- Page / state: series-tab-populated, series-tab-load-failed, series-tab-empty/loading (skimmed)
- Widths: 1440 (Entries mode: "ENTRIES" tab x=259,y=143 inside the card; Series mode: title x=232,y=83 and tab x=242,y=131 outside it; cards start x=232 and inner content x=249; load-failed shows a second bordered card x=249-1407 inside the card x=232-1423) (theme: both)
- What is wrong: switching tabs moves the tab strip and the page title, and Series-mode content nests card-in-card with different insets (16px, 17px).
- Where: `sb/Guide.tsx:374-380` (Series branch: `flex-none space-y-4` title + tabs above a `Panel flush`), vs `sb/Guide.tsx:385-390` (Entries branch: title and tabs inside the card with `px-4`).
- Severity: looks wrong
- Fix: draw the Series branch with the same card header (title row, tab strip at the same x,y) and render errors without a nested frame.
- Evidence: `storybible/series-tab-load-failed/w1440.png`, `.../series-tab-populated/w1440.png` vs `.../entity-selected/w1440.png`.
- Shared: page-local

### SBX-24 The record button is an unlabelled dark filled circle next to the play square

- Gut reaction: What is this big dark dot beside the play button? It looks like a status light or a disabled blob, not a record button, and it is the heaviest thing in the row.
- Supersedes: new
- Page / state: every edit state with names (entry-editing, alias-pronunciation-editing, `entry-pronunciation-*`, name-clash, entry-saving)
- Widths: all; 1440 (x=1371-1407, y=186-222, solid dark fill against the outlined 36px squares) (theme: both)
- What is wrong: the record action is drawn as a filled disc with no glyph visible at that size, so it carries more visual weight than Save and reads as an indicator.
- Where: `sb/GuideDetail.tsx:811` (`IconButton action="record"`), icon from the action registry.
- Severity: looks wrong
- Fix: outline button with a recognisable microphone or record glyph in the accent colour, same weight as play.
- Evidence: `storybible/entry-editing/w1440.png` (x1389,y204), `dark:storybible/alias-pronunciation-editing/desktop.png`.
- Shared: icon action registry

### SBX-12 Section rhythm differs: some sections are set off by a rule and 33px, others by 16px; "Speaker colour" is bold and inline while its siblings are medium and stacked

- Gut reaction: Why do some sections get a divider line and bigger gap while others just run together, and why is 'Speaker colour' bold and on one line when everything else is a small label above its field?
- Supersedes: new
- Page / state: entity-selected, entry-locked, voice-samples-entry, entry-needs-review
- Widths: all (1440: "What they know" to the rule y=468 to 495, rule to "Properties" y=521; Personality notes, Speaker colour, Voice samples, Reference clips have no rule; Speaker colour label x=585-676 is bolder than "Properties"/"Voice samples" labels) (theme: both)
- What is wrong: only Properties, Relationships and Appears-in get a `border-t pt-4` rule, so spacing is 33px around them and 16px elsewhere, and "Voice samples" and "Reference clips" blocks (large cards) abut Personality notes with no separation; the Speaker colour field is a one-line label+select with `font-semibold` where every other section label is `font-medium` above its content.
- Where: `sb/GuideDetail.tsx:716` (`space-y-4` stack) with `sb/PropertiesSection.tsx:29`, `sb/GuideDetail.tsx` Relationships wrapper ~line 934 and `sb/AppearsIn.tsx:19` (each `border-t pt-4`); `sb/SpeakerColourField.tsx:28-31` (`flex items-center gap-2`, `font-semibold`).
- Severity: polish
- Fix: one section wrapper (`border-t pt-4` for every section after the first, or none) and `font-medium` for the Speaker colour label; stack its label above the select like other fields.
- Evidence: `storybible/entity-selected/w1440.png` (y455-880), `.../character-voice-references/w1440.png`.
- Shared: page-local

### SBX-13 Table content is 10px inside the section label and form fields; Add buttons start at two different x

- Gut reaction: Why do the table's words start a little right of the labels above them, and why is one plus button further left than the other?
- Supersedes: SB-12
- Page / state: entry-properties-editing, entry-pronunciation-missing, entity-selected (read)
- Widths: 1440 (labels, Description text and Add-a-name at x=585; Properties NAME header and "Age" at x=595; Properties "+" x=585-621; Relationships "+" x=595-631) (theme: both)
- What is wrong: the table cell padding indents table text 10px relative to the rest of the panel, and the Properties "+" is outside its table while the Relationships "+" is inside a cell.
- Where: `primitives/Table.tsx` cell padding; `sb/PropertiesSection.tsx:63` (Add button after the table, `mt-3`) vs `sb/Relationships.tsx:308-322` (Add in `TableCell colSpan={3}`).
- Severity: polish
- Fix: flush cell padding on the first column or negative margin, and put both Add buttons in the same place.
- Evidence: `storybible/entry-pronunciation-missing/w1440.png` (y590-625, y820-855), `.../entity-selected/w1440.png` (y550-640).
- Shared: Table primitive

### SBX-14 Suggested-claim cards: 32px action buttons and a floating confidence pill misaligned with the text line

- Gut reaction: Why are the tick/pencil/cross buttons small and disconnected from the confidence pill and from the claim text?
- Supersedes: new
- Page / state: entry-suggestions, loose-suggestion
- Widths: 1440 (pill x=1228-1278, buttons 1290-1322 / 1328-1360 / 1366-1398 at y=439-471, card text lines at y=455 / 485 / 509) (theme: both)
- What is wrong: the three decision buttons are 32px while every icon button on the panel is 36px, the pill and buttons are centred on the card's first line (y=455) but the pill is 28px from the first button and the card has 3-4 lines of body so the buttons feel detached from the claim they act on; right inset is 9px against the 16px used by the card above.
- Where: `sb/suggested/row/SuggestionRow.tsx:68-91` (`InsetCard ... flex-col gap-1`, header row `flex flex-wrap items-center gap-x-3 gap-y-1.5`, buttons `inline-flex gap-1.5` at line 91).
- Severity: polish
- Fix: use the same 36px IconButton size and a fixed right action cell with the pill left of it at a constant gap.
- Evidence: `storybible/entry-suggestions/w1440.png` (y430-608), `.../loose-suggestion/w1440.png` (y161-259).
- Shared: yes, suggestion row (also Script page lists)

### SBX-19 Loading skeleton does not match the loaded layout (rows 4px narrower, filter block 36px shorter, detail has no card frame) so the page jumps on load

- Gut reaction: Why does the page jump around when it finishes loading (boxes of different widths and no card frame)?
- Supersedes: new
- Page / state: loading
- Widths: 1440 (skeleton rows x=245-539 vs real rows x=241-543; list begins y=393 vs 425 because the "Needs review" chip is absent; detail skeleton bars x=584-1408 drawn straight on the page background with no border, header or 16px card inset) (theme: both)
- What is wrong: the skeleton is a different layout from the card it becomes.
- Where: `sb/GuideSkeleton.tsx:8-10` (list `p-1`, `h-12` rows against the real `p-2`, two-line rows 56-63px), `sb/GuideSkeleton.tsx:18-22` (detail `flex flex-col gap-4 p-4` with no `PANEL_FRAME_CLASS`).
- Severity: polish
- Fix: draw the skeleton inside the same card frame and header, same `p-2` list inset and row height.
- Evidence: `storybible/loading/w1440.png` (y84-452 detail, y393-720 list).
- Shared: page-local

### SBX-21 Draft entries read "Needs Review" in the header pill but "Type not set" in the list, and the title casing differs from the status badge

- Gut reaction: Why does the header say 'Needs Review' in a pill when the list says 'Type not set', and why is it capitalised differently from the other badge?
- Supersedes: new
- Page / state: entry-needs-review, entry-pronunciation-missing (March Hare)
- Widths: 1440 (list row "Type not set · 1 name" and a "Review" pill; header pill "Needs Review" in title case, tan, at x=717-800; status badge elsewhere "Needs review" sentence case) (theme: both)
- What is wrong: the kind pill of a Draft uses the category label ("Needs Review") instead of the list's "Type not set", so the header shows two review-looking pills with different casing for one entry.
- Where: `sb/GuideDetail.tsx:624-642` (`categoryLabel(entity.category)` in the kind pill) vs `sb/Guide.tsx:492` (`row.category === 'Draft' ? categoryLabel(row.category) : typeUnknown(row) ? 'Type not set' : ...`); `state.ts:22`.
- Severity: polish
- Fix: one label function for Draft ("Type not set") used by both.
- Evidence: `storybible/entry-needs-review/w1440.png` (header y100, list y718), `dark:storybible/entry-needs-review/desktop.png`.
- Shared: page-local

### SBX-22 Loose-suggestion panel: header is 50px with a 20px bold title while entry headers are 58px with a 26px title

- Gut reaction: Why is this panel's header shorter with a smaller title than the entry panel I was just looking at?
- Supersedes: new
- Page / state: loose-suggestion
- Widths: 1440 (header divider y=119 vs y=127; title about 20px, no pill or toolbar; content starts y=145 vs y=148) (theme: both)
- What is wrong: switching between an entry and a suggestion in the list changes header height and title size of the same right-hand card.
- Where: `sb/Guide.tsx:519` (`Panel title={summaryOf(...)} scroll`) uses `PANEL_TITLE_CLASS`, `EntryFrame` uses `PANEL_ENTRY_TITLE_CLASS` (`primitives/panelStyles.ts:17-20`).
- Severity: polish
- Fix: give the loose panel the entry header (26px title, same min-height) or make both 50px.
- Evidence: `storybible/loose-suggestion/w1440.png`, `.../entity-selected/w1440.png`.
- Shared: Panel / panelStyles

### SBX-23 Import dialog header and footer differ from every other dialog

- Gut reaction: Why does the Import dialog look like a different kind of dialog (Cancel at the top, button inside the body, no footer)?
- Supersedes: new
- Page / state: import-dialog
- Widths: 1440 (eyebrow + 26px title + subtitle with a text Cancel at top right; action button `Add to the Story Bible` sits in the body at the right with no footer bar; other dialogs have a plain title with an X and a footer bar with Cancel and the primary) (theme: both)
- What is wrong: inconsistent chrome for the same primitive (cause is intentional per the mock comment, but it reads as a different component).
- Where: `sb/suggested/import/ImportDialog.tsx:232-245` (own header with `px-[1.1rem] py-[0.85rem]`, own Cancel `Button`).
- Severity: polish
- Fix: use the standard Dialog header/footer unless the mock explicitly requires this one.
- Evidence: `storybible/import-dialog/w1440.png` vs `.../voice-sample-rename/w1440.png`.
- Shared: Dialog primitive

### SBX-25 Locked-entry notice bar hugs the header and leaves a bigger gap under it than above it

- Gut reaction: Why is this grey locked bar jammed right under the header line with a big empty space below it before the names section?
- Supersedes: new
- Page / state: entry-locked, entry-unlocked (transition), voice-samples-limit (Queen of Hearts)
- Widths: 1440 (header divider y=127, bar y=144-170 so 16px above; names label y=205, 35px below) (theme: both)
- What is wrong: unequal space above and below the notice, so it looks pushed up rather than part of the body flow; its text is 12px against 13px labels.
- Where: `sb/GuideDetail.tsx:~690` (`p className="rounded px-3 py-1.5 text-xs"` inside `space-y-4`; the next block's 36px Rescan row adds the extra gap, see SBX-1).
- Severity: polish
- Fix: resolves with SBX-1; match the notice to the label type size.
- Evidence: `storybible/entry-locked/w1440.png` (y144-224).
- Shared: page-local

## Round 1 findings not re-listed in a later round

These were found in the first (lenient) pass and no later reviewer named them as superseded; they may still hold.

### SB-9 Every Dialog is 70vw wide, even a one-line confirm

- Page / state: storybible / delete-confirm, `remove-voice-*`-confirm, voice-sample-delete-confirm, voice-sample-rename/move, `voice-download-*`, import-dialog; project / new-project-dialog; global / confirm-dialog, shortcut-sheet
- Widths: 1440 (dialog x=217-1223, 1006px wide, for a 520px sentence), 1920 (x=289-1631, 1342px), 768 (538px), 390 (271px, message wraps to 3-4 lines, buttons tight) (theme: both)
- What is wrong: the dialog takes 70% of the viewport whatever it holds, so Cancel and Delete sit 900px apart with a short sentence between, the shortcut sheet has labels at x=235 and keycaps at x=1205, and at 390 the same rule makes the dialog narrower than the content wants.
- Where: `apps/ui/src/components/primitives/Dialog.tsx:148-149` (`w-full ... max-w-[70vw]` for every size except `full`).
- Severity: looks wrong
- Fix: add a width scale (`sm` about 28rem for confirms, `md` about 36rem for forms, `lg` for the shortcut sheet), with `max-w-[calc(100vw-2rem)]` as the ceiling.
- Evidence: `storybible/delete-confirm/w1440.png`, `.../delete-confirm/w1920.png`, `.../delete-confirm/w390.png`, `global/shortcut-sheet/w1440.png`, `project/new-project-dialog/w1440.png`.
- Shared: Dialog primitive (all pages).

### SB-10 Dialog description sits flush against the content under it

- Page / state: storybible / voice-sample-move; any Dialog with both `description` and children
- Widths: 1440 and 390 (theme: both)
- What is wrong: "Move "Tea party, quick" to another character." is at y=404 and the "Move to" label directly beneath at y=424 with no gap (20px line pitch, 0px margin); the Rename dialog's label-to-field spacing is 4px, so the Move dialog's description reads as part of the label.
- Where: `Dialog.tsx:178-184` (`Parts.Description` and `{children}` are adjacent siblings in the padded body, no `mb-*` or gap); `MoveVoiceSampleDialog.tsx:62` supplies the description.
- Severity: polish
- Fix: `mb-3` on the Description element.
- Evidence: `storybible/voice-sample-move/w1440.png` (y=395-435), `.../voice-sample-move/w390.png` (y=385-415).
- Shared: Dialog primitive

### SB-11 Dialog footer buttons are inset 1.6px more than the header and body edges

- Page / state: every Dialog (delete-confirm, `remove-*`, import, rename, move, new-project)
- Widths: all (1440: header X right edge x=1205, body inputs end x=1205, footer button right edge x=1207; Cancel left x=233 while title text starts x=235) (theme: both)
- What is wrong: header and body use 1.1rem (17.6px) side padding, the action row uses `px-4` (16px), so the footer buttons stick out about 2px to each side of the content above.
- Where: `Dialog.tsx:163` and `:176` (`px-[1.1rem]`, `p-[1.1rem]`) versus `Dialog.tsx:195` (`px-4`).
- Severity: polish
- Fix: use `px-[1.1rem]` in the action row.
- Evidence: `storybible/delete-confirm/w1440.png` (Cancel at x=233-302, title at x=235; Delete entry right at 1207, X at 1205).
- Shared: Dialog primitive

### SB-16 Stacked layout at 768: the entries list is a 3-row window with nested scrolling

- Page / state: storybible / every state with a list, at 768 (and 1024 height 768)
- Widths: 768 (list panel y=69-530 of which the filters take 245px, leaving 2.5 rows visible at y=308-477) (theme: both)
- What is wrong: the filter block takes more than half of the list card, the list itself scrolls inside a ~170px window, and the entry panel below it is another scroll region.
- Where: `Guide.tsx:384` (`grid ... [&>*]:max-md:min-h-96` / the `(max-height:899px)` override only frees heights below 900px tall viewports; at 768x1024 the grid stays `h-full` and splits the viewport) and `Guide.tsx:391-419` (chip groups always visible).
- Severity: polish
- Fix: let the list panel auto-size to its rows (cap at about 60% height) in the stacked layout, or collapse the filter chips behind a disclosure.
- Evidence: `storybible/entry-editing/w768.png` (list y=308-477), `.../category-organization/w768.png`.
- Shared: page-local
