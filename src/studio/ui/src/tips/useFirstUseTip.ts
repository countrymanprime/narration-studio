import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { overlay } from '../overlay/overlayService';
import { usePort } from '../ports/usePort';
import { createTipsStore, type TipsStore } from './tipsStore';
import type { TipId } from './tips.catalog';

const stores = new WeakMap<object, TipsStore>();

function useTipsStore(): TipsStore {
  const system = usePort('system');
  let store = stores.get(system);
  if (!store) {
    store = createTipsStore(system);
    stores.set(system, store);
  }
  return store;
}

/** Whether a tip should show now, and how to dismiss it. `visible` is false until the host has said what was dismissed. */
export function useFirstUseTip(id: TipId): { visible: boolean; dismiss: () => void } {
  const store = useTipsStore();
  const seen = useSyncExternalStore(store.subscribe, store.snapshot);
  useEffect(() => {
    void store.load();
  }, [store]);
  const dismiss = useCallback(() => {
    void store.dismiss(id).then((problem) => {
      if (problem) overlay.toast(`The tip could not be saved as read: ${problem}`, { tone: 'error' });
    });
  }, [store, id]);
  return { visible: seen !== null && !seen.has(id), dismiss };
}

/** The dismissed tips (`null` until the host has said), read live, with a way to show them all again. The Settings row and its Changed mark use it. */
export function useTips(): { seen: ReadonlySet<string> | null; reset: () => Promise<string | null> } {
  const store = useTipsStore();
  const seen = useSyncExternalStore(store.subscribe, store.snapshot);
  useEffect(() => {
    void store.load();
  }, [store]);
  return { seen, reset: store.reset };
}
