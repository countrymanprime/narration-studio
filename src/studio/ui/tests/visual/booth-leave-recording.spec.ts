// Every way out of the Booth while a take records asks the way Escape does, and none leaves the DAW recording on another page with no Stop (#3325).
// The Booth hides the navigation rail, so the narrator's exits are Escape, Exit and the browser's Back; the last two ran past the question before.
import { expect, test, type Page } from '@playwright/test';
import { pastStartGuard } from './helpers/startGuard';
import { settlePage } from './helpers/settle';
import { showChapterTop } from './helpers/viewTop';
import { goToPage } from './drivers/shared';

test.use({ viewport: { width: 1440, height: 900 } });

const record = (page: Page) => page.getByRole('button', { name: /^Record$/, includeHidden: true });
const stop = (page: Page) => page.getByRole('button', { name: /^Stop$/ });
const question = (page: Page) => page.getByRole('alertdialog', { name: /^(Stop recording|Leave while a take is starting)\?$/ });
const dawRecording = (page: Page) => page.evaluate(() => window.__NARRATION_MOCK_DAW__?.state().recording);
/** The stops the host was asked for (`?mockCallLog=1` records every host call): a leave stops a take once. */
const stops = (page: Page) => page.evaluate(() => (window.__hostCalls ?? []).filter((call) => call.name === 'readAloudRecordStop').length);
const onBooth = (page: Page) => page.evaluate(() => window.location.pathname === '/booth');

/** Production, then the Booth (so Back has somewhere to go), with a take running. */
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

test('browser Back during a take asks "Stop recording?", and Keep recording stays in the Booth', async ({ page }) => {
  await recording(page);
  await page.evaluate(() => window.history.back());
  await expect(question(page)).toBeVisible();
  expect(await dawRecording(page)).toBe(true);
  await question(page)
    .getByRole('button', { name: /Keep recording|Cancel/ })
    .click();
  await expect(question(page)).toHaveCount(0);
  expect(await onBooth(page)).toBe(true);
  expect(await dawRecording(page)).toBe(true);
  await expect(stop(page)).toBeVisible();
});

