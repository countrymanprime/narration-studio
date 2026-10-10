# Studio Next Script and Story Bible: Pronunciation Sources, Merge, Review, Appears-In, Speaker Colours and Bookmarks

**Source:** owner request of 2026-10-10 ([Studio Next Rebuild](studio-next-rebuild.prd.md)); the Story Bible and Script rulings and the bookmark ruling in `studio-next/research/repo-compare-decisions.md`; the mock's `studio-next/src/pages/Bible.tsx`, `studio-next/src/pages/bible/`, `studio-next/src/pages/script/`.

**Builds on:** the delivered Story Bible, pronunciation and prep work ([pronunciation sources](../architecture/pronunciation-provider-selection.md), [ADR 0091](../adr/0091-story-bible-pronunciation-is-a-narrator-edited-value-the-preview-speaks-directly.md), [ADR 0405](../adr/0405-pronunciation-stays-local-first-behind-cmu-wiktextract-and-espeak-with-merriam-webster-as-the-one-narrator-keyed-online-source.md), [ADR 0680](../adr/0680-the-story-bible-preview-speaks-a-chosen-pronunciation-through-pipers-raw-phoneme-block.md), [ADR 0695](../adr/0695-alias-pronunciation-gets-the-entitys-own-control-and-a-default-source-only-reorders-the-automatic-fallback.md), [ADR 0345](../adr/0345-a-story-bible-entity-keeps-its-id-by-name-overlap-and-dialogue-cues-are-precision-first-rules.md), [ADR 0367](../adr/0367-per-speaker-colours-alias-the-seven-entity-kind-hues-and-hash-by-speaker-name.md), [ADR 0382](../adr/0382-script-markup-is-a-chapter-keyed-sidecar-of-line-offsets-checked-on-read-and-drawn-without-changing-the-text.md)); the Script page ([ADR 0392](../adr/0392-the-script-pages-prep-status-is-the-names-still-to-confirm-and-its-rail-is-a-panel-below-2xl.md), [ADR 0393](../adr/0393-the-script-pages-three-columns-show-from-1440px-and-the-reader-card-header-keys-off-its-own-width.md)). Extraction suggestions, import and analysis tools are the separate [Extraction and Analysis Tools](studio-next-extraction-and-analysis-tools.prd.md).

**Status (2026-10-10):** draft.

## Problem Statement

The owner agreed a set of Story Bible and Script behaviours: pronunciation with a source and no query workflow, merge when an alias collides, drafts dropped on Cancel, a sortable list with alias counts, a needs-review flow for imported items, "appears in" as chapters with a go-to button, per-speaker colours, and chapter bookmarks with notes. Some exist in other forms (merge, a Needs Review category, speaker colours, `appearances` by chapter and scene), pronunciation still carries the query workflow the owner rejected, and bookmarks do not exist.

## Evidence

- **Mock.** `studio-next/src/providers/pronunciation.ts` and `studio-next/src/ui/PronSource.tsx` (source id; `manual` is typed); `studio-next/src/state/commands/bible.ts` (`mergeEntries`, drafts); `studio-next/src/selectors/bible.ts` (`appearsIn`, `entryNeedsReview`); `studio-next/src/selectors/bibleMerge.ts`; `studio-next/src/selectors/speakers.ts`; `studio-next/src/state/commands/bookmarks.ts`, `studio-next/src/selectors/bookmarks.ts`, `studio-next/src/ui/BookmarkEditor.tsx`, `studio-next/src/pages/script/BookmarksTab.tsx`, `studio-next/src/app/bookmarks.ts`. Tests: `studio-next/tests/bible.test.tsx`, `studio-next/tests/bible-batch-a.test.tsx`, `studio-next/tests/bookmarks.test.tsx`, `studio-next/tests/speakers.test.tsx`, `studio-next/tests/script.test.tsx`.
- **Repo.** Story Bible: `apps/ui/src/components/storybible/{Guide,GuideDetail,PronunciationWork,PronunciationQueries}.tsx`, `pronunciationStatus.ts`; `apps/desktop/internal/guide/`, `sidecars/manuscript-guide/core/manuscript_guide.py` (`merge`, `split`, `appearances`, pronunciation `status`, `alternate`); `state.ts` (`findAliasMatches`, categories incl. "Needs Review" and "Draft"); Script: `components/script/{ScriptPage,ScriptRail,ScriptChapterList}.tsx`; no bookmark code (the word appears in unrelated files).

