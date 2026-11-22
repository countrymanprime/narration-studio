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
    await page.keyboard.press('Numpad1');
    await expect(page.getByText('A cold read needs no voice.', { exact: true })).toBeVisible();
    await expect(page.getByText(/Choose Record to pick one/)).toHaveCount(0);
  });

  // #3931, #3906: a popover stays in the page until its exit has run, and the exit waits for a frame. On a loaded runner that frame comes late, and a voice
  // key pressed in the meantime reached a router that took the closing popover for a layer that still owns the keys. Frames are held back here the way a loaded
  // runner holds them back, so the window is always open.
  test('a voice key pressed while the Record options popover is still closing is not lost', async ({ page }) => {
    await page.addInitScript(() => {
      const raf = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = (callback) => raf((time) => void window.setTimeout(() => callback(time), 400));
    });
    await openBooth(page);
    await page.getByRole('button', { name: 'Record options' }).click();
    await page.getByRole('radio', { name: 'Cold read' }).click();
    await page.keyboard.press('Escape');
    await page.keyboard.press('Numpad1');
    await expect(page.getByText('A cold read needs no voice. Choose Record to pick one.')).toBeVisible({ timeout: 2000 });
  });

  // The key that opens the voice list is lost the same way, and a list opened in that window is still the popup's: Escape closes it.
  test('the voice list key pressed while the Record options popover is still closing opens the list, and Escape closes it', async ({ page }) => {
    await page.addInitScript(() => {
      const raf = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = (callback) => raf((time) => void window.setTimeout(() => callback(time), 400));
    });
    await openBooth(page);
    await page.getByRole('button', { name: 'Record options' }).click();
    await page.getByRole('radio', { name: 'Record', exact: true }).click();
    await page.keyboard.press('Escape');
    await page.keyboard.press('NumpadDecimal');
    await expect(list(page)).toBeVisible({ timeout: 2000 });
    await page.keyboard.press('Escape');
    await expect(list(page)).toHaveCount(0, { timeout: 2000 });
  });

  // The pedal's Space with a panel open closes the panel and toggles the take once. Pressed right after Escape, while the panel is still leaving, it toggled twice:
  // the take stopped and a new one started (the walkthrough of #3976). Frames are held back so the panel is always still leaving.
  for (const frames of ['held back', 'on time']) {
    test(`Space right after Escape on Record options, frames ${frames}, stops a running take once and starts no other`, async ({ page }) => {
      if (frames === 'held back') {
        await page.addInitScript(() => {
          const raf = window.requestAnimationFrame.bind(window);
          window.requestAnimationFrame = (callback) => raf((time) => void window.setTimeout(() => callback(time), 400));
        });
      }
      await openBooth(page);
      await page.getByRole('button', { name: /^Record$/ }).click();
      await expect(stopButton(page)).toBeVisible();
      await pastStartGuard(page);
      await page.getByRole('button', { name: 'Record options' }).click();
      await expect(page.getByRole('dialog', { name: 'Record options' })).toBeVisible();
      await page.waitForTimeout(800);
      await page.keyboard.press('Escape');
      await page.keyboard.press('Space');
      await expect(page.getByRole('button', { name: /^Record$/ })).toBeVisible();
      // A second toggle would start a take again about half a second later.
      await page.waitForTimeout(1500);
      await expect(stopButton(page)).toHaveCount(0);
      expect(await page.evaluate(() => window.__NARRATION_MOCK_DAW__?.state().recording)).toBe(false);
    });
  }

  // The qa-breaker's breaks of #3976 (B1 to B3). A popup opened while another is leaving keeps focus and closes on Escape; the pedal's Space just after Escape starts
  // the take. Frames are held back so the first popup is still leaving when the next thing happens.
  const holdFrames = async (page: Page) =>
    page.addInitScript(() => {
      const raf = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = (callback) => raf((time) => void window.setTimeout(() => callback(time), 400));
    });
  const chapterButton = (page: Page) => page.locator('[aria-label^="Chapter:"]').first();

  for (const [first, second] of [
    ['Text settings', 'Record options'],
    ['Record options', 'Text settings'],
  ]) {
    test(`${second} clicked while ${first} is leaving stays open, keeps focus and closes on one Escape (frames held back)`, async ({ page }) => {
      await holdFrames(page);
      await openBooth(page);
      await page.getByRole('button', { name: first }).click();
      await expect(page.getByRole('dialog', { name: first })).toBeVisible();
      // The click on the next button closes the first popup (a press outside it) and opens the second in the same breath.
      await page.getByRole('button', { name: second }).click();
      const popup = page.getByRole('dialog', { name: second });
      await expect(popup).toBeVisible();
      await page.waitForTimeout(1500);
      await expect(popup).toBeVisible();
      expect(await popup.evaluate((el) => el.contains(document.activeElement))).toBe(true);
      await page.keyboard.press('Escape');
      await expect(popup).toHaveCount(0);
      expect(new URL(page.url()).pathname).toBe('/booth');
    });
  }

  test('the chapter menu clicked while Record options is leaving keeps focus and closes on one Escape', async ({ page }) => {
    await holdFrames(page);
    await openBooth(page);
    await page.getByRole('button', { name: 'Record options' }).click();
    await expect(page.getByRole('dialog', { name: 'Record options' })).toBeVisible();
    await chapterButton(page).click();
    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();
    await page.waitForTimeout(1500);
    await expect(menu).toBeVisible();
    expect(await menu.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    expect(new URL(page.url()).pathname).toBe('/booth');
  });

  for (const panel of ['Text settings', 'Voices']) {
    test(`the pedal's Space right after Escape on ${panel} starts one take`, async ({ page }) => {
      await holdFrames(page);
      await openBooth(page);
      if (panel === 'Voices') await page.keyboard.press('NumpadDecimal');
      else await page.getByRole('button', { name: panel }).click();
      await expect(page.getByRole('dialog', { name: panel })).toBeVisible();
      await page.keyboard.press('Escape');
      await page.keyboard.press('Space');
      await expect(stopButton(page)).toBeVisible();
      await page.waitForTimeout(1500);
      await expect(stopButton(page)).toBeVisible();
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

  // #3906: with motion on (a narrator's default; `settlePage` emulates reduced motion, so the page is switched back) the Record options popup lingers while it animates out,
  // and the voice-list key pressed from 20 ms after Escape must still reach the Booth. Measured on main: with motion on, 0 of 24 lost at 60 and 140 ms and 1 of 13 at 0 ms
  // (under load); with reduced motion 13 of 45 lost at 0 ms and 0 of 75 from 10 ms on. Only the same millisecond loses it.
  test('with motion on, the voice-list key pressed 20, 60 and 140 ms after Escape closes Record options opens the list (#3906)', async ({ page }) => {
    await openBooth(page);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    for (const delay of [20, 60, 140]) {
      for (let round = 1; round <= 4; round++) {
        await page.getByRole('button', { name: 'Record options' }).click();
        await page.getByRole('radio', { name: 'Record', exact: true }).click();
        await page.keyboard.press('Escape');
        if (delay) await page.waitForTimeout(delay);
        await page.keyboard.press('NumpadDecimal');
        await expect(list(page), `${delay} ms, round ${round}`).toBeVisible({ timeout: 1500 });
        await page.keyboard.press('Escape');
        await page.waitForTimeout(700);
        await expect(list(page)).toHaveCount(0);
      }
    }
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
