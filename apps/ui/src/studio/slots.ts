// The slot registry of the read-model store (ADR 0770) and the hooks typed over it. The chapter list is the first slot; the
// bookmarks slot joins it in SN-S72. A slot reads through a port, so this file names no `useApi()`.

import type { ManuscriptApi } from '../api/contracts/manuscript';
import type { SystemApi } from '../api/contracts/system';
import { chaptersSchema } from '../api/schemas/manuscript';
import { bindStudio } from './store/react';

export type HostEventApi = Pick<SystemApi, 'subscribeJobEnded'>;

/** The chapter list: stale when a job ends (an import, a re-split) and reloaded when the window regains focus. */
export function createSlots(api: Pick<ManuscriptApi, 'manuscriptChapters'>) {
  return {
    chapters: { schema: chaptersSchema, load: () => api.manuscriptChapters(), events: ['job:ended'], refreshOnFocus: true },
  };
}

export type StudioRegistry = ReturnType<typeof createSlots>;

/** The store's `subscribe(event, handler)` over the host's typed subscriptions. An event the host has no subscription for gets a no-op. */
export function createHostEvents(api: HostEventApi): (event: string, handler: () => void) => () => void {
  const warned = new Set<string>();
  return (event, handler) => {
    if (event === 'job:ended') return api.subscribeJobEnded(() => handler());
    if (import.meta.env.DEV && !warned.has(event)) {
      warned.add(event);
      console.warn(`studio: no host subscription for the event "${event}"`);
    }
    return () => undefined;
  };
}

export const { StudioProvider: StudioStoreProvider, useStudio } = bindStudio<StudioRegistry>();
