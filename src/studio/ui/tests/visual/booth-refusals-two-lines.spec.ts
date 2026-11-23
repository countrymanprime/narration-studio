// The character budgets in `toastBudget.ts` (#4095) are what keeps the Booth's own sentences (`refusalSentences.test.ts`) on two lines. This spec checks the budgets
// against the real layout: a message of exactly its budget, in ordinary prose, does not scroll inside the toast at any supported width, beside each button a Booth message comes with.
import { expect, test } from '@playwright/test';
import { BOOTH_TOAST_SENTENCES } from '../../src/components/booth/refusalSentences';
import { TOAST_CHAR_BUDGET, type ToastButton } from '../../src/components/primitives/toastBudget';
import { settlePage } from './helpers/settle';

// The two-line guarantee holds from 768 px wide at a 16 px root font: below that, or with a larger root font, the toast is narrower and a sentence scrolls inside it (docs/operations/verification-tooling.md).
const WIDTHS = [1440, 1100, 960, 768] as const;

/** The label of the button next to Dismiss for each budget: none, Retry, and the longest label a Booth message carries. `__raiseToast` takes null for no button. */
const LABEL: Record<ToastButton, string | null> = { plain: null, retry: 'Retry', checkAgain: 'Check again' };

const PROSE =
  'The Booth could not stop listening, so your microphone may still be open. Quit and reopen the app to be sure it stopped, then record the take again from the top of the chapter.';

/** The longest run of whole words of the prose that fits the budget. */
function sentenceOf(budget: number): string {
  const words = PROSE.split(' ');
  const [first = '', ...rest] = words;
  let text = first;
  for (const word of rest) {
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

// The shipped sentences, in the real toast beside the button each comes with: capitals ("REAPER") are wider than ordinary prose, so the sample above is not enough.
for (const width of WIDTHS) {
  test(`every Booth sentence stays on two lines at ${width} px wide`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/?mockNoProject=1');
    await settlePage(page);
    await page.waitForFunction(() => typeof (window as unknown as { __raiseToast?: unknown }).__raiseToast === 'function');
    for (const { button, name, text } of BOOTH_TOAST_SENTENCES) {
      await page.evaluate(
        ([said, label]) => (window as unknown as { __raiseToast: (t: string, l: string | null) => void }).__raiseToast(said as string, label as string | null),
        [text, LABEL[button]],
      );
      const shown = page.locator('[data-toast-region] [data-toast-text]');
      await expect(shown).toHaveText(text);
      const box = await shown.evaluate((element) => ({ clientHeight: element.clientHeight, scrollHeight: element.scrollHeight }));
      expect(box.scrollHeight, `${name}: "${text}" (${text.length} characters) scrolls inside the toast`).toBeLessThanOrEqual(box.clientHeight + 1);
      // The next one takes the slot when this one goes.
      await page.locator('[data-toast-region]').getByRole('button', { name: 'Dismiss message' }).click();
      await expect(page.locator('[data-toast-region] [data-toast-text]')).toHaveCount(0);
    }
  });
}

// A message waiting behind the toast puts "+N" beside the buttons, which takes about 11 to 18 characters of the two lines (measured at 111, 93 and 82 characters alone against 93, 82 and about 71
// with it, for no button, Retry and Check again). The budgets are for a message with nothing behind it; with one waiting, the text may scroll inside the toast, and then it is a Tab stop, so all of it stays reachable.
for (const button of Object.keys(TOAST_CHAR_BUDGET) as ToastButton[]) {
  test(`a message of ${TOAST_CHAR_BUDGET[button]} characters beside ${LABEL[button] ?? 'Dismiss alone'} and the +N badge is all reachable at 768 px wide`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 768, height: 900 });
    await page.goto('/?mockNoProject=1');
    await settlePage(page);
    await page.waitForFunction(() => typeof (window as unknown as { __raiseToast?: unknown }).__raiseToast === 'function');
    const text = sentenceOf(TOAST_CHAR_BUDGET[button]);
    await page.evaluate(
      ([said, label]) => {
        const raise = (window as unknown as { __raiseToast: (t: string, l: string | null) => void }).__raiseToast;
        raise(said as string, label as string | null);
        raise('A second message waits behind the first.', null);
      },
      [text, LABEL[button]],
    );
    const shown = page.locator('[data-toast-region] [data-toast-text]');
    await expect(shown).toHaveText(text);
    await expect(page.locator('[data-toast-region]').getByText('+1')).toBeVisible();
    const box = await shown.evaluate((element) => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
      tabIndex: (element as HTMLElement).tabIndex,
    }));
    // Either it fits, or it scrolls and the keyboard can reach the rest.
    if (box.scrollHeight > box.clientHeight + 1) expect(box.tabIndex, `"${text}" scrolls with +1 and is not a Tab stop`).toBe(0);
  });
}

// The message that says a track was made for the chapter, in the Booth with the mock's own chapter name.
test('the track-created message stays on two lines in the Booth', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 900 });
  await page.goto('/booth?mockReaperState=no_link');
  await settlePage(page);
  const dialog = page.getByRole('dialog', { name: /is not linked to a track$/ });
  await dialog.getByRole('button', { name: 'Create a new track' }).click();
  await dialog.waitFor({ state: 'detached' });
  const shown = page.locator('[data-toast-region] [data-toast-text]').filter({ hasText: /is in REAPER, linked here/ });
  await expect(shown).toBeVisible();
  const box = await shown.evaluate((element) => ({ clientHeight: element.clientHeight, scrollHeight: element.scrollHeight }));
  expect(box.scrollHeight).toBeLessThanOrEqual(box.clientHeight + 1);
});
