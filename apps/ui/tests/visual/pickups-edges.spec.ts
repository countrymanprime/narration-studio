import { expect, test } from '@playwright/test';
import { goToPage } from './drivers/shared';
import { settlePage } from './helpers/settle';

// What the shared overlay guard (overlays.spec.ts, overlays/pickups.ts) does not measure: that the Check recordings dialog keeps its
// own footer buttons, Cancel and Check, on screen and topmost at short and narrow windows (they were clipped below 1000x600).
const SIZES = [
  { name: 'wide', width: 1440, height: 900 },
  { name: 'short', width: 1100, height: 560 },
  { name: 'narrow', width: 760, height: 620 },
  { name: 'tiny', width: 700, height: 400 },
];

for (const size of SIZES) {
  test(`Pickups / Check recordings keeps Cancel and Check reachable / ${size.name} ${size.width}x${size.height}`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.goto('/');
    await settlePage(page);
    await goToPage(page, 'Pickups');
    await page
      .getByRole('region', { name: 'Pickups' })
      .getByRole('button', { name: /Check recordings/ })
      .click();
    const dialog = page.getByRole('dialog').last();
    await dialog.waitFor();
    for (const name of [/^Cancel$/, /^Check \d+ chapters?$/i]) {
      const button = dialog.getByRole('button', { name });
      const box = (await button.boundingBox())!;
      expect(box.y + box.height, `${name} is above the bottom edge`).toBeLessThanOrEqual(size.height);
      const topmost = await button.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const top = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
        return top !== null && element.contains(top);
      });
      expect(topmost, `${name} is topmost`).toBe(true);
    }
  });
}
