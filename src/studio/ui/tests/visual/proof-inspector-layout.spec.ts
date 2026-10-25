import { expect, test, type Page } from '@playwright/test';
import { proofDrivers } from './drivers/proof';
import { settlePage } from './helpers/settle';

// Where the Proof Inspector sits when a note is chosen and when there is none (alignment audit XPF-9, XPF-27).

const inspector = (page: Page) => page.getByRole('complementary', { name: 'Note' });

/** Starts the app, as the state suite does before a driver runs, and drives `state`. */
async function drive(page: Page, size: { width: number; height: number }, state: string): Promise<void> {
  await page.setViewportSize(size);
  await page.goto('/');
  await settlePage(page);
  await proofDrivers[state](page);
}

for (const size of [
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'small-desktop', width: 1024, height: 768 },
]) {
  test(`Proof / pressing a note brings the stacked Inspector into view / ${size.name}`, async ({ page }) => {
    await drive(page, size, 'default');
    await page.getByRole('region', { name: 'Notes', exact: true }).locator('tr[data-row]').nth(1).click();
    await expect(inspector(page)).toBeInViewport({ ratio: 0.3 });
  });
}

test('Proof / with no notes the Inspector is a placeholder, not a page-tall card', async ({ page }) => {
  await drive(page, { width: 1440, height: 900 }, 'empty');
  // The panel holding the Inspector's one line (worded differently before XPF-27).
  const line = page.getByText(/^(A note shows here once a check finds one\.|Choose a note to see what was heard\.)$/);
  const box = (await line.locator('xpath=..').boundingBox())!;
  expect(box.height, 'the empty Inspector is as tall as its line').toBeLessThan(160);
});
