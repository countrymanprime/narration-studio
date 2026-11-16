import { expect, test } from '@playwright/test';

// #3416 item 38 (qa-breaker on #3460): "Open Proof" and "Open pickups" in a Check recordings result navigated but left the modal open over the new page.
// Every link in the result now closes the dialog as it is followed, as "Open in Editing" already did.
for (const link of ['Open Proof', 'Open pickups']) {
  test(`Check recordings: following "${link}" in a result closes the dialog on the new page`, async ({ page }) => {
    await page.goto('/');
    const table = page.getByRole('table', { name: 'Chapter pipeline' });
    await table.waitFor({ timeout: 20_000 });
    // The row menu opens Check recordings with that chapter ticked alone, so one check gives the chapter's report.
    await table.getByRole('row').nth(2).locator('td').nth(1).click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Check recordings' }).click();
    const dialog = page.getByRole('dialog', { name: 'Check recordings' });
    await dialog.waitFor({ timeout: 20_000 });
    await dialog.getByRole('button', { name: /^Check 1 chapter$/ }).click();
    const follow = dialog.getByRole('link', { name: link });
    await follow.waitFor({ timeout: 30_000 });
    await follow.click();
    await expect(page.getByRole('dialog', { name: 'Check recordings' })).toHaveCount(0, { timeout: 5_000 });
    await expect(page).toHaveURL(link === 'Open Proof' ? /\/proof/ : /\/pickups/);
  });
}
