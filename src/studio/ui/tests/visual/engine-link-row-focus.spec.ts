import { expect, test } from '@playwright/test';
import { openEnginePanel } from './drivers/shared';
import { settlePage } from './helpers/settle';

// #3376: Cancel and Clear take their own button off a linked row and draw another (Change, Create) in its place. Focus fell to the panel's
// container, so the next Tab began at the top of the panel instead of at the row.
test('Engine / Chapter links: Cancel hands focus to Change and Clear to Create, with the keyboard', async ({ page }) => {
  await page.goto('/');
  await settlePage(page);
  const panel = await openEnginePanel(page);
  const table = panel.getByRole('table', { name: 'Chapter links' });
  // The first linked row, found by its chapter's name, since its buttons change as it is edited.
  const linked = table
    .locator('tbody tr')
    .filter({ has: page.getByRole('button', { name: /^Change the track for/ }) })
    .first();
  const chapter = (await linked.locator('td').first().innerText()).trim();
  const row = table
    .locator('tbody tr')
    .filter({ has: page.getByRole('cell', { name: chapter, exact: true }) })
    .first();
  await row.getByRole('button', { name: /^Change the track for/ }).focus();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(700);
  await row.getByRole('button', { name: /^Cancel the edit/ }).focus();
  await page.keyboard.press('Enter');
  const change = row.getByRole('button', { name: /^Change the track for/ });
  await expect(change).toBeFocused();
  // The next Tab goes to the row's own next control, not to the top of the panel.
  await page.keyboard.press('Tab');
  await expect(row.getByRole('button', { name: /^Clear the link for/ })).toBeFocused();

  await page.waitForTimeout(700);
  await page.keyboard.press('Enter');
  await expect(row.getByRole('button', { name: /^Create a (track|folder) for/ })).toBeFocused();
});
