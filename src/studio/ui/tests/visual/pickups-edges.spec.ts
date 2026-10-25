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

// The Pickups table keeps its row actions, Remove last, inside its scroll area down to the tablet width (it was cut at its edge at 768).
// At the 390 reflow width it used to scroll sideways with a cue; since the alignment audit's XPK-5 its rows stack there instead (the line
// under its time and type, the actions under the line), so nothing is out of view and nothing scrolls. The cue stays for a table that
// still has to scroll.
for (const size of [
  { name: 'small-desktop', width: 1024, height: 768, scrolls: false },
  { name: 'tablet', width: 768, height: 1024, scrolls: false },
  { name: 'reflow', width: 390, height: 844, scrolls: false },
]) {
  test(`Pickups / the row actions fit the scroll area or the table says it scrolls / ${size.name} ${size.width}x${size.height}`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.goto('/pickups');
    await settlePage(page);
    const area = page.getByRole('group', { name: 'Pickups scroll area' });
    const remove = area.getByRole('button', { name: 'Remove from pickups' }).first();
    await remove.waitFor();
    const fits = await area.evaluate(
      (element, button) => {
        const box = (button as HTMLElement).getBoundingClientRect();
        return { overflows: element.scrollWidth > element.clientWidth, removeRight: box.right, areaRight: element.getBoundingClientRect().right };
      },
      await remove.elementHandle(),
    );
    if (size.scrolls) {
      expect(fits.overflows, 'the table scrolls sideways at this width').toBe(true);
      expect(await area.evaluate((element) => getComputedStyle(element).backgroundImage), 'a cue that there is more to the right').toContain('gradient');
    } else {
      expect(fits.overflows, 'the table needs no sideways scroll').toBe(false);
      expect(fits.removeRight, 'Remove is inside the scroll area').toBeLessThanOrEqual(fits.areaRight);
    }
  });
}
