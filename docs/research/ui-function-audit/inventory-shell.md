# UI function audit: app shell and cross-page chrome

Built from code on branch `claude/ui-function-audit`. Root: `src/studio/ui/src` (paths below are relative to it). Read-only audit; nothing fixed.
Method: read `App.tsx`, `components/layout/*`, `input/*` (catalog, router, providers, page commands), `registries/*`, `studio/*`, `overlay/*`, `hooks/*`, `navigation/*`, `components/primitives/{Toast,NavButton}.tsx`, `api/wailsClient.ts`. Call-site counts for host bindings are `grep -w` over non-test, non-story, non-`api/`, non-`fixtures/` files (so `testPage.tsx` fixtures and `ports/` adapters are counted as sites; treat counts as upper bounds).

## 0. How the shell is wired (read first)

Five separate registries feed "what can I do", and they do not share a source of truth:

| Registry | Defined | Feeds | Source of availability |
| - | - | - | - |
| Command catalog (static, key-bound) | `input/commands.catalog.ts:55` `COMMAND_CATALOG` | router keys (`input/router.tsx`), shortcut sheet (`surfaces: help`), Settings key list (`settings`), jump menu rows (`jumpMenu`) | handler present via `useCommand(id, fn, enabled)`; jump menu reasons from `App.tsx:587` `shellDisabledReasons` |
| Command providers (runtime, no key) | `input/commandProviders.ts:26` | jump menu only | each provider's `disabledReason` |
| Page commands ("On this page") | `input/pageCommands.ts:46,82` `usePageCommands` | jump menu only; `supersedes: ['Chapters']` hides global "Go to <chapter>" | page state at menu open |
| Search sources | `registries/search.ts:55` (`useSearchSource`) | jump menu typed term (>=2 chars) | page data |
| Context providers | `registries/context.ts:82` | right-click / Menu key (`ContextMenuHost`) | page data; fallback = `App.tsx:650` |

Two independent toast queues are mounted at once: App's `useToasts` (`hooks/useToasts.ts:39`, rendered `App.tsx:1067`, also `App.tsx:763` when no project) via the `notify`/`setNotice` prop threaded to pages, and the overlay service (`overlay/overlayService.ts:119`, rendered by `overlay/OverlayHost.tsx:249`) via `overlay.toast`/`toastUndo`/`useErrorToast`. Different dedupe, different limits (both 4), different dismissal (`sayInPlace` only reaches App's queue, `dismissUndo`/`settleUndo`/`dismissTopic` only the overlay's).

Navigation has one guarded entry (`App.tsx:795` `guardedNavigate` = leave guard `journal.checkLeave` then dirty-Settings guard `moveTo` then transcript reset) and many unguarded ones (section 3.S6).

## 1. Tables

### 1.1 Shell chrome controls (visible UI)

| Control | Label | File:line | Handler -> host call or state | Notes |
| - | - | - | - | - |
| Skip link | Skip to content | `components/layout/AppShell.tsx:193` | focus `<main>` | first tab stop; hidden until focus |
| Rail item | Production (`/`) | `AppShell.tsx:23,244` | `go('/')` -> `App.tsx:795 guardedNavigate` | icon faHouse; lock/reason from `navAvailability('/')` (never locked) |
| Rail item | Schedule | `AppShell.tsx:25` | `go('/schedule')` | locked without manuscript |
| Rail item | Script | `AppShell.tsx:26` | `go('/script')` | locked without manuscript |
| Rail item | Story Bible | `AppShell.tsx:27` | `go('/story-bible')` | locked without manuscript |
| Rail item | Booth | `AppShell.tsx:29` | `go('/booth')` | locked without manuscript; on `/booth` with manuscript the whole rail/header disappears (`AppShell.tsx:276`) |
| Rail item | Editing | `AppShell.tsx:31` | `go('/editing')` -> `EditingRoute` (`App.tsx:1162`) opens first chapter | locked without manuscript |
| Rail item + badge | Proof (count) | `AppShell.tsx:33,251` | `go('/proof')`; badge = `navCounts.proof` | badge from `useNavCounts.ts:35` |
| Rail item + badge | Pickups (count) | `AppShell.tsx:35` | `go('/pickups')`; badge `navCounts.pickups` | `useNavCounts.ts:41` |
| Rail item + badge | Master & QC (count) | `AppShell.tsx:36` | `go('/master')`; badge `navCounts.master` | `useNavCounts.ts:44-47` |
| Rail item | Delivery | `AppShell.tsx:38` | `go('/delivery')` | locked without manuscript |
| Rail foot | Dark theme / Light theme | `AppShell.tsx:264` | `theme.toggle` = `App.tsx:187` `setPreference(resolved==='dark'?'light':'dark')` -> `ThemeContext.tsx:17` (localStorage) | from preference `system` it writes an explicit value |
| Rail foot | Settings | `AppShell.tsx:268` | `go('/settings')` | no `settingsOrigin.markLink()` so Settings shows no "Back to <page>" (compare Ctrl+, `App.tsx:547`) |
| Locked rail item press | "<Page> is unavailable" popover | `primitives/NavButton.tsx:86-93` | opens Popover with `disabledReason`; never runs `onClick` | reason text from `dawCapabilityGate` via `navAvailability` |
| Header: hamburger | Open navigation | `AppShell.tsx:309` | `setDrawerOpen(true)` -> `NavDrawer` (same `navigation` markup, `AppShell.tsx:302`) | `<860px` only |
| Drawer close | Close navigation | `primitives/NavDrawer.tsx:45` | `onClose` | |
| Header: project name | `<name>, switch project` | `AppShell.tsx:324` | `onSwitchProject` -> `App.tsx:272` `setProjectPickerOpen(true)` | opens `ProjectPicker` in place of the shell (`App.tsx:754`) |
| Header: zoom chip | `Zoom N%` | `AppShell.tsx:339` | `onOpenZoomMenu` -> `openJump(undefined,'Zoom')` (`App.tsx:871`) | only while `percent !== 100` |
| Header: jump button | Jump to or run... Ctrl K | `AppShell.tsx:346` | `onOpenJump` -> `openJumpMenu` (`JumpMenu.tsx:291`) | absent in Booth shell; Ctrl+K still works there |
| Header: engine chip | `<DAW>[: Not linked / Not running / Other project]` or `Built-in` | `layout/EngineChip.tsx:86` | `onOpenEnginePanel` -> `App.tsx:242` `setEnginePanelOpen(true)` | `Built-in` variant (`EngineChip.tsx:48`) is a non-interactive group; `followingChapter` prop never passed (`AppShell.tsx:365-374`) |
| Zoom live region | (announcement) | `AppShell.tsx:362` | `useZoom` debounced text | |
| Page status live region | (announcement) | `AppShell.tsx:205` | page name on page change | |
| Main area right-click | page menu | `layout/ContextMenuHost.tsx:153` | `contextItemsFor(target)` else `App.tsx:650` fallback | see 1.5 |
| TimerChip | `h:mm:ss timer on <chapter>` | `layout/TimerChip.tsx:48` | display only, 1 s interval | not mounted by the shell: Production page mounts it (`ProductionPage`) |
| History slide-over: row Undo | Undo | `layout/HistoryPanel.tsx:58-66` | `journal.undo(row.id)` (`HistoryPanel.tsx:32`); ok -> `overlay.announce("Undid X")`, refusal -> `overlay.toast(reason)` | disabled when `row.refusal !== null`; no Redo anywhere (journal rule 8) |
| History slide-over | Undo history | `HistoryPanel.tsx:15` | opened by `history.open` (key / jump menu) via `App.tsx:568` | no header button opens it |
| Shortcut sheet | Keyboard shortcuts / Show all shortcuts | `components/help/ShortcutSheet.tsx:53` | `onShowAll` -> `App.tsx:1128` closes + `guardedNavigate('/settings')` | opens at Settings top, not at the keys category; no `markLink` |
| Unsaved settings confirm | Save & continue / Discard & continue / cancel | `App.tsx:1102-1123` | `settingsActions.current.save()`/`discard()` then `resolvePendingMove` | fired by `moveTo` (`App.tsx:809`), `moveByDelta`, `popGuard` (`App.tsx:118`) |
| Chapter sync consent | Not now / Sync | `components/engine/ChapterSyncConsentDialog.tsx:43,46` -> `App.tsx:1089-1096` | `chapterSyncSetEnabled(false/true)`; preview from `chapterSyncPreview()` (`App.tsx:219`) | shown when `chapterSync.ask` (`useChapterSync`) |
| Engine panel | Audio engine (slide-over) | `components/engine/EnginePanel.tsx:63` | opened by chip, `EnginePanelLink` (EditingCheckPanel, StageEvidence, ProofChapterPage, CheckCard) and `/tracks` redirect (`RetiredTracksRoute.tsx:13`) | |
| Engine panel: link | Link/relink REAPER project | `EnginePanel.tsx:250,275` | `link.onLinkDawFile` = `App.tsx:321 linkDawFile` -> `api.linkDawFile()` then `refreshBootstrap()` | one `usePendingAction` ref shared with Settings |
| Engine panel: check again | Check again | `EnginePanel.tsx:278` | `link.onCheckAgain` = `refreshBootstrap()` -> `api.bootstrap()` | |
| Engine panel: REAPER tools | Link chapters... / Prepare chapter render... / Create chapter regions... / Embed chapter tags... / Cleanup tools... / Retakes on lanes... | `EnginePanel.tsx:196-201` | `setTool(...)` opens dialogs in `components/engine/*Dialog.tsx` | no palette entry for any of them |
| Startup screen | Retry connection / Copy details | `layout/StartupScreen.tsx:71,76` | `retry` (`App.tsx:739`) bumps `retryKey`; copy -> `navigator.clipboard` | shown while `!data` |
| Load error | Retry / (exit label) | `layout/LoadError.tsx:48,53` | page's `retry` / `exit.onClick` | `sayInPlace(message)` + dismisses overlay toast with same text |
| Not found | Go to Production | `layout/NotFoundPage.tsx:18` | `navigate('/', {replace})` | raw router navigate, unguarded |
| Bad address | Open <Page> / Go to Production | `layout/AddressGate.tsx:178,180` | raw `navigate` | also `CheckingBooth` Go to Production (`AddressGate.tsx:~108`), Escape -> `booth.exit` (`AddressGate.tsx:155`) |
| NeedManuscript | Import manuscript | `layout/NeedManuscript.tsx:32` | `onImport` -> `guardedNavigate('/')` (App) | |
| NeedManuscriptImport | (choose button) | `layout/NeedManuscriptImport.tsx` | `useManuscriptImport` -> `manuscriptBeginImport/Preview/Commit/Cancel/State` | opens the file dialog in place, on Script and Story Bible only |
| Project picker | Back / Browse / New project / Open <recent> / Open <running DAW> / Pin / Remove | `components/project/ProjectPicker.tsx:209,223,226,311,247,316,327` | `switchProject`, `selectProjectFolder`, `setProjectPinned`, `removeRecentProject`, `projectRecents`, `projectRunningDaw` | remove has toast Undo (`ProjectPicker.tsx:181`) via App's `notify` queue |
| Mouse buttons 4/5 | (Back/Forward) | `App.tsx:496-510` | `guardedBackRef/guardedForwardRef` | ignored while a dialog is open (`isModalOpen`) |
| popstate guard | (browser/system Back) | `App.tsx:127-145` | stops the pop while Settings is dirty, asks via `pendingMove` | |

