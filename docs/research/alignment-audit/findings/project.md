# Project picker and startup: alignment findings

Part of the [alignment audit](../../alignment-audit.md). Findings are grouped by the round that produced them; a later round's finding that replaces an earlier one says `Supersedes`. Evidence paths are `<page>/<state>/<width>.png` of the light capture, `dark:<page>/<state>/<viewport>.png` for dark, `tall:<page>-w<width>.png` for the below-the-fold captures; the images are not committed (regenerate the repo-viewport ones with `pnpm --dir apps/ui visual:page <page>`).

## Round 4: gap fill

### R4SM-15 Why does the startup error card look like an ordinary card, with a left-aligned code block between centred things?

- Page / state: startup / invalid-payload
- Widths: 1280, 390, d768 (theme: both)
- Gut reaction: the app has failed to start and the screen is a calm little card with no mark, no warning colour and a raw "host.binding Bootstrap did not match its schema: projectName: Invalid input: expected string, received null" paragraph.
- What is wrong: title and sentence are centred, the code block is left-aligned (full width, 3 lines at 390), "Diagnostic: mock" is centred 11 px mono, buttons centred; there is no logo or icon so nothing says this is the app, and no sentence says whether work is safe. At 390 the card has 25 px side gutters (page gutter elsewhere is 16 px) and the button pair is 158 + 126 px (unequal). In dark the code box (#262320) is nearly the card colour.
- Where: startup screen component (`startup/` under `components/`, cause not located this round)
- Severity: looks wrong
- Fix: add the brand mark and a warning icon, left-align the whole card or centre only the title, say that the project files are untouched
- Evidence: `S/crops/r4sm/st1280.png`, `st390.png`, `dst768.png`
- Shared: page-local

## Round 3: coverage gaps and scanner cross-check

### R3PJ-1 Why does the picker at 1920 float in the middle with nothing around it?

- Page / state: project / picker-empty, pinned, removed, daw-running, no-recents
- Widths: 1920, 1280, 1024 (theme: both)
- Gut reaction: a postcard in a field; 1160 px of blank each side at 1920 and the logo at a different height per state.
- What is wrong: the 760 px column is vertically centred (XPJ-1) and at 1920 leaves 580 px left and right; New project and the folder icon are 80 px apart.
- Where: `project/ProjectPicker.tsx:198`
- Scanner: none
- Severity: polish (extends XPJ-1)
- Fix: top-align
- Evidence: `S/crops/r3sh/m_pj1920_a.png`
- Shared: page-local
- Note: I could not read m_pj1920_a/b/c at judging time (reads lost to the request limit), so 1920 is judged from `mm_switch-project-open_a.png` (same page) only.

## Round 2: strict review

### XPJ-1 Why does the picker float at a different height every time, and why did the whole app disappear?

- Page / state: project / picker-empty, picker-pinned, picker-removed, picker-daw-running, picker-no-recents; shell / switch-project-open
- Widths: 1440, 1024, 768 (blank top 230-320 px); 390 (theme: both)
- What is wrong: the 760 px column is vertically centred, so the logo lands at y=260 with two rows, 296 with one, 219 with the banner, 302 with none; at 1440 the top 230 px and the sides are blank; pressing the project name in the header replaces the whole shell (rail, bar) with this page, so "switch project" feels like leaving the app and not a popover.
- Where: `project/ProjectPicker.tsx:198` (`flex min-h-full ... justify-center`)
- Severity: looks wrong
- Fix: top-align with a fixed offset; open the switcher as an overlay inside the shell
- Evidence: `project/picker-removed/w1440.png` (logo y=296) vs `.../picker-empty/w1440.png` (260) vs `.../picker-daw-running/w1440.png` (219), `app-shell/switch-project-open/w1440.png`
- Shared: page-local
- Supersedes: PRJ-3

### XPJ-2 Why can't I read the project names?

- Page / state: project / `picker-*`; shell / switch-project-open
- Widths: 390 ("Alice's Adventure...", "C:\Projects\Alic...") (theme: both)
- What is wrong: three action buttons take 150 px of a 340 px row, the date and book icon are hidden, and the name is cut to 20 characters, making two projects with similar names indistinguishable.
- Where: `project/ProjectPicker.tsx:266-290`
- Severity: looks wrong (390)
- Fix: below `sm`, wrap the buttons under the name
- Evidence: `project/picker-pinned/w390.png` (y 460-600), `app-shell/switch-project-open/w390.png`
- Shared: page-local
- Supersedes: PRJ-1, SHL-5

### XPJ-5 Why is the New Project dialog 1000 px wide with Cancel and Create 900 px apart?

- Page / state: project / new-project-dialog
- Widths: 1920, 1440 (x 217-1223), 1024 (theme: both)
- What is wrong: a single name box stretches 970 px; Cancel is at the far left and Create at the far right of a footer band; the Location line and "Change location..." button stack below, left-aligned, in the middle of 970 px of nothing.
- Where: `primitives/Dialog.tsx:149`; `project/NewProjectDialog.tsx`
- Severity: looks wrong
- Fix: cap the width; place Cancel next to Create
- Evidence: `project/new-project-dialog/w1440.png`
- Shared: `Dialog`

### XPJ-3 Why does "Pinned and recent" not show which are pinned?

- Page / state: project / picker-pinned
- Widths: 1440, 768 (theme: light)
- What is wrong: one flat list under one title; the pinned project sits first with only a tinted pin button (x 999-1035) to say so, and the unpinned 15 Sep row below is newer, so the order looks arbitrary.
- Where: `project/ProjectPicker.tsx:243-293`
- Severity: polish
- Fix: a "Pinned" heading and a "Recent" heading in the card
- Evidence: `project/picker-pinned/w1440.png`
- Shared: page-local

### XPJ-4 Why is "browse for a folder" a small icon away from "New project"?

- Page / state: project / every picker state
- Widths: 1440, 768, 390 (theme: both)
- What is wrong: the two ways to get a project, New project (filled, top right) and Browse folders (unlabelled 36 px folder icon, x 1047-1083, inside the list card's header) are 80 px apart and styled as a primary and an icon with only a tooltip.
- Where: `project/ProjectPicker.tsx:207-217` and `:232-241`
- Severity: polish
- Fix: put "Open folder..." beside New project as a secondary button
- Evidence: `project/picker-empty/w1440.png`
- Shared: page-local

### XPJ-6 Why is the name rule jammed under the box?

- Page / state: project / new-project-dialog
- Widths: all (theme: both)
- What is wrong: the rules sentence ("A name can't contain...") sits 4 px under the name box at y=454, in 12 px bold text darker than the "Name" label above, so it looks like an error; Location follows 20 px below.
- Where: `project/NewProjectDialog.tsx` (hint under the field) with `primitives/Field.tsx`
- Severity: polish
- Fix: 6-8 px gap, regular weight, muted colour
- Evidence: `project/new-project-dialog/w1440.png` (y 440-470)
- Shared: `Field` hint

### XPJ-7 Why doesn't the banner's Open line up with the row's Open?

- Page / state: project / picker-daw-running
- Widths: 1440, 768, 390 (theme: both)
- What is wrong: the banner's Open (x 1028-1083) is 96 px right of the row's Open (x 932-987), and the banner names the same project the row below lists, so one project has two Open buttons in two places.
- Where: `project/ProjectPicker.tsx:221-236`
- Severity: polish
- Fix: highlight the linked project's row and offer Open there
- Evidence: `project/picker-daw-running/w1440.png`
- Shared: page-local

### XPJ-8 Why does the empty list give me nothing to press?

- Page / state: project / picker-no-recents
- Widths: 1440, 768, 390 (theme: light)
- What is wrong: "No recent projects yet." sits left in a 52 px strip; New project is up in the header row, and a stack of two toasts (x 972-1420, y 758-880) fills the bottom right.
- Where: `project/ProjectPicker.tsx:255-259`
- Severity: polish
- Fix: put a New project button in the empty strip
- Evidence: `project/picker-no-recents/w1440.png`
- Shared: page-local

### XPJ-9 Why does the folder path break in the middle of a word?

- Page / state: project / new-project-dialog
- Widths: 390 ("C:/Users/Mock/Narrat / ionStudio") (theme: both)
- What is wrong: the mono path wraps anywhere and "NarrationStudio" is split.
- Where: `primitives/Dialog.tsx:176` (`break-words`)
- Severity: polish (390)
- Fix: `[overflow-wrap:anywhere]` plus `<wbr>` after each slash, on the path only
- Evidence: `project/new-project-dialog/w390.png` (y 440-490)
- Shared: Dialog body
- Supersedes: PRJ-2

### XPJ-10 Why does the title wrap onto two lines when there is room?

- Page / state: project / every picker state
- Widths: 390 ("Choose / your project" beside New project, subtitle on two lines) (theme: both)
- What is wrong: the heading shares a row with the button, leaving 222 px for a 283 px title.
- Where: `project/ProjectPicker.tsx:207` (`flex-wrap items-end`, `min-w-0 flex-1` heading)
- Severity: polish (390)
- Fix: wrap the button under the title below `sm`
- Evidence: `project/picker-empty/w390.png`
- Shared: page-local

### XPJ-11 Why does New project sit lower than the subtitle?

- Page / state: project / every picker state
- Widths: 1440, 1024, 768 (theme: both)
- What is wrong: the button bottom is y=379 (1440) against the subtitle's bottom at y=377 and the title centre at y=337, so it aligns with neither.
- Where: `project/ProjectPicker.tsx:207` (`items-end`)
- Severity: polish
- Fix: align to the title baseline or to the subtitle's baseline
- Evidence: `S/crops/xsh/pk_head.png`
- Shared: page-local

### XPJ-12 Why is the error message left-aligned inside a centred card?

- Page / state: startup / invalid-payload
- Widths: 1440, 768, 390 (theme: both)
- What is wrong: the title, sentence and "Diagnostic: mock" are centred, the code block (x 481-959) is left-aligned and breaks mid-clause ("projectName:" ends the first line), and Retry (158 px) and Copy (126 px) are different widths; there is no icon or status to say it is an error.
- Where: `layout/StartupScreen.tsx`
- Severity: polish
- Fix: one alignment for the card; equal-width buttons
- Evidence: `startup/invalid-payload/w1440.png` (card x 464-975, y 325-574)
- Shared: page-local
