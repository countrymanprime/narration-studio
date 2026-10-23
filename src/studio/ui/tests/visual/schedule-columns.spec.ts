import { expect, test } from '@playwright/test';
import { confirmDialog } from './drivers/shared';
import { settlePage } from './helpers/settle';

// The milestone table keeps the Studio Next mock's column sizes, whatever the milestones are called: the Due column stays about the width
// of a date field (the mock's 152 px) and Measures stays wide enough for "All recorded" on one line, even beside a very long milestone name
// (the date column grew to 243 to 501 px and Measures shrank to 88 px).
for (const size of [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'small-desktop', width: 1024, height: 768 },
  { name: 'tablet', width: 768, height: 1024 },
]) {
  test(`Schedule / the milestone table keeps Due narrow and Measures wide / ${size.name} ${size.width}x${size.height}`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.goto('/schedule?mockProduction=on-pace');
    await settlePage(page);
    await page.getByRole('heading', { level: 2, name: 'Milestones' }).waitFor();
    await page.getByRole('button', { name: 'Add milestone', exact: true }).first().click();
    const dialog = confirmDialog(page, /milestone/i);
    await dialog.waitFor();
    await dialog.getByRole('textbox', { name: 'Name' }).fill('A very long milestone name for the whole final mastering and delivery package');
    await dialog.getByRole('textbox', { name: 'Due' }).fill('2026-10-05');
    await dialog.getByRole('button', { name: 'Add milestone' }).click();
    await dialog.waitFor({ state: 'detached' });
    const table = page.getByRole('table', { name: 'Milestones' });
    const width = async (name: string) => (await table.getByRole('columnheader', { name, exact: true }).boundingBox())!.width;
    expect(await width('Due'), 'the Due column is about a date field wide').toBeLessThanOrEqual(160);
    expect(await width('Measures'), 'Measures holds "All recorded" on one line').toBeGreaterThanOrEqual(140);
  });
}
