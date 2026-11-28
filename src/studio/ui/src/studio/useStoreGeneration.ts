import { useSyncExternalStore } from 'react';
import type { StudioStore, SlotRegistry } from './store/createStudioStore';

const noSubscribe = () => () => undefined;

/**
 * How many times the store was reset (a project switch or an attach), as a value a hook can depend on: a hook that reads the store on mount asks again when the
 * generation changes, because the reset emptied what it read. 0 without a store.
 */
export function useStoreGeneration(store: Pick<StudioStore<SlotRegistry>, 'subscribe' | 'generation'> | null): number {
  return useSyncExternalStore(
    store ? store.subscribe : noSubscribe,
    () => store?.generation() ?? 0,
    () => 0,
  );
}
