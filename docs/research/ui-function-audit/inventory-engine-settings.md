# UI function inventory: Engine panel, connection, project, assets, devtools, Settings

Built from code on branch `claude/ui-function-audit` (2026-10-29). Paths relative to `src/studio/ui/src/` unless prefixed. `usePort(x)` and `useApi()` resolve to the same `NarrationApi` object (`ports/usePort.tsx:30-41`); only `daw/measurements/alignment/takes` get a wrapping client. "Host call" = `api.*` in `api/wailsClient.ts` (Go binding in `src/studio/desktop/bindings*.go`). Line numbers are the line of the control/handler. Guides (`docs/guides/using-the-app/navigation.md`, `settings.md`) used only as cross-check.

## 0. Entry points and shared state

| Entry | File:line | Behaviour |
|---|---|---|
| Header engine chip (`EngineChip`) | `components/layout/EngineChip.tsx:92-118`, `AppShell.tsx:365-373` | `onOpenEnginePanel` -> `setEnginePanelOpen(true)` (`App.tsx:242`). Label/dot from bootstrap `dawFileLinked/dawReachable/dawProjectMatches` (or `AudacityLink` for Audacity). Hidden when `engine==='builtin'` (inert "Built-in" chip, :74-83). |
| `EnginePanelLink` ("Open the audio engine panel") | `engine/EnginePanelContext.tsx:17`; used `proof/ProofChapterPage.tsx:183`, `proof/checkcard/CheckCard.tsx:247`, `editing/EditingCheckPanel.tsx:82,390`, `stages/StageEvidence.tsx:229` | same opener |
| Retired `/tracks` route | `engine/RetiredTracksRoute.tsx:12-14` | opens panel, redirects to `/proof` (loses the page the user was on). Still linked from `booth/ResumePrompt.tsx:264,374`, `recordingcheck/CheckResult.tsx:178`, `production/recordingCheckText.ts:61-63`. |
| Jump menu / commands | `input/commands.catalog.ts:77` (`nav.settings`, Ctrl+,), `layout/useShellCommands.ts:37-41` (Settings: <category> x8), `:44-56` (Import/Replace manuscript), `:58` theme, `:62-67` zoom, `App.tsx:561` ("Switch project…"), `layout/useGoToCommands.ts:38` | **No jump-menu command exists for: open engine panel, link DAW file, link chapters, check DAW connection.** |
| Nav rail foot | `AppShell.tsx:260-269` | Theme toggle + Settings. `NAV_PRECONDITIONS` (`navigation/navAvailability.ts:14-26`) defines a `dawFile` precondition that **no page uses** (dead; `dawFileLinked` is still threaded into `shellPages`/`gateFor`). |
| Booth | `AppShell.tsx:249-258` | Booth (with manuscript) draws **no header**, so no engine chip / zoom chip there; Booth has its own `SetupChip`/`NoticeChip` (`booth/record/RecordSetup.tsx:97-105`). |
| Engine panel mounting | `App.tsx:1068-1080` | `link` prop: `dawFileLinked/dawReachable/dawProjectMatches` from `bootstrap`, `checkedAt=dataReadAt`, `onCheckAgain=refreshBootstrap`, `onLinkDawFile=linkDawFile`, `linkingDawFile=dawLink.isBusy`. Panel closes on any path change except from `/tracks` (`App.tsx:244-252`). |
| Shared "link DAW file" | `App.tsx:316-341` `linkDawFile` | `usePendingAction('link-daw')` -> `api.linkDawFile()` (`wailsClient.ts:642` -> `ProjectLinkDawFile`) -> `refreshBootstrap()` -> toast `REAPER project linked.` / `… {note}` / error. Called by Engine panel x2 and Settings; **not** by Booth (see §2). |
| Bootstrap re-read triggers | `App.tsx:277-312` | on DAW caps change (REAPER only), `subscribeAudacityLink`, window focus (>=2 s). One snapshot (`data.dawFileLinked/dawReachable/dawProjectMatches/daw`) feeds chip, Engine panel, Settings, nav. |

## 1. Pages and dialogs

### 1.1 Engine panel (`components/engine/EnginePanel.tsx`) - SlideOver "Audio engine" (:63), close "Close the engine panel"

Reads on open: `manuscriptChapters` (:94-108), `chapterTrackMapList` (:110-124, rerun on `refresh`), `tracksDiscover` (:126-139), `tracksList` (:141-158), `useAudacityLink` (:73). `refresh` counter bumped by sync panel / table via `onChanged`. `useStageRecommendations` (:89) only to count unmapped chapters (:90-92).

| Control | Label / icon / tooltip | File:line | Handler -> host call / state | Notes |
|---|---|---|---|---|
| Link / Change file | "Link file…" / "Change file…" (secondary Button, card action) | EnginePanel.tsx:250 | `link.onLinkDawFile` -> `App.linkDawFile` -> `api.linkDawFile` + `refreshBootstrap` | Hidden while `picking` (>1 .rpp candidates, no selection) :243. Label keyed to bootstrap `dawFileLinked`, not to `discovery.selected`. |
| Link the open project… | warn InsetCard button | :275 | same `onLinkDawFile` | Shown when `dawFileLinked && dawReachable && !dawProjectMatches` (:241). |
| Check again | button in mismatch card | :278 | `link.onCheckAgain` -> `refreshBootstrap` (bootstrap snapshot) | `CheckLine` shows `checkedAt` (`dataReadAt`). Different implementation from Settings "Test connection" (dawChoice) and Booth/Editing/Production dialogs. |
| .rpp picker row | row button, text "Use" | :307 | `selectRpp` (:160) -> `api.tracksSelect(path)` -> `setDiscovery` | Only when `candidates.length>1 && !selected`. Selecting here does **not** call `linkDawFile`; "selected for reading" and "linked" are separate state (comment :237-239). |
| Audacity card (replaces project section) | `AudacityLinkCard` | :175; card file below | see 1.2 | `forAudacity = audacity.link?.chosen` (:74). |
| Link chapters… | ToolButton in "REAPER tools" | :196 | `setTool('link-chapters')` -> `LinkChaptersDialog` (:227) | Shown only if `chapters.length>0` AND `hasTracks` AND `!forAudacity`. See §1.3 and §2.2. |
| Prepare chapter render… | ToolButton | :197 | `RenderConfigDialog` (:228) | |
| Create chapter regions… | ToolButton | :198 | `CreateChapterRegionsDialog` (:229) | |
| Embed chapter tags… | ToolButton | :199 | `ChapterTagsDialog` (:230) | |
| Cleanup tools… | ToolButton | :200 | `CleanupToolsDialog` (:231) | |
| Retakes on lanes… | ToolButton | :201 | `RetakeLanesDialog` (:232) | Guide text says tools card is under the project; Audacity gets none of these. |
| Chapter sync card | `ChapterSyncPanel` | :206 | see 1.4 | `onChanged` bumps `refresh`. |
| Tracks table (read-only) | "Tracks": Track / Chapter / Playable items | :336-381 | props `tracks` (tracksList) + `mappings` (chapterTrackMapList) | Chapter cell = chapterTitle(s) where `mapping.trackGuid===track.guid`, else muted "Not linked" (:362). Mapping to a *missing* track shows nowhere here. Warning icon on unplayable item (:367). |
| Unmapped-count line | text | :219-225 | `stages.state.byChapter` causes `unmapped_track/unconfirmed_mapping` | third source of "linked" truth (stage recommendations). |
| Error line | `role=alert` | :186 | `tracksDiscover/tracksList/tracksSelect` rejection | |
| Chapter links table | `ChapterLinksTable` | :226 | see 1.5 | Only rendered when `project` loaded. |

### 1.2 `AudacityLinkCard` (`engine/AudacityLinkCard.tsx`, also embedded in Settings `EngineBody.tsx:259`) - `useAudacityLink` (`engine/useAudacityLink.ts`)

