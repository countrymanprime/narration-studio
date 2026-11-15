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
  const create = row.getByRole('button', { name: /^Create a (track|folder) for/ });
  await expect(create).toBeFocused();
  // And the next Tab goes on from the row (the row's More actions), not back to the top of the panel.
  await page.keyboard.press('Tab');
  await expect(row.getByRole('button', { name: /^More actions for/ })).toBeFocused();
});

// A Cancel on one row must not take focus back from a Clear on another row pressed within the next few seconds.
test('Engine / Chapter links: a Clear on a second row keeps its own hand-back after a Cancel on the first', async ({ page }) => {
  await page.goto('/');
  await settlePage(page);
  const panel = await openEnginePanel(page);
  const table = panel.getByRole('table', { name: 'Chapter links' });
  const linked = table.locator('tbody tr').filter({ has: page.getByRole('button', { name: /^Change the track for/ }) });
  const first = (await linked.nth(0).locator('td').first().innerText()).trim();
  const second = (await linked.nth(1).locator('td').first().innerText()).trim();
  const rowOf = (name: string) =>
    table
      .locator('tbody tr')
      .filter({ has: page.getByRole('cell', { name, exact: true }) })
      .first();

  await rowOf(first)
    .getByRole('button', { name: /^Change the track for/ })
    .focus();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(700);
  await rowOf(first)
    .getByRole('button', { name: /^Cancel the edit/ })
    .focus();
  await page.keyboard.press('Enter');
  await expect(rowOf(first).getByRole('button', { name: /^Change the track for/ })).toBeFocused();

  await rowOf(second)
    .getByRole('button', { name: /^Clear the link for/ })
    .focus();
  await page.keyboard.press('Enter');
  await expect(rowOf(second).getByRole('button', { name: /^Create a (track|folder) for/ })).toBeFocused();
  await expect(rowOf(first).getByRole('button', { name: /^Change the track for/ })).not.toBeFocused();
});
