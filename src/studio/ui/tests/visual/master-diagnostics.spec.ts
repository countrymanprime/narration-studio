import { expect, test } from '@playwright/test';
import { masterDrivers } from './drivers/master';
import { settlePage } from './helpers/settle';

// Master & QC's Diagnostics tables (alignment audit XMS-11, XMS-12, R4MS1-10, R3MS-16): the table text starts where the card's own text
// does, every heading is on one line, the cells of a finding share their first line, and the pacing text stands clear of the figures.
for (const size of [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'small-desktop', width: 1024, height: 768 },
]) {
  test(`Master / Diagnostics tables line up with their card / ${size.name} ${size.width}x${size.height}`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.goto('/');
    await settlePage(page);
    await masterDrivers['diagnostics-findings']!(page);
    const card = page.getByRole('region', { name: 'Diagnostics' });
    const facts = await card.evaluate((section) => {
      const textLeft = (el: Element) => {
        const range = document.createRange();
        range.selectNodeContents(el);
        return Math.round(range.getBoundingClientRect().left);
      };
      const intro = section.querySelector('p')!;
      const tables = [...section.querySelectorAll('table')];
      return {
        intro: textLeft(intro),
        firstCells: tables.map((table) => textLeft(table.querySelector('tbody td')!)),
        headings: tables.flatMap((table) => [...table.querySelectorAll('th')].map((th) => Math.round(th.getBoundingClientRect().height))),
        findingTops: [...section.querySelectorAll('table[aria-label="Findings"] tbody tr')].map((tr) =>
          [...tr.children].map((td) => {
            const range = document.createRange();
            range.selectNodeContents(td.firstElementChild ?? td);
            return Math.round(range.getClientRects()[0]!.top);
          }),
        ),
        pacing: (() => {
          const td = section.querySelector('table[aria-label="Checked files"] tbody td:nth-child(6)')!;
          const silence = section.querySelector('table[aria-label="Checked files"] tbody td:nth-child(5)')!;
          const a = document.createRange();
          a.selectNodeContents(td);
          const b = document.createRange();
          b.selectNodeContents(silence);
          return Math.round(a.getBoundingClientRect().left - b.getBoundingClientRect().right);
        })(),
      };
    });
    for (const cell of facts.firstCells) expect(Math.abs(cell - facts.intro), 'a table starts at the card text').toBeLessThanOrEqual(1);
    expect(new Set(facts.headings).size, 'every heading is on one line').toBe(1);
    for (const tops of facts.findingTops) expect(Math.max(...tops) - Math.min(...tops), "a finding's cells share their first line").toBeLessThanOrEqual(4);
    expect(facts.pacing, 'the pacing stands clear of the silence figures').toBeGreaterThanOrEqual(32);
  });
}
