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
