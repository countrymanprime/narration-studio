# Studio shell and registries

The shell is the frame every page draws inside: the rail, the header, the jump menu, the context menu, the history panel and the overlay layer. Pages do not build these. They register commands, search sources and context-menu providers, and the shell reads the registries. Paths below are under `apps/ui/src/`.

## What lives where

| Part | Where | Decision |
| - | - | - |
| Command catalogue (static data) | `input/commands.catalog.ts` | [ADR 0361](../adr/0361-app-commands-go-through-one-registry-and-keyboard-midi-and-hid-are-input-sources-bound-by-a-remappable-keymap.md), [ADR 0780](../adr/0780-the-jump-menu-context-menus-and-help-are-derived-from-the-static-command-catalogue-and-dynamic-commands-come-from-providers.md) |
| Router, scopes, keymap, input sources | `input/router.tsx`, `input/scopes.ts`, `input/keymap.ts`, `input/*Source.ts` | ADR 0361 |
| Provided (dynamic) commands | `input/commandProviders.ts` | ADR 0780 |
| Search sources | `registries/search.ts` | ADR 0780 |
| Context-menu providers | `registries/context.ts`, `components/layout/ContextMenuHost.tsx` | ADR 0780 |
| Overlay service and host | `overlay/` | [ADR 0781](../adr/0781-an-overlay-service-opens-dialogs-confirms-toasts-and-announcements-imperatively-and-renders-them-in-the-existing-primitives.md) |
| Shell, rail, header | `components/layout/AppShell.tsx` | [ADR 0407](../adr/0407-a-new-page-replaces-its-old-counterpart-in-the-same-change-and-the-navigation-is-grouped-by-production-stage.md), [ADR 0802](../adr/0802-schedule-and-delivery-are-pages-with-their-own-rail-items.md) |
| Layout widths | `layoutBreakpoints.ts`, `hooks/useLayoutClass.ts` | [ADR 0761](../adr/0761-layout-rules-read-the-reported-width-the-icon-vocabulary-is-a-data-module-and-key-caps-are-pictures-in-a-new-keycap-leaf.md) |
| Undo history panel | `components/layout/HistoryPanel.tsx` | [ADR 0771](../adr/0771-undo-is-one-in-memory-journal-that-refuses-with-a-reason-and-reaches-the-daw-only-for-its-last-action.md) |

`App.tsx` wires the shell: it mounts the overlay provider, registers "Go to" commands, opens the jump menu and the history panel, and maps catalogue ids to the actions the jump menu runs (`shellCommands` in `App.tsx`). `main.tsx` mounts `LiveCommandRouter`.

## Commands and keys

`COMMAND_CATALOG` is a list of `CommandDescriptor` rows: `id`, `label`, `scope`, `defaults` (gestures), and optional `group`, `hint`, `surfaces`, `noisy`, `shadows` and `fieldsKeep`. A feature never listens for a key. It calls `useCommand(id, handler, enabled)` (`input/useCommand.ts`), and the router calls the handler.

How the router (`CommandRouter` in `input/router.tsx`) picks a command for a gesture:

1. Scopes come from the mounted `CommandScope` boundaries. A dialog or the Booth takes the surface from `page`; `global` is inactive behind a dialog (`activeScopes`). Priority is `dialog`, `booth`, `page`, `global` (`SCOPE_PRIORITY` in `input/scopes.ts`).
2. A plain key (no modifier) stays with a focused field or widget (`isGuardedTarget` in `input/targets.ts`). A focused button owns only Space and Enter.
3. The first command bound to the gesture in an active scope with a registered handler runs. A `shadows` entry lets a page row take a gesture from a global row on its own page (`script.find` and `proof.find` shadow `jump.open` on Ctrl+F).
4. A `noisy` command is consumed but does not run while the DAW reports recording; the router announces "Not while recording." `LiveCommandRouter` supplies the recording state (`input/useDawRecording.ts`) and the narrator's keymap (`input/useUserKeymap.ts`).
5. `fieldsKeep` rows (Ctrl+Z) step aside inside a text field and run everywhere else.

Gestures reach the router through `InputSource`: `KeyboardSource`, `MidiSource` and `HidSource` in `input/`. The keymap is the catalogue defaults with the narrator's `Keymap.overrides` setting on top (`keymapFromOverridesText`). `findConflicts` reports two commands on one gesture in scopes that can be active together (`scopesOverlap`); a `shadows` pair is not a conflict. F13 to F24 are unbound by default, for pedals.

## Jump menu

`openJumpMenu` (`components/layout/JumpMenu.tsx`) opens the menu as an overlay dialog. Three kinds of row, filtered by the typed term:

