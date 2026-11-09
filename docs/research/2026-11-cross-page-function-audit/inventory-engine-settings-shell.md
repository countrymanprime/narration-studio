# Inventory C: Engine panel, Companion, Settings, app shell / jump menu / command registry, header chips, connection dialogs

Verified against code at HEAD (repo head commit dated 2026-11-03). The two audit files (`docs/research/ui-function-audit/inventory-*.md`, 2026-10-29) are stale in places: corrections are listed in "Audit drift" at the end. Paths are relative to `src/studio/ui/src/` unless prefixed. Host binding = `api/wailsClient.ts` method (Go binding in `src/studio/desktop/bindings*.go`). `[audit]` = taken from the audit and spot-checked, line number not re-verified.

---

## 1. Engine panel (`components/engine/EnginePanel.tsx`, SlideOver "Audio engine")

Task context: after linking a DAW project, the narrator checks which project and tracks the app reads, ties chapters to tracks, turns chapter sync on or off, and runs REAPER-side tools (stamp, render prep, regions, tags, cleanup launchers, retake lanes).

Opened from: header engine chip (`App.tsx:243-244,886`), `EnginePanelLink` (`engine/EnginePanelContext.tsx:18`; used `proof/ProofChapterPage.tsx:183`, `proof/checkcard/CheckCard.tsx:259`, `editing/EditingCheckPanel.tsx:82,390`, `stages/StageEvidence.tsx:228`, `recordingcheck/CheckResult.tsx:149,184`, `booth/ResumePrompt.tsx:292,400`), retired `/tracks` route (`engine/RetiredTracksRoute.tsx`). No jump-menu command and no key opens it. Panel closes on any path change except from `/tracks` (`App.tsx:251`).

### 1.1 Project section (REAPER) / Audacity card

| Action (label) | Kind | Host binding | Component file:line | Also reachable from |
|---|---|---|---|---|
| Link file… / Change file… (card action; hidden while the .rpp picker shows) | Button | `linkDawFile` -> `ProjectLinkDawFile`, then `bootstrap` | `engine/EnginePanel.tsx:243` -> `App.tsx:339 linkDawFile` | Settings "Choose a project file" (`settings/controls/EngineBody.tsx:283`, same handler); Booth `RecordSetup.tsx` own handler; `connection/linkDawFile.tsx` context (`useLinkDawFile`) |
| Link the open project… (mismatch card) | Button | same `linkDawFile` | `EnginePanel.tsx:268` | Booth "Link the open project" (`booth/record/RecordSetup.tsx` OtherProject dialog) |
| Check again (mismatch card; `CheckLine` shows last checked) | Button | `bootstrap` via `refreshBootstrap` | `EnginePanel.tsx:271` (`App.tsx:263`) | Settings "Test connection" (`dawChoice`), Booth/Editing/Production dialogs, ChapterLinkDialog (different reads) |
| Use (.rpp picker row, when >1 candidate) | Row button | `tracksSelect(path)` | `EnginePanel.tsx:300-303` | none (also `tracksDiscover` on open `:105`, `tracksList` `:121`) |
| Audacity card replaces project section when `audacityLink.chosen` | Card | `audacityLink`, `subscribeAudacityLink` | `engine/AudacityLinkCard.tsx` via `EnginePanel.tsx:152`; `useAudacityLink.ts:41-47` | Settings DAW category (`EngineBody.tsx`) embeds the same card |
| - Start Audacity | Button | `launchDaw` (project port) | `AudacityLinkCard.tsx:99` | Settings "Start {DAW}" `EngineBody.tsx:273`; ReaperOffDialog Start |
| - Turn on scripting | Button | `audacityEnableModule` | `AudacityLinkCard.tsx:104` | none |
| - Link the open Audacity project | Button | `audacityLinkOpenProject` | `AudacityLinkCard.tsx:109` | none |
| - Choose / Change Audacity project file | Button | `audacityLinkFile` | `AudacityLinkCard.tsx:113` | none |
| - Unlink | Button | `audacityUnlink` | `AudacityLinkCard.tsx:118` | none (REAPER has no unlink anywhere) |
| - Check again | Button | `audacityLinkCheck` | `AudacityLinkCard.tsx:123` | none |
| Panel close | SlideOver X "Close the engine panel" | none | `EnginePanel.tsx:68` | Escape; route change |

### 1.2 REAPER tools card (`EnginePanel.tsx:168-182`; shown only when the project has tracks and the DAW is not Audacity; Link chapters only if chapters exist)

