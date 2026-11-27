// A right-to-left chapter or track name in a toast sentence must not turn the sentence around (#4113): the name is isolated (U+2068 … U+2069) and the sentence reads left to right, so the words after it
// and the full stop stay to its right; a message that is mostly right to left (an Arabic sentence that holds "REAPER") keeps its own direction. Drawn in the real toast, not read off an attribute.
import { expect, test, type Page } from '@playwright/test';
import { isolatedIfRtl } from '../../src/visibleText';
import { raiseToast } from './helpers/raiseToast';
import { settlePage } from './helpers/settle';

const FSI = '\u2068';
const PDI = '\u2069';
const NAME = '\u0627\u0644\u0641\u0635\u0644 \u0627\u0644\u0623\u0648\u0644'; // "the first chapter", in Arabic

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
    ['a longer Arabic name than the English words, isolated', `${FSI}${NAME}${PDI} restored.`, 'restored'],
    ['a 30-letter Arabic title, as the builders isolate it', `${isolatedIfRtl(NAME.repeat(3))} restored.`, 'restored'],
    ['the name first, not isolated (a host sentence)', `${NAME} is linked to its track. Press Record when you are ready.`, 'is linked'],
  ] as const) {
    test(`${label}: the last character is right of the first Latin word`, async ({ page }) => {
      const toast = await show(page, text);
      expect(await toast.evaluate((el) => getComputedStyle(el).direction)).toBe('ltr');
      // The last character drawn, not a closing isolate (it draws nothing and has no width).
      const lastDrawn = text.replace(new RegExp(`${PDI}$`), '').length - 1;
      expect(await leftOf(page, text, lastDrawn)).toBeGreaterThan(await leftOf(page, text, text.indexOf(word)));
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

  // A paragraph separator inside a name would end its isolate and swap its words: the builder turns it into a space, so the words stay in order (the first drawn at the right of the second).
  // The segment separators U+000B and U+001F split a name into runs laid out on their own, so they are spaces too (#4129).
  for (const [label, separator] of [
    ['a paragraph separator', '\u2029'],
    ['a line tabulation (U+000B)', '\u000B'],
    ['a unit separator (U+001F)', '\u001F'],
  ] as const) {
    test(`a name holding ${label} keeps its words in order`, async ({ page }) => {
      const one = '\u0648\u0627\u062D\u062F';
      const two = '\u0627\u062B\u0646\u0627\u0646';
      const text = `${isolatedIfRtl(`${one}${separator}${two}`)}: 3 takes were kept.`;
      await show(page, text);
      expect(await leftOf(page, text, text.indexOf(one))).toBeGreaterThan(await leftOf(page, text, text.indexOf(two)));
      expect(await leftOf(page, text, text.indexOf('3'))).toBeGreaterThan(await leftOf(page, text, text.indexOf(two)));
    });
  }

  // A name of right-to-left characters that are not letters (here the Arabic question mark) is isolated too: the count after it is drawn to its right (#4129).
  test('a name made only of a right-to-left non-letter has the count after it drawn to its right', async ({ page }) => {
    const mark = '\u061F\u061F';
    const text = `${isolatedIfRtl(mark)}: 3 takes were kept.`;
    expect(text.startsWith(FSI)).toBe(true);
    await show(page, text);
    expect(await leftOf(page, text, text.indexOf('3'))).toBeGreaterThan(await leftOf(page, text, text.indexOf(PDI) - 1));
  });
});

test.describe('a message that is mostly right to left keeps its own direction', () => {
  for (const text of [
    '\u062A\u0639\u0630\u0631 \u0639\u0644\u0649 REAPER \u062D\u0641\u0638 \u0627\u0644\u0641\u0635\u0644.',
    '\u062A\u0645 \u0627\u0644\u062D\u0641\u0638',
  ]) {
    test(`"${text}" is laid out right to left`, async ({ page }) => {
      const toast = await show(page, text);
      expect(await toast.evaluate((el) => getComputedStyle(el).direction)).toBe('rtl');
      // Read right to left: the first character is drawn at the right of the last one.
      expect(await leftOf(page, text, 0)).toBeGreaterThan(await leftOf(page, text, text.length - 1));
    });
  }
});
