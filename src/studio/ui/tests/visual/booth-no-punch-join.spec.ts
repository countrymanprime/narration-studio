// A DAW that cannot punch in (`?mockEngine=builtin`: the roll plan is refused) treats Start from here's lookup as one press, as a DAW that can punch
// does (#3329): Space while the lookup is out joins it instead of recording from the end at once, a lookup that never answers ends once at the limit
// with one host call and one sentence, and a phrase nobody recorded asks the host once. Mock app and fake recorder, not a real DAW.
import { expect, test, type Page } from '@playwright/test';
import { settlePage } from './helpers/settle';
import { showChapterTop } from './helpers/viewTop';
import { chooseMicrophone, goToPage } from './drivers/shared';

test.use({ viewport: { width: 1440, height: 900 } });

const HELD_MS = 3000;
const FROM_THE_END = /The take starts from the end of what is already there, not from ¶ 1/;
const record = (page: Page) => page.getByRole('button', { name: /^Record$/, includeHidden: true });
const stop = (page: Page) => page.getByRole('button', { name: /^Stop$/ });
const lookups = (page: Page) => page.evaluate(() => (window as unknown as { __lookups: number }).__lookups);

/** The Booth with the built-in recorder and a host whose punch lookup answers `answer` after `ms` ms (never, with 0), counting each call. */
async function open(page: Page, ms: number, answer: Record<string, unknown>): Promise<void> {
  await page.addInitScript(
    ([delay, reply]) => {
      const w = window as unknown as { __lookups: number; __NARRATION_MOCK_OVERRIDES__: Record<string, unknown> };
      w.__lookups = 0;
      w.__NARRATION_MOCK_OVERRIDES__ = {
        boothPunchTarget: () => {
          w.__lookups += 1;
          return delay === 0 ? new Promise(() => {}) : new Promise((resolve) => setTimeout(() => resolve(reply), delay));
        },
      };
    },
    [ms, answer] as const,
  );
  await page.goto('/?mockEngine=builtin');
  await settlePage(page);
  await goToPage(page, 'Booth');
  await expect(record(page)).toBeEnabled();
  await chooseMicrophone(page);
  await showChapterTop(page);
}

async function startFromHere(page: Page): Promise<void> {
  await page.locator('[data-booth-text] [data-word]').nth(5).click({ button: 'right' });
  await page
    .getByRole('menuitem', { name: /Start from here/ })
    .first()
    .click();
}

test('Space during Start from here lookup joins it: no take at once, one host call, then one take from the end and one sentence', async ({ page }) => {
  test.setTimeout(60_000);
  await open(page, HELD_MS, { outcome: 'found', start: 12, end: 20 });
  await startFromHere(page);
  await expect(record(page)).toHaveAttribute('aria-busy', 'true', { timeout: 500 });
  await page.waitForTimeout(600);
  await page.keyboard.press('Space');
  // Not recording while the lookup is out (on main the take began at once, from the end, and the answer was dropped unsaid).
  await page.waitForTimeout(800);
  await expect(stop(page)).toHaveCount(0);
  // The answer: the sentence says where the take starts, and it starts, with no second Space.
  await expect(stop(page)).toBeVisible({ timeout: HELD_MS + 3000 });
  await expect(page.getByText(FROM_THE_END)).toHaveCount(1);
  expect(await lookups(page)).toBe(1);
});

test('Start from here alone on a recorded phrase says the next take starts from the end and records nothing', async ({ page }) => {
  test.setTimeout(60_000);
  await open(page, 300, { outcome: 'found', start: 12, end: 20 });
  await startFromHere(page);
  await expect(page.getByText(/The next take starts from the end of what is already there, not from ¶ 1/)).toBeVisible({ timeout: 6000 });
  await expect(record(page)).not.toHaveAttribute('aria-busy', 'true');
  await expect(stop(page)).toHaveCount(0);
  expect(await lookups(page)).toBe(1);
});

test('a lookup that never answers ends once at the limit: one host call, one sentence, Record free', async ({ page }) => {
  test.setTimeout(60_000);
  await open(page, 0, {});
  await startFromHere(page);
  await expect(record(page)).toHaveAttribute('aria-busy', 'true');
  // The limit is 8 s: on main a second wait followed (about 16 s in all) and the host was asked twice.
  await expect(page.getByText(/did not come back in time/).first()).toBeVisible({ timeout: 10_000 });
  await expect(record(page)).not.toHaveAttribute('aria-busy', 'true', { timeout: 1000 });
  await page.waitForTimeout(1500);
  await expect(stop(page)).toHaveCount(0);
  expect(await lookups(page)).toBe(1);
  await page.keyboard.press('Space');
  await expect(stop(page)).toBeVisible({ timeout: 5000 });
});

test('a phrase nobody recorded asks the host once, then the take starts from the end', async ({ page }) => {
  test.setTimeout(60_000);
  await open(page, 300, { outcome: 'never_recorded' });
  await startFromHere(page);
  await expect(stop(page)).toBeVisible({ timeout: 6000 });
  expect(await lookups(page)).toBe(1);
});
