// #4125 B4: Enter or Space pressed again just after Enter on a toast's Dismiss must press nothing. Removing a milestone raises "Removed …" with Undo and moves focus to the next row's Remove; the toast's Dismiss is
// focused from there (so that Remove is where focus came from). The first Enter dismisses the toast and focus goes back to that Remove at once; a second, fresh Enter within ACTION_FOCUS_MS (250 ms) of the key coming up
// is consumed (it would take a second milestone away), and so are Space (a button is clicked by Space's keyup) and NumpadEnter. Tab and Shift+Tab are not consumed, and the grace ends.
import { expect, test, type Page } from '@playwright/test';
import { boothDrivers } from './drivers/booth';
import { editingDrivers } from './drivers/editing';
import { addMilestone } from './drivers/schedule';
import { settlePage } from './helpers/settle';

const removes = (page: Page) => page.getByRole('button', { name: /^Remove M / });

/** Three milestones, "M one" removed with the keyboard, and the removal toast's Dismiss focused from "Remove M two". */
async function removedWithDismissFocused(page: Page): Promise<void> {
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
}

// The gaps stand 100 ms or more inside the 250 ms window (a keystroke through the driver takes a few ms); the window's own edge is held with fake timers in Toast.test.tsx.
for (const key of ['Enter', 'NumpadEnter', 'Space']) {
  for (const gap of [30, 150]) {
    test(`Schedule / ${key} ${gap} ms after Enter on the Undo toast's Dismiss leaves the next milestone`, async ({ page }) => {
      await removedWithDismissFocused(page);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(gap);
      await page.keyboard.press(key);
      // The hand-back still happened, and nothing is pressed later by the key's keyup.
      await expect(page.getByRole('button', { name: 'Remove M two' })).toBeFocused();
      await page.waitForTimeout(600);
      await expect(removes(page)).toHaveCount(2);
      await expect(page.getByRole('button', { name: 'Remove M two' })).toBeFocused();
    });
  }
}

for (const key of ['Tab', 'Shift+Tab']) {
  test(`Schedule / ${key} 50 ms after Enter on the Undo toast's Dismiss moves from the control focus went back to`, async ({ page }) => {
    await removedWithDismissFocused(page);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);
    await page.keyboard.press(key);
    // From "Remove M two", not from the top of the page: the focused control lies in the milestones table.
    const inTable = await page.evaluate(() => !!document.activeElement?.closest('table, [role="table"], [role="row"], tr'));
    expect(inTable).toBe(true);
    await expect(page.getByRole('button', { name: 'Remove M two' })).not.toBeFocused();
  });
}

test("Schedule / Enter on Remove 400 ms after Enter on the Undo toast's Dismiss still removes it: the grace ends", async ({ page }) => {
  await removedWithDismissFocused(page);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Remove M two' })).toBeFocused();
  await page.waitForTimeout(400);
  await page.keyboard.press('Enter');
  await expect(removes(page)).toHaveCount(1);
});

// Where focus goes back to is the Voice sample button (a second Enter or Space would open its dialog), and a key that reached the page itself would run its own commands (Space plays, Enter keeps the take): the grace
// consumes it before either sees it.
for (const key of ['Space', 'Enter']) {
  test(`Editing / ${key} twice on a toast's Dismiss opens no dialog, starts no playback and keeps no take`, async ({ page }) => {
    await editingDrivers['voice-sample-saved'](page);
    const toast = page.getByRole('status').filter({ hasText: /^Saved voice sample for / });
    await toast.getByRole('button', { name: 'Dismiss message' }).focus();
    await page.keyboard.press(key);
    await page.waitForTimeout(30);
    await page.keyboard.press(key);
    await page.waitForTimeout(900);
    await expect(page.getByRole('dialog', { name: 'Voice sample' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Pause' })).toHaveCount(0);
    const texts = await page.locator('[data-toast-text]').allTextContents();
    expect(texts.filter((text) => /Played|already kept|Kept take/.test(text))).toEqual([]);
  });
}

// A modal dialog is open under the toast: Shift+Tab just after dismissing it stays in the dialog (focus is back on the control it left, at once).
test('Booth / Shift+Tab 40 ms after dismissing a toast over the link dialog keeps focus inside the dialog', async ({ page }) => {
  await boothDrivers['record-unlinked-link-refused'](page);
  await page.locator('[data-toast-region]').getByRole('button', { name: 'Dismiss message' }).focus();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(40);
  await page.keyboard.press('Shift+Tab');
  const inDialog = await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"], [role="alertdialog"]'));
  expect(inDialog).toBe(true);
});
