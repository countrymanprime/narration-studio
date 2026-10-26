import { expect, test } from '@playwright/test';
import { settlePage } from './helpers/settle';
import { productionDrivers } from './drivers/production';

// The chapter pipeline's layout, checked from the DOM at the widths the alignment audit found it broken at
// (docs/research/alignment-audit/findings/production.md): the readiness chips stay inside their own cell, the chapter names keep a
// column that holds them, and a narrow card scrolls the stages under pinned names.
for (const size of [
  { name: 'wide', width: 1920, height: 1080 },
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'small-desktop', width: 1024, height: 768 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'reflow', width: 390, height: 844 },
]) {
  test(`Production / the pipeline's chips stay in their cells and the names keep their column / ${size.name} ${size.width}x${size.height}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.goto('/');
    await settlePage(page);
    await productionDrivers['on-pace'](page);
    const table = page.getByRole('table', { name: 'Chapter pipeline' });
    // XPR2-12, XPR1-34: a chip 8 px above and right of its cell sat on the row rule and over the next column.
    const chips = await table.locator('[data-rchip]').evaluateAll((nodes) =>
      nodes.map((chip) => {
        const own = chip.getBoundingClientRect();
        const cell = chip.closest('td')!.getBoundingClientRect();
        return { top: own.top - cell.top, bottom: cell.bottom - own.bottom, left: own.left - cell.left, right: cell.right - own.right };
      }),
    );
    expect(chips.length).toBeGreaterThan(0);
    for (const chip of chips) for (const [side, gap] of Object.entries(chip)) expect(gap, `the chip is inside its cell (${side})`).toBeGreaterThanOrEqual(0);
    // XPR1-5, R4SM-3: the name column was 65 to 130 px, so names broke one word, or half a word, a line.
    const name = (await table.getByRole('columnheader', { name: 'Chapter' }).boundingBox())!;
    expect(name.width, 'the Chapter column holds a name').toBeGreaterThanOrEqual(158);
    // The Rec. / Est. header and its info mark take at most two short lines, and each cell holds its figure and its estimate unclipped.
    expect((await table.getByRole('columnheader', { name: /^Rec\. \/ Est\./ }).boundingBox())!.height).toBeLessThan(40);
    const clipped = await table.locator('[data-recorded]').evaluateAll((nodes) => nodes.filter((node) => node.scrollWidth > node.clientWidth + 1).length);
    expect(clipped, 'no Rec. / Est. cell is clipped').toBe(0);
    if (size.width >= 1440) expect(name.width, 'the names are not squeezed beside eight wide stage columns (XPR2-10)').toBeGreaterThanOrEqual(300);
  });
}

test('Production / a stage cell beside its readiness chip still shows its whole label / desktop 1440x900', async ({ page }) => {
  // The cell gives up its minimum for the chip; what is left must still hold "50%" (it was clipped to "50" in 15 px).
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await settlePage(page);
  await productionDrivers['on-pace'](page);
  const cell = page.getByRole('button', { name: /^Chapter 4.*: Record 50% recorded$/ });
  const sizes = await cell.evaluate((node) => ({ scroll: node.scrollWidth, client: node.clientWidth, width: node.getBoundingClientRect().width }));
  expect(sizes.scroll, 'the label is not clipped').toBeLessThanOrEqual(sizes.client);
  expect(sizes.width).toBeGreaterThanOrEqual(24);
});
