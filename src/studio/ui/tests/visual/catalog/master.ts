// The `master` rows of STATE_CATALOG (see state-catalog.ts), in the order they are captured. Master & QC is the Studio Next mock's
// Master page (SN-M5): the per-file checks, the selected file's checks, the book consistency and the delivery package beside them,
// then the panels the mock has no equivalent of, kept as built. Building the package is Delivery's (catalog/delivery.ts).
import type { StateEntry } from '../lib/types';
import { KEEPS_DESKTOP_SCROLL, REFLOW, wholePage } from './shared';
import { brand } from '../../../src/brand.gen';

export const masterStates: StateEntry[] = [
  {
    page: 'master',
    state: 'empty',
    description:
      'Master & QC, nothing measured yet - the ACX profile pill and Check files…, "Nothing measured yet", the book consistency with no measurements, the built-in chain as three steps, and the delivery package aside with what it waits on',
    ...REFLOW,
  },
  {
    page: 'master',
    state: 'running',
    description:
      'Master & QC, a check part way through (?mockMeasure=running) - its real progress from the bytes read, what it is reading and Cancel in the table card under Check files, the file being read marked Measuring and the rest Waiting',
  },
  {
    page: 'master',
    state: 'measured',
    description:
      'Master & QC, three files checked against ACX - the per-file table with the failing 48 kHz render selected, "Chapter 1 — Down the Rabbit-Hole · Why it fails" (the file named by its chapter) with Pass and Fail rows, its every-rule list under it, the book consistency and the package aside',
    ...REFLOW,
  },
  {
    page: 'master',
    state: 'file-rules',
    description:
      "Master & QC, the failing file's every-rule list scrolled to - each rule's result, this file's value, what ACX requires and how that was verified, loudness as information",
  },
  {
    page: 'master',
    state: 'book-spread',
    description:
      "Master & QC, six chapters already checked against ACX (?mockMeasure=spread) - every file passing, the first file's Checks, and the book consistency as RMS by file against the ACX range",
  },
  {
    page: 'master',
    state: 'custom-profile',
    description:
      'Master & QC judged by a custom profile (?mockDeliveryProfile=custom) - the profile pill names "My ACX, tighter peak", and the table, the checks and the package aside judge against it',
  },
  {
    page: 'master',
    state: 'cancelled',
    description: 'Master & QC, a running check cancelled - every file not yet read marked Not measured, and the reason said once in the card',
  },
  {
    page: 'master',
    state: 'error',
    description:
      'Master & QC, a check that broke (?mockMeasure=fails) - the alert asking to choose the files again, the reason on the file it broke on, the files after it not read',
  },
  // Master & QC, Diagnostics: a section below the chain, scrolled to
  {
    page: 'master',
    state: 'diagnostics-empty',
    description:
      'Master & QC / Diagnostics, nothing checked yet - "Rendered chapters" or "Raw recordings", Choose files to check, and every threshold the check uses shown before any finding',
    ...KEEPS_DESKTOP_SCROLL,
  },
  {
    page: 'master',
    state: 'diagnostics-cleanup-options',
    description:
      "Master & QC / Diagnostics, the Silence cleanup options dialog opened from the jump menu - the hold, the breath length range, the breath level and the click height, this project's values",
    ...KEEPS_DESKTOP_SCROLL,
  },
  {
    page: 'master',
    state: 'diagnostics-running',
    description:
      'Master & QC / Diagnostics, a check part way through (?mockDiagnostics=running) - its real progress from the bytes read, what it is reading, Cancel, and the source-kind choice locked while it runs',
    ...KEEPS_DESKTOP_SCROLL,
  },
  {
    page: 'master',
    state: 'diagnostics-findings',
    description:
      'Master & QC / Diagnostics, the checked files diagnosed without picking them again - each file summarised, a file it could not read with why, and each finding with its time, what was measured, the threshold that raised it and the source kind, read-only and unreviewed',
    ...KEEPS_DESKTOP_SCROLL,
  },
  {
    page: 'master',
    state: 'diagnostics-cancelled',
    description: 'Master & QC / Diagnostics, a running check cancelled - "Diagnostics cancelled.", with every file not yet read saying so',
    ...KEEPS_DESKTOP_SCROLL,
  },
  {
    page: 'master',
    state: 'diagnostics-error',
    description:
      'Master & QC / Diagnostics, a check that broke (?mockDiagnostics=fails) - the alert asking to choose the files again, the reason on the file it broke on, the files after it not read',
    ...KEEPS_DESKTOP_SCROLL,
  },
  // Master & QC, the report export
  {
    page: 'master',
    state: 'report-exported',
    description: `Master & QC with the files checked against ACX, then Export report - the HTML and JSON file names written to ${brand.identity.projectFolder}/delivery, what the report counts, and that it holds file names only (scrolled to the Report panel)`,
    ...KEEPS_DESKTOP_SCROLL,
  },
  {
    page: 'master',
    state: 'report-needs-files',
    // The whole page: scrolled to the Report panel, the last on the page, it drew the same screen as diagnostics-empty wherever the
    // page is too short to bring Diagnostics to the top (#2532 shortened it).
    fullPage: true,
    description:
      'Master & QC, before anything was checked, the whole page - every panel down to the Report panel, whose Export report is off and says to check some files first',
    ...KEEPS_DESKTOP_SCROLL,
  },
  // Master & QC, "Master all to spec…" (no mock equivalent, kept as built)
  {
    page: 'master',
    state: 'to-spec-picked',
    description:
      'Master & QC, Master all to spec… with five files picked and given a role - two chapters (their titles editable), opening and closing credits, a retail sample, Master before encoding on with the built-in chain, and Master & encode',
    ...KEEPS_DESKTOP_SCROLL,
  },
  {
    page: 'master',
    state: 'to-spec-running',
    description:
      'Master & QC, mastering and encoding part way through (?mockRenderExport=running) - real progress, Cancel, and each file waiting, mastering or encoding',
    ...KEEPS_DESKTOP_SCROLL,
  },
  // Master & QC, multi-platform export: several profiles' packages from one mastered/encoded source, in one action (no mock
  // equivalent, kept as built, in the column beside the files)
  {
    page: 'master',
    state: 'multi-export-empty',
    description: 'Master & QC, Multi-platform export with nothing checked - a checkbox per delivery platform and "Build 0 packages" disabled',
    ...KEEPS_DESKTOP_SCROLL,
  },
  {
    page: 'master',
    state: 'multi-export-selected',
    description:
      'Master & QC, Multi-platform export with the files already mastered and encoded and one platform checked (?mockDeliveryProfile=custom for a second platform to choose from) - "Build 1 package" enabled',
    ...KEEPS_DESKTOP_SCROLL,
  },
  {
    page: 'master',
    state: 'multi-export-running',
    description:
      'Master & QC, a multi-platform build part way through (?mockPackageMulti=running) - Building… under the checked platform, Cancel, and a progress indicator',
    ...KEEPS_DESKTOP_SCROLL,
  },
  {
    page: 'master',
    state: 'multi-export-results',
    description:
      'Master & QC, a finished multi-platform build (?mockDeliveryProfile=custom, both platforms checked) - under each checked platform its result: Built, the output folder and how many files it wrote',
    ...KEEPS_DESKTOP_SCROLL,
  },
  {
    page: 'master',
    state: 'no-manuscript',
    description: 'Master & QC with no manuscript imported (?mockNoManuscript=1) - the page asks for the manuscript first, with Import manuscript',
  },
  {
    page: 'master',
    state: 'package-loading',
    description:
      'Master & QC while the chapters are still being read (?mockChapters=loading): the page as usual, and in the Delivery package panel four grey blocks in place of the checks, Open Delivery off until they arrive, and one polite "Reading the profile and the chapters…" status',
  },
  {
    page: 'master',
    state: 'chapters-load-failed',
    description:
      'Master & QC when the chapters cannot be read (?mockChapters=fails): the page as usual and, in the file table card under its controls, "The chapters could not be read, so the files keep their file names" with the reason as an alert and a Retry button that reads the chapters again',
  },
  {
    page: 'master',
    state: 'profile-load-failed',
    description:
      'Master & QC when the delivery profiles cannot be read (?mockProfileRead=fails): the page as usual and, in the file table card under its controls, the reason ("The delivery profiles could not be read from this project.", said once) as an alert and a Retry button that reads the profile again (scrolled to the alert)',
    ...KEEPS_DESKTOP_SCROLL,
  },
];
// At 390 px the whole Master & QC page is taller than the capture's 6000 px cap (the rules and diagnostics panels under the file table), so
// its whole-height picture stays at the window widths; `measured` itself is captured at 390 px.
masterStates.push({ ...wholePage(masterStates, 'measured'), extraViewports: [] });
