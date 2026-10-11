# Studio Next App Shell and Registries: Commands, Keys, Jump Menu, Context Menus, Help and Overlays as Data

**Source:** owner request of 2026-10-10 ([Studio Next Rebuild](studio-next-rebuild.prd.md)); the mock's registries and shell: `studio-next/src/app/`, `studio-next/ARCHITECTURE.md` ("Wire into the shared systems"); the owner's rulings of 2026-10-11 (see Decisions).

**Builds on / extends:** Input Commands and Pedals (old PRD `input-commands-and-pedals.prd.md`, recoverable from git history) and [ADR 0361](../adr/0361-app-commands-go-through-one-registry-and-keyboard-midi-and-hid-are-input-sources-bound-by-a-remappable-keymap.md) (the command registry and keymap, delivered in part), [ADR 0705](../adr/0705-the-workspace-adds-an-effect-to-a-passage-or-a-chain-to-the-chapters-track-only-after-the-narrator-confirms-and-the-host-names-both-targets.md) (`ContextMenu`), [ADR 0048](../adr/0048-every-dialog-is-one-modal-shell-and-confirms-are-alert-dialogs.md), [ADR 0172](../adr/0172-popover-is-an-interactive-layer-above-the-dialog-and-escape-defers-to-the-topmost-one.md), [ADR 0630](../adr/0630-overlays-keep-the-mocks-frame-a-nested-dialog-dims-the-page-and-a-combobox-popup-is-a-listbox-not-a-popover.md) (overlays), [ADR 0407](../adr/0407-a-new-page-replaces-its-old-counterpart-in-the-same-change-and-the-navigation-is-grouped-by-production-stage.md) (navigation groups), [ADR 0725](../adr/0725-the-rail-draws-a-count-badge-only-from-a-count-the-host-reports-and-the-product-is-named-studio.md) (rail counts). It does not replace them; it adds the layers the mock proves and the repo lacks.

**Status (2026-10-11):** draft; the owner's rulings of 2026-10-11 are applied. The Studio Next mock is the only spec for the shell, rail and registries.

## Problem Statement

In the mock, a page adds a command, a key, a right-click menu, a search source or a help row by registering it in one place, and the jump menu (Ctrl+K), the shortcut sheet, the Settings key list and the context menus all follow. In the real app the keymap is a static catalogue of 15 commands, `ContextMenu` is a per-area component with its items written at the call site, there is no jump menu or search, `ShortcutSheet` is its own list, toasts and dialogs are opened by components that own their state, and Undo is per feature. Adding the mock's behaviours page by page would repeat these one-offs unless the registries exist first.

## Evidence

- **Mock registries.** `studio-next/src/app/registry.ts` (`registerContext`, `registerCommands`, `registerSearch`, `registerKeys`); `studio-next/src/app/commands.ts` (global commands: go to page, go to chapter, zoom, theme, undo, history); `studio-next/src/app/palette.tsx` (jump menu); `studio-next/src/app/context.ts` (right-click on anything, `tailItems()`); `studio-next/src/app/help.tsx` (structured shortcut specs); `studio-next/src/app/history.tsx` (undo history list); `studio-next/src/ui/overlay.ts` (modals, popovers, context menu, toasts, announcements).
- **Repo.** `apps/ui/src/input/commands.catalog.ts` (15 rows, scopes `global | page | booth | dialog`), `router.tsx`, `keymap.ts`, `findConflicts.ts`, `useCommand.ts`; `components/help/ShortcutSheet.tsx`; `components/settings/KeyboardPanel.tsx` (remapping); `components/primitives/{ContextMenu,Toast,Dialog,SlideOver,Popover,Tooltip,Listbox}.tsx`; `hooks/{useToasts,useAppHistory}.ts` (`useAppHistory` is navigation Back and Forward, not undo).
- **Rules that bind.** Features never listen to `keydown` for a command (a scan test, [ADR 0361](../adr/0361-app-commands-go-through-one-registry-and-keyboard-midi-and-hid-are-input-sources-bound-by-a-remappable-keymap.md) decision 2); commands are static descriptors; only primitives import Base UI ([ADR 0047](../adr/0047-the-ui-primitives-wrap-base-ui-and-app-code-never-imports-it.md)); stacking order is fixed ([ADR 0047](../adr/0047-the-ui-primitives-wrap-base-ui-and-app-code-never-imports-it.md), [ADR 0172](../adr/0172-popover-is-an-interactive-layer-above-the-dialog-and-escape-defers-to-the-topmost-one.md)).
- **Mock behaviour that already differs.** The mock's page keys are raw `KeyboardEvent` handlers (`registerKeys(page, fn)`), which the repo's scan test forbids.

