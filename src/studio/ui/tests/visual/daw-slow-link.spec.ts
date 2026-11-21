// #3752: the narrator must not notice a slow DAW. The mock's link is put on each profile the issue names (`?mockDawLatency=`, src/api/dawLatency.ts, which
// answers what the real host answers at its own wait limits), and each scenario fails when the page waits for the DAW before showing what it already knows,
// shows the saved-project fallback for a DAW that is only slow, loses the lane the narrator chose, or raises an error toast because the DAW is slow.
// A cell that fails today is in KNOWN with what the narrator gets: it is run as an expected failure, so the slice of #3752 that fixes it has to take it out.
import { expect, test, type Page } from '@playwright/test';
import { settlePage } from './helpers/settle';
import { boothChapterReady } from './helpers/viewTop';
import { goToPage } from './drivers/shared';

test.use({ viewport: { width: 1440, height: 900 } });
test.setTimeout(120_000);

/** `ms` is the longest one command is held on the profile. */
const PROFILES = [
  { name: '0 ms', text: '0ms', ms: 0 },
  { name: '300 ms', text: '300ms', ms: 300 },
  { name: '1 s', text: '1s', ms: 1_000 },
  { name: '3 s', text: '3s', ms: 3_000 },
  { name: '10 s', text: '10s', ms: 10_000 },
  { name: 'stall then recover', text: 'stall-recover', ms: 8_000 },
] as const;
type Profile = (typeof PROFILES)[number]['name'];

/** What the narrator has on screen "at once": the page answers a press or shows what it knows within this, whatever the DAW is doing. */
const AT_ONCE_MS = 1_500;

/** The cells that fail today, with what the narrator gets (measured on the mock, 2026-11-20, after the host's track list is served stale while it is re-read and the Booth's arm waits as a lane command). Each is an expected failure until its fix lands. */
const KNOWN: Record<string, Partial<Record<Profile, string>>> = {
  'the Booth opens with its voice at once': {
    '3 s': 'the voice shows after 2.5 s',
    '10 s': 'the voice shows after 6.5 s',
    'stall then recover': 'the voice shows after 6 s',
  },
  'a lane key shows its lane at once and its take starts': {
    '3 s': 'the lane shows 3 s after the key',
    '10 s': 'the lane shows only when the arm answers',
    'stall then recover': 'the lane shows when the stall ends',
  },
  'the engine panel lists the tracks': {
    '3 s': '"Reading the tracks from REAPER…" for 3 s with no tracks',
    '10 s': '"Reading the tracks…" for 7 s, then the saved-project fallback for a REAPER that is only slow',
    'stall then recover': '"Reading the tracks…" for 7 s',
  },
};
const known = (scenario: string, profile: Profile) => {
  const why = KNOWN[scenario]?.[profile];
  test.fail(why !== undefined, `#3752, known on a ${profile} link: ${why}`);
};

const voiceButton = (page: Page) => page.getByRole('button', { name: /^Voice:/ });
const record = (page: Page) => page.getByRole('button', { name: /^Record$/ });
const stop = (page: Page) => page.getByRole('button', { name: /^Stop$/ });
const dawRecording = (page: Page) => page.evaluate(() => window.__NARRATION_MOCK_DAW__?.state().recording);

/** Collects the text of every error toast from the first paint on, so one that came and went is still counted. */
async function collectErrorToasts(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const seen = ((window as unknown as { __errorToasts: string[] }).__errorToasts = [] as string[]);
    const read = () => {
      for (const toast of document.querySelectorAll('[data-toast-region] [role="alert"] [data-toast-text]')) {
        const text = (toast.textContent ?? '').trim();
        if (text && !seen.includes(text)) seen.push(text);
      }
    };
    new MutationObserver(read).observe(document, { subtree: true, childList: true, characterData: true });
  });
}
const errorToasts = (page: Page) => page.evaluate(() => (window as unknown as { __errorToasts: string[] }).__errorToasts);
const forgetErrorToasts = (page: Page) => page.evaluate(() => void ((window as unknown as { __errorToasts: string[] }).__errorToasts.length = 0));

