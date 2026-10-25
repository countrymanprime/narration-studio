import { expect, test, type Page } from '@playwright/test';
import { pickupsDrivers } from './drivers/pickups';
import { settlePage } from './helpers/settle';

// The Pickups table's alignment fixes (alignment audit, #2251), measured in the real app: the table's first column starts under the card
// title (R3PK-1), a tall line's checkbox, time, chip and buttons sit on its first text line (XPK-1), the source and its score never break
// at the dot (XPK-2), the headings stand still between states (XPK-3) and, under the tablet width, a row stacks rather than cutting its
// columns off (XPK-5).
const card = (page: Page) => page.getByRole('region', { name: 'Pickups' });

async function open(page: Page, state: string, width: number, height: number): Promise<void> {
  await page.setViewportSize({ width, height });
  await page.goto('/');
  await settlePage(page);
  await pickupsDrivers[state]!(page);
}

const headings = (page: Page) =>
  card(page)
    .locator('thead th')
    .evaluateAll((cells) => cells.map((cell) => Math.round(cell.getBoundingClientRect().left)));

for (const size of [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'small-desktop', width: 1024, height: 768 },
]) {
  test(`Pickups / the table lines up with its card and its first text line / ${size.name}`, async ({ page }) => {
    await open(page, 'list', size.width, size.height);
    const geometry = await card(page).evaluate((section) => {
      const box = (el: Element | null) => el!.getBoundingClientRect();
      const middle = (el: Element | null) => Math.round(box(el).top + box(el).height / 2);
      const title = section.querySelector('h1')!;
      const row = section.querySelector('tr[data-pk]')!;
      const cells = [...row.children];
      // The line's first text line: the first character's box.
      const range = document.createRange();
      const text = document.createTreeWalker(cells[3]!, NodeFilter.SHOW_TEXT).nextNode()!;
      range.setStart(text, 0);
      range.setEnd(text, 1);
      const first = range.getBoundingClientRect();
      // The source's own name (on main the whole "Speech · 0.97" was one span).
      const source = (cells[4]!.querySelector('[data-pickup-source] > span') ?? cells[4]!.querySelector('span'))!;
      return {
        titleLeft: Math.round(box(title).left),
        checkboxLeft: Math.round(box(cells[0]!.querySelector('[role="checkbox"]')).left),
        lineFirst: Math.round(first.top + first.height / 2),
        lineHeight: Math.round(box(cells[3]!).height),
        checkbox: middle(cells[0]!.querySelector('[role="checkbox"]')),
        play: middle(cells[6]!.querySelector('button')),
        sourceLines: Math.round(box(source).height / parseFloat(getComputedStyle(source).lineHeight)),
      };
    });
    expect(Math.abs(geometry.checkboxLeft - geometry.titleLeft), 'the first column starts under the card title').toBeLessThanOrEqual(1);
    expect(geometry.lineHeight, 'the first line is several lines tall').toBeGreaterThan(100);
    expect(Math.abs(geometry.checkbox - geometry.lineFirst), 'the checkbox sits on the first text line').toBeLessThanOrEqual(3);
    expect(Math.abs(geometry.play - geometry.lineFirst), 'the buttons sit on the first text line').toBeLessThanOrEqual(3);
    expect(geometry.sourceLines, '"Speech" is one line, its score under it').toBe(1);
  });

  test(`Pickups / the headings stand still when a line is recorded or left out / ${size.name}`, async ({ page }) => {
    await open(page, 'list', size.width, size.height);
    const list = await headings(page);
    await open(page, 'marked-recorded', size.width, size.height);
    expect(await headings(page), 'after Mark recorded').toEqual(list);
    await open(page, 'session-left-out', size.width, size.height);
    expect(await headings(page), 'after leaving a line out').toEqual(list);
  });
}

test('Pickups / at the reflow width a row stacks with nothing cut off / reflow', async ({ page }) => {
  await open(page, 'list', 390, 844);
  const area = page.getByRole('group', { name: 'Pickups scroll area' });
  const fits = await area.evaluate((element) => {
    const right = element.getBoundingClientRect().right;
    const row = element.querySelector('tr[data-pk]')!;
    const cells = [...row.children].map((cell) => cell.getBoundingClientRect());
    return {
      overflows: element.scrollWidth > element.clientWidth,
      everyCellInside: cells.every((cell) => cell.right <= right + 0.5),
      lineUnderTime: cells[3]!.top >= cells[1]!.bottom - 0.5,
      lineWidth: cells[3]!.width,
    };
  });
  expect(fits.overflows, 'nothing scrolls sideways').toBe(false);
  expect(fits.everyCellInside, 'every cell is inside the card').toBe(true);
  expect(fits.lineUnderTime, 'the line is under its time').toBe(true);
  expect(fits.lineWidth, 'the line has the width of the card').toBeGreaterThan(250);
});

// Stacked, the rows share their columns: a short chip ("Noise") does not pull its row's source and status left of the others (alignment
// audit A3, marked-recorded at 768 and 390 px).
for (const size of [
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'reflow', width: 390, height: 844 },
]) {
  test(`Pickups / stacked rows share their columns / ${size.name}`, async ({ page }) => {
    await open(page, 'marked-recorded', size.width, size.height);
    const lefts = await card(page)
      .locator('tr[data-pk]')
      .evaluateAll((rows) => rows.map((row) => [...row.children].slice(0, 6).map((cell) => Math.round(cell.getBoundingClientRect().left))));
    expect(lefts.length, 'the chapter has several pickups').toBeGreaterThanOrEqual(3);
    for (const column of [1, 2, 4, 5]) {
      const xs = lefts.map((row) => row[column]!);
      expect(Math.max(...xs) - Math.min(...xs), `column ${column + 1} starts at one x (${xs.join(', ')})`).toBeLessThanOrEqual(1);
    }
  });
}
