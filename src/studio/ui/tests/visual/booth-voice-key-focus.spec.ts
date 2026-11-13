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

/** Where Enter would land: the voice button and a field swallow it, the page and the Record button do not. */
const enterSwallowed = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    return !!el && (el.id === 'bvoice' || el.tagName === 'INPUT' || el.getAttribute('role') === 'combobox');
  });

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

// The other Booth keys, each followed by Enter: none may leave focus on a control that swallows it or open a menu of its own.
const OTHER_KEYS = [
  'NumpadAdd',
  'NumpadSubtract',
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
];
for (const key of OTHER_KEYS) {
  test(`${key} then Enter does not land on a control that swallows Enter`, async ({ page }) => {
    await openBooth(page);
    await page.keyboard.press(key);
    await page.waitForTimeout(300);
    expect(await enterSwallowed(page)).toBe(false);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
    await expect(list(page)).toHaveCount(0);
  });
}
