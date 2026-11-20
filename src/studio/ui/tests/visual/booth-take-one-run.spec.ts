// A take left running by Open anyway and returned to is one run of its chapter in the passage map, not two overlapping ones (#3720).
// The chapter the take began in writes its run when the narrator leaves (#3712); coming back to it while the take still runs must not begin another.
import { expect, test, type Page } from '@playwright/test';
import { pastStartGuard } from './helpers/startGuard';
import { settlePage } from './helpers/settle';
import { goToPage } from './drivers/shared';

test.use({ viewport: { width: 1440, height: 900 } });
test.setTimeout(90_000);

const record = (page: Page) => page.getByRole('button', { name: /^Record$/, includeHidden: true });
const stop = (page: Page) => page.getByRole('button', { name: /^Stop$/ });
const chapterQuestion = (page: Page) => page.getByRole('alertdialog', { name: /^(Stop recording|Open another chapter)\?$/ });
const refusedQuestion = (page: Page) => page.getByRole('alertdialog', { name: /^Could not stop the take$/ });

// The stop never answers, so leaving a chapter mid-take ends in "Could not stop the take" and Open anyway.
const NEVER_STOPS = () => {
  (window as unknown as { __NARRATION_MOCK_OVERRIDES__: Record<string, unknown> }).__NARRATION_MOCK_OVERRIDES__ = {
    readAloudRecordStop: () => new Promise(() => {}),
  };
};

const link = (page: Page, chapter: string) =>
  page.evaluate((id) => {
    window.history.pushState({}, '', `/booth?chapter=${id}`);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, chapter);

// The question for a chapter opened over a running take, answered with Stop and open, then the refusal answered with Open anyway.
async function openAnyway(page: Page): Promise<void> {
  await expect(chapterQuestion(page)).toBeVisible();
  await chapterQuestion(page)
    .getByRole('button', { name: /^Stop and (open|leave)$/ })
    .click();
  await expect(refusedQuestion(page)).toBeVisible({ timeout: 14_000 });
  // "Leave anyway" ignores a press for its first 0.4 s (a double click on the button it replaced).
  await page.waitForTimeout(600);
  await refusedQuestion(page)
    .getByRole('button', { name: /^(Open|Leave) anyway$/ })
    .click();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
}

// The log keeps the start of each call's arguments, enough for the chapter id the run is for.
const runsOf = (page: Page) =>
  page.evaluate(() =>
    (window.__hostCalls ?? []).filter((call) => call.name === 'passageMapRecordRun').map((call) => /^\["([^"]+)"/.exec(call.args)?.[1] ?? call.args),
  );

test('a take left by Open anyway and returned to is one run of the chapter it began in, and none of the other', async ({ page }) => {
  await page.addInitScript(NEVER_STOPS);
  await page.goto('/?mockCallLog=1');
  await settlePage(page);
  await goToPage(page, 'Booth');
  await expect(record(page)).toBeEnabled();
  await record(page).click();
  await expect(stop(page)).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__NARRATION_MOCK_DAW__?.state().recording)).toBe(true);
  await pastStartGuard(page);
  const first = (await page.locator("[aria-label^='Chapter:']").first().getAttribute('aria-label')) ?? '';

  // Leave for the next chapter with the take still running, then come back to the chapter it began in.
  await link(page, 'chapter-2');
  await openAnyway(page);
  await expect(page.locator("[aria-label^='Chapter:']").first()).not.toHaveAttribute('aria-label', first);
  // The take still runs, so the way back asks as well.
  await link(page, 'chapter-1');
  await openAnyway(page);
  await expect(page.locator("[aria-label^='Chapter:']").first()).toHaveAttribute('aria-label', first);

  // The take ends in the DAW, and every run it will write has been written.
  await page.evaluate(() => window.__NARRATION_MOCK_DAW__?.endTakeInDaw());
  await expect(stop(page)).toHaveCount(0, { timeout: 10_000 });
  await page.waitForTimeout(1500);
  const runs = await runsOf(page);
  expect(
    runs.filter((id) => id === 'chapter-1'),
    'one run of the chapter the take began in',
  ).toHaveLength(1);
  expect(
    runs.filter((id) => id !== 'chapter-1'),
    'no run of another chapter',
  ).toEqual([]);
});

// qa-breaker (#3729): the run refused when the page was left dies with that page, so the chapter opened again must still write one, or the take has none.
test('a run the host refused when the take was left is written when the narrator returns', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __runCalls: { id: string; ok: boolean }[]; __NARRATION_MOCK_OVERRIDES__: Record<string, unknown> };
    w.__runCalls = [];
    let first = true;
    w.__NARRATION_MOCK_OVERRIDES__ = {
      readAloudRecordStop: () => new Promise(() => {}),
      passageMapRecordRun: async (id: string) => {
        const refuse = first;
        first = false;
        w.__runCalls.push({ id, ok: !refuse });
        if (refuse) throw new Error('The disk is full.');
        return [];
      },
    };
  });
  await page.goto('/?mockCallLog=1');
  await settlePage(page);
  await goToPage(page, 'Booth');
  await expect(record(page)).toBeEnabled();
  await record(page).click();
  await expect(stop(page)).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__NARRATION_MOCK_DAW__?.state().recording)).toBe(true);
  await pastStartGuard(page);
  await link(page, 'chapter-2');
  await openAnyway(page);
  await link(page, 'chapter-1');
  await openAnyway(page);
  await page.evaluate(() => window.__NARRATION_MOCK_DAW__?.endTakeInDaw());
  await expect(stop(page)).toHaveCount(0, { timeout: 10_000 });
  await page.waitForTimeout(1500);
  const calls = await page.evaluate(() => (window as unknown as { __runCalls: { id: string; ok: boolean }[] }).__runCalls);
  expect(
    calls.filter((call) => call.ok && call.id === 'chapter-1'),
    'one accepted run of the chapter the take began in',
  ).toHaveLength(1);
});
