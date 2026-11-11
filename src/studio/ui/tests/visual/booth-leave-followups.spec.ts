// The follow-ups of the Booth leave guard (#3349): the project picker is an exit like the nav, a take that ends in the DAW during the question or the stop wait
// leaves no stale refusal, a second exit during the wait says so again, and a double Enter on a jump menu row cannot answer the question it raised.
import { expect, test, type Page } from '@playwright/test';
import { pastStartGuard } from './helpers/startGuard';
import { settlePage } from './helpers/settle';
import { goToPage, openSettings } from './drivers/shared';
import { DAW_SETUPS } from '../../src/fixtures/daw';

test.use({ viewport: { width: 1440, height: 900 } });
test.setTimeout(60_000);

const record = (page: Page) => page.getByRole('button', { name: /^Record$/, includeHidden: true });
const stop = (page: Page) => page.getByRole('button', { name: /^Stop$/ });
const question = (page: Page) => page.getByRole('alertdialog', { name: /^Stop recording\?$/ });
const picker = (page: Page) => page.getByRole('heading', { name: 'Choose your project' });
const dawRecording = (page: Page) => page.evaluate(() => window.__NARRATION_MOCK_DAW__?.state().recording);
const onBooth = (page: Page) => page.evaluate(() => window.location.pathname === '/booth');

const NEVER_STOPS = () => {
  (window as unknown as { __NARRATION_MOCK_OVERRIDES__: Record<string, unknown> }).__NARRATION_MOCK_OVERRIDES__ = {
    readAloudRecordStop: () => new Promise(() => {}),
  };
};

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

async function runFromPalette(page: Page, command: string, press = 'Enter'): Promise<void> {
  await page.keyboard.press('Control+KeyK');
  await page.getByRole('combobox', { name: 'Jump menu' }).fill(`> ${command}`);
  await expect(page.getByRole('option', { name: new RegExp(`^${command}`) })).toBeVisible();
  await page.keyboard.press(press);
}

async function dirtySettings(page: Page): Promise<void> {
  await page.goto('/');
  await settlePage(page);
  await openSettings(page, 'Set on a page');
  const entry = page.locator('[data-page-setting="ps.coverage"]');
  await entry.getByRole('button', { name: 'Change it here for now' }).click();
  await entry.getByLabel('Share of each paragraph that must be read', { exact: false }).first().fill('0.7');
}

for (const [via, open] of [
  ['the header project name', (page: Page) => page.getByRole('button', { name: /, switch project$/ }).click()],
  ['the jump menu', (page: Page) => runFromPalette(page, 'Switch project…')],
] as const) {
  test(`Switch project from ${via} over unsaved Settings asks first; Keep editing leaves the picker closed and the edit in place`, async ({ page }) => {
    await dirtySettings(page);
    await open(page);
    const unsaved = page.getByRole('alertdialog', { name: 'Unsaved settings' });
    await expect(unsaved).toBeVisible();
    await expect(picker(page)).toHaveCount(0);
    await unsaved.getByRole('button', { name: 'Cancel' }).click();
    await expect(unsaved).toHaveCount(0);
    await expect(picker(page)).toHaveCount(0);
    await expect(page.getByLabel('Share of each paragraph that must be read', { exact: false }).first()).toHaveValue('0.7');
  });
}

test('Switch project over unsaved Settings: Discard & continue opens the picker, and Escape then returns to Settings', async ({ page }) => {
  await dirtySettings(page);
  await page.getByRole('button', { name: /, switch project$/ }).click();
  await page.getByRole('alertdialog', { name: 'Unsaved settings' }).getByRole('button', { name: 'Discard & continue' }).click();
  await expect(picker(page)).toBeVisible();
  // Escape is Back, as it is for every page that covers another.
  await page.keyboard.press('Escape');
  await expect(picker(page)).toHaveCount(0);
  expect(await page.evaluate(() => window.location.pathname)).toBe('/settings');
});

