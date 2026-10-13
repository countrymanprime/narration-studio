# Studio Next parity: Script and Story Bible (SN-C311)

Mock files: script.test.tsx, bible.test.tsx, bible-batch-a.test.tsx, speakers.test.tsx

**Date:** 2026-10-12. **Code audited:** `main` at `4323eff`, after the Script and Story Bible swap (SN-B8, #1515). **Slice:** SN-C311 (#1200), SNC-3 of the [Studio Next cutover PRD](../prds/studio-next-cutover.prd.md). **Mock audited:** `docs/research/mockups/studio-next/tests/`. SN-C4 reads this note when it flips the ratchets; SN-C51 and SN-C52 read it for the steady-state docs.

Method: each mock case is a row below, mapped to a real test by name and by reading the real test file where the row's note says it asserts less. The checker is `node scripts/ci/studio-next-parity.mjs`. It proves a cited test file exists and holds the name; it does not prove the test asserts what the mock case asserts. The app was not run and the Playwright suites were not run. The cited real tests were run once (see [Verification](#verification)).

## Result

- 96 mock cases: 61 `ported`, 17 `covered`, 18 `mock-only`. Of the 18, 16 are gaps (rows whose note starts `GAP`) and 2 are the mock's own fixtures (its import sample and its migration of sample confirmations).
- 22 gaps (G1 to G22, under [Gaps](#gaps)). A `covered` row whose real test asserts less names its gap id in the note.
- Agreed rulings: 14 in scope (SB-1 to SB-14). 9 have a test row; 5 do not (SB-1 and SB-11 are rules about process, SB-3, SB-7 and SB-10 are partly built). The 8 rejected and 5 maybe rows (SB-15 to SB-27) and ML-3 to ML-5 are in [Other rulings](#other-rulings).
- Old equivalents: 14 checks. 7 are `gone`. 7 found leftovers (L1 to L8 under [Leftovers](#leftovers)): doc images, stale comments, a tracked binary, the `ReaderBookmark` type, an unused Go method and two guide sentences.
- No product test was added: the slice owns one file.

**The checker has no status for a gap.** A mock case with no real test must still have a row, and only `mock-only` passes with an empty `real test`. Gap rows therefore carry `mock-only` and a note that starts `GAP Gn`, as the Production and Schedule note does. They are not excused: each has an entry under [Gaps](#gaps). SN-C4 should count them as open.

**Two drifts the swap PR listed are confirmed on `main` and are gaps here**: the Script page has no key-hint footer (the mock's `Legend.tsx`; G20), and the Opening credits are cards in the reader, not a row of the chapter list (G21). The Story Bible keeps the old frame (G22).

## Mock cases

| mock file | mock case | status | real test | note |
| --- | --- | --- | --- | --- |
| script.test.tsx | `${style}, ${n} chapters` | covered | apps/ui/src/components/script/page/chapters/ChapterList.test.tsx::draws the label and title of every chapter from the data | Five-chapter fixtures; chapterHeading.test.ts covers the numbered, titled and credits headings. The mock's gutenberg and colon styles and the 12 and 40 chapter sizes are not rendered: Gap G13. |
| script.test.tsx | `changes the dot, the pressed button and the data, and says so` | ported | apps/ui/src/components/script/page/chapters/ChapterCard.test.tsx::changes the pressed button and says so when a prep state is pressed | The dot and the data side: ChapterList.test.tsx "shows a prep dot per chapter that follows the hook" and useScriptData.test.tsx "sets, steps within the ends, announces". |
| script.test.tsx | `arrow keys on the reader step the prep state of the chapter in view` | ported | apps/ui/src/components/script/page/registry/useScriptRegistry.test.tsx::keys-follow-the-mock: Left and Right on the reader step the prep state of the chapter in view |  |
| script.test.tsx | `highlights every match, counts them, steps and closes` | ported | apps/ui/src/components/script/page/tools/find/FindBar.test.tsx::counts the matches, steps with wrap on Enter and Shift+Enter, and says when there are none | Highlights: Reader.test.tsx "draws the matches and marks the current one". |
| script.test.tsx | `lists results and picking one makes it current` | ported | apps/ui/src/components/script/page/tools/find/FindBar.test.tsx::choosing a result makes it current, hides the list and returns focus |  |
| script.test.tsx | `Escape closes Find only when no menu is open and no drawer is showing` | ported | apps/ui/src/components/script/page/registry/useScriptRegistry.test.tsx::keys-follow-the-mock: Escape closes Find when no menu is open and no drawer shows |  |
| script.test.tsx | `is absent without a selection` | ported | apps/ui/src/components/script/page/tools/select/SelectionTool.test.tsx::draws nothing for a collapsed selection and appears under one inside a paragraph |  |
| script.test.tsx | `offers Mark, Story Bible and Look up for a selection in one paragraph` | ported | apps/ui/src/components/script/page/tools/select/SelectionTool.test.tsx::has the three groups with accessible names |  |
| script.test.tsx | `is disabled across paragraphs` | ported | apps/ui/src/components/script/page/tools/select/SelectionTool.test.tsx::shows one disabled button with the reason | The multi-paragraph read: getSelection.test.tsx "reports a selection across paragraphs as multi". |
| script.test.tsx | `the composer creates a note with its text` | ported | apps/ui/src/components/script/page/tools/select/MarkComposer.test.tsx::saves the note once with its text, opens the Notes tab on it and closes |  |
| script.test.tsx | `a query needs its question, then opens a thread in the Queries tab` | ported | apps/ui/src/components/script/page/tools/select/MarkComposer.test.tsx::refuses an empty one with a sentence and no call, then starts the mark open |  |
| script.test.tsx | `adds to a thread, resolves and reopens` | ported | apps/ui/src/components/script/page/rail/threads/ThreadsTab.test.tsx::Reply appends as the author, Resolve and Reopen toggle the status |  |
| script.test.tsx | `an empty reply is refused` | ported | apps/ui/src/components/script/page/rail/threads/ThreadsTab.test.tsx::an empty reply is refused with a sentence and no call |  |
| script.test.tsx | `edits a message` | ported | apps/ui/src/components/script/page/rail/threads/ThreadsTab.test.tsx::Edit shows a labelled textarea; Save changes the message and Cancel leaves it |  |
| script.test.tsx | `deletes a message and offers Undo, which restores it` | ported | apps/ui/src/components/script/page/rail/threads/ThreadsTab.test.tsx::Delete removes the message with a toast whose Undo restores it at its index |  |
| script.test.tsx | `Copy the query puts the passage and the question on the clipboard` | ported | apps/ui/src/components/script/page/rail/threads/ThreadsTab.test.tsx::writes "{chapter line} | The real test name continues with the quote and question template. |
| script.test.tsx | `saving how I say a word updates its status` | ported | apps/ui/src/components/script/page/rail/words/WordsTab.test.tsx::Save and Enter call saveSay with the manual source, and the pill follows |  |
| script.test.tsx | `a local dictionary shows an inline entry and can be used` | ported | apps/ui/src/components/script/page/rail/words/WordsTab.test.tsx::Local dictionary shows the definition from the dictionary lookup |  |
| script.test.tsx | `says when the local dictionary is missing and when the online one is offline` | covered | apps/ui/src/components/script/page/rail/words/WordsTab.test.tsx::Local dictionary not installed says so and shows the existing download prompt | The prompt is a prop the tab shows; the page passes none, so the real tab only says the dictionary is not installed: Gap G17. The offline online-service half is WordsTab.test.tsx "Online service that cannot be reached says so and points to the web links". |
| script.test.tsx | `confirming a suggested speaker marks the phrase confirmed` | ported | apps/ui/src/components/script/page/tools/speaker/SpeakerPicker.test.tsx::confirmSpeaker(cueId, entryId) makes the phrase confirmed with the chosen speaker |  |
| script.test.tsx | `the picker suggests people in the chapter first, and searches everyone` | ported | apps/ui/src/components/script/page/tools/speaker/SpeakerPicker.test.tsx::lists everyone when searching | The chapter-first half: "lists this chapter's speakers, not everyone, while the search is empty". |
| script.test.tsx | `the picker has no Narrator option, even when searching for it` | ported | apps/ui/src/components/script/page/tools/speaker/SpeakerPicker.test.tsx::has no narrator row, even when searching for it |  |
| script.test.tsx | `rows show the alias with its Story Bible entry as the secondary text` | ported | apps/ui/src/components/script/page/tools/speaker/SpeakerPicker.test.tsx::shows the name the Story Bible spells with its entry beneath |  |
| script.test.tsx | `speaker chips take the colour of their speaker, and the narrator can choose another` | ported | apps/ui/src/components/script/page/reader/Para.test.tsx::takes the speaker colour, with the narrator override, for a confirmed speaker |  |
| script.test.tsx | `lookup of an unknown text offers to create an entry, which adds it to the Story Bible` | ported | apps/ui/src/components/script/page/tools/select/SelectionTool.test.tsx::lists the Story Bible kinds, creates the entry from the selected text and opens it in the Bible tab |  |
| script.test.tsx | `the side panel shows the entry read-only; editing happens on the Story Bible page` | ported | apps/ui/src/components/script/page/rail/bible/BibleTab.test.tsx::shows the selected entry with its kind, first appearance, description and names, and nothing editable | The link out: BibleTab.test.tsx "Open in Story Bible calls the page with the entry id". |
| script.test.tsx | `Mark reviewed clears the flag banner` | ported | apps/ui/src/components/script/page/chapters/ChapterCard.test.tsx::draws the review banner only when the chapter carries a review, and Mark reviewed calls back |  |
| script.test.tsx | `Record in Booth opens the Booth on that chapter` | ported | apps/ui/src/components/script/page/ScriptPage.test.tsx::Record in Booth on a narration chapter calls goToBooth with the chapter |  |
| script.test.tsx | `shows the empty state and opens the import once` | ported | apps/ui/src/components/script/page/ScriptPage.test.tsx::draws the need-a-manuscript state, offers the import, and goes to Production only when asked | The mock's own opening of the import dialog is dropped on purpose (issue 1720): here the import lives on Production, so opening it by itself was a page change nobody asked for. |
| bible.test.tsx | `asks for a manuscript when there is none` | mock-only |  | The /story-bible route draws the page's own ask (issue 1720); App.test.tsx covers it with the other no-manuscript routes. |
| bible.test.tsx | `lists entries with mention counts and filters by kind chip and search` | covered | apps/ui/src/components/storybible/GuideDetail.actions.test.tsx::needs-review-category-tab-still-works: the category tab filters by category, not by the flags | The list filters by category tab, not by the mock's kind chips (Gap G22). Mention counts are gone by SB-6 and SB-12 (see the row-count case below). The search box has no test: Gap G2. |
| bible.test.tsx | `colours the list border and chips from the type colour, and follows Settings edits` | mock-only |  | GAP G3: the real list tints a row by its fixed category (CAT_DOT_BG in Guide.tsx); Settings has no type colour to edit, so nothing follows a Settings edit. |
| bible.test.tsx | `"Appears in" counts match the selector and open the chapter in Script` | ported | apps/ui/src/components/storybible/AppearsIn.test.tsx::names the chapters and opens one in Script |  |
| bible.test.tsx | `shows voice, acts and knows for characters only` | covered | apps/ui/src/components/script/page/rail/bible/BibleTab.test.tsx::a place has no talk, act or know rows | Only the Script rail shows the rows, read-only. The Story Bible page has no How they talk, act or know fields: Gap G4 (SB-10). |
| bible.test.tsx | `renaming keeps relationships, because they point at ids` | mock-only |  | GAP G5: relationships point at ids on the host, but no test (UI, Go or sidecar) renames an entry and checks its relationships. |
| bible.test.tsx | `refuses an empty or taken name` | mock-only |  | GAP G6: no test refuses an empty or already used entry name. |
| bible.test.tsx | `adds a name with Enter, and the last name cannot be removed` | covered | apps/ui/src/components/storybible/GuideDetail.pending.test.tsx::keeps an alias the narrator typed while another action was running, instead of clearing it and adding nothing | Asserts that a typed alias survives a busy action. Adding with Enter, and that the last name cannot be removed, are not asserted: Gap G7. |
| bible.test.tsx | `stores how each name is said; the first name sets the entry pronunciation` | ported | apps/ui/src/components/storybible/source/source.test.tsx::first-name-sets-the-entry | Per-name save: GuideDetail.aliasPronunciation.test.tsx "typing an alias’s pronunciation saves it as the narrator’s own with that alias’s index". |
| bible.test.tsx | `play and record are toasts` | covered | apps/ui/src/components/storybible/GuideDetail.test.tsx::plays a ready preview without rendering a native audio control and toggles pause | The real page plays a rendered preview. It has no Record control, so the mock's Record toast has no counterpart. |
| bible.test.tsx | `find in the manuscript opens Find with the name` | covered | apps/ui/src/components/script/page/rail/bible/BibleTab.test.tsx::Find in the manuscript opens Find with the name, again each time | The button is in the Script rail only; the Story Bible page has none: Gap G8. |
| bible.test.tsx | `deleting an entry removes its relationships, clears the selection and toasts` | covered | apps/ui/src/components/storybible/GuideDetail.test.tsx::is a red alertdialog that keeps focus inside and hands it back to Delete entity on Escape | The confirm names relationships. That the relationships go, the selection clears and a toast says so is not asserted: Gap G9. |
| bible.test.tsx | `a new entry is named, selected, focused and uses the filtered kind` | covered | apps/ui/src/components/storybible/GuideDetail.actions.test.tsx::choosing a category saves the draft and it stays in the list | Naming, selecting the draft and keeping it are asserted. Focus on the name field and the kind taken from the filter are not: Gap G10. |
| bible.test.tsx | `relationship picker searches entries; text is editable; add and remove work` | covered | apps/ui/src/components/storybible/GuideDetail.pending.test.tsx::Remove relationship, and the other buttons wait while it runs | Only Remove is tested. The picker search, the editable text and Add are not: Gap G11. |
| bible.test.tsx | `relationships show only the relationship and the other entry, with incoming ones marked` | mock-only |  | GAP G11: the real table has a Name and a Relationship column; no test asserts that an incoming relationship is marked (SB-7, two-way). |
| bible.test.tsx | `opens read-only; Edit, then Save keeps and Cancel puts everything back` | ported | apps/ui/src/components/storybible/GuideDetail.test.tsx::Edit enables the fields and shows Save and Cancel; Cancel restores read-only |  |
| bible.test.tsx | `"Appears in" sits after the editable parts` | ported | apps/ui/src/components/storybible/GuideDetail.test.tsx::lists the chapters after the editable parts and opens one in Script |  |
| bible.test.tsx | `arrow keys move through the list` | mock-only |  | GAP G12: Guide.tsx has no key handler for the entry list (only the alias box has one); a Tab stop per row is the only way through. |
| bible.test.tsx | `shows chapter names in the ` | covered | apps/ui/src/components/storybible/AppearsIn.test.tsx::names the chapters and opens one in Script | The three heading styles at 40 chapters are not rendered: Gap G13. |
| bible-batch-a.test.tsx | `the provider lists the sources and gives a candidate per word from fixture data` | ported | apps/ui/src/components/storybible/source/source.test.tsx::sources-come-from-the-port-and-a-new-one-needs-no-screen-change | The fixture data half is the mock's own sample data. |
| bible-batch-a.test.tsx | `a different provider replaces the mock without any screen changing` | ported | apps/ui/src/components/storybible/source/source.test.tsx::sources-come-from-the-port-and-a-new-one-needs-no-screen-change |  |
| bible-batch-a.test.tsx | `a flagged word takes the default source, and typing makes the value the narrator's own` | covered | apps/ui/src/components/storybible/source/source.test.tsx::typing-makes-it-the-narrators-own-and-keeps-the-text | Words tab: WordsTab.test.tsx "Save and Enter call saveSay with the manual source". Default source at build: service_test.go TestDefaultPronunciationSourceReachesBuildAliasEditAndCreate. |
| bible-batch-a.test.tsx | `overriding with another source is reversible (undo, or pick the default again)` | ported | apps/ui/src/components/storybible/source/source.test.tsx::switching-is-reversible |  |
| bible-batch-a.test.tsx | `a source that cannot answer leaves the value as it is and says why` | ported | apps/ui/src/components/storybible/source/source.test.tsx::choosing-a-source-fetches-a-candidate-or-says-why-not |  |
| bible-batch-a.test.tsx | `choosing "entered by me" keeps the text and marks it as the narrator's` | ported | apps/ui/src/components/storybible/source/source.test.tsx::typing-makes-it-the-narrators-own-and-keeps-the-text |  |
| bible-batch-a.test.tsx | `names carry a source too; typing is manual, a source fills the value, the first name sets the entry` | covered | apps/ui/src/components/storybible/GuideDetail.aliasPronunciation.test.tsx::choosing a source for an alias pronounces only that alias |  |
| bible-batch-a.test.tsx | `a name added to an entry takes the default source's pronunciation when there is one` | ported | sidecars/manuscript-guide/tests/test_manuscript_guide.py::test_a_new_aliass_pronunciation_prefers_the_narrators_default_source |  |
| bible-batch-a.test.tsx | `there are no query / confirmed / researched states on names` | ported | apps/ui/src/components/storybible/source/source.test.tsx::no-query-states-anywhere |  |
| bible-batch-a.test.tsx | `the Story Bible shows the source icon and name, and a menu of the data-driven sources switches it` | ported | apps/ui/src/components/storybible/source/source.test.tsx::tag-shows-icon-and-name |  |
| bible-batch-a.test.tsx | `the Words tab shows the source of the word and switches it` | ported | apps/ui/src/components/script/page/rail/words/WordsTab.test.tsx::lists each flagged word with its say-value, source icon and status |  |
| bible-batch-a.test.tsx | `"Use" on a definition records the definition source` | ported | apps/ui/src/components/script/page/rail/words/WordsTab.test.tsx::Use fills the input with the definition |  |
| bible-batch-a.test.tsx | `nameOwner finds another entry with the name, ignoring case; the add is refused` | mock-only |  | GAP G15: the real alias box looks for a matching entry as the narrator types (GuideDetail.tsx aliasMatches); no test checks the match ignores case or that the add is refused. |
| bible-batch-a.test.tsx | `combines names and say-values, re-points relationships by id, and is one undo` | mock-only |  | GAP G14: the real Merge deletes the source after a confirm and has no Undo; no test checks the names and say-values combine or that relationships re-point. |
| bible-batch-a.test.tsx | `appears-in is the union of both entries, and confirmed speakers keep resolving` | mock-only |  | GAP G14: no test checks that a merged entry keeps both entries' chapters or that confirmed speakers keep resolving. |
| bible-batch-a.test.tsx | `the Names box offers "Merge into this entry" instead of adding a copy` | covered | apps/ui/src/components/storybible/GuideDetail.actions.test.tsx::after Merge, editing the target and cancelling leaves the merged source out of the list | The button reads "Merge into current entry", not the mock's "Merge into this entry". Only what follows a merge is asserted; the offer itself is Gap G15. |
| bible-batch-a.test.tsx | `the merge offer and the typed name do not follow to another entry` | mock-only |  | GAP G15: no test checks that the offer and the typed text clear when another entry is chosen. |
| bible-batch-a.test.tsx | `Cancel after a merge does not bring the merged entry back` | ported | apps/ui/src/components/storybible/GuideDetail.actions.test.tsx::after Merge, editing the target and cancelling leaves the merged source out of the list |  |
| bible-batch-a.test.tsx | `Cancel on a new, unsaved entry drops it and its relationships` | ported | apps/ui/src/components/storybible/GuideDetail.actions.test.tsx::Cancel on a new entry leaves no entry in the list and writes nothing |  |
| bible-batch-a.test.tsx | `Save keeps it; leaving an unsaved draft for another entry drops it; an existing entry is never dropped` | ported | apps/ui/src/components/storybible/GuideDetail.actions.test.tsx::picking another row drops the unsaved draft and keeps every existing entry | Existing entry never dropped: "cancelling the edit of an existing entry never drops it". |
| bible-batch-a.test.tsx | `starting another new entry drops the unsaved one` | mock-only |  | GAP G16: the test picks another row; none starts a second new entry while a draft is open. |
| bible-batch-a.test.tsx | `the Cancel button of a new entry removes it from the list` | ported | apps/ui/src/components/storybible/GuideDetail.actions.test.tsx::Cancel on a new entry leaves no entry in the list and writes nothing |  |
| bible-batch-a.test.tsx | `sorts by name, by type and by chapters, with the name as the tie-break` | ported | apps/ui/src/components/storybible/entryList.test.ts::sorts by chapter count, most first, then name | Name and type: the two cases above it in the file. |
| bible-batch-a.test.tsx | `the control sorts the list and the choice is kept in ui state` | ported | apps/ui/src/components/storybible/GuideDetail.actions.test.tsx::sorts by chapters, saves the choice and restores it on reopen |  |
| bible-batch-a.test.tsx | `each row shows its names and its chapters, and no mention counts` | ported | apps/ui/src/components/storybible/GuideDetail.actions.test.tsx::a row has a name count and a chapter count, and the list has no occurrences column |  |
| bible-batch-a.test.tsx | `lists chapters with a button to go to each, and no mention or line counts` | ported | apps/ui/src/components/storybible/GuideDetail.test.tsx::shows no line or mention counts | The button per chapter: AppearsIn.test.tsx "names the chapters and opens one in Script". |
| bible-batch-a.test.tsx | `are stable per entry, from the palette, and the same for every name of the entry` | ported | apps/ui/src/components/primitives/speakerColor.test.ts::is deterministic: the same id always gets the same index |  |
| bible-batch-a.test.tsx | `give the main speakers of the book more than one colour` | ported | apps/ui/src/components/primitives/speakerColor.test.ts::spreads distinct ids across more than one colour |  |
| bible-batch-a.test.tsx | `the narrator's choice wins and can be put back to automatic` | ported | apps/ui/src/components/primitives/speakerColor.test.ts::wins over the stable pick, for the index and the token | Back to Automatic: GuideDetail.test.tsx "puts the colour back to Automatic with one host call". |
| bible-batch-a.test.tsx | `the speaker picker shows each speaker's swatch` | ported | apps/ui/src/components/script/page/tools/speaker/SpeakerPicker.test.tsx::gives each row the swatch of its entry's colour, a chosen colour winning |  |
| bible-batch-a.test.tsx | `the editor offers a colour for speaking types only` | ported | apps/ui/src/components/storybible/SpeakerColourField.test.tsx::shows only for a speaking category | Only Character speaks in the real app (SpeakerColourField.tsx); the mock's per-type flag is Gap G19. |
| bible-batch-a.test.tsx | `the fixture import flags some entries and names; the narrator's own entries are not flagged` | mock-only |  | The mock's own import fixture and sample entries. The real flags come from the host: entryList.test.ts "reads the host flags when it sends them". |
| bible-batch-a.test.tsx | `a filter chip with the count shows only the entries that need review` | ported | apps/ui/src/components/storybible/GuideDetail.actions.test.tsx::chip-with-the-count-filters: counts the flagged and the to-verify entries once and filters to them |  |
| bible-batch-a.test.tsx | `Mark reviewed clears the entry and all its names, can be undone, and the count follows` | ported | apps/ui/src/components/storybible/GuideDetail.test.tsx::mark-reviewed-can-be-undone: Undo in the toast calls guideFlagReview to put the same flags back | Clears and the count follows: GuideDetail.actions.test.tsx "mark-reviewed-clears-the-entry-and-its-names". |
| bible-batch-a.test.tsx | `a name is reviewed on its own; the entry is reviewed when nothing is left` | ported | apps/ui/src/components/storybible/GuideDetail.test.tsx::a name's own button calls guideMarkReviewed with the alias index |  |
| bible-batch-a.test.tsx | `the editor shows the flags and the buttons clear them; Cancel does not bring a flag back` | ported | apps/ui/src/components/storybible/GuideDetail.actions.test.tsx::editor-shows-the-flags: Cancel of an edit does not bring a cleared flag back |  |
| bible-batch-a.test.tsx | `merging keeps the flags of both entries on the result` | ported | sidecars/manuscript-guide/tests/test_review_flags.py::test_merge_keeps_the_flags_of_both |  |
| speakers.test.tsx | `are the aliases of entries whose type can speak` | covered | apps/ui/src/components/script/page/tools/speaker/speakerChoices.test.ts::lists every name of each speaking entry, with the entry beneath and its colour | Which types speak is fixed (Character); the mock's per-type flag is Gap G19. |
| speakers.test.tsx | `detects "said X" by alias, longest first, whole words, ignoring case` | covered | sidecars/manuscript-guide/tests/test_extraction_booknlp.py::test_a_tag_before_the_quote_and_a_name_before_the_verb_are_tags_too | The real app attributes a line in the guide sidecar, not by an alias scan in the page; whole-word longest-first matching of names in text is script.selectors.test.ts "names match longest first, as whole words, ignoring case". |
| speakers.test.tsx | `migrated confirmations are aliases, and narration stays NARR` | mock-only |  | The mock's migration of its own sample confirmations and its NARR code; the real cues carry an entry id. |
| speakers.test.tsx | `a quoted line nobody is named for stays unknown` | ported | apps/ui/src/components/script/page/data/script.selectors.test.ts::confirmed for a correction, suggested otherwise, unknown when none, in reading order |  |
| speakers.test.tsx | `adding an alias to a Character makes it pickable and detectable` | covered | apps/ui/src/components/script/page/tools/speaker/speakerChoices.test.ts::lists every name of each speaking entry, with the entry beneath and its colour | Detectable after the add (a new alias found in the text) is not asserted: Gap G18. |
| speakers.test.tsx | `renaming an entry renames the alias and keeps its confirmed lines` | mock-only |  | GAP G18: no test renames a speaking entry and checks its confirmed lines keep their speaker. |
| speakers.test.tsx | `a removed alias is no longer a speaker, and its stale confirmation falls back to detection` | mock-only |  | GAP G18: no test removes an alias and checks a stale confirmation falls back. |
| speakers.test.tsx | `removing the Can speak flag removes the type's entries; setting it on another type adds them` | mock-only |  | GAP G19: Settings has no Can speak flag; only Character speaks. |
| speakers.test.tsx | `Story Bible lines follow the aliases` | mock-only |  | GAP G19: the lines of an entry follow its type's Can speak flag in the mock; the real app has no flag. |
| speakers.test.tsx | `has a per-type checkbox wired to the data` | mock-only |  | GAP G19: no Can speak checkbox in apps/ui/src/components/settings (SNM-1 and SNM-2 hold none). |
| speakers.test.tsx | `offers only speaking entries and never a Narrator` | ported | apps/ui/src/components/script/page/tools/speaker/SpeakerPicker.test.tsx::has no narrator row, even when searching for it | Only speaking entries: speakerChoices.test.ts "leaves out places and other categories that cannot speak". |

## Rulings

Each agreed ruling whose behaviour a real test asserts. The test cell is the best single test; the ruling's other parts are in the case table.

| ruling id | test |
| --- | --- |
| SB-2 | apps/ui/src/components/storybible/source/source.test.tsx::no-query-states-anywhere |
| SB-4 | apps/ui/src/components/storybible/GuideDetail.actions.test.tsx::Cancel on a new entry leaves no entry in the list and writes nothing |
| SB-5 | apps/ui/src/components/storybible/GuideDetail.actions.test.tsx::sorts by chapters, saves the choice and restores it on reopen |
| SB-6 | apps/ui/src/components/storybible/GuideDetail.actions.test.tsx::a row has a name count and a chapter count, and the list has no occurrences column |
| SB-8 | apps/ui/src/components/script/page/reader/Para.test.tsx::takes the speaker colour, with the narrator override, for a confirmed speaker |
| SB-9 | apps/ui/src/components/storybible/GuideDetail.actions.test.tsx::chip-with-the-count-filters: counts the flagged and the to-verify entries once and filters to them |
| SB-12 | apps/ui/src/components/storybible/AppearsIn.test.tsx::names the chapters and opens one in Script |
| SB-13 | apps/ui/src/components/script/page/rail/threads/ThreadsTab.test.tsx::Reply appends as the author, Resolve and Reopen toggle the status |
| SB-14 | apps/ui/src/components/script/page/ScriptPage.test.tsx::Bookmark here adds a ribbon, opens its editor, lists it in the tab, and Next and Previous move between bookmarks, wrapping |

Agreed rulings with no row, and why:

| ruling | why no test row |
| --- | --- |
| SB-1 | A rule about when to merge, not behaviour. |
| SB-3 | Merge on an alias collision: the offer and what it combines have no test (G14, G15). Only what follows a merge is tested. |
| SB-7 | Relationships two-way: nothing tests that an incoming relationship is shown or marked (G11). |
| SB-10 | Separate talk, act and know fields: built in the Script rail (read-only), not on the Story Bible page (G4). |
| SB-11 | Core-behaviour tests: the rule is this note; the cases above are the result. |

## Other rulings

The index holds the pointer for each: `rejected` rows carry slice `none`; `maybe` rows carry none. This is what the page does now (`main` at `4323eff`).

| ruling | status | what the page does |
| --- | --- | --- |
| SB-15 | rejected | No query or confirm states on names: source.test.tsx "no-query-states-anywhere", Guide.mounts.test.tsx "an entry shows its names with source tags, its suggestions to verify, and no status or query controls". |
| SB-16 | rejected | Not clean. Marks and bookmarks carry a `stale` flag the page uses (reader/layers.ts, bookmarks/model/selectors.ts "Line changed"). The ruling rejected stale-anchor detection. See [Questions for the coordinator](#questions-for-the-coordinator). |
| SB-17 | rejected | The repo markup (`internal/prepmarkup`, `PrepMarkup*`) is deleted; the page draws the narrator's mark types only. |
| SB-18 | rejected | Not clean. Suggestions and an entry's accepted claims show evidence quotes that go to the line (storybible/suggested/row, evidenceLinks.ts; SN-X41). See the questions below. |
| SB-19 | rejected | `internal/prepcompleteness` and `PrepCompletenessSummary` are deleted; the prep dot is the narrator's own state. |
| SB-20 | rejected | Find and the jump menu have sources for the manuscript, entries, marks, words and bookmarks (registry/searchSources.ts); no chapter source. |
| SB-21 | rejected | No speaker coverage strip is drawn. |
| SB-22 | rejected | No prep sheet export on either page. |
| SB-23 | maybe | The Story Bible keeps Properties (PropertiesSection.tsx), as built; the swap kept it on the DQ-12 list. |
| SB-24 | maybe | Counts in the chapter facts line are text; "Appears in" goes to a chapter. No count opens a list. |
| SB-25 | maybe | The page's counts are computed from the data on each read (script.selectors.ts); nothing is stored. |
| SB-26 | maybe | Each list builds its own rows (AppearsIn, the Bible tab, the names list); no shared name row. |
| SB-27 | maybe | The Script rail's Bible tab is read-only and links to the Story Bible. The Series tab is still built (Guide.tsx, catalog rows `series-tab-*`). See the questions below. |
| ML-3 | maybe | As SB-24 and SB-25. |
| ML-4 | maybe | As SB-26. The Words tab edits the say-value in the rail (WordsTab.test.tsx "Save and Enter call saveSay"). |
| ML-5 | maybe | The Script page has no Replace manuscript control (grep of `components/script` and `components/storybible`); Settings holds it. |

### Questions for the coordinator

These are conflicts between an index status and the code, not mock gaps. This slice changes nothing.

1. **SB-16 (rejected) and SB-18 (rejected) are in the app.** The stale flag on marks and bookmarks and the evidence quotes on suggestions came in with slices that cite later rulings (SN-B7, SN-X41). If the index status is right, a slice removes them; if the later ruling won, SN-C4 should correct the index row.
2. **SB-27 says the Series tab is dropped (one book per app).** The Story Bible still has a Series tab and two catalog rows. DQ-12 keeps it "as built"; if the ruling stands, a slice removes it.

## Gaps

Every `GAP` row and every `covered` row that names a gap. A gap here is real behaviour (or an agreed ruling) with no real test, or a mock behaviour the real page lacks. The coordinator opens the follow-up; no slice id exists yet, so the owner column names the area. "Test" is the proposed name, in the file that would hold it.

| id | what is missing | proposed test | owner area |
| --- | --- | --- | --- |
| G1 | `/story-bible` redirects to `/` with no manuscript; no test, and the page has no ask of its own | App.test.tsx `the Story Bible route sends a project with no manuscript home` | Story Bible fix-up |
| G2 | The entry search box has no test | Guide.search.test.tsx `Search entries narrows the list by name and by alias` | Story Bible fix-up |
| G3 | No editable type colour; rows tint by fixed category | settings/BibleTypesSection.test.tsx `a type colour edit recolours the list` (needs the control first) | Settings Story Bible types |
| G4 | No How they talk, act or know fields on the Story Bible page (SB-10) | GuideDetail.talkActKnow.test.tsx `shows how they talk, act and know for a character only` | Story Bible fix-up |
| G5 | No test that renaming an entry keeps relationships | sidecars/manuscript-guide/tests: `test_renaming_an_entity_keeps_the_relationships_that_point_at_its_id` | Story Bible fix-up |
| G6 | No test refuses an empty or taken entry name | GuideDetail.name.test.tsx `refuses an empty or taken name` | Story Bible fix-up |
| G7 | Add a name with Enter and the last name undeletable: untested | GuideDetail.names.test.tsx `adds a name with Enter, and the last name cannot be removed` | Story Bible fix-up |
| G8 | No Find in the manuscript button on the Story Bible page | GuideDetail.find.test.tsx `Find in the manuscript opens the Script's Find with the name` | Story Bible fix-up |
| G9 | Delete: relationships removed, selection cleared, toast: untested | GuideDetail.actions.test.tsx `deleting an entry removes its relationships, clears the selection and says so` | Story Bible fix-up |
| G10 | New entry: focus on the name, kind taken from the filter: untested | GuideDetail.actions.test.tsx `a new entry takes the filtered kind and focuses its name` | Story Bible fix-up |
| G11 | Relationship picker search, editable text, Add, and incoming marked (SB-7): untested | GuideDetail.relationships.test.tsx `adds a relationship from the picker and marks an incoming one` | Story Bible fix-up |
| G12 | No arrow-key movement through the entry list | Guide.keys.test.tsx `arrow keys move through the list` (needs the handler first) | Story Bible fix-up |
| G13 | Heading styles (gutenberg, numbered, colon) at 12 and 40 chapters are not rendered for the chapter list or Appears in | ChapterList.test.tsx `names chapters in every heading style at 40 chapters` | Closed: the test is on main |
| G14 | Merge: names and say-values combine, relationships re-point, appears-in is the union, one undo (SB-3); the real Merge deletes the source and has no Undo | GuideDetail.merge.test.tsx `a merge combines names, re-points relationships and unions Appears in` | Story Bible fix-up |
| G15 | Collision offer: matches ignoring case, refuses the copy, clears when another entry is chosen (SB-3) | GuideDetail.merge.test.tsx `the merge offer follows the typed name and clears on another entry` | Story Bible fix-up |
| G16 | Starting a second new entry drops the unsaved first | GuideDetail.actions.test.tsx `starting another new entry drops the unsaved one` | Story Bible fix-up |
| G17 | The Words tab has no in-place download question for the local dictionary: `useWordsHost` passes no `installPrompt` (named in SN-B8's "Not done") | rail/words/useWordsHost.test.tsx `offers the dictionary download in place` | Closed: the test is in ScriptPage.test.tsx on main |
| G18 | Renaming a speaking entry keeps its confirmed lines; a removed alias falls back; a new alias is detected | script.selectors.test.ts `a renamed or removed alias keeps or drops its confirmed lines` | Closed: the test is on main |
| G19 | No Settings Can speak flag per type; lines and speakers follow it in the mock | settings/BibleTypesSection.test.tsx `has a per-type Can speak checkbox wired to the data` (needs the control first) | Settings Story Bible types |
| G20 | No key-hint footer under the Script reader (mock `Legend.tsx`) | ScriptPage.test.tsx `draws the key hints under the reader` | Closed: the test is on main |
| G21 | Opening credits are cards in the reader; the mock lists an Opening credits row with the prep dot in the chapter list | ChapterList.test.tsx `lists the opening credits with its prep dot` | Closed in #1745: the credits are drawn as the mock's chapters, with their own prep state |
| G22 | Story Bible frame: category tabs not kind chips, a table not two-line rows, the Name field and edit form not heading and read-only fields, Build / refresh and Voice data in the header | Guide.test.tsx `lists entries as two-line rows under kind chips` | Story Bible fix-up (owner's D97 pass) |

G22 is layout, so a test can only pin the structure; the check of the look is the cutover QA line on #1495 ("walk each Studio Next page against the mock"). No gap here needs a new line on #1495: each one is a missing control or a missing test that a unit test can show, and the layout drift is that existing line.

## Old equivalents

Run on `main` at `4323eff`. `gone` means the command printed nothing for the old name, or only the Studio Next code that replaced it.

| item | command | output | result |
| --- | --- | --- | --- |
| Old Script page and its files | `git ls-files -- apps/ui/src/components/script/ScriptPage* apps/ui/src/components/script/ScriptRail* apps/ui/src/components/script/ScriptChapterList* apps/ui/src/components/manuscript/ChapterNav* apps/ui/src/components/manuscript/ParagraphView* apps/ui/src/components/manuscript/SelectionMenu* apps/ui/src/components/manuscript/WordLookup* apps/ui/src/components/manuscript/MarkupDialog*` | (no output) | gone |
| Routes `/script`, `/story-bible` | `git grep -n -E 'path="/(script\|story-bible)"' -- apps/ui/src/App.tsx` | both routes exist and mount the Studio Next `ScriptPage` and `Guide` | gone (old pages); routes kept by design |
| State-catalogue rows and drivers | `grep -o "state: '[^']*'" apps/ui/tests/visual/catalog/script.ts apps/ui/tests/visual/catalog/storybible.ts`; `git grep -n -i quer -- apps/ui/tests/visual/catalog/storybible.ts apps/ui/tests/visual/drivers/storybible.ts` | 17 `script` rows (the Studio Next page; the header comment names SN-B8), 35 `storybible` rows; no query row | gone |
| Aria snapshots | `ls apps/ui/tests/aria/snapshots \| grep -E "script\|bible\|define\|composer\|import"` | `dialog-define-marks`, `dialog-import-entries`, `dialog-mark-composer`, `confirm-import-manuscript`; the six old ones (`slide-over-pronunciation-queries`, `slide-over-word-lookup`, `slide-over-chapters`, `dialog-add-note`, `confirm-download-dictionary`, `confirm-pronunciation-online-batch`) are not listed | gone |
| Doc screenshots | `ls docs/images/ui \| grep -E "script\|storybible"` against `docName` in `doc-screenshots.json` | 4 files have no manifest entry and no guide uses them: `script-formatting`, `script-go-to-line`, `script-word-lookup-download`, `script-word-lookup-not-found`; the 15 files with a manifest entry still show the old pages | leftover L1, L2 |
| Query status, CSV export and import | `git grep -n -i -E "PronunciationQueries\|GuidePronunciationQueries\|QueriesCSV\|ImportQueriesCSV\|SetPronunciationStatus\|queries\.go" -- apps sidecars SECURITY.md docs/architecture docs/reference ':!docs/research/mockups'` | one comment, `VoiceReferencesSection.tsx:30` ("PronunciationQueries.tsx's pattern") | leftover L3 (comment) |
| Open-queries badge in the rail | `git grep -n -i -E "guide\|story\|quer" -- apps/ui/src/components/layout/useNavCounts.ts` | one comment: "Story Bible has none: the open-query count it drew went with the query list" | gone |
| `openQueries` | `git grep -n openQueries -- apps` | `script/page/data` only: the marks-based selector of the new page | gone (not the old badge) |
| Reader bookmarks: bindings | `git grep -n -E "ManuscriptCreateBookmark\|ManuscriptDeleteBookmark\|readerBookmarkCreate\|readerBookmarkDelete" -- apps docs/guides` | `Binary file apps/desktop/shell matches` | gone from source; leftover L4 (binary) |
| Reader bookmarks: contract and schema | `git grep -n -E "ReaderBookmark" -- apps docs/guides` | `contracts/manuscript.ts:65` type, `:76` `ReaderState.bookmarks`, `schemas/manuscript.ts:12,88` | leftover L5 |
| Reader bookmarks: goldens and wire rows | `git grep -n -E "readerBookmark\|reader_bookmark\|ReaderBookmark" -- apps/ui/src/api/wireContracts.test.ts apps/ui/src/api/contractGoldens apps/desktop/internal` | (no output) | gone |
| Prep markup and completeness | `git grep -n -i -E "PrepMarkup\|prepcompleteness\|LookupBatch" -- apps` | comments in `bindings_preview_pin.go`, `preview/pin.go`, `extraction/doc.go`; `pronunciationonline.Service.LookupBatch` and its tests | leftover L6 (comments), L7 (method) |
| Guide `script.md` | `grep -n -i -E "quer(y\|ies)\|CSV\|status\|Generate" docs/guides/using-the-app/script.md` | "open queries" and the Queries tab are the marks of the new page; line 115 says marks replaced the reader notes and the script markup "of earlier versions" | leftover L8 (one sentence) |
| Guide `story-bible.md` | `grep -n -i -E "quer(y\|ies)\|CSV\|status" docs/guides/using-the-app/story-bible.md` | line 92: "pronunciation statuses and the queries list are gone"; line 119 is Import entries (a new feature) | leftover L8 |

### Leftovers

A leftover is a gap with paths. Nothing was deleted here. The swap slice that missed each is SN-B8 (#1515) unless noted; SN-C4 and the coordinator open the fixers.

| id | leftover | paths | note |
| --- | --- | --- | --- |
| L1 | Four doc images with no manifest entry and no guide link | `docs/images/ui/script-formatting.webp`, `script-go-to-line.webp`, `script-word-lookup-download.webp`, `script-word-lookup-not-found.webp` | SN-B8 dropped their manifest entries and left the files. |
| L2 | The guides show the old pages | `docs/images/ui/script-*.webp`, `storybible-*.webp` as linked from `docs/guides/using-the-app/script.md` and `story-bible.md` | Named in SN-B8's "Not done": the guide-refresh worker owns `docs/images/ui`. |
| L3 | A comment names a deleted file | `apps/ui/src/components/storybible/VoiceReferencesSection.tsx:30` | The file is on SN-B8's must-not-touch list. Also stale: `apps/ui/src/App.tsx:527`, `apps/ui/src/components/booth/BoothView.tsx:191`, `apps/ui/src/components/primitives/speakerColor.ts:2` and `Toolbar.stories.tsx:110` name `script/ScriptPage.tsx`, `manuscript/ParagraphView.tsx` and `manuscript/SelectionMenu`. |
| L4 | A built binary holding the removed binding names is tracked | `apps/desktop/shell` (22 MB, last touched by commit `608c0d3`, SN-D52) | Not SN-B8's. Probably committed by mistake; it matches the removed names because it is an old build. |
| L5 | `ReaderBookmark`, `ReaderState.bookmarks` and its schema remain | `apps/ui/src/api/contracts/manuscript.ts:65,76`, `apps/ui/src/api/schemas/manuscript.ts:12,88` | `readerState` stays on purpose (SN-B8 default 5: the Booth and the Companion read it); the `bookmarks` field of it has no writer left. Owner: SN-C312 (bookmarks) or the Booth swap. |
| L6 | Comments name the deleted `prepmarkup` package | `apps/desktop/bindings_preview_pin.go:105`, `apps/desktop/internal/preview/pin.go:9,10,22,37`, `apps/desktop/internal/extraction/doc.go:7` | Comments only. |
| L7 | `pronunciationonline.Service.LookupBatch` has no caller | `apps/desktop/internal/pronunciationonline/service.go:178`, `service_test.go:169,205` | Named in SN-B8's "Not done" as outside its files. |
| L8 | Guide sentences about removed features | `docs/guides/using-the-app/story-bible.md:92`, `docs/guides/using-the-app/script.md:115` | The acceptance asks for "no sentence about a removed feature". |

## Verification

```text
node scripts/ci/studio-next-parity.mjs
cd apps/ui && pnpm exec vitest run <the 23 UI files cited above, listed below>
cd sidecars/manuscript-guide && python3 -m pytest tests/test_manuscript_guide.py tests/test_review_flags.py tests/test_extraction_booknlp.py
cd apps/desktop && go test ./internal/guide -run TestDefaultPronunciationSourceReachesBuildAliasEditAndCreate
pnpm lint:md && node scripts/ci/docs-slop.mjs && node scripts/ci/docs-references.mjs
```

Results on this branch: the checker, vitest (23 files, 284 tests), pytest (146 tests) and the Go test pass. The Go test is named in a row's note, not cited by a row.