test('browser Back during a take: Stop and leave stops the take and leaves exactly once', async ({ page }) => {
  await recording(page);
  await page.evaluate(() => window.history.back());
  await question(page).getByRole('button', { name: /^Stop/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Production' })).toBeVisible();
  await expect.poll(() => dawRecording(page)).toBe(false);
  expect(await page.evaluate(() => window.location.pathname)).toBe('/');
  // One step back, not two: the entry before Production (the app's first) is where history started.
  expect(await page.evaluate(() => window.history.state?.idx)).toBe(0);
});

test('Back pressed twice while the question is open asks once', async ({ page }) => {
  await recording(page);
  await page.evaluate(() => window.history.back());
  await expect(question(page)).toBeVisible();
  await page.evaluate(() => window.history.back());
  await page.waitForTimeout(300);
  await expect(page.getByRole('alertdialog', { includeHidden: true })).toHaveCount(1);
  expect(await onBooth(page)).toBe(true);
  expect(await dawRecording(page)).toBe(true);
});

test('Escape, then Back with the question open, leaves one question and the take running', async ({ page }) => {
  await recording(page);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('alertdialog').first()).toBeVisible();
  await page.evaluate(() => window.history.back());
  await page.waitForTimeout(300);
  await expect(page.getByRole('alertdialog', { includeHidden: true })).toHaveCount(1);
  expect(await onBooth(page)).toBe(true);
  expect(await dawRecording(page)).toBe(true);
});

test('Forward into the Booth, then Back with nothing recording, leaves with no question', async ({ page }) => {
  await recording(page);
  await page.evaluate(() => window.history.back());
  await question(page).getByRole('button', { name: /^Stop/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Production' })).toBeVisible();
  await expect.poll(() => dawRecording(page)).toBe(false);
  // Forward to the Booth: nothing records there, so Back leaves with no question.
  await page.evaluate(() => window.history.forward());
  await expect(record(page)).toBeVisible();
  await page.evaluate(() => window.history.back());
  await expect(page.getByRole('heading', { level: 1, name: 'Production' })).toBeVisible();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
});

test('Back after Keep recording asks again, and a take kept twice is still running', async ({ page }) => {
  await recording(page);
  for (let i = 0; i < 2; i++) {
    await page.evaluate(() => window.history.back());
    await expect(question(page)).toBeVisible();
    await question(page)
      .getByRole('button', { name: /Keep recording/ })
      .click();
    await expect(question(page)).toHaveCount(0);
    expect(await onBooth(page)).toBe(true);
  }
  expect(await dawRecording(page)).toBe(true);
});

test('Back with nothing recording leaves with no question', async ({ page }) => {
  await page.goto('/?mockCallLog=1');
  await settlePage(page);
  await goToPage(page, 'Booth');
  await expect(record(page)).toBeEnabled();
  await page.evaluate(() => window.history.back());
  await expect(page.getByRole('heading', { level: 1, name: 'Production' })).toBeVisible();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
});

test('Escape still asks, and Stop and leave stops the take', async ({ page }) => {
  await recording(page);
  await page.keyboard.press('Escape');
  await question(page).getByRole('button', { name: /^Stop/ }).click();
  await expect.poll(() => dawRecording(page)).toBe(false);
  await expect(page.locator('[data-booth-text]')).toHaveCount(0);
});

test('the keyboard Back (Alt+Left) asks too, and Keep recording keeps the take', async ({ page }) => {
  await recording(page);
  await page.keyboard.press('Alt+ArrowLeft');
  await expect(question(page)).toBeVisible();
  await question(page)
    .getByRole('button', { name: /Keep recording|Cancel/ })
    .click();
  await expect(question(page)).toHaveCount(0);
  expect(await onBooth(page)).toBe(true);
  expect(await dawRecording(page)).toBe(true);
});

// Every exit the narrator can reach ends one of two ways, whatever the DAW answers: the take is stopped and the page goes, or the stop is refused and the
// Booth stays with the host's sentence and "Leave anyway". None leaves the page with the DAW still recording.
type Exit = { name: string; start?: (page: Page) => Promise<void>; go: (page: Page) => Promise<void> };
const EXITS: Exit[] = [
  { name: 'Escape', go: (page) => page.keyboard.press('Escape') },
  { name: 'Back', go: (page) => page.evaluate(() => window.history.back()) },
  { name: 'Alt+Left', go: (page) => page.keyboard.press('Alt+ArrowLeft') },
  { name: 'Ctrl+,', go: (page) => page.keyboard.press('Control+Comma') },
  { name: 'Ctrl+Alt+C (the Companion)', go: (page) => page.keyboard.press('Control+Alt+KeyC') },
  {
    name: 'the jump menu',
    go: async (page) => {
      await page.keyboard.press('Control+KeyK');
      await page.getByRole('combobox', { name: 'Jump menu' }).fill('Script');
      await page
        .getByRole('option', { name: /Script/ })
        .first()
        .click();
    },
  },
  {
    // Forward out of the Booth needs a later entry: leave by Escape (to Script), come Back to the Booth, and record there.
    name: 'Forward',
    start: async (page) => {
      await page.keyboard.press('Escape');
      await expect(page.getByRole('heading', { level: 1, name: 'Script' })).toBeVisible();
      await page.evaluate(() => window.history.back());
      await expect(record(page)).toBeEnabled();
    },
    go: (page) => page.evaluate(() => window.history.forward()),
  },
];

for (const exit of EXITS) {
  test(`${exit.name} during a take: Stop and leave stops the take and the page goes`, async ({ page }) => {
    if (exit.start) {
      await page.goto('/?mockCallLog=1');
      await settlePage(page);
      await goToPage(page, 'Booth');
      await exit.start(page);
      await record(page).click();
      await expect(stop(page)).toBeVisible();
      await pastStartGuard(page);
    } else await recording(page);
    await exit.go(page);
    await question(page).getByRole('button', { name: /^Stop/ }).click();
    await expect(page.locator('[data-booth-text]')).toHaveCount(0);
    await expect.poll(() => dawRecording(page)).toBe(false);
    // One stop, not a second as the page unmounts.
    await page.waitForTimeout(800);
    expect(await stops(page)).toBe(1);
  });

  test(`${exit.name} during a take: a refused stop keeps the Booth with the sentence, and Leave anyway then leaves`, async ({ page }) => {
    if (exit.start) {
      await page.goto('/?mockCallLog=1');
      await settlePage(page);
      await goToPage(page, 'Booth');
      await exit.start(page);
      await record(page).click();
      await expect(stop(page)).toBeVisible();
      await pastStartGuard(page);
    } else await recording(page);
    await page.evaluate(() => window.__NARRATION_MOCK_DAW__?.refuseNextRecord('Disk full.', 'stop'));
    await exit.go(page);
    await question(page).getByRole('button', { name: /^Stop/ }).click();
    const refused = page.getByRole('alertdialog', { name: /^Could not stop the take$/ });
    await expect(refused).toBeVisible();
    await expect(refused).toContainText('Disk full.');
    expect(await dawRecording(page)).toBe(true);
    await expect(page.locator('[data-booth-text]')).toHaveCount(1);
    // Past the arming moment of "Leave anyway" (below); a press inside it is ignored.
    await page.waitForTimeout(500);
    await refused.getByRole('button', { name: 'Leave anyway' }).click();
    await expect(page.locator('[data-booth-text]')).toHaveCount(0);
    // The same end on every exit: the one refused stop is the only stop, and the DAW is left recording, as the question says it may be.
    await page.waitForTimeout(800);
    expect(await stops(page)).toBe(1);
    expect(await dawRecording(page)).toBe(true);
  });
}

// A take the narrator starts after the stop landed and before the page goes (the passage map's run is still being written) is a new take: the page's
// own stop must still end it. The run is made slow through the mock's overrides; the second take starts inside that wait.
for (const exit of EXITS.filter((item) => ['Escape', 'Back', 'Ctrl+Alt+C (the Companion)', 'the jump menu'].includes(item.name))) {
  test(`${exit.name}: a take started while the stop's run is still being written is stopped as the page goes`, async ({ page }) => {
    await page.addInitScript(() => {
      (window as unknown as { __NARRATION_MOCK_OVERRIDES__: Record<string, unknown> }).__NARRATION_MOCK_OVERRIDES__ = {
        passageMapRecordRun: () => new Promise((resolve) => setTimeout(() => resolve([]), 3000)),
      };
    });
    await recording(page);
    await exit.go(page);
    await question(page).getByRole('button', { name: /^Stop/ }).click();
    await expect(record(page)).toBeVisible();
    await page.waitForTimeout(600);
    await record(page).click();
    await expect.poll(() => dawRecording(page)).toBe(true);
    await expect(page.locator('[data-booth-text]')).toHaveCount(0, { timeout: 8000 });
    await expect.poll(() => dawRecording(page), { timeout: 5000 }).toBe(false);
    expect(await stops(page)).toBe(2);
  });
}

// A start the host still has (a bootstrap, the start tone, the host call) when the narrator leaves: no take yet, and one about to land. The leave asks,
// waits for the start and stops that take; a start that lands with nobody left to ask is stopped as well. The slow start is the mock's override.
const slowStart = (ms: number) =>
  `(() => {
    const w = window;
    w.__NARRATION_MOCK_OVERRIDES__ = {
      ...(w.__NARRATION_MOCK_OVERRIDES__ ?? {}),
      readAloudRecordStart: () =>
        new Promise((resolve) =>
          setTimeout(() => {
            w.__NARRATION_MOCK_DAW__.record('start');
            resolve({ outcome: 'started', trackGuid: 'x', position: 0 });
          }, ${ms}),
        ),
    };
  })();`;
const openBooth = async (page: Page): Promise<void> => {
  await page.goto('/?mockCallLog=1');
  await settlePage(page);
  await goToPage(page, 'Booth');
  await expect(record(page)).toBeEnabled();
};

const STARTS = [
  ['Record', (page: Page) => record(page).click()],
  ['R', (page: Page) => page.keyboard.press('r')],
] as const;
for (const exit of EXITS.filter((item) => ['Back', 'Ctrl+,', 'Ctrl+Alt+C (the Companion)', 'the jump menu'].includes(item.name))) {
  for (const [startName, start] of STARTS) {
    test(`${startName} with the host still starting, then ${exit.name}: it asks, and the take that lands is stopped once`, async ({ page }) => {
      await page.addInitScript(slowStart(1500));
      await openBooth(page);
      await start(page);
      await page.waitForTimeout(400);
      await exit.go(page);
      await question(page).getByRole('button', { name: /^Stop/ }).click();
      await expect(page.locator('[data-booth-text]')).toHaveCount(0, { timeout: 8000 });
      await expect.poll(() => dawRecording(page), { timeout: 5000 }).toBe(false);
      expect(await stops(page)).toBe(1);
    });
  }
}

test('the start tone on, R, then Ctrl+, a moment later: the DAW is not left recording on Settings', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('narration-ui-take-tone', 'on'));
  await openBooth(page);
  await page.keyboard.press('r');
  await page.waitForTimeout(150);
  await page.keyboard.press('Control+Comma');
  // Either the press was still the Booth's to cancel (nothing started), or the host had it and the leave asked.
  const asked = await question(page)
    .getByRole('button', { name: /^Stop/ })
    .click({ timeout: 1500 })
    .then(
      () => true,
      () => false,
    );
  await page.waitForTimeout(2500);
  await expect(page.locator('[data-booth-text]')).toHaveCount(0);
  expect(await dawRecording(page), asked ? 'asked, stopped' : 'cancelled before the host had it').toBe(false);
});

test('a Record pressed while the stop of an earlier take is flushed starts a take the page going stops (slow run, slow start)', async ({ page }) => {
  test.setTimeout(40_000);
  await page.addInitScript(slowStart(1500));
  await page.addInitScript(() => {
    const w = window as unknown as { __NARRATION_MOCK_OVERRIDES__: Record<string, unknown> };
    w.__NARRATION_MOCK_OVERRIDES__.passageMapRecordRun = () => new Promise((resolve) => setTimeout(() => resolve([]), 3000));
  });
  await openBooth(page);
  await record(page).click();
  await expect.poll(() => dawRecording(page), { timeout: 6000 }).toBe(true);
  await pastStartGuard(page);
  await page.keyboard.press('Escape');
  await question(page).getByRole('button', { name: /^Stop/ }).click();
  await expect(record(page)).toBeVisible();
  await page.waitForTimeout(1200);
  await record(page).click();
  await expect(page.locator('[data-booth-text]')).toHaveCount(0, { timeout: 10_000 });
  await expect.poll(() => dawRecording(page), { timeout: 6000 }).toBe(false);
});

test('a second exit while the first one is flushed leaves on the first exit once', async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { __NARRATION_MOCK_OVERRIDES__: Record<string, unknown> }).__NARRATION_MOCK_OVERRIDES__ = {
      passageMapRecordRun: () => new Promise((resolve) => setTimeout(() => resolve([]), 2500)),
    };
  });
  await recording(page);
  const before = await page.evaluate(() => window.history.state?.idx as number);
  await page.keyboard.press('Escape');
  await question(page).getByRole('button', { name: /^Stop/ }).click();
  await expect(record(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+Comma');
  await page.evaluate(() => window.history.back());
  await expect(page.locator('[data-booth-text]')).toHaveCount(0, { timeout: 8000 });
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.location.pathname)).toBe('/script');
  expect(await page.evaluate(() => window.history.state?.idx as number)).toBe(before + 1);
});