State: `port.audacityLink()` on mount, `subscribeAudacityLink`, re-read on window focus (:41-55); `check` -> `audacityLinkCheck`.

| Control | Label | File:line | Handler -> host | Notes |
|---|---|---|---|---|
| Start Audacity | primary sm; "Starting Audacity…" | AudacityLinkCard.tsx:92-102 (only if `link.action==='launch'`) | `project.launchDaw()` then toast | no polling/caps wait, no settings save (unlike `useReaperLaunch`) |
| Turn on scripting | primary sm | :107 | `port.audacityEnableModule()` | |
| Link the open Audacity project | primary sm | :112 (`state==='answering' && openProject!=='linked'`) | `port.audacityLinkOpenProject()` | |
| Choose / Change Audacity project file | secondary sm | :116 | `port.audacityLinkFile()` | **Different binding from REAPER `linkDawFile`**; label differs ("Choose Audacity project file" vs "Link file…"/"Choose a project file"). |
| Unlink | secondary sm | :120 (`link.linked`) | `port.audacityUnlink()` | Only Audacity has an unlink; REAPER has none anywhere. |
| Check again / "Checking…" | secondary sm | :124 | `check()` -> `audacityLinkCheck` | |
| "Set up Audacity" disclosure | `<details>` | :80 | steps from host | |

### 1.3 `LinkChaptersDialog` (`engine/LinkChaptersDialog.tsx`) - "Link chapters to REAPER"

| Control | Label | File:line | Handler -> host / state | Notes |
|---|---|---|---|---|
| Track select per chapter | "Track for {chapter}" (options "Not linked" + all tracks) | :239 | `setMapping` (local state **initial `{}`**, :132) | Does not read `chapterTrackMapList`, `chapterTrackLinks` or `lineIdentityRead`. Chapters = unfiltered `manuscriptChapters` (reference chapters included; credits excluded). |
| "To stamp" cell | count | :247 | `track.items.length` | |
| Overwrite checkbox | "Overwrite items already stamped with a different chapter" | :255 | `overwrite` local | |
| Stamp N items | primary; label `Stamp ${preview.length} item(s)` | :193 | `approve` (:164) -> `api.lineIdentityStamp(rows, overwrite)` (`LinkChaptersDialog.tsx:168`; Go `bindings_lineidentity.go:23`, `internal/lineidentity`) | rows = `{itemGuid, lineId: chapter.id, text: chapter.title}` for every item on the chosen track (:42-63). Writes REAPER item P_EXT stamps via bridge `stamp_item_lines`. **Writes nothing to the chapter->track map.** Disabled when `preview.length===0`. |
| Cancel / Close | secondary; "Close" after `applied>0` | :190 | `onClose` | Dismiss blocked while `running`. |
| Read current stamps | secondary, SectionLabel "Currently stamped in REAPER" | :94 | `read` (:174) -> `api.lineIdentityRead()`; results arrive via `subscribeLineIdentity` (:147) + `lineIdentityState()` hydrate (:149) | Per-line status badge (OK / drift / stale-source / removed / unrecognized / unknown, :15-31). |
| Result toasts | `ToolResult` blocks | :200-219 | state.stamp.missing / conflicts | not app toasts; inline |

Nothing else in the UI reads `lineIdentity*` (grep `\.lineIdentity` -> only this file + wailsClient/mock). Go consumers of the stamps: `internal/pickups`, `internal/preview/audiomapper.go`, `internal/recording/identity.go` (compose/parse the same line-id scheme).

### 1.4 `ChapterSyncPanel` (`engine/ChapterSyncPanel.tsx`) + consent dialog + activity log

State: `useChapterSync(api)` (`hooks/useChapterSync.ts:9-30`: `chapterSyncState()` seed + `subscribeChapterSync` event `chaptersync:state`). Rendered only if `state.project==='ready' && consent!=='undecided'` (:47).

| Control | Label | File:line | Handler -> host | Notes |
|---|---|---|---|---|
| Turn on / Turn off | secondary, card action | ChapterSyncPanel.tsx:62-66 | `toggle` (:49) -> `api.chapterSyncSetEnabled(on)` -> `onChanged` | Same call as consent dialog (App.tsx:1092,1096) |
| Needs-you Select | "Track for {chapter}" | :141 | local `picked` | candidates from `chapterSyncPreview()` (:37) |
| Link | primary | :147 | `link` (:78) -> `api.chapterTrackSet(chapterId, guid)` + toast "Track linked." + `loadPreview` + `onChanged` | Same binding as table Confirm and Booth/Editing dialog. |
| "Links" fact | text `N linked automatically, M by you` | :97-103 -> `chapterSyncText.ts:101-123` | **`state.counts.linked`/`state.chapters[].origin`** from host `chapterSyncState` | A fourth count source (§2.2). |
| Consent dialog "Sync chapters to tracks?" | `Not now` / `Sync N chapters` | `ChapterSyncConsentDialog.tsx:43,46`; mounted `App.tsx:1084-1098` when `chapterSync.ask` | `chapterSyncSetEnabled(false/true)`; preview via `chapterSyncPreview` (App.tsx:220) | Fires from any page after any link path. Says "turn on or off later in the audio engine panel (the {DAW} chip)". |
| Sync activity log + Undo | "Undo" link button, aria "Undo: {text}" | `SyncActivityLog.tsx:45` (handler :26) | `port.chapterSyncUndo(trackGuid)`; toast "Link undone. Sync will not make it again." | **Lives only in Settings** (`rows.ts:140` `daw.syncActivity`, Advanced, `needs:'reaper'`). Also `production/useChapterSyncToast.ts:45` undoes via `api.chapterSyncUndo` from a toast action. |

### 1.5 `ChapterLinksTable` (`engine/ChapterLinksTable.tsx`) - Panel "Chapter links"

Own reads: `manuscriptChapters` + `chapterTrackMapList` (:53-57, rerun on `refreshKey`); credits rows via `useCreditsRows` (:96). Rows from `chapterTrackRows` (`chapterTrackRows.ts:18-31`): reference chapters filtered out (:26); state `linked` if mapping's `trackGuid` is in the current `tracks`, `missing_track` if not, `unlinked` if none; **only the first mapping per chapter** (:17-23).

| Control | Label | File:line | Handler -> host | Notes |
|---|---|---|---|---|
| Track picker | `TrackSelect` "Track for {short}" ("Choose a track" first) | :223 | local `chosen`; choices `plainTrackChoices(tracks, mappings, id)` marks track held by another chapter | |
| Confirm | primary when chosen | :243 | `confirm` (:73) -> `api.chapterTrackSet` -> `reload` -> `onChanged` | |
| Cancel | secondary (only when already linked) | :247 | `setPicking(false)` | |
| Change | secondary | :254 | `setPicking(true)` | |
| Clear | secondary | :257 | `clear` (:85) -> `api.chapterTrackUnlink(chapterId)` | removes all links the chapter holds |
| More actions (⋯ IconButton `moreActions`, "More actions for {short}") | menu | :262 | `Menu` items :200-210 | |
| - Open in Editing | menu item (linked, non-credits) | :203 | `navigate(addressPath({page:'editing',chapter}))` | |
| - Open in Proof | menu item | :204 | `navigate('/proof/<id>')` | |
| - Editing check… | menu item | :210 | `setEditingChecking` -> `EditingCheckPanel` (:150-160, "Back to the audio engine") | uses `tracksList` + `chapterTrackMapList` (EditingCheckPanel.tsx:72,324) |
| Status badge | Linked / Not linked / Track missing | STATE_BADGE :22-26 | derived | |
| Opening/Closing credits rows | synthetic chapters | :98-106 | same set/unlink bindings | not in dialog's mapping list |

