// The Booth against a mock DAW that moves like the host's (`?mockDaw=`, src/api/dawMock.ts): the owner's own sequence driven through
// the app, and each way REAPER can go wrong around it. Not a screenshot test: it asserts what a narrator sees and can press.
import { expect, test, type Page } from '@playwright/test';
import { settlePage } from './helpers/settle';
import { goToPage } from './drivers/shared';

const record = (page: Page) => page.getByRole('button', { name: /^Record$/ });
const stop = (page: Page) => page.getByRole('button', { name: /^Stop$/ });
const notice = (page: Page) => page.locator('#brec-setup');

async function openLive(page: Page, script: string, extra = ''): Promise<void> {
  await page.goto(`/?mockDaw=${script}${extra}`);
  await settlePage(page);
  await goToPage(page, 'Booth');
  await page.getByRole('button', { name: /^Resume at ¶/ }).waitFor();
}

/** What the mock DAW holds, read through the handle a driver plays REAPER's side with. */
const dawState = (page: Page) => page.evaluate(() => window.__NARRATION_MOCK_DAW__?.state());

// Settings is one step from the Booth's notice: its "Link in Settings" button. The one-click link there is the narrator's, then back.
async function linkProject(page: Page): Promise<void> {
  await notice(page).getByRole('button', { name: 'Link in Settings' }).click();
  await page.getByRole('button', { name: /^Link Alice\.rpp/ }).click();
  await goToPage(page, 'Booth');
  await page.getByRole('button', { name: /^Resume at ¶/ }).waitFor();
}

async function turnOnRecord(page: Page): Promise<void> {
  await expect(notice(page).getByRole('heading', { name: 'Recording in REAPER is experimental' })).toBeVisible();
  await expect(record(page)).toBeDisabled();
  await notice(page).getByRole('button', { name: 'Turn on Record' }).click();
  await expect(notice(page).getByRole('heading', { name: 'Connect REAPER to record' })).toBeVisible();
}

// The owner's exact sequence: Record on, link, set up the launcher, the heartbeat arrives, the notice clears, Record enables.
async function toRecordReady(page: Page): Promise<void> {
  await openLive(page, 'live');
  await turnOnRecord(page);
  await linkProject(page);
  await page.getByRole('button', { name: 'Open in REAPER and connect' }).click();
  await expect(notice(page)).toHaveCount(0, { timeout: 15_000 });
  await expect(record(page)).toBeEnabled();
}

test.describe('Booth with a moving mock DAW', () => {
  test('link, launcher, heartbeat, notice clears, Record enables, a take runs and stops', async ({ page }) => {
    await toRecordReady(page);
    await record(page).click();
    await expect(stop(page)).toBeVisible();
    await expect(page.getByText('REC', { exact: true })).toBeVisible();
    expect((await dawState(page))?.recording).toBe(true);
    await stop(page).click();
    await expect(record(page)).toBeVisible();
    expect((await dawState(page))?.recording).toBe(false);
  });

  test('a REAPER that opens its bridge but never answers keeps the notice up, says so, and Check again does not fake it', async ({ page }) => {
    await openLive(page, 'quiet');
    await turnOnRecord(page);
    await linkProject(page);
    await page.getByRole('button', { name: 'Open in REAPER and connect' }).click();
    await expect(notice(page).getByRole('heading', { name: 'REAPER is not answering' })).toBeVisible({ timeout: 10_000 });
    await notice(page).getByRole('button', { name: 'Check again' }).click();
    await expect(notice(page).getByRole('heading', { name: 'REAPER is not answering' })).toBeVisible();
    await expect(record(page)).toBeDisabled();
    // The heartbeat arrives late, by hand: the notice moves on without a reload.
    await page.evaluate(() => window.__NARRATION_MOCK_DAW__?.heartbeat());
    await expect(notice(page)).toHaveCount(0);
    await expect(record(page)).toBeEnabled();
  });

  test('a launch that is refused says so and leaves a way to try again', async ({ page }) => {
    await openLive(page, 'refuse');
    await turnOnRecord(page);
    await linkProject(page);
    await page.getByRole('button', { name: 'Open in REAPER and connect' }).click();
    await expect(page.getByText(/REAPER could not be started/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open in REAPER and connect' })).toBeEnabled();
  });

  test('a REAPER with another project open refuses Record in a sentence, and the right project clears it', async ({ page }) => {
    await toRecordReady(page);
    await page.evaluate(() => window.__NARRATION_MOCK_DAW__?.openProject('other'));
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page.getByText(/has a different project open than the one linked here/)).toBeVisible();
    await expect(record(page)).toBeDisabled();
    await page.evaluate(() => window.__NARRATION_MOCK_DAW__?.openProject('linked'));
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(record(page)).toBeEnabled();
  });

  test('REAPER killed mid-take: Stop still works, and the Booth says what happened', async ({ page }) => {
    await toRecordReady(page);
    await record(page).click();
    await expect(stop(page)).toBeVisible();
    await page.evaluate(() => window.__NARRATION_MOCK_DAW__?.quiet());
    // A DAW that stopped answering has no take any more: the Booth says so instead of keeping a REC pill it cannot vouch for,
    // and Record is off with the way forward.
    await expect(page.getByText(/REAPER stopped recording/).first()).toBeVisible();
    await expect(stop(page)).toHaveCount(0);
    await expect(record(page)).toBeDisabled();
    await expect(notice(page).getByRole('heading', { name: 'REAPER is not answering' })).toBeVisible();
    await page.evaluate(() => window.__NARRATION_MOCK_DAW__?.heartbeat());
    await expect(record(page)).toBeEnabled();
  });

  test('a stop pressed inside REAPER ends the take here; a lost transport event is healed by the next read', async ({ page }) => {
    await toRecordReady(page);
    await page.evaluate(() => window.__NARRATION_MOCK_DAW__?.dropEvents(true));
    await record(page).click();
    await expect(stop(page)).toBeVisible();
    await page.evaluate(() => window.__NARRATION_MOCK_DAW__?.stopInDaw());
    // The event was lost on purpose; the Booth must still end up showing the truth without a reload.
    await expect(record(page)).toBeVisible({ timeout: 15_000 });
  });

  test('a REAPER that restarts mid-session is followed: quiet, then answering again', async ({ page }) => {
    await toRecordReady(page);
    await page.evaluate(() => window.__NARRATION_MOCK_DAW__?.restart(3000));
    await expect(notice(page)).toBeVisible();
    await expect(record(page)).toBeEnabled({ timeout: 20_000 });
  });

  test('choosing the built-in recorder moves the DAW port: the REAPER notice goes', async ({ page }) => {
    await openLive(page, 'live');
    await notice(page).getByRole('button', { name: 'DAW settings' }).click();
    await page.getByRole('radio', { name: /Built-in/ }).check();
    await goToPage(page, 'Booth');
    await expect(notice(page).getByRole('heading', { name: /REAPER/ })).toHaveCount(0);
  });
});
