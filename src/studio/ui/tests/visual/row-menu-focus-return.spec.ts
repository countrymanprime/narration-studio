import { expect, test } from '@playwright/test';

// #3416 B5/B6 (narrator walkthroughs on #3424 and #3460): a dialog or panel opened from a Production row's menu gave focus back to <main> or to the header's
// switch-project button, so a narrator working down the board lost their row. It now returns to the control that had focus when the menu opened.
const ITEMS = ['Check recordings', 'Chapter track…', 'Editing check…'];

for (const item of ITEMS) {
  test(`Production: closing "${item}" from the row menu with Escape returns focus to the row's control`, async ({ page }) => {
    await page.goto('/');
    const table = page.getByRole('table', { name: 'Chapter pipeline' });
    await table.waitFor({ timeout: 20_000 });
    // A control inside the second data row (chapter 1): the keyboard opens the menu from the focused element.
    const row = table.getByRole('row').nth(2);
    const control = row.locator('button, a[href]').first();
    await control.focus();
    const label = await control.evaluate((element) => element.getAttribute('aria-label') ?? element.textContent ?? '');
    await page.keyboard.press('Shift+F10');
    await page.getByRole('menuitem', { name: item, exact: false }).first().click();
    await page.waitForTimeout(400);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(600);
    const landed = await page.evaluate(() => {
      const active = document.activeElement as HTMLElement | null;
      return {
        inRow: Boolean(active?.closest('tr[data-chapter-id]')),
        label: active?.getAttribute('aria-label') ?? active?.textContent ?? '',
        tag: active?.tagName,
      };
    });
    expect(landed.inRow, `focus landed on ${landed.tag} "${landed.label}", not in the row (${label})`).toBe(true);
  });
}
