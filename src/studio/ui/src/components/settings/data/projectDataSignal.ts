// A setting kept in the project or the narrator's library (the Story Bible types, the mark types, the credits) was saved in Settings.
// Their rows have no host field, so the Changed filter reads their probes again when this says so.
const listeners = new Set<() => void>();

/** Called after the host accepted a save of the Story Bible types, the mark types or the credits. */
export function projectDataChanged(): void {
  for (const listener of [...listeners]) listener();
}

/** Calls `listener` whenever such a save happened; returns the way to stop. */
export function onProjectDataChanged(listener: () => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}
