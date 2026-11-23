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

type Hung = 'lookup' | 'modelCheck' | 'listening' | 'voiceChoice' | 'recordStart' | 'recordStartLate';
type Calls = { stops: number; starts: number; hangs: number };
const record = (page: Page) => page.getByRole('button', { name: /^Record$/, includeHidden: true });
const stop = (page: Page) => page.getByRole('button', { name: /^Stop$/ });
const dawRecording = (page: Page) => page.evaluate(() => window.__NARRATION_MOCK_DAW__?.state().recording);
/** How many places on screen say `text` (a message, the footer's sentence): a refusal is said once (#3322). A screen-reader-only description is not on screen. */
const timesSaid = (page: Page, text: RegExp) =>
  page.evaluate((source) => {
    const pattern = new RegExp(source);
    return [...document.querySelectorAll('body *')].filter((el) => {
      const box = el.getBoundingClientRect();
      return el.children.length === 0 && pattern.test(el.textContent ?? '') && box.width > 1 && box.height > 1;
    }).length;
  }, text.source);
const calls = (page: Page) => page.evaluate(() => (window as unknown as { __calls: Calls }).__calls);

/** Opens the Booth with the named host call hanging once (the first press) and answering normally after; `recordStartLate` answers after 16 s. */
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
    if (which === 'lookup') overrides.boothPunchTarget = () => (hangOnce() ? new Promise(() => {}) : Promise.resolve({ outcome: 'found', start: 12, end: 20 }));
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
          : new Promise((resolve) => setTimeout(() => resolve({ outcome: 'started', position: 0, message: '' }), 16_000));
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

// #3432: a model check that outlasts its limit is "unknown", not "missing": the press goes on and the listening start is the authority.
test('a model check that never answers does not end the press: after its limit the take records and no sentence says it did not', async ({ page }) => {
  await openWith(page, 'modelCheck');
  await arm(page);
  await page.keyboard.press('Space');
  await expect(record(page)).toHaveAttribute('aria-busy', 'true');
  await expect(stop(page)).toBeVisible({ timeout: 70_000 });
  await expect(page.getByText(/could not be checked in time/)).toHaveCount(0);
  expect(await dawRecording(page)).toBe(true);
});

test('a DAW start that never answers ends the press with a sentence and Record is free again', async ({ page }) => {
  await openWith(page, 'recordStart');
  await arm(page);
  await page.keyboard.press('Space');
  await expect(record(page)).toHaveAttribute('aria-busy', 'true');
  await expect(page.getByText(/gave up waiting for REAPER to start recording/).first()).toBeVisible({ timeout: 20_000 });
  expect(await timesSaid(page, /gave up waiting for REAPER to start recording/)).toBe(1);
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
  await expect(page.getByText(/gave up waiting for REAPER to start recording/).first()).toBeVisible({ timeout: 20_000 });
  expect(await timesSaid(page, /gave up waiting for REAPER to start recording/)).toBe(1);
  // The host answers at 16 s with a take; the Booth gave up at 14 s (PRESS_LIMITS_MS.recordStart), so it stops that take.
  await expect.poll(async () => (await calls(page)).stops, { timeout: 8000 }).toBeGreaterThanOrEqual(1);
  await expect(stop(page)).toHaveCount(0);
});

test('a listening start that never answers ends the press with a sentence, and no take is left recording', async ({ page }) => {
  await openWith(page, 'listening');
  await arm(page);
  await page.keyboard.press('Space');
  // The DAW starts meanwhile (Record reads Stop); the take is dropped when the listening gives up.
  await expect(page.getByText(/The take was taken back because the text could not follow your voice in time/).first()).toBeVisible({ timeout: 52_000 });
  expect(await timesSaid(page, /The take was taken back because the text could not follow your voice in time/)).toBe(1);
  await expect(record(page)).toBeVisible();
  await expect(record(page)).not.toHaveAttribute('aria-busy', 'true');
  expect(await dawRecording(page)).toBe(false);
});

