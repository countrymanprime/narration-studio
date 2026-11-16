// A held Escape closes one layer: the top one (#3549 B3). Its key repeat arrives after the first press has closed that layer, and used to close the one
// under it too (the Remove voice data confirm, then the Voice data slide-over). Real auto-repeat: Playwright's `keyboard.down` on a key already down sends
// the key with `autoRepeat`, which the page sees as `KeyboardEvent.repeat`, not a synthetic event.
import { expect, test, type Page } from '@playwright/test';
import { storybibleDrivers } from './drivers/storybible';
import { settlePage } from './helpers/settle';

async function openConfirmOverPanel(page: Page) {
  await page.goto('/');
  await settlePage(page);
  await storybibleDrivers['remove-voice-data-confirm']!(page);
  const confirm = page.getByRole('alertdialog', { name: 'Remove voice data' });
  const panel = page.getByRole('dialog', { name: 'Voice data', includeHidden: true });
  await expect(confirm).toBeVisible();
  await expect(panel).toBeAttached();
  return { confirm, panel };
}

/** Holds Escape: the key goes down, then after the keyboard's repeat delay repeats `repeats` times at the keyboard's rate, then comes up. */
async function holdEscape(page: Page, repeats: number) {
  await page.keyboard.down('Escape');
  // A keyboard waits about half a second before it repeats, then repeats about every 30 ms.
  await page.waitForTimeout(500);
  for (let i = 0; i < repeats; i++) {
    await page.waitForTimeout(30);
    await page.keyboard.down('Escape');
  }
  await page.keyboard.up('Escape');
}

test.describe('a held Escape closes only the top layer', () => {
  test('the Remove voice data confirm closes and the Voice data slide-over under it stays', async ({ page }) => {
    const { confirm, panel } = await openConfirmOverPanel(page);
    await holdEscape(page, 12);
    await expect(confirm).toBeHidden();
    await page.waitForTimeout(300);
    await expect(panel).toBeVisible();
  });

  test('one more press then closes the slide-over', async ({ page }) => {
    const { confirm, panel } = await openConfirmOverPanel(page);
    await holdEscape(page, 12);
    await expect(confirm).toBeHidden();
    // Without this the test would pass on a build where the held key had already closed the slide-over.
    await expect(panel).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
  });

  test('a single press still closes the top layer only', async ({ page }) => {
    const { confirm, panel } = await openConfirmOverPanel(page);
    await page.keyboard.press('Escape');
    await expect(confirm).toBeHidden();
    await expect(panel).toBeVisible();
  });
});
