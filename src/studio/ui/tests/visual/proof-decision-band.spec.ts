import { expect, test, type Page } from '@playwright/test';
import { goToPage } from './drivers/shared';
import { settlePage } from './helpers/settle';

// The Proof Inspector's decision band is pinned to the panel's bottom edge, except in a window too short for it: there it would fill most of the
// scroller and cover a focused control, so it scrolls with the panel (#3158, qa-breaker on #3154).
async function openInspector(page: Page, size: { width: number; height: number }) {
  await page.setViewportSize(size);
  await page.goto('/?mockChapterLink=confirmed');
  await settlePage(page);
  await goToPage(page, 'Proof');
  await page.getByText('Open notes, by chapter').waitFor();
  await page.getByRole('region', { name: 'Notes' }).locator('tr[data-row]').first().waitFor();
  const aside = page.getByRole('complementary', { name: 'Note' });
  await aside.waitFor();
  return aside;
}

const bandPosition = (page: Page) => page.locator('[data-decision-band]').evaluate((band) => getComputedStyle(band).position);

test('Proof / the decision band is pinned in a window tall enough for it / 1024x768', async ({ page }) => {
  await openInspector(page, { width: 1024, height: 768 });
  expect(await bandPosition(page)).toBe('sticky');
});

for (const size of [
  { width: 320, height: 300 },
  { width: 320, height: 256 },
]) {
  test(`Proof / the decision band scrolls with the panel and covers no focused control / ${size.width}x${size.height}`, async ({ page }) => {
    const aside = await openInspector(page, size);
    expect(await bandPosition(page), 'not pinned in a short window').toBe('static');
    // Tab through the panel: no focused control sits under the band.
    const band = page.locator('[data-decision-band]');
    await aside.getByRole('button').first().focus();
    for (let step = 0; step < 25; step += 1) {
      await page.keyboard.press('Tab');
      const overlap = await page.evaluate(() => {
        const active = document.activeElement;
        const bar = document.querySelector('[data-decision-band]');
        if (!active || !bar || bar.contains(active)) return 0;
        const a = active.getBoundingClientRect();
        const b = bar.getBoundingClientRect();
        return Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)) * Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
      });
      expect(overlap, 'a focused control is not under the band').toBeLessThanOrEqual(1);
    }
    await expect(band.getByRole('button').first()).toBeAttached();
  });
}
