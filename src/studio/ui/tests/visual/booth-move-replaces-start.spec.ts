// Any move of the reading chooses the start (#3858, was #3317 and #3353): after a refused take or Record from here, a move (the arrow keys) is the new
// start, and Space looks exactly that spot up. The host calls are read from `?mockCallLog=1`.
import { expect, test, type Page } from '@playwright/test';
import { settlePage } from './helpers/settle';
import { showChapterTop } from './helpers/viewTop';
import { goToPage, selectReaderWord } from './drivers/shared';

test.use({ viewport: { width: 1440, height: 900 } });
test.setTimeout(120_000);

const record = (page: Page) => page.getByRole('button', { name: /^Record$/, includeHidden: true });
const stop = (page: Page) => page.getByRole('button', { name: /^Stop$/ });
const lookups = (page: Page) => page.evaluate(() => (window.__hostCalls ?? []).filter((call) => call.name === 'boothPunchTarget').length);
const dawRecording = (page: Page) => page.evaluate(() => window.__NARRATION_MOCK_DAW__?.state().recording);
const reading = (page: Page) => page.locator('[data-booth-text] [data-state="cur"]').first().getAttribute('data-unit');

async function arrowDown(page: Page, times: number): Promise<void> {
  for (let i = 0; i < times; i++) await page.keyboard.press('ArrowDown');
}

test('repro A: a refused take keeps its start, the arrow keys move it to the reading and Space starts there (#3858)', async ({ page }) => {
  await page.goto('/?mockCallLog=1');
  await settlePage(page);
  await goToPage(page, 'Booth');
  await expect(record(page)).toBeEnabled();
  await showChapterTop(page);
  await page.evaluate(() => window.__NARRATION_MOCK_DAW__?.refuseNextRecord('Disk full.', 'start'));
  await page.locator('[data-booth-text] [data-word]').nth(5).click();
  await page.keyboard.press('Space'); // a click only chooses the start: Record starts the take, from there
  await expect(page.getByText('Disk full.').first()).toBeVisible();
  const chosen = await reading(page);
  await arrowDown(page, 4);
  expect(await reading(page)).not.toBe(chosen);
  // A move is the narrator's choice of start (the cursor is the only mark): Record looks exactly that spot up once.
  const before = await lookups(page);
  await page.keyboard.press('Space');
  await expect(stop(page)).toBeVisible();
  expect(await dawRecording(page)).toBe(true);
  expect(await lookups(page)).toBe(before + 1);
});

test('repro B: Record from here on the Script, the arrow keys move the start to the reading and Space starts there (#3858)', async ({ page }) => {
  await page.goto('/?mockCallLog=1');
  await settlePage(page);
  await goToPage(page, 'Script');
  await selectReaderWord(page, 'tired');
  await page.getByRole('toolbar', { name: 'Selection tools' }).getByRole('button', { name: 'Record from here' }).click();
  await expect(record(page)).toBeEnabled();
  const chosen = await reading(page);
  await arrowDown(page, 3);
  expect(await reading(page)).not.toBe(chosen);
  // A move is the narrator's choice of start (the cursor is the only mark): Record looks exactly that spot up once.
  const before = await lookups(page);
  await page.keyboard.press('Space');
  await expect(stop(page)).toBeVisible();
  expect(await dawRecording(page)).toBe(true);
  expect(await lookups(page)).toBe(before + 1);
});

test('after a take, going back to the phrase the chapter opened on chooses it, like any phrase the reading moves onto (#3858)', async ({ page }) => {
  await page.goto('/?mockCallLog=1');
  await settlePage(page);
  await goToPage(page, 'Booth');
  await expect(record(page)).toBeEnabled();
  await showChapterTop(page);
  const opened = await reading(page);
  await page.keyboard.press('Space');
  await expect(stop(page)).toBeVisible();
  await expect.poll(() => reading(page), { timeout: 60_000 }).not.toBe(opened); // the voice carries the reading on
  await page.keyboard.press('Space');
  await expect(record(page)).toBeVisible();
  const stopped = await reading(page);
  for (let i = 0; i < 20 && (await reading(page)) !== opened; i++) await page.keyboard.press('ArrowUp');
  expect(await reading(page)).toBe(opened);
  const before = await lookups(page);
  await page.keyboard.press('Space');
  await expect(stop(page)).toBeVisible();
  expect(await lookups(page)).toBe(before + 1);
  expect(stopped).not.toBe(opened);
});

async function failListeningOnce(page: Page): Promise<void> {
  await page.addInitScript(() => {
    let failed = false;
    window.__NARRATION_MOCK_OVERRIDES__ = {
      teleprompterStart: async () => {
        if (failed) return { status: 'started' };
        failed = true;
        await new Promise((resolve) => setTimeout(resolve, 1200));
        throw new Error('Microphone Array was unplugged.');
      },
    } as never;
  });
}

