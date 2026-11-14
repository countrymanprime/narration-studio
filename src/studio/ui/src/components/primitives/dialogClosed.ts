/**
 * When a dialog last closed. A double click on a dialog's button closes it on the first click and lands the second on whatever was under it; a
 * slide-over behind the dialog reads that as a press on its backdrop and closes too. The slide-over asks `justClosedDialog` before it
 * lets an outside press close it.
 */
const GRACE_MS = 400;
let closedAt = 0;
let targetAt = 0;
let closedTarget: (() => HTMLElement | null) | null = null;

export function markDialogClosed(): void {
  closedAt = Date.now();
}

/**
 * Where the dialog or slide-over that has just closed hands focus back to (its opener, else the place its opener named), read later, when the thing
 * opened in its stead closes. A panel opened by a control inside it ("Open the audio engine panel" in a check result or a readiness card) has that
 * control, which goes with the overlay, for its opener, and would hand focus to the page's first control; this is the place the narrator was working.
 * It does not count as a dialog closing for `justClosedDialog`: a slide-over closing does not make the second press of a double click an echo.
 */
export function rememberClosedTarget(target: () => HTMLElement | null): void {
  targetAt = Date.now();
  closedTarget = target;
}

/** The last overlay's hand-back target, while it is a moment old; null when none closed just now. */
export function recentDialogTarget(): (() => HTMLElement | null) | null {
  return Date.now() - targetAt < GRACE_MS ? closedTarget : null;
}

export function justClosedDialog(): boolean {
  return Date.now() - closedAt < GRACE_MS;
}
