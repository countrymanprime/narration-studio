// A toast whose text holds a word with no place to break stays inside the window (qa B3 on #2807). The Proof answer to "Treat these two
// words as the same" names the two words, and a 45-letter word made the toast 361 px wide in a 320 px window, its start cut off. The
// guard is on the Toast primitive, so it holds for every toast; this drives the toast that found it, at the overlay guard's smallest window.
import { expect, test, type Page } from '@playwright/test';
import { settlePage } from './helpers/settle';

async function pressTreatAsSame(page: Page, width: number, height: number): Promise<void> {
  await page.setViewportSize({ width, height });
  await page.goto('/proof?mockFindings=misread-long');
  await settlePage(page);
  await page
    .getByRole('region', { name: 'Notes' })
    .locator('tr[data-row]')
    .filter({ hasText: /Pneumono/ })
    .click();
  const button = page.getByRole('complementary', { name: 'Note' }).getByRole('button', { name: 'Treat these two words as the same in later checks' });
  await button.scrollIntoViewIfNeeded();
  await button.click();
}

for (const [width, height] of [
  [320, 300],
  [360, 500],
] as const) {
  test(`a toast holding an unbreakable word stays inside a ${width}x${height} window`, async ({ page }) => {
    await pressTreatAsSame(page, width, height);
    const toast = page.getByRole('status').filter({ hasText: /Added equivalence: Pneumono/ });
    await toast.waitFor();
    const box = await toast.locator('xpath=./*').first().boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    // The whole word wraps inside it rather than being cut.
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  });
}