| Ruling | Real today |
| --- | --- |
| Pronunciation: source plus manual, no query workflow | `status` (`researched`, `query_sent`, `author_confirmed`), `note`, `alternate` ([ADR 0346](../adr/0346-a-pronunciation-carries-a-status-and-note-and-the-narrators-own-sits-beside-the-dictionarys-as-the-alternate.md)); query CSV ([ADR 0347](../adr/0347-the-pronunciation-query-export-is-csv-with-its-ids-last-and-a-formula-guard-and-is-a-download.md)); queries page (`PronunciationQueries.tsx`) |
| Merge on alias collision | `findAliasMatches` unlocks Merge (verify union of appearances and relationship re-pointing) |
| Drop an unsaved new entry on Cancel | "Draft" category exists; behaviour on Cancel to verify |
| Sort the list, alias counts | Not verified present |
| Needs review for imported items | "Needs Review" category; "Mark reviewed" to verify |
| Appears in: chapters only, button to go to chapter | `appearances` by chapter and scene in the sidecar; UI lists evidence lines |
| Speaker chips and colours | `--speaker-1..7`, `speakerColor.ts` ([ADR 0367](../adr/0367-per-speaker-colours-alias-the-seven-entity-kind-hues-and-hash-by-speaker-name.md)); no per-entry override |
| Bookmarks with notes | Absent |

## Proposed Solution

1. **Pronunciation provenance, not workflow.** Each pronunciation stores its text and the id of its source (a registered source or `manual`); the UI shows the source's icon and name and lets the narrator switch source or type it. Existing `status` and `note` stay readable (migrated into a note where present); the queries page and query export retire in the slice that lands the superseding ADR; the rail badge for Story Bible counts needs-review entries instead of open queries (DQ-11).
2. **Merge, drafts, sort, counts.** Verify and complete merge (aliases combined, relationships re-pointed by id, appears-in union, one undo step); an unsaved new entry is dropped on Cancel; list sort (name, type, chapter count) remembered in preferences; alias count per row.
3. **Needs review.** A filter and a count for imported or extracted items; "Mark reviewed" blocked while any item needs verification (the same flag the extraction suggestions use).
4. **Appears in.** Chapters only: the count of chapters and a button per chapter that opens it in Script; remove line and mention counts from the Story Bible UI.
5. **Speaker colours.** Keep the seven-hue scheme; add an optional per-entry colour override that wins over the stable pick.
6. **Bookmarks.** Host-persisted per project (`bookmarks` sidecar: id, chapter, paragraph and character offset, optional label and note, created time); a Script gutter ribbon, a Bookmarks tab in the side panel, Booth ribbons in [Booth](studio-next-booth.prd.md), jump-menu commands "Bookmark: ..." and next and previous, keys B, `[` and `]`; each add, edit and remove is one journal entry.
7. **Script keeps.** Threaded notes, Ctrl+F, text settings, speaker picker, manual prep state and headers, markup types, context menus, and the custom markup; no stale anchors, no query and confirm, no repo markup.

## Key Hypothesis

If pronunciation is "a value and where it came from", every source (dictionary, speech engine, manual) fits one interface and the narrator never fills in a workflow. We are wrong if narrators still need to record that an author confirmed a name; the note field keeps that possible without a status.

## What We're NOT Building

- Query and confirm for names and aliases; the author query CSV; stale-anchor detection; repo stress, breath and pause markup; evidence excerpts; derived prep completeness or progress; chapter results in Find; the speaker coverage strip; prep sheet export.
- Additional LLM-parsed properties (research only), click-through counts, live selectors, a shared name-row component (maybe list).
- A Series tab (kept as is, DQ-12), chapter bookmarks per line (line bookmarks were removed earlier).

## Success Metrics

| Metric | Target | Measured by |
| --- | --- | --- |
| Pronunciations with a source id | 100% of new writes; old ones migrated on read | Go and Python tests; golden |
| Bookmark round trip | add, edit, remove, undo, restart | Journal and host tests |
| Raw controls on migrated pages | 0 | `rawNatives.test.ts` |
| Appears-in counts | chapters only | Ported `studio-next/tests/bible-batch-a.test.tsx` |

## Open Questions