### 1.6 Other Engine dialogs

| Dialog | File:line | Controls -> host |
|---|---|---|
| Prepare chapter render | `RenderConfigDialog.tsx:44-100` | Field "Output folder" (:62); Configure (:56) -> `renderConfigConfigure(folder)`; autofill `renderConfigSuggestFolder` (:29); `renderConfigState` + `subscribeRenderConfig` (:23); Close (:53); inline secondary "Create chapter regions…" (:93) -> `onCreateRegions` |
| Create chapter regions | `CreateChapterRegionsDialog.tsx:123-232` | Selects "Opening credits track"/"Closing credits track" (:146-147); Checkbox update (:166); Create (:137) -> `chapterRegionsCreate(opening, closing, update)`; preview `chapterRegionsPreview` (:84-96; again after create :108); Close (:132). Plan is built from **track map links**, not stamps |
| Embed chapter tags | `ChapterTagsDialog.tsx:59-129` | Field "Combined book MP3 to add chapters to" (:104); Checkbox confirm (:111); Embed (:71) -> `chapterTagsEmbed(destPath)`; preview `chapterTagsPreview` (:32); Close (:68) |
| Cleanup tools | `CleanupToolsDialog.tsx:62-101` | per tool "Open {label}" Button (:84-87): `repair_pops_clicks`, `magnolius_declick` -> `cleanupToolsLaunch(key)`; `cleanupToolsState` + `subscribeCleanupTools`; Close (:69) |
| Retakes on lanes | `RetakeLanesDialog.tsx:128-173` | per lane "Play this lane: …" Button (:54-57) -> `retakeLanesPick(lineId, itemGuid)` (:112); `retakeLanesList`, `retakeLanesState`, `subscribeRetakeLanes` (:90); Close (:135). "Retakes on lanes" is also how guide ties lane lines to "the manuscript (linked with Link chapters…)" i.e. depends on stamps |

### 1.7 Connection dialogs (`components/connection`)

| Control | Label | File:line | Handler -> host | Notes |
|---|---|---|---|---|
| `ConnectionIndicator` chip | `{label}` ("Not linked to a track", "{DAW} not connected", "Linked to several tracks"), tooltip "Show what is wrong and how to fix it" | `ConnectionIndicator.tsx:7-14` | `onOpen` reopens dialog | used `booth/record/RecordSetup.tsx:103`, `ChapterLinkNotice.tsx:45`, `editing/EditingPage.tsx:161`, `editing/page/useChapterLink.tsx:33`, `production/pipeline/DawIndicator.tsx:16` |
| `ResolveShell` | primary + secondary "Check again"; header X; outside press closes | `ResolveShell.tsx:36-62` | | frame of both dialogs |
| ReaperOff primary | `Start {name}` / startLabel (Booth: "Open in REAPER and connect") / "Connecting…" | `ReaperOffDialog.tsx:121-126` | `useReaperLaunch.start` (`useReaperLaunch.ts:214`): `system.saveSettings('DAW','global',{auto_start_launcher:'true'})` (:223) -> `project.launchDaw()` (:224) -> poll `daw.capabilities()` x10 @1 s (:236) | disabled while unlinked (`linked` prop or `dawChoice().state==='not_linked'`) |
| ReaperOff secondary | "Check again" | :127 | page-supplied `onCheckAgain` (Booth `control.checkAgain` BoothNextPage.tsx:778; Editing `daw.retry` EditingPage.tsx:176; Production `checkDaw` ProductionPage.tsx:370) | each page has its own check |
| "Link in Settings" | link Button | :135 | `onLink` prop (Booth passes `onSettings`; **Editing and Production pass none -> text "Link the project file first." with no action**) | |
| ChapterLinkDialog | title "{chapter} is not linked to a track" / "…’s track is not in the project" / "…linked to more than one track" | `ChapterLinkDialog.tsx:130-134` | | used by Booth `ChapterLinkNotice.tsx:47` and Editing `useChapterLink.tsx:35` |
| - Track select | `TrackSelect` "Track for {chapter}" | :156 | `chapterTrackMatch(id)` + `chapterTrackMapList()` (:61-62) | preselects matcher best match |
| - Link track | primary | :140 (`link` :90) | `trackMap.chapterTrackSet(id, guid)` | |
| - Create a new track | primary when no tracks, else secondary sm | :129,164-172 (`createTrack` :107) | `trackMap.chapterTrackCreate(id)` (host adds track in DAW + links) | **Only place a track can be created**; not offered in Engine table / Production panel. |
| - Check again | secondary | :141 | re-run match; `onCheckedAgain` | |

### 1.8 Project (`components/project`)

| Control | Label | File:line | Handler -> host |
|---|---|---|---|
| Header project name (button, tooltip "Switch project") | | `AppShell.tsx:322-333` | `onSwitchProject` -> `setProjectPickerOpen(true)` (App.tsx:872) |
| Jump menu "Switch project…" | | `App.tsx:561` | same |
| Back | "Back to {project}" | `ProjectPicker.tsx:209` | `onBack` |
| Browse… | secondary | :223 | `selectProjectFolder()` (:186) -> `switchProject(path)` |
| New project | primary | :226, :268 (empty state) | opens `NewProjectDialog` |
| Open running {DAW project} | button | :245-248 | `projectRunningDaw()` banner -> `switchProject` |
| Open {recent} | secondary per row | :311 | `switchProject(path, name)` (:99) |
| Pin / Unpin | IconButton | :314-320 | `setProjectPinned(path, !pinned)` (:111) |
| Remove from recents | IconButton | :322-328 | deferred `removeRecentProject` (:139) + toast action "Undo" (:181) |
| NewProjectDialog | Name Field (:98), Change location (:107) -> `selectProjectFolder`, Cancel (:77), Create (:80) -> `createProject(parent, name)` (:58) | `NewProjectDialog.tsx` | `projectDefaultLocation()` seed |
| Project data: Clear derived data… | `ClearProjectData` | `settings/page/ProjectDataPanel.tsx:37` | `manuscript.clearProjectData()` after ConfirmDialog (:41-55), then `onProjectDataCleared` -> `refreshBootstrap` + navigate `/` |

### 1.9 Assets (`components/assets`, `hooks/useAssetInstall.ts`)

| Piece | File:line | Notes |
|---|---|---|
| `AssetInstallPrompt` (confirm -> WorkDialog: Cancel/Retry/Close) | `assets/AssetInstallPrompt.tsx:42-87` | driven by `useAssetInstall` poll loop (`hooks/useAssetInstall.ts:28`). Consumers: Booth `WhisperModelPrompt`, `ListeningModelPrompt`, `ReadAlongView.tsx:90`, `useTeleprompterSession.ts:145`, `useResumeLocate.ts:51`, Proof `CompareRun.tsx:140,584`, `recordingcheck/CheckRecordingsDialog.tsx:195,266`, Story Bible `GuideDetail.tsx:273,1039`, Script `dictionaryInstall.tsx:20,53` |
| `AssetFacts` | `assets/AssetFacts.tsx:54` | size/licence summary, `formatSize` shared |

### 1.10 Devtools

| Control | File:line | Notes |
|---|---|---|
| "Mock states" floating Button | `devtools/MockStatesPanel.tsx:25` | mock build only, `?mockPanel=1` (`main.tsx:665-668`). SlideOver with RadioGroup/Checkbox groups (`mockStates.ts` `MOCK_GROUPS`), each choice rewrites URL params + reload. Not part of the app. |

## 2. Settings (`components/settings`, route `/settings`)

### 2.1 Page chrome (`page/SettingsPage.tsx`)