| Action (label) | Kind | Host binding | Component file:line | Also reachable from |
|---|---|---|---|---|
| Link chapters… | ToolButton -> dialog | none to open | `EnginePanel.tsx:173` -> `LinkChaptersDialog.tsx` | only here |
| - Track for {chapter} (per chapter) | Select | none (local state) | `LinkChaptersDialog.tsx:226` | |
| - Overwrite items already stamped with a different chapter | Checkbox | none | `LinkChaptersDialog.tsx:243` | |
| - Stamp N items | Button (primary) | `lineIdentityStamp(rows, overwrite)` + `subscribeLineIdentity` | `LinkChaptersDialog.tsx:176` (call `:155`) | only here |
| - Read current stamps | Button | `lineIdentityRead` (+ `lineIdentityState`) | `LinkChaptersDialog.tsx:82` (call `:160`) | only here |
| - Cancel / Close | Button | none | `LinkChaptersDialog.tsx:173` | |
| Prepare chapter render… | ToolButton -> dialog | none to open | `EnginePanel.tsx:174` -> `RenderConfigDialog.tsx` | only here |
| - Output folder | Field | `renderConfigSuggestFolder` (autofill), `renderConfigState`, `subscribeRenderConfig` | `RenderConfigDialog.tsx:62` (`:29`, `:23`) | |
| - Configure (becomes secondary once configured) | Button | `renderConfigConfigure(folder)` | `RenderConfigDialog.tsx:56` (call `:40`) | |
| - Create chapter regions… (inline hand-off) | Button | none (switches tool) | `RenderConfigDialog.tsx:93` | also tool button below |
| - Close | Button | none | `RenderConfigDialog.tsx:53` | |
| Create chapter regions… | ToolButton -> dialog | none to open | `EnginePanel.tsx:175` -> `CreateChapterRegionsDialog.tsx` | |
| - Opening credits track / Closing credits track | Select x2 | none | `CreateChapterRegionsDialog.tsx:146-147` | |
| - Update regions already there | Checkbox | none | `CreateChapterRegionsDialog.tsx:166` | |
| - Create | Button | `chapterRegionsCreate(opening, closing, update)`; preview `chapterRegionsPreview` | `CreateChapterRegionsDialog.tsx:137` (call `:108`) | only place regions are created |
| - Close | Button | none | `CreateChapterRegionsDialog.tsx:132` | |
| Embed chapter tags… | ToolButton -> dialog | none to open | `EnginePanel.tsx:176` -> `ChapterTagsDialog.tsx` | |
| - Combined book MP3 to add chapters to | Field | `chapterTagsPreview` | `ChapterTagsDialog.tsx:103` | |
| - confirm checkbox | Checkbox | none | `ChapterTagsDialog.tsx:111` | |
| - Embed | Button | `chapterTagsEmbed(destPath)` | `ChapterTagsDialog.tsx:71` | only here |
| - Close | Button | none | `ChapterTagsDialog.tsx:68` | |
| Cleanup tools… | ToolButton -> dialog | none to open | `EnginePanel.tsx:177` -> `CleanupToolsDialog.tsx` | |
| - Open Repair Pops/Clicks (key `repair_pops_clicks`, REAPER 7.80 dialog; bridge `launch_cleanup_tool`) | Button `aria-label="Open Repair Pops/Clicks"` | `cleanupToolsLaunch('repair_pops_clicks')`, `cleanupToolsState`, `subscribeCleanupTools` | `CleanupToolsDialog.tsx:11-14 (TOOLS), :84-86`, call `:58` | only here |
| - Open Magnolius DeClick (key `magnolius_declick`; third-party ReaPack script, needs ReaImGui) | Button | `cleanupToolsLaunch('magnolius_declick')` | `CleanupToolsDialog.tsx:18-19, :84-86` | only here |
| - Close | Button | none | `CleanupToolsDialog.tsx:69` | |
| Retakes on lanes… | ToolButton -> dialog | none to open | `EnginePanel.tsx:178` -> `RetakeLanesDialog.tsx` | |
| - Play this lane: lane N for {line} on {track} (per lane) | Button | `retakeLanesPick(lineId, itemGuid)`; `retakeLanesList`, `retakeLanesState`, `subscribeRetakeLanes` | `RetakeLanesDialog.tsx:54-56` (call `:112`) | only here |
| - Close | Button | none | `RetakeLanesDialog.tsx:135` | |

Cleanup launchers: `docs/research/reaper-cleanup-launchers.md` says the Repair Pops/Clicks action text match and all five REAPER checks are still Pending (never run in a real REAPER); if REAPER's action text differs the app says "This REAPER has no Repair Pops/Clicks dialog".

### 1.3 Chapter sync card (`engine/ChapterSyncPanel.tsx`; drawn only when `project==='ready'` and consent decided)

| Action (label) | Kind | Host binding | Component file:line | Also reachable from |
|---|---|---|---|---|
| Turn on / Turn off | Button (card action) | `chapterSyncSetEnabled(on)`; `chapterSyncState`, `subscribeChapterSync` | `ChapterSyncPanel.tsx:83` (call `:72`) | consent dialog (below) |
| Layout row (Flat / Voice folders) when sync is drawn | ToggleGroup `LayoutToggle` | `voiceTracksSetLayout` | `EnginePanel.tsx:187` -> `engine/VoicesCard.tsx:165` | Voices card when sync card is not drawn |
| Needs-you: Track for {chapter} | Select | `chapterSyncPreview` | `ChapterSyncPanel.tsx:167` | |
| Needs-you: Link | Button | `chapterTrackSet(chapterId, guid)` | `ChapterSyncPanel.tsx:173` (call `:108`) | Chapter links table Confirm; Booth/Editing `ChapterLinkDialog`; Production `ChapterTrackPanel` |
| Consent dialog "Sync chapters to tracks?": Not now / Sync N chapters | Dialog (shown from any page when `chapterSync.ask`) | `chapterSyncSetEnabled(false/true)`, `chapterSyncPreview` | `engine/ChapterSyncConsentDialog.tsx:43,46`; mounted `App.tsx:33` import, render near `:1100` | |
| Sync activity log: Undo | Button | `chapterSyncUndo(trackGuid)` | `engine/SyncActivityLog.tsx:45` (call `:29`), shown only in Settings (`settings/controls/SyncActivityBody.tsx`, row `daw.syncActivity`) | Production toast Undo `production/useChapterSyncToast.ts` |

### 1.4 Tracks table, chapter links, voices

