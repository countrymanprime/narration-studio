# Master & QC: the state matrix

Written before the code ([definition of done](../../.claude/rules/definition-of-done.md), rule 3). Page: `apps/ui/src/components/masterqc/`, route `/master`, the [Studio Next mock's Master page](mockups/studio-next/src/pages/Master.tsx) (`ADR 0760`). Controls kept as built because the mock has no equivalent (Master all to spec, the mastering chain, Diagnostics, the report export, Multi-platform export, a file's every-rule list) are not in this matrix: this PR does not change them.

**Left out on purpose, with its reason (ADR 0440):** the mock's **Clicks** and **Text** columns. Nothing measures mouth clicks or text coverage per rendered file, so a column would be a number the app made up. **Play the quietest 5 s** and **Open in the DAW** are built over the DAW port's `playQuietest` and `openFile`.

Each cell is a test name (`unit` = Vitest in `apps/ui/src/components/masterqc/`, `e2e` = the Playwright spec `apps/ui/tests/visual/master-matrix.spec.ts`) or **not tested: reason**. This table is the plan; the PR body repeats the final state of every cell.

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

Legend for the DAW and sidecar columns: **never answers** (the call never settles), **late** (the answer arrives after the narrator moved on), **out of order**, **lost event**, **repeated event**, **wrong project open**, **restart mid-session**.

### C1 Chapter bar

| State | Result |
| - | - |
| empty (no chapters) | unit `the chapter bar is absent when the manuscript has no narration chapters` |
| one | unit `a one-chapter book disables both arrows` |
| many / huge (200 chapters) | unit `a 200-chapter book steps and picks` |
| loading (chapters not read yet) | unit `chapters.read-late: the bar appears when the list arrives, the table is usable before` |
| failed (chapters cannot be read) | exists: `chaptersProblem` alert; unit `a failed chapter read says so and keeps the file names` |
| stale (a chapter removed after the page opened) | not tested: the chapter list is read once per visit; a removal in Production shows on the next visit (the page remounts) |
| long / RTL / emoji heading | unit `a long, a right-to-left and an emoji chapter heading stay inside the bar` and the e2e overlay run opens the picker with each |
| rapid double-fire | unit `two quick Next presses move two chapters, not one and not a loop` |
| reload mid-action | unit `the chapter comes back from the shared chapter after a reload` |
| leave mid-action | not tested: the bar holds no pending work |

### C3, C4, C5, C10 Measuring

| State | Result |
| - | - |
| empty (nothing picked: dialog cancelled) | unit `cancelling the file dialog changes nothing and shows no error` |
| one / many / huge (300 files) | unit `300 files list, select and scroll`; one: existing |
| loading (running) | exists: progress, Cancel |
| refused (the host refuses to start: a measurement already running) | unit `a refused start says why and leaves the page usable` |
| failed (a file cannot be read) | exists: the row says why; the others continue |
| stale (files changed on disk after the check) | unit `a file the host says changed since the check shows "check the files again", not its old numbers` (host refusal text shown) |
| long / RTL / emoji / Unicode file names | unit `file names with spaces, Unicode, emoji, right-to-left and 250 characters render without overflow` and the path set below |
| rapid double-fire (Re-check twice) | unit `Re-check pressed twice starts one measurement` |
| reload mid-action | exists: the host's job is read on mount; unit `a running measurement is shown again after a remount` |
| leave mid-action | exists in the guide; unit `leaving and returning during a run shows the run` |
| host never answers `measureState` | unit `a poll that never answers shows "can't tell, last heard N s ago" with Check again` |
| host answers late (after Cancel pressed) | unit `a state read that arrives after Cancel does not bring the progress bar back` |
| host answers out of order | unit `an older state answer after a newer one is dropped` |
| lost event | the page polls; a lost answer is a missed poll: unit `one failed poll does not stop the polling` |
| repeated event | unit `the same state twice changes nothing` |
| wrong project open | not tested: the measurement is of files the narrator picked, not of the project; no project is read |
| restart mid-session | unit `a host restart (state idle) after a running state clears the progress and says the check stopped` |

### C6, C7 Rows and the menu

| State | Result |
| - | - |
| empty | exists: "Nothing measured yet" |
| one / many | exists |
| huge | covered by the 300-file cell above |
| failed row / waiting row | exists |
| long / RTL / emoji name | covered above |
| rapid double-fire (Enter twice, double click) | unit `selecting the same file twice changes nothing` |
| context menu on a waiting row | exists: Play disabled with the reason |
| context menu over each window edge and corner, beside the sidebar and the nav, over scrolled content, at narrow widths, while another overlay is open | e2e `overlay guard: Master & QC` |

### C8, C9 DAW actions

| State | Result |
| - | - |
| gate off (capability absent) | exists: disabled with the capability's sentence |
| capability report never arrives | unit `a capability read that never answers shows "can't tell what your DAW can do" with Check again, not "Checking" forever` |
| capability report fails | same cell |
| capability changes while the page is open | unit `a daw_capabilities_changed event enables the buttons without a reload` |
| window regains focus | unit `focus reads the capabilities again` |
| refused | exists: the DAW's own sentence as an error toast |
| the call never answers | unit `a call that never answers keeps the button busy, and Escape/leave does not leave a ghost` (the button is disabled while a call is in flight, with a visible "Asking the DAW…") |
| rapid double-fire | unit `Play pressed twice sends one call` |
| late answer after leaving | unit `an answer after the page closed shows no toast on another page` |
| wrong project open / restart | the host words the refusal; shown as the DAW's sentence (exists) |

### C2, C11 Delivery links

| State | Result |
| - | - |
| each | exists: `the-profile-pill-and-open-delivery-go-to-delivery`; e2e opens Delivery from each |
| no profile read | unit `the pill is absent and the profile problem is shown when profiles cannot be read` (exists for the problem line) |

### C12 Read-only drawings

| State | Result |
| - | - |
| empty / one / many / huge | exists / unit (300 files draw one tick each) |
| a value the profile has no rule for | exists |
| long profile name | unit `a 200-character custom profile name wraps in the pill and the panel title` |

## Path fixtures

Every file path Master & QC resolves (a picked file measured by the host; a `#file=` link) runs the fixture set in the host's measurement code: `apps/desktop/master_paths_test.go` `TestMasterPathFixtures` over: outside the starting folder, nested, spaces, Unicode, very long (over 260), UNC, different case, trailing dots and spaces, read-only, missing. Cells that cannot run on a Linux CI (UNC, trailing dots, case) are **not tested on Linux: Windows owner check**, listed in the PR.
