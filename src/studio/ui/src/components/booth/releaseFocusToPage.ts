import { SPACE_ACTIVATES } from '../../input/targets';
import { focusPageMain, pageTakesFocusFromClosingPopup, pageTakesFocusFromLeavingPopups } from '../primitives/focusReturn';

/**
 * A Booth key whose next key is Record's (a voice key, Ctrl+Alt+Space) leaves Enter and Space to the page: a control left focused that a press activates
 * (the voice button after a pick or a Tab, Record options, a chapter arrow, the skip link) would be pressed, opened or followed instead of starting or
 * stopping the take, so focus moves from it to the page's <main> (focusable, not tabbable). A field keeps its focus.
 */
export function releaseFocusToPage(): void {
  const focused = document.activeElement;
  if (focused instanceof Element && focused !== document.body && focused.matches(SPACE_ACTIVATES)) focusPageMain();
}

/**
 * `releaseFocusToPage` for a key that goes on to act (starts a take or a cold read, picks a voice), not one the Booth refuses with a notice: a popover, menu or slide-over
 * still leaving (Escape on Record options, the chapter list or the engine panel a moment ago) would give focus back to its trigger once its exit ends, after this key, and the Enter that
 * stops the take would open that control with the take still recording. They are told the page has focus, and hand it to <main> instead (`pageTookFocusFrom`).
 * `closing`: the key came with an Escape sent in the same tick to close the popup that has focus (the pedal's Space with a popup open), which is not leaving yet: that one is
 * marked too, before focus moves off it.
 */
export function claimFocusForPage(closing = false): void {
  if (closing) pageTakesFocusFromClosingPopup();
  releaseFocusToPage();
  pageTakesFocusFromLeavingPopups();
}
