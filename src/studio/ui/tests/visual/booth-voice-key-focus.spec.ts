// A lane (voice) key sits under the narrator's hand on the numpad, so the Enter or Space after it is Record's key (#3430): picking a lane records on it
// at once when no take runs, and never leaves focus on a control that swallows Enter (the voice button opens its list). Real key sequences, idle and recording.
import { expect, test, type Page } from '@playwright/test';
import { settlePage } from './helpers/settle';
import { boothChapterReady } from './helpers/viewTop';
import { goToPage } from './drivers/shared';
import { pastStartGuard } from './helpers/startGuard';

const voiceButton = (page: Page) => page.getByRole('button', { name: /^Voice:/ });
const stopButton = (page: Page) => page.getByRole('button', { name: 'Stop' });
const list = (page: Page) => page.getByRole('dialog', { name: 'Voices' });

async function openBooth(page: Page): Promise<void> {
  await page.goto('/?mockVoiceFolders=1');
  await settlePage(page);
  await goToPage(page, 'Booth');
  await boothChapterReady(page);
  await expect(page.getByRole('button', { name: /^Record$/ })).toBeEnabled();
}

/** Enter and Space are Record's only from the page itself: any focused control keeps them, so focus must be on <main> or the body. */
const onThePage = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement;
    return !el || el === document.body || el.tagName === 'MAIN';
  });
const enterSwallowed = async (page: Page) => !(await onThePage(page));
const recordingNow = async (page: Page) => (await stopButton(page).count()) > 0;

test.describe('a lane key then Enter', () => {
  test('idle: the lane records at once, and Enter stops it instead of opening the list', async ({ page }) => {
    await openBooth(page);
    await page.keyboard.press('Numpad1');
    await expect(stopButton(page)).toBeVisible();
    await expect(voiceButton(page)).toContainText('White Rabbit');
    expect(await enterSwallowed(page)).toBe(false);
    await pastStartGuard(page);
    await page.keyboard.press('Enter');
    await expect(stopButton(page)).toHaveCount(0);
    await expect(list(page)).toHaveCount(0);
  });

  test('recording: changing the lane keeps the take, and Enter pauses it instead of opening the list', async ({ page }) => {
    await openBooth(page);
    await page.keyboard.press('Space');
    await expect(stopButton(page)).toBeVisible();
    await page.keyboard.press('Numpad1');
    await expect(voiceButton(page)).toContainText('White Rabbit');
    await expect(stopButton(page)).toBeVisible();
    expect(await enterSwallowed(page)).toBe(false);
    await pastStartGuard(page);
    await page.keyboard.press('Enter');
    await expect(stopButton(page)).toHaveCount(0);
    await expect(list(page)).toHaveCount(0);
  });

  for (const press of ['Space', 'NumpadEnter']) {
    test(`idle: the lane records at once, and ${press} stops it`, async ({ page }) => {
      await openBooth(page);
      await page.keyboard.press('Numpad1');
      await expect(stopButton(page)).toBeVisible();
      await pastStartGuard(page);
      await page.keyboard.press(press);
      await expect(stopButton(page)).toHaveCount(0);
      await expect(list(page)).toHaveCount(0);
    });

    test(`recording: changing the lane keeps the take, and ${press} stops it`, async ({ page }) => {
      await openBooth(page);
      await page.keyboard.press('Space');
      await expect(stopButton(page)).toBeVisible();
      await page.keyboard.press('Numpad1');
      await expect(voiceButton(page)).toContainText('White Rabbit');
      await expect(stopButton(page)).toBeVisible();
      await pastStartGuard(page);
      await page.keyboard.press(press);
      await expect(stopButton(page)).toHaveCount(0);
      await expect(list(page)).toHaveCount(0);
    });
  }

  test('a key with no track asks who is in it, and focus is on the dialog, then back on the page when it closes', async ({ page }) => {
    await openBooth(page);
    await page.keyboard.press('Numpad7');
    const ask = page.getByRole('dialog', { name: 'Who is in Num 7?' });
    await expect(ask).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(ask).toHaveCount(0);
    await expect(list(page)).toHaveCount(0);
    await page.keyboard.press('Numpad1');
    await expect(stopButton(page)).toBeVisible();
  });

  test('a lane key with the voice button focused takes focus off it', async ({ page }) => {
    await openBooth(page);
    await voiceButton(page).focus();
    await page.keyboard.press('Numpad0');
    await expect(stopButton(page)).toBeVisible();
    expect(await enterSwallowed(page)).toBe(false);
    await page.keyboard.press('Numpad1');
    await page.keyboard.press('Enter');
    await expect(list(page)).toHaveCount(0);
  });

  test('a lane picked from the list does not record, and the Enter after it starts the take rather than reopening the list', async ({ page }) => {
    await openBooth(page);
    await voiceButton(page).click();
    await page.getByRole('option').nth(1).click();
    await expect(list(page)).toHaveCount(0);
    await expect(voiceButton(page)).toContainText('White Rabbit');
    await expect(stopButton(page)).toHaveCount(0);
    expect(await enterSwallowed(page)).toBe(false);
    await page.keyboard.press('Enter');
    await expect(stopButton(page)).toBeVisible();
    await expect(list(page)).toHaveCount(0);
  });

  test('Escape on the list still returns focus to the voice button', async ({ page }) => {
    await openBooth(page);
    await voiceButton(page).click();
    await expect(list(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(list(page)).toHaveCount(0);
    await expect(voiceButton(page)).toBeFocused();
  });
});

// The other Booth keys, each followed by Enter, idle and while recording: none may leave focus on a control that swallows Enter or open a menu, and
// Enter does Record's action (starts the take, or stops the one running) from whatever state the key left.
const OTHER_KEYS = [
  'NumpadAdd',
  'NumpadSubtract',
  'NumpadMultiply',
  'NumpadDivide',
  'ArrowDown',
  'ArrowUp',
  'ArrowRight',
  'ArrowLeft',
  'PageDown',
  'PageUp',
  'Equal',
  'Minus',
  'KeyR',
  'KeyV',
  'KeyN',
  'Backspace',
];
for (const key of OTHER_KEYS) {
  for (const state of ['idle', 'recording'] as const) {
    test(`${state}: ${key} then Enter lands on the page and does Record's action`, async ({ page }) => {
      await openBooth(page);
      if (state === 'recording') {
        await page.keyboard.press('Space');
        await expect(stopButton(page)).toBeVisible();
      }
      await page.keyboard.press(key);
      await page.waitForTimeout(300);
      expect(await enterSwallowed(page)).toBe(false);
      await pastStartGuard(page);
      const before = await recordingNow(page);
      await page.keyboard.press('Enter');
      await expect.poll(() => recordingNow(page)).toBe(!before);
      await expect(list(page)).toHaveCount(0);
    });
  }
}
