import { useRef, type MouseEvent } from 'react';

/** The OS double-click interval: a second press this soon after a click on something else is the echo of that click. */
export const ECHO_WINDOW_MS = 500;

type Click = { at: number; target: EventTarget | null };
let current: Click | undefined;
let previous: Click | undefined;

// Every click, in the capture phase, before any handler runs: so while a handler runs, `current` is its own click and `previous` the one before.
if (typeof document !== 'undefined') {
  document.addEventListener(
    'click',
    (event) => {
      previous = current;
      current = { at: Date.now(), target: event.target };
    },
    true,
  );
}

/**
 * For a button that takes the place of the one just pressed (Download becomes Cancel, Export becomes Done). A double click lands its second
 * press on the new button and would undo or close what the first press started, so a press on such a button is ignored when the click
 * before it was on a control that has since left the page less than `ECHO_WINDOW_MS` ago (the old button, now gone), and this button appeared after that click. A press with no such click before it, however soon
 * after the button appeared, and a repeated press on the same button, go through. Returns true when the press is such an echo (and stops it);
 * `enabled` false never ignores.
 */
export function useEchoGuard(enabled: boolean | undefined): (event: MouseEvent) => boolean {
  // A button that was already on the page when the click before it happened did not take that button's place (another row's Download).
  const mountedAt = useRef(Date.now());
  return (event) => {
    if (!enabled || !previous || Date.now() - previous.at >= ECHO_WINDOW_MS || mountedAt.current < previous.at) return false;
    // Only a click on a control that has since left the page is an echo: the old button was replaced by this one.
    if (!(previous.target instanceof Node) || previous.target.isConnected) return false;
    // The ignored click is not the new "click before": a third press, and every repeat of a held key, meets the same echo and is ignored too.
    current = previous;
    event.preventDefault();
    return true;
  };
}

const guards = new Set<() => void>();
const PRESS_EVENTS = ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click', 'dblclick'] as const;

/**
 * For a press that closes the layer it was made on (a swatch in a popover). A double click lands its second press on whatever the layer
 * covered, which may delete a row or flip a switch, so for `ECHO_WINDOW_MS` every pointer press inside `spot` (the pressed control's box
 * as it was) reaches nothing. A press anywhere else goes through, and so does a key. A control that is not laid out (no area) guards nothing.
 */
export function absorbEchoAt(spot: DOMRect): void {
  if (spot.width <= 0 || spot.height <= 0) return;
  const swallow = (event: globalThis.MouseEvent) => {
    const inside = event.clientX >= spot.left && event.clientX <= spot.right && event.clientY >= spot.top && event.clientY <= spot.bottom;
    if (!inside) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  // On the window, in the capture phase: before the page, React and any library hear the press.
  for (const type of PRESS_EVENTS) window.addEventListener(type, swallow, true);
  const end = () => {
    clearTimeout(timer);
    guards.delete(end);
    for (const type of PRESS_EVENTS) window.removeEventListener(type, swallow, true);
  };
  const timer = setTimeout(end, ECHO_WINDOW_MS);
  guards.add(end);
}

/** Forgets the clicks seen so far and ends every guard: a test's last click is not the echo of the next test's first. */
export function forgetEchoClicks() {
  current = undefined;
  previous = undefined;
  for (const end of [...guards]) end();
}
