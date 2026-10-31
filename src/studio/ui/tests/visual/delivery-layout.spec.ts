import { expect, test, type Page } from '@playwright/test';
import { deliveryDrivers } from './drivers/delivery';
import { settlePage } from './helpers/settle';

// The Delivery page's layout (alignment audit, #2251), measured in the real app: a capped column on a wide window (R3DL-1), labels and
// values side by side (XDL-3), a custom profile's boxes on one grid (XDL-1), the aside ending at its list (XDL-4), placed after Output
// in one column (XDL-6), and no card past a 390 px window (XDL-11, XDL-10).
async function open(page: Page, state: string, width: number, height: number): Promise<void> {
  await page.setViewportSize({ width, height });
  await page.goto('/');
  await settlePage(page);
  await deliveryDrivers[state]!(page);
}

const section = (page: Page, title: string) => page.locator('section').filter({ has: page.getByRole('heading', { name: title, exact: true }) });

test('Delivery / a wide window keeps Master & QC’s 96 rem column / 1920', async ({ page }) => {
  await open(page, 'default', 1920, 1080);
  const cards = await page.locator('main section').evaluateAll((all) => all.map((el) => el.getBoundingClientRect()));
  const left = Math.min(...cards.map((box) => box.left));
  const right = Math.max(...cards.map((box) => box.right));
  expect(right - left, 'the cards span at most 96 rem').toBeLessThanOrEqual(96 * 16 + 1);
});

test('Delivery / a rule’s value sits beside its label, and the aside ends at its list / desktop', async ({ page }) => {
  await open(page, 'default', 1440, 900);
  const rms = await page.getByText('RMS', { exact: true }).evaluate((label) => {
    const value = label.nextElementSibling!;
    return value.getBoundingClientRect().left - label.getBoundingClientRect().right;
  });
  expect(rms, 'RMS and its limit are not across the card').toBeLessThan(250);
  const aside = await section(page, 'Before you build').evaluate((card) => {
    const last = [...card.querySelectorAll('li')].at(-1)!;
    return card.getBoundingClientRect().bottom - last.getBoundingClientRect().bottom;
  });
  expect(aside, 'no blank tail under the last chapter').toBeLessThanOrEqual(24);
});

test('Delivery / a custom profile’s boxes start and end on one grid / desktop', async ({ page }) => {
  await open(page, 'custom-profile', 1440, 900);
  const edges = await page
    .getByRole('textbox', { name: / highest$/ })
    .evaluateAll((boxes) => boxes.map((box) => Math.round(box.getBoundingClientRect().right)));
  expect(edges.length).toBeGreaterThan(2);
  expect(new Set(edges).size, 'every highest box ends at one x').toBe(1);
});

test('Delivery / in one column, Before you build comes straight after Output / tablet', async ({ page }) => {
  await open(page, 'default', 768, 1024);
  const top = (title: string) => section(page, title).evaluate((card) => card.getBoundingClientRect().top);
  expect(await top('Before you build'), 'the list is before Profile rules').toBeLessThan(await top('Profile rules'));
  expect(await top('Before you build'), 'and after Output').toBeGreaterThan(await top('Output'));
});

test('Delivery / no card runs past a 390 px window / reflow', async ({ page }) => {
  await open(page, 'default', 390, 844);
  const rights = await page.locator('main section').evaluateAll((all) => all.map((el) => el.getBoundingClientRect().right));
  for (const right of rights) expect(right, 'inside the window').toBeLessThanOrEqual(390);
  // Under 24 rem of card a rule's label sits over its value (#2642), so the value keeps the card's width instead of wrapping a word a line.
  const channels = await page.getByText('Channels', { exact: true }).evaluate((label) => {
    const value = label.nextElementSibling!.getBoundingClientRect();
    const own = label.getBoundingClientRect();
    return { valueLeft: value.left, valueTop: value.top, valueRight: value.right, valueWidth: value.width, labelLeft: own.left, labelBottom: own.bottom };
  });
  expect(channels.valueTop, 'the Channels value is under its label').toBeGreaterThanOrEqual(channels.labelBottom - 1);
  expect(Math.abs(channels.valueLeft - channels.labelLeft), 'and starts where the label starts').toBeLessThanOrEqual(1);
  expect(channels.valueRight, 'inside the window').toBeLessThanOrEqual(390);
  expect(channels.valueWidth, 'with the card width, not a squeezed column').toBeGreaterThan(250);
});

test('Delivery / the two top cards’ header rules line up / desktop', async ({ page }) => {
  await open(page, 'default', 1440, 900);
  const rule = (title: string) =>
    page.getByRole('heading', { name: title, exact: true }).evaluate((heading) => {
      let header: HTMLElement | null = heading as HTMLElement;
      while (header && !header.className.includes('border-b')) header = header.parentElement;
      return Math.round(header!.getBoundingClientRect().bottom);
    });
  expect(await rule('Delivery'), 'the Delivery header ends where Before you build’s does').toBe(await rule('Before you build'));
});
