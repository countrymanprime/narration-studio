import { useEffect, useRef } from 'react';

// Where focus goes when a panel that stays mounted (a drawer, opened and closed through `open`) closes: the element that had
// focus when it opened, or, when that element is gone (the click removed it, or the layout changed), into the page's <main>
// (its first control, or <main> itself, which AppShell makes focusable); `fallback` names a better place than <main> when the caller knows one. Base UI would otherwise drop focus on <body>.
// `Dialog` mounts fresh each time and captures its opener when it mounts, so it has its own copy of the same rule.
export function useReturnFocusTarget(open: boolean, fallback?: () => HTMLElement | null): () => HTMLElement | boolean {
  const opener = useRef<HTMLElement | null>(null);
  useEffect(() => {
    // Runs right after the panel opens, before the library moves focus into it (it does that a frame later).
    if (open) opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }, [open]);
  return () => {
    const element = opener.current;
    if (element?.isConnected && element !== document.body) return element;
    const elsewhere = fallback?.();
    if (elsewhere?.isConnected) return elsewhere;
    return document.querySelector<HTMLElement>('main') ?? true;
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