test('the start tone on, R, Escape inside the tone: the start lands behind "Stop reading?", and answering it still stops the take', async ({ page }) => {
  test.setTimeout(40_000);
  await page.addInitScript(() => localStorage.setItem('narration-ui-take-tone', 'on'));
  await openBooth(page);
  await page.keyboard.press('r');
  await page.waitForTimeout(100);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('alertdialog').first()).toBeVisible();
  // The tone is over and the host has the start by now, whatever the question says.
  await expect.poll(() => dawRecording(page), { timeout: 6000 }).toBe(true);
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: /^Stop and leave/ })
    .click();
  // The take that began while the question was open is asked about as any take is.
  if (
    await question(page)
      .isVisible({ timeout: 1500 })
      .catch(() => false)
  )
    await question(page)
      .getByRole('button', { name: /^Stop and leave/ })
      .click();
  await expect(page.locator('[data-booth-text]')).toHaveCount(0, { timeout: 8000 });
  expect(await page.evaluate(() => window.location.pathname)).toBe('/script');
  await expect.poll(() => dawRecording(page), { timeout: 5000 }).toBe(false);
  expect(await stops(page)).toBe(1);
});

// An answer that never comes must not trap the narrator: each wait ends in the refusal question, or (the run) in leaving.
const hang = (name: 'readAloudRecordStart' | 'readAloudRecordStop' | 'passageMapRecordRun') => (page: Page) =>
  page.addInitScript((method) => {
    const w = window as unknown as { __NARRATION_MOCK_OVERRIDES__?: Record<string, unknown> };
    w.__NARRATION_MOCK_OVERRIDES__ = { ...(w.__NARRATION_MOCK_OVERRIDES__ ?? {}), [method]: () => new Promise(() => {}) };
  }, name);

