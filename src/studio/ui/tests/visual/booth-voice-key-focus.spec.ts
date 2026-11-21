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
/**
 * Record options has to be gone before the next key: Escape returns while the popup is still in the page with focus on its own control, and a key pressed in
 * that window (the same millisecond, no person's hand; measured on #3906: lost 6 of 15 and 7 of 30 at 0 ms, 0 of 75 from 10 ms on) is taken for the closing popup's.
 */
const popoverGone = (page: Page) => expect(page.getByRole('radio', { name: 'Cold read' })).toBeHidden();
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

  test('a lane key with the skip link focused takes focus off it, so Enter stops the take instead of following the link', async ({ page }) => {
    await openBooth(page);
    const skip = page.getByRole('link', { name: 'Skip to content' });
    await skip.focus();
    await expect(skip).toBeFocused();
    await page.keyboard.press('Numpad1');
    await expect(stopButton(page)).toBeVisible();
    expect(await enterSwallowed(page)).toBe(false);
    await pastStartGuard(page);
    await page.keyboard.press('Enter');
    await expect(stopButton(page)).toHaveCount(0);
  });

  for (const via of ['Record options', 'Record options after Escape', 'Next chapter', 'Previous chapter']) {
    test(`a lane key with ${via} focused takes focus off it, so Enter stops the take`, async ({ page }) => {
      await openBooth(page);
      const target = page.getByRole('button', { name: via.startsWith('Record options') ? 'Record options' : new RegExp(`^${via}`) }).first();
      if (via.endsWith('after Escape')) {
        await target.click();
        await page.keyboard.press('Escape');
      } else await target.focus();
      await expect(target).toBeFocused();
      await page.keyboard.press('Numpad1');
      await expect(stopButton(page)).toBeVisible();
      expect(await enterSwallowed(page)).toBe(false);
      await pastStartGuard(page);
      await page.keyboard.press('Enter');
      await expect(stopButton(page)).toHaveCount(0);
      await expect(page.getByRole('dialog')).toHaveCount(0);
    });
  }

  test('in cold read mode a lane key chooses nothing, starts nothing and says why (no voice for a cold read, #3430)', async ({ page }) => {
    await openBooth(page);
    await page.getByRole('button', { name: 'Record options' }).click();
    await page.getByRole('radio', { name: 'Cold read' }).click();
    await page.keyboard.press('Escape');
    await popoverGone(page);
    const before = await voiceButton(page).innerText();
    await page.keyboard.press('Numpad1');
    await expect(page.getByText('A cold read needs no voice. Choose Record to pick one.')).toBeVisible();
    expect(await voiceButton(page).innerText()).toBe(before);
    await page.waitForTimeout(500);
    await expect(stopButton(page)).toHaveCount(0);
  });

  test('in cold read mode a click on the voice control opens no list and says why, and the list opens again in Record mode', async ({ page }) => {
    await openBooth(page);
    await page.getByRole('button', { name: 'Record options' }).click();
    await page.getByRole('radio', { name: 'Cold read' }).click();
    await page.keyboard.press('Escape');
    await popoverGone(page);
    await voiceButton(page).click();
    await expect(page.getByText('A cold read needs no voice. Choose Record to pick one.')).toBeVisible();
    await expect(list(page)).toHaveCount(0);
    await expect(page.getByRole('dialog', { name: /^Who records / })).toHaveCount(0);
    await page.getByRole('button', { name: 'Record options' }).click();
    await page.getByRole('radio', { name: 'Record', exact: true }).click();
    await page.keyboard.press('Escape');
    await voiceButton(page).click();
    await expect(list(page)).toBeVisible();
  });

  test('in a chapter with no voice folders a cold read voice key says only that a cold read needs no voice', async ({ page }) => {
    await page.goto('/');
    await settlePage(page);
    await goToPage(page, 'Booth');
    await boothChapterReady(page);
    await page.getByRole('button', { name: 'Record options' }).click();
    await page.getByRole('radio', { name: 'Cold read' }).click();
    await page.keyboard.press('Escape');
    await popoverGone(page);
    await page.keyboard.press('Numpad1');
    await expect(page.getByText('A cold read needs no voice.', { exact: true })).toBeVisible();
    await expect(page.getByText(/Choose Record to pick one/)).toHaveCount(0);
  });

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

  test('a character with no track picked from the list does not hand focus to the page behind the dialog it opens', async ({ page }) => {
    await openBooth(page);
    await voiceButton(page).click();
    await page.getByRole('option').last().click();
    await expect(page.getByRole('dialog', { name: /^Who records / })).toBeVisible();
    await page.waitForTimeout(400);
    // The pick opens a dialog; the list's focus hand-off to the page is for a voice pick only and must not run behind it.
    expect(await page.evaluate(() => document.activeElement?.tagName)).not.toMatch(/^(MAIN|BODY)$/);
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
