// How to reach each `master` state in STATE_CATALOG (see app.drivers.ts).
import type { Locator, Page } from '@playwright/test';
import { settlePage } from '../helpers/settle';
import {
  type Driver,
  checkOnDiagnostics,
  openWithoutManuscript,
  diagnosticsEnded,
  measurementEnded,
  masterFileRows,
  measureOnMaster,
  openDiagnostics,
  openMaster,
  pickFilesToMaster,
  goToPage,
  panelTitled,
  scrollToTop,
} from './shared';

const MEASURED = /^Measured 2 of 3 files; 1 could not be measured\./;

// Removes one picked file from Master to spec by its Remove button.
async function removeExportFile(page: Page, file: string): Promise<void> {
  await page
    .getByRole('row')
    .filter({ has: page.getByRole('cell', { name: file, exact: true }) })
    .getByRole('button', { name: 'Remove' })
    .click();
}

// Presses Master & encode and waits for the approval dialog's table of the host's plan; answers the dialog.
async function openApproval(page: Page, table: string): Promise<Locator> {
  await page.getByRole('button', { name: 'Master & encode' }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Approve this render?' });
  await dialog.getByRole('table', { name: table }).waitFor();
  return dialog;
}

export const masterDrivers: Record<string, Driver> = {
  // The chapters never answer, so `openMaster` is not used: the page's own parts arrive, the package panel stays on its blocks.
  'package-loading': async (page) => {
    await page.goto('/?mockChapters=loading');
    await settlePage(page);
    await goToPage(page, 'Master & QC');
    await page.getByRole('group', { name: 'Loading the delivery package checks' }).waitFor();
  },
  // The chapters read fails: the page works and an error toast says so with Retry (rule 7, #2632); it stays up for the capture.
  'chapters-load-failed': async (page) => {
    await page.goto('/?mockChapters=fails');
    await settlePage(page);
    await goToPage(page, 'Master & QC');
    await page.getByRole('alert').filter({ hasText: 'The chapters could not be read' }).getByRole('button', { name: 'Retry' }).waitFor();
  },
  // The delivery profiles read fails: the same toast and Retry for the profile.
  'profile-load-failed': async (page) => {
    await page.goto('/?mockProfileRead=fails');
    await settlePage(page);
    await goToPage(page, 'Master & QC');
    await page
      .getByRole('alert')
      .filter({ hasText: /delivery profiles? could not be read/ })
      .getByRole('button', { name: 'Retry' })
      .waitFor();
  },
  empty: async (page) => {
    await openMaster(page);
    await page.getByText(/^Nothing measured yet/).waitFor();
  },
  running: async (page) => {
    await measureOnMaster(page, '?mockMeasure=running');
    await page.getByRole('progressbar', { name: 'Measuring' }).waitFor();
    await page.getByText('Measuring Chapter 01.wav (1 of 3).').waitFor();
  },
  measured: async (page) => {
    await measureOnMaster(page);
    await measurementEnded(page, MEASURED);
    await page.getByRole('heading', { name: 'Chapter 1 — Down the Rabbit-Hole · Why it fails' }).waitFor();
  },
  'file-rules': async (page) => {
    await measureOnMaster(page);
    await measurementEnded(page, MEASURED);
    const detail = page.getByRole('table', { name: 'Chapter 01.wav, rule by rule' });
    await detail.waitFor();
    await scrollToTop(page, panelTitled(page, 'Chapter 01.wav against ACX (September 2026)'));
  },
  'book-spread': async (page) => {
    await openMaster(page, '?mockMeasure=spread');
    await masterFileRows(page).first().waitFor();
    const consistency = panelTitled(page, 'Book consistency');
    await consistency.waitFor();
    await scrollToTop(page, consistency);
  },
  'text-column': async (page) => {
    await openMaster(page, '?mockDelivery=ready');
    await masterFileRows(page).first().waitFor();
    const table = page.getByRole('grid', { name: 'Per-file checks' });
    await table.getByText('Not checked').first().waitFor();
    await scrollToTop(page, table);
    // At a narrow width the rows stack and the box shows about three: bring the first red figure into it, so the Text line is seen where it changes.
    await table.getByRole('row', { name: /Chapter 4/ }).scrollIntoViewIfNeeded();
  },
  'custom-profile': async (page) => {
    await measureOnMaster(page, '?mockDeliveryProfile=custom');
    await measurementEnded(page, MEASURED);
    await page.getByTitle('Open Delivery').getByText('My ACX, tighter peak').waitFor();
  },
  cancelled: async (page) => {
    await measureOnMaster(page, '?mockMeasure=running');
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.getByRole('grid', { name: 'Per-file checks' }).getByText('Not measured').first().waitFor();
  },
  error: async (page) => {
    await measureOnMaster(page, '?mockMeasure=fails');
    await measurementEnded(page, /^The measurement stopped unexpectedly\. Choose/);
  },
  'diagnostics-empty': async (page) => {
    await openDiagnostics(page);
    await page.getByText(/^Nothing checked yet/).waitFor();
  },
  'diagnostics-running': async (page) => {
    await checkOnDiagnostics(page, '?mockDiagnostics=running');
    await page.getByRole('progressbar', { name: 'Checking' }).waitFor();
    await page.getByText('Checking Chapter 01.wav (1 of 3).').waitFor();
  },
  'diagnostics-findings': async (page) => {
    await measureOnMaster(page);
    await measurementEnded(page, MEASURED);
    const diagnostics = page.getByRole('region', { name: 'Diagnostics' });
    await diagnostics.getByRole('button', { name: 'Check the 3 measured files' }).click();
    await diagnosticsEnded(page, 'Checked 2 of 3 files; 1 could not be checked.');
    await page.getByRole('table', { name: 'Findings' }).waitFor();
    await scrollToTop(page, diagnostics);
  },
  // The cleanup options dialog, opened from the jump menu: this project's five thresholds, over the page the check used them on.
  'diagnostics-cleanup-options': async (page) => {
    await openDiagnostics(page);
    await page.keyboard.press('Control+KeyK');
    await page.getByRole('combobox', { name: 'Jump menu' }).fill('Open Silence cleanup options');
    await page
      .getByRole('option', { name: /^Open Silence cleanup options/ })
      .first()
      .click();
    await page.getByRole('textbox', { name: 'How far above the silence around it a click stands' }).waitFor();
  },
  'diagnostics-cancelled': async (page) => {
    await checkOnDiagnostics(page, '?mockDiagnostics=running');
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.getByText(/^Diagnostics cancelled\./).waitFor();
  },
  'diagnostics-error': async (page) => {
    await checkOnDiagnostics(page, '?mockDiagnostics=fails');
    // The failure is an error toast (rule 7, #2632), left up so the capture shows it; the Diagnostics card says nothing of it.
    await page
      .getByRole('alert')
      .filter({ hasText: /The diagnostics stopped unexpectedly\. Choose/ })
      .waitFor({ timeout: 15_000 });
  },
  'report-exported': async (page) => {
    await measureOnMaster(page);
    await measurementEnded(page, MEASURED);
    await page.getByRole('button', { name: 'Export report', exact: true }).click();
    await page.getByText(/^Wrote delivery-report-/).waitFor();
    await scrollToTop(page, page.getByRole('region', { name: 'Report' }));
  },
  'report-needs-files': async (page) => {
    await openMaster(page);
    await page.getByText(/^Check some files first: the report covers the files measured here/).waitFor();
    await scrollToTop(page, page.getByRole('region', { name: 'Report' }));
  },
  'to-spec-empty': async (page) => {
    await openMaster(page);
    const panel = page.getByRole('region', { name: 'Master to spec' });
    await panel.getByRole('button', { name: 'Choose files to master…' }).waitFor();
    await panel.getByRole('checkbox', { name: /^Master before encoding: Built-in chain/ }).waitFor();
    await scrollToTop(page, panel);
  },
  'to-spec-picked': async (page) => {
    await openMaster(page);
    await pickFilesToMaster(page);
    await page.getByRole('button', { name: 'Master & encode' }).waitFor();
    await scrollToTop(page, page.getByRole('region', { name: 'Master to spec' }));
  },
  'chain-choice': async (page) => {
    await openMaster(page);
    await page.getByRole('radiogroup', { name: 'Master with' }).waitFor();
    await scrollToTop(page, page.getByRole('region', { name: 'Mastering chain' }));
  },
  'chain-saved': async (page) => {
    await openMaster(page);
    const daw = page.getByRole('radio', { name: "Your DAW's FX chain" });
    await daw.click();
    await page.getByText('Its steps are set in your DAW, not by the app.').waitFor();
    await scrollToTop(page, page.getByRole('region', { name: 'Mastering chain' }));
  },
  'chain-unavailable': async (page) => {
    await openMaster(page, '?mockMastering=no-audacity');
    await scrollToTop(page, page.getByRole('region', { name: 'Mastering chain' }));
    await page.getByRole('group', { name: "Audacity's effect macro is not available on this computer." }).hover();
    await page.getByRole('tooltip').waitFor();
  },
  'to-spec-approve-daw': async (page) => {
    await openMaster(page, '?mockMastering=daw');
    await pickFilesToMaster(page);
    await removeExportFile(page, 'Retail sample.wav');
    await openApproval(page, 'Files and the regions they render');
  },
  'to-spec-approve-macro': async (page) => {
    await openMaster(page, '?mockMastering=audacity');
    await pickFilesToMaster(page);
    const dialog = await openApproval(page, 'Files to master');
    await dialog.getByRole('textbox', { name: 'Macro' }).fill('ACX – Master');
    await dialog.getByRole('button', { name: 'Approve and master' }).click();
    await dialog.getByText(/A macro name can hold only/).waitFor();
  },
  'to-spec-approve-many': async (page) => {
    await openMaster(page, '?mockMastering=daw&mockExportPick=many');
    await page.getByRole('button', { name: 'Master all to spec…' }).click();
    await page.getByRole('table', { name: 'Files to export' }).waitFor();
    await page.getByLabel('Role for 00 Opening credits.wav').selectOption('credits_opening');
    await page.getByLabel('Role for 00 Closing credits.wav').selectOption('credits_closing');
    await openApproval(page, 'Files and the regions they render');
  },
  'to-spec-approve-long-names': async (page) => {
    await openMaster(page, '?mockMastering=daw&mockExportPick=long');
    await page.getByRole('button', { name: 'Master all to spec…' }).click();
    await page.getByRole('table', { name: 'Files to export' }).waitFor();
    await page.getByLabel(/^Role for 00 Opening credits/).selectOption('credits_opening');
    await page.getByLabel(/^Role for 00 Closing credits/).selectOption('credits_closing');
    await openApproval(page, 'Files and the regions they render');
  },
  'to-spec-running': async (page) => {
    await openMaster(page, '?mockRenderExport=running');
    await pickFilesToMaster(page);
    await page.getByRole('button', { name: 'Master & encode' }).click();
    await page.getByRole('progressbar', { name: 'Preparing files' }).waitFor();
    await scrollToTop(page, page.getByRole('region', { name: 'Master to spec' }));
  },
  'to-spec-last-run': async (page) => {
    await openMaster(page, '?mockDelivery=ready');
    const panel = page.getByRole('region', { name: 'Master to spec' });
    await panel.getByRole('button', { name: 'Master & encode' }).waitFor();
    await panel.getByRole('button', { name: 'Remove' }).first().waitFor();
    await scrollToTop(page, panel);
  },
  'to-spec-cancelled': async (page) => {
    await openMaster(page, '?mockRenderExport=running');
    await pickFilesToMaster(page);
    await page.getByRole('button', { name: 'Master & encode' }).click();
    const panel = page.getByRole('region', { name: 'Master to spec' });
    await panel.getByRole('button', { name: 'Cancel' }).click();
    await panel.getByText(/^Export cancelled\./).waitFor();
    await panel.getByRole('button', { name: 'Master & encode' }).waitFor();
    await scrollToTop(page, panel);
  },
  'multi-export-empty': async (page) => {
    await openMaster(page);
    const panel = page.getByRole('region', { name: 'Multi-platform export' });
    await panel.waitFor();
    await scrollToTop(page, panel);
  },
  'multi-export-selected': async (page) => {
    await openMaster(page, '?mockDeliveryProfile=custom');
    await pickFilesToMaster(page);
    await page.getByRole('button', { name: 'Master & encode' }).click();
    await page
      .getByRole('region', { name: 'Master to spec' })
      .getByText(/^Prepared 5 files\./)
      .waitFor({ timeout: 15_000 });
    const dismiss = page.getByRole('button', { name: 'Dismiss message' });
    while ((await dismiss.count()) > 0) await dismiss.first().click();
    const panel = page.getByRole('region', { name: 'Multi-platform export' });
    await panel.getByRole('checkbox', { name: 'ACX', exact: true }).click();
    await panel.getByRole('button', { name: 'Build 1 package' }).waitFor();
    await scrollToTop(page, panel);
  },
  'multi-export-running': async (page) => {
    await openMaster(page, '?mockPackageMulti=running');
    await pickFilesToMaster(page);
    await page.getByRole('button', { name: 'Master & encode' }).click();
    await page
      .getByRole('region', { name: 'Master to spec' })
      .getByText(/^Prepared 5 files\./)
      .waitFor({ timeout: 15_000 });
    const dismiss = page.getByRole('button', { name: 'Dismiss message' });
    while ((await dismiss.count()) > 0) await dismiss.first().click();
    const panel = page.getByRole('region', { name: 'Multi-platform export' });
    await panel.getByRole('checkbox', { name: 'ACX', exact: true }).click();
    await panel.getByRole('button', { name: 'Build 1 package' }).click();
    await page.getByRole('progressbar', { name: 'Building packages' }).waitFor();
    await scrollToTop(page, panel);
  },
  'multi-export-results': async (page) => {
    await openMaster(page, '?mockDeliveryProfile=custom');
    await pickFilesToMaster(page);
    await page.getByRole('button', { name: 'Master & encode' }).click();
    await page
      .getByRole('region', { name: 'Master to spec' })
      .getByText(/^Prepared 5 files\./)
      .waitFor({ timeout: 15_000 });
    const dismiss = page.getByRole('button', { name: 'Dismiss message' });
    while ((await dismiss.count()) > 0) await dismiss.first().click();
    const panel = page.getByRole('region', { name: 'Multi-platform export' });
    await panel.getByRole('checkbox', { name: 'ACX', exact: true }).click();
    await panel.getByRole('checkbox', { name: /^My ACX/ }).click();
    await panel.getByRole('button', { name: /^Build 2 packages/ }).click();
    // Each platform's result sits under its own checkbox; the job's own line says the build ended.
    await panel.getByText(/^Built 2 packages/).waitFor();
    while ((await dismiss.count()) > 0) await dismiss.first().click();
    await scrollToTop(page, panel);
  },
  'no-manuscript': async (page) => {
    await openWithoutManuscript(page, 'Master & QC');
    await page.getByRole('button', { name: 'Import manuscript' }).waitFor();
  },
};
// The whole page of measured (catalog/shared.ts: wholePage), driven the same way.
masterDrivers['whole-page'] = masterDrivers['measured'];
