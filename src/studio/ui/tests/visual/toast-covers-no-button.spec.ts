// Owner rule: no toast or element may cover a button (#4063). On every page with the sidebar, at 360x500, 768x1024 and 1440x900, in both themes, an error toast
// with Retry (one, and two stacked), the longest kind the app raises, overlaps no button, link or [role=button] of the page that is visible at that moment, and
// the toast's own buttons are at least 24 px each way (WCAG 2.2 target size). The page makes room by registering its bars (`useToastClearance`) and its
// scrolling columns (`useToastRoom`); a page that cannot is listed in TOAST_COVERS_DEBT with a reason and an issue, as `layout-debt.ts` does.
import { expect, test, type Page } from '@playwright/test';
import { settlePage } from './helpers/settle';
import { goToPage } from './drivers/shared';

const SIZES = [
  { width: 360, height: 500 },
  { width: 768, height: 1024 },
  { width: 1440, height: 900 },
] as const;

const LONG =
  "This chapter's audio couldn't be played. Check that its source files are still where the project expects them, then press Retry or open Settings to see where they are kept.";

type Case = { name: string; open: (page: Page) => Promise<void> };
const nav = (name: Parameters<typeof goToPage>[1]): Case => ({ name, open: (page) => goToPage(page, name) });
const CASES: Case[] = [
  nav('Production'),
  nav('Schedule'),
  nav('Script'),
  nav('Story Bible'),
  nav('Booth'),
  nav('Editing'),
  nav('Proof'),
  nav('Pickups'),
  nav('Master & QC'),
  nav('Delivery'),
  nav('Settings'),
  {
    name: 'Editing chapter',
    open: async (page) => {
      await page.goto('/editing/chapter-1');
      await settlePage(page);
      await page.getByRole('toolbar', { name: 'Playback and selection' }).waitFor();
    },
  },
];

/** A page and the widths a toast is known to cover one of its buttons at, with why and where it is tracked. The list may only shrink. */
const TOAST_COVERS_DEBT: Array<{ page: string; widths: number[]; reason: string; issue: number }> = [];

for (const theme of ['light', 'dark'] as const) {
  for (const size of SIZES) {
    for (const c of CASES) {
      test(`${c.name}: a Retry toast covers no button (${theme}, ${size.width}x${size.height})`, async ({ page }) => {
        await page.emulateMedia({ colorScheme: theme });
        await page.setViewportSize(size);
        await page.goto('/');
        await settlePage(page);
        await c.open(page);
        await page.waitForFunction(() => typeof (window as unknown as { __raiseToast?: unknown }).__raiseToast === 'function');
        for (const text of [LONG, 'The take could not be saved. Try again.']) {
          await page.evaluate((t) => (window as unknown as { __raiseToast: (t: string) => void }).__raiseToast(t), text);
        }
        await page.locator('[data-toast-region] [data-tone="error"]').first().waitFor();
        await page.mouse.move(size.width - 2, 2);
        await page.waitForTimeout(400);
        const result = await page.evaluate(() => {
          const region = document.querySelector('[data-toast-region]')!;
          const toasts = [...region.querySelectorAll<HTMLElement>('[data-tone]')].filter((t) => t.getBoundingClientRect().width > 0);
          /** The part of a box a page can show: cut by every ancestor that clips, and by the window. */
          const visible = (el: Element): DOMRect | null => {
            const r = el.getBoundingClientRect();
            let left = Math.max(r.left, 0);
            let top = Math.max(r.top, 0);
            let right = Math.min(r.right, window.innerWidth);
            let bottom = Math.min(r.bottom, window.innerHeight);
            for (let p = el.parentElement; p; p = p.parentElement) {
              const s = getComputedStyle(p);
              if (s.display === 'none' || s.visibility === 'hidden') return null;
              if (s.overflowX === 'visible' && s.overflowY === 'visible') continue;
              const b = p.getBoundingClientRect();
              left = Math.max(left, b.left);
              top = Math.max(top, b.top);
              right = Math.min(right, b.right);
              bottom = Math.min(bottom, b.bottom);
            }
            return right > left && bottom > top ? new DOMRect(left, top, right - left, bottom - top) : null;
          };
          const covered: string[] = [];
          for (const b of document.querySelectorAll('button, a[href], [role="button"]')) {
            if (b.closest('[data-toast-region]') || b.closest('[hidden], [inert], [aria-hidden="true"]')) continue;
            const v = visible(b);
            if (!v || v.width < 1 || v.height < 1) continue;
            for (const t of toasts) {
              const tr = t.getBoundingClientRect();
              if (v.left < tr.right - 0.5 && v.right > tr.left + 0.5 && v.top < tr.bottom - 0.5 && v.bottom > tr.top + 0.5)
                covered.push(
                  `${b.getAttribute('aria-label') ?? b.textContent?.trim().slice(0, 30) ?? b.tagName} @${Math.round(v.left)},${Math.round(v.top)} ${Math.round(v.width)}x${Math.round(v.height)}`,
                );
            }
          }
          const small = [...region.querySelectorAll('button')]
            .map((b) => ({ n: b.getAttribute('aria-label') ?? b.textContent, r: b.getBoundingClientRect() }))
            .filter(({ r }) => r.width > 0 && (r.width < 24 || r.height < 24))
            .map(({ n, r }) => `${n} ${r.width.toFixed(1)}x${r.height.toFixed(1)}`);
          const boxes = toasts.map((t) => {
            const r = t.getBoundingClientRect();
            return [r.left, r.top, r.right, r.bottom].map(Math.round);
          });
          return { covered, small, boxes, count: toasts.length };
        });
        expect(result.count, 'both toasts are drawn').toBe(2);
        const debt = TOAST_COVERS_DEBT.find((d) => d.page === c.name && d.widths.includes(size.width));
        if (debt) {
          expect(result.covered.length, `${c.name} is listed as covered (${debt.reason}, #${debt.issue}); delete the entry once it is not`).toBeGreaterThan(0);
        } else {
          expect(result.covered, `toasts ${JSON.stringify(result.boxes)} cover: ${JSON.stringify(result.covered)}`).toEqual([]);
        }
        expect(result.small, 'the toast buttons are at least 24 px each way').toEqual([]);
      });
    }
  }
}
