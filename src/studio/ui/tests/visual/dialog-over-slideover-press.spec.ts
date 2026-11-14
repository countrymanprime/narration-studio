import { expect, test } from '@playwright/test';
import { openEnginePanel } from './drivers/shared';
import { settlePage } from './helpers/settle';

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
  await page.mouse.click(8, 350);
  await expect(picker).toHaveCount(0, { timeout: 5_000 });
  await page.waitForTimeout(600);
  await expect(page.getByRole('dialog', { name: /Audio engine/ })).toBeVisible();
});