test('the project picker over Production: Escape is Back', async ({ page }) => {
  await page.goto('/');
  await settlePage(page);
  await page.getByRole('button', { name: /, switch project$/ }).click();
  await expect(picker(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(picker(page)).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1, name: 'Production' })).toBeVisible();
});

test('a second exit while the stop is pending says "Stopping the take…" again after the narrator closed the message', async ({ page }) => {
  await page.addInitScript(NEVER_STOPS);
  await recording(page);
  await page.keyboard.press('Escape');
  await question(page).getByRole('button', { name: /^Stop/ }).click();
  const stopping = page.getByText('Stopping the take…');
  await expect(stopping).toBeVisible();
  await page
    .getByRole('button', { name: /^Dismiss/ })
    .first()
    .click();
  await expect(stopping).toHaveCount(0);
  await page.keyboard.press('Alt+ArrowLeft');
  await expect(stopping).toBeVisible();
  expect(await onBooth(page)).toBe(true);
});

test('a take that ends in the DAW while the stop is pending leaves without the "Could not stop" question', async ({ page }) => {
  await page.addInitScript(NEVER_STOPS);
  await recording(page);
  await page.keyboard.press('Escape');
  await question(page).getByRole('button', { name: /^Stop/ }).click();
  await expect(page.getByText('Stopping the take…')).toBeVisible();
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.__NARRATION_MOCK_DAW__?.stopInDaw());
  await expect(page.locator('[data-booth-text]')).toHaveCount(0, { timeout: 6000 });
  await expect(page.getByRole('alertdialog', { name: /Could not stop the take/ })).toHaveCount(0);
  expect(await onBooth(page)).toBe(false);
});

// The hold is a timer in the overlay host, so these three run on Playwright's clock: it flows while the take starts (the Booth's own guards need real
// time) and is paused before the key presses, then moved by exactly as much as the test says. No outcome depends on how fast the machine is (#3405).
// The clock is moved on a few seconds to stop it: far enough that a slow machine's real time has not passed it by when the call arrives.
async function pauseClock(page: Page): Promise<void> {
  const now = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(now + 3000);
}

test('a double Enter on a jump menu row that leaves the Booth keeps the question open and the take running', async ({ page }) => {
  await page.clock.install();
  await recording(page);
  await page.keyboard.press('Control+KeyK');
  await page.getByRole('combobox', { name: 'Jump menu' }).fill('> Go to Script');
  await expect(page.getByRole('option', { name: /^Go to Script/ })).toBeVisible();
  await pauseClock(page);
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await expect(question(page)).toBeVisible();
  await expect(question(page)).toHaveAttribute('data-enter-held', '');
  await page.clock.runFor(300);
  await expect(question(page)).toBeVisible();
  expect(await onBooth(page)).toBe(true);
  expect(await dawRecording(page)).toBe(true);
  // Past the moment, Enter answers as it always did: the safe button, Keep recording.
  await page.clock.runFor(150);
  await expect(question(page)).not.toHaveAttribute('data-enter-held', '');
  await page.keyboard.press('Enter');
  await expect(question(page)).toHaveCount(0);
  expect(await dawRecording(page)).toBe(true);
});

test('a DAW that goes quiet while the stop is pending is not an ended take: "Could not stop the take" still asks', async ({ page }) => {
  await page.addInitScript(NEVER_STOPS);
  await recording(page);
  await page.keyboard.press('Escape');
  await question(page).getByRole('button', { name: /^Stop/ }).click();
  await expect(page.getByText('Stopping the take…')).toBeVisible();
  await page.waitForTimeout(1000);
  await page.evaluate(() => window.__NARRATION_MOCK_DAW__?.quiet());
  const refused = page.getByRole('alertdialog', { name: /^Could not stop the take$/ });
  await expect(refused).toBeVisible({ timeout: 14_000 });
  await expect(refused).toContainText('may keep recording');
  expect(await onBooth(page)).toBe(true);
});

