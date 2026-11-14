import { expect, test } from '@playwright/test';

// #3416 item 53 (qa-breaker on #3467): Chapter track… then Remove from recording… then confirming takes the chapter's row off the board; focus fell to the header's
// switch-project button. The narrator keeps their place: focus goes to the row that took its place.
test('Removing a chapter from the recording from its row menu leaves focus on the board, not the header', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 700 });
  await page.goto('/');
  const table = page.getByRole('table', { name: 'Chapter pipeline' });
  await table.waitFor({ timeout: 20_000 });
  const row = table.locator('tr[data-chapter-id]').nth(3);
  const chapterId = await row.getAttribute('data-chapter-id');
  const nextId = await table.locator('tr[data-chapter-id]').nth(4).getAttribute('data-chapter-id');
  const control = row.locator('button, a[href]').first();
  await control.focus();
  await page.keyboard.press('Shift+F10');
  await page.getByRole('menuitem', { name: 'Chapter track…' }).first().click();
  await page.getByRole('button', { name: /Remove from recording…/ }).click({ timeout: 20_000 });
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: /^Remove from recording$/ })
    .click();
  await page.waitForTimeout(1500);
  const landed = await page.evaluate(
    ({ id, next }) => {
      const active = document.activeElement as HTMLElement | null;
      return {
        inNextRow: Boolean(active?.closest(`tr[data-chapter-id="${next}"]`)),
        onBoard: Boolean(active?.closest('table[aria-label="Chapter pipeline"]')),
        removedStillThere: Boolean(document.querySelector(`tr[data-chapter-id="${id}"]`)),
        tag: active?.tagName,
        label: (active?.getAttribute('aria-label') ?? active?.textContent ?? '').slice(0, 40),
      };
    },
    { id: chapterId, next: nextId },
  );
  expect(landed.inNextRow, `focus is on ${landed.tag} "${landed.label}", not on the next chapter's row`).toBe(true);
  expect(
    landed.onBoard,
    `focus is on ${landed.tag} "${landed.label}", not on the board (the removed chapter's row is ${landed.removedStillThere ? 'still' : 'no longer'} drawn)`,
  ).toBe(true);
});

// qa-breaker on #3473: with the neighbours scrolled out of a windowed list while the question is open, nothing is left to focus; the board's scroll area, not the header.
test('Removing a chapter whose neighbours are not drawn leaves focus on the board scroll area', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 700 });
  await page.goto('/?mockBooth=many-chapters');
  const table = page.getByRole('table', { name: 'Chapter pipeline' });
  await table.waitFor({ timeout: 20_000 });
  const rowControl = table.locator('tr[data-chapter-id]').nth(3).locator('button, a[href]').first();
  await rowControl.focus();
  await page.keyboard.press('Shift+F10');
  await page.getByRole('menuitem', { name: 'Chapter track…' }).first().click();
  await page.getByRole('button', { name: /Remove from recording…/ }).click({ timeout: 20_000 });
  // Scroll the board away behind the open question so neither neighbour is drawn.
  await page.evaluate(() => {
    const area = document.querySelector('[aria-label="Chapter pipeline scroll area"]');
    let node: Element | null = area;
    while (node) {
      if (node.scrollHeight > node.clientHeight + 50) (node as HTMLElement).scrollTop = node.scrollHeight;
      node = node.parentElement;
    }
  });
  await page.waitForTimeout(500);
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: /^Remove from recording$/ })
    .click();
  await page.waitForTimeout(1500);
  const where = await page.evaluate(() => {
    const active = document.activeElement as HTMLElement | null;
    return { onBoard: Boolean(active?.closest('[data-pipeline]')), label: active?.getAttribute('aria-label') ?? active?.tagName };
  });
  expect(where.onBoard, `focus is on "${where.label}", not on the board`).toBe(true);
});
