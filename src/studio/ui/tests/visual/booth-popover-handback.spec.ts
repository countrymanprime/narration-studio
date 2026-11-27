// Escape on Record options (or the chapter list), then a key that leaves Enter and Space to the page (Ctrl+Alt+Space, a voice key) before the popup has finished leaving. Base UI
// gives focus back to the popup's trigger only when its exit ends (120 ms, --motion-fast); a key inside that window found focus on the leaving popup, moved nothing, started its
// take, and the hand-back then put focus on Record options: a footswitch Enter opened the options and the take went on recording. The rest of the visual suite runs with reduced
// motion (settlePage), where the exit is over within a frame, so these run with motion on: no settlePage. The exit is held at 600 ms (`--motion-fast`) so that every case can
// assert the popup is still leaving when the key is pressed, and the 20 and 60 ms lags are inside it however slow the machine is.
import { expect, test, type Page } from '@playwright/test';
import { boothChapterReady } from './helpers/viewTop';
import { goToPage } from './drivers/shared';
import { pastStartGuard } from './helpers/startGuard';

const HELD_EXIT_MS = 600;
const stop = (page: Page) => page.getByText('REC', { exact: true });
const recordOptions = (page: Page) => page.getByRole('button', { name: 'Record options' });
const optionsDialog = (page: Page) => page.getByRole('dialog', { name: 'Record options' });
const chapterButton = (page: Page) => page.getByRole('button', { name: /^Chapter: / });
const leavingNow = (page: Page) => page.locator('[data-popover-popup][data-ending-style], [role="menu"][data-ending-style], [role="menu"][data-closed]');
const dawRecording = (page: Page) => page.evaluate(() => window.__NARRATION_MOCK_DAW__?.state().recording);

