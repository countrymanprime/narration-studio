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

for (const width of [1100, 860]) {
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
    expect(rules, 'one rule per heading; the first group has none, the mock draws no heading over it').toEqual([true, true, true, true, true]);

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

// The rail's sizes, measured on the Studio Next mock (docs/research/mockups/studio-next/src/styles/app.css `.nav`, `.grp`, `.brand`):
// 40 px items on a 42 px pitch, a 15 px label, a 20 px icon in a 22 px box, a 36 px group heading, a 50 px brand block, no rule above the foot.
for (const width of [1440, 1100]) {
  test(`Navigation rail / sizes follow the mock / ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await settlePage(page);
    const m = await page.evaluate(
      ([rail, width]) => {
        const panel = document.querySelector(`${rail} > div`)!;
        const items = [...panel.querySelectorAll('nav button')] as HTMLElement[];
        const box = (el: Element) => el.getBoundingClientRect();
        const label = getComputedStyle(items[0]);
        const icon = items[0].querySelector('svg')!;
        const heading = panel.querySelectorAll('[role="group"] > .section-label')[1];
        const foot = panel.querySelector('.rail-foot')!;
        return {
          itemH: box(items[0]).height,
          pitch: box(items[1]).top - box(items[0]).top,
          itemFont: width >= 1360 ? label.fontSize : getComputedStyle(panel.querySelector('.rail-foot button')!).fontSize,
          iconFont: getComputedStyle(icon).fontSize,
          iconW: box(icon).width,
          headingH: box(heading).height,
          brandH: panel.firstElementChild!.getBoundingClientRect().height,
          footBorder: getComputedStyle(foot).borderTopWidth,
          firstGroupHeadings: panel.querySelectorAll('[role="group"]:first-child > .section-label').length,
        };
      },
      [RAIL, width] as const,
    );
    expect(m).toMatchObject({ itemH: 40, pitch: 42, iconFont: '20px', iconW: 22, headingH: 36, brandH: 50, footBorder: '0px', firstGroupHeadings: 0 });
    if (width >= 1360) expect(m.itemFont).toBe('15px');
  });
}

// The rail gives way to the hamburger and drawer below 860 px, the width the mock turns its rail into a tab bar.
test('Navigation rail / the hamburger takes over below 860 px / 859 and 860', async ({ page }) => {
  await page.setViewportSize({ width: 859, height: 800 });
  await page.goto('/');
  await settlePage(page);
  await expect(page.getByRole('button', { name: 'Open navigation' })).toBeVisible();
  await expect(page.locator(RAIL)).toBeHidden();
  await page.setViewportSize({ width: 860, height: 800 });
  await expect(page.getByRole('button', { name: 'Open navigation' })).toBeHidden();
  await expect(page.locator(RAIL)).toBeVisible();
});
