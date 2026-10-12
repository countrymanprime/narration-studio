# Studio Next parity: foundations, shell, DAW model and the ADR register (SN-C37)

Mock files: palette.test.tsx, d2-keycaps.test.tsx, form-primitives.test.tsx, primitives.test.tsx, no-raw-controls.test.ts, no-hardcoded-speakers.test.ts, foundations.test.ts, scenarios.test.tsx, daw.test.ts, daw-wording.test.tsx

**Date:** 2026-10-12. **Code audited:** `main` at `c0fd988`. **Slice:** SN-C37 (#1214), SNC-3 and SNC-Q4 of the [Studio Next cutover PRD](../prds/studio-next-cutover.prd.md). **Mock audited:** `docs/research/mockups/studio-next/tests/`. **Register:** [studio-next-adr-register.prd.md](../prds/studio-next-adr-register.prd.md). SN-C4 reads this note when it flips the ratchets; SN-C51 and SN-C6 read it before the mock goes.

Method: these are the ten mock test files no page owns. Each mock case is a row below, mapped to a real test by name, after reading the mock case and the real test. The checker is `node scripts/ci/studio-next-parity.mjs`. It proves a cited file exists and holds the name; it does not prove the test asserts what the mock case asserts, so a row's note says where the real test asserts less. The ADR sections read the `**Status:**` and `**Supersedes:**` lines of the files in `docs/adr/`, not the PRDs. The app was not run. The cited tests were run once (see [Verification](#verification)).

## Result

- 91 mock cases: 25 `ported`, 56 `covered`, 10 `mock-only`. Of the 10, 8 are gaps (notes starting `GAP`) and 2 test the mock's own fixture factory and tag stripper. 11 `covered` rows name a gap in their note.
- 12 gaps in the cases (F1 to F12), under [Gaps](#gaps). Only F12 is DAW behaviour: a punch chosen before a take does not reach the DAW. F3 needs a ruling before any build.
- `scenarios.test.tsx`, `no-hardcoded-speakers.test.ts` and `no-raw-controls.test.ts` are `covered` by their real counterparts (SN-S61, SN-S8, SN-F7). Each counterpart is narrower than the mock (F10, F11; one raw-control ceiling left for SN-C4).
- All 30 `daw.test.ts` cases have a named real test: a `dawport` Go test, the `DawClient` contract suite (`apps/ui/src/ports/daw.contract.test.ts`, SN-D21) or a Lua harness test, except two rows whose strongest test is a binding test in the root `apps/desktop` package (the marker kind prefix, and several linked tracks).
- Rulings: SN0-Q1 to Q9 and DQ-1 to DQ-18 are in [Rulings and their ADRs](#rulings-and-their-adrs). 16 rulings are recorded by a merged ADR (DQ-7, DQ-8 and DQ-15 by ADRs still Proposed). Nine need none, for the reason given. DQ-17 and DQ-18 have no ADR that records the supersession they rule (R1, R2).
- Register check: two Status lines are fixed in this PR: ADR 0165 now names ADR 0857, and ADR 0147 now names ADR 0858 beside ADR 0860. Five ADRs under the DQ-1 "where they differ" rows have not been compared with the mock (R3). Five superseding ADRs are still Proposed, for the owner (see [Owner steps](#owner-steps)).

**The checker has no status for a gap.** A mock case with no real test must still have a row, and only `mock-only` passes with an empty `real test`. Gap rows therefore carry `mock-only` and a note that starts `GAP Fn`, as the other parity notes do. They are not excused: each has an entry under [Gaps](#gaps), and SN-C4 should count them as open. A `covered` row whose note starts `GAP Fn` has a real test that asserts less than the mock case; it is open too.

## Mock cases

| mock file | mock case | status | real test | note |
| --- | --- | --- | --- | --- |
| palette.test.tsx | `opens on a short list: one row per group, not every command` | ported | apps/ui/src/components/layout/JumpMenu.test.tsx::opens-on-a-short-list: one row per group, at most ten, and Go to Production waits for its group |  |
| palette.test.tsx | `a group opens to its own commands and Back returns` | ported | apps/ui/src/components/layout/JumpMenu.test.tsx::a-group-opens-to-its-own-commands-and-back-returns: All commands and Backspace on an empty field both return |  |
| palette.test.tsx | `typing searches everything and running a command closes the menu` | ported | apps/ui/src/components/layout/JumpMenu.test.tsx::typing-searches-everything-and-running-a-command-closes-the-menu | Asserts the command runs and the menu closes; the test supplies its own Go to commands, so the page change is not asserted. |
| d2-keycaps.test.tsx | `draws arrows, Enter, Esc, Tab and Backspace as icons that keep their name for screen readers` | ported | apps/ui/src/components/primitives/KeyCap.test.tsx::arrows-enter-esc-tab-backspace-are-glyphs-with-names | The name is a `title` and `.sr-only` text, not the mock's `data-tip`. |
| d2-keycaps.test.tsx | `draws the space bar and the right-click as small inline drawings (Font Awesome has neither)` | ported | apps/ui/src/components/primitives/KeyCap.test.tsx::space-and-right-click-are-drawn | The wider Space cap is not asserted. |
| d2-keycaps.test.tsx | `keeps every other key as text: letters, modifiers, F-keys, Page Up` | ported | apps/ui/src/components/primitives/KeyCap.test.tsx::other-keys-stay-text |  |
| d2-keycaps.test.tsx | `knows the other spellings of a key and names them` | ported | apps/ui/src/components/primitives/KeyCap.test.tsx::other-spellings-resolve |  |
| d2-keycaps.test.tsx | `shows the keys of each hint as key caps, followed by what they do, in a note region` | ported | apps/ui/src/components/primitives/KeyHints.test.tsx::footer-is-a-note-region | The region is named "Keyboard shortcuts". |
| d2-keycaps.test.tsx | `has its own tone and a line above it, and sits at the bottom of the scrolling page on Proof and Editing` | covered | apps/ui/src/components/primitives/KeyHints.test.tsx::footer-has-its-own-tone-and-line | GAP F8: no test checks where the footer sits. ProofPage.tsx puts KeyHints in a sticky wrapper; EditingBody.tsx shows it with none. |
| d2-keycaps.test.tsx | `draws keys as key caps in the sheet, with icons where a key has one` | covered | apps/ui/src/components/help/ShortcutSheet.test.tsx::sheet-draws-caps: arrows, Space and Esc are glyph caps that keep their names for a screen reader | GAP F9: the Enter cap is not checked, and no catalogue row (`apps/ui/src/input/commands.catalog.ts`) has a right-click gesture, so the sheet cannot draw the mock's right-click cap. |
| d2-keycaps.test.tsx | `has no decision on the arrow keys; chapters are on left and right; Editing has its keys` | covered | apps/ui/src/input/commands.catalog.test.ts::new-rows-are-page-scope-and-conflict-free: each is an Editing row on help and settings, and the catalogue has zero conflicts | Tests the catalogue rows, not the drawn sheet. Left and Right step chapters on Proof: ProofPage.test.tsx "steps the chapter with Left and Right, from All chapters to the one last looked at". |
| d2-keycaps.test.tsx | `the plain-text list (Settings) is still [label, text] pairs without the arrow decision` | covered | apps/ui/src/components/settings/KeyboardPanel.test.tsx::settings-list-is-the-settings-surface: lists exactly commandsFor("settings"), and a new settings row appears with no other edit | The real Settings list is catalogue rows with gestures; the mock's text pairs are its own data in `@/app/help`. |
| form-primitives.test.tsx | `is named by a visible label, accepts typing and passes ref, list, placeholder and data attributes through` | covered | apps/ui/src/components/primitives/TextField.test.tsx::passes the role, aria attributes, key handler, placeholder, ref and disabled state through | Input; the real counterpart is TextField. Typing and the label: TextField.test.tsx "is a text box named by its label, and reports the text typed". No test checks that `list` or `data-*` reach the input. |
| form-primitives.test.tsx | `is 36px high by default and 32px for size sm; the width follows a w- class` | mock-only |  | GAP F1: TextField has one height (`--control-height`) and no `size` prop, and is always `w-full` (TextField.tsx `BASE_CLASSES`). |
| form-primitives.test.tsx | `invalid sets aria-invalid; disabled and readOnly are honoured; Tab reaches it` | covered | apps/ui/src/components/primitives/TextField.test.tsx::is disabled when asked, and shows the value it was given | Input. readOnly: TextField.test.tsx "is a value the narrator can read and copy but not edit when readOnly, on --surface-2 with no focus ring". TextField has no `invalid` prop; aria-invalid comes from Field's error: Field.test.tsx "describes its control by a hint, and by an error that also marks it invalid". Tab is not tested. |
| form-primitives.test.tsx | `forwards onKeyDown and onBlur` | covered | apps/ui/src/components/primitives/TextField.test.tsx::passes the role, aria attributes, key handler, placeholder, ref and disabled state through | Input. onBlur is tested through Field only: Field.test.tsx "reports typing and blur, and stays controlled". |
| form-primitives.test.tsx | `CommitInput commits on Enter and on blur only when the value changed` | covered | apps/ui/src/components/delivery/profile/ProfileCard.test.tsx::a-limit-that-is-not-a-number-is-ignored, and an edit saves with the host rule ids | GAP F2: `CommitBox` (the mock's CommitInput) is tested through ProfileCard, commit on Enter only; no test that a blur commits a change and skips an unchanged value. |
| form-primitives.test.tsx | `has a label, is multi-line, can be invalid and disabled` | covered | apps/ui/src/components/primitives/Field.test.tsx::names its control by its label, for an input and for a textarea | Textarea (Field's textarea). Checks the label and the element; invalid and disabled are tested on Field's input only (Field.test.tsx "disables its control"). |
| form-primitives.test.tsx | `shows the selected label and has the combobox role, name, id and data attributes on the trigger` | covered | apps/ui/src/components/primitives/Select.test.tsx::is the native select, named by its label, showing each option | The real Select is a native `<select>` (ADR 0053): role, name and value are checked; id in Select.test.tsx "is named by a visible label through its id instead". data-* passthrough is not tested. |
| form-primitives.test.tsx | `opens on click, marks the selected option, picks one by click and closes` | covered | apps/ui/src/components/primitives/Select.test.tsx::reports the chosen value when the user picks an option | Native picker (ADR 0053): no app-drawn popup to open or close; picking reports the value. |
| form-primitives.test.tsx | `opens with the keyboard, moves with the arrows, selects with Enter` | mock-only |  | GAP F3: the native `<select>` leaves the keyboard to the platform (ADR 0053, Select.tsx comment); no real test. Needs a ruling: the mock draws a listbox popup. |
| form-primitives.test.tsx | `typeahead highlights the matching option` | mock-only |  | GAP F3: platform typeahead on the native `<select>` (ADR 0053); no real test. |
| form-primitives.test.tsx | `Escape closes the popup without changing the value and returns focus to the trigger` | mock-only |  | GAP F3: no app-drawn popup; the native picker handles Escape (ADR 0053). |
| form-primitives.test.tsx | `a disabled Select does not open` | covered | apps/ui/src/components/primitives/Select.test.tsx::cannot be changed when disabled | Asserts no change is reported; not that nothing opens. |
| form-primitives.test.tsx | `shows the placeholder when the value is not among the options, and the test helper picks by label` | mock-only |  | GAP F4: the real Select has no `placeholder` prop (Select.tsx). The second half exercises the mock's own `chooseOption` helper; real tests use `userEvent.selectOptions`. |
| form-primitives.test.tsx | `is a slider with a name, range and value text on the range input, addressable by its id` | ported | apps/ui/src/components/primitives/Slider.test.tsx::slider-has-a-name-range-and-value-text | Slider (SN-F51). |
| form-primitives.test.tsx | `arrow keys, Home and End change the value` | ported | apps/ui/src/components/primitives/Slider.test.tsx::arrows-home-end-change-the-value | Also Page Up and Page Down. |
| form-primitives.test.tsx | `fireEvent.change on the range input reports the number` | ported | apps/ui/src/components/primitives/Slider.test.tsx::change-event-reports-the-number |  |
| form-primitives.test.tsx | `disabled disables the range input` | ported | apps/ui/src/components/primitives/Slider.test.tsx::disabled-disables-the-range-input |  |
| form-primitives.test.tsx | `applies a valid in-range number at once` | ported | apps/ui/src/components/primitives/NumberInput.test.tsx::applies-a-valid-in-range-number-at-once | NumberInput (SN-F52). |
| form-primitives.test.tsx | `clamps an out-of-range number on blur and on Enter` | ported | apps/ui/src/components/primitives/NumberInput.test.tsx::clamps-an-out-of-range-number-on-blur-and-on-enter |  |
| form-primitives.test.tsx | `reverts an empty entry on blur` | ported | apps/ui/src/components/primitives/NumberInput.test.tsx::reverts-an-empty-or-junk-entry-on-blur | Also junk text. |
| form-primitives.test.tsx | `exposes min, max, step and can be disabled` | ported | apps/ui/src/components/primitives/NumberInput.test.tsx::exposes-min-max-step-and-disabled |  |
| primitives.test.tsx | `has the checkbox role, a name, aria-checked and passes data-* through` | covered | apps/ui/src/components/primitives/Checkbox.test.tsx::is a checkbox named by its label text and reports the new state | GAP F5: Checkbox takes only checked, onChange, disabled and children, so no `aria-label` and no `data-*` passthrough (Checkbox.tsx). |
| primitives.test.tsx | `Space toggles it from the keyboard and a click toggles it too` | covered | apps/ui/src/components/primitives/Checkbox.test.tsx::toggles from the keyboard with Space | The click: Checkbox.test.tsx "is a checkbox named by its label text and reports the new state". |
| primitives.test.tsx | `a disabled one cannot be toggled or focused` | covered | apps/ui/src/components/primitives/Checkbox.test.tsx::does nothing when disabled | A click only; focus and Space are not checked. |
| primitives.test.tsx | `a visible label names it and clicking the text toggles it` | ported | apps/ui/src/components/primitives/Checkbox.test.tsx::toggles when the label text is pressed | The label is the children, not a `label` prop. |
| primitives.test.tsx | `indeterminate reports mixed` | mock-only |  | GAP F5: Checkbox has no `indeterminate` prop (Checkbox.tsx). |
| primitives.test.tsx | `has radiogroup and radio roles with names, descriptions and aria-checked` | covered | apps/ui/src/components/primitives/RadioGroup.test.tsx::names the group and each option, with the description visible for both at once | GAP F6: the description is visible text, not `aria-describedby` (RadioGroup.tsx comment). |
| primitives.test.tsx | `arrow keys move the selection and skip a disabled radio` | covered | apps/ui/src/components/primitives/RadioGroup.test.tsx::moves with the arrow keys | GAP F6: `RadioOption` has no `disabled`, so nothing can be skipped. |
| primitives.test.tsx | `clicking the label text selects, and a disabled radio stays off` | covered | apps/ui/src/components/primitives/RadioGroup.test.tsx::switches on the label text being pressed | GAP F6: no disabled option. |
| primitives.test.tsx | `a standalone Radio (mock panel) works controlled by checked` | mock-only |  | GAP F6: no standalone `Radio` export; RadioGroup takes an options array. The mock uses one in `src/pages/Settings.tsx` and `src/pages/editing/RangeDialogs.tsx`. |
| no-raw-controls.test.ts | `has no <input>, <select> or <textarea> outside src/ui/primitives` | covered | `apps/ui/src/rawNatives.test.ts::raw <%s> counts only go down` | A per-file ratchet with the `native-control-ok` marker (SN-F7, #1264): rawNatives.test.ts "marker-needs-a-reason", "zero-dirs-allow-no-unmarked-native". `select` and `textarea` are at zero; one `input` ceiling stands (`ProoferSheet.tsx`, a hidden file picker), which SN-C4 settles. |
| no-hardcoded-speakers.test.ts | `names no sample speaker code outside src/fixtures` | covered | apps/ui/src/sampleLiterals.test.ts::no file gains a sample chapter title or speaker name literal | GAP F10: a ratchet over `src/components` and `src/hooks` with 7 component-side fixture files under a ceiling, which move to `src/fixtures/` with #1119. It matches exact sample names, not the mock's uppercase codes. |
| foundations.test.ts | `formats the three manuscript styles` | covered | apps/ui/src/components/script/page/chapters/ChapterList.test.tsx::names chapters in every heading style at 40 chapters | The gutenberg, numbered and colon labels are read from the manuscript (ADR 0191); the real app has no formatter that builds "CHAPTER VII." from a number. The same drift as G13 of the Script and Story Bible note and G4 of the Booth note. Split rule: chapterHeading.test.ts "numbered: the label is the number, the title the second line". |
| foundations.test.ts | `credits have no label` | ported | apps/ui/src/chapterHeading.test.ts::credits: no label in the list, "Credits" on the card, lower case in the boundary |  |
| foundations.test.ts | `parse through the schemas, with sample chapters when asked` | mock-only |  | Tests the mock's own `makeBook` fixture factory. The real wire files go through their schemas in wireContracts.test.ts "every committed file has a schema, and every schema row has a file". |
| foundations.test.ts | `derive pickups from queued lines and proof notes` | ported | apps/desktop/internal/pickuplist/pickuplist_test.go::TestListMergesTheFourSources | The open count per chapter: TestOpenCountAgreesWithTheStageEngine. |
| foundations.test.ts | `derive stage values from the data behind them` | covered | apps/ui/src/components/proof/proof.selectors.test.ts::counts an open pickup as open and keeps the percent below 100 | GAP F7: covers the Proof percent only. ProductionPage.tsx gives `buildPipelineRows` only `checks`, so the proof, master and QC cells read "Not measured yet" (pipelineRows.test.ts "reads a cell with no chapter-level source as not measured yet"). |
| foundations.test.ts | `totals the book` | covered | apps/ui/src/components/production/overview/overview.test.tsx::stage-bar-sums-to-the-book | GAP F7: asserts the stage segments add up to the book; there is no book pass and fail count, and the delivery check tile reads Not measured yet (overview.test.tsx "delivery check reads Not measured yet where the host has no chapter-level source"). |
| foundations.test.ts | `checks master rows against the limits` | ported | apps/desktop/internal/deliveryprofile/profile_test.go::TestAMissIsNotMetWithAnErrorFindingNamingTheRuleAndTheBound | Room tone at the start: TestRoomToneIsJudgedFromTheMeasuredEdges. UI: fileVerdict.test.ts "says which rule a file missed, by how much, and what to do about it". |
| foundations.test.ts | `suggests speakers from "said X"` | covered | sidecars/manuscript-guide/tests/test_character_cues.py::test_a_tag_after_the_quote_attributes_the_cue | One quote with its tag after it. No test gives both halves of a quote split around one "said X" tag the speaker, as the mock does. |
| foundations.test.ts | `counts where an entry appears` | ported | sidecars/manuscript-guide/tests/test_character_cues.py::test_entities_record_which_chapter_and_scene_they_appear_in | The UI count: entryList.test.ts "counts distinct chapters of the appearances". |
| foundations.test.ts | `records an undoable change and undoes it` | ported | apps/ui/src/studio/journal/createJournal.test.ts::act then undo of UI-only commands, newest first, leaves the value equal to the original | ADR 0771. |
| foundations.test.ts | `refuses to undo a DAW change that is no longer last` | ported | apps/ui/src/studio/journal/createJournal.test.ts::daw-entry-only-if-last: an entry followed by any entry refuses "came after this", naming the newest | ADR 0771 rule 4. |
| foundations.test.ts | `refuses when REAPER’s own last action is something else` | ported | apps/ui/src/studio/journal/createJournal.test.ts::refuses the DAW's own Edit > Undo sentence when the DAW reports '%s' | An `it.each` over `unknown` and `other`. |
| foundations.test.ts | `removes tags, including nested ones that would rebuild a tag` | mock-only |  | Tests the mock's own `stripTags`, which removes markup the mock keeps in its sample pickup strings. Real pickup lines are plain text (pickups TestBindingsTakeIDsAndPlainTextOnly) and React escapes what it draws. |
| scenarios.test.tsx | `every page renders with no leakage (%s)` | covered | apps/ui/src/test/scenarioMatrix.test.tsx::matrix-renders-one-page-in-every-scenario | GAP F11: the SN-S61 helper (`apps/ui/src/fixtures/renderScenario.tsx`) renders only ChapterList, for three chapter shapes at 12 and 40 chapters; no other page and no DAW setup (REAPER, REAPER off, built-in) is in the matrix. |
| daw.test.ts | `every setup reports a capability set that passes the schema, for a named DAW` | covered | apps/ui/src/ports/daw.contract.test.ts::capabilities-are-the-wire-shape | Each adapter (REAPER, built-in, Audacity) runs the `dawporttest` conformance suite as TestConformance; the engine names: dawport adapter_test.go "TestKindStringNamesEachEngine". |
| daw.test.ts | `a DAW that is not running offers nothing that needs it and says why` | covered | apps/desktop/internal/dawport/resolver_test.go::TestSupportRuntimeDependsOnWhatTheCapabilityNeeds | The sentence: reaper_test.go "TestExplainUsesREAPERsWording" ("REAPER is not answering…", not the mock's "REAPER is not running."). |
| daw.test.ts | `what a DAW lacks carries its own reason` | covered | apps/desktop/internal/dawport/builtin/builtin_test.go::TestRefusalsAreWordedForTheBuiltInRecorder | Also resolver_test.go "TestSupportOfAnUndeclaredOrUnknownCapabilityIsUnsupported". |
| daw.test.ts | `Audacity rolls destructively until its backups are on` | covered | apps/desktop/internal/dawport/audacity/audacity_test.go::TestBackupsDecideWhatAudacityCanDo | REAPER is not destructive: reaper_test.go "TestPunchCutRangeFXRangeAndStackTakesAreNativeAndNotDestructive". |
| daw.test.ts | `the capabilities follow the mock setup` | covered | apps/desktop/internal/dawport/resolver_test.go::TestSupportReadsItsInputsOnEveryCall | The setup switcher is the mock's own; the real resolver reads runtime and settings on every call (toggles_test.go "TestSettingsInputsAreReadOnEveryCall"). |
| daw.test.ts | `every call answers a result that passes the schema; a cursor move adds no undo point, a write adds one` | covered | apps/desktop/internal/dawport/result_test.go::TestResultRoundtripsAndOKCountsOneUndoStepPerChange | Contract "client-methods-answer-a-daw-result"; Lua punch_test.lua "punch_to is a cursor move only: no undo block, nothing else changed". |
| daw.test.ts | `a refused call changes nothing and carries the capability's reason` | covered | apps/desktop/internal/dawport/result_test.go::TestARefusalErrorMapsToItsCapabilitysOwnSentence | Also "TestRefusedChangesNothingAndSpeaksItsReason". |
| daw.test.ts | `a write with nothing to change writes nothing` | covered | apps/desktop/internal/dawport/reaper/reaper_test.go::TestHideTakesIsOneUndoStepWhenItChangedAndNoneWhenNot | Lua workspace_test.lua "set_active_take changes nothing when the take is already active". |
| daw.test.ts | `names the DAW it is talking to` | covered | apps/desktop/internal/dawport/reaper/reaper_test.go::TestHideTakesIsOneUndoStepWhenItChangedAndNoneWhenNot | "Muted 2 other takes in REAPER…"; Audacity: steps_test.go "TestRollBacksUpFromTheRollPointThenRecordsAgain". The host's `addMarker` answers an empty message, so a marker result does not name the DAW. |
| daw.test.ts | `markers get the kind in front of their label` | covered | apps/desktop/bindings_marker_test.go::TestApprovedMarkerNameAndColourFollowTheTranscriptCompareMarkers | A binding test in the root `apps/desktop` package; no dawport, contract or harness test proves the prefix (the harness places the name it is given: finding_marker_test.lua). |
| daw.test.ts | `reports when the project was last saved and whether there is more since` | covered | apps/desktop/internal/dawport/projectstate_test.go::TestNewProjectStateAssemblesFromWhatExists | Contract "dawclient-reads-it: each setup answers its saved time, unsaved flag and transport, and the schema accepts it". No page reads it yet (G10 of the Booth note). |
| daw.test.ts | `a change made through the app leaves unsaved changes in the DAW` | covered | apps/desktop/internal/dawport/projectstate_test.go::TestUnsavedTrackerFollowsTheEditCounterSinceTheLastSave | Lua project_state_test.lua "project_state reflects a later, higher count once REAPER records more edits". |
| daw.test.ts | `the built-in recorder keeps no saved project` | covered | apps/desktop/internal/dawport/projectstate_test.go::TestNewProjectStateWithoutASavedProjectIsNull |  |
| daw.test.ts | `the transport shows recording while a take runs` | covered | apps/desktop/internal/dawport/projectstate_test.go::TestNewProjectStateAssemblesFromWhatExists | Subtests "recording counts over playing" and "a paused recording is recording". |
| daw.test.ts | `guids look like guids, are stable, and differ per thing` | covered | integrations/reaper/tests/fake_fidelity_test.lua::an item GUID is upper case in braces | The mock's `guidOf` stands in for REAPER's GUIDs; the app's own ids: audacity backups_test.go "TestNewBackupIDsAreGUIDShapedAndDistinct". |
| daw.test.ts | `choosing a take the DAW has re-created is refused, nothing changes, and says what happened` | covered | integrations/reaper/tests/workspace_test.lua::set_active_take reports an item or take that is gone and changes nothing | Contract "mock-refuses-stale-the-same-way: an old take or a missing track changes nothing and answers code stale". |
| daw.test.ts | `an id read after the change is accepted` | covered | integrations/reaper/tests/workspace_test.lua::set_active_take makes the named take active in one undo step | Contract "current-take-is-accepted-alike". |
| daw.test.ts | `one chapter is one track: no track and several tracks are refused with the reason` | covered | integrations/reaper/tests/transport_test.lua::record_start refuses unless exactly the named track is armed | Contract "unknown-chapter-is-refused-alike" (no track). Several linked tracks: root `apps/desktop` bindings_readaloud_record_test.go "TestReadAloudRecordStartPreconditionsStillRefuseAndChangeNothing". |
| daw.test.ts | `a DAW that is not running refuses with its capability reason` | covered | apps/ui/src/ports/daw.contract.test.ts::refusal-carries-the-capabilitys-sentence: with REAPER off a recording call is refused with the capability message and changes nothing |  |
| daw.test.ts | `the built-in recorder needs no track` | covered | apps/desktop/internal/dawport/builtin/builtin_test.go::TestRolesDriveTheRecorder |  |
| daw.test.ts | `recording starts at the end of the last item on the chapter's track` | covered | integrations/reaper/tests/transport_test.lua::record_start with end moves the cursor to the end of the last item and records there |  |
| daw.test.ts | `only the chapter's track is armed while recording, and the arms come back after` | covered | integrations/reaper/tests/transport_test.lua::record_stop stops the recording the app started and puts back the arms the narrator had | Also "arm_only arms the named track, disarms every other one and makes no undo point". |
| daw.test.ts | `an explicit punch starts where the narrator chose, not at the end` | mock-only |  | GAP F12: a punch chosen before a take never reaches the DAW. `DawClient.recordStart` takes no time (`apps/ui/src/ports/daw.ts`) and `ReadAloudRecordStart` always records from the end (`bridge.AtEnd`, `apps/desktop/bindings_readaloud_record.go`). |
| daw.test.ts | `does not start while the DAW is already recording or playing, and stopping twice is refused` | covered | integrations/reaper/tests/transport_test.lua::record_start refuses while REAPER plays, is paused or records | A second stop: "record_stop never stops a recording the app did not start". |
| daw.test.ts | `keeps the earlier audio as a take where the DAW is not destructive, as one undo step` | covered | apps/desktop/internal/dawport/reaper/reaper_test.go::TestRollKeepsTheEarlierAudioAndAddsNoUndoPointOfItsOwn | The real roll answers no undo step of its own (ADR 0860); the mock expects one. |
| daw.test.ts | `Audacity without backups refuses until confirmed; with backups it just rolls` | covered | apps/ui/src/ports/daw.contract.test.ts::dawclient-roll: the host adapter answers the binding's DawResult as it is, and sends confirmed as the page gave it | With backups: audacity steps_test.go "TestRollBacksUpFromTheRollPointThenRecordsAgain". |
| daw.test.ts | `cannot roll when nothing is recording` | covered | integrations/reaper/tests/roll_test.lua::roll answers RECORD_NOT_OURS when REAPER is not recording | Go: reaper_test.go "TestRollRefusals". |
| daw.test.ts | `marks pickups as PICKUP: markers, and sending them twice adds nothing` | covered | integrations/reaper/tests/pickups_test.lua::import_pickups adds one PICKUP: marker per row in one undo step | Twice: "import_pickups is idempotent: re-sending the same list adds nothing and opens no undo point". |
| daw.test.ts | `done is the marker's name: PICKUP_DONE: and back` | covered | integrations/reaper/tests/pickups_test.lua::resolve_pickup renames the nearest open pickup to PICKUP_DONE, keeping its body, in one undo step | Back: "reopen_pickup renames a done marker back to PICKUP, keeping its body, in one undo step". |
| daw.test.ts | `a DAW with no markers refuses with its reason` | covered | apps/ui/src/ports/daw.contract.test.ts::away-writes-are-the-pages-to-queue: the refusal is the sentence the resolver sent, not one the client words | The built-in recorder's sentence: builtin_test.go "TestRefusalsAreWordedForTheBuiltInRecorder". |
| daw-wording.test.tsx | `gateOf reads the capability, the DAW's name and the reason` | covered | apps/ui/src/dawAvailability.test.ts::falls back to the capability's own message once the setup facts are met but it is unavailable | `dawCapabilityGate` returns the state and the reason; the name is `dawShortName`: StudioProvider.test.tsx "names the DAW the way the header chip does". |
| daw-wording.test.tsx | `Pickups names the DAW that gets the markers, and is available where the DAW has markers` | covered | apps/ui/src/components/pickups/list/SessionPanel.test.tsx::adds the lines as markers and names the DAW | Names REAPER only. Off without the capability: SessionPanel.test.tsx "the markers icon is off without the capability, with its sentence". |
| daw-wording.test.tsx | `Master names the DAW it opens in and disables it where the DAW cannot` | ported | apps/ui/src/components/masterqc/files/Files.test.tsx::recheck-play-and-open-go-through-the-daw-by-capability: the label reads the DAW name, the reason is the capability’s |  |

## Gaps

Every `GAP` row and every `covered` row that names a gap. "Build slice" marks the ones that need code; the coordinator cuts the follow-up. "Test" is the proposed name, in the file that would hold it.

| id | build slice | what is missing | evidence | proposed test |
| --- | --- | --- | --- | --- |
| F1 | yes: TextField sizes | `TextField` has one height and no `size` prop, and is always full width; the mock's Input is 36 px, 32 px for `sm`, and takes a width class | `apps/ui/src/components/primitives/TextField.tsx` | `TextField.test.tsx` `is 36px high by default and 32px for size sm; a w- class sets the width` |
| F2 | yes: CommitBox test | `CommitBox` (the mock's CommitInput) is tested through ProfileCard, on Enter only; a blur is not tested | `apps/ui/src/components/delivery/profile/CommitBox.tsx` | `CommitBox.test.tsx` `commits on Enter and on blur only when the value changed` |
| F3 | ruling first | The real Select is a native `<select>` ([ADR 0053](../adr/0053-icon-buttons-text-fields-and-selects-wrap-the-native-controls.md)); the mock draws a listbox popup with its own keys, typeahead and Escape. Either the ruling keeps the native control and the three rows are excused, or a custom Select is built | `apps/ui/src/components/primitives/Select.tsx` | `Select.test.tsx` `opens with the keyboard, moves with the arrows, selects with Enter` |
| F4 | yes: Select placeholder | The real Select has no `placeholder` for a value outside its options | `apps/ui/src/components/primitives/Select.tsx` | `Select.test.tsx` `shows the placeholder when the value is not among the options` |
| F5 | yes: Checkbox props | `Checkbox` takes only checked, onChange, disabled and children: no `aria-label`, no `data-*`, no `indeterminate` | `apps/ui/src/components/primitives/Checkbox.tsx` | `Checkbox.test.tsx` `indeterminate reports mixed`; `passes an aria-label and data-* through` |
| F6 | yes: RadioGroup options | `RadioGroup` takes an options array: no disabled option, no standalone `Radio`, and the description is not `aria-describedby` | `apps/ui/src/components/primitives/RadioGroup.tsx` | `RadioGroup.test.tsx` `arrow keys skip a disabled radio`; `a standalone Radio works controlled by checked` |
| F7 | yes: Production pipeline feeds | The Production pipeline gets only `checks`, so its proof, master and QC cells and the book's pass and fail count read "Not measured yet" | `apps/ui/src/components/production/pipeline/pipelineRows.test.ts`, `apps/ui/src/components/production/overview/overview.test.tsx` | `pipelineRows.test.ts` `derives the proof, master and QC cells from the chapter's data` |
| F8 | yes: key hint placement | No test checks that the key-hint footer sits at the bottom of the scrolling page; Proof wraps it in a sticky block, Editing does not | `apps/ui/src/components/proof/ProofPage.tsx`, `apps/ui/src/components/editing/EditingBody.tsx` | `ProofPage.test.tsx` and the Editing page test `the key hints sit at the bottom of the scrolling page` |
| F9 | yes: right-click gesture | No command catalogue row has a right-click gesture, so the shortcut sheet cannot draw the mock's right-click cap; the Enter cap is not asserted | `apps/ui/src/input/commands.catalog.ts` | `ShortcutSheet.test.tsx` `draws the right-click and Enter caps` |
| F10 | no: #1119 | The sample-literal scan is a ratchet with 7 component-side fixture files under a ceiling; they move to `src/fixtures/` with #1119, and SN-C4 sets the ceiling to zero | `apps/ui/src/sampleLiterals.test.ts` | the existing test at zero |
| F11 | yes: scenario matrix | The scenario matrix renders only ChapterList, for three chapter shapes; no other page and no DAW setup | `apps/ui/src/test/scenarioMatrix.test.tsx`, `apps/ui/src/fixtures/renderScenario.tsx` | `scenarioMatrix.test.tsx` `every page renders in every chapter shape and DAW setup` |
| F12 | yes: record start at a punch | `DawClient.recordStart` takes no time and `ReadAloudRecordStart` always records from the end, so a punch chosen before a take starts at the end. The Lua `record_start` can already record from the cursor | `apps/ui/src/ports/daw.ts`, `apps/desktop/bindings_readaloud_record.go`, `integrations/reaper/tests/transport_test.lua` | contract `record-start-at-a-punch-starts-there`; `TestReadAloudRecordStartAtAPunchRecordsFromThere` |

The two `mock-only` rows that are not gaps test the mock's own `makeBook` fixture factory and its `stripTags`, which the real app does not need: its pickup lines are plain text.

## Rulings and their ADRs

The rulings are in the [rebuild PRD](../prds/studio-next-rebuild.prd.md) (SN0-Q1 to Q9) and the register's [Decided rows](../prds/studio-next-adr-register.prd.md#decided-rows-the-owners-rulings) (DQ-1 to DQ-18). Status is the ADR file's own line.

| ruling | ADR | title | Status |
| --- | --- | --- | --- |
| SN0-Q1 | [0760](../adr/0760-the-studio-next-mock-is-the-only-spec-for-every-page-it-covers-tokens-primitive-sizes-and-layouts-included.md) | The Studio Next mock is the only spec for every page it covers | Accepted |
| SN0-Q2 | [0804](../adr/0804-the-editing-page-replaces-the-workspace-in-proof-in-one-change.md) | The Editing page replaces the workspace in Proof in one change | Accepted |
| SN0-Q3 | [0770](../adr/0770-the-ui-store-caches-host-reads-and-journals-commands-and-the-go-host-stays-the-source-of-truth.md) | The UI store caches host reads and journals commands, and the Go host stays the source of truth | Accepted |
| SN0-Q4 | none: the timer, PFH and effective rate stay as built; [ADR 0320](../adr/0320-pfh-and-the-effective-rate-come-only-from-logged-hours-and-measured-recorded-time.md) is kept (DQ-3) | | |
| SN0-Q5 | none: the series voice bible and Series tab are untouched (DQ-12) | | |
| SN0-Q6 | [0802](../adr/0802-schedule-and-delivery-are-pages-with-their-own-rail-items.md) | Schedule and Delivery are pages with their own rail items | Accepted |
| SN0-Q7 | [0761](../adr/0761-layout-rules-read-the-reported-width-the-icon-vocabulary-is-a-data-module-and-key-caps-are-pictures-in-a-new-keycap-leaf.md) | Layout rules read the reported width, the icon vocabulary is a data module, and key caps are pictures | Accepted |
| SN0-Q8 | none: a screenshot procedure, not a decision; the capture script is phase 3 of the rebuild PRD | | |
| SN0-Q9 | none: the agent-train process, recorded in `.claude/skills/agent-train/` | | |
| DQ-1 | [0760](../adr/0760-the-studio-next-mock-is-the-only-spec-for-every-page-it-covers-tokens-primitive-sizes-and-layouts-included.md) | The Studio Next mock is the only spec for every page it covers | Accepted |
| DQ-2 | [0804](../adr/0804-the-editing-page-replaces-the-workspace-in-proof-in-one-change.md) | The Editing page replaces the workspace in Proof in one change | Accepted; [ADR 0407](../adr/0407-a-new-page-replaces-its-old-counterpart-in-the-same-change-and-the-navigation-is-grouped-by-production-stage.md) decision 1 is kept |
| DQ-3 | none: [ADR 0320](../adr/0320-pfh-and-the-effective-rate-come-only-from-logged-hours-and-measured-recorded-time.md) is kept untouched (ADR 0800 says so) | | |
| DQ-4 | [0801](../adr/0801-the-plan-chart-and-deadline-tone-come-from-fixed-inputs-and-the-projection-can-only-worsen-the-tone.md) | The plan chart and deadline tone come from fixed inputs, and the projection can only worsen the tone | Accepted |
| DQ-5 | [0791](../adr/0791-record-arms-only-the-chapters-track-and-starts-at-the-end-of-its-last-item-and-a-failed-precondition-shows-the-capabilitys-refusal-reason.md) | Record arms only the chapter's track and starts at the end of its last item | Accepted |
| DQ-6 | none: the ruling changes no ADR beyond the roll (A8, ADR 0860); the Pickups Punch was removed in SN-Q9 (#1520) | | |
| DQ-7 | [0858](../adr/0858-the-app-may-stack-later-reads-on-the-first-read-and-keeps-each-stacked-takes-offset-and-the-retry-choice-in-an-editing-record.md), [0860](../adr/0860-a-roll-keeps-the-earlier-audio-as-a-take-and-a-range-cut-a-chain-on-a-range-and-stacking-move-audio-and-never-delete-it.md) point 4 | The app may stack later reads on the first read; stacking moves audio and never deletes it | Proposed, Proposed |
| DQ-8 | [0860](../adr/0860-a-roll-keeps-the-earlier-audio-as-a-take-and-a-range-cut-a-chain-on-a-range-and-stacking-move-audio-and-never-delete-it.md) | A roll keeps the earlier audio as a take, and a range cut, a chain on a range and stacking move audio and never delete it | Proposed |
| DQ-9 | none: no conflict; ADRs 0107 and 0414 are kept | | |
| DQ-10 | [0803](../adr/0803-an-extraction-suggestion-at-75-percent-or-more-is-applied-and-flagged-review-and-one-under-75-percent-needs-verification.md) | An extraction suggestion at 75% or more is applied and flagged Review | Accepted |
| DQ-11 | [0792](../adr/0792-a-pronunciation-records-the-source-it-came-from-and-there-is-no-query-status-query-csv-or-open-queries-badge.md) | A pronunciation records its source, and there is no query status, query CSV or open-queries badge | Accepted |
| DQ-12 | none: the series voice bible is untouched (ADRs 0450, 0565 to 0568 kept) | | |
| DQ-13 | none: the companion is frozen as built (ADRs 0381, 0401, 0659 kept) | | |
| DQ-14 | [0802](../adr/0802-schedule-and-delivery-are-pages-with-their-own-rail-items.md) | Schedule and Delivery are pages with their own rail items | Accepted |
| DQ-15 | [0857](../adr/0857-the-take-suggestion-is-evidence-first-and-its-confidence-is-null-with-a-reason-until-the-takes-are-comparable.md) | The take suggestion is evidence first, and its confidence is null with a reason until the takes are comparable | Proposed |
| DQ-16 | [0793](../adr/0793-proofs-percent-is-the-cleared-share-of-its-notes-beside-decided-and-cleared-counters-and-a-note-is-open-until-fixed-waived-or-dismissed.md) | Proof's percent is the cleared share of its notes, beside decided and cleared counters | Accepted |
| DQ-17 | none yet: R1 | Wheel browse follows the mock | |
| DQ-18 | none yet: R2 ([0863](../adr/0863-an-audacity-backup-is-a-muted-track-in-the-project-and-a-row-in-a-table-beside-it-and-a-restore-never-deletes.md) settles the backups table but supersedes nothing) | Audacity backups table and capability-driven takes | |

## Register titles and their numbers

The rebuild PRD's working titles A1 to A18 (its ADR table) with the merged ADRs that carry them.

| row | working title | ADR | Status |
| --- | --- | --- | --- |
| A1 | Studio Next is the spec for every page it covers | 0760 | Accepted |
| A2 | Page replaced without a flag, Editing included | none: ADR 0407 decision 1 is kept (SN0-Q2) | |
| A3 | Jump menu, context providers and help derived from the catalogue | 0780 | Accepted |
| A4 | Overlay service renders the existing primitives | 0781 | Accepted |
| A5 | Read-model store and command journal | 0770 | Accepted |
| A6 | Undo scope and DAW flag | 0771 | Accepted |
| A7 | Result object and capability fields | 0810 (and 0861, the `stale` code) | Accepted (0861 Proposed) |
| A8 | Roll as one DAW command keeping earlier audio as a take | 0860 | Proposed |
| A9 | Cut and FX on a range of words | 0860 | Proposed |
| A10 | Leaving the Booth while recording asks to stop; Record arms the chapter's track | 0790, 0791 | Accepted |
| A11 | Pronunciation without a query workflow | 0792 | Accepted |
| A12 | Plan fields; plan chart and deadline tone | 0800, 0801 | Accepted |
| A13 | Schedule and Delivery pages | 0802 | Accepted |
| A14 | Extraction suggestions and tiers | 0803 | Accepted |
| A15 | Editing page replaces the workspace | 0804 | Accepted |
| A16 | Layout rules, icon vocabulary and key caps | 0761 | Accepted |
| A17 | New dependency `immer` | folded into A5 (0770, which takes no state library) | Accepted |
| A18 | Proof counters and the cleared definition | 0793 | Accepted |

The register's other working titles: "Stacking retries moves later reads onto the first read" is 0858; "Take suggestion with honest confidence" is 0857; "Trims go to the muted Cuts track" is 0860; "Gap taxonomy" is 0830 (Proposed). Those with no ADR: "Wheel browse follows the mock" (R1), "Audacity backups table and capability-driven takes" for its 0660 half (R2), "Pickups points to the Booth and does not punch" (needs none, see DQ-6), and the EXTEND rows' optional titles "Raw controls are a zero ceiling per migrated page", "Rules for the new layers", "Adds Slider, NumberInput, Swatch", "Speaker colour override" and "Delivery profile capability lookup". An EXTEND row needs a new ADR only "if any", so those five are not mismatches.

## ADR register check

Every SUPERSEDE row of the register, read against the old ADR's Status line. KEEP and EXTEND rows were checked to be unchanged; none is marked superseded.

| register row | superseding ADR | old ADR Status line | result |
| --- | --- | --- | --- |
| 0362, 0590, 0595, 0605, 0615, 0616, 0625, 0635, 0640 (DQ-1, tokens and sizes) | 0760 | "superseded in part by ADR 0760" | match |
| 0600, 0610, 0617, 0636 (DQ-1, same row) | 0760 | no supersession | R3: not compared with the mock |
| 0618, 0619 (DQ-1, same row) | 0760 | no supersession | match: behaviour, not a benchmark measure; the diff note keeps them |
| 0620 (DQ-1 row; also EXTEND, A16) | 0761 extends it | no supersession | match: [the diff note](studio-next-token-and-primitive-diff.md) says it is extended, not superseded |
| 0585, 0740 (DQ-1) | 0760 | "superseded in part by ADR 0760" | match |
| 0645, 0650, 0670, 0715, 0720, 0725 (DQ-1, layouts) | 0760 | superseded in part (0670 wholly) | match |
| 0392, 0393 (DQ-1, Script layout) | 0760 | 0392 superseded; 0393 Accepted | R3 for 0393 |
| 0407 decision 5 (DQ-14) | 0802 | "decision 5 is superseded by ADR 0802" | match |
| 0725 open-query badge (DQ-11) | 0792 | "superseded by ADR 0792" | match |
| 0346, 0347, 0352 (DQ-11) | 0792 | superseded in part, superseded, superseded | match |
| 0380 (DQ-5) | 0791 | "superseded by ADR 0791" | match |
| 0388 recording part (A10) | 0790 | "decision 3 is superseded by ADR 0790" | match |
| 0234, 0705 range (A9) | 0860 | "superseded in part by ADR 0860" | match |
| 0246 roll (A8) | 0860 | "superseded in part by ADR 0860" | match |
| 0262 (DQ-8) | 0860 | "superseded in part by ADR 0860" | match |
| 0147 (DQ-7) | 0858, 0860 | named 0860 only | **fixed in this PR**: now names ADR 0858 too |
| 0165 (DQ-15) | 0857 | was "Proposed" with no supersession | **fixed in this PR**: "superseded in part by ADR 0857" |
| 0660 (DQ-18) | none | "Proposed" | R2: no ADR records the supersession |
| 0119 (DQ-17) | none | "Proposed" | R1: no ADR records the supersession |
| 0525 (DQ-16) | 0793 | "superseded in part by ADR 0793" | match |
| 0470 open part (A18) | 0793 | "superseded by ADR 0793" for that part | match |
| 0404 "shown, not projected" (DQ-4) | 0801 | "superseded by ADR 0801" | match |
| 0020, 0042 (DQ-10) | 0803 | "superseded in part by ADR 0803" | match |

ADR 0760's Supersedes line takes the register's range 0590 to 0667, which also holds 0659 (the companion, kept by DQ-13), 0660 (DQ-18's own row) and the Booth and Master layouts 0655, 0656, 0658, 0665 and 0666 that the register classes KEEP. Their Status lines are unchanged, which matches the KEEP rows.

### Register gaps

None of these is fixed here: each needs an ADR, and the owner audits the ADR set after release.

| id | what is missing | evidence |
| --- | --- | --- |
| R1 | DQ-17 (wheel browse follows the mock) has no ADR, so [ADR 0119](../adr/0119-a-hand-scroll-pauses-following-until-the-current-word-is-back-in-the-band.md) still reads as binding where the mock differs | no file in `docs/adr/` cites DQ-17 or supersedes 0119 |
| R2 | DQ-18 supersedes [ADR 0660](../adr/0660-audacitys-finding-detail-hides-reapers-take-management-instead-of-disabling-it-through-capabilitygate.md) (Audacity hides REAPER take management). ADR 0863 settles the backups table but its Supersedes line is "none", and no ADR names 0660 | `docs/adr/0863-*.md` Supersedes line |
| R3 | The DQ-1 rows supersede "where they differ". ADRs 0600, 0610, 0617, 0636 and 0393 were not compared with the mock, by the [diff note](studio-next-token-and-primitive-diff.md) or by a page swap, so whether their Status lines owe "superseded in part by ADR 0760" is open. The diff note says 0600's pill measures change (its section 3) | the diff note's section 6 |

## Owner steps

For #992. Superseding ADRs that are still Proposed, whose old ADR's Status already names them: [ADR 0857](../adr/0857-the-take-suggestion-is-evidence-first-and-its-confidence-is-null-with-a-reason-until-the-takes-are-comparable.md) (supersedes part of 0165), [ADR 0858](../adr/0858-the-app-may-stack-later-reads-on-the-first-read-and-keeps-each-stacked-takes-offset-and-the-retry-choice-in-an-editing-record.md) (part of 0147), [ADR 0860](../adr/0860-a-roll-keeps-the-earlier-audio-as-a-take-and-a-range-cut-a-chain-on-a-range-and-stacking-move-audio-and-never-delete-it.md) (parts of 0147, 0234, 0246, 0262 and 0705), [ADR 0861](../adr/0861-a-refused-daw-call-carries-one-code-stale-beside-its-sentence.md) and [ADR 0863](../adr/0863-an-audacity-backup-is-a-muted-track-in-the-project-and-a-row-in-a-table-beside-it-and-a-restore-never-deletes.md) (extend, supersede nothing). Accept or reject each; a rejection reverts the matching Status lines.

## Verification

```text
node scripts/ci/studio-next-parity.mjs
pnpm --dir apps/ui exec vitest run \
  src/chapterHeading.test.ts \
  src/components/delivery/profile/ProfileCard.test.tsx \
  src/components/help/ShortcutSheet.test.tsx \
  src/components/layout/JumpMenu.test.tsx \
  src/components/masterqc/files/Files.test.tsx \
  src/components/pickups/list/SessionPanel.test.tsx \
  src/components/primitives/Checkbox.test.tsx \
  src/components/primitives/Field.test.tsx \
  src/components/primitives/KeyCap.test.tsx \
  src/components/primitives/KeyHints.test.tsx \
  src/components/primitives/NumberInput.test.tsx \
  src/components/primitives/RadioGroup.test.tsx \
  src/components/primitives/Select.test.tsx \
  src/components/primitives/Slider.test.tsx \
  src/components/primitives/TextField.test.tsx \
  src/components/production/overview/overview.test.tsx \
  src/components/proof/proof.selectors.test.ts \
  src/components/script/page/chapters/ChapterList.test.tsx \
  src/components/settings/KeyboardPanel.test.tsx \
  src/dawAvailability.test.ts \
  src/input/commands.catalog.test.ts \
  src/ports/daw.contract.test.ts \
  src/rawNatives.test.ts \
  src/sampleLiterals.test.ts \
  src/studio/journal/createJournal.test.ts \
  src/test/scenarioMatrix.test.tsx
cd apps/desktop && go test . ./internal/dawport/... ./internal/pickuplist/ ./internal/deliveryprofile/
uv run --locked python integrations/reaper/tests/run_lua_tests.py
cd sidecars/manuscript-guide && uv run --frozen python -m pytest tests/test_character_cues.py
node scripts/ci/adr-index.mjs && node scripts/ci/adr-topics.mjs
pnpm lint:md && node scripts/ci/docs-slop.mjs && node scripts/ci/docs-references.mjs
```

Results on this branch: the checker passes (6 docs, 559 cases mapped, 70 excused). Vitest passes the 26 cited files (343 tests). Go passes the root `apps/desktop` package and the `dawport`, `pickuplist` and `deliveryprofile` packages; the root package was built with GTK 4 and WebKitGTK installed. The Lua harness passes (551 tests) and the cited pytest file passes (29 tests). The other Go tests named in notes (`internal/bridge`, `internal/passagetakes`) were run once by the audit and passed; no row cites them as its test.
