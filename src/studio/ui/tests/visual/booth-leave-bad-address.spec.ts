// A link the app cannot open does not take a running take away (#3555 item 4): the Booth stays mounted and the take goes on, with a question when the link names a chapter
// the manuscript lacks (as for any chapter) or a message when the address is malformed. It used to replace the Booth with "This link could not be opened", dropping the take with no stop.
import { expect, test, type Page } from '@playwright/test';
import { enterHoldOver } from './helpers/enterHold';
import { pastStartGuard } from './helpers/startGuard';
import { settlePage } from './helpers/settle';
import { goToPage } from './drivers/shared';

test.use({ viewport: { width: 1440, height: 900 } });
test.setTimeout(60_000);

const record = (page: Page) => page.getByRole('button', { name: /^Record$/, includeHidden: true });
const stop = (page: Page) => page.getByRole('button', { name: /^Stop$/ });
const dawRecording = (page: Page) => page.evaluate(() => window.__NARRATION_MOCK_DAW__?.state().recording);
const stops = (page: Page) => page.evaluate(() => (window.__hostCalls ?? []).filter((call) => call.name === 'readAloudRecordStop').length);

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

/** An address arriving as an in-app link does: pushed, then heard as a pop. */
const arrive = (page: Page, address: string) =>
  page.evaluate((to) => {
    const state = window.history.state as { idx?: number } | null;
    window.history.pushState({ ...state, idx: (state?.idx ?? 0) + 1 }, '', to);
    window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }));
  }, address);

// A chapter the manuscript lacks (or a line it lacks) is asked about like any other chapter; an address that cannot be read at all is said in a message and ignored.
const ASKS = ['/booth?chapter=nope', '/booth?chapter=chapter-2&para=p1&at=3', '/booth?chapter=%D8%B9%D8%B1%D8%A8%D9%8A'];
// Malformed whatever they half name, the chapter on screen included: said, put back, never asked about.
const MESSAGE = [
  '/booth?chapter=',
  '/booth?chapter=chapter-2&para=p1&at=-5',
  '/booth?chapter=chapter-2&chapter=chapter-3',
  '/booth?chapter=chapter-2%01',
  `/booth?chapter=${'x'.repeat(600)}`,
  '/booth?chapter=chapter-1&chapter=chapter-2',
  '/booth?chapter=chapter-1&para=p1&at=-5',
  '/booth?chapter=chapter-1&para=p1&at=abc',
];
const question = (page: Page) => page.getByRole('alertdialog', { name: 'Stop recording?' });
const said = (page: Page) => page.getByText('The Booth stays as it is.');

for (const address of ASKS) {
  test(`${address} during a take asks like any chapter, and Keep recording leaves the take running`, async ({ page }) => {
    await recording(page);
    await arrive(page, address);
    await expect(question(page)).toBeVisible();
    // One answer, never the question and a message that contradicts it.
    await expect(page.getByRole('alertdialog')).toHaveCount(1);
    await expect(said(page)).toHaveCount(0);
    await expect(page.getByText('This link could not be opened')).toHaveCount(0);
    expect(await dawRecording(page)).toBe(true);
    expect(await stops(page)).toBe(0);
    await question(page).getByRole('button', { name: 'Keep recording' }).click();
    await expect(question(page)).toHaveCount(0);
    await expect(stop(page)).toBeVisible();
    expect(await dawRecording(page)).toBe(true);
    expect(await stops(page)).toBe(0);
  });
}

for (const address of MESSAGE) {
  test(`${address} during a take says so in a message and the take goes on`, async ({ page }) => {
    await recording(page);
    const before = await page.evaluate(() => window.location.pathname + window.location.search);
    await arrive(page, address);
    await expect(said(page)).toBeVisible();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(page.getByText('This link could not be opened')).toHaveCount(0);
    await expect(stop(page)).toBeVisible();
    expect(await dawRecording(page)).toBe(true);
    expect(await stops(page)).toBe(0);
    // The bar is the Booth's again, so ending the take does not turn the ignored address into the "could not be opened" card.
    await expect.poll(() => page.evaluate(() => window.location.pathname + window.location.search)).toBe(before);
    await stop(page).click();
    await expect(record(page)).toBeVisible();
    await expect(page.getByText('This link could not be opened')).toHaveCount(0);
  });
}

