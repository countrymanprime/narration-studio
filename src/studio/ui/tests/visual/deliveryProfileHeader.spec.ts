import { expect, test } from '@playwright/test';
import { goToPage } from './drivers/shared';
import { settlePage } from './helpers/settle';

// The profile card's header keeps the title, the profile menu and the name box on one row, as the Studio Next mock does (its name box is
// 160 px); a full-width name box wrapped onto a second row and left the title floating between the rows. Geometry, so it needs a real browser.
for (const [width, height] of [
  [1440, 900],
  [960, 640],
]) {
  test(`Delivery / profile card header is one row / ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/?mockDeliveryProfile=custom');
    await settlePage(page);
    await goToPage(page, 'Delivery');
    await page.mouse.move(width * 0.6, height * 0.5);
    const centre = async (box: ReturnType<typeof page.locator>) => {
      const rect = await box.boundingBox();
      if (!rect) throw new Error('not drawn');
      return { y: rect.y + rect.height / 2, width: rect.width };
    };
    const title = await centre(page.getByRole('heading', { level: 1, name: 'Delivery' }));
    const menu = await centre(page.getByRole('combobox', { name: /^Delivery profile:/ }));
    const name = await centre(page.getByRole('textbox', { name: 'Profile name' }));
    expect(Math.abs(menu.y - name.y), 'the menu and the name box share a row').toBeLessThanOrEqual(4);
    expect(Math.abs(title.y - name.y), 'the title shares that row').toBeLessThanOrEqual(8);
    expect(name.width, "the name box is the mock's width, not the card's").toBeLessThanOrEqual(200);
  });
}
