import { useEffect, useRef } from 'react';
import { recentDialogTarget } from './dialogClosed';

// Where focus goes when a panel that stays mounted (a drawer, opened and closed through `open`) closes: the element that had
// focus when it opened, or, when that element is gone (the click removed it, or the layout changed), into the page's <main>
// (its first control, or <main> itself, which AppShell makes focusable); `fallback` names a better place than <main> when the caller knows one. Base UI would otherwise drop focus on <body>.
// `Dialog` mounts fresh each time and captures its opener when it mounts, so it has its own copy of the same rule.
export function useReturnFocusTarget(open: boolean, fallback?: () => HTMLElement | null): () => HTMLElement | boolean {
  const opener = useRef<HTMLElement | null>(null);
  // The place a dialog that closed as this opened was handing focus back to: this panel's opener is a control inside that dialog, which goes with it.
  const fromDialog = useRef<(() => HTMLElement | null) | null>(null);
  useEffect(() => {
    // Runs right after the panel opens, before the library moves focus into it (it does that a frame later).
    if (open) {
      opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      fromDialog.current = recentDialogTarget();
    }
  }, [open]);
  return () => {
    const element = opener.current;
    if (element?.isConnected && element !== document.body) return element;
    // What the caller names comes first: it knows the place this panel was opened for; the dialog that closed a moment ago may have been another one's.
    const elsewhere = fallback?.();
    if (elsewhere?.isConnected) return elsewhere;
    const where = fromDialog.current?.();
    if (where?.isConnected && where.tagName !== 'MAIN') return where;
    // <main> is focusable but not tabbable, so handed to Base UI it would pick the header's first button (#2902): focus it ourselves.
    return handFocusToPage();
  };
}

// Escape on a panel that opens in place from a control (a chip that expands, a drawer opened by a header toggle): close it and put focus back
// on the control that opened it. Put it on the panel and on its opener (or on one element holding both). Not for a modal: Dialog, SlideOver and
// Popover already return focus. A key the panel's own widgets took (`defaultPrevented`: an open menu, a running preview) or that came from a
// layer portaled out of it is left alone. The router skips Escape on a tab, radio or slider, so the page's own Escape never sees these.
export function escapeClosesPanel(close: () => void, opener: () => HTMLElement | null) {
  return (event: {
    key: string;
    defaultPrevented: boolean;
    target: EventTarget;
    currentTarget: Element;
    preventDefault: () => void;
    stopPropagation: () => void;
  }) => {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    if (!(event.target instanceof Node) || !event.currentTarget.contains(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
    close();
    opener()?.focus();
  };
}

/**
 * Focuses the page's <main> (focusable, not tabbable, so handed to Base UI as a target it would pick its first tabbable, the header's button). The one place
 * the Booth's voice hand-offs do it; false when the page has no <main>.
 */
export function focusPageMain(): boolean {
  const page = document.querySelector<HTMLElement>('main');
  page?.focus({ preventScroll: true });
  return !!page;
}

/**
 * For a popup that closes on a pick: hands focus to the page's <main> a tick after it has gone, unless the pick already put focus somewhere (a dialog it
 * opened). Returns what Base UI's `finalFocus` expects. `Dialog` keeps its own opener-first rule above this one.
 */
export function handFocusToPage(): boolean {
  if (!document.querySelector('main')) return true;
  window.setTimeout(() => {
    const active = document.activeElement;
    if (!active || active === document.body || !active.isConnected) focusPageMain();
  }, 0);
  return false;
}