test('a take the Booth took back (its listening failed): going back to the phrase the chapter opened on chooses it, as any explicit move does (#3858)', async ({
  page,
}) => {
  await failListeningOnce(page);
  await page.goto('/?mockCallLog=1');
  await settlePage(page);
  await goToPage(page, 'Booth');
  await expect(record(page)).toBeEnabled();
  await showChapterTop(page);
  const opened = await reading(page);
  await page.keyboard.press('Space');
  await expect(page.getByText(/Recording did not start:/).first()).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => dawRecording(page)).toBe(false);
  await arrowDown(page, 2);
  for (let i = 0; i < 10 && (await reading(page)) !== opened; i++) await page.keyboard.press('ArrowUp');
  expect(await reading(page)).toBe(opened);
  const before = await lookups(page);
  await page.keyboard.press('Space');
  await expect(stop(page)).toBeVisible();
  expect(await lookups(page)).toBe(before + 1);
});

test('a chosen start survives a take the Booth took back: Record looks it up again (#3858)', async ({ page }) => {
  await failListeningOnce(page);
  await page.goto('/?mockCallLog=1');
  await settlePage(page);
  await goToPage(page, 'Booth');
  await expect(record(page)).toBeEnabled();
  await showChapterTop(page);
  await page.locator('[data-booth-text] [data-word]').nth(5).click();
  await page.keyboard.press('Space');
  await expect(page.getByText(/Recording did not start:/).first()).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => dawRecording(page)).toBe(false);
  const before = await lookups(page);
  await page.keyboard.press('Space');
  await expect(stop(page)).toBeVisible();
  expect(await lookups(page)).toBe(before + 1);
});

/** A host whose lookup always finds the phrase and whose listening throws while `window.__failListen` is set. */
async function listeningFailsOnDemand(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __NARRATION_MOCK_OVERRIDES__: Record<string, unknown>; __failListen?: boolean };
    w.__NARRATION_MOCK_OVERRIDES__ = {
      boothPunchTarget: async () => ({ outcome: 'found', start: 12, end: 20 }),
      teleprompterStart: async () => {
        if (w.__failListen) {
          w.__failListen = false;
          throw new Error('The microphone is in use by another application.');
        }
        return { status: 'started' };
      },
    };
  });
}
const failNextPress = (page: Page) =>
  page.evaluate(() => {
    (window as unknown as { __failListen: boolean }).__failListen = true;
    window.__NARRATION_MOCK_DAW__?.refuseNextRecord('Disk full.', 'start');
  });
const failedPress = (page: Page) =>
  expect(page.getByText(/Recording did not start: the text cannot follow|Disk full/).first()).toBeVisible({ timeout: 10_000 });

test('a press whose listening fails and whose DAW start is refused keeps the chosen start: the retry looks it up (#3858)', async ({ page }) => {
  await listeningFailsOnDemand(page);
  await page.goto('/?mockCallLog=1');
  await settlePage(page);
  await goToPage(page, 'Booth');
  await expect(record(page)).toBeEnabled();
  await showChapterTop(page);
  await arrowDown(page, 2);
  await failNextPress(page);
  await page.keyboard.press('Space');
  await failedPress(page);
  await page.waitForTimeout(800);
  const before = await lookups(page);
  await page.keyboard.press('Space');
  await expect(stop(page)).toBeVisible({ timeout: 10_000 });
  expect(await lookups(page)).toBe(before + 1);
});

test("a failed press after a take does not bring back that take's start: Record continues with no lookup (#3858)", async ({ page }) => {
  await listeningFailsOnDemand(page);
  await page.goto('/?mockCallLog=1');
  await settlePage(page);
  await goToPage(page, 'Booth');
  await expect(record(page)).toBeEnabled();
  await showChapterTop(page);
  await arrowDown(page, 2);
  await page.keyboard.press('Space'); // take 1, punched at the chosen phrase
  await expect(stop(page)).toBeVisible();
  await page.waitForTimeout(1500);
  await page.keyboard.press('Space');
  await expect(record(page)).toBeVisible({ timeout: 10_000 });
  await failNextPress(page);
  await page.keyboard.press('Space'); // listening fails, DAW refuses
  await failedPress(page);
  await page.waitForTimeout(800);
  const before = await lookups(page);
  await page.keyboard.press('Space');
  await expect(stop(page)).toBeVisible({ timeout: 10_000 });
  expect(await lookups(page)).toBe(before);
});

test('after a lookup that failed, a click on the phrase the reading is on chooses it again: Record looks it up (#3858)', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __NARRATION_MOCK_OVERRIDES__: Record<string, unknown>; __asked: number };
    w.__asked = 0;
    w.__NARRATION_MOCK_OVERRIDES__ = {
      boothPunchTarget: async () => {
        w.__asked += 1;
        if (w.__asked === 1) throw new Error('The recording check could not be read.');
        return { outcome: 'found', start: 12, end: 20 };
      },
    };
  });
  await page.goto('/?mockCallLog=1');
  await settlePage(page);
  await goToPage(page, 'Booth');
  await expect(record(page)).toBeEnabled();
  await showChapterTop(page);
  await arrowDown(page, 2);
  await page.keyboard.press('Space'); // the lookup throws: no start is chosen now
  const asked = () => page.evaluate(() => (window as unknown as { __asked: number }).__asked);
  await expect.poll(asked).toBe(1);
  await page.waitForTimeout(800);
  const onPhrase = await reading(page);
  await page.locator(`[data-booth-text] [data-unit="${onPhrase}"] [data-word]`).first().click(); // choose the phrase again, as the message says
  await page.keyboard.press('Space');
  await expect(stop(page)).toBeVisible({ timeout: 10_000 });
  expect(await asked()).toBe(2);
});
