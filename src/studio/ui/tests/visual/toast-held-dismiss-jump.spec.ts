import { expect, test, type Page } from '@playwright/test';
import { raiseToast } from './helpers/raiseToast';
import { settlePage } from './helpers/settle';

// #4125 (qa-breaker on #4120): a Dismiss pressed from the keyboard hands focus back to the control that had it before the toast. Held down, the key's own coming up decides when, and only
// if nothing else took focus meanwhile: hold Enter on Dismiss, open the Jump menu (a click, or Ctrl+K), release the key: the Jump menu's field keeps focus, it does not jump to the
// button behind the open modal and take the narrator's typing with it. A key whose keyup is lost (the window loses focus, the key never comes up) swallows only its own repeats.
const TEXT = 'The save failed. Try again.';

async function raiseAndFocusDismiss(page: Page): Promise<void> {
  await page.goto('/');
  await settlePage(page);
  await raiseToast(page, TEXT);
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
  await raiseToast(page, TEXT);
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

async function raiseWithOpenerFocused(page: Page) {
  await page.goto('/');
  await settlePage(page);
  const opener = jumpButton(page);
  await opener.focus();
  await raiseToast(page, TEXT);
  return opener;
}

test("Enter's keyup lost, a fresh Enter held on the page body: the Jump menu stays shut and focus goes back after the new Enter comes up", async ({ page }) => {
  const opener = await raiseWithOpenerFocused(page);
  const dismiss = page.locator('[data-toast-region]').getByRole('button', { name: 'Dismiss message' });
  await expect(dismiss).toBeVisible();
  await dismiss.focus();
  // Drop every keyup before the page sees it (a native dialog took it): Enter's keyup is lost, the toast goes and focus is on <body>.
  await page.evaluate(() => {
    const drop = (event: KeyboardEvent) => {
      if ((window as unknown as { __dropKeyup?: boolean }).__dropKeyup) event.stopImmediatePropagation();
    };
    (window as unknown as { __dropKeyup: boolean }).__dropKeyup = true;
    window.addEventListener('keyup', drop, true);
  });
  await page.keyboard.press('Enter');
  await expect(dismiss).toHaveCount(0);
  await page.evaluate(() => ((window as unknown as { __dropKeyup: boolean }).__dropKeyup = false));
  // A fresh Enter, held: it must not press what focus is handed to under it.
  await page.keyboard.down('Enter');
  await page.keyboard.down('Enter');
  await page.keyboard.down('Enter');
  await page.waitForTimeout(PAST_HAND_BACK_MS);
  await expect(jumpField(page)).toHaveCount(0);
  await expect(opener).not.toBeFocused();
  await page.keyboard.up('Enter');
  await expect(opener).toBeFocused();
  await expect(jumpField(page)).toHaveCount(0);
});

for (const second of ['Space', 'NumpadEnter']) {
  test(`hold Enter on Retry, hold ${second}, release Enter then ${second}: the Jump menu stays shut`, async ({ page }) => {
    const opener = await raiseWithOpenerFocused(page);
    const retry = page.locator('[data-toast-region]').getByRole('button', { name: 'Retry' });
    await expect(retry).toBeVisible();
    await retry.focus();
    await page.keyboard.down('Enter');
    await page.keyboard.down(second);
    await page.keyboard.down(second);
    await page.keyboard.up('Enter');
    await page.waitForTimeout(PAST_HAND_BACK_MS);
    await expect(jumpField(page)).toHaveCount(0);
    // Still held: its repeats now land wherever focus is (the Jump button, when the hand-back did not wait for it), which makes it active, and its keyup presses it.
    await page.keyboard.down(second);
    await page.keyboard.up(second);
    await expect(opener).toBeFocused();
    // A Space comes up on the button it pressed (the Jump menu opens on its keyup), so give that a moment before looking.
    await page.waitForTimeout(PAST_HAND_BACK_MS);
    await expect(jumpField(page)).toHaveCount(0);
  });
}

test("Enter's keyup lost: a held Space and a held Enter typed into the Jump field still repeat", async ({ page }) => {
  await raiseWithOpenerFocused(page);
  const dismiss = page.locator('[data-toast-region]').getByRole('button', { name: 'Dismiss message' });
  await expect(dismiss).toBeVisible();
  await dismiss.focus();
  await page.evaluate(() => {
    const drop = (event: KeyboardEvent) => {
      if ((window as unknown as { __dropKeyup?: boolean }).__dropKeyup) event.stopImmediatePropagation();
    };
    (window as unknown as { __dropKeyup: boolean }).__dropKeyup = true;
    window.addEventListener('keyup', drop, true);
  });
  // Enter's keyup is lost (the toast goes, the hand-back waits for it), then the narrator opens the Jump menu and types in its field: a Space held there types every repeat.
  await page.keyboard.press('Enter');
  await expect(dismiss).toHaveCount(0);
  await page.evaluate(() => ((window as unknown as { __dropKeyup: boolean }).__dropKeyup = false));
  await page.keyboard.press('Control+KeyK');
  await expect(jumpField(page)).toBeFocused();
  await jumpField(page).fill('ab');
  for (let repeat = 0; repeat < 5; repeat += 1) await page.keyboard.down('Space');
  await page.keyboard.up('Space');
  await expect(jumpField(page)).toHaveValue('ab     ');
});

// The hand-back's own 250 ms timer is a phase of its wait: a key that goes down meanwhile is waited for like the press's own.
for (const second of ['Enter', 'NumpadEnter', 'Space']) {
  test(`press Retry with Enter, hold ${second} on the page body before the hand-back fires: the Jump menu stays shut`, async ({ page }) => {
    const opener = await raiseWithOpenerFocused(page);
    const retry = page.locator('[data-toast-region]').getByRole('button', { name: 'Retry' });
    await expect(retry).toBeVisible();
    await retry.focus();
    await page.keyboard.press('Enter');
    await expect(retry).toHaveCount(0);
    // Within the timer (it is 250 ms): a fresh key, held with its repeats.
    await page.waitForTimeout(40);
    for (let repeat = 0; repeat < 6; repeat += 1) await page.keyboard.down(second);
    await page.waitForTimeout(PAST_HAND_BACK_MS);
    await expect(jumpField(page)).toHaveCount(0);
    await expect(opener).not.toBeFocused();
    await page.keyboard.up(second);
    await expect(opener).toBeFocused();
    await page.waitForTimeout(PAST_HAND_BACK_MS);
    await expect(jumpField(page)).toHaveCount(0);
  });
}

test('Enter held after Retry, a pointer press on the next toast: its repeats still do not open the Jump menu', async ({ page }) => {
  const opener = await raiseWithOpenerFocused(page);
  await raiseToast(page, 'The second message.');
  const region = page.locator('[data-toast-region]');
  const retry = region.getByRole('button', { name: 'Retry' });
  await expect(retry).toBeVisible();
  await retry.focus();
  await page.keyboard.down('Enter');
  await expect(region.getByText('The second message.')).toBeVisible();
  // Enter is repeating, so it is live: a press on the next toast does not let it go.
  await page.keyboard.down('Enter');
  await region.getByText('The second message.').click();
  for (let repeat = 0; repeat < 4; repeat += 1) await page.keyboard.down('Enter');
  await page.waitForTimeout(PAST_HAND_BACK_MS);
  await expect(jumpField(page)).toHaveCount(0);
  await expect(opener).not.toBeFocused();
  await page.keyboard.up('Enter');
  await expect(opener).toBeFocused();
});
