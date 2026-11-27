// Escape on Record options, the chapter list or the engine panel, then a key that leaves Enter and Space to the page (Ctrl+Alt+Space, a voice key) before the popup has finished leaving. Base UI
// gives focus back to the popup's trigger only when its exit ends (120 ms, --motion-fast; the engine panel's drawer, --motion-base); a key inside that window found focus on the leaving popup, moved nothing, started its
// take, and the hand-back then put focus on Record options: a footswitch Enter opened the options and the take went on recording. The rest of the visual suite runs with reduced
// motion (settlePage), where the exit is over within a frame, so these run with motion on: no settlePage. The exit is held at 600 ms (`--motion-fast` and `--motion-base`) so that every case can
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
const engineChip = (page: Page) => page.getByRole('button', { name: /^Recording setup/ });
const enginePanel = (page: Page) => page.locator('[data-slide-over]');
const panelLeaving = (page: Page) => page.locator('[data-slide-over][data-ending-style]');
/** The panel has slid in: closed halfway through its entry it would slide back only that far, and the exit would be over before the key. */
const openedFully = async (page: Page): Promise<void> => {
  await expect(enginePanel(page)).toBeVisible();
  await page.evaluate(() => Promise.all((document.querySelector('[data-slide-over]')?.getAnimations() ?? []).map((animation) => animation.finished)));
};
const dawRecording = (page: Page) => page.evaluate(() => window.__NARRATION_MOCK_DAW__?.state().recording);

async function openBoothWithMotion(page: Page): Promise<void> {
  await page.goto('/?mockVoiceFolders=1');
  await page.waitForLoadState('networkidle');
  await goToPage(page, 'Booth');
  await boothChapterReady(page);
  await expect(page.getByRole('button', { name: /^Record$/ })).toBeEnabled();
  // The popup really animates here: the suite's reduced-motion default is not set.
  expect(await page.evaluate(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(false);
  await page.addStyleTag({ content: `:root { --motion-fast: ${HELD_EXIT_MS}ms; --motion-base: ${HELD_EXIT_MS}ms; }` });
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

const alertQuestion = (page: Page) => page.getByRole('alertdialog', { name: 'Stop recording?' });
const coldRunning = (page: Page) => page.getByText('Mic on · cold read', { exact: true });

/** The chapter list opened from the keyboard (Enter on its button): the highlighted item keeps focus while the list leaves, so it is what a key pressed inside the exit lands on. */
async function leaveChapterListFromKeyboard(page: Page, lag: number): Promise<string | null> {
  const label = await chapterButton(page).getAttribute('aria-label');
  await chapterButton(page).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('[role="menuitemradio"]:focus')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(lag);
  await expect(leavingNow(page)).toHaveCount(1);
  return label;
}

// The same list left from the keyboard: the chord's Space went to the highlighted item and Base UI clicked it, so the chapter changed, "Stop recording?" opened with "Keep recording"
// focused and the footswitch's first Enter pressed it (the second stopped the take). A list that is leaving takes no press.
for (const lag of [20, 60]) {
  test(`${lag} ms after leaving the chapter list from the keyboard in Cold read, Ctrl+Alt+Space starts the take, picks nothing and the first Enter stops it`, async ({
    page,
  }) => {
    await openBoothWithMotion(page);
    await recordOptions(page).click();
    await page.getByRole('radio', { name: 'Cold read', exact: true }).click();
    await page.keyboard.press('Escape');
    await expect(optionsDialog(page)).toHaveCount(0);
    await expect(recordOptions(page)).toBeFocused();
    const before = await leaveChapterListFromKeyboard(page, lag);
    await page.keyboard.press('Control+Alt+Space');
    await expectEnterStopsTheTake(page, 'Enter');
    await expect(chapterButton(page)).toHaveAttribute('aria-label', before ?? '');
    await expect(alertQuestion(page)).toHaveCount(0);
  });

  test(`${lag} ms after leaving the chapter list from the keyboard in Record, Ctrl+Alt+Space starts the cold read and picks no chapter`, async ({ page }) => {
    await openBoothWithMotion(page);
    const before = await leaveChapterListFromKeyboard(page, lag);
    await page.keyboard.press('Control+Alt+Space');
    await expect(coldRunning(page)).toBeVisible();
    await page.waitForTimeout(HELD_EXIT_MS + 400);
    await expect(chapterButton(page)).toHaveAttribute('aria-label', before ?? '');
    await expect(alertQuestion(page)).toHaveCount(0);
    expect(await onThePage(page)).toBe(true);
  });
}

// A chord the Booth refuses (a take already runs) takes nothing from a popup that is leaving: its own hand-back stands, and the take goes on.
test('Ctrl+Alt+Space refused while a take runs leaves Record options its hand-back, with motion on', async ({ page }) => {
  await openBoothWithMotion(page);
  await page.getByRole('button', { name: /^Record$/ }).click();
  await expect(stop(page)).toBeVisible();
  await pastStartGuard(page);
  await recordOptions(page).click();
  await expect(optionsDialog(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(20);
  await expect(leavingNow(page)).toHaveCount(1);
  await page.keyboard.press('Control+Alt+Space');
  await expect(recordOptions(page)).toBeFocused();
  await expect(stop(page)).toBeVisible();
  expect(await dawRecording(page)).toBe(true);
});

// The engine panel (a SlideOver, the 'Recording setup' chip) leaves on --motion-base, longer than a popover: the same hand-back landed on the chip after Ctrl+Alt+Space
// had started the take, and the Enter that should stop it reopened the panel with the take still recording.
for (const lag of [20, 60, 120]) {
  test(`Escape on the engine panel, ${lag} ms later Ctrl+Alt+Space starts the take, focus is on the page and Enter stops it instead of reopening the panel`, async ({
    page,
  }) => {
    await openBoothWithMotion(page);
    await recordOptions(page).click();
    await page.getByRole('radio', { name: 'Cold read', exact: true }).click();
    await page.keyboard.press('Escape');
    await expect(optionsDialog(page)).toHaveCount(0);
    await engineChip(page).click();
    await openedFully(page);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(lag);
    await expect(panelLeaving(page)).toHaveCount(1);
    await page.keyboard.press('Control+Alt+Space');
    await expectEnterStopsTheTake(page, 'Enter');
    await expect(enginePanel(page)).toHaveCount(0);
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

test('Escape on the engine panel with no key after it still gives focus back to the Recording setup chip, with motion on', async ({ page }) => {
  await openBoothWithMotion(page);
  await engineChip(page).click();
  await openedFully(page);
  await page.keyboard.press('Escape');
  await expect(engineChip(page)).toBeFocused();
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
