import { expect, test, type Page } from '@playwright/test';
import { proofDrivers } from './drivers/proof';
import { settlePage } from './helpers/settle';

// The recording check card and the Check recordings dialog on Proof, measured (alignment audit XPF-2, XPF-16, XPF-17, XPF-18, XPF-19,
// R3PF-3, R3PF-8).

async function drive(page: Page, size: { width: number; height: number }, state: string): Promise<void> {
  await page.setViewportSize(size);
  await page.goto('/');
  await settlePage(page);
  await proofDrivers[state](page);
}

const card = (page: Page) => page.getByRole('region', { name: 'Recording check' });
const top = async (page: Page, text: string) => (await card(page).getByText(text, { exact: true }).boundingBox())!.y;

for (const size of [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'tablet', width: 768, height: 1024 },
]) {
  test(`Proof / Check recordings shows its whole form in one scroll area, Cancel and Check on one row / ${size.name}`, async ({ page }) => {
    await drive(page, size, 'check-recordings-dialog');
    const dialog = page.getByRole('dialog');
    const list = dialog.getByRole('list').first();
    expect(await list.evaluate((element) => getComputedStyle(element).overflowY), 'the chapter list is not a second scroller').toBe('visible');
    // One scroll area holds the whole form, and shows that it scrolls when it does.
    const area = dialog.getByRole('combobox', { name: 'Chapters at once' }).locator('xpath=ancestor::div[contains(@class,"overflow-y-auto")][1]');
    expect(await area.evaluate((element) => element.contains(document.querySelector('[role="dialog"] ul')))).toBe(true);
    const scroll = await area.evaluate((element) => ({ more: element.scrollHeight > element.clientHeight, cue: getComputedStyle(element).backgroundImage }));
    if (scroll.more) expect(scroll.cue, 'a cue that the form goes on below').toContain('gradient');
    const cancel = (await dialog.getByRole('button', { name: 'Cancel' }).boundingBox())!;
    const check = (await dialog.getByRole('button', { name: /^Check \d+ chapters?$/ }).boundingBox())!;
    expect(Math.abs(check.y - cancel.y), 'Cancel and Check share a row').toBeLessThanOrEqual(1);
    expect(check.x, 'Check is right of Cancel').toBeGreaterThan(cancel.x);
  });
}

test('Proof / the running check puts Stop checking beside what runs and each bar under its chapter, as the card says', async ({ page }) => {
  await drive(page, { width: 1440, height: 900 }, 'check-checking');
  const dialog = page.getByRole('dialog');
  const stop = (await dialog.getByRole('button', { name: 'Stop checking' }).boundingBox())!;
  const line = (await dialog.getByText(/^Checking with /).boundingBox())!;
  expect(Math.abs(stop.y + stop.height / 2 - (line.y + line.height / 2)), 'Stop checking is on the line that says what runs').toBeLessThanOrEqual(2);
  // The chapter's row: the list item holding its own bar (the activity box above has list items of its own).
  const item = dialog
    .getByRole('listitem')
    .filter({ has: page.getByRole('progressbar', { name: /^Checking / }) })
    .first();
  const bar = (await item.getByRole('progressbar').boundingBox())!;
  const row = (await item.boundingBox())!;
  expect(bar.width, 'the bar runs under the chapter name').toBeGreaterThan(row.width * 0.9);
  // The card is behind the modal, so out of the accessibility tree: found by its markup.
  await expect(page.locator('section[aria-label="Recording check"] button', { hasText: 'Stop checking' })).toHaveCount(1);
});

test('Proof / the check card captions its result and puts its chip groups side by side', async ({ page }) => {
  await drive(page, { width: 1440, height: 900 }, 'check-never');
  expect(Math.abs((await top(page, 'Last check')) - (await top(page, 'Recorded'))), 'the result has a caption on the captions row').toBeLessThanOrEqual(1);
  expect(Math.abs((await top(page, 'In the audio')) - (await top(page, 'Against the script'))), 'the two chip groups share a row').toBeLessThanOrEqual(1);
});

test('Proof / at 390 the check card keeps its two figures side by side', async ({ page }) => {
  await drive(page, { width: 390, height: 844 }, 'check-never');
  expect(Math.abs((await top(page, 'Script estimate')) - (await top(page, 'Recorded')))).toBeLessThanOrEqual(1);
});

test('Proof / a chapter with no recording says so once', async ({ page }) => {
  await drive(page, { width: 1440, height: 900 }, 'chapter-no-recording');
  await expect(page.getByText('No recording for this chapter yet.')).toHaveCount(0);
});
