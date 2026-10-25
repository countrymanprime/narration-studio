import { expect, test, type Locator, type Page } from '@playwright/test';
import { settlePage } from './helpers/settle';
import { productionDrivers } from './drivers/production';

// Layout rules of the Production page the alignment audit found broken (docs/research/alignment-audit/findings/production.md), checked
// from the DOM at the widths they broke at: what a tile, a card or a row draws stays inside its own box and clear of its neighbours.

const SIZES = [
  { name: 'wide', width: 1920, height: 1080 },
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'small-desktop', width: 1024, height: 768 },
  { name: 'tablet', width: 768, height: 1024 },
];

async function drive(page: Page, size: (typeof SIZES)[number], state: string): Promise<void> {
  await page.setViewportSize({ width: size.width, height: size.height });
  await page.goto('/');
  await settlePage(page);
  await productionDrivers[state](page);
}

type Box = { x: number; y: number; right: number; bottom: number; text: string };

/** Each child of `container` and the boxes of the text inside it (text nodes, measured by range, so a clipped word still counts). */
async function childBoxes(container: Locator): Promise<{ box: Box; texts: Box[] }[]> {
  return container.evaluate((root) =>
    [...root.children].map((child) => {
      const rect = (r: DOMRect, text = '') => ({ x: r.left, y: r.top, right: r.right, bottom: r.bottom, text });
      const texts: Box[] = [];
      const walker = document.createTreeWalker(child, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!node.textContent?.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        texts.push(rect(range.getBoundingClientRect(), node.textContent.trim()));
      }
      return { box: rect(child.getBoundingClientRect()), texts };
    }),
  );
}

for (const size of SIZES) {
  // XPR2-1, R3PR2-4: four tiles in the 20 rem slide-over ran their labels together and clipped "155/min".
  test(`Production / the recording check figures stay inside their tiles / ${size.name} ${size.width}x${size.height}`, async ({ page }) => {
    await drive(page, size, 'recording-check-incomplete');
    const dialog = page.getByRole('dialog', { name: /^Recording check: Chapter 4\b/ });
    const tiles = await childBoxes(dialog.getByText('Text present', { exact: true }).locator('xpath=../..'));
    expect(tiles.length).toBeGreaterThanOrEqual(3);
    const panel = (await dialog.boundingBox())!;
    for (const [index, tile] of tiles.entries()) {
      for (const text of tile.texts) {
        expect(text.right, `"${text.text}" ends inside its tile`).toBeLessThanOrEqual(tile.box.right + 1);
        expect(text.right, `"${text.text}" ends inside the panel`).toBeLessThanOrEqual(panel.x + panel.width);
        // A figure is one line: "27 of 42" broke into three.
        if (/^\d/.test(text.text) && text.text.length < 12) expect(text.bottom - text.y, `"${text.text}" is one line`).toBeLessThan(40);
      }
      for (const other of tiles.slice(index + 1)) {
        const apart = other.box.x >= tile.box.right - 1 || other.box.y >= tile.box.bottom - 1;
        expect(apart, 'tiles do not overlap').toBe(true);
      }
    }
  });
}
