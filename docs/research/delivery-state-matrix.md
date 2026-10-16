# Delivery: the state matrix

Written before the code ([definition of done](../../.claude/rules/definition-of-done.md), rule 3). Page: `apps/ui/src/components/delivery/`, route `/delivery`, the [Studio Next mock's Delivery page](mockups/studio-next/src/pages/Delivery.tsx) (ADR 0760). The profile's "Rules and their sources" panel has no mock equivalent and stays as built; this PR does not change it.

**Decision: the output folder stays chosen by the host.** The mock's "Folder" is a text box the narrator types a path into. The host's `PackageStart` opens the operating system's folder picker and the UI never names a path (`package_job.go`: the folder is "the one the package job wrote, never one the UI names"; the threat model's rule that a path the host writes to comes from the picker). A typed path would be a new binding that takes a path from the UI, a new trust boundary and Go code the container cannot compile (`apps/desktop` needs GTK). The Folder row therefore shows the folder the host chose, or "Chosen when you build", and the build says where it will ask. Recorded for the owner in the PR body.

**Left out of the matrix:** nothing the mock shows is left out. The mock's "Retail sample" extra row is not drawn: the host writes the files it writes and the page lists those (`PackageJob.files`).

Each cell is a test name or **not tested: reason**. `matrix` is `delivery/page/Matrix.test.tsx`, `page` is `DeliveryPage.test.tsx`, `card` is `profile/ProfileCard.test.tsx`, `build` is `page/useDeliveryBuild.test.tsx`, `e2e` is `apps/ui/tests/visual/overlays/delivery.ts` run by `overlays.spec.ts`, `visual` is the catalogued Delivery states of `app.spec.ts`, `go` is `apps/desktop/internal/packager/paths_test.go`. The cells are filled in as the tests are written; at the end of the work each names a test or says why none exists.

## Controls

| # | Control | What it does |
| - | - | - |
| D1 | Profile menu | Chooses the delivery profile the project is judged against. |
| D2 | Profile name (custom only) | Renames the custom profile. |
| D3 | Limit boxes (custom only) | Edit a check's lowest and highest. |
| D4 | Files rows (custom only: Longest file) | Edit the longest file. |
| D5 | Build \<profile\> package | Assembles the package from the files already mastered and encoded; the host asks for the folder. |
| D6 | Cancel (while building) | Stops the build. |
| D7 | Open the folder (after a build) | Shows the built package's folder. |
| D8 | "Before you build" chapter rows | Open the chapter's file in Master & QC. |
| D9 | Master & QC button (aside header) | Opens Master & QC. |
| D10 | Check again | Reads the chapters and the measurement again. |
| D11 | Output folder (read-only text) | Says where the package went, or that the host asks. |

## The states, per control

_To be completed with the tests (see the PR body for the final table)._
