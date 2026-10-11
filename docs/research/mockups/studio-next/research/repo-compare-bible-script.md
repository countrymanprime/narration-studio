# Repo vs our rebuild: Story Bible and Script (prep / reader)

Read-only research. Repo = `/home/user/narration-utils` (apps/ui, apps/desktop, sidecars/manuscript-guide, docs). Ours = `.../scratchpad/studio`.
Paths below are relative to `apps/ui/src` unless they start with `docs/`, `sidecars/` or `studio/`.

## 0. Headline findings (read this first)

1. **The two builds solve different halves of "prep".** The repo's Story Bible is an *extraction product* (spaCy/rules build, "Needs Review", lock, merge, rescan, evidence excerpts, pronunciation generation via CMU/eSpeak/Piper, author-confirmation workflow, CSV query export). Ours is a *narrator-authored reference* (types with colours and "Can speak", aliases with say-values, id-keyed relationships, appearances, lines). Our Script has far richer **marks / notes / queries threads** than the repo, which has single-text notes and no passage queries at all.
2. **Biggest things worth translating**: (a) the pronunciation *status + note + author-confirmed* model and the name-level query list/export (ADR 0346/0347/0352); (b) stale-anchor detection for marks/notes/markup (ADR 0382, `components/manuscript/annotations.ts#resolveNoteAnchor`); (c) a derived per-chapter prep rollup (`api/schemas/prepCompleteness.ts`); (d) per-speaker colours (ADR 0367) and speaker-source evidence (`tag | continuation | unknown | correction`, ADR 0345) which maps almost 1:1 onto our `confirmed` / suggested / `?`; (e) merge-on-alias-collision and alias split; (f) stress / breath / pause markup (ADR 0382, mock 02 "Markup layer").
3. **Biggest things ours does better**: relationships keyed by id and shown from both sides (repo stores a name snapshot on one side only, `sidecars/.../manuscript_guide.py#relate`); threaded notes/queries with resolve/reopen, author vs you, copy-query; text settings (font/size/spacing/width sliders vs the repo's small/medium/large toggle); Ctrl+F find-in-text with result list (repo has no Ctrl+F, only the Chapters & Search panel); speakers derived from Story Bible aliases with "Can speak" per type; manual 3-state prep per chapter with arrow keys; per-type colour editing.
4. **Conflicts with the owner's rules are few.** ADR 0018/0087 (read-only until Edit, Save/Cancel, Delete only in edit mode) *agrees* with the owner. Real conflicts: Series tab / voice references / DAW-dependent features vs "one book per app" and no DAW fakes; remappable keymap (ADR 0361) vs "shortcut editing deferred"; repo's automatic extraction/Needs Review vs "no invented content"; repo's rail "adds no second editor" (ADR 0392) vs our Words tab that edits say-values inline. Details in section 7.

Could not be found in the repo (stated plainly): any passage-level query thread or author-reply model; any per-type "can speak" flag; any Ctrl+F in the Script reader (`grep` for `KeyF`/`ctrlKey ... 'f'` returns nothing); any UI for alias *split* (the sidecar has `split`, ADR 0345, but no component calls it); any shortcut registered for Script or Story Bible in `input/commands.catalog.ts` (only global, workspace and booth scopes exist); any per-chapter manual prep state. The repo's own docs say its mock-02 prep status is "the names still to confirm" because "nothing in the app measures a chapter's prep" (ADR 0392).

---

## 1. STORY BIBLE

### 1.1 What the repo does

**Files**: `components/storybible/Guide.tsx` (page, 333 lines), `GuideDetail.tsx` (978), `PronunciationWork.tsx`, `PronunciationQueries.tsx`, `PropertiesSection.tsx`, `DialogueCueAttribution.tsx`, `VoiceReferencesSection.tsx`, `VoiceDataPanel.tsx`, `OnlinePronunciationLookup.tsx`, `CommonsAudioLookup.tsx`, `components/series/SeriesTab.tsx`; contracts `api/contracts/storyBible.ts`, Zod in `api/schemas/{dialogueCue,character,pronunciationOnline}.ts`; backing logic `sidecars/manuscript-guide/core/manuscript_guide.py` (1917 lines) behind `apps/desktop/internal/guide`. User docs `docs/guides/using-the-app/story-bible.md`.

**Data model** (`api/contracts/storyBible.ts`):
- `GuideEntity {id, canonical_name, aliases: GuideAlias[], category, occurrences[], occurrence_count, pronunciation, description{text,evidence}, personality_notes[], relationships[{id,name,label}], properties[{key,value}], locked, review_state, context?, appearances?[{chapterId,chapter,sceneIndex}]}`.
- `GuideAlias {text, pronunciation, occurrences[]}`: each alias has its *own* pronunciation and occurrences (ours: `aka[]` + `sayA` map).
- `GuidePronunciation {ipa, source, confidence, chosen?, status?: researched|query_sent|author_confirmed, note?, alternate?}` (ADR 0346). `source: 'user'` is shown as "Yours". The narrator's own pronunciation sits *beside* the dictionary's as `alternate`; switching is lossless; `author_confirmed` is withdrawn to `researched` whenever the IPA in use changes.
- Categories: Character, Place (UI label "Location"), Organization, Lore, Item, Event, plus system states Needs Review and Draft (`state.ts` `STORY_BIBLE_TABS`, `CREATABLE_CATEGORIES`). Context field is per category ("Location context", "Timeline context", "Item context", "Lore context"); "Personality notes" is Character only.
- Ids: stable across rebuild by name-set overlap (ADR 0345 `merge_locked`/`entity_name_keys`); `appearances` = distinct (chapter, scene) pairs, scenes split on break paragraphs.
- Relationships are stored **on one entity only**, snapshotting the other's name: `relate()` appends `{id: other, name: other.canonical_name, label}` to the source entity. The detail table is "Relationship | Entry" (`GuideDetail.tsx` ~L483-530) with a "Relationship, e.g. located in" text box and a "Related entry" picker; no reverse view, and the stored `name` is not updated on rename (no test or code found that does).

**Page layout** (`Guide.tsx`): heading + four icon buttons (Pronunciation queries, Voice data, Add entity, Build/refresh Story Bible); a `TabList` of `All · n`, per-category `Characters · n` etc., `Needs Review`, plus `Series`; left a sortable table (Name with colour dot and lock icon + category sub-line, Occurrences count; sort by name or occurrences; search over names, aliases and category); right the detail. Deep link `#<entityId>` selects an entry. A brand-new entity is a local draft (no backend record) until a category is chosen (`isNewDraft`, "Discard this new entry"). First-load errors get an inline `LoadError` with Retry.

**Detail** (`GuideDetail.tsx`): header with name, category menu, mode-based actions. Name field + entity pronunciation with Play preview (Piper, asset-gated first-use download prompt), Generate/Replace pronunciation (CMU or eSpeak), Source/Confidence line; **Aliases table** (Alias | Pronunciation | Occurrences | actions) with per-alias play/generate/remove and a "Add an alias or find a matching entry" combobox that lists matching entries with **Merge into current entry** (confirm: "The source entry will be deleted"; locked entries cannot be merge sources); Description; **Properties** (ordered key/value list, edit with move up/down, `PropertiesSection.tsx`, `propertyDraft.ts`); Personality notes + **Voice references** (approve DAW regions as references, revoke) + **Dialogue cues** (correct a quote's speaker via Select, `DialogueCueAttribution.tsx`) for Characters; Relationships; **Evidence** list (chapter, alias used, excerpt with highlighted names, "Go to line in Script" button) with Rescan occurrences.
- **Pronunciation work** (`PronunciationWork.tsx`): status badge + note + "Also kept: IPA (source)"; in edit mode, a "Pronunciation details" disclosure with "Your pronunciation / Use mine", online lookup (Merriam-Webster, key sealed per user, ADR 0356), Commons audio link, "Use X instead", Status select and "Pronunciation note" ("Who you asked, and when"). Limits 200 / 1000 chars.
- **Pronunciation queries panel** (`PronunciationQueries.tsx`): every name not `author_confirmed`, in reading order, with chapter + excerpt; filter (All not confirmed / Query sent / Researched); Export CSV (ids last, formula guard, ADR 0347); re-import an answered CSV matched by entry id + alias index, blank note column leaves the note (ADR 0352); Mark sent / Mark answered.
- **Series tab** (ADR 0567, `SeriesTab.tsx`): characters shared across a series' books, approved reference clips; mock 06 concept.

**Mode rules** (ADRs, all in `docs/adr/`):
- **0018**: an entry opens read-only; Edit shows Save and Cancel; selecting another entry always starts read-only; a locked entry shows neither Edit nor Save.
- **0036**: the read-only view is the *same form with disabled controls*, deliberately not the prose `EntitySummary` (it lists the alternative and why it was not chosen; "would need a new ADR that supersedes ADR 0018").
- **0087**: Read view = Lock + Edit (no Delete); Edit mode = Save, Cancel, red Delete far from them, no Lock. Play preview, rescan, go-to-line always available.
- **0007**: lock is enforced server-side in `edit()`; UI `disabled` is only a convenience.
- **0020**: extraction favours precision over recall; manual entries survive rebuilds.
- **0091 / 0346 / 0405**: pronunciation is a narrator-edited value; local-first (CMU, Wiktextract, eSpeak) with one online source.
- **0075**: every action that leaves the UI acknowledges within 100 ms, cannot be fired twice, says when it ends (one mutation at a time; `usePendingAction`).
- **0069**: payloads validated with Zod behind `parseWire`.

**Tests**: `GuideDetail.{test,actions,aliasPronunciation,pending,properties,pronunciation,pronunciationWork,voiceReferences}.test.tsx`, `PronunciationQueries.test.tsx`, `propertyDraft.test.ts`, contract goldens under `tests/fixtures/contracts/`, visual states in `tests/visual/`.

### 1.2 What our rebuild does

Files: `studio/src/pages/Bible.tsx`, `pages/bible/{EntryEditor,EntryPicker,Relationships}.tsx`, `selectors/bible.ts`, `state/commands/bible.ts`, `domain/schemas.ts` (`BibleEntry`, `StoryBibleType`, `Relationship`), `tests/bible.test.tsx`, `tests/speakers.test.tsx`.
- Two panes: 320px list (search, kind chips with swatches, mention counts, arrow-key navigation, right-click menu: Open / Find in manuscript / Delete) and an entry pane.
- Entry opens **read-only**; Edit makes name, type, names + say-values, description, (Character only) How they talk / How they act / What they know, and relationships editable; Save keeps, Cancel restores; Delete only while editing.
- Names list with "how I say each" and per-name play/record placeholders (toasts); last name cannot be removed; empty/taken names refused; first name's say = entry say.
- Relationships: table **Relationship | To**; stored `{id,a,rel,b}` by entry id, shown from both sides (incoming ones get an arrow and the full sentence in a tooltip), suggestions datalist, EntryPicker with search; rename keeps links; deleting an entry removes its relationships.
- "Appears in": chapter table with mention counts, click opens the chapter in Script; `linesOf(entry)` exists as a selector (lines spoken, from speaker attribution).
- Types (`StoryBibleType {k, c, speaker?}`): colour and "Can speak" edited in Settings; **speakers are derived** from aliases of entries whose type can speak (`selectors/speakers.ts`).
- Find in the manuscript from the entry.

### 1.3 Capability table

| Capability | Repo | Ours | Verdict |
|---|---|---|---|
| Read-only until Edit, Save/Cancel, Delete only in edit | Yes (ADR 0018/0087); read view is a disabled form (ADR 0036) | Yes; read view is prose | **Keep ours** (matches owner). Note it is the alternative ADR 0036 rejected |
| Entry list: search, type filter, counts | Search + category tabs with counts + sort by name/occurrences + lock icon | Search + type chips + mention count, arrow keys | **Better than both**: add sort and counts on chips (see 6.1) |
| Types/categories | Fixed set + Needs Review + Draft | Narrator-editable types with colour + Can speak | **Keep ours** |
| Draft entry not saved until category chosen | Yes (no orphan records) | New entry created immediately, named, focused | **Translate** a "discard on cancel" rule: Cancel on a brand-new entry deletes it |
| Aliases with own pronunciation | Alias objects with own pronunciation + occurrences | `aka[]` + `sayA` map | **Keep ours**, add per-alias mention counts |
| Add alias that matches another entry then merge | Yes, combobox + Merge into current entry with confirm | Name collision is refused | **Translate** (merge) |
| Alias split into its own entry | Sidecar only, no UI | None | **Better than both**: Remove-name menu has "Make its own entry" |
| Pronunciation as text | IPA string with source/confidence | Free-text "say" string | **Keep ours** (phonetic respelling, owner copy "kroh-KAY") |
| Pronunciation status (researched / query sent / author confirmed) + note | Yes (ADR 0346) | Words tab shows Set / Not set only | **Translate** (rank 1) |
| Narrator's own pronunciation beside dictionary one (`alternate`) | Yes | Single value | **Drop** (we have no generated source; keep single value + status) |
| Generate pronunciation from CMU/eSpeak, online MW, Commons audio | Yes, asset-gated | Dictionary block (web/local/online) with "Use this pronunciation" | **Keep ours** (it is the mock); do not port engines |
| Play reference / record own | Piper preview, voice asset prompt | Toasts only | **Keep ours** (placeholder until audio exists) |
| Description | One text | One text | Same |
| Personality notes / How they talk-act-know | `personality_notes` (one field) | Three fields (voice, acts, knows) | **Keep ours** |
| Context per category (location, timeline, item, lore) | Yes | None | **Drop** (invented fields) |
| Properties (ordered key/value facts) | Yes, with imported cast-block labels | None | **Translate, carefully** (rank 7): maybe, only if owner wants free-form facts |
| Relationships | One-sided, name snapshot, "Relationship / Entry" | By id, both sides, "Relationship / To", arrows, picker | **Keep ours** (feed back) |
| Evidence excerpts + Go to line | Excerpt with highlighted names, per occurrence | Chapter table with counts, opens chapter | **Better than both**: expand a chapter row to its excerpts with jump (see 6.2) |
| Appearances by scene | `appearances` (chapter, scene) | Chapter only | **Drop** (no scene model) |
| Locked entries | Lock/unlock, server enforced | None | **Drop** (no extraction to protect); revisit if imported entries ever get a rebuild |
| Needs Review tab, build/refresh, language model | Yes | None | **Drop** (invented for this mock; no extraction in our book) |
| Rescan occurrences | Button | Computed live | **Keep ours** (live selector, nothing to rescan) |
| Merge duplicate entries | Via alias match | None | **Translate** |
| Dialogue cue attribution on a character | Select per quote | Speaker picker in Script, `linesOf` selector | **Better than both**: show "Lines" in the entry with the same inline speaker select (6.3) |
| Voice references, voice data, Series tab | Yes (DAW regions, series) | None | **Drop** (DAW fakes, one book per app) |
| Pronunciation queries panel + CSV export/import | Yes | Queries are passage threads in Script | **Translate** the name-level list as a second kind of query (rank 2) |
| Stale/duplicate protection (one mutation at a time) | `usePendingAction` (ADR 0075) | Synchronous local state | **Keep ours** (not needed locally) |
| Deep link to an entry | `#<id>` | `ui.bible.sel` via "Open in Story Bible" | Same |
| Keyboard | Tab/Enter table rows | Arrow keys through list | **Keep ours** |
| Undo | None found for Story Bible edits | `act()` undo for deletes etc. | **Keep ours** |

### 1.4 Ranked: worth translating (Story Bible)

1. **Pronunciation status + note** (`researched / query_sent / author_confirmed`, optional note). Why: it is the only thing that tells a narrator which names the author has actually blessed; mock 02 benchmark draws Researched / Author ✓ / Query sent / My reference pills. Schema: `Pronunciation {say, src}` gains `status?: 'researched'|'query_sent'|'author_confirmed'` (default researched, migration-free like ADR 0346) and `note?: string` (cap 1000). Keep `src` free for "mine / dictionary / author". UI: status select + note field per name in edit mode (under the say input), badge in the read view and in the Script Words table; withdraw `author_confirmed` when the say-value changes (ADR 0346 rule). Because ours is per word (`pronunciations[word]`) while repo is per entry name, key status by the name string exactly as `sayA` does.
2. **Name-level pronunciation query list with export** (Words tab "Queries" or a Story Bible button). Derived list: every name whose status is not author_confirmed, in reading order, with chapter and first excerpt; CSV export with ids last and a formula guard (ADR 0347); re-import matches by entry id + alias index and leaves a blank note alone (ADR 0352). Value: mock 02's "Email N queries to author / Export prep sheet" buttons. Schema impact: none beyond #1; add a selector `pronQueries(data)` and a command `markSent/markAnswered`. Copy the formula-guard rule (prefix `'` on cells starting `= + - @`).
3. **Merge on name collision.** Adding a name that already belongs to another entry offers "Merge that entry into this one" (confirm "The other entry will be deleted"), moving its names, relationships (re-pointed), say-values, notes; keep annotations intact. Schema: no change; command `mergeEntries(sourceId, targetId)` plus tests that annotations/speaker confirmations still resolve.
4. **Draft-until-saved for new entries.** Cancel on a brand-new entry removes it (repo `isNewDraft`, comment in `Guide.tsx`). Today ours leaves an "New entry" husk on Cancel. Tiny change in `commands/bible.ts` (`cancelEdit` deletes entries flagged `user && pristine`).
5. **Sort the list** by name or mentions (repo `Guide.tsx` `toggleSort`, `aria-sort`). Also show per-type counts on the chips (repo tab labels `Characters · 12`).
6. **Alias hygiene**: per-name mention counts beside each name (repo alias table "Occurrences" column) and an "alias split" action (repo sidecar `split`, ADR 0345) so a wrongly merged name can become its own entry.
7. **Properties** (free key/value facts, ordered, unique keys case-insensitively, `propertyDraft.ts`). Only if the owner wants it: the repo fills it from imported cast blocks ("Codename", "Dossier"); ours would be invented content, so default is no.

### 1.5 What ours does better (feed back to the repo)

- Relationships as ids, shown from both entries, with a visible direction (arrow + tooltip sentence), searchable picker, rename-proof. The repo's one-sided name snapshot goes stale on rename and cannot answer "who is related to the Queen?" from the Queen's page.
- "How they talk / act / know" as separate fields (repo has one merged "Personality notes").
- Narrator-defined types with colour and "Can speak", driving speakers, chips and list swatches from one place.
- Live selectors instead of a rescan button; mention counts always current.
- Tests that pin each owner decision (`tests/bible.test.tsx` has 20+ behaviours: rename keeps links, refuses taken names, last name cannot be removed, Edit/Save/Cancel restore).

### 1.6 Ideas better than both (Story Bible)

- **Entry "Lines" and "Appears in" in one lens.** Repo: evidence excerpts but no per-speaker view of lines (only a cue-correction select). Ours: chapter counts and a `linesOf` selector not shown anywhere. Combine: an entry shows a segmented control "Chapters | Lines | Mentions"; Chapters = our table; Lines = quoted lines the entry's aliases speak (with inline confirm/change speaker select, same picker as Script, jump to line); Mentions = excerpts with highlighted names and "Go to line". Mock 06's "Hatter's lines" table is the reference. No new data; all from `phrasesOf`.
- **Name rows become one row type everywhere.** A name row = text, say-value, status badge, mention count, play, queries flag. Used in the Story Bible Names list, the Script Words table, the Bible tab in the Script rail and the query list, so the status model has one implementation.
- **A "needs attention" lens on the Bible list**: filter chips for "Names to confirm", "No description", "Never mentioned" computed from the same selectors (repo's Needs Review is extraction-specific; this is the narrator-authored equivalent and invents nothing).

---

## 2. SCRIPT (prep / reader)

### 2.1 What the repo does

**Files**: `components/script/ScriptPage.tsx` (1000 lines), `ScriptChapterList.tsx`, `ScriptRail.tsx`; reader parts in `components/manuscript/`: `ReaderCard.tsx`, `ParagraphView.tsx`, `annotations.ts`, `SelectionMenu.tsx`, `AddNoteDialog.tsx`, `MarkupDialog.tsx`, `MarkupMark.tsx`, `markup.ts`, `dialogueCues.ts`, `WordLookup.tsx`, `useWordLookup.ts`, `SearchBar.tsx`, `ChapterNav.tsx`, `EntitySummary.tsx`, `CreditsEntry.tsx`; contracts `api/schemas/{manuscript,prepMarkup,prepCompleteness,dialogueCue,dictionary}.ts`; hooks `useTextSelection`, `useDebouncedValue`; docs `docs/guides/using-the-app/script.md`, benchmark mock `docs/research/mockups/audiobook-studio-benchmark/02-prep-script.webp`.

**Layout** (ADR 0392 superseded in part by 0393, owner D85): three columns from 1440px (chapters+marks key 12rem | reader | rail 21.5rem); two columns from 1280px; below that the chapter list is a "Chapters & Search" panel and the rail a "Prep rail" slide-over.
- **Chapters · Prep** list: narration chapters only (reference chapters hidden, ADR 0090), the open one marked, a status dot, and a warning badge "N to confirm" = names first heard in the chapter whose pronunciation the author has not confirmed (ADR 0392 point 1: "A chapter with none shows nothing, not a tick"). Under it a **Markup layer** key (Speaker chip, stress, pause, pronunciation, author query).
- **Band above the reader**: heading, text size toggle (small/medium/large only), Prep rail, Chapters & Search, Expand all, Collapse all.
- **Reader**: continuous chapters as cards (`ReaderCard`: whole-header disclosure, bookmark, word count, read time, **Record in Booth**, workspace link, retail sample tag), entity highlights by Story Bible kind, italics/bold/underline spans from the source (ADR 0014), notes as highlights, script markup, speaker chips; "Go to line" keeps its target highlighted 30 s; reader state (active chapter, expanded chapters, bookmarks) saved by the host; opening credits / closing credits pseudo-cards; deep links `#p<n>`, `#c<id>`.
- **Rail** (`ScriptRail.tsx`): *Pronunciations · n* (Word / Say it / Status table; click opens the entity summary), *Characters · n* (name + first lines of description), *Queries · n* (names to confirm in reading order with chapter + status, "Manage queries" opens the Story Bible panel, no second editor).
- **Selection menu** (`SelectionMenu.tsx`): + Note, Mark up, + Story Bible, Look up (single word only; offline dictionary behind a first-use asset prompt, licence credit shown).
- **Notes**: `ManuscriptNote {id, chapter, paragraph, text, createdAt, anchorStart/End/Text}`. One text; read in a side sheet with "Delete note". **No thread, no status, no author reply**. Anchor survives text drift via `resolveNoteAnchor` (re-locate nearest occurrence of anchorText).
- **Markup** (ADR 0382, Proposed): `PrepMarkupSpan {kind: stress|pause|character_tag, value, start, end, anchorText, nonSpaceStart, stale, staleReason}` in a per-project sidecar `prep/markup.json`; stress = dotted accent underline, pause = `/` breath or `//` pause *generated by CSS after the words* so text offsets never shift, character tag = name chip before the words; a stale mark is never drawn on the text, a notice sits beside the line with Remove ("Text changed here: the stress mark on “x” no longer matches this line"). Whitespace-only edits do not flag staleness.
- **Speaker attribution** (ADR 0345 + `dialogueCues.ts`): `DialogueCue {quote_start/end, speaker_entity_id|null, speaker_source: tag|continuation|unknown|correction, evidence{excerpt, tag}, corrected}`; rules are precision-first (speech verb next to a known Character name); corrections survive rebuilds; chip never invents a name for `unknown` ("unknown renders as unattributed, never a fabricated name", PRD success metric). Per-speaker chip colour = hash of canonical name modulo 7 alias tokens (ADR 0367, **Proposed**, `components/primitives/speakerColor.ts`). The reader runs on a **recorded Alice fixture** (ADR notes in `dialogueCues.ts`), i.e. attribution is not live.
- **Prep completeness** (prep-depth Phase 7, `api/schemas/prepCompleteness.ts`): per chapter `{openQueries, staleMarkupSpans, complete}`, totals incl. `unattributedQueries`; consumed by Production, not shown in Script.
- **Find**: `SearchBar` "Search Script…" inside the Chapters & Search panel; debounced (~2 s for lines, instant for titles), Enter fires at once, results grouped by chapter, "Line N" windowed excerpt with highlight. **No in-reader Ctrl+F**, no next/previous match.
- **Text settings**: `small | medium | large` toggle, local state (not persisted per `ScriptPage.tsx` `useState('medium')`); app-wide zoom is a separate global command.
- **Keyboard**: no Script commands in `input/commands.catalog.ts`; remappable keymap exists app-wide (ADR 0361, `schemas/keymap.ts`).
- Lookups: "Look up" dictionary (Open English WordNet, CC BY, ADR 0097), web lookups opened via fixed host templates for Forvo, YouGlish, Merriam-Webster, Howjsay (`api/contracts/pronunciationLookup.ts`; `docs/research/pronunciation-lookup-urls.md` says the URL shapes are **unverified**, owner check pending).
- Tests: `ScriptPage.test.tsx`, `ScriptRail.test.tsx`, `ScriptChapterList.test.tsx`, `SelectionMenu.test.tsx`, `MarkupDialog.test.tsx`, `ParagraphView*.test.*`, `WordLookup.test.tsx`, `ChapterNav.test.tsx`, `dialogueCues.test.ts`, `highlightBoundary.test.ts`; visual suite states; axe debt for nested highlights (#155).

### 2.2 What our rebuild does

Files: `studio/src/pages/script/*` (Reader, ChapterList, Rail, WordsTab, BibleTab, ThreadsTab, FindBar, SelectionTool, dialogs, Para, Legend, keys, context, selection), `selectors/{phrases,speakers,segments,annotations,search,reader,bible}.ts`, `ui/{TextSettings,SpeakerPicker}.tsx`, `state/commands/script.ts`, `tests/script.test.tsx`.
- Three zones: chapter list (prep dot + chapter label + open-query "?" badge + legend), continuous reader, tabbed rail **Words | Story Bible | Notes | Queries** that follows the chapter in view; narrower widths use drawers (`d-ch`, `d-rail`).
- Reader: sticky title with `¶ n of N`, chapter cards with words / minutes / marks / open queries / pronunciation / "without a speaker" facts line, **My prep** 3-state seg (Not started / In progress / Prepped) also on Left/Right arrows, flag banner with Mark reviewed, Record in Booth, end-of-chapter footers, scroll position persistence, spy-driven current chapter.
- Annotation layers per paragraph (`segmentsOf`): entity highlights by type colour, find matches, quoted-phrase speaker chips (suggested vs confirmed), annotations (marks, pronunciation flags).
- **Speakers** derived from aliases of "Can speak" types; suggestion = nearest speech verb within 70 chars; `confirmedSpeakers[key]`; click the chip to open the speaker picker (people in chapter first, searches everyone, no Narrator option, "Confirm X"); chips coloured by the speaker's Story Bible type; stale confirmations fall back to detection.
- **Marks**: narrator-defined `MarkType {k, name, colour, style: highlight|underline|double|dotted|wavy|box, ask?}`, "Define marks" dialog, one composer for every mark, selection toolbar Mark / Add to Story Bible / Look up (disabled across paragraphs).
- **Threads** (`ThreadsTab.tsx`): Notes tab = marks without `ask`; Queries tab = marks with `ask` with Open/Resolved/All filter; each card has type select, show in text, copy query, delete, message thread (you / author / proofer), edit/delete message with undo toast, reply box, "Author replied / My note" toggle, Mark resolved / Reopen, empty reply refused.
- **Words tab**: definitions-source menu (web / local dictionary / online service, with first-use download and offline states), word card with "How I will say it", status Set / Not set, dictionary block with "Use this pronunciation", Definition / Forvo / YouGlish links, add to my words.
- **Story Bible tab** in the rail: read-only card (description, character fields, names and say-values, first chapter), "In this chapter" entries, unknown selection offers "Create an entry" by type; "Open in Story Bible to edit".
- **Find**: Ctrl+F bar over the reader (match count "3 of 12", Enter / Shift+Enter, list of up to 80 results with snippets, Esc closes only when no popover/drawer), plus "Find in manuscript" from entries.
- **Text settings**: popover with Font (7 fonts), Size (9 steps), Line spacing (1.2 to 2.4), Column width (Narrow/Medium/Wide/Full), saved prefs, also in Settings.
- Chapter navigation: list + `Alt+Up/Down`, `jumpToChapter`, drawers, keyboard-navigable list with Home/End.

### 2.3 Capability table

| Capability | Repo | Ours | Verdict |
|---|---|---|---|
| Chapter list with prep status | Dot by recording status + "N to confirm" warning badge; ticks deliberately absent | Manual 3-state dot + open-query "?" | **Better than both**: derived completeness suggestion (6.4) |
| Manual prep state per chapter | None | Seg + arrow keys + dot | **Keep ours** |
| Per-chapter derived rollup (open queries, stale marks, complete) | Contract exists (prep-depth P7), Production only | Facts line on card (marks, open queries, pronunciation, no speaker) | **Translate** the `complete` rule, **keep ours** facts line |
| Reference chapters hidden | Yes (ADR 0090) | `ChapterKind` only `chapter | credits` | **Keep ours** (no reference kind in the mock) |
| Credits as pseudo-cards | Opening/closing credits with token fill-in | Credits chapter kind | **Keep ours** |
| Bookmarks per chapter/line | Yes (`ReaderBookmark`) | None | **Translate** (low, rank 8) |
| Reader state persistence | Host-saved active chapter/expanded/bookmarks | `ns2-pos` scroll in localStorage | **Keep ours** |
| Expand/collapse all chapters | Yes | None (continuous) | **Drop** |
| Record in Booth from chapter | Yes | Yes | Same |
| Find in text | Panel search, debounced, per-line list; no Ctrl+F, no next/prev | Ctrl+F bar, count, next/prev, results list, highlight in text | **Keep ours** (feed back) |
| Chapter title search | Instant client filter | Not in find | **Translate** (title matches grouped by chapter in the results list) |
| Selection tools | + Note, Mark up (stress/breath/pause/speaker), + Story Bible, Look up (single word only) | Mark (typed marks), Add to Story Bible (by type), Look up | **Keep ours** + add stress/breath/pause kinds (6.5) |
| Notes | Single text, delete only, anchor re-location | Threaded, editable, resolvable | **Keep ours** |
| Anchor drift / stale detection | `resolveNoteAnchor` + `stale` markup with notice | Stores `s/e/q`, never re-validates | **Translate** (rank 3) |
| Passage queries to author, resolve/reopen, copy | None (queries are names only) | Yes | **Keep ours** |
| Name-level pronunciation queries + CSV | Yes | None | **Translate** (see 1.4 #2) |
| Speaker attribution | Cue objects keyed by entity id; sources tag/continuation/unknown/correction; fixture-fed in the reader | Phrase keys; suggested vs confirmed; alias-keyed | **Keep ours** + translate "evidence" (see below) |
| Speaker evidence ("why this speaker") | `evidence {excerpt, tag}` stored per cue | Not shown | **Translate**: tooltip/picker line "said Five" |
| Speaker colour | Hash of name mod 7 (ADR 0367, Proposed) | By Story Bible type | **Translate** (per-speaker colour), see 6.6 |
| Speaker picker | Select of Characters in the entry | Popover: people in this chapter, search, Confirm | **Keep ours** |
| Stress / breath / pause markup | Yes (ADR 0382) | None | **Translate** (rank 5) |
| Text settings | small/medium/large | font, size, spacing, width | **Keep ours** (feed back) |
| App zoom | Ctrl +/-/0 | prefs.zoom via jump menu | Same idea, **keep ours** |
| Dictionary lookup | Offline OEWN with licence credit | Web / local / online with downloads and offline states | **Keep ours**; copy the licence credit line when "local" is shown |
| Web pronunciation links | Forvo, YouGlish, MW, Howjsay | Definition, Forvo, YouGlish | **Keep ours**; add Howjsay only if wanted; URL shapes unverified in the repo |
| Rail tabs | Pronunciations / Characters / Queries | Words / Story Bible / Notes / Queries | **Keep ours** (broader) |
| Rail edits pronunciation | No ("Open in Story Bible", ADR 0392) | Yes, inline say-value | **Keep ours**, flag as conflict (7.3) |
| Chapter facts "N without a speaker" | `unattributedQueries` only for queries | Yes | **Keep ours** |
| Context menu | Not found | Right-click menus (`context.ts`) | **Keep ours** |
| Responsive | Container query on card header, drawers below 1440/1280 | Drawers | **Keep ours**, copy the container-query rule if the card header collides |
| Keyboard map | Registry only for global/workspace/booth | Page key handlers | **Keep ours** (editing deferred) |
| Credits token fill-in, retail sample ruler | Yes | None | **Drop** (not in mock) |

### 2.4 Ranked: worth translating (Script)

1. **Pronunciation status in the Words table and card** (same model as 1.4 #1): table columns Word / Say it / Status; status pills Researched / Query sent / Author ✓ / Mine. Replaces the current Set/Not set derived state. Words flagged but unset show "Not set". Schema `Pronunciation` + `status/note`. Fixture: seed none (no invented content); default `researched` only when a say-value exists.
2. **Stale-anchor detection for annotations.** Our `Annotation {p, s, e, q}` already stores the quote `q`. Add `staleOf(a, paragraph)`: if `text.slice(s,e) !== q` (after whitespace collapse via a non-space offset, per ADR 0382) then try nearest relocation like `resolveNoteAnchor`; else mark stale and show "Text changed here: the note on “q” no longer matches this line" with Remove / Re-anchor, never draw on wrong words. Needed as soon as manuscript replace exists (our `Replace manuscript` button). Tests: whitespace-only edit does not flag; line deleted; moved text relocates.
3. **Name-level queries tab content.** Queries tab gets a second section "Names to confirm" (derived) above or beside passage queries, with Export to author (CSV), Mark sent / answered, and chapter badge "N to confirm" feeding the chapter list (ADR 0392). Passage queries keep their threads.
4. **Stress / breath / pause as built-in marks** (see 6.5 for the unified design). Why: it is what mock 02's "Markup layer" legend shows and it is the point of prep for a narrator; the repo proves the rendering rule (generated content, no DOM text, so offsets never move).
5. **Evidence for a suggested speaker.** `Phrase` gets `why?: {tag: string}` (the speech-verb clause that produced the suggestion, available inside `speakerIn`). Show it in the picker ("Suggested from “said Five”") and as the chip tooltip. Repo contract: `evidence {excerpt, tag}`, `speaker_source`. Our `confirmed` boolean maps to `correction`; suggested → `tag`; add `continuation` only if we implement it (repo found continuation "right far more often than not but not always", ADR 0345).
6. **Per-chapter `complete` rule** from `prepCompleteness`: complete when 0 open queries, 0 stale marks, 0 names to confirm and 0 unattributed quotes. Show as a quiet check next to the dot, offered as a one-click "Mark prepped" suggestion (never auto-sets the manual state).
7. **Chapter title matches in Find results** (repo `ChapterNav` `titleMatches` shown instantly before line results).
8. **Bookmarks** (`ReaderBookmark {kind: chapter|line|note}`): a bookmark icon in the chapter card header; optional.

### 2.5 What ours does better (feed back to the repo)

- Threaded notes/queries with author-reply tracking, resolve/reopen, edit/delete message with undo, copy-query, and a per-chapter open-query badge. The repo has only name-level queries and one-shot notes.
- Ctrl+F find in the reader with count, next/previous and a result list; Esc priority rule (popover, drawer, then find).
- Text settings (font, size, spacing, width, saved) and a `¶ n of N` position readout in the sticky header.
- Speaker picker that lists people in the chapter first and searches all, with "Confirm" for a suggestion; speakers derived from aliases (no separate speaker list to maintain); suggested vs confirmed visual state.
- Manual prep state with arrow keys and an observable dot.
- Define-your-own mark types (colour + line style + "tracks a reply") instead of fixed kinds.
- Right-click context menus on every object.

### 2.6 Ideas better than both (Script)

1. **One mark system, not three.** Repo has three unrelated layers (entity highlight, note highlight, markup spans). Ours already has narrator-defined marks. Extend `MarkType` with `kind: 'note' | 'query' | 'direction'` and add two `MarkStyle`s, `slash` (breath, glyph `/` after) and `slashes` (pause, `//`). Seed built-ins: Stress (dotted), Breath, Pause, plus the existing note/query types. Directions are generated-content decorations (no text in the DOM), same as the repo's ADR 0382 rule, so find/selection offsets stay valid. Booth and Companion read the same annotation list (the repo's stated goal: "carry through to the booth view").
2. **Derived prep progress with a manual override.** Chapter dot = manual state; ring around the dot = derived completeness (names to confirm, open queries, stale marks, unattributed quotes). When derived says complete and manual says In progress, the seg shows a "Looks done: mark Prepped?" affordance. Neither the repo (no manual state) nor ours (no derivation) has both.
3. **Click-through everywhere**: every count in the facts line ("2 open queries", "3 without pronunciation", "1 without a speaker") is a button that opens the matching rail tab filtered to this chapter, or steps through the unattributed quotes. Repo counts are static badges; ours are static text.
4. **Speaker coverage strip** per chapter: a thin bar under the card (confirmed / suggested / unknown segments by quoted-line count) with "Next unattributed" (n/N). Uses `phrasesOf`, zero new data. Fits the "Attribute speakers" button in mock 02's header.
5. **Prep sheet export** (mock 02 button "Export prep sheet"): one printable page per book from existing data: names with say-values and status, characters with colours and first lines, open queries. Reuses the CSV code in 1.4 #2. Only add if the owner confirms the button belongs in our mock.

---

## 3. Entry / name / pronunciation data (shared by both pages)

| Concern | Repo | Ours | Recommendation |
|---|---|---|---|
| Name identity | Entity `id` from hash of canonical name, kept across rebuild by name-set overlap | Slug id, stable, names are `aka[]` | Keep ours |
| Alias pronunciation | Per alias object | `say` + `sayA[alias]` | Keep ours; add `status/note` keyed by alias like `sayA` |
| Pronunciation status | Per name | None | Translate (rank 1) |
| Per-word pronunciations for non-entries | None (words not in the Story Bible have no pronunciation record) | `pronunciations[word]` flagged from the text | Keep ours (feed back: narrators flag plain words too) |
| Speaker identity | `speaker_entity_id` | Alias string | Keep ours, but resolve alias → entry for chips so renaming an alias cannot orphan confirmations (we already handle rename in `commands/bible.ts`; keep `tests/speakers.test.tsx` rename case) |
| Relationship direction | One-sided | Directed, both sides | Keep ours |
| Staleness of anchors | Computed on read, never stored | Not computed | Translate |
| Wire contracts | Zod schemas in `api/schemas`, golden payloads | Zod in `domain/schemas.ts` | Align names later (the `domain/schemas.ts` comment already says so) |

## 4. Repo constraints that bind design (cite when deciding)

- `docs/adr/0018, 0036, 0087` read-only/Edit/Save/Delete placement (agrees with owner).
- `docs/adr/0007` locks enforced server-side; only relevant if we ever add Lock.
- `docs/adr/0345` stable ids and cue extraction rules (precision first; correction survives rebuild).
- `docs/adr/0346, 0347, 0352` pronunciation status, query CSV, re-import matching.
- `docs/adr/0367` per-speaker colours aliasing the seven kind hues, hash by name (Proposed).
- `docs/adr/0382` markup as per-line offset spans, CSS-generated glyphs, stale never repositioned (Proposed; the PRD's concept mock "is not owner-approved").
- `docs/adr/0392 / 0393` Script prep status = names to confirm; three columns from 1440 px; reader card keys off its own width.
- `docs/adr/0090` reference chapters hidden from the reader.
- `docs/adr/0075` acknowledge actions within 100 ms (irrelevant to a local mock, relevant if our DAW adapter calls go async).
- `docs/adr/0069` payloads Zod-checked on arrival.
- CLAUDE.md: a UI change ships with benchmark-mock before/after screenshots; build UI towards `docs/research/mockups/audiobook-studio-benchmark/` only (mock 02 for Script, mock 06 for series voices, there is no Story Bible mock other than 06's concept).

## 5. Where the benchmark mocks sit relative to both

- **Mock 02 (Script)** draws: chapter list with ticks and `80%` for the open chapter; header "Ch 8 · Croquet-Ground  3,412 words · ~22 min  [2 queries open]  [ATTRIBUTE SPEAKERS]"; **speaker chips with a coloured left rail per speaker** (NARR, FIVE, SEVEN, QUEEN); a "Markup layer" legend (attribution, word stress, `/` breath, `//` pause, word pronunciation, author query); rail tabs Pronunciations · 12 / Characters · 9 / Queries · 2 with columns WORD / SAY IT / STATUS and a ▶ play per row; "Look up “hedgehogs”" buttons (Forvo, YouGlish, Merriam-Webster, **Record mine**); bottom strip "New voices in this chapter" (first-line ¶ and a note) and "Read-ahead notes" (free text); footer buttons **Email 2 queries to author / Export prep sheet**. Statuses shown: Researched, Author ✓, Query sent, My reference.
- The repo implemented chips (neutral colour until ADR 0367), the markup legend, rail tabs and the status vocabulary, but **not** "Attribute speakers", "New voices in this chapter", "Read-ahead notes", "Record mine", Email/Export, or the 80% progress. Ours also lacks those; they are candidates in this order: New voices in this chapter (derived from `entriesInChapter` + first-appearance `firstLabel`, free), Email/Export queries (rank 2), Attribute speakers (a walkthrough over unattributed quotes, idea 2.6.4), Read-ahead notes (a per-chapter free-text note; note this would be new stored content, ask the owner).
- **Mock 06** is a *Series voices* concept (reference clips, audio-feature comparison "A/B with Hare", Hatter's lines in Book 2 Ch 5). The repo built a plain Series tab and **departed from the mock on purpose** (ADR 0567) and benched everything acoustic. It also contradicts our "one book per app" rule. Treat only the per-character *lines list* as relevant to us.

## 6. Concrete "better than both" designs (detail)

### 6.1 Story Bible list

Chips show counts (`Character 12`); a sort control (Name / Mentions); filter chip "Needs attention" (names to confirm, no description, never mentioned). Keep arrow-key list; add `aria-sort` semantics on the control. Selecting a chip updates `ui.bible.kind` as today.

### 6.2 Appears-in lens

`appearsIn` returns `{c, n}`. Add excerpts: first K occurrences with the matched alias bolded (reuse `snippet()` from `selectors/search.ts`) and "Go to line" (`jumpToParagraph`). Row expand/collapse; Enter opens the chapter as today.

### 6.3 Lines lens and speaker confirmation in the Bible

`linesOf(entry)` already returns `{pid, chapterId, spk, s, e, t}`. Render each with a small speaker select (reuse `openSpeakerPicker`) so correcting attribution from the character's page works exactly like the reader. Count in the header "Lines · 61". Repo equivalent: `DialogueCueAttribution.tsx` (select over Characters).

### 6.4 Derived prep

Selector `chapterPrep(b, chapterId)` returns `{toConfirm, openQueries, staleMarks, unattributed, complete}`. The list badge shows the largest actionable number ("3 to confirm"), the card facts line items become buttons, "Mark prepped" is offered when `complete`. Tests: one per rule, plus "manual state is never changed by derivation".

### 6.5 Directions marks (stress / breath / pause) inside the existing mark system

`MarkType.kind?: 'note' | 'direction'`; `MarkStyle += 'slash' | 'slashes'`. Selection toolbar's Mark menu groups "Directions" (Stress, Breath, Pause) above the narrator's note/query types; no composer needed for a direction (one click), a note-less annotation. Legend (`Legend.tsx`) reads the same mark list so the key can never drift from the text. Rendering via CSS `::after { content: attr(data-glyph) }`.

### 6.6 Speaker colours

Mock 02 and ADR 0367 both want *distinct* colours per speaker. Ours colours by type (all Characters equal). Proposal: speaker colour = the entry's own `colour?: MarkColour` if set, else a stable hash of the entry id into the six `MarkColour` tokens (ours has six, repo seven), type colour stays for entity highlights and list swatches. The owner's "speakers derived from Story Bible aliases" is preserved (alias → entry → colour); the colour is editable in Edit mode. Needs a contrast check per token like the repo's `paletteContrast.test.ts`.

---

## 7. Conflicts and tensions with what the owner told us

| # | Owner rule (studio) | Repo decision | Status | Recommendation |
|---|---|---|---|---|
| 1 | Story Bible entries read-only with Edit/Save | ADR 0018 (+0087 Delete only in edit) | **Agree** | Nothing to do. Mention ADR 0036: the repo rendered read-only as a disabled form and recorded prose as the rejected alternative; ours is the rejected alternative, which is fine for the mock |
| 2 | Relationships table "Relationship + To" | "Relationship / Entry", one-sided | Naming differs only | Keep ours |
| 3 | Rail does not edit | ADR 0392: "editing a pronunciation stays in the Story Bible, so the rail adds no second editor" | **Ours deviates** (Words tab saves say-values, BibleTab is read-only) | Keep the Words-tab edit if the mock requires it; otherwise move edit to Story Bible. Ask owner |
| 4 | Speakers derived from Story Bible aliases | Cues keyed by entity id, Characters only, extractor-built, reader on a recorded Alice fixture | **Different model, compatible** | Keep alias-derived speakers and per-type "Can speak"; store `entryId` beside alias on a confirmation if a contract is ever aligned. Do not copy the fixture approach |
| 5 | No invented content | Repo derives entities (build), "Needs Review" tab, descriptions generated from text (`trait_notes`, `direct_description`) | **Conflict if ported** | Do not port extraction, Needs Review, generated descriptions, Context fields, Properties defaults |
| 6 | One book per app | Series tab in Story Bible (ADR 0567), series voice bible (mock 06) | **Conflict** | Drop Series. Keep only "lines of a character" |
| 7 | Keyboard shortcut editing deferred | Remappable keymap, command registry, conflict finder (`input/*`, `schemas/keymap.ts`, ADR 0361) and a Shortcut sheet | **Conflict in scope** | Adopt the *catalog as data* idea (declare Script/Story Bible shortcuts in one table that Settings and the help sheet both read), not the editing UI. Our `app/help.ts` has two overlapping lists (`SHORTCUTS` and `HELP_ROWS`) that already disagree (e.g. proof keys `↑ ↓` vs `J / K`); one catalog removes that drift. Script shortcuts missing from the repo catalog too, so there is no prior art to copy |
| 8 | DAW actions go through `daw()` (no faking) | Voice references and Record regions require DAW regions | **Compatible** | Defer voice references until the DAW adapter has regions |
| 9 | Booth mirror text removed at owner's request | Repo keeps read-aloud mirroring | n/a for these pages | none |
| 10 | Passage queries to the author tracked in Script | Repo has none; only name queries (ADR 0346/0347) | **Gap in repo** | Keep ours; add name queries as second section (see 1.4 #2) |
| 11 | Chapter prep manual 3-state | ADR 0392: "A chapter with none shows nothing, not a tick, because nothing yet says its prep is done" | **Opposed philosophy** | Ours is manual; use idea 2.6.2 so both exist, and never show a tick the narrator did not set |
| 12 | Text settings with sliders and persistence | Repo has a 3-way toggle and global zoom, text size not persisted | Ours is a superset | Keep ours |
| 13 | Benchmark mocks are the spec (CLAUDE.md) | Mock 02 items "Attribute speakers", Read-ahead notes, Email queries, Export prep sheet unbuilt in the repo | Open | Decide per 5 |

## 8. Caveats about this research

- The repo's Script reader still runs speaker chips on a **recorded demo fixture** (`dialogueCues.ts` header and ADR 0345 consequences: "no binding reads `appearances` or `dialogue_cues` yet"). Treat its attribution UI as unproven; its *rules* (precision-first, `unknown` is never named) are the useful part.
- ADR 0367 (speaker colours) and ADR 0382 (markup) are **Proposed**, and the prep-depth concept mock is "not owner-approved". They are ideas, not settled repo decisions.
- The web-lookup URL templates are explicitly unverified (`docs/research/pronunciation-lookup-urls.md`). Our Forvo link uses `/search/<word>/`; the repo's template uses `/word/<word>/`; neither has been checked against the live site.
- I did not run the repo app or our screenshots; findings are from source, ADRs, PRDs, user docs and the benchmark mock images (02 and 06 viewed).
- I did not find a Story Bible benchmark mock besides 06's series concept; there is no repo mock to compare our Story Bible layout against, so the layout decision stays with the owner's own mock.
