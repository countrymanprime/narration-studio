// The Booth against a mock DAW that moves like the host's (`?mockDaw=`, src/api/dawMock.ts): the owner's own sequence driven through
// the app, and each way REAPER can go wrong around it. Not a screenshot test: it asserts what a narrator sees and can press.
import { expect, test, type Page } from '@playwright/test';
import { pastStartGuard } from './helpers/startGuard';
import { settlePage } from './helpers/settle';
import { goToPage } from './drivers/shared';

// includeHidden: the connect dialog hides the page behind it from the accessibility tree, and Record is still there, disabled.
const record = (page: Page) => page.getByRole('button', { name: /^Record$/, includeHidden: true });
const stop = (page: Page) => page.getByRole('button', { name: /^Stop$/ });
const notice = (page: Page) => page.locator('#brec-setup');
// REAPER not connected is a quiet mark in the notice's place and a dialog that opens by itself once (after the connect grace for a linked project).
const dialog = (page: Page) => page.getByRole('dialog', { name: /is not connected/ });

/** Opens the connect dialog from its mark when it is not open (a linked project waits for the grace before it opens by itself). */
async function openConnect(page: Page): Promise<void> {
  if (!(await dialog(page).isVisible())) await notice(page).getByRole('button').click();
  await expect(dialog(page)).toBeVisible();
}

/** Presses Open in REAPER and connect in the dialog. */
async function startReaper(page: Page): Promise<void> {
  await openConnect(page);
  await dialog(page).getByRole('button', { name: 'Open in REAPER and connect' }).click();
}

async function openLive(page: Page, script: string, extra = ''): Promise<void> {
  await page.goto(`/?mockDaw=${script}${extra}`);
  await settlePage(page);
  await goToPage(page, 'Booth');
  await page.getByRole('button', { name: /^Resume at ¶/, includeHidden: true }).waitFor();
}

/** What the mock DAW holds, read through the handle a driver plays REAPER's side with. */
const dawState = (page: Page) => page.evaluate(() => window.__NARRATION_MOCK_DAW__?.state());

// Settings is one step from the Booth's notice: its "Link in Settings" button. The one-click link there is the narrator's, then back.
async function linkProject(page: Page): Promise<void> {
  await openConnect(page);
  await dialog(page).getByRole('button', { name: 'Link in Settings' }).click();
  await page.getByRole('button', { name: /^Link Alice\.rpp/ }).click();
  await goToPage(page, 'Booth');
  await page.getByRole('button', { name: /^Resume at ¶/, includeHidden: true }).waitFor();
}

// Record switched off is a chip, not a notice card: a press of Record opens the dialog that turns it on.
async function turnOnRecord(page: Page): Promise<void> {
  await expect(notice(page).getByRole('button', { name: 'Record is switched off. Show details' })).toBeVisible();
  await expect(record(page)).toBeDisabled();
  // Off but pressable: the press is answered by the dialog (aria-disabled, so the click is forced past Playwright's enabled check).
  await record(page).click({ force: true });
  const turnOn = page.getByRole('dialog', { name: 'Recording in REAPER is experimental' });
  await turnOn.getByRole('button', { name: 'Turn on Record' }).click();
  await expect(dialog(page)).toBeVisible();
}

// The owner's exact sequence: Record on, link, set up the launcher, the heartbeat arrives, the notice clears, Record enables.
async function toRecordReady(page: Page): Promise<void> {
  await openLive(page, 'live');
  await turnOnRecord(page);
  await linkProject(page);
  await startReaper(page);
  await expect(notice(page)).toHaveCount(0, { timeout: 15_000 });
  await expect(record(page)).toBeEnabled();
}