// QA break 1: the DAW goes quiet while "Stop recording?" is open. A quiet DAW may still be recording, so Stop and leave tries the stop and, when it does
// not answer, asks "Could not stop the take". It never leaves with no stop and no question, however long the question had been open.
for (const gap of [100, 1500]) {
  test(`the DAW goes quiet ${gap} ms before Stop and leave: the stop is tried, and when it does not answer the refusal question asks; it never leaves silently`, async ({
    page,
  }) => {
    await page.addInitScript(NEVER_STOPS);
    await recording(page);
    await page.keyboard.press('Escape');
    await expect(question(page)).toBeVisible();
    await page.evaluate(() => window.__NARRATION_MOCK_DAW__?.quiet());
    await page.waitForTimeout(gap);
    await question(page).getByRole('button', { name: /^Stop/ }).click();
    const refused = page.getByRole('alertdialog', { name: /^Could not stop the take$/ });
    await expect(refused).toBeVisible({ timeout: 14_000 });
    await expect(refused).toContainText('may keep recording');
    expect(await onBooth(page)).toBe(true);
  });
}

// QA B-A: the DAW went quiet BEFORE the exit. `recording` false is what that leaves behind too, and a quiet DAW may still be recording: the exit asks.
test('a DAW that went quiet before Escape still asks', async ({ page }) => {
  await page.addInitScript(NEVER_STOPS);
  await recording(page);
  await page.evaluate(() => window.__NARRATION_MOCK_DAW__?.quiet());
  await page.waitForTimeout(1500);
  await page.keyboard.press('Escape');
  await expect(question(page)).toBeVisible();
  expect(await onBooth(page)).toBe(true);
  await question(page)
    .getByRole('button', { name: /Keep recording/ })
    .click();
  await expect(question(page)).toHaveCount(0);
  expect(await onBooth(page)).toBe(true);
});

test('quiet() and Escape in the same tick still ask', async ({ page }) => {
  await page.addInitScript(NEVER_STOPS);
  await recording(page);
  await page.evaluate(() => {
    window.__NARRATION_MOCK_DAW__?.quiet();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));
  });
  await expect(question(page)).toBeVisible();
  expect(await onBooth(page)).toBe(true);
});

test('a refusal open, the DAW goes quiet, Keep recording, Escape again: it asks again', async ({ page }) => {
  await recording(page);
  await page.evaluate(() => window.__NARRATION_MOCK_DAW__?.refuseNextRecord('Disk full.', 'stop'));
  await page.keyboard.press('Escape');
  await question(page).getByRole('button', { name: /^Stop/ }).click();
  const refused = page.getByRole('alertdialog', { name: /^Could not stop the take$/ });
  await expect(refused).toBeVisible();
  await page.evaluate(() => window.__NARRATION_MOCK_DAW__?.quiet());
  await page.waitForTimeout(1000);
  await refused.getByRole('button', { name: /Keep recording/ }).click();
  await expect(refused).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(question(page)).toBeVisible();
  expect(await onBooth(page)).toBe(true);
});

// QA B-D: the read that confirms an end hangs. "Stop and leave" must not wait for it for ever: after its limit the stop is tried, and the refusal question asks.
test('a hung capabilities read after the take ended: Stop and leave ends in the refusal question, and Keep recording works', async ({ page }) => {
  await page.addInitScript((live) => {
    const w = window as unknown as { __hangReads: boolean; __NARRATION_MOCK_OVERRIDES__: Record<string, unknown> };
    w.__hangReads = false;
    w.__NARRATION_MOCK_OVERRIDES__ = {
      readAloudRecordStop: () => new Promise(() => {}),
      dawCapabilities: () => (w.__hangReads ? new Promise(() => {}) : Promise.resolve(live)),
    };
  }, DAW_SETUPS.reaper);
  await recording(page);
  await page.evaluate(() => {
    (window as unknown as { __hangReads: boolean }).__hangReads = true;
    window.__NARRATION_MOCK_DAW__?.stopInDaw();
  });
  await page.waitForTimeout(500);
  await page.keyboard.press('Escape');
  await expect(question(page)).toBeVisible();
  await question(page).getByRole('button', { name: /^Stop/ }).click();
  const refused = page.getByRole('alertdialog', { name: /^Could not stop the take$/ });
  await expect(refused).toBeVisible({ timeout: 25_000 });
  await refused.getByRole('button', { name: /Keep recording/ }).click();
  await expect(refused).toHaveCount(0);
  expect(await onBooth(page)).toBe(true);
});