| Control | Label | File:line | Handler -> host / state |
|---|---|---|---|
| Back | "Back to {page}" (Icon `previous`) | :257 | `go(cameFrom)`; origin from `hooks/useSettingsOrigin.ts` (`markLink()` called by Ctrl+, `App.tsx:547` and jump-menu `openSettings` :631; or any `#hash` deep link) |
| Search settings | SearchField | :264 | `search()` over `ROWS`+`PAGE_SETTINGS` (`registry/search.ts:71`); Esc clears (:270) |
| Show filter | ToggleGroup All / Changed / In this project | :278-288 | `filter`; `changed` = `isAnyChanged`, `inProject` = scope project or override |
| Category nav | 8 categories in 3 groups + "Set on a page" (count badge = changed rows) | `page/CategoryNav.tsx:42,66,84` | `showCategory`; folded button "Category" at <761 px (:66) |
| Retry | secondary sm | SettingsPage.tsx:312 | `store.reload()` (shown when settings unreadable) |
| Reset to defaults | secondary sm (when `changed>0`) | `page/CategoryPane.tsx:65` | `resetCategory` (SettingsPage.tsx:332): `store.write(row,'global',null)` per changed row, project override too for scope `both`; rows w/o `field` (custom bodies) are **not** reset |
| Advanced disclosure | "Advanced (n)" | CategoryPane.tsx:76 | `advanced` state; auto-opens for deep-linked advanced row (:141-143) |
| Show the whole category | secondary sm | `page/Results.tsx:46` | `showCategory` |
| Unsaved-settings guard | ConfirmDialog "Unsaved settings" Save & continue / Discard & continue | `App.tsx:1102-1123` | `settingsActions.save/discard` registered by `SettingsFormsProvider`; only the "Set on a page" `ScopedFieldsPanel`s are dirty-tracked (rest of Settings saves at once) |
| Jump menu items | "Settings: {category}" x8, per-row items `row.<id>`, `category.<id>` | `layout/useShellCommands.ts:37`; `page/pageItems.ts:22-46` (rows with `needs:'reaper'` shown disabled for non-REAPER) | deep link `#category-<id>`; anchors `page/anchors.ts:12-19` (`#recording`->`daw.engine`, `#credits`, `#delivery`, `#cleanup`, `#booth`/`#teleprompter`->`daw.mic`) |
| "Changes cannot be saved" / "Settings could not be read" cards | InsetCards | :302-316 | `store.failing`, `store.readError.global` |

### 2.2 Row mechanics (`row/SettingRowView.tsx`, `row/ValueControl.tsx`, `data/SettingsStore.tsx`)

| Control | Label | File:line | Handler -> host |
|---|---|---|---|
| Value control (Switch/Select/TextField/number/colour) | by host `fieldSchemas` kind | `ValueControl.tsx:93-194` | `store.write(row,'global'|'project',value)` -> `system.saveSettings(tool,scope,{key:value})` (`SettingsStore.tsx:68`); read via `system.settingsForScope(scope)` (`settingsForms.tsx:75`) |
| Reset | IconButton `undo`, "Reset {label} to {default}" | `SettingRowView.tsx:149-153` | `store.write(row,'global',null)` |
| Override for this project | link sm | :189 | `commit(comp,'project')` |
| Use computer setting | link sm | :176-181 | `store.write(row,'project',null)` |
| Used by {Page} | link sm per page | :36-42 | `go(PAGE_PATH[page])` |
| About {label} (?) | HelpButton | :118 | shows `row.more` |
| Costly-change ConfirmDialog | `row.costly` | :224 | `commit` |
| Asset note: Download / Repair / Cancel / "Models & downloads" link | | `row/AssetNote.tsx:50-65` | `AssetsStore.install/cancel`, `showCategory('models')` |

### 2.3 Categories and rows (`registry/rows.ts`; id:line -> control body -> host)

**Recording & DAW** (`recording`)
| Row (id:line) | Label / section | Control | Host / state | Also set in |
|---|---|---|---|---|
| `daw.engine`:44 | Record with / Recording tool | `EngineBody` RadioGroup (REAPER, Audacity, Built-in) `EngineBody.tsx:248`; Built-in behind ConfirmDialog :305 | `dawChoice.dawChoice()` read (:150), `dawChoose(next)` (:242, :327) then `engineChanged()` signal (`data/engineSignal.ts`) | **only here** (no Booth/Engine-panel DAW switch). Header chip/Booth setup chip follow via caps/bootstrap |
| (inside `daw.engine`) Link {file} | primary sm, shown for `not_linked` + 1 found file | EngineBody.tsx:268 | `dawChoice.dawLinkFound()` | **third** link route (links the one .rpp found, no dialog) |
| Start {DAW} / Starting… | secondary sm | :273-276 | local `start()` (:185): `project.launchDaw()` + toast `Started {daw} ({path}).` | no settings save, no caps polling (unlike `useReaperLaunch`) |
| Get REAPER | secondary sm | :278 | `dawCatalogList()` + `dawCatalogOpenDownloadPage(id)` (:211-219) | |
| Choose a project file / Change linked file | secondary sm | :283 | `onLinkDawFile` -> `App.linkDawFile` | same as Engine panel "Link file…" |
| Test connection / Check again | secondary sm | :288 | `check()` (:197): `dawChoice.dawChoice()`; shows "Connected. Answered in N ms." / "No answer from {daw}." + "Last checked N s ago." | reads host DawChoice, not bootstrap. |
| Audacity card | `AudacityLinkCard` | :259 | §1.2 | |
| `daw.mic`:56 | Microphone | `MicBody` (:36-): DAW input "Same as REAPER" + "Choose a different one" (MicBody.tsx:95) / per-mic buttons (:127) / "Ask {DAW} again" (:102) / "Use {DAW}'s input" (:77) / manual Select (:184,217) + Reload (:206,230) | `Teleprompter.input_device`+`input_source` via `store.write`; `teleprompterReaperInput('')`, `teleprompterDevices()` | Booth Levels menu writes same keys (`booth/useTeleprompterSession.ts:401-410`) |
| `daw.sampleOutput`:70 | Voice sample output | `SampleOutputBody` Select :132, Test button :100, Reload :146 | `VoiceSamples.output_device`; `recording.recorderState()` | |
| `daw.startTone`:83 | Start tone (browser) | `TakeToneRowBody` RadioGroup Off/On (`TakeToneBody.tsx:19`) | `localStorage` via `writeStoredTakeTone`; plays tone | scope `browser`; not host-synced |
| `daw.reaperPath`:95 (Adv, REAPER) | REAPER program | TextField, `reaperPathProblem` check | `DAW.reaper_path` | |
| `daw.autoLauncher`:112 (REAPER) | Start the launcher script with REAPER | Switch | `DAW.auto_start_launcher` | also **written** by `useReaperLaunch.ts:223` (every "Start REAPER" press forces it `true`) and "Booth › Set up recording" |
| `daw.capabilities`:127 (Adv) | Capabilities | `CapabilitiesBody` table; Retry `CapabilitiesBody.tsx:445` | `useDawCapabilityReport` (`CapabilitySection.tsx:69`) | read-only |
| `daw.syncActivity`:140 (Adv, REAPER) | Sync activity | `SyncActivityBody` -> `SyncActivityLog` | `useChapterSync(port)`; `chapterSyncUndo` | **hidden for Audacity** though chapter sync + `ChapterSyncPanel` work for Audacity (`needs:'reaper'`) |

**Speech to text** (`speech`): `stt.model`:156 (`TranscriptCompare.model_size`), `stt.live`:175, `stt.liveModel`:189 (`Teleprompter.engine/model`; Booth `useTeleprompterSession.ts:401` writes same), `stt.cascade`:201 (Adv), `stt.cascadeFirst`:215, `stt.cascadeRecheck`:228, `stt.pipeline`:242, `stt.workers`:256 (Adv; WorkerPlanNote), `stt.chunk`:271, `stt.background`:295, `stt.backgroundModel`:308, `stt.backgroundRecheck`:322, `stt.backgroundProcessors`:336 (Adv) - all generic `ValueControl` over `RecordingCoverage.*`; `BackgroundChecks.tsx:86-100` also writes `background_checks[_confirmed]` (toast text says "Settings › Speech to text › Background checks").

