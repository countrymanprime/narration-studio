// #3409: a listening stop the host refuses is sent once more, and said once (with Retry) if it is refused again. The host's stop is refused through the
// mock's overrides (`__NARRATION_MOCK_OVERRIDES__`); the fake DAW is not real REAPER.
import { expect, test, type Page } from '@playwright/test';
import { settlePage } from './helpers/settle';
import { showChapterTop } from './helpers/viewTop';
import { goToPage } from './drivers/shared';

test.use({ viewport: { width: 1440, height: 900 } });
test.setTimeout(60_000);

const record = (page: Page) => page.getByRole('button', { name: /^Record$/, includeHidden: true });
const stops = (page: Page) => page.evaluate(() => (window as unknown as { __stops: number }).__stops);
const SENTENCE = /The Booth could not stop listening, so your microphone may still be open/;

/** `refusals` stops are refused; the rest are taken (the mock's own session ends then). */
async function openBooth(page: Page, refusals: number): Promise<void> {
  await page.addInitScript((count) => {
    const w = window as unknown as { __stops: number; __NARRATION_MOCK_OVERRIDES__: Record<string, unknown> };
    w.__stops = 0;
    w.__NARRATION_MOCK_OVERRIDES__ = {
      teleprompterStop: async () => {
        w.__stops += 1;
        if (w.__stops <= count) throw new Error('the host is busy');
      },
    };
  }, refusals);
  await page.goto('/');
  await settlePage(page);
  await goToPage(page, 'Booth');
  await expect(record(page)).toBeEnabled();
  await showChapterTop(page);
}

async function recordThenStop(page: Page): Promise<void> {
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: /^Stop$/ })).toBeVisible({ timeout: 8000 });
  // Past the start guard: a Stop within a moment of the start is ignored as a double tap.
  await page.waitForTimeout(1500);
  await page.keyboard.press('Space');
  await expect(record(page)).toBeVisible({ timeout: 8000 });
}

test('a listening stop refused once is sent again and nothing is said', async ({ page }) => {
  await openBooth(page, 1);
  await recordThenStop(page);
  await expect.poll(() => stops(page), { timeout: 8000 }).toBe(2);
  await page.waitForTimeout(1000);
  await expect(page.getByText(SENTENCE)).toHaveCount(0);
});

test('a listening stop refused twice is said once, with Retry, and Retry stops it', async ({ page }) => {
  await openBooth(page, 2);
  await recordThenStop(page);
  await expect(page.getByText(SENTENCE)).toBeVisible({ timeout: 10_000 });
  expect(await stops(page)).toBe(2);
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect.poll(() => stops(page), { timeout: 8000 }).toBe(3);
  await expect(page.getByText(SENTENCE)).toHaveCount(0, { timeout: 8000 });
});
