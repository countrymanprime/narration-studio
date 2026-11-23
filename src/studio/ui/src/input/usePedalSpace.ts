import { useEffect } from 'react';
import { isGuardedTarget, keyLayerOpen, modalLayerOpen, softLayerOpen, takesTypedText } from './targets';

/** How long after a Space that pressed a toast's button the next Space is taken as the same tap. */
const AFTER_TOAST_PRESS_MS = 600;

/**
 * A pedal's Space must always toggle the take. Two places would otherwise keep it:
 * - A focused button takes Space for itself (the router leaves it that key; closing a popover returns focus to the button that opened it):
 *   with a button focused, no popup open and that button not Record or Stop, Space is the take's, and the button is not pressed by it.
 * - A menu or popover left open (a right click, Text settings, Levels, a chapter list) keeps the keyboard from the page behind it, and its
 *   own controls take Space (a menu item, a select, a slider). The pedal wins there too: Space closes the popup, as Escape would, and
 *   toggles the take. Only a field that takes typed text keeps its Space, and a dialog or alert dialog (a question to answer) keeps every key.
 */
export function usePedalSpace(toggle: () => unknown, takeRunning: () => boolean = () => false): void {
  useEffect(() => {
    let swallowUp = false;
    // When the last Space pressed a toast's button. A second Space within a moment is the same pedal tap landing where focus went (the page, a button the toast gave focus back to),
    // not a request to start a take over the audio already there (#4094).
    let lastToastPress = -Infinity;
    const plain = (event: KeyboardEvent) => event.code === 'Space' && !event.ctrlKey && !event.altKey && !event.metaKey;
    const mine = (event: KeyboardEvent) => {
      // A control of a popup that is already leaving keeps no Space: its field is going, and the pedal's Space is the take's (#3976). The router ignores a closing popup
      // too and runs the take for a target that is not a control, so the pedal takes only the Space the router would leave to the control, or the take would toggle twice.
      const leaving = event.target instanceof Element && event.target.closest('[data-ending-style]') !== null;
      if (!plain(event) || (takesTypedText(event.target) && !leaving) || modalLayerOpen()) return false;
      if (leaving) return isGuardedTarget(event.target);
      if (event.target instanceof Element && event.target.closest('[role="radio"], input[type="radio"]')) return false;
      // A toast's Retry, Undo and Dismiss are answers to a message, not controls the take may borrow Space from: Space presses the focused button (#4094). While a take runs
      // the pedal still stops it: a stop that never happens leaves the microphone recording, a dismiss that never happens costs nothing.
      if (!takeRunning() && event.target instanceof Element && event.target.closest('[data-toast-region] button')) {
        lastToastPress = event.timeStamp;
        return false;
      }
      if (softLayerOpen()) return true;
      const target = event.target;
      return target instanceof HTMLButtonElement && !/^(Record|Stop)$/.test(target.textContent?.trim() ?? '') && !keyLayerOpen();
    };
    const down = (event: KeyboardEvent) => {
      if (
        plain(event) &&
        !event.repeat &&
        !takeRunning() &&
        event.timeStamp - lastToastPress < AFTER_TOAST_PRESS_MS &&
        !takesTypedText(event.target) &&
        !modalLayerOpen()
      ) {
        // The router would run the take for a Space on the page itself, so the key goes no further.
        event.preventDefault();
        event.stopPropagation();
        swallowUp = true;
        return;
      }
      if (!mine(event)) return;
      event.preventDefault();
      swallowUp = true;
      if (event.repeat) return;
      // Capture phase, so a popup's own item or control never sees the press. Escape closes what Escape closes.
      if (softLayerOpen()) {
        const from = document.activeElement ?? document.body;
        from.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));
      }
      void toggle();
    };
    const up = (event: KeyboardEvent) => {
      if (!swallowUp || event.code !== 'Space') return;
      swallowUp = false;
      event.preventDefault();
    };
    document.addEventListener('keydown', down, true);
    document.addEventListener('keyup', up, true);
    return () => {
      document.removeEventListener('keydown', down, true);
      document.removeEventListener('keyup', up, true);
    };
  }, [toggle, takeRunning]);
}
