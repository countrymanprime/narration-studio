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

const installHeldTake = () => {
  const w = window as unknown as {
    __calls: Calls;
    __recording: boolean;
    __refuseListening: Array<(ok: boolean) => void>;
    __transport: Set<(transport: unknown) => void>;
    __NARRATION_MOCK_OVERRIDES__: Record<string, unknown>;
  };
  w.__calls = { stops: 0, listeningStops: 0, listeningStarts: 0 };
  w.__recording = false;
  w.__refuseListening = [];
  w.__transport = new Set();
  // The host's one session, published as the real host does: the next chapter's page sees it starting and asks for none of its own.
  let phase = 'idle';
  let coldRead = false;
  const phases = new Set<(state: unknown) => void>();
  const publish = (next: string) => {
    phase = next;
    phases.forEach((listener) => listener(state()));
  };
  const state = () => ({ phase, message: '', engine: 'whisper', chapter: null, paused: false, coldRead, script: null, position: null });
  const push = () => w.__transport.forEach((listener) => listener({ playing: w.__recording, recording: w.__recording, position: 1 }));
  w.__NARRATION_MOCK_OVERRIDES__ = {
    subscribeDawTransport: (listener: (transport: unknown) => void) => (w.__transport.add(listener), () => w.__transport.delete(listener)),
    dawProjectState: async () => ({ savedAt: null, unsavedChanges: false, playState: w.__recording ? 'recording' : 'stopped', playPosition: 0 }),
    teleprompterState: async () => state(),
    subscribeTeleprompterState: (listener: (state: unknown) => void) => (phases.add(listener), () => phases.delete(listener)),
    teleprompterStart: (options?: { coldRead?: boolean }) =>
      new Promise((resolve, reject) => {
        w.__calls.listeningStarts += 1;
        if (phase === 'starting' || phase === 'running') return reject(new Error('a teleprompter session is already running'));
        coldRead = Boolean(options?.coldRead);
        // A cold read comes up at once; a take's listening is held for the test to answer.
        if (coldRead) {
          publish('running');
          return resolve({ status: 'started' });
        }
        publish('starting');
        w.__refuseListening.push((ok) => {
          publish(ok ? 'running' : 'error');
          if (ok) resolve({ status: 'started' });
          else reject(new Error('The microphone is in use by another application.'));
        });
      }),
    teleprompterStop: async () => {
      w.__calls.listeningStops += 1;
      if (phase === 'running') {
        coldRead = false;
        publish('stopped');
      }
    },
    readAloudRecordStart: async () => {
      w.__recording = true;
      setTimeout(push, 20);
      return { outcome: 'started', position: 0, message: '' };
    },
    readAloudRecordStop: async () => {
      w.__calls.stops += 1;
      // The first stop (the leave question's) fails; the narrator's own Stop later goes through.
      if (w.__calls.stops === 1) throw new Error('REAPER did not answer.');
      w.__recording = false;
      return { outcome: 'stopped', message: '', undoPoints: 0 };
    },
  };
};

