import { useSyncExternalStore } from 'react';
import { loadTextPrefs, saveTextPrefs, type TextPrefs } from '../../script/page/tools/text/readerText';

// The four Reader text rows edit one set of choices, so a change in one row shows in the preview under another: one copy for the page,
// read from storage again whenever a row mounts with none mounted, saved on each change (the Script's `useTextPrefs` keeps the same key).
let current: TextPrefs | undefined;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  if (listeners.size === 0) current = loadTextPrefs();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const snapshot = (): TextPrefs => (current ??= loadTextPrefs());

/** The reader's text choices, shared by the Reader text rows. */
export const useReaderText = (): TextPrefs => useSyncExternalStore(subscribe, snapshot);

/** Changes some of the choices, saves them and redraws every Reader text row. */
export function changeReaderText(change: Partial<TextPrefs>): void {
  current = { ...snapshot(), ...change };
  saveTextPrefs(current);
  for (const listener of listeners) listener();
}
