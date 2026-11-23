// A right-to-left chapter or track name in a toast sentence must not turn the sentence around (#4113): the name is isolated (U+2068 … U+2069) and the sentence reads left to right, so the words after it
// and the full stop stay to its right; a message that is mostly right to left (an Arabic sentence that holds "REAPER") keeps its own direction. Drawn in the real toast, not read off an attribute.
import { expect, test, type Page } from '@playwright/test';
import { raiseToast } from './helpers/raiseToast';
import { settlePage } from './helpers/settle';

const FSI = '⁨';
const PDI = '⁩';
const NAME = 'الفصل الأول';

/** The left edge of the character at `index` of the toast's text, in the page's pixels; the node measured is the text node holding the whole message. */
const leftOf = (page: Page, text: string, index: number) =>
  page.evaluate(
    ([expected, at]) => {
      const node = document.querySelector('[data-toast-text]')?.firstChild;
      if (!node || node.nodeType !== Node.TEXT_NODE) throw new Error('the toast text is not a text node');
      if ((node as Text).length !== (expected as string).length)
        throw new Error(`the text node holds ${(node as Text).length} characters, not ${(expected as string).length}`);
      const range = document.createRange();
      range.setStart(node, at as number);
      range.setEnd(node, (at as number) + 1);
      return range.getBoundingClientRect().left;
    },
    [text, index] as const,
  );

async function show(page: Page, text: string) {
  await page.goto('/');
  await settlePage(page);
  await raiseToast(page, text);
  const toast = page.locator('[data-toast-text]');
  await expect(toast).toBeVisible();
  return toast;
}

test.describe('an English sentence that carries a right-to-left name reads left to right', () => {
  for (const [label, text, word] of [
    ['the name first, isolated', `${FSI}${NAME}${PDI} is linked to its track. Press Record when you are ready.`, 'is linked'],
    ['the name first, not isolated (a host sentence)', `${NAME} is linked to its track. Press Record when you are ready.`, 'is linked'],
    ['the name last, isolated', `Chapter linked to its track and ready to record: ${FSI}${NAME}${PDI}`, 'Chapter'],
  ] as const) {
    test(`${label}: the last character is right of the first Latin word`, async ({ page }) => {
      const toast = await show(page, text);
      expect(await toast.evaluate((el) => getComputedStyle(el).direction)).toBe('ltr');
      expect(await leftOf(page, text, text.length - 1)).toBeGreaterThan(await leftOf(page, text, text.indexOf(word)));
    });
  }

  // A digit after an isolated name is drawn after it, not before it (without the isolate Chromium draws the 3 to the name's left).
  test('a count after an isolated name is drawn to its right', async ({ page }) => {
    const text = `${FSI}${NAME}${PDI}: 3 takes were kept.`;
    await show(page, text);
    const digit = text.indexOf('3');
    const nameEnd = text.indexOf(PDI) - 1;
    expect(await leftOf(page, text, digit)).toBeGreaterThan(await leftOf(page, text, nameEnd));
  });
});

test.describe('a message that is mostly right to left keeps its own direction', () => {
  for (const text of ['تعذر على REAPER حفظ الفصل.', 'تم الحفظ']) {
    test(`"${text}" is laid out right to left`, async ({ page }) => {
      const toast = await show(page, text);
      expect(await toast.evaluate((el) => getComputedStyle(el).direction)).toBe('rtl');
      // Read right to left: the first character is drawn at the right of the last one.
      expect(await leftOf(page, text, 0)).toBeGreaterThan(await leftOf(page, text, text.length - 1));
    });
  }
});