## Proposed Solution

1. **Extend the command catalogue, not replace it.** A descriptor gains `group` (jump-menu heading), `hint` and `surface` flags (`jumpMenu`, `help`, `settings`). Keys stay in the keymap and handlers stay `useCommand`. A command that depends on data (go to a chapter, go to a bookmark) comes from a **command provider**: `registerCommandProvider(() => Command[])`, whose results appear in the jump menu only and carry no default key.
2. **Jump menu.** A `JumpMenu` built from `Dialog` and `Listbox`: type to filter commands, providers and search sources; arrow keys and Enter; opens on `jump.open` (Ctrl+K) and, outside Script, on Ctrl+F as in `studio-next/src/app/keys.ts`.
3. **Search sources** register by function: `registerSearchSource(term => Hit[])` for manuscript text, Story Bible entries, marks and bookmarks, with the group heading and sub-line as in `studio-next/src/app/search-sources.tsx`.
4. **Context menu providers.** `registerContextProvider(target-matcher, items)`; one `ContextMenuHost` mounted by the shell resolves the target under the pointer (or the focused element for Menu and Shift+F10, including `aria-activedescendant` as the mock does) and renders the existing `ContextMenu` popup. Each menu ends with the shared tail (jump menu, find). Existing per-area `ContextMenu` uses migrate one at a time.
5. **Help as data.** `ShortcutSheet`, the Settings key list and the Booth, Proof and Editing key-hint footers read one structured table derived from the catalogue plus per-surface "hint specs" (which keys a footer shows, in which order).
6. **Overlay service.** `overlay.confirm`, `overlay.toast`, `overlay.toastUndo`, `overlay.announce`, `overlay.open(dialog spec)` as a thin imperative API that renders the existing declarative primitives (`ConfirmDialog`, `Toast`, `Dialog`, `SlideOver`, `Popover`), so a command can open one without being a component, and stacking and focus return stay the primitives' ([ADR 0172](../adr/0172-popover-is-an-interactive-layer-above-the-dialog-and-escape-defers-to-the-topmost-one.md), [ADR 0630](../adr/0630-overlays-keep-the-mocks-frame-a-nested-dialog-dims-the-page-and-a-combobox-popup-is-a-listbox-not-a-popover.md)).
7. **History panel.** A slide-over listing undoable entries (label, whether it touched the DAW, undo refusal reason), backed by the journal in [Domain, State and Wire Contracts](studio-next-domain-state-and-contracts.prd.md), opened from the jump menu and the shell.
8. **Shell.** The rail follows `studio-next/src/app/Shell.tsx`: Production, Schedule, then Prep (Script, Story Bible), Record (Booth), Edit (Editing), Review (Proof, Pickups), Finish (Master & QC, Delivery), with counts only on Proof, Pickups and Master & QC, each from a host-reported count ([ADR 0725](../adr/0725-the-rail-draws-a-count-badge-only-from-a-count-the-host-reports-and-the-product-is-named-studio.md) rule kept). The rail collapses below 1360 CSS px as the mock does. The open-queries badge on Story Bible is not in the mock and goes with the Story Bible swap. The header gains the Undo and History affordances and the engine chip carries the DAW label from capabilities. Schedule and Delivery rail items are added by their page swaps, not here.

## Key Hypothesis

If commands, search, context items and hints are data that a page registers, then page PRDs add rows and providers and never edit the shell. We are wrong if a page slice edits `AppShell.tsx`, the jump menu or the help sheet after SNR-8.

## What We're NOT Building

