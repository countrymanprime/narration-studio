# Master & QC: the state matrix

Written before the code ([definition of done](../../.claude/rules/definition-of-done.md), rule 3). Page: `apps/ui/src/components/masterqc/`, route `/master`, the [Studio Next mock's Master page](mockups/studio-next/src/pages/Master.tsx) (`ADR 0760`). Controls kept as built because the mock has no equivalent (Master all to spec, the mastering chain, Diagnostics, the report export, Multi-platform export, a file's every-rule list) are not in this matrix: this PR does not change them.

**Left out on purpose, with its reason (ADR 0440):** the mock's **Clicks** and **Text** columns. Nothing measures mouth clicks or text coverage per rendered file, so a column would be a number the app made up. **Play the quietest 5 s** and **Open in the DAW** are built over the DAW port's `playQuietest` and `openFile`.

Each cell is a test name (`unit` = Vitest in `apps/ui/src/components/masterqc/`, `e2e` = the shared overlay guard's Master & QC cases, `apps/ui/tests/visual/overlays/master.ts`, run by `overlays.spec.ts`) or **not tested: reason**. Updated at the end of the work: a cell names the test that drives it or says **not tested** and why. `matrix` is `masterqc/page/Matrix.test.tsx`; `e2e` is `apps/ui/tests/visual/overlays/master.ts`; `go` is `apps/desktop/master_paths_test.go`.

## Controls

| # | Control | What it does |
| - | - | - |
| C1 | Chapter bar (previous, next, picker) | Moves the selected file to the chapter's file, or to "Not mastered yet" when the chapter has none; remembers the chapter for Proof. |
| C2 | Profile pill | Opens Delivery. |
| C3 | Check files… / Re-check n files | Picks files (first time) or measures the same files again. |
| C4 | Choose other files… | Picks other files and measures them. |
| C5 | Cancel | Stops a running measurement; finished files keep their results. |
| C6 | Files table row (click, arrows, Enter) | Selects a file; its detail shows. |
| C7 | Row context menu | Show the checks, Play, Open in the DAW, Check the files again. |
| C8 | Play the quietest 5 s | Asks the DAW to play the stretch around a file's quietest point. |
| C9 | Open in the DAW | Asks the DAW to show the file. |
| C10 | Check the files again (detail icon) | The same as C3 when files exist. |
| C11 | Open Delivery (package panel) | Opens Delivery. |
| C12 | Book consistency, package checks (read-only) | Drawn from the files and the profile. |

## The states, per control

### C1 Chapter bar (a shared primitive: `ChapterStepper`)

| State | Result |
| - | - |
| empty, one, many, huge (chapter count) | existing `ChapterStepper.test.tsx` and stories (first, middle, last, all). **Not tested** at 200 chapters: the list scrolls inside its popup, which `e2e` covers at every size of the shared guard (1440x900, 1100x700, 820x600, 360x500, 320x300) |
| loading, failed (chapters not read) | existing: the bar is absent until chapters arrive; a failed read shows "The chapters could not be read" (`Page.test.tsx`) |
| stale (a chapter removed after the page opened) | **not tested**: the list is read once per visit; the page remounts on the next visit |
| long, right-to-left, emoji heading | `ChapterStepper` story "Very long chapter name"; the picker's size is guarded by `e2e` case `chapter picker`. RTL and emoji headings are **not tested** in the picker |
| rapid double-fire, reload mid-action, leave mid-action | **not tested**: the bar holds no pending work; the choice is only the selected file |
| overlay (picker at every size of the shared guard (1440x900, 1100x700, 820x600, 360x500, 320x300), over the row menu) | `e2e`. **Found and fixed:** the picker ran 78 px below a 360 px-high window; it is now capped to the room left (`--available-height`) |

### C3, C4, C5, C10 Measuring

| State | Result |
| - | - |
| empty (file dialog cancelled) | `matrix` `cancelling the file dialog changes nothing and shows no error` |
| one, many, huge (300 files) | existing; `matrix` `300 files list, with spaces, Unicode, emoji, right-to-left and a 250-character name` |
| loading | existing: `the-run-controls-are-kept-above-the-table` |
| refused (a run already going) | `matrix` `a refused start says why and leaves the page usable` |
| failed (a file cannot be read) | existing: the row says why; the others continue |
| stale (file changed on disk after the check) | host answers a refusal sentence (`TestMasterPlayQuietestAndOpenInDawRefuseAFileNotInTheLastRun`); not re-tested in the UI |
| long, Unicode, emoji, right-to-left, spaces names | `matrix` (300-file test) |
| rapid double-fire | `matrix` `Re-check pressed twice starts one measurement` |
| reload or leave mid-action | `matrix` `a measurement already running when the page opens is shown again` |
| host never answers, or a read fails | `matrix` `one failed poll does not stop the polling…` (says "Can't tell how the measurement is going, last heard N s ago", Check again, retries every 2 s). **Found and fixed:** a failed poll used to end the polling and leave the bar frozen with no way on |
| host answers late | `matrix` `a state read that arrives after Cancel does not bring the progress bar back`. **Found and fixed** (numbered reads) |
| out of order | same mechanism as the late answer (an older answer is dropped); not driven separately |
| lost event | the page polls and has no event for this; covered by the failed-poll test |
| repeated event | **not tested**: an identical state set twice is a no-op render |
| wrong project open | **not tested**: the measurement is of files the narrator picked, not of the project |
| restart mid-session | `matrix` `a host restart (idle) after a running state clears the progress bar` |
| window regains focus | **not tested in the UI** for the measurement read (the listener is the same one the capability read tests); `matrix` covers focus for the capability read |

### C6, C7 Rows and the menu

| State | Result |
| - | - |
| empty, one, many, waiting, failing | existing (`Files.test.tsx`) |
| long, Unicode, emoji, RTL names | `matrix` (300-file test) selects the right-to-left one |
| rapid double-fire (Enter twice, double click) | **not tested**: selecting the same file twice sets the same state |
| context menu at every window edge and corner, beside the sidebar, at every size of the shared guard (1440x900, 1100x700, 820x600, 360x500, 320x300), over scrolled content, while the picker is open | `e2e` (a real right-click for the stacked case). **Not covered:** the stacked case at 320x300, where the open picker covers the whole first row |
| tooltips of the icon buttons | `e2e` (the hints on Play and Check the files again, opened by hovering). **Not covered:** over content scrolled halfway or to the end, where the hint did not show on CI and the cause was not found |

### C8, C9 DAW actions

| State | Result |
| - | - |
| gate off | existing: disabled with the capability's sentence |
| capability read fails or never answers | `matrix` `a capability read that fails says it cannot tell and offers Check again`. **Found and fixed:** the gates read "Checking" for ever with no exit. A read that never settles shows the same "Checking…" sentence: **not tested** (a hung promise is not distinguishable from a slow one without a timer; the bridge times calls out host-side) |
| capability changes while open, window focus | `matrix` `a daw_capabilities_changed event…`, `the window regaining focus reads the capabilities again`. **Found and fixed:** the page read the report once |
| refused | existing (`useFileActions.test.tsx`) |
| the call never answers | `matrix` `a DAW call that never answers…` (Open still works) |
| rapid double-fire | `matrix` `Play pressed twice…`. **Found and fixed:** two presses sent two calls |
| late answer after leaving | **not tested**: a toast from a call that settles after the page closed still shows, by design (the DAW did the thing) |
| wrong project open, restart | the host words the refusal; shown as the DAW's sentence (existing) |

### C2, C11 Delivery links, C12 read-only drawings

Existing (`Page.test.tsx`: the pill and Open Delivery, the package counts, the chart, a profile that lacks a rule). **Not tested:** a 200-character profile name in the pill.

## Path fixtures

Every path Master & QC resolves (the picker's answer, the measurement, and the host's last-run lookup behind Play and Open in the DAW) runs `go` `TestMasterPathFixtures`: outside the starting folder, nested, spaces, Unicode, emoji and right-to-left, long (about 190 characters), read-only, missing, a path nobody picked (refused) and a dot-dot detour to a picked file. The Windows-only cells (different case, trailing dots and spaces, UNC, a path over 260 characters) are **not tested on Linux**: the Go package does not build here (GTK), so the test was vetted for Windows (`GOOS=windows go vet`) and runs in the `go-test` Windows job. Windows owner checks are listed in the PR.
