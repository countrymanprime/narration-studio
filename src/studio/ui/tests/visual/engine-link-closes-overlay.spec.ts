import { expect, test, type Page } from '@playwright/test';

// #3416 item 60: the "Open the audio engine panel" pointer inside a slide-over opened the engine panel and left the slide-over under it. It closes the slide-over,
// and closing the engine panel puts focus where the slide-over was handing it (the control that opened it), not on the page.
const dialogs = (page: Page) =>
  page.getByRole('dialog').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('aria-label') ?? node.textContent?.slice(0, 30) ?? ''));
const focused = (page: Page) =>
  page.evaluate(() => {
    const active = document.activeElement as HTMLElement | null;
    return {
      tag: active?.tagName,
      label: (active?.getAttribute('aria-label') ?? active?.textContent ?? '').slice(0, 50),
      inMain: Boolean(active?.closest('main')) && active?.tagName !== 'MAIN',
    };
  });

test('Stage readiness: the engine pointer closes the evidence slide-over and Escape returns to the Why button', async ({ page }) => {
  await page.goto('/proof/chapter-9?mockProofingSignal=unmapped-track');
  await page
    .getByText(/no track linked/)
    .first()
    .waitFor({ timeout: 20_000 });
  const why = page
    .getByRole('button', { name: /^Why: / })
    .and(page.locator(':visible'))
    .first();
  await why.focus();
  await page.keyboard.press('Enter');
  await page.getByRole('dialog').getByRole('button', { name: 'Open the audio engine panel' }).click();
  await page.getByRole('dialog', { name: 'Audio engine' }).waitFor();
  await page.waitForTimeout(600);
  expect(await page.getByRole('dialog').count(), `open dialogs: ${(await dialogs(page)).join(' | ')}`).toBe(1);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 5_000 });
  await page.waitForTimeout(500);
  const where = await focused(page);
  expect(where.label, `focus is on ${where.tag} "${where.label}"`).toMatch(/^Why: /);
});

test('Editing check from a chapter row: the engine pointer closes the panel and Escape returns to the row', async ({ page }) => {
  await page.goto('/?mockEditingRefusal=multiple_tracks');
  const table = page.getByRole('table', { name: 'Chapter pipeline' });
  await table.waitFor({ timeout: 20_000 });
  const row = table.getByRole('row').nth(2);
  const chapterId = await row.getAttribute('data-chapter-id');
  await row.locator('td').nth(1).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Editing check…' }).click();
  const panel = page.getByRole('dialog', { name: /^Editing check: / });
  await panel.getByRole('button', { name: 'Check editing' }).click();
  await panel.getByRole('button', { name: 'Open the audio engine panel' }).click();
  await page.getByRole('dialog', { name: 'Audio engine' }).waitFor();
  await page.waitForTimeout(600);
  expect(await page.getByRole('dialog').count(), `open dialogs: ${(await dialogs(page)).join(' | ')}`).toBe(1);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 5_000 });
  await page.waitForTimeout(500);
  const inRow = await page.evaluate((id) => Boolean(document.activeElement?.closest(`tr[data-chapter-id="${id}"]`)), chapterId);
  const where = await focused(page);
  expect(inRow, `focus is on ${where.tag} "${where.label}", not in the chapter's row`).toBe(true);
});