| Action (label) | Kind | Host binding | Component file:line | Also reachable from |
|---|---|---|---|---|
| Tracks card: Search tracks | SearchField | none (client filter) | `engine/TrackList.tsx:52` | |
| Open all folders / Close all folders | IconButton x2 | none | `TrackList.tsx:54-55` | |
| Tracks table (Track / Chapter / Playable items; badges Empty, N tracks, Muted; unplayable-item warning) | Read-only Table | `tracksList`, `chapterTrackMapList` via `useChapterLinks.ts:42` | `TrackList.tsx:62`, rows `:80-151` | |
| Chapter links: Track for {chapter} (Choose a track) | TrackSelect | none | `engine/ChapterLinksTable.tsx` (picker, ~`:170`) | Booth/Editing `ChapterLinkDialog.tsx:156` |
| Confirm | Button | `chapterTrackSet` | `ChapterLinksTable.tsx:188` (call `useChapterLinks.ts:76`) | |
| Cancel | Button | none | `ChapterLinksTable.tsx:192` | |
| Change | Button | none | `ChapterLinksTable.tsx:199` | |
| Clear | Button | `chapterTrackUnlink(chapterId)` | `ChapterLinksTable.tsx:202` (call `useChapterLinks.ts:78`) | Production `ChapterTrackPanel` Unlink |
| More actions for {chapter} (menu) | IconButton `moreActions` + Menu | none | `ChapterLinksTable.tsx:207` | |
| - Open in Editing | MenuItem (linked rows) | navigation `/editing/:chapter` | `ChapterLinksTable.tsx:150` | |
| - Open in Proof | MenuItem (linked rows) | navigation `/proof/:chapter` | `ChapterLinksTable.tsx:151` | |
| - Editing check… | MenuItem | `tracksList`, `chapterTrackMapList` (in `EditingCheckPanel`) | `ChapterLinksTable.tsx:154`, panel `editing/EditingCheckPanel.tsx` | Editing page |
| Voices card: Chapter | Select (folders layout) | none | `engine/VoicesCard.tsx:68` | |
| Voices: Chapter layout (Flat / Voice folders) + "What the layouts mean" | ToggleGroup + HelpButton | `voiceTracksSetLayout` (`voiceTracks` port) | `VoicesCard.tsx:165-166` | Chapter sync Layout row |
| Voices table row: edit characters / narrator (popover with Checkbox list) | IconButton `edit` + Popover + Checkbox | `voiceTracksSetCharacters(track, ids)`, `voiceTracksSetNarrator(id)`, `voiceTracksGet` | `VoicesCard.tsx:142` (disabled) / `:160` (popover), Checkbox `:227` area; hook `engine/useVoiceTracks.ts:57-67` | Booth numpad voice keys `booth.voice.0..9`, `.next`, `.prev`, `.list` use the same layout |
| Unmapped-count sentence | Text | `useStageRecommendations` | `EnginePanel.tsx:198-204` | |
| Chapter links: Opening / Closing credits rows | Synthetic rows, same Confirm/Clear | same | `ChapterLinksTable.tsx` (credits rows) | |

No panel controls exist for: refresh/resync of the track list, unlink a REAPER file, start REAPER, create a track.

---

## 2. Companion

Task context: a narrow always-on-top panel beside the DAW that reads the script along while REAPER records, with Full app to return to the Booth. No Settings, Engine panel or doc page of its own; nearest PRD notes: `booth.prd.md`, `master-delivery-and-settings.prd.md` ("Settings for the Companion: out of scope"), guide `docs/guides/using-the-app/booth.md` "Companion mode" (line ~481). Route `/companion` (`App.tsx:997`, `components/booth/companion/CompanionPage.tsx`), no rail item; redirects to `/` with no manuscript (`App.tsx` companion route).

| Action (label) | Kind | Host binding | Component file:line | Also reachable from |
|---|---|---|---|---|
| Open Companion | Jump-menu command / key Mod+Alt+C | none (navigate `/companion`) | catalog `input/commands.catalog.ts:525`; handlers `App.tsx:602, 635` | only these |
| Enter / exit companion window (pin beside DAW) | Mount / unmount effect | `companionModeEnter`, `companionModeExit` | `booth/CompanionShell.tsx:81,84` | |
| Full app | Button | none (navigate back to Booth; also Escape twice) | `CompanionShell.tsx:178` | `booth.exit` key (Escape) |
| Play / Pause | IconButton, key Space (`reading.toggle`) | teleprompter session (listening / `useTeleprompterSession`) | `CompanionShell.tsx:198`; key `:145` | Booth page registers the same id (`booth/page/useBoothPage.ts`) |
| Stop reading | IconButton (danger) | teleprompter session stop | `CompanionShell.tsx:203` | Booth |
| Follow (re-lock scroll to cursor) | Button | none (scroll follow) | `CompanionShell.tsx:216` | |
| Resume prompt: Change / Start from the top / continue | Choices above the script | `teleprompterState`, locate via `companion/companionResume.ts` | `booth/companion/CompanionHost.tsx`, `CompanionPage.tsx:44-49` | Booth `ResumePrompt.tsx` |
| Flag save while reading | background | `teleprompterSaveFlags` | `companion/CompanionHost.tsx:88` | |
| This chapter section (recorded length, stage, reason) | Read-only | `productionOverview` | `booth/CompanionThisChapter.tsx` | Production |
| Pickups section | Read-only | pickups list | `CompanionShell.tsx` (section) | Pickups page |
| Note at playhead | placeholder "Coming soon" | none | `CompanionShell.tsx:267` | |

---

## 3. Settings (`components/settings/page/SettingsPage.tsx`, route `/settings`)

Task context: narrator sets machine-wide and per-project options in 8 categories plus "Set on a page"; searchable; deep-linkable by `#category-<id>` or old anchors.

### 3.1 Page chrome

