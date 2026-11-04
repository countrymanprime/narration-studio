import { expect, test, type Page } from '@playwright/test';
import { masterDrivers } from './drivers/master';
import { settlePage } from './helpers/settle';

// An approval dialog's decision-critical block (marked `data-decision-critical`: what the narrator approves, such as the DAW FX chain a
// render runs) is in view when the dialog opens, at a small window too: its first lines are the topmost thing at their own points,
// not under the pinned actions or below the dialog's edge, so Approve is never reachable with the block unseen (qa on #2932, B1).
// At 320x300 and 275x200, too small for that, the confirm stays usable and a pointer beside it names the block above. A new approval
// dialog with such a block adds its driver here.
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
    await expect(dialog.getByRole('button', { name: 'Approve and master' }), 'with the chain in view, Approve is on').toBeEnabled();
    await expect(dialog.getByRole('button', { name: /^See the \d+ effects? above/ }), 'no pointer when the chain is in view').toHaveCount(0);
  });

  // Too small to show the chain under the question (320x300, and 400% zoom at 275x200): Approve is never held, which at 400% zoom
  // would be a dead end (round 3 on #2932, M1); a pointer beside it says how many effects are above and scrolls to them.
  for (const size of [
    { width: 320, height: 300 },
    { width: 275, height: 200 },
  ]) {
    test(`Master / ${state}: Approve stays usable and a pointer names the chain above / ${size.width}x${size.height}`, async ({ page }) => {
      await page.setViewportSize(size);
      await page.goto('/');
      await settlePage(page);
      await masterDrivers[state]!(page);
      const dialog = page.getByRole('alertdialog', { name: 'Approve this render?' });
      if (!(await topLineInView(page, '[role="alertdialog"] [data-decision-critical] tbody tr'))) {
        await expect(dialog.getByRole('button', { name: /^See the \d+ effects? above/ }), 'a pointer names the chain above').toHaveCount(1);
      }
      await expect(dialog.getByRole('button', { name: 'Approve and master' }), 'Approve is never held').toBeEnabled();
    });
  }
}

// The pointer at 320x300 over the long chain counts the switched-off effect too (round 3 walkthrough).
test('Master / the pointer counts a switched-off effect above / 320x300', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 300 });
  await page.goto('/');
  await settlePage(page);
  await masterDrivers['to-spec-approve-long-chain']!(page);
  const dialog = page.getByRole('alertdialog', { name: 'Approve this render?' });
  const pointer = dialog.getByRole('button', { name: 'See the 23 effects above, 1 switched off' });
  await expect(pointer).toBeVisible();
  await pointer.click();
  expect(await topLineInView(page, '[role="alertdialog"] [data-decision-critical] p'), 'the pointer brings the chain into view').toBe(true);
});
