import { expect, test } from '@playwright/test';
import { goToPage } from './drivers/shared';
import { settlePage } from './helpers/settle';

// The icon rail (below 1360 CSS px): every icon is centred in the rail's 64 px (63 inside its border), where it stays when the rail opens
// on hover, and the group headings draw as rules. The wide rail and the drawer draw no rule. Geometry, so it needs a real browser.
const RAIL = 'aside[aria-label="Primary navigation"]';

async function iconOffsets(page: import('@playwright/test').Page) {
  return page.evaluate((rail) => {
    const panel = document.querySelector(`${rail} > div`)!.getBoundingClientRect();
    const centre = panel.left + (panel.width - 1) / 2;
    return [...document.querySelectorAll(`${rail} button`)].map((button) => {
      const icon = button.querySelector('svg')!.getBoundingClientRect();
      const box = button.getBoundingClientRect();
      return {
        name: button.getAttribute('aria-label') ?? button.textContent,
        x: icon.left + icon.width / 2,
        dx: icon.left + icon.width / 2 - centre,
        dy: icon.top + icon.height / 2 - (box.top + box.height / 2),
      };
    });
  }, RAIL);
}

for (const width of [1100, 800]) {
  test(`Navigation rail / icons centred and group rules drawn / ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await settlePage(page);
    await goToPage(page, 'Proof');
    await page.mouse.move(width - 2, 600);
    const collapsed = await iconOffsets(page);
    expect(collapsed.length).toBeGreaterThan(8);
    for (const item of collapsed) {
      expect(Math.abs(item.dx), `${item.name} horizontal offset`).toBeLessThanOrEqual(0.5);
      expect(Math.abs(item.dy), `${item.name} vertical offset`).toBeLessThanOrEqual(0.5);
    }
    const rules = await page.evaluate(
      (rail) =>
        [...document.querySelectorAll(`${rail} [role="group"] > .section-label`)].map((heading) => {
          const rule = getComputedStyle(heading, '::after');
          return rule.content !== 'none' && rule.borderTopWidth === '1px';
        }),
      RAIL,
    );
    expect(rules, 'one rule per group but the first (the brand block rules it)').toEqual([false, true, true, true, true, true]);

    // Opening the rail on hover moves no icon and takes the rules away.
    await page.locator(RAIL).hover({ position: { x: 20, y: 300 } });
    await expect(page.locator(`${RAIL} > div`)).toHaveCSS('width', '236px');
    const opened = await iconOffsets(page);
    expect(opened.map((item) => item.x)).toEqual(collapsed.map((item) => item.x));
    const open = await page.evaluate(
      (rail) => [...document.querySelectorAll(`${rail} [role="group"] > .section-label`)].map((heading) => getComputedStyle(heading, '::after').content),
      RAIL,
    );
    expect(new Set(open), 'the open rail shows headings, not rules').toEqual(new Set(['none']));
  });
}

test('Navigation rail / the wide rail draws headings and no rules / 1440', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await settlePage(page);
  const wide = await page.evaluate(
    (rail) => [...document.querySelectorAll(`${rail} [role="group"] > .section-label`)].map((heading) => getComputedStyle(heading, '::after').content),
    RAIL,
  );
  expect(new Set(wide)).toEqual(new Set(['none']));
});
