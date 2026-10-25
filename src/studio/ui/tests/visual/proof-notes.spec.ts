import { expect, test, type Page } from '@playwright/test';
import { goToPage } from './drivers/shared';
import { settlePage } from './helpers/settle';

// The Proof notes queue's layout, which the state captures show but do not measure (alignment audit XPF-1, XPF-4, XPF-12, XPF-13,
// XPF-22, XPF-23, R3PF-15).

const notes = (page: Page) => page.getByRole('region', { name: 'Notes', exact: true });

async function openProof(page: Page, width: number, height: number, seed = ''): Promise<void> {
  await page.setViewportSize({ width, height });
  await page.goto(`/?${seed}`);
  await settlePage(page);
  await goToPage(page, 'Proof');
  await notes(page).locator('tr[data-row]').first().waitFor();
}

async function openChapter(page: Page, chapterTitle: string): Promise<void> {
  await page.getByRole('button', { name: /^Chapter: .*\. Change chapter$/ }).click();
  await page.getByRole('menuitemradio', { name: new RegExp(`^${chapterTitle}( — |$)`) }).click();
  await page.getByText('Open notes, by chapter').waitFor({ state: 'detached' });
  await notes(page).locator('tr[data-row]').first().waitFor();
}

/** Each column header's left edge, in table order. */
const columnLefts = (page: Page) =>
  notes(page)
    .getByRole('table', { name: 'Notes' })
    .locator('thead th')
    .evaluateAll((cells) => cells.map((cell) => Math.round(cell.getBoundingClientRect().left)));

for (const size of [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'small-desktop', width: 1024, height: 768 },
  { name: 'tablet', width: 768, height: 1024 },
]) {
  test(`Proof / the notes columns stay put between chapters and the From cell keeps its source on one line / ${size.name}`, async ({ page }) => {
    await openProof(page, size.width, size.height);
    const all = await columnLefts(page);
    const from = notes(page).locator('tbody tr[data-row] td:nth-child(4)');
    for (const cell of await from.all()) {
      const lines = await cell.evaluate((td) => {
        // The line boxes of the cell's own text (not its wrappers', whose padding moves their top).
        const tops = new Set<number>();
        const walker = document.createTreeWalker(td, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          if (!node.textContent?.trim()) continue;
          const range = document.createRange();
          range.selectNodeContents(node);
          for (const rect of range.getClientRects()) if (rect.width > 2 && rect.height > 2) tops.add(Math.round(rect.bottom / 4));
        }
        return tops.size;
      });
      expect(lines, `"${await cell.innerText()}" sits on one line`).toBe(1);
    }
    await openChapter(page, 'Chapter 2');
    expect(await columnLefts(page), 'the columns start where they did in All chapters').toEqual(all);
  });

  test(`Proof / the table's text starts where the card's own text starts, and Time is right-aligned over its values / ${size.name}`, async ({ page }) => {
    await openProof(page, size.width, size.height);
    const heading = (await notes(page).getByRole('heading', { level: 2 }).boundingBox())!;
    const first = notes(page).locator('thead th').first();
    const textLeft = await first.evaluate((cell) => cell.getBoundingClientRect().left + parseFloat(getComputedStyle(cell).paddingLeft));
    expect(Math.abs(textLeft - heading.x), 'the Time column starts at the heading').toBeLessThanOrEqual(1);
    expect(await first.evaluate((cell) => getComputedStyle(cell).textAlign)).toBe('right');
  });
}

test('Proof / with Find open at 390 the toolbar stays inside the card and the table shows it scrolls', async ({ page }) => {
  await openProof(page, 390, 844, 'mockChapterLink=none');
  await notes(page).getByRole('button', { name: 'Find in notes' }).click();
  await notes(page).getByPlaceholder('Find in notes').fill('rabbit');
  const card = (await notes(page).boundingBox())!;
  for (const control of await notes(page).locator('button:visible, input:visible').all()) {
    const box = (await control.boundingBox())!;
    expect(box.x + box.width, `${await control.getAttribute('aria-label')} ends inside the card`).toBeLessThanOrEqual(card.x + card.width);
  }
  await notes(page).getByPlaceholder('Find in notes').fill('');
  const area = notes(page).getByRole('group', { name: 'Notes scroll area' });
  const scroll = await area.evaluate((element) => ({
    overflows: element.scrollWidth > element.clientWidth,
    background: getComputedStyle(element).backgroundImage,
  }));
  if (scroll.overflows) expect(scroll.background, 'a cue that there is more to the right').toContain('gradient');
});

for (const width of [1920, 1440, 1024, 768, 390]) {
  test(`Proof / the sort and icon toolbar ends at the card's right text edge / ${width}`, async ({ page }) => {
    await openProof(page, width, 900);
    const card = (await notes(page).boundingBox())!;
    const sort = (await notes(page).getByRole('combobox', { name: 'Sort notes' }).boundingBox())!;
    const last = (await notes(page)
      .getByRole('button')
      .filter({ has: page.locator('svg') })
      .last()
      .boundingBox())!;
    const end = Math.max(sort.x + sort.width, last.x + last.width);
    expect(Math.abs(card.x + card.width - 1 - 16 - end), 'the toolbar ends 16 px in from the card edge').toBeLessThanOrEqual(1.5);
  });
}

// Side by side, the notes card runs down to where the Inspector's card ends instead of stopping under its last row (XPF-7).
for (const width of [1920, 1440, 1280]) {
  test(`Proof / the notes card and the Inspector end together / ${width}`, async ({ page }) => {
    await openProof(page, width, 900);
    const notesEnd = await notes(page).evaluate((card) => card.getBoundingClientRect().bottom);
    const inspectorEnd = await page
      .getByRole('complementary', { name: 'Note' })
      .evaluate((inspector) => inspector.closest('div.rounded-\\[var\\(--radius-card\\)\\]')!.getBoundingClientRect().bottom);
    expect(Math.abs(notesEnd - inspectorEnd), 'the two columns end on one line').toBeLessThanOrEqual(1);
  });
}
