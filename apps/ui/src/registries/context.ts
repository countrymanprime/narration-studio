import { useEffect } from 'react';
import type { ContextMenuItem } from '../components/primitives/ContextMenu';

/**
 * What a page offers when the user opens the context menu on something it owns (ADR 0780 decision 5). `match` says whether
 * the target is the page's; `items` is called only after `match` answered true, at the moment the menu opens, so it may
 * close over live state.
 */
export type ContextProvider = {
  match: (target: Element) => boolean;
  items: (target: Element) => ContextMenuItem[];
  /** `false` for a picker that is not a page menu (the Add FX list): the shell's tail of search items is not appended to it. */
  tail?: boolean;
};

const providers = new Set<ContextProvider>();

/** Registers a provider and returns the function that removes it. Providers are asked in registration order. */
export function registerContextProvider(provider: ContextProvider): () => void {
  // A wrapper keeps two registrations of one object distinct, so each unregister removes only its own.
  const entry: ContextProvider = { match: (target) => provider.match(target), items: (target) => provider.items(target), tail: provider.tail };
  providers.add(entry);
  return () => {
    providers.delete(entry);
  };
}

/** The items of the first provider that matches `target`, or `null` when none does. Only that provider's `items` runs. */
export function contextItemsFor(target: Element): ContextMenuItem[] | null {
  for (const provider of providers) {
    if (provider.match(target)) return provider.items(target);
  }
  return null;
}

/** Whether the menu for `target` ends with the shell's tail: true unless the provider that answers it opts out with `tail: false`. */
export function contextTailFor(target: Element): boolean {
  for (const provider of providers) {
    if (provider.match(target)) return provider.tail !== false;
  }
  return true;
}

/** Registers `provider` while the component is mounted; a new object replaces the old one. */
export function useContextProvider(provider: ContextProvider): void {
  useEffect(() => registerContextProvider(provider), [provider]);
}
