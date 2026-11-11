// #3320: the stop side of a Record press has a limit, and a listening session is let go only by the press that owns it. The host's calls are held or
// refused through the mock's overrides (`__NARRATION_MOCK_OVERRIDES__`); the fake DAW is not real REAPER.
import { expect, test, type Page } from '@playwright/test';
import { settlePage } from './helpers/settle';
import { showChapterTop } from './helpers/viewTop';
import { goToPage } from './drivers/shared';

test.use({ viewport: { width: 1440, height: 900 } });
test.setTimeout(90_000);

type Calls = { stops: number; listeningStops: number; listeningStarts: number };
const record = (page: Page) => page.getByRole('button', { name: /^Record$/, includeHidden: true });
const calls = (page: Page) => page.evaluate(() => (window as unknown as { __calls: Calls }).__calls);

async function openBooth(page: Page, overrides: 'stopNeverAnswers' | 'listeningStartLate' | 'listeningStartPastLimit'): Promise<void> {
  await page.addInitScript((which) => {
    const w = window as unknown as { __calls: Calls; __NARRATION_MOCK_OVERRIDES__: Record<string, unknown> };
    w.__calls = { stops: 0, listeningStops: 0, listeningStarts: 0 };
    const map: Record<string, unknown> = {
      teleprompterStop: async () => void (w.__calls.listeningStops += 1),
    };
    if (which === 'stopNeverAnswers') {
      // The microphone is refused, so the take is dropped; the DAW's stop of it never answers.
      map.teleprompterStart = async () => {
        w.__calls.listeningStarts += 1;
        throw new Error('The microphone is in use by another application.');
      };
      map.readAloudRecordStop = () => {
        w.__calls.stops += 1;
        return new Promise(() => {});
      };
    } else {
      // Late by 3 s, or past the press's 45 s limit (the host's own limit is shorter, but a slow model load must not leave a session behind).
      const after = which === 'listeningStartLate' ? 3000 : 55_000;
      map.teleprompterStart = () => {
        w.__calls.listeningStarts += 1;
        return new Promise((resolve) => setTimeout(() => resolve({ status: 'started' }), after));
      };
    }
    w.__NARRATION_MOCK_OVERRIDES__ = map;
  }, overrides);
  await page.goto('/');
  await settlePage(page);
  await goToPage(page, 'Booth');
  await expect(record(page)).toBeEnabled();
  await showChapterTop(page);
}

test('the stop of a take whose listening failed ends at its limit with a sentence, and Record is free', async ({ page }) => {
  await openBooth(page, 'stopNeverAnswers');
  await page.keyboard.press('Space');
  await expect(page.getByText(/The recording could not be stopped: the stop did not answer in time/).first()).toBeVisible({ timeout: 16_000 });
  await expect(record(page)).toBeVisible();
  await expect(record(page)).not.toHaveAttribute('aria-busy', 'true');
  expect((await calls(page)).stops).toBe(1);
});

test('a press that is stopped while its listening is starting lets that session go, and the next press starts its own', async ({ page }) => {
  await openBooth(page, 'listeningStartLate');
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: /^Stop$/ })).toBeVisible({ timeout: 8000 });
  // Past the start guard (a Stop within a moment of the start is ignored as a double tap), before the listening answers at 3 s.
  await page.waitForTimeout(1500);
  await page.keyboard.press('Space');
  await expect.poll(async () => (await calls(page)).listeningStops, { timeout: 8000 }).toBeGreaterThanOrEqual(1);
  await expect(record(page)).toBeVisible({ timeout: 8000 });
  await page.keyboard.press('Space');
  await expect.poll(async () => (await calls(page)).listeningStarts, { timeout: 8000 }).toBe(2);
});

