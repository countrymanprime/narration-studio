import { expect, test, type Locator, type Page } from '@playwright/test';
import { storybibleDrivers } from './drivers/storybible';
import { settlePage } from './helpers/settle';

// Suggestions (alignment audit SBX-14, SBX-17, SBX-22, R3SB1-4, R3SB2-7): a suggestion's list row is an entry row's height with its score
// inside its own cell; the suggestion's card is titled like an entry, not by repeating its sentence; and a suggestion's decision buttons
// are the 36 px icon buttons, right after its score.
const SIZES = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'small-desktop', width: 1024, height: 768 },
  { name: 'tablet', width: 768, height: 1024 },
];
test.describe.configure({ timeout: 90_000 });

type Box = { x: number; y: number; width: number; height: number };
const box = async (locator: Locator): Promise<Box> => (await locator.boundingBox())!;

async function load(page: Page, size: (typeof SIZES)[number], state: string) {
  page.setDefaultTimeout(20_000);
  await page.setViewportSize({ width: size.width, height: size.height });
  await page.goto('/');
  await settlePage(page);
  await storybibleDrivers[state](page);
}

for (const size of SIZES) {
  // loose-suggestion's driver leaves the pointer on the rail, which opens over the list in the 1024 icon rail, so it skips that width.
  if (size.name !== 'small-desktop')
    test(`Story Bible / a suggestion row and card match the entry's / ${size.name} ${size.width}x${size.height}`, async ({ page }) => {
      await load(page, size, 'loose-suggestion');
      const table = page.getByRole('table', { name: 'Story Bible entries' });
      const loose = table.locator('[data-loose]');
      const entry = table.locator('[data-entry-id]').first();
      expect((await box(loose.first())).height, 'a suggestion row is an entry row’s height').toBeCloseTo((await box(entry)).height, 0);
      for (let index = 0; index < (await loose.count()); index++) {
        const cells = loose.nth(index).locator('td');
        for (let cell = 0; cell < (await cells.count()); cell++) {
          const overflow = await cells.nth(cell).evaluate((element) => element.scrollWidth - element.clientWidth);
          expect(overflow, 'nothing spills out of a suggestion row’s cell').toBeLessThanOrEqual(0);
        }
      }
      const panel = page.locator('section', { has: page.locator('[data-sug]') });
      const heading = panel.getByRole('heading', { level: 2 });
      const card = panel.locator('[data-sug]').first();
      expect(await heading.evaluate((element) => getComputedStyle(element).fontSize), 'the card is titled at the entry’s size').toBe('26px');
      const summary = (await card.locator('.basis-48').first().textContent())!.trim();
      expect((await heading.textContent())!.trim(), 'the title does not repeat the suggestion').not.toBe(summary);
    });

  test(`Story Bible / a suggestion's decisions are 36 px, right after its score / ${size.name} ${size.width}x${size.height}`, async ({ page }) => {
    await load(page, size, 'entry-suggestions');
    const card = page.locator('[data-sug]').first();
    await card.scrollIntoViewIfNeeded();
    const reject = await box(card.locator('[data-sug-reject]'));
    expect(reject.height, 'the decision buttons are 36 px').toBe(36);
    const first = await box(card.locator('[data-sug-accept], [data-sug-reviewed]').first());
    const score = await box(card.getByText(/\d+%|No score/).first());
    expect(first.x - (score.x + score.width), 'the buttons follow the score').toBeLessThanOrEqual(8);
  });
}
