# UI function inventory: Script page + Story Bible (built from code)

Root: `src/studio/ui/src/components/` (abbrev `C/`). Ports: Script goes through `usePort('x')` (`api/contracts/*`); Story Bible mostly through legacy `useApi()` (`api.guideXxx`) plus some `usePort`. Labels come from `src/studio/ui/src/icons.catalog.ts` (`action=`) when an `IconButton` has no `label`. Line numbers are as read on branch `claude/ui-function-audit`. Guides/mocks were not used except to cross-check.

Abbrev: SD = Script data layer (`C/script/page/data/useScriptData.ts` -> `scriptData.ts` cache, `scriptCommands.ts` journalled commands via `journal.act`). `J` = journalled (Ctrl+Z / undo history). `SPH` = `C/script/scriptPageHost.ts`.

---

## 1. Tables

### 1.1 Script page shell: `C/script/page/ScriptPage.tsx`

| Control | Label / icon / tooltip | File:line | Handler -> host call / state | Notes |
|---|---|---|---|---|
| Empty state | `NeedManuscript` "Script" | ScriptPage.tsx:95 | `onImport -> navigate('/')` (Production import) | Different from App's `NeedManuscriptImport` (App.tsx:~900); two empty states |
| Load error | `LoadError` + Retry | ScriptPage.tsx:93 | `chapters.retry -> data.load('chapters')` -> `manuscript.manuscriptChapters` | |
| Chapters drawer toggle | icon `chapters` "Show the chapter list" (hidden >=1180px) | ScriptPage.tsx:492 | `toggleDrawer('ch')` -> view store `drawer` | |
| Side-panel drawer toggle | icon `sidePanel` "Toggle the side panel" (hidden >=1281px) | ScriptPage.tsx:493 | `toggleDrawer('rail')` | |
| Attribute speakers | icon `attributeSpeakers` "Find who speaks each line", `pending` | ScriptPage.tsx:500 | `commands.attributeSpeakers` -> `storyBible.guideAttributeSpeakers`; J only if something moved (undo = `guideRestoreSpeakers`); toast "Attributed N lines." + Undo, or "No new speakers found." | scriptCommands.ts:346; useScriptData.ts:325. Not shown anywhere in Story Bible |
| Text settings | icon `textSettings`, tooltip = summary | tools/text/TextSettings.tsx:61 | Popover: Font Select, Size / Line spacing / Column width Sliders -> `useTextPrefs` -> `saveTextPrefs` (readerText.ts, browser storage) | Per-viewer, not a host setting |
| Skip to side panel | text button (sr-only until focus) | layout/SkipToRail.tsx:25 | focus rail tab / `update({drawer:'rail'})` | |
| First-use tip | `FirstUseTip script.select-text` | ScriptPage.tsx:553 | `used={selection!==null}` | |
| Key hints footer | `KeyHints` | ScriptPage.tsx:598; layout/scriptKeyHints.ts:20 | display only: prep state, chapter, bookmark, bookmarks, search | |
| Reader click on mark/name/flag | click span | reader/Reader.tsx:458 | mark -> `showMark` (tab marks); flag `data-w` -> `showWord` (tab pron); name `data-ent` -> `showEntry` (tab bible) | |
| Speaker chip | button "Speaker: X, state. Change speaker" | reader/Para.tsx:34 | `onPickSpeaker` -> `SpeakerPicker` (ScriptPage.tsx:466,612) | |
| Reader scroller keys | Left/Right when reader focused | reader/Reader.tsx:486; registry/useScriptRegistry.ts:174 | `script.prep.prev/next` -> `commands.stepPrep` (J). Reader's own `onStepPrep` (Reader.tsx:77,491) is never passed by the page (dead path) | |
| Deep links | `#p<n>`, `#c<id>`, `#credits-opening/closing`, `?find=<text>` | layout/useDeepLink.ts:46; ScriptPage.tsx:214,334 | `goTo` / `openFind` / `goToChapter`; stale link -> toast | `?find=` is how Story Bible Find button gets here |
| Credits setup banner | "The credits need N values", buttons `Don't ask for this project`, `Fill in` | credits/CreditsSetupBanner.tsx:56,59 | `api.creditsSetupDismiss('project')` / opens dialog | Same component on Production (ManuscriptImport.tsx:362) |
| Credits setup dialog | "Set up the credits": `Don't ask for this project`, `Not now`, `Save`, field inputs, checkbox "Use for all my projects", link `Settings > Credits` | credits/CreditsSetupDialog.tsx:110,114,117,146,160; ScriptPage.tsx:626 | `api.creditsSetupDismiss('project'/'session')`, `api.saveSettings('General','global',{narrator_name})`, `api.creditsSetupSave(values)`; `onMoreFields -> /settings#credits` | Close = `Not now` |

### 1.2 Chapter list (left column / drawer): `C/script/page/chapters/ChapterList.tsx`

| Control | Label | File:line | Handler | Notes |
|---|---|---|---|---|
| Chapter row | title/subtitle + prep dot | ChapterList.tsx:~95-105 | `onJump -> goToChapter` (view `pendingJump`); `onClose` in drawer | `data-jump` also a context-menu target |
| Credits rows (opening/closing) | "Opening credits"/"Closing credits" + dot | ChapterList.tsx:~145-160 (`CreditsItem`) | `row.onJump -> goToChapter(CREDITS_STOP.*)` | dot = `prep.prepOf('credits:opening')` (ScriptPage.tsx:315) |
| Roving keys | Up/Down/Home/End | ChapterList.tsx:53 | focus move | |
| Drawer close | icon `close` | ChapterList.tsx:80 | `update({drawer:null})` | |
| Prep legend | `PrepLegend` | chapters/PrepLegend.tsx | display | |
| Context menu (right-click chapter row or boundary) | `Go to this chapter`; `Record in Booth` (if `goToBooth`); `My prep` > Not started / In progress / Prepped | registry/contextProvider.ts:186-196 | `goToChapter`; `recordChapter -> goToBooth`; `commands.setPrep` (J) -> `scriptPrep.scriptPrepSetChapter` | |

### 1.3 Reader cards: `chapters/ChapterCard.tsx`, `CreditsSection.tsx`

