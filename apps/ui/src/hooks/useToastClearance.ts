import { useEffect, type RefObject } from 'react';

/** The CSS variable the toast region adds to its distance from the bottom edge (`ToastRegion`). */
export const TOAST_CLEAR_VAR = '--toast-clear';

/**
 * Keeps toasts clear of a bar fixed along the bottom of the page (the Booth's footer): while `bar` is mounted, a message rises
 * above it by the bar's height instead of covering its chips. Follows the bar as it grows or shrinks, and puts the toasts back when it
 * unmounts.
 */
export function useToastClearance(bar: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const element = bar.current;
    if (!element) return;
    const root = document.documentElement;
    const measure = () => root.style.setProperty(TOAST_CLEAR_VAR, `${Math.ceil(element.getBoundingClientRect().height)}px`);
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(measure);
    observer?.observe(element);
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
      root.style.removeProperty(TOAST_CLEAR_VAR);
    };
  }, [bar]);
}
