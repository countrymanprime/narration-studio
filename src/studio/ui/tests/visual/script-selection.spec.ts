// The Script's selection toolbar and right-click menu (#2251, alignment audit docs/research/alignment-audit/findings/script.md XSC-5, XSC-6, XSC-38, XSC-19, R3SC-2): it sits
// on the selected words (just above them, or under them with no room above) at every width, goes when a drawer opens over the text, and
// its buttons are one size, evenly spaced.
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

for (const size of [
  { width: 1440, height: 900 },
  { width: 1024, height: 768 },
  { width: 768, height: 1024 },
]) {
  test(`selection-tools at ${size.width}: the toolbar is on the selection, its buttons one size and evenly spaced`, async ({ page }) => {
    await drive(page, 'selection-tools', size);
    const g = await page.getByRole('toolbar', { name: 'Selection tools' }).evaluate((bar) => {
      const words = window.getSelection()!.getRangeAt(0).getBoundingClientRect();
      const box = bar.getBoundingClientRect();
      const buttons = [...bar.querySelectorAll('button')].map((b) => b.getBoundingClientRect());
      return {
        above: Math.round(words.top - box.bottom),
        below: Math.round(box.top - words.bottom),
        sizes: buttons.map((b) => `${Math.round(b.width)}x${Math.round(b.height)}`),
        gaps: buttons.slice(1).map((b, i) => Math.round(b.left - buttons[i]!.right)),
      };
    });
    const near = (gap: number) => gap >= 0 && gap <= 16;
    expect.soft(near(g.above) || near(g.below), `next to the selected words (${g.above} px above, ${g.below} px below)`).toBe(true);
    expect.soft(new Set(g.sizes).size, `one button size (${g.sizes.join(', ')})`).toBe(1);
    expect.soft(new Set(g.gaps).size, `one gap (${g.gaps.join(', ')})`).toBe(1);
  });
}

// XSC-19, R3SC-2: the right-click menu on a word is a handful of rows (its choices in submenus), opened just under the word or just above
// it, never on it.
for (const size of [
  { width: 1920, height: 1080 },
  { width: 1440, height: 900 },
  { width: 1024, height: 768 },
  { width: 768, height: 1024 },
]) {
  test(`reader-context-menu at ${size.width}: a short menu beside the word, not on it`, async ({ page }) => {
    await drive(page, 'reader-context-menu', size);
    const menu = page.getByRole('menu').filter({ has: page.getByRole('menuitem', { name: 'Mark as' }) });
    const g = await menu.evaluate((popup) => {
      const words = window.getSelection()!.getRangeAt(0).getBoundingClientRect();
      const box = popup.getBoundingClientRect();
      return {
        rows: popup.querySelectorAll('[role="menuitem"]').length,
        above: Math.round(words.top - box.bottom),
        below: Math.round(box.top - words.bottom),
        overlaps: box.left < words.right && box.right > words.left && box.top < words.bottom && box.bottom > words.top,
      };
    });
    expect.soft(g.overlaps, 'the menu covers the selected word').toBe(false);
    const near = (gap: number) => gap >= 0 && gap <= 16;
    expect.soft(near(g.above) || near(g.below), `next to the word (${g.above} px above, ${g.below} px below)`).toBe(true);
    expect.soft(g.rows, 'rows in the menu').toBeLessThanOrEqual(10);
  });
}

test('rail-words at 768: the toolbar is not drawn over the open drawer', async ({ page }) => {
  await drive(page, 'rail-words', { width: 768, height: 1024 });
  await expect(page.getByRole('toolbar', { name: 'Selection tools' })).toHaveCount(0);
});

// XSC-42: the loading frame is the loaded page's: a 65 px header with its rule in the reader and the rail, the key's strip under the list.
test('loading at 1440: the skeleton panels have the loaded headers and the key strip', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await settlePage(page);
  await scriptDrivers.loading!(page);
  const g = await page.getByRole('group', { name: 'Loading the Script' }).evaluate((region) => {
    const [list, reader, rail] = [...region.children].filter((child) => child.getBoundingClientRect().width > 0);
    const strip = (el: Element | undefined) => {
      const style = el ? getComputedStyle(el) : null;
      return el ? { height: Math.round(el.getBoundingClientRect().height), rule: style!.borderBottomWidth } : null;
    };
    const foot = list!.lastElementChild!;
    return { reader: strip(reader!.firstElementChild!), rail: strip(rail!.firstElementChild!), footRule: getComputedStyle(foot).borderTopWidth };
  });
  expect.soft(g.reader, "the reader's header").toEqual({ height: 65, rule: '1px' });
  expect.soft(g.rail, "the rail's tab strip").toEqual({ height: 65, rule: '1px' });
  expect.soft(g.footRule, "the list's key strip").toBe('1px');
});
