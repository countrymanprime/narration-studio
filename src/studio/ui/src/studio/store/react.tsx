// The React side of the store: `useStudio(selector)` over `useSyncExternalStore` (the mock's `useStudio`, with read
// models where its whole-book `data` was). A selector must return a slice of state or a value built by `createSelector`,
// never a fresh object or array on each call; in development a selector that does is reported.

import { createContext, useContext, useRef, useSyncExternalStore, type ReactNode } from 'react';
import type { SlotRegistry, StudioState, StudioStore } from './createStudioStore';

export type StudioHooks<R extends SlotRegistry> = {
  StudioProvider: (props: { store: StudioStore<R>; children: ReactNode }) => ReactNode;
  useStudio: <T>(selector: (state: StudioState<R>) => T) => T;
};

/** Makes the provider and hook for one slot registry, so a selector is typed over the slots that exist. */
export function bindStudio<R extends SlotRegistry>(): StudioHooks<R> {
  const Context = createContext<StudioStore<R> | null>(null);

  function StudioProvider({ store, children }: { store: StudioStore<R>; children: ReactNode }) {
    return <Context.Provider value={store}>{children}</Context.Provider>;
  }

  function useStudio<T>(selector: (state: StudioState<R>) => T): T {
    const store = useContext(Context);
    if (!store) throw new Error('useStudio needs a StudioProvider above it');
    // One answer per (selector, state): the snapshot React compares is the same value until the state changes.
    const cache = useRef<{ selector: typeof selector; state: StudioState<R>; value: T } | null>(null);
    const getSnapshot = (): T => {
      const state = store.getState();
      const hit = cache.current;
      if (hit && hit.selector === selector && hit.state === state) return hit.value;
      const value = selector(state);
      if (import.meta.env.DEV && !Object.is(value, selector(state))) {
        console.warn('useStudio: the selector returned a new value for the same state. Return a slice of state, or build the value with createSelector.');
      }
      cache.current = { selector, state, value };
      return value;
    };
    return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
  }

  return { StudioProvider, useStudio };
}
