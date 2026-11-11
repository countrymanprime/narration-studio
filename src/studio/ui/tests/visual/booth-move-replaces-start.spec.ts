// Any move of the reading replaces the chosen start (#3317, #3353): after a refused take or Record from here, a move (the arrow keys) clears the footer's
// "Next roll starts from" and Space starts from the cursor, with no lookup of the old spot. The host calls are read from `?mockCallLog=1`.
import { expect, test, type Page } from '@playwright/test';
import { settlePage } from './helpers/settle';
import { showChapterTop } from './helpers/viewTop';
import { goToPage, selectReaderWord } from './drivers/shared';

test.use({ viewport: { width: 1440, height: 900 } });
test.setTimeout(120_000);

const record = (page: Page) => page.getByRole('button', { name: /^Record$/, includeHidden: true });
const stop = (page: Page) => page.getByRole('button', { name: /^Stop$/ });
const nextRoll = (page: Page) => page.getByText(/Next roll starts from ¶/);
const lookups = (page: Page) => page.evaluate(() => (window.__hostCalls ?? []).filter((call) => call.name === 'boothPunchTarget').length);
const dawRecording = (page: Page) => page.evaluate(() => window.__NARRATION_MOCK_DAW__?.state().recording);
const reading = (page: Page) => page.locator('[data-booth-text] [data-state="cur"]').first().getAttribute('data-unit');

async function arrowDown(page: Page, times: number): Promise<void> {
  for (let i = 0; i < times; i++) await page.keyboard.press('ArrowDown');
}

test('repro A: a refused take keeps its start, the arrow keys replace it and Space starts from the cursor', async ({ page }) => {
  await page.goto('/?mockCallLog=1');
  await settlePage(page);
  await goToPage(page, 'Booth');
  await expect(record(page)).toBeEnabled();
  await showChapterTop(page);
  await page.evaluate(() => window.__NARRATION_MOCK_DAW__?.refuseNextRecord('Disk full.', 'start'));
  await page.locator('[data-booth-text] [data-word]').nth(5).click({ button: 'right' });
  await page
    .getByRole('menuitem', { name: /Start from here/ })
    .first()
    .click();
  await expect(page.getByText('Disk full.').first()).toBeVisible();
  await expect(nextRoll(page)).toBeVisible();
  const chosen = await reading(page);
  await arrowDown(page, 4);
  expect(await reading(page)).not.toBe(chosen);
  await expect(nextRoll(page)).toHaveCount(0);
  const before = await lookups(page);
  await page.keyboard.press('Space');
  await expect(stop(page)).toBeVisible();
  expect(await dawRecording(page)).toBe(true);
  expect(await lookups(page)).toBe(before);
  await expect(page.getByText(/Recording over ¶/)).toHaveCount(0);
});

test('repro B: Record from here on the Script, the arrow keys replace the start and Space starts from the cursor', async ({ page }) => {
  await page.goto('/?mockCallLog=1');
  await settlePage(page);
  await goToPage(page, 'Script');
  await selectReaderWord(page, 'tired');
  await page.getByRole('toolbar', { name: 'Selection tools' }).getByRole('button', { name: 'Record from here' }).click();
  await expect(record(page)).toBeEnabled();
  await expect(nextRoll(page)).toBeVisible();
  const chosen = await reading(page);
  await arrowDown(page, 3);
  expect(await reading(page)).not.toBe(chosen);
  await expect(nextRoll(page)).toHaveCount(0);
  const before = await lookups(page);
  await page.keyboard.press('Space');
  await expect(stop(page)).toBeVisible();
  expect(await dawRecording(page)).toBe(true);
  expect(await lookups(page)).toBe(before);
  await expect(page.getByText(/Recording over ¶/)).toHaveCount(0);
});
