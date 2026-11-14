import { expect, test } from '@playwright/test';

// #3416 item 55 (qa-breaker on #3468): "Open the audio engine panel" in a refused Check recordings result closed the dialog and opened nothing, because the
// overlay host sits outside the engine panel's provider. It now opens the panel, as the header's engine chip does.
test('Check recordings: "Open the audio engine panel" in a refused result closes the dialog and opens the Audio engine panel', async ({ page }) => {
  await page.goto('/?mockCoverageRefusal=no_project_file');
  const table = page.getByRole('table', { name: 'Chapter pipeline' });
  await table.waitFor({ timeout: 20_000 });
  await table.getByRole('row').nth(2).locator('td').nth(1).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Check recordings' }).click();
  const dialog = page.getByRole('dialog', { name: 'Check recordings' });
  await dialog.waitFor({ timeout: 20_000 });
  await dialog.getByRole('button', { name: /^Check 1 chapter$/ }).click();
  await dialog.getByRole('button', { name: 'Open the audio engine panel' }).click({ timeout: 30_000 });
  await expect(page.getByRole('dialog', { name: 'Check recordings' })).toHaveCount(0, { timeout: 5_000 });
  await expect(page.getByRole('dialog', { name: /Audio engine/ })).toBeVisible({ timeout: 5_000 });
});

// #3416 item 59: closing the engine panel that "Open the audio engine panel" opened from a Check recordings result left focus on the header's
// switch-project button; the narrator was working in a chapter's row. Escape and the Close button both put it back in the row that was checked.
for (const route of ['Escape', 'Close'] as const) {
  test(`Check recordings: ${route} on the engine panel it opened puts focus back in the chapter row`, async ({ page }) => {
    await page.goto('/?mockCoverageRefusal=no_project_file');
    const table = page.getByRole('table', { name: 'Chapter pipeline' });
    await table.waitFor({ timeout: 20_000 });
    const row = table.getByRole('row').nth(2);
    const chapterId = await row.getAttribute('data-chapter-id');
    await row.locator('td').nth(1).click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Check recordings' }).click();
    const dialog = page.getByRole('dialog', { name: 'Check recordings' });
    await dialog.waitFor({ timeout: 20_000 });
    await dialog.getByRole('button', { name: /^Check 1 chapter$/ }).click();
    await dialog.getByRole('button', { name: 'Open the audio engine panel' }).click({ timeout: 30_000 });
    const panel = page.getByRole('dialog', { name: /Audio engine/ });
    await expect(panel).toBeVisible({ timeout: 5_000 });
    if (route === 'Escape') await page.keyboard.press('Escape');
    else await panel.getByRole('button', { name: 'Close the engine panel' }).click();
    await expect(panel).toHaveCount(0, { timeout: 5_000 });
    await page.waitForTimeout(500);
    const landed = await page.evaluate((id) => {
      const active = document.activeElement as HTMLElement | null;
      return {
        inRow: Boolean(active?.closest(`tr[data-chapter-id="${id}"]`)),
        tag: active?.tagName,
        label: (active?.getAttribute('aria-label') ?? active?.textContent ?? '').slice(0, 40),
      };
    }, chapterId);
    expect(landed.inRow, `focus is on ${landed.tag} "${landed.label}", not in the chapter's row`).toBe(true);
  });
}
