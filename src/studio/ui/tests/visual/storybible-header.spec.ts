import { expect, test, type Locator, type Page } from '@playwright/test';
import { storybibleDrivers } from './drivers/storybible';
import { settlePage } from './helpers/settle';

// The entry's header (alignment audit SBX-6, SBX-7, R4SB-11): the kind and status pills never break a word over two lines, sit on the
// name's middle and, in edit view, beside the name; Mark reviewed is as tall as the icon buttons beside it. And the loading skeleton
// is the loaded page's shape (SBX-19): the detail is a card with a header, not blocks on the page.
const SIZES = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'small-desktop', width: 1024, height: 768 },
  { name: 'tablet', width: 768, height: 1024 },
];
test.describe.configure({ timeout: 90_000 });

type Box = { x: number; y: number; width: number; height: number };
const box = async (locator: Locator): Promise<Box> => (await locator.boundingBox())!;
const middle = (b: Box) => b.y + b.height / 2;

async function load(page: Page, size: (typeof SIZES)[number], state: string) {
  page.setDefaultTimeout(20_000);
  await page.setViewportSize({ width: size.width, height: size.height });
  await page.goto('/');
  await settlePage(page);
  await storybibleDrivers[state](page);
}

const entryHeader = (page: Page) =>
  page
    .locator('section', { has: page.getByRole('button', { name: 'Find in the manuscript' }) })
    .locator(':scope > div')
    .first();

for (const size of SIZES) {
  test(`Story Bible / the entry header keeps its pills whole and beside the name / ${size.name} ${size.width}x${size.height}`, async ({ page }) => {
    // White Rabbit in edit: the kind menu, Needs review and Mark reviewed.
    await load(page, size, 'alias-pronunciation-editing');
    const header = entryHeader(page);
    const name = await box(header.getByRole('textbox', { name: 'Name' }));
    const kind = await box(header.getByRole('button', { name: /^Character/ }));
    const status = await box(header.getByText('Needs review', { exact: true }));
    for (const pill of [kind, status]) expect(pill.height, 'a pill is one line').toBeLessThanOrEqual(24);
    if (kind.y < name.y + name.height) {
      // On the name's line: on its middle, right after it.
      expect(Math.abs(middle(kind) - middle(name)), 'the kind sits on the name’s middle').toBeLessThanOrEqual(2);
      expect(kind.x - (name.x + name.width), 'the kind follows the name').toBeLessThanOrEqual(16);
    } else {
      // Wrapped where the header is narrow: on the next line, from the header's left (the status dot), not mid-header.
      expect(kind.x, 'the kind starts the next line').toBeLessThanOrEqual(name.x);
    }
    const mark = await box(header.getByRole('button', { name: 'Mark reviewed' }));
    const find = await box(header.getByRole('button', { name: 'Find in the manuscript' }));
    expect(mark.height, 'Mark reviewed is as tall as the icon buttons').toBe(find.height);
  });

  test(`Story Bible / the loading skeleton is the loaded page's shape / ${size.name} ${size.width}x${size.height}`, async ({ page }) => {
    await load(page, size, 'loading');
    const region = page.getByRole('group', { name: 'Loading the Story Bible entries' });
    await region.waitFor();
    // The detail placeholder (the pane beside the Entries card) is a card: a 1 px border at the card radius, as the entry it becomes.
    const frame = await page
      .locator('section[aria-label="Entries"] + div > :first-child')
      .evaluate((element) => `${getComputedStyle(element).borderTopWidth} ${getComputedStyle(element).borderRadius}`);
    expect(frame, 'the detail placeholder has the card frame').toBe('1px 10px');
  });
}
