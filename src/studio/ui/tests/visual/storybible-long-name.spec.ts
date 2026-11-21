import { expect, test } from '@playwright/test';
import { storybibleDrivers } from './drivers/storybible';
import { settlePage } from './helpers/settle';

// A name with no spaces (a pasted line, a 10,000-character run) used to be one 148,800 px line that ran under the row's Remove, Hear and Record
// buttons (#3382 g). It breaks anywhere now: the name stays inside its own column and the buttons keep the row's right edge.
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
      const name = element.querySelector('[data-name] > span')!;
      const buttons = Array.from(element.querySelectorAll('button')).map((button) => button.getBoundingClientRect());
      return {
        rowRight: bounds.right,
        nameRight: name.getBoundingClientRect().right,
        nameScrollWidth: name.scrollWidth,
        nameClientWidth: name.clientWidth,
        firstButtonLeft: Math.min(...buttons.map((rect) => rect.left)),
        pageScroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
    expect.soft(measured.nameScrollWidth, 'the name does not run past its own box').toBeLessThanOrEqual(measured.nameClientWidth + 1);
    expect.soft(measured.nameRight, 'the name ends inside the row').toBeLessThanOrEqual(measured.rowRight + 1);
    expect.soft(measured.pageScroll, 'the page does not scroll sideways').toBeLessThanOrEqual(0);
  });
}
