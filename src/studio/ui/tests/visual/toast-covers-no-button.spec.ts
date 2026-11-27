// Owner rule: no toast or element may cover a button (#4063). On every page with the sidebar, at 1440x900, 1100x800, 960x700 and 768x1024, in both themes, an error toast
// with Retry (one, and two stacked), the longest kind the app raises, overlaps no button, link or [role=button] of the page that is visible at that moment, and
// the toast's own buttons are at least 24 px each way (WCAG 2.2 target size). The shell always keeps a slot for one toast under the page (`--toast-slot`; `AppShell`) that never grows: one toast shows, the rest wait behind it; a page that cannot is listed in TOAST_COVERS_DEBT with a reason and an issue, as `layout-debt.ts` does.
import { expect, test, type Page } from '@playwright/test';
import { settlePage } from './helpers/settle';
import { goToPage, openSettings } from './drivers/shared';
import { raiseToast, toastHookReady } from './helpers/raiseToast';

// The product's windows: 960 px wide and up (its minimum), and one tablet size. A window 520 px tall or shorter (360x500, 320x300) is far below the minimum and keeps no slot: the toast floats there, so the guard does not hold at those sizes.
const SIZES = [
  { width: 1440, height: 900 },
  { width: 1100, height: 800 },
  { width: 960, height: 700 },
  { width: 768, height: 1024 },
] as const;

const LONG =
  "This chapter's audio couldn't be played. Check that its source files are still where the project expects them, then press Retry or open Settings to see where they are kept.";

type Case = { name: string; open: (page: Page) => Promise<void>; lightOnly?: boolean };
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
  // The Settings categories end in rows of buttons the issue names (#4063): each opens in light, where the slot is the same as in dark.
  ...['App & updates', 'Appearance & keys', 'Delivery', 'Models & downloads', 'Project', 'Recording & DAW', 'Speech to text', 'Voice & pronunciation'].map(
    (category): Case => ({ name: `Settings: ${category}`, lightOnly: true, open: (page) => openSettings(page, category) }),
  ),
  // Proof's chapter view (/proof/:chapterId): the title row's Check recordings sits where a toast stands.
  {
    name: 'Proof chapter',
    open: async (page) => {
      await page.goto('/proof/chapter-1');
      await settlePage(page);
      await page
        .getByRole('button', { name: /Check (recordings|again)/ })
        .first()
        .waitFor();
    },
  },
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

/** The buttons of the page a person can see right now (not clipped away by a scroller, not under the toast region): named by label and place in the page. */
const visibleButtons = (): string[] => {
  const seen = (el: Element): boolean => {
    const r = el.getBoundingClientRect();
    let left = Math.max(r.left, 0);
    let top = Math.max(r.top, 0);
    let right = Math.min(r.right, window.innerWidth);
    let bottom = Math.min(r.bottom, window.innerHeight);
    for (let p = el.parentElement; p; p = p.parentElement) {
      const st = getComputedStyle(p);
      if (st.display === 'none' || st.visibility === 'hidden') return false;
      if (st.overflowX === 'visible' && st.overflowY === 'visible') continue;
      const b = p.getBoundingClientRect();
      left = Math.max(left, b.left);
      top = Math.max(top, b.top);
      right = Math.min(right, b.right);
      bottom = Math.min(bottom, b.bottom);
    }
    return right - left >= 1 && bottom - top >= 1;
  };
  return [...document.querySelectorAll('button, a[href], [role="button"]')]
    .filter((b) => !b.closest('[data-toast-region], [hidden], [inert], [aria-hidden="true"]') && seen(b))
    .map((b) => {
      const name = `${b.getAttribute('aria-label') ?? b.textContent?.trim().slice(0, 30) ?? b.tagName}`;
      // Reachable once the strip takes its room: a scrolling column holds it, so a narrator scrolls to it. One with none (a fixed rail) would be lost.
      let scrolls = false;
      for (let p = b.parentElement; p && !scrolls; p = p.parentElement) scrolls = /auto|scroll/.test(getComputedStyle(p).overflowY);
      return scrolls ? name : `${name} (no scrolling column holds it)`;
    });
};

