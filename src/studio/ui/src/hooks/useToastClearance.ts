import { useEffect, useRef, type RefObject } from 'react';

/** The CSS variable the toast region adds to its distance from the bottom edge (`ToastRegion`). */
export const TOAST_CLEAR_VAR = '--toast-clear';

/** The bars along the bottom of the page right now (the Booth's footer, and its setup notice above it), whose heights add up. */
const bars = new Set<HTMLElement>();

function apply(): void {
  const root = document.documentElement;
  if (bars.size === 0) {
    root.style.removeProperty(TOAST_CLEAR_VAR);
    return;
  }
  let total = 0;
  bars.forEach((bar) => {
    total += bar.getBoundingClientRect().height + (Number.parseFloat(getComputedStyle(bar).marginBottom) || 0);
  });
  root.style.setProperty(TOAST_CLEAR_VAR, `${Math.ceil(total)}px`);
}

/**
 * Keeps toasts clear of a bar fixed along the bottom of the page (the Booth's footer, and the setup notice above it): while `bar` is
 * mounted, a message rises above it by the bar's height and its bottom margin instead of covering its chips or its words. Bars add up,
 * so the notice stays visible above the footer and the toasts above both. Follows each bar as it grows or shrinks, and puts the toasts
 * back when the last one unmounts. `active` false leaves the bar out (a bar that only needs clearing in one layout).
 */
export function useToastClearance(bar: RefObject<HTMLElement | null>, active = true): void {
  useEffect(() => {
    const element = bar.current;
    if (!element || !active) return;
    bars.add(element);
    apply();
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(apply);
    observer?.observe(element);
    window.addEventListener('resize', apply);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', apply);
      bars.delete(element);
      apply();
    };
  }, [bar, active]);
}

/** The CSS variable the toast region adds to its distance from the right edge (`ToastRegion`). */
export const TOAST_CLEAR_RIGHT_VAR = '--toast-clear-right';

/** A column down the right edge is wide when it takes more of the window than this share, which is a panel under the page, not beside it. */
const SIDE_COLUMN_MAX_SHARE = 0.5;

/** How far in from the window's edge a column may sit and still count as down the right edge (the page's own padding). */
const SIDE_EDGE_SLACK = 64;

/**
 * Keeps toasts out of a panel down the right edge of the window (Proof's Inspector, whose decision buttons a toast would cover): while `panel` is
 * mounted and beside the page, a message sits left of it by the panel's width. A panel that spans the window (the layout stacks it under the
 * page) leaves the toasts where they were. Follows the panel as it is resized, and puts the toasts back on unmount.
 */
export function useToastSideClearance(panel: RefObject<HTMLElement | null>): void {
  // The panel can mount after the page does (Proof draws it once its data has arrived), so every commit looks again for the element rather
  // than reading the ref once; it attaches to whichever element is there and lets go of the one that left.
  const attached = useRef<HTMLElement | null>(null);
  const detach = useRef<(() => void) | undefined>(undefined);
  useEffect(() => {
    const element = panel.current;
    if (element === attached.current) return;
    detach.current?.();
    attached.current = element;
    if (!element) {
      detach.current = undefined;
      return;
    }
    const root = document.documentElement;
    const apply = (): void => {
      const box = element.getBoundingClientRect();
      const beside = box.width > 0 && box.width < window.innerWidth * SIDE_COLUMN_MAX_SHARE && box.right >= window.innerWidth - SIDE_EDGE_SLACK;
      if (beside) root.style.setProperty(TOAST_CLEAR_RIGHT_VAR, `${Math.ceil(box.width + 12)}px`);
      else root.style.removeProperty(TOAST_CLEAR_RIGHT_VAR);
    };
    apply();
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(apply);
    observer?.observe(element);
    window.addEventListener('resize', apply);
    detach.current = () => {
      observer?.disconnect();
      window.removeEventListener('resize', apply);
      root.style.removeProperty(TOAST_CLEAR_RIGHT_VAR);
    };
  });
  useEffect(
    () => () => {
      detach.current?.();
      detach.current = undefined;
      attached.current = null;
    },
    [],
  );
}
