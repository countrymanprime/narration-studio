// Escape on Record options, the chapter list or the engine panel, then a key that leaves Enter and Space to the page (Ctrl+Alt+Space, a voice key) before the popup has finished leaving. Base UI
// gives focus back to the popup's trigger only when its exit ends (120 ms, --motion-fast; the engine panel's drawer, --motion-base); a key inside that window found focus on the leaving popup, moved nothing, started its
// take, and the hand-back then put focus on Record options: a footswitch Enter opened the options and the take went on recording. The rest of the visual suite runs with reduced
// motion (settlePage), where the exit is over within a frame, so these run with motion on: no settlePage. The exit is held at 600 ms (`--motion-fast` and `--motion-base`) so that every case can
// assert the popup is still leaving when the key is pressed, and the 20 and 60 ms lags are inside it however slow the machine is.
import { expect, test, type Page } from '@playwright/test';
import { boothChapterReady, showChapterTop } from './helpers/viewTop';
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

// A menu that has been closed stays drawn for its exit with its highlighted item focused: the Enter of a footswitch inside that exit pressed the item (#4183). With a take running the
// right-click menu's "Roll again" ran and the take went on recording; the Editing DAW tools and Story Bible More actions menus opened their dialog. A leaving menu takes no press.
const menuItem = (page: Page, name: string | RegExp) => page.getByRole('menuitem', { name });

/** ArrowDown until the item named `name` is the focused one: what a narrator who walked to it does before Escape. */
async function highlight(page: Page, name: string | RegExp, timeout = 5_000): Promise<void> {
  for (let step = 0; step < 14; step++) {
    // Bounded: a menu that has gone fails here, not by the test's own timeout.
    if (await menuItem(page, name).evaluate((item) => document.activeElement === item, undefined, { timeout })) return;
    await page.keyboard.press('ArrowDown');
  }
  throw new Error(`could not walk to ${name}`);
}

/** A take runs and the right-click menu is open on a word, with "Roll again" or `item` highlighted by the arrow keys. */
async function rightClickDuringTake(page: Page, item?: string | RegExp): Promise<void> {
  await openBoothWithMotion(page);
  await page.getByRole('button', { name: /^Record$/ }).click();
  await expect(stop(page)).toBeVisible();
  await pastStartGuard(page);
  // A word that is in the window now: the reading follows the take, and `showChapterTop` (which wheels and re-measures a word for seconds) can lose its word to a re-render on a loaded machine.
  const index = await page.locator('[data-booth-text] [data-word]').evaluateAll((words) => {
    const height = window.innerHeight;
    return words.findIndex((word) => {
      const box = word.getBoundingClientRect();
      return box.left > 40 && box.right < window.innerWidth - 40 && box.top > 160 && box.bottom < height * 0.7;
    });
  });
  expect(index).toBeGreaterThanOrEqual(0);
  await page.locator('[data-booth-text] [data-word]').nth(index).click({ button: 'right' });
  await expect(page.getByRole('menu')).toBeVisible();
  // No item: the menu opened by the pointer keeps focus on its own popup until an arrow moves it onto a row.
  if (item !== undefined) await highlight(page, item, 3_000);
}

/** The one key stops the take: the DAW is not recording within 500 ms of it, and no item ran. */
async function expectThisKeyStoppedTheTake(page: Page, key: 'Enter' | 'NumpadEnter'): Promise<void> {
  await page.keyboard.press(key);
  // The stop reaches the DAW in tens of milliseconds (140 ms at the most in 84 runs on 8 workers; one run on a loaded machine took longer than 200 ms), and with no fix the take is not
  // stopped at all until a second Enter: half a second tells the two apart without a flake.
  await expect.poll(() => dawRecording(page), { timeout: 500 }).toBe(false);
  await expect(stop(page)).toHaveCount(0);
  await expect(page.getByText(/Rolling again/)).toHaveCount(0);
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
}

for (const lag of [20, 60]) {
  for (const key of ['Enter', 'NumpadEnter'] as const) {
    test(`${key} ${lag} ms into the right-click menu's exit during a take presses no item and stops the take, with motion on`, async ({ page }) => {
      await rightClickDuringTake(page, /^Roll again/);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(lag);
      await expect(leavingNow(page)).toHaveCount(1);
      await expectThisKeyStoppedTheTake(page, key);
      // The exit ends with focus on the page, not on a control the next Enter would press.
      await page.waitForTimeout(HELD_EXIT_MS + 400);
      expect(await onThePage(page)).toBe(true);
    });
  }
}

// The usual mouse path: a right click, no arrow (or a row hovered and the pointer moved off), Escape, the footswitch. Focus is on the menu's own popup, not on a row.
for (const how of ['no arrow key', 'the pointer moved off the menu'] as const) {
  for (const lag of [20, 60]) {
    for (const key of ['Enter', 'NumpadEnter'] as const) {
      test(`${key} ${lag} ms into the exit of the right-click menu with ${how} stops the take, with motion on`, async ({ page }) => {
        await rightClickDuringTake(page);
        if (how === 'the pointer moved off the menu') {
          await menuItem(page, /^Roll again/).hover();
          await page.mouse.move(4, 4);
        }
        // Focus is on the menu's own popup, not on a row: the case exercises the popup clause, not the item one.
        expect(await page.evaluate(() => document.activeElement?.getAttribute('role'))).toBe('menu');
        await page.keyboard.press('Escape');
        await page.waitForTimeout(lag);
        await expect(leavingNow(page)).toHaveCount(1);
        await expectThisKeyStoppedTheTake(page, key);
        // The exit ends with focus on the page, as it does after a key that went to an item.
        await page.waitForTimeout(HELD_EXIT_MS + 400);
        expect(await onThePage(page)).toBe(true);
      });
    }
  }
}

