# Studio Next parity: Production and Schedule (SN-C32)

Mock files: production.test.tsx, f-production.test.tsx, batch-b.test.tsx, schedule.test.tsx

**Date:** 2026-10-11. **Code audited:** `main` at `e4deb06`, after the Production swap (SN-P8, #1404). **Slice:** SN-C32 (#1205), SNC-3 of the [Studio Next cutover PRD](../prds/studio-next-cutover.prd.md). **Mock audited:** `docs/research/mockups/studio-next/tests/`. SN-C4 reads this note when it flips the ratchets; SN-C51 and SN-C52 read it for the steady-state docs.

Method: each mock case is a row below, mapped to a real test by reading the real test's body, not only its title. The checker is `node scripts/ci/studio-next-parity.mjs`. It proves a cited test file exists and holds the name; it does not prove the test asserts what the mock case asserts, so a row's note says where the real test asserts less. The app was not run; the Playwright suites were not run.

## Result

- 97 mock cases: 48 `ported`, 40 `covered`, 9 `mock-only`. Of the 9, 8 are gaps (rows whose note starts `GAP`) and 1 is the mock's own fixture.
- Agreed rulings in scope: 19 of 19 have a test row. `PR-9`, `PR-10`, `PR-11` and `SC-7` are `need-mock`; `PR-12` is `deferred`.
- Gaps: 8 behaviour or test gaps (G1 to G8; G4 sits in a `covered` row, whose note names it) and 6 leftovers (L1 to L6). No product test was added: the slice owns one file.

**The checker has no status for a gap.** A mock case with no real test must still have a row, and only `mock-only` passes with an empty `real test`. Gap rows therefore carry `mock-only` and a note that starts `GAP Gn`. They are not excused: each has an entry under [Gaps](#gaps). SN-C4 should count them as open, and SN-C30 may want a `gap` status.

## Mock cases

| mock file | mock case | status | real test | note |
| --- | --- | --- | --- | --- |
| production.test.tsx | names the delivered stage plainly and carries no manuscript panel | covered | apps/ui/src/components/production/overview/overview.test.tsx::stage-bar-sums-to-the-book | The real stage bar draws no Delivered segment (no chapter-level source); the Manuscript panel is gone with the swap. |
| production.test.tsx | puts the stage bar, This week and Recording check in one row above the pipeline | covered | apps/ui/src/components/production/ProductionPage.test.tsx::draws the header, the KPI row, the stage bar, This week, the recording check, the pipeline, Next up and the chart | Asserts the parts are drawn, not that three of them share one row. |
| production.test.tsx | shows the verdict pill for each deadline | covered | apps/ui/src/components/production/pipeline/pipeline.test.tsx::header-shows-deadline-tone-verdict-and-actions | The verdict word is matched as On track, Tight or Behind; the pill classes are not asserted. Verdict logic: schedule/progress.test.ts. |
| production.test.tsx | the verdict pill opens the schedule | ported | apps/ui/src/components/production/pipeline/pipeline.test.tsx::header-shows-deadline-tone-verdict-and-actions |  |
| production.test.tsx | shows the empty state with no manuscript | ported | apps/ui/src/components/production/pipeline/pipeline.test.tsx::the no-manuscript state offers the import button given as a prop and a Set a due date icon | The button calls a prop; the route it opens (/schedule) is wired in ProductionPage.tsx and not asserted. |
| production.test.tsx | REAPER not running: banner, disabled Start session and Open Booth, Retry toasts | covered | apps/ui/src/components/production/pipeline/pipeline.test.tsx::banner-and-empty-state | Banner, Retry and the built-in recorder are asserted; Open Booth disabled is in next-up-buttons-follow-the-daw. The Retry toast has no real test or text: Gap G4. |
| production.test.tsx | Start session opens the Booth on the chapter being recorded | mock-only |  | GAP G1: Start session is asserted only as a callback (pipeline.test.tsx); that ProductionPage sends the recording chapter to the Booth has no test. |
| production.test.tsx | Export status report opens the dialog; Export saves the report and says its file name | ported | apps/ui/src/components/production/report/ReportDialog.test.tsx::export-writes-and-says-where, then closes on the second press |  |
| production.test.tsx | pipeline cells open the stage for the chapter; Edit explains itself per setup | covered | apps/ui/src/components/production/pipeline/pipeline.test.tsx::cells-go-to-their-stage-and-chapter | Cells report their target and chapter. The Edit cell opens the editing check, not the mock's toast; its click is not tested: Gap G2. |
| production.test.tsx | the Edit cell in the built-in setup says the recorder does not edit | mock-only |  | GAP G2: The real Edit cell opens the Editing check panel (ProductionPage.tsx onGo); no real text or test for the built-in recorder case, and the Edit cell click has no test. |
| production.test.tsx | flags a changed chapter and opens the review dialog; the pipeline shows no author-query pill | mock-only |  | GAP G3: ProductionPage.tsx passes no onReviewChanges to NextUp, so the changed-chapters item is filtered out, and no Chapters to review dialog exists in apps/ui/src. The no-author-query-pill half holds: pipelineRows has no query column. |
| production.test.tsx | lists what is next, derived from the data | ported | apps/ui/src/components/production/pipeline/pipeline.test.tsx::next-up-ranks-by-risk-then-group-then-stage: each item has its title, sub line and one action |  |
| production.test.tsx | the pipeline row menu offers the chapter actions and REAPER only when linked | covered | apps/ui/src/components/production/ProductionPage.test.tsx::offers the mock items, the chapter track, the checks and the status override on a pipeline row | Open in Booth and the others are offered; disabling Open in Booth when REAPER is off is asserted for Next up only. |
| production.test.tsx | names chapters in the %s heading style | mock-only |  | GAP G5: The scenario book (three heading styles) is the domain-state PRD's rule; no real test renders Production under a heading style, and the real name comes from chapterName() with no style setting. |
| production.test.tsx | renders a 40-chapter book with a row per chapter | covered | apps/ui/src/components/production/pipeline/pipeline.test.tsx::one-row-per-chapter-with-stage-cells | A five-chapter book; the 40-chapter size is not rendered. |
| f-production.test.tsx | the own rate is worked out from the chapters that have a measured length | ported | apps/ui/src/components/production/target/pace.selectors.test.ts::is words per finished hour over the chapters with words and a length, in book order |  |
| f-production.test.tsx | gives a dash with the reason when nothing is measured | ported | apps/ui/src/components/production/target/pace.selectors.test.ts::passes the reason of an unmeasured source through |  |
| f-production.test.tsx | needs a few chapters before it says anything | ported | apps/ui/src/components/production/target/pace.selectors.test.ts::names the count when fewer than the minimum have a measured length |  |
| f-production.test.tsx | gives the target both ways, and the schedule follows the chosen basis | ported | apps/ui/src/components/production/target/pace.selectors.test.ts::is words over the standard, and words over the own rate or null | Schedule side: schedule/progress.test.ts "a faster own rate shrinks the work left". |
| f-production.test.tsx | falls back to the standard when your pace was chosen and then is not measured | ported | apps/ui/src/components/production/target/pace.selectors.test.ts::falls back to the standard while nothing is measured |  |
| f-production.test.tsx | has an info icon button beside the estimate that opens a popover with both rates, targets, basis and breakdown | ported | apps/ui/src/components/production/target/TargetInfoButton.test.tsx::shows the standard and the measured rate, their targets and the breakdown |  |
| f-production.test.tsx | shows a dash and the reason in the popover when nothing is measured | ported | apps/ui/src/components/production/target/TargetInfoButton.test.tsx::shows a dash and the reason while nothing is measured, and offers no Your pace |  |
| f-production.test.tsx | choosing your pace in the popover moves the schedule to it | covered | apps/ui/src/components/production/target/TargetInfoButton.test.tsx::writes own for Your pace and standard for Standard | Moving the schedule: progress.test.ts "a faster own rate shrinks the work left". |
| f-production.test.tsx | derives each chapter from its data | ported | apps/ui/src/components/production/readiness/verdict.test.ts::maps the host verdict to one of the six verdicts |  |
| f-production.test.tsx | the evidence is only what the app can measure, and the master check lists its limits | ported | apps/ui/src/components/production/readiness/verdict.test.ts::draws a row for each measured signal and none for an unmeasured one |  |
| f-production.test.tsx | a chapter whose evidence changed since the suggestion reads Evidence changed | ported | apps/ui/src/components/production/readiness/verdict.test.ts::a basis that moved since the narrator read the suggestion is changed |  |
| f-production.test.tsx | the same evidence gives the same key; other evidence another | covered | apps/desktop/internal/stages/engine_test.go::TestBasisKeyCoversOnlyTheIdentifyingFields | The host computes the basis key; the UI only compares it. |
| f-production.test.tsx | every verdict has words for its tooltip | ported | apps/ui/src/components/production/readiness/verdict.test.ts::every verdict has words for its tooltip |  |
| f-production.test.tsx | the app stamps a suggestion for a ready chapter; stamping decides nothing | covered | apps/desktop/bindings_stages_test.go::TestStageRecommendationsNeverStartsACheckOrWritesAFile | The host reads and recommends; only Confirm and Revert write. |
| f-production.test.tsx | confirm records a move and adds a line; it is undoable | covered | apps/desktop/internal/stages/service_test.go::TestConfirmSetsTheStatusAndRecordsTheBasis | Undo: Revert, the next row. |
| f-production.test.tsx | revert is a new line, never a removal | ported | apps/ui/src/components/production/readiness/ReadinessPanel.test.tsx::Revert is a host decision of its own: the panel only ever asks, it removes nothing |  |
| f-production.test.tsx | replays the sample history: a revert takes the last confirmed move off | covered | apps/desktop/internal/stages/store_test.go::TestDecisionStoreRemoveTakesBackOnlyTheLatestMatchingDecision |  |
| f-production.test.tsx | refuses a decision made on evidence that changed since it was read, and changes nothing | ported | apps/ui/src/components/production/readiness/ReadinessPanel.test.tsx::a Confirm on a basis the host no longer holds is refused, the panel re-reads and says the evidence changed | Host side: stages/service_test.go TestConfirmRefusesWhenTheBasisChanged. |
| f-production.test.tsx | refuses to confirm what is not ready (evidence changed, not ready) | covered | apps/desktop/internal/stages/service_test.go::TestConfirmRefusesWhatIsNotRecommended |  |
| f-production.test.tsx | dismissing a changed suggestion logs it and measures the next one against the evidence as it is now | covered | apps/desktop/internal/stages/service_test.go::TestDismissHidesTheSuggestionUntilItsBasisChanges |  |
| f-production.test.tsx | puts a chip with an accessible name on the cell of the stage a chapter is in | ported | apps/ui/src/components/production/pipeline/pipeline.test.tsx::readiness-chip-sits-on-the-current-stage-cell |  |
| f-production.test.tsx | the chip opens the slide-over; the cell still opens its page | covered | apps/ui/src/components/production/readiness/ReadinessPanel.test.tsx::names the verdict and the stage, announces a dialog, and opens the panel | The real panel is a dialog named for the stage; the cell still opens its page (cells-go-to-their-stage-and-chapter). |
| f-production.test.tsx | Confirm in the slide-over moves the chapter and turns the footer into Revert; the list only grows | ported | apps/ui/src/components/production/readiness/ReadinessPanel.test.tsx::Confirm sends the basis the narrator saw, then the footer is Revert; Revert undoes it |  |
| f-production.test.tsx | everything is on except the contracted amount and the rate | covered | apps/ui/src/components/production/report/ReportDialog.test.tsx::amount-is-opt-in-and-refreshes-the-preview | Only the contracted amount and rate are optional; the real report has fixed sections: Gap G8. |
| f-production.test.tsx | the money sections are absent when there is no per-hour rate | ported | apps/ui/src/components/production/report/ReportDialog.test.tsx::checkbox-only-for-a-per-hour-contract |  |
| f-production.test.tsx | is derived from the data: counts, stages, milestones, open items, delivery check | covered | apps/desktop/internal/productionreport/report_test.go::TestTheReportMatchesItsGoldenFiles | The host builds the report; the golden files pin counts, chapters, milestones and delivery. |
| f-production.test.tsx | leaves out an unticked section entirely | mock-only |  | GAP G8: The real report dialog has no per-section checkboxes (ReportDialog.tsx doc comment); the host writes fixed sections. No ruling or ADR records the choice. |
| f-production.test.tsx | words and finished hours without the stages gives a words-only table | mock-only |  | GAP G8: No section choice, so no words-only table; the report always carries the same sections. |
| f-production.test.tsx | includes the money only when asked, from the contract | ported | apps/desktop/internal/productionreport/report_test.go::TestTheContractedAmountAndRateAreLeftOutUnlessTheNarratorOptsIn |  |
| f-production.test.tsx | builds the summary, the file name and the saved location | covered | apps/desktop/production_report_test.go::TestProductionStatusReportPreviewNamesTheNextFile |  |
| f-production.test.tsx | the HTML is one page that escapes what it holds, and the JSON is the same facts | covered | apps/desktop/production_report_test.go::TestProductionStatusReportPreviewHTMLHasNoScriptAndEscapesText | The JSON-carries-the-same-facts half: TestProductionStatusReportPreviewEqualsTheWrittenFile. |
| f-production.test.tsx | Export builds the report in memory, stores a record in the data and says the file name | covered | apps/ui/src/components/production/report/ReportDialog.test.tsx::export-writes-and-says-where, then closes on the second press | The real export writes a file through the host (production_report_test.go TestProductionStatusReportWritesFilesAndLeavesOutTheContractedAmountByDefault), not an in-memory record. |
| f-production.test.tsx | the dialog has the checkboxes, a format control, the save location and a live preview | covered | apps/ui/src/components/production/report/ReportDialog.test.tsx::format-switch-changes-the-pane-and-the-path | Format, path and live preview are tested; the section checkboxes are Gap G8. |
| f-production.test.tsx | the dialog does not offer the money rows without a per-hour rate | ported | apps/ui/src/components/production/report/ReportDialog.test.tsx::checkbox-only-for-a-per-hour-contract |  |
| batch-b.test.tsx | is neutral beyond a week, a warning within a week, danger once past | ported | apps/ui/src/components/schedule/progress.test.ts::is neutral beyond a week, a warning at a week or less, danger once past, success when finished |  |
| batch-b.test.tsx | is success when the book is finished, however close or past the date is | covered | apps/ui/src/components/schedule/SchedulePage.test.tsx::reads Finished when every chapter is delivered, whatever the date |  |
| batch-b.test.tsx | lets the projection only make it worse, and only when there is work to project | ported | apps/ui/src/components/schedule/progress.test.ts::can only be made worse by the projection, and only while work is left |  |
| batch-b.test.tsx | colours the Due card and the days on Production | ported | apps/ui/src/components/production/overview/overview.test.tsx::due-tile-uses-the-deadline-tone |  |
| batch-b.test.tsx | shows a finished book as finished | covered | apps/ui/src/components/schedule/SchedulePage.test.tsx::reads Finished when every chapter is delivered, whatever the date | Production's header uses the same verdict. |
| batch-b.test.tsx | keeps ours: the work that costs the most hours leads | ported | apps/ui/src/components/production/pipeline/nextUpRanking.test.ts::lists the most work-hours at risk first, then an item with no hours by group and stage |  |
| batch-b.test.tsx | breaks ties by group (in progress and not ready first), then the least advanced stage | ported | apps/ui/src/components/production/pipeline/nextUpRanking.test.ts::breaks a tie of hours by group, then by the least advanced stage |  |
| batch-b.test.tsx | draws the items in that order | ported | apps/ui/src/components/production/pipeline/pipeline.test.tsx::next-up-ranks-by-risk-then-group-then-stage |  |
| batch-b.test.tsx | This week is worked out from the take log through the provider | ported | apps/ui/src/components/production/measured/measured.selectors.test.ts::week-figures-use-the-last-seven-days-and-the-weekly-target |  |
| batch-b.test.tsx | shows what a different provider reports, not a fixed figure | covered | apps/ui/src/components/production/measured/useMeasured.test.tsx::hook-reads-once-and-on-change | The figures come from the host read, so another host answer shows another figure. |
| batch-b.test.tsx | says "not measured yet" when nothing has been measured | ported | apps/ui/src/components/production/overview/overview.test.tsx::this-week-sourced-or-reason: with none |  |
| batch-b.test.tsx | draws the recorded line from the take log, and none without one | ported | apps/ui/src/components/production/measured/measured.selectors.test.ts::recorded-series-is-cumulative-by-day-from-the-plan-start | Without a take log: overview.test.tsx "chart without a take log has no actual line and says why". |
| batch-b.test.tsx | room tone comes from the provider for the microphone in use | ported | apps/ui/src/components/production/measured/measured.selectors.test.ts::room-tone-label-says-the-reading-or-the-reason |  |
| batch-b.test.tsx | the Booth footer chip shows the reading, and "not measured yet" when there is none | covered | apps/ui/src/components/booth/frame/frame.test.tsx::opens a menu with the microphone choice and the level meter, and leaves the room tone in the footer | Booth part; SN-C33 owns the Booth audit. The old Booth's test went with it in SN-O10; the new footer's room tone is this test, and the page passes "Room not measured yet" while there is no reading (`page/BoothNextPage.tsx`). |
| batch-b.test.tsx | booth time for pickups comes from the provider; unmeasured pickups take the measured average | ported | apps/ui/src/components/production/measured/measured.selectors.test.ts::session-minutes-rounds-and-floors-at-one |  |
| batch-b.test.tsx | Pickups shows the session time, and "not measured yet" without a source | mock-only |  | GAP G7: The Pickups session time is a Pickups figure; no test in apps/ui/src/components/pickups asserts it or its not-measured state. SN-C34 owns the Pickups audit. |
| batch-b.test.tsx | the fixed inputs live in one config module | mock-only |  | GAP G6: The fixed inputs sit in schedule/estimates.ts, but no real test scans for stray copies of the numbers (the mock scans src for 9300 and the others). |
| batch-b.test.tsx | offers the payment types from data | ported | apps/ui/src/components/schedule/payment.test.ts::are the wire names the host merged, read as they are |  |
| batch-b.test.tsx | works a value out only from a per-finished-hour rate | ported | apps/ui/src/components/schedule/payment.test.ts::is the rate times the finished hours, and only for a rate per finished hour |  |
| batch-b.test.tsx | edits the payment type and the amount on Schedule, next to the due date | covered | apps/ui/src/components/schedule/SchedulePage.test.tsx::shows the value of a rate per finished hour, and none under a royalty share |  |
| batch-b.test.tsx | shows no amount and no value for none or unspecified (the no PFH rate case) | ported | apps/ui/src/components/schedule/SchedulePage.test.tsx::shows the value of a rate per finished hour, and none under a royalty share |  |
| batch-b.test.tsx | clearing the amount leaves it unset, and a negative one is refused | covered | apps/desktop/bindings_production_test.go::TestProductionSetDeadlineStoresItOnTheManifestAndClearsIt | Clears the amount and refuses a negative one, in the host. |
| batch-b.test.tsx | estimates only a milestone tied to a measure | ported | apps/ui/src/components/schedule/progress.test.ts::estimates a measured milestone from the fixed inputs: late, at risk or on track |  |
| batch-b.test.tsx | has a done flag that overrides the estimate | ported | apps/ui/src/components/schedule/progress.test.ts::is done when it is done, whatever it measures |  |
| batch-b.test.tsx | the checkpoint is a measure of the first 15 finished minutes and is estimated like one | ported | apps/ui/src/components/schedule/progress.test.ts::reaches the first N finished minutes by the share of each chapter inside them |  |
| batch-b.test.tsx | changes the minutes of a "first N finished minutes" milestone and prices the work from the chapters in that window | covered | apps/ui/src/components/schedule/progress.test.ts::reaches the first N finished minutes by the share of each chapter inside them | Changing the minutes in the dialog: SchedulePage.test.tsx "edits every detail". |
| batch-b.test.tsx | every offered measure round-trips through the stored scope | covered | apps/ui/src/components/schedule/draft.test.ts::stores every detail: name, date, measure with its N, note and done |  |
| batch-b.test.tsx | stores the model, the text and how much was recorded, and is current as of the last save | covered | apps/ui/src/components/production/chapterCheckStatus.test.ts::labels current with when it was checked | The host stores the result and says current or stale (chaptersync_status_test.go TestEachChapterSaysWhetherItsCheckIsCurrentWithoutAClick). |
| batch-b.test.tsx | is out of date once more is recorded or the text changes, and absent before any check | covered | apps/desktop/internal/coverage/read_test.go::TestAManuscriptTextChangeMakesTheResultStale | A chapter never checked reads not_linked or unchecked: chapterCheckStatus.test.ts. |
| batch-b.test.tsx | a new check replaces the old result and is current again | covered | apps/ui/src/components/production/RecordingCheck.test.tsx::runs a check with real progress and shows its result |  |
| batch-b.test.tsx | Production counts the same data Pickups uses | covered | apps/ui/src/components/production/overview/overview.test.tsx::check-counts-from-the-sync-state |  |
| batch-b.test.tsx | the Check recordings button offers the chapters that are out of date or unchecked | covered | apps/ui/src/components/production/ProductionPage.test.tsx::opens Check recordings from the Recording check card | The card offers the stale and unchecked chapters; the preselection is checkSelection.test.ts. |
| batch-b.test.tsx | the Check recordings dialog labels each chapter | covered | apps/ui/src/components/recordingcheck/CheckRecordingsDialog.test.tsx::lists-recorded-chapters-with-their-state |  |
| batch-b.test.tsx | adds up to the recorded length of the sample book | mock-only |  | The mock's TAKE_LOG fixture total; the real take log is the host's own data. |
| schedule.test.tsx | shows the verdict for each deadline | ported | apps/ui/src/components/schedule/SchedulePage.test.tsx::reads On track when the due date is far and the work fits | The other verdicts: the next three tests of the file. |
| schedule.test.tsx | asks for a manuscript first | ported | apps/ui/src/components/schedule/SchedulePage.test.tsx::asks for a manuscript first and draws no table |  |
| schedule.test.tsx | estimates a milestone with a measure and says "Not estimated" for a custom one | ported | apps/ui/src/components/schedule/SchedulePage.test.tsx::estimates a measured milestone, says "Not estimated" for a custom one and "Done" for a done one |  |
| schedule.test.tsx | shows a late milestone as late | ported | apps/ui/src/components/schedule/SchedulePage.test.tsx::shows a late milestone as late, with the days |  |
| schedule.test.tsx | marks a milestone done with a toggle button that carries its state | ported | apps/ui/src/components/schedule/SchedulePage.test.tsx::marks a milestone done with a toggle that carries its state |  |
| schedule.test.tsx | the table is read-only: no inputs in a milestone row, and the measure reads as its value | ported | apps/ui/src/components/schedule/SchedulePage.test.tsx::is read-only: no input in a milestone row, and the measure reads as its value |  |
| schedule.test.tsx | sorts the rows by date | ported | apps/ui/src/components/schedule/SchedulePage.test.tsx::sorts the rows by date |  |
| schedule.test.tsx | edits every detail in a dialog: name (empty refused), date, measure with its N, note and done | ported | apps/ui/src/components/schedule/SchedulePage.test.tsx::edits every detail: name (empty refused), date, measure with its N, note and done, as one journal entry |  |
| schedule.test.tsx | clamps the chapter count to the book and Cancel changes nothing | ported | apps/ui/src/components/schedule/SchedulePage.test.tsx::clamps the chapter count to the book, and Cancel changes nothing |  |
| schedule.test.tsx | every stored milestone measure is one of the offered measures | covered | apps/ui/src/components/schedule/SchedulePage.test.tsx::always offers the measure the milestone already has, even when the profile does not |  |
| schedule.test.tsx | removes a milestone with an Undo, and adds one from the dialog | covered | apps/ui/src/components/schedule/SchedulePage.test.tsx::removes a milestone as one entry and Undo puts it back | Adding from the dialog: "adds a milestone from the dialog as one entry, with an Undo". |
| schedule.test.tsx | a sticky-note button shows the note as its tooltip, or offers to add one, and opens the note | covered | apps/ui/src/components/schedule/SchedulePage.test.tsx::shows the note as the note button's tooltip, or offers to add one |  |
| schedule.test.tsx | has no "from template" choice, and the 15-minute checkpoint is a measure only ACX offers | covered | apps/ui/src/components/schedule/SchedulePage.test.tsx::offers the 15-minute checkpoint only where the profile unlocks it, and no "from template" choice |  |
| schedule.test.tsx | changing the due date updates the data and marks the deadline custom | covered | apps/ui/src/components/schedule/SchedulePage.test.tsx::changes with the date field, as one journal entry, and the header reads the new date | The mock marks the deadline custom; the real plan has no such flag. |

## Rulings

Agreed rulings of the Production and Schedule pages. The index holds their text: `docs/research/studio-next-ruling-index.md`.

| ruling id | test |
| --- | --- |
| PR-1 | apps/ui/src/components/schedule/progress.test.ts::estimates a measured milestone from the fixed inputs: late, at risk or on track |
| PR-2 | apps/ui/src/components/schedule/progress.test.ts::is neutral beyond a week, a warning at a week or less, danger once past, success when finished |
| PR-3 | apps/ui/src/components/production/overview/overview.test.tsx::chart-plan-actual-projection |
| PR-4 | apps/ui/src/components/production/pipeline/pipeline.test.tsx::cells-go-to-their-stage-and-chapter |
| PR-5 | apps/ui/src/components/production/pipeline/nextUpRanking.test.ts::breaks a tie of hours by group, then by the least advanced stage |
| PR-6 | apps/ui/src/components/production/measured/measured.selectors.test.ts::week-figures-never-invent-a-number |
| PR-7 | apps/ui/src/components/schedule/SchedulePage.test.tsx::changes with the date field, as one journal entry, and the header reads the new date |
| PR-8 | apps/desktop/internal/coverage/read_test.go::TestAManuscriptTextChangeMakesTheResultStale |
| SC-1 | apps/ui/src/components/schedule/SchedulePage.test.tsx::sorts the rows by date |
| SC-2 | apps/ui/src/components/schedule/SchedulePage.test.tsx::shows the note as the note button's tooltip, or offers to add one |
| SC-3 | apps/ui/src/components/schedule/progress.test.ts::estimates a measured milestone from the fixed inputs: late, at risk or on track |
| SC-4 | apps/ui/src/components/schedule/progress.test.ts::is done when it is done, whatever it measures |
| SC-5 | apps/ui/src/components/schedule/SchedulePage.test.tsx::shows the value of a rate per finished hour, and none under a royalty share |
| SC-6 | apps/ui/src/components/schedule/SchedulePage.test.tsx::offers the 15-minute checkpoint only where the profile unlocks it, and no "from template" choice |
| CF-8 | apps/ui/src/components/schedule/measures.test.ts::offers the checkpoint only where the profile unlocks it |
| CF-15 | apps/ui/src/components/production/measured/measured.selectors.test.ts::room-tone-label-says-the-reading-or-the-reason |
| SK-1 | apps/ui/src/components/production/target/TargetInfoButton.test.tsx::shows the standard and the measured rate, their targets and the breakdown |
| SK-2 | apps/ui/src/components/production/readiness/ReadinessPanel.test.tsx::a ready chapter lists its measured evidence and offers Confirm and Dismiss |
| SK-3 | apps/ui/src/components/production/report/ReportDialog.test.tsx::amount-is-opt-in-and-refreshes-the-preview |

`SK-3` rests on the amount opt-in only; the report's sections are Gap G8.

Rulings with no test row, as the index holds them:

| id | index status | pointer |
| --- | --- | --- |
| PR-9 | need-mock | Built as SK-1: the target info icon (`production/target/`). |
| PR-10 | need-mock | Built as SK-2: stage readiness (`production/readiness/`). |
| PR-11 | need-mock | Built as SK-3: the status report dialog (`production/report/`). |
| PR-12 | deferred | Time tracking: SNC-Q3 in `docs/prds/studio-next-cutover.prd.md`. The stage timer, hours log and effective rate stay as built; `production/overview/noEffectiveRate.test.ts` keeps the new overview files from reading them. |
| SC-7 | need-mock | Pace inputs: `schedule/estimates.ts` holds the fixed inputs (ADR 0801) and the own rate comes from `production/target/pace.selectors.ts`. |

## Old equivalents

Commands run at `e4deb06`. `gone` means the command printed nothing that belongs to the old item.

| item | command | output | result |
| --- | --- | --- | --- |
| Old Production components | `git grep -n -i -E "PlanPanel\|ChapterBoard\|StatusReportPanel\|StageSummary" -- apps docs/guides` | `ProductionPage.test.tsx:84,200` (the test that asserts they are gone) and one comment, `proof/ProofingStagePanel.tsx:31`, that still names `ChapterBoard` | gone; the comment is L5 |
| Their files | `git ls-files apps/ui/src/components/production apps/ui/src/components/stages \| grep -E "PlanPanel\|ChapterBoard\|StatusReportPanel\|StageSummary\|StagePanel"` | empty | gone |
| `ChapterTrackPanel` | `git grep -n ChapterTrackPanel -- apps docs/guides` | `useChapterTools.tsx:15,232`, its test, `interactionFeedback` rows | kept on purpose: the swap mounts it from the pipeline row menu (`ProductionPage.test.tsx` "offers the mock items, the chapter track…") |
| Production route | `git grep -n 'path="/production"' -- apps/ui/src/App.tsx` | `App.tsx:732`: redirects to `/` | gone (redirect kept; `App.test.tsx` "redirects /production to the Production home at /") |
| Schedule route and rail item | `git grep -n -E "SCHEDULE\b\|path=\"/schedule\"" -- apps/ui/src/App.tsx apps/ui/src/components/layout/AppShell.tsx` | `AppShell.tsx:43,66` and `App.tsx:650`; the Production group is `[PRODUCTION, SCHEDULE]`, one `Production` item | present once (ADR 0802), Production not duplicated |
| Benchmark-measured values in Production or Schedule files | `git grep -n -i -E "benchmark\|mockFidelity" -- apps/ui/src/components/production apps/ui/src/components/schedule apps/ui/src/App.tsx` | empty | gone |
| State-catalogue rows and drivers | `git grep -n -E "mock-fidelity-01" -- apps/ui/tests` | `catalog/production.ts:22`, `drivers/production.ts:25`, `mock-match/mocks.ts:43` | leftover L1 |
| Stage-evidence aria snapshot and specs | `git grep -n -E "stage-evidence\|slide-over-stage-evidence" -- apps/ui/tests` | `aria/dialogs.spec.ts:54,55,196,208`, `aria/snapshots/slide-over-stage-evidence.aria.yml`, four catalogue rows and drivers | leftover L2 |
| Schedule rows in the visual suite | `git grep -n -i schedule -- apps/ui/tests/visual apps/ui/tests/aria` | one hit, a comment in `aria/navigation.spec.ts:31` | leftover L3 (nothing to remove; coverage is absent) |
| Doc screenshots | `git grep -n -E "production-" -- apps/ui/tests/visual/doc-screenshots.json` | `production-home`, `production-recording-check`, `production-stage-evidence`, `production-stage-evidence-changed`; `production-stage-suggestions.webp` was deleted by the swap | gone (the four remaining are redrawn from the new page) |
| Production guide | `git grep -n -i -E "board\|PlanPanel" -- docs/guides/using-the-app/production.md` | empty; the guide's Schedule section is at line 202 | gone; no separate Schedule guide exists (L6) |

## Gaps

A gap is a mock case that is real behaviour, or a leftover, with no real test or ruling. The coordinator opens the follow-ups; this slice changed no source.

| id | what | evidence | proposed test | owner |
| --- | --- | --- | --- | --- |
| G1 | Start session sends the recording chapter to the Booth | `ProductionPage.tsx:274` calls `goToBooth(recordingChapter?.id)`; `pipeline.test.tsx` asserts only the callback | `ProductionPage.test.tsx::Start session opens the Booth on the chapter being recorded` | Production test follow-up |
| G2 | The Edit cell and the built-in recorder | `ProductionPage.tsx:188` sends the Edit cell to `openEditingCheck`; nothing tests the click and no text says what happens with the built-in recorder | `ProductionPage.test.tsx::the Edit cell opens the editing check of its chapter` | Production test follow-up; the built-in wording needs an owner ruling |
| G3 | Changed-chapter flag and its review dialog | `NextUp.tsx:96` drops the `flags` item when `onReviewChanges` is absent and `ProductionPage.tsx` passes none; no dialog named Chapters to review exists | `ProductionPage.test.tsx::a chapter whose text changed shows Next up a review item that opens the changed chapters` | Production product slice (behaviour missing, not only a test) |
| G4 | Retry feedback when REAPER is still off | `ProductionPage.tsx:263` passes `readCaps` as `onRetry`; no toast | `ProductionPage.test.tsx::Retry says the recorder is still not running` | Production test follow-up |
| G5 | Production under each heading style and at 40 chapters | The scenario-book rule is in the domain-state PRD; `pipeline.test.tsx` renders five chapters; there is no heading-style setting in `apps/ui/src` | `ProductionPage.test.tsx::names chapters in the manuscript's heading style` | the scenario audit's owner |
| G6 | The fixed inputs live in one module | `schedule/estimates.ts` holds them; no real test scans for stray copies of 9,300 and the others | `schedule/estimates.test.ts::no source outside estimates.ts spells a fixed input` | Schedule test follow-up |
| G7 | Pickups session time and its not-measured state | No test under `components/pickups` reads `sessionMinutes` | `pickups/PickupsPage.test.tsx::shows the session time, and not measured yet without a source` | SN-C34 (Pickups audit) |
| G8 | Report sections the narrator can tick | `ReportDialog.tsx` has only the amount checkbox; `internal/productionreport` writes fixed sections; no ruling or ADR records the choice (ADR 0406 covers the amount only) | `report/ReportDialog.test.tsx::a section left unticked is left out of the preview` | owner ruling on #992 first |
| L1 | The benchmark Production fidelity row | `catalog/production.ts:22`, `drivers/production.ts:25`, `mock-match/mocks.ts:43` still score the Production home against benchmark mock 01 (`?mockFidelity=01`) | none; delete or repoint | SN-C4 |
| L2 | Stage-evidence snapshot and specs | `aria/snapshots/slide-over-stage-evidence.aria.yml` and `aria/dialogs.spec.ts:54,196,208` name a dialog `Stage suggestion: Chapter 4 — …` and a `grid` named `Chapter pipeline`; the swap's driver (`drivers/shared.ts:447`) opens a dialog named `Stage readiness` and the table is a `table` (`ProductionPage.test.tsx` `findByRole('table', …)`). By reading, they no longer match | `aria/dialogs.spec.ts` against the readiness dialog | SN-C4 or a visual-suite fixer; Playwright not run here |
| L3 | Schedule has no state-catalogue row, driver, aria snapshot or doc screenshot | Only stories exist (`MilestoneTable`, `MilestoneDialog`, `VerdictPill`) | a `schedule` page in `state-catalog.ts` with a driver | SN-C4 |
| L4 | Catalogue wording from the old board | `catalog/production.ts` descriptions still say "the board" and "mock 01" (lines 6, 24, 66, 74) | none; reword | SN-C4 |
| L5 | A comment naming a deleted file | `proof/ProofingStagePanel.tsx:31` cites `ChapterBoard` | none; reword | any Proof change |
| L6 | No Schedule guide | The guide is one paragraph in `docs/guides/using-the-app/production.md:202`; milestones, the contract and the work-left table are undocumented | none; `doc-impact-check` on the Schedule | SN-C51 |

## Verification

The cited tests, run together at `e4deb06`:

```text
pnpm --dir apps/ui exec vitest run \
  src/components/booth/frame/frame.test.tsx src/components/production/ProductionPage.test.tsx \
  src/components/production/RecordingCheck.test.tsx src/components/production/chapterCheckStatus.test.ts \
  src/components/production/measured src/components/production/overview \
  src/components/production/pipeline src/components/production/readiness \
  src/components/production/report src/components/production/target \
  src/components/recordingcheck/CheckRecordingsDialog.test.tsx src/components/schedule
(cd apps/desktop && go test . ./internal/stages ./internal/coverage ./internal/productionreport)
node scripts/ci/studio-next-parity.mjs
```

Result in this audit: Vitest, 37 files and 389 tests passed. `go test` passed for the three `internal` packages; the root package (`bindings_stages_test.go`, `bindings_production_test.go`, `production_report_test.go`) did not build here for want of `gtk4` and `webkitgtk-6.0`, so its cited tests were read, not run. CI runs them.
