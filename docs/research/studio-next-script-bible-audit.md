# Studio Next Script and Story Bible audit (SN-B1)

**Date:** 2026-10-11. **Code audited:** `main` at `928c7de`. **Mock audited:** `docs/research/mockups/studio-next/` (last change `c171071`). **Slice:** SN-B1 (#1037), SNB-1 of the [Script and Story Bible PRD](../prds/studio-next-script-and-story-bible.prd.md). SNB-8 deletes this note once its tables have been acted on.

Method: files read, `grep` over `apps/ui`, `apps/desktop`, `sidecars`, `docs`, `tests`. The app and REAPER were not run, so a verdict is what the code and its tests show, not what the screen does. A claim carries a path; a claim not read line by line is marked **unverified**. Policy: the Studio Next mock is the only spec (owner ruling D98 in [the agent train](../operations/agent-train.md#which-mocks-are-the-spec)); an old thing with a mock equivalent is removed in the swap (SNB-8), an old thing without one stays as built.

## Findings that change a slice

1. **Merge has no undo and no test of its union.** The sidecar's `merge` does union the appearances and re-point relationships (`sidecars/manuscript-guide/core/manuscript_guide.py:1468`), but the UI confirms and deletes the source (`GuideDetail.tsx:956-959`), and the only sidecar test that calls `merge` checks properties (`sidecars/manuscript-guide/tests/test_properties.py:249`). The mock's merge is one undo step (`docs/research/mockups/studio-next/src/state/commands/bible.ts:189`). SNB-3 is larger than the PRD's "verify and complete": undo needs the Studio Next journal, and the union needs a test first.
2. **"Appears in" by chapter is already in the sidecar and wire, and no UI reads it.** `appearances` (chapter, scene) is built by `appearance_map` and combined by `merge_appearances`, and parsed by the schema (`apps/ui/src/api/schemas/storyBible.ts:102`), but `apps/desktop/internal/guide/service.go:183` says "nothing reads it yet". The UI lists every evidence line with a go-to button (`GuideDetail.tsx:868-915`). SNB-4 is smaller on the host and larger on the UI than the PRD says: no sidecar work, chapter-level grouping in the UI.
3. **Bookmarks exist, in a smaller shape.** The PRD says "absent"; Groomer 3's note on #1037 is right. The reader state in `manuscript-notes.json` holds `kind` `chapter`, `line` or `note` bookmarks (see [the bookmark surface](#bookmarks-the-old-store-and-the-new-one)). Only the `chapter` kind is created by the UI. Verdict: **partial**.
4. **"Threaded notes" and "manual prep state" are not in the old app.** A note is one text (`noteCreate(chapterId, paragraphId, text, ...)`, `apps/ui/src/api/contracts/manuscript.ts:174`); there is no reply list. A chapter's "prep status" in the old Script list is the count of names still to confirm (`ScriptChapterList.tsx:21`), which is the query count DQ-11 removes. The mock has a stored three-state prep dot (`docs/research/mockups/studio-next/src/state/commands/script.ts:13`) and note threads (`selectors/annotations.ts:12`). The PRD's item 7 "Script keeps" lists both as kept; neither exists to keep, so they are new host work with no slice. Owner or groomer to place them.
5. **The mock's Script "Queries" tab is not pronunciation queries.** It lists notes marked as asks (`docs/research/mockups/studio-next/src/pages/script/Rail.tsx:11`, `selectors/annotations.ts:9`). The old rail's Queries tab (`ScriptRail.tsx:42`) is replaced by that, not carried over, and the word "queries" survives in the new page with a different meaning.
6. **The swap would delete code the PRD says stays.** `GuideDetail.tsx` hosts `VoiceReferencesSection` and `DialogueCueAttribution` (`GuideDetail.tsx:38-39`), and `Guide.tsx` hosts `VoiceDataPanel`, `SeriesTab` (`Guide.tsx:23-24`). The mock's Story Bible has none of the four (no hit in `pages/Bible.tsx`, `pages/bible/`, `pages/script/`). D98 and DQ-12 keep what has no mock equivalent, so SNB-8 must re-home these in the new page, which the PRD does not say. Owner to confirm what "stays as built" means when its host component is deleted.
7. **The online batch lookup loses its only caller.** `pronunciationOnlineLookupBatch` is called from `PronunciationQueries.tsx:107` and nowhere else. Deleting the panel orphans the binding in `apps/desktop/bindings_pronunciationonline.go`, its golden `tests/fixtures/contracts/pronunciation-online-batch.json`, and the aria snapshot `confirm-pronunciation-online-batch.aria.yml`. The PRD's deletion list omits them.
8. **Ctrl+F on Script is not bound to the Script search.** The catalog comment says Script's own Find wins by scope (`apps/ui/src/input/commands.catalog.ts:127`), but no Script-scoped command exists (`grep "scope: 'script'"` finds none), and the search is a `SearchBar` in the Chapters & Search panel (`ScriptPage.tsx:905`). **Unverified at runtime**: Ctrl+F probably opens the jump menu on Script. Not a regression to keep, a gap to fill in SNB-7.

## Verdict per ruling

"Present", "partial" or "absent" is the app today.

| Ruling | Verdict | Repo evidence | Test | Slice |
| - | - | - | - | - |
| Pronunciation records its source; no query workflow | **Partial.** Source half present: every pronunciation stores `source` (a registry name, `user` for the narrator's own, `not generated`), shown by `pronunciationSourceLabel`, with the Go registry in `apps/desktop/internal/pronunciationport/pronunciationport.go` and the sidecar's `PRONUNCIATION_SOURCES`. No `manual` id, and no UI port with `sources()`/`candidate()`. Query workflow present in full: `status` (`researched`, `query_sent`, `author_confirmed`), `note`, `alternate`, the query list, CSV export and import | `manuscript_guide.py:451-535`, `:1213`; `apps/ui/src/components/storybible/pronunciationStatus.ts:6-17`; `apps/desktop/internal/guide/queries.go` | `sidecars/manuscript-guide/tests/test_pronunciation_depth.py`; `apps/desktop/internal/guide/queries_test.go`; `PronunciationQueries.test.tsx` | SNB-2 (source field exists; the work is the UI port and ignoring `status` on read) |
| Merge on alias collision: union of appearances, relationships re-pointed, one undo step | **Partial.** `findAliasMatches` offers "Merge into current entry" and `guideMerge` runs the sidecar `merge`, which unions evidence and appearances and re-points other entities' relationships. Not one undo step: a confirm dialog says the source "will be deleted", there is no undo. Locked sources are refused | `apps/ui/src/state.ts:40-48`; `GuideDetail.tsx:342-348`, `:666-690`, `:956-959`; `manuscript_guide.py:1468-1558` | `apps/ui/src/state.test.ts` (alias matching only); sidecar `merge` tested for properties only (`test_properties.py:249`); no test of the union, the re-pointing or the dialog | SNB-3 (larger, finding 1) |
| Drafts dropped on Cancel | **Present** for a new entry. "Add entity" makes a local draft (`category: 'Draft'`) that is sent nowhere until a category is chosen; picking another row or the discard button drops it. There is no "Cancel" on a new entry, only "Discard this new entry". An existing entry's Cancel restores the form | `Guide.tsx:48-62`, `:166`, `:193-205`; `GuideDetail.tsx:224-234`, `:454-460` | `apps/ui/src/App.test.tsx:176-190` (no `guideCreate` before a category). The discard and the row-switch drop are **unverified** by a test | SNB-3 (smaller: only the Cancel wording and the dropped relationships) |
| Sortable list | **Partial.** Name and Occurrences, ascending or descending, in component state, so not remembered. No sort by type; the "chapter count" key needs `appearances` (finding 2) | `state.ts:213-222`; `Guide.tsx:77`, `:171-173` | `state.test.ts:319-330` | SNB-3 |
| Alias counts | **Absent** in the list. A row shows name, category and the occurrence count. The detail's alias table counts each alias's occurrences, not the number of aliases | `Guide.tsx:243-256`; `GuideDetail.tsx:627` | none | SNB-3 |
| Needs-review filter and "Mark reviewed" gating | **Partial, different shape.** "Needs Review" is a category tab, set by the sidecar for low-confidence classifications (`category == "Needs Review"` gives `review_state "needs review"`). It is cleared by any `edit` (`entity["review_state"] = "reviewed"`) or by a rescan that finds occurrences. No "Mark reviewed" button, no per-name review flag, no count of items needing verification to gate it on. The findings adapter turns a needs-review entity into a finding | `state.ts:30`; `manuscript_guide.py:414-445`, `:745`, `:1128`, `:1143`; `apps/desktop/internal/guide/findings_adapter.go:18-20`, `:73` | `test_manuscript_guide.py:773` (three-occurrence rule); `test_properties.py:90` (an edit counts as a review); `findings_adapter_test.go` | SNB-3 (larger: per-name flags and the gate have no host model; the gate depends on the extraction suggestions' verify flag, SNX-2) |
| Appears in as chapters with a go-to button | **Partial.** Go-to button per evidence line (`goToManuscript(chapter, paragraph)`); lines and a count of occurrences, not chapters. Chapter data exists on the wire and is unread (finding 2) | `GuideDetail.tsx:868-915`; `service.go:183`; `manuscript_guide.py:599-653` | `state.test.ts:108` (evidence merge); sidecar `appearances` asserted at `test_character_cues.py:253` | SNB-4 |
| Speaker colour, and a per-entry override | **Partial.** Seven hues `--speaker-1..7` hashed by speaker id; `speakerColorIndex` returns the same colour for the same id in the reader and the Booth. No override; the Story Bible entry has no colour field | `apps/ui/src/components/primitives/speakerColor.ts:12-30`; `styles.css:126-129`; callers `manuscript/ParagraphView.tsx`, `booth/BoothView.tsx`, `primitives/SpeakerTag.tsx` | `speakerColor.test.ts`, `SpeakerTag.test.tsx` | SNB-4 (override needs a sidecar field and a wire field) |
| Bookmarks with a label and a note | **Partial.** `chapter`, `line` and `note` kinds in the reader state, no label, note text or offset; one chapter bookmark per chapter toggled in the reader card. No gutter ribbon, tab, jump commands or keys | see [the bookmark surface](#bookmarks-the-old-store-and-the-new-one) | `apps/desktop/internal/manuscript/reader_test.go`, `contract_test.go`, `ScriptPage.test.tsx`, `ChapterNav.test.tsx` | SNB-5, SNB-6 |

## Consumers of the query code SNB-8 deletes

Command: `grep -rn "PronunciationQueries\|pronunciationStatus\|QueryExport\|queryExport\|openQueries\|OpenQueries\|pronunciationQuer\|PronunciationQuer"` over `apps docs tests scripts .github sidecars`, then each hit read. "Delete" is query-only code; "edit" is shared code that loses its query part; "stays" must outlive the swap because another caller uses it.

### Host and wire

| Item | Where | Verdict |
| - | - | - |
| Query list, CSV writer and reader, matcher, importer | `apps/desktop/internal/guide/queries.go` (`PronunciationQueries`, `QueriesCSV`, `ParseQueriesCSV`, `MatchQueryAnswers`, `ImportQueriesCSV`) | Delete, with `queries_test.go` and `apps/desktop/guidepronunciationqueries_test.go` |
| Bindings | `apps/desktop/bindings.go:190-225`: `GuidePronunciationQueries`, `GuidePronunciationQueriesCSV`, `GuidePronunciationImportQueriesCSV` | Delete; `hostAPIVersion` is 84 in `apps/desktop/app.go:65`, `apps/desktop/app_test.go:43` and `apps/ui/src/hostApi.ts:2`, so the bump is 85 or later |
| Contract and schema | `apps/ui/src/api/contracts/storyBible.ts:51-70`, `:151-160`; `apps/ui/src/api/schemas/storyBible.ts` (queries, CSV and import schemas) | Delete the three types, the schemas and the three API members |
| Client, mock, goldens, wire rows | `apps/ui/src/api/wailsClient.ts:299-302`; `apps/ui/src/api/mockHost/storyBible.ts`; `apps/ui/src/api/contractGoldens/storyBible.ts`; `apps/ui/src/api/wireContracts.test.ts:748-754`, `:832-845`, `:2742-2744`; generated `apps/ui/wailsjs/.../shell/host.ts` | Delete the rows; regenerate `host.ts` |
| Fixtures | `tests/fixtures/contracts/guide-pronunciation-queries.json`, `-csv.json`, `-empty.json`, `-import.json`; Go checks in `apps/desktop/internal/guide/contract_test.go` | Delete; edit the contract test |
| Prep completeness | `apps/desktop/internal/prepcompleteness/prepcompleteness.go` (`OpenQueries`, `UnattributedQueries`), `apps/desktop/bindings_prepcompleteness.go:22-53`, `apps/ui/src/api/contracts/prepCompleteness.ts`, `schemas/prepCompleteness.ts`, `prepCompletenessMock.ts`, `mockApi.ts:264-271`, `tests/fixtures/contracts/prep-completeness-summary.json`, `wireContracts.test.ts:672-683` | Edit: the summary counts open queries and stale markup per chapter. No component calls `prepCompletenessSummary` (only `ports/index.ts` and the mock), so the field goes and the binding is a groomer decision |
| Online batch lookup | `apps/desktop/bindings_pronunciationonline.go` (`PronunciationOnlineLookupBatch`), `api/contracts/pronunciationOnline.ts`, `api/mockHost/pronunciationOnline.ts`, `tests/fixtures/contracts/pronunciation-online-batch.json` | Orphaned (finding 7); decide delete or keep |
| Sidecar status command | `sidecars/manuscript-guide/core/manuscript_guide.py`: `PRONUNCIATION_STATUSES`, `pronunciation_status_of`, `pronunciation_status` (`:1213`, command `pronunciation-status`), the `status` carry in `carry_pronunciation_work` (`:490`); Go `Service.SetPronunciationStatus` (`apps/desktop/internal/guide/service.go:452`) and binding `GuidePronunciationSetStatus` (`bindings.go:182`) | Stays until SNB-2: it also writes the `note`, which ADR 0792 keeps readable. Whether the note stays editable is **not decided** |

### UI

| Item | Where | Verdict |
| - | - | - |
| Queries panel | `apps/ui/src/components/storybible/PronunciationQueries.tsx`, `PronunciationQueries.test.tsx`; button at `Guide.tsx:200`, mounted at `Guide.tsx:329` and `ScriptPage.tsx:940` | Delete |
| Status helper | `apps/ui/src/components/storybible/pronunciationStatus.ts` | Edit: `pronunciationSourceLabel` **stays** (`manuscript/EntitySummary.tsx:9`); `pronunciationStatusInfo` and the status table go, and are used by `PronunciationWork.tsx:10`, `script/ScriptRail.tsx:7` and `booth/BoothView.tsx:13`, `:257` (the Booth reader prints the status) |
| Status editing | `PronunciationWork.tsx:43-50` (status select and note) | Edit; `OnlinePronunciationLookup` is mounted here (`:85`) and stays |
| Rail badge (ADR 0725) | `apps/ui/src/components/layout/useNavCounts.ts:24` (`storyBible: queries.length`), `useNavCounts.test.tsx`, `AppShell.tsx:56` (`'Story Bible': 'storyBible'`), `interactionFeedback/app.ts:21` | Delete the Story Bible count; the other two stay |
| Script rail and list | `script/ScriptRail.tsx` (Queries tab, `openQueries`), `ScriptRail.test.tsx`, `ScriptPage.tsx:120`, `:304`, `:594`, `:940`, `ScriptChapterList.tsx:21-41` (`toConfirm`), `interactionFeedback/manuscript.ts:23` | Replaced by the mock's page (see below) |
| Feedback and ratchet rows | `interactionFeedback/storyBible.ts:26-28`, `:31-32`; `rawNatives.test.ts:69-72`; `ports/useApiRatchet.test.ts:102`, `:207` | Delete the rows and entries |
| Stories | none: no `*.stories.tsx` names the panel (`Table.stories.tsx:92` is sample text) | Nothing to delete |
| Visual rows | `apps/ui/tests/visual/catalog/storybible.ts` (`pronunciation-queries`, `pronunciation-queries-online-confirm`, and `entry-pronunciation-work`, which marks "Query sent"), `catalog/script.ts` (`prep-rail-queries`), `drivers/storybible.ts:114`, `:150-160`, `drivers/script.ts:264-287`, `doc-screenshots.json:39-42` | Delete or rewrite; `entry-pronunciation-work` stays in a new form |
| Aria snapshots | `apps/ui/tests/aria/dialogs.spec.ts:23-30`; `tests/aria/snapshots/slide-over-pronunciation-queries.aria.yml`, `confirm-pronunciation-online-batch.aria.yml` | Delete |
| Generated docs | `docs/ui/inventory.json` (6 consumer lists), `docs/ui/atlas/{Button,ConfirmDialog,Select,SlideOver,StatusBadge,Toast}.md` | Regenerate with `pnpm --dir apps/ui docs:atlas` |

### Docs and decisions

| Item | Where | Verdict |
| - | - | - |
| Guide pages | `docs/guides/using-the-app/story-bible.md:86`, `:108`, `:117-130`, `:159`; `script.md:10-36`, `README.md:17` | Rewrite |
| Doc screenshot | `docs/images/ui/script-prep-rail-queries.webp` | Delete |
| Utility page | `docs/utilities/manuscript-guide.md:45-49` (names both bindings, `hostAPIVersion` 70) | Rewrite |
| Threat model | `docs/architecture/threat-model.md:169` (row 7c, the query CSV) | Delete the row |
| ADRs | 0346, 0347, 0352, 0725 (Accepted) are superseded by 0792 (Proposed) to that extent; 0392 and 0605 mention the queries | ADR bookkeeping is SNB-8's (`adr-author`) |

Outlives the swap, with the callers that keep it: `internal/guide/findings_adapter.go` (needs-review and low-confidence findings; reads `review_state` and confidence, not the query list), the sidecar `note` and `alternate` fields (`carry_pronunciation_work`, `set_pronunciation`), `pronunciationSourceLabel` (EntitySummary), and the online single-word lookup (`OnlinePronunciationLookup.tsx`, `PronunciationWork.tsx:85`).

## Stays as built (DQ-12, DQ-13)

No mock equivalent, so the swap deletes none of these.

| Feature | Files |
| - | - |
| Series tab | `apps/ui/src/components/series/SeriesTab.tsx`, `SeriesTab.test.tsx`; imported at `Guide.tsx:24`, mounted at `:233` |
| Series voice bible and cross-project reads | `apps/desktop/internal/series/{series,voicebible,crossproject}.go` and tests; `apps/desktop/bindings_series.go`, `bindings_series_contract_test.go` |
| Per-entry voice references and voice data | `storybible/VoiceReferencesSection.tsx` (also imported by `series/SeriesTab.tsx:6` for `formatRegionTime`), `VoiceDataPanel.tsx` |
| Dialogue cue attribution, Commons audio | `storybible/DialogueCueAttribution.tsx`, `CommonsAudioLookup.tsx` (no mock equivalent found; the Booth fixture mentions cues) |
| Properties, preview audio | `storybible/PropertiesSection.tsx`, `propertyDraft.ts`, `usePreviewAudio.ts` (**unverified** against the mock: the mock's entry editor shows summary, voice, acts and knows) |
| Companion mode | No file in `apps/ui/src/components/booth/Companion*.tsx`, `ReadAlongView.tsx` or `ResumePrompt.tsx` imports from `storybible/` or `script/`. Outside the two folders the second verification grep finds four importing components, `App.tsx`, `series/SeriesTab.tsx`, `booth/BoothView.tsx` and `manuscript/EntitySummary.tsx`; the other hits are path strings in catalogs and ratchet tests |

`booth/BoothView.tsx` imports `pronunciationStatusInfo` and `manuscript/EntitySummary.tsx` imports `pronunciationSourceLabel`, both from `pronunciationStatus.ts`. `EntitySummary.tsx` also serves the Booth reader rail (`booth/ReaderRail.tsx:5`, `:119`), so replacing it with the mock's Script tabs (below) leaves the Booth without a summary unless the Booth keeps it.

## Script: what the mock replaces and what it keeps

ADRs 0392, 0393 and 0670 apply only where the mock shows the same layout (DQ-1). The mock's Script is `docs/research/mockups/studio-next/src/pages/script/`: a chapter list with a prep dot and legend (`ChapterList.tsx`), a continuous reader, and a rail with Words, Story Bible, Notes, Queries and Bookmarks tabs (`Rail.tsx`).

| Old | Verdict | Mock equivalent |
| - | - | - |
| `components/script/ScriptPage.tsx` (998 lines: layout, search, selection, credits, bookmarks, queries) | Replaced | `pages/script/ScriptPage.tsx`, `Reader.tsx`. The credits setup, retail sample and credits entry (`ScriptPage.tsx` imports of `credits/*`, `manuscript/CreditsEntry.tsx`) have no mock equivalent: stay, **owner to confirm** |
| `components/script/ScriptRail.tsx` (Pronunciations, Characters, Queries) | Replaced | `Rail.tsx` with `WordsTab`, `BibleTab`, `ThreadsTab`, `BookmarksTab` |
| `components/script/ScriptChapterList.tsx` (to-confirm count, no tick; ADR 0670) | Replaced | `ChapterList.tsx` (prep dot, open-ask pill, legend); needs a stored prep state (finding 4) |
| `components/manuscript/ParagraphView.tsx`, `ReaderCard.tsx`, `ChapterNav.tsx` | Replaced | `Reader.tsx`, `Para.tsx`, `ChapterList.tsx` |
| `components/manuscript/EntitySummary.tsx`, `WordLookup.tsx`, `useWordLookup.ts` | Replaced | `BibleTab.tsx`, `WordsTab.tsx`, `Dict.tsx` (EntitySummary is also used by the Booth reader rail, `booth/ReaderRail.tsx:5`, `:119`) |

Behaviours the PRD says Script keeps:

| Behaviour | Today | File |
| - | - | - |
| Threaded notes | **Absent** (single-text notes; finding 4) | `ScriptPage.tsx` note flow, `manuscript/AddNoteDialog.tsx`, `manuscript/annotations.ts`; host `apps/desktop/internal/manuscript/reader.go` |
| Ctrl+F | **Absent** for Script (finding 8) | `input/commands.catalog.ts:127-135` |
| Text settings | **Partial**: text size small, medium, large | `ScriptPage.tsx:60-61`, `:651-657` |
| Speaker picker | **Absent** as a picker; a narrator-set speaker is a `character_tag` markup span | `manuscript/MarkupDialog.tsx:54`, `apps/desktop/internal/prepmarkup/prepmarkup.go` |
| Manual prep state | **Absent** (finding 4) | none; the old list shows the to-confirm count |
| Markup types | **Present**: `stress`, `pause` (short, long), `character_tag`, stale on read | `prepmarkup.go:47-57`, `manuscript/MarkupDialog.tsx`, `MarkupMark.tsx`, `markup.ts`; tests `prepmarkup_test.go`, `MarkupDialog.test.tsx`, `ParagraphView.markup.test.tsx` |
| Context menus | **Partial**: a selection menu, no right-click menu | `manuscript/SelectionMenu.tsx`, `ScriptPage.tsx:808` |

## Bookmarks: the old store and the new one

**Old (delete in SNB-8):** `apps/desktop/internal/manuscript/reader.go:288-330` (`CreateBookmark` dedupes on kind, chapter, paragraph and note; `DeleteBookmark`), stored in the reader state of `<project>/narration-utils/manuscript-notes.json` read with `persist.NarratorData` (`reader.go:340`); bindings `ManuscriptCreateBookmark`, `ManuscriptDeleteBookmark` (`apps/desktop/bindings.go:562-565`); `internal/manuscript/contract_test.go` pins `manuscript-bookmark`. UI: `ReaderBookmark` and the two API members (`apps/ui/src/api/contracts/manuscript.ts:65-76`, `:172-173`), the schema (`api/schemas/manuscript.ts:88`), mock (`api/mockHost/manuscript.ts:264-269`), client (`wailsClient.ts:381-382`), golden (`api/contractGoldens/manuscript.ts`), consumers `components/manuscript/ChapterNav.tsx`, `ReaderCard.tsx:103-121` (the chapter toggle), `components/script/ScriptPage.tsx:464-468`, `:931`, `interactionFeedback/manuscript.ts:13-14`, `:22`. Replace-manuscript copy that mentions bookmarks: `production/ImportReview.tsx:69`, `ManuscriptImport.tsx:187`, `settings/Settings.tsx:397`, `:539`.

**Outside Script:** nothing reads the stored bookmarks. `booth/BoothPage.tsx:74` says "bookmark" about a browser link, `engine/RetiredTracksRoute.tsx:8` about an old URL, `studio/journal/createJournal.ts:17` is a sample label. The Booth has no ribbons today.

**New (SNB-5, builds beside the old):**

- File: `<project>/narration-utils/bookmarks.json`, as `prep/markup.json` (`prepmarkup.File`, `prepmarkup.go:69`) and `preview-pin.json` (`internal/preview/store.go:25`) sit under `narration-utils/`. The markup file is in `narration-utils/prep/`; where bookmarks go is SNB-5's call.
- Persist class: `persist.NarratorData` (`apps/desktop/internal/persist/persist.go:26`), the class both the markup reader (`prepmarkup.go:433`) and the reader state use: the original is kept beside a corrupt file and the narrator is told.
- Package `apps/desktop/internal/bookmarks` (new). Bindings `BookmarksList/Add/Update/Remove` in a new `apps/desktop/bindings_bookmarks.go`, following `bindings_prepmarkup.go`.
- Files a binding change touches (each of the markup pattern's files has a bookmarks twin): `hostAPIVersion` in `apps/desktop/app.go:65`, the pin in `apps/desktop/app_test.go:43`, `apps/ui/src/hostApi.ts:2`; regenerated `apps/ui/wailsjs/.../host.ts`; `apps/ui/src/api/contracts/bookmarks.ts`, `schemas/bookmarks.ts`, `contractGoldens/bookmarks.ts` and a Go-written golden in `tests/fixtures/contracts/`; rows in `apps/ui/src/api/wireContracts.test.ts`; a mock in `apps/ui/src/api/` (like `prepMarkupMock.ts`); the port in `apps/ui/src/ports/index.ts`; `interactionFeedback` rows.
- Name clash: `ReaderBookmark` and `readerBookmarkCreate` stay until SNB-8; the new API needs different names, and `apps/desktop/hostrace_test.go`, which names each binding it races, needs the new ones.
- Trust boundary (CLAUDE.md step 6): a new file the app reads. Add a threat-model row after the last row of section 6 (6t at `docs/architecture/threat-model.md:162` when this was read) modelled on 6p (`:158`), and a bullet in `SECURITY.md` beside the markup bullet (`SECURITY.md:49-51`). A label or note is narrator text drawn into the page, so the row states that it is drawn as text.
- ADR 0382 is **Proposed**, 0383 Accepted. The PRD cites 0382 as KEEP; the bookmarks ADR (SNB-5) should say whether it relies on a Proposed decision.

## Sidecar collisions: SNB-2 and SNX-3

Both edit `sidecars/manuscript-guide/core/manuscript_guide.py`. The PRD (Parallel-session compatibility) says serialise. SNX-3 ("rules tier into suggestions") names no functions, so the second list is **inferred** from the extraction path.

| Function | SNB-2 (pronunciation field) | SNX-3 (inferred) |
| - | - | - |
| `build_entities` (`:669`) | calls `pronunciation(...)` at `:722`, `:737` | emits entities; would emit suggestions |
| `merge_locked` (`:814`) | carries `status`, `note`, `alternate` through a rebuild (`:65-80` of the function) | folds fresh entities into saved ones; suggestions bypass it |
| `rule_candidates`, `accept_rule_name`, `classify`, `make_candidate`, `spacy_candidates` (`:335-445`) | no | the rules tier itself |
| `build` (`:953`), `main` and its parser (`:1767`) | the `--default-source` flags | a new output or command |
| `pronunciation`, `pronounce_source`, `set_pronunciation`, `carry_pronunciation_work`, `user_pronunciation`, `pronunciation_status`, `pronounce`, `pronounce_user`, `pronunciation_use_alternate` (`:451-556`, `:1172-1232`) | yes | no |
| `create` (`:1234`), `split` (`:1294`), `merge` (`:1468`), `apply_edit` (`:1061`) | carry the pronunciation value into new aliases | none |

Overlap: `build_entities`, `merge_locked`, `build` and `main`. Run SNB-2 and SNX-3 one after the other, or have SNX-3 add its code in a new module and touch only `build`.

## Slices adjusted

- **SNB-2:** smaller on the source field (stored already, finding in the verdict table), unchanged on the UI port; adds the decision on the `note` write path.
- **SNB-3:** larger. Merge needs undo and a union test; "Mark reviewed" and per-name flags have no host model; list sort needs a type key.
- **SNB-4:** appears-in is smaller on the host (already built, unread) and needs UI grouping; the override needs a new entry field.
- **SNB-5:** unchanged in size; add the name clash with the old store and the list of old-store files for SNB-8.
- **SNB-6:** larger; the Booth ribbons depend on this slice and no Booth reader of bookmarks exists today.
- **SNB-7:** adds Ctrl+F on Script (finding 8) and the threaded-notes and prep-state host work (finding 4), or an owner ruling that drops them.
- **SNB-8:** adds the online batch lookup, the prep-completeness query fields, the Booth status text, `entry-pronunciation-work`, generated docs, and the re-homing of the voice and series features (finding 6).
