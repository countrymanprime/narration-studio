import { expect, test, type Page } from '@playwright/test';
import { masterDrivers } from './drivers/master';
import { settlePage } from './helpers/settle';

// An approval dialog's decision-critical block (marked `data-decision-critical`: what the narrator approves, such as the DAW FX chain a
// render runs) is in view when the dialog opens, at a small window too: its first lines are the topmost thing at their own points,
// not under the pinned actions or below the dialog's edge, so Approve is never reachable with the block unseen (qa on #2932, B1).
// A new approval dialog with such a block adds its driver here.
const APPROVALS = ['to-spec-approve-daw', 'to-spec-approve-long-chain'] as const;

/** Whether the element's top line is visible: the topmost element a little inside its top-left and top-right corners is inside it. */
const topLineInView = (page: Page, selector: string) =>
  page
    .locator(selector)
    .first()
    .evaluate((element) => {
      const box = element.getBoundingClientRect();
      const y = box.top + Math.min(10, box.height / 2);
      return [box.left + 4, box.right - 4].every((x) => {
        const hit = document.elementFromPoint(x, y);
        return hit !== null && element.contains(hit);
      });
    });

// The chain's row numbers say its order: "10" must not fold into "1" over "0" (seen at 1440 before the column was widened).
test('Master / the approval chain numbers each row on one line / 1440x900', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await settlePage(page);
  await masterDrivers['to-spec-approve-chain-off']!(page);
  const lines = await page
    .getByRole('table', { name: 'FX chain this render runs' })
    .locator('tbody tr td:first-child')
    .evaluateAll((cells) =>
      cells.map((cell) => {
        const range = document.createRange();
        range.selectNodeContents(cell);
        return new Set([...range.getClientRects()].map((rect) => Math.round(rect.top))).size;
      }),
    );
  expect(lines.length).toBeGreaterThan(9);
  expect(Math.max(...lines), 'every row number is one line').toBe(1);
});

for (const state of APPROVALS) {
  test(`Master / ${state}: the approval's decision-critical block is in view when it opens / 360x500`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 500 });
    await page.goto('/');
    await settlePage(page);
    await masterDrivers[state]!(page);
    const dialog = page.getByRole('alertdialog', { name: 'Approve this render?' });
    const blocks = dialog.locator('[data-decision-critical]');
    expect(await blocks.count(), 'the dialog marks what the narrator approves').toBeGreaterThan(0);
    // The label saying how much the chain holds, then its first row.
    expect(await topLineInView(page, '[role="alertdialog"] [data-decision-critical] p'), 'the chain count is in view').toBe(true);
    expect(await topLineInView(page, '[role="alertdialog"] [data-decision-critical] tbody tr'), 'the first effect is in view').toBe(true);
  });
}
