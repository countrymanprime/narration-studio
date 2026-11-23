// A toast whose text box scrolls loses the scrollbar's width to it, so its text wraps to one more line than it would without; a box measured while it scrolls kept overflowing after what made
// it overflow was gone, such as a wider fallback font before the web font arrived (#4112). This spec makes that state on purpose, with no dependence on font metrics: the box is squeezed so the
// text overflows, a wide scrollbar is stood in for (by padding that only a scrolling box has, and not while it is measured with its overflow off), and the squeeze is lifted. The message fits the box
// without a scrollbar and not with it, so only a measurement made without the scrollbar lets the box stop scrolling. The font-load case itself is the unit test's: it fires the fonts' loadingdone.
import { expect, test, type Page } from '@playwright/test';

declare global {
  interface Window {
    /** Mock build only (`main.tsx`): undefined for a Retry button, null for none, a string for a button with that label. */
    __raiseToast?: (text: string, actionLabel?: string | null) => void;
  }
}

/** Ordinary prose of 89 characters: with Retry and the "+N" badge beside it, it fits two lines at 768 px (the budget in toastBudget.ts is 82 for that case, measured with room to spare). */
const MESSAGE = 'The Booth could not stop listening, so your microphone may still be open. Quit and retry.';

const measure = (page: Page) =>
  page.locator('[data-toast-region] [data-toast-text]').evaluate((element) => ({
    scrolls: element.scrollHeight > element.clientHeight + 1,
    overflowY: getComputedStyle(element).overflowY,
    tabIndex: (element as HTMLElement).tabIndex,
  }));

test('a toast text that scrolled stops scrolling once it fits again, although a scrollbar would not fit', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 900 });
  await page.goto('/?mockNoProject=1');
  await page.waitForFunction(() => typeof window.__raiseToast === 'function');
  // A scrollbar so wide that the message overflows with it, and a squeeze that makes the message overflow without it.
  // A classic scrollbar's width is stood in for by padding that exists only while the box scrolls, and not while it is measured with its overflow off (a headless browser draws overlay scrollbars of no width).
  await page.addStyleTag({ content: '[data-toast-text].overflow-y-auto:not([style*="overflow-y: hidden"]) { padding-right: 120px !important; }' });
  const squeeze = await page.addStyleTag({ content: '[data-toast-region] [data-toast-text] { max-width: 80px !important; }' });
  await page.evaluate((text) => {
    window.__raiseToast?.(text, 'Retry');
    window.__raiseToast?.('A second message waits behind it.', null);
  }, MESSAGE);
  await expect(page.locator('[data-toast-region] [data-toast-text]')).toHaveText(MESSAGE);
  await expect.poll(async () => (await measure(page)).tabIndex, { timeout: 5000 }).toBe(0);
  expect((await measure(page)).overflowY).toBe('auto');
  // The squeeze goes: the message fits the box again, but would not fit beside a 120 px scrollbar.
  await squeeze.evaluate((element) => element.remove());
  await expect.poll(async () => (await measure(page)).tabIndex, { timeout: 5000 }).toBe(-1);
  const after = await measure(page);
  expect(after.overflowY).toBe('hidden');
  expect(after.scrolls).toBe(false);
});
