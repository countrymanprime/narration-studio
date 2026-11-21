import { expect, test } from '@playwright/test';
import { storybibleDrivers } from './drivers/storybible';
import { settlePage } from './helpers/settle';

// A name with no spaces (a pasted line, a 10,000-character run) used to be one 148,800 px line that ran under the row's Remove, Hear and Record
// buttons (#3382 g). It breaks anywhere now, stops at three lines (the whole name is its tooltip), the pronunciation field and the buttons stay on the
// row's first line, and the dictionaries note under it breaks too.
const SIZES = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'narrow', width: 390, height: 844 },
];
test.describe.configure({ timeout: 90_000 });

for (const size of SIZES) {
  test(`Story Bible / a long unbroken name stays in its column / ${size.name} ${size.width}x${size.height}`, async ({ page }) => {
    page.setDefaultTimeout(20_000);
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.goto('/');
    await settlePage(page);
    await storybibleDrivers['alias-pronunciation-editing']!(page);
    const long = 'W'.repeat(10_000);
    const add = page.getByRole('textbox', { name: 'Add a name' });
    await add.fill(long);
    await add.press('Enter');
    const row = page.locator(`[data-name="${long}"]`);
    await row.waitFor();
    const item = page.getByRole('list', { name: 'Names' }).locator(':scope > li', { has: row });
    const measured = await item.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      const name = element.querySelector('[data-name] > span > span')!;
      const field = element.querySelector('input[aria-label^="How I say"]')?.getBoundingClientRect();
      const buttons = Array.from(element.querySelectorAll('button')).map((button) => button.getBoundingClientRect());
      return {
        rowRight: bounds.right,
        nameRight: name.getBoundingClientRect().right,
        nameScrollWidth: name.scrollWidth,
        nameClientWidth: name.clientWidth,
        rowHeight: bounds.height,
        fieldTop: field?.top ?? bounds.top,
        firstButtonTop: Math.min(...buttons.map((rect) => rect.top)),
        firstButtonLeft: Math.min(...buttons.map((rect) => rect.left)),
        pageScroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
    expect.soft(measured.nameScrollWidth, 'the name does not run past its own box').toBeLessThanOrEqual(measured.nameClientWidth + 1);
    expect.soft(measured.nameRight, 'the name ends inside the row').toBeLessThanOrEqual(measured.rowRight + 1);
    expect.soft(measured.rowHeight, 'the row is a few lines, not a screen').toBeLessThan(size.width < 480 ? 300 : 170);
    // Below a 32 rem card the name has a line of its own and the cells wrap under it.
    if (size.width >= 480)
      expect.soft(Math.abs(measured.fieldTop - measured.firstButtonTop), 'the pronunciation field sits on the buttons’ line').toBeLessThan(14);
    expect.soft(measured.pageScroll, 'the page does not scroll sideways').toBeLessThanOrEqual(0);
    await item.getByRole('button', { name: 'From the dictionaries' }).click();
    const none = item.getByText(/^No dictionary has/);
    await none.waitFor({ timeout: 8000 }).catch(() => undefined);
    if (await none.count()) {
      const fits = await none.evaluate((element) => element.scrollWidth <= element.clientWidth + 1);
      expect.soft(fits, 'the dictionaries note breaks inside its box').toBe(true);
      const sideways = await page.evaluate(() =>
        Array.from(document.querySelectorAll('*')).some(
          (node) => node.scrollWidth > node.clientWidth + 1 && getComputedStyle(node).overflowX === 'auto' && node.clientWidth > 0 && node.scrollWidth > 5000,
        ),
      );
      expect.soft(sideways, 'no panel scrolls sideways').toBe(false);
    }
  });
}