// Break found by QA: the start answers ok after the press's limit and the press was stopped or left meanwhile. The session that comes up then has
// nobody else to stop it, so the late answer must be stopped (a stop sent earlier reached a host that was not listening yet).
for (const how of ['Stop', 'Stop and leave'] as const) {
  test(`a listening start that answers after its limit for a press the narrator ended with ${how} is stopped when it answers`, async ({ page }) => {
    test.setTimeout(120_000);
    await openBooth(page, 'listeningStartPastLimit');
    await page.keyboard.press('Space');
    await expect(page.getByRole('button', { name: /^Stop$/ })).toBeVisible({ timeout: 8000 });
    await page.waitForTimeout(1500);
    if (how === 'Stop') {
      await page.keyboard.press('Space');
    } else {
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: /Stop and leave/ }).click();
    }
    await page.waitForTimeout(50_000);
    const before = (await calls(page)).listeningStops;
    // The start answers at 55 s.
    await expect.poll(async () => (await calls(page)).listeningStops, { timeout: 15_000 }).toBeGreaterThan(before);
  });
}

// Break 3 (QA recheck): a press that joins a session another press is still starting waits for it. Left, or the chapter changed, while it waits, the session
// that then comes up has nobody else to stop it. The mock host here keeps one session like the real one: a stop while it is starting is a no-op that answers OK
// (service.go: the session has no child process yet), and the start answers ok at 20 s.
type Host = { state: string; effectiveStops: number };
async function openJoinerBooth(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __host: Host; __calls: Calls; __NARRATION_MOCK_OVERRIDES__: Record<string, unknown> };
    w.__host = { state: 'idle', effectiveStops: 0 };
    w.__calls = { stops: 0, listeningStops: 0, listeningStarts: 0 };
    const listeners = new Set<(state: unknown) => void>();
    const publish = (phase: string) => {
      w.__host.state = phase;
      listeners.forEach((listener) => listener({ phase, message: '', engine: 'whisper', chapter: 'c1', script: null, position: null }));
    };
    let starts = 0;
    w.__NARRATION_MOCK_OVERRIDES__ = {
      teleprompterState: async () => ({ phase: w.__host.state, message: '', engine: 'whisper', chapter: 'c1', script: null, position: null }),
      subscribeTeleprompterState: (listener: (state: unknown) => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      teleprompterStart: () => {
        w.__calls.listeningStarts += 1;
        if (w.__host.state === 'starting' || w.__host.state === 'running') return Promise.reject(new Error('a teleprompter session is already running'));
        publish('starting');
        return new Promise((resolve) =>
          setTimeout(() => {
            publish('running');
            resolve({ status: 'started' });
          }, 20_000),
        );
      },
      teleprompterStop: async () => {
        w.__calls.listeningStops += 1;
        if (w.__host.state === 'running') {
          w.__host.effectiveStops += 1;
          publish('stopped');
        }
      },
      // The second DAW start takes 8 s, so the chapter can still be changed while it is out.
      readAloudRecordStart: () => {
        starts += 1;
        return new Promise((resolve) => setTimeout(() => resolve({ outcome: 'started', position: 0, message: '' }), starts === 1 ? 0 : 8000));
      },
      readAloudRecordStop: async () => ({ outcome: 'stopped', message: '', undoPoints: 0 }),
    };
  });
  await page.goto('/');
  await settlePage(page);
  await goToPage(page, 'Booth');
  await expect(record(page)).toBeEnabled();
  await showChapterTop(page);
}
/** Escape leaves the Booth; a question about the running listening is answered yes. */
async function leaveBooth(page: Page): Promise<void> {
  await page.keyboard.press('Escape');
  const yes = page
    .getByRole('alertdialog')
    .getByRole('button', { name: /^(Stop and leave|Leave)/ })
    .first();
  if (await yes.isVisible({ timeout: 1500 }).catch(() => false)) await yes.click();
  await page.getByRole('heading', { level: 1, name: 'Script' }).waitFor({ timeout: 8000 });
}
const hostState = (page: Page) => page.evaluate(() => (window as unknown as { __host: Host }).__host);

