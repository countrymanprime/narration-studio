import { expect, test, type Page } from '@playwright/test';
import { proofChapterDrivers } from './drivers/proof-chapter';
import { settlePage } from './helpers/settle';

// The Proof chapter view's Preview card, measured (alignment audit XPC-2, XPC-3, XPC-4, R3PC-1, R3PC-2, R3PC-12, R4PC-3).

async function drive(page: Page, state: string, size = { width: 1440, height: 900 }): Promise<void> {
  await page.setViewportSize(size);
  await page.goto('/');
  await settlePage(page);
  await proofChapterDrivers[state](page);
}

const table = (page: Page) => page.getByRole('table', { name: 'Preview candidates' });
const headerLefts = (page: Page) =>
  table(page)
    .locator('thead th')
    .evaluateAll((cells) => cells.map((cell) => Math.round(cell.getBoundingClientRect().left)));

test('Proof chapter / the Preview columns stand in one place whatever the candidates say', async ({ page }) => {
  await drive(page, 'preview-default');
  const lefts = await headerLefts(page);
  for (const state of ['preview-shorter', 'preview-warnings']) {
    await drive(page, state);
    expect(await headerLefts(page), state).toEqual(lefts);
  }
});

test('Proof chapter / the Preview table starts at the card title and its row actions end at the card edge, 32 px each', async ({ page }) => {
  await drive(page, 'preview-default');
  const card = page.getByRole('region', { name: 'Preview' });
  const title = (await card.getByRole('heading', { name: 'Preview' }).boundingBox())!;
  const first = table(page).locator('thead th').first();
  const textLeft = await first.evaluate((cell) => cell.getBoundingClientRect().left + parseFloat(getComputedStyle(cell).paddingLeft));
  expect(Math.abs(textLeft - title.x), 'the first column starts at the title').toBeLessThanOrEqual(1);
  const box = (await card.boundingBox())!;
  for (const row of await table(page).locator('tbody tr').all()) {
    const buttons = row.getByRole('button');
    if ((await buttons.count()) === 0) continue;
    const last = (await buttons.last().boundingBox())!;
    expect(box.x + box.width - 1 - 16 - (last.x + last.width), 'the actions end 16 px in from the card edge').toBeLessThanOrEqual(1);
    expect(last.height, 'a row action is 32 px').toBeLessThanOrEqual(32);
  }
});

test('Proof chapter / the Paragraphs column says the range, and a reason every candidate shares is said once', async ({ page }) => {
  await drive(page, 'preview-default');
  for (const cell of await table(page).locator('tbody tr td:nth-child(2)').all()) expect(await cell.innerText()).toMatch(/^\d+(–\d+)?$/);
  await expect(table(page).getByText('Starts and ends on paragraph boundaries.')).toHaveCount(0);
});

test('Proof chapter / a candidate warning is its own line under the chapter', async ({ page }) => {
  await drive(page, 'preview-warnings');
  const warning = table(page).getByText(/imported before chapters were classified/);
  const cell = warning.locator('xpath=ancestor::td[1]');
  expect(await cell.getAttribute('colspan')).toBe('6');
});

test('Proof chapter / a Preview with no manuscript offers the way to import one', async ({ page }) => {
  await drive(page, 'preview-no-manuscript');
  await expect(page.getByRole('region', { name: 'Preview' }).getByRole('button', { name: 'Open Production' })).toBeVisible();
});
