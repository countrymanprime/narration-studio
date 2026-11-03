// The Booth's own text size, 24 to 72 px in steps of 4, 40 until the narrator chooses. Kept by this browser window as the Script's text choices
// are; storage can be missing, full or blocked, so every access is guarded and the Booth reads the default when it fails. The Booth's Text
// settings and Settings › Look write it through here, so Settings' Changed mark follows either.

import { announceBrowserSettingChange } from '../../../browserSettings';
import { textSizePx } from '../reading/BoothText';

export const BOOTH_SIZE_STORAGE_KEY = 'narration.booth.textSize';
export const DEFAULT_BOOTH_SIZE = 40;

/** The saved Booth size; anything but one of the sizes takes the default. */
export function readBoothSize(): number {
  try {
    const stored = Number(window.localStorage.getItem(BOOTH_SIZE_STORAGE_KEY));
    return stored === textSizePx(stored) ? stored : DEFAULT_BOOTH_SIZE;
  } catch {
    return DEFAULT_BOOTH_SIZE;
  }
}

/** Saves a size, snapped to the steps (a slider's Page Up and Page Down step by more than one), and says so to the windows that show it. */
export function writeBoothSize(size: number): void {
  try {
    window.localStorage.setItem(BOOTH_SIZE_STORAGE_KEY, String(textSizePx(size)));
    announceBrowserSettingChange();
  } catch {
    /* storage unavailable: the choice is not kept, and the Booth reads the default when it next opens */
  }
}
