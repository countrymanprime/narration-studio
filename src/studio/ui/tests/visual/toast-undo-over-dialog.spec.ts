// #4125 B3: an Undo pressed while the Add milestone dialog is open must not leave focus on the page behind the dialog. Removing a milestone raises "Removed …" with Undo; the dialog is
// opened over it. Pressed from the keyboard (Tab on from the dialog's last control, or Shift+Tab back from its first), Undo brings the row back and the toast hands focus to the control it
// came from, inside the dialog; the page used to put focus on that row's Edit button first (a control behind the dialog's scrim), and the hand-back then left it there. With the pointer, focus
// goes nowhere (`<body>`), as for any press on a toast, and the dialog stays open. An Undo that is refused (an older toast) leaves focus where the toast's hand-back puts it, inside the dialog.
import { expect, test, type Page } from '@playwright/test';
import { confirmDialog } from './drivers/shared';
import { settlePage } from './helpers/settle';

const ORIGIN = 'data-test-origin';
const IN_DIALOG = '[role="dialog"], [role="alertdialog"]';

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

async function removeByKeyboard(page: Page, name: RegExp): Promise<void> {
  await page.getByRole('button', { name }).focus();
  await page.keyboard.press('Enter');
}

/** The first milestone is removed (and, with `second`, a later one too, so the first toast's Undo is an older one), then the Add milestone dialog is opened over the toast. */
async function removeThenOpenDialog(page: Page, second = false) {
  await page.goto('/schedule?mockProduction=on-pace');
  await settlePage(page);
  await page.getByRole('heading', { level: 2, name: 'Milestones' }).waitFor();
  await addMilestone(page, 'Mile');
  if (second) await addMilestone(page, 'Mile2');
  await removeByKeyboard(page, /^Remove Mile\b/);
  await expect(page.locator('[data-toast-text]', { hasText: 'Removed Mile.' })).toBeVisible();
  if (second) await removeByKeyboard(page, /^Remove Mile2/);
  await page.getByRole('button', { name: 'Add milestone', exact: true }).first().focus();
  await page.keyboard.press('Enter');
  const dialog = confirmDialog(page, /milestone/i);
  await dialog.waitFor();
  return { dialog, undo: page.locator('[data-toast-region]').getByRole('button', { name: 'Undo' }) };
}

/** Presses `key` until the toast's Undo has focus, marking the last control inside the dialog that had it: the one the toast took focus from. */
async function tabToUndo(page: Page, key: 'Tab' | 'Shift+Tab', undo: ReturnType<Page['locator']>): Promise<void> {
  for (let i = 0; i < 30 && !(await undo.evaluate((el) => el === document.activeElement)); i++) {
    await page.evaluate(
      ([attribute, selector]) => {
        const active = document.activeElement;
        if (!active?.closest(selector)) return;
        document.querySelectorAll(`[${attribute}]`).forEach((el) => el.removeAttribute(attribute));
        active.setAttribute(attribute, '');
      },
      [ORIGIN, IN_DIALOG],
    );
    await page.keyboard.press(key);
  }
  await expect(undo).toBeFocused();
}

// The page behind the dialog is hidden from the accessibility tree, so the restored row is found by its attribute.
const rowBack = (page: Page) => expect(page.locator('[data-edit]').first()).toBeAttached();

for (const [key, from] of [
  ['Tab', "the dialog's own Add milestone button"],
  ['Shift+Tab', "the dialog's Close button"],
] as const) {
  test(`Schedule / Undo reached with ${key} over the open Add milestone dialog gives focus back to ${from}`, async ({ page }) => {
    const { dialog, undo } = await removeThenOpenDialog(page);
    await tabToUndo(page, key, undo);
    await page.keyboard.press('Enter');
    await rowBack(page);
    await expect(dialog).toBeVisible();
    // The hand-back's own wait follows: the control the toast took focus from has it again, and nothing behind the dialog.
    await expect(page.locator(`[${ORIGIN}]`)).toBeFocused();
    await page.waitForTimeout(600);
    await expect(page.locator(`[${ORIGIN}]`)).toBeFocused();
  });
}

test('Schedule / mouse Undo over the Add milestone dialog leaves focus on body', async ({ page }) => {
  const { dialog, undo } = await removeThenOpenDialog(page);
  await undo.click();
  await rowBack(page);
  await expect(dialog).toBeVisible();
  await page.waitForTimeout(600);
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
});

test('Schedule / refused Undo over the Add milestone dialog keeps focus inside it', async ({ page }) => {
  const { dialog, undo } = await removeThenOpenDialog(page, true);
  await tabToUndo(page, 'Tab', undo);
  await page.keyboard.press('Enter');
  // The older toast's Undo is refused: the row stays removed and the refusal is raised.
  await expect(page.locator('[data-edit]')).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await page.waitForTimeout(600);
  expect(await page.evaluate((selector) => !!document.activeElement?.closest(selector), IN_DIALOG)).toBe(true);
});
