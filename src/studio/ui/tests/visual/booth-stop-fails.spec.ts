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
async function openBooth(page: Page, refusals: number, lateAfter = 0): Promise<void> {
  await page.addInitScript(
    ([count, late]) => {
      const w = window as unknown as { __stops: number; __NARRATION_MOCK_OVERRIDES__: Record<string, unknown> };
      w.__stops = 0;
      w.__NARRATION_MOCK_OVERRIDES__ = {
        teleprompterStop: async () => {
          w.__stops += 1;
          // A refusal that takes `late` ms to come once the take's own stops are over: the leave's stop, so the narrator can be back before its retry.
          if (late && w.__stops > 2 && w.__stops <= count) await new Promise((resolve) => setTimeout(resolve, late));
          if (w.__stops <= count) throw new Error('the host is busy');
        },
      };
    },
    [refusals, lateAfter] as const,
  );
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

test('a Retry refused twice more says the sentence again', async ({ page }) => {
  await openBooth(page, 4);
  await recordThenStop(page);
  await expect(page.getByText(SENTENCE)).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect.poll(() => stops(page), { timeout: 8000 }).toBe(4);
  await expect(page.getByText(SENTENCE)).toBeVisible({ timeout: 10_000 });
});

test('the sentence goes when the Booth is left, and is not there when it is entered again', async ({ page }) => {
  await openBooth(page, 2);
  await recordThenStop(page);
  await expect(page.getByText(SENTENCE)).toBeVisible({ timeout: 10_000 });
  await page.keyboard.press('Escape');
  const leave = page
    .getByRole('alertdialog')
    .getByRole('button', { name: /^(Stop and leave|Leave)/ })
    .first();
  if (await leave.isVisible({ timeout: 1500 }).catch(() => false)) await leave.click();
  await page.getByRole('heading', { level: 1, name: 'Script' }).waitFor({ timeout: 8000 });
  await expect(page.getByText(SENTENCE)).toHaveCount(0);
  await goToPage(page, 'Booth');
  await page.waitForTimeout(1000);
  await expect(page.getByText(SENTENCE)).toHaveCount(0);
});

/** Escape, then "Stop and leave" (the question about the running listening), to Script. */
async function stopAndLeave(page: Page): Promise<void> {
  await page.keyboard.press('Escape');
  const leave = page
    .getByRole('alertdialog')
    .getByRole('button', { name: /^(Stop and leave|Leave)/ })
    .first();
  if (await leave.isVisible({ timeout: 1500 }).catch(() => false)) await leave.click();
  await page.getByRole('heading', { level: 1, name: 'Script' }).waitFor({ timeout: 8000 });
}
const STILL_OPEN = /Quit and reopen the app to be sure/;

test('leaving with "Stop and leave" while every stop is refused says on the next page that the microphone may be open', async ({ page }) => {
  await openBooth(page, 99);
  await recordThenStop(page);
  await expect(page.getByText(SENTENCE)).toBeVisible({ timeout: 10_000 });
  await stopAndLeave(page);
  await expect(page.getByText(STILL_OPEN)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('button', { name: 'Retry' })).toHaveCount(0);
});

test('leaving with "Stop and leave" when the stop is taken says nothing', async ({ page }) => {
  await openBooth(page, 2);
  await recordThenStop(page);
  await expect(page.getByText(SENTENCE)).toBeVisible({ timeout: 10_000 });
  await stopAndLeave(page);
  await page.waitForTimeout(3000);
  await expect(page.getByText(STILL_OPEN)).toHaveCount(0);
});

test('Retry says it is trying and then that listening stopped, and Record has focus again', async ({ page }) => {
  await openBooth(page, 2);
  await recordThenStop(page);
  await expect(page.getByText(SENTENCE)).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByText('Listening stopped.')).toBeVisible({ timeout: 8000 });
  await expect(record(page)).toBeFocused({ timeout: 3000 });
});

/** A take is running; Escape asks "Stop recording?"; "Stop and leave" ends the take and leaves. */
async function stopTakeAndLeave(page: Page): Promise<void> {
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: /^Stop$/ })).toBeVisible({ timeout: 8000 });
  await page.waitForTimeout(1500);
  await page.keyboard.press('Escape');
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: /^Stop and leave/ })
    .click();
  await page.getByRole('heading', { level: 1, name: 'Script' }).waitFor({ timeout: 10_000 });
}

test('leaving mid-take with "Stop and leave" while every listening stop is refused says it on the next page', async ({ page }) => {
  await openBooth(page, 99);
  await stopTakeAndLeave(page);
  await expect(page.getByText(STILL_OPEN)).toBeVisible({ timeout: 15_000 });
});

test('leaving mid-take with "Stop and leave" when the listening stop is taken says nothing', async ({ page }) => {
  await openBooth(page, 0);
  await stopTakeAndLeave(page);
  await page.waitForTimeout(4000);
  await expect(page.getByText(STILL_OPEN)).toHaveCount(0);
});

