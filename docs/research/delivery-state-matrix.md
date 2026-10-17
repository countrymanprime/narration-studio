# Delivery: the state matrix

Written before the code ([definition of done](../../.claude/rules/definition-of-done.md), rule 3) and completed at the end of the work: every cell now names the test that drives it or says why none does. Page: `apps/ui/src/components/delivery/`, route `/delivery`, the [Studio Next mock's Delivery page](mockups/studio-next/src/pages/Delivery.tsx) (`docs/design/design-system.md#which-mocks-are-the-spec`). The profile's "Rules and their sources" panel has no mock equivalent and stays as built; this PR does not change it.

**Decision: the output folder stays chosen by the host.** The mock's "Folder" is a text box the narrator types a path into. The host's `PackageStart` opens the operating system's folder picker and the UI never names a path (`package_job.go`: the folder is "the one the package job wrote, never one the UI names"; [threat model](../architecture/threat-model.md) row 6q: `OutputDir` comes from the operating system's own folder picker). A typed path would be a new binding that takes a path from the UI, a new trust boundary and Go code the container cannot compile (`apps/desktop` needs GTK). The Folder row therefore shows the folder the host chose, or "Chosen when you build", and the build says where it will ask. Recorded for the owner in the PR body.

**Left out of the matrix:** nothing the mock shows is left out. The mock's "Retail sample" extra row is not drawn: the host writes the files it writes and the page lists those (`PackageJob.files`).

Each cell is a test name or **not tested: reason**. `page` is `apps/ui/src/components/delivery/page/Matrix.test.tsx`, `card` is `apps/ui/src/components/delivery/profile/Matrix.test.tsx`, `read` is `page/useHostRead.test.tsx`, `cross` is `apps/ui/src/crossPage.matrix.test.tsx`, `e2e` is `apps/ui/tests/visual/overlays/delivery.ts` run by `overlays.spec.ts`, `visual` is the catalogued Delivery states of `app.spec.ts` (`ready`, `built`, `building`, `build-failed`, `host-quiet` and the rest, in `tests/visual/catalog/delivery.ts`), and `go` is `apps/desktop/internal/packager/paths_test.go`. A test name is the start of its title.

## Controls

| # | Control | What it does |
| - | - | - |
| D1 | Profile menu | Chooses the delivery profile the project is judged against. |
| D2 | Profile name (custom only) | Renames the custom profile. |
| D3 | Limit boxes (custom only) | Edit a check's lowest and highest. |
| D4 | Longest file (custom only) | Edits the longest file, in minutes. |
| D5 | Build \<profile\> package | Assembles the package from the files already mastered and encoded; the host asks for the folder. |
| D6 | Cancel (while building) | Stops the build. |
| D7 | Open the folder (after a build) | Shows the built package's folder. |
| D8 | "Before you build" chapter rows | Open the chapter's file in Master & QC. |
| D9 | Master & QC button (aside header) | Opens Master & QC. |
| D10 | Check again | Reads the chapters, the credits and the measurement again. |
| D11 | Output folder (read-only text) | Says where the package went, or that the host asks. |

## The states, per control

### D5 Build

