// #4125 B3: an Undo pressed from the keyboard while the Add milestone dialog is open must not leave focus on the page behind the dialog. Removing a milestone raises "Removed …" with Undo;
// the Add milestone dialog is opened over it, Tab walks on from the dialog's last control to the toast's Undo, Enter presses it. Undo brings the row back and the page used to put focus on
// that row's Edit button (a control behind the dialog's scrim); now the page leaves focus alone while a dialog is open and the toast hands it back to the control it came from, inside the dialog.
import { expect, test } from '@playwright/test';
import { confirmDialog } from './drivers/shared';
import { settlePage } from './helpers/settle';

test('Schedule / Undo pressed over the open Add milestone dialog keeps focus inside the dialog', async ({ page }) => {
  await page.goto('/schedule?mockProduction=on-pace');
  await settlePage(page);
  await page.getByRole('heading', { level: 2, name: 'Milestones' }).waitFor();
  const add = page.getByRole('button', { name: 'Add milestone', exact: true }).first();
  await add.click();
  const dialog = confirmDialog(page, /milestone/i);
  await dialog.getByRole('textbox', { name: 'Name' }).fill('Mile');
  await dialog.getByRole('textbox', { name: 'Due' }).fill('2026-10-05');
  await dialog.getByRole('button', { name: 'Add milestone' }).click();
  await dialog.waitFor({ state: 'detached' });
  // Toasts show one at a time: the Add toast holds the slot until it is dismissed.
  await page.getByRole('button', { name: 'Dismiss' }).click();
  await expect(page.locator('[data-toast-text]')).toHaveCount(0);

  // Remove from the keyboard, then open the dialog over the toast.
  const remove = page.getByRole('button', { name: /^Remove Mile/ });
  await remove.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-toast-text]', { hasText: 'Removed' })).toBeVisible();
  await add.focus();
  await page.keyboard.press('Enter');
  await dialog.waitFor();

  // Tab on from the dialog's controls to the toast's Undo.
  const undo = page.locator('[data-toast-region]').getByRole('button', { name: 'Undo' });
  for (let i = 0; i < 20 && !(await undo.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press('Tab');
  await expect(undo).toBeFocused();
  await page.keyboard.press('Enter');

  // The row came back; focus is still inside the dialog, not on the Edit button behind it.
  // (The page behind the dialog is hidden from the accessibility tree, so the row is found by its attribute.)
  await expect(page.locator('[data-edit]').first()).toBeAttached();
  await expect(dialog).toBeVisible();
  await page.waitForTimeout(600);
  const inDialog = await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"], [role="alertdialog"]'));
  expect(inDialog).toBe(true);
});
