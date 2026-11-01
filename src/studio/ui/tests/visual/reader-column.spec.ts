// The reader column follows the window (#2251): Script, Booth and Companion draw their text in the one ReaderColumn, which is the
// narrator's chosen measure or the whole container, whichever is less, centred, never wider than what holds it. One test per page and
// width class; each measures the real page.
import { expect, test, type Page } from '@playwright/test';
import { boothDrivers } from './drivers/booth';
import { scriptDrivers } from './drivers/script';
import { settlePage } from './helpers/settle';

const WIDTH_CLASSES = [380, 600, 900, 1280, 1920];

type Reading = { name: string; column: string; open: (page: Page) => Promise<void> };
const PAGES: Reading[] = [
  {
    name: 'Script',
    column: '[data-reader-column][data-reader]',
    open: async (page) => {
      await page.goto('/');
      await settlePage(page);
      await scriptDrivers.reader(page);
    },
  },
  { name: 'Booth', column: '[data-booth-text] [data-reader-column]', open: (page) => boothDrivers['setup']!(page) },
  { name: 'Companion', column: '[data-reader-column]', open: (page) => boothDrivers['companion-default']!(page) },
];

for (const reading of PAGES) {
  for (const width of WIDTH_CLASSES) {
    test(`the ${reading.name} column at ${width}px is its measure or the container, centred, and inside it`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await reading.open(page);
      const m = await page.evaluate((selector) => {
        const column = document.querySelector<HTMLElement>(selector)!;
        const holder = column.parentElement!;
        const probe = document.createElement('span');
        probe.style.cssText = 'position:absolute;visibility:hidden;width:64ch';
        column.append(probe);
        const measure = probe.getBoundingClientRect().width;
        probe.remove();
        const box = column.getBoundingClientRect();
        const holderBox = holder.getBoundingClientRect();
        const left = holderBox.left + holder.clientLeft + parseFloat(getComputedStyle(holder).paddingLeft);
        const right = holderBox.left + holder.clientLeft + holder.clientWidth - parseFloat(getComputedStyle(holder).paddingRight);
        return {
          width: box.width,
          measure,
          container: right - left,
          leftGap: box.left - left,
          rightGap: right - box.right,
          scrolls: holder.scrollWidth > holder.clientWidth + 1,
          pageScrolls: document.documentElement.scrollWidth > innerWidth,
        };
      }, reading.column);
      expect(Math.abs(m.width - Math.min(m.measure, m.container)), 'the measure or the container, whichever is less').toBeLessThanOrEqual(1);
      expect(Math.abs(m.leftGap - m.rightGap), 'equal room each side').toBeLessThanOrEqual(1);
      expect(m.scrolls, 'nothing scrolls sideways inside its holder').toBe(false);
      expect(m.pageScrolls, 'the page does not scroll sideways').toBe(false);
    });
  }
}

// A token wider than the column (a long URL, a German compound, a title with no break point) wraps inside it instead of running past the
// reader's edge (qa-breaker B1 and B3).
test('the Script wraps a word or a title longer than the column inside it', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 500 });
  await PAGES[0]!.open(page);
  const m = await page.evaluate(() => {
    const column = document.querySelector<HTMLElement>('[data-reader-column][data-reader]')!;
    const paragraph = column.querySelector<HTMLElement>('[data-pid]')!;
    const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
    walker.nextNode()!.textContent = 'W'.repeat(80);
    const title = column.querySelector<HTMLElement>('[data-chapter-id] h2')!;
    title.textContent = 'Chapter 1: ' + 'Supercalifragilisticexpialidocious'.repeat(4);
    const edge = column.getBoundingClientRect().right;
    return { paragraph: paragraph.getBoundingClientRect().right - edge, title: title.getBoundingClientRect().right - edge };
  });
  expect(m.paragraph, 'the paragraph ends inside the column').toBeLessThanOrEqual(1);
  expect(m.title, 'the chapter title ends inside the column').toBeLessThanOrEqual(1);
});
