import { useEffect } from 'react';
import { keyLayerOpen } from './targets';

/**
 * A pedal's Space must always toggle the take. Closing a popover or a question returns focus to the button that opened it, and a focused
 * button takes Space for itself (the router leaves it that key): so with a button focused, no popup open and that button not Record or Stop,
 * Space is the take's, and the button is not pressed by it.
 */
export function usePedalSpace(toggle: () => unknown): void {
  useEffect(() => {
    let swallowUp = false;
    const mine = (event: KeyboardEvent) => {
      const target = event.target;
      return (
        event.code === 'Space' &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.metaKey &&
        target instanceof HTMLButtonElement &&
        !/^(Record|Stop)$/.test(target.textContent?.trim() ?? '') &&
        !keyLayerOpen()
      );
    };
    const down = (event: KeyboardEvent) => {
      if (!mine(event)) return;
      event.preventDefault();
      swallowUp = true;
      if (!event.repeat) void toggle();
    };
    const up = (event: KeyboardEvent) => {
      if (!swallowUp || event.code !== 'Space') return;
      swallowUp = false;
      event.preventDefault();
    };
    document.addEventListener('keydown', down);
    document.addEventListener('keyup', up);
    return () => {
      document.removeEventListener('keydown', down);
      document.removeEventListener('keyup', up);
    };
  }, [toggle]);
}