// The menu left by a pick: "Bookmark here" by Enter or by a click, and the footswitch's Enter 20 ms into the exit.
for (const how of ['Enter', 'click'] as const) {
  test(`Enter 20 ms after picking Bookmark here by ${how} stops the take, with motion on`, async ({ page }) => {
    await rightClickDuringTake(page, /^Bookmark here/);
    if (how === 'Enter') await page.keyboard.press('Enter');
    else await menuItem(page, /^Bookmark here/).click();
    await page.waitForTimeout(20);
    await expect(leavingNow(page)).toHaveCount(1);
    await expectThisKeyStoppedTheTake(page, 'Enter');
  });
}

test('Escape twice, then Enter 20 ms later, stops the take, with motion on', async ({ page }) => {
  await rightClickDuringTake(page, /^Roll again/);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(20);
  await expectThisKeyStoppedTheTake(page, 'Enter');
});

// The chapter list's items are menu items too: with a cold read running (the picker stays on) a footswitch Enter in its exit stops the cold read (a #4190 cell).
for (const lag of [20, 60]) {
  test(`Enter ${lag} ms into the exit of the chapter list during a cold read stops it, with motion on`, async ({ page }) => {
    await openBoothWithMotion(page);
    await recordOptions(page).click();
    await page.getByRole('radio', { name: 'Cold read', exact: true }).click();
    await page.keyboard.press('Escape');
    await expect(optionsDialog(page)).toHaveCount(0);
    await page.getByRole('button', { name: /^Cold read$/ }).click();
    await expect(coldRunning(page)).toBeVisible();
    await pastStartGuard(page);
    const before = await leaveChapterListFromKeyboard(page, lag);
    await page.keyboard.press('Enter');
    await expect(coldRunning(page)).toHaveCount(0, { timeout: 500 });
    // A pick of a chapter by that Enter would change the picker's label.
    await expect(chapterButton(page)).toHaveAttribute('aria-label', before ?? '');
  });
}

// No take running: an Enter in the menu's exit stays swallowed. It presses no item and starts no take (a double Enter on a pick must not record).
for (const lag of [20, 60]) {
  test(`a double Enter on a pick, the second ${lag} ms into the right-click menu's exit with no take running, starts no take, with motion on`, async ({
    page,
  }) => {
    await openBoothWithMotion(page);
    await showChapterTop(page);
    await page.locator('[data-word]').nth(40).click({ button: 'right' });
    await expect(page.getByRole('menu')).toBeVisible();
    await highlight(page, /^Bookmark here/);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(lag);
    await expect(leavingNow(page)).toHaveCount(1);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(HELD_EXIT_MS + 400);
    await expect(stop(page)).toHaveCount(0);
    expect(await dawRecording(page)).toBeFalsy();
    expect(await onThePage(page)).toBe(true);
  });
}

// No take running: the chord (Ctrl+Alt+Space) inside the exit starts the cold read, and the highlighted item must not run with it ("Read to here" would mark the chapter's stopping place).
for (const lag of [20, 60]) {
  test(`Ctrl+Alt+Space ${lag} ms into the right-click menu's exit presses no item and starts the cold read, with motion on`, async ({ page }) => {
    await openBoothWithMotion(page);
    await showChapterTop(page);
    await page.locator('[data-word]').nth(40).click({ button: 'right' });
    await expect(page.getByRole('menu')).toBeVisible();
    await highlight(page, /^Read to here/);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(lag);
    await expect(leavingNow(page)).toHaveCount(1);
    await page.keyboard.press('Control+Alt+Space');
    await expect(coldRunning(page)).toBeVisible();
    await page.waitForTimeout(HELD_EXIT_MS + 400);
    await expect(page.getByRole('button', { name: /^Read to here/ })).toHaveCount(0);
    expect(await dawRecording(page)).toBeFalsy();
    expect(await onThePage(page)).toBe(true);
  });
}

for (const lag of [20, 60]) {
  test(`Enter ${lag} ms into the exit of the Editing DAW tools menu opens no dialog, with motion on`, async ({ page }) => {
    await page.goto('/?mockChapterLink=confirmed');
    await page.waitForLoadState('networkidle');
    await goToPage(page, 'Editing');
    await page.addStyleTag({ content: `:root { --motion-fast: ${HELD_EXIT_MS}ms; --motion-base: ${HELD_EXIT_MS}ms; }` });
    const tools = page.getByRole('button', { name: 'DAW tools' });
    await tools.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('menu').getByText('Reading the REAPER project…')).toHaveCount(0);
    await highlight(page, /^Prepare chapter render/);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(lag);
    await expect(leavingNow(page)).toHaveCount(1);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(HELD_EXIT_MS + 200);
    await expect(page.getByRole('dialog', { name: /Prepare chapter render/ })).toHaveCount(0);
    await expect(tools).toBeFocused();
  });

  test(`Enter ${lag} ms into the exit of the Story Bible More actions menu opens no dialog, with motion on`, async ({ page }) => {
    await page.goto('/?mockVoiceFolders=1');
    await page.waitForLoadState('networkidle');
    await goToPage(page, 'Story Bible');
    await page.addStyleTag({ content: `:root { --motion-fast: ${HELD_EXIT_MS}ms; --motion-base: ${HELD_EXIT_MS}ms; }` });
    const more = page.getByRole('button', { name: 'More actions' });
    await more.focus();
    await page.keyboard.press('Enter');
    await highlight(page, /^Scan the manuscript/);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(lag);
    await expect(leavingNow(page)).toHaveCount(1);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(HELD_EXIT_MS + 200);
    await expect(page.getByRole('dialog', { name: /Scan the manuscript/ })).toHaveCount(0);
    await expect(more).toBeFocused();
  });
}
