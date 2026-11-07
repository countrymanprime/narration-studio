/**
 * When a dialog last closed. A double click on a dialog's button closes it on the first click and lands the second on whatever was under it; a
 * slide-over behind the dialog reads that as a press on its backdrop and closes too. The slide-over asks `justClosedDialog` before it
 * lets an outside press close it.
 */
const GRACE_MS = 400;
let closedAt = 0;

export function markDialogClosed(): void {
  closedAt = Date.now();
}

export function justClosedDialog(): boolean {
  return Date.now() - closedAt < GRACE_MS;
}