| Control | Label | File:line | Handler | Notes |
|---|---|---|---|---|
| Record in Booth (chapter) | icon `recordInBooth` "Record in Booth" | ChapterCard.tsx:83 | `goToBooth({chapter})` (narration chapters only, ScriptPage.tsx:426) | |
| My prep segmented | Not started / In progress / Prepped | chapters/PrepSegment.tsx:21 | `commands.setPrep` (J) -> `scriptPrepSetChapter`; announces "{chapter}: {state}" | Same control on credits cards (id `credits:*`) |
| Facts line | "N words · about M min finished audio · k notes · u without pronunciation · s without a speaker" | ChapterCard.tsx:29-37; `useChapterFacts` useScriptData.ts:226; `chapterFacts` script.selectors.ts:101 | marks + prep words + `unattributed(cues)` | See Capability tags |
| Retail sample tag | "Retail sample" | ScriptPage.tsx:413 | `retailSampleRange(chapters, credits.retailSample)` | |
| Credits Record | icon `recordInBooth` "Record {Opening credits} in Booth", only if words>0 | CreditsSection.tsx:53 | `goToBooth({credits})` | |
| Credits `Fill in` | button | CreditsSection.tsx:67 | opens `CreditsSetupDialog` | |

### 1.4 Rail (right column / drawer): `layout/RailPanel.tsx`; tabs Words / Story Bible / Notes

| Control | Label | File:line | Handler -> host / state | Notes |
|---|---|---|---|---|
| Tabs | Words, Story Bible, Notes (Left/Right) | RailPanel.tsx:15,31 | view `tab` | |
| Drawer close | icon `close` "Close" | RailPanel.tsx:29 | `update({drawer:null})` | |

**Words tab** `rail/words/*`

| Control | Label | File:line | Handler | Notes |
|---|---|---|---|---|
| Definitions from | button "Definition source: Web page/Local dictionary/Online service" menu | words/DefinitionSourceMenu.tsx:17,26 | `host.setDefinitionSource` -> `system.saveSettings('Script','global',{definition_source})` (SPH:149); reread on focus (SPH:136) | Same host setting as Settings (Script.definition_source) |
| Word row | name, source icon, Hear | rail/InThisChapter.tsx:303-336; WordsTab.tsx:56 | row click -> view `word` (not for Story Bible-derived rows, WordsTab.tsx:391) | rows = `prep.chapterWords` (flagged + Bible names) |
| Hear (row) | icon `hear` "Hear {name}" | InThisChapter.tsx:334 | `hearReference` = **toast only** "Playing “x” reference clip" (InThisChapter.tsx:296) | STUB |
| Word card Hear | icon `hear` | words/WordCard.tsx:462 | `hearReference` toast | STUB |
| Word card Record | icon `record` "Record my own clip" | WordCard.tsx:463 | `overlay.toast('Recording your own pronunciation')` | STUB |
| Source tag/menu | `PronSourceTag` -> `SourceMenu` | WordCard.tsx:466; storybible/source/SourceMenu.tsx:34 | `pick`: manual -> `saveSay`; else `host.candidate -> pronunciationSources.pronunciationCandidate(word,id)` then `saveSay(say,id)` | |
| "How I will say it" field + Save | TextField, `Save`, Enter | WordCard.tsx:470,482 | `commands.saveSay` (J) -> `scriptPrep.scriptWordSay(word, say, source)` | stored in script-prep word list, NOT the Story Bible entry |
| Definition block | local dictionary: `systemLookup`; online: `host.onlineDefinition -> pronunciationOnline.pronunciationOnlineLookup`; `Use` per row; install prompt | words/DefinitionBlock.tsx:132; dictionaryInstall.tsx:49 | `Use` -> `save(value, 'online')`; `Download dictionary`/`Repair dictionary` -> `assets.assetsInstall('dictionary', id)`/state/cancel | |
| Look up on the web | `Definition`, `Forvo`, `YouGlish` | words/ExternalLinks.tsx:15 | `host.openLookup -> pronunciationLookup.pronunciationLookupOpen(source, word)` | |
| Add to my words | button | WordCard.tsx:100 | `commands.flagWord(selection)` (J) -> `scriptWordFlag` | only when status not_flagged and a reader selection is held |

**Story Bible tab** `rail/bible/*`

| Control | Label | File:line | Handler | Notes |
|---|---|---|---|---|
| Entry card Find | icon `find` "Find in the manuscript" (Ctrl+F hint) | EntryCard.tsx:80 | `update(openFind(name))` (in page) | catalogue hint says Ctrl+F but Ctrl+F opens jump menu, not Find |
| Entry card Add note | icon `addNote` "Add a note" | EntryCard.tsx:81; BibleTab.tsx:49 | `overlay.toast('Select text in the reader, then choose Mark.')` | STUB (instruction toast) |
| Entry card Open in Story Bible | icon `openInStoryBible` | EntryCard.tsx:82 | `focusStoryBibleEntity(id)` (App `goToStoryBible`) | |
| Entry card body | read-only description, talk rows (if `canSpeak`), names + IPA + `PronSourceTag` | EntryCard.tsx:~110-170 | none | entry from SD `entries` |
| Miss card `Create an entry` | icon menu (kinds) | BiblePanel.tsx:78-83 | `commands.createEntryFrom(kind, miss)` -> `storyBible.guideCreate(name, kind, [])` (J; undo `guideDelete`) | toast "Added “x” to the Story Bible as y." or "Linked “x” to Y." |
| Miss card definition + web links | DefinitionBlock (no `Use`) + ExternalLinks | BiblePanel.tsx:132,147 | as Words tab | |
| In this chapter rows | name, kind, "first Chapter N", Hear | BiblePanel.tsx:150-163 | row click -> `update({entryId})`; Hear = toast stub | rows = `entries.entriesInChapter(paragraphs)` (regex over loaded text) |

**Notes tab** `rail/threads/*`

