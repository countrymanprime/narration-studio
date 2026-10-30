// One reading column for the Script and the Booth (owner rule): both pages draw it with ReaderColumn, centred in their text area, and the
// Column width choice (Narrow 48, Medium 64, Wide 80, Full 100) narrows it symmetrically. The Booth's type is larger than the Script's, so
// the characters a line differ in pixels; the share of the container is what the two pages have in common, so the check holds each page to
// its own rule (centred, no wider than its container, equal room each side) and holds the two pages to each other where the share is the cap.
import { expect, test, type Page } from '@playwright/test';
import { boothDrivers } from './drivers/booth';
import { goToPage } from './drivers/shared';

const WINDOWS = [1920, 1440, 1100, 700];
const CHOICES = [
  ['Narrow', 48],
  ['Medium', 64],
  ['Wide', 80],
  ['Full', 100],
] as const;
type Which = 'script' | 'booth';
type Measure = { left: number; right: number; width: number; container: number; ch: number };

async function open(page: Page, which: Which, choice: number): Promise<void> {
  await page.addInitScript(
    (w) => window.localStorage.setItem('narration.script.text', JSON.stringify({ font: 'Georgia', size: 20, spacing: 1.7, width: w })),
    choice,
  );
  if (which === 'booth') await boothDrivers['setup']!(page);
  else {
    await page.goto('/');
    await goToPage(page, 'Script');
  }
}

/** The column's room to the left and right of it inside its container's content box, its width, that box's width and one `ch` of its type. */
async function measure(page: Page, which: Which): Promise<Measure> {
  return page.evaluate((w) => {
    const el = document.querySelector<HTMLElement>(w === 'booth' ? '[data-booth-text] [data-reader-column]' : '[data-reader-column][data-reader]')!;
    const parent = el.parentElement!;
    const style = getComputedStyle(parent);
    const box = parent.getBoundingClientRect();
    const column = el.getBoundingClientRect();
    // The content box without a scrollbar: the Script's scroller keeps one at the right.
    const left = box.left + parent.clientLeft + parseFloat(style.paddingLeft);
    const right = box.left + parent.clientLeft + parent.clientWidth - parseFloat(style.paddingRight);
    const probe = document.createElement('span');
    probe.style.cssText = 'position:absolute;visibility:hidden;width:100ch';
    el.appendChild(probe);
    const ch = probe.getBoundingClientRect().width / 100;
    probe.remove();
    return { left: column.left - left, right: right - column.right, width: column.width, container: right - left, ch };
  }, which);
}

for (const which of ['script', 'booth'] as const) {
  for (const window of WINDOWS) {
    test(`${which} at ${window}: the column is centred and Narrow to Full widen it symmetrically`, async ({ page }) => {
      const widths: number[] = [];
      for (const [name, choice] of CHOICES) {
        const fresh = await page.context().newPage();
        await fresh.setViewportSize({ width: window, height: 900 });
        await open(fresh, which, choice);
        const m = await measure(fresh, which);
        await fresh.close();
        expect(Math.abs(m.left - m.right), `${name}: equal room on both sides`).toBeLessThanOrEqual(1);
        expect(m.left, `${name}: inside its container`).toBeGreaterThanOrEqual(-1);
        const expected = Math.min(choice * m.ch, (choice / 100) * m.container);
        expect(Math.abs(m.width - expected), `${name}: the column is the characters a line or its share of the container`).toBeLessThanOrEqual(2);
        // Full runs the whole text area whenever 100 characters do not fit in it.
        if (name === 'Full' && 100 * m.ch >= m.container) expect(m.left, 'Full spans the whole text area').toBeLessThanOrEqual(1);
        widths.push(m.width);
      }
      for (let i = 1; i < widths.length; i++) expect(widths[i]!, 'each choice is wider than the one before').toBeGreaterThanOrEqual(widths[i - 1]!);
      expect(widths[3]!, 'Full is wider than Narrow').toBeGreaterThan(widths[0]!);
    });
  }
}

// Where the share of the container is the cap (a narrow window), the two pages draw the same fraction of their text area.
for (const [name, choice] of CHOICES) {
  test(`at 700: ${name} is the same share of the text area on the Script and the Booth`, async ({ page }) => {
    const share: Record<Which, number> = { script: 0, booth: 0 };
    for (const which of ['script', 'booth'] as const) {
      const fresh = await page.context().newPage();
      await fresh.setViewportSize({ width: 700, height: 900 });
      await open(fresh, which, choice);
      const m = await measure(fresh, which);
      await fresh.close();
      share[which] = m.width / m.container;
    }
    expect(share.booth).toBeCloseTo(share.script, 1);
  });
}
