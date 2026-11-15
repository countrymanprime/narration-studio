import { expect, test, type Page } from '@playwright/test';
import { storybibleDrivers } from './drivers/storybible';
import { goToPage } from './drivers/shared';
import { settlePage } from './helpers/settle';

// #3416 (found by the intent review of #3511): Delete entry chosen from an entry row's right-click menu opens its confirmation as the menu closes, so the confirmation's
// opener was gone and closing it put focus on the page (<main>) instead of the row the narrator was on.
const rows = (page: Page) => page.getByRole('table', { name: 'Story Bible entries' }).locator('[data-entry-id]');

async function askToDeleteFromTheRowMenu(page: Page) {
  await page.goto('/');
  await settlePage(page);
  await goToPage(page, 'Story Bible');
  // An entry that is not locked (a locked one offers no Delete).
  const row = rows(page)
    .filter({ hasNot: page.getByLabel('Locked') })
    .first();
  await row.waitFor();
  const id = await row.getAttribute('data-entry-id');
  await row.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Delete entry' }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Delete entry' });
  await dialog.waitFor();
  return { dialog, id: id! };
}

for (const how of ['Escape', 'Cancel'] as const) {
  test(`Story Bible / closing Delete entry from the row menu with ${how} puts focus back on the row`, async ({ page }) => {
    const { dialog, id } = await askToDeleteFromTheRowMenu(page);
    if (how === 'Escape') await page.keyboard.press('Escape');
    else await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.locator(`[data-entry-id="${id}"]`).first()).toBeFocused();
  });
}

// Asked from the entry panel's own Delete button instead, the confirmation still goes back to that button (its opener is drawn, so the row is not asked).
test('Story Bible / closing Delete entry asked from the panel Delete button puts focus back on that button', async ({ page }) => {
  await page.goto('/');
  await settlePage(page);
  await storybibleDrivers['delete-confirm']!(page);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('alertdialog', { name: 'Delete entry' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Delete entity' })).toBeFocused();
});