test('a lookup of the chosen start that never answers ends the press with one error and no "Starting from" beside it', async ({ page }) => {
  await openWith(page, 'lookup');
  await arm(page);
  await page.locator('[data-booth-text] [data-word]').nth(40).click();
  await page.keyboard.press('Space'); // marking only marks (#3319): Record starts the take, from the mark
  await expect(record(page)).toHaveAttribute('aria-busy', 'true');
  await expect(page.getByText(/did not come back in time, so no take was started/).first()).toBeVisible({ timeout: 12_000 });
  expect(await timesSaid(page, /did not come back in time, so no take was started/)).toBe(1);
  // The press's note about the start is gone with it, and the message is an error that stays until dismissed or its 20 s are up.
  await expect(page.getByText(/Starting from/)).toHaveCount(0);
  await expect(page.locator('[data-toast-region] [data-tone="error"]')).toHaveCount(1);
  await expect(record(page)).not.toHaveAttribute('aria-busy', 'true');
  expect(await dawRecording(page)).toBe(false);
});

test('a lookup refusal does not stay beside the take a later press starts', async ({ page }) => {
  await openWith(page, 'lookup');
  await arm(page);
  await page.locator('[data-booth-text] [data-word]').nth(40).click();
  await page.keyboard.press('Space'); // marking only marks (#3319): Record starts the take, from the mark
  await expect(page.getByText(/did not come back in time, so no take was started/).first()).toBeVisible({ timeout: 12_000 });
  await expect(record(page)).not.toHaveAttribute('aria-busy', 'true');
  await page.keyboard.press('Space');
  await expect(stop(page)).toBeVisible({ timeout: 8000 });
  // "No take was started" beside a take that runs (and any Retry, which would stop it) is not true any more.
  await expect(page.locator('[data-toast-region] [data-tone="error"]')).toHaveCount(0);
});

test('a voice choice that never answers ends a punch press with a sentence and starts no take', async ({ page }) => {
  await openWith(page, 'voiceChoice');
  await arm(page);
  await page.locator('[data-booth-text] [data-word]').nth(40).click();
  await page.keyboard.press('Space'); // marking sends nothing (#3319): Record starts the take, from the mark
  await expect(record(page)).toHaveAttribute('aria-busy', 'true');
  // The press waits PRESS_LIMITS_MS.voiceChoice (45 s): above the host's whole budget for the arm (laneCommandTimeout).
  await expect(page.getByText(/could not be set in time, so no take was started/).first()).toBeVisible({ timeout: 52_000 });
  expect(await timesSaid(page, /could not be set in time, so no take was started/)).toBe(1);
  await expect(record(page)).not.toHaveAttribute('aria-busy', 'true');
  expect(await dawRecording(page)).toBe(false);
});

// A model check that answers "not installed" after the press gave up on it opens no install question, on its own or over a take the narrator
// started meanwhile (the question exists so that no take begins behind it).
async function openWithLateModelCheck(page: Page, answerAfterMs = 60_000): Promise<void> {
  await page.addInitScript((answerAfter) => {
    const w = window as unknown as { __armed: boolean; __NARRATION_MOCK_OVERRIDES__: Record<string, unknown> };
    w.__armed = false;
    const missing = {
      id: 'x',
      kind: 'whisper',
      displayName: 'Late model',
      version: '1',
      publisher: 'p',
      license: 'l',
      licenseUrl: '',
      modelCardUrl: '',
      provenanceUrl: '',
      attribution: '',
      installState: 'not_installed',
      downloadSize: 1,
      diskSize: 1,
      path: '',
    };
    w.__NARRATION_MOCK_OVERRIDES__ = {
      assetsList: async () => {
        const empty = { cacheRoot: '', defaultRoot: '', custom: false, previousRoot: '', folderNote: '', totalInstalledBytes: 0, assets: [] as unknown[] };
        if (!w.__armed) return empty;
        w.__armed = false;
        await new Promise((resolve) => setTimeout(resolve, answerAfter));
        return { ...empty, assets: { find: () => missing } };
      },
    };
  }, answerAfterMs);
  await page.goto('/');
  await settlePage(page);
  await goToPage(page, 'Booth');
  await expect(record(page)).toBeEnabled();
  await showChapterTop(page);
  await arm(page);
}
const installQuestion = (page: Page) => page.getByRole('dialog', { name: /Download local/ });
/** Whether the install question was on screen at any moment since it was watched (one that opens and is closed again at once is seen too). */
const watchInstallQuestion = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as { __sawInstall: boolean };
    w.__sawInstall = false;
    new MutationObserver(() => {
      if (/Download local/.test(document.body.innerText)) w.__sawInstall = true;
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
  });
const sawInstallQuestion = (page: Page) => page.evaluate(() => (window as unknown as { __sawInstall: boolean }).__sawInstall);

