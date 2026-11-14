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
  const landed = await page.evaluate((id) => {
    const active = document.activeElement as HTMLElement | null;
    return {
      onBoard: Boolean(active?.closest('table[aria-label="Chapter pipeline"]')),
      removedStillThere: Boolean(document.querySelector(`tr[data-chapter-id="${id}"]`)),
      tag: active?.tagName,
      label: (active?.getAttribute('aria-label') ?? active?.textContent ?? '').slice(0, 40),
    };
  }, chapterId);
  expect(
    landed.onBoard,
    `focus is on ${landed.tag} "${landed.label}", not on the board (the removed chapter's row is ${landed.removedStillThere ? 'still' : 'no longer'} drawn)`,
  ).toBe(true);
});