### 1.2 Command catalog (every `COMMAND_CATALOG` row; keys are defaults, `Mod` = Ctrl, Cmd on macOS)

Columns: id (catalog line) | label | scope | default keys | group | surfaces | handler (file:line) | availability. `J`=jumpMenu, `H`=help (shortcut sheet), `S`=settings key list.

| id | Label | Scope | Keys | Group | Surf. | Handler | Availability |
| - | - | - | - | - | - | - | - |
| nav.back :60 | Back | global | Alt+Left, BrowserBack, Mod+[ | Go to | J H S | `App.tsx:515` -> `guardedBack` (`App.tsx:843`); jump row `shellCommands` `App.tsx:576` | no-op unless `history.canGoBack`; jump reason "No earlier page in this project" (`App.tsx:589`); skipped when a dialog is open |
| nav.forward :68 | Forward | global | Alt+Right, BrowserForward, Mod+] | Go to | J H S | `App.tsx:518`; `App.tsx:577` | `canGoForward`; "No later page yet" |
| nav.settings :77 | Open Settings | global | Mod+, | Go to | J H S | key: `App.tsx:547`; **jump row: NO entry in `shellCommands` (`App.tsx:575-585`), the row does nothing** | see 3.1 |
| zoom.in :88 | Zoom in | global | Mod+=, Mod+Shift+=, Mod+NumpadAdd | Zoom | J H S | `App.tsx:522`; `App.tsx:578` -> `useZoom.zoomIn` (`windowSetZoom`) | "Already at the largest size" |
| zoom.out :96 | Zoom out | global | Mod+-, Mod+NumpadSubtract | Zoom | J H S | `App.tsx:525`; `App.tsx:579` | "Already at the smallest size" |
| zoom.reset :104 | Reset zoom to 100% | global | Mod+0, Mod+Numpad0 | Zoom | J H S | `App.tsx:528`; `App.tsx:580` | "Already 100%" |
| workspace.play :112 | Play or pause the chapter | page (noisy) | Space | Editing | H S | `editing/keys/useEditingKeys.ts:131` | `on && play !== undefined`; suppressed while DAW records ("Not while recording.") |
| workspace.word.prev :121 / .next :130 | Previous / Next word | page | Left / Right (repeat) | Editing | H S | `useEditingKeys.ts:125-126` | `on` |
| workspace.paragraph.prev :139 / .next :148 | Previous / Next paragraph | page | Up / Down (repeat) | Editing | H S | `useEditingKeys.ts:127-128` (calls `phrase()`) | `on` |
| workspace.flag.prev :156 / .next :157 | Previous / Next flag | page | [ / ] | Editing | H S | `useEditingKeys.ts:129-130` | `on` |
| editing.word.extend.prev :163 / .next :172 | Extend selection one word left / right | page | Shift+Left / Shift+Right (repeat) | Editing | H S | `useEditingKeys.ts:~170` | `on`, skipped if target owns key |
| editing.phrase.prev :181 / .next :190 | Previous / Next phrase | page | Mod+Left / Mod+Right (repeat) | Editing | H S | `useEditingKeys.ts:~176` | `on` |
| editing.delete :199 | Delete the selected words and audio | page | Delete, Backspace | Editing | H S | `useEditingKeys.ts:132` | `on && remove`; not in drawer |
| editing.mute :207 | Mute the selected words (keep the audio) | page | M | Editing | H S | `useEditingKeys.ts:133` | `on && mute` |
| editing.fx :214 | Add FX to the selected words | page | F | Editing | H S | `useEditingKeys.ts:134` | `on && fx` |
| editing.voice-sample :216 | Mark the selected words as a voice sample | page | V | Editing | H S | `useEditingKeys.ts:135` | `on && voiceSample` |
| editing.takes.next :223 / .prev :225 | Next / Previous take of the line | page | T / Shift+T | Editing | H S | `useEditingKeys.ts:181-186` | `on && takes` |
| editing.keep :233 | Keep the take the keys are on, or open the card of a flagged word | page | Enter | Editing | H S | `useEditingKeys.ts:138` | `on` |
| editing.hide-others :241 | Hide or show the other takes | page | H | Editing | H S | `useEditingKeys.ts:136` | `on && hideOthers` |
| editing.strip :248 | Show or hide the timeline | page | S | Editing | H S | `useEditingKeys.ts:137` | `on && strip` |
| editing.drawer :250 | Open or close the cleanup drawer | page | Mod+Shift+C | Editing | H S | `useEditingKeys.ts:187` | `on && drawer` |
| editing.escape :258 | Close the card, clear the selection, then close the drawer | page | Escape | Editing | H S | `useEditingKeys.ts:147` | `on`; shadowed by script.escape / proof.escape on those pages |
| editing.menu :266 | Open the menu of the cursor word | page | Shift+F10 | Editing | H S | `useEditingKeys.ts:190` | `on` |
| editing.chapter.next :273 / .prev :275 | Next / Previous chapter | page | Alt+Down / Alt+Up | Editing | H S | Editing `EditingBody.tsx:474`/`useEditingKeys.ts:188`; Script `useScriptRegistry.ts:160`; Pickups `PickupsPage.tsx:174` | per page; **Master and Delivery draw "Alt+Up/Down" in their steppers with no handler (3.4)** |
| bookmark.here :287 | Bookmark here | global | B | Bookmarks | H S | `script/bookmarks/model/useBookmarkCommands.ts:48` | `onHere` supplied by Script/Booth only |
| bookmark.next :289 / .prev :297 | Next / Previous bookmark | global | Alt+] / Alt+[ | Bookmarks | H S | `useBookmarkCommands.ts:49-50` | `canStep` |
| script.search.next :309 / .prev :317 | Next / Previous match in the script | page | F3 / Shift+F3 | Script | H S | `useScriptRegistry.ts:164-165` | `find.open` |
| script.prep.prev :325 / .next :334 | Previous / Next prep state of the chapter in view | page | Left / Right | Script | H S | `useScriptRegistry.ts:174-175` | always on Script |
| script.escape :343 | Close Find, or the drawer | page | Escape | Script | H S | `useScriptRegistry.ts:177` | |
| storybible.entry.next :354 / .prev :363 | Next / Previous entry | page | Down / Up | Story Bible | H S | `storybible/EntryTable.tsx:172-173` | |
| proof.note.next :374 / .prev :383 | Next / Previous note | page | Down, J / Up, K | Proof | H S | `proof/useProofKeys.ts:53-54` | |
| proof.chapter.next :392 / .prev :401 | Next / Previous chapter on Proof | page | Right / Left | Proof | H S | `useProofKeys.ts:55-56` | |
| proof.note.hear :410 | Hear the note, 3 s either side | page (noisy) | Space | Proof | H S | `useProofKeys.ts:57` | `selectedId !== null` |
| proof.decide.pickup :419 / .edit :420 / .waive :421 / .defer :422 | Needs pickup / Fix in edit / Fine as read / Defer | page | P / E / W / D | Proof | H S | `useProofKeys.ts:58-61` | `selectedId !== null` |
| proof.escape :424 | Back to all chapters | page | Escape | Proof | H S | `useProofKeys.ts:62-67` | `!allChapters` and no layer open |
| reading.toggle :439 | Record or stop | booth | Space | Booth | H S | `booth/page/useBoothPage.ts:555`; also `booth/CompanionShell.tsx:140` | two registrants (Booth page and Companion) |
| booth.phrase.next :441 / .prev :450 | Next / Previous phrase | booth | Down / Up, Backspace (repeat) | Booth | H S | `useBoothPage.ts:557-558` | |
| booth.word.next :459 / .prev :468 | Next / Previous word in the booth | booth | Right / Left (repeat) | Booth | H S | `useBoothPage.ts:559-560` | |
| booth.roll :476 | Punch and roll from here | booth | R | Booth | H S | `useBoothPage.ts:561` | palette item disabled unless recording (`useBoothPageCommands.ts:72`) |
| booth.view.down :477 / .up :478 | Scroll the text down / up | booth | PageDown / PageUp | Booth | H S | `useBoothPage.ts:562-563` | |
| booth.text.larger :479 / .smaller :481 | Larger / Smaller text | booth | =, NumpadAdd / -, NumpadSubtract | Booth | H S | `useBoothPage.ts:564-565` | plain `=`/`-` here vs Mod+`=`/`-` zoom (`zoom.in/out`) |
| booth.voice-sample :489 | Hear the current speaker's voice sample | booth | V | Booth | H S | `booth/page/BoothNextPage.tsx:535` | |
| booth.exit :496 | Leave the Booth | booth | Escape | Booth | H S | `useBoothPage.ts:566`; `BoothNextPage.tsx:132`; `BoothUnavailable.tsx:24`; `AddressGate.tsx:155` | 4 registrants for the one id |
| booth.pickup.next :497 / .prev :498 | Next / Previous pickup | booth | N / Shift+N | Booth | H S | `booth/pickups/usePickupSession.ts:98-99` | `active` pickup session |
| booth.fullscreen :500 | Toggle full screen | booth | F11 | Booth | H S | `booth/useFullscreenKey.ts:12` -> `toggleFullscreen()` (`api/hostWindow.ts`) | |
| companion.open :503 | Open Companion | global | Mod+Alt+C | Booth | J H S | `App.tsx:617` (key) and `App.tsx:584` (jump) -> `guardedNavigate('/companion')` | no disabled reason without manuscript, though `/companion` redirects to `/` then (`App.tsx:974-978`) |
| help.shortcuts :514 | Show keyboard shortcuts | global | Shift+/ (?) | View | J H S | `App.tsx:533`; `App.tsx:581` -> `setShortcutsOpen(true)` | |
| jump.open :525 | Open the jump menu | global | Mod+K | View | H S | `App.tsx:607` | skipped when a dialog is open; not a jump row (itself) |
| jump.page :533 | Search this page | global | Mod+F | View | H S | `App.tsx:611` (`openJump(..., 'page')`) | context-menu item "Search this page" `App.tsx:647` is the same call |
| history.open :542 | Open the undo history | global | Mod+Shift+H | View | J H S | `App.tsx:614`; `App.tsx:582` -> `openHistoryPanel` | |
| undo.last :552 | Undo the last change | global | Mod+Z (`fieldsKeep`) | Edit | H S | `App.tsx:625` -> `undoLast` (`App.tsx:568`) | allowed when no modal or only the History slide-over is open (`App.tsx:621`); **`shellCommands['undo.last']` (`App.tsx:583`) is unreachable: row not on `jumpMenu` surface** (the palette uses provider `undo.labelled`) |

### 1.3 Jump menu: every row source and target

Static (catalog `jumpMenu` surface, `JumpMenu.tsx:113` `commandsFor('jumpMenu')`): Back, Forward, Open Settings (dead), Zoom in/out/Reset zoom to 100%, Open Companion, Show keyboard shortcuts, Open the undo history. Route: `runCommand(id)` -> `shellCommands.current[id]?.()` (`App.tsx:600`).

Provided by the shell (always registered):

| Command id (line) | Group | Label | Target / action | Disabled when |
| - | - | - | - | - |
| `goto.page./` (`useGoToCommands.ts:38`, pages from `AppShell.tsx:54 shellPages`) | Go to | Go to Production | `guardedNavigate('/')` (`App.tsx:556`) | never |
| `goto.page./schedule` | Go to | Go to Schedule | `guardedNavigate` | `navAvailability` -> no manuscript |
| `goto.page./script` | Go to | Go to Script | same | no manuscript |
| `goto.page./story-bible` | Go to | Go to Story Bible | same | no manuscript |
| `goto.page./booth` | Go to | Go to Booth | same | no manuscript |
| `goto.page./editing` | Go to | Go to Editing | same | no manuscript |
| `goto.page./proof` | Go to | Go to Proof | same | no manuscript |
| `goto.page./pickups` | Go to | Go to Pickups | same | no manuscript |
| `goto.page./master` | Go to | Go to Master & QC | same | no manuscript |
| `goto.page./delivery` | Go to | Go to Delivery | same | no manuscript |
| `goto.page./settings` | Go to | Go to Settings | `guardedNavigate('/settings')`, no `markLink` | never |
| `project.switch` (`App.tsx:561`) | Go to | Switch project... | `setProjectPickerOpen(true)` | never |
| `goto.chapter.<id>` (`useGoToCommands.ts:44`) | Chapters | Go to <chapterName 'full'> | `goToScriptRef` -> `goToScript(id)` -> `guardedNavigate(scriptPath(id))` = `/script#c<id>` | never. Hidden when the page registers `supersedes:['Chapters']` (Production, Script, Editing, Booth, Proof) |
| `settings.category.<id>` x8 (`useShellCommands.ts:36`): recording, speech, voice, models, delivery, project, appearance, app (`settings/registry/categories.ts:5-49`) | Settings | Settings: <category label> | `openSettings(id)` -> `/settings#category-<id>` with `markLink` (`App.tsx:631`) | blocked when a dialog is open; group hidden on the Settings page (`SettingsPage.tsx:167` supersedes 'Settings') |
| `manuscript.import` (`:43`) | Manuscript | Import manuscript... | `guardedNavigate('/')` (`App.tsx:636`), only navigates | when manuscript exists |
| `manuscript.replace` (`:50`) | Manuscript | Replace manuscript... | `openSettings('project')` | when no manuscript |
| `view.theme` (`:58`) | View | Toggle dark theme | `toggleTheme` | never; hint "dark now/light now" |
| `zoom.set.100/110/125/150/175/200` (`:59`, `hooks/useZoom.ts:8 ZOOM_STEPS`) | Zoom | Set zoom to N% | `useZoom.setLevel(factor)` | when already at N% |
| `undo.labelled` (`:70`) | Edit | Undo: <newest journal label> / Undo | `undoLast` (`App.tsx:642` passes `undo`) | "Nothing to undo" until `journalRows` non-empty (null before first read) |

Provided by pages (mounted only on that page):

| Command id | Group | Label | File:line | Action | Disabled when |
| - | - | - | - | - | - |
| `proof.jump.chapter.next/.prev` | Proof | Next chapter / Previous chapter | `proof/useProofKeys.ts:70` | `step(1/-1)` | - |
| `editing.chapter.next.menu/.prev.menu`, `workspace.play.menu`, `editing.voice-sample.menu`, `workspace.flag.next.menu/.prev.menu`, `editing.strip.menu`, `editing.keep.menu`, `editing.hide-others.menu` | Editing | Next/Previous chapter, Play from the cursor or the selection, Mark the selected words as a voice sample, Next/Previous flagged word, Show or hide the timeline, Keep the take the keys are on, Hide or show the other takes | `editing/keys/useEditingKeys.ts:195-215` | same fns as the keys | handler undefined -> row omitted; `!on` -> none |
| `editing.stack.chapter` | Editing | (STACK_TEXT.action) | `editing/stack/useStackRetries.tsx:261` | `requestStack()` | only while `count>0` |
| `options.open.<tool>.<keys>` | (group prop) | Open <title> | `proof/proofOptions/ProofOptions.tsx:128` | opens the options dialog | - |
| `bookmark.go.<id>`, `bookmark.menu.here`, `bookmark.menu.next/.prev` | Bookmarks | per bookmark / Bookmark here / Next bookmark / Previous bookmark | `script/bookmarks/model/useBookmarkCommands.ts:55-72` | go / `onHere` / `step` | `onHere`, `canStep` |

Page commands ("On this page", `usePageCommands`):

| Page | Registered at | Items (group: label -> action; disabled when) |
| - | - | - |
| Production | `production/useProductionPageCommands.ts:34` | no manuscript: Actions: Import manuscript -> `importing.open` (opens dialog; disabled when busy). With: Chapters: <chapter> -> focus pipeline row (supersedes global Go to); Checks: Check recordings -> `check.open(ids)` (disabled: unavailable / still reading / "Every chapter is checked"); Checks: Read the stage suggestions again -> `stages.refresh`; Actions: Export status report -> `report`; Start session -> `session.run`; Stop timer -> `timer.stop` (disabled when none running) |
| Script | `script/page/registry/useScriptRegistry.ts:98` | Search: Next match / Previous match / Clear the search (only when Find open); Chapters: <chapter> -> `goToChapter`; Story Bible: <entry> -> `showEntry`; Mark types: Mark the selection as <type> (disabled without selection). Search sources: manuscript, marks, words (`:81-83`) |
| Story Bible | `storybible/Guide.tsx:341` | Entries: <entry> (aliases as keywords) -> select row; does NOT supersede Chapters |
| Editing | `editing/page/useEditingPageCommands.ts:24,56` | Chapters: <chapter> -> `choose` (supersedes); Selection: Delete / Mute / Add FX (disabled: no selection / refusal); Checks: Check the recording of this chapter (disabled while list loads); Drawer: Open <tab> in the drawer (all tabs except timeline) |
| Booth | `booth/page/useBoothPageCommands.ts:37` | find rows; Chapters: <chapter> (disabled while recording; supersedes); Transport: Record/Stop recording, Punch and roll from here (disabled unless recording), Next phrase, Back one phrase, Start/Stop cold read; Pickups: Next/Previous pickup (when session); Booth: Leave the Booth. Search source: `booth/page/useBoothFind.ts:70` |
| Proof | `proof/useProofPageCommands.ts:29` | Chapters: All chapters, <chapter> (+ "N open notes"; disabled when already showing; supersedes); Selected note: Needs pickup / Fix in edit / Fine as read / Defer (disabled: no selection); Checks: Check recordings [of X] (disabled when DAW unreachable) |
| Pickups | `pickups/usePickupsPageCommands.ts:27` | Pickups: <time - line> -> scope + reveal; Chapter: Show every chapter / Show only <chapter>; Actions: Check recordings, Open N in Booth, Add N as markers in <DAW>. Does not supersede Chapters, so global "Go to <chapter>" (-> Script) also lists |
| Settings | `settings/page/SettingsPage.tsx:167` | `settingsPageItems` (categories + rows); supersedes group 'Settings' |
| Master, Delivery, Schedule | - | none |

### 1.4 Search sources (typed term, >=2 chars)

`useScriptRegistry.ts:81-83` (manuscript text, marks, words), `useBoothFind.ts:70` (booth find), `useBookmarkCommands.ts:89` (bookmarks, group Bookmarks). All others none.

### 1.5 Context menus

Fallback on empty `<main>` space (`App.tsx:650-693`): Go to > (11 pages, current checked, locked ones `unavailable`) | Jump menu... (Ctrl K) | Search this page (Ctrl F) | View > Zoom in / Zoom out / Reset zoom / Use the light|dark theme. Providers: `useEditingWordMenu.ts:52`, `Ribbon.tsx:253`, `useFxWords.tsx:318`, `useBoothPage.ts:606`, `FilesTable.tsx:165`, `useChapterTools.tsx:242`, `useNoteContextMenu.ts:64`, `usePickupsContextMenu.ts:87`, `Guide.tsx:337`, `useScriptRegistry.ts:85`, `bookmarkContextMenu.ts:28`. Provider menus end with the shell tail (Jump menu..., Search this page) unless `tail:false`. Text fields keep the browser menu.

### 1.6 Toasts and their actions

| Toast | Label | File:line | Queue | Action -> call |
| - | - | - | - | - |
| Undo (journal-backed, with `{entry}`) | Undo | `overlay/overlayService.ts:147`; sites: `editing/range/cut/useCutWords.tsx:89`, `useFxWords.tsx:145,230`, `useChooseInDaw.ts:140`, `useReplaceAudio.tsx:123`, `keepTake.ts:75`, `useAcceptWords.ts:76`, `markCommands.ts:124,152`, `useStackRetries.tsx:234`, `EffectSettings.tsx:285`, `useSplitDuplicate.tsx:67`, `booth/page/useBoothPage.ts:383`, `useBoothBookmarks.ts:79,95`, `SchedulePage.tsx:112`, `ProofPage.tsx:341`, `ThreadsTab.tsx:43`, `useScriptData.ts:281`, `PickupsTable.tsx:247`, `useSuspectedPickups.ts:72`, `usePickupSession.ts:134` | overlay | `journal.undo(entry)`; refusal -> second toast with reason. Goes away on `journal.subscribe` (`useUndoToastLifetime.ts:130`) and on any pathname change (`:132`) |
| Undo (journal-backed, NO `{entry}`) | Undo | `script/bookmarks/model/useBookmarks.ts:49` ("Bookmark added."), `usePickupSession.ts:133`, `useSuspectedPickups.ts:73` | overlay | `journal.undo(entryId)` but never settled by `settleUndo`; stays after History/Ctrl+Z undid it, then answers "Already undone." |
| Undo (off-journal private inverse) | Undo | `PickupsTable.tsx:214` (Removed ... from pickups), `booth/suspected/SuspectedLines.tsx:55` (Dismissed.), `proof/inspector/FindingThread.tsx:100` (Deleted the note), `storybible/GuideDetail.tsx:507` (reviewed), `:580` (Merged), `editing/voicesample/useVoiceSample.tsx:135` (voice sample), `storybible/suggested/row/useSuggestionDecisions.ts:32` | overlay | page-private inverse (e.g. `voiceSampleRemove`, `guideUnmerge`, `findingsThread restore`); NOT in History panel, NOT reached by Ctrl+Z / "Undo: ..." |
| Undo (project) | Undo | `project/ProjectPicker.tsx:181` | App `notify` | `undoRemoval(entry)` |
| Undo (chapter sync batch) | Undo | `production/useChapterSyncToast.ts:44` | App `notify` | `chapterSyncUndo(trackGuid)` per link |
| Resume | Resume | `recordingcheck/background/BackgroundChecks.tsx:110` | overlay | `save({background_checks:null})` |
| Check again | Check again | `booth/page/BoothNextPage.tsx:615` | overlay | `control.checkAgain` (re-reads `bootstrap`, `useRecordControl.ts:230`) |
| Retry | Retry | `editing/EditingCheckPanel.tsx:332`, `booth/page/useBoothPage.ts:327`, `settings/page/ScopedFieldsPanel.tsx:99,122` (`primitives/Toast.tsx:12 retryAction`) | App `notify` (Editing check, Settings) / overlay (Booth) | re-run the action |
| Forget the cut | Forget the cut | `editing/range/cut/useCutWords.tsx:162` | overlay | `editingCutRemove` |
| Update available | (none) | `App.tsx:439` | App | text only: "See Settings, About & updates." (no button) |
| Host notice / job ended / live-updates degraded / DAW linked | (none) | `App.tsx:398, 416, 447, 331` | App | `jobEnded.ts` text; `systemNotify` OS notification when unfocused (`App.tsx:421`); degraded text tells narrator to "Reopen the page" (no button) |
| Undo from Ctrl+Z / "Undo: ..." | (info toast "Undid X") | `App.tsx:571` | overlay | after `journal.undoLast()`; History panel's own Undo says it via `overlay.announce` only (`HistoryPanel.tsx:34`) |
| Every toast | Dismiss message | `primitives/Toast.tsx:76` | both | `dismiss(id)` |

### 1.7 Host bindings the shell calls (and every other call site of the same binding)

| Binding | Shell call site | Other call sites (non-test) |
| - | - | - |
| `ready` | `App.tsx:345` (version check vs `DESKTOP_HOST_API_VERSION=147`, `hostApi.ts:2`) | - |
| `bootstrap` | `App.tsx:263 refreshBootstrap`, `:348` | `booth/record/useRecordControl.ts:230,435` (own copy of DAW facts) |
| `reportClientDiagnostic` | `App.tsx:360,369,370` | - |
| `subscribeTranscript` | `App.tsx:391` | - |
| `subscribeNotices` | `App.tsx:397` | - |
| `subscribeJobEnded` | `App.tsx:415`; `studio/slots.ts:37` (chapters slot) | `delivery/page/useDeliveryChecks.ts`, `useDeliveryBuild.ts`, `storybible/suggested/panel/useSuggestions.ts`, `storybible/Guide.tsx`, `script/page/data/scriptData.ts` |
| `systemNotify` | `App.tsx:423` | - |
| `subscribeUpdate` | `App.tsx:438` | `settings/UpdatesPanel.tsx` |
| `subscribeLiveUpdateHealth` | `App.tsx:447` | - |
| `subscribeProjectAttach` | `App.tsx:455`; `studio/StudioProvider.tsx:68` (store.reset + journal.clear) | `booth/record/RecordSetup.tsx`, `script/page/data/scriptData.ts` |
| `settingsForScope('project')` | `App.tsx:483` (palette colours -> CSS vars) | 20 other files; palette map duplicated at `settings/data/settingsForms.tsx:26` |
| `linkDawFile` | `App.tsx:324` (engine panel + Settings) | `booth/record/RecordSetup.tsx:138` (separate handler, no shared pending ref, no `refreshBootstrap`) |
| `chapterSyncState`, `subscribeChapterSync` | `App.tsx:210` via `hooks/useChapterSync.ts` | second independent subscription in `production/useChapterSyncToast.ts:26` |
| `chapterSyncPreview`, `chapterSyncSetEnabled` | `App.tsx:220,1092,1096` | `engine/ChapterSyncPanel.tsx`, `engine/EnginePanel.tsx` |
| `manuscriptChapters` | `App.tsx:541` via `studio/slots.ts:26` slot `chapters`; also `useNavCounts.ts:44` | 20 more: EditingPage, useBoothData, CompanionPage, EnginePanel, ChapterLinksTable, RetailSamplePanel, MasterPage, usePipelineSources, useChapterTools, ProofPage, ProofChapterPage, PreviewPanel, PickupsPage, Guide, scriptData, CheckRecordingsDialog, ... |
| `findingsSummary` | `components/layout/useNavCounts.ts:34` | `proof/ProofPage.tsx:213` |
| `pickupsList` | `useNavCounts.ts:40` | `pickups/useOpenPickups.ts`, `PickupsPage.tsx`, `ProofPage.tsx:200`, `usePickupSession.ts`, `markCommands.ts:140` |
| `measureState` | `useNavCounts.ts:44` | `DeliveryPage`, `useDeliveryChecks`, `MeasureRun`, `usePipelineSources`, `useProofingRender` |
| `subscribePickups` | `useNavCounts.ts:50` | `useOpenPickups`, `usePickupsState`, `ports/daw.ts` |
| `windowZoom`, `windowSetZoom`, `windowSaveZoom` | `hooks/useZoom.ts` | `settings/controls/AppearanceBodies.tsx:125-163 ZoomRowBody` (separate state + separate step list) |
| `transcriptReset` | `App.tsx:725,815,839` | `proof/CompareRun.tsx` |
| `subscribeAudacityLink`, `audacityLink` | `App.tsx:294`, `useAudacityLink()` | `engine/AudacityLinkCard.tsx` |
| `recorderState`, `subscribeRecorderState` | `useRecordingEngine` (`booth/useRecorder.ts:6`) | `useRecorder`, `proof/NativeTakesPanel.tsx` |
| `dawCapabilities`, `subscribeDawCapabilities`, `subscribeDawTransport` | `daw/dawSession.ts` (via `ApiContext.tsx:19`) | `useFxWords`, `ports/*` |
| `dawLastAction` | `studio/StudioProvider.tsx:95-97` (journal DAW refusal) | `ports/daw.ts` |
| `switchProject`, `selectProjectFolder`, `createProject`, `projectRecents`, `projectRunningDaw`, `setProjectPinned`, `removeRecentProject` | `project/ProjectPicker.tsx`, `NewProjectDialog.tsx` | - |
| `companionModeEnter/Exit` | - | `booth/CompanionShell.tsx` only |

`api/ApiContext.tsx` (`useApi`) is the one injection point; `api/wailsClient.ts:330` is the Wails implementation (454 top-level members), `api/mockApi.ts` composes `api/mockHost/*` (project, settings, update, system, manuscript, assets, series, proofing, credits, ...). Parity is enforced by the `NarrationApi` type and `api/wireContracts.test.ts`, not by call sites.

Bindings with 0 call sites outside `api/`, tests and fixtures (44 of 454): `assetsVerify chapterSuggestion chapterTrackMapClear chaptersForTracks dawPreviewFileRange dawRevealFile findingsGoToRead findingsLoopRead findingsReaperStatus manuscriptReader manuscriptSearch masteringChooseProvider pickupsNext productionBurndown projectStateState recorderChooseEngine recorderMeterStart recorderMeterStop recorderStart recorderStop replaceNarratorRemove seriesDelete seriesList seriesSave subscribeDawProjectState subscribeRecorderLevel systemCopyDiagnostics systemOpenLogFolder takeComparisonCancel takeComparisonStart takeComparisonState takeReviewCreateTake takeReviewScanCancel takeReviewScanStart takeReviewScanState teleprompterPunch teleprompterPunchPreview transcriptAddEquivalence transcriptJump ttsCatalog ttsRemove whisperCatalog whisperRemove workspaceTakesCompareStart`. Each is referenced only by `api/`, a contract test, or an interaction-feedback catalog row. 259 more have exactly one calling file.

## 2. Capability tags (reachable from more than one place)

For each: locations, implementation, shared or separate, can they disagree.

### C1. Navigate to a page

- Locations: rail `AppShell.tsx:248` (`go` -> `navigate` prop = `guardedNavigate`); drawer (same markup); jump menu `goto.page.<path>` (`useGoToCommands.ts:38`); right-click Go to (`App.tsx:655`); page buttons that call `go/goTo/navigate` props; raw `<Link>`/`navigate` (section 3.S6); Back/Forward keys/mouse.
- Implementation: rail, jump menu and context menu share `shellPages()` (`AppShell.tsx:54`) -> `navAvailability(path, {hasManuscript, dawFileLinked})` (`navigation/navAvailability.ts:30`), all fed by `data.manuscript`/`data.dawFileLinked` from App's bootstrap. All three route through `guardedNavigate`.
- Disagree? Availability: no (one table, one input), except (a) `dawFileLinked` is passed everywhere but no path lists a `dawFile` precondition, dead input; (b) pages not in the table (`/companion`, `/tracks`) have no lock; (c) rail says unlocked when `data.manuscript` exists but the page decides again (ScriptPage shows NeedManuscript when `listable.length===0`, `ScriptPage.tsx:95`). Guarding: raw `Link`s skip the Booth leave guard and dirty-Settings prompt.

### C2. Navigate to chapter X (Editing / Proof / Booth / Script)

- Locations: jump "Go to <chapter>" (global provider, goes to **Script** `/script#c<id>`, `App.tsx:807`); page-registered "Chapters" rows on Production (focus row), Script, Editing (`navigate /editing/:id` with replace, `App.tsx:1177`), Booth (`changeChapter`), Proof (`choose`); in-page `ChapterStepper` on Editing (`EditingPage.tsx:160`), Booth (`BoothNextPage.tsx:663`), Proof (`ProofPage.tsx:444`), Master (`MasterPage.tsx:241`), Pickups (`PickupsTable.tsx:298`); keys `editing.chapter.next/prev`, `proof.chapter.next/prev`; address builders (`navigation/address.ts:90`); `ChapterLinksTable.tsx:206` -> raw `/proof/<id>`.
- Implementation: separate. Global list = store slot `chapters` (`studio/slots.ts:26`, refreshed on `job:ended`, `MANUSCRIPT_CHANGED`, window focus, `App.tsx:541` load on project change); each page reads `manuscriptChapters()` itself on mount (20 sites) and filters to `contentKind==='narration'` (Editing `EditingPage.tsx:114`, Booth `useBoothData.ts:78`, Proof `ProofPage.tsx:84`, Pickups `PickupsPage.tsx:25`, Master `MasterPage.tsx:93`, Script `ScriptPage.tsx:86`). The global provider gets the unfiltered slot (`App.tsx:544`), as does `AddressGate` (`App.tsx:785`).
- Disagree? Yes. (1) The palette lists reference/removed/front-matter chapters the pages hide, and always lands on Script. (2) A chapter added/changed by a page without `publish(MANUSCRIPT_CHANGED)` appears on that page and not in the palette until focus/job end. (3) Proof has two chapter addresses: `/proof/:chapterId` (ChapterLinksTable, `App.tsx:928`) and `/proof?chapter=` (`address.ts:100`). (4) `AddressGate` accepts any id in the slot, including non-narration ones the page then rejects. (5) Editing's own chapter hop uses raw `navigate` (replace) so Back skips chapters, whereas palette Go to chapter pushes.

### C3. Undo

- Locations: Ctrl+Z (`App.tsx:625`), jump "Undo: <label>" (`useShellCommands.ts:70`), History slide-over row buttons (`HistoryPanel.tsx:58`), toast "Undo" buttons (1.6), DAW's own Edit > Undo (journal refusal text), per-page inverses (3.S3).
- Implementation: Ctrl+Z and palette share `undoLast` (`App.tsx:568`: reads `entries()[0]` then `journal.undoLast()`, toast "Undid <label>"); History row calls `journal.undo(id)` and announces instead of toasting; journal-backed toasts call `journal.undo(entry)`; off-journal toasts call private inverses.
- Disagree? Yes. (a) Two sources of "what is newest": palette label from `useJournalEntries` state (async, null first), `undoLast` re-reads at press time, so label and what is undone can differ if the journal changes between. (b) Ctrl+Z undoes the newest journal entry even when the narrator just did an off-journal action (Dismissed, Merged, voice sample), so Ctrl+Z undoes something older. (c) Toasts without `{entry}` outlive their change. (d) Success feedback differs: toast vs announce-only vs nothing (toast Undo). (e) Ctrl+Z is blocked behind any dialog except History only, but not by the Editing text-field rule when focus is in a non-editable widget (`fieldsKeep` only exempts `EDITABLE`).

### C4. Open Settings (and a category)

- Locations: rail `AppShell.tsx:268` (plain); Ctrl+, `App.tsx:547` (markLink); jump "Go to Settings" (plain, `App.tsx:556`); jump "Open Settings" (dead); jump "Settings: <category>" x8 (markLink + `#category-<id>`); "Replace manuscript..." -> `settings#category-project`; context menu Go to > Settings; `ShortcutSheet` "Show all shortcuts" (plain `/settings`); page links using `addressPath({page:'settings',anchor})` (credits, cleanup, recording, delivery) via `Link`/`navigate`/`go`; `ScriptPage.tsx:634` raw `navigate('/settings#credits')`; Booth `BOOTH_LINKS.settings#credits`.
- Implementation: `SettingsPage` reads `initialCategory={SETTINGS_ANCHORS[location.hash]}` (`App.tsx:1059`) and `cameFrom={settingsOrigin.origin}` ("Back to <page>").
- Disagree? Which route shows "Back to <page>" depends on whether `markLink()` was called or a hash exists (`hooks/useSettingsOrigin.ts:252`): rail, "Go to Settings" and the shortcut sheet land with no Back; Ctrl+, and category rows get one. `SETTINGS_ANCHORS` (`App.tsx:86`) and `address.ts:211 SETTINGS_ANCHORS` are two separate lists (the latter has no `category-*`).

### C5. Open the engine panel / link the DAW / "check again"

- Locations: header chip, `EnginePanelLink` in 4 pages, `/tracks` redirect, Settings DAW category (`EngineBody.tsx`, calls `onLinkDawFile` and `launchDaw`), Booth RecordSetup (`RecordSetup.tsx:138`, own `linkDawFile`), Booth "Check again" toast/CheckLine (`useRecordControl.ts` re-reads `bootstrap`), Engine panel "Check again" (`App.tsx:1077` `refreshBootstrap`). No jump-menu command.
- Implementation: App's `data` (bootstrap snapshot refreshed on DAW cap change, Audacity link change, window focus >=2 s apart, project attach: `App.tsx:278-313`) feeds chip, engine panel and rail locks; Booth keeps its own bootstrap copy (`useRecordControl.ts:225-243`) re-read on `reads`/`reachable` and on every record start (`:435`).
- Disagree? Yes. Linking in the Booth updates the Booth's copy only; App's `data.dawFileLinked` stays stale until a focus/cap-change/attach refresh (no `onChanged` -> `refreshBootstrap`). The chip is hidden inside the Booth so the stale chip appears on return. EngineChip decides `builtin` from `useRecordingEngine` + `daw==='none'`; link status from `data` or `audacityLink`, DAW name from `dawSession` caps: three inputs.

### C6. Import / replace manuscript

- Locations: Production empty state + import button, `NeedManuscript` buttons on Proof/Schedule/Editing/Booth/Master/Delivery/Pickups (navigate to `/`), `NeedManuscriptImport` on Script and Story Bible (in-place dialog), jump "Import manuscript..." (navigates to `/` only, `App.tsx:636`), Production page command "Import manuscript" (`useProductionPageCommands.ts:38`, opens dialog), jump "Replace manuscript..." (Settings > Project), Settings ProjectDataPanel (clear/replace).
- Implementation: one flow `useManuscriptImport` (`production/ManuscriptImport.tsx`), triggered differently; shell command does not start it.
- Disagree? Behaviour differs by entry (opens dialog vs only navigates). Two same-named palette rows when on empty Production ("Import manuscript" page row vs "Import manuscript..." shell row).

### C7. Export

- Locations: Production "Export status report" (page command only), `deliveryExportReport`, `exportStart` in Delivery/Master, `pickupsExport` Proof sheet, `transcriptExportMarkers`. Shell has no export command.

### C8. Play / stop / record

- Locations: Space = `workspace.play` (Editing, noisy), `proof.note.hear` (Proof, noisy), `reading.toggle` (Booth and Companion, not noisy); palette "Record/Stop recording" (Booth), "Play from the cursor or the selection" (Editing provider); Pickups `usePlayOriginal`; engine panel `useTrackPlayback`/`useRangePlayer`; Proof Preview. No global play/stop command and no shell control.
- Disagree? Same key, three meanings by page; "Not while recording." only for `noisy` rows; `reading.toggle` is not noisy by design.

### C9. Nav counts and availability vs the pages they point to (details in section 3.S1)

- Locations: `useNavCounts.ts` badges (Proof, Pickups, Master & QC); `navAvailability` locks. The pages: `ProofPage.tsx:407`, `PickupsPage.tsx`, `masterqc/page/*`, Production pipeline QC cell (`usePipelineSources.ts:34`).
- Implementation: separate reads and separate arithmetic; see S1.

### C10. Theme, zoom

- Theme: rail foot, jump "Toggle dark theme", context View, Settings Appearance radio group (`AppearanceBodies.tsx:25`). All write `ThemeContext.setPreference` (shared). Labels differ ("Dark theme/Light theme", "Toggle dark theme", "Use the light/dark theme"); the toggles flatten `system`.
- Zoom: Ctrl +/-/0, jump rows (3 catalog + 6 "Set zoom"), context View, header chip, Settings `ZoomRowBody`. State: `useZoom` (App) vs `ZoomRowBody` (own `useState`, own `ZOOM_LEVELS`, `windowSaveZoom` immediately) vs host `bindings_window.go zoomSteps` (three copies of the list). `useZoom` persists after 500 ms debounce, Settings immediately. Sync only through the `resize` event.

### C11. Jump menu / search

- Locations: header button, Ctrl+K, Ctrl+F (page scope), context menu items, zoom chip (opens at 'Zoom' group). All `openJump` (`App.tsx:597`).

### C12. Project switch

- Locations: header project name, jump "Switch project...", startup picker (no project), `NewProjectDialog`. All end in `useProjectPicker` (`App.tsx:260`) + `subscribeProjectAttach` clearing journal/store/undo toasts.

### C13. Toasts / errors

- App `notify` prop (most pages' errors, settings, project, chapter sync) vs overlay `toast` (editing, booth, bookmarks, undo, `useErrorToast`). Two live-region pairs, two stacks, two dedupe rules. `sayInPlace` and `LoadErrorPanel` cross-clear (`LoadError.tsx:44`) but `useErrorToast` toasts are in the overlay queue only (the panel dismisses them explicitly, App's `notify` ones via `sayInPlace`).

## 3. Suspicious controls and risks

### S1. Nav counts and availability vs pages (highest risk)

1. **Proof badge undercounts versus Proof's own "open".** `useNavCounts.ts:35` `proofProgress(summary, 0).open` ignores open pickups; `ProofPage.tsx:407-412` `proofProgress(summary, openPickupsBeyondNotes(pickups[, scope])).open` adds pickups that no note stands for. The comment at `proof/proof.selectors.ts:4` claims "the Proof page, the rail badge and the companion all read" it. Inputs: nav = `findingsSummary()` only; page = `findingsSummary()` + `pickupsList()` (+ per-chapter finding rows in chapter view).
2. **Master badge counts differently from the Master page.** `useNavCounts.ts:46` `masterByChapter([...all chapters, ...CREDITS_FILE_CHAPTERS], job.files)` counts `qc==='FAIL'` per chapter id including `reference`/non-narration chapters; `MasterPage.tsx:93` filters narration, and the page's failing list comes from `packageCounts` (`masterqc/page/packageItems.ts:94`) and file rows (`masterqc/files/rows.ts:140`), which also list "strays" (files no chapter claims) that the badge cannot count. Verdict function is shared (`master/fileVerdict.ts`), pairing is not (`masterByChapter` vs `buildChapterRows`).
3. **Badges refresh only on `pathname` change, `subscribePickups`, and Proof/Pickups' `onPickupListChanged`** (`useNavCounts.ts:61`). A measurement finishing on Master, a finding dismissed from Booth (`SuspectedLines.tsx` `findingsReview`), an import (`job:ended`) or a chapter-kind change do not refresh; the Master badge is stale until the next page move. No focus refresh (the chapters slot has one).
4. **A failed read silently drops a badge** (`.catch(clear(key))`, `useNavCounts.ts:36,42,49`) so "0" and "unknown" look the same (no badge), contrary to the "can't tell" rule in `definition-of-done.md`.
5. **Each page move fires 4 host reads** (`findingsSummary`, `pickupsList`, `measureState`, `manuscriptChapters`), including every `/editing/:id` chapter hop.
6. **Pickups badge** = `openPickups(list.pickups).length` (all pickups, any chapter kind) vs Pickups page, which filters chapters to narration (`PickupsPage.tsx:25`): a pickup on a hidden chapter counts in the badge only if the page's list includes it; verify.
7. **Locks are bootstrap-based.** `hasManuscript = Boolean(data.manuscript)` (`App.tsx:204,860`). The palette's chapter list is `hasManuscript ? slot : []` (`App.tsx:544`): `hasManuscript` true with an empty slot (read failed: `App.tsx:541` swallows the error) gives a palette with locked-open pages and no chapters.
8. **`dawFile` precondition and the `dawFileLinked` plumbing are dead** (`navAvailability.ts:4,31`, `App.tsx:554,655`, `AppShell.tsx:210`): the table never lists `'dawFile'`, so unlinked projects open Proof/Editing/Booth freely.
9. **Rail shows no lock for `/companion`**, which `companion.open` can reach without a manuscript (`App.tsx:974` silently redirects to `/`).

### S2. Dead or unreachable commands

1. `nav.settings` jump row "Open Settings" (`commands.catalog.ts:77`, surface J): `shellCommands.current` (`App.tsx:575-585`) has no `'nav.settings'` key, so `runCommand` (`App.tsx:600`) is `undefined?.()`: the row closes the menu and does nothing. Only the Ctrl+, key path works (`App.tsx:547`). "Go to Settings" duplicates it functionally.
2. `shellCommands['undo.last']` (`App.tsx:583`) can never run from the menu (`undo.last` lacks the `jumpMenu` surface); the labelled provider row carries `undo` separately.
3. `EngineChip.followingChapter` is never passed (`AppShell.tsx:365-374`), so the tooltip "Linked · following <chapter>" branch is unreachable.
4. `NavButton` `iconOnly` is never set by `AppShell`; the <1360 px icon rail relies on CSS only (`AppShell.tsx:298`, `text-[0px]`), so the component's `iconOnly` tooltip/aria-label branch (`NavButton.tsx:60,99`) is dead code.
5. `ShortcutSheet.onShowAll` goes to bare `/settings` (not `#category-appearance`, where keys live) and never `markLink`s.
6. 44 host bindings with no UI caller (section 1.7), e.g. `recorderStart/Stop`, `teleprompterPunch`, `systemOpenLogFolder`, `systemCopyDiagnostics`, `ttsCatalog`, `whisperCatalog`, `manuscriptSearch`, `pickupsNext`: either retired or never wired; `systemOpenLogFolder`/`systemCopyDiagnostics` look like missing Settings buttons.
7. `help`-only page keys have no palette item: `proof.note.hear`/play on Proof, `editing.mute` (palette has it only via the selection group), `booth.view.*`, `booth.text.*`, `booth.fullscreen`, `booth.voice-sample`.
8. Shell has no palette entry for: open engine panel, link DAW file, check DAW again, chapter sync consent, "Hear/Play", export, "Check recordings" off Production/Proof/Pickups/Editing, project folder/open log, update check, bookmarks off Script/Booth.

### S3. Undo is not one thing

Journal-backed (History, Ctrl+Z, palette, toast) vs off-journal toasts (Pickups remove, Dismissed, Deleted note, Merge, Reviewed, voice sample, suggestion decisions, project remove, chapter-sync batch) which only the toast can undo and which disappear on any page change (`useUndoToastLifetime.ts:132`) or after 5 s (`primitives/Toast.tsx:32`; `durationMs` longer only where passed). History keeps 40 entries (`createJournal.ts:76`). No Redo. Toasts built with `{entry}` are retired when the journal drops the entry; three call sites omit it (1.6).

### S4. Stepper tips promise keys that do nothing

`MasterPage.tsx:241` passes `stepKeys={['Alt+Up','Alt+Down']}`; no `useCommand('editing.chapter.*')` exists in `components/masterqc/` (grep). The primitive's own comment (`primitives/ChapterStepper.tsx:34`) says a tip must never promise a shortcut that does nothing.

### S5. Duplicate labels or icons for different functions

- "Next chapter"/"Previous chapter": catalog `editing.chapter.*` (Editing, Script, Pickups), `proof.chapter.*` ("... on Proof"), provider `proof.jump.chapter.*`, provider `editing.chapter.*.menu`; same label, different pages and different next-step semantics.
- "Next phrase" = `editing.phrase.next` (Mod+Right) and `booth.phrase.next` (Down); "Back" (nav.back) vs "Back to all chapters" (proof.escape) vs ProjectPicker "Back" vs Settings "Back to <page>".
- "Check recordings" in four pages with four wordings ("Check the recording of this chapter", "Check recordings of <X>", "Check recordings") and different disabled reasons.
- "Import manuscript" vs "Import manuscript..." (shell navigates, page opens dialog).
- Theme toggle: "Dark theme"/"Light theme" (rail) vs "Toggle dark theme" (jump) vs "Use the light/dark theme" (context) vs Settings radio.
- Icons: Reset zoom button uses the Undo glyph (`AppearanceBodies.tsx:163` `action="undo"`); `retry` icon labels both "Punch and roll from here" (Booth) and "Read the stage suggestions again" (Production); `record` icon for Proof "Needs pickup", Pickups "Open N in Booth", Production "Start session" and Booth Record; `next` icon for Proof "Defer"; `goToChapter` icon on Pickups "Show only <chapter>" and Proof "All chapters" (filters, not navigation); `locate` for pickup rows and Story Bible entries; Production rail icon is a house while the palette calls it "Production".
- Same catalog id registered by several components: `booth.exit` x4, `reading.toggle` x2, `editing.chapter.next/prev` x4 (last mount wins in `handlers` map, `router.tsx:97`).

### S6. Navigation that bypasses `guardedNavigate`

Raw router calls skip the Booth leave guard and the dirty-Settings prompt: `App.tsx:1177` (Editing chapter replace), `App.tsx:722,759`, `AddressGate.tsx:138,178,180`, `NotFoundPage.tsx:18`, `PreviewPanel.tsx:180`, `ProofChapterPage.tsx:141`, `ScriptPage.tsx:95,338,634`, `useDeepLink.ts:66,72`, `ChapterLinksTable.tsx:206`, `BoothNextPage.tsx:213` (passes `navigate`, check), plus `<Link>`: `CheckResult.tsx:147,178`, `ResumePrompt.tsx:264,374`, `TakeReviewPickups.tsx:17`, `PickupListCount.tsx:19`, `CreditsRowPanel.tsx:69,92`, `FindingRow.tsx:43`, `ProofChapterPage.tsx:129,164`. The popstate guard covers only Back/Forward, not these push navigations away from dirty Settings (links from Settings itself use `go`).

### S7. Two chapter-sync consumers, two bootstraps, two zoom lists

Covered in C5, C10, 1.7. Also `useChapterSync` is instantiated in App (`App.tsx:210`) and in Production (`useChapterSyncToast.ts:26`): two subscriptions to `chaptersync:state`, with the consent prompt and the batch toast reading different instances.

### S8. Shell inputs that only work by accident

- `popGuard` listener ordering relies on module load order (`App.tsx:114-117`).
- `undoLast` reads `entries()` before `undoLast()` (`App.tsx:569-571`) so the toast label can be wrong when the journal moves in between.
- `shellDisabledReasons` is evaluated once per menu open (`JumpMenu.tsx:110,276` eslint-disable), so Back/Undo/zoom reasons go stale while the menu is open (e.g. after Undo from inside it the menu closes anyway; Zoom group opened from the chip is not refreshed after a "Set zoom").
- `useNavCounts` swallows errors; `studio.load('chapters')` swallows errors (`App.tsx:541`); `useZoom` swallows host errors (no feedback if `windowSetZoom` fails; chip stays on the old value).
- App palette colours are applied only for project scope at start (`App.tsx:483`, `[api, hasBootstrap]`); `settingsForms.tsx:26` applies them on every Settings read, with its own copy of the variable map.
- Booth shell: when `/booth` with manuscript, the shell renders no header, rail, engine chip, zoom chip or jump button; Ctrl+K / Ctrl+, / zoom keys remain the only ways to the shell.
