import { expect, test } from '@playwright/test';
import { APP_DRIVERS } from './app.drivers';
import { settlePage } from './helpers/settle';

// A row of Models & downloads keeps its actions inside it when the asset's name is long (issue 2731): Check the files and Remove sit on the
// name line, and a name with a long unbroken word wraps in its own cell instead of pushing them past the card or the window.
for (const size of [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'reflow', width: 390, height: 844 },
]) {
  test(`Settings / a long model name keeps Check the files and Remove inside the row / ${size.name} ${size.width}x${size.height}`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.goto('/');
    await settlePage(page);
    await APP_DRIVERS.settings!['models-long-name']!(page);
    const row = page.locator('[data-asset="whisper/small"]');
    const rowRect = (await row.boundingBox())!;
    const nameRect = (await row.locator('th').boundingBox())!;
    for (const name of [/^Check the files of /, /^Remove /]) {
      const button = (await row.getByRole('button', { name }).boundingBox())!;
      expect(button.x + button.width, `${name} ends inside the row`).toBeLessThanOrEqual(rowRect.x + rowRect.width);
      expect(button.x + button.width, `${name} ends inside the window`).toBeLessThanOrEqual(size.width);
      expect(button.x, `${name} starts after the name`).toBeGreaterThanOrEqual(nameRect.x + nameRect.width - 1);
      expect(button.y, `${name} is on the name line`).toBeLessThan(nameRect.y + nameRect.height);
    }
  });
}