async function openCompanionWithRefusedStops(page: Page, refusals: number): Promise<void> {
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
  await page.keyboard.press('Control+KeyK');
  await page.getByRole('combobox', { name: 'Jump menu' }).fill('Open Companion');
  await page
    .getByRole('option', { name: /^Open Companion/ })
    .first()
    .click();
  await page.getByRole('heading', { level: 1, name: 'Companion' }).waitFor();
  await page.getByRole('button', { name: 'Play' }).click();
  await page.waitForTimeout(2500);
  await page.getByRole('button', { name: 'Stop reading' }).click();
}

test('in the Companion the stop-failed message can be used: it is not inert, Retry is clicked and reached with Shift+Tab', async ({ page }) => {
  await openCompanionWithRefusedStops(page, 2);
  await expect(page.getByText(SENTENCE)).toBeVisible({ timeout: 12_000 });
  // Found by its text, not its role: an inert or aria-hidden Retry has no role in the page, and this must fail at once, not by timeout.
  const retry = page.locator('button', { hasText: /^Retry$/ });
  await expect(retry).toHaveCount(1);
  const inert = await retry.evaluate((el) => !!el.closest('[inert], [aria-hidden="true"]'));
  expect(inert, 'the Companion made the toast with Retry inert or hidden').toBe(false);
  // The toast follows the Companion in the page, so Shift+Tab from its start reaches the toast's buttons first.
  const reached = new Set<string>();
  for (let i = 0; i < 6; i += 1) {
    await page.keyboard.press('Shift+Tab');
    const label = await page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.textContent ?? '');
    reached.add(label.trim());
  }
  expect(reached.has('Retry')).toBe(true);
  expect(reached.has('Dismiss message')).toBe(true);
  await retry.click();
  await expect.poll(() => stops(page), { timeout: 8000 }).toBe(3);
  await expect(page.getByText('Listening stopped.')).toBeVisible({ timeout: 8000 });
});

test('in the Companion, pressing Stop reading again when the host takes it clears the message', async ({ page }) => {
  await openCompanionWithRefusedStops(page, 2);
  await expect(page.getByText(SENTENCE)).toBeVisible({ timeout: 12_000 });
  await page.getByRole('button', { name: 'Stop reading' }).click();
  await expect(page.getByText(SENTENCE)).toHaveCount(0, { timeout: 8000 });
});

test('a leave retry is not sent once the narrator is back and a take joined the running session within the 1.5 s', async ({ page }) => {
  // Stops 1 and 2 (the take's end) and 3 (the leave) are refused; the leave retry, stop 4, would be taken and end the session under the new take.
  await openBooth(page, 3, 4000);
  await recordThenStop(page);
  await expect(page.getByText(SENTENCE)).toBeVisible({ timeout: 10_000 });
  await stopAndLeave(page);
  await goToPage(page, 'Booth');
  await expect(record(page)).toBeEnabled();
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: /^Stop$/ })).toBeVisible({ timeout: 8000 });
  await page.waitForTimeout(4000);
  expect(await stops(page)).toBe(3);
});

test('after a "Stop and leave" the DAW refused and "Keep recording", ending the take and leaving still says the microphone may be open', async ({ page }) => {
  await openBooth(page, 99);
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: /^Stop$/ })).toBeVisible({ timeout: 8000 });
  await page.waitForTimeout(1500);
  await page.evaluate(() =>
    (window as unknown as { __NARRATION_MOCK_DAW__?: { refuseNextRecord: (m: string, w: string) => void } }).__NARRATION_MOCK_DAW__?.refuseNextRecord(
      'Disk full.',
      'stop',
    ),
  );
  await page.keyboard.press('Escape');
  await page.getByRole('alertdialog').getByRole('button', { name: /^Stop/ }).click();
  const refused = page.getByRole('alertdialog', { name: /^Could not stop the take$/ });
  await expect(refused).toBeVisible({ timeout: 12_000 });
  await refused.getByRole('button', { name: /Keep recording|Cancel/ }).click();
  // The narrator ends the take themselves; the listening stops are refused twice and the sentence shows.
  await page.keyboard.press('Space');
  await expect(page.getByText(SENTENCE)).toBeVisible({ timeout: 12_000 });
  // Leaves by the jump menu (a plain move, no question), as the narrator who stayed and carried on might.
  await page.keyboard.press('Control+KeyK');
  await page.getByRole('combobox', { name: 'Jump menu' }).fill('Script');
  await page
    .getByRole('option', { name: /Script/ })
    .first()
    .click();
  await page.getByRole('heading', { level: 1, name: 'Script' }).waitFor({ timeout: 8000 });
  await expect(page.getByText(STILL_OPEN)).toBeVisible({ timeout: 15_000 });
});

test('Ctrl+Alt+C to the Companion with the sentence up tries the stop once more, and says it only if that is refused too', async ({ page }) => {
  await openBooth(page, 2);
  await recordThenStop(page);
  await expect(page.getByText(SENTENCE)).toBeVisible({ timeout: 10_000 });
  await page.keyboard.press('Control+Alt+KeyC');
  await page.getByRole('heading', { level: 1, name: 'Companion' }).waitFor({ timeout: 8000 });
  await expect.poll(() => stops(page), { timeout: 8000 }).toBe(3);
  await page.waitForTimeout(3000);
  await expect(page.getByText(STILL_OPEN)).toHaveCount(0);
});
