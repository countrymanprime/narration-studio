/**
 * When a dialog last closed. A double click on a dialog's button closes it on the first click and lands the second on whatever was under it; a
 * slide-over behind the dialog reads that as a press on its backdrop and closes too. The slide-over asks `justClosedDialog` before it
 * lets an outside press close it.
 */
const GRACE_MS = 400;
let closedAt = 0;
let closedTarget: (() => HTMLElement | null) | null = null;

/** `target`: where the dialog hands focus back to (its opener, else the place its opener named), read later, when the thing opened in its stead closes. */
export function markDialogClosed(target?: () => HTMLElement | null): void {
  closedAt = Date.now();
  closedTarget = target ?? null;
}

/**
 * Where the dialog that has just closed was handing focus back to. A panel opened by a control inside that dialog ("Open the audio engine panel" in a
 * check result) has that control, which goes with the dialog, for its opener, and would hand focus to the page's first control when it closes; this is the
 * place the narrator was working. Null when no dialog closed a moment ago.
 */
export function recentDialogTarget(): (() => HTMLElement | null) | null {
  return Date.now() - closedAt < GRACE_MS ? closedTarget : null;
}

export function justClosedDialog(): boolean {
  return Date.now() - closedAt < GRACE_MS;
}
