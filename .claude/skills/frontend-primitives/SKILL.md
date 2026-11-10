---
name: frontend-primitives
description: Before adding or changing any UI element in src/studio/ui, find the existing primitive and follow the owner's UI rules (icon buttons with tooltips, one title primitive, one marker, one reader width, centered headers, capped lists, errors only as toast, modal or fixed box, no instruction prose). Load before writing JSX, and use as the checklist the ux-reviewer agent applies.
---

# Frontend primitives

Recent UI mistakes were the same few: a second copy of something that already existed, a text button where an icon fits, an error that pushed the page down. This skill is the checklist. The `ux-reviewer` agent applies it to a branch before a UI PR leaves draft.

## Before adding an element

1. Look in `src/studio/ui/src/components/primitives/` (list below). If one fits, use it; if it nearly fits, extend it with a prop and a story.
2. Two screens drawing the same thing is the signal to extract one primitive, with a `<Name>.stories.tsx` and a test, in the same PR. Do not copy markup between pages.
3. Read the primitive's table row in [the design system](../../../docs/design/design-system.md#primitive-components) and the mock for the page ([ui-spec-and-screenshots](../../rules/ui-spec-and-screenshots.md)).

## The rules

| #   | Rule                                                                                                                                                                                                                                                                                                                  | Use                                                                                                                              |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Icon buttons.** Wherever an icon can be told apart, the control is an icon with a tooltip and an `aria-label`. Owner: "if they can't figure it out from context and a tooltip they shouldn't be using the app." This covers context menus where an icon saves space. A bare word is for a control no icon can carry | `IconButton`, `Icon` (asked for by action name from `icons.catalog.ts`), `TooltipTarget`, `ContextMenu`                          |
| 2   | **Chapter title and subtitle are one primitive.** Either one line, "Title: Subtitle" with the subtitle dimmed, or stacked with a larger title, a dimmed subtitle and a tight gap. With no subtitle nothing is reserved for one. Never `" -- "`                                                                        | `TitleSubtitle` (`layout` `inline` or `stacked`); chapter names come from `headingName` in `src/studio/ui/src/chapterHeading.ts` |
| 3   | **A page break and a chapter end are one marker.** One primitive draws both, so they cannot drift. Today `components/booth/pages/PageBreaks.tsx` draws the break and there is no shared primitive: the first PR that touches either extracts it                                                                       | none yet                                                                                                                         |
| 4   | **One reader column-width tool**, shared by Script and Booth. The width is `min(chosen measure, container)`, so a narrow window never overflows                                                                                                                                                                       | none yet: extract, do not add a second one per page                                                                              |
| 5   | **Table and column headers are centered**, through one header primitive, not per-page classes                                                                                                                                                                                                                         | `TableHeader`, `StageGrid` headers (`tableStyles.ts`)                                                                            |
| 6   | **A list that scales with data has a max height** and scrolls inside itself                                                                                                                                                                                                                                           | `Panel`, `Listbox`; set the cap where the list is drawn                                                                          |
| 7   | **Errors appear only as a toast, a modal, or an always-present fixed-size result box.** Never as text that shows up in the page flow and shifts the layout                                                                                                                                                            | `Toast`, `ConfirmDialog`, `Dialog`; a fixed slot as in design-system "Data that comes and goes has a reserved slot"              |
| 8   | **No instruction prose in flow.** How-to text is a tooltip, a "?" or the guide                                                                                                                                                                                                                                        | `TooltipTarget`, `HelpButton`; see [No in-flow instructions](../../../docs/design/design-system.md#no-in-flow-instructions)      |

Exception to rule 6, for this one list: the audio engine panel's Chapter links table is not capped. The owner objected to the Tracks card's own scroll area (2026-11-10, #3258: "the first one has its own scroll bar that doesn't continue scrolling the audio engine when it gets to the bottom so i have to move my mouse around the section to be able to continue scrolling"), and that card is gone. A cap on Chapter links would bring the same scroller back inside the panel, so the panel body is its only scroll area. Every other list keeps rule 6.

Exception to rule 6: the Production chapter pipeline board is not capped. The owner wants it to show every chapter at its natural height, with no scroll inside the page. Cap the chart or schedule panels beside it instead.

Guards that hold rules 1, 7 and 8 over the whole app, each with a shrink-only allowlist you lower when you fix an entry, never raise without the owner's say-so:

- `tests/visual/guards/toolbarButtons.test.ts` (rule 1: a `Button` with words inside a toolbar or ribbon).
- `tests/visual/guards/mixedButtons.test.ts` (rule 1: one state of a control draws an `IconButton` and another draws a confirm-type word button, such as Confirm, Save, Apply or Cancel; no allowlist; it reads conditionals, not early returns, so look for `if (editing) return` states by hand).
- `tests/visual/guards/inlineErrors.test.ts` (rule 7: a `role="alert"` element outside a dialog, menu, popover or the toast).
- `tests/visual/inFlowProse.test.ts` (rule 8).

## The primitives

All in `src/studio/ui/src/components/primitives/`. Read the file for props.

| Need        | Primitive                                                                                                                                     |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Buttons     | `Button`, `IconButton`, `NavButton`, `Pill`, `ToggleGroup`, `HelpButton`                                                                      |
| Command bar | `Toolbar`, `ToolbarButton` (roving tab stop)                                                                                                  |
| Icons       | `Icon` with the catalogue `icons.catalog.ts`                                                                                                  |
| Overlays    | `Dialog`, `ConfirmDialog`, `WorkDialog`, `SlideOver`, `NavDrawer`, `Popover`, `Menu`, `ContextMenu`, `Tooltip` and `TooltipTarget`, `Listbox` |
| Messages    | `Toast` (the only error surface besides a dialog), `StatusBadge`, `HeaderChip`, `ProgressBar`, `Skeleton`                                     |
| Inputs      | `TextField`, `Field`, `DateField`, `NumberInput`, `SearchField`, `Select`, `Slider`, `Checkbox`, `Switch`, `RadioGroup`, `TagInput`, `Tabs`   |
| Text        | `Heading`, `TitleSubtitle`, `SectionLabel`, `Highlight`, `KindMark`, `KindChip`, `SpeakerTag`, `Kbd`, `KeyCap`, `KeyHint`, `KeyHints`         |
| Containers  | `Panel`, `InsetCard`, `Collapsible`, `Disclosure`, `FocusShell`, `CompactShell`                                                               |
| Data        | `Table`, `StageGrid`, `StatTile`, `StatStrip`, `Timeline`, `LevelMeter`, `ChapterStepper`                                                     |
| Gating      | `CapabilityGate`                                                                                                                              |

## Done means

- The PR names the primitive it used for each new element, or the one it extracted.
- A new primitive has a story, a test and a row in the design system table.
- The `ux-reviewer` agent returned `pass` on the branch with screenshots ([CLAUDE.md](../../../CLAUDE.md) feature workflow).