test('a model check that answers missing after its limit opens no install question over the take', async ({ page }) => {
  await openWithLateModelCheck(page);
  await watchInstallQuestion(page);
  await page.keyboard.press('Space');
  await expect(stop(page)).toBeVisible({ timeout: 70_000 });
  await expect(page.getByText(/could not be checked in time/)).toHaveCount(0);
  await page.waitForTimeout(8000);
  await expect(installQuestion(page)).toHaveCount(0);
  expect(await sawInstallQuestion(page)).toBe(false);
  expect(await dawRecording(page)).toBe(true);
});

// Stop pressed while the take's listening is still starting stops the DAW at once; the listening is let go when it answers.
test('Stop pressed while the listening start is pending stops the DAW take at once', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __armed: boolean; __NARRATION_MOCK_OVERRIDES__: Record<string, unknown> };
    w.__armed = false;
    w.__NARRATION_MOCK_OVERRIDES__ = {
      teleprompterStart: () => {
        if (!w.__armed) return Promise.resolve({ status: 'started' });
        w.__armed = false;
        return new Promise((resolve) => setTimeout(() => resolve({ status: 'started' }), 20_000));
      },
    };
  });
  await page.goto('/?mockCallLog=1');
  await settlePage(page);
  await goToPage(page, 'Booth');
  await expect(record(page)).toBeEnabled();
  await showChapterTop(page);
  await arm(page);
  const hostCalls = (name: string) => page.evaluate((n) => (window.__hostCalls ?? []).filter((call) => call.name === n).length, name);
  await page.keyboard.press('Space');
  await expect(stop(page)).toBeVisible({ timeout: 5000 });
  await page.waitForTimeout(3000);
  await page.keyboard.press('Space');
  // Within a second of the second press, not when the listening answers at 20 s.
  await expect.poll(() => hostCalls('readAloudRecordStop'), { timeout: 1500 }).toBe(1);
  await expect.poll(() => dawRecording(page), { timeout: 1500 }).toBe(false);
  await expect(record(page)).toBeVisible();
  // The listening that comes up afterwards is let go, and nothing records.
  await expect.poll(() => hostCalls('teleprompterStop'), { timeout: 25_000 }).toBeGreaterThanOrEqual(1);
  expect(await dawRecording(page)).toBe(false);
  expect(await hostCalls('readAloudRecordStop')).toBe(1);
});

// A Stop the start guard ignores (a double tap) leaves the take recording with its listening: the listening that answers later is not let go.
test('double-tap Space with slow listening: the listening is not stopped and the take keeps recording', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __armed: boolean; __NARRATION_MOCK_OVERRIDES__: Record<string, unknown> };
    w.__armed = false;
    w.__NARRATION_MOCK_OVERRIDES__ = {
      teleprompterStart: () => {
        if (!w.__armed) return Promise.resolve({ status: 'started' });
        w.__armed = false;
        return new Promise((resolve) => setTimeout(() => resolve({ status: 'started' }), 4000));
      },
    };
  });
  await page.goto('/?mockCallLog=1');
  await settlePage(page);
  await goToPage(page, 'Booth');
  await expect(record(page)).toBeEnabled();
  await showChapterTop(page);
  await arm(page);
  const hostCalls = (name: string) => page.evaluate((n) => (window.__hostCalls ?? []).filter((call) => call.name === n).length, name);
  await page.keyboard.press('Space');
  await expect(stop(page)).toBeVisible({ timeout: 5000 });
  await page.waitForTimeout(150);
  await page.keyboard.press('Space');
  await page.waitForTimeout(5500);
  expect(await hostCalls('teleprompterStop')).toBe(0);
  expect(await hostCalls('readAloudRecordStop')).toBe(0);
  expect(await dawRecording(page)).toBe(true);
  await expect(stop(page)).toBeVisible();
});