test("an ignored link is put back: the address stays the Booth's, a plain Stop leaves the Booth in place, and a second identical link is answered too", async ({
  page,
}) => {
  await recording(page);
  const before = await page.evaluate(() => window.location.pathname + window.location.search);
  await arrive(page, '/booth?chapter=');
  await expect(said(page)).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.location.pathname + window.location.search)).toBe(before);
  // A second identical link is answered like the first: the first message goes, the second comes.
  await expect(said(page)).toHaveCount(0, { timeout: 20_000 });
  await arrive(page, '/booth?chapter=');
  await expect(said(page)).toBeVisible();
  // Ending the take does not turn the ignored address into the "could not be opened" card.
  await stop(page).click();
  await expect(record(page)).toBeVisible();
  await expect(page.getByText('This link could not be opened')).toHaveCount(0);
  expect(await page.evaluate(() => window.location.pathname)).toBe('/booth');
});

// A chapter link arriving while the question for another exit (Escape, for Script) is open joins that exit: Stop and leave, or Leave anyway, still goes where the question said.
for (const address of ['/booth?chapter=chapter-2', '/booth?chapter=chapter-3&chapter=chapter-2']) {
  test(`${address} pushed while the Escape question is open does not change where Stop and leave goes`, async ({ page }) => {
    await recording(page);
    await page.keyboard.press('Escape');
    await expect(question(page)).toBeVisible();
    await arrive(page, address);
    await enterHoldOver(question(page));
    await question(page).getByRole('button', { name: 'Stop and leave' }).click();
    await expect.poll(() => page.evaluate(() => window.location.pathname)).toBe('/script');
    expect(await stops(page)).toBeGreaterThan(0);
  });
}

test('Leave anyway after a refused stop still goes where the question said, with a chapter link pushed meanwhile', async ({ page }) => {
  await recording(page);
  await page.evaluate(() => window.__NARRATION_MOCK_DAW__?.refuseNextRecord('Disk full.', 'stop'));
  await page.keyboard.press('Escape');
  await expect(question(page)).toBeVisible();
  await arrive(page, '/booth?chapter=chapter-2');
  await enterHoldOver(question(page));
  await question(page).getByRole('button', { name: 'Stop and leave' }).click();
  const refused = page.getByRole('alertdialog', { name: 'Could not stop the take' });
  await expect(refused).toBeVisible();
  // "Leave anyway" ignores a press for a moment after it appears (a double click on the button it replaced).
  await page.waitForTimeout(600);
  await refused.getByRole('button', { name: 'Leave anyway' }).click();
  await expect.poll(() => page.evaluate(() => window.location.pathname)).toBe('/script');
});

test('agreeing to the question for a chapter that is not there saves the take, and then the link says so', async ({ page }) => {
  await recording(page);
  await arrive(page, '/booth?chapter=nope');
  await expect(question(page)).toBeVisible();
  await question(page).getByRole('button', { name: 'Stop and open' }).click();
  await expect.poll(() => stops(page)).toBeGreaterThan(0);
  await expect(page.getByText(/link points to a chapter that is not in this manuscript/)).toBeVisible();
  expect(await dawRecording(page)).toBe(false);
});

test('with no take running a link to a chapter that is not there still says so', async ({ page }) => {
  await page.goto('/?mockCallLog=1');
  await settlePage(page);
  await goToPage(page, 'Booth');
  await expect(record(page)).toBeEnabled();
  await arrive(page, '/booth?chapter=nope');
  await expect(page.getByText(/link points to a chapter that is not in this manuscript/)).toBeVisible();
});
