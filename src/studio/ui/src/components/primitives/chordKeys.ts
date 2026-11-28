import type { BaseUIEvent } from '@base-ui/react/types';
import type { KeyboardEvent } from 'react';

// Base UI presses a composite item (a menu item, a toolbar button) on the keydown of Space or Enter, whatever else is held, and hands the click the held
// Ctrl, Alt and Meta. A chord with one of those held is the page's, not the item's: the Booth's Ctrl+Alt+Space (switch between Record and Cold read)
// pressed with the chapter list open picked the highlighted chapter and, with the list closed by that press, switched the mode as if nothing had been
// open ("Stop recording?" asked with a take running); with focus on a button of the engine panel it opened that button's dialog (#4195).
// Give this to an item's `onKeyDown`: the item is left out of the press (`preventBaseUIHandler`), the key still reaches the page's router, which decides what
// the chord does with a popup open. Space's own default (the page scrolling) is stopped as the library stops it for a press.
export function ignoreChordPress(event: BaseUIEvent<KeyboardEvent<HTMLElement>>): void {
  if (!event.ctrlKey && !event.altKey && !event.metaKey) return;
  if (event.key !== ' ' && event.key !== 'Enter') return;
  event.preventBaseUIHandler();
  event.preventDefault();
}