| Control | Label | File:line | Handler | Notes |
|---|---|---|---|---|
| Type select | "Type" | NoteCard.tsx:96 | `setMarkType` (J; implemented as add-new + remove-old, new id) | scriptCommands.ts:152 |
| Show in text | icon `locate` | NoteCard.tsx:103 | `onShow` -> `update({sel})` + scroll | |
| Copy note | icon `copyQuery` "Copy the note" (queries only) | NoteCard.tsx:104; threads/copyQuery.ts | clipboard; toast "Note copied." | |
| Delete note | icon `deleteNote` | NoteCard.tsx:105; ThreadsTab.tsx:34 | `removeMark` (J) -> `marksRemove`; toast "Note deleted." + Undo | |
| Edit message / Delete message | icons `editMessage`/`deleteMessage` | NoteCard.tsx:122,123 | `editMessage` (J; opening msg = replace) / `deleteMessage` (J, toast Undo) | |
| Message editor `Cancel`/`Save` | | threads/MessageEditor.tsx:12,15 | `onCancelEdit`/`onSaveEdit` | |
| Reopen | `Reopen` | NoteCard.tsx:134 | `setStatus(open)` (J) -> `marksSetStatus` | |
| Who wrote this | Author replied / My note | NoteCard.tsx:142 | local state | |
| Reply | `Reply` | NoteCard.tsx:159 | `reply` (J) -> `marksReply`; empty -> toast "Write the reply or note first." | |
| Mark resolved | button | NoteCard.tsx:163 | `resolve` (reply then `marksSetStatus resolved`; 2 J entries) -> toast "Note resolved." | |
| Load error Retry | `Retry` | ThreadsTab.tsx:71 | `marks.retry` | |

### 1.5 Selection toolbar and dialogs (reader): `tools/select/*`, `tools/speaker/*`

| Control | Label | File:line | Handler | Notes |
|---|---|---|---|---|
| Across paragraphs | disabled "Select within one paragraph." | SelectionTool.tsx:122 | none | |
| Mark menu | icon-menu "Mark": each mark type; "Pronunciation (a word)"; "Define how you mark up…" | MarkMenu.tsx:30-37 | type -> `onCompose` -> `MarkComposer`; word -> `commands.flagWord` then view `{tab:'pron', word}`; define -> `MarksDialog` | |
| Story Bible menu | icon-menu "Story Bible": each kind | KindMenu.tsx:18-20 | `commands.createEntryFrom(kind, quote)` then view `{tab:'bible', entryId}` | |
| Bookmark here | icon `bookmark` "Add a bookmark here" (B) | SelectionTool.tsx:149 | `bookmarks.add` (J) -> `bookmarks` port | |
| Record from here | icon `recordHere` | SelectionTool.tsx:160 | `goToBooth({chapter, from})` | only if `goToBooth` |
| Look up | icon `lookUp` | SelectionTool.tsx:171 | `lookupTarget` -> view tab pron/bible (no host call) | same logic as ScriptPage.tsx:350 `lookUp` |
| Mark composer | `Cancel`, `Save`, Type select, note/question field | MarkComposer.tsx:52,55,71,85 | `commands.addMark` -> `marksAdd` (J); query requires text | toast "Marked “x” as Y." / "Note saved. Track the reply in the Notes tab." |
| Define marks dialog | name field, Colour, Line selects, Asks checkbox, Remove (icon `delete`, two-press if used), `Add a mark`, `Done` | MarksDialog.tsx:84-147 | `saveMarkTypes -> marks.marksSaveTypes(types, removeUses)` (SPH:186), then `marks.retry` | SAME component reused by Settings > MarksPanel (settings/page/MarksPanel.tsx:67) |
| Speaker picker | Search speakers combobox, `Confirm “X”` row, list | SpeakerPicker.tsx:63-104; ScriptPage.tsx:612 | `commands.confirmSpeaker(cueId, entryId)` (J) -> `storyBible.guideCorrectCue` | |

### 1.6 Context menus (Script): `registry/contextProvider.ts` (provider registered by `useScriptRegistry.ts:85`)

| Target | Items | File:line | Handler |
|---|---|---|---|
| Quoted phrase `[data-ph]` | `Speaker: Name (suggested)…` | contextProvider.ts:151 | `pickSpeaker` |
| Mark `[data-a][data-st]` | `Open the thread`/`Edit the note`; `Mark resolved`/`Reopen` (queries); `Change type` > types (disabled "Already this type"); `Delete mark` | contextProvider.ts:99-113 | `showMark`; `setStatus`; `setMarkType`; `removeMark` (all J) |
| Flagged word `[data-w]` | `Show in Words`; `Remove from my words` | contextProvider.ts:162 | `showWord`; `commands.removeWord` (J; N x `scriptWordUnflag`) |
| Name `[data-ent]` | `Open “X” in the side panel`; `Find “X” in the manuscript` | contextProvider.ts:167 | `showEntry`; `openFind` |
| Selection | `Mark as` > types + "Pronunciation (a word)"; `Add to the Story Bible as` > kinds (omitted if name already an entry/alias); `Look up “q”`; `Find “q” in the manuscript`; `Copy`; `Bookmark here`; `Record from here` | contextProvider.ts:120-139 | `composeMark`/`flagWord`/`createEntryFrom`/`lookUp`/`openFind`/clipboard/`bookmarkAt`/`recordFromHere` |
| Words table row `tr[data-w]` | `Show “w”`; `Remove from my words` | contextProvider.ts:213 | `showWord`; `removeWord` |
| Bookmark ribbon | `Edit bookmark`; `Delete bookmark` | script/bookmarks/ui/bookmarkContextMenu.ts:19,20 | click ribbon / `bookmarks.remove` (J) |

### 1.7 Keyboard shortcuts and jump-menu items (Script)

