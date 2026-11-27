// #4125: in the Booth a pedal's Space starts a take, and its own guard (#4094) takes a second take key within 600 ms of a toast button's KEYDOWN as the same tap. A narrator who holds the key on a
// toast's Dismiss for a while uses most of that time up, so the Space pressed just after focus went back to a page button used to start a take. The toast's key listener is on the window's capture
// phase now, before the pedal's document listener, so the key it consumes after a dismissal (the grace, #4158) never reaches the pedal.
import { expect, test, type Page } from '@playwright/test';
import { openBooth } from './drivers/shared';
import { raiseToast } from './helpers/raiseToast';

const record = (page: Page) => page.getByRole('button', { name: /^Record$/ });
const chapterButton = (page: Page) => page.getByRole('button', { name: /^Chapter: .*Change chapter/ });
const recording = (page: Page) => page.evaluate(() => window.__NARRATION_MOCK_DAW__?.state().recording);

/** Holds `key` on the toast's Dismiss for `heldMs` with repeats, lets it come up, and waits for focus to be back on the page button it came from. */
async function dismissHolding(page: Page, key: string, heldMs: number): Promise<void> {
  await openBooth(page, '?mockCallLog=1');
  await expect(record(page)).toBeEnabled();
  await raiseToast(page, 'The take could not be made.', null);
  const dismiss = page.getByRole('button', { name: 'Dismiss message' });
  await expect(dismiss).toBeVisible();
  await chapterButton(page).focus();
  await dismiss.focus();
  await page.keyboard.down(key);
  for (let held = 0; held < heldMs; held += 50) {
    await page.waitForTimeout(50);
    await page.keyboard.down(key);
  }
  await page.keyboard.up(key);
  await expect(chapterButton(page)).toBeFocused();
}

test.describe('the Booth pedal does not start a take from a key pressed just after a held dismissal', () => {
  for (const key of ['Space', 'Enter']) {
    for (const later of [30, 200]) {
      test(`Booth / ${key} held 450 ms on a toast's Dismiss, then ${key} ${later} ms after focus went back to a page button, starts no take`, async ({
        page,
      }) => {
        await dismissHolding(page, key, 450);
        await page.waitForTimeout(later);
        await page.keyboard.press(key);
        await page.waitForTimeout(300);
        await expect(record(page)).toBeVisible();
        expect(await recording(page)).toBe(false);
      });
    }
  }
});