| Row | Source |
| - | - |
| Catalogue commands | `commandsFor('jumpMenu')` in `input/surfaces.ts`; the key cap is the first binding in the narrator's keymap |
| Provided commands | `providedCommands()` in `input/commandProviders.ts`, asked once each time the menu opens |
| Search hits | `searchAll(term)` in `registries/search.ts` |

With no term the menu shows one row per group, and a group opens to its commands. A leading `>` lists commands only. Ctrl+K opens the menu from anywhere; Ctrl+F does on every page except Script and Proof. The header's "Jump to or run…" button opens it too.

A provided command carries no key. `providedCommands` throws when a result has `defaults` or reuses a catalogue id. `useGoToCommands` (`components/layout/useGoToCommands.ts`) registers "Go to <page>" and "Go to <chapter>" this way; the Editing page, Proof and the bookmark commands register their own.

## Search sources

A `SearchSource` is `(term) => SearchHit[]`, answered from memory. `searchAll` trims the term, queries nothing under two characters, calls every source in registration order and skips a source that throws, with a console warning. A feature registers with `useSearchSource`. The Script page registers four (`manuscriptSource`, `entriesSource`, `marksSource`, `wordsSource` in `components/script/page/registry/searchSources.ts`), and the bookmark commands register one.

## Context menus

`ContextMenuHost` wraps the content of `<main>` in the `ContextMenu` primitive. On open it asks the registered providers (`contextItemsFor` in `registries/context.ts`); the first provider whose `match(target)` is true supplies the items. Then it appends the shell's tail, unless the provider sets `tail: false` (a picker). With no provider, the shell's `fallback` menu answers (empty space: where to go, the jump menu). With neither, the browser's menu stays, as it always does in a text field. The Menu key and Shift+F10 arrive as a `contextmenu` event on the focused element, so the host binds no key. Pages register with `useContextProvider`.

## Help as data

The shortcut sheet (`components/help/ShortcutSheet.tsx`, opened by `help.shortcuts`, Shift+/) and the Settings key list (`components/settings/page/KeysPanel.tsx`) read `commandsFor('help')` and `commandsFor('settings')`. Key caps come from the narrator's keymap through `input/hints.ts`. The Booth and Proof footers are built from `FOOTER_SPECS` in the same file. A row added to the catalogue with `surfaces` shows on every surface it names with no other edit. Provided commands never reach the help or settings surfaces.

## Overlays

`overlay` (`overlay/overlayService.ts`) is the one service; `createOverlayService` makes a separate one for a test or story. It holds state and draws nothing:

| Call | Result |
| - | - |
| `confirm(spec)` | `Promise<boolean>`, drawn as a `ConfirmDialog` |
| `open(spec)` | A `dialog` or `slideOver`; returns the close function |
| `toast(text, options)` | At most four at once. A newer message on the same `topic`, or with the same text, replaces the old one. `dismissTopic` removes one that stopped being true |
| `toastUndo(text, undo)` | A toast with an Undo action; a refusal shows its reason as a toast |
| `announce(text)` | Text for the polite live region `OverlayHost` renders |

`OverlayHost` reads the snapshot and draws it with the existing primitives (`ConfirmDialog`, `Dialog`, `SlideOver`, `ToastRegion`), so focus return, stacking and Escape stay with the primitives ([ADR 0048](../adr/0048-every-dialog-is-one-modal-shell-and-confirms-are-alert-dialogs.md)). `App.tsx` mounts `OverlayProvider` once, and `useOverlay()` returns the service.

## History

Two histories exist. Page history (`hooks/useAppHistory.ts`) is Back and Forward over the app's own page moves; `App.tsx` wraps it in the unsaved-changes and leave guards. The undo history is the journal (`studio/journal/createJournal.ts`; rules in ADR 0771 and [UI state and the command journal](ui-state-and-journal.md)). The header's Undo button and Ctrl+Z (`undo.last`) call `journal.undoLast()`; History and Ctrl+Shift+H (`history.open`) call `openHistoryPanel`, a slide-over titled "Undo history" (`components/layout/HistoryPanel.tsx`). The panel lists `journal.entries()` newest first, through `useJournalEntries`. A row the journal would refuse shows the journal's sentence and its Undo is off. The journal keeps the last 40 entries (`JOURNAL_LIMIT`).

## The rail and the header

`AppShell` takes its state as props; it reads no host data. The rail has these groups (`NAV_GROUPS`), then a foot with the theme toggle and Settings:

