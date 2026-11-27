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
    // <main> as the opener (a key or a command with focus on the landmark) is focused here too: handed to Base UI it picks the header's first button (#2902).
    if (element?.isConnected && element !== document.body) return element.tagName === 'MAIN' ? handFocusToPage() : element;
    // What the caller names comes first: it knows the place this panel was opened for; the dialog that closed a moment ago may have been another one's.
    const elsewhere = fallback?.();
    // The page's landmark named as the place (the jump menu's hand-back is <main>): focused here, since Base UI handed <main> picks the header's first button (#2902).
    if (elsewhere?.isConnected) return elsewhere.tagName === 'MAIN' ? handFocusToPage() : elsewhere;
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

/** The page's <main> that can take focus: the first not inside an inert subtree (the Companion's shell is inert behind its own page, which has its own <main>). */
function pageMain(): HTMLElement | null {
  return [...document.querySelectorAll<HTMLElement>('main')].find((main) => !main.closest('[inert]')) ?? null;
}

/**
 * Focuses the page's <main> (focusable, not tabbable, so handed to Base UI as a target it would pick its first tabbable, the header's button). The one place
 * the Booth's voice hand-offs do it; false when the page has no <main>.
 */
export function focusPageMain(): boolean {
  const page = pageMain();
  // A landmark with no tab index (a page's own <main>) cannot take focus until it has one; -1 keeps it out of the Tab order.
  if (page && !page.hasAttribute('tabindex')) page.setAttribute('tabindex', '-1');
  page?.focus({ preventScroll: true });
  return !!page;
}

/**
 * For a popup that closes on a pick: hands focus to the page's <main> a tick after it has gone, unless the pick already put focus somewhere (a dialog it
 * opened). Returns what Base UI's `finalFocus` expects. `Dialog` keeps its own opener-first rule above this one.
 */
export function handFocusToPage(): boolean {
  if (!pageMain()) return true;
  window.setTimeout(() => {
    const active = document.activeElement;
    if (!active || active === document.body || !active.isConnected) focusPageMain();
  }, 0);
  return false;
}

const POPUPS = '[data-popover-popup], [role="menu"]';
// The popups a Booth key marks while they are leaving: those above, and a slide-over (the engine panel), which is not "another popup" for `anotherPopoverTakesFocus`
// (a popover opened inside the panel must not read the panel as one) and so stays out of `POPUPS`.
const MARKABLE = `${POPUPS}, [data-slide-over]`;
const LEAVING = '[data-ending-style], [data-closed]';

/**
 * Whether another popup (a popover or a menu) is taking focus as `own`, a popover that is leaving, unmounts: focus is inside one, or one is open and has not taken
 * focus yet (opened by a click a moment ago; its exit-free mount moves focus in a frame later). Giving focus back to `own`'s trigger then would take it from that
 * popup, which closes when focus leaves it. `opener` is where focus was when `own` opened: a popup around it is `own`'s parent, which is not "another". Focus in `own`
 * itself, on the page or in a dialog around it returns as before.
 */
export function anotherPopoverTakesFocus(own: Element | null, opener: Element | null): boolean {
  const active = document.activeElement;
  if (active && own?.contains(active)) return false;
  const holding = active?.closest(POPUPS);
  if (holding && holding !== own && !holding.closest(LEAVING)) return true;
  return Array.from(document.querySelectorAll(POPUPS)).some((popup) => popup !== own && !popup.closest(LEAVING) && !(opener && popup.contains(opener)));
}

// The popups a key has already handed focus to the page from while they were leaving. A popup that opens again while it is still leaving is the same element
// (Base UI keeps it: the mark would stay with it), so the Popover and the chapter list clear it when they open (`forgetPageTookFocus`); once the popup has unmounted
// the mark goes with the element.
const pageTookFocus = new WeakSet<Element>();

/**
 * A key that leaves Enter and Space to the page (a voice key, Ctrl+Alt+Space: `claimFocusForPage`) pressed while a popup is still leaving: its exit runs on the fast
 * motion token and Base UI gives focus back to the trigger only when the exit has ended, so the hand-back would land after the key and put focus on the control the key
 * just released (Record options, the chapter list: a footswitch Enter then opens it while the take the key started keeps running). A popover, a menu or a slide-over
 * (the engine panel) asks `pageTookFocusFrom` as it closes and gives the page its focus instead.
 */
export function pageTakesFocusFromLeavingPopups(): void {
  for (const popup of document.querySelectorAll(MARKABLE)) if (popup.closest(LEAVING)) pageTookFocus.add(popup);
}

/** Whether a key handed focus to the page while `popup` was leaving (see `pageTakesFocusFromLeavingPopups`). */
export function pageTookFocusFrom(popup: Element | null): boolean {
  return popup !== null && pageTookFocus.has(popup);
}

/** A popup that opens again while it is still leaving is the same element: the mark of its earlier exit must not outlive the exit it was set for. */
export function forgetPageTookFocus(popup: Element | null): void {
  if (popup) pageTookFocus.delete(popup);
}

/**
 * What the Booth's chapter list (`ChapterStepper`, the one Base UI menu a Booth key can find leaving) answers as its popup's `finalFocus` (a function switches off the library's own rule that focus is not taken from a control the narrator moved to
 * meanwhile, so that rule is kept here): after a key left focus to the page while it was leaving, the page's <main> (focus left on <body> would send the next Tab to
 * the skip link); with focus on a control outside the popup, none; else the library's own place, the trigger.
 */
export function menuFinalFocus(popup: Element | null): boolean {
  if (pageTookFocusFrom(popup)) return handFocusToPage();
  const active = document.activeElement;
  return !active || active === document.body || !!popup?.contains(active);
}
