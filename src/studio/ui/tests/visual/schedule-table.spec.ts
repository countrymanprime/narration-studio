import { expect, test, type Page } from '@playwright/test';
import { scheduleDrivers } from './drivers/schedule';

// The Schedule's milestone table lines up with its card and keeps its columns (alignment audit XSH-3, XSH-4, XSH-11, XSH-12, XSH-17,
// R3SH-5, R3SH-7, R4SM-13, R4SM-14): the Milestone column starts at the card title for every row, Due and Status stand at the same x
// whatever the milestones are called, the Final row's date reads at the other dates' x, the row buttons are 8 px apart, a long name
// stops at two lines, a card with only the Final row says so, and at 390 px the Due and Status columns stay on screen.
type Layout = {
  title: number;
  headers: Record<string, number>;
  dateLefts: number[];
  finalDate: number;
  buttonGaps: number[];
  rowHeights: number[];
  empty: boolean;
  statusRight: number;
  view: number;
};

async function layout(page: Page): Promise<Layout> {
  return page.evaluate(() => {
    const table = document.querySelector('table[aria-label="Milestones"]')!;
    const card = table.closest('section')!;
    const textLeft = (el: Element) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      return Math.round(range.getBoundingClientRect().left);
    };
    const rows = [...table.querySelectorAll('tbody tr')].filter((row) => row.children.length > 1);
    const finalField = table.querySelector('input[aria-label="Delivery due"]') as HTMLInputElement;
    const fieldStyle = getComputedStyle(finalField);
    const gaps: number[] = [];
    for (const group of table.querySelectorAll('tbody td:last-child > span')) {
      const buttons = [...group.querySelectorAll('button')].map((b) => b.getBoundingClientRect());
      for (let i = 1; i < buttons.length; i++) gaps.push(Math.round(buttons[i]!.left - buttons[i - 1]!.right));
    }
    return {
      title: textLeft(card.querySelector('h2')!),
      headers: Object.fromEntries([...table.querySelectorAll('thead th')].map((th) => [th.textContent ?? '', textLeft(th)])),
      // The plain dates of the milestone rows (the Due column is the third cell).
      dateLefts: rows.slice(0, -1).map((row) => textLeft(row.children[2]!)),
      finalDate: Math.round(finalField.getBoundingClientRect().left + parseFloat(fieldStyle.borderLeftWidth) + parseFloat(fieldStyle.paddingLeft)),
      buttonGaps: gaps,
      rowHeights: rows.map((row) => Math.round(row.getBoundingClientRect().height)),
      empty: Boolean(table.querySelector('[data-milestones-empty]')),
      statusRight: Math.round(table.querySelector('[data-final-status]')!.getBoundingClientRect().right),
      view: card.getBoundingClientRect().right,
    };
  });
}

for (const size of [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'small-desktop', width: 1024, height: 768 },
  { name: 'tablet', width: 768, height: 1024 },
]) {
  test(`Schedule / the milestone table lines up with its card in every state / ${size.name} ${size.width}x${size.height}`, async ({ browser, baseURL }) => {
    // Each state on a fresh page: the drivers install the page clock, which a page takes once.
    const measure = async (state: string) => {
      const page = await browser.newPage({ baseURL, viewport: { width: size.width, height: size.height } });
      await scheduleDrivers[state]!(page);
      const seen = await layout(page);
      await page.close();
      return seen;
    };
    const onPace = await measure('on-pace');
    const long = await measure('long-text');

    expect(Math.abs(onPace.headers.Milestone! - onPace.title), 'the Milestone heading starts at the card title').toBeLessThanOrEqual(1);
    expect(long.headers, 'the headings stand at the same x whatever the milestones are called').toEqual(onPace.headers);
    expect(onPace.empty, 'a card with only the Final row says there are none yet').toBe(true);
    expect(long.empty, 'the hint goes once there are milestones').toBe(false);
    for (const x of long.dateLefts) expect(Math.abs(long.finalDate - x), "the Final row's date reads at the other dates' x").toBeLessThanOrEqual(1);
    expect(Math.min(...long.buttonGaps), 'the row buttons stand 8 px apart').toBeGreaterThanOrEqual(8);
    // Two lines of a name and its row padding, and below 1024 px the line of what it measures; the 200-character word made a row 116 px tall.
    expect(Math.max(...long.rowHeights), 'a long name stops at two lines').toBeLessThanOrEqual(size.width >= 1024 ? 64 : 84);
  });
}

test('Schedule / at 390 px the milestone table keeps Due and Status on screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await scheduleDrivers['on-pace']!(page);
  const narrow = await layout(page);
  expect(narrow.statusRight, 'the Final row status ends inside its card').toBeLessThanOrEqual(narrow.view);
});