- [ ] **SNB-Q1 (DQ-11).** Query data migration and the rail badge source. Recommendation: keep status and note readable; badge counts needs-review.
- [ ] **SNB-Q2.** Which sources are listed and which is default? Recommendation: the host reports them (CMU, eSpeak, Wiktextract, Merriam-Webster when keyed); default per the existing registry ([ADR 0405](../adr/0405-pronunciation-stays-local-first-behind-cmu-wiktextract-and-espeak-with-merriam-webster-as-the-one-narrator-keyed-online-source.md)).
- [ ] **SNB-Q3.** Bookmark storage: project sidecar or manifest? Recommendation: sidecar file `bookmarks.json` like markup ([ADR 0382](../adr/0382-script-markup-is-a-chapter-keyed-sidecar-of-line-offsets-checked-on-read-and-drawn-without-changing-the-text.md)), validated on read.
- [ ] **SNB-Q4.** A bookmark on replaced manuscript text? Recommendation: replacing the manuscript clears bookmarks (the mock's `finishImport`), with the standard replace confirmation listing it.
- [ ] **SNB-Q5.** Chapter-level bookmark or spot? Recommendation: spot (paragraph and offset) as the mock; a chapter is just a spot at its start.

## Users & Context

Narrators prepping a manuscript and returning to hard spots; the Booth uses bookmarks as quick-movement marks. Story Bible entries may be locked ([ADR 0007](../adr/0007-story-bible-locked-entry-enforcement.md)) and read-only until edit ([ADR 0018](../adr/0018-story-bible-entries-read-only-until-edit.md)).

## Solution Detail

### Acceptance criteria tied to the mock

| Behaviour | Mock reference | Acceptance |
| --- | --- | --- |
| Source icon and name; switch or type | `studio-next/src/ui/PronSource.tsx`, `studio-next/tests/bible-batch-a.test.tsx` | A pronunciation shows its source; choosing another source fetches a candidate or says why not |
| Merge | `studio-next/src/selectors/bibleMerge.ts` | Alias collision offers "Merge into this entry"; aliases combine; relationships re-point; one undo |
| Drafts | `studio-next/src/state/commands/bible.ts` | Cancel on an unsaved new entry leaves no empty entry |
| Needs review | `studio-next/src/selectors/bible.ts` | Count and filter; "Mark reviewed" is blocked while an item needs verification |
| Appears in | same | A list of chapters with a go-to button; no line counts |
| Speaker colour | `studio-next/tests/speakers.test.tsx`, `studio-next/tests/no-hardcoded-speakers.test.ts` | Stable colour per id; entry override wins; no literal speakers in components |
| Bookmarks | `studio-next/tests/bookmarks.test.tsx` | Add at a word, label and note saved on blur as one undo step; next and previous wrap; the Script gutter and Booth show it |

### Supersedes / depends on ADRs

On conflict this PRD, and the ADR written when its phase lands, is the source of truth; old ADRs stay in force for unmigrated code until then ([register](studio-next-adr-register.prd.md)).

| ADR | Class | Note |
| --- | --- | --- |
| [ADR 0346](../adr/0346-a-pronunciation-carries-a-status-and-note-and-the-narrators-own-sits-beside-the-dictionarys-as-the-alternate.md), [ADR 0347](../adr/0347-the-pronunciation-query-export-is-csv-with-its-ids-last-and-a-formula-guard-and-is-a-download.md), [ADR 0352](../adr/0352-a-re-imported-query-answer-is-matched-by-entry-id-and-alias-index-and-a-blank-note-column-leaves-the-note-alone.md) | SUPERSEDE, DISCUSS (DQ-11) | Pronunciation provenance without a query workflow (A11) |
| [ADR 0725](../adr/0725-the-rail-draws-a-count-badge-only-from-a-count-the-host-reports-and-the-product-is-named-studio.md) | EXTEND | Story Bible badge source |
| [ADR 0091](../adr/0091-story-bible-pronunciation-is-a-narrator-edited-value-the-preview-speaks-directly.md), [ADR 0680](../adr/0680-the-story-bible-preview-speaks-a-chosen-pronunciation-through-pipers-raw-phoneme-block.md), [ADR 0695](../adr/0695-alias-pronunciation-gets-the-entitys-own-control-and-a-default-source-only-reorders-the-automatic-fallback.md), [ADR 0405](../adr/0405-pronunciation-stays-local-first-behind-cmu-wiktextract-and-espeak-with-merriam-webster-as-the-one-narrator-keyed-online-source.md) | KEEP / EXTEND | Edited value, phoneme block, default source, local first |
| [ADR 0007](../adr/0007-story-bible-locked-entry-enforcement.md), [ADR 0018](../adr/0018-story-bible-entries-read-only-until-edit.md), [ADR 0036](../adr/0036-story-bible-read-only-view-is-the-disabled-form-not-entitysummary.md), [ADR 0087](../adr/0087-story-bible-header-actions-are-mode-based-and-lock-cannot-happen-mid-edit.md) | KEEP / EXTEND | Locked and read-only; drafts add a cancel rule |
| [ADR 0367](../adr/0367-per-speaker-colours-alias-the-seven-entity-kind-hues-and-hash-by-speaker-name.md) | EXTEND | Entry colour override |
| [ADR 0345](../adr/0345-a-story-bible-entity-keeps-its-id-by-name-overlap-and-dialogue-cues-are-precision-first-rules.md) | KEEP | Stable ids; appearances |
| [ADR 0382](../adr/0382-script-markup-is-a-chapter-keyed-sidecar-of-line-offsets-checked-on-read-and-drawn-without-changing-the-text.md), [ADR 0383](../adr/0383-the-preview-pin-is-one-per-book-stale-by-anchor-text-and-never-re-ranked.md) | KEEP | Markup and pin sidecars; bookmarks follow the same pattern |
| [ADR 0450](../adr/0450-series-storage-is-a-per-user-file-and-cross-project-reference-reads-never-write-into-a-sibling-project.md), [ADR 0565](../adr/0565-the-series-voice-bible-pools-reference-clips-by-character-id-and-shows-no-books-until-a-second-book-has-data.md) to [ADR 0568](../adr/0568-a-sibling-books-character-names-are-read-through-a-new-plain-never-quarantining-guide-readonlynames.md) | DISCUSS (DQ-12) | Series untouched |
| [ADR 0392](../adr/0392-the-script-pages-prep-status-is-the-names-still-to-confirm-and-its-rail-is-a-panel-below-2xl.md), [ADR 0393](../adr/0393-the-script-pages-three-columns-show-from-1440px-and-the-reader-card-header-keys-off-its-own-width.md), [ADR 0670](../adr/0670-scripts-chapter-list-keeps-its-to-confirm-count-and-shows-no-checkmark-or-percentage-until-prep-depths-rollup-lands.md) | KEEP, DQ-1 | Script layout |

## Technical Approach

**Interfaces.** `PronunciationPort`: `sources()`, `defaultSource()`, `candidate(word, source)` returning `{ ok, say } | { ok: false, reason }` (host adapter wraps the existing pronunciation bindings; the mock keeps the fixture-driven version). `BookmarksApi`: `list()`, `add()`, `update()`, `remove()`. Search source and command provider for bookmarks ([App Shell and Registries](studio-next-app-shell-and-registries.prd.md)).

**Contracts.** `bookmarkSchema`, `bookmarksSchema`; golden `bookmarks-list.json` written by a Go test; bindings `BookmarksList/Add/Update/Remove` with a `hostAPIVersion` bump; Zod for pronunciation `source` (additive; old `ipa/source/status/alternate` fields still parse); `wireContracts.test.ts` rows; mocks pass.

**Architecture.** Go `internal/bookmarks` (new, project sidecar via `persist`, version-checked); Python sidecar unchanged except the pronunciation field migration; UI under `components/storybible/` and `components/script/`, bookmark primitives are feature components using `Popover` and `IconButton`.

**Test plan.** Port the mock's tests; Go tests for the bookmarks store (corrupt file path, `persist` class "narrator data"); sidecar test for pronunciation migration; visual rows (Story Bible list with sort and counts, entry with appears-in, Script with a bookmark ribbon, bookmarks tab) at all viewports; aria for any dialog.

**Rollout.** Layer by layer; the queries page retires in the migration slice together with its rows, guide page and doc screenshots ([ADR 0407](../adr/0407-a-new-page-replaces-its-old-counterpart-in-the-same-change-and-the-navigation-is-grouped-by-production-stage.md) rule 1 applies); no flag.

**ADRs.** A11 pronunciation provenance; bookmarks need a short ADR (sidecar format and clearing on replace).

**Trust boundary.** The bookmarks file is a new file the app reads: `docs/architecture/threat-model.md` row and `SECURITY.md` check (CLAUDE.md step 6).

**Risks.** Migration of query data (mitigation: read-only note); Story Bible is large (mitigation: slices of one behaviour each).

## Implementation Phases

| # | Phase | Description | Status | Parallel | Depends | Est. (pw) | PRP Plan |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Decisions and ADR | DQ-11, DQ-12; A11 Proposed; Phase 0 audit of merge, drafts, sort, counts | pending | - | SN0-1 | 0.5 | - |
| 2 | Pronunciation provenance | Port, host mapping, UI, query retirement | pending | 3 | 1 | 1.5 | - |
| 3 | List behaviours | Drafts, sort, alias counts, needs-review filter, mark reviewed | pending | 2 | 1 | 1.0 | - |
| 4 | Appears-in and colours | Chapters only with go-to; speaker override | pending | 2, 3 | 1 | 0.8 | - |
| 5 | Bookmarks host | Store, bindings, schema, golden, ADR, threat model | pending | 2 | 1 | 1.0 | - |
| 6 | Bookmarks UI | Script ribbon, tab, jump commands and keys | pending | - | 5, SNR-4, SNF-3 | 1.2 | - |
| 7 | Script migrations | Search sources, context providers, key hints for Script | pending | - | SNR-4, SNR-5 | 0.7 | - |
| 8 | Close-out | Visual rows, guide pages, doc screenshots | pending | - | 2 to 7 | 0.3 | - |

### Phase Details

- **Phase 1.** The audit lists, for each ruling, "present / partial / absent" with file and test references; it is a comment on the PRD issue, not a document.
- **Phase 2.** Removing the queries UI deletes its page, route, rows and guide text in the same pull request.
- **Phase 6.** The Booth side of bookmarks is in the Booth PRD (SNO-11) and depends on this phase.

### Parallelism Notes

2, 3 and 5 are independent; 4 follows the audit; 6 and 7 wait for the registries.

### Parallel-session compatibility

| Phase | Files touched | Collides with |
| --- | --- | --- |
| 2 | `components/storybible/Pronunciation*`, `internal/guide/*`, `sidecars/manuscript-guide/core/manuscript_guide.py`, `api/{contracts,schemas}/storyBible.ts` | Extraction slices (same sidecar file; serialise) |
| 3, 4 | `components/storybible/Guide*.tsx`, `state.ts` | Extraction UI |
| 5 | new `internal/bookmarks`, bindings, `hostAPIVersion` | Every binding PRD |
| 6 | `components/script/*` | Script slices |

### Slices

| Slice | Scope | Depends on | Parallel-safe | Verification |
| --- | --- | --- | --- | --- |
| SNB-1 | Phase 1 | SN0-1 | yes | Audit comment; ADR index |
| SNB-2 | Phase 2 | SNB-1 | yes | Sidecar and Go tests; ported bible tests; visual row |
| SNB-3 | Phase 3 | SNB-1 | yes | Ported tests; visual rows |
| SNB-4 | Phase 4 | SNB-1 | yes | Ported tests |
| SNB-5 | Phase 5 | SNB-1 | yes | Go tests; golden; wire row; threat model |
| SNB-6 | Phase 6 | SNB-5, SNR-4, SNF-3 | yes | Ported `bookmarks.test.tsx`; visual; aria |
| SNB-7 | Phase 7 | SNR-4, SNR-5 | yes | Registry tests |
| SNB-8 | Phase 8 | SNB-2..7 | no | Full visual suite for the two pages; Screenshots |

## Decisions Log

| Decision | Choice | Alternatives | Rationale |
| --- | --- | --- | --- |
| Source, not status (owner) | Provenance field | Keep the workflow | Owner ruling |
| Bookmarks are the narrator's own (mock) | No threads, no discussion | Notes anchored to lines | Maybe-list pass: bookmarks YES, with a note |
| Sidecar file (proposed) | `bookmarks.json` | Manifest field | Same pattern as markup |

## Research Summary

Read: the mock's bible, script, bookmark and speaker sources and tests, the rulings, `state.ts`, the guide service and sidecar function names, ADRs 0346, 0367, 0725. Not done: the Phase 0 audit of merge, drafts and sort in the real UI was not run.

## Visual Spec

Mock pages: Story Bible (`studio-next/src/pages/Bible.tsx`), Script (`studio-next/src/pages/script/ScriptPage.tsx`) with the Bookmarks tab; light and dark per DQ-1.
