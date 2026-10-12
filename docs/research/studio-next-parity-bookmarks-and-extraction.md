# Studio Next parity: bookmarks and Story Bible extraction (SN-C312)

Mock files: bookmarks.test.tsx, extraction.test.tsx

**Date:** 2026-10-12. **Code audited:** `main` at `4323eff`, after the Script and Story Bible swap (SN-B8, #1515). **Slice:** SN-C312 (#1202), SNC-3 of the [Studio Next cutover PRD](../prds/studio-next-cutover.prd.md). **Mock audited:** `docs/research/mockups/studio-next/tests/`. SN-C4 reads this note when it flips the ratchets; SN-C51 and SN-C52 read it for the steady-state docs.

Method: each mock case is a row below, mapped to a real test by reading the real test's body, not only its title. The checker is `node scripts/ci/studio-next-parity.mjs`. It proves a cited test file exists and holds the name; it does not prove the test asserts what the mock case asserts, so a row's note says where the real test asserts less. The app was not run and the Playwright suites were not run. The booth swap (SN-O10, #1518) is open and not in this audit: on `main` `/booth` still mounts the old Booth.

## Result

- 93 mock cases (36 bookmarks, 57 extraction): 78 `ported`, 12 `covered`, 3 `mock-only`. Of the 3, 1 is a gap (a row whose note starts `GAP`) and 2 are the mock's own state and sample data.
- Rulings in scope: 6 are `agreed` (EX-1 to EX-3, DI-1 to DI-3). EX-1, EX-3, DI-2 and DI-3 have a test row. EX-2 and DI-1 are research and licence decisions with no behaviour to test, so they are listed with the note that answers them. ML-1 and ML-2 are `maybe` in the index and are listed with a pointer.
- Gaps: 7 behaviour or test gaps (G1 to G7; G1 sits in the notes of `ported` rows, G2 in the `mock-only` row, and G3 to G7 in `covered` rows, whose notes name them) and 5 leftovers (L1 to L5). No product test was added and nothing was deleted: the slice owns one file.
- The bookmark and extraction code of the Script and Story Bible pages is on `main` and tested. The Booth half of bookmarks is built and tested as a seam but not mounted (G1).

**The checker has no status for a gap.** A mock case with no real test must still have a row, and only `mock-only` passes with an empty `real test`. A gap row therefore carries `mock-only` and a note that starts `GAP Gn`. A `covered` row whose real test asserts less than the mock names the gap in its note. Every `Gn` has an entry under [Gaps](#gaps); SN-C4 should count them as open.

## Mock cases

| mock file | mock case | status | real test | note |
| --- | --- | --- | --- | --- |
| bookmarks.test.tsx | a bookmark has a stable id, a chapter, a paragraph, a character offset and a date; label and note are optional | ported | apps/desktop/internal/bookmarks/bookmarks_test.go::TestAddListUpdateRemoveRoundtrip | The real bookmark has paragraphId, a stale flag and createdAt (ADR 0820); the golden payload is pinned in bindings_bookmarks_contract_test.go. |
| bookmarks.test.tsx | refuses a negative or fractional offset, a missing paragraph, and a label that is not short | ported | apps/ui/src/api/wireContracts.test.ts::the schemas read a stale bookmark and refuse a negative offset, an unknown key or a label over the limit | Go side: TestLabelAndNoteAreBounded. A missing paragraph is a refusal at the host (TestSpotIsValidatedAgainstTheManuscript). |
| bookmarks.test.tsx | the book starts with none, and old data without the field still parses | covered | apps/desktop/bindings_bookmarks_test.go::TestBookmarksBindingsWithNoProject | Asserts that a list with no project is empty. A missing file is read as none by the persist helper in `bookmarks.go`; this test does not make a project with no file, and there is no old-data case to port. |
| bookmarks.test.tsx | makes one on a paragraph and offset with the mock clock, a new id each time | ported | apps/ui/src/studio/commands/bookmarks.test.ts::records "Added a bookmark" touching bookmarks/<id>, and Undo removes it | Ids come from the host, not a mock counter. |
| bookmarks.test.tsx | does not mark the same spot twice, keeps the offset in the text, and refuses a paragraph that is not in the book | covered | apps/desktop/internal/bookmarks/bookmarks_test.go::TestSameSpotTwiceIsOneAndTheListIsInReadingOrder | UI side: "returns the existing bookmark with created false". Differs from the mock: an offset past the text is refused (wireContracts.test.ts "not in the line"), not clamped to the length. |
| bookmarks.test.tsx | edits the label and note as one undo step, and does nothing when nothing changed | ported | apps/ui/src/studio/commands/bookmarks.test.ts::restores the old label and note on Undo | No-change edit: BookmarkRibbon.test.tsx "makes no call when nothing changed". One undo step: "editor-saves-label-and-note-as-one-undo-step". |
| bookmarks.test.tsx | deletes, and undo brings it back | ported | apps/ui/src/studio/commands/bookmarks.test.ts::recreates at the same spot with the old text under a new id, and a second Undo is refused | Undo recreates under a new id; the mock restores the same id. |
| bookmarks.test.tsx | adding is undoable | ported | apps/ui/src/studio/commands/bookmarks.test.ts::records "Added a bookmark" touching bookmarks/<id>, and Undo removes it | History row: HistoryPanel.bookmarks.test.tsx "history-lists-it". |
| bookmarks.test.tsx | they stay when the narrator moves between chapters and pages | mock-only |  | The mock keeps bookmarks in UI state that navigation could reset. The real ones are a host file read into a store slot, so there is no view state to clear when the narrator changes chapter or page. |
| bookmarks.test.tsx | are cleared when a manuscript is replaced, and with a new project | ported | apps/desktop/internal/manuscript/service_test.go::TestReplaceAndClearRemoveTheBookmarksFile | Replace and Clear project. The mock's bmAt reset has no counterpart: the stepping origin is the page's own state and dies with the page. |
| bookmarks.test.tsx | lists in the order of the book, by chapter | ported | apps/ui/src/components/script/bookmarks/model/selectors.test.ts::keeps the host order and groups by chapter, skipping chapters with none | Host order: TestSameSpotTwiceIsOneAndTheListIsInReadingOrder. |
| bookmarks.test.tsx | names a bookmark by its label, else the words it sits on, and its tip says label and note | ported | apps/ui/src/components/script/bookmarks/model/selectors.test.ts::titles by label, else the line from the start of the word at the offset | Tip: "the tip says label and note, else the title". A stale one is "Line changed" with no snippet. |
| bookmarks.test.tsx | steps forward and back, wrapping round the book, and never lands on where it already is | ported | apps/ui/src/components/script/bookmarks/model/selectors.test.ts::steps on, wraps round the book, and never lands where it is | Stale bookmarks are skipped when stepping, which the mock has no state for. |
| bookmarks.test.tsx | the Booth position and a bookmark map both ways | ported | apps/ui/src/components/booth/bookmarks/boothSpot.test.ts::puts a bookmark on the word its offset is at | The other direction: "the spot is the start of the word being read". Seam only: see G1. |
| bookmarks.test.tsx | draws a ribbon in the gutter for each bookmark, with the note in its tooltip | ported | apps/ui/src/components/script/bookmarks/ui/BookmarkRibbon.test.tsx::draws-a-ribbon-per-bookmark-with-the-note-in-its-tooltip | Gutter slot: Para.test.tsx "the bookmark gutter". |
| bookmarks.test.tsx | B bookmarks the selected text and opens the editor on a note | ported | apps/ui/src/components/script/page/ScriptPage.test.tsx::Bookmark here adds a ribbon, opens its editor, lists it in the tab, and Next and Previous move between bookmarks, wrapping | B on a selection. The key test is useBookmarks.test.tsx "keys-are-catalogue-rows". |
| bookmarks.test.tsx | the editor changes the label and note, and its trash deletes | ported | apps/ui/src/components/script/bookmarks/ui/BookmarkRibbon.test.tsx::editor-deletes: the trash closes the editor and removes the bookmark without saving the draft | Label and note save: "editor-saves-label-and-note-as-one-undo-step". |
| bookmarks.test.tsx | the selection toolbar has a Bookmark here icon button, and the right-click menu has Bookmark here | ported | apps/ui/src/components/script/page/tools/select/SelectionTool.test.tsx::Bookmark here calls the bookmarks command with the selection spot | Right-click item: registry/contextProvider.test.ts "Bookmark here and Record from here run the page". |
| bookmarks.test.tsx | right-click on a ribbon offers Edit and Delete | ported | apps/ui/src/components/script/bookmarks/ui/bookmarkContextMenu.test.tsx::right-click-menu: matches a ribbon and offers Edit and Delete |  |
| bookmarks.test.tsx | the list shows every bookmark by chapter with its note, chapter and words; a row goes to the spot; trash deletes | ported | apps/ui/src/components/script/bookmarks/ui/BookmarksTab.test.tsx::tab-lists-every-bookmark-by-chapter | Row goes to the spot and trash: "presses a row to go to it" and "tab-edit-and-delete-buttons". |
| bookmarks.test.tsx | an empty list says so | ported | apps/ui/src/components/script/bookmarks/ui/BookmarksTab.test.tsx::empty-list-says-so |  |
| bookmarks.test.tsx | going to a bookmark asks the reader to scroll to it and lights its paragraph | covered | apps/ui/src/components/script/page/ScriptPage.test.tsx::Going to one lights its ribbon in the reader | The pulse is asserted on the ribbon. The scroll is Reader.test.tsx "lands a bookmark on its own line, a little below the heading", with the paragraph flash in Para.test.tsx. |
| bookmarks.test.tsx | ] and [ move from one bookmark to the next in the book and wrap | ported | apps/ui/src/components/script/page/ScriptPage.test.tsx::Bookmark here adds a ribbon, opens its editor, lists it in the tab, and Next and Previous move between bookmarks, wrapping | The real keys are Alt+] and Alt+[, not ] and [ (D1). |
| bookmarks.test.tsx | say so when there are none | covered | apps/ui/src/components/script/bookmarks/model/useBookmarks.test.tsx::keys-are-catalogue-rows | Asserts the handler is called once with no bookmarks. The sentence "No bookmarks yet." comes from ScriptPage.tsx onNone and no test reads the toast: G4. |
| bookmarks.test.tsx | lists each bookmark as "Bookmark: label or words", and finds it by its note | ported | apps/ui/src/components/script/bookmarks/model/useBookmarks.test.tsx::lists each bookmark by title with note and chapter as the hint, and the actions only while the page gave handlers | Finding by note: "search-source-finds-bookmarks". The label is "Bookmark: Roses" as in the mock. |
| bookmarks.test.tsx | opens in the palette and goes to the spot in the reader | covered | apps/ui/src/components/script/bookmarks/model/useBookmarks.test.tsx::lists each bookmark by title with note and chapter as the hint, and the actions only while the page gave handlers | The palette entry calls the page's go-to handler; no test drives the palette to the reader. The go-to itself is tested in the Script tab flow. |
| bookmarks.test.tsx | from the Booth it puts the reading position there instead, in the bookmark’s chapter | mock-only |  | GAP G2: no test of a palette or jump-menu bookmark choice on the Booth putting the reading position there. The Booth seam is unmounted on main (G1). |
| bookmarks.test.tsx | has Bookmark here, Next and Previous on the Script page and the Booth only | covered | apps/ui/src/components/script/page/ScriptPage.test.tsx::registers the search sources, the right-click provider, the keys and the bookmark commands once, and removes them on unmount | Script: registered and removed with the page. The Booth half has no test and no mount (G1). The catalogue rows are in commands.catalog.test.ts "the bookmark rows". |
| bookmarks.test.tsx | B bookmarks the reading position, at the start of the word being read, and says so with an undo | ported | apps/ui/src/components/booth/bookmarks/useBoothBookmarks.test.tsx::b-bookmarks-the-reading-position-and-says-so-with-an-undo | Tests the hook, not the page. /booth mounts the old BoothPage on main, so B does nothing there: G1. |
| bookmarks.test.tsx | shows a ribbon in the margin, away from the speaker chips, on the line of its word, with the note in the tooltip | ported | apps/ui/src/components/booth/bookmarks/BookmarkRibbons.test.tsx::a-ribbon-per-bookmark-in-the-margin | Seam only (G1). |
| bookmarks.test.tsx | has no ribbon for a bookmark in another chapter | ported | apps/ui/src/components/booth/bookmarks/BookmarkRibbons.test.tsx::has no ribbon for a bookmark in another chapter, or whose line is not in the text | Seam only (G1). |
| bookmarks.test.tsx | the right-click menu has Bookmark here, on the word that was clicked | ported | apps/ui/src/components/booth/bookmarks/useBoothBookmarks.test.tsx::right-click-offers-bookmark-here-on-the-clicked-word | Seam only (G1). Word under the cursor: boothSpot.test.ts "right-click-offers-bookmark-here-on-the-clicked-word". |
| bookmarks.test.tsx | ] and [ move the reading position between bookmarks, changing chapter when needed | ported | apps/ui/src/components/booth/bookmarks/useBoothBookmarks.test.tsx::next-and-previous-move-the-reading-position | Seam only (G1). Real keys are Alt+] and Alt+[ (D1). |
| bookmarks.test.tsx | does not change chapter while a take runs | ported | apps/ui/src/components/booth/bookmarks/useBoothBookmarks.test.tsx::no-chapter-change-during-a-take | Seam only (G1). |
| bookmarks.test.tsx | B is ignored while typing in a field | covered | apps/ui/src/components/script/bookmarks/model/useBookmarks.test.tsx::keys-are-catalogue-rows | Types into an input and the keys do nothing. Booth: useBoothBookmarks.test.tsx "typing-in-a-field-ignores-b". |
| bookmarks.test.tsx | the footer and the help sheet list the keys | ported | apps/ui/src/input/hints.test.ts::the-bookmark-keys-list-in-the-footer | Help sheet: commands.catalog.test.ts "the bookmark rows". The Booth footer shows B and Alt [ ] but the keys do nothing there yet (G1). |
| extraction.test.tsx | lives in one place: 75% | ported | apps/desktop/internal/extraction/rule_test.go::TestThresholdLivesInOnePlace |  |
| extraction.test.tsx | exactly 0.75 is accepted automatically; just under, and no confidence at all, need verification | ported | apps/desktop/internal/extraction/rule_test.go::TestExactlyThreeQuartersIsAcceptedAuto | Just under and null: TestStatusFollowsReasons. |
| extraction.test.tsx | the stored status follows the rule at ingest | ported | apps/desktop/internal/extraction/store/store_test.go::TestStoredStatusFollowsTheRuleAtIngest |  |
| extraction.test.tsx | finds a quote and computes the offsets from the text itself | ported | apps/desktop/internal/extraction/evidence_test.go::TestVerifyFindsAQuoteAndComputesOffsets | Offsets are UTF-16 units in the host: TestOffsetsAreUTF16CodeUnits. |
| extraction.test.tsx | straight quotes and apostrophes match typographic ones, and the text is the manuscript's | ported | apps/desktop/internal/extraction/evidence_test.go::TestQuotesFoldTypography |  |
| extraction.test.tsx | tries the named paragraph first, then the chapter, then the book; a missing quote is null | ported | apps/desktop/internal/extraction/evidence_test.go::TestSearchOrder | Empty quote: TestEmptyQuoteIsNotFound. |
| extraction.test.tsx | a quote that is not in the text makes the suggestion need verification, with the reason | ported | apps/desktop/internal/extraction/rule_test.go::TestReasonsFollowTheMock | The reason strings are the mock's. |
| extraction.test.tsx | a claim with no quote at all also needs verification | ported | apps/desktop/internal/extraction/rule_test.go::TestReasonsFollowTheMock | A quote-less property, claim or speaker needs verification; also TestStatusFollowsReasons. |
| extraction.test.tsx | has both kinds: accepted automatically at 75% or more, and to verify under it | mock-only |  | The mock's sample book and its fixture suggestions. The real app has no sample suggestions; the rule they exercise is tested in rule_test.go. |
| extraction.test.tsx | has properties and talk, act and know claims, each with a quote at the offsets the code found | covered | apps/desktop/internal/extraction/properties_test.go::TestPropertyOffsetsSliceBackToTheFoldedQuote | Property test of the offsets. The claim kinds: apply_test.go TestAcceptAppliesEachKindInOneStep. The sample-book data itself is the mock's. |
| extraction.test.tsx | its source is in the registry | ported | apps/desktop/internal/extractionport/extractionport_test.go::TestTheRegistryListsTheFiveSourcesInOrderWithRulesTheDefault | The real registry lists five sources (DI-3); the mock case names three. |
| extraction.test.tsx | needs verification counts as needing review, on the entry | ported | apps/ui/src/components/storybible/suggested/row/selectors.test.ts::counts what needs verifying, per entry and loose | Entry count: entryList.test.ts "needs-review-counts-flags-and-suggestions-to-verify". |
| extraction.test.tsx | Accept applies it, and it is one undo step | ported | apps/desktop/internal/extraction/apply/apply_test.go::TestAcceptAppliesEachKindInOneStep | One undo step: row.test.tsx "decisions-are-journal-entries", Undo is extractionReopen. |
| extraction.test.tsx | Accept with the text edited stores the edit | ported | apps/desktop/internal/extraction/apply/apply_test.go::TestUnderTheThresholdWaitsAndAnEditIsStoredAndApplied | UI: row.test.tsx "edit-then-accept-is-one-step". |
| extraction.test.tsx | Reject takes back what an automatic acceptance did, and a rejected one is a tombstone that is not offered again | ported | apps/desktop/internal/extraction/apply/apply_test.go::TestRejectTakesBackAnAutomaticAcceptance | Tombstone: store_test.go TestRejectedIsATombstone. Undo: bindings_extraction_test.go TestExtractionReopenIsTheUndoOfAllThree. |
| extraction.test.tsx | a tombstone survives an edited re-offer of the same thing, and Scan skips rejected items | ported | apps/desktop/extraction_job_test.go::TestExtractionScanSkipsWhatWasOfferedOrRejected |  |
| extraction.test.tsx | Mark reviewed on an automatic acceptance makes it the narrator's | ported | apps/desktop/internal/extraction/apply/apply_test.go::TestReviewMakesAnAutomaticAcceptanceTheNarrators |  |
| extraction.test.tsx | an entry with something to verify cannot be marked reviewed | covered | apps/ui/src/components/storybible/GuideDetail.test.tsx::blocked-while-anything-needs-verification: the button is off with the reason and no call is made | GAP G5: only the UI refuses. GuideMarkReviewed (bindings_guidereview.go) clears the flags even when suggestions are still to verify. |
| extraction.test.tsx | accepting a new entry offered under the threshold puts it in the Story Bible, already reviewed | ported | apps/desktop/internal/extraction/apply/apply_test.go::TestAcceptAppliesEachKindInOneStep | An accepted entry is not flagged for review. Settled claims: bindings_extraction_test.go TestExtractionAcceptAnswersTheSuggestionsANewEntrySettled. |
| extraction.test.tsx | a claim about an entry not in the Story Bible waits, then attaches when the entry arrives | ported | apps/desktop/internal/extraction/apply/apply_test.go::TestClaimAboutAMissingEntryWaitsThenAttaches | Store side: TestSettleAttachesWaitingClaims. |
| extraction.test.tsx | the evidence goes to the line in the Script | ported | apps/ui/src/components/storybible/evidenceLinks.test.ts::labels the quote with its chapter and line and goes to the paragraph by its book-wide index | Row: row.test.tsx "row-shows-the-quote-and-goes-to-the-line". |
| extraction.test.tsx | the confidence tooltip says why: the percent, the quote and the mentions | ported | apps/ui/src/components/storybible/suggested/row/selectors.test.ts::says the percent against the threshold, the quote and the mentions | Chip and tooltip: row.test.tsx "confidence-chip-says-why". |
| extraction.test.tsx | clears every suggestion | covered | apps/desktop/internal/extraction/store/scope_test.go::TestFileIsUnderTheDirectoryReplaceRemoves | GAP G6: the test reads service.go's source for the folder name. Nine other files have a behaviour test (service_test.go TestReplaceAndClearRemove...); suggestions.json has none. |
| extraction.test.tsx | a new project starts with none | covered | apps/desktop/bindings_extraction_test.go::TestExtractionListOfNoProjectIsEmpty | Only the no-project case is asserted: the list is empty. No test creates a new project and then lists. |
| extraction.test.tsx | the local model says why it cannot run, with no network | ported | apps/desktop/internal/extractionport/extractionport_test.go::TestTheLocalModelIsUnavailableWithThePRDsReasonAndStartsNothing | No network is used: the source starts nothing. |
| extraction.test.tsx | a different provider replaces the mock without any screen changing | ported | apps/desktop/internal/extractionport/extractionport_test.go::TestANewSourceIsOneRowAndNeedsNoChangeInAnyCaller | UI: source.test.tsx "sources-come-from-the-port-and-a-new-one-needs-no-screen-change". |
| extraction.test.tsx | reads quoted cells with commas, doubled quotes and line breaks, and numbers each record by its line | ported | apps/desktop/internal/extraction/importer/importer_test.go::TestCSVReadsQuotedCellsAndNumbersRowsByLine |  |
| extraction.test.tsx | parses every record type; confidence may be 0.8, 80% or empty | ported | apps/desktop/internal/extraction/importer/importer_test.go::TestCSVParsesEveryRecordType |  |
| extraction.test.tsx | reports each bad row with its row number and the reason | ported | apps/desktop/internal/extraction/importer/importer_test.go::TestEachBadRowIsReportedWithItsRowAndReason |  |
| extraction.test.tsx | needs a record column | ported | apps/desktop/internal/extraction/importer/importer_test.go::TestRecordColumnIsRequired |  |
| extraction.test.tsx | a semicolon or tab separated sheet works too | covered | apps/desktop/internal/extraction/importer/importer_test.go::TestCSVReadsQuotedCellsAndNumbersRowsByLine | The semicolon sheet is asserted inside this test; the tab sheet is not. |
| extraction.test.tsx | parses entries with nested properties, relationships and claims, and speakers; a property map takes the entry's confidence | ported | apps/desktop/internal/extraction/importer/importer_test.go::TestJSONParsesNestedEntries |  |
| extraction.test.tsx | names the row and the place for each error | ported | apps/desktop/internal/extraction/importer/importer_test.go::TestJSONNamesTheRowAndPlaceOfEachError |  |
| extraction.test.tsx | bad JSON and the wrong shape say so | ported | apps/desktop/internal/extraction/importer/importer_test.go::TestJSONBadJSONAndWrongShapeSaySo |  |
| extraction.test.tsx | the format is told apart by how it opens, or by the hint | ported | apps/desktop/internal/extraction/importer/importer_test.go::TestFormatIsToldApartByHowItOpensOrByAHint |  |
| extraction.test.tsx | the documented examples parse clean, in both formats, and give the same rows | ported | apps/desktop/internal/extraction/importer/importer_test.go::TestDocumentedExamplesParseCleanInBothFormats |  |
| extraction.test.tsx | the prompt carries the format, the example and the threshold | ported | apps/desktop/internal/extraction/importer/importer_test.go::TestPromptCarriesTheFormatAndTheThreshold | Host side: bindings_extraction_import_test.go TestExtractionImportPromptIsTheImportersText. |
| extraction.test.tsx | merges onto an existing entry by name or alias, adds new ones, and nothing is deleted | ported | apps/desktop/internal/extraction/importer/importer_test.go::TestPlanMergesAddsAndSkips | Commit: bindings_extraction_import_test.go TestExtractionImportCommitRecomputesAndNeverTrustsThePage. |
| extraction.test.tsx | null, missing and under-75% confidence land as needs verification; 75% and up is accepted | ported | apps/desktop/internal/extraction/importer/importer_test.go::TestStatusFollowsTheSharedRule |  |
| extraction.test.tsx | a quote that is not in the manuscript is flagged in the preview | ported | apps/desktop/internal/extraction/importer/importer_test.go::TestStatusFollowsTheSharedRule | The unfound-quote note is asserted in this test. |
| extraction.test.tsx | a row about an entry that is nowhere is an error with its row number; the others still import | ported | apps/desktop/internal/extraction/importer/importer_test.go::TestPlanMergesAddsAndSkips | The error row number and the "No entry" reason are asserted here. |
| extraction.test.tsx | skips what was already offered or rejected before | ported | apps/desktop/internal/extraction/importer/importer_test.go::TestPlanSkipsWhatWasOfferedOrRejectedBefore |  |
| extraction.test.tsx | an entry already complete in the Story Bible adds nothing | ported | apps/desktop/internal/extraction/importer/importer_test.go::TestPlanMergesAddsAndSkips | Alice is skipped as already in the Story Bible. |
| extraction.test.tsx | the whole import is one undo step | ported | apps/desktop/bindings_extraction_import_test.go::TestExtractionImportIsOneStep | Undo: TestExtractionImportUndoRemovesWhatTheImportCreated. |
| extraction.test.tsx | a speaker row confirms the speaker of the quoted line when it is accepted | ported | apps/desktop/internal/extraction/apply/apply_test.go::TestSpeakerConfirmsTheQuotedLineThroughTheCue |  |
| extraction.test.tsx | ignore case, spacing and typographic quotes | ported | apps/desktop/internal/extraction/fingerprint_test.go::TestFingerprintRecognisesTheSameThing |  |
| extraction.test.tsx | has a Needs verification chip that filters to entries with something to verify, and lists the loose suggestions | ported | apps/ui/src/components/storybible/suggested/panel/panel.test.tsx::verify-chip-filters-and-counts | Loose suggestions: "loose-suggestions-list-above-the-entries". |
| extraction.test.tsx | an entry lists its suggestions with the quote, a percent chip with a tooltip, and Accept / Edit / Reject | ported | apps/ui/src/components/storybible/suggested/row/row.test.tsx::needs-verification-offers-accept-edit-reject | Chip and tooltip: "confidence-chip-says-why". |
| extraction.test.tsx | clicking the quote goes to the line in the Script | ported | apps/ui/src/components/storybible/suggested/row/row.test.tsx::row-shows-the-quote-and-goes-to-the-line |  |
| extraction.test.tsx | Accept moves a claim to the labelled read-only view with its evidence; Reject removes it from the list; Undo works | ported | apps/ui/src/components/storybible/suggested/row/row.test.tsx::accepted-claims-are-labelled-read-only | Reject and Undo: "decisions-are-journal-entries". |
| extraction.test.tsx | Edit changes the text and accepts it in one step | ported | apps/ui/src/components/storybible/suggested/row/row.test.tsx::edit-then-accept-is-one-step |  |
| extraction.test.tsx | Mark this suggestion reviewed works per item on an automatic acceptance | ported | apps/ui/src/components/storybible/suggested/row/row.test.tsx::Mark this suggestion reviewed |  |
| extraction.test.tsx | the import button has its tooltip and opens the dialog | ported | apps/ui/src/components/storybible/suggested/panel/panel.test.tsx::import-button-opens-the-dialog-prop |  |
| extraction.test.tsx | previews a valid blob and adds it in one go | ported | apps/ui/src/components/storybible/suggested/import/import.test.tsx::previews-a-valid-blob-and-adds-it-in-one-go |  |
| extraction.test.tsx | shows each bad row with its row number and keeps Add off when nothing is valid | ported | apps/ui/src/components/storybible/suggested/import/import.test.tsx::shows-each-bad-row-and-keeps-add-off |  |
| extraction.test.tsx | reads a chosen file (.csv or .json) with FileReader | ported | apps/ui/src/components/storybible/suggested/import/import.test.tsx::reads-a-chosen-file-with-a-size-precheck | The real dialog checks the size first, as the host limit. |
| extraction.test.tsx | copies the prompt, and shows the example in a copyable box | ported | apps/ui/src/components/storybible/suggested/import/import.test.tsx::copies-the-prompt-and-the-example |  |

## Rulings

| ruling id | test |
| --- | --- |
| EX-1 | apps/desktop/internal/extraction/rule_test.go::TestExactlyThreeQuartersIsAcceptedAuto |
| EX-3 | apps/desktop/internal/extraction/importer/importer_test.go::TestDocumentedExamplesParseCleanInBothFormats |
| DI-2 | apps/ui/src/components/settings/analysis/ConsentDialog.test.tsx::names one tool in its title, with its facts and licence, and focuses Download |
| DI-3 | apps/desktop/internal/extractionport/extractionport_test.go::TestTheRegistryListsTheFiveSourcesInOrderWithRulesTheDefault |

More tests behind the same rulings:

- EX-1: `TestThresholdLivesInOnePlace`, `TestStoredStatusFollowsTheRuleAtIngest` (store) and `TestStatusFollowsTheSharedRule` (import).
- EX-3: the preview and commit tests in `bindings_extraction_import_test.go`.
- DI-2: `catalog_test.go` in `internal/analysistools` for the registry rows, and `scan.test.tsx` "download-opens-the-consent-for-the-pair: nothing downloads and no scan starts by itself".
- DI-3: `TestUnavailableUntilTheRegistrySaysItIsInstalledAndVerified` in the BookNLP and GLiNER adapters, and the first-scan prompt in `scan.test.tsx`.

Rulings with no test row:

| ruling id | status in the index | why no test | pointer |
| --- | --- | --- | --- |
| EX-2 | agreed | A research ruling: no behaviour to test. | [studio-next-local-llm-spike.md](studio-next-local-llm-spike.md); the local model source is unavailable with a stated reason (row 25 above). |
| DI-1 | agreed | A licence decision: no behaviour to test. | [studio-next-booknlp-spike.md](studio-next-booknlp-spike.md) and [studio-next-gliner-spike.md](studio-next-gliner-spike.md); the consent screen shows the licence (DI-2). |
| ML-1 | maybe | Research only; the index holds no slice or test. | The same local-LLM spike: properties and talk, act and know claims arrive through the import (EX-3) and the sources, not from an app-side model. |
| ML-2 | maybe | The index holds no slice or test. The owner said yes and to build it in the mock. | The 36 bookmark rows above. |

## How the tests were run

UI, from the repo root (20 files, 856 tests, all passed on `4323eff`; the 20th is the consent dialog for DI-2):

```text
pnpm --dir apps/ui exec vitest run src/api/wireContracts.test.ts src/components/booth/bookmarks/BookmarkRibbons.test.tsx src/components/booth/bookmarks/boothSpot.test.ts src/components/booth/bookmarks/useBoothBookmarks.test.tsx src/components/script/bookmarks/model/selectors.test.ts src/components/script/bookmarks/model/useBookmarks.test.tsx src/components/script/bookmarks/ui/BookmarkRibbon.test.tsx src/components/script/bookmarks/ui/BookmarksTab.test.tsx src/components/script/bookmarks/ui/bookmarkContextMenu.test.tsx src/components/script/page/ScriptPage.test.tsx src/components/script/page/tools/select/SelectionTool.test.tsx src/components/settings/analysis/ConsentDialog.test.tsx src/components/storybible/GuideDetail.test.tsx src/components/storybible/evidenceLinks.test.ts src/components/storybible/suggested/import/import.test.tsx src/components/storybible/suggested/panel/panel.test.tsx src/components/storybible/suggested/row/row.test.tsx src/components/storybible/suggested/row/selectors.test.ts src/input/hints.test.ts src/studio/commands/bookmarks.test.ts
```

Go, from `apps/desktop`:

```text
go test . ./internal/bookmarks ./internal/extraction/... ./internal/extractionport ./internal/manuscript
```

The seven `internal/*` packages passed. The root package did not build in this container (no `gtk4` or `webkitgtk-6.0`), so these tests were not run here and CI runs them: `bindings_bookmarks_test.go`, `bindings_extraction_test.go`, `bindings_extraction_import_test.go` and `extraction_job_test.go`. Rows that cite them were read, not run.

## Old equivalents

Checked on `4323eff` with `git grep -n -i -E "<old name>" -- apps docs/guides`. Results are cut to the matching lines.

| item | command pattern | output | result |
| --- | --- | --- | --- |
| `ManuscriptCreateBookmark`, `ManuscriptDeleteBookmark` bindings | `ManuscriptCreateBookmark\|ManuscriptDeleteBookmark` | `Binary file apps/desktop/shell matches` | Gone from source; present in a committed binary: L1 |
| `ReaderBookmark` contract | `ReaderBookmark` | `apps/ui/src/api/contracts/manuscript.ts:65` and `:76`; `apps/ui/src/api/schemas/manuscript.ts:12` and `:88` | Leftover: L2 |
| `readerBookmarkCreate`, `readerBookmarkDelete` | `readerBookmarkCreate\|readerBookmarkDelete` | none | gone |
| the old bookmark schema, golden and wire row | `bookmarkSchema\|readerStateSchema`, then `git grep -c bookmarks -- tests/fixtures/contracts/manuscript-reader-state.json` | `schemas/manuscript.ts:78` and `:95` (`bookmarks: listFromNull(bookmarkSchema)`); `tests/fixtures/contracts/manuscript-reader-state.json:1`; Go `emptyNotes` in `internal/manuscript/reader.go:267` | Leftover: L2. The `readerState` binding stays (Booth and Companion read `activeChapter`) |
| `ChapterNav` use | `ChapterNav` | `CreditsEntry.tsx:13`, `TitleSubtitle.test.tsx:65`, `state.ts:6`: comments only | gone (component); three comments name it |
| `ScriptPage` use of the old store | `ScriptPage` reads `useBookmarks` and `studio/commands/bookmarks`; `ReaderCard` is the only other bookmark control | `ScriptPage.tsx:24-28`; `ReaderCard.tsx:42,62,103,108` | The new page uses the one store. `ReaderCard` keeps the old chapter bookmark button: L3 |
| `interactionFeedback` rows for deleted bookmark bindings | `bookmark` over `interactionFeedback/` and the catalogue | only the `studio/commands/bookmarks.ts` and `slots.ts` rows (`script.ts:7-15`, `app.ts:90`, `catalog:108`) | gone |
| wire rows for deleted bindings | `bookmarks` in `wireContracts.test.ts` | `bookmarksList`, `bookmarksAdd`, `bookmarksUpdate`, `bookmarksRemove` and `readerState`, all live | gone |
| `docs/guides` text of the old bookmark | `Bookmark this chapter\|ReaderBookmark` over `docs/guides` | none; `script.md:38-60` and `booth.md:9` describe the new ones | gone |
| a second bookmark store | `bookmarks.json` is the only writer (`bookmarks.File`, ADR 0820); `ManuscriptReaderState` has no writer | `internal/manuscript/reader.go:209` reads only | One store. Old chapter bookmarks in a project's `manuscript-notes.json` are not shown or migrated: L2 |
| old Story Bible import paths past the tiers | `guideBuild(` over `apps/ui/src` | `storybible/Guide.tsx:159`, `production/ManuscriptImport.tsx:141` | Leftover: L4. Scan, Import and the first-scan prompt are the new entry points and are mounted (`Guide.tsx:261`, `:211`) |
| stale `interactionFeedback` entries for deleted bindings | `pnpm --dir apps/ui exec vitest run src/interactionFeedback.test.ts` | 1 failure: "has a row for every call the UI makes to the host", missing rows for `booth/pickups/usePickupSession.ts` and `editing/cleanup/CleanupTab.tsx` | No stale row. The red is missing rows for new code, red on `main` and not from bookmarks or extraction: L5 |

## Gaps

A gap is a mock case that is real behaviour and has no real test, or a real test that asserts less. The coordinator opens the follow-ups.

| gap | what is missing | proposed test | slice that should own it |
| --- | --- | --- | --- |
| G1 | Bookmarks are not mounted on the Booth. `/booth` mounts the old `BoothPage` on `main`; `BoothNextPage` is imported nowhere, so `useBoothBookmarks` and `BookmarkRibbons` are never drawn. The footer still advertises `B` and `Alt [ ]`. Rows 29 to 34 and the footer half of row 36 are tested only as a seam. | `BoothNextPage.test.tsx`: "B adds a bookmark with an Undo and a ribbon shows in the margin" and "Alt+] and Alt+[ move the reading position between bookmarks" | SN-O103 (#1516), after the Booth swap (#1518). Its acceptance 1 already says so. |
| G2 | No test of a jump-menu choice on the Booth putting the reading position there, in the bookmark's chapter (row 27). | `useBoothBookmarks.test.tsx`: "choosing a bookmark in the jump menu puts the reading position there in its chapter" | SN-O103 (#1516) |
| G3 | The jump menu choice on the Script page is tested down to the page's go-to handler, not through the palette to the reader (row 26). | `ScriptPage.test.tsx`: "choosing Bookmark: label in the jump menu scrolls the reader to it" | A Script follow-up of SN-B8 (#1337) |
| G4 | The toast "No bookmarks yet." for a step with no bookmarks is not asserted (row 24). | `ScriptPage.test.tsx`: "Next bookmark with none says No bookmarks yet." | A Script follow-up of SN-B8 (#1337) |
| G5 | The host does not refuse Mark reviewed on an entry with suggestions still to verify; only the button is off (row 18). `GuideMarkReviewed` in `bindings_guidereview.go` clears the flags whatever the suggestions say. | `bindings_guidereview_test.go`: `TestGuideMarkReviewedRefusesAnEntryWithSuggestionsToVerify` | SN-X222 (#1166), the apply path |
| G6 | No behaviour test that a replaced manuscript or Clear project removes `suggestions.json` (row 23). `TestFileIsUnderTheDirectoryReplaceRemoves` reads `service.go`'s source for the folder name; nine other files have a `TestReplaceAndClearRemove...` test. | `internal/manuscript/service_test.go`: `TestReplaceAndClearRemoveTheSuggestionsFile` | SN-X221 (#1155), the store |
| G7 | The tab-separated sheet of row 31 is not asserted; only the semicolon sheet is. | `importer_test.go`: `TestATabSeparatedSheetParses` | SN-X51 (#1086), the parser |

Needing real-app eyes, added to #1495 as one unchecked line: the Booth bookmark keys once #1516 mounts them (G1).

## Leftovers

Found still present. Nothing is deleted here; SN-C4 and the coordinator can open fixers.

| leftover | paths | slice that missed it | fix |
| --- | --- | --- | --- |
| L1 | `apps/desktop/shell` (22,685,032 bytes, tracked, not ignored). Its strings include `ManuscriptCreateBookmark` and `ManuscriptDeleteBookmark`: a built binary of the old host. It was added by `608c0d3` (SN-D52, #1462). | SN-D52 (#1462) | Remove it from the index and ignore it. It is not a bookmark store, but it is the only place the old bindings still exist. |
| L2 | `ReaderBookmark` and `ReaderState.bookmarks` in `apps/ui/src/api/contracts/manuscript.ts:65,76`; `bookmarkSchema` and `bookmarks:` in `apps/ui/src/api/schemas/manuscript.ts:78,95`; `WIRE_READER_STATE.bookmarks` in `apps/ui/src/api/mockFixtures.ts:514`; the `"bookmarks"` key in `tests/fixtures/contracts/manuscript-reader-state*.json` and in Go `emptyNotes` (`internal/manuscript/reader.go:267`), pinned by `internal/manuscript/contract_test.go:73`. Nothing reads or writes it: `ManuscriptReaderState` has no writer and the two readers (`BoothPage.tsx:93`, `CompanionPage.tsx:41`) use `activeChapter`. | SNB-8 / SN-B8 (#1337) | Drop `bookmarks` from the reader state wire, in one `wire-contract-change`. Old chapter bookmarks in a project's `manuscript-notes.json` are then ignored, as now. |
| L3 | `apps/ui/src/components/manuscript/ReaderCard.tsx:41-62,103-121` keeps `bookmarked` and `onToggleBookmark` and the "Bookmark this chapter" button. Its only caller, `CreditsEntry.tsx:44`, passes neither, so only `ReaderCard.test.tsx` draws it. Ratchet rows name it: `iconImports.test.ts:30`, `paletteContrast.test.ts:395`. | SN-B8 (#1337) | Drop the two props, the button and its tests, and the ratchet rows. |
| L4 | The old direct build still runs beside Scan: the "Build / refresh Story Bible" button (`storybible/Guide.tsx:273-274`, `startBuild` at `:155-170`) and the "Build the Story Bible after import" step (`production/ManuscriptImport.tsx:141`) call `guideBuild`. That path writes entries with no suggestion, evidence quote or 75% rule. The mock has neither control. The extraction PRD says it builds on the delivered build, so this may be intended; no ruling or ADR says to keep or delete it. | SN-B8 (#1337) | SN-C4 decides: route both through `extractionScan` with the rules source, or record the exception. |
| L5 | `src/interactionFeedback.test.ts` is red on `main` for five call sites in `booth/pickups/usePickupSession.ts` and `editing/cleanup/CleanupTab.tsx` (SN-O82, SN-E85). Not a bookmark or extraction leftover; noted because the old-equivalents check runs this test. | SN-O82 (#1511), SN-E85 (#1510) | The Booth swap PR (#1518) carries the rows. |

## Differences from the mock that are not gaps

| id | difference | where it is recorded |
| --- | --- | --- |
| D1 | Next and Previous bookmark are `Alt+]` and `Alt+[`, not `]` and `[`. Plain `[` and `]` are `workspace.flag.*` in page scope, and the catalogue cannot tell two pages apart. | `apps/ui/src/input/commands.catalog.ts:222-227` |
| D2 | Adding at an offset past the text is refused, not clamped to the text length. | `wireContracts.test.ts` "not in the line"; ADR 0820 |
| D3 | Undo of a delete recreates the bookmark under a new id; the mock restores the same id. | `studio/commands/bookmarks.test.ts` "recreates at the same spot with the old text under a new id" |
| D4 | The registry has five sources (rules, imported, GLiNER, BookNLP, local model); the mock case names three. | `extractionport_test.go` |
