import { expect, test } from '@playwright/test';
import { openEnginePanel } from './drivers/shared';
import { settlePage } from './helpers/settle';

// The engine panel's Chapter links table (alignment audit ENX-1 to ENX-5, ENX-29): one grid for every row, one line of controls per row, and
// nothing wider than the panel. On content-sized columns the Status column moved from row to row, EDITING CHECK… and "Not linked" broke
// onto two lines, Change and Clear stacked, rows were three different heights, and at 390 px the table ran past the panel's right edge.
for (const size of [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'small-desktop', width: 1024, height: 768 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'reflow', width: 390, height: 844 },
]) {
  test(`Engine / Chapter links rows share one grid and fit the panel / ${size.name} ${size.width}x${size.height}`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    // An unset seed boots Chapter 1 linked, so the table holds a linked row beside the unlinked ones.
    await page.goto('/');
    await settlePage(page);
    const panel = await openEnginePanel(page);
    const table = panel.getByRole('table', { name: 'Chapter links' });
    await table.getByRole('button', { name: 'Change' }).waitFor();

    const measured = await table.evaluate((element) => {
      const panelBox = element.closest('[role="dialog"]')!.getBoundingClientRect();
      const rows = [...element.querySelectorAll('tbody tr')].map((row) => {
        const box = row.getBoundingClientRect();
        const status = row.querySelectorAll('td')[1]!.getBoundingClientRect();
        const controls = [...row.querySelectorAll('button, select')].map((control) => control.getBoundingClientRect());
        return {
          height: box.height,
          statusLeft: Math.round(status.left),
          controlsRight: Math.max(...controls.map((control) => control.right)),
          // The number of lines a button label or the status takes, from the line boxes of its text.
          wrapped: [...row.querySelectorAll('button'), row.querySelectorAll('td')[1]!]
            .filter((element) => (element.textContent ?? '').trim() !== '')
            .map((element) => {
              const tops = new Set<number>();
              const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
              for (let node = walker.nextNode(); node; node = walker.nextNode()) {
                const range = document.createRange();
                range.selectNodeContents(node);
                for (const rect of range.getClientRects()) if (rect.width > 0) tops.add(Math.round(rect.top));
              }
              return { text: (element.textContent ?? '').trim(), lines: tops.size };
            })
            .filter((label) => label.lines > 1)
            .map((label) => label.text),
        };
      });
      return { panelRight: panelBox.right, tableRight: element.getBoundingClientRect().right, rows };
    });

    expect(measured.tableRight, 'the table ends inside the panel').toBeLessThanOrEqual(measured.panelRight);
    for (const row of measured.rows) {
      expect(row.controlsRight, 'every control is inside the panel').toBeLessThanOrEqual(measured.panelRight);
      expect(row.wrapped, 'no button label or status wraps').toEqual([]);
    }
    // At 390 px a row is two lines and a long chapter name may take a third, so heights follow the name there.
    if (size.width >= 768) {
      const heights = measured.rows.map((row) => Math.round(row.height));
      expect(Math.max(...heights) - Math.min(...heights), `rows are one height (${heights.join(', ')})`).toBeLessThanOrEqual(2);
      const statusLefts = new Set(measured.rows.map((row) => row.statusLeft));
      expect([...statusLefts], 'the Status column starts at one x in every row').toHaveLength(1);
    }
  });
}