for (const how of ['leave', 'chapter change'] as const) {
  test(`a joiner whose ${how === 'leave' ? 'Booth is left' : 'chapter changes'} while the session it joined starts: the session is stopped when it comes up`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openJoinerBooth(page);
    // Press A: its take starts, its listening is pending. Stop it (the host ignores the session's stop while it starts), leave and come back.
    await page.keyboard.press('Space');
    await expect(page.getByRole('button', { name: /^Stop$/ })).toBeVisible({ timeout: 8000 });
    await page.waitForTimeout(1500);
    await page.keyboard.press('Space');
    await expect(record(page)).toBeVisible({ timeout: 8000 });
    await leaveBooth(page);
    await goToPage(page, 'Booth');
    await expect(record(page)).toBeEnabled();
    // Press B joins the starting session and waits for it.
    await page.keyboard.press('Space');
    await page.waitForTimeout(1500);
    if (how === 'leave') await leaveBooth(page);
    else await page.getByRole('button', { name: 'Next chapter' }).click();
    // A's start answers ok at about 20 s after A's press.
    await expect.poll(async () => (await hostState(page)).state, { timeout: 40_000 }).not.toBe('starting');
    await expect.poll(async () => (await hostState(page)).state, { timeout: 20_000 }).not.toBe('running');
    expect((await hostState(page)).effectiveStops).toBeGreaterThanOrEqual(1);
  });
}

// Narrator walkthrough: a plain Stop the DAW never answers was silent for good (REC and the timer went on). It ends at its 10 s limit with a sentence.
test('a Stop the DAW never answers ends at its limit with a sentence, and Stop can be asked again', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __calls: Calls; __NARRATION_MOCK_OVERRIDES__: Record<string, unknown> };
    w.__calls = { stops: 0, listeningStops: 0, listeningStarts: 0 };
    w.__NARRATION_MOCK_OVERRIDES__ = {
      readAloudRecordStop: () => {
        w.__calls.stops += 1;
        return new Promise(() => {});
      },
    };
  });
  await page.goto('/');
  await settlePage(page);
  await goToPage(page, 'Booth');
  await expect(record(page)).toBeEnabled();
  await showChapterTop(page);
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: /^Stop$/ })).toBeVisible({ timeout: 8000 });
  await page.waitForTimeout(1500);
  await page.keyboard.press('Space');
  await expect(page.getByText(/Stop did not go through: the stop did not answer in time/).first()).toBeVisible({ timeout: 16_000 });
  // The take may still be recording: Stop is still there and asks the DAW again.
  await expect(page.getByRole('button', { name: /^Stop$/ })).toBeVisible();
  await page.keyboard.press('Space');
  await expect.poll(async () => (await calls(page)).stops, { timeout: 5000 }).toBe(2);
});

// QA r4: the host's session stop never finishes. Record used to start the take after the wait with no listening and no sentence.
test('a session stop the host never finishes: the next Record says the text cannot follow, and records nothing unheard', async ({ page }) => {
  test.setTimeout(90_000);
  await page.addInitScript(() => {
    const w = window as unknown as { __calls: Calls; __NARRATION_MOCK_OVERRIDES__: Record<string, unknown> };
    w.__calls = { stops: 0, listeningStops: 0, listeningStarts: 0 };
    let phase = 'idle';
    const listeners = new Set<(state: unknown) => void>();
    const publish = (next: string) => {
      phase = next;
      listeners.forEach((listener) => listener({ phase, message: '', engine: 'whisper', chapter: 'c1', script: null, position: null }));
    };
    w.__NARRATION_MOCK_OVERRIDES__ = {
      teleprompterState: async () => ({ phase, message: '', engine: 'whisper', chapter: 'c1', script: null, position: null }),
      subscribeTeleprompterState: (listener: (state: unknown) => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      teleprompterStart: async () => {
        w.__calls.listeningStarts += 1;
        if (phase !== 'idle' && phase !== 'stopped') throw new Error('a teleprompter session is already running');
        publish('running');
        return { status: 'started' };
      },
      teleprompterStop: async () => {
        w.__calls.listeningStops += 1;
        if (phase === 'running') publish('stopping');
      },
    };
  });
  await page.goto('/');
  await settlePage(page);
  await goToPage(page, 'Booth');
  await expect(record(page)).toBeEnabled();
  await showChapterTop(page);
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: /^Stop$/ })).toBeVisible({ timeout: 8000 });
  await page.waitForTimeout(1500);
  await page.keyboard.press('Space');
  await expect(record(page)).toBeVisible({ timeout: 8000 });
  await page.waitForTimeout(500);
  await page.keyboard.press('Space');
  await expect(page.getByText(/Recording did not start: the text cannot follow your voice/).first()).toBeVisible({ timeout: 30_000 });
  await expect(record(page)).toBeVisible();
  expect((await calls(page)).listeningStarts).toBe(2);
});
