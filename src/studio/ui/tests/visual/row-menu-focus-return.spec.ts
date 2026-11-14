import { expect, test, type Page } from '@playwright/test';

// #3416 B5/B6 (narrator walkthroughs on #3424 and #3460): a dialog or panel opened from a Production row's menu gave focus back to <main> or to the header's
// switch-project button, so a narrator working down the board lost their row. It now returns to the control that had focus when the menu opened (a
// keyboard open), or the row's first control (a right-click, which leaves focus on the board's scroll area).
const ITEMS = ['Check recordings', 'Chapter track…', 'Editing check…'];
const CLOSERS = ['Escape', 'Close'] as const;

async function openFromRow(page: Page, item: string, how: 'keyboard' | 'rightclick', rowIndex = 2) {
  await page.goto('/');
  const table = page.getByRole('table', { name: 'Chapter pipeline' });
  await table.waitFor({ timeout: 20_000 });
  // Chapter 1's row (the second data row): the control the keyboard opens the menu from.
  const row = table.getByRole('row').nth(rowIndex);
  const control = row.locator('button, a[href]').first();
  if (how === 'keyboard') {
    await control.focus();
    await page.keyboard.press('Shift+F10');
  } else {
    await row.locator('td').nth(1).click({ button: 'right', timeout: 5000 });
  }
  await page.getByRole('menuitem', { name: item }).first().click();
  await page.waitForTimeout(400);
  return { control, row };
}

for (const item of ITEMS) {
  for (const closer of CLOSERS) {
    test(`Production: closing "${item}" from the row menu with ${closer} returns focus to the control the menu opened from`, async ({ page }) => {
      const { control } = await openFromRow(page, item, 'keyboard');
      if (closer === 'Escape') await page.keyboard.press('Escape');
      else await page.getByRole('button', { name: 'Close', exact: true }).first().click();
      await page.waitForTimeout(600);
      const same = await control.evaluate((element) => element === document.activeElement);
      expect(same, 'focus is on the same control the menu was opened from').toBe(true);
    });
  }

  test(`Production: closing "${item}" opened by a right-click returns focus into the same row`, async ({ page }) => {
    const { row } = await openFromRow(page, item, 'rightclick');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(600);
    const inRow = await row.evaluate((element) => element.contains(document.activeElement));
    expect(inRow, 'focus is inside the row the menu was opened for').toBe(true);
  });
}

// The credits rows' menu has a Credits… item that opens a panel of its own (the opening credits are the first data row).
test('Production: closing "Credits…" from the opening credits row menu returns focus to the control the menu opened from', async ({ page }) => {
  const { control } = await openFromRow(page, 'Credits…', 'keyboard', 1);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
  const same = await control.evaluate((element) => element === document.activeElement);
  expect(same, 'focus is on the same control the menu was opened from').toBe(true);
});
