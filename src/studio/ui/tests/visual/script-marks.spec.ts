// The Script's two mark dialogs (#2251, alignment audit docs/research/alignment-audit/findings/script.md XSC-2, XSC-3, XSC-37 and
// settings.md XSE1-11, R3SE1-3): "Define how you mark up" keeps each mark on one grid with its delete button in the mark's first row
// at every width, its controls one height, its columns named and its Add button labelled; the composer's title says what it does.
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
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
]) {
  test(`define-marks at ${size.width}: each mark's controls share one row grid and one height`, async ({ page }) => {
    await drive(page, 'define-marks', size);
    const dialog = page.getByRole('dialog', { name: 'Define how you mark up' });
    const rows = await dialog.locator('li').evaluateAll((items) =>
      items.map((li) => {
        const box = (sel: string) => li.querySelector(sel)!.getBoundingClientRect();
        const name = box('input[aria-label="Mark name"]');
        const colour = box('select[aria-label="Colour"]');
        const line = box('select[aria-label="Line"]');
        const remove = box('button[aria-label="Remove"]');
        return {
          nameTop: Math.round(name.top),
          removeTop: Math.round(remove.top),
          nameLeft: Math.round(name.left),
          colourLeft: Math.round(colour.left),
          heights: [name.height, colour.height, line.height, remove.height].map(Math.round),
          oneLine: Math.round(colour.top) === Math.round(name.top),
        };
      }),
    );
    expect(rows.length, 'the six marks are listed').toBeGreaterThan(1);
    for (const row of rows) {
      // XSE1-11 / XSC-2: the delete button is never on a line of its own.
      expect.soft(row.removeTop, 'delete sits on the name row').toBe(row.nameTop);
      // R3SE1-3 / XSC-3: one control height in the row.
      expect.soft(new Set(row.heights).size, `one control height (${row.heights.join(', ')})`).toBe(1);
      // A second line starts under the name, not under the swatch (XSE1-11 at 390).
      if (!row.oneLine) expect.soft(row.colourLeft, 'the second line starts under the name').toBe(row.nameLeft);
    }
    expect.soft(new Set(rows.map((row) => row.oneLine)).size, 'every mark has the same layout').toBe(1);
    if (size.width >= 768) {
      expect.soft(rows[0]!.oneLine, 'one line per mark at this width').toBe(true);
      // XSC-3: the columns say what they hold.
      for (const head of ['Name', 'Colour', 'Line', 'Asks']) await expect.soft(dialog.getByText(head, { exact: true }).first()).toBeVisible();
    }
    // XSC-3: Add says what it adds.
    await expect.soft(dialog.getByRole('button', { name: 'Add a mark' })).toHaveText(/Add a mark/);
  });

  // XSC-37: the composer's title says it marks the words, not just the words.
  test(`mark-composer at ${size.width}: the title names the action`, async ({ page }) => {
    await drive(page, 'mark-composer', size);
    await expect(page.getByRole('dialog')).toHaveAccessibleName(/^Mark “Rabbit”$/);
  });
}