| State | Result |
| - | - |
| empty (no chapters) | `page`: "empty: a book with no chapters says so and cannot build" |
| one | `page`: "one: a single passing chapter is ready and builds with the files that were encoded" |
| many, huge | `page`: "huge: 500 chapters with 300-character titles are listed and counted". **Not tested:** a book of thousands of chapters |
| loading | `page`: "loading: nothing is judged before the chapters and the measurement have been read". The credits too: `page` "the credits cannot be read: the page says it cannot tell, builds nothing and recovers on Check again" (found: Build could turn on before the credits rows arrived, then off) |
| refused | `page`: "refused: the host's words are shown and the button is usable again" |
| failed | `page`: "failed: a job that ended in error shows its reason and no written files"; `visual` `build-failed` |
| stale (the profile changed, the files changed) | `page`: "a build for another profile is not shown as this profile's package" (found: a built list for ACX showed under a custom profile after a reload); `page` "a lost event" and "a job that ends elsewhere reads the measurement again" |
| long, right-to-left, emoji text | `page`: "long, right-to-left and emoji chapter names are kept as written and read in their own direction"; `go`: "TestChapterFileNamesAreWhatWindowsAccepts" (accented, emoji and right-to-left titles become file names as written) |
| rapid double-fire | `page`: "rapid double-fire: two presses before the host answers ask for the folder once" |
| reload mid-action | `page`: "reload mid-action: a build already running is shown with Cancel and followed until it ends" |
| leave mid-action | `page`: "leave mid-action: leaving while the host is asked writes nothing and logs no error" |
| the host never answers | `page`: "never answers: the page stays usable and says it is waiting for the folder". The folder window cannot be closed by the page; a host that never answers the picker leaves Build busy until it does (a Windows owner check) |
| answers late, out of order | `page`: "late and out of order: an answer to an older read never replaces the Cancel answer"; `read`: "out of order: an older answer that arrives after a newer one is dropped" |
| loses an event | `page`: "a lost event: the window regaining focus reads again" |
| repeats an event | `page`: "an event repeated: two job-ended events read twice and leave the same page" |
| wrong project open | **Not tested:** the chapters slot is emptied and read again when a project attaches (`StudioProvider.test.tsx`), and the host answers for the open project; no test switches project with Delivery open |
| wrong host version | **Not tested:** the page sends no version; the app checks `hostAPIVersion` once at start (`hostApi.ts`) |
| host restarts mid-session | `page`: "host restarted mid-run: the job is gone (idle), the page stops waiting and says nothing false" |
| the picker closed | `page`: "the folder picker closed without a folder" and "...after an earlier build" |
| waiting on other work | `page`: "no files encoded", "the export is still running elsewhere", "a measurement that is running", "failing and waiting chapters are counted" |
| the package's own files | `go`: zero-length, missing and folder sources ("TestAnEmptyOrMissingEncodedFileIsRefused..."), names over 255 UTF-16 units ("TestAChapterNameLongerThanAFileNameCanBeIs..."), reserved Windows names and trailing dots ("TestChapterFileNamesAreWhatWindowsAccepts": `CON`, `NUL`, `COM1` are safe because the number comes first), a 64 MiB file ("TestAHugeEncodedFileIsCopiedWhole"). **Not tested:** a multi-gigabyte file |
| export or package paths | `go`: "TestPathGuardOutputFolder" runs the shared path fixtures (outside the starting folder, nested, spaces, Unicode, emoji, right-to-left, over 260 characters, trailing dot, a junction, missing, a file where a folder is expected, empty, relative, `..`, forward slashes). On Linux: case-different and read-only folders are probed and skipped when the OS does not refuse (running as root), trailing spaces cannot be made. **Not tested here:** UNC shares, `\\?\` paths, a real read-only folder on Windows (Windows owner checks) |
| a cancelled build, a full disk, the target deleted mid-write | `go`: "TestAFailedOrCancelledPackageLeavesNothingAndCanBeBuiltAgain" (found: the files already copied stayed, and the next build refused them as already there) and "TestTheFoldersThePackageMadeAreRemovedWhenItStops". The failure is a Packager row that errors or cancels on its third file; a real full disk and a real folder deleted under the copy are **not exercised** |

### D6 Cancel

| State | Result |
| - | - |
| the build is cancelled | `page`: "Cancel: the job says it was cancelled and Build is usable again" |
| refused | `page`: "Cancel refused: the host's words are shown and the build keeps running" |
| rapid double-fire | **Not tested:** the second press sends a second cancel, which the host answers with the same job; nothing on the page depends on it |
| the host is quiet | `page`: "quiet host: a read that fails says it cannot tell, keeps trying every two seconds and clears when the host answers"; `visual` `host-quiet` |
| Check again | `page`: "Check again forces a fresh read" |

### D7 Open the folder

| State | Result |
| - | - |
| refused (the folder is gone) | `page`: "a double press asks the host once; a refusal is shown in its words" |
| rapid double-fire | the same test |
| overlays | `e2e`: "hint on Open the folder" at 1440x900, 1100x700, 820x600 and 360x500. **Not covered:** 320x300, where the hint opens and does not settle (the guard says it never became visible; cause not found, as with Master & QC's hints over scrolled content) |

### D8 and D9 The aside

| State | Result |
| - | - |
| empty, one, many, huge | the D5 cells above |
| stale (a chapter removed since the page was read) | `cross`: Delivery's three clicks open Master & QC; a chapter id Master & QC lacks is Master & QC's "Link not found" (S13, `masterqc/page/Page.test.tsx`) |
| loading, failed | `page`: "a first read that fails says it cannot tell (not "Not mastered") and recovers on Check again", "stale: a read that fails after one succeeded keeps the list and marks it out of date", "the chapters cannot be read" |
| a chapter row, a credits row | `page`: "a chapter row opens that chapter in Master & QC, a credits row opens its own id"; `cross`: "a chapter row opens Master & QC on that chapter, and Back returns to Delivery", "a credits row opens Master & QC on the credits file" |
| the header button | `page`: "the header button opens Master & QC itself; without a handler there is no button"; `cross`: "the header's button opens Master & QC on no file"; `e2e`: "hint on Open in Master & QC" at all five sizes |
| long, right-to-left, emoji | `page`: the long, right-to-left and emoji names test |
| a reload or Back | `cross`: "a reload on Delivery lands on Delivery again" and the Back in the first test |

### D10 Check again and the host's events

| State | Result |
| - | - |
| the first read fails | `page`: "a first read that fails says it cannot tell (not "Not mastered") and recovers on Check again" |
| a later read fails | `page`: "stale: a read that fails after one succeeded keeps the list and marks it out of date" |
| the same failure twice | `read`: "a set after a read was sent wins over that read, and the same failure twice still retries" (found while writing the quiet-host cell: two failures with the same words stopped the retries) |
| a lost, repeated or ended-elsewhere event | `page`: the three event tests |
| after leaving | `read`: "an answer after leaving the page writes nothing" |

### D1 Profile menu

| State | Result |
| - | - |
| loading, failed, recovering | `card`: "loading, failed and recovering: the card says it could not read the profiles, with Check again" |
| refused | `card`: "refused: the host's sentence is shown and the menu works again" |
| rapid double-fire | `card`: "rapid double-fire: the menu is off while the host answers, so a second choice is not sent" (found: a second choice in the same tick was sent) |
| stale (changed in Settings) | `card`: "stale: a profile changed in Settings is picked up when the window regains focus"; "the host went quiet after the card was drawn" |
| long, right-to-left, emoji names | `card`: "long, right-to-left and emoji profile names are listed whole in the menu" |
| overlay | **Not covered:** the menu is the browser's own select, which draws its popup outside the page; there is nothing for the overlay guard to measure |
| leave mid-action | **Not tested:** the choice is one call; an answer after leaving writes through `useHostRead`, which drops it (`read`) |

### D2 Profile name

| State | Result |
| - | - |
| blank, spaces | `card`: "blank or spaces only: ignored and the box shows the saved name again" |
| long, right-to-left, emoji | `card`: "long, right-to-left and emoji: saved as typed, surrounding spaces trimmed" |
| refused (over 80 characters) | `card`: "the host refuses the name (too long): its sentence is shown and the box reverts" |
| leave mid-action | `card`: "leave mid-action: leaving with a half-typed name saves nothing" |
| rapid double-fire (Enter, then leaving the box) | **Not tested:** the box reports once per change; a second report of the same text is dropped by the busy guard in `ProfileCard` ("a save that never answers" covers the guard) |
| a custom profile named `CON` or `NUL` | **Found, not fixed here:** Master & QC's multi-platform export turns a profile name into a folder name (`sanitizeFolderName` in `apps/desktop/multi_package_job.go`), which keeps `CON`, `NUL`, `COM1` and trailing dots as written, so Windows refuses the folder. That is Master & QC's code in a package this container cannot compile; the PR body lists it as a finding |

### D3 and D4 Limits and the longest file

| State | Result |
| - | - |
| not a number, blank, infinite | `card`: "what counts as a number: signs, decimals, exponents and spaces do; blanks, words and infinities do not" |
| zero, negative, huge | `card`: "zero, negative and huge numbers are sent as typed for the host to judge" |
| the lowest above the highest | `card`: "the lowest above the highest is the host's refusal: its sentence is shown and the box reverts" |
| minutes and seconds | `card`: "the longest file is edited in minutes and saved in seconds" |
| the host never answers | `card`: "a save that never answers leaves the page usable and the menu off, with no second save" |
| a built-in | `card`: "a built-in has no boxes at all, so nothing can be typed into it" |
| long, right-to-left, emoji | **Not tested:** a limit is a number; the label is the host's rule name |

### D11 Output folder

| State | Result |
| - | - |
| before a build | `visual` `ready`: "Chosen when you build"; `page`: the folder tests |
| while the picker is open | `page`: "rapid double-fire..." asserts "Choose a folder in the window that opened…" |
| built, failed, cancelled | `visual` `built`, `build-failed`; `page` "Cancel: the job says it was cancelled" |
| long, right-to-left, emoji paths | `dir="auto"` and `overflow-wrap: anywhere` on the text; **not tested** with a path over 260 characters in the browser |

### The whole page

| State | Result |
| - | - |
| every catalogued state, light and dark, three window sizes | `visual`: 12 tests per theme (`default`, `measured`, `custom-profile`, `profile-rules` x3 sizes, `ready`, `built`, `building`, `build-failed`, `host-quiet`, `no-manuscript`) |
| no manuscript | `visual` `no-manuscript`; `page` (DeliveryPage.test.tsx) "asks-for-the-manuscript-first" |
| overlays on the shared guard | `e2e`: the two hints, the shell's overlays (context menu on the page, the top bar's hints and menus, the navigation) at 1440x900, 1100x700, 820x600, 360x500 and 320x300: 40 passed. **Not covered:** a toast over Delivery (the guard has no toast kind) |
