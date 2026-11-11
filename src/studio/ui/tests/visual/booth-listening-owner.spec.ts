// #3320: the stop side of a Record press has a limit, and a listening session is let go only by the press that owns it. The host's calls are held or
// refused through the mock's overrides (`__NARRATION_MOCK_OVERRIDES__`); the fake DAW is not real REAPER.
import { expect, test, type Page } from '@playwright/test';
import { settlePage } from './helpers/settle';
import { showChapterTop } from './helpers/viewTop';
import { goToPage } from './drivers/shared';

test.use({ viewport: { width: 1440, height: 900 } });
test.setTimeout(90_000);

type Calls = { stops: number; listeningStops: number; listeningStarts: number };
const record = (page: Page) => page.getByRole('button', { name: /^Record$/, includeHidden: true });
const calls = (page: Page) => page.evaluate(() => (window as unknown as { __calls: Calls }).__calls);

async function openBooth(page: Page, overrides: 'stopNeverAnswers' | 'listeningStartLate'): Promise<void> {
  await page.addInitScript((which) => {
    const w = window as unknown as { __calls: Calls; __NARRATION_MOCK_OVERRIDES__: Record<string, unknown> };
    w.__calls = { stops: 0, listeningStops: 0, listeningStarts: 0 };
    const map: Record<string, unknown> = {
      teleprompterStop: async () => void (w.__calls.listeningStops += 1),
    };
    if (which === 'stopNeverAnswers') {
      // The microphone is refused, so the take is dropped; the DAW's stop of it never answers.
      map.teleprompterStart = async () => {
        w.__calls.listeningStarts += 1;
        throw new Error('The microphone is in use by another application.');
      };
      map.readAloudRecordStop = () => {
        w.__calls.stops += 1;
        return new Promise(() => {});
      };
    } else {
      map.teleprompterStart = () => {
        w.__calls.listeningStarts += 1;
        return new Promise((resolve) => setTimeout(() => resolve({ status: 'started' }), 3000));
      };
    }
    w.__NARRATION_MOCK_OVERRIDES__ = map;
  }, overrides);
  await page.goto('/');
  await settlePage(page);
  await goToPage(page, 'Booth');
  await expect(record(page)).toBeEnabled();
  await showChapterTop(page);
}

test('the stop of a take whose listening failed ends at its limit with a sentence, and Record is free', async ({ page }) => {
  await openBooth(page, 'stopNeverAnswers');
  await page.keyboard.press('Space');
  await expect(page.getByText(/The recording could not be stopped: the stop did not answer in time/).first()).toBeVisible({ timeout: 16_000 });
  await expect(record(page)).toBeVisible();
  await expect(record(page)).not.toHaveAttribute('aria-busy', 'true');
  expect((await calls(page)).stops).toBe(1);
});

test('a press that is stopped while its listening is starting lets that session go, and the next press starts its own', async ({ page }) => {
  await openBooth(page, 'listeningStartLate');
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: /^Stop$/ })).toBeVisible({ timeout: 8000 });
  // Past the start guard (a Stop within a moment of the start is ignored as a double tap), before the listening answers at 3 s.
  await page.waitForTimeout(1500);
  await page.keyboard.press('Space');
  await expect.poll(async () => (await calls(page)).listeningStops, { timeout: 8000 }).toBeGreaterThanOrEqual(1);
  await expect(record(page)).toBeVisible({ timeout: 8000 });
  await page.keyboard.press('Space');
  await expect.poll(async () => (await calls(page)).listeningStarts, { timeout: 8000 }).toBe(2);
});
