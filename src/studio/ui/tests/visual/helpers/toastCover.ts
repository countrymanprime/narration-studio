import type { Page } from '@playwright/test';

/**
 * Which buttons the toast region lies over, by the buttons' accessible names: the owner rule that no toast covers a button is judged by this.
 * `selector` names the buttons to test; `topBand` adds every button whose bottom edge is within that many pixels of the window's top (the page's
 * own tools above its content). The toast's own buttons are never counted.
 */
export async function coveredByToast(
  page: Page,
  { selector, topBand }: { selector: string; topBand?: number },
): Promise<{ toast: { top: number; bottom: number; left: number; right: number }; covered: string[]; count: number }> {
  return page.evaluate(
    ({ selector, topBand }) => {
      const region = document.querySelector('[data-toast-region]')!;
      const t = (region.querySelector('[data-toast-edge]')?.parentElement ?? region).getBoundingClientRect();
      const buttons = [
        ...document.querySelectorAll<HTMLElement>(selector),
        ...(topBand === undefined
          ? []
          : [...document.querySelectorAll<HTMLElement>('button')].filter((b) => {
              const r = b.getBoundingClientRect();
              return r.width > 0 && r.top >= 0 && r.bottom <= topBand && !b.closest('[data-toast-region]');
            })),
      ].filter((b) => !b.closest('[data-toast-region]'));
      // A button is covered when it is what the window shows under the toast: with the toast hidden, the topmost element at the middle of the shared
      // area is the button. A button scrolled out of its column, or clipped, lies under the toast's box and is not seen there.
      const region_ = region as HTMLElement;
      const was = region_.style.visibility;
      region_.style.visibility = 'hidden';
      const covered = buttons
        .filter((b) => {
          const r = b.getBoundingClientRect();
          if (!(r.width > 0 && r.left < t.right && r.right > t.left && r.top < t.bottom && r.bottom > t.top)) return false;
          const x = (Math.max(r.left, t.left) + Math.min(r.right, t.right)) / 2;
          const y = (Math.max(r.top, t.top) + Math.min(r.bottom, t.bottom)) / 2;
          const top = document.elementFromPoint(x, y);
          return top !== null && b.contains(top);
        })
        .map((b) => b.getAttribute('aria-label') ?? b.textContent ?? '');
      region_.style.visibility = was;
      return { toast: { top: t.top, bottom: t.bottom, left: t.left, right: t.right }, covered, count: buttons.length };
    },
    { selector, topBand },
  );
}
