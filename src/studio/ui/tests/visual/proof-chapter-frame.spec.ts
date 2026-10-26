import { expect, test, type Page } from '@playwright/test';
import { proofChapterDrivers } from './drivers/proof-chapter';
import { settlePage } from './helpers/settle';

// Proof's chapter view: one frame for every state, the title row, native takes and the readiness card, measured (alignment audit XPC-6,
// XPC-7, XPC-12, XPC-13, XPC-17, XPC-19, XPC-21, R4PC-2, R3PC-13).

async function drive(page: Page, size: { width: number; height: number }, state: string): Promise<void> {
  await page.setViewportSize(size);
  await page.goto('/');
  await settlePage(page);
  await proofChapterDrivers[state](page);
}

const heading = (page: Page) => page.getByRole('heading', { level: 1 });

test('Proof chapter / the title stands in one place while loading, failed and loaded, at the full page width', async ({ page }) => {
  const at: Record<string, { x: number; y: number }> = {};
  for (const state of ['loading', 'load-failed', 'current']) {
    await drive(page, { width: 1920, height: 1080 }, state);
    const box = (await heading(page).boundingBox())!;
    at[state] = { x: Math.round(box.x), y: Math.round(box.y) };
  }
  expect(at['load-failed'], 'failed').toEqual(at.current);
  expect(at.loading, 'loading').toEqual(at.current);
  const main = (await page.locator('main').boundingBox())!;
  const card = (await page.getByRole('region', { name: /Compare the recording/ }).boundingBox())!;
  expect(main.x + main.width - (card.x + card.width), 'the cards run to the page gutter, not a 1280 px column').toBeLessThanOrEqual(17);
});

test('Proof chapter / a failed read offers a way back to Proof', async ({ page }) => {
  await drive(page, { width: 1440, height: 900 }, 'load-failed');
  await expect(page.getByRole('button', { name: 'Back to Proof' })).toBeVisible();
});

test('Proof chapter / a never-checked chapter says so once, in the title row, on the title centre line', async ({ page }) => {
  await drive(page, { width: 1440, height: 900 }, 'never');
  await expect(page.getByText(/hasn.t been checked yet/)).toHaveCount(0);
  const title = (await heading(page).boundingBox())!;
  const button = (await page.getByRole('button', { name: 'Check recordings…', exact: true }).boundingBox())!;
  expect(Math.abs(title.y + title.height / 2 - (button.y + button.height / 2))).toBeLessThanOrEqual(1.5);
});

for (const size of [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'reflow', width: 390, height: 844 },
]) {
  test(`Proof chapter / a native take's buttons start beside its name, and the name stays readable / ${size.name}`, async ({ page }) => {
    await drive(page, size, 'native-takes-unassigned');
    const list = page.getByRole('list', { name: 'Native takes not yet assigned to a line' });
    for (const row of await list.getByRole('listitem').all()) {
      const name = (await row.getByText(/^Take \d+$/).boundingBox())!;
      expect(name.width, 'the take name is readable').toBeGreaterThanOrEqual(56);
      const play = (await row.getByRole('button', { name: /^Play / }).boundingBox())!;
      const select = (await row.getByRole('combobox').boundingBox())!;
      // On one line, the select follows the name column (12rem), not the far end of the card.
      if (Math.abs(select.y - name.y) < 20) expect(select.x - (play.x + play.width), 'the select is beside the name').toBeLessThanOrEqual(220);
    }
  });
}

test('Proof chapter / readiness and the rendered file sit side by side from 1024 px', async ({ page }) => {
  await drive(page, { width: 1440, height: 900 }, 'render-measured');
  const rendered = (await page.getByRole('heading', { name: 'Rendered file' }).boundingBox())!;
  const card = (await page.getByRole('region', { name: 'Proofing readiness' }).boundingBox())!;
  expect(rendered.x, 'the rendered file is the right column').toBeGreaterThan(card.x + card.width / 2 - 40);
  await expect(page.getByText(/chosen .* · measured /)).toHaveCount(1);
});
