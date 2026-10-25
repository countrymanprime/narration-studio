import { expect, test, type Locator, type Page } from '@playwright/test';
import { storybibleDrivers } from './drivers/storybible';
import { settlePage } from './helpers/settle';

// The entry's names list is one grid (alignment audit SBX-1 to SBX-4, R4SB-1, R3SB1-5, R3SB1-6): every row's name, pronunciation,
// source and play button start at one x whatever buttons the row has, the text sits on the middle of the row's 36 px buttons, and
// nothing (the old Rescan button) is stacked over the first row's buttons. Read view (Hatter and its alias, White Rabbit with a
// flagged alias) and edit view (an alias row with Remove, a first row without).
const SIZES = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'small-desktop', width: 1024, height: 768 },
  { name: 'tablet', width: 768, height: 1024 },
];
// Driving a state takes most of a default 30 s test on a slow runner.
test.describe.configure({ timeout: 90_000 });
// `loads`: the driver loads the app itself (it seeds the mock first), as the visual suite's boot does for the others. `sizes`:
// review-filter's driver leaves the pointer on the rail, which opens over the list below 1360 px, so it runs at the desktop size.
const STATES = [
  { state: 'character-voice-references', loads: false, sizes: SIZES },
  { state: 'review-filter', loads: true, sizes: SIZES.slice(0, 1) },
  { state: 'alias-pronunciation-editing', loads: false, sizes: SIZES },
];

type Box = { x: number; y: number; width: number; height: number };
const box = async (locator: Locator): Promise<Box> => (await locator.boundingBox())!;
const near = (values: number[], label: string) => expect(Math.max(...values) - Math.min(...values), label).toBeLessThanOrEqual(1);

async function rows(page: Page) {
  const list = page.getByRole('list', { name: 'Names' });
  await list.scrollIntoViewIfNeeded();
  const items = list.locator(':scope > li');
  const count = await items.count();
  expect(count, 'the entry has at least two names').toBeGreaterThanOrEqual(2);
  return Promise.all(
    Array.from({ length: count }, async (_, index) => {
      const item = items.nth(index);
      const row = item.locator('[data-name]');
      const name = (await row.getAttribute('data-name'))!;
      return {
        name: await box(row.getByText(name, { exact: true }).first()),
        // The text box in edit view; read view's pronunciation sits between the name and the source, which are checked.
        say: (await row.getByRole('textbox', { name: /^How I say/ }).count()) ? await box(row.getByRole('textbox', { name: /^How I say/ })) : undefined,
        source: await box(item.getByLabel(/^(Source|Pronunciation source)/).first()),
        play: await box(item.getByRole('button', { name: /^(Play|Pause)/ })),
      };
    }),
  );
}

for (const { state, loads, sizes } of STATES) {
  for (const size of sizes) {
    test(`Story Bible / the names list shares its columns / ${state} / ${size.name} ${size.width}x${size.height}`, async ({ page }) => {
      page.setDefaultTimeout(20_000);
      await page.setViewportSize({ width: size.width, height: size.height });
      if (!loads) {
        await page.goto('/');
        await settlePage(page);
      }
      await storybibleDrivers[state](page);
      const found = await rows(page);
      near(
        found.map((row) => row.name.x),
        'names start at one x',
      );
      if (found.every((row) => row.say))
        near(
          found.map((row) => row.say!.x),
          'pronunciation boxes start at one x',
        );
      near(
        found.map((row) => row.source.x),
        'sources start at one x',
      );
      near(
        found.map((row) => row.play.x),
        'play buttons start at one x',
      );
      for (const row of found) {
        const middle = row.play.y + row.play.height / 2;
        expect(Math.abs(row.name.y + row.name.height / 2 - middle), 'the name sits on the middle of its buttons').toBeLessThanOrEqual(1);
      }
      // No button sits over the first row's buttons: the column above them is the heading's text, then the card's header.
      const first = found[0].play;
      const above = await page
        .getByRole('list', { name: 'Names' })
        .locator('xpath=..')
        .getByRole('button')
        .evaluateAll(
          (buttons, play) =>
            buttons
              .map((button) => button.getBoundingClientRect())
              .filter((rect) => rect.bottom <= play.y && rect.bottom > play.y - 24 && rect.right > play.x && rect.left < play.x + play.width).length,
          first,
        );
      expect(above, 'nothing is stacked over the first row’s buttons').toBe(0);
    });
  }
}
