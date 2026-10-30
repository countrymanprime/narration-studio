// The reader column follows the window (#2251): Script, Booth and Companion draw their text in the one ReaderColumn, which is the
// narrator's chosen measure or the whole container, whichever is less, centred, never wider than what holds it. One test per width
// class; each measures the real Script page.
import { expect, test } from '@playwright/test';
import { scriptDrivers } from './drivers/script';
import { settlePage } from './helpers/settle';

const WIDTH_CLASSES = [380, 600, 900, 1280, 1920];

for (const width of WIDTH_CLASSES) {
  test(`the Script column at ${width}px is its measure or the container, centred, and inside it`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await settlePage(page);
    await scriptDrivers.reader(page);
    const m = await page.evaluate(() => {
      const column = document.querySelector<HTMLElement>('[data-reader]')!;
      const holder = column.parentElement!;
      const probe = document.createElement('span');
      probe.style.cssText = 'position:absolute;visibility:hidden;width:64ch';
      column.append(probe);
      const measure = probe.getBoundingClientRect().width;
      probe.remove();
      const box = column.getBoundingClientRect();
      const holderBox = holder.getBoundingClientRect();
      const inner = [...column.querySelectorAll<HTMLElement>('*')].map((e) => e.getBoundingClientRect().right).reduce((a, b) => Math.max(a, b), 0);
      return {
        width: box.width,
        measure,
        container: holder.clientWidth,
        leftGap: box.left - holderBox.left,
        rightGap: holderBox.left + holder.clientLeft + holder.clientWidth - box.right,
        scrolls: holder.scrollWidth > holder.clientWidth,
        pageScrolls: document.documentElement.scrollWidth > innerWidth,
        innerRight: inner,
        right: box.right,
      };
    });
    expect(Math.abs(m.width - Math.min(m.measure, m.container))).toBeLessThanOrEqual(1);
    expect(Math.abs(m.leftGap - m.rightGap)).toBeLessThanOrEqual(m.scrolls ? 20 : 1);
    expect(m.scrolls).toBe(false);
    expect(m.pageScrolls).toBe(false);
    // Nothing inside draws past the column's right edge (the My prep control was clipped there at 380).
    expect(m.innerRight).toBeLessThanOrEqual(m.right + 1);
  });
}