**Voice & pronunciation** (`voice`): `voice.id`:356 (`Piper.tts_voice_id`), `voice.dict`:376 (`DefinitionsBody`: radio sources + IconButtons download/remove local dictionary `DefinitionsBody.tsx:70-72`; also `Script.definition_source` written by `script/scriptPageHost.ts:149`), `voice.pron`:390 (`ManuscriptGuide.default_pronunciation_source`), `voice.mwKey`:404 (Adv; `MwKeyBody`: Field :88, Save :98, Test :78 -> `pronunciationOnlineLookup('test')`, Remove :81 -> `…KeyClear`, Sign up :101 -> `…SignUpOpen`, Retry :62).

**Models & downloads** (`models`, `page/ModelsPane.tsx`): Open folder :89/:167 -> `assets.assetsOpenFolder`; Retry :86; Download the recommended set :180 (whisper small + tts ljspeech, 600 MB; `RECOMMENDED_SET` registry/assets.ts:54); ToggleGroup filter All/Speech/Voices/Language/Tools :186; row IconButtons (`models/AssetRow.tsx:106-118`): download, remove (ConfirmDialog :234, `assets.remove`), cancel, repair, try again, dismiss; "Used by" links :92; `AnalysisToolsSection bare` :229 (Download/Remove spaCy-type tools, ConsentDialog Cancel/Download `analysis/ConsentDialog.tsx:59-62`, Checkbox "ask" `AnalysisToolsSection.tsx:93`, Retry :65). Host: `assetsList/Install/InstallState/InstallCancel/Remove` via **`AssetsStore.tsx:64-164` (its own poll loop, POLL_MS)** while analysis tools use `useAssetInstall` and every other page uses `useAssetInstall` (§3 capability "download model").

**Delivery** (`delivery`): `delivery.profile`:419 (`DeliveryProfileBody` Select `DeliveryBodies.tsx:46` -> `deliverySelectProfile('project',…)` via `useDeliveryProfiles`), `delivery.default`:432 (same panel, 'global'), `delivery.custom`:443 (Adv; `DeliveryProfilesPanel.tsx:279-299`: Duplicate/Edit/Delete IconButtons, "Duplicate {built-in}" buttons, ConfirmDialog "Delete profile" :213; `DeliveryProfileEditor` Dialog "Edit profile" Name Field :114, Switch per rule :139, Cancel :103/Save :106 -> `deliverySaveProfile`). Project profile is also set in `delivery/profile/ProfileCard.tsx:102` and `production/ManuscriptImport.tsx:144` (first import).

