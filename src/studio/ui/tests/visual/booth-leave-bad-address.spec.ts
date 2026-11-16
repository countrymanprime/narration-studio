// A link the app cannot open does not take a running take away (#3555 item 4): the Booth stays mounted and the take goes on, with a question when the link names a chapter
// the manuscript lacks (as for any chapter) or a message when the address is malformed. It used to replace the Booth with "This link could not be opened", dropping the take with no stop.
import { expect, test, type Page } from '@playwright/test';
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
    window.history.pushState(window.history.state, '', to);
    window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }));
  }, address);

// A chapter the manuscript lacks (or a line it lacks) is asked about like any other chapter; an address that cannot be read at all is said in a message and ignored.
const ASKS = ['/booth?chapter=nope', '/booth?chapter=chapter-2&para=p1&at=3', '/booth?chapter=%D8%B9%D8%B1%D8%A8%D9%8A'];
const MESSAGE = ['/booth?chapter='];
const question = (page: Page) => page.getByRole('alertdialog', { name: 'Stop recording?' });
const said = (page: Page) => page.getByText('That link could not be opened, so the Booth stays. The take goes on.');

for (const address of ASKS) {
  test(`${address} during a take asks like any chapter, and Keep recording leaves the take running`, async ({ page }) => {
    await recording(page);
    await arrive(page, address);
    await expect(question(page)).toBeVisible();
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
    await arrive(page, address);
    await expect(said(page)).toBeVisible();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(page.getByText('This link could not be opened')).toHaveCount(0);
    await expect(stop(page)).toBeVisible();
    expect(await dawRecording(page)).toBe(true);
    expect(await stops(page)).toBe(0);
  });
}

test('agreeing to the question for a chapter that is not there saves the take, and then the link says so', async ({ page }) => {
  await recording(page);
  await arrive(page, '/booth?chapter=nope');
  await expect(question(page)).toBeVisible();
  await question(page).getByRole('button', { name: 'Stop and leave' }).click();
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
