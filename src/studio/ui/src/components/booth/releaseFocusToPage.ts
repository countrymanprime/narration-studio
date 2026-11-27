import { SPACE_ACTIVATES } from '../../input/targets';
import { focusPageMain, pageTakesFocusFromLeavingPopups } from '../primitives/focusReturn';

/**
 * A Booth key whose next key is Record's (a voice key, Ctrl+Alt+Space) leaves Enter and Space to the page: a control left focused that a press activates
 * (the voice button after a pick or a Tab, Record options, a chapter arrow, the skip link) would be pressed, opened or followed instead of starting or
 * stopping the take, so focus moves from it to the page's <main> (focusable, not tabbable). A field keeps its focus. A popover still leaving (Escape on Record options
 * a moment ago) would give focus back to its trigger once its exit ends, after this key: it is told the page has focus, and gives none.
 */
export function releaseFocusToPage(): void {
  pageTakesFocusFromLeavingPopups();
  const focused = document.activeElement;
  if (focused instanceof Element && focused !== document.body && focused.matches(SPACE_ACTIVATES)) focusPageMain();
}