| Shortcut / item | Command id (catalog `input/commands.catalog.ts`) | File:line | Effect |
|---|---|---|---|
| Alt+Down / Alt+Up | `editing.chapter.next/prev` (shared with Editing) | useScriptRegistry.ts:160 | `goToChapter(next/prev stop)` incl. credits stops |
| F3 / Shift+F3 | `script.search.next/prev` (enabled only when `find.open`) | useScriptRegistry.ts:164 | `stepFind` |
| Left / Right (reader focused) | `script.prep.prev/next` | useScriptRegistry.ts:174 | `stepPrep` (J) |
| Escape | `script.escape` | useScriptRegistry.ts:177 | closes Find (if no menu/drawer) else closes drawer |
| B | `bookmark.here` (scope global) | script/bookmarks/model/useBookmarkCommands.ts:48 | `bookmarkAt(selection start or first line of chapter in view)`; opens editor |
| Alt+] / Alt+[ | `bookmark.next/prev` | useBookmarkCommands.ts:49 | step with wrap; toast "No bookmarks yet." |
| Ctrl+F (shell `jump.page`) | not a Script command | useScriptRegistry.ts:5 | page items below |
| Jump menu page items | `search.next/prev/clear` (while Find open), `chapter.*`, `entry.*` (Story Bible), `mark-type.*` "Mark the selection as X" | useScriptRegistry.ts:98-150 | |
| Search sources | manuscript text -> `openFind`; marks -> `showMark`; words -> `showWord` | useScriptRegistry.ts:81-83 | There is NO visible Find bar/field in the reader; Find is reachable only via jump menu, `?find=`, entry/context rows |

### 1.8 Bookmarks (Script): `C/script/bookmarks/*`

| Control | Label | File:line | Handler | Notes |
|---|---|---|---|---|
| Ribbon in gutter | click opens editor popover | ui/BookmarkRibbon.tsx:35; layout/BookmarkGutter.tsx | popover | |
| Editor | Label (60), Note (500), delete icon `deleteBookmark` "Delete the bookmark" | ui/BookmarkEditor.tsx:88,104,124 | blur/close -> `bookmarks.update` (J, `bookmarks` port); delete -> `remove` (J) | |
| Add | selection tool, context menu, B | useBookmarks.ts:44 | `addBookmark` (J) toast "Bookmark added." + Undo (or "That spot is already bookmarked.") | |

### 1.9 Story Bible page: `C/storybible/Guide.tsx`

| Control | Label | File:line | Handler -> host / state | Notes |
|---|---|---|---|---|
| Page empty | `NeedManuscriptImport` (App) | Guide.tsx:88 | | |
| Load error | `LoadError` + Retry | Guide.tsx:358 | `load(entityId)` -> `api.guideEntities` | |
| Add entry | button `+ Add entry` | Guide.tsx:381 | local draft `pendingNewEntity`; nothing written until category chosen (`api.guideCreate`) | |
| More actions menu | icon `moreActions` "More actions": `Scan the manuscript` (hidden while running), `Import entries`, `Voice data` | ActionsMenu.tsx:21-27 | `startScan`; `openImportDialog`; `setVoiceDataOpen` | |
| Search entries | SearchField; Down -> first row; Esc clears | Guide.tsx:391 | local `query` | |
| Filter menu | icon `filterList` "Filter, N on": Kind checks, Pronunciation Any/None/Has one, Show All/Needs review/To verify | FilterMenu.tsx:52-97,105 | local `filter` | chips (FilterMenu.tsx:131) and `Clear filters` (:142; Guide.tsx:368) |
| Sort menu | icon `sortList` "Sort: X" | SortMenu.tsx:21,28 | `keepSort` -> `saveEntrySort` (browser storage `narration.storyBible.sort`) | also column header click `chooseColumn` |
| Entry table row | click / Enter opens; Space plays name if it has IPA | EntryTable.tsx:185,248 | `selectRow` | |
| Row Hear | icon `hear`/`stop` | EntryTable.tsx:322 | `hear(id)` -> `usePreviewAudio` -> `api.guidePreview(id)` (real host preview; asset prompt opens entry) | |
| Up/Down | `storybible.entry.next/prev` | EntryTable.tsx:172 | step selection | Home/End on rows (:175) |
| Loose suggestion row | click | suggested/panel/LooseSuggestionRows.tsx:31 | `setLooseId` -> shows `SuggestionList` | only under filter Show=To verify |
| Unknown-link alert | `Dismiss`, `Go to Production` | Guide.tsx:428,429 | | |
| Read notices | "Check again" (types / chapters failed) | ReadNotice.tsx:17; Guide.tsx:436,443 | `setReadNonce` | |
| Context menu (entry row) | `Open`; `Find in the manuscript`; `Mark reviewed` (if flagged; unavailable while suggestions to verify); `Delete entry` (unavailable if locked) | Guide.tsx:315-331 | open; navigate `/script?find=`; `ask(id,'review'/'delete')` -> `GuideDetail` command |
| Jump menu (Ctrl+F) | entries by name/alias | Guide.tsx:341 | `selectRow` (clears filters if hidden) |
| Scan status | progress bar + `Cancel scan`; `Scan incomplete` badge | suggested/panel/ScanStatus.tsx:38 | `scan.cancel -> extraction.extractionScanCancel` |

### 1.10 Entry detail: `C/storybible/GuideDetail.tsx`

| Control | Label | File:line | Handler -> host | Notes |
|---|---|---|---|---|
| Mark reviewed (entry) | text button | GuideDetail.tsx:708 | `markReviewed()` -> `api.guideMarkReviewed(id)`; custom toast Undo -> `api.guideFlagReview` (NOT in journal); disabled "Verify or reject its suggestions first." when toVerify>0 (:702) | |
| Find in manuscript | IconButton "Find in the manuscript" (uses `<Icon name="find"/>`) | GuideDetail.tsx:184 | `navigate(/script?find=name)` | |
| Lock/Unlock | icon "Lock entry"/"Unlock entry" | GuideDetail.tsx:716 | `api.guideSetLocked` | read view only |
| Edit | icon "Edit this entry" | GuideDetail.tsx:728 | local `editing` | hidden if locked/new |
| Save | icon "Save changes to this entry" | GuideDetail.tsx:741 | `api.guideEdit(id, {canonical_name, description, personality, context, properties?})` | validates name uniqueness locally (`nameOwner`) |
| Cancel editing | icon "Cancel editing" | GuideDetail.tsx:752 | revert draft | |
| Delete | icon "Delete entity" (edit mode only) -> ConfirmDialog "Delete entry" | GuideDetail.tsx:760,1065 | `api.guideDelete`; "cannot be undone" | Script's create-from-selection undo also calls `guideDelete` |
| Cancel new entry | icon | GuideDetail.tsx:769 | drop draft | |
| Kind chip menu | types list | GuideDetail.tsx:665 | draft: `api.guideCreate(name, category, [])`; else `api.guideEdit(id,{category})` | types from component-local `useGuideTypes` (GuideDetail.tsx:81) |
| Name rows (per name): Mark reviewed (alias) | icon `markReviewed` "Mark {name} reviewed" | GuideDetail.tsx:828 | `api.guideMarkReviewed(id, aliasIndex)` | |
| Remove alias | icon trash "Remove alias X" (edit) | GuideDetail.tsx:838 | `api.guideEdit(id,{aliases})` | |
| Play preview | icon hear/stop; labels "Play preview"/"Pause preview"/"Play alias pronunciation" | GuideDetail.tsx:863 | `api.guidePreview(id, aliasIndex)`; asset prompt -> `api.ttsInstall/ttsInstallState/ttsInstallCancel` | |
| Record own clip | icon `record` "Record my own clip for X" | GuideDetail.tsx:881 | `notify('Recording your own clip')` | STUB |
| Add a name / Add name | field + button | GuideDetail.tsx:892,904 | `api.guideEdit(id,{aliases})`; collision note + `Merge into this entry` | |
| Merge into this entry | button | GuideDetail.tsx:604 | `api.guideMerge(src,target)`; toast Undo -> `api.guideUnmerge(undoId)` | not in journal |
| Pronunciation field/source (edit) | TextField "How I say X"; source button+menu; alternate "Use mine"/"Use the dictionary's" | source/NamePronunciation.tsx:~140-190 | blur/Enter `api.guidePronounceUser`; source pick `pronunciationSources.pronunciationCandidate` then `api.guidePronounce` (or `guidePronounceUser` for online); alternate `api.guidePronunciationUseAlternate` | host entry pronunciation (`pronunciation.ipa/source`) |
| Look up elsewhere | disclosure: `Look up online… in Merriam-Webster` + `Use this`; `Listen on Commons` | OnlinePronunciationLookup.tsx; CommonsAudioLookup.tsx:31 | `api.pronunciationOnlineLookup(name)`; `api.pronunciationCommonsAudioOpen(name)` | |
| Description / talk / personality / context fields | EntryText / Field | GuideDetail.tsx:926-995 | draft -> Save | |
| Properties editor | `Add property`, up/down/remove per row | PropertiesSection.tsx:64,101,104,107 | draft -> Save | |
| Speaker colour | Select "Speaker colour" | SpeakerColourField.tsx:35; GuideDetail.tsx:963 | `api.guideSetSpeakerColor(id, idx)` | |
| Voice samples (entry) | list rows + menu `Rename…`, `Make primary`, `Move to a character…`, `Delete…`; `Open Editing`, `Mark again in Editing`/`Open in Editing`, `Check again` | voicesamples/VoiceSampleRow.tsx:67-70,156; VoiceSamplesBody.tsx:145,159; useVoiceSampleActions.tsx:63,88,110,138 | `voiceSamples.voiceSampleSetPrimary/voiceSampleUpdate/voiceSampleRemove` | dialogs: EditVoiceSampleDialog (Cancel/Save), MoveVoiceSampleDialog (Cancel/Move), ConfirmDialog Delete |
| Voice references | region select, note, `Approve` (label in file), per-ref `Revoke` | VoiceReferencesSection.tsx:103,125 | `api.characterListRegions/characterReferences/characterApprove/characterRevoke` | |
| Dialogue cues (per speaker) | per-cue Select "Speaker for “q”" (Unknown + speaking entries) | DialogueCueAttribution.tsx:84 | `api.guideCorrectCue(cueId, id\|'unknown')` (not in journal); toast "Cue attribution corrected."/"Cue cleared to unknown." | list = `api.guideDialogueCues` read locally in this component |
| Suggested/accepted claims | SuggestionRow: icons `accept`, `markReviewed` "Mark this suggestion reviewed", `editSuggestion`, `reject`; edit: `saveAndAccept`, `cancelEdit`; Quotes go-to-evidence button | suggested/row/SuggestionRow.tsx:96-128; Quotes.tsx:39 | `extraction.extractionAccept/Reject/Review` (J, undo `extractionReopen`); toast "Accepted" + Undo | commands.ts:58-65 |
| Relationships | `Add a relationship`, To: dialog, label input, per-row `Remove relationship` | Relationships.tsx:134,304,336,359 | `api.guideRelate`, `api.guideUnrelate` (change = relate+unrelate) | |
| Appears in | per chapter icon `goToChapter` "Go to X"; `Rescan` | AppearsIn.tsx:43; GuideDetail.tsx:1023 | `goToManuscript(chapterId)` -> `/script#c..`; `api.guideRescan(id)` | |
| Voice download prompt | Download voice | GuideDetail.tsx:1038 | `api.ttsInstall…` | |

### 1.11 Story Bible dialogs / drawers

| Dialog | Controls | File:line | Host call | Notes |
|---|---|---|---|---|
| Scan the manuscript (first-scan prompt) | `Use basic scan now`, `Download better analysis…`, `Import from a file instead`, checkbox "Don't ask again" | suggested/scan/AnalysisPrompt.tsx:18-28; useStartScan.tsx:42-85 | reads `system.settingsForScope` (ManuscriptGuide.analysis_prompt) + `assets.assetsList`; "never" -> `system.saveSettings('ManuscriptGuide','global',{analysis_prompt:'basic'})`; basic -> `extraction.extractionSources` + `extractionScan(ids)`; download -> Settings `ConsentDialog` + install; import -> ImportDialog | Same setting as Settings checkbox "Offer better analysis when scanning" |
| Import entries | `Cancel`, `Choose a file…`, `Copy prompt`, `Show/Hide example`, format toggle, `copyExample` icon, paste textarea, Add (`addLabel`) | suggested/import/ImportDialog.tsx:~228-345 | `extraction.extractionImportPrompt` (x formats), preview via `useImportPreview`, `extractionImportCommit(text,hint)` (J) / `extractionImportUndo` | text only crosses |
| Voice data panel (drawer) | Narration voice samples + references; `Remove voice samples…`, `Remove voice data…` with ConfirmDialogs | VoiceDataPanel.tsx:132,135 | `voiceSamples.voiceSamplesRemoveAll`; `api.characterRemoveVoiceData` | |
| Delete entry confirm | `Delete entry` / cancel | GuideDetail.tsx:1065 | `api.guideDelete` | |
| Consent dialog (analysis tools) | from Settings component | useStartScan.tsx:87 | install via `useAnalysisTools` | shared with Settings |

### 1.12 Mapping and credits modules (in my area but used outside Script)

| Control | Label | File:line | Used by | Host call |
|---|---|---|---|---|
| MappingConfirm: `Change`/`Clear` (labels from props), `Track for X` select, `Confirm`, `Cancel` | mapping/MappingConfirm.tsx:60,63,80-87 | Production ChapterTrackPanel, EditingCheckPanel, recordingcheck/CheckResult | props `onConfirm/onClear` (callers do `chapterTrackMapSet/Clear`) |
| TrackSelect | mapping/TrackSelect.tsx:26 | engine/ChapterLinksTable, connection/ChapterLinkDialog | |
| `useCreditsRows` | credits/useCreditsRows.ts:58 | Production, Proof, Delivery, Master, ChapterLinksTable | `credits.creditsTemplates/creditsStatuses/creditsPreview/creditsRecordedLengths`, `system.settingsForScope` (room tone), `credits.setCreditsStatus` | **not used by Script** (Script has its own `useScriptCredits`) |
| Script page does NOT draw any chapter-to-track mapping control | | | | "is linked" is computed only elsewhere |

---

## 2. Capability tags

| Capability | Locations (file:line) | Implementation each uses | Shared? / can they disagree? |
|---|---|---|---|
| **Story Bible entries list** | Script SD `scriptData.ts:68` (`guideEntities` via `usePort('storyBible')`); Story Bible `Guide.tsx:140` (`api.guideEntities`, own `rows` state); Booth `useBoothData.ts:93`, Companion `CompanionPage.tsx:48`, Editing `useVoiceSample.tsx:71`, `sampleMarksContext.tsx:47`, Settings `DeleteStoryBibleData.tsx:87`, `StoryBibleTypesPanel.tsx:210` | Script: shared cache, reread on ANY `job:ended` and on project attach (scriptData.ts:~120-135). Story Bible: own state, reread only on `kind==='story_bible'` (Guide.tsx:206) and after its own mutations; no project-attach handler seen | SEPARATE. Same host call, independent caches. Stale divergence: Script updates after any job (e.g. import) but not after a Story Bible edit made on the other page until that page remounts (cache is per host, reloaded only by `job:ended`/own commands; Script `useEntries` ensure-once). Story Bible edits (`guideEdit`, merge, lock) never invalidate Script cache |
| **Story Bible types / Can speak** | Script `scriptData.ts:69` + `useEntries.canSpeak` (useScriptData.ts:186) -> `storyBibleTypes.canSpeak`; Story Bible page `Guide.tsx:176` (`api.guideTypes`); GuideDetail own `useGuideTypes` (GuideDetail.tsx:81, reread when entities change); Booth `useBoothData.ts:98` | all call `guideTypes` | THREE+ separate reads inside Story Bible alone (Guide `types` vs GuideDetail `types`). `speaks` filter implemented twice: `script.selectors.speakerCandidates` / `dialogueCues.selectors.cueSpeakerEntries` (identical, both Set of `type.speaks`) and `storyBibleTypes.canSpeak`. Can disagree if types change between reads |
| **Speaker attribution (confirm/correct a cue)** | Script chip + picker: `ScriptPage.tsx:618` -> `confirmSpeaker` scriptCommands.ts:326 (J) -> `guideCorrectCue`; Script run-all: `attributeSpeakers` (ScriptPage.tsx:500) -> `guideAttributeSpeakers`/`guideRestoreSpeakers`; Story Bible: `DialogueCueAttribution.tsx:50` -> `api.guideCorrectCue` (not J); Booth `useBoothData.ts:122` -> `guideCorrectCue`; Editing `useVoiceSample.tsx:72` (reads cues) | Script: cache `cues`; chip state via `cueSpeakerState` (confirmed = `corrected \|\| speaker_source==='correction'`); unknown = speaker not among speaking entries. Story Bible: filters `speaker_entity_id === entity.id \|\| null`, status text "Corrected" if `cue.corrected`, "Unattributed" if `speaker_source==='unknown'`, else "Attributed"; speaker options by `canSpeak` of local types | SEPARATE. Same host write, three implementations of the read/label. Disagreement: a cue assigned to a non-speaking entry is "unknown" in Script (and counted in "without a speaker", script.selectors.ts:unattributed) but "Attributed" with a speaker name in Story Bible; Story Bible lists only cues for this entity or `null`, never cues whose id points at a non-speaker. Undo exists only on Script path |
| **Chapter prep state ("My prep") and credits state** | Script write: `PrepSegment.tsx:21`, `stepPrep` keys, context menu `contextProvider.ts:194` -> `scriptPrep.scriptPrepSetChapter`; read: SD `prep` (`scriptPrepList`); Production pipeline `usePipelineSources.ts:83` (`scriptPrepList` own read keyed by refreshKey); Credits "Prepped" dot on Script chapter list = `prep.prepOf('credits:opening')` (ScriptPage.tsx:315) while `creditsRows` (credits/creditsRows.ts:22) computes a state from `preview.unresolved` that ScriptPage discards (uses only existence); Production credits status = `useCreditsRows.setStatus -> credits.setCreditsStatus` (ChapterStatus) | prep = script-prep record; credits status = credits status file; unresolved-token state = template preview | SEPARATE and 3-way for credits (user "My prep" on credits card vs Production credits status vs unresolved tokens). Production reads prep once per refreshKey; Script change does not push |
| **Progress counts on Script cards** | `chapterFacts` script.selectors.ts:101 via `useChapterFacts` useScriptData.ts:226 | notes = ALL marks in chapter (not open queries); "without pronunciation" = flags whose word `status==='not_set'`, Story Bible names ignored; "without a speaker" = `unattributed` | Own computation; differs from Words tab list (which also includes Bible names, status from entry IPA) and from Story Bible filters ("Has one"/"None" via `hasPronunciation`) and from the Production/Nav counts |
| **Pronunciation (how a name/word is said)** | Script Words tab: `saveSay` -> `scriptPrep.scriptWordSay` (word record `say/source/status`), `WordCard.tsx:439`; Script Bible tab shows entry IPA read-only (EntryCard.tsx:~150); Story Bible entry: `NamePronunciation.tsx:84-136` -> `api.guidePronounceUser/guidePronounce/guidePronunciationUseAlternate`; Story Bible list/filter `hasPronunciation(entry)`; Settings: definition source | Two stores: script-prep words vs Story Bible entry/alias `pronunciation` | SEPARATE stores. `chapterWords` (script.selectors.ts:52-72) dedupes by name key with flagged words winning, so a name both flagged and in the Bible shows the Script `say`, hiding the entry's IPA; status set `set/not_set` for Bible rows is `ipa.trim()!==''`, for flagged rows the host's `status`. Editing a name's IPA on one page never changes the other. Hear is real on Story Bible (`guidePreview`), toast stub on Script |
| **Pronunciation sources list** | `usePronunciationSources` (storybible/source/usePronunciationSources.ts:15): used by Script WordsTab:363, WordCard:426, BibleTab:27 and Story Bible NamePronunciation (via GuideDetail:291) | one hook, `pronunciationSources.pronunciationSources`, read per mount | ONE implementation, one read per consuming component (can differ momentarily) |
| **Online/definition lookup** | Script `SPH:172` `pronunciationOnline.pronunciationOnlineLookup`; Story Bible `OnlinePronunciationLookup.tsx:22` `api.pronunciationOnlineLookup`; Settings `MwKeyBody.tsx:54` | same host call, three call sites | host-side one; UI separate. Script gates on definition source (`web` default), Story Bible always explicit button |
| **Definition source setting** | Script `SPH:105 useDefinitionSource` (`system.settingsForScope('global').Script.definition_source`, saved via `system.saveSettings('Script','global',…)`, localStorage migration); Settings page field | one host key | One store, two UIs; Script rereads on window focus only |
| **Find in manuscript** | Script: `findState.ts` openFind; callers: context menu (contextProvider.ts:134,168), EntryCard (BibleTab.tsx:48), jump-menu manuscript source (useScriptRegistry.ts:81), `?find=` (ScriptPage.tsx:214); Story Bible: GuideDetail.tsx:184 and entry context menu Guide.tsx:316 both navigate `/script?find=name` | `searchManuscript(paragraphs.all)` over loaded paragraphs only (ScriptPage.tsx:395) | One search function, but only over chapters already loaded by `useLoadedParagraphs`; matches may undercount before all chapters load. Jump-menu search source uses `lines()` = same `paragraphs.all` |
| **Entity "appears in / mentions"** | Story Bible `chaptersOf` (appearsInModel.ts:14, host `appearances`/`occurrences`); entry table count `chapterCount` (entryList.ts:21); Sort "Most mentioned" `occurrence_count`; Script In this chapter `entriesInChapter` -> `mentionsIn` regex on loaded text (script.selectors.ts:~140-160); reader name highlights use same `mentionsIn` (layers.ts) | host sidecar scan vs UI regex | SEPARATE. Disagree after Rescan not run, aliases changed, or whole-word/longest-match rule differs from sidecar; Script ignores entry `locked`/review |
| **Scan / extraction** | Story Bible only: ActionsMenu.tsx:21 -> `useStartScan` -> `useSuggestions.scan.start` (`extractionSources`, `extractionScan`, poll `extractionScanState` every 1s, `extractionScanCancel`); Settings analysis tools; no scan/build trigger in Script. A `story_bible` job end is listened in Guide.tsx:206 and scriptData.ts (any job) but no UI in this area starts that job | one implementation | n/a; but `job:ended` kind `story_bible` has no visible starter in this area (likely Production import) |
| **Import (entries)** | Story Bible: ActionsMenu import, scan prompt "Import from a file instead" -> `openImportDialog` | one `ImportDialog` (J). Script import = Production (`NeedManuscript onImport -> '/'`) | n/a |
| **Delete / clear data** | Entry delete GuideDetail.tsx:563 (`guideDelete`, not J); Script create-from-selection undo calls `guideDelete` (J); voice samples/references removal VoiceDataPanel.tsx:78,90; Delete Story Bible data = Settings only (`DeleteStoryBibleData.tsx`, ActionsMenu.tsx:7 comment) | separate | Entry deleted in Story Bible leaves stale Script cache (entries/cues) until a job ends; Script journal entry "Added X to the Story Bible" undo after the entry was merged/deleted elsewhere would `guideDelete` a missing id |
| **Mark reviewed** | Entry (GuideDetail.tsx:708) `guideMarkReviewed(id)`; alias (:828) `guideMarkReviewed(id, i)`; suggestion (SuggestionRow.tsx:105) `extractionReview`; context menu Guide.tsx:323 -> same as entry | three meanings, same label/icon `markReviewed` | Entry "Needs review" = `entryFlagged(review flags) \|\| verifyOf(suggestions)>0` (entryList.ts:42); badge shown in detail and list but not in Script's Bible tab at all |
| **Retail sample** | Script marker `retailSampleRange` (manuscript/retailSampleRange.ts:11) from `credits.creditsRetailSample`; Settings `RetailSamplePanel.tsx:48` | Script maps `startParagraphId/endParagraphId` to `chapter.paragraphIds` index; Settings uses `startChapterId+startLine` and `paragraphId = paragraphIds[line-1]` | SEPARATE read of same host value; Script silently draws nothing when ids are not found (retailSampleRange.ts:14) |
| **Credits setup state (banner/dialog)** | Script `SPH:48` (`credits.creditsSetupState`, own `setup` state); Production `ManuscriptImport.tsx:130` (own state); both render same `CreditsSetupBanner/Dialog` | components shared, state separate | Dismiss/Save on one page not seen by the other until remount |
| **Credits preview / token state** | Script `SPH:61` (`credits.creditsPreview` first template of each kind); `useCreditsRows.ts:~95` (Production/Proof/Delivery/Master) | duplicate reads (templates + previews) | SEPARATE; Script has no room-tone/status; both pick "first template of kind" |
| **Mark types (Define marks)** | Script `MarksDialog` via `useSaveMarkTypes` (SPH:186); Settings `MarksPanel.tsx:57-67` reuses `useMarks` + `useSaveMarkTypes` + same `MarksDialog` | ONE implementation (cache shared via `hosts` WeakMap keyed on marks port) | shared |
| **Text/reader prefs** | Script `useTextPrefs` -> `saveTextPrefs` (browser storage); Story Bible sort in browser storage (`ENTRY_SORT_STORAGE_KEY`) | per-viewer | not host settings; not in Settings (confirm there is no Settings twin) |
| **Chapter pickers / go to chapter** | Script chapter list, jump menu, Alt+Up/Down; Story Bible `AppearsIn` -> `goToManuscript(chapterId)` (App `goToScript`, `/script#c<id>`), evidence links `evidenceLinks.ts` (`#p<index>`), `Quotes.tsx:39` | Script `useDeepLink` parses `#p`/`#c` | one deep-link parser; senders build hashes separately (`scriptPath`, evidenceLinks) |
| **Record / linked-track status** | Script `Record in Booth` buttons only (`goToBooth`); mapping UI (`MappingConfirm`, `TrackSelect`) lives in Production/Editing/Recording check/Engine | n/a in Script | Script shows no "linked" or "recorded" status of its own except prep dot and Retail tag |
| **Voice samples** | Story Bible entry section + Voice data panel (`useVoiceSampleActions`); Editing creates them (`useVoiceSample.tsx`) | `voiceSamples` port in both | Story Bible lists via `useVoiceSamples` source; own read per section/`Check again` |
| **Undo** | Script/bookmarks/suggestions/import use `journal.act`; Story Bible entry edits, lock, merge, mark-reviewed, delete, cue correction, pronunciation use custom toast Undo or none | two undo systems | undo-history (Ctrl+Z, Ctrl+Shift+H) lists Script and suggestions but not entry edits |

---

## 3. Suspicious controls

Stubs / do nothing real
- `InThisChapter.tsx:296` `hearReference` toast "Playing “x” reference clip" (used by Words rows, Bible-tab rows, Word card Hear `WordCard.tsx:462`): no audio. Story Bible equivalent plays real preview (`api.guidePreview`).
- `WordCard.tsx:463` Record -> toast "Recording your own pronunciation"; `GuideDetail.tsx:881` Record -> `notify('Recording your own clip')`: no recording.
- `BibleTab.tsx:49` / `EntryCard.tsx:81` "Add a note" icon only toasts "Select text in the reader, then choose Mark." (instruction prose, no action).
- `usePrepKeys.ts:9` `useStepPrepFromKey` has no consumer; `Reader.tsx:77,486-494` `onStepPrep` path never wired (page uses `script.prep.*` commands instead): dead code.
- `ScriptPage.tsx:78` `goToEditing` prop accepted, never used (comment admits). `ScriptPage.stories.tsx:62` passes it.
- `credits/creditsRows.ts:22` computed per-row `state` is discarded by ScriptPage.tsx:310-321 (dot uses `prep.prepOf`), so the doc comment ("Prepped once its preview has no [Token] left") is not what the dot shows.
- `icons.catalog.ts:276` `deleteEntry` action ("Delete this entry"): no consumer found; the entry trash button is `label="Delete entity"` (GuideDetail.tsx:760). Catalogue names `addToStoryBible` and `bookmarks` also have no `action=` consumer in components (grep).
- `scriptCommands.ts:285` comment: mock's `addWord` (a word with no place in the text) has no host call, so the Words tab cannot add a word without a selection.

Same function, different labels/icons
- Find: icon `find` "Find in the manuscript (Ctrl+F)" (EntryCard) vs GuideDetail.tsx:184 IconButton "Find in the manuscript" without `action` vs context rows "Find “x” in the manuscript" vs Story Bible context "Find in the manuscript". Catalog hint `Ctrl+F` is wrong: Ctrl+F opens the jump menu.
- Delete entry: "Delete entity" (icon, GuideDetail.tsx:760) / "Delete entry" (dialog, context menu) / catalog "Delete this entry".
- Create entry: "Add entry" (Story Bible button), "Create an entry" (Script miss card), "Add to the Story Bible as" submenu, icon-menu "Story Bible" (SelectionTool).
- Mark reviewed: text button "Mark reviewed" (entry), icon "Mark {name} reviewed" (alias), icon "Mark this suggestion reviewed", all `markReviewed`.
- Hear: "Hear {name}", "Hear the reference clip", "Play preview", "Pause preview", "Play alias pronunciation".
- Merriam-Webster: Script `Definition` button vs Story Bible `Look up online: X in Merriam-Webster`.
- Record: "Record in Booth", "Record {Opening credits} in Booth", "Record from here" (twice: selection toolbar red icon and context menu text).
- Cancel: "Cancel editing" / "Cancel new entry" / "Cancel the edit" (suggestion) / "Cancel scan".
- Two different "Credits" dots: chapter-list dot (prep) vs Production credits status.
- Words tab and Bible tab both render `InThisChapter` titled "In this chapter" with different content/aria labels.

Controls that should exist elsewhere / are missing
- No visible Find bar in the Script reader (only jump menu, `?find=`, entry rows); no "Clear search" button except jump-menu item and Escape.
- Script has no scan trigger, no import, no Story Bible entry review/lock/delete, no Story Bible "needs review" indicator in the Bible tab; Story Bible has no export and no "Attribute speakers" run (only per-cue select), while Script has the run-all.
- Story Bible detail edits do not refresh the Script cache; no cross-page invalidation event.
- Story Bible `GuideDetail` Delete only in edit mode (documented) but Script's undo of create calls delete for non-edit path.
- Script chapter card lacks mapping / "linked track" / "recorded" status; Story Bible lacks per-entry "mentions in this chapter" count (only Appears in list and count).
- Settings duplicates: Mark types (shared component), Definition source, Retail sample, Delete Story Bible data, Story Bible types panel; Script/Story Bible do not link to them (Define marks dialog is reachable from Script; types editor only in Settings).
- Words tab Bible-derived rows are not clickable (read-only) with no pointer to where to edit the pronunciation (WordsTab.tsx:390).
