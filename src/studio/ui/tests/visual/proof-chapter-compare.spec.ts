import { expect, test, type Page } from '@playwright/test';
import { proofChapterDrivers } from './drivers/proof-chapter';
import { settlePage } from './helpers/settle';

// The Proof chapter view's Compare card and its options, measured (alignment audit XPC-1, XPC-9, XPC-10, XPC-14, XPC-15, XPC-16, XPC-18,
// XPC-23, R3PC-3, R3PC-9, R4PC-1).

async function drive(page: Page, state: string, size = { width: 1440, height: 900 }): Promise<void> {
  await page.setViewportSize(size);
  await page.goto('/');
  await settlePage(page);
  await proofChapterDrivers[state](page);
}

const compare = (page: Page) => page.getByRole('region', { name: /^Compare the recording/ });
const headerHeight = (page: Page, name: RegExp) =>
  page
    .getByRole('heading', { name })
    .locator('xpath=ancestor::div[contains(@class,"border-b")][1]')
    .evaluate((header) => Math.round(header.getBoundingClientRect().height));

test('Proof chapter / the Compare header is as tall as the other cards and its steps are not buttons', async ({ page }) => {
  await drive(page, 'compare-setup');
  expect(await headerHeight(page, /^Compare the recording/)).toBe(await headerHeight(page, /^Preview$/));
  const steps = compare(page).getByRole('list', { name: 'Comparison progress' });
  await expect(steps.getByRole('listitem')).toHaveCount(3);
  await expect(steps.getByRole('button')).toHaveCount(0);
});

for (const size of [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'small-desktop', width: 1024, height: 768 },
]) {
  test(`Proof chapter / the Whisper model buttons stay on one row / ${size.name}`, async ({ page }) => {
    await drive(page, 'compare-setup', size);
    const model = compare(page).getByRole('group', { name: 'Whisper model' }).getByRole('button');
    const tops = new Set<number>();
    for (const button of await model.all()) tops.add(Math.round((await button.boundingBox())!.y));
    expect(tops.size).toBe(1);
  });
}

test('Proof chapter / Review last run is a real button on the Start row', async ({ page }) => {
  await drive(page, 'compare-setup');
  const review = (await compare(page).getByRole('button', { name: 'Review last run' }).boundingBox())!;
  const start = (await compare(page).getByRole('button', { name: 'Start comparison' }).boundingBox())!;
  expect(review.height, 'a 24 px target or more').toBeGreaterThanOrEqual(24);
  expect(Math.abs(review.y + review.height / 2 - (start.y + start.height / 2)), 'on the Start row').toBeLessThanOrEqual(2);
});

test('Proof chapter / an off Start comparison says why in sight', async ({ page }) => {
  await drive(page, 'compare-no-daw');
  const reason = compare(page)
    .locator('span[aria-hidden="true"]')
    .filter({ hasText: /to start a comparison|not connected/ });
  await expect(reason).toBeVisible();
});

test('Proof chapter / the changed-since warning sits beside Export, and the summary does not name the chapter twice', async ({ page }) => {
  await drive(page, 'compare-results-changed-since');
  const warning = (await compare(page).getByText('The REAPER project may have changed since this comparison.').boundingBox())!;
  const exportButton = (await compare(page)
    .getByRole('button', { name: /^Export \d+ marker/ })
    .boundingBox())!;
  expect(Math.abs(warning.y + warning.height / 2 - (exportButton.y + exportButton.height / 2)), 'on the Export row').toBeLessThanOrEqual(4);
  await expect(compare(page).getByText(/^Chapter 1: /)).toHaveCount(0);
});

test('Proof chapter / the live activity log has the field radius', async ({ page }) => {
  await drive(page, 'compare-running');
  const log = compare(page).locator('.h-36');
  expect(await log.evaluate((box) => parseFloat(getComputedStyle(box).borderTopLeftRadius))).toBeGreaterThan(0);
});

test('Proof chapter / the Compare options controls share a right edge', async ({ page }) => {
  await drive(page, 'options-open');
  const dialog = page.getByRole('dialog');
  const select = (await dialog.getByRole('combobox').first().boundingBox())!;
  const hex = (await dialog
    .getByRole('textbox', { name: /marker color$/ })
    .first()
    .boundingBox())!;
  expect(Math.abs(select.x + select.width - (hex.x + hex.width))).toBeLessThanOrEqual(1);
});
