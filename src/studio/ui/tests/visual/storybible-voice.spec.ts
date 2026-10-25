import { expect, test, type Locator, type Page } from '@playwright/test';
import { storybibleDrivers } from './drivers/storybible';
import { settlePage } from './helpers/settle';

// Voice samples and the Voice data drawer (alignment audit SBX-11, SBX-15, R3SB2-9, R3SB2-10, R4SB-10): every sample title starts at one x
// whether or not it is primary, the play button, the title and the menu share one middle, Check again ends where the rows' menus end, the
// reference-clip form is one row or one column (never three widths), and the drawer's two remove buttons are one width.
const SIZES = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'small-desktop', width: 1024, height: 768 },
  { name: 'tablet', width: 768, height: 1024 },
];
test.describe.configure({ timeout: 90_000 });

type Box = { x: number; y: number; width: number; height: number };
const box = async (locator: Locator): Promise<Box> => (await locator.boundingBox())!;
const middle = (b: Box) => b.y + b.height / 2;
const spread = (values: number[]) => Math.max(...values) - Math.min(...values);

async function load(page: Page, size: (typeof SIZES)[number], state: string) {
  page.setDefaultTimeout(20_000);
  await page.setViewportSize({ width: size.width, height: size.height });
  await page.goto('/');
  await settlePage(page);
  await storybibleDrivers[state](page);
}

for (const size of SIZES) {
  test(`Story Bible / voice sample rows share their columns / ${size.name} ${size.width}x${size.height}`, async ({ page }) => {
    // Queen of Hearts: four samples, the first primary.
    await load(page, size, 'voice-samples-entry');
    const section = page.locator('[data-voice-samples]').first();
    await section.scrollIntoViewIfNeeded();
    const rows = section.locator('li');
    const count = await rows.count();
    expect(count).toBeGreaterThanOrEqual(2);
    const titles: number[] = [];
    const menuRights: number[] = [];
    for (let index = 0; index < count; index++) {
      const row = rows.nth(index);
      const menu = await box(row.getByRole('button', { name: /^More about / }));
      const play = await box(row.getByRole('button', { name: /^(Play|Stop) voice sample/ }));
      const title = await box(row.locator('span[dir="auto"][title]').first());
      titles.push(title.x);
      menuRights.push(menu.x + menu.width);
      expect(Math.abs(middle(play) - middle(menu)), 'play and menu share a middle').toBeLessThanOrEqual(1.5);
      expect(Math.abs(middle(title) - middle(play)), 'the title sits on the play button’s middle').toBeLessThanOrEqual(2);
    }
    expect(spread(titles), 'every title starts at one x').toBeLessThanOrEqual(1);
    const check = await box(section.getByRole('button', { name: 'Check again' }));
    expect(Math.abs(check.x + check.width - menuRights[0]), 'Check again ends where the menus end').toBeLessThanOrEqual(1);
  });

  test(`Story Bible / the Voice data drawer lines up its forms and buttons / ${size.name} ${size.width}x${size.height}`, async ({ page }) => {
    await load(page, size, 'voice-data-panel');
    const drawer = page.getByRole('dialog', { name: 'Voice data' });
    const select = await box(drawer.getByRole('combobox', { name: 'Approve a region for Narration' }));
    const note = await box(drawer.getByRole('textbox', { name: 'Note (optional)' }));
    const approve = await box(drawer.getByRole('button', { name: 'Approve as reference' }));
    const sameRow = Math.abs(select.y - note.y) < 2;
    if (!sameRow) expect(spread([select.width, note.width, approve.width]), 'stacked, the three are one width').toBeLessThanOrEqual(1);
    const samples = await box(drawer.getByRole('button', { name: 'Remove voice samples…' }));
    const data = await box(drawer.getByRole('button', { name: 'Remove voice data…' }));
    expect(Math.abs(samples.width - data.width), 'the remove buttons are one width').toBeLessThanOrEqual(1);
  });
}
