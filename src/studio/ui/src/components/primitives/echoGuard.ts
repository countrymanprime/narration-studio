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

/** A control under an open modal: the page behind it is inert, or hidden from assistive technology. */
const coveredByModal = (node: Node): boolean => (node instanceof Element ? node : node.parentElement)?.closest('[inert], [aria-hidden="true"]') != null;

/**
 * For a button that takes the place of the one just pressed (Download becomes Cancel, Export becomes Done). A double click lands its second
 * press on the new button and would undo or close what the first press started, so a press on such a button is ignored when the click
 * before it was on a control that has since left the page less than `ECHO_WINDOW_MS` ago (the old button, now gone), and this button appeared after that click. A press with no such click before it, however soon
 * after the button appeared, and a repeated press on the same button, go through. Returns true when the press is such an echo (and stops it);
 * `enabled` false never ignores.
 */
export function useEchoGuard(enabled: boolean | 'covered' | undefined): (event: MouseEvent) => boolean {
  // A button that was already on the page when the click before it happened did not take that button's place (another row's Download).
  const mountedAt = useRef(Date.now());
  return (event) => {
    if (!enabled || !previous || Date.now() - previous.at >= ECHO_WINDOW_MS || mountedAt.current < previous.at) return false;
    // 'covered' is for a dialog's way on, and only for the second click of a real double click (the browser's click count, `detail`) on the control that
    // raised the dialog, which the dialog now covers (the page behind a modal is inert or hidden from assistive technology). It never holds a narrator who moves to
    // the button and presses it, or one who answers a question and meets the next.
    if (enabled === 'covered') {
      if (!(previous.target instanceof Node) || !previous.target.isConnected || !coveredByModal(previous.target) || event.detail < 2) return false;
    } else if (!(previous.target instanceof Node) || previous.target.isConnected) {
      // Only a click on a control that has since left the page is an echo: the old button was replaced by this one.
      return false;
    }
    // The ignored click is not the new "click before": a third press, and every repeat of a held key, meets the same echo and is ignored too.
    current = previous;
    event.preventDefault();
    return true;
  };
}

/** Forgets the clicks seen so far: a test's last click is not the echo of the next test's first. */
export function forgetEchoClicks() {
  current = undefined;
  previous = undefined;
}
