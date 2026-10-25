import { expect, test, type Browser, type Page } from '@playwright/test';
import { confirmDialog } from './drivers/shared';
import { scheduleDrivers } from './drivers/schedule';

// The Schedule's header, side cards, loading frame and milestone dialog line up (alignment audit XSH-1, XSH-2, XSH-9, XSH-13, XSH-14,
// R3SH-2, R3SH-4, R3SH-9): the verdict sits on the due-date line and only when there is a verdict, the Contract's controls share one column,
// the side cards stand side by side from 768 to 1280 px, the worked-out figures are one face, the loading frame stands where the cards
// arrive, and Done shares the dialog's button row.
type Box = { x: number; y: number; width: number; height: number };

const box = (page: Page, selector: string): Promise<Box> =>
  page
    .locator(selector)
    .first()
    .evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
    });
const centre = (b: Box) => b.y + b.height / 2;
const card = (title: string) => `section:has(> header h2:text-is("${title}")), section:has(h2:text-is("${title}"))`;

async function open(browser: Browser, baseURL: string | undefined, width: number, state: string): Promise<Page> {
  const page = await browser.newPage({ baseURL, viewport: { width, height: 900 } });
  await scheduleDrivers[state]!(page);
  return page;
}

for (const width of [1440, 1024, 768]) {
  test(`Schedule / the header, the side cards and the loading frame line up / ${width}`, async ({ browser, baseURL }) => {
    const page = await open(browser, baseURL, width, 'on-pace');
    const line = await box(page, 'h1 + div > span:first-child');
    expect(Math.abs(centre(await box(page, '[data-verdict]')) - centre(line)), 'the verdict sits on the due-date line').toBeLessThanOrEqual(2);

    const select = await box(page, 'select[aria-label="How you are paid"]');
    const amount = await box(page, 'input[aria-label="Rate per finished hour"]');
    expect(amount.x, 'the rate box starts where the select does').toBe(select.x);
    expect(amount.width, 'the rate box is the select width').toBe(select.width);

    const contract = await box(page, card('Contract'));
    const worked = await box(page, card('How this is worked out'));
    if (width <= 1280) {
      expect(worked.y, 'the side cards stand side by side under the chart').toBe(contract.y);
      expect(worked.height, 'and are one height').toBe(contract.height);
    }
    const finish = page.locator(`${card('How this is worked out')} dd`).last();
    expect(await finish.evaluate((el) => getComputedStyle(el).fontFamily), 'the finish date is in the figures face').toMatch(/Mono/);
    const chart = await box(page, card('Recorded audio vs plan'));
    await page.close();

    const loading = await open(browser, baseURL, width, 'loading');
    const frames = await loading
      .locator('[aria-label="Loading the Schedule"] > div:first-child > *')
      .evaluateAll((els) => els.map((el) => ({ x: Math.round(el.getBoundingClientRect().x), y: Math.round(el.getBoundingClientRect().y) })));
    expect(
      frames.map((frame) => frame.x),
      'the loading frame stands where the chart and the side column arrive',
    ).toEqual([chart.x, Math.min(contract.x, worked.x)]);
    expect(Math.abs(frames[0]!.y - chart.y), 'and starts at the chart card').toBeLessThanOrEqual(2);
    await loading.close();
  });
}

test('Schedule / with no due date there is no verdict pill and the pace row says what is missing', async ({ browser, baseURL }) => {
  const page = await open(browser, baseURL, 1440, 'no-due-date');
  expect(await page.locator('[data-verdict]').count(), 'no pill repeats "No due date set"').toBe(0);
  await expect(page.locator(card('How this is worked out'))).toContainText('Set a due date');
  await page.close();
});

test('Schedule / Done shares the milestone dialog button row', async ({ browser, baseURL }) => {
  const page = await open(browser, baseURL, 1440, 'milestone-dialog');
  const dialog = confirmDialog(page, /milestone/i);
  const done = await dialog.getByRole('checkbox', { name: 'Done' }).boundingBox();
  const cancel = await dialog.getByRole('button', { name: 'Cancel' }).boundingBox();
  expect(Math.abs(done!.y + done!.height / 2 - (cancel!.y + cancel!.height / 2)), 'Done is on the buttons row').toBeLessThanOrEqual(4);
  await page.close();
});
