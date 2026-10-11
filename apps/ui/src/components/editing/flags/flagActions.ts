import { useSyncExternalStore } from 'react';

/** What a card needs from a slice that is not built yet: deleting words and audio, stacking a doubled read, marking words for pickup. */
export interface FlagActions {
  /** Asks first, then cuts the words and their audio. */
  deleteWords: (keys: string[]) => void;
  /** Splits a doubled read of the paragraph into two takes. */
  stackAsTakes: (paragraphId: string) => void;
  /** Marks words for pickup; the word menu's item calls this same function, so there is one implementation. */
  markForPickup: (keys: string[]) => void;
}

let slots: Partial<FlagActions> = {};
const listeners = new Set<() => void>();

/** Fills a slot and returns the function that empties it. A second registration for the same slot replaces the first. */
export function registerFlagAction<K extends keyof FlagActions>(name: K, action: FlagActions[K]): () => void {
  slots = { ...slots, [name]: action };
  listeners.forEach((l) => l());
  return () => {
    if (slots[name] !== action) return;
    slots = Object.fromEntries(Object.entries(slots).filter(([k]) => k !== name));
    listeners.forEach((l) => l());
  };
}

const subscribe = (l: () => void): (() => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** The registered actions; a missing one makes its button disabled with “Not available yet”. */
export const useFlagActions = (): Partial<FlagActions> => useSyncExternalStore(subscribe, () => slots);