test('a stop the host never answers: after about 8 s the question says so, Keep keeps the Booth, and Leave anyway leaves', async ({ page }) => {
  test.setTimeout(60_000);
  await page.addInitScript(() => {
    const w = window as unknown as { __NARRATION_MOCK_OVERRIDES__?: Record<string, unknown> };
    w.__NARRATION_MOCK_OVERRIDES__ = { readAloudRecordStop: () => new Promise(() => {}) };
  });
  await page.goto('/?mockCallLog=1');
  await settlePage(page);
  await goToPage(page, 'Booth');
  await expect(record(page)).toBeEnabled();
  await record(page).click();
  await expect.poll(() => dawRecording(page)).toBe(true);
  await pastStartGuard(page);
  await page.keyboard.press('Escape');
  await question(page).getByRole('button', { name: /^Stop/ }).click();
  const refused = page.getByRole('alertdialog', { name: /^Could not stop the take$/ });
  await expect(refused).toBeVisible({ timeout: 12_000 });
  await refused.getByRole('button', { name: /Keep recording|Cancel/ }).click();
  await page.keyboard.press('Escape');
  await expect(question(page)).toBeVisible();
  await question(page).getByRole('button', { name: /^Stop/ }).click();
  await expect(refused).toBeVisible({ timeout: 12_000 });
  await page.waitForTimeout(500);
  await refused.getByRole('button', { name: 'Leave anyway' }).click();
  await expect(page.locator('[data-booth-text]')).toHaveCount(0);
});

