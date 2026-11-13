import { SPACE_ACTIVATES } from '../../input/targets';
import { focusPageMain } from '../primitives/focusReturn';

/**
 * A Booth key whose next key is Record's (a voice key, Alt+Space) leaves Enter and Space to the page: a control left focused that a press activates
 * (the voice button after a pick or a Tab, Record options, a chapter arrow, the skip link) would be pressed, opened or followed instead of starting or
 * stopping the take, so focus moves from it to the page's <main> (focusable, not tabbable). A field keeps its focus.
 */
export function releaseFocusToPage(): void {
  const focused = document.activeElement;
  if (focused instanceof Element && focused !== document.body && focused.matches(SPACE_ACTIVATES)) focusPageMain();
}
