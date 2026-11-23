import { useEffect, useRef, type RefObject } from 'react';

/** The CSS variable holding how far the bars along the bottom reach up from the window's edge: what a fixed element (the background check's chip, a popover's room) keeps clear of. Toasts do not read it: the shell ends the page above them (`--toast-h`, #4063). */
export const TOAST_CLEAR_VAR = '--toast-clear';

/**
 * The bars along the bottom of the page right now (the Booth's footer, and its setup notice above it), whose heights add up. A bar that
 * `follows` the window (it sits in a column that scrolls, as Editing's playback bar and waveform dock do) is cleared by where its top edge
 * stands now, not by its height: part of it may lie below the column's edge, and its top moves as the column scrolls.
 */
const bars = new Map<HTMLElement, boolean>();

/** Fired on the window when the toasts' strip changes (`--toast-h`, published by `ToastRegion`): the bars moved with the page, so the clearance is read again. */
export const TOAST_ROOM_EVENT = 'toast-room';

/** The strip the shell keeps under the page for a message (`--toast-slot`, or `--toast-h` for a stack): it lifts every bar by that much, so what is fixed over the window's edge clears it too. A dialog leaves the slot, where the page keeps its size. */
function strip(): number {
  const root = document.documentElement;
  const slot = Number.parseFloat(root.style.getPropertyValue('--toast-slot')) || 0;
  if (root.hasAttribute('data-modal-open')) return slot;
  return Math.max(slot, Number.parseFloat(root.style.getPropertyValue('--toast-h')) || 0);
}

if (typeof window !== 'undefined') window.addEventListener(TOAST_ROOM_EVENT, () => apply());

function apply(): void {
  const root = document.documentElement;
  const room = strip();
  if (bars.size === 0) {
    if (room > 0) root.style.setProperty(TOAST_CLEAR_VAR, `${Math.ceil(room)}px`);
    else root.style.removeProperty(TOAST_CLEAR_VAR);
    return;
  }
  let total = room;
  let top = Number.POSITIVE_INFINITY;
  bars.forEach((follows, bar) => {
    const rect = bar.getBoundingClientRect();
    if (!follows) {
      total += rect.height + (Number.parseFloat(getComputedStyle(bar).marginBottom) || 0);
      return;
    }
    if (rect.height > 0 && Number.isFinite(rect.top)) top = Math.min(top, rect.top);
  });
  // Everything from the highest following bar's top edge down to the window's bottom (the other bars, and the gap the page keeps between them) is cleared.
  const fromTop = top < window.innerHeight ? window.innerHeight - top : 0;
  root.style.setProperty(TOAST_CLEAR_VAR, `${Math.ceil(Math.max(total, fromTop))}px`);
}

/**
 * Registers a bar along the bottom of the page (the Booth's footer, and the setup notice above it) in `--toast-clear`: while `bar` is
 * mounted, the root holds the bar's height and its bottom margin, for what is drawn over the window's bottom edge (a corner chip, a popover's room). Bars add up,
 * so a corner chip clears both. Follows each bar as it grows or shrinks, and drops it
 * when the last one unmounts. `active` false leaves the bar out (a bar that only needs clearing in one layout). `follows` is for a
 * bar inside a column that scrolls: the clearance is the distance from its top edge to the window's bottom, read again on every scroll.
 */
export function useToastClearance(bar: RefObject<HTMLElement | null>, active = true, follows = false): void {
  useEffect(() => {
    const element = bar.current;
    if (!element || !active) return;
    bars.set(element, follows);
    apply();
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(apply);
    observer?.observe(element);
    window.addEventListener('resize', apply);
    // Scroll does not bubble: capture it, so a column's scrolling is heard. Only a following bar needs it, and the first layout to settle.
    if (follows) window.addEventListener('scroll', apply, true);
    const settled = follows ? requestAnimationFrame(apply) : 0;
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', apply);
      if (follows) window.removeEventListener('scroll', apply, true);
      cancelAnimationFrame(settled);
      bars.delete(element);
      apply();
    };
  }, [bar, active, follows]);
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