| Action (label) | Kind | Host binding | Component file:line | Also reachable from |
|---|---|---|---|---|
| Back to {page} | Button | none | `SettingsPage.tsx` (~`:257`) [audit] | shown only when entered by Ctrl+, / category rows / hash link |
| Search settings | SearchField | none (client search over rows) | `SettingsPage.tsx` (~`:264`), `registry/search.ts` | jump menu per-row items (`page/pageItems.ts`) |
| Show: All / Changed / In this project | ToggleGroup | none | `SettingsPage.tsx` [audit :278] | |
| Category nav (8 + Set on a page) | Nav | none | `page/CategoryNav.tsx` | jump menu "Settings: <category>" x8 |
| Retry (settings unreadable) | Button | `settingsForScope` reload | `SettingsPage.tsx` [audit :312] | |
| Reset to defaults (category) | Button | `saveSettings(tool, scope, {key:null})` | `page/CategoryPane.tsx:65` [audit] | |
| Advanced (n) disclosure | Disclosure | none | `CategoryPane.tsx:76` [audit] | |
| Unsaved settings: Save & continue / Discard & continue | ConfirmDialog | `saveSettings` | `App.tsx` (~`:1102-1123`) [audit] | |
| Per row: control, Reset, Override for this project, Use computer setting, Used by {Page}, About (?), costly-change confirm | Row mechanics | `settingsForScope`, `saveSettings(tool, scope, {k:v})` | `row/SettingRowView.tsx`, `row/ValueControl.tsx`, `data/SettingsStore.tsx` | |

### 3.2 Rows (`registry/rows.ts`, 52 rows; id : line = label; scope/host keys from audit unless noted)

| Action (label) | Kind | Host binding | Component file:line | Also reachable from |
|---|---|---|---|---|
| **Recording & DAW** `daw.engine`:44 Record with (REAPER / Audacity / Built-in) | RadioGroup + ConfirmDialog for Built-in | `dawChoice`, `dawChoose` | `controls/EngineBody.tsx:248, 306` | none (only place to switch DAW) |
| - Link {file} (one .rpp found) | Button | `dawLinkFound` | `EngineBody.tsx:268` | third link route |
| - Start {DAW} | Button | `launchDaw` | `EngineBody.tsx:273` | `ReaperOffDialog` Start (`useReaperLaunch`), Audacity card |
| - Get REAPER | Button | `dawCatalogList`, `dawCatalogOpenDownloadPage` | `EngineBody.tsx:278` (calls `:213-215`) | |
| - Choose a project file / Change linked file | Button | `linkDawFile` (shared handler) | `EngineBody.tsx:283` | Engine panel Link file |
| - Test connection / Check again | Button | `dawChoice` | `EngineBody.tsx:288` | |
| - Audacity card | embedded | see 1.1 | `EngineBody.tsx` | Engine panel |
| `daw.mic`:56 Microphone | custom body | `teleprompterReaperInput`, `teleprompterDevices`, `saveSettings(Teleprompter.input_*)` | `controls/MicBody.tsx` | Booth Levels menu |
| `daw.sampleOutput`:70 Voice sample output | Select + Test + Reload | `recorderState`, `saveSettings(VoiceSamples.output_device)` | `controls/SampleOutputBody.tsx` | |
| `daw.startTone`:83 Start tone | Radio Off/On (browser) | localStorage | `controls/TakeToneBody.tsx` | |
| `daw.reaperPath`:95 REAPER program (Adv) | TextField | `saveSettings(DAW.reaper_path)` | `ValueControl` | |
| `daw.autoLauncher`:112 Start launcher script with REAPER | Switch | `saveSettings(DAW.auto_start_launcher)` | `ValueControl` | also written by `connection/startDaw.ts:22` on every Start |
| `daw.capabilities`:127 Capabilities (Adv) | read-only table + Retry | `dawCapabilities` | `controls/CapabilitiesBody.tsx` | |
| `daw.syncActivity`:140 Sync activity (Adv, REAPER only) | log + Undo | `chapterSyncUndo` | `controls/SyncActivityBody.tsx` -> `engine/SyncActivityLog.tsx` | |
| **Speech to text** `stt.model`:156, `stt.live`:175, `stt.liveModel`:189, `stt.cascade`:201, `stt.cascadeFirst`:215, `stt.cascadeRecheck`:228, `stt.pipeline`:242, `stt.workers`:256, `stt.chunk`:271, `stt.background`:295, `stt.backgroundModel`:308, `stt.backgroundRecheck`:322, `stt.backgroundProcessors`:336 | generic controls | `saveSettings(RecordingCoverage.* / TranscriptCompare.model_size / Teleprompter.engine,model)` | `row/ValueControl.tsx` | Booth `useTeleprompterSession.ts`, `recordingcheck/background/BackgroundChecks.tsx` |
| **Voice** `voice.id`:356 Preview voice; `voice.dict`:376 Show definitions from; `voice.pron`:390; `voice.mwKey`:404 Merriam-Webster key (Adv: Save, Test, Remove, Sign up) | controls | `saveSettings(Piper.*, Script.definition_source, ManuscriptGuide.*)`, `pronunciationOnlineLookup('test')`, `...KeyClear`, `...SignUpOpen`, dictionary asset install | `controls/DefinitionsBody.tsx`, `controls/MwKeyBody.tsx` | Script `scriptPageHost.ts` |
| **Models & downloads** (`page/ModelsPane.tsx`): Open folder (`:169`), Retry (`:88`), Download the recommended set, filter All/Speech/Voices/Language/Tools, per-asset download/remove/cancel/repair/retry/dismiss, analysis tools consent | pane | `assetsList`, `assetsInstall`, `assetsInstallState`, `assetsInstallCancel`, `assetsRemove`, `assetsOpenFolder` | `page/ModelsPane.tsx`, `models/AssetRow.tsx`, `settings/analysis/*` | `assets/AssetInstallPrompt.tsx` (other pages) |
| **Delivery** `delivery.profile`:419, `delivery.default`:432, `delivery.custom`:443 (Adv: Duplicate / Edit / Delete, editor Save) | controls | `deliverySelectProfile`, `deliverySaveProfile`, delete | `controls/DeliveryBodies.tsx`, `DeliveryProfilesPanel.tsx`, `DeliveryProfileEditor.tsx` | `delivery/profile/ProfileCard.tsx`, `production/ManuscriptImport.tsx` |
| **Project** `project.manuscript`:458 Manuscript (Replace / Import), `project.wordsPerPage`:470, `project.build`:484, `project.spacy`:497, `project.types`:513 Entry types (colour, speaks, remove, add), `project.bibleData`:524 Delete Story Bible data (Adv), `project.marks`:536 Marks (Edit marks…), `project.narrator`:547, `project.roomTone`:560 (Adv), `project.credits`:574 Credits (templates New/Duplicate/Delete/Save, project values, retail sample), `project.data`:586 Clear derived data… (Adv) | controls | `manuscriptBeginImport/Preview/Commit`, `guideType*`, `guideDeleteAll`, `credits*`, `saveCreditsTemplate`, `clearProjectData`, `saveSettings(...)` | `controls/ProjectBodies.tsx`, `controls/CreditsBody.tsx`, `ManuscriptSection.tsx`, `page/ProjectDataPanel.tsx`, `page/DeleteStoryBibleData.tsx` | Production import, Script marks, `CreditsSetupDialog` |
| **Appearance & keys** `look.theme`:600, `look.motion`:612, `look.waveScrollStep`:624 (new since audit; browser scope), `look.reader`:638, `look.readerSize`:651, `look.readerSpacing`:664, `look.readerWidth`:677, `look.note`:690 | controls | `ThemeContext.setPreference`, localStorage, `saveSettings(Manuscript.color_note)` | `controls/AppearanceBodies.tsx`, `page/ReaderTextPanel.tsx` | rail theme toggle, jump `view.theme`, context View |
| `look.zoom`:702 Zoom (Select + "Reset zoom to 100%") | Select + IconButton | `windowSetZoom`, `windowSaveZoom` | `controls/AppearanceBodies.tsx:179,186` (calls `:166-169`) | zoom keys, jump menu, zoom chip (`hooks/useZoom.ts` is a second implementation) |
| `keys.map`:715 Shortcuts (Change, Reset, Reset all, record dialog Replace / Add / Unbind / Reset / Cancel) | custom | `saveSettings('Keymap','global',{overrides})` | `controls/ShortcutsBody.tsx` -> `KeyboardPanel.tsx` | |
| **App & updates** `app.updates`:729, `app.channel`:742, `app.notify`:754, `app.importClose`:766, `app.debug`:779 (Adv); About + Updates (Check now, Download update, Install and restart, Show downloaded file, Release notes) | controls | `updateCheck`, `updateDownload`, `updateJobState`, `updateJobCancel`, `updateInstall`, `updateShowDownload`, `updateOpenNotes`, `saveSettings` | `controls/AboutSection.tsx`, `UpdatesPanel.tsx`, `UpdateDownloadDialog.tsx` | production import dialog (`app.importClose`) |
| **Set on a page** `ps.coverage`, `ps.cleanup`, `ps.preview`, `ps.stages`, `ps.compare`, `ps.punch`, `ps.fx`, `ps.backups` (registry/pageSettings.ts:20-83); each: scope toggle, Save, Discard, Use computer value, "Open {Page}" | panels | `saveSettings(tool, scope, changed)` | `page/PagesPane.tsx`, `page/ScopedFieldsPanel.tsx` | Booth punch pre-roll, Editing FX favourites / backups, Production/Proof options |
| Project data: Clear derived data… ConfirmDialog | Button | `clearProjectData` | `page/ProjectDataPanel.tsx` | |

