import { expect, test } from '@playwright/test';

// #3416 item 69 (qa-breaker on #3469): a dialog opened from the jump menu ("Show keyboard shortcuts") returned focus to <main>, so the next Tab reached the header's
// switch-project button. It returns to the control that had focus before the jump menu opened, as "Open the undo history" does.
for (const [command, dialog] of [
  ['keyboard shortcuts', /keyboard shortcuts/i],
  ['undo history', /undo history/i],
  ['Check recordings', /^Check recordings$/],
  ['Export status report', /Export status report/i],
] as const) {
  test(`${command} from the jump menu: Escape puts focus back where it was before the menu`, async ({ page }) => {
    await page.setViewportSize({ width: 1100, height: 700 });
    await page.goto('/');
    const table = page.getByRole('table', { name: 'Chapter pipeline' });
    await table.waitFor({ timeout: 20_000 });
    const control = table.getByRole('row').nth(2).locator('button, a[href]').first();
    await control.focus();
    // The control is marked so that focus is compared by identity, not by its label.
    await control.evaluate((node) => node.setAttribute('data-focus-before-menu', ''));
    const before = await control.evaluate((node) => node.getAttribute('aria-label') ?? node.textContent ?? '');
    await page.keyboard.press('Control+K');
    await page.getByRole('dialog', { name: /Jump menu/i }).waitFor();
    await page.waitForTimeout(400);
    await page.keyboard.type(command);
    await page.waitForTimeout(300);
    await page.keyboard.press('Enter');
    const shortcuts = page.getByRole('dialog', { name: dialog });
    await shortcuts.waitFor({ timeout: 10_000 });
    await page.waitForTimeout(500);
    await page.keyboard.press('Escape');
    await expect(shortcuts).toHaveCount(0, { timeout: 5_000 });
    await page.waitForTimeout(500);
    const after = await page.evaluate(() => {
      const active = document.activeElement as HTMLElement | null;
      return {
        marked: active?.hasAttribute('data-focus-before-menu') ?? false,
        tag: active?.tagName,
        label: (active?.getAttribute('aria-label') ?? active?.textContent ?? '').slice(0, 40),
      };
    });
    expect(after.marked, `focus is on ${after.tag} "${after.label}", not on the control that had it before the menu ("${before.slice(0, 40)}")`).toBe(true);
  });
}