test('a run that is never written does not hold the narrator in the Booth after the stop landed', async ({ page }) => {
  test.setTimeout(60_000);
  await hang('passageMapRecordRun')(page);
  await openBooth(page);
  await record(page).click();
  await expect.poll(() => dawRecording(page)).toBe(true);
  await pastStartGuard(page);
  await page.keyboard.press('Escape');
  await question(page).getByRole('button', { name: /^Stop/ }).click();
  await expect(page.locator('[data-booth-text]')).toHaveCount(0, { timeout: 14_000 });
  expect(await dawRecording(page)).toBe(false);
});

// "Switch project…" draws the project picker in place of the Booth: it is an exit like the rest (#3325, ux-reviewer).
const switchProject = async (page: Page) => {
  await page.keyboard.press('Control+k');
  await page.getByRole('combobox', { name: 'Jump menu' }).fill('> Switch project');
  await page.keyboard.press('Enter');
};
const picker = (page: Page) => page.getByRole('heading', { name: 'Choose your project' });

test('Switch project during a take asks "Stop recording?", and Stop and leave stops the take once and opens the picker', async ({ page }) => {
  await recording(page);
  await switchProject(page);
  await question(page).getByRole('button', { name: /^Stop/ }).click();
  await expect(picker(page)).toBeVisible();
  await expect.poll(() => dawRecording(page)).toBe(false);
  expect(await stops(page)).toBe(1);
});

// During the wait of a decided move a second exit is the same exit: it is ignored, and the first decision ends as it would have (the picker never
// opens over a Booth that is going, and nothing is asked over it).
test('Switch project one second into the wait for a stop the host never answers is ignored; the refusal then comes in the Booth', async ({ page }) => {
  test.setTimeout(60_000);
  await hang('readAloudRecordStop')(page);
  await openBooth(page);
  await record(page).click();
  await expect.poll(() => dawRecording(page)).toBe(true);
  await pastStartGuard(page);
  await page.keyboard.press('Escape');
  await question(page).getByRole('button', { name: /^Stop/ }).click();
  await page.waitForTimeout(1000);
  await switchProject(page);
  await page.waitForTimeout(500);
  await expect(picker(page)).toHaveCount(0);
  const refused = page.getByRole('alertdialog', { name: /^Could not stop the take$/ });
  await expect(refused).toBeVisible({ timeout: 14_000 });
  await expect(page.locator('[data-booth-text]')).toHaveCount(1);
  await page.waitForTimeout(500);
  await refused.getByRole('button', { name: 'Leave anyway' }).click();
  await expect(page.locator('[data-booth-text]')).toHaveCount(0);
  await expect(picker(page)).toHaveCount(0);
});

