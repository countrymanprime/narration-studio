// The Pickups page tells the rail when its list changed, so the badge on the rail follows what the page shows instead of the
// count read when the page was opened. A window event: the rail and the page share no parent that could pass it down.
const CHANGED = 'narration:pickup-list-changed';

/** Called by the page after it shows a list the host answered. */
export const announcePickupListChanged = (): void => {
  window.dispatchEvent(new Event(CHANGED));
};

/** Calls `listener` on each announcement; answers the way to stop. */
export function onPickupListChanged(listener: () => void): () => void {
  window.addEventListener(CHANGED, listener);
  return () => window.removeEventListener(CHANGED, listener);
}