for (const { name, text, ms } of PROFILES) {
  test.describe(`a DAW link at ${name}`, () => {
    test('the Booth opens with its voice at once', async ({ page }) => {
      known('the Booth opens with its voice at once', name);
      await page.goto(`/?mockVoiceFolders=1&mockDawLatency=${text}`);
      await settlePage(page);
      await goToPage(page, 'Booth');
      await boothChapterReady(page);
      // The voice and Record are what the page already knows (the saved choice, the last arm state): they do not wait for the DAW.
      await expect(voiceButton(page)).toBeVisible({ timeout: AT_ONCE_MS });
      await expect(record(page)).toBeEnabled({ timeout: AT_ONCE_MS });
      await expect(voiceButton(page)).toContainText('Narrator');
    });

    test('opening the Booth raises no error', async ({ page }) => {
      await collectErrorToasts(page);
      await page.goto(`/?mockVoiceFolders=1&mockDawLatency=${text}`);
      await settlePage(page);
      await goToPage(page, 'Booth');
      await boothChapterReady(page);
      // Long enough for the page's own reads and its arm to come back or reach the host's limits: none of them is the narrator's failure.
      await page.waitForTimeout(Math.min(2 * ms + 1_500, 22_000));
      expect(await errorToasts(page)).toEqual([]);
      await expect(voiceButton(page)).toContainText('Narrator', { timeout: 15_000 });
    });

    test('a lane key shows its lane at once and its take starts', async ({ page }) => {
      known('a lane key shows its lane at once and its take starts', name);
      await collectErrorToasts(page);
      await page.goto('/?mockVoiceFolders=1');
      await settlePage(page);
      await goToPage(page, 'Booth');
      await boothChapterReady(page);
      await expect(voiceButton(page)).toContainText('Narrator');
      await expect(record(page)).toBeEnabled();
      // The link turns slow under a Booth that is up, as it does mid-session; a stall starts here.
      await page.evaluate((profile) => window.__NARRATION_MOCK_DAW_LATENCY__?.(profile), text);
      await forgetErrorToasts(page);
      await page.keyboard.press('Numpad2');
      await expect(voiceButton(page)).toContainText('Extras', { timeout: AT_ONCE_MS });
      // The take starts once the DAW has armed and started (the track list, the arm, the start: each held once), with no error on the way.
      await expect(stop(page)).toBeVisible({ timeout: Math.min(4 * ms + 5_000, 40_000) });
      expect(await dawRecording(page)).toBe(true);
      await expect(voiceButton(page)).toContainText('Extras');
      expect(await errorToasts(page)).toEqual([]);
    });

    test('Stop ends the take and never says the DAW is not answering', async ({ page }) => {
      await collectErrorToasts(page);
      await page.goto('/?mockVoiceFolders=1');
      await settlePage(page);
      await goToPage(page, 'Booth');
      await boothChapterReady(page);
      await expect(record(page)).toBeEnabled();
      await record(page).click();
      await expect(stop(page)).toBeVisible({ timeout: 10_000 });
      expect(await dawRecording(page)).toBe(true);
      // A Stop pressed within a second of the start is taken for a double click and ignored (START_GUARD_MS).
      await page.waitForTimeout(1_200);
      // The link turns slow under a take that is running; a stall starts here.
      await page.evaluate((profile) => window.__NARRATION_MOCK_DAW_LATENCY__?.(profile), text);
      await forgetErrorToasts(page);
      await stop(page).click();
      // The host waits for a stop the DAW has read, so the take ends when the stop lands and nothing says it failed on the way.
      await expect.poll(() => dawRecording(page), { timeout: ms + 5_000 }).toBe(false);
      await expect(record(page)).toBeVisible({ timeout: 5_000 });
      await expect(page.getByText(/not answering|did not confirm/)).toHaveCount(0);
      expect(await errorToasts(page)).toEqual([]);
    });

    test('the engine panel lists the tracks', async ({ page }) => {
      known('the engine panel lists the tracks', name);
      await collectErrorToasts(page);
      await page.goto(`/?mockDawLatency=${text}`);
      await settlePage(page);
      await page
        .locator('header')
        .getByRole('button', { name: /^REAPER: / })
        .click();
      const panel = page.getByRole('dialog', { name: 'Audio engine' });
      await panel.getByRole('region', { name: 'REAPER project' }).waitFor();
      // The tools only show for a project with tracks: the last known tracks are on screen while the live list is on its way.
      await expect(panel.getByRole('region', { name: 'REAPER tools' })).toBeVisible({ timeout: AT_ONCE_MS + 1_000 });
      const fallback = panel.getByText('REAPER is not answering, so these are the tracks as of the last save.');
      const live = panel.getByText('REAPER’s tracks now, saved or not.');
      // A DAW that is only slow is never reported as not answering: the live list arrives, late at worst.
      await expect(live.or(fallback)).toBeVisible({ timeout: Math.min(ms + 5_000, 20_000) });
      await expect(fallback).toHaveCount(0);
      expect(await errorToasts(page)).toEqual([]);
      // The panel is never blocked by the read.
      await page.keyboard.press('Escape');
      await expect(panel).toHaveCount(0, { timeout: AT_ONCE_MS });
    });

    test('Check recordings opens', async ({ page }) => {
      await collectErrorToasts(page);
      await page.goto(`/?mockDawLatency=${text}`);
      const table = page.getByRole('table', { name: 'Chapter pipeline' });
      await table.waitFor({ timeout: 20_000 });
      await table.getByRole('row').nth(2).locator('td').nth(1).click({ button: 'right' });
      await page.getByRole('menuitem', { name: 'Check recordings' }).click();
      const dialog = page.getByRole('dialog', { name: 'Check recordings' });
      await expect(dialog.getByRole('button', { name: /^Check 1 chapter$/ })).toBeEnabled({ timeout: AT_ONCE_MS });
      await page.waitForTimeout(Math.min(ms + 1_000, 9_000));
      await expect(dialog.getByText(/not read in time|not answering/)).toHaveCount(0);
      expect(await errorToasts(page)).toEqual([]);
    });
  });
}
