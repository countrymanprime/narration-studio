// The Pickups page, and Proof when a decision is saved, tell the rail that a count may have moved, so its badges follow what the page
// shows instead of the counts read when the page was opened. A window event: the rail and the page share no parent that could pass it down.
const CHANGED = 'narration:pickup-list-changed';

/** Called by the Pickups page after it shows a list the host answered, and by Proof after a decision is saved or taken back. */
export const announcePickupListChanged = (): void => {
  window.dispatchEvent(new Event(CHANGED));
};

/** Calls `listener` on each announcement; answers the way to stop. */
export function onPickupListChanged(listener: () => void): () => void {
  window.addEventListener(CHANGED, listener);
  return () => window.removeEventListener(CHANGED, listener);
}
