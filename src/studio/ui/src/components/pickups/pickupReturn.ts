/**
 * Where the narrator left Pickups for the Booth, kept for the way back: the browser's Back button returns to the same history
 * entry, and that entry is the only one that gets the page put back as it was, so a later visit through the sidebar starts clean.
 * A single line is kept as the line (selected and focused again), a whole session as the button that opened it; both keep the chapter
 * the stepper was on.
 */
export type PickupLeft = { scope: string } & ({ kind: 'line'; id: string } | { kind: 'session' });

let left: (PickupLeft & { entry: number }) | null = null;

/** The router writes the position in the session's history into `history.state` on every push, replace and pop. */
const entry = (): number => (window.history.state as { idx?: number } | null)?.idx ?? 0;

/** Called as a single line is opened in the Booth from this page, with the chapter the stepper was on. */
export function rememberPickupLeft(id: string, scope: string): void {
  left = { entry: entry(), kind: 'line', id, scope };
}

/** Called as the whole pickup session is opened in the Booth from this page. */
export function rememberSessionLeft(scope: string): void {
  left = { entry: entry(), kind: 'session', scope };
}

/** What the narrator left, when this visit is the return to the entry they left from. */
export function pickupToReturnTo(): PickupLeft | null {
  return left !== null && left.entry === entry() ? left : null;
}