/** What is raised: the longest message the app says with a second toast, a pasted error of 1,500 characters (the qa-breaker's B2), and the four toasts the app keeps (B3). The last two run on three pages in light. */
/** Where every button the page shows stands, by label and place: a toast, one or four, must move none of them (the Booth's Record must not jump when a take's second toast arrives). */
const buttonPlaces = () =>
  [...document.querySelectorAll<HTMLElement>('button, a[href], [role="button"]')]
    .filter((b) => !b.closest('[data-toast-region], [hidden], [inert], [aria-hidden="true"]'))
    .map((b, i) => ({ key: `${i} ${b.getAttribute('aria-label') ?? b.textContent?.trim().slice(0, 30)}`, r: b.getBoundingClientRect() }))
    .filter(({ r }) => r.width > 0 && r.height > 0)
    .map(({ key, r }) => `${key} @${Math.round(r.left)},${Math.round(r.top)}`);

const VARIANTS: Array<{ name: string; texts: string[]; pages?: string[]; themes: ReadonlyArray<'light' | 'dark'> }> = [
  { name: 'a Retry toast', texts: [LONG, 'The take could not be saved. Try again.'], themes: ['light', 'dark'] },
  {
    name: 'a pasted error of 1,500 characters',
    texts: [`${'Unexpected failure in the host: '.repeat(48)}end`],
    pages: ['Editing chapter', 'Production', 'Script'],
    themes: ['light'],
  },
  {
    name: 'four toasts',
    texts: ['Take one failed.', 'Take two failed.', 'Take three failed.', 'Take four failed.'],
    pages: ['Editing chapter', 'Production', 'Settings'],
    themes: ['light'],
  },
];

for (const variant of VARIANTS) {
  for (const theme of variant.themes) {
    for (const size of SIZES) {
      for (const c of CASES.filter((k) => (!variant.pages || variant.pages.includes(k.name)) && !(k.lightOnly && theme === 'dark'))) {
        test(`${c.name}: ${variant.name} covers no button (${theme}, ${size.width}x${size.height})`, async ({ page }) => {
          await page.emulateMedia({ colorScheme: theme });
          await page.setViewportSize(size);
          await page.goto('/');
          await settlePage(page);
          await c.open(page);
          // The hook is waited for before anything is measured, as it was before the helper: its arrival must not move what is measured.
          await toastHookReady(page);
          const before = await page.evaluate(visibleButtons);
          const placesBefore = await page.evaluate(buttonPlaces);
          for (const text of variant.texts) {
            await raiseToast(page, text);
          }
          await page.locator('[data-toast-region] [data-tone="error"]').first().waitFor();
          await page.mouse.move(size.width - 2, 2);
          await page.waitForFunction(() => Number.parseFloat(document.documentElement.style.getPropertyValue('--toast-h')) > 0);
          const placesAfter = await page.evaluate(buttonPlaces);
          await page.waitForTimeout(250);
          const after = await page.evaluate(visibleButtons);
          // A button in view before the toast that is out of view after it must be in a scrolling column, so it is still reachable; the page is shorter by the strip.
          const lost = before.filter((name) => !after.includes(name) && name.endsWith('(no scrolling column holds it)'));
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
            return { covered, small, boxes, count: toasts.length, more: Number(region.querySelector('[data-toast-more]')?.textContent?.replace('+', '') ?? 0) };
          });
          // One toast shows in the slot, and the rest wait behind it with a count; a second or a fourth never resizes the strip or moves the page.
          expect(result.count, 'one toast is drawn').toBe(1);
          expect(result.more, 'the rest are counted').toBe(variant.texts.length - 1);
          expect(placesAfter, 'showing toasts moves no button').toEqual(placesBefore);
          const debt = TOAST_COVERS_DEBT.find((d) => d.page === c.name && d.widths.includes(size.width));
          if (debt) {
            expect(result.covered.length, `${c.name} is listed as covered (${debt.reason}, #${debt.issue}); delete the entry once it is not`).toBeGreaterThan(
              0,
            );
          } else {
            expect(result.covered, `toasts ${JSON.stringify(result.boxes)} cover: ${JSON.stringify(result.covered)}`).toEqual([]);
          }
          expect(lost, 'no button is shut out of reach by the strip').toEqual([]);
          expect(result.small, 'the toast buttons are at least 24 px each way').toEqual([]);
        });
      }
    }
  }
}