- Raw per-page key handlers (the mock's `registerKeys`); keys go through the catalogue.
- A global `contextmenu` listener on `document` that overrides the browser everywhere; the host mounts over the app's `<main>` only and leaves inputs and the browser menu alone in text fields.
- A second modal or toast system.
- Redo, and a history that survives restart.
- MIDI or HID changes ([ADR 0361](../adr/0361-app-commands-go-through-one-registry-and-keyboard-midi-and-hid-are-input-sources-bound-by-a-remappable-keymap.md) decisions 3 and 4 stand).

## Success Metrics

| Metric | Target | Measured by |
| --- | --- | --- |
| Surfaces fed by the catalogue | Jump menu, help sheet, Settings key list, 3 footers | A test that fails when a command is missing from any |
| Per-area `ContextMenu` call sites with inline items | Falls to 0 by cutover | Scan test (ratchet) |
| Keydown listeners outside `src/input/` | 0 beyond the reasoned allowlist | Existing scan test |
| Jump menu | Opens in under 100 ms (ADR 0075 acknowledgement rule) and finds a chapter, an entry, a mark and a bookmark | Component tests, ported `studio-next/tests/palette.test.tsx` |

## Decisions

Owner rulings of 2026-10-11; none is open.

| Id | Ruling | Consequence here |
| --- | --- | --- |
| SN0-Q1 / DQ-1 | Studio Next is the spec | The rail, header and overlays follow the mock; ADR 0407 decision 5 and the Story Bible badge of ADR 0725 are superseded (DQ-11, DQ-14) |
| SN0-Q2 / DQ-2 | Replace, one PR, no flag | Registries land first with no route; each migration of a `ContextMenu` or footer is its own slice |
| SN0-Q3 | The store is a read-model cache plus a command journal; the Go host stays the source of truth | The History panel reads the journal in the Domain PRD |
| DQ-14 / SN0-Q6 | Schedule and Delivery are pages with their own rail items | Their rail items arrive with their swaps (SNP-8, SNM-5) |
| SN0-Q7 | The mock's breakpoints apply at the mock's widths | The rail collapses below 1360 |
| SNR-Q1 | Ctrl+F is Find in Script and the jump menu elsewhere, as `studio-next/src/app/keys.ts`; add `find.open` | SNR-4 |
| SNR-Q2 | The jump menu does not replace navigation | The collapsed rail opens over the page on hover, as the mock does |
| SNR-Q3 | Chapters come from providers; the catalogue test covers static rows only (default taken, standing instruction) | SNR-2 |
| SNR-Q4 | A toast's Undo may undo a DAW change only when it is the last entry, as `undoEntry` in `studio-next/src/state/store.ts` | SNR-3, SNS-3 |
| SNR-Q5 | The History panel opens from a header button and `history.open` | SNR-7, SNR-8 |

## Users & Context

Narrators using the keyboard and the pedal, and every page worker (they consume the registries). Accessibility: the jump menu is a combobox dialog; context menus are reachable by the Menu key and Shift+F10 ([ADR 0705](../adr/0705-the-workspace-adds-an-effect-to-a-passage-or-a-chain-to-the-chapters-track-only-after-the-narrator-confirms-and-the-host-names-both-targets.md)).

## Solution Detail

### Acceptance criteria tied to the mock

| Behaviour | Mock reference | Acceptance |
| --- | --- | --- |
| Go to any page or chapter from the keyboard | `studio-next/src/app/commands.ts`, `studio-next/tests/palette.test.tsx` | Typing "ch 3" lists the chapter by its formatted name; Enter navigates; Escape returns focus |
| Search the book | `studio-next/src/app/search-sources.tsx` | Text, entry and mark hits are grouped; a hit opens its place |
| Right-click anything | `studio-next/src/app/context.ts` | A word, a paragraph, a note, a take row each shows its provider's items, then the shared tail; disabled items show their reason |
| Context menu by keyboard | `studio-next/src/app/keys.ts` (`ContextMenu`, Shift+F10) | The menu opens at the focused element or the active descendant |
| Help is the keymap | `studio-next/src/app/help.tsx`, `studio-next/tests/d2-keycaps.test.tsx` | The sheet shows the user's remapped keys, not defaults |
| Toast with Undo | `studio-next/src/ui/overlay.ts` `toastUndo` | Pressing Undo undoes exactly that entry or says why not |
| Leave guard | `studio-next/src/state/store.ts` `setChangeGuard` | A page can register a leave guard that asks before a page change (used by [Booth](studio-next-booth.prd.md)) |

### Interfaces

- `CommandDescriptor` (extended): `id`, `label`, `scope`, `noisy?`, `defaults`, `group?`, `hint?`, `surfaces?`.
- `CommandProvider = () => ProvidedCommand[]` where `ProvidedCommand = { id, group, label, hint?, run }`.
- `SearchSource = (term: string) => SearchHit[]`; `SearchHit = { group, title, sub?, run }`.
- `ContextProvider = { match(target: Element): boolean; items(target: Element): ContextMenuItem[] }`.
- `LeaveGuard = (next: Location) => 'allow' | { ask: ConfirmSpec }`.
- `overlay` object as above.

### Supersedes / depends on ADRs

On conflict this PRD, and the ADR written when its phase lands, is the source of truth for the rebuild; an old ADR stays in force for code not yet migrated until the superseding ADR is merged ([register](studio-next-adr-register.prd.md)).

| ADR | Class | Note |
| --- | --- | --- |
| [ADR 0361](../adr/0361-app-commands-go-through-one-registry-and-keyboard-midi-and-hid-are-input-sources-bound-by-a-remappable-keymap.md) | EXTEND | Jump menu, providers and help derived from the catalogue (A3); the mock's `registerKeys` is not adopted |
| [ADR 0048](../adr/0048-every-dialog-is-one-modal-shell-and-confirms-are-alert-dialogs.md), [ADR 0172](../adr/0172-popover-is-an-interactive-layer-above-the-dialog-and-escape-defers-to-the-topmost-one.md), [ADR 0630](../adr/0630-overlays-keep-the-mocks-frame-a-nested-dialog-dims-the-page-and-a-combobox-popup-is-a-listbox-not-a-popover.md) | EXTEND | Overlay service renders these primitives (A4) |
| [ADR 0705](../adr/0705-the-workspace-adds-an-effect-to-a-passage-or-a-chain-to-the-chapters-track-only-after-the-narrator-confirms-and-the-host-names-both-targets.md) | EXTEND | Context provider registry and host over `ContextMenu` |
| [ADR 0407](../adr/0407-a-new-page-replaces-its-old-counterpart-in-the-same-change-and-the-navigation-is-grouped-by-production-stage.md) | KEEP decision 1, SUPERSEDE decision 5 (DQ-2, DQ-14) | Navigation serial point; no new page here; Schedule and Delivery are pages with rail items |
| [ADR 0725](../adr/0725-the-rail-draws-a-count-badge-only-from-a-count-the-host-reports-and-the-product-is-named-studio.md) | EXTEND, SUPERSEDE the open-queries badge (DQ-11) | Rail counts keep the host-reported rule and the mock's three counts |
| [ADR 0075](../adr/0075-every-action-that-leaves-the-interface-acknowledges-within-100-ms-cannot-be-fired-twice-and-tells-the-narrator-when-it-ends.md) | KEEP | Acknowledge within 100 ms applies to the jump menu |
| [ADR 0430](../adr/0430-the-engine-panel-is-a-wide-slide-over-from-the-engine-chip-and-every-pointer-to-the-tracks-page-opens-it.md) | EXTEND | Engine chip label from capabilities |

## Technical Approach

**Architecture.** New folder `apps/ui/src/registries/` (providers, sources, context, guards) imported by features, never the reverse; `JumpMenu`, `ContextMenuHost` and the history slide-over under `components/layout/`. The jump menu uses `Dialog` and `Listbox`; no new Base UI import outside primitives. Dependency-cruiser rules: features import registries; registries import nothing from features. The overlay service lives in `apps/ui/src/overlay/` and imports primitives only.

**Contracts.** No wire payloads. The catalogue test generalises `commands.catalog.test.ts`: every id registered, every static row in each surface.

**Test plan.** Unit tests for each registry; component tests for the jump menu and host; ported mock tests; scan tests extended (no `registerKeys`-style handlers, no inline `ContextMenu` items after the ratchet); visual rows for the open jump menu and an open context menu at all viewports; aria snapshot for the jump menu and the history panel; axe.

**Rollout.** No flag. The jump menu is additive; each migration of a `ContextMenu` or a footer is its own invisible slice (layer strangling).

**ADRs.** A3 (jump menu, providers and help derived from the catalogue, extending [ADR 0361](../adr/0361-app-commands-go-through-one-registry-and-keyboard-midi-and-hid-are-input-sources-bound-by-a-remappable-keymap.md)); A4 (overlay service over the primitives).

**Risks.** The `contextmenu` host must not break the browser menu in editable fields (mock guards `input,textarea,select,[contenteditable]`); the Wails WebView may differ from Chromium on Shift+F10, tested in the host build by the owner (pending on #510).

## Implementation Phases

| # | Phase | Description | Status | Parallel | Depends | Est. (pw) | PRP Plan |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | ADRs | A3 and A4 as Proposed | in review (ADR 0780, ADR 0781) | - | SN0-1 | 0.4 | - |
| 2 | Catalogue extension | Descriptor fields, provider API, surface tests | in review (#1032) | 3 | 1 | 1.0 | - |
| 3 | Overlay service | `overlay.*` over primitives, tests | in review (#1033) | 2 | 1 | 1.0 | - |
| 4 | Jump menu and search sources | `JumpMenu`, sources registry, first sources (chapters, pages) | in review (#1052) | 5 | 2, 3, SNF-4 | 1.5 | - |
| 5 | Context menu host | Provider registry, `ContextMenuHost`, keyboard open | in review (#1053) | 4 | 3 | 1.2 | - |
| 6 | Help as data | Sheet, Settings list and footers from catalogue and hint specs | in review (#1070) | 7 | 2, SNF-4 | 1.0 | - |
| 7 | History panel | Slide-over over the journal | in review (#1055) | 6 | 3, SNS-3 | 0.8 | - |
| 8 | Shell | Header Undo and History, engine chip label, rail groups and counts as the mock, collapse below 1360 | pending | - | 4, 7 | 1.1 | - |

### Phase Details

- **Phase 2.** Keep `commands.catalog.test.ts` green; add the surfaces test; no handler is moved yet.
- **Phase 4.** Search sources for manuscript text, entries, marks arrive with their page PRDs ([Script and Story Bible](studio-next-script-and-story-bible.prd.md)); this phase ships chapters and pages only.
- **Phase 5.** Migrations of existing `ContextMenu` sites (`WorkspacePage` word menu, Script) are separate slices per site.
- **Phase 8.** The shell navigation is a train-wide serial point; this slice runs alone.

### Parallelism Notes

Phases 2 and 3 are independent; 4 and 5 can run together; 6 and 7 are independent of 4 and 5.

### Parallel-session compatibility

| Phase | Files touched | Collides with |
| --- | --- | --- |
| 2 | `apps/ui/src/input/commands.catalog.ts` and tests | Any slice adding a command row (add-only) |
| 3 | `apps/ui/src/overlay/**`, `components/primitives/Toast*` (read) | Toast owners |
| 4 | `components/layout/JumpMenu*`, `registries/search*` | none |
| 5 | `components/layout/ContextMenuHost*`, existing `ContextMenu` call sites | Page slices that edit the same call sites |
| 6 | `components/help/*`, `components/settings/KeyboardPanel.tsx` | Settings slices |
| 8 | `AppShell.tsx` | Serial point |

### Slices

| Slice | Scope | Depends on | Parallel-safe | Verification |
| --- | --- | --- | --- | --- |
| SNR-1 | ADRs A3, A4 | SN0-1 | yes | ADR index generated |
| SNR-2 | Phase 2 | SNR-1 | yes | Catalogue and surface tests |
| SNR-3 | Phase 3 | SNR-1 | yes | Overlay tests; aria for dialogs unchanged |
| SNR-4 | Phase 4 | SNR-2, SNR-3, SNF-4 | yes | Ported palette tests; visual row; aria |
| SNR-5 | Phase 5 | SNR-3 | yes | Host tests; keyboard open; visual row |
| SNR-6 | Phase 6 | SNR-2, SNF-4 | yes | Sheet shows remapped keys |
| SNR-7 | Phase 7 | SNR-3, SNS-3 | yes | History tests; aria |
| SNR-8 | Phase 8 | SNR-4, SNR-7 | no (serial) | Visual suite all viewports; Screenshots |

## Decisions Log

| Decision | Choice | Alternatives | Rationale |
| --- | --- | --- | --- |
| Catalogue stays static (proposed) | Providers for dynamic commands | Port `registerCommands(() => Command[])` | [ADR 0361](../adr/0361-app-commands-go-through-one-registry-and-keyboard-midi-and-hid-are-input-sources-bound-by-a-remappable-keymap.md) and its scan tests |
| Overlay API is imperative, rendering is declarative (proposed) | Service over primitives | Port the mock's overlay store | Keeps focus return and stacking in the primitives |
| Context via one host (proposed) | Provider registry plus a host in `<main>` | Document-level listener | Does not override the browser outside the app |

## Research Summary

Read: all of `studio-next/src/app/*`, `studio-next/src/ui/overlay.ts`; `apps/ui/src/input/*`, `components/primitives/{ContextMenu,Toast}.tsx`, ADR 0361 decisions, `input-commands-and-pedals.prd.md` header. Not done: no check that the Wails WebView delivers Shift+F10; the Input Commands PRD's remaining phases were not audited line by line.

## Visual Spec

Mock states: jump menu open (`studio-next/src/app/palette.tsx`), a context menu on a word (Script), the history list (`studio-next/src/app/history.tsx`), the help sheet. Each is a visual-suite row.
