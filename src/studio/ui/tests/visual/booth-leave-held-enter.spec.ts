// A held Enter on "Keep recording" answers the question once; its key repeats must not press the control focus goes back to, which is Stop while a take
// runs (#3555 item 1). Real auto-repeat: Playwright's `keyboard.down` on a key already down sends `autoRepeat`, so the page sees `KeyboardEvent.repeat`.
import { expect, test, type Page } from '@playwright/test';
import { enterHoldOver } from './helpers/enterHold';
import { pastStartGuard } from './helpers/startGuard';
import { settlePage } from './helpers/settle';
import { goToPage } from './drivers/shared';

test.use({ viewport: { width: 1440, height: 900 } });
test.setTimeout(60_000);

const record = (page: Page) => page.getByRole('button', { name: /^Record$/, includeHidden: true });
const stop = (page: Page) => page.getByRole('button', { name: /^Stop$/ });
const question = (page: Page) => page.getByRole('alertdialog', { name: /^Stop recording\?$/ });
const calls = (page: Page, name: string) => page.evaluate((n) => (window.__hostCalls ?? []).filter((call) => call.name === n).length, name);
const dawRecording = (page: Page) => page.evaluate(() => window.__NARRATION_MOCK_DAW__?.state().recording);

async function recording(page: Page): Promise<void> {
  await page.goto('/?mockCallLog=1');
  await settlePage(page);
  await goToPage(page, 'Booth');
  await expect(record(page)).toBeEnabled();
  await record(page).click();
  await expect(stop(page)).toBeVisible();
  await expect.poll(() => dawRecording(page)).toBe(true);
  await pastStartGuard(page);
}

/** Holds a key: down, then the keyboard's repeat delay, then repeats about every 40 ms, then up. */
async function hold(page: Page, key: string, repeats = 12): Promise<void> {
  await page.keyboard.down(key);
  await page.waitForTimeout(500);
  for (let i = 0; i < repeats; i++) {
    await page.waitForTimeout(40);
    await page.keyboard.down(key);
  }
  await page.keyboard.up(key);
}

for (const key of ['Enter', 'Space'] as const) {
  test(`a held ${key} on Keep recording answers once: the take goes on and no stop or start follows`, async ({ page }) => {
    await recording(page);
    const starts = await calls(page, 'readAloudRecordStart');
    await page.keyboard.press('Escape');
    await expect(question(page)).toBeVisible();
    await enterHoldOver(question(page));
    await expect(page.getByRole('button', { name: 'Keep recording' })).toBeFocused();
    await hold(page, key);
    await expect(question(page)).toHaveCount(0);
    expect(await calls(page, 'readAloudRecordStop')).toBe(0);
    expect(await calls(page, 'readAloudRecordStart')).toBe(starts);
    await expect(stop(page)).toBeVisible();
    expect(await dawRecording(page)).toBe(true);
  });
}

// The question for a take whose end the DAW did not confirm: while it is open the DAW answers again, and a held Enter on Stay must not press Record.
test('a held Enter on Stay, the DAW answering again, starts no take', async ({ page }) => {
  await recording(page);
  await page.evaluate(() => window.__NARRATION_MOCK_DAW__?.quiet());
  await page.keyboard.press('Escape');
  const quiet = page.getByRole('alertdialog', { name: 'Leave for Script?' });
  await expect(quiet).toBeVisible();
  await page.evaluate(() => window.__NARRATION_MOCK_DAW__?.heartbeat());
  await enterHoldOver(quiet);
  const starts = await calls(page, 'readAloudRecordStart');
  await expect(page.getByRole('button', { name: 'Stay' })).toBeFocused();
  await hold(page, 'Enter');
  await expect(quiet).toHaveCount(0);
  expect(await calls(page, 'readAloudRecordStart')).toBe(starts);
});
