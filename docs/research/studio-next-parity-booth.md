# Studio Next parity: Booth (SN-C34)

Mock files: booth.test.tsx, booth-daw.test.tsx, d2-booth.test.tsx

**Date:** 2026-10-12. **Code audited:** `main` at `7e4a511`, after the Booth swap (SN-O10, #1518). **Slice:** SN-C34 (#1209), SNC-3 of the [Studio Next cutover PRD](../prds/studio-next-cutover.prd.md). **Mock audited:** `docs/research/mockups/studio-next/tests/`. **Booth PRD:** [studio-next-booth.prd.md](../prds/studio-next-booth.prd.md). SN-C4 reads this note when it flips the ratchets; SN-C51 and SN-C52 read it for the steady-state docs.

Method: each mock case is a row below, mapped to a real test by name, and by reading the real test or the page code where the row's note says it asserts less. The checker is `node scripts/ci/studio-next-parity.mjs`. It proves a cited test file exists and holds the name; it does not prove the test asserts what the mock case asserts. The app was not run and the Playwright suites were not run. The cited real tests were run once (see [Verification](#verification)). The three files hold 113 cases by the checker's count (64, 46 and 3); the slice text says 112.

## Result

- 113 mock cases: 63 `ported`, 36 `covered`, 14 `mock-only`. Of the 14, 12 are gaps (rows whose note starts `GAP`) and 2 are the mock's own stand-ins (its reading clock and its swappable speech provider). 22 `covered` rows name a gap in their note. So 34 rows are open and 79 are not.
- 16 gaps in the cases (G1 to G16) and one without a case (G17, the live engine), under [Gaps](#gaps).
- **Bookmarks and the pickup session are on the page** since SN-O103 (#1516, G1): `BoothNextPage.test.tsx` drives `B`, `Alt+[ ]`, the right-click items and a pickup session opened from the address. The bookmark keys moved to the `global` scope, because the Booth's `booth` scope shuts `page` off.
- **The live-engine design has no build slice** (G17): see [The live engine](#the-live-engine).
- Agreed rulings: 12 in scope (BO-1 to BO-5, CF-3, CF-4, CF-5, CF-6, CF-10, CF-11, CF-14). All 12 have a test row; BO-1, CF-3 and CF-14 are partly built, and [Agreed rulings with parts untested](#agreed-rulings-with-parts-untested) lists the parts.
- Old equivalents: 14 checks. 9 are `gone`. 5 found leftovers (L1 to L6 under [Leftovers](#leftovers)): five doc images of the old Booth, a dead hook, a hook only a test uses, stale comments, two missing visual rows and a guide sentence.
- No product test was added: the slice owns one file.

**The checker has no status for a gap.** A mock case with no real test must still have a row, and only `mock-only` passes with an empty `real test`. Gap rows therefore carry `mock-only` and a note that starts `GAP Gn`, as the Production and Schedule and the Script and Story Bible notes do. They are not excused: each has an entry under [Gaps](#gaps). SN-C4 should count them as open. A `covered` row whose note starts `GAP Gn` has a real test that asserts less than the mock case, or tests a seam the page does not mount; it is open too.

## Mock cases

| mock file | mock case | status | real test | note |
| --- | --- | --- | --- | --- |
| booth.test.tsx | `lights one phrase, dims the ones read, and marks exactly one word with no trailing space` | ported | apps/ui/src/components/booth/reading/BoothText.test.tsx::lights one phrase, dims the ones read and marks exactly one word with no trailing space |  |
| booth.test.tsx | `tints Story Bible names, underlines marked words and shows notes under the paragraph` | ported | apps/ui/src/components/booth/reading/BoothText.test.tsx::draws the Story Bible tint and the notes | The tint and the note rules: decorations.test.ts "tints each Story Bible name or alias by its category, whole words only", "shows a mark that carries text as a note under its paragraph". |
| booth.test.tsx | `a click puts the reading position on that word` | ported | apps/ui/src/components/booth/reading/BoothText.test.tsx::calls onSeek with the paragraph and the word and snaps the view back |  |
| booth.test.tsx | `text size and font come from the saved choices` | mock-only |  | GAP G3: the page keeps the text size in state at 40 on every visit (useBoothPage.ts) and has no reader font, so neither comes from a saved choice. BoothText.test.tsx "takes 24 to 72 in steps of 4 and stores nothing" says it stores nothing. |
| booth.test.tsx | `the text popover writes the reader font and the Booth size (24 to 72 in steps of 4)` | mock-only |  | GAP G3: the Booth top bar has no text popover and nothing writes the reader font or the Booth size; the size changes by the + and - keys and the right-click menu only. |
| booth.test.tsx | `names the chapter in the manuscript style (%s, %i)` | covered | apps/ui/src/chapterName.test.ts::short is always the title alone, even with a subtitle | GAP G4: the stepper and the title use chapterName, which writes the title alone, not the manuscript heading style (the same drift as G13 of studio-next-parity-script-and-bible.md). The progress line is progressLine.test.ts "reads paragraph n of N, the share of the words and the time left at the standard rate". |
| booth.test.tsx | `shows a placeholder for a chapter with no text yet` | ported | apps/ui/src/components/booth/reading/BoothText.test.tsx::shows "Chapter text appears here." as one paragraph |  |
| booth.test.tsx | `asks for a manuscript when there is none` | ported | apps/ui/src/components/booth/page/BoothNextPage.test.tsx::asks for a manuscript when there is none | App.tsx also sends a project with no manuscript to /. |
| booth.test.tsx | `a suggested chip is dashed; confirming from its menu writes the shared speaker` | covered | apps/ui/src/components/booth/reading/BoothText.test.tsx::a suggested speaker is dashed and a confirmed one solid; a continued sentence has no chip | GAP G5: the page writes the choice with data.correctCue; no test checks the write. |
| booth.test.tsx | `the menu can set another speaker, and has no Narrator option` | ported | apps/ui/src/components/booth/reading/BoothText.test.tsx::the menu confirms the suggestion or sets another speaker, and has no Narrator option |  |
| booth.test.tsx | `chips are coloured with their speaker's colour and shown uppercase by CSS` | ported | apps/ui/src/components/booth/reading/BoothText.test.tsx::follows the speaker colour and shows uppercase through CSS |  |
| booth.test.tsx | `advances at the standard rate while recording` | mock-only |  | The mock advances the position on a timer at a standard rate as a stand-in for the voice (BO-1 item 1: the real app tracks the voice). Following is covered by usePacedCursor.test.ts "walks forward to a new position instead of jumping" and readerModel.test.ts "follows forward movement". |
| booth.test.tsx | `stops by itself at the end of the chapter` | mock-only |  | GAP G2: nothing in page/ stops a take when the reading reaches the end of the chapter (BO-1 item 2); the listening session can end there, the DAW take does not. |
| booth.test.tsx | `REAPER off: Record is disabled and Space does nothing` | ported | apps/ui/src/components/booth/page/BoothNextPage.test.tsx::a refused precondition says why and starts nothing | With no DAW: record.test.tsx "a-dawless-setup-disables-record-and-shows-the-capabilitys-reason". |
| booth.test.tsx | `if the Booth goes away mid-take (the safety net; leaving by the app asks first) the take is stopped and the timers cleared` | covered | apps/ui/src/components/booth/page/BoothNextPage.test.tsx::records with the built-in recorder; leaving asks, and unmounting without the answer does not stop the take | GAP G6: this is the opposite of the mock. The real page stops a take on unmount only after the shell asked and the narrator said yes; the mock stops it as a safety net. A page that unmounts with no question leaves the DAW recording. |
| booth.test.tsx | `the setup chip goes to Settings; during a take it asks to stop first` | ported | apps/ui/src/components/booth/page/BoothNextPage.test.tsx::the setup chip asks too | The chip goes to Settings when no take runs: the same onClick, not asserted. |
| booth.test.tsx | `shows the recorder by name in the chip; its status and take are in the tooltip` | covered | apps/ui/src/components/booth/record/record.test.tsx::the-control-wording-comes-from-the-capability | The chip names the DAW or the built-in recorder (SetupChip in record.test.tsx). Its tooltip carrying the status and the take is not asserted. |
| booth.test.tsx | `Space records and stops` | ported | apps/ui/src/components/booth/page/BoothNextPage.test.tsx::Space records and stops through the Record control |  |
| booth.test.tsx | `down is the next phrase; up and Backspace go back; left and right step a word` | ported | apps/ui/src/components/booth/page/BoothNextPage.test.tsx::down and up step a phrase, left and right a word | Backspace is a second default of booth.phrase.prev in commands.catalog.ts; no test presses it. |
| booth.test.tsx | `a word step past the end of a phrase starts the next one, and back again` | ported | apps/ui/src/components/booth/reading/boothUnits.test.ts::a word step past the end of a phrase starts the next one, and back again |  |
| booth.test.tsx | `R punches and rolls only while recording, from the current phrase when none was chosen` | ported | apps/ui/src/components/booth/roll/roll.test.tsx::r-rolls-only-while-recording |  |
| booth.test.tsx | `R rolls again from the phrase chosen with Start from here` | ported | apps/ui/src/components/booth/roll/roll.test.tsx::r rolls from the phrase chosen with Start from here |  |
| booth.test.tsx | `Start from here while recording punches in: the take keeps rolling from that phrase` | covered | apps/ui/src/components/booth/page/BoothNextPage.test.tsx::REAPER rolls without a question and counts the punch | The menu entry that starts it: P "right-click Start from here moves the reading position there and marks the next start". |
| booth.test.tsx | `there are no F or P bindings: nothing is flagged or added to the pickups from the Booth` | ported | apps/ui/src/components/booth/page/BoothNextPage.test.tsx::a pedal only starts and stops: no other key records, rolls or flags |  |
| booth.test.tsx | `Page Down and Page Up scroll the view without moving the reading position` | covered | apps/ui/src/components/booth/reading/BoothText.test.tsx::scrolls by a share of the height, eased, and leaves the position | GAP G15: this tests the view's method; no test presses Page Down or Page Up on the page. |
| booth.test.tsx | `+ and - change the text size within 24 to 72` | ported | apps/ui/src/components/booth/page/BoothNextPage.test.tsx::+ and - change the text size within 24 to 72 |  |
| booth.test.tsx | `Escape exits to Script; a popover closes first; during a take it asks "Stop recording?" instead of stopping` | ported | apps/ui/src/components/booth/page/BoothNextPage.test.tsx::a popover takes Escape first; then Escape exits | During a take: P "Escape asks \"Stop recording?\" once; Keep recording changes nothing". |
| booth.test.tsx | `Escape with no take running exits to Script` | covered | apps/ui/src/components/booth/page/BoothNextPage.test.tsx::with nothing recording, leaving needs no question |  |
| booth.test.tsx | `ignores keys while typing and with Ctrl held` | ported | apps/ui/src/components/booth/page/BoothNextPage.test.tsx::ignores keys while typing and with Ctrl held |  |
| booth.test.tsx | `N and Shift+N only work in a pickup session` | covered | apps/ui/src/components/booth/pickups/PickupSession.test.tsx::n-goes-to-the-next-pickup: N and Shift+N do nothing outside a session | GAP G1: the seam is tested; the page mounts no pickup session, so N does nothing anywhere on /booth. |
| booth.test.tsx | `right-click offers the phrase, take and text commands` | covered | apps/ui/src/components/booth/page/BoothNextPage.test.tsx::right-click Start from here moves the reading position there and marks the next start | GAP G7: the other entries (Next phrase, Back one phrase, Punch and roll, Larger text, Smaller text, Exit Booth) are in useBoothPage.ts and no test lists them. |
| booth.test.tsx | `there is no mirror text` | mock-only |  | GAP G8: the Booth has no mirror text and no test says so. |
| booth.test.tsx | `marks the lines with a bar, lists them in the side panel and counts the open ones` | covered | apps/ui/src/components/booth/pickups/PickupSession.test.tsx::lines-are-marked-listed-and-counted: a bar in the text, a row in the panel, the open ones counted | GAP G1: not mounted on the page. |
| booth.test.tsx | `N goes to the next pickup (even in another chapter), Shift+N back, and wraps` | covered | apps/ui/src/components/booth/pickups/PickupSession.test.tsx::n-goes-to-the-next-pickup-even-in-another-chapter: Shift+N back, wrapping | GAP G1: not mounted on the page. |
| booth.test.tsx | `clicking a pickup in the side panel jumps to it; not while recording` | covered | apps/ui/src/components/booth/pickups/PickupSession.test.tsx::clicking-a-pickup-jumps-to-it-not-while-recording | GAP G1: not mounted on the page. |
| booth.test.tsx | `a take that ran over a line marks it recorded, and the toast can undo that` | covered | apps/ui/src/components/booth/pickups/PickupSession.test.tsx::a-take-that-ran-over-a-line-marks-it-recorded-and-the-toast-can-undo | GAP G1: not mounted on the page. |
| booth.test.tsx | `a take that stopped before the line leaves it open` | covered | apps/ui/src/components/booth/pickups/PickupSession.test.tsx::a-take-that-ran-over-a-line: one line reads as singular, and a take that stopped before the line leaves it open | GAP G1: not mounted on the page. |
| booth.test.tsx | `leaving mid-take marks recorded lines quietly` | covered | apps/ui/src/components/booth/pickups/PickupSession.test.tsx::a-take-that-ran-over-a-line: leaving mid-take marks recorded lines quietly | GAP G1: not mounted on the page. |
| booth.test.tsx | `exit goes back to Pickups; entering the Booth any other way ends the session` | mock-only |  | GAP G1: nothing sends the narrator back to Pickups from a session or ends the session when the Booth opens any other way. boothQuery.ts has no pickups parameter and useBoothPage takes `exitTo` as an option no caller sets to Pickups. |
| booth.test.tsx | `the pickup list is empty outside a session` | covered | apps/ui/src/components/booth/pickups/PickupSession.test.tsx::the pickup list is empty outside a session | GAP G1: not mounted on the page. |
| booth.test.tsx | `shows the voices nearby with their Story Bible voice note, coming-up words and the session numbers` | ported | apps/ui/src/components/booth/side/BoothSidePanel.test.tsx::lists the voices nearby with their Story Bible voice note, coming-up words and the session numbers |  |
| booth.test.tsx | `the side panel can be hidden` | ported | apps/ui/src/components/booth/side/BoothSidePanel.test.tsx::above 1280 it starts open inline and the toggle hides it |  |
| booth.test.tsx | `levels menu (mic and levels): REAPER says where the mic is chosen; built-in offers a choice; off disables levels` | covered | apps/ui/src/components/booth/frame/frame.test.tsx::opens a menu with the microphone choice and the level meter, and leaves the room tone in the footer | The DAW case, the built-in recorder case and the off case: frame.test.tsx "says where the microphone is chosen when a DAW picks its own input", "offers the host devices with the built-in recorder and reports the choice", "turns the levels off with the capability sentence when the DAW is not running". |
| booth.test.tsx | `the chapter cannot change during a take` | ported | apps/ui/src/components/booth/page/BoothNextPage.test.tsx::the picker and its arrows are disabled while recording |  |
| booth.test.tsx | `has no Ready chip, and shows REC only while recording` | ported | apps/ui/src/components/booth/frame/frame.test.tsx::has no Ready chip, and REC only while recording |  |
| booth.test.tsx | `has no exit button on top; Esc Exit is a key reminder on the footer's own row` | ported | apps/ui/src/components/booth/frame/frame.test.tsx::has no exit button on the top bar; Esc Exit is a reminder in the footer |  |
| booth.test.tsx | `at 1280 and below it starts closed, the toggle opens and closes it, and Esc closes it before exiting` | ported | apps/ui/src/components/booth/side/BoothSidePanel.test.tsx::at 1280 and below it starts closed as a drawer, the toggle opens it, Esc closes it before exiting | On the page: P "at 1280 and below Escape closes the open drawer before it exits". |
| booth.test.tsx | `in the drawer layout a click outside the panel closes it, but a click inside, or on the toggle, does not` | ported | apps/ui/src/components/booth/side/BoothSidePanel.test.tsx::closes on a click outside, not on a click inside or on the toggle, and returns no focus trap |  |
| booth.test.tsx | `above 1280 clicking the text does not close the inline panel` | covered | apps/ui/src/components/booth/side/BoothSidePanel.test.tsx::above 1280 it starts open inline and the toggle hides it | GAP G9: a click on the text above 1280 is not asserted to leave the inline panel open. |
| booth.test.tsx | `above 1280 it stays inline and open, and Esc exits` | covered | apps/ui/src/components/booth/side/BoothSidePanel.test.tsx::above 1280 it starts open inline and the toggle hides it | Escape exits: P "a popover takes Escape first; then Escape exits". |
| booth.test.tsx | `clicking a Story Bible name opens the side panel on that entry, read-only, and a plain word clears it` | covered | apps/ui/src/components/booth/side/BoothSidePanel.test.tsx::is set by a click on a name or a marked word and cleared by a plain word, and a new chapter starts empty | GAP G16: this drives `useBoothReference`, which the page does not use; the page keeps its own state and sets only an entry (BoothNextPage.tsx onSeek). The page's own click-to-reference has no test. |
| booth.test.tsx | `a Character shows how they talk and how each name is said` | ported | apps/ui/src/components/booth/side/BoothSidePanel.test.tsx::shows a clicked Story Bible name read-only, a Character with how they talk and how each name is said |  |
| booth.test.tsx | `clicking a marked word shows the note and its thread` | covered | apps/ui/src/components/booth/side/BoothSidePanel.test.tsx::shows the note on a marked word with its thread | GAP G16: the panel draws a note it is given; the page never gives one, so a click on a marked word shows no note or thread. |
| booth.test.tsx | `a note under a paragraph opens its text, and clicking empty space or a plain word clears the reference` | mock-only |  | GAP G16: nothing opens a note from its line under a paragraph. BoothText draws the note text and has no handler for it; the side panel has no way to be told. |
| booth.test.tsx | `opening a menu while recording pauses the take; closing it without choosing resumes` | ported | apps/ui/src/components/booth/page/BoothNextPage.test.tsx::opening a menu while recording holds the take; Escape lets go |  |
| booth.test.tsx | `an outside click resumes too` | ported | apps/ui/src/components/booth/page/BoothNextPage.test.tsx::a click outside closes the menu and lets go |  |
| booth.test.tsx | `choosing Start from here resumes and rolls from the chosen phrase` | ported | apps/ui/src/components/booth/page/BoothNextPage.test.tsx::choosing an item lets go and runs it |  |
| booth.test.tsx | `a menu opened when not recording does not start anything` | ported | apps/ui/src/components/booth/page/BoothNextPage.test.tsx::a menu opened when not recording starts nothing |  |
| booth.test.tsx | `the wheel scrolls by the pixels it is given, with no easing, and never moves the reading position` | ported | apps/ui/src/components/booth/reading/BoothText.test.tsx::moves the view by the pixels it is given, with no easing |  |
| booth.test.tsx | `starting a take brings the view back to the reading position` | covered | apps/ui/src/components/booth/reading/BoothText.test.tsx::setting browse false re-centres on the current word | The page clears browse when a take starts (useBoothPage.ts); the call is not asserted. |
| booth.test.tsx | `choosing another spot to start from moves the reading position and the view` | covered | apps/ui/src/components/booth/reading/BoothText.test.tsx::calls onSeek with the paragraph and the word and snaps the view back |  |
| booth.test.tsx | `the key reminders are centred, show arrow icons (named for screen readers) for movement and no backspace` | covered | apps/ui/src/components/booth/frame/frame.test.tsx::draws the catalogue hints with the right-click extra, and the timer | The arrow icons and no backspace come from input/hints.ts; KeyHints.test.tsx covers the region. |
| booth.test.tsx | `a click on a word still sets the reading position` | ported | apps/ui/src/components/booth/reading/BoothText.test.tsx::calls onSeek with the paragraph and the word and snaps the view back |  |
| booth.test.tsx | `opens the Booth on the sentence and word holding the selection start, marked as the place to start from` | ported | apps/ui/src/components/booth/page/BoothNextPage.test.tsx::opening the Booth at a paragraph and offset from Script starts there |  |
| booth-daw.test.tsx | `a DAW that is not running: Record is disabled and shows the capability's reason; Space says the same and starts nothing` | ported | apps/ui/src/components/booth/record/record.test.tsx::a-dawless-setup-disables-record-and-shows-the-capabilitys-reason | Space says the same: P "a refused precondition says why and starts nothing". |
| booth-daw.test.tsx | `one chapter is one track: a chapter with no track and one with several are refused with the DAW's reason` | ported | apps/ui/src/components/booth/record/record.test.tsx::one-chapter-one-track |  |
| booth-daw.test.tsx | `a chapter with exactly one track records, and no reason is shown` | covered | apps/ui/src/components/booth/record/record.test.tsx::one-chapter-one-track | The same test has the chapter with one track recording. |
| booth-daw.test.tsx | `the built-in recorder needs no track` | ported | apps/ui/src/components/booth/record/record.test.tsx::the-built-in-recorder-needs-no-track |  |
| booth-daw.test.tsx | `names the DAW in the setup chip: REAPER, the built-in recorder or Audacity` | ported | apps/ui/src/components/booth/record/record.test.tsx::the-control-wording-comes-from-the-capability | The names REAPER, Audacity and the built-in recorder: record.test.tsx "SetupChip". |
| booth-daw.test.tsx | `the setup chip says when the DAW has unsaved changes` | mock-only |  | GAP G10: no page reads DawProjectState (SN-D41, merged); record.test.tsx holds `it.todo("unsaved-changes-chip-text ...")`. |
| booth-daw.test.tsx | `arms only the chapter's track while recording and starts at the end of what is already on it` | covered | apps/desktop/bindings_readaloud_record_test.go::TestReadAloudRecordStartArmsThenRecordsFromTheEnd | Lua side: integrations/reaper/tests/transport_test.lua "record_start with end moves the cursor to the end of the last item and records there". Only the chapter's track: TestReadAloudRecordStartWithOtherTracksArmedArmsOnlyTheChapters. |
| booth-daw.test.tsx | `an explicit Start from here inside what is recorded is a punch: DAW-neutral and non-destructive in REAPER, so it just starts there` | ported | apps/ui/src/components/booth/roll/roll.test.tsx::inside what is recorded it is a punch and follows the plan | Non-destructive in REAPER: L "a punch the DAW keeps as a take starts without a question". |
| booth-daw.test.tsx | `Start from here beyond the end of the recording is not a punch: the take starts at the end` | ported | apps/ui/src/components/booth/roll/roll.test.tsx::beyond the end it is not a punch: no question, the take starts at the end |  |
| booth-daw.test.tsx | `punching in over recorded audio where the DAW would lose it asks first, and nothing starts until yes` | ported | apps/ui/src/components/booth/roll/roll.test.tsx::declining starts nothing | Asks first: L "audacity-without-backups-asks-and-holds-the-take". |
| booth-daw.test.tsx | `credits are recordable: the opening and closing credits have text, a track and a Record control` | ported | apps/ui/src/components/booth/page/BoothNextPage.test.tsx::open as a source with the unresolved-token warning, and record to their own region |  |
| booth-daw.test.tsx | `Escape asks "Stop recording?"; Keep recording leaves the take running on the Booth` | ported | apps/ui/src/components/booth/page/BoothNextPage.test.tsx::Escape asks "Stop recording?" once; Keep recording changes nothing |  |
| booth-daw.test.tsx | `Escape closes the question the same way (no silent stop)` | covered | apps/ui/src/components/booth/leave/useBoothLeaveGuard.test.tsx::keep-recording-stays-and-changes-nothing; the-take-is-held-while-the-question-is-open | Escape on the dialog is the Dialog primitive's cancel; the page test presses Escape to open the question, not to close it. |
| booth-daw.test.tsx | `Stop and leave stops the DAW's recording, saves the take, and then leaves` | ported | apps/ui/src/components/booth/page/BoothNextPage.test.tsx::Stop and leave stops the recording the app started, writes the passage map and then leaves |  |
| booth-daw.test.tsx | `every way out asks: page navigation, a chapter opened in Script, the setup chip` | ported | apps/ui/src/components/booth/page/BoothNextPage.test.tsx::the shell asks before the nav, Back, Forward, Alt+Arrow or a chapter opened in Script; its Yes stops the take as the page goes | The setup chip: P "the setup chip asks too". |
| booth-daw.test.tsx | `the question is asked once, and the same change goes through after Stop and leave` | ported | apps/ui/src/components/booth/leave/useBoothLeaveGuard.test.tsx::asked-once: a second exit does not stack a dialog | The same change goes through: V "stop-and-leave-stops-then-replays-the-navigation". |
| booth-daw.test.tsx | `with nothing recording, leaving needs no question` | ported | apps/ui/src/components/booth/page/BoothNextPage.test.tsx::with nothing recording, leaving needs no question |  |
| booth-daw.test.tsx | `the question holds the take while it is open` | ported | apps/ui/src/components/booth/leave/useBoothLeaveGuard.test.tsx::keep-recording-stays-and-changes-nothing; the-take-is-held-while-the-question-is-open |  |
| booth-daw.test.tsx | `names the DAW in the question` | ported | apps/ui/src/components/booth/leave/useBoothLeaveGuard.test.tsx::recording-asks-stop-recording, naming the DAW from the report |  |
| booth-daw.test.tsx | `REAPER keeps the earlier audio as a take, so a roll needs no question` | ported | apps/ui/src/components/booth/roll/roll.test.tsx::reaper-keeps-the-earlier-audio-so-a-roll-needs-no-question |  |
| booth-daw.test.tsx | `Audacity without backups: the roll is destructive, so it asks and the take is held; no answers no roll` | ported | apps/ui/src/components/booth/roll/roll.test.tsx::audacity-without-backups-asks-and-holds-the-take | On the page: P "a destructive roll asks with the take held; no rolls nothing, yes rolls confirmed". |
| booth-daw.test.tsx | `Audacity without backups: yes rolls, confirmed, and logs the punch` | ported | apps/ui/src/components/booth/roll/roll.test.tsx::yes-rolls-confirmed-and-logs-the-punch |  |
| booth-daw.test.tsx | `Audacity with backups is not destructive: it just rolls` | ported | apps/ui/src/components/booth/roll/roll.test.tsx::backups-make-the-roll-non-destructive |  |
| booth-daw.test.tsx | `Start from here while recording goes through the same question` | ported | apps/ui/src/components/booth/roll/roll.test.tsx::start-from-here-while-recording-goes-through-the-same-question |  |
| booth-daw.test.tsx | `a DAW that cannot roll says why and does not roll` | ported | apps/ui/src/components/booth/roll/roll.test.tsx::a-dawless-or-rollless-setup-says-why |  |
| booth-daw.test.tsx | `a chapter recorded partway offers Resume at the paragraph the recording ends in; nothing starts` | ported | apps/ui/src/components/booth/resume/ResumeOffer.test.tsx::a-chapter-recorded-partway-offers-resume-at-the-paragraph-the-recording-ends-in | Choosing it moves the position and starts nothing: P "offers where the recording ends and choosing it moves the reading position". |
| booth-daw.test.tsx | `a chapter with nothing recorded, and a finished one, offer nothing` | ported | apps/ui/src/components/booth/resume/ResumeOffer.test.tsx::a-chapter-with-nothing-recorded-and-a-finished-one-offer-nothing |  |
| booth-daw.test.tsx | `no offer while recording` | ported | apps/ui/src/components/booth/resume/ResumeOffer.test.tsx::no-offer-while-recording |  |
| booth-daw.test.tsx | `where a take stopped is remembered for the chapter and offered next time` | ported | apps/ui/src/components/booth/resume/ResumeOffer.test.tsx::where-a-take-stopped-is-remembered-and-offered-next-time |  |
| booth-daw.test.tsx | `the answer is read from the live project, or from the saved one when the DAW is not running; an estimate is not confident` | ported | apps/ui/src/components/booth/resume/ResumeOffer.test.tsx::shows-the-source-text-and-an-estimate-says-it-is-not-sure | The source: O "the-source-and-confidence-are-shown", "shows-the-saved-project-source". |
| booth-daw.test.tsx | `a take that read over a flagged place adds it to Pickups as a speech pickup, with Undo; there is no way to flag by hand` | mock-only |  | GAP G11: the page lists suspected lines in the side panel only. Nothing adds a taken-over flagged place to the shared pickup list as a speech pickup with Undo; the Undo and the Automatic mark exist only inside a pickup session (G1). |
| booth-daw.test.tsx | `shows the suspected lines in the side panel, where each can be dismissed` | ported | apps/ui/src/components/booth/suspected/SuspectedLines.test.tsx::each-line-can-be-dismissed-with-undo: records one dismissed decision, reads Dismissed and offers Undo | No manual flag: Z "has no key handler and no add or flag control". |
| booth-daw.test.tsx | `reading the same place again does not add it twice, and a dismissed one stays dismissed` | ported | apps/ui/src/components/booth/suspected/SuspectedLines.test.tsx::the-key-is-stable-and-a-dismissed-line-stays-dismissed: a re-read comes back dismissed, once |  |
| booth-daw.test.tsx | `feeds Pickups: the line is in the shared pickup list and reads "Speech"` | mock-only |  | GAP G11: no test shows a suspected line in the shared pickup list, reading "Speech". |
| booth-daw.test.tsx | `a take that does not reach a flagged place adds nothing` | ported | apps/ui/src/components/booth/suspected/suspectedLines.test.ts::a-take-that-does-not-reach-a-flagged-place-adds-nothing: flags outside the take are not listed |  |
| booth-daw.test.tsx | `the provider decides: another provider's flags are the ones that appear` | mock-only |  | The mock swaps its speech provider to show another provider's flags. The real app has one flag source, the Teleprompter sidecar, whose engine is a Settings > Booth choice (PRD phase 9 dropped the Booth engine picker). |
| booth-daw.test.tsx | `F11 takes the whole screen and gives it back; it is in the jump menu and the footer` | covered | apps/ui/src/components/booth/useFullscreenKey.test.tsx::toggles fullscreen on F11 | GAP G12: useFullscreenKey.ts has no importer; the page binds `booth.fullscreen` itself (useBoothPage.ts) and no test presses F11 on it. pageScan.test.ts only lists the command name. The footer hint and the jump menu come from the catalogue. |
| booth-daw.test.tsx | `a pedal only starts and stops: Space is the one recording key and nothing else records, rolls or flags` | covered | apps/ui/src/components/booth/page/BoothNextPage.test.tsx::a pedal only starts and stops: no other key records, rolls or flags | The pedal sends Space; the hardware step is on #1495. |
| booth-daw.test.tsx | `the app's done state writes through to the marker's name, both ways` | covered | apps/ui/src/components/booth/pickups/PickupSession.test.tsx::done-writes-through-to-the-marker: both ways, and a refusal leaves the line open and says why | GAP G1: not mounted on the page. The marker write itself: apps/desktop/internal/proofing/markers_test.go and integrations/reaper/tests/pickups_test.lua. |
| booth-daw.test.tsx | `a pickup marked done by a take in a pickup session is written through too` | covered | apps/ui/src/components/booth/pickups/PickupSession.test.tsx::done-writes-through-to-the-marker: both ways, and a refusal leaves the line open and says why | GAP G1: the take-driven write is a-take-that-ran-over-a-line-marks-it-recorded-and-the-toast-can-undo. |
| booth-daw.test.tsx | `on open, a pickup done in the DAW is done here, and one reopened in the DAW is open here` | covered | apps/ui/src/components/booth/pickups/PickupSession.test.tsx::the-booth-reconciles-with-the-daw-on-open: done in the DAW is done here, and a reopened one is open | GAP G1: not mounted on the page. |
| booth-daw.test.tsx | `the Booth reconciles when it opens` | covered | apps/ui/src/components/booth/pickups/PickupSession.test.tsx::the-booth-reconciles-with-the-daw-on-open: done in the DAW is done here, and a reopened one is open | GAP G1: not mounted on the page. |
| booth-daw.test.tsx | `a change made while the DAW was not running waits and goes through when it is back; the DAW does not undo it` | mock-only |  | GAP G13: when the DAW is not running the real write is refused and the line stays open (K "a refusal leaves the line open and says why"); the mock queues the change and sends it when the DAW is back. No PRD row asks for a queue. |
| booth-daw.test.tsx | `a DAW with no markers leaves nothing waiting` | mock-only |  | GAP G13: part of the same divergence: with no queue there is nothing to leave waiting, and no test says a markerless DAW refuses cleanly. |
| booth-daw.test.tsx | `"as of last save" says when the project was saved and whether the DAW has more since` | mock-only |  | GAP G10: "as of last save" needs DawProjectState on a page; ResumeOffer shows the source only ("shows-the-saved-project-source"). |
| booth-daw.test.tsx | `keeping a take the DAW has re-created is refused, shown, and changes nothing in the app` | covered | apps/ui/src/ports/daw.contract.test.ts::host-adapter-maps-every-stale-path: a stale take, a stale finding and a missing track answer code stale with the host sentence | The Editing page shows it; the Editing audit owns that page's toast. |
| d2-booth.test.tsx | `Levels is an icon button with a tooltip, not a word, and is not the plain microphone or the speaker glyph` | covered | apps/ui/src/components/booth/frame/frame.test.tsx::opens a menu with the microphone choice and the level meter, and leaves the room tone in the footer | The describe block is named levels-is-an-icon-button-with-a-tooltip; the test asserts the menu, not the icon. |
| d2-booth.test.tsx | `the Levels popover no longer repeats the room tone; the footer still shows it` | covered | apps/ui/src/components/booth/frame/frame.test.tsx::opens a menu with the microphone choice and the level meter, and leaves the room tone in the footer | GAP G14: the footer text is the constant "Room not measured yet" in BoothNextPage.tsx, not the project's measured room tone. |
| d2-booth.test.tsx | `the key hints are the shared footer (own tone and top line), inside the Booth footer, with the mouse for right-click` | ported | apps/ui/src/components/primitives/KeyHints.test.tsx::footer-has-its-own-tone-and-line | Inside the Booth footer, with the right-click extra: frame.test.tsx "draws the catalogue hints with the right-click extra, and the timer". |

## Rulings

Ids of [the ruling index](studio-next-ruling-index.md) that the Booth mock tests rely on. All twelve are `agreed` or `agreed-with-conditions`; one test each, chosen to be the one that shows the ruling.

| ruling id | test |
| --- | --- |
| BO-1 | apps/ui/src/components/booth/page/BoothNextPage.test.tsx::down and up step a phrase, left and right a word |
| BO-2 | apps/ui/src/components/booth/record/record.test.tsx::names no DAW in its sources |
| BO-3 | apps/ui/src/components/booth/roll/roll.test.tsx::a destructive roll asks, naming the DAW from the report |
| BO-4 | apps/ui/src/components/booth/page/BoothNextPage.test.tsx::open as a source with the unresolved-token warning, and record to their own region |
| BO-5 | apps/ui/src/components/booth/leave/useBoothLeaveGuard.test.tsx::recording-asks-stop-recording, naming the DAW from the report |
| CF-3 | apps/desktop/bindings_coverage_engines_test.go::TestCoverageEnginesAreTheApprovedWhisperModels |
| CF-4 | apps/ui/src/components/booth/page/BoothNextPage.test.tsx::a pedal only starts and stops: no other key records, rolls or flags |
| CF-5 | apps/ui/src/components/booth/suspected/SuspectedLines.test.tsx::has no key handler and no add or flag control |
| CF-6 | apps/ui/src/components/booth/reading/BoothText.test.tsx::moves the view by the pixels it is given, with no easing |
| CF-10 | apps/ui/src/components/booth/page/BoothNextPage.test.tsx::Escape asks "Stop recording?" once; Keep recording changes nothing |
| CF-11 | apps/ui/src/components/booth/roll/roll.test.tsx::audacity-without-backups-asks-and-holds-the-take |
| CF-14 | apps/desktop/bindings_readaloud_record_test.go::TestReadAloudRecordStartArmsThenRecordsFromTheEnd |

### Agreed rulings with parts untested

A ruling row proves one part. These are the parts of the same rulings that have no test, or are not built.

| ruling | part | state |
| --- | --- | --- |
| BO-1 | 2 auto-stop at the end | Not built (G2). |
| BO-1 | 7 suspected flags | Listed in the side panel and dismissible; not in Pickups (G11). |
| BO-1 | 13 foot pedal | The pedal sends Space; the key rule is tested (CF-4). The hardware step is on #1495 ("New Booth page in the app"). |
| BO-1 | 14 pickup session in Booth | Seam built and tested, not mounted (G1). |
| BO-1 | 17 F11 | The page binds it; no test presses it (G12). |
| CF-3 | Whisper-class confirmation in the Booth | Not built, no slice (G17). The "Moonshine is the Booth's, not a recording-check engine" half is tested by the row above. |
| CF-14 | the reason on the Record control | Tested: record.test.tsx "a-dawless-setup-disables-record-and-shows-the-capabilitys-reason", "one-chapter-one-track". |
| CF-14 | only the chapter's track armed | Go: TestReadAloudRecordStartWithOtherTracksArmedArmsOnlyTheChapters. The in-REAPER result is #1495. |

## Gaps

Every `GAP` row and every `covered` row that names a gap. A gap is real behaviour (or an agreed ruling) with no real test, a seam the page does not mount, or a mock behaviour the page lacks. The coordinator opens the follow-up; where a slice already exists it is named. "Test" is the proposed name, in the file that would hold it.

| id | what is missing | proposed test | owner |
| --- | --- | --- | --- |
| G1 | Bookmarks and the pickup session are not on the page. `B`, `Alt+]`, `Alt+[`, the ribbons and "Bookmark here" do nothing, although the footer lists them. The pickup session has no address parameter, no "Open in Booth" target, no exit to Pickups, and N and Shift+N are not bound | `BoothNextPage.test.tsx` `B bookmarks the word being read and the toast Undo takes it back`; `BoothNextPage.test.tsx` `a pickup session lists its lines, steps with N and exits to Pickups` | SN-O103 (#1516), closed |
| G2 | Nothing stops a take when the reading reaches the end of the chapter (BO-1 item 2). The listening session can end there; the DAW take keeps recording | `BoothNextPage.test.tsx` `a take stops by itself at the end of the chapter and says the take is saved` | Booth fix-up |
| G3 | The text size is page state at 40 and is not saved; there is no reader font and no text popover | `BoothNextPage.test.tsx` `the text size and font come from the saved choices`; `BoothTop` `the text popover writes the reader font and the Booth size` | Booth fix-up |
| G4 | The stepper writes the title alone, not the manuscript heading style (gutenberg, numbered, colon) | `BoothNextPage.test.tsx` `names the chapter in the manuscript style` | Booth fix-up; the same cause as G13 of the Script note |
| G5 | Confirming or changing a speaker chip writes through `data.correctCue`; no test checks the write | `BoothNextPage.test.tsx` `confirming a suggested chip writes the shared speaker` | Booth fix-up |
| G6 | An unmount with no question leaves the DAW recording (the mock stops it). Exit paths with no page test: the palette's jump, a link from a toast, the mouse buttons, a project switch from the page | `BoothNextPage.test.tsx` `every way out of the page asks while a take records` | Booth fix-up; ruling needed, see [Questions](#questions-for-the-coordinator) |
| G7 | The right-click menu's entries (Next phrase, Back one phrase, Punch and roll, Larger text, Smaller text, Exit Booth) have no test | `BoothNextPage.test.tsx` `right-click offers the phrase, take and text commands` | Booth fix-up |
| G8 | Nothing tests that the Booth has no mirror text | `pageScan.test.ts` `has no mirror text` | Booth fix-up |
| G9 | Clicking the text above 1280 pixels is not asserted to leave the inline panel open | `BoothSidePanel.test.tsx` `above 1280 clicking the text does not close the inline panel` | Booth fix-up |
| G10 | No page reads `DawProjectState` (SN-D41). The setup chip does not say the DAW has unsaved changes and the resume line does not say "as of last save" with the save time; `record.test.tsx` holds an `it.todo` for it | `record.test.tsx` `unsaved-changes-chip-text` (the todo); `ResumeOffer.test.tsx` `as-of-last-save-says-when-the-project-was-saved` | Booth fix-up |
| G11 | A suspected line is not added to the shared pickup list as a speech pickup with Undo; it is listed in the side panel only | `SuspectedLines.test.tsx` `a take that read over a flagged place adds a Speech pickup with Undo` | Booth fix-up (waits on G1 for the session half) |
| G12 | `useFullscreenKey.ts` has no importer; the page binds F11 itself and no test presses it | `BoothNextPage.test.tsx` `F11 takes the window fullscreen and the Booth gives it back on leaving` | Booth fix-up |
| G13 | The pickup write-through refuses when the DAW is not running and leaves the line open; the mock queues the change and sends it when the DAW is back. No PRD row asks for a queue | `PickupSession.test.tsx` `a change made while the DAW is not running waits and goes through when it is back` | Coordinator ruling first |
| G14 | The footer's room tone is the constant "Room not measured yet" (`BoothNextPage.tsx`); the measurements port has room tone | `BoothNextPage.test.tsx` `the footer shows the project's measured room tone` | Booth fix-up |
| G15 | No test presses Page Down or Page Up on the page | `BoothNextPage.test.tsx` `Page Down and Page Up scroll the view without moving the reading position` | Booth fix-up |
| G16 | A click on a marked word shows no note or thread, and a note under a paragraph cannot be opened: the page sets only a Story Bible entry. `useBoothReference` (the hook the test drives) is not used by the page | `BoothNextPage.test.tsx` `clicking a marked word shows the note and its thread in the side panel` | Booth fix-up |
| G17 | The live-engine design (Moonshine live, Whisper-class confirmation after) has no build slice | see [The live engine](#the-live-engine) | Coordinator |

G1 to G16 are also row notes above. A layout check of the page against the mock is the cutover QA line on #1495 ("walk each Studio Next page against the mock"); no gap here is layout.

### Questions for the coordinator

1. **G6.** The mock stops a take when the Booth goes away without being asked. The real page stops it only after the shell asked and the narrator said yes, and its test asserts that an unanswered unmount does not stop the take (`BoothNextPage.test.tsx` "records with the built-in recorder; leaving asks, and unmounting without the answer does not stop the take"). That follows ADR 0790 and ADR 0232 (the app stops only a recording it started, and only after asking). The PRD's hypothesis is that no path leaves a recording running with no way to stop it. Decide whether a page that goes away unasked should stop the take, or whether the exits that can do that must be proved unreachable by test (G6).
2. **G13.** Queue the pickup change while the DAW is off, or refuse and leave the line open as built.

## The live engine

Item 10 of the PRD's [Proposed Solution](../prds/studio-next-booth.prd.md#proposed-solution): the engine picker lists what the host reports, Moonshine is the live engine in the Booth only, and Whisper-class models confirm after. #1495 names the design as Moonshine live plus a faster-whisper trailing confirmation pass.

**There is no build slice for the confirmation pass.** What the repo has, read from code:

| Part | State | Evidence |
| --- | --- | --- |
| Moonshine as a live engine | Built. Live mode only, Windows only, from a verified install | `apps/desktop/internal/asrport/asrport.go` (`Moonshine`, `ModeLive`, `installedOnly`) |
| Moonshine kept out of standalone checks | Built and tested | `apps/desktop/bindings_coverage_engines_test.go` `TestCoverageEnginesAreTheApprovedWhisperModels` |
| The engine and model choice | In Settings > Booth; the mock Booth has no picker | PRD phase 9 is "dropped" (SNO-1 finding 8); `BoothNextPage.test.tsx` "has no engine, model, microphone field or \"Record with\" control" |
| A trailing pass that re-decodes a closed segment with a Whisper model and confirms or clears a live flag | Not built | `git grep -n -i -E "trailing\|confirmation pass\|recheck" -- sidecars apps/desktop/internal/teleprompter` finds no such code. #1476 lists "Confirming a live flag later (a recheck on click, or a trailing confirmation pass)" under **Not built** |
| A slice for it | None | The only open issue labelled `prd:SNO` is #1516, which mounts bookmarks and the pickup session. The PRD has no phase for it: phase 9 (the engine picker) was dropped and phase 10 is the swap. A search of the repo's issues for "Moonshine", "trailing" and "faster-whisper" returns none |

The real-microphone run of the design is already a line on #1495 ("Booth live listening", #1476). The default engine stays `whisper` until #1476's evaluation passes ADR 0414's gate.

## Old equivalents

Run on `main` at `7e4a511`. `gone` means the command printed nothing for the old name, or only the Studio Next code that replaced it. Nothing was deleted here.

| item | command | output | result |
| --- | --- | --- | --- |
| Old Booth page and its files | `git ls-files -- apps/ui/src/components/booth/BoothPage* .../BoothSession* .../BoothView* .../ReadingControlBar* .../BuiltinRecorder* .../MicrophoneField* .../useInputLevel* .../useReadAloudReaperState* .../ReaderRail* .../ReaderFlagsPanel* .../ChapterSuggestionHint*` | (no output) | gone |
| Route | `git grep -n -E 'path="/(booth\|teleprompter\|companion)' -- apps/ui/src/App.tsx` | `/booth` mounts `BoothNextPage`; `/teleprompter` redirects to `/booth`; `/companion` mounts the Companion | gone (old page); routes kept by design |
| State-catalogue rows and drivers | `grep -o "state: '[^']*'" apps/ui/tests/visual/catalog/booth.ts`; `wc -l apps/ui/tests/visual/catalog/booth.ts apps/ui/tests/visual/drivers/booth.ts` | 11 rows: `setup`, `refusal`, `recording`, `leave-dialog`, `roll-confirm`, `resume`, `levels-menu`, `credits-unresolved`, `dark`, `companion-default`, `companion-listening`; 77 and 103 lines. No resume-prompt, `reaper-*`, `recorder-*` or `exit-confirm` row | gone; the `bookmarks-ribbon` and `pickup-session` rows SN-O10 named are missing: leftover L5 |
| Aria snapshots | `ls apps/ui/tests/aria/snapshots \| grep -i -E "booth\|stop-\|companion"` | `companion-panel.aria.yml`, `confirm-stop-recording.aria.yml`; `confirm-stop-reading` is not listed | gone |
| Doc screenshots | `grep -n -i booth apps/ui/tests/visual/doc-screenshots.json`; `ls -la docs/images/ui \| grep -i booth`; `git log -1 --format='%h %ad' -- docs/images/ui/booth-setup.webp` | 5 manifest entries (`booth-setup`, `booth-listening`, `booth-waiting`, `booth-flag`, `booth-credits`), captions of the new page; the 5 `.webp` files were last written on 2026-10-11 (`534854a`), before the swap | leftover L1 |
| Silent stop on Escape or page leave (BO-5, ADR 0790) | `git grep -n -E "recordStop\(\|readAloudRecordStop\|afterStop\(\|stopRecording\(" -- apps/ui/src ':!*.test.*'` (in the Booth); `git grep -n -E "RecordStop\(\|stopReadAloudRecordingOnShutdown" -- apps/desktop ':!*_test.go'` | Booth stops: `useRecordControl.ts:82` (the Record control's Stop), `useBoothLeaveGuard.ts:60` (after "Stop and leave"), `useBoothPage.ts:238,301` (the same stop, and the unmount after the shell asked). Host: `bindings_readaloud_record.go` Stop and the shutdown stop (threat-model row 5k, documented). `CompanionShell.tsx:163` is the Companion's | gone; no Booth path stops without the question. G6 lists the exits no page test proves |
| Project switch during a REAPER take | `grep -n "^func Test" apps/desktop/app_test.go` near line 712 | `TestAReaperTakeTheAppStartedBlocksAProjectSwitch`, `TestATakeTheAppDidNotStartDoesNotBlockAProjectSwitch`, `TestTheProjectSwitchBlockLiftsWhenTheTakeEnds` | gone (the gap the deleted Booth audit named is closed) |
| Controls with no mock equivalent | `git grep -n -i -E "Arm only\|Ready chip\|Record with\|mirror text" -- apps docs/guides ':!*.test.*'` | "Arm only": a row text in `interactionFeedback/teleprompter.ts:43` for the Companion's hook. "Record in REAPER": the Companion's confirm and the project setting it reads (`app.go:1631`). `BoothNextPage.test.tsx` "has no engine, model, microphone field or \"Record with\" control" | gone from the Booth |
| Old names in code and docs | `git grep -n -E "BoothPage\|BoothSession\|BoothView\|ReadingControlBar\|BuiltinRecorder\|MicrophoneField\|useInputLevel\|ReaderRail\|ReaderFlagsPanel" -- apps docs/guides docs/architecture docs/reference docs/design docs/operations ':!apps/desktop/shell'` | Comments only: `bindings_readaloud_record.go:16,165`, `CompanionShell.tsx:28,131,134`, `ReadAlongView.tsx:15,50,53`, `ResumePrompt.tsx:483`; `BoothNextPage.tsx` has its own local `BoothSession` function | leftover L4 (comments) |
| Interaction-feedback rows and ratchet tests keyed by deleted paths | the same `git grep`, over `apps/ui/src/interactionFeedback*` and the ratchet tests | no entry names a deleted file; Companion entries stay | gone |
| Guide `booth.md` | `grep -n -i -E "record in reaper\|arm only\|stop reading\|ready chip\|mirror\|flag for edit" docs/guides/using-the-app/booth.md`; `grep -n -i "old Teleprompter" docs/guides/using-the-app/booth.md` | no feature of the old page is described; line 91 says "The old Teleprompter page and the Manuscript's Read aloud dialog are now this page" | leftover L6 (one sentence); the images are L1 |
| Companion-shared files: consumers | `git grep -l -E "from '[^']*/<name>'" -- apps/ui/src ':!*.test.*' ':!*.stories.*'` per file, and a relative-import graph of `apps/ui/src` from `companion/CompanionPage.tsx` and from `page/BoothNextPage.tsx` (a throwaway script, not committed) | [Companion-shared files](#companion-shared-files) below: every kept file has a consumer | gone (all kept files used) |
| Companion-shared files: nothing unused remains | the same graph: files under `components/booth/` reachable from neither root | `bookmarks/*` and `pickups/*` (G1, unmounted), `useFullscreenKey.ts`, `side/useBoothReference.ts`, and test fixtures | leftover L2, L3; the rest is G1 |
| Booth guide inbound links | `git grep -l "booth.md" -- docs README.md ':!docs/research'` | `docs/README.md`, `docs/architecture/manuscript-teleprompter.md` and the guides `README.md`, `navigation.md`, `production.md`, `proof.md`, `script.md`, `settings.md`, `story-bible.md` link to it; `docs-references.mjs` passes | gone |

### Companion-shared files

The Companion (`/companion`, DQ-13) stays as built. Each file the swap kept, with a consumer found on `main`:

| file | consumer in the Companion or elsewhere |
| --- | --- |
| `CompanionShell.tsx`, `CompanionThisChapter.tsx` | `companion/CompanionHost.tsx`; `CompanionShell.tsx` |
| `ReadAlongView.tsx`, `ReaderText.tsx`, `ReaderKey.tsx` | `CompanionShell.tsx`; `ReadAlongView.tsx`; `ReadAlongView.tsx` |
| `readerFlags.ts`, `readerPreferences.ts` | `ReaderText.tsx`, `companion/CompanionHost.tsx` |
| `useFollowCursor.ts` | `CompanionShell.tsx`, `ReadAlongView.tsx`, `ReaderText.tsx`, `companion/CompanionHost.tsx` |
| `useRecordInReaper.ts`, `RecordInReaperConfirm.tsx` | `CompanionShell.tsx`, `companion/CompanionHost.tsx` |
| `ResumePrompt.tsx`, `UnresolvedCreditsWarning.tsx` | `companion/CompanionHost.tsx` |
| `useResumeLocate.ts`, `WhisperModelPrompt.tsx` | `ResumePrompt.tsx` |
| `boothProgress.ts` | `CompanionThisChapter.tsx`, and the Editing page (`editing/flags/FlagCard.tsx`, `editing/script/Paragraph.tsx`, `Word.tsx`, `announce.ts`) |
| `readerModel.ts`, `usePacedCursor.ts`, `useTeleprompterSession.ts` | the Companion and the Booth page, `readerModel.ts` also `App.tsx`, `api/teleprompterMock.ts` and the Script page |
| `useBoothRecording.ts`, `useRecorder.ts` | `App.tsx` only (the toast hold and the engine chip); the Companion does not import them |

### Leftovers

A leftover is a gap with paths. Nothing was deleted here. The swap slice that missed each is SN-O10 (#1518) unless noted; SN-C4 and the coordinator open the fixers.

| id | leftover | paths | note |
| --- | --- | --- | --- |
| L1 | Five doc images show the old Booth | `docs/images/ui/booth-setup.webp`, `booth-listening.webp`, `booth-waiting.webp`, `booth-flag.webp`, `booth-credits.webp` | The manifest entries and the guide captions were rewritten; the images were not regenerated (`doc-screenshot-sync`). |
| L2 | `useFullscreenKey` has no importer | `apps/ui/src/components/booth/useFullscreenKey.ts`, `useFullscreenKey.test.tsx` | The page binds F11 in `useBoothPage.ts` (G12). Delete both with the G12 fix, or use the hook. |
| L3 | `useBoothReference` is used by a test only | `apps/ui/src/components/booth/side/useBoothReference.ts` | The page keeps its own state (G16). |
| L4 | Comments name deleted files | `apps/desktop/bindings_readaloud_record.go:16,165`, `apps/ui/src/components/booth/CompanionShell.tsx:28,131,134`, `ReadAlongView.tsx:15,50,53`, `ResumePrompt.tsx:483` | The Companion files are frozen (DQ-13): fix the comments only. |
| L5 | Two visual rows missing | `booth/bookmarks-ribbon`, `booth/pickup-session` in `apps/ui/tests/visual/catalog/booth.ts` | SN-O10 acceptance 7 lists them; they wait on G1 (#1516 owns them). |
| L6 | A guide sentence about a removed page | `docs/guides/using-the-app/booth.md:91` | "The old Teleprompter page and the Manuscript's Read aloud dialog are now this page". |

The tracked `apps/desktop/shell` binary is already L4 of [the Script and Story Bible note](studio-next-parity-script-and-bible.md#leftovers); it holds old Booth binding names too and is not repeated here.

## Verification

```text
node scripts/ci/studio-next-parity.mjs
cd apps/ui && pnpm exec vitest run \
  src/chapterName.test.ts
  src/components/booth/frame/frame.test.tsx
  src/components/booth/leave/useBoothLeaveGuard.test.tsx
  src/components/booth/page/BoothNextPage.test.tsx
  src/components/booth/pickups/PickupSession.test.tsx
  src/components/booth/reading/BoothText.test.tsx
  src/components/booth/reading/boothUnits.test.ts
  src/components/booth/record/record.test.tsx
  src/components/booth/resume/ResumeOffer.test.tsx
  src/components/booth/roll/roll.test.tsx
  src/components/booth/side/BoothSidePanel.test.tsx
  src/components/booth/suspected/SuspectedLines.test.tsx
  src/components/booth/suspected/suspectedLines.test.ts
  src/components/booth/useFullscreenKey.test.tsx
  src/components/primitives/KeyHints.test.tsx
  src/ports/daw.contract.test.ts
  src/components/booth/side/decorations.test.ts
  src/components/booth/frame/progressLine.test.ts
  src/components/booth/usePacedCursor.test.ts
  src/components/booth/readerModel.test.ts
cd apps/desktop && go test . -run 'TestReadAloudRecordStart|TestCoverageEnginesAreTheApprovedWhisperModels|TestAReaperTakeTheAppStartedBlocksAProjectSwitch'
pnpm lint:md && node scripts/ci/docs-slop.mjs && node scripts/ci/docs-references.mjs
```

Results on this branch: the checker passes (4 docs, 355 cases mapped, 44 excused); vitest passes (20 files, 308 tests and 1 todo, the todo being the unsaved-changes chip of G10). **The Go tests were not run:** the root `apps/desktop` package needs GTK 4 and WebKitGTK, which this container lacks, so `go test .` stops at the build. The checker proves the three Go test names exist; CI runs the package. The Lua harness tests and `internal/proofing/markers_test.go` named in two row notes were not run either; no row cites them as its test.