// QA B-E: the DAW went quiet and came back, nothing records: leaving is silent again.
test('after quiet and a DAW restart, Escape leaves silently with 0 stops', async ({ page }) => {
  await recording(page);
  await page.evaluate(() => {
    window.__NARRATION_MOCK_DAW__?.quiet();
    window.__NARRATION_MOCK_DAW__?.restart(500);
  });
  await page.waitForTimeout(3000);
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-booth-text]')).toHaveCount(0);
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  const stops = await page.evaluate(() => (window.__hostCalls ?? []).filter((call) => call.name === 'readAloudRecordStop').length);
  expect(stops).toBe(0);
});

// #3405: a press inside the hold does nothing, whichever key and however it is pressed; the same press after it answers.
test('Enter and Space pressed inside the hold leave the question open and the take recording', async ({ page }) => {
  await page.clock.install();
  await recording(page);
  await pauseClock(page);
  await page.keyboard.press('Escape');
  await expect(question(page)).toBeVisible();
  await expect(question(page)).toHaveAttribute('data-enter-held', '');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Space');
  await page.clock.runFor(399);
  await expect(question(page)).toBeVisible();
  await expect(question(page)).toHaveAttribute('data-enter-held', '');
  expect(await dawRecording(page)).toBe(true);
  expect(await onBooth(page)).toBe(true);
  await page.clock.runFor(50);
  await expect(question(page)).not.toHaveAttribute('data-enter-held', '');
  await page.keyboard.press('Enter');
  await expect(question(page)).toHaveCount(0);
  expect(await dawRecording(page)).toBe(true);
});

test('a Space pressed inside the hold and released after it does not answer the question', async ({ page }) => {
  await page.clock.install();
  await recording(page);
  await pauseClock(page);
  await page.keyboard.press('Escape');
  await expect(question(page)).toBeVisible();
  await question(page).getByRole('button', { name: 'Keep recording' }).focus();
  await page.keyboard.down('Space');
  await page.clock.runFor(450);
  await expect(question(page)).not.toHaveAttribute('data-enter-held', '');
  await page.keyboard.up('Space');
  await page.waitForTimeout(150);
  await expect(question(page)).toBeVisible();
  expect(await dawRecording(page)).toBe(true);
});

// QA (#3405): a held Enter repeats about 500 ms in, after the hold. The repeat is not a press: with focus on the safe button it would close the question, and with
// focus on "Stop and leave" it would leave the Booth and stop the take, unread.
for (const button of ['Keep recording', 'Stop and leave'] as const) {
  test(`a held Enter whose auto-repeat arrives after the hold does not answer (focus on ${button})`, async ({ page }) => {
    await page.clock.install();
    await recording(page);
    await pauseClock(page);
    await page.keyboard.press('Escape');
    await expect(question(page)).toBeVisible();
    await question(page).getByRole('button', { name: button }).focus();
    await page.keyboard.down('Enter');
    await page.clock.runFor(450);
    await expect(question(page)).not.toHaveAttribute('data-enter-held', '');
    // Held on: the operating system repeats it, and Playwright marks a second `down` of a key already down as a repeat.
    await page.keyboard.down('Enter');
    await page.keyboard.down('Enter');
    await page.keyboard.up('Enter');
    await page.waitForTimeout(150);
    await expect(question(page)).toBeVisible();
    expect(await dawRecording(page)).toBe(true);
    expect(await onBooth(page)).toBe(true);
    // Pressed afresh after the release, Enter answers as it always did.
    await page.keyboard.press('Enter');
    if (button === 'Keep recording') await expect(question(page)).toHaveCount(0);
    else await expect.poll(() => dawRecording(page)).toBe(false);
  });
}
