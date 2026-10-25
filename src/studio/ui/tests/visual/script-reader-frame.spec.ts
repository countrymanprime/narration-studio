// The Script reader's frame (#2251, alignment audit docs/research/alignment-audit/findings/script.md XSC-9, XSC-11, XSC-18, XSC-21,
// XSC-28, XSC-35, R3SC-12 and booth.md XBO-24): the header shares the text's left edge and the rail strip's rule, the title is not cut
// at 390 while it fits two lines, a bookmark ribbon is a fixed 16 px glyph clear of the panel edge and the first letter with a 24 px
// press area, the retail sample's bar is drawn inside the panel as one line, and Skip to the side panel has its padding.
import { expect, test, type Page } from '@playwright/test';
import { boothDrivers } from './drivers/booth';
import { scriptDrivers } from './drivers/script';
import { settlePage } from './helpers/settle';

async function drive(page: Page, drivers: typeof scriptDrivers, state: string, size: { width: number; height: number }): Promise<void> {
  await page.setViewportSize(size);
  await page.goto('/');
  await settlePage(page);
  const driver = drivers[state];
  if (!driver) throw new Error(`no driver for ${state}`);
  await driver(page);
}

const DESKTOP = { width: 1440, height: 900 };

test('reader at 1440: the header title on the card edge, and the rail strip rule on the header rule', async ({ page }) => {
  await drive(page, scriptDrivers, 'reader', DESKTOP);
  const g = await page.evaluate(() => {
    const reader = document.querySelector('section[aria-label="Reader"]')!;
    const header = reader.firstElementChild!;
    const title = header.querySelector('b')!.getBoundingClientRect();
    const card = document.querySelector('section[aria-label$="chapter card"]')!.getBoundingClientRect();
    const strip = document.querySelector('[data-panel="rail"] [role="tablist"]')!.getBoundingClientRect();
    return {
      titleLeft: Math.round(title.left),
      cardLeft: Math.round(card.left),
      headerBottom: Math.round(header.getBoundingClientRect().bottom),
      stripBottom: Math.round(strip.bottom),
    };
  });
  expect.soft(g.titleLeft, 'the title and the card share a left edge').toBe(g.cardLeft);
  expect.soft(g.stripBottom, 'the rail strip and the reader header end on one line').toBe(g.headerBottom);
});

test('reader at 390: the chapter title is shown whole on two lines', async ({ page }) => {
  await drive(page, scriptDrivers, 'reader', { width: 390, height: 844 });
  const g = await page.evaluate(() => {
    const title = document.querySelector('section[aria-label="Reader"] > div b')!;
    return { scroll: title.scrollWidth, client: title.clientWidth, scrollH: title.scrollHeight, clientH: title.clientHeight };
  });
  expect.soft(g.scroll, 'nothing cut sideways').toBeLessThanOrEqual(g.client);
  expect.soft(g.scrollH, 'nothing cut below').toBeLessThanOrEqual(g.clientH + 1);
});

for (const size of [DESKTOP, { width: 768, height: 1024 }]) {
  test(`bookmark-added at ${size.width}: the ribbon clears the edge and the text, and is 24 px to press`, async ({ page }) => {
    await drive(page, scriptDrivers, 'bookmark-added', size);
    const g = await page.evaluate(() => {
      const button = document.querySelector<HTMLElement>('[data-bm]')!;
      // The drawn glyph, not the icon's fixed-width box (1.25 em).
      const glyph = button.querySelector('svg path')!.getBoundingClientRect();
      const region = document.querySelector('section[aria-label="Reader"] [role="region"]')!.getBoundingClientRect();
      const text = button.closest('[data-para]')!.querySelector('p')!.getBoundingClientRect();
      const b = button.getBoundingClientRect();
      const middle = b.top + b.height / 2;
      const pressable = (x: number) => document.elementFromPoint(x, middle)?.closest('[data-bm]') === button;
      return {
        toEdge: glyph.left - region.left,
        toText: text.left - glyph.right,
        glyph: glyph.height,
        left: pressable(b.left - 3.5),
        right: pressable(b.right + 3.5),
      };
    });
    expect.soft(g.toEdge, 'room between the panel edge and the ribbon').toBeGreaterThanOrEqual(3);
    expect.soft(g.toText, 'room between the ribbon and the first letter').toBeGreaterThanOrEqual(3);
    expect.soft(g.glyph, 'a 16 px glyph').toBeLessThanOrEqual(16);
    expect.soft(g.left && g.right, 'the press area reaches 4 px past each side of the 16 px box').toBe(true);
  });
}

test('booth bookmarks-ribbon at 768: the ribbon glyph does not grow with the Booth text', async ({ page }) => {
  await drive(page, boothDrivers, 'bookmarks-ribbon', { width: 768, height: 1024 });
  const glyph = await page.locator('[data-bm] svg path').first().boundingBox();
  expect(glyph!.height, 'the glyph is the 16 px ribbon, inside its 26 px box').toBeLessThanOrEqual(16);
});

test('retail-sample at 1440: the sample bar is inside the panel and one line', async ({ page }) => {
  await drive(page, scriptDrivers, 'retail-sample', DESKTOP);
  const g = await page.evaluate(() => {
    const region = document.querySelector('section[aria-label="Reader"] [role="region"]')!.getBoundingClientRect();
    const bars = [...document.querySelectorAll('[data-retail-sample]')].map((bar) => bar.getBoundingClientRect()).slice(0, 6);
    return { left: Math.round(bars[0]!.left - region.left), gaps: bars.slice(1).map((bar, i) => Math.round(bar.top - bars[i]!.bottom)) };
  });
  expect.soft(g.left, 'the bar is inside the panel').toBeGreaterThanOrEqual(1);
  expect
    .soft(
      g.gaps.every((gap) => gap === 0),
      `no gap between paragraphs (${g.gaps.join(', ')})`,
    )
    .toBe(true);
});

test('skip-to-side-panel at 1440: the button keeps its padding', async ({ page }) => {
  await drive(page, scriptDrivers, 'skip-to-side-panel', DESKTOP);
  const padding = await page.getByRole('button', { name: 'Skip to the side panel' }).evaluate((b) => parseFloat(getComputedStyle(b).paddingLeft));
  expect(padding).toBeGreaterThanOrEqual(8);
});
