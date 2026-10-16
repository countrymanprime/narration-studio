import { useEffect, type RefObject } from 'react';

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
 * back when the last one unmounts.
 */
export function useToastClearance(bar: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const element = bar.current;
    if (!element) return;
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
  }, [bar]);
}
