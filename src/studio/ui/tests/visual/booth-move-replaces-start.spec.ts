// Any move of the reading chooses the start (#3858, was #3317 and #3353): after a refused take or Record from here, a move (the arrow keys) is the new
// start, and Space looks exactly that spot up. The host calls are read from `?mockCallLog=1`.
import { expect, test, type Page } from '@playwright/test';
import { settlePage } from './helpers/settle';
import { showChapterTop } from './helpers/viewTop';
import { goToPage, selectReaderWord } from './drivers/shared';

test.use({ viewport: { width: 1440, height: 900 } });
test.setTimeout(120_000);

const record = (page: Page) => page.getByRole('button', { name: /^Record$/, includeHidden: true });
const stop = (page: Page) => page.getByRole('button', { name: /^Stop$/ });
const lookups = (page: Page) => page.evaluate(() => (window.__hostCalls ?? []).filter((call) => call.name === 'boothPunchTarget').length);
const dawRecording = (page: Page) => page.evaluate(() => window.__NARRATION_MOCK_DAW__?.state().recording);
const reading = (page: Page) => page.locator('[data-booth-text] [data-state="cur"]').first().getAttribute('data-unit');

async function arrowDown(page: Page, times: number): Promise<void> {
  for (let i = 0; i < times; i++) await page.keyboard.press('ArrowDown');
}

test('repro A: a refused take keeps its start, the arrow keys move it to the reading and Space starts there (#3858)', async ({ page }) => {
  await page.goto('/?mockCallLog=1');
  await settlePage(page);
  await goToPage(page, 'Booth');
  await expect(record(page)).toBeEnabled();
  await showChapterTop(page);
  await page.evaluate(() => window.__NARRATION_MOCK_DAW__?.refuseNextRecord('Disk full.', 'start'));
  await page.locator('[data-booth-text] [data-word]').nth(5).click();
  await page.keyboard.press('Space'); // a click only chooses the start: Record starts the take, from there
  await expect(page.getByText('Disk full.').first()).toBeVisible();
  const chosen = await reading(page);
  await arrowDown(page, 4);
  expect(await reading(page)).not.toBe(chosen);
  // A move is the narrator's choice of start (the cursor is the only mark): Record looks exactly that spot up once.
  const before = await lookups(page);
  await page.keyboard.press('Space');
  await expect(stop(page)).toBeVisible();
  expect(await dawRecording(page)).toBe(true);
  expect(await lookups(page)).toBe(before + 1);
});

test('repro B: Record from here on the Script, the arrow keys move the start to the reading and Space starts there (#3858)', async ({ page }) => {
  await page.goto('/?mockCallLog=1');
  await settlePage(page);
  await goToPage(page, 'Script');
  await selectReaderWord(page, 'tired');
  await page.getByRole('toolbar', { name: 'Selection tools' }).getByRole('button', { name: 'Record from here' }).click();
  await expect(record(page)).toBeEnabled();
  const chosen = await reading(page);
  await arrowDown(page, 3);
  expect(await reading(page)).not.toBe(chosen);
  // A move is the narrator's choice of start (the cursor is the only mark): Record looks exactly that spot up once.
  const before = await lookups(page);
  await page.keyboard.press('Space');
  await expect(stop(page)).toBeVisible();
  expect(await dawRecording(page)).toBe(true);
  expect(await lookups(page)).toBe(before + 1);
});

test('after a take, going back to the phrase the chapter opened on chooses it, as the take now continues from where it stopped (#3858)', async ({ page }) => {
  await page.goto('/?mockCallLog=1');
  await settlePage(page);
  await goToPage(page, 'Booth');
  await expect(record(page)).toBeEnabled();
  await showChapterTop(page);
  const opened = await reading(page);
  await page.keyboard.press('Space');
  await expect(stop(page)).toBeVisible();
  await expect.poll(() => reading(page), { timeout: 60_000 }).not.toBe(opened); // the voice carries the reading on
  await page.keyboard.press('Space');
  await expect(record(page)).toBeVisible();
  const stopped = await reading(page);
  for (let i = 0; i < 20 && (await reading(page)) !== opened; i++) await page.keyboard.press('ArrowUp');
  expect(await reading(page)).toBe(opened);
  const before = await lookups(page);
  await page.keyboard.press('Space');
  await expect(stop(page)).toBeVisible();
  expect(await lookups(page)).toBe(before + 1);
  expect(stopped).not.toBe(opened);
});
