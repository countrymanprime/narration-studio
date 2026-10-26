import { expect, test } from '@playwright/test';
import { settlePage } from './helpers/settle';
import { productionDrivers } from './drivers/production';

// The Production dialogs and panels, checked from the DOM where the alignment audit found them broken
// (docs/research/alignment-audit/findings/production.md).
for (const size of [
  { name: 'reflow', width: 390, height: 844 },
  { name: 'short', width: 1440, height: 640 },
  { name: 'desktop', width: 1440, height: 900 },
]) {
  test(`Production / the report dialog's Export is on screen without scrolling / ${size.name} ${size.width}x${size.height}`, async ({ page }) => {
    // XPR2-24, R3PR2-2: the action row was inside the scrolling body, below the first screen at 390 px and on the bottom edge of a short window.
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.goto('/');
    await settlePage(page);
    await productionDrivers['report-dialog'](page);
    const dialog = page.getByRole('dialog', { name: 'Export status report' });
    const frame = (await dialog.boundingBox())!;
    const exportButton = (await dialog.getByRole('button', { name: 'Export' }).boundingBox())!;
    expect(exportButton.y + exportButton.height, 'Export is inside the window').toBeLessThanOrEqual(size.height);
    expect(frame.y + frame.height - (exportButton.y + exportButton.height), 'with the action row padding under it').toBeGreaterThanOrEqual(12);
  });
}
