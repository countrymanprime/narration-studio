// #3321: every wait in a Record press ends. The host calls a press awaits (the model check, the project check, the listening start, the voice choice
// and the DAW's own start; the project check is covered in pressLimits.test.tsx, the mock's bootstrap cannot be answered from an override) are made to never answer, or to answer after their limit, through the mock's overrides (`__NARRATION_MOCK_OVERRIDES__`).
// Each press must end with one sentence within its limit, leave Record free, start no take and leave the DAW not recording; a start that answers
// late is stopped, never left running.
import { expect, test, type Page } from '@playwright/test';
import { settlePage } from './helpers/settle';
import { showChapterTop } from './helpers/viewTop';
import { goToPage } from './drivers/shared';

test.use({ viewport: { width: 1440, height: 900 } });
test.setTimeout(120_000);

type Hung = 'modelCheck' | 'listening' | 'voiceChoice' | 'recordStart' | 'recordStartLate';
type Calls = { stops: number; starts: number; hangs: number };
const record = (page: Page) => page.getByRole('button', { name: /^Record$/, includeHidden: true });
const stop = (page: Page) => page.getByRole('button', { name: /^Stop$/ });
const dawRecording = (page: Page) => page.evaluate(() => window.__NARRATION_MOCK_DAW__?.state().recording);
const calls = (page: Page) => page.evaluate(() => (window as unknown as { __calls: Calls }).__calls);

/** Opens the Booth with the named host call hanging once (the first press) and answering normally after; `recordStartLate` answers after 12 s. */
async function openWith(page: Page, hung: Hung): Promise<void> {
  await page.addInitScript((which) => {
    const w = window as unknown as { __calls: Calls; __armed: boolean; __NARRATION_MOCK_OVERRIDES__: Record<string, unknown> };
    w.__calls = { stops: 0, starts: 0, hangs: 0 };
    w.__armed = false;
    // Hangs only the first call made once the test arms it: the page's own reads at load are not the press's.
    const hangOnce = (): boolean => {
      if (!w.__armed) return false;
      w.__armed = false;
      w.__calls.hangs += 1;
      return true;
    };
    const overrides: Record<string, unknown> = {};
    if (which === 'modelCheck') {
      overrides.assetsList = async () => {
        if (hangOnce()) return new Promise(() => {});
        return { cacheRoot: '', defaultRoot: '', custom: false, previousRoot: '', folderNote: '', totalInstalledBytes: 0, assets: [] };
      };
    }
    if (which === 'listening') overrides.teleprompterStart = () => (hangOnce() ? new Promise(() => {}) : Promise.resolve({ status: 'started' }));
    if (which === 'voiceChoice') {
      overrides.boothPunchTarget = async () => ({ outcome: 'found', start: 12, end: 20, trackGuid: 'g1', trackName: 'Hero' });
      overrides.boothVoiceSet = () => (hangOnce() ? new Promise(() => {}) : Promise.resolve({ outcome: 'ok' }));
    }
    if (which === 'recordStart' || which === 'recordStartLate') {
      overrides.readAloudRecordStart = () => {
        w.__calls.starts += 1;
        if (!w.__armed) return Promise.resolve({ outcome: 'started', position: 0, message: '' });
        w.__armed = false;
        w.__calls.hangs += 1;
        return which === 'recordStart'
          ? new Promise(() => {})
          : new Promise((resolve) => setTimeout(() => resolve({ outcome: 'started', position: 0, message: '' }), 12_000));
      };
      overrides.readAloudRecordStop = () => {
        w.__calls.stops += 1;
        return Promise.resolve({ outcome: 'stopped', message: '', undoPoints: 0 });
      };
    }
    w.__NARRATION_MOCK_OVERRIDES__ = overrides;
  }, hung);
  await page.goto('/');
  await settlePage(page);
  await goToPage(page, 'Booth');
  await expect(record(page)).toBeEnabled();
  await showChapterTop(page);
}
const arm = (page: Page) => page.evaluate(() => ((window as unknown as { __armed: boolean }).__armed = true));

test('a model check that never answers ends the press with a sentence, and the next press records', async ({ page }) => {
  await openWith(page, 'modelCheck');
  await arm(page);
  await page.keyboard.press('Space');
  await expect(record(page)).toHaveAttribute('aria-busy', 'true');
  await expect(page.getByText(/Checking the speech model did not answer in time, so no take was started/).first()).toBeVisible({ timeout: 12_000 });
  await expect(record(page)).not.toHaveAttribute('aria-busy', 'true');
  expect(await dawRecording(page)).toBe(false);
  await page.keyboard.press('Space');
  await expect(stop(page)).toBeVisible({ timeout: 8000 });
  expect(await dawRecording(page)).toBe(true);
});

test('a DAW start that never answers ends the press with a sentence and Record is free again', async ({ page }) => {
  await openWith(page, 'recordStart');
  await arm(page);
  await page.keyboard.press('Space');
  await expect(record(page)).toHaveAttribute('aria-busy', 'true');
  await expect(page.getByText(/did not answer the start in time/).first()).toBeVisible({ timeout: 16_000 });
  await expect(record(page)).not.toHaveAttribute('aria-busy', 'true');
  // The overridden start never reached the mock DAW, so its recording state says nothing here: what counts is that no stop was sent for a take that never started.
  expect((await calls(page)).hangs).toBe(1);
  expect((await calls(page)).stops).toBe(0);
  await page.keyboard.press('Space');
  await expect(stop(page)).toBeVisible({ timeout: 8000 });
});

test('a DAW start that answers after its limit is stopped, never left running', async ({ page }) => {
  await openWith(page, 'recordStartLate');
  await arm(page);
  await page.keyboard.press('Space');
  await expect(page.getByText(/did not answer the start in time/).first()).toBeVisible({ timeout: 16_000 });
  // The host answers at 12 s with a take; the Booth gave up at 10 s, so it stops that take.
  await expect.poll(async () => (await calls(page)).stops, { timeout: 8000 }).toBeGreaterThanOrEqual(1);
  await expect(stop(page)).toHaveCount(0);
});

test('a listening start that never answers ends the press with a sentence, and no take is left recording', async ({ page }) => {
  await openWith(page, 'listening');
  await arm(page);
  await page.keyboard.press('Space');
  // The DAW starts meanwhile (Record reads Stop); the take is dropped when the listening gives up.
  await expect(page.getByText(/the listening did not start in time/).first()).toBeVisible({ timeout: 52_000 });
  await expect(record(page)).toBeVisible();
  await expect(record(page)).not.toHaveAttribute('aria-busy', 'true');
  expect(await dawRecording(page)).toBe(false);
});

test('a voice choice that never answers ends a punch press with a sentence and starts no take', async ({ page }) => {
  await openWith(page, 'voiceChoice');
  await arm(page);
  await page.locator('[data-booth-text] [data-word]').nth(40).click({ button: 'right' });
  await page
    .getByRole('menuitem', { name: /Start from here/ })
    .first()
    .click();
  await expect(record(page)).toHaveAttribute('aria-busy', 'true');
  await expect(page.getByText(/was not chosen in time, so no take was started/).first()).toBeVisible({ timeout: 12_000 });
  await expect(record(page)).not.toHaveAttribute('aria-busy', 'true');
  expect(await dawRecording(page)).toBe(false);
});
