// A start chosen with Start from here is looked up in the host before the take begins (#3284). The lookup is made slow through the mock's
// overrides (`__NARRATION_MOCK_OVERRIDES__`), so these hold for any slow lookup, not only a slow disk: Record shows the wait at once, presses join one
// lookup, and leaving the Booth while it is out starts no take (REAPER recording with the narrator on another page, and no Stop button there).
import { expect, test, type Page } from '@playwright/test';
import { settlePage } from './helpers/settle';
import { showChapterTop } from './helpers/viewTop';
import { goToPage } from './drivers/shared';

test.use({ viewport: { width: 1440, height: 900 } });

const LOOKUP_DELAY_MS = 2500;
const record = (page: Page) => page.getByRole('button', { name: /^Record$/, includeHidden: true });
const stop = (page: Page) => page.getByRole('button', { name: /^Stop$/ });
const dawRecording = (page: Page) => page.evaluate(() => window.__NARRATION_MOCK_DAW__?.state().recording);
const lookups = (page: Page) => page.evaluate(() => (window as unknown as { __lookups: number }).__lookups);

/** Opens the Booth with a host whose punch lookup answers after `delay` ms (or never, with `delay` 0), counting each call in `window.__lookups`. */
async function openWithSlowLookup(page: Page, delay: number): Promise<void> {
  await page.addInitScript((ms) => {
    const w = window as unknown as { __lookups: number; __NARRATION_MOCK_OVERRIDES__: unknown };
    w.__lookups = 0;
    w.__NARRATION_MOCK_OVERRIDES__ = {
      boothPunchTarget: () => {
        w.__lookups += 1;
        return ms === 0 ? new Promise(() => {}) : new Promise((resolve) => setTimeout(() => resolve({ outcome: 'found', start: 12, end: 20 }), ms));
      },
    };
  }, delay);
  await page.goto('/');
  await settlePage(page);
  await goToPage(page, 'Booth');
  await expect(record(page)).toBeEnabled();
  await showChapterTop(page);
}

/** Right-click a phrase and choose Start from here: the start is marked and, with no take running, the press begins one (after the lookup). */
async function startFromHere(page: Page): Promise<void> {
  await page.locator('[data-booth-text] [data-word]').nth(40).click({ button: 'right' });
  await page
    .getByRole('menuitem', { name: /Start from here/ })
    .first()
    .click();
}

test('a slow lookup shows Record busy within 100 ms of the press, and five presses make one host call', async ({ page }) => {
  await openWithSlowLookup(page, LOOKUP_DELAY_MS);
  await startFromHere(page);
  await expect(record(page)).toHaveAttribute('aria-busy', 'true', { timeout: 100 });
  const before = await lookups(page);
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press('Space');
    await page.waitForTimeout(100);
  }
  // Presses during the wait join it: no lookup beyond the one Start from here made.
  expect(await lookups(page)).toBe(before);
  expect(await dawRecording(page)).toBe(false);
  await expect(stop(page)).toBeVisible({ timeout: LOOKUP_DELAY_MS + 2000 });
  await expect(record(page)).toHaveCount(0);
  expect(await dawRecording(page)).toBe(true);
});

test('leaving the Booth while the lookup is out starts no take', async ({ page }) => {
  await openWithSlowLookup(page, LOOKUP_DELAY_MS);
  await startFromHere(page);
  await expect(record(page)).toHaveAttribute('aria-busy', 'true');
  await page.waitForTimeout(500);
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-booth-text]')).toHaveCount(0);
  // Past the answer: the host would have answered by now, and nothing may have begun.
  await page.waitForTimeout(LOOKUP_DELAY_MS + 800);
  expect(await dawRecording(page)).toBe(false);
  await expect(page.getByText(/Recording over/)).toHaveCount(0);
});

test('a lookup that never answers ends with a sentence and a Record that works again', async ({ page }) => {
  test.setTimeout(30_000);
  await openWithSlowLookup(page, 0);
  await startFromHere(page);
  await expect(record(page)).toHaveAttribute('aria-busy', 'true', { timeout: 100 });
  await expect(page.getByText(/did not come back in time/).first()).toBeVisible({ timeout: 12_000 });
  await expect(record(page)).not.toHaveAttribute('aria-busy', 'true');
  expect(await dawRecording(page)).toBe(false);
});