**Project** (`project`): `project.manuscript`:458 (`ManuscriptBody` -> `useManuscriptImport` shared with Production, button "Replace manuscript…"/Import `ManuscriptSection.tsx:28`), `project.wordsPerPage`:470, `project.build`:484, `project.spacy`:497, `project.types`:513 (`StoryBibleTypesList`: Select colour :85, Checkbox "Can speak" :94, remove IconButton :103, New type Field :161 + Add type :171 -> `guideTypeRename/SetColour/SetSpeaks/Remove/Add`), `project.bibleData`:524 (Adv; `DeleteStoryBibleData` button :95 -> reads `guideEntities`+`extractionList`, ConfirmDialog -> `storyBible.guideDeleteAll()`), `project.marks`:536 (IconButton "Edit marks…" `ProjectBodies.tsx:37` -> Script's `MarksDialog`), `project.narrator`:547 (`General.narrator_name`; also written by `credits/CreditsSetupDialog.tsx:93`), `project.roomTone`:560 (Adv), `project.credits`:574 (`CreditsBody`: summary badges, "Edit credits…"/"Close credits editor" `CreditsBody.tsx:108` -> `CreditsPanel` (Template Select :252, New :259, Duplicate :262, Delete :265, Save :301, Use suggestion :356, Clear credits :365 + ConfirmDialog :378; `RetailSamplePanel` selects + Save :130 / Clear :139) -> `credits*` / `saveCreditsTemplate`, `duplicateCreditsTemplate`, `deleteCreditsTemplate`, `saveCreditsProjectValues`, `saveCreditsRetailSample`), `project.data`:586 (Adv; "Clear derived data…" -> `manuscript.clearProjectData`).

**Appearance & keys** (`appearance`): `look.theme`:600 (RadioGroup Match my system/Light/Dark `AppearanceBodies.tsx:25` -> `useTheme().setPreference`), `look.motion`:612, `look.reader`:625/`readerSize`:638/`readerSpacing`:651/`readerWidth`:664 (Select/Sliders -> `changeReaderText`, `localStorage`; preview blockquote), `look.note`:677 (`Manuscript.color_note`), `look.zoom`:689 (`ZoomRowBody` Select :156 + IconButton "Reset zoom to 100%" :163 -> `system.windowSetZoom` + `windowSaveZoom` directly, `AppearanceBodies.tsx:140-148`; re-reads on window `resize`), `keys.map`:702 (`ShortcutsRowBody` find box + `KeyboardPanel`: Change :276, Reset :272, Reset all to defaults :236, recorder: Replace :141, Add as another key :146, Unbind :149, Reset to default :152, Try another key :158, Cancel :162 -> `api.saveSettings('Keymap','global',{overrides})` :216).

**App & updates** (`app`): `app.updates`:716 `check_on_startup`, `app.channel`:729, `app.notify`:741, `app.importClose`:753 (also toggled in manuscript import dialog `production/ManuscriptImport.tsx:105`), `app.debug`:766 (Adv). `AboutSection` (`controls/AboutSection.tsx:27`): version (`AboutPanel`) + `UpdatesPanel` (`UpdatesPanel.tsx`): Check now :145 -> `updateCheck`, Download update :137 -> ConfirmDialog :153 -> `UpdateDownloadDialog` (`updateDownload`, `updateJobState`, `updateJobCancel`), Install and restart :138 -> ConfirmDialog :179 -> `updateInstall`, Show the downloaded file :139 -> `updateShowDownload`, Release notes :141 -> `updateOpenNotes`.

**Set on a page** (`pages`, `registry/pageSettings.ts:170-243`, `page/PagesPane.tsx`): 8 entries each with disclosure "Change it here for now" + "Open {Page}" (PagesPane.tsx:37-42 -> `go(PAGE_PATH)`): `ps.coverage` (RecordingCoverage scoped form + `RecordingCheckSummary`), `ps.cleanup`, `ps.preview`, `ps.stages`, `ps.compare`, `ps.punch` (Teleprompter `punch_preroll_seconds`; Booth `usePunchPreroll.ts:54` writes same key), `ps.fx` (DAW `fx_favourites`; Editing `useFxFavourites.ts:54`), `ps.backups` (`BackupsSection`; Editing `useBackupSettings.ts:73`). Each `ScopedFieldsPanel` (`page/ScopedFieldsPanel.tsx`): scope ToggleGroup (:141), Retry (:158), Discard changes (:204), Save (:207) -> `system.saveSettings(tool,scope,changed)` (:89), "Use computer value" clear -> `saveSettings(tool,'project',{key:null})` (:115), ConfirmDialog "Unsaved settings" on scope switch (:217).

### 2.4 Settings hooks / stores

| Hook | File | Role |
|---|---|---|
| `useSettingsOrigin` | `hooks/useSettingsOrigin.ts` | Back target for Settings |
| `useSettingsStore` / `SettingsStoreProvider` | `settings/data/SettingsStore.tsx` | `fieldsOf`, `write`, `reload`, `saved`, `failing`, `readError` |
| `SettingsFormsProvider`/`useScopedFields` | `settings/data/settingsForms.tsx:44-75` | second reader of `settingsForScope` for the dirty-tracked panels (two caches of same data: store vs forms) |
| `useProjectDaw` | `settings/data/useProjectDaw.ts` | `dawChoice().daw` re-read on `engineChanged()`; vs `data.daw` bootstrap fallback (SettingsPage.tsx:96) |
| `engineChanged/onEngineChanged` | `settings/data/engineSignal.ts` | module-level signal; only `EngineBody.act` fires it |
| `useDeepLink` | `settings/page/useDeepLink.ts` | focus+flash target row |
| `useAnalysisTools/useAnalysisPrompt` | `settings/analysis/` | asset install for analysis tools |
| `usePageCommands('settings')` | SettingsPage.tsx:167 | jump-menu items |

## 3. Capability tags (reachable from more than one place)

Legend: ONE = single implementation; DIVERGE = separate code paths that can disagree.

### 3.1 Link chapters (the worked example) - FOUR different meanings, two stores

"Link"/"linked" for a chapter appears in these places; **they do not share a store**.

| # | Surface | File:line | What "linked" means | Store / call |
|---|---|---|---|---|
| A | Engine page "Link chapters…" button -> LinkChaptersDialog (title "Link chapters to REAPER", action "Stamp N items", options "Not linked") | `EnginePanel.tsx:196`, `LinkChaptersDialog.tsx:132,164,168` | Writes **item-level line-identity stamps** (`P_EXT` on every REAPER item of the chosen track: lineId = chapter id, text = chapter title). Local `mapping` state starts `{}` every open (:132); never reads A-stores below | `api.lineIdentityStamp` / `lineIdentityRead` / `lineIdentityState` + event (`internal/lineidentity`, REAPER bridge `stamp_item_lines`/`read_line_ids`) |
| B | Engine "Chapter links" table (Linked / Not linked / Track missing; Confirm / Change / Clear) | `ChapterLinksTable.tsx:73-94,168-262`; `chapterTrackRows.ts` | App-side **chapter -> trackGuid** confirmed mapping (evidence `TrackMapping`, document-scoped). First mapping only per chapter; `missing_track` if guid not in live `tracksList` | `chapterTrackMapList`, `chapterTrackSet`, `chapterTrackUnlink` (host `bindings.go:906-930`) |
| C | Engine "Tracks" list `Chapter` column ("Not linked") | `EnginePanel.tsx:336-381` | same store as B, joined by guid, **all** chapters of a track joined with ", " | `chapterTrackMapList` (own fetch :110-124) |
| D | Engine "Chapter sync" card: "Links: N chapters linked automatically, M by you", Needs-you "Link" button | `ChapterSyncPanel.tsx:97-103,147`; `chapterSyncText.ts:101-123` | Host sync plan snapshot (`counts.linked` counts every link of either origin, may include links to missing tracks) | `chapterSyncState` + `chaptersync:state`; writes through `chapterTrackSet` (same as B) |
| E | Engine unmapped count sentence ("N chapters can’t get a stage suggestion until their track links are confirmed below") | `EnginePanel.tsx:90-92,219-225` | stage recommendation causes `unmapped_track/unconfirmed_mapping` | `useStageRecommendations` |
| F | Settings Recording & DAW | `rows.ts:44-153`, `EngineBody.tsx` | **No chapter-link control.** Only DAW file link + Sync activity (REAPER-only, undo of sync links). "Linked to {file}" there = DAW project file | `dawChoice`, `chapterSyncUndo` |
| G | Booth chip "Not linked to a track"/"Linked to several tracks" -> `ChapterLinkDialog` (Link track / Create a new track / Check again) | `booth/record/ChapterLinkNotice.tsx:45-64` | host `chapterTrackMatch` + record capability; "several" = >1 mapping (table B hides this and shows first only) | `chapterTrackMatch`, `chapterTrackMapList`, `chapterTrackSet`, `chapterTrackCreate` |
| H | Editing chip "Not linked to a track" -> same dialog | `editing/page/useChapterLink.tsx:33-50`; `noAudioText.ts:23-28` | `chapterSource` read (`useChapterSource.ts:68`: `chapterTrackMapList`+`tracksList`) | same four bindings |
| I | Production chapter track panel (Link / Another track… / Unlink / MappingConfirm; pipeline cell text "Not linked", "2+ tracks", "Track gone") | `production/ChapterTrackPanel.tsx:113,126,243,264,283`; `pipeline/pipelineRows.ts:105-108` | `chapterTrackLinks` per-chapter state (status `unlinked/ambiguous/track_missing`) | `chapterTrackSet`, `chapterTrackUnlink`, `tracksList` |
| J | Proof chapter notice "No linked track. … Link one from the Chapter links table in the audio engine panel" + `EnginePanelLink` | `proof/ProofChapterPage.tsx:178-184` (`linkedTrackGuid` from `chapterTrackMapList`, :92) | store B | read-only; fix lives in Engine panel |
| K | Proof/Pickups/Editing readers | `proof/useChapterTimeline.ts:34`, `pickups/list/usePlayOriginal.ts:137`, `recordingcheck/CheckResult.tsx:167` | store B | |
| L | Consent dialog "Will be linked (N)" / "Needs you" | `ChapterSyncConsentDialog.tsx:60,75`; text points to "the audio engine panel or the chapter's Recorded cell on Production" | sync preview (`chapterSyncPreview`) | |
| M | Nav / jump menu | `useShellCommands.ts`, `navAvailability.ts` | none: no chapter-link command; `dawFile` precondition unused | n/a |

Share ONE implementation? **No.** B, C, D(link), G, H, I all end in `chapterTrackSet`/`Unlink` against the same host store (good), but A writes a different store and nothing reconciles them. Disagreement cases:
- A vs B/C/D: after sync or table links all chapters, A still opens with every chapter "Not linked" and offers 0 items; after A stamps items, B still reads "Not linked" (guide admits this, `docs/guides/using-the-app/navigation.md:229-231`). The same word "link" (button "Link chapters…", dialog "Link chapters to REAPER") names the stamp action while "Chapter links" names the mapping. Select labels differ: A "Track for X" (all tracks, no holder note) vs B `TrackSelect` (marks track held by another chapter).
- A's chapter list is `manuscriptChapters` unfiltered; B filters `contentKind==='reference'` (`chapterTrackRows.ts:26`) and adds Opening/Closing credits rows; A has neither adjustment.
- B shows first mapping only (`chapterTrackRows.ts:17-23`) while I/G/H flag 2+ links ("Linked to several tracks", "2+ tracks"); B can read "Linked" while Booth blocks Record.
- D "Links: N" is the host snapshot, B counts live; a deleted track = D still counts it, B says "Track missing", C says "Not linked".
- Downstream consumers of the *mapping* (Create chapter regions, Prepare render, Embed tags, Proof, Editing, Pickups) ignore stamps; consumers of stamps are Retakes on lanes / pickups line-id readers, which get no signal from the mapping. No UI explains which one each tool needs.
- Audacity: "Link chapters…" is not offered; B/C/D work; E fine; F hides Sync activity.

### 3.2 Link / change the DAW project file

| Location | File:line | Implementation | Shared? |
|---|---|---|---|
| Engine "Link file…/Change file…" | `EnginePanel.tsx:250` | `App.linkDawFile` (`pendingAction` guard, `api.linkDawFile`, `refreshBootstrap`, toast "REAPER project linked.") | ONE |
| Engine mismatch "Link the open project…" | `EnginePanel.tsx:275` | same | ONE |
| Settings "Choose a project file"/"Change linked file" | `EngineBody.tsx:283` | `onLinkDawFile` = same `App.linkDawFile` | ONE |
| Settings "Link {file}" | `EngineBody.tsx:268` | `dawChoice.dawLinkFound()` (host links the single found .rpp; different binding/no dialog/no toast) | DIVERGE |
| Booth "Link the open project" (`OtherProject` dialog) | `booth/record/RecordSetup.tsx:137-152` | `project.linkDawFile()` directly with local `useBusy`; own toast `"{Name} project linked."`, then `onChanged()` (not `refreshBootstrap`) | DIVERGE: not covered by the `link-daw` pending guard (App.tsx:318-320 comment claims one ref guards "all call sites"; native dialog can be opened twice), no bootstrap refresh from this path unless `onChanged` does it |
| Booth/others "Link in Settings" / "DAW settings" | `ReaperOffDialog.tsx:135` (Booth only passes `onLink`), `RecordSetup.tsx:166` | navigate to Settings (`daw.engine` anchor `#recording`) | pointer |
| Editing & Production ReaperOff dialog | `EditingPage.tsx:168`, `ProductionPage.tsx:363` | text "Link the project file first." with **no** button (no `onLink`) | dead end |
| Audacity | `AudacityLinkCard.tsx:112,116,120` | `audacityLinkOpenProject/File/Unlink` | DIVERGE by DAW |
| Chip tooltip | `EngineChip.tsx:65-70` | text only | |
| Guide-claimed "an import" call site | `App.tsx:316` comment | **no code calls `linkDawFile` from an import** | stale comment |

### 3.3 Check / test the DAW connection

| Location | File:line | Reads | |
|---|---|---|---|
| Engine mismatch "Check again" | `EnginePanel.tsx:278` | `refreshBootstrap` -> `data.dawReachable/dawProjectMatches` | |
| Settings "Test connection"/"Check again" | `EngineBody.tsx:197-209,288` | `dawChoice()` (host DawChoice.state) | |
| Audacity "Check again" | `AudacityLinkCard.tsx:124` | `audacityLinkCheck` | |
| Booth dialogs "Check again" | `RecordSetup.tsx:161,283` -> `control.checkAgain` | caps (`dawSession`) | |
| Editing dialog | `EditingPage.tsx:176` `daw.retry` | caps | |
| Production dialog | `ProductionPage.tsx:370` `checkDaw` | caps | |
| ChapterLinkDialog "Check again" | `ChapterLinkDialog.tsx:141` | `chapterTrackMatch`+map re-read | different question |
| Header chip | `EngineChip.tsx` | bootstrap snapshot (+ Audacity link) | |
| Booth setup chip | `booth/record/useDawChoice.ts:10-33` | `dawChoice()` re-read only on `capsVersion` change | stale after Engine-panel link/relink until caps change |
DIVERGE: four stores (bootstrap, DawChoice, capabilities session, Audacity link). Bootstrap is re-read only on REAPER caps flip, Audacity link change, focus (App.tsx:277-312); Settings reads DawChoice on mount, `capsVersion`, `data.dawFileLinked`. The chip can say "Other project" (bootstrap) while Settings card says "connected" (DawChoice) between re-reads.

### 3.4 Start the DAW

| Location | Impl |
|---|---|
| ReaperOffDialog Start (`ReaperOffDialog.tsx:121`, Booth label "Open in REAPER and connect") | `useReaperLaunch`: saves `auto_start_launcher=true`, `launchDaw`, polls caps up to 10 s |
| Settings "Start {DAW}" (`EngineBody.tsx:273`) | `launchDaw` + toast, no save/poll |
| Audacity card "Start Audacity" (`AudacityLinkCard.tsx:92`) | `launchDaw` + toast |
| Project picker "Open running {DAW project}" | different (switch project) |
DIVERGE (3 implementations, 3 labels). No Engine-panel Start for REAPER.

### 3.5 Tracks list / project file read

`tracksDiscover/tracksSelect/tracksList` in Engine panel (`EnginePanel.tsx:129,145,163`); `tracksList` also in Production `ChapterTrackPanel.tsx:77`, `EditingCheckPanel.tsx:72`, `CheckResult.tsx:167`, `useChapterSource.ts:68`, `useChapterTimeline.ts:34`, `usePlayOriginal.ts:137`, `MappingConfirm` consumers. Same binding (ONE) but each caller fetches independently and the Engine panel's `tracksSelect` choice is per panel session (separate from "linked file", §1.1). Audacity: panel re-reads on `audacity.receivedAt` (:77,139,158).

### 3.6 Chapter sync on/off and undo

On/off: Engine `ChapterSyncPanel.tsx:52` and consent dialog `App.tsx:1092,1096` (ONE binding `chapterSyncSetEnabled`). Not in Settings (no row; Settings only has the log). Undo: Settings log `SyncActivityLog.tsx:26` and Production toast `useChapterSyncToast.ts:45` (ONE binding `chapterSyncUndo`, different guards/copy). Preview: `ChapterSyncPanel.tsx:37`, `App.tsx:220`.

### 3.7 Settings that also live elsewhere (same host keys, separate writers)

| Setting | Settings | Other location(s) | Impl |
|---|---|---|---|
| Microphone / source (`Teleprompter.input_device`,`input_source`) | `MicBody.tsx` via `store.write` | Booth Levels `useTeleprompterSession.ts:401-410` (`api.saveSettings`), legacy migration :241 | DIVERGE writers; Settings store may not refresh after Booth write (separate `SettingsStore`) |
| Live engine/model (`Teleprompter.engine/model`) | `stt.live`/`stt.liveModel` | Booth `saveChoice` :401 | DIVERGE |
| Punch pre-roll | `ps.punch` | Booth `usePunchPreroll.ts:54` | DIVERGE |
| Favourite effects, FX cap, Backups | `ps.fx`, `ps.backups` | Editing `useFxFavourites.ts:54`, `useFxCap.ts:61`, `useBackupSettings.ts:73` | DIVERGE (Settings has no row for `fx_cap_pct`; Editing-only) |
| Recording-check rules/stage/preview/compare options | `ps.*` | Production/Proof "Jump to or run" panels via `proof/proofOptions/useProjectOptions.ts:55` | DIVERGE writers |
| Background checks (`background_checks`) | `stt.background` | `BackgroundChecks.tsx:86-100` pill/toast "Resume"; consent writes `background_checks_confirmed` | DIVERGE |
| Narrator name | `project.narrator` | `CreditsSetupDialog.tsx:93` (Script/Production/import) | DIVERGE |
| Credits templates/values | `CreditsBody`/`CreditsPanel` | `CreditsSetupDialog` (`creditsSetupSave/Dismiss`) | DIVERGE; Booth `CreditsWarning.tsx` points to "Settings > Project > Credits" |
| Definition source | `voice.dict` | `script/scriptPageHost.ts:149` | DIVERGE |
| Close import when done | `app.importClose` | `ManuscriptImport.tsx:105` | DIVERGE |
| Delivery profile | `delivery.profile`/`default` | `delivery/profile/ProfileCard.tsx:102`, `ManuscriptImport.tsx:144` | DIVERGE (all `deliverySelectProfile`) |
| Theme | `look.theme` (`useTheme`) | rail button `AppShell.tsx:260`, jump "Toggle dark theme" `useShellCommands.ts:58` | ONE (`ThemeContext`) |
| Zoom | `look.zoom` Select (`windowSetZoom`+`windowSaveZoom` direct, `AppearanceBodies.tsx:140`) | `hooks/useZoom.ts` (Ctrl +/-/0, jump menu steps, chip; debounced save :70) | DIVERGE (two writers, Settings syncs only through window `resize`) |
| Reader text (font/size/spacing/width) | `look.reader*` | Script/Booth "Text settings" | ONE (`useTextPrefs`/`changeReaderText`, localStorage) |
| Shortcuts | `keys.map` | `ShortcutSheet` (`help.shortcuts`, "show all" -> `/settings`) | ONE (Keymap setting) |
| Record in REAPER (`ReadAloud.record_in_reaper`, project) | **no Settings row** | Booth companion `booth/useRecordInReaper.ts:73` | Booth-only |

### 3.8 Delete / clear data

| Action | Location | Impl |
|---|---|---|
| Clear derived project data | Settings `project.data` (`ProjectBodies.tsx:47`, `ProjectDataPanel.tsx:37`; `ProjectDataPanel` panel form is unused by registry) | `manuscript.clearProjectData` ONE |
| Delete Story Bible data | Settings only (`DeleteStoryBibleData.tsx`); Story Bible page has none | `guideDeleteAll` ONE |
| Clear credits | `CreditsPanel.tsx:365` | `saveCreditsProjectValues({})` |
| Remove recent project | `ProjectPicker.tsx:322` | deferred `removeRecentProject` + Undo toast |
| Remove model/tool | `AssetRow.tsx:107`, analysis `ToolRow.tsx:43`, dictionary `DefinitionsBody.tsx:70` | `assetsRemove` (3 UIs: AssetsStore vs useAnalysisTools vs script dictionary) |
| Transcript reset | `App.tsx:725,815,839`, `proof/CompareRun.tsx:275,517` | `transcriptReset` |
| Unlink DAW | Audacity only (`AudacityLinkCard.tsx:120`); REAPER has no unlink anywhere |

### 3.9 Import / export / DAW choice

Import manuscript: Production page + Settings `project.manuscript` (`useManuscriptImport`, ONE) + jump menu `manuscript.import` (navigates `/`) / `manuscript.replace` (opens Settings Project). Export: nothing in this area (no settings export/import). DAW choice (Record with): Settings `daw.engine` only (`dawChoose`); readers `useProjectDaw`, `useDawChoice`, `useRecordingEngine` (App.tsx ~239), chip.

### 3.10 Model/asset download (same capability, 4 loops)

`AssetsStore.tsx:64-164` (Settings Models pane), `hooks/useAssetInstall.ts` (Booth, Proof, Story Bible, Script, recording check, analysis tools), `UpdateDownloadDialog.tsx` (updates, different job), `DefinitionsBody` (uses script `dictionaryInstall` hook). Status shown in Settings (`AssetNote`) can lag a download started from a page prompt until `assets.refresh()`.

## 4. Suspicious controls

| # | File:line | Issue |
|---|---|---|
| 1 | `EnginePanel.tsx:196`, `LinkChaptersDialog.tsx` | Button/dialog named "Link chapters…" stamps REAPER items; it is not the chapter link table and starts at `{}` regardless of existing links (§3.1). No "use existing links" prefill, no indication of how it relates to "Chapter links". Likely intended to be driven by store B. |
| 2 | `LinkChaptersDialog.tsx:127,232` | Reference chapters and missing credits rows not handled (table does). Track select has no "held by" note. |
| 3 | `EnginePanel.tsx:196` | Hidden (not disabled) when chapters failed to load (:100-104 swallows error) or no tracks; silent. |
| 4 | `ChapterLinksTable.tsx` / `chapterTrackRows.ts:17-23` | First mapping only; multi-link chapters look "Linked". |
| 5 | `EnginePanel.tsx:337-381` Tracks list | Read-only; shows "Not linked" per track with no link action (the fix lives in the Chapter links card below). A chapter mapped to a track no longer in the project appears nowhere in this list. |
| 6 | `recordingCheckText.ts:22,28,29,61-63`, `ResumePrompt.tsx:264,374-377`, `CheckResult.tsx:178` | Copy and links say "Tracks page" / "Open Tracks" (`/tracks`); that page is retired - link redirects to `/proof` and opens the panel; `CheckResult.tsx:178` link text already says "Open the audio engine panel" but `to="/tracks"`. Navigating away from the Booth/Production to Proof is a side effect. |
| 7 | `ReaperOffDialog.tsx:131-139` + `EditingPage.tsx:168`, `ProductionPage.tsx:363` | "Link the project file first." with no action when `onLink` omitted. |
| 8 | `rows.ts:140` `daw.syncActivity` `needs:'reaper'` | Chapter sync supports Audacity (`ChapterSyncPanel` `daw` prop) but its log/Undo is hidden for Audacity. `SyncActivityLog` doc says Settings is its only home. |
| 9 | `EngineBody.tsx:268` "Link {file}" vs :283 "Choose a project file" vs `EnginePanel.tsx:250` "Link file…" | Same intent, three labels, two bindings (`dawLinkFound` vs `linkDawFile`). Engine panel has no "link the found file" shortcut. |
| 10 | `RecordSetup.tsx:137` | Booth links via its own busy state and toast, outside the `link-daw` guard; App comment (:316-320) says one guard covers all call sites and lists "an import" which does not exist. |
| 11 | `EngineBody.tsx:273` / `AudacityLinkCard.tsx:92` / `useReaperLaunch.ts` | Three Start implementations, three behaviours (§3.4). |
| 12 | `settings/CapabilitySection.tsx:83` | `CapabilitySection` component is unused (only its `useDawCapabilityReport` hook is imported); doc says "beside the per-capability toggles" - no toggles exist. Dead/stale. |
| 13 | `settings/page/ProjectDataPanel.tsx:12` `ProjectDataPanel`, `settings/page/MarksPanel.tsx:23` `MarksPanel`, `ReaderTextPanel.tsx:13`, `ManuscriptSection.tsx:41`, `StoryBibleTypesPanel` panel form | Older panel forms kept "for the old page and its stories"; registry draws only the row bodies. Candidates for dead code. |
| 14 | `CreditsPanel.tsx:340` | Text "see Settings > General": there is no General category. |
| 15 | `editing/range/replace/ReplaceDialog.tsx:284` | "(Settings > Editing)": Settings has no Editing category (categories.ts:5-50). |
| 16 | `navigation/navAvailability.ts:6,18` | `dawFile` precondition never assigned; `dawFileLinked` plumbed (`AppShell.tsx:210`, `App.tsx:545`) for nothing. |
| 17 | `SettingsPage.tsx:332-339` `resetCategory` | "Reset to defaults" only iterates rows with a host `field` (`if (!row.field) continue`); custom-body rows (Record with, keymap, theme, motion, zoom, reader text, profiles, credits) are not reset though they sit in the same category. |
| 18 | `rows.ts:83` `daw.startTone` | Only `browser`-scope row for Recording; not covered by "Changed"/reset; appears in jump menu as host-like row. |
| 19 | `AudacityLinkCard.tsx:120` | Unlink exists only for Audacity; REAPER link can only be changed, never removed. |
| 20 | `AppShell.tsx` Booth branch | In the Booth there is no engine chip or Settings/engine shortcut except `RecordSetup` chips; "Link a track" on `ResumePrompt` goes to `/tracks`. |
| 21 | No jump-menu command | "Open audio engine", "Link REAPER project", "Check DAW connection", "Link chapters" are mouse-only (header chip). `nav.settings` and Settings categories are keyboard reachable. |
| 22 | `docs/guides/using-the-app/settings.md:~118` heading "DAW Integration" vs category label "Recording & DAW" (`categories.ts:6`); several code comments (`RecordSetup.tsx:45`, `App.tsx:274`) still say "DAW Integration". |
| 23 | `EnginePanel.tsx:57` header comment says "The Tracks page's player is gone"; panel title is "Audio engine" while chip/tooltips say "engine panel" (copy drift, minor). |
| 24 | `AssetsStore.tsx` vs `useAssetInstall` | duplicate install polling implementations (§3.10). |
| 25 | `ReadAloud.record_in_reaper` | host setting with no Settings entry (Booth companion only). |
