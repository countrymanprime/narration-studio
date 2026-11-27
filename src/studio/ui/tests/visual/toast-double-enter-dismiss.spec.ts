// #4125 B4: Enter pressed twice in a row on the Undo toast's Dismiss must not press the control the toast hands focus back to. Removing a milestone raises "Removed …" with Undo and moves focus to the next
// row's Remove; the toast's Dismiss is focused from there (so that Remove is where focus came from). The first Enter dismisses the toast, the second is an ordinary fresh press: it must not
// reach that Remove button and take a second milestone away.
import { expect, test, type Page } from '@playwright/test';
import { confirmDialog } from './drivers/shared';
import { settlePage } from './helpers/settle';

async function addMilestone(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: 'Add milestone', exact: true }).first().click();
  const dialog = confirmDialog(page, /milestone/i);
  await dialog.getByRole('textbox', { name: 'Name' }).fill(name);
  await dialog.getByRole('textbox', { name: 'Due' }).fill('2026-10-05');
  await dialog.getByRole('button', { name: 'Add milestone' }).click();
  await dialog.waitFor({ state: 'detached' });
  // Toasts show one at a time: the Add toast holds the slot until it is dismissed.
  await page.getByRole('button', { name: 'Dismiss' }).click();
  await expect(page.locator('[data-toast-text]')).toHaveCount(0);
}

const removes = (page: Page) => page.getByRole('button', { name: /^Remove M / });

for (const gap of [0, 30, 100, 200]) {
  test(`Schedule / Enter twice ${gap} ms apart on the Undo toast's Dismiss leaves the next milestone`, async ({ page }) => {
    await page.goto('/schedule?mockProduction=on-pace');
    await settlePage(page);
    await page.getByRole('heading', { level: 2, name: 'Milestones' }).waitFor();
    for (const name of ['M one', 'M two', 'M three']) await addMilestone(page, name);
    await expect(removes(page)).toHaveCount(3);
    await page.getByRole('button', { name: 'Remove M one' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-toast-text]', { hasText: 'Removed M one.' })).toBeVisible();
    // The page moved focus to the next row's Remove; the toast's Dismiss takes it from there.
    await expect(page.getByRole('button', { name: 'Remove M two' })).toBeFocused();
    await page.locator('[data-toast-region]').getByRole('button', { name: 'Dismiss message' }).focus();
    await page.keyboard.press('Enter');
    if (gap > 0) await page.waitForTimeout(gap);
    await page.keyboard.press('Enter');
    // Let every hand-back settle: nothing may be removed by the second press.
    await page.waitForTimeout(800);
    await expect(removes(page)).toHaveCount(2);
    await expect(page.getByRole('button', { name: 'Remove M two' })).toBeAttached();
  });
}
