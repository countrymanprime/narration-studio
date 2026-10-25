// The Script rail (#2251, alignment audit docs/research/alignment-audit/findings/script.md XSC-12, XSC-13, XSC-14, XSC-25, XSC-27,
// XSC-34, XSC-43): the In this chapter table's text starts on the section label's x and keeps its columns between chapters, a name
// with no first appearance has no dangling "first —", Add to my words is a labelled button, an empty tab's sentence sits on the
// rail's inset, and as a sheet the rail is as tall as what it holds and centred between the columns' edges.
import { expect, test, type Page } from '@playwright/test';
import { scriptDrivers } from './drivers/script';
import { settlePage } from './helpers/settle';

async function drive(page: Page, state: string, size: { width: number; height: number }): Promise<void> {
  await page.setViewportSize(size);
  await page.goto('/');
  await settlePage(page);
  const driver = scriptDrivers[state];
  if (!driver) throw new Error(`no script driver for ${state}`);
  await driver(page);
}

const DESKTOP = { width: 1440, height: 900 };
const rail = '[data-panel="rail"]';

/** The x of the "In this chapter" label, of the first cell's text, and of the second column, in the rail. */
const tableEdges = (page: Page) =>
  page.evaluate((sel) => {
    const panel = document.querySelector(sel)!;
    const label = [...panel.querySelectorAll('h3')].find((h) => h.textContent === 'In this chapter')!;
    const row = panel.querySelector('table tr')!;
    const text = row.querySelector('td b')!;
    return {
      label: Math.round(label.getBoundingClientRect().left),
      text: Math.round(text.getBoundingClientRect().left),
      second: Math.round(row.children[1]!.getBoundingClientRect().left),
      rowText: [...panel.querySelectorAll('table tr')].map((tr) => tr.textContent ?? ''),
    };
  }, rail);

test('rail-story-bible at 1440: the table text is on the label, and no "first —"', async ({ page }) => {
  await drive(page, 'rail-story-bible', DESKTOP);
  const g = await tableEdges(page);
  expect.soft(g.text, "the first column's text starts under the section label").toBe(g.label);
  expect
    .soft(
      g.rowText.filter((text) => /first\s*—/.test(text)),
      'no dangling "first —"',
    )
    .toEqual([]);
});

test('rail-words and retail-sample at 1440: the words table keeps its columns between chapters; Add to my words is labelled', async ({ page }) => {
  await drive(page, 'rail-words', DESKTOP);
  const words = await tableEdges(page);
  expect.soft(words.text, "the first column's text starts under the section label").toBe(words.label);
  await expect.soft(page.locator(rail).getByRole('button', { name: 'Add to my words' })).toHaveText(/Add to my words/);
  await drive(page, 'retail-sample', DESKTOP);
  const sample = await tableEdges(page);
  expect.soft(sample.second, 'the second column starts at the same x in another chapter').toBe(words.second);
});

for (const size of [
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
]) {
  test(`rail-notes at ${size.width}: a sheet as tall as its content, 8 px in, its sentence on the rail inset`, async ({ page }) => {
    await drive(page, 'rail-notes', size);
    // The sheet slides in: measure it where it comes to rest.
    await page.locator(rail).evaluate((el) => Promise.all(el.getAnimations({ subtree: true }).map((animation) => animation.finished)));
    const g = await page.evaluate((sel) => {
      const sheet = document.querySelector(sel)!.getBoundingClientRect();
      const columns = document.querySelector('[data-script-columns]')!.getBoundingClientRect();
      const tabPanel = document.querySelector(`${sel} [role="tabpanel"]`)!.getBoundingClientRect();
      const empty = [...document.querySelectorAll(`${sel} p`)].find((p) => p.textContent?.startsWith('No notes'))!.getBoundingClientRect();
      return {
        left: Math.round(sheet.left - columns.left),
        right: Math.round(columns.right - sheet.right),
        height: sheet.height,
        width: sheet.width,
        columns: columns.height,
        inset: Math.round(empty.left - tabPanel.left),
      };
    }, rail);
    // An 8 px inset from the right, and where the sheet fills the columns (below 396 px of them) from the left too (XSC-34).
    expect.soft(g.right, '8 px from the right').toBe(8);
    if (g.width < 380) expect.soft(g.left, 'the same gap on both sides').toBe(g.right);
    expect.soft(g.height, 'shorter than the columns: it holds one sentence').toBeLessThan(g.columns / 2);
    expect.soft(g.inset, "the sentence on the rail's 16 px inset").toBe(16);
  });
}
