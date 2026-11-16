import { expect, test } from '@playwright/test';
import { storybibleDrivers } from './drivers/storybible';
import { settlePage } from './helpers/settle';

// #3416 (item 50): Scan the manuscript and Import entries open from a More actions menu item, which goes with its menu, so closing the dialog put focus on the page (<main>)
// instead of the button the narrator was on. Voice data (item 93) is in storybible-voice-data-focus.spec.ts.
for (const [driver, name] of [
  ['scan-prompt', 'Scan the manuscript'],
  ['import-dialog', 'Import entries'],
] as const) {
  for (const how of ['Escape', 'Close'] as const) {
    test(`Story Bible / closing ${name} with ${how} puts focus back on More actions`, async ({ page }) => {
      await page.goto('/');
      await settlePage(page);
      await storybibleDrivers[driver]!(page);
      const dialog = page.getByRole('dialog', { name });
      if (how === 'Escape') await page.keyboard.press('Escape');
      else
        await dialog
          .getByRole('button', { name: /^(Close|Cancel|Not now)$/ })
          .first()
          .click();
      await expect(dialog).toBeHidden();
      await expect(page.getByRole('button', { name: 'More actions' })).toBeFocused();
    });
  }
}

// Opened from the keyboard: Enter on More actions, then Enter on the item.
for (const name of ['Scan the manuscript', 'Import entries'] as const) {
  test(`Story Bible / ${name} opened from the keyboard closes back onto More actions`, async ({ page }) => {
    await page.goto('/');
    await settlePage(page);
    await storybibleDrivers['voice-data-panel']!(page);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'More actions' }).focus();
    await page.keyboard.press('Enter');
    await page.getByRole('menuitem', { name }).focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name });
    await dialog.waitFor();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('button', { name: 'More actions' })).toBeFocused();
  });
}