test('Switch project one second into the wait for a run that is never written is ignored; the first exit then leaves', async ({ page }) => {
  test.setTimeout(60_000);
  await hang('passageMapRecordRun')(page);
  await openBooth(page);
  await record(page).click();
  await expect.poll(() => dawRecording(page)).toBe(true);
  await pastStartGuard(page);
  await page.keyboard.press('Escape');
  await question(page).getByRole('button', { name: /^Stop/ }).click();
  await page.waitForTimeout(1000);
  await switchProject(page);
  await expect(page.locator('[data-booth-text]')).toHaveCount(0, { timeout: 14_000 });
  await expect(picker(page)).toHaveCount(0);
  expect(await page.evaluate(() => window.location.pathname)).toBe('/script');
  expect(await dawRecording(page)).toBe(false);
});

test('a start the host never answers: Stop and leave ends in the refusal question, and Leave anyway leaves', async ({ page }) => {
  test.setTimeout(60_000);
  await hang('readAloudRecordStart')(page);
  await openBooth(page);
  await record(page).click();
  await page.waitForTimeout(500);
  await page.keyboard.press('Escape');
  await question(page).getByRole('button', { name: /^Stop/ }).click();
  const refused = page.getByRole('alertdialog', { name: /^Could not stop the take$/ });
  await expect(refused).toBeVisible({ timeout: 14_000 });
  await page.waitForTimeout(500);
  await refused.getByRole('button', { name: 'Leave anyway' }).click();
  await expect(page.locator('[data-booth-text]')).toHaveCount(0);
});

test('Enter pressed twice on Stop and leave: a take the second press starts is stopped as the page goes', async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { __NARRATION_MOCK_OVERRIDES__: Record<string, unknown> }).__NARRATION_MOCK_OVERRIDES__ = {
      passageMapRecordRun: () => new Promise((resolve) => setTimeout(() => resolve([]), 1500)),
    };
  });
  await recording(page);
  await page.keyboard.press('Escape');
  await question(page).getByRole('button', { name: /^Stop/ }).focus();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-booth-text]')).toHaveCount(0, { timeout: 8000 });
  await expect.poll(() => dawRecording(page), { timeout: 5000 }).toBe(false);
});

for (const exit of EXITS.filter((item) => ['Escape', 'Back', 'Alt+Left'].includes(item.name))) {
  test(`${exit.name}: a double-click on Stop and leave when the stop is refused does not answer the refusal`, async ({ page }) => {
    await recording(page);
    await page.evaluate(() => window.__NARRATION_MOCK_DAW__?.refuseNextRecord('Disk full.', 'stop'));
    await exit.go(page);
    await question(page).getByRole('button', { name: /^Stop/ }).dblclick();
    const refused = page.getByRole('alertdialog', { name: /^Could not stop the take$/ });
    await expect(refused).toBeVisible();
    await page.waitForTimeout(300);
    await expect(refused).toBeVisible();
    await expect(page.locator('[data-booth-text]')).toHaveCount(1);
  });
}

test('Back with Record options open asks nothing on top and does not move', async ({ page }) => {
  await recording(page);
  await page.getByRole('button', { name: 'Record options' }).click();
  await expect(page.getByRole('dialog', { name: 'Record options' })).toBeVisible();
  await page.evaluate(() => window.history.back());
  await page.waitForTimeout(300);
  await expect(page.getByRole('alertdialog', { includeHidden: true })).toHaveCount(0);
  expect(await onBooth(page)).toBe(true);
  expect(await dawRecording(page)).toBe(true);
});

