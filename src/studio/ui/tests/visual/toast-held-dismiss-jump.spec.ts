import { expect, test, type Page } from '@playwright/test';
import { settlePage } from './helpers/settle';

// #4125 (qa-breaker on #4120): a Dismiss pressed from the keyboard hands focus back to the control that had it before the toast. Held down, the key's own coming up decides when, and only
// if nothing else took focus meanwhile: hold Enter on Dismiss, open the Jump menu (a click, or Ctrl+K), release the key: the Jump menu's field keeps focus, it does not jump to the
// button behind the open modal and take the narrator's typing with it. A key whose keyup is lost (the window loses focus, the key never comes up) swallows only its own repeats.
// shortcut: the same inline `__raiseToast` declaration the other toast specs carry; #4118 adds `helpers/raiseToast.ts` and moves them all, this one with them.
type Raise = { __raiseToast: (text: string) => void };

async function raiseToast(page: Page): Promise<void> {
  await page.waitForFunction(() => typeof (window as unknown as Partial<Raise>).__raiseToast === 'function');
  await page.evaluate(() => (window as unknown as Raise).__raiseToast('The save failed. Try again.'));
}

async function raiseAndFocusDismiss(page: Page): Promise<void> {
  await page.goto('/');
  await settlePage(page);
  await raiseToast(page);
  const dismiss = page.locator('[data-toast-region]').getByRole('button', { name: 'Dismiss message' });
  await expect(dismiss).toBeVisible();
  await dismiss.focus();
}

// A hand-back that must NOT happen cannot be polled for: the window is the toast's 250 ms wait (`ACTION_FOCUS_MS`) and then some, after which the field must still have focus.
const PAST_HAND_BACK_MS = 400;

const jumpField = (page: Page) => page.getByRole('combobox', { name: 'Jump menu' });
const jumpButton = (page: Page) => page.getByRole('button', { name: /Jump to or run/ }).first();

test('hold Enter on Dismiss, open the Jump menu with a click, release Enter: the field keeps focus', async ({ page }) => {
  await raiseAndFocusDismiss(page);
  await page.keyboard.down('Enter');
  await jumpButton(page).click();
  await expect(jumpField(page)).toBeFocused();
  await page.keyboard.up('Enter');
  await page.waitForTimeout(PAST_HAND_BACK_MS);
  await expect(jumpField(page)).toBeFocused();
  await page.keyboard.type('script');
  await expect(jumpField(page)).toHaveValue('script');
});

test('hold Enter on Dismiss, Ctrl+K, release K then Enter: the field keeps focus the whole time', async ({ page }) => {
  await raiseAndFocusDismiss(page);
  await page.keyboard.down('Enter');
  await page.keyboard.down('Control');
  await page.keyboard.down('KeyK');
  await expect(jumpField(page)).toBeFocused();
  await page.keyboard.up('KeyK');
  await page.keyboard.up('Control');
  await page.waitForTimeout(PAST_HAND_BACK_MS);
  await expect(jumpField(page)).toBeFocused();
  await page.keyboard.up('Enter');
  await page.waitForTimeout(PAST_HAND_BACK_MS);
  await expect(jumpField(page)).toBeFocused();
});

test("Enter's keyup lost: a held Backspace in the Jump field still repeats", async ({ page }) => {
  await raiseAndFocusDismiss(page);
  await page.keyboard.down('Enter');
  await jumpButton(page).click();
  await expect(jumpField(page)).toBeFocused();
  // Filled, not typed: a typed key's keyup would end the swallowing on its own (main's), and the test is about the lost keyup.
  await jumpField(page).fill('abcdefg');
  // Enter is never released (the lost keyup). A Backspace held down repeats (Playwright sends the repeats when a down comes for a key already down): every one deletes a letter.
  await page.keyboard.down('Backspace');
  await page.keyboard.down('Backspace');
  await page.keyboard.down('Backspace');
  await page.keyboard.down('Backspace');
  await page.keyboard.up('Backspace');
  await expect(jumpField(page)).toHaveValue('abc');
});

test('a key still held after the window lost focus presses nothing focus was handed back to (the Jump menu stays shut)', async ({ page }) => {
  await page.goto('/');
  await settlePage(page);
  const opener = jumpButton(page);
  await opener.focus();
  await raiseToast(page);
  const dismiss = page.locator('[data-toast-region]').getByRole('button', { name: 'Dismiss message' });
  await expect(dismiss).toBeVisible();
  await dismiss.focus();
  await page.keyboard.down('Enter');
  // The window loses focus mid-hold (alt-tab): the hand-back runs now, and the narrator keeps holding Enter, whose repeats must not press the Jump button focus went back to.
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(opener).toBeFocused();
  await page.keyboard.down('Enter');
  await page.keyboard.down('Enter');
  await page.waitForTimeout(PAST_HAND_BACK_MS);
  await expect(jumpField(page)).toHaveCount(0);
  await page.keyboard.up('Enter');
});
