import { useEffect, useState, useSyncExternalStore } from 'react';
import type { ManuscriptChapter } from '../types';
import { usePort } from '../ports/usePort';
import { useOptionalStoreHandle } from './StudioProvider';

const noSubscribe = () => () => undefined;

/**
 * The chapter list every page reads, from the store's `chapters` slot (#3658): loaded once, shared by whoever mounts, and read again when what it holds
 * changes (a job ends, a chapter's status or kind, a track link, a layout, a DAW, a sync, a record end, or the window gaining focus). Mounting a page
 * does not read it again. `undefined` until the first read answers; a failed read keeps the last list and sets `error`.
 *
 * A caller that asks for the list again (a dialog's Check again) bumps `refreshKey`: the slot is read now, not served.
 *
 * Without a <StudioProvider> (a component rendered alone in a test) it reads the port itself, once per mount, as every reader did before the slot.
 */
export function useChapters(enabled = true, refreshKey = 0): { chapters: readonly ManuscriptChapter[] | undefined; error: Error | undefined } {
  const store = useOptionalStoreHandle();
  const manuscript = usePort('manuscript');
  const held = useSyncExternalStore(
    store ? store.subscribe : noSubscribe,
    () => store?.getState().slots.chapters,
    () => undefined,
  );
  const error = useSyncExternalStore(
    store ? store.subscribe : noSubscribe,
    () => store?.getState().errors.chapters,
    () => undefined,
  );
  const [own, setOwn] = useState<readonly ManuscriptChapter[]>();
  // Ask when the list is not held and no read of it has failed: first mount, a project switch that emptied the slot. A read the switch dropped is read
  // again by `ensure` itself. A failure is not asked again by this hook (an event or the caller's `refreshKey` does), so a host that is down is not read in a loop.
  // A reader that mounts on a list whose read failed asks once more.
  useEffect(() => {
    if (store && enabled && store.getState().errors.chapters !== undefined && store.getState().slots.chapters === undefined)
      void store.load('chapters').catch(() => undefined);
  }, [store, enabled]);
  useEffect(() => {
    if (!store || !enabled || held !== undefined || error !== undefined) return;
    void store.ensure('chapters').catch(() => undefined);
  }, [store, enabled, held, error]);
  useEffect(() => {
    if (store && enabled && refreshKey > 0) void store.load('chapters').catch(() => undefined);
  }, [store, enabled, refreshKey]);
  useEffect(() => {
    if (store || !enabled) return;
    let live = true;
    manuscript
      .manuscriptChapters()
      .then((chapters) => live && setOwn(chapters))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [store, manuscript, enabled, refreshKey]);
  return { chapters: store ? held : own, error };
}