test.describe('Booth with a moving mock DAW', () => {
  // A linked project holds the dialog back for the connect grace (20 s, RecordSetup); the mark opens it at once, but the default 30 s budget is
  // still a coin flip on a loaded runner once a DAW has to start and answer.
  test.describe.configure({ timeout: 90_000 });
  test('link, launcher, heartbeat, notice clears, Record enables, a take runs and stops', async ({ page }) => {
    await toRecordReady(page);
    await record(page).click();
    await expect(stop(page)).toBeVisible();
    await expect(page.getByText('REC', { exact: true })).toBeVisible();
    expect((await dawState(page))?.recording).toBe(true);
    await pastStartGuard(page);
    await stop(page).click();
    await expect(record(page)).toBeVisible();
    expect((await dawState(page))?.recording).toBe(false);
  });

  test("leaving the Booth with the mouse Back button mid-take: coming back finds the take still the Booth's to stop", async ({ page }) => {
    await toRecordReady(page);
    await record(page).click();
    await expect(stop(page)).toBeVisible();
    await page.goBack();
    await expect(page.locator('[data-booth-text]')).toHaveCount(0);
    expect((await dawState(page))?.recording).toBe(true);
    await page.goForward();
    await page.getByRole('button', { name: /^Stop$/ }).waitFor();
    await pastStartGuard(page);
    await stop(page).click();
    await expect(record(page)).toBeVisible();
    expect((await dawState(page))?.recording).toBe(false);
  });

  test('a REAPER that opens its bridge but never answers keeps the notice up, says so, and Check again does not fake it', async ({ page }) => {
    await openLive(page, 'quiet');
    await turnOnRecord(page);
    await linkProject(page);
    await startReaper(page);
    await expect(dialog(page).getByRole('alert')).toContainText('was started and has not answered yet', { timeout: 20_000 });
    await dialog(page).getByRole('button', { name: 'Check again' }).click();
    await expect(dialog(page)).toBeVisible();
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
    await startReaper(page);
    await expect(page.getByText(/REAPER could not be started/)).toBeVisible();
    await expect(dialog(page).getByRole('button', { name: 'Open in REAPER and connect' })).toBeEnabled();
  });

  test('REAPER hands its project to an app that is busy: the refusal is shown, with what to do, and Record stays off', async ({ page }) => {
    await openLive(page, 'busy');
    await turnOnRecord(page);
    await linkProject(page);
    await startReaper(page);
    // The host's own sentence as a message that stays until it is dismissed, and the notice says what it means for Record.
    await expect(page.getByText('The app is busy, so the current project was left unchanged.').first()).toBeVisible();
    await expect(dialog(page).getByRole('alert')).toContainText('Finish or cancel what is running, then press Open in REAPER and connect again.');
    await expect(record(page)).toBeDisabled();
    // The button reads Connecting… while the app waits ten seconds for the bridge, then offers the press again.
    await expect(dialog(page).getByRole('button', { name: 'Open in REAPER and connect' })).toBeEnabled({ timeout: 20_000 });
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
    // It did not say the take ended: it went quiet, and the Booth says it cannot tell.
    await expect(page.getByText(/REAPER stopped answering, so the Booth can't tell whether the take is still running/).first()).toBeVisible();
    await expect(page.getByText(/The take ended there/)).toHaveCount(0);
    await expect(stop(page)).toHaveCount(0);
    await expect(record(page)).toBeDisabled();
    // The project is linked, so the app first says it is connecting on its own; the dialog with the steps is one press away.
    await expect(notice(page).getByRole('button', { name: /Connecting to REAPER…/ })).toBeVisible();
    await openConnect(page);
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

  test('Settings, the navigation chip and the Booth tell one story about whether REAPER answers', async ({ page }) => {
    await toRecordReady(page);
    await page.keyboard.press('Escape');
    await goToPage(page, 'Settings');
    // Settings opens on Recording & DAW, whose connection card says what the host says about the DAW.
    const connection = page.getByRole('group', { name: 'Connection' });
    const chip = page.getByRole('button', { name: /^REAPER: / });
    await expect(chip).toHaveAccessibleName('REAPER: Linked');
    await expect(connection.getByText(/REAPER is open and answering/)).toBeVisible();
    await expect(connection.getByText(/is not answering/)).toHaveCount(0);
    await page.evaluate(() => window.__NARRATION_MOCK_DAW__?.quiet());
    await expect(connection.getByText(/is not answering/)).toBeVisible();
    await expect(chip).toHaveAccessibleName('REAPER: Not running');
    await expect(connection.getByText(/REAPER is open and answering/)).toHaveCount(0);
    await page.evaluate(() => window.__NARRATION_MOCK_DAW__?.heartbeat());
    await expect(connection.getByText(/REAPER is open and answering/)).toBeVisible();
    await expect(chip).toHaveAccessibleName('REAPER: Linked');
  });

  test('choosing the built-in recorder moves the DAW port: the REAPER notice goes', async ({ page }) => {
    // The built-in recorder is refused while Experimental is off, so this run turns it on.
    await page.goto('/?mockDaw=live&mockDawExperimentalOn=1');
    await settlePage(page);
    await goToPage(page, 'Settings');
    await page.getByRole('radio', { name: /Built-in/ }).check();
    await goToPage(page, 'Booth');
    await expect(notice(page).getByRole('heading', { name: /REAPER/ })).toHaveCount(0);
  });

  // Booth pass 3, the notice for another project open in the DAW (S4, M4, M15, walkthrough 4 items 9 and 10).
  // It opens by itself as a dialog (a take would land in the wrong project); the chip stays above the footer behind it.
  const differentNotice = (page: Page) => page.getByRole('dialog', { name: 'REAPER has a different project open' });

  test('another project open: the notice says so with a way to link the open one and to check again, and the right project clears it', async ({ page }) => {
    await openLive(page, 'different');
    await turnOnRecord(page);
    await linkProject(page);
    await startReaper(page);
    await expect(differentNotice(page)).toBeVisible({ timeout: 15_000 });
    await expect(differentNotice(page).getByRole('button', { name: 'Link the open project' })).toBeVisible();
    await expect(differentNotice(page).getByRole('button', { name: 'DAW settings' })).toBeVisible();
    await expect(differentNotice(page).getByText(/Last checked \d+ s ago/)).toBeVisible();
    await expect(record(page)).toBeDisabled();
    // The narrator opens the linked project in REAPER, then presses Check again.
    await page.evaluate(() => window.__NARRATION_MOCK_DAW__?.openProject('linked'));
    await differentNotice(page).getByRole('button', { name: 'Check again' }).click();
    await expect(notice(page)).toHaveCount(0);
    await expect(record(page)).toBeEnabled();
  });

  test('link the open project: one press opens the picker once, says it linked, and the notice goes', async ({ page }) => {
    await openLive(page, 'different');
    await turnOnRecord(page);
    await linkProject(page);
    await startReaper(page);
    await expect(differentNotice(page)).toBeVisible({ timeout: 15_000 });
    await differentNotice(page).getByRole('button', { name: 'Link the open project' }).dblclick();
    await expect(page.getByText('REAPER project linked.').first()).toBeVisible();
    await expect(notice(page)).toHaveCount(0);
    await expect(record(page)).toBeEnabled();
  });

  test('the DAW opens another project while Record is ready and no event says so: focus, Check again and the timer find it', async ({ page }) => {
    await toRecordReady(page);
    await page.evaluate(() => window.__NARRATION_MOCK_DAW__?.openProject('other'));
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(differentNotice(page)).toBeVisible();
    await expect(record(page)).toBeDisabled();
    await page.evaluate(() => window.__NARRATION_MOCK_DAW__?.openProject('linked'));
    await differentNotice(page).getByRole('button', { name: 'Check again' }).click();
    await expect(notice(page)).toHaveCount(0);
    // And with no press at all: the Booth reads again by itself while the notice is up.
    await page.evaluate(() => window.__NARRATION_MOCK_DAW__?.openProject('other'));
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(differentNotice(page)).toBeVisible();
    await page.evaluate(() => window.__NARRATION_MOCK_DAW__?.openProject('linked'));
    await expect(notice(page)).toHaveCount(0, { timeout: 12_000 });
  });

  test('another project opened mid-take: the take goes on and the footer says what changed', async ({ page }) => {
    await toRecordReady(page);
    await record(page).click();
    await expect(stop(page)).toBeVisible();
    await page.evaluate(() => window.__NARRATION_MOCK_DAW__?.openProject('other'));
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page.locator('#brec-why')).toContainText('has a different project open than the one linked here', { timeout: 12_000 });
    await expect(stop(page)).toBeVisible();
    expect((await dawState(page))?.recording).toBe(true);
    await pastStartGuard(page);
    await stop(page).click();
    await expect(record(page)).toBeVisible();
  });

  test('a toast never covers the setup notice, and Space while Record cannot start opens the dialog that fixes it', async ({ page }) => {
    await openLive(page, 'quiet');
    await turnOnRecord(page);
    await linkProject(page);
    await startReaper(page);
    const toasts = page.getByRole('status').filter({ hasText: /./ });
    await expect(page.getByText(/REAPER is starting/).first()).toBeVisible();
    // Close the dialog: what is under test is the mark and the messages that rise above it.
    await dialog(page).getByRole('button', { name: 'Close' }).click();
    await expect(dialog(page)).toHaveCount(0);
    // The notice is above the toasts: neither covers the other, and the notice is topmost at its own points. Measured as soon as the
    // dialog is gone (while it is open the toasts sit at the window's top), because an information toast leaves after TOAST_INFO_MS
    // and a slow runner spent longer than that on the Space round trip below.
    const box = await notice(page).boundingBox();
    const toast = await page
      .getByRole('status')
      .getByText(/REAPER is starting/)
      .first()
      .boundingBox();
    expect(box && toast).toBeTruthy();
    expect(toast!.y + toast!.height, 'the toast sits above the notice').toBeLessThanOrEqual(box!.y + 1);
    const topmost = await page.evaluate(() => {
      const el = document.querySelector('#brec-setup')!;
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !!hit && el.contains(hit);
    });
    expect(topmost).toBe(true);
    // Space while Record cannot start opens the dialog that fixes it, every time, and starts nothing; Escape closes it again.
    await page.keyboard.press('Space');
    await expect(dialog(page)).toBeVisible();
    expect((await dawState(page))?.recording).toBe(false);
    await dialog(page).getByRole('button', { name: 'Close' }).click();
    await expect(dialog(page)).toHaveCount(0);
    void toasts;
  });

  test('the "starting" message goes once REAPER answers', async ({ page }) => {
    await openLive(page, 'live');
    await turnOnRecord(page);
    await linkProject(page);
    await startReaper(page);
    await expect(page.getByText(/REAPER is starting/).first()).toBeVisible();
    await expect(notice(page)).toHaveCount(0, { timeout: 15_000 });
    await expect(page.getByText(/REAPER is starting/)).toHaveCount(0);
  });

  test('the window slept during a take: the timer shows the true time on return', async ({ page }) => {
    await toRecordReady(page);
    await record(page).click();
    await expect(stop(page)).toBeVisible();
    await page.clock.install();
    await page.clock.fastForward('01:05:00');
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page.locator('#btimer')).toHaveText(/^1:0[45]:\d\d$/);
  });

  test('Space right after another project is opened, before any read: the press asks first and no take starts', async ({ page }) => {
    await toRecordReady(page);
    await page.evaluate(() => window.__NARRATION_MOCK_DAW__?.openProject('other'));
    await page.keyboard.press('Space');
    await expect(page.getByText(/has a different project open than the one linked here/).first()).toBeVisible();
    expect((await dawState(page))?.recording).toBe(false);
    await expect(record(page)).toBeVisible();
  });

  test('REAPER restarts mid-take: once it answers again the Booth says the take was ended here and where to check', async ({ page }) => {
    await toRecordReady(page);
    await record(page).click();
    await expect(stop(page)).toBeVisible();
    // The DAW's next heartbeat reports the take running (HEARTBEAT_MS); REAPER goes quiet during the take, not before it was heard.
    await page.waitForTimeout(600);
    await page.evaluate(() => window.__NARRATION_MOCK_DAW__?.restart(3000));
    await expect(page.getByText(/answers again\. This window ended its take when REAPER went quiet/).first()).toBeVisible({ timeout: 20_000 });
  });

  test('a take that ended without Stop is not still announced once the next take runs', async ({ page }) => {
    await toRecordReady(page);
    await record(page).click();
    await expect(stop(page)).toBeVisible();
    await page.evaluate(() => window.__NARRATION_MOCK_DAW__?.stopInDaw());
    await expect(page.getByText(/stopped recording\. The take ended there/).first()).toBeVisible();
    await expect(record(page)).toBeEnabled();
    await record(page).click();
    await expect(stop(page)).toBeVisible();
    await expect(page.getByText(/The take ended there/)).toHaveCount(0);
  });
});
