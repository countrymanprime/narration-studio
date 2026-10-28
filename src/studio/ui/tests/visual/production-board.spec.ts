import { expect, test, type Page } from '@playwright/test';
import { settlePage } from './helpers/settle';
import { productionDrivers } from './drivers/production';
import { openProduction } from './drivers/shared';

// The Production board's grid, checked from the DOM at the widths the alignment audit found it broken at
// (docs/research/alignment-audit/findings/production.md): one right-hand column for both rows, two columns that end together, the stage
// card's band on its foot, short cards side by side at the tablet width, the header on screen at 390 px and its reason said once.

async function board(page: Page, width: number, height: number): Promise<void> {
  await page.setViewportSize({ width, height });
  await page.goto('/');
  await settlePage(page);
  await productionDrivers['on-pace'](page);
}

const card = (page: Page, title: string) => page.getByRole('heading', { level: 2, name: title, exact: true }).locator('xpath=ancestor::section[1]');
const box = async (page: Page, title: string) => (await card(page, title).boundingBox())!;

for (const width of [1440, 1920]) {
  test(`Production / the board's rows share their right-hand column and its columns end together / ${width}`, async ({ page }) => {
    await board(page, width, 2400);
    const check = await box(page, 'Recording check');
    const next = await box(page, 'Next up');
    // XPR2-5: Recording check's edges were 29 px right of Next up's at 1440.
    expect(Math.abs(check.x - next.x), 'Recording check starts where Next up starts').toBeLessThanOrEqual(1);
    expect(Math.abs(check.x + check.width - (next.x + next.width)), 'and ends where it ends').toBeLessThanOrEqual(1);
    // XPR2-15, R4TA-5: the right column ended 120 to 210 px above the pipeline (or 25 px below it at 1920).
    const chart = await box(page, 'Recorded vs plan');
    const pipeline = await box(page, 'Chapter pipeline');
    expect(Math.abs(chart.y + chart.height - (pipeline.y + pipeline.height)), 'the chart card ends with the pipeline card').toBeLessThanOrEqual(1);
    // XPR2-7: the grey legend band stopped 12 to 40 px above the stage card's foot.
    const stage = await box(page, 'Where the book stands');
    const band = (await card(page, 'Where the book stands').getByRole('list').boundingBox())!;
    expect(stage.y + stage.height - (band.y + band.height), 'the legend band sits on the card foot').toBeLessThanOrEqual(2);
  });
}

test('Production / This week and Recording check share a row at the tablet width / 768', async ({ page }) => {
  // XPR2-13: each was a full-width bar with 700 px between a label and its figure.
  await board(page, 768, 1024);
  const week = await box(page, 'This week');
  const check = await box(page, 'Recording check');
  expect(Math.abs(week.y - check.y)).toBeLessThanOrEqual(1);
  expect(week.width).toBeLessThan(400);
});

test('Production / the header stays on screen at 390 px and says why Start session is off once / 390', async ({ page }) => {
  // XPR2-2: Start session ran off the right edge while the timer runs; XPR2-9: the same reason in the header and in Next up.
  // REAPER not connected, so Start session is off with the DAW's own sentence.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.install({ time: new Date(2026, 8, 26, 9, 0, 0) });
  await openProduction(page, '?mockProduction=on-pace&mockDawConnected=0');
  const start = (await page.getByRole('button', { name: 'Start session' }).boundingBox())!;
  expect(start.x + start.width).toBeLessThanOrEqual(390 - 16 + 1);
  await expect(page.getByText('REAPER is not connected to this app.', { exact: false })).toHaveCount(1);
});

for (const width of [1440, 1920]) {
  test(`Production / a long book stretches the pipeline board, not the plan chart / ${width}`, async ({ page }) => {
    // Owner report, #2251: the schedule chart ("Recorded vs plan", with "Open schedule") scaled with the chapter list and looked horrible on a
    // large screen; the chapter pipeline is meant to grow with the book, so only the chart is capped.
    await page.setViewportSize({ width, height: 1080 });
    await openProduction(page, '?mockChapters=40&mockProduction=on-pace');
    const chart = await box(page, 'Recorded vs plan');
    const pipeline = await box(page, 'Chapter pipeline');
    expect(pipeline.height, 'the pipeline board keeps its natural height: 40 chapters are far taller than a screen').toBeGreaterThan(1500);
    expect(chart.height, 'the chart card stops growing').toBeLessThanOrEqual(28 * 16 + 1);
    expect(chart.height, 'and is still a chart, not a strip').toBeGreaterThan(260);
  });
}

// The Rec. and Est. headers' label and info mark inside their cells is layout rule C1 (lib/layoutScan.ts), which every catalogued
// Production state is scanned with, light and dark, at the desktop and small-desktop widths.
