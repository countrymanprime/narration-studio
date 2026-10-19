// Layout of the app inside the demo page's window (scripts/site/windowPages.mjs): the window is as wide as the site's content column, 1280 px on a wide screen.
import { expect, test } from '@playwright/test';

const appFrame = (page: import('@playwright/test').Page) => page.frameLocator('#app');

test('the Script page lays out in the 1280 px window: the rail is a drawer and the reader keeps its width', async ({ page }) => {
  // The window is exactly 1280 px wide on a wide screen, the one width a `max-[1280px]` against a `min-[1281px]` left matching neither: the rail then sat in the
  // grid under the chapter list and squeezed the reader to a sliver.
  await page.goto('demo/index.html#/script');
  const app = appFrame(page);
  const columns = app.locator('[data-script-columns]');
  await expect(columns).toBeVisible();
  const width = await app.locator('html').evaluate(() => window.innerWidth);
  expect(width).toBe(1280);
  const rail = app.locator('[data-panel="rail"]');
  await expect(rail).toHaveCSS('position', 'absolute');
  await expect(rail).toBeHidden();
  const reader = app.locator('[data-script-columns] > div').nth(1);
  const box = await reader.boundingBox();
  const grid = await columns.boundingBox();
  if (!box || !grid) throw new Error('the Script columns have no box');
  expect(box.width).toBeGreaterThan(grid.width / 2);
  expect(box.height).toBeGreaterThan(grid.height - 8);
});
