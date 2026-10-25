import { expect, test } from '@playwright/test';
import { APP_DRIVERS } from './app.drivers';
import { settlePage } from './helpers/settle';

// A setting's text box ends inside its card: the REAPER program box ran from its column to the card's edge at 1024 px and past the card and
// the window at 390 px, because its fixed 26rem width ignored the column (alignment audit XSE2-1). The box must end at least the card's 20 px
// padding before the card's right edge, at every width.
for (const size of [
  { name: 'small-desktop', width: 1024, height: 768 },
  { name: 'reflow', width: 390, height: 844 },
]) {
  test(`Settings / the REAPER program box stays inside its card / ${size.name} ${size.width}x${size.height}`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.goto('/');
    await settlePage(page);
    await APP_DRIVERS.settings!['recording-advanced']!(page);
    const box = page.getByLabel('REAPER program', { exact: true });
    const card = page.locator('[data-row="daw.reaperPath"]');
    const boxRect = (await box.boundingBox())!;
    const cardRect = (await card.boundingBox())!;
    expect(boxRect.x + boxRect.width, 'the box ends inside the card, clear of its padding').toBeLessThanOrEqual(cardRect.x + cardRect.width - 19);
    expect(boxRect.x + boxRect.width, 'the box ends inside the window').toBeLessThanOrEqual(size.width);
    expect(boxRect.width, 'the box keeps a usable width').toBeGreaterThan(200);
  });
}
