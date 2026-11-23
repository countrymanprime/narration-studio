// The character budgets in `toastBudget.ts` (#4095) are what keeps the Booth's own sentences (`refusalSentences.test.ts`) on two lines. This spec checks the budgets
// against the real layout: a message of exactly its budget, in ordinary prose, does not scroll inside the toast at any supported width, beside each button a Booth message comes with.
import { expect, test } from '@playwright/test';
import { TOAST_CHAR_BUDGET, type ToastButton } from '../../src/components/primitives/toastBudget';
import { settlePage } from './helpers/settle';

const WIDTHS = [1440, 1100, 960, 768] as const;

/** The label of the button next to Dismiss for each budget: none, Retry, and the longest label a Booth message carries. `__raiseToast` takes null for no button. */
const LABEL: Record<ToastButton, string | null> = { plain: null, retry: 'Retry', checkAgain: 'Check again' };

const PROSE =
  'The Booth could not stop listening, so your microphone may still be open. Quit and reopen the app to be sure it stopped, then record the take again from the top of the chapter.';

/** The longest run of whole words of the prose that fits the budget. */
function sentenceOf(budget: number): string {
  const words = PROSE.split(' ');
  let text = words[0]!;
  for (const word of words.slice(1)) {
    if (`${text} ${word}`.length > budget) break;
    text = `${text} ${word}`;
  }
  return text;
}

for (const width of WIDTHS) {
  for (const button of Object.keys(TOAST_CHAR_BUDGET) as ToastButton[]) {
    test(`a message of ${TOAST_CHAR_BUDGET[button]} characters beside ${LABEL[button] ?? 'Dismiss alone'} stays on two lines at ${width} px wide`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/?mockNoProject=1');
      await settlePage(page);
      await page.waitForFunction(() => typeof (window as unknown as { __raiseToast?: unknown }).__raiseToast === 'function');
      const text = sentenceOf(TOAST_CHAR_BUDGET[button]);
      // The budget is the size of the message, so the sample is within a few characters of it.
      expect(text.length).toBeGreaterThan(TOAST_CHAR_BUDGET[button] - 8);
      await page.evaluate(
        ([said, label]) => (window as unknown as { __raiseToast: (t: string, l: string | null) => void }).__raiseToast(said as string, label as string | null),
        [text, LABEL[button]],
      );
      const shown = page.locator('[data-toast-region] [data-toast-text]');
      await expect(shown).toHaveText(text);
      const box = await shown.evaluate((element) => ({ clientHeight: element.clientHeight, scrollHeight: element.scrollHeight }));
      expect(box.scrollHeight, `"${text}" (${text.length} characters) scrolls inside the toast`).toBeLessThanOrEqual(box.clientHeight + 1);
    });
  }
}