// #3409: R (Punch and roll) during a take ends too: a roll the DAW never answers gives a sentence at its limit and R rolls again.
test('a roll the DAW never answers ends with a sentence that says to look, and R rolls again', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __armed: boolean; __NARRATION_MOCK_OVERRIDES__: Record<string, unknown> };
    w.__armed = false;
    w.__NARRATION_MOCK_OVERRIDES__ = {
      dawRoll: () => {
        if (!w.__armed) return Promise.resolve({ ok: true, changed: true, message: '', undoSteps: 1 });
        w.__armed = false;
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
  await expect(stop(page)).toBeVisible({ timeout: 8000 });
  await arm(page);
  await page.keyboard.press('r');
  await expect(page.getByText(/REAPER did not answer the roll in time\. The take may still be recording from before/).first()).toBeVisible({ timeout: 12_000 });
  await page.keyboard.press('r');
  await expect(page.getByText(/Rolling again from ¶/).first()).toBeVisible({ timeout: 5000 });
  await expect(stop(page)).toBeVisible();
});

// #3409: a take the app itself drops (its listening failed after the DAW started) is said once; the stop's own transport push is not REAPER ending it.
test('a dropped unheard take does not also say that REAPER stopped recording', async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { __NARRATION_MOCK_OVERRIDES__: Record<string, unknown> }).__NARRATION_MOCK_OVERRIDES__ = {
      teleprompterStart: () => new Promise((_resolve, reject) => setTimeout(() => reject(new Error('The microphone is in use by another application.')), 1500)),
    };
  });
  await page.goto('/');
  await settlePage(page);
  await goToPage(page, 'Booth');
  await expect(record(page)).toBeEnabled();
  await showChapterTop(page);
  await page.keyboard.press('Space');
  await expect(page.getByText(/Recording did not start: the text cannot follow your voice/).first()).toBeVisible({ timeout: 10_000 });
  expect(await dawRecording(page)).toBe(false);
  // The second sentence came a few seconds after the first.
  await page.waitForTimeout(4000);
  await expect(page.getByText(/REAPER stopped recording/)).toHaveCount(0);
});

// #3409: a roll that lands after the narrator stopped the take started a recording nobody runs: it is stopped and said.
test('a roll that answers after Stop says to check the DAW and sends no stop', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __armed: boolean; __NARRATION_MOCK_OVERRIDES__: Record<string, unknown> };
    w.__armed = false;
    w.__NARRATION_MOCK_OVERRIDES__ = {
      dawRoll: () => {
        if (!w.__armed) return Promise.resolve({ ok: true, changed: true, message: '', undoSteps: 1 });
        w.__armed = false;
        return new Promise((resolve) => setTimeout(() => resolve({ ok: true, changed: true, message: '', undoSteps: 1 }), 12_000));
      },
    };
  });
  await page.goto('/?mockCallLog=1');
  await settlePage(page);
  await goToPage(page, 'Booth');
  await expect(record(page)).toBeEnabled();
  await showChapterTop(page);
  const stops = () => page.evaluate(() => (window.__hostCalls ?? []).filter((call) => call.name === 'readAloudRecordStop').length);
  await page.keyboard.press('Space');
  await expect(stop(page)).toBeVisible({ timeout: 8000 });
  await arm(page);
  await page.keyboard.press('r');
  await expect(page.getByText(/did not answer the roll in time/).first()).toBeVisible({ timeout: 12_000 });
  await page.keyboard.press('Space');
  await expect(record(page)).toBeVisible({ timeout: 8000 });
  expect(await stops()).toBe(1);
  await expect(page.getByText(/A late roll has landed, so REAPER may be recording and a take may be cut\. Check REAPER\./).first()).toBeVisible({
    timeout: 10_000,
  });
  // The app does nothing to the DAW for a stale answer: the one stop is the narrator's.
  expect(await stops()).toBe(1);
});

// #3409 (BRK-1): a roll that answers after Stop and a second take is that take's to keep: the stale answer never stops it.
test('a roll that answers while a newer take records does not stop that take', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __armed: boolean; __NARRATION_MOCK_OVERRIDES__: Record<string, unknown> };
    w.__armed = false;
    w.__NARRATION_MOCK_OVERRIDES__ = {
      dawRoll: () => {
        if (!w.__armed) return Promise.resolve({ ok: true, changed: true, message: '', undoSteps: 1 });
        w.__armed = false;
        return new Promise((resolve) => setTimeout(() => resolve({ ok: true, changed: true, message: '', undoSteps: 1 }), 12_000));
      },
    };
  });
  await page.goto('/?mockCallLog=1');
  await settlePage(page);
  await goToPage(page, 'Booth');
  await expect(record(page)).toBeEnabled();
  await showChapterTop(page);
  const stops = () => page.evaluate(() => (window.__hostCalls ?? []).filter((call) => call.name === 'readAloudRecordStop').length);
  await page.keyboard.press('Space');
  await expect(stop(page)).toBeVisible({ timeout: 8000 });
  await arm(page);
  await page.keyboard.press('r');
  await expect(page.getByText(/did not answer the roll in time/).first()).toBeVisible({ timeout: 12_000 });
  await page.keyboard.press('Space');
  await expect(record(page)).toBeVisible({ timeout: 8000 });
  await page.keyboard.press('Space');
  await expect(stop(page)).toBeVisible({ timeout: 8000 });
  await expect(page.getByText(/a take may be cut/).first()).toBeVisible({ timeout: 10_000 });
  expect(await stops()).toBe(1);
  expect(await dawRecording(page)).toBe(true);
  await expect(stop(page)).toBeVisible();
});

