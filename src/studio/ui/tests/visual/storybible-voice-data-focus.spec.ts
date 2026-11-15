import { expect, test } from '@playwright/test';
import { storybibleDrivers } from './drivers/storybible';
import { settlePage } from './helpers/settle';

// #3416 (item 93): the Voice data slide-over opens from a More actions menu item, which goes with its menu, so closing the panel put focus on
// the page (<main>) instead of the button the narrator was on.
for (const how of ['Escape', 'Close'] as const) {
  test(`Story Bible / closing Voice data with ${how} puts focus back on More actions`, async ({ page }) => {
    await page.goto('/');
    await settlePage(page);
    await storybibleDrivers['voice-data-panel']!(page);
    const panel = page.getByRole('dialog', { name: 'Voice data' });
    if (how === 'Escape') await page.keyboard.press('Escape');
    else await panel.getByRole('button', { name: 'Close' }).click();
    await expect(panel).toBeHidden();
    await expect(page.getByRole('button', { name: 'More actions' })).toBeFocused();
  });
}
