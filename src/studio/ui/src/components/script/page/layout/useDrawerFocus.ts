import { useEffect, useRef, type RefObject } from 'react';
import type { ScriptViewState } from '../data/scriptView';

/** How long a drawer takes to slide in; focus moves into it once it is there, as the mock's `setDrawer` does. */
export const DRAWER_FOCUS_DELAY_MS = 220;

/** What takes focus in each drawer: the chapter list's tab stop, or the rail's selected tab. */
const FIRST: Record<'ch' | 'rail', string> = { ch: 'ul button[tabindex="0"]', rail: '[role="tab"][aria-selected="true"]' };

/**
 * Focus for the drawers: opening one moves focus into it once it has slid in, and closing it gives focus back to what had it when
 * it opened (the reader header's button), unless focus has already moved somewhere else on purpose.
 */
export function useDrawerFocus(drawer: ScriptViewState['drawer'], chapters: RefObject<HTMLElement | null>, rail: RefObject<HTMLElement | null>): void {
  const opener = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!drawer) {
      const back = opener.current;
      opener.current = null;
      const inside = document.activeElement instanceof Element && document.activeElement.closest('[data-panel]') !== null;
      if (back?.isConnected && (inside || document.activeElement === document.body)) back.focus();
      return;
    }
    if (!opener.current && document.activeElement instanceof HTMLElement && document.activeElement !== document.body) opener.current = document.activeElement;
    const panel = (drawer === 'ch' ? chapters : rail).current;
    const timer = setTimeout(() => panel?.querySelector<HTMLElement>(FIRST[drawer])?.focus(), DRAWER_FOCUS_DELAY_MS);
    return () => clearTimeout(timer);
  }, [drawer, chapters, rail]);
}
