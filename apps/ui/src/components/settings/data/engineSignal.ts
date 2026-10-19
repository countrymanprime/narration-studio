// The project's recorder was chosen in Settings. The "Record with" control keeps its own state, and rows that depend on it (Voice sample output)
// read the project's engine themselves, so this says when to read it again.
const listeners = new Set<() => void>();

/** Called after the narrator chose a recorder and the host accepted it. */
export function engineChanged(): void {
  for (const listener of [...listeners]) listener();
}

/** Calls `listener` whenever the engine changed; returns the way to stop. */
export function onEngineChanged(listener: () => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}
