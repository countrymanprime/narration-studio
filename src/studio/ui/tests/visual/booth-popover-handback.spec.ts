// Escape on Record options, then a key that leaves Enter and Space to the page (Ctrl+Alt+Space, a voice key) before the popover has finished leaving. Base UI gives focus
// back to the popover's trigger only when its exit ends (120 ms, --motion-fast); a key inside that window found focus on the leaving popup, moved nothing, started its take,
// and the hand-back then put focus on Record options: a footswitch Enter opened the options and the take went on recording. The rest of the visual suite runs with reduced
// motion (settlePage), where the exit is over within a frame and the window is a few milliseconds, so these run with motion on: no settlePage, the real exit.
import { expect, test, type Page } from '@playwright/test';
import { boothChapterReady } from './helpers/viewTop';
import { goToPage } from './drivers/shared';
import { pastStartGuard } from './helpers/startGuard';

const stop = (page: Page) => page.getByText('REC', { exact: true });
const recordOptions = (page: Page) => page.getByRole('button', { name: 'Record options' });
const optionsDialog = (page: Page) => page.getByRole('dialog', { name: 'Record options' });

async function openBoothWithMotion(page: Page): Promise<void> {
  await page.goto('/?mockVoiceFolders=1');
  await page.waitForLoadState('networkidle');
  await goToPage(page, 'Booth');
  await boothChapterReady(page);
  await expect(page.getByRole('button', { name: /^Record$/ })).toBeEnabled();
  // The popover really animates here: the suite's reduced-motion default is not set.
  expect(await page.evaluate(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(false);
}

/** Enter and Space are Record's only from the page itself: any focused control keeps them. */
const onThePage = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement;
    return !el || el === document.body || el.tagName === 'MAIN';
  });

/** Opens Record options, picks a mode and presses Escape, then waits `lag` ms: the popover is still leaving (its exit is 120 ms). */
async function escapeFromOptions(page: Page, mode: 'Cold read' | 'Record', lag: number): Promise<void> {
  await recordOptions(page).click();
  await page.getByRole('radio', { name: mode, exact: true }).click();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(lag);
}

for (const lag of [20, 60]) {
  test.describe(`${lag} ms after Escape on Record options, with motion on`, () => {
    test('Ctrl+Alt+Space starts the take, focus stays on the page and Enter stops it instead of opening the options', async ({ page }) => {
      await openBoothWithMotion(page);
      await escapeFromOptions(page, 'Cold read', lag);
      await page.keyboard.press('Control+Alt+Space');
      await expect(stop(page)).toBeVisible();
      // Past the end of the exit, where the hand-back used to land.
      await page.waitForTimeout(600);
      expect(await onThePage(page)).toBe(true);
      await expect(recordOptions(page)).not.toBeFocused();
      await pastStartGuard(page);
      await page.keyboard.press('Enter');
      await expect(stop(page)).toHaveCount(0);
      await expect(optionsDialog(page)).toHaveCount(0);
    });

    test('a voice key records on its lane, focus stays on the page and Enter stops it instead of opening the options', async ({ page }) => {
      await openBoothWithMotion(page);
      await escapeFromOptions(page, 'Record', lag);
      await page.keyboard.press('Numpad1');
      await expect(stop(page)).toBeVisible();
      await page.waitForTimeout(600);
      expect(await onThePage(page)).toBe(true);
      await expect(recordOptions(page)).not.toBeFocused();
      await pastStartGuard(page);
      await page.keyboard.press('Enter');
      await expect(stop(page)).toHaveCount(0);
      await expect(optionsDialog(page)).toHaveCount(0);
    });
  });
}

// What the rule must not break: with no key in between, Escape still gives focus back to the control that opened the popover.
test('Escape on Record options with no key after it still gives focus back to Record options, with motion on', async ({ page }) => {
  await openBoothWithMotion(page);
  await recordOptions(page).click();
  await expect(optionsDialog(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(recordOptions(page)).toBeFocused();
});
