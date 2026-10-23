/**
 * The pickup line the narrator opened in the Booth, kept for the way back: the browser's Back button returns to the same history
 * entry, and that entry is the only one that gets the line selected again, so a later visit through the sidebar starts clean.
 */
let left: { entry: number; id: string } | null = null;

/** The router writes the position in the session's history into `history.state` on every push, replace and pop. */
const entry = (): number => (window.history.state as { idx?: number } | null)?.idx ?? 0;

/** Called as a single line is opened in the Booth from this page. */
export function rememberPickupLeft(id: string): void {
  left = { entry: entry(), id };
}

/** The line to select and focus now, when this visit is the return to the entry the narrator left from. */
export function pickupToReturnTo(): string | null {
  return left !== null && left.entry === entry() ? left.id : null;
}
