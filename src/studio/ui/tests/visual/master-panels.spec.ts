import { expect, test, type Locator } from '@playwright/test';
import { masterDrivers } from './drivers/master';
import { settlePage } from './helpers/settle';

/** The height of a titled panel's header row, its first child. */
const headerHeight = (panel: Locator) => panel.evaluate((section) => Math.round(section.firstElementChild!.getBoundingClientRect().height));

// Master & QC's lower panels (alignment audit XMS-20, R3MS-18, XMS-15, R4MS2-1, R4MS2-10): the consistency band runs from the card's
// text edge with labels at a readable size, the ticks stand only a little past the band, and the chain's and the report's headers are as
// tall as their neighbours'.
for (const size of [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'tablet', width: 768, height: 1024 },
]) {
  test(`Master / the lower panels line up / ${size.name} ${size.width}x${size.height}`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.goto('/');
    await settlePage(page);
    await masterDrivers['book-spread']!(page);
    const consistency = page.getByRole('region', { name: 'Book consistency' });
    const chart = await consistency.evaluate((section) => {
      const rect = section.querySelector('svg rect')!.getBoundingClientRect();
      const ticks = [...section.querySelectorAll('svg line')].map((line) => line.getBoundingClientRect());
      const caption = section.querySelector('p')!;
      const range = document.createRange();
      range.selectNodeContents(caption);
      const label = [...section.querySelectorAll('span')].find((span) => /^−?\d/.test(span.textContent ?? ''))!;
      return {
        bandLeft: rect.left,
        captionLeft: range.getBoundingClientRect().left,
        over: Math.max(...ticks.map((tick) => Math.max(rect.top - tick.top, tick.bottom - rect.bottom))),
        labelSize: label ? parseFloat(getComputedStyle(label).fontSize) : 0,
      };
    });
    expect(Math.abs(chart.bandLeft - chart.captionLeft), 'the band starts at the caption').toBeLessThanOrEqual(6);
    expect(chart.over, 'a tick stands only a little past the band').toBeLessThanOrEqual(8);
    expect(chart.labelSize, 'the band labels are readable').toBeGreaterThanOrEqual(12);
    const chain = page.getByRole('region', { name: 'Mastering chain' });
    expect(await headerHeight(chain), 'the chain header is as tall as its neighbour').toBe(await headerHeight(consistency));
    const report = page.getByRole('region', { name: 'Report' });
    expect(await headerHeight(report), 'the report header is as tall as its neighbour').toBe(await headerHeight(consistency));
  });
}
