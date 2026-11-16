// The leave question follows the DAW while it is open (#3555 item 2): a question that says "REAPER is recording" or "may still be recording" is asked again, in the
// words that are true, when the DAW goes quiet or answers with a take of its own, so Stop and leave never leaves a DAW that records with no stop and no word.
import { expect, test, type Page } from '@playwright/test';
import { enterHoldOver } from './helpers/enterHold';
import { pastStartGuard } from './helpers/startGuard';
import { settlePage } from './helpers/settle';
import { goToPage } from './drivers/shared';

test.use({ viewport: { width: 1440, height: 900 } });
test.setTimeout(60_000);

const record = (page: Page) => page.getByRole('button', { name: /^Record$/, includeHidden: true });
const stop = (page: Page) => page.getByRole('button', { name: /^Stop$/ });
const daw = (page: Page) => ({
  quiet: () => page.evaluate(() => window.__NARRATION_MOCK_DAW__?.quiet()),
  heartbeat: () => page.evaluate(() => window.__NARRATION_MOCK_DAW__?.heartbeat()),
  startInDaw: () => page.evaluate(() => window.__NARRATION_MOCK_DAW__?.startInDaw()),
  recording: () => page.evaluate(() => window.__NARRATION_MOCK_DAW__?.state().recording),
});
const stops = (page: Page) => page.evaluate(() => (window.__hostCalls ?? []).filter((call) => call.name === 'readAloudRecordStop').length);

async function recording(page: Page): Promise<void> {
  await page.goto('/?mockCallLog=1');
  await settlePage(page);
  await goToPage(page, 'Booth');
  await expect(record(page)).toBeEnabled();
  await record(page).click();
  await expect(stop(page)).toBeVisible();
  await expect.poll(() => daw(page).recording()).toBe(true);
  await pastStartGuard(page);
}

test('Stop and leave on the question for a take that may still run stops a take REAPER started since, and does not leave it recording', async ({ page }) => {
  await recording(page);
  await daw(page).quiet();
  await page.keyboard.press('Escape');
  const unconfirmed = page.getByRole('alertdialog', { name: 'Leave for Script?' });
  await expect(unconfirmed).toBeVisible();
  await expect(unconfirmed).toContainText('may still be recording');
  await daw(page).heartbeat();
  await daw(page).startInDaw();
  await expect.poll(() => daw(page).recording()).toBe(true);
  await enterHoldOver(unconfirmed);
  await unconfirmed.getByRole('button', { name: 'Stop and leave' }).click();
  await expect.poll(() => page.evaluate(() => window.location.pathname)).toBe('/script');
  expect(await stops(page)).toBeGreaterThan(0);
  expect(await daw(page).recording()).toBe(false);
});

test('a question that says REAPER is recording is asked again, as the unconfirmed one, when the DAW goes quiet', async ({ page }) => {
  await recording(page);
  await page.keyboard.press('Escape');
  const running = page.getByRole('alertdialog', { name: 'Stop recording?' });
  await expect(running).toBeVisible();
  await expect(running).toContainText('REAPER is recording');
  await daw(page).quiet();
  const unconfirmed = page.getByRole('alertdialog', { name: 'Leave for Script?' });
  await expect(unconfirmed).toBeVisible();
  await expect(unconfirmed).not.toContainText('REAPER is recording');
  await expect(unconfirmed.getByRole('button', { name: 'Stay' })).toBeVisible();
  await expect(unconfirmed.getByRole('button', { name: 'Keep recording' })).toHaveCount(0);
});