// #3409: the narrator left a take recording on purpose (the stop failed, then "Leave anyway") and changed chapter while the take's listening was still
// starting. The next chapter's page adopts the take; the listening then fails. The take is not stopped behind the narrator, and the Booth says that the
// text could not follow it. (The fake DAW reports the project as recording once its start answered; none of this is real REAPER.)
for (const ending of ['fails', 'comes up and is let go'] as const) {
  test(`a chapter left with a take recording, whose listening then ${ending}, says the text could not follow the take and stops nothing`, async ({ page }) => {
    await page.addInitScript(installHeldTake);
    await page.goto('/');
    await settlePage(page);
    await goToPage(page, 'Booth');
    await expect(record(page)).toBeEnabled();
    await page.keyboard.press('Space');
    const stop = page.getByRole('button', { name: /^Stop$/ });
    await expect(stop).toBeVisible({ timeout: 8000 });
    await page.evaluate(() => {
      window.history.pushState(null, '', '/booth?chapter=chapter-2');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    const question = page.getByRole('alertdialog');
    await question.getByRole('button', { name: /^Stop and leave/ }).click();
    const anyway = question.getByRole('button', { name: /^Leave anyway/ });
    await expect(anyway).toBeVisible({ timeout: 8000 });
    // The button ignores a press for a moment after it appears (a double-click on the one it replaced).
    await page.waitForTimeout(600);
    await anyway.click();
    await expect(page).toHaveURL(/chapter=chapter-2/);
    await expect(stop).toBeVisible({ timeout: 8000 });
    await page.evaluate(
      (ok) => (window as unknown as { __refuseListening: Array<(ok: boolean) => void> }).__refuseListening[0](ok),
      ending === 'comes up and is let go',
    );
    const sentence = page.getByText('The text could not follow your voice for the take that is still recording. Press Stop, then record again.');
    await expect(sentence).toBeVisible({ timeout: 8000 });
    await expect(page.getByText(/Recording did not start/)).toHaveCount(0);
    // Nothing stopped the take behind the narrator; Stop is theirs and works.
    expect((await calls(page)).stops).toBe(1);
    await expect(stop).toBeVisible();
    await stop.click();
    await expect(record(page)).toBeVisible({ timeout: 8000 });
    expect((await calls(page)).stops).toBe(2);
    // The sentence goes with the take: it does not stay beside "Stopped. Recorded".
    await expect(sentence).toHaveCount(0);
  });
}

// att15 N1d: the stale press's listening fails while the next chapter's page shows no take (the DAW reads stopped), and the DAW then pushes the same take:
// the page adopts it and starts the listening that follows it, so the report that waited for it says nothing.
test('a report that waits for adoption says nothing when the page then starts its own listening and it follows', async ({ page }) => {
  await page.addInitScript(installHeldTake);
  await page.goto('/');
  await settlePage(page);
  await goToPage(page, 'Booth');
  await expect(record(page)).toBeEnabled();
  await page.keyboard.press('Space');
  const stop = page.getByRole('button', { name: /^Stop$/ });
  await expect(stop).toBeVisible({ timeout: 8000 });
  await page.evaluate(() => {
    (window as unknown as { __recording: boolean }).__recording = false;
    window.history.pushState(null, '', '/booth?chapter=chapter-2');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  const question = page.getByRole('alertdialog');
  await question.getByRole('button', { name: /^Stop and leave/ }).click();
  const anyway = question.getByRole('button', { name: /^Leave anyway/ });
  await expect(anyway).toBeVisible({ timeout: 8000 });
  await page.waitForTimeout(600);
  await anyway.click();
  await expect(page).toHaveURL(/chapter=chapter-2/);
  await page.evaluate(() => (window as unknown as { __refuseListening: Array<(ok: boolean) => void> }).__refuseListening[0](false));
  // The same take is reported by the DAW: the page adopts it and asks for its own listening, which stays out.
  await page.evaluate(() => {
    const w = window as unknown as { __recording: boolean; __transport: Set<(transport: unknown) => void> };
    w.__recording = true;
    w.__transport.forEach((listener) => listener({ playing: true, recording: true, position: 1 }));
  });
  await expect(stop).toBeVisible({ timeout: 8000 });
  await expect.poll(async () => (await calls(page)).listeningStarts, { timeout: 8000 }).toBeGreaterThanOrEqual(2);
  await page.waitForTimeout(1500);
  await expect(page.getByText('The text could not follow your voice for the take that is still recording. Press Stop, then record again.')).toHaveCount(0);
});

// att16 K1: the report waits on a page with no take; the narrator starts a cold read there; the DAW then reports the take, the page ends the cold read and
// listens for the take, and that listening follows it: the sentence is never said, not even in the moment between the cold read's end and the new start.
test('a report that waits for adoption says nothing when the adopting page ends a cold read and its own listening follows the take', async ({ page }) => {
  await page.addInitScript(installHeldTake);
  await page.goto('/');
  await settlePage(page);
  await goToPage(page, 'Booth');
  await expect(record(page)).toBeEnabled();
  await page.keyboard.press('Space');
  const stop = page.getByRole('button', { name: /^Stop$/ });
  await expect(stop).toBeVisible({ timeout: 8000 });
  await page.evaluate(() => {
    (window as unknown as { __recording: boolean }).__recording = false;
    window.history.pushState(null, '', '/booth?chapter=chapter-2');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  const question = page.getByRole('alertdialog');
  await question.getByRole('button', { name: /^Stop and leave/ }).click();
  const anyway = question.getByRole('button', { name: /^Leave anyway/ });
  await expect(anyway).toBeVisible({ timeout: 8000 });
  await page.waitForTimeout(600);
  await anyway.click();
  await expect(page).toHaveURL(/chapter=chapter-2/);
  await page.evaluate(() => (window as unknown as { __refuseListening: Array<(ok: boolean) => void> }).__refuseListening[0](false));
  // A cold read on this page, then the DAW reports the take.
  await page.getByRole('button', { name: 'Record options' }).click();
  await page.getByRole('radiogroup', { name: 'Main button' }).getByRole('radio', { name: 'Cold read' }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Cold read', exact: true }).click();
  await expect.poll(async () => (await calls(page)).listeningStarts, { timeout: 8000 }).toBe(2);
  await page.evaluate(() => {
    const w = window as unknown as { __recording: boolean; __transport: Set<(transport: unknown) => void> };
    w.__recording = true;
    w.__transport.forEach((listener) => listener({ playing: true, recording: true, position: 1 }));
  });
  // The cold read ends and the page asks for the take's own listening.
  await expect.poll(async () => (await calls(page)).listeningStarts, { timeout: 8000 }).toBe(3);
  const sentence = page.getByText('The text could not follow your voice for the take that is still recording. Press Stop, then record again.');
  await page.waitForTimeout(1000);
  await expect(sentence).toHaveCount(0);
  // It follows the take.
  await page.evaluate(() => (window as unknown as { __refuseListening: Array<(ok: boolean) => void> }).__refuseListening[1](true));
  await page.waitForTimeout(1000);
  await expect(sentence).toHaveCount(0);
});
