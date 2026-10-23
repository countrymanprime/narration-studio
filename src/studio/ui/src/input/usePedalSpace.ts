import { useEffect } from 'react';
import { keyLayerOpen, modalLayerOpen, softLayerOpen, takesTypedText } from './targets';

/**
 * A pedal's Space must always toggle the take. Two places would otherwise keep it:
 * - A focused button takes Space for itself (the router leaves it that key; closing a popover returns focus to the button that opened it):
 *   with a button focused, no popup open and that button not Record or Stop, Space is the take's, and the button is not pressed by it.
 * - A menu or popover left open (a right click, Text settings, Levels, a chapter list) keeps the keyboard from the page behind it, and its
 *   own controls take Space (a menu item, a select, a slider). The pedal wins there too: Space closes the popup, as Escape would, and
 *   toggles the take. Only a field that takes typed text keeps its Space, and a dialog or alert dialog (a question to answer) keeps every key.
 */
export function usePedalSpace(toggle: () => unknown): void {
  useEffect(() => {
    let swallowUp = false;
    const plain = (event: KeyboardEvent) => event.code === 'Space' && !event.ctrlKey && !event.altKey && !event.metaKey;
    const mine = (event: KeyboardEvent) => {
      if (!plain(event) || takesTypedText(event.target) || modalLayerOpen()) return false;
      if (softLayerOpen()) return true;
      const target = event.target;
      return target instanceof HTMLButtonElement && !/^(Record|Stop)$/.test(target.textContent?.trim() ?? '') && !keyLayerOpen();
    };
    const down = (event: KeyboardEvent) => {
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
  }, [toggle]);
}