Settings anchors for old links: `page/anchors.ts` (`#recording` -> `daw.engine`, `#credits`, `#delivery`, `#cleanup`, `#booth`, `#teleprompter`).

---

## 4. App shell, jump menu, command registry

Task context: moving around and running app-wide actions without a page: rail, header, Ctrl+K jump menu, key shortcuts, history/undo, zoom.

### 4.1 Static catalog commands that appear in the jump menu (`COMMAND_CATALOG`, surfaces include `jumpMenu`; handlers `App.tsx` `shellCommands` and `useCommand`)

| id | Label | Hotkey (default) | Scope | Group | Handler |
|---|---|---|---|---|---|
| nav.back (`commands.catalog.ts:60`) | Back | Alt+Left, BrowserBack, Mod+[ | global (all pages) | Go to | `guardedBack`; reason "No earlier page in this project" |
| nav.forward (:68) | Forward | Alt+Right, BrowserForward, Mod+] | global | Go to | reason "No later page yet" |
| nav.settings (:77) | Open Settings | Mod+, | global | Go to | `openSettings` (`App.tsx:559-561`, `shellCommands` now has it: the audit's "dead row" is fixed) |
| zoom.in (:88) | Zoom in | Mod+=, Mod+Shift+=, Mod+NumpadAdd | global | Zoom | `zoom.zoomIn`; reason "Already at the largest size" |
| zoom.out (:96) | Zoom out | Mod+-, Mod+NumpadSubtract | global | Zoom | reason "Already at the smallest size" |
| zoom.reset (:104) | Reset zoom to 100% | Mod+0, Mod+Numpad0 | global | Zoom | reason "Already 100%" |
| companion.open (:525) | Open Companion | Mod+Alt+C | global | Booth | `guardedNavigate('/companion')` |
| help.shortcuts (:536) | Show keyboard shortcuts | Shift+/ (?) | global | View | opens `ShortcutSheet` |
| history.open (:564) | Open the undo history | Mod+Shift+H | global | View | `openHistoryPanel` |

Catalog rows NOT in the jump menu (keys / help / Settings key list only): jump.open (Mod+K), jump.page (Mod+F, scoped page search), undo.last (Mod+Z; the menu lists the provider "Undo: <label>" instead), and all page/booth-scoped rows: workspace.play/word/paragraph/flag, `editing.*` (extend, phrase, delete, mute, fx, voice-sample, takes, keep, hide-others, strip, drawer, escape, menu, chapter.next/prev), bookmark.here/next/prev, script.search/prep/escape, `storybible.entry.*`, `proof.*` (note, chapter, hear, decide.pickup/edit/waive/defer, escape), `booth.*` (reading.toggle, phrase, word, roll, view, text larger/smaller, voice.0-9, voice.next/prev/list, voice-sample, exit, pickup.next/prev, fullscreen). Full per-row key/scope table: audit `inventory-shell.md` 1.2 (booth.voice.* rows are new since the audit).

### 4.2 Runtime providers always in the menu

| id | Label | Hotkey | Page scope | Source |
|---|---|---|---|---|
| goto.page./ , /schedule, /script, /story-bible, /booth, /editing, /proof, /pickups, /master, /delivery, /settings | Go to {Production, Schedule, Script, Story Bible, Booth, Editing, Proof, Pickups, Master & QC, Delivery, Settings} | none | global; disabled by `navAvailability` without manuscript (Production, Settings never) | `components/layout/useGoToCommands.ts:36-43` (pages from `AppShell.shellPages`) |
| goto.chapter.<id> | Go to {chapter full name} (always lands on Script `/script#c<id>`) | none | global; hidden when the page registers `supersedes:['Chapters']` | `useGoToCommands.ts:44-49` |
| project.switch | Switch project… | none | global | `App.tsx` (~`:572`) |
| settings.category.recording / speech / voice / models / delivery / project / appearance / app | Settings: {Recording & DAW, Speech to text, Voice & pronunciation, Models & downloads, Delivery, Project, Appearance & keys, App & updates} | none | global; group hidden on Settings page | `components/layout/useShellCommands.ts:36-42` |
| manuscript.import | Import manuscript… (disabled when a manuscript exists; only navigates to `/`) | none | global | `useShellCommands.ts:43-49` |
| manuscript.replace | Replace manuscript… (disabled when none; opens Settings > Project) | none | global | `useShellCommands.ts:50-57` |
| view.theme | Toggle dark theme (hint dark/light now) | none | global | `useShellCommands.ts:58` |
| zoom.set.100 / 110 / 125 / 150 / 175 / 200 (from `hooks/useZoom.ts ZOOM_STEPS`; verify list there) | Set zoom to N% (disabled at current) | none | global | `useShellCommands.ts:59-69` |
| undo.labelled | Undo: {newest journal label} / Undo (disabled "Nothing to undo") | Ctrl Z hint | global | `useShellCommands.ts:70-77` |

### 4.3 Page-scoped jump-menu items ("On this page"; mounted only on that page) [audit, files exist, not re-read]

| Page (registration file) | Items |
|---|---|
| Production (`production/useProductionPageCommands.ts`) | Import manuscript (no manuscript), Chapters: {chapter}, Check recordings, Read the stage suggestions again, Export status report, Start session, Stop timer |
| Script (`script/page/registry/useScriptRegistry.ts`) | Next/Previous match, Clear the search, Chapters, Story Bible entries, "Mark the selection as {type}"; search sources manuscript / marks / words |
| Story Bible (`storybible/Guide.tsx`) | Entries: {entry} |
| Editing (`editing/page/useEditingPageCommands.ts`, `editing/keys/useEditingKeys.ts` `.menu` rows) | Chapters, Delete / Mute / Add FX, Check the recording of this chapter, Open {tab} in the drawer, Next/Previous chapter, Play from the cursor or selection, Mark as voice sample, Next/Previous flagged word, timeline, Keep take, Hide other takes, stack retries |
| Booth (`booth/page/useBoothPageCommands.ts`, `useBoothFind.ts`) | Chapters, Record/Stop recording, Punch and roll, Next/Back phrase, cold read, Next/Previous pickup, Leave the Booth, find rows |
| Proof (`proof/useProofPageCommands.ts`, `useProofKeys.ts`) | All chapters / {chapter}, Needs pickup / Fix in edit / Fine as read / Defer, Check recordings, Next/Previous chapter, `options.open.*` |
| Pickups (`pickups/usePickupsPageCommands.ts`) | {pickup}, Show every chapter / Show only {chapter}, Check recordings, Open N in Booth, **Add N as markers in {DAW}** (`:84`) |
| Settings (`settings/page/SettingsPage.tsx` via `pageItems.ts`) | category + `row.<id>` items (REAPER-only rows disabled for other DAWs) |
| Master, Delivery, Schedule | none |
| Bookmarks (`script/bookmarks/model/useBookmarkCommands.ts`) | Bookmark here, Next/Previous bookmark, `bookmark.go.<id>`; search source Bookmarks |

No jump-menu command exists for: open the engine panel, link DAW file, link chapters, check DAW connection, create regions, show in DAW, add marker (only Pickups), refresh DAW.

### 4.4 Shell chrome (components/layout/AppShell.tsx and friends)

| Action (label) | Kind | Host binding | Component file:line | Also reachable from |
|---|---|---|---|---|
| Skip to content | link | none | `AppShell.tsx:193` [audit] | |
| Rail items: Production, Schedule, Script, Story Bible, Booth, Editing, Proof (count), Pickups (count), Master & QC (count), Delivery | NavButton | none (`useNavCounts`: `findingsSummary`, `pickupsList`, `measureState`, `subscribePickups`) | `AppShell.tsx:23-38`, badges `useNavCounts.ts` | jump "Go to", context menu Go to |
| Rail foot: Dark/Light theme, Settings | buttons | none | `AppShell.tsx:264,268` [audit] | jump `view.theme`, Ctrl+, |
| Header: Open navigation (hamburger <860 px) | IconButton | none | `AppShell.tsx:309` [audit] | |
| Header: {project name}, switch project | Button | `projectRecents` etc. via ProjectPicker | `AppShell.tsx:324` [audit] | jump "Switch project…" |
| Header: Zoom N% chip (only when not 100%) | HeaderChip | none (opens jump menu at Zoom group) | `AppShell.tsx:337-341` | zoom keys, Settings `look.zoom` |
| Header: Jump to or run… (Ctrl K) | Button | none | `AppShell.tsx:346` [audit] | Ctrl+K, Ctrl+F |
| Header: engine chip | HeaderChip | none (opens engine panel) | `components/layout/EngineChip.tsx:86` (`onClick={onOpenEnginePanel}`); inert "Built-in: Recording happens in the app" group `EngineChip.tsx:51` | `EnginePanelLink` in 7 files (see section 1) |
| Right-click on empty main: Go to > pages, Jump menu…, Search this page, View > Zoom in / Zoom out / Reset zoom / theme | context menu | none | `App.tsx` contextMenu fallback (~`:655-720`) | |
| History slide-over: row Undo | Button | journal undo | `components/layout/HistoryPanel.tsx:58` | history.open, Ctrl+Z |
| Shortcut sheet: Show all shortcuts | Button | none (navigates `/settings`) | `components/help/ShortcutSheet.tsx` | `?` |
| Project picker: Back, Browse, New project, Open {recent}, Open running {DAW project}, Pin, Remove | dialogs | `selectProjectFolder`, `switchProject`, `createProject`, `projectRunningDaw`, `setProjectPinned`, `removeRecentProject`, `projectDefaultLocation` | `components/project/ProjectPicker.tsx`, `NewProjectDialog.tsx` | |
| Startup screen Retry connection / Copy details; Load error Retry; Not found; Bad address; NeedManuscript Import | misc | `ready`, `bootstrap` | `components/layout/StartupScreen.tsx`, `LoadError.tsx`, `NotFoundPage.tsx`, `NeedManuscript.tsx` | |

---

## 5. Connection dialogs (`components/connection`)

Task context: a page found the DAW off, not linked, or the chapter not tied to a track; the dialog says what is wrong and offers the way out.

| Action (label) | Kind | Host binding | Component file:line | Also reachable from |
|---|---|---|---|---|
| ConnectionIndicator chip ("Not linked to a track" / "{DAW} not connected" / "Linked to several tracks") | HeaderChip | none (reopens dialog) | `connection/ConnectionIndicator.tsx:10` | Booth `RecordSetup.tsx`, `ChapterLinkNotice.tsx`, `editing/EditingPage.tsx`, `editing/page/useChapterLink.tsx`, `production/pipeline/DawIndicator.tsx` |
| ReaperOffDialog primary: Start {DAW} (Booth: Open in REAPER and connect) / Connecting… | Dialog action | `saveSettings('DAW','global',{auto_start_launcher:'true'})`, `launchDaw`, poll `dawCapabilities` ~10 s | `connection/ReaperOffDialog.tsx:122`; logic `connection/startDaw.ts:16-22` | Settings `EngineBody.tsx:273` (no save / poll) |
| ReaperOffDialog secondary: Check again | Dialog action | page-supplied (Booth `control.checkAgain`, Editing `daw.retry`, Production `checkDaw`) | `ReaperOffDialog.tsx:127` | |
| Link in Settings | link Button (only if `onLink`) | navigate Settings | `ReaperOffDialog.tsx:135` | Booth passes it; Editing and Production do not |
| ChapterLinkDialog: Track for {chapter} | TrackSelect | `chapterTrackMatch`, `chapterTrackMapList` | `connection/ChapterLinkDialog.tsx:156` | Engine table picker |
| - Link track | primary | `chapterTrackSet` | `ChapterLinkDialog.tsx:16` (label spec), handler `:90` | |
| - Create a new track | Button | `chapterTrackCreate(chapterId)` | `ChapterLinkDialog.tsx:5, :40-45` | only place a track can be created |
| - Check again | secondary | re-match | `ChapterLinkDialog.tsx:17` | |
| Link DAW file helper | context hook | `linkDawFile` | `connection/linkDawFile.tsx:19-40` (`App.tsx:330` provides the shared guarded version) | |
| ResolveShell frame (header X, primary, secondary) | shell | none | `connection/ResolveShell.tsx:35` | |

---

## 6. Other DAW-side actions found elsewhere in the UI (show / open / markers / sync / refresh)

| Action (label) | Kind | Host binding | Component file:line | Also reachable from |
|---|---|---|---|---|
| Show in the DAW (Editing passage menu) | IconButton `showInReaper` | `workspaceGoTo(chapterId, firstToken)` | `editing/takes/useShowInDaw.tsx:44` | |
| Show in {DAW} (Editing effect inspector) | IconButton | same pattern | `editing/effects/EffectInspector.tsx:47` | |
| Show in {DAW} (Proof inspector) | IconButton | `findingsGoTo(id)` | `proof/inspector/InspectorActions.tsx:128` (call `:102`) | Proof key handler `proof/useProofKeys.ts:13` presses it |
| Add marker in {DAW} (Proof inspector) | IconButton `addMarker` | `daw.addMarker(findingId)` (ports/daw.ts) | `InspectorActions.tsx:136` (call `:113`) | |
| Add N as markers in {DAW} (Pickups session) | IconButton | `daw.addPickupMarkers(...)` then `pickupsList` | `pickups/list/SessionPanel.tsx:123`; handler `pickups/PickupsPage.tsx:271` | jump command `pickups/usePickupsPageCommands.ts:84` |
| Open in {DAW} (Master & QC file check) | IconButton `openInReaper` | `masterOpenInDaw(fileId)` | `masterqc/files/FileChecks.tsx:33` (handler `masterqc/page/useFileActions.ts:33`) | FilesTable context menu `masterqc/files/FilesTable.tsx:192` |
| Play the quietest 5 s (Master & QC) | IconButton | `masterPlayQuietest` | `masterqc/files/FileChecks.tsx:30`; `useFileActions.ts:32` | FilesTable menu `:186` |
| Move DAW to chapter (Booth follow) | automatic | `dawPlace`, `dawGoToChapter` | `booth/page/useDawFollow.ts:40,97` | |
| Editing transport follow | automatic | `dawTransportSync('watch'/'play'/'cursor'/'stop')` | `editing/follow/useDawTransportSync.ts` | |
| Check again variants | buttons | various | Editing ProjectFx `editing/effects/ProjectFx.tsx:41` (`session.refreshFx`), ChooseInDaw `editing/effects/ChooseInDaw.tsx:82`, Editing output `editing/output/OutputControls.tsx:69`, Booth Levels `booth/frame/LevelsMenu.tsx:346`, Booth toast `booth/page/BoothNextPage.tsx:563`, Delivery `delivery/profile/ProfileCard.tsx:90,160`, recording check `recordingcheck/CheckRecordingsDialog.tsx:343`, Editing check `editing/EditingCheckPanel.tsx:427` | |

Not found anywhere in the UI: "resync", "refresh tracks", a generic "Open in DAW" for a chapter, a regions/markers viewer, REAPER unlink. Only region/marker creators are Engine "Create chapter regions…", Proof "Add marker", Pickups "Add N as markers". `dawRevealFile` / `dawPreviewFileRange` have zero UI call sites (audit list of 44 unused bindings; not re-counted).

---

## Duplicates / near-duplicates noticed

1. `linkDawFile` / link the REAPER project: Engine panel (`EnginePanel.tsx:243,268`), Settings (`EngineBody.tsx:283`), connection helper (`connection/linkDawFile.tsx`, `App.tsx:330` guarded), Booth `RecordSetup.tsx` own handler; plus Settings "Link {file}" via a different binding (`dawLinkFound`, `EngineBody.tsx:268`). Three labels: "Link file…/Change file…", "Choose a project file/Change linked file", "Link the open project…".
2. "Check again" for the DAW: Engine (`bootstrap`), Settings Test connection (`dawChoice`), Audacity (`audacityLinkCheck`), ReaperOffDialog (per-page callbacks), ChapterLinkDialog (matcher) -- four state sources.
3. Start the DAW: `connection/startDaw.ts` (saves launcher setting, polls), Settings `EngineBody.tsx:273`, `AudacityLinkCard.tsx:99` (all `launchDaw`, different side effects and labels).
4. `chapterTrackSet` (set a chapter's track): Engine table Confirm, Chapter sync Needs-you Link, `ChapterLinkDialog` (Booth/Editing), Production `ChapterTrackPanel`. `chapterTrackUnlink`: Engine Clear and Production Unlink.
5. "Link chapters…" (stamps via `lineIdentityStamp`) vs "Chapter links" table (mapping via `chapterTrackSet`): same word, different stores, no reconciliation (audit section 3.1).
6. Layout switch (`voiceTracksSetLayout`): Chapter sync Layout row and Voices card (`VoicesCard.tsx:165`), one rendered at a time via `layoutInSync`.
7. `chapterSyncSetEnabled`: panel toggle (`ChapterSyncPanel.tsx:72`) and consent dialog. `chapterSyncUndo`: Settings log and Production toast.
8. Zoom: `hooks/useZoom.ts` (keys, jump rows, chip, context menu, debounced save) vs Settings `ZoomRowBody` (`AppearanceBodies.tsx:166`, immediate save, own steps list).
9. Theme toggle: rail foot, jump `view.theme`, context View, Settings radio (all `ThemeContext`).
10. "Show in {DAW}": three components, two host calls (`workspaceGoTo` for Editing x2, `findingsGoTo` for Proof); labels "Show in the DAW" vs "Show in {dawName}". "Open in {DAW}" (Master) is a separate `masterOpenInDaw`.
11. Add markers: Proof inspector (one finding) vs Pickups session (many) -- both `daw.addMarker*` ports with different payloads.
12. Open Settings: Ctrl+, / "Open Settings" row (marks origin) vs "Go to Settings" provider row (`goto.page./settings`, no Back target) vs rail button.
13. Import manuscript: shell row "Import manuscript…" only navigates; Production page row "Import manuscript" opens the dialog (two same-named rows on an empty Production).
14. Two toast queues (App `notify` and overlay) still used side by side; Companion `reading.toggle` registered by both Booth page and `CompanionShell.tsx:145`; `booth.exit` has several registrants.

## Audit drift (code differs from `inventory-engine-settings.md` / `inventory-shell.md`)

- EnginePanel grew a Voices card, Layout toggle, `TrackList` component (search, open/close all folders) and `useChapterLinks` shared reader; the old line numbers in the audit (e.g. ToolButtons :196-201) are now `:173-178`. Panel prop doc still says "also used by an import" but no code does that.
- `nav.settings` jump row now works (`shellCommands['nav.settings']`); the audit's "dead row" finding is stale. `undo.last` is no longer a jump-menu catalog row (provider only).
- New catalog rows since the audit: `booth.voice.0-9`, `booth.voice.next/prev/list`; new Settings row `look.waveScrollStep`, so later Appearance/App row lines moved by +2..+13.
- Nav `dawFile` precondition and "no jump command for the engine panel" claims: the second still holds (verified by grep of `commands.catalog.ts` and `useShellCommands.ts`).
