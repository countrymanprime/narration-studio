import { expect, type Page } from '@playwright/test';

/**
 * Right-clicks a word the narrator can see, for a test that picks a menu item and returns that word's sentence number. A word is picked in a
 * not-yet-read sentence when one is in view, else the last in view (in a small window the sentence being read fills the box). It never right-clicks a word
 * out of sight: Playwright would scroll the box natively, which a narrator cannot do and the Booth's own scrolling does not expect.
 */
export async function rightClickVisibleWord(page: Page): Promise<string> {
  const visibleWord = () =>
    page.evaluate(() => {
      const box = document.querySelector('[data-booth-text]')!.getBoundingClientRect();
      const inView = [...document.querySelectorAll<HTMLElement>('[data-booth-text] [data-word]')].filter((el) => {
        const r = el.getBoundingClientRect();
        return r.height > 0 && r.top >= box.top + 8 && r.bottom <= box.bottom - 8;
      });
      const unitOf = (el: HTMLElement) => el.closest('[data-unit]') as HTMLElement | null;
      const ahead = inView.filter((el) => unitOf(el)?.getAttribute('data-state') === 'next');
      const pick = ahead[Math.min(ahead.length - 1, 4)] ?? inView[inView.length - 1];
      return pick ? `${unitOf(pick)?.getAttribute('data-unit')}:${pick.getAttribute('data-word')}` : '';
    });
  // The text glides to the reading place when the Booth opens: wait until a word is in view.
  await expect.poll(visibleWord, { timeout: 8000 }).not.toBe('');
  const [unit, word] = (await visibleWord()).split(':');
  await page.locator(`[data-booth-text] [data-unit="${unit}"] [data-word="${word}"]`).click({ button: 'right' });
  return unit;
}