async function openBoothWithMotion(page: Page): Promise<void> {
  await page.goto('/?mockVoiceFolders=1');
  await page.waitForLoadState('networkidle');
  await goToPage(page, 'Booth');
  await boothChapterReady(page);
  await expect(page.getByRole('button', { name: /^Record$/ })).toBeEnabled();
  // The popup really animates here: the suite's reduced-motion default is not set.
  expect(await page.evaluate(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(false);
  await page.addStyleTag({ content: `:root { --motion-fast: ${HELD_EXIT_MS}ms; }` });
}

/** Enter and Space are Record's only from the page itself: any focused control keeps them. The page's <main> has focus, not <body> (a Tab from <body> goes to the skip link). */
const onThePage = (page: Page) => page.evaluate(() => document.activeElement?.tagName === 'MAIN');

/** Opens Record options, picks a mode and presses Escape, then waits `lag` ms: the popover is still leaving. */
async function escapeFromOptions(page: Page, mode: 'Cold read' | 'Record', lag: number): Promise<void> {
  await recordOptions(page).click();
  await page.getByRole('radio', { name: mode, exact: true }).click();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(lag);
  await expect(leavingNow(page)).toHaveCount(1);
}

/** Opens the chapter list and leaves it (Escape, or a click on the chapter it already shows), then waits `lag` ms: the menu is still leaving. */
async function leaveChapterList(page: Page, how: 'Escape' | 'click', lag: number): Promise<void> {
  await chapterButton(page).click();
  const current = page.getByRole('menuitemradio', { checked: true });
  await expect(current).toBeVisible();
  if (how === 'click') await current.click();
  else await page.keyboard.press('Escape');
  await page.waitForTimeout(lag);
  await expect(leavingNow(page)).toHaveCount(1);
}

/** The take runs, the page has focus after the exit has long ended, and Enter stops it: nothing opened, no question asked, the mock DAW is not recording. */
async function expectEnterStopsTheTake(page: Page, key: 'Enter' | 'NumpadEnter'): Promise<void> {
  await expect(stop(page)).toBeVisible();
  expect(await dawRecording(page)).toBe(true);
  // Past the end of the exit, where the hand-back used to land.
  await page.waitForTimeout(HELD_EXIT_MS + 400);
  expect(await onThePage(page)).toBe(true);
  await expect(recordOptions(page)).not.toBeFocused();
  await expect(chapterButton(page)).not.toBeFocused();
  await pastStartGuard(page);
  await page.keyboard.press(key);
  await expect(stop(page)).toHaveCount(0);
  expect(await dawRecording(page)).toBe(false);
  await expect(optionsDialog(page)).toHaveCount(0);
  await expect(page.getByRole('alertdialog', { name: 'Stop recording?' })).toHaveCount(0);
  await expect(page.getByRole('menu')).toHaveCount(0);
}

for (const lag of [20, 60]) {
  test.describe(`${lag} ms after leaving a popup in the Booth, with motion on`, () => {
    for (const key of ['Enter', 'NumpadEnter'] as const) {
      test(`Escape on Record options, Ctrl+Alt+Space starts the take and ${key} stops it instead of opening the options`, async ({ page }) => {
        await openBoothWithMotion(page);
        await escapeFromOptions(page, 'Cold read', lag);
        await page.keyboard.press('Control+Alt+Space');
        await expectEnterStopsTheTake(page, key);
      });
    }

    test('Escape on Record options, a voice key records on its lane and Enter stops it instead of opening the options', async ({ page }) => {
      await openBoothWithMotion(page);
      await escapeFromOptions(page, 'Record', lag);
      await page.keyboard.press('Numpad1');
      await expectEnterStopsTheTake(page, 'Enter');
    });

    for (const how of ['Escape', 'click'] as const) {
      test(`${how} on the chapter list, Ctrl+Alt+Space starts the take and Enter stops it without opening the list or asking`, async ({ page }) => {
        await openBoothWithMotion(page);
        await page.getByRole('button', { name: /^Record options$/ }).click();
        await page.getByRole('radio', { name: 'Cold read', exact: true }).click();
        await page.keyboard.press('Escape');
        await expect(optionsDialog(page)).toHaveCount(0);
        await leaveChapterList(page, how, lag);
        await page.keyboard.press('Control+Alt+Space');
        await expectEnterStopsTheTake(page, 'Enter');
      });
    }

    for (const key of ['NumpadAdd', 'NumpadSubtract']) {
      test(`Escape on Record options, the step voice key ${key} leaves focus on the page, not on Record options`, async ({ page }) => {
        await openBoothWithMotion(page);
        await escapeFromOptions(page, 'Record', lag);
        await page.keyboard.press(key);
        await page.waitForTimeout(HELD_EXIT_MS + 400);
        expect(await onThePage(page)).toBe(true);
        await expect(recordOptions(page)).not.toBeFocused();
      });
    }
  });
}

// What the rule must not break: with no key in between, Escape still gives focus back to the control that opened the popup.
test('Escape on Record options with no key after it still gives focus back to Record options, with motion on', async ({ page }) => {
  await openBoothWithMotion(page);
  await recordOptions(page).click();
  await expect(optionsDialog(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(recordOptions(page)).toBeFocused();
});

test('Escape on the chapter list with no key after it still gives focus back to the chapter button, with motion on', async ({ page }) => {
  await openBoothWithMotion(page);
  await chapterButton(page).click();
  await expect(page.getByRole('menu')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(chapterButton(page)).toBeFocused();
});

// A key the Booth refuses (a voice key in Cold read: a notice, no take) did not take the page's focus: the popover's own hand-back stands.
test('a voice key refused in Cold read leaves Record options its hand-back, with motion on', async ({ page }) => {
  await openBoothWithMotion(page);
  await escapeFromOptions(page, 'Cold read', 20);
  await page.keyboard.press('Numpad1');
  await expect(recordOptions(page)).toBeFocused();
  await expect(stop(page)).toHaveCount(0);
});
