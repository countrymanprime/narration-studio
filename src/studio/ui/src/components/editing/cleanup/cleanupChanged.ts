/** The Clean up tab applied a change, so the findings it listed are stale: the drawer's tab count reads them again. */
const listeners = new Set<() => void>();

export function onCleanupChanged(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function notifyCleanupChanged(): void {
  for (const l of listeners) l();
}