// #3409 (walkthrough finding 1): the late-roll sentence fits whole inside its toast, and the toast inside a 360x500 window, uncovered by the footer.
test('the late-roll toast is whole and uncovered at 360x500', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 500 });
  await page.addInitScript(() => {
    const w = window as unknown as { __armed: boolean; __NARRATION_MOCK_OVERRIDES__: Record<string, unknown> };
    w.__armed = false;
    w.__NARRATION_MOCK_OVERRIDES__ = {
      dawRoll: () => {
        if (!w.__armed) return Promise.resolve({ ok: true, changed: true, message: '', undoSteps: 1 });
        w.__armed = false;
        return new Promise((resolve) => setTimeout(() => resolve({ ok: true, changed: true, message: '', undoSteps: 1 }), 9_000));
      },
    };
  });
  await page.goto('/');
  await settlePage(page);
  await goToPage(page, 'Booth');
  await expect(record(page)).toBeEnabled();
  await showChapterTop(page);
  await page.keyboard.press('Space');
  await expect(stop(page)).toBeVisible({ timeout: 8000 });
  await arm(page);
  await page.keyboard.press('r');
  const late = page.getByText(/A late roll has landed, so REAPER may be recording and a take may be cut\. Check REAPER\./).first();
  await expect(late).toBeVisible({ timeout: 14_000 });
  // The timeout sentence is replaced, not left beside it.
  await expect(page.getByText(/press R to roll again/)).toHaveCount(0);
  const box = (await late.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(360);
  expect(box.y + box.height).toBeLessThanOrEqual(500);
  // Nothing (the footer) sits over any corner of the sentence.
  const covered = await late.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return [
      [rect.left + 2, rect.top + 2],
      [rect.right - 2, rect.top + 2],
      [rect.left + 2, rect.bottom - 2],
      [rect.right - 2, rect.bottom - 2],
    ].some(([x, y]) => {
      const hit = document.elementFromPoint(x!, y!);
      return !hit || !(element.contains(hit) || hit.contains(element));
    });
  });
  expect(covered).toBe(false);
});

// #3409 (QA r5): a roll that answers while Stop is still pending is for a take that is already over: the late sentence, not "Rolling again".
test('a roll that answers while Stop is still pending says the late sentence, not Rolling again', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __armed: boolean; __NARRATION_MOCK_OVERRIDES__: Record<string, unknown> };
    w.__armed = false;
    w.__NARRATION_MOCK_OVERRIDES__ = {
      dawRoll: () => {
        if (!w.__armed) return Promise.resolve({ ok: true, changed: true, message: '', undoSteps: 1 });
        w.__armed = false;
        return new Promise((resolve) => setTimeout(() => resolve({ ok: true, changed: true, message: '', undoSteps: 1 }), 1_800));
      },
      readAloudRecordStop: () => new Promise((resolve) => setTimeout(() => resolve({ outcome: 'stopped', message: '', undoPoints: 0 }), 3_000)),
    };
  });
  await page.goto('/');
  await settlePage(page);
  await goToPage(page, 'Booth');
  await expect(record(page)).toBeEnabled();
  await showChapterTop(page);
  await page.keyboard.press('Space');
  await expect(stop(page)).toBeVisible({ timeout: 8000 });
  await arm(page);
  await page.keyboard.press('r');
  await page.waitForTimeout(1000);
  await page.keyboard.press('Space');
  await expect(page.getByText(/A late roll has landed/).first()).toBeVisible({ timeout: 6000 });
  await expect(page.getByText(/Rolling again from/)).toHaveCount(0);
});
