// While a press is under way (lookup, checks, record start) the reading stays where the press chose, so the take records where the text shows
// (#3338). Resume at, the arrow keys and the phrase menu are ignored with one sentence; the lookup is held through `__NARRATION_MOCK_OVERRIDES__`
// as in booth-start-lookup.spec.ts, and the controls work again once the take has begun.
import { expect, test, type Page } from '@playwright/test';
import { settlePage } from './helpers/settle';
import { showChapterTop } from './helpers/viewTop';
import { goToPage } from './drivers/shared';

test.use({ viewport: { width: 1440, height: 900 } });

const HELD_MS = 2500;
const BUSY_MOVE = 'A take is already starting, so the reading stays where it is.';
const record = (page: Page) => page.getByRole('button', { name: /^Record$/, includeHidden: true });
const stop = (page: Page) => page.getByRole('button', { name: /^Stop$/ });
const reading = (page: Page) => page.locator('[data-booth-text] [data-state="cur"]').first().getAttribute('data-unit');
const toasts = (page: Page) => page.getByText(BUSY_MOVE);

async function openWithHeldLookup(page: Page): Promise<void> {
  await page.addInitScript((ms) => {
    const w = window as unknown as { __NARRATION_MOCK_OVERRIDES__: Record<string, unknown> };
    w.__NARRATION_MOCK_OVERRIDES__ = {
      boothPunchTarget: () => new Promise((resolve) => setTimeout(() => resolve({ outcome: 'found', start: 12, end: 20 }), ms)),
    };
  }, HELD_MS);
  await page.goto('/');
  await settlePage(page);
  await goToPage(page, 'Booth');
  await expect(record(page)).toBeEnabled();
  await showChapterTop(page);
}

async function startFromHere(page: Page): Promise<void> {
  await page.locator('[data-booth-text] [data-word]').nth(5).click({ button: 'right' });
  await page
    .getByRole('menuitem', { name: /Start from here/ })
    .first()
    .click();
}

test('Resume at during the held lookup is ignored: one sentence, and the take records where the text shows', async ({ page }) => {
  await openWithHeldLookup(page);
  await startFromHere(page);
  await expect(record(page)).toHaveAttribute('aria-busy', 'true', { timeout: 500 });
  const chosen = await reading(page);
  const chip = page.getByRole('button', { name: /^Resume at ¶/ });
  await expect(chip).toBeVisible();
  await chip.click();
  await chip.click();
  await expect(toasts(page)).toHaveCount(1);
  expect(await reading(page)).toBe(chosen);
  await expect(stop(page)).toBeVisible({ timeout: HELD_MS + 2000 });
  expect(await reading(page)).toBe(chosen);
  await expect(page.getByText(/Recording over ¶ 1\b/).first()).toBeVisible();
  await expect(page.getByText('Next roll starts from ¶ 1')).toBeVisible();
});

test('ArrowDown and the phrase menu during the held lookup are ignored, and work again once the take has begun', async ({ page }) => {
  await openWithHeldLookup(page);
  await startFromHere(page);
  await expect(record(page)).toHaveAttribute('aria-busy', 'true', { timeout: 500 });
  const chosen = await reading(page);
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowDown');
  await page.locator('[data-booth-text] [data-word]').nth(60).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Next phrase' }).click();
  await expect(toasts(page)).toHaveCount(1);
  expect(await reading(page)).toBe(chosen);
  await expect(stop(page)).toBeVisible({ timeout: HELD_MS + 2000 });
  await page.keyboard.press('ArrowDown');
  expect(await reading(page)).not.toBe(chosen);
});