| Group | Pages |
| - | - |
| Production | Production (`/`), Schedule |
| Prep | Script, Story Bible |
| Record | Booth |
| Edit | Editing |
| Review | Proof, Pickups |
| Finish | Master & QC, Delivery |

`shellPages` feeds the "Go to" commands from the same list. The Proof and Pickups items show a count badge only when `useNavCounts` has a count from the host ([ADR 0725](../adr/0725-the-rail-draws-a-count-badge-only-from-a-count-the-host-reports-and-the-product-is-named-studio.md)); a missing or zero count draws none. An item can be gated on a manuscript or a linked DAW file (`requiresManuscript`, `requiresDaw`); no item sets either. The Booth route replaces the whole shell with a bare `<main>` when a manuscript exists.

The header holds Back and Forward, the project name, the jump menu button, Undo and History, a running timer chip, the zoom group and the engine chip.

## Layout bands

`layoutBreakpoints.ts` holds the widths in CSS pixels and `layoutClassFor` turns a width into four flags:

| Flag | True when |
| - | - |
| `railCollapsed` | width below 1360 (`RAIL_COLLAPSE_BELOW`) |
| `medium` | width 1280 or less (`MEDIUM_MAX`) |
| `narrow` | width below 1180 (`NARROW_BELOW`) |
| `tiny` | width below 860 (`TINY_BELOW`) |

At 1360 and wider the rail is 216 px with labels. Below that it is 64 px of icons and opens over the page on hover or keyboard focus. Below Tailwind's `md` width the rail is replaced by `NavDrawer`, opened from a header button. `useLayoutClass` follows `LAYOUT_QUERIES` through `matchMedia`; where there is none (jsdom) it returns `FULL_LAYOUT`. Booth and Script call it. CSS cannot read a constant inside a class name, so pages write the width variants out (`min-[1360px]`, `max-[1359px]`) and a test holds them to this vocabulary.

## Rules and the tests that enforce them

| Rule | Enforced by | Decision |
| - | - | - |
| No `keydown` listener outside `input/`, except files listed with a reason | `listenerGuard.test.ts` (`PERMANENT` and `TEMPORARY` lists) | ADR 0361 |
| Default catalogue: unique ids, a label and a default on every row, F13 to F24 unbound, zero conflicts | `input/commands.catalog.test.ts`, `input/findConflicts.test.ts` | ADR 0361 |
| A provided command has no `defaults` and no catalogue id | `input/commandProviders.test.ts` | ADR 0780 |
| Every static row has a `group` and `surfaces`; each surface lists exactly its rows | `input/commands.catalog.test.ts`, `input/surfaces.test.ts` | ADR 0780 |
| No page writes `<ContextMenu>`, `onContextMenu` or a `contextmenu` listener; the ceilings are empty | `contextMenuSites.test.ts` | ADR 0780 |
| `overlay/` imports only `components/primitives/`, React and itself | `overlay/importsPrimitivesOnly.test.ts`, rule `overlay-imports-primitives-only` in `.dependency-cruiser.mjs` | ADR 0781 |
| `registries/` imports no feature folder | rule `registries-import-no-feature` in `.dependency-cruiser.mjs` | ADR 0780 |
| Each dependency-cruiser rule fires on a deliberate violation | `architectureRules.test.ts` | [ADR 0062](../adr/0062-ui-import-rules-are-a-dependency-cruiser-config-and-a-mark-scan-that-name-their-adr.md) |
| Width variants `min-[Npx]` and `max-[Npx]` (N from 860 to 1440) use the eight in the vocabulary, or an `OFF_VOCABULARY` entry that may only shrink | `layoutQueries.test.ts` | ADR 0761 |
| The breakpoint constants, the layout class at each boundary and the complement queries | `layoutBreakpoints.test.ts` | ADR 0761 |
| A page draws a control from a primitive, not a native element; ceilings per file may only fall | `rawNatives.test.ts` | [ADR 0053](../adr/0053-icon-buttons-text-fields-and-selects-wrap-the-native-controls.md) |
| A page asks `icons.catalog.ts` for an action's icon and does not import a glyph; ceilings may only fall | `iconImports.test.ts` | ADR 0761 |
| Every remaining ceiling entry has a reason: `KEPT` (a feature the design leaves as built) or `GAPS` (a page swap left it behind) | `ratchetReasons.ts`, called by `rawNatives.test.ts`, `iconImports.test.ts` and `ports/useApiRatchet.test.ts` | [ADR 0046](../adr/0046-architecture-rules-taken-from-adrs-are-lint-and-test-rules.md) |

ADR 0046 sets the pattern for all of these: a rule taken from an ADR is a lint or test rule that names its ADR.
