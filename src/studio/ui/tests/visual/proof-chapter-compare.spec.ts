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

// The chunk length is a radio stack since #3681 (it was a select as wide as a colour row, XPC-10): the controls down the dialog start at one x,
// and the three colour rows still end at one.
test('Proof chapter / the Compare options controls share a left edge, and the colour rows a right one', async ({ page }) => {
  await drive(page, 'options-open');
  const dialog = page.getByRole('dialog');
  const radio = (await dialog.getByRole('radiogroup', { name: 'Default chunk length' }).getByRole('radio').first().boundingBox())!;
  const hexes = await dialog.getByRole('textbox', { name: /marker color hex$/ }).all();
  expect(hexes).toHaveLength(3);
  const rights = new Set<number>();
  for (const hex of hexes) {
    const box = (await hex.boundingBox())!;
    rights.add(Math.round(box.x + box.width));
  }
  expect(rights.size, 'the hex boxes end at one x').toBe(1);
  const swatch = (await dialog.locator('[data-control-line]').nth(1).boundingBox())!;
  expect(Math.abs(radio.x - swatch.x), 'the radios start where the colour rows start').toBeLessThanOrEqual(1);
});

// ux-review 1 on #3681: in a 390 px window the radios of "Default chunk length" sat beside the label and their Reset wrapped to a line of its own.
// The label is above its control in a narrow window and beside it from 640 px (component-selection CS-S5); Reset is beside the control at every
// width, level with the first option of a radio stack and with the middle of any other control.
for (const size of [
  { name: 'phone', width: 390, height: 844, stacked: true },
  { name: 'tablet', width: 768, height: 1024, stacked: false },
  { name: 'desktop', width: 1440, height: 900, stacked: false },
]) {
  test(`Proof chapter / a Compare options row keeps Reset beside its control / ${size.name} ${size.width}x${size.height}`, async ({ page }) => {
    await drive(page, 'options-open', size);
    const dialog = page.getByRole('dialog');
    const radios = dialog.getByRole('radiogroup', { name: 'Default chunk length' }).getByRole('radio');
    await radios.and(dialog.locator('[aria-checked="false"]')).last().click();
    const hex = dialog.getByRole('textbox', { name: 'Misread marker color hex', exact: true });
    await hex.fill('AA0001');
    await hex.press('Enter');
    const chunkReset = dialog.getByRole('button', { name: 'Reset Default chunk length' });
    const colourReset = dialog.getByRole('button', { name: 'Reset Misread marker color' });
    await chunkReset.waitFor();
    await colourReset.waitFor();
    const centreY = (box: { y: number; height: number }) => box.y + box.height / 2;
    const first = (await radios.first().boundingBox())!;
    const chunk = (await chunkReset.boundingBox())!;
    expect(Math.abs(centreY(chunk) - centreY(first)), 'Reset is level with the first chunk length').toBeLessThanOrEqual(2);
    expect(chunk.x, 'Reset is beside the radios').toBeGreaterThanOrEqual(first.x + first.width);
    const hexBox = (await hex.boundingBox())!;
    const colour = (await colourReset.boundingBox())!;
    expect(Math.abs(centreY(colour) - centreY(hexBox)), 'Reset is on the line of the hex box').toBeLessThanOrEqual(2);
    expect(colour.x, 'Reset is beside the hex box').toBeGreaterThanOrEqual(hexBox.x + hexBox.width);
    for (const [name, control] of [
      ['Default chunk length', first],
      ['Misread marker color', hexBox],
    ] as const) {
      const label = (await dialog.getByText(name, { exact: true }).first().boundingBox())!;
      if (size.stacked) expect(label.y + label.height, `${name}: the label is above its control`).toBeLessThanOrEqual(control.y + 1);
      else expect(label.x + label.width, `${name}: the label is beside its control`).toBeLessThanOrEqual(control.x);
    }
    const frame = (await dialog.boundingBox())!;
    for (const box of [chunk, colour]) expect(box.x + box.width, 'Reset ends inside the dialog').toBeLessThanOrEqual(frame.x + frame.width);
  });
}
