# Component selection

Which primitive a control is built from, decided by what the narrator does with it and what kind of value it holds. For anyone adding or reviewing a control in `src/studio/ui`: find the row for the action or value, use the primitive it names, and cite the rule's ID (`CS-…`) when a change breaks one. The `ux-reviewer` agent reaches this page through [frontend-primitives](../../.claude/skills/frontend-primitives/SKILL.md), which lists the primitives; [the design system](design-system.md#primitive-components) says how each one looks and behaves.

How to read the names:

- A backticked component name is a file in `src/studio/ui/src/components/primitives/` or an export of one, or one of the two shared controls in [Shared controls outside the primitives](#shared-controls-outside-the-primitives).
- **Proposed** marks a primitive, or a prop of one, that is not written yet. The first PR that needs it writes it with a story, a test and a row in [the design system](design-system.md#primitive-components), and removes the mark here.
- A file path is given from `src/studio/ui/src/`, or from the repository root when it starts with `src/`.
- `[FP1]` after a rule means it restates rule 1 of frontend-primitives. **New** marks a rule that skill does not make; [Rules this page adds](#rules-this-page-adds) lists them with who decided each.

`componentSelection.test.ts` holds this page to the code: every rule ID is unique, every primitive named exists (or is marked Proposed and does not), every file path and relative link resolves, and the props it lists still appear in the primitives' source.

## Decision table

Read the left column, use the primitive in the middle, and do not use what is in the right column.

### Actions

| The narrator wants to | Use | Not |
| --- | --- | --- |
| Run an action that an icon from `icons.catalog.ts` can carry (in a row, list, toolbar, card header, context menu) | `IconButton` with `action=` (catalogue name, hint and icon). When the catalogue has no row for the action, add one to `icons.catalog.ts`: `Icon` draws only a catalogue name, and `iconImports.test.ts` counts direct Font Awesome imports. `label=` beside `action=` overrides the name and the hint, not the icon, and drops the catalogue shortcut from both the hint and `aria-keyshortcuts` (CS-K4) [FP1] | A text `Button` with a verb the catalogue already has (`iconButtonRule.test.ts`, `src/studio/ui/tests/visual/guards/toolbarButtons.test.ts`) |
| Run the main action of a page, card, dialog or form, or an action no icon can carry | `Button` `primary` (one per view) or `secondary` | A second `primary` in the same view; `IconButton` for a dialog's confirm |
| Run an action inside a sentence | `Button variant="link"` (CS-A1) | A raw `<a>` with an `onClick`; a `secondary` button in running text |
| Open a web page outside the app | An `<a target="_blank" rel="noreferrer">` drawn like `Button variant="link"`, as `components/assets/AssetFacts.tsx` does (CS-A1) | `Button` that calls `window.open` |
| Go to another page of the app | `NavButton` in the rail; `Button variant="link"` or `IconButton` with one of the catalogue's page-link actions (`openInScript`, `openInBooth`) for a "go to X" in a row | A `Tab` used as navigation between pages |
| Run one of several related actions from one place | `Menu` (a trigger opens a list of `menuitem`s) (CS-A2) | A row of five buttons in a narrow card |
| Run an action on the thing under the pointer or the selection | `ContextMenu` on the area, with every item also reachable from a visible control or a shortcut | A context menu that is the only way to an action |
| Run a main action with a setting that changes what it does (Record and its Levels) | `SplitButton` (`SplitMain` + `SplitSide`) (CS-A3) | A `Button` and a separate caret glued with `rounded-none` and `border-l` (`tabsAndToggleShapes.test.ts` fires only on the two in one class string, outside the primitives) |
| Run a set of commands in a bar | `Toolbar` with `ToolbarButton render={<IconButton …/>}` (one tab stop, arrow keys) | A `div` of buttons that are each a tab stop |
| Open or close a section | `Disclosure` when the title row is the control; `Collapsible` + `CollapsibleTrigger` when the button sits apart from its panel | A `Button` that toggles a `hidden` class |
| Read a few sentences of help | `HelpButton` ("?") [FP8] | A paragraph in the page flow (`src/studio/ui/tests/visual/inFlowProse.test.ts`) |
| Read a hint of a few words | `TooltipTarget` around the control [FP1] | A native `title` on an interactive control (allowed only for the full text of a clipped label, `truncatedText.guard.test.ts`) |

### Choosing values

| The value is | And | Use | Not |
| --- | --- | --- | --- |
| A boolean | It is a setting that stands alone and takes effect at once | `Switch` (`role="switch"`, says on/off) | `Checkbox`; a two-option `ToggleGroup` "On / Off" |
| A boolean | It is one field of a form applied by a submit button (a dialog's options), one item of a multi-selection, or a boolean column in the rows of an editable list | `Checkbox` | `Switch` |
| One of 2 to 5 short options whose labels fit the row in a 960 px window | The labels are one or two words and need no explanation | `ToggleGroup look="segmented"` | `Select` (hides the choices behind a press) |
| One of 2 to 5 options | Each option needs a description, a disabled reason, or a longer label to be read side by side | `RadioGroup` (or `Radio` when each sits in its own row) | `ToggleGroup` with tooltips carrying the explanation |
| One of 5 to about 15 options | Flat list | `Select` (native, keyboard type-ahead) | `RadioGroup` of 8 radios; `ToggleGroup` that wraps to three lines |
| One of more than about 15 options, or a list the narrator searches by name (speakers, voices, chapters by title) | Flat list | `SearchList` in a `Popover` (focus stays in the box, arrows move, Enter picks), as `components/booth/reading/SpeakerChip.tsx` and `components/booth/voices/VoiceControl.tsx` do; `ComboSelect` (**Proposed**) when the picker is a closed box in a form: `SELECT_BOX_CLASSES` + `Popover` + `SearchList` | A `Select` of 200 chapters; a page-written `role="combobox"` |
| One item of a tree (REAPER tracks in folders) | Nested | `TreeSelect`; for a DAW track, `TrackSelect`, which hands a foldered project to it (CS-E14) | A `Select` with indented labels or `optgroup`s two deep |
| A chapter | The page has a current chapter | `ChapterStepper` (previous, picker, next) | A bare `Select` of chapters |
| Which panel of content is showing | It changes the view, not a stored value | `Tabs` / `TabList` / `Tab` / `TabPanel` (CS-A4) | `ToggleGroup` (it sets a value; it does not own a panel) |
| A list filter | One of up to about 6 | Chips in the filter look (`Pill look="filter"`: 28 px, sentence case). `ToggleGroup` does not offer that look: a `look="filter"` option on it is **Proposed** (CS-E13) | `ToggleGroup look="segmented"` (segmented is for values); a default-look `ToggleGroup` (its chips are the 36 px capitals of a value toggle); a `Checkbox` row above a table |
| A list filter | Several can be on at once | `Pill look="filter"` chips (CS-E13) | A `Checkbox` row above a table |
| A list filter | More than about 6 choices | `Menu` with a `select="one"` or `select="many"` section (CS-E13) | Chips that wrap to three lines |
| The sort order of a list | It is chosen on the list's own toolbar | `Menu` with `select="one"` and `closeOnSelect` | `Select` in a toolbar. A stored setting that is an order (Settings, **Story Bible order**) is an enumeration and follows CS-E1 |
| A value shown as a chip in a header or a sentence | Pressing the chip changes it | `Menu` with `select="one"`, the current item checked (CS-E8) | A `Menu` of plain action items; a `Popover` of buttons |
| Several items from a list (multi-select) | The items are rows, tiles or a plain list | A `Checkbox` per item (bare box with `aria-label`), one `Checkbox` with `indeterminate` for all or some, bulk actions in a reserved bar (see [Multi-select](#multi-select-and-bulk-actions)) | `Switch` per item; "Select all" / "Select none" text buttons |
| Free terms the narrator keeps (vocabulary hints, aliases) | A set of strings | `TagInput` | A comma-separated `TextField` |

### Entering values

| The value is | Use | Not |
| --- | --- | --- |
| Short free text (a name, a label) | `TextField`, or `Field` when it has a visible label, hint or error | A raw `<input>` (`rawNatives.test.ts`) |
| Text of several lines (a note, pasted text) | `Field textarea` | A raw `<textarea>` (`rawNatives.test.ts`) |
| Text that filters a list or the manuscript | `SearchField` (clear button inside, focus returns) | `TextField` with a page-drawn clear cross |
| An exact number with a range (seconds, a count, words per page) | `NumberInput` (keeps the draft, clamps on blur, arrows step), with its unit as text after the box | `TextField` with page-written parsing; `Slider` when the exact value matters |
| A number the narrator tunes by feel within a fixed range (volume, text size), where the readout is enough | `Slider` with `label` and `valueText` | `NumberInput` alone; a `Slider` with no readout |
| A number from a short fixed set (playback speed 0.75 / 1 / 1.25 / 1.5 / 2) | `ToggleGroup look="segmented"` under CS-N3's cap | `Slider` with snapping |
| An amount of money | `NumberInput` with `step={0.01}` and the currency as the unit text; it shows 12, not 12.00, until it gains a precision prop (CS-N6) | `Slider`; `TextField` parsed by the page |
| A time position or a duration | `TimeField` (**Proposed**); until it is extracted, `NumberInput` in seconds with the clock value beside it (CS-N8) | A `Select` of times |
| A paragraph or line of the manuscript by its number | `NumberInput` from 1 to N, or a pick from the reader (CS-N10) | A `Select` of "Paragraph 1 … N" |
| A range (lowest and highest, from and to) | Two `NumberInput`s, each bounded by the other, with one reserved error box (CS-N9) | Two unrelated boxes validated on submit |
| A date | `DateField` (reports `YYYY-MM-DD`) | `TextField` with a date mask |
| A colour from the app palette (a speaker's hue, an entry type's colour, a mark's colour) | `ColourField`, palette mode (see [Colour](#colour)) | `Select` of colour names, even with a `Swatch` beside it |
| A free colour (a hex value, Proof highlight colour) | `ColourField`, free mode (see [Colour](#colour)) | A bare hex `TextField`; a `Select` |
| A file or folder path | The path shown with `BreakablePath` and a `Button` "Choose…" that opens the system dialog through the host (see [Paths](#paths)) | A free-text `TextField` as the only way in |
| A keyboard shortcut | The Keyboard panel's capture (`input/useGestureCapture.ts`), shown with `Kbd` / `KeyCap` | A `TextField` the narrator types "Ctrl+K" into |
| A value the app computed that the narrator can read and copy | `TextField readOnly` | A disabled field (it reads as "off", not "read-only") |

### Showing state

| The narrator needs to see | Use | Not |
| --- | --- | --- |
| An error | `Toast` (`tone: 'error'`), a `Dialog`/`ConfirmDialog`, or a fixed-size reserved result box [FP7] | `role="alert"` text that appears in the flow (`src/studio/ui/tests/visual/guards/inlineErrors.test.ts`) |
| That an action is running | `pending` on the `Button`/`IconButton`/`SplitMain` that started it; `WorkDialog` for a blocking job; `ProgressBar` for a measurable one [FP9] | A spinner beside the button; a button that goes `disabled` with no reason |
| Why a control is off | `disabledReason` on `Button`, `IconButton`, `NavButton`, `Pill`/`ToggleGroup` option, a plain `Menu` item; `unavailable` on a `ContextMenu` item; `reason` on a `RadioGroup` option; `aria-describedby` on `Checkbox`, pointing at the text that says why (CS-K2) [FP9] | Native `disabled` with nothing said |
| A status | `StatusBadge`, `HeaderChip`, `CheckedStamp` | Coloured text alone |
| A fact that cannot be changed ("required") | Plain text or a `StatusBadge` (CS-B7) | A checked, disabled `Checkbox` |
| A colour that identifies a thing | `Swatch` (decorative, `aria-hidden`) next to the thing's name | A swatch with no name beside it; a hand-built swatch `span` |

### Shared controls outside the primitives

| Control | File | Use it for |
| --- | --- | --- |
| `BreakablePath` | `BreakablePath.tsx` | A file or folder path that wraps after separators |
| `TrackSelect` | `components/mapping/TrackSelect.tsx` | Every picker of a DAW track |

## Actions and views

- **CS-A1** An action inside a sentence is `Button variant="link"`. A link to a web page outside the app is an `<a target="_blank" rel="noreferrer">` drawn like it, never a `Button` that calls `window.open`. **New**.
- **CS-A2** Several related actions that start from one place are a `Menu`, not a row of buttons that a narrow card wraps. **New**.
- **CS-A3** A main action with a setting that changes what it does is a `SplitButton` (`SplitMain` + `SplitSide`), never a `Button` and a separate caret joined by hand. **New**.
- **CS-A4** `Tabs` shows one of several panels and sets no stored value; a `ToggleGroup` sets a value and switches no panels. The one other use of a tab strip is a category strip that heads a single list and only redraws it (the Story Bible categories that `components/primitives/Tabs.tsx` names): it is a `TabList` with `activation="automatic"`. No page draws one as of 2026-11-20 (the Story Bible filters through `components/storybible/FilterMenu.tsx`); every other filter follows CS-E13. `activation="automatic"` is also allowed on a strip that owns its panels: its one caller, `components/editing/drawer/Drawer.tsx`, sets it on the drawer's `TabList` over a `TabPanel`. **New**.

## Per-data-type rules

### Booleans

- **CS-B1** A boolean is a `Switch` or a `Checkbox`, never a `Select`, `RadioGroup` or `ToggleGroup` of "On / Off" or "Yes / No".
- **CS-B2** `Switch` for a setting that stands alone and takes effect when pressed (every Settings `bool` row, `components/settings/row/ValueControl.tsx`). `Checkbox` when the value is collected and applied by a submit button (dialog options such as `components/recordingcheck/RunOptions.tsx`), when it selects an item, or when it is a boolean column in the rows of an editable list, whenever that column saves (CS-E9). **New**.
- **CS-B3** The label says what "on" means, phrased positively ("Start the launcher script with REAPER", not "Don't start…"). "Don't ask again" and "Don't show again" are exempt: they are the standard wording. A Settings switch shows its state as "On"/"Off" text beside the track, as `components/settings/row/ValueControl.tsx` does.
- **CS-B4** A boolean that turns another control off (Transcribe each recording whole → Chunk length) sits directly above the control it governs, and that control is disabled with a reason, not hidden, so the layout does not move.
- **CS-B5** Tri-state ("mixed") exists only for a parent of a partial selection (`Checkbox indeterminate`). A three-valued setting (Automatic / On / Off) is an enum, not a boolean: `ToggleGroup look="segmented"`.
- **CS-B6** A boolean the narrator has not answered yet (a consent) is a `Switch` drawn off with a muted "Not chosen yet" note in a reserved slot beside it; the note goes when the narrator answers. It is not a third option. **New**.
- **CS-B7** A fact is not a control. Something that is always true ("required") is plain text or a `StatusBadge`, never a checked, disabled `Checkbox`. **New**.

### Enumerations

- **CS-E1** 2 to 5 options with short labels: `ToggleGroup look="segmented"`, when the labels fit the row on one line in a 960 px window. 2 to 5 options that need descriptions or visible disabled reasons: `RadioGroup`. 5 whose labels do not fit, and 6 to about 15: `Select`. More than about 15, or names the narrator looks up: a searchable picker (`SearchList` in a `Popover`, or `ComboSelect` (**Proposed**)). A tree: `TreeSelect`. These counts are for a control that stands alone and holds a value; a filter follows CS-E13 and a control repeated per row follows CS-E9. **New**.
- **CS-E2** The thresholds are about what the narrator reads, not about the data type: a list that is short today but grows with the project (voices, chapters, profiles, models) is treated as long.
- **CS-E3** "Automatic" or "Default" is an option of the enum, named with what it resolves to ("Automatic (Blue)", as `components/storybible/SpeakerColourField.tsx` does), not a separate checkbox beside the control and not a stored 0 (CS-N7).
- **CS-E4** A stored value that is not among the host's choices still shows as the current option (as `components/settings/row/ValueControl.tsx` does), so the control never claims a choice that is not the real one.
- **CS-E5** An option that cannot be chosen now stays in the list, off, with its reason (`disabledReason` / `reason`). It is not removed. A `Menu` section with `select="one"` or `select="many"` ignores `disabledReason` (CS-K2), so a `Menu` that chooses (CS-E7, CS-E8, CS-E13) cannot meet this until it reads the prop; see [Where the code departs](#where-the-code-departs-from-this-page-2026-11-20).
- **CS-E6** A Settings `choice` row declares its control in the registry (`segmented`, `radio` or `select`), and one renderer draws it for the Settings page, a settings tool's panel and the Proof options. A test checks each declaration against the row's option count and label length under CS-E1. The count alone does not pick the control: a list that grows (CS-E2), labels too long for a segment (CS-S3) and a stale stored value (CS-E4) each change the answer. `ToggleGroup` gets arrow-key roving (see [Keyboard and ARIA](#keyboard-and-aria)) before, or in the same PR as, the first row that moves to `segmented`, so a one-stop `Select` does not become several tab stops down a long page. **New**; pending, see [Where the code departs](#where-the-code-departs-from-this-page-2026-11-20).
- **CS-E7** An enum whose options are looks (a line style, a font) previews each option in the option itself, as `ColourField`'s palette mode does for colour. A native `Select` cannot draw one, so such a value is a `RadioGroup`, a segmented `ToggleGroup`, or a `Menu` with `select="one"` whose items carry the preview. **New**.
- **CS-E8** A value shown as a chip in a header or a sentence that opens a menu is a `Menu` with a `select="one"` section, so the open menu shows the current value checked. **New**.
- **CS-E9** A control repeated in every row of a table or an editable list is compact, whatever its option count: `Select` for an enum, `Checkbox` for a boolean column, `ColourField`'s popover form for a colour. **New**.
- **CS-E10** One value is one control. A setting drawn in two places (Settings and a page's own menu or dialog) uses the same component, the same options and the same option labels in both, from one shared module. **New**.
- **CS-E11** A scope switch (All projects / This project), which changes whose values a panel edits, is a `ToggleGroup look="segmented"` in the panel's header. **New**.
- **CS-E12** Presets over custom numbers are a segmented `ToggleGroup` of the presets plus "Custom". The control selects "Custom" itself when the numbers stop matching a preset, and "Custom" is off while a preset matches, as `components/editing/cleanup/CleanupInspector.tsx` does. **New**.
- **CS-E13** A list filter is not a value control, and CS-E1's counts do not apply to it. One of up to about 6: chips in the filter look (28 px, sentence case, the ink fill when pressed), which `components/primitives/Pill.tsx` documents as the list-filter look. `ToggleGroup` draws only `chip` (36 px, capitals, the accent fill: a standalone value toggle) and `segmented`, so a `look="filter"` option on `ToggleGroup` is **Proposed**; until it exists, a one-of-N filter is a `role="group"` of `Pill look="filter"` with the group's name. Several at once: `Pill look="filter"` chips. More than about 6: a `Menu` with a `select="one"` or `select="many"` section. A segmented `ToggleGroup` is never a filter. **New**; coordinator's default, accepted by the owner.
- **CS-E14** Every picker of a DAW track is `TrackSelect`, never a plain `Select` of track names. `TrackSelect` labels an option with the track's name and the chapter that holds it, and takes no prop for another label, so `components/booth/voices/WhoIsInDialog.tsx`, whose options read "key · voice", needs that prop on `TrackSelect` before it can move. **New**.

### Numbers

- **CS-N1** An exact value is `NumberInput` with `min`, `max` and `step`, and its unit as text after the box (as `components/settings/row/ValueControl.tsx` does with `row.unit`). The range is a muted note under it, not a tooltip. A count of things (workers, processes, pages) is always exact. **New**.
- **CS-N2** A value the narrator tunes by ear or eye is a `Slider`; its readout (`valueText`) carries the unit and is the `aria-valuetext`. The test: if the narrator would ever say the number aloud or copy it from a guide, it is a `NumberInput`. A value a delivery spec checks (loudness targets, sample rate) is a `NumberInput` or a `Select`, not a slider. **New**.
- **CS-N3** A number from a fixed set of up to 5 values is a segmented `ToggleGroup` when the labels fit the row on one line in a 960 px window; more is a `Select`. A label keeps its unit sign (`0.75×`).
- **CS-N4** A duration or time position is shown with `clock`/`clockTenths`, and a count with `plural`/`formatCount` (frontend-primitives, "Before writing text or logic a page already has").
- **CS-N5** A stepper is `NumberInput`: Arrow Up and Arrow Down step by `step`. A page that wants visible − and + buttons extracts `Stepper` (**Proposed**), built on `NumberInput` and two `IconButton`s, and does not draw its own.
- **CS-N6** Money is a `NumberInput` with `step={0.01}` and the currency as the unit text, never a slider. `NumberInput` has no precision or format prop and shows `String(value)`, so 12.00 reads 12; a prop that fixes the decimals shown is **Proposed**. **New**.
- **CS-N7** A number that can also be "Automatic" is one control whose first option is "Automatic (N)", N being what it resolves to: a `Select` or a segmented `ToggleGroup` of the allowed values. It is never a number box where 0 means automatic, and never a checkbox beside a slider. **New**.
- **CS-N8** A time position or a duration is entered in a `TimeField` (**Proposed**), which reads and writes the form `clockTenths` draws (`m:ss.s`, as `clock.ts` documents it). Until it is extracted, the control is a `NumberInput` in seconds with the clock value shown beside it. **New**.
- **CS-N9** A range is two `NumberInput`s, each bounded by the other (the lowest cannot pass the highest), sharing one reserved error box (CS-L5). **New**.
- **CS-N10** An index into the manuscript (a paragraph, a line) is a `NumberInput` from 1 to N, or a pick from the reader; never a `Select` of "Paragraph 1 … N". **New**.

### Colour

- **CS-C1** Colour data is always chosen with the app's colour selector, never with a `Select`, a `RadioGroup` of colour names, or a bare text box. **New**.
- **CS-C2** The colour selector is one primitive, `ColourField`. Every site that picks a colour uses it; [Where the code departs](#where-the-code-departs-from-this-page-2026-11-20) lists the six. **New**.
- **CS-C3** `ColourField` has two modes. **New**.
  - `palette` mode: `RadioGroup` semantics over `Swatch` buttons, one per colour token the caller passes (speaker hues, entry-type colours and mark colours are three token sets), plus "Automatic" when the value can be unset. Each has the hue's name as its accessible name and tooltip; arrow keys move between swatches; the chosen one shows a check mark and a ring. It has two forms: the inline row, and, for a dense row or table cell (CS-E9), one swatch button that opens the same row in a `Popover`.
  - `free` mode: a swatch-square picker (`TextField type="color"`) plus a mono hex box, one accessible name pattern ("<label> colour" / "<label> hex"), the hex settled on Enter or blur and refused (not saved) when invalid.
  - In palette mode it takes token names, never raw values (as `Swatch` does), so a page cannot paste a hex for a hue the theme owns.
- **CS-C4** A colour is never the only cue: the swatch has its name beside it or as its accessible name, and the chosen state is a shape (check, ring). The contrast rules are in [Colour and contrast](colour-and-contrast.md).

### Paths

- **CS-P1** A file or folder is chosen through the system dialog, opened by a host call (`measurePickFiles` in `api/contracts/measure.ts`, `exportPickFiles` in `api/contracts/renderEncodeMaster.ts`, the models store's `pickFolder` in `components/settings/models/AssetsStore.tsx`). The control is a `Button variant="secondary"` whose label ends in an ellipsis ("Change location…", "Add files…"), with `pending` while the system dialog is open, as `components/settings/models/ModelsFolder.tsx` does. Closing the dialog without a choice changes nothing and says nothing.
- **CS-P2** The chosen path is shown with `BreakablePath` (wraps after separators, never inside a name), with an `IconButton action="openFolder"` to show it in the file manager where that helps.
- **CS-P3** A free-text path box is allowed only as an Advanced override next to a Choose… button, never as the only way in.
- **CS-P4** A path change that moves or rewrites data (the Models folder) asks first with `ConfirmDialog`, then shows the job in `WorkDialog`, as `components/settings/models/ModelsFolder.tsx` does.
- **CS-P5** Paths are never truncated with an ellipsis in the middle of a name; when space is short they wrap (`BreakablePath`) or clip with the full path in a tooltip (`truncatedText.guard.test.ts`).
- **CS-P6** The browser's own file input (a hidden `input type="file"` behind a `Button`) is allowed when the page reads the file's content itself and keeps no path (an import of a JSON or CSV file). A path the host opens later goes through CS-P1. **New**.

### Text

- **CS-T1** A control with a visible label, a hint or an error is a `Field`; a bare control with only an accessible name is a `TextField`. Every control has a name (`ControlNaming`: `label`, or an `id` a visible `<label htmlFor>` points at).
- **CS-T2** Text that is code (an id, a hex colour, a number) uses `mono`, which is a `TextField` prop (`NumberInput` sets it). `Field` has none, so a labelled code value is a `TextField mono` under its own `<label>`.
- **CS-T3** A text box that settles (Settings rows) keeps the draft while typing and saves on Enter or blur; Escape puts back the stored value (the settled box in `components/settings/row/ValueControl.tsx`). A half-typed value is never saved.
- **CS-T4** A placeholder is an example of the value ("Your name as the narrator"), never the label and never an instruction.
- **CS-T5** Text of several lines is `Field textarea`. **New**.

### Dates

- **CS-D1** A date is a `DateField`; it stores `YYYY-MM-DD`. A date shown, not edited, uses `calendarDay` (`calendarDay.ts`).

## Destructive actions

- **CS-X1** An action that destroys data the narrator cannot get back is confirmed with `ConfirmDialog confirmVariant="danger"`. The confirm label is the verb and the object ("Delete entry", "Remove voice"), never "OK" or "Yes". The title asks the question ("Delete Mara?"); the body says what is lost and what is kept.
- **CS-X2** An action that can be undone does not ask: it acts at once and offers Undo in a `Toast` (`undo` on the toast). **New**.
- **CS-X3** On the page, a destructive action among others is `Button variant="danger"` (outlined) or `IconButton variant="danger"`; `danger-solid` is only the confirm inside the `ConfirmDialog`.
- **CS-X4** A confirm whose safe answer is to stay opens with focus on Cancel (`focusCancel`); a confirm that a double press may have raised uses `holdEnter`. A pending confirm uses `pending` so it cannot be pressed twice.
- **CS-X5** A third way out ("Discard & continue") uses `danger`/`dangerLabel`; a quieter alternative uses `secondary`/`secondaryLabel`. Never a fourth button.
- **CS-X6** In a `Menu` or `ContextMenu`, destructive items sit last, in their own group. The item label carries the verb and the confirm carries the colour. **New**.
- **CS-X7** A destructive bulk action names the count in its confirm ("Delete 3 entries?") with `plural`.

## Multi-select and bulk actions

- **CS-M1** Each selectable item (a row, a tile, a list line) has a `Checkbox`: a bare box with an `aria-label` naming the item ("Select Mara") in a table row, or the tile's own label. Pressing the row elsewhere opens or focuses it; it does not toggle the selection. **New**.
- **CS-M2** One `Checkbox` selects all shown items; it is `indeterminate` when some are selected. In a table it is the header cell, as `components/editing/cleanup/CleanupList.tsx` does. "Select all" / "Select none" and "All" / "None" text buttons are not used. **New**.
- **CS-M3** Bulk actions live in a bar in a reserved slot above or below the list: the count ("3 selected", `plural`), then `IconButton`s for the actions, then a clear-selection `IconButton`. The bar's room is kept when nothing is selected, or the bar replaces the list's own toolbar in place, so the list does not move (the design system's ["Data that comes and goes has a reserved slot"](design-system.md#no-in-flow-instructions)). The Editing page's bar (`components/editing/bar/SelectionBar.tsx`) is the model for the slot, not for the contents: it is always drawn because it also holds the transport; with a selection its summary shows the count with its unit ("3 words"), the range and a status badge, and the registered actions sit at its right end; it has no clear-selection button. From 60 rem of bar the summary sits beside the transport and a selection does not change the bar's height (`src/studio/ui/tests/visual/editing-dock-overlap.spec.ts` allows 0 px from 1100 px of window). Below 60 rem the summary takes its own row (`order-last`, `basis-full`) and the same spec only caps the growth (24 px at 768 px), so a slot that keeps its height there is not verified. **New**.
- **CS-M4** A bulk action that cannot apply to every selected row says so in its `disabledReason` or in its result toast ("2 deleted, 1 is in use"), never silently skips.
- **CS-M5** Selection survives scrolling and filtering; a filter that hides selected rows says how many are hidden in the bar ("3 selected, 1 hidden").
- **CS-M6** Keyboard: Space toggles the focused row's checkbox; Shift+Space or Shift+click extends a range; Ctrl/Cmd+A selects all when focus is in the list; Escape clears the selection. A `Table navigable` page wires them. **New**.
- **CS-M7** Over tiles or a plain list with no header row, CS-M2's checkbox is an "All N" `Checkbox` with `indeterminate` above the list, N being the count shown. **New**.

## Labels and help text

- **CS-L1** Every control has an accessible name (`ControlNaming`, `IconButton` `label`/`action`, `Checkbox` children or `aria-label`, `ToggleGroup`/`RadioGroup`/`SplitButton` `label`). An `IconButton` with neither `label` nor `action` is a type error. `Slider` does not enforce it: its `label` and `aria-label` are both optional, so a caller can ship one with no name.
- **CS-L2** A label is a noun phrase for a value ("Chunk length") and a verb phrase for an action ("Check again"). Sentence case, except where the primitive sets case (`Button` and `Pill look="chip"` draw capitals; `ToggleGroup` segmented keeps the label's own case).
- **CS-L3** An action that opens a dialog, a picker or the system dialog ends its label in "…".
- **CS-L4** Help is a tooltip (a few words, `TooltipTarget`), a `HelpButton` (a few sentences), or the guide [FP8]. A muted one-line description under a `RadioGroup` option or a `Checkbox` is allowed when it states what the option does, not how to use the page.
- **CS-L5** A field's range or unit is shown, not hidden in a tooltip (CS-N1). A field's error is a toast, a modal, or a fixed box whose room is kept while there is no error, never a line that appears and pushes the page down [FP7]. `Field`'s `error` is such a line today (`BaseField.Error`, drawn under the control only when set); a reserved error slot on `Field` is **Proposed**, and until then a caller of `Field error` keeps the room itself or uses a toast.
- **CS-L6** Group labels: a `ToggleGroup`, `RadioGroup` or `SplitButton` names its group (`label`), which the screen reader says before the options.

## Keyboard and ARIA

The primitives supply these. A page that builds its own control instead must supply all of them, and a reviewer treats a page-built one as a defect unless the PR says why no primitive fits.

| Primitive | Role | Keys |
| --- | --- | --- |
| `Button`, `IconButton` | `button`; `aria-busy` when `pending`; `aria-disabled` (still focusable) with `disabledReason` | Enter, Space |
| `Pill`, `ToggleGroup` | `group` of `button`s with `aria-pressed` | Tab to each chip, Enter, Space |
| `RadioGroup` | `radiogroup` of `radio` | Arrows move and select; Tab leaves the group |
| `Switch` | `switch`, says on/off | Space |
| `Checkbox` | `checkbox`, `aria-checked="mixed"` when `indeterminate` | Space |
| `Select` | native `select` | Platform: arrows, type-ahead, Alt+Down |
| `SearchList` | `combobox` + `listbox`, `aria-activedescendant` | Typing filters; Up/Down move; Enter picks; Escape closes its popover |
| `TreeSelect` | button + `tree` | Down from the search box enters the tree; Left/Right close/open; Enter picks |
| `Slider` | `slider` with `aria-valuetext` | Arrows, Page Up/Down, Home, End |
| `NumberInput` | text box, `inputMode="decimal"` | Arrow Up/Arrow Down step; Enter or blur settles |
| `Tabs` | `tablist`/`tab`/`tabpanel` | Arrows move; Enter/Space select. `activation="automatic"` on `TabList` selects as focus moves, for a strip that owns its panels (the Editing drawer) or one that only redraws a list (CS-A4) |
| `Menu`, `ContextMenu` | `menu`, `menuitem`, `menuitemcheckbox`, `menuitemradio`; an off item is described by its `disabledReason` (`Menu`, a plain item only) or `unavailable` (`ContextMenu`) | Arrows, Home, End, type-ahead, Escape; `ContextMenu` also opens on the Menu key and Shift+F10 |
| `Toolbar` | `toolbar`, one tab stop | Arrows, Home, End |
| `Dialog`, `ConfirmDialog` | `dialog` / `alertdialog` | Focus moves in and is trapped; Escape declines (unless `escapeCancels={false}`); focus returns to the opener |
| `Popover`, `HelpButton` | interactive popup | Focus moves in; Escape closes and returns focus |
| `Disclosure`, `Collapsible` | button with `aria-expanded`/`aria-controls` | Enter, Space |

- **CS-K1** Every pressable target is at least 24 × 24 px (`HIT_AREA`), 32 × 32 beside 32 px controls in a bar (`HIT_AREA_32`), whatever its drawn size.
- **CS-K2** A control that is off says why [FP9]. `Button`, `IconButton`, `Pill` (and so a `ToggleGroup` option), a plain `Menu` item and `NavButton` take `disabledReason`. What carries the reason differs by primitive:
  - `Button`, and `IconButton` with `action=`: the control stays focusable with `aria-disabled` and wraps itself in a `TooltipTarget`, so the reason is its hint on hover and on keyboard focus. Neither sets `aria-describedby` on the button (the tooltip's attributes land on `TooltipTarget`'s wrapper), so the reason is not the button's accessible description.
  - `IconButton` with `label=` and no `action=`: `aria-disabled` and focusable, but it draws no hint. The caller wraps it in `<TooltipTarget text={disabledReason}>` with the same text, as the `IconButton` row of [Primitive components](design-system.md#primitive-components) says.
  - `Pill`: `aria-disabled` and focusable; the reason is its hint and, as visually hidden text under `aria-describedby`, its description.
  - `NavButton`: `disabled` turns it off (`aria-disabled`, still focusable) and `disabledReason` says why: its hint, its description, and the note a press opens.
  - A plain `Menu` item: the item stays reachable by keyboard, with the reason drawn under its label and as its description; it has no hint. An item of a `select="one"` or `select="many"` section ignores `disabledReason` and is drawn on.

  A `ContextMenu` item takes `unavailable`. A toolbar command taken out of the rotation on purpose is the exception (`ToolbarButton focusableWhenDisabled={false}`). A `RadioGroup` option takes `reason`, read as its description; the standalone `Radio` drops it. `Checkbox`, `Select`, `TextField`, `NumberInput`, `Slider`, `DateField` and `Field` have a native `disabled` and no reason prop: the reason is text beside the control, tied to it with `aria-describedby` where the primitive passes that through. `Checkbox`, `Select`, `TextField`, `NumberInput` and `DateField` do; `Slider` and `Field` do not. `Switch` is CS-K3.
- **CS-K3** A `Switch` that can be off says why. `Switch` takes `disabled` only, so wrap it in a `TooltipTarget` with the reason until it gains `disabledReason`.
- **CS-K4** Every new command that has an `IconButton` and is used often gets a row in `input/commands.catalog.ts`, and its row in `icons.catalog.ts` names the shortcut, which `IconButton` adds to the tooltip and reports as `aria-keyshortcuts`. A `label=` beside `action=` drops both, and a `hint=` or a `disabledReason` replaces the tooltip and so its shortcut.
- **CS-K5** Native elements (`button`, `select`, `input`, `textarea`, table parts) are not written outside the primitives (`rawNatives.test.ts`), and Base UI is not imported outside them (`baseUiBoundary.test.ts`).
- **CS-K6** A segmented `ToggleGroup` is one tab stop with arrow-key roving, as `RadioGroup` is. `ToggleGroup` makes every chip a tab stop as of 2026-11-20; CS-E6 orders the fix. **New**.

## Sizing and half-width windows

A narrator often works with the app beside the DAW. The window's minimum is 960 × 640 px (`src/studio/desktop/main.go`), half of a 1920 px screen, which is the **narrow** layout (below 1180 px, `layoutBreakpoints.ts`). The layout rules read the reported CSS width, which host zoom divides ([Layout rules](design-system.md#layout-rules), "Zoom"): the same window at 125% reports 960 / 1.25 = 768 px, the **tiny** layout (below 860 px). Every control must work in both.

- **CS-S1** Control heights come from tokens: `--control-height` 36 px (text boxes, `Select`, `TreeSelect`, segmented `ToggleGroup`, `Button` `md`, `IconButton` `md`), `--control-height-sm` 32 px for dense rows, `--button-height-lg` 40 px for decision buttons only. A page does not set a height, padding or font size on a primitive (`buttonOverrides.test.ts`); `className` is for layout.
- **CS-S2** A control is as wide as its row allows, up to a cap: `w-full max-w-80 min-w-0` for a setting's select or text box, `max-w-[26rem]` for a path, `w-40` for a number (`components/settings/row/ValueControl.tsx`). No fixed width wider than the narrow layout's column. `Select` adds `max-w-full min-w-0` when its caller sets no cap.
- **CS-S3** Long labels in a closed `Select` or `TreeSelect` end in an ellipsis with the full text in a tooltip; a segmented `ToggleGroup` wraps onto a second line rather than clip. A segmented group over CS-E1's cap, or whose labels wrap in the tiny capture, is a `RadioGroup` or a `Select` instead.
- **CS-S4** A toolbar of `IconButton`s keeps every command at narrow and tiny widths; commands that do not fit go into a `Menu` (an overflow `IconButton action="moreActions"`), never off the edge.
- **CS-S5** A two-column form (label left, control right) stacks to label over control at the tiny layout. A row with a control and a Reset `IconButton` keeps both on one line (`min-w-0` on the control).
- **CS-S6** Dialogs use the `Dialog` width scale (`DIALOG_WIDTHS`), which never exceeds the window less 2 rem; a dialog's action row wraps its buttons rather than shrink their labels.
- **CS-S7** A list that grows with data has a max height and scrolls inside itself [FP6], except the two lists frontend-primitives names.
- **CS-S8** The visual suite captures every state at 1440 px, 1024 px (`small-desktop`, the narrow layout) and 768 px (`tablet`, the tiny layout) (`src/studio/ui/tests/visual/viewports.ts`). A reviewer opens the 1024 px and 768 px captures of every changed page. **New**.

## Anti-patterns

Each is a reject in review. The ID it breaks is in brackets. Numbers are stable: a new entry goes at the end.

1. A `Select` of colour names, with or without a `Swatch` beside it [CS-C1].
2. Another hand-written swatch-plus-hex pair instead of the shared colour selector [CS-C2].
3. A `Select`, `RadioGroup` or `ToggleGroup` of On/Off or Yes/No [CS-B1].
4. A `Switch` that picks items from a list [CS-B2, CS-M1].
5. A `Select` for 2 or 3 short options a narrator switches between often [CS-E1].
6. A `RadioGroup` or a segmented `ToggleGroup` of more than 5 options [CS-E1].
7. A `Select` of a list that grows with the project and has no search (chapters, voices, characters) [CS-E1, CS-E2].
8. A free-text path box with no Choose… button [CS-P3].
9. A path that breaks inside a folder name, or is cut in the middle with no tooltip [CS-P5].
10. A text `Button` for an action the icon catalogue has [FP1].
11. A destructive action with an "OK" confirm, or a confirm on an action that Undo could take back [CS-X1, CS-X2].
12. `danger-solid` on the page instead of inside the confirm [CS-X3].
13. "Select all" / "Select none" text buttons instead of one checkbox [CS-M2].
14. A bulk-action bar that appears and pushes the list down [CS-M3].
15. A control that is `disabled` with no reason [FP9, CS-K2].
16. A `Tabs` strip that sets a value, or a `ToggleGroup` that switches panels [CS-A4].
17. A `Slider` for a value a delivery spec checks exactly, or for a count [CS-N1, CS-N2].
18. An "Automatic" checkbox beside the control it overrides, or a 0 that means automatic, instead of an "Automatic (…)" option [CS-E3, CS-N7].
19. A placeholder used as the label or as an instruction [CS-T4].
20. A fixed-width control that overflows the column in the tiny layout [CS-S2].
21. A page-built combobox (`role="combobox"` written outside `SearchList`) [CS-E1].
22. A checked, disabled `Checkbox` that states a fact [CS-B7].
23. A `Select` of "Paragraph 1 … N" or "Line 1 … N" [CS-N10].
24. One setting drawn as different controls, or with different option labels, in two places [CS-E10].
25. A segmented `ToggleGroup` used as a list filter [CS-E13].
26. A plain `Select` of DAW tracks instead of `TrackSelect` [CS-E14].

## Rules this page adds

frontend-primitives covers which primitive exists, icon buttons, errors, prose, dead controls and list caps. The rules marked **New** above go beyond it. The audit behind them is [the component-selection audit](../research/2026-11-component-selection-audit.md) (tracking issue [#3675](https://github.com/countrymanprime/narration-studio/issues/3675)). The rows marked "coordinator's default" were decided without the owner on 2026-11-20 and stand until the owner overturns them; a row marked "accepted by the owner" was put to the owner, who let it stand as written.

| Topic | Rule | Decided by |
| --- | --- | --- |
| Colour uses one colour selector, in two modes and two palette forms | CS-C1 to CS-C3 | Owner's example on #3675; the forms from the audit (R8, R9) |
| `Switch` versus `Checkbox`; rows of an editable list use `Checkbox` | CS-B2, CS-E9 | Coordinator's default (audit R3, M8) |
| Segmented cap: 5 options, when the labels fit the row in a 960 px window; the playback-speed labels stay as they are | CS-E1, CS-N3 | Owner, 2026-11-20 (audit R1) |
| A filter is chips in the filter look, one of N or several; segmented and the default `chip` look are for values | CS-E13 | Coordinator's default, accepted by the owner (audit R4, corrected: the default look draws `chip`, not `filter`) |
| An unanswered boolean is a `Switch` drawn off with a note | CS-B6 | Coordinator's default, accepted by the owner (audit M3, first option) |
| A time is entered in a time field | CS-N8 | Coordinator's default, accepted by the owner (audit M4, first option) |
| A scope switch is a segmented `ToggleGroup` | CS-E11 | Coordinator's default, accepted by the owner (audit M15, first option) |
| A Settings choice row declares its control; roving first | CS-E6, CS-K6 | Audit R2, R10 |
| The "say it aloud" test for a number | CS-N1, CS-N2 | Audit R5 |
| Money, Automatic numbers, ranges, manuscript indexes | CS-N6, CS-N7, CS-N9, CS-N10 | Audit M1, M2, M12, M13 |
| Visual enums, value chips, one value one control, presets with Custom | CS-E7, CS-E8, CS-E10, CS-E12 | Audit M5, M7, M9, M16 |
| A fact is not a control | CS-B7 | Audit M6 |
| Multi-line text; the browser's file input | CS-T5, CS-P6 | Audit M10, M11 |
| Confirm versus Undo; destructive items in menus | CS-X2, CS-X6 | This page |
| Link buttons and external links; `Menu` for related actions; `SplitButton`; `Tabs` versus `ToggleGroup` and the category strip | CS-A1 to CS-A4 | This page; the category strip is the coordinator's default, accepted by the owner |
| Every DAW track picker is `TrackSelect` | CS-E14 | This page (audit G1, G2, G4) |
| Multi-select and bulk actions | CS-M1 to CS-M3, CS-M6, CS-M7 | This page; audit M14 |
| The narrow and tiny captures as required checks | CS-S8 | This page |

## Where the code departs from this page (2026-11-20)

The audit lists every site with its file and line; this table names the larger classes, so a reader knows where existing code is not a model to copy. A row is deleted when its fix merges. Fix issues are tracked under [#3675](https://github.com/countrymanprime/narration-studio/issues/3675).

| Rule | Departure | Audit rows |
| --- | --- | --- |
| CS-C1, CS-C2 | `ColourField` is written and no site uses it yet. Six sites pick a colour by hand: three swatch-plus-hex pairs (`components/settings/row/ValueControl.tsx`, `components/settings/ScopedSetting.tsx`, `components/proof/proofOptions/ProofOptions.tsx`) and three `Select`s of colour names (`components/storybible/SpeakerColourField.tsx`, `components/settings/page/StoryBibleTypesPanel.tsx`, `components/script/page/tools/select/MarksDialog.tsx`) | S3, S4, S5, B1, C1, C2, F6 |
| CS-E6 | Three renderers draw every host `choice` as a `Select` (`components/settings/row/ValueControl.tsx`, `components/settings/ScopedSetting.tsx`, `components/proof/proofOptions/ProofOptions.tsx`), as [Settings rows](design-system.md#settings-rows) records; the registry has no control declaration | S1, S2, F7 |
| CS-K6 | `ToggleGroup` makes every chip a tab stop | R10 |
| CS-E13 | `ToggleGroup` has no `look="filter"`. Three one-of-N list filters are `ToggleGroup`s in a value look: two segmented (`components/settings/page/SettingsPage.tsx`, `components/settings/page/ModelsPane.tsx`) and one in the default `chip` look (`components/editing/cleanup/CleanupHeader.tsx`) | S19, E8, R4 |
| CS-E14 | Three track pickers are plain `Select`s (`components/engine/LinkChaptersDialog.tsx`, `components/engine/CreateChapterRegionsDialog.tsx`, `components/booth/voices/WhoIsInDialog.tsx`). `TrackSelect` has no prop for the "key · voice" option label the last one draws | G1, G2, G4 |
| CS-E1 (search) | `ComboSelect` is not written; three pages write `role="combobox"` themselves (`components/storybible/Relationships.tsx`, `components/script/page/tools/speaker/SpeakerPicker.tsx`, `components/layout/JumpMenu.tsx`), and several `Select`s list chapters or characters | B2, B3, B4, C3, E5, K1, K3, G3, S17 |
| CS-B1, CS-B2, CS-B6 | Two Settings bodies are Off / On `RadioGroup`s; some booleans saved at once are `Checkbox`es, and a draft's are `Switch`es | S6 to S10, E4 |
| CS-M1, CS-M2, CS-M7 | `components/production/ImportReview.tsx` selects chapter tiles and character tiles with a `Switch` each and "Select all" / "Select none" buttons; `components/recordingcheck/CheckRecordingsDialog.tsx` has "All" / "None" buttons | P1 to P4, K2 |
| CS-E3, CS-N7, CS-E10 | Parallel workers is a number box where 0 means automatic in Settings, a `Slider` with an "Automatic" `Checkbox` in `components/recordingcheck/RunOptions.tsx`, and a chip group in `components/proof/CompareRun.tsx` | S16, P5, P6, F2, F3, S22 |
| CS-N1 | Number boxes built on `TextField` with page-written parsing in Settings and Schedule | S11 to S14, H1, H2 |
| CS-P3 | **REAPER program** (`daw.reaperPath`) is a free-text box with no Choose… button | S15 |
| CS-L5 | `Field` draws `error` as a line in the flow under the control, which adds its height when it appears; it has no reserved slot. `components/settings/row/ValueControl.tsx` shows a refused number as a `role="alert"` line in place of the range note; it is counted in the inline-errors allowlist | (none) |
| CS-N6 | `NumberInput` has no precision or format prop: a money value with `step={0.01}` shows 12, not 12.00 | H1 |
| CS-L1 | `Slider`'s `label` and `aria-label` are both optional | (none) |
| CS-K2 | The standalone `Radio` drops `reason`; `Select`, `TextField`, `NumberInput`, `Slider`, `DateField` and `Field` take no reason, and `Slider` and `Field` take no `aria-describedby` either. `Button` and `IconButton` show `disabledReason` as a hint only, not as the button's description; an `IconButton` with `label=` alone shows it only if the caller adds the `TooltipTarget` | (none) |
| CS-E5, CS-E7, CS-E8, CS-E13 | `Menu` reads `disabledReason` only on a plain item. An item of a `select="one"` or `select="many"` section cannot be off with a reason | (none) |
| CS-K3 | `Switch` has no `disabledReason` | (none) |
| CS-X6 | `Menu` and `ContextMenu` items have no danger tone | (none) |
| CS-N5, CS-N8 | `Stepper` and `TimeField` are not written | E9 |
| CS-A4 | `components/proof/ChapterCompare.tsx` switches three panels with a segmented `ToggleGroup` | F1 |
| CS-M3 | `components/editing/bar/SelectionBar.tsx` has no clear-selection button, and below 60 rem of bar a selection may make it taller | (none) |
| CS-A1 | External links have no primitive; `components/assets/AssetFacts.tsx` and `components/settings/analysis/ConsentDialog.tsx` each style their own `<a>` | (none) |

## Review checklist

A reviewer answers each for every new or changed control in the diff:

1. Which primitive is it, and is it the one the decision table gives for this action or value type?
2. If it holds a colour, is it the colour selector (CS-C1)?
3. If it is a boolean, is it a `Switch` (a setting that stands alone, applied at once) or a `Checkbox` (form field, selection or list column) (CS-B2)?
4. If it is an enum, does its option count match CS-E1, will the list grow, and is the same value drawn the same way elsewhere (CS-E10)?
5. If it is a number, would the narrator say it aloud (CS-N2), and can it be "Automatic" (CS-N7)?
6. If it is a path, is there a Choose… button and is the path drawn with `BreakablePath` (CS-P1, CS-P2)?
7. If it destroys data, is it confirmed with a named verb, or undoable with a toast (CS-X1, CS-X2)?
8. If it selects several items, does it follow CS-M1 to CS-M4?
9. Does it have an accessible name, a 24 px target, and a reason when off (CS-L1, CS-K1, CS-K2)?
10. Does it fit in the 1024 px and 768 px captures without overflowing or clipping (CS-S2, CS-S3, CS-S8)?
