import type { DraftBounds } from './draft';

/**
 * The range of an N as the chapter list stands now, for a dialog that stays open while the list is read again. The page `set`s it as it draws and
 * `notify`s from an effect (a store told while another component draws would warn), and the dialog reads it with `useSyncExternalStore`.
 */
export type LiveBounds = {
  get: () => DraftBounds;
  subscribe: (listener: () => void) => () => void;
  set: (next: DraftBounds) => void;
  notify: () => void;
};

export function createLiveBounds(start: DraftBounds): LiveBounds {
  let current = start;
  let told = start;
  const listeners = new Set<() => void>();
  return {
    get: () => current,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    // A new object only when a figure moved, so a reader's snapshot is stable between changes.
    set: (next) => {
      if (next.chapters !== current.chapters || next.minutes !== current.minutes) current = next;
    },
    notify: () => {
      if (told === current) return;
      told = current;
      listeners.forEach((listener) => listener());
    },
  };
}
