import { useSyncExternalStore } from 'react';

// Settings that this browser window keeps (start tone, theme, motion, the waveform arrow step, reader text) are written straight to storage by
// their own owners, with nothing to tell the Settings page. Each writer calls `announceBrowserSettingChange`, and the page reads
// `useBrowserSettingsVersion` so its Changed marks and counts are redrawn.
let version = 0;
const listeners = new Set<() => void>();

export function announceBrowserSettingChange(): void {
  version += 1;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** A number that changes whenever a window-kept setting is written. Read it to redraw on a change. */
export const useBrowserSettingsVersion = (): number => useSyncExternalStore(subscribe, () => version);