test('Back while a start is still pending leaves with no question and starts no take', async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { __NARRATION_MOCK_OVERRIDES__: Record<string, unknown> }).__NARRATION_MOCK_OVERRIDES__ = {
      boothPunchTarget: () => new Promise((resolve) => setTimeout(() => resolve({ outcome: 'found', start: 12, end: 20 }), 2500)),
    };
  });
  await page.goto('/?mockCallLog=1');
  await settlePage(page);
  await goToPage(page, 'Booth');
  await expect(record(page)).toBeEnabled();
  await showChapterTop(page);
  await page.locator('[data-booth-text] [data-word]').nth(40).click({ button: 'right' });
  await page
    .getByRole('menuitem', { name: /Start from here/ })
    .first()
    .click();
  await expect(record(page)).toHaveAttribute('aria-busy', 'true');
  await page.evaluate(() => window.history.back());
  await expect(page.getByRole('heading', { level: 1, name: 'Production' })).toBeVisible();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await page.waitForTimeout(3300);
  expect(await dawRecording(page)).toBe(false);
});

for (const [width, height] of [
  [320, 300],
  [360, 500],
] as const) {
  test(`the question from Back fits at ${width}x${height}, light and dark`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await recording(page);
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.evaluate(() => window.history.back());
      await expect(question(page)).toBeVisible();
      const box = await question(page).boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
      expect(box!.y + box!.height).toBeLessThanOrEqual(height + 1);
      await question(page)
        .getByRole('button', { name: /Keep recording|Cancel/ })
        .click();
      await expect(question(page)).toHaveCount(0);
    }
  });
}

// #3321: a start that is still pending when the narrator leaves asks the question, which never says a take records and closes by itself when the start
// ends at its limit (10 s) with no take. The narrator stays on the Booth with the press's sentence, nothing recording and no stop owed.
const ASKED = (page: Page) => page.getByRole('alertdialog', { name: /^Leave while a take is starting\?$/ });
async function openWithPendingStart(page: Page, answersAtMs: number | 'never'): Promise<void> {
  await page.addInitScript((answers) => {
    const w = window as unknown as {
      __armed: boolean;
      __NARRATION_MOCK_OVERRIDES__: Record<string, unknown>;
      __NARRATION_MOCK_DAW__: { record: (a: 'start' | 'stop') => void };
    };
    w.__armed = false;
    w.__NARRATION_MOCK_OVERRIDES__ = {
      readAloudRecordStart: () => {
        if (!w.__armed) {
          w.__NARRATION_MOCK_DAW__.record('start');
          return Promise.resolve({ outcome: 'started', position: 0, message: '' });
        }
        w.__armed = false;
        if (answers === 'never') return new Promise(() => {});
        return new Promise((resolve) =>
          setTimeout(() => {
            w.__NARRATION_MOCK_DAW__.record('start');
            resolve({ outcome: 'started', position: 0, message: '' });
          }, answers),
        );
      },
      readAloudRecordStop: () => {
        w.__NARRATION_MOCK_DAW__.record('stop');
        return Promise.resolve({ outcome: 'stopped', message: '', undoPoints: 0 });
      },
    };
  }, answersAtMs);
  await page.goto('/?mockCallLog=1');
  await settlePage(page);
  await goToPage(page, 'Booth');
  await expect(record(page)).toBeEnabled();
  await showChapterTop(page);
  await page.evaluate(() => ((window as unknown as { __armed: boolean }).__armed = true));
}

for (const [name, answersAt] of [
  ['never answers', 'never'],
  ['answers after the limit (12 s)', 12_000],
] as const) {
  test(`the leave question closes, or never says is recording, when the pending start ends at its limit: the start ${name}`, async ({ page }) => {
    test.setTimeout(60_000);
    await openWithPendingStart(page, answersAt);
    await page.keyboard.press('Space');
    await page.waitForTimeout(4000);
    await page.evaluate(() => window.history.back());
    await expect(ASKED(page)).toBeVisible();
    await expect(ASKED(page)).not.toContainText(/is recording/);
    await expect(ASKED(page)).toContainText(/starting a take/);
    // The start ends at its limit with no take: the question goes, the narrator is still in the Booth, and the press said why.
    await expect(ASKED(page)).toHaveCount(0, { timeout: 12_000 });
    expect(await onBooth(page)).toBe(true);
    await expect(page.getByText(/gave up waiting for REAPER to start recording/).first()).toBeVisible();
    if (answersAt !== 'never') {
      // The late take is stopped, never left running behind the closed question.
      await expect.poll(() => stops(page), { timeout: 10_000 }).toBeGreaterThanOrEqual(1);
      await expect.poll(() => dawRecording(page)).toBe(false);
    }
    expect(await dawRecording(page)).toBe(false);
  });
}
