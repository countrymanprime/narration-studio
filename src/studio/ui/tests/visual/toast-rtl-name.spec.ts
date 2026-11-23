// A right-to-left chapter or track name at the start of a toast sentence must not turn the sentence around (#4113): the full stop stays at the end, to the right of the words after the name.
import { expect, test, type Page } from '@playwright/test';
import { settlePage } from './helpers/settle';

const raise = (page: Page, text: string) => page.evaluate((t) => (window as unknown as { __raiseToast: (text: string) => void }).__raiseToast(t), text);

/** The left edge of the character at `index` of the toast's text, in the page's pixels. */
const leftOf = (page: Page, index: number) =>
  page.evaluate((at) => {
    const node = document.querySelector('[data-toast-text]')?.firstChild;
    if (!node) throw new Error('no toast text');
    const range = document.createRange();
    range.setStart(node, at);
    range.setEnd(node, at + 1);
    return range.getBoundingClientRect().left;
  }, index);

const NAME = 'الفصل الأول';

for (const [label, text, word] of [
  ['a sentence that begins with an Arabic name', `${NAME} is linked to its track. Press Record when you are ready.`, 'is linked'],
  ['a sentence that ends with an Arabic name', `Linked to ${NAME}`, 'Linked'],
] as const) {
  test(`${label} reads left to right, with its words in order`, async ({ page }) => {
    await page.goto('/');
    await settlePage(page);
    await page.waitForFunction(() => typeof (window as unknown as { __raiseToast?: unknown }).__raiseToast === 'function');
    await raise(page, text);
    const toast = page.locator('[data-toast-text]');
    await expect(toast).toBeVisible();
    expect(await toast.evaluate((el) => getComputedStyle(el).direction)).toBe('ltr');
    // The last character is to the right of the first Latin word of the sentence: nothing was turned around.
    expect(await leftOf(page, text.length - 1)).toBeGreaterThan(await leftOf(page, text.indexOf(word)));
  });
}
