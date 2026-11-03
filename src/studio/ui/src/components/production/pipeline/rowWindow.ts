import { useCallback, useLayoutEffect, useRef, useState } from 'react';

// Which rows of a long list to draw. The pipeline has a row for every chapter, each with seven tooltips, and a 5000-chapter book mounted all
// 35,000 of them in one commit (#1764: 29 s on a QA machine, 88 s in a slow sandbox). A windowed list draws the rows in view plus a margin
// and holds the place of the rest with two spacer rows, so every drawn row is one height (`ROW_PX`) and a row's place is its index times it.

/** The height of a drawn row once the list is windowed: two lines of chapter name and the stage cells. */
export const ROW_PX = 52;
/** A book of this many rows or fewer is drawn whole, with the rows at their natural height. */
export const WINDOW_AFTER = 150;
/** Rows drawn above and below the ones in view, so a wheel step or a page key never shows a blank. */
export const OVERSCAN = 8;
/** The visible height used until it has been measured (and where nothing is laid out, as in a unit test). */
const GUESS_HEIGHT = 800;

/** Rows `start` to `end` (exclusive) of a list. */
export type RowRange = { start: number; end: number };

/**
 * The rows to draw for a view that starts `top` px into the rows and is `height` px tall: one range, or two when `keep` (a row that must stay
 * drawn wherever the view is, the one with focus, so scrolling away with the wheel never drops the keyboard to the page; -1 for none) lies
 * outside it. The kept row is drawn alone, not with every row between it and the view.
 */
export function rowWindow(count: number, top: number, height: number, keep = -1): RowRange[] {
  if (count <= 0) return [];
  let start = Math.max(0, Math.floor(top / ROW_PX) - OVERSCAN);
  let end = Math.min(count, Math.ceil((top + height) / ROW_PX) + OVERSCAN);
  // A view scrolled past either end still draws the rows nearest it.
  start = Math.min(start, count - 1);
  end = Math.max(end, start + 1);
  const view = { start, end };
  if (keep < 0 || keep >= count || (keep >= start && keep < end)) return [view];
  const kept = { start: keep, end: keep + 1 };
  if (keep === end) return [{ start, end: end + 1 }];
  if (keep === start - 1) return [{ start: keep, end }];
  return keep < start ? [kept, view] : [view, kept];
}

const scrolls = (element: Element): boolean => {
  const { overflowY } = getComputedStyle(element);
  return (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') && element.scrollHeight > element.clientHeight + 1;
};

/** The nearest ancestor that scrolls vertically (the page's main area), or the window. */
export function scrollerOf(element: Element): HTMLElement | Window {
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    if (scrolls(parent)) return parent;
  }
  return window;
}

const isWindow = (scroller: HTMLElement | Window): scroller is Window => scroller === window;

const viewOf = (body: Element, scroller: HTMLElement | Window): { top: number; height: number } => {
  const edge = isWindow(scroller) ? 0 : scroller.getBoundingClientRect().top;
  const height = isWindow(scroller) ? window.innerHeight : scroller.clientHeight;
  return { top: edge - body.getBoundingClientRect().top, height: height || GUESS_HEIGHT };
};

/**
 * Scrolls the row at `index` of a windowed body to the middle of the view, for a row that is not drawn yet (a jump from the menu). The row
 * is drawn on the scroll that follows; the caller looks for it a frame later.
 */
export function revealRow(body: Element, index: number): void {
  const scroller = scrollerOf(body);
  const { top, height } = viewOf(body, scroller);
  const by = index * ROW_PX + ROW_PX / 2 - top - height / 2;
  if (isWindow(scroller)) scroller.scrollBy({ top: by });
  else scroller.scrollTop += by;
}

/**
 * The rows of a body to draw. `ref` goes on the `tbody`; `windowed` is false for a short list, which is drawn whole and listens to nothing.
 * The view is held as the first row in view and the count in view, so a scroll re-renders only when a row boundary is crossed.
 */
export function useRowWindow(count: number, keep: number) {
  const ref = useRef<HTMLTableSectionElement>(null);
  const scroller = useRef<HTMLElement | Window | null>(null);
  const [view, setView] = useState({ first: 0, rows: Math.ceil(GUESS_HEIGHT / ROW_PX) });
  const windowed = count > WINDOW_AFTER;

  const measure = useCallback(() => {
    const body = ref.current;
    if (!body) return;
    scroller.current ??= scrollerOf(body);
    const { top, height } = viewOf(body, scroller.current);
    const first = Math.max(0, Math.floor(top / ROW_PX));
    const rows = Math.ceil(height / ROW_PX) + 1;
    setView((was) => (was.first === first && was.rows === rows ? was : { first, rows }));
  }, []);

  useLayoutEffect(() => {
    if (!windowed) return;
    scroller.current = null;
    measure();
    let frame = 0;
    const onScroll = () => {
      if (!frame) {
        frame = requestAnimationFrame(() => {
          frame = 0;
          measure();
        });
      }
    };
    const onResize = () => {
      scroller.current = null;
      onScroll();
    };
    // Scroll events do not bubble, so one capturing listener hears whichever element is the page's scroll area.
    window.addEventListener('scroll', onScroll, { capture: true, passive: true });
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('scroll', onScroll, { capture: true });
      window.removeEventListener('resize', onResize);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [windowed, measure]);

  const ranges: RowRange[] = windowed ? rowWindow(count, view.first * ROW_PX, view.rows * ROW_PX, keep) : [{ start: 0, end: count }];
  return { ref, windowed, ranges };
}
