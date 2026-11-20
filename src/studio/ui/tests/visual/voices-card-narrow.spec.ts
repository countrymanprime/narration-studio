// The Voices card's table keeps a readable Track column in a small window, in the Engine panel and in Settings (#3331): its fixed-width columns (Key, Counts as
// voice, the edit button) must leave the Track and Characters columns room, so a name is not one letter per line and no header prints over another.
import { expect, test, type Locator, type Page } from '@playwright/test';
import { settlePage } from './helpers/settle';
import { openEnginePanel, openSettings, showSettingsRow } from './drivers/shared';

const table = (scope: Page | Locator) => scope.getByRole('table', { name: /^Voices of / });

/**
 * What the table draws: a cell whose text runs out of it (a header printed over its neighbour), and a name or chip word that is broken mid-word because its
 * column is too narrow. Header and cell boxes cannot overlap in a table, so overflow is measured on the text.
 */
async function measure(box: Locator) {
  return box.evaluate((el) => {
    const overflowing = [...el.querySelectorAll('th, td')]
      .filter((cell) => cell.scrollWidth > cell.clientWidth + 1)
      .map((cell) => (cell.textContent ?? '').trim().slice(0, 30) || 'a cell');
    const broken: string[] = [];
    for (const cell of el.querySelectorAll('tbody td')) {
      const style = getComputedStyle(cell);
      const room = cell.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      const words: string[] = [];
      const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode())
        if (!node.parentElement?.closest('.sr-only')) words.push(...(node.textContent ?? '').split(/\\s+/).filter(Boolean));
      for (const word of words) {
        const probe = document.createElement('span');
        probe.textContent = word;
        probe.style.cssText = `position:absolute;visibility:hidden;white-space:nowrap;font:${style.font};letter-spacing:${style.letterSpacing};text-transform:${style.textTransform}`;
        cell.append(probe);
        if (probe.getBoundingClientRect().width > room + 1) broken.push(word);
        probe.remove();
      }
    }
    const rows = [...el.querySelectorAll('tbody tr')].map((row) => row.getBoundingClientRect().height);
    // A control in the last cell sits beside the next one on one line, and their boxes do not overlap (the switch's press band must not cover the edit button).
    const crowded: string[] = [];
    for (const row of el.querySelectorAll('tbody tr')) {
      const boxes = [...(row.querySelectorAll('td:last-child [role="switch"], td:last-child button') ?? [])].map((control) => control.getBoundingClientRect());
      const [first, second] = boxes;
      if (
        first &&
        second &&
        (second.top > first.bottom - 4 || first.right > second.left + 1 || Math.abs(first.top + first.height / 2 - (second.top + second.height / 2)) > 12)
      )
        crowded.push((row.textContent ?? '').trim().slice(0, 20));
    }
    return { overflowing, broken, crowded, tallest: Math.max(...rows), wide: el.scrollWidth > el.clientWidth + 1 };
  });
}

for (const { width, height } of [
  { width: 360, height: 500 },
  { width: 320, height: 300 },
]) {
  test(`${width}x${height}: the Voices table keeps a readable Track column in the Engine panel`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/?mockVoiceFolders=1');
    await settlePage(page);
    const panel = await openEnginePanel(page);
    const voices = table(panel);
    await voices.getByRole('row', { name: /Extras/ }).waitFor();
    const m = await measure(voices);
    expect(m.overflowing).toEqual([]);
    expect(m.broken).toEqual([]);
    expect(m.crowded).toEqual([]);
    expect(m.tallest).toBeLessThan(110);
    expect(m.wide).toBe(false);
  });

  test(`${width}x${height}: the Voices table keeps a readable Track column in Settings`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await openSettings(page, 'Recording & DAW', '?mockVoiceFolders=1');
    const row = await showSettingsRow(page, 'daw.voices');
    const voices = table(row);
    await voices.getByRole('row', { name: /Extras/ }).waitFor();
    const m = await measure(voices);
    expect(m.overflowing).toEqual([]);
    expect(m.broken).toEqual([]);
    expect(m.crowded).toEqual([]);
    expect(m.tallest).toBeLessThan(110);
    expect(m.wide).toBe(false);
  });
}
