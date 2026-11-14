import { expect, test } from '@playwright/test';
import { openEnginePanel } from './drivers/shared';
import { settlePage } from './helpers/settle';

// A person's click is down, a moment, up (not an instant `click`): the popup has closed on the press by the time the panel hears it.
async function press(page: import('@playwright/test').Page, x: number, y: number) {
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.waitForTimeout(150);
  await page.mouse.up();
}

// #3416 item 63 (qa-breaker on #3469): a press on the dim area of a popover (the voice-folder picker) over the engine panel
// also counted as a press outside the panel under it, and both closed. A press dismisses only the top layer.
test('A press on a picker popover’s outside press closes the picker and leaves the slide-over under it open', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 700 });
  await page.goto('/?mockVoiceFolders=1');
  await settlePage(page);
  await openEnginePanel(page);
  const table = page.getByRole('table', { name: /^Voices of / });
  await table.getByRole('row', { name: /Extras/ }).waitFor();
  await table.scrollIntoViewIfNeeded();
  await table.getByRole('button', { name: 'Choose who the Extras track records' }).click();
  const picker = page.getByRole('dialog', { name: 'Choose who the Extras track records' });
  await picker.waitFor({ timeout: 20_000 });
  await page.waitForTimeout(600);
  await press(page, 8, 350);
  await expect(picker).toHaveCount(0, { timeout: 5_000 });
  await page.waitForTimeout(600);
  await expect(page.getByRole('dialog', { name: /Audio engine/ })).toBeVisible();
  // The layer is gone, so the next press is an ordinary press outside the panel: it closes it (the guard does not stay on).
  await press(page, 8, 350);
  await expect(page.getByRole('dialog', { name: /Audio engine/ })).toHaveCount(0, { timeout: 5_000 });
});

// The same press with a menu open over the panel (the "More actions" menu of a chapter link).
test('A press outside a menu open over the engine panel closes the menu and leaves the panel open', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 700 });
  await page.goto('/');
  await settlePage(page);
  const panel = await openEnginePanel(page);
  await panel.getByRole('button', { name: 'More actions for Chapter 1', exact: true }).click();
  await page.getByRole('menuitem').first().waitFor();
  await page.waitForTimeout(600);
  await press(page, 8, 350);
  await expect(page.getByRole('menuitem')).toHaveCount(0, { timeout: 5_000 });
  await page.waitForTimeout(600);
  await expect(page.getByRole('dialog', { name: /Audio engine/ })).toBeVisible();
});
