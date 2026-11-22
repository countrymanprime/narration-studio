import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
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
  const [ownError, setOwnError] = useState<Error>();
  // Ask when the list is not held and no read of it has failed: first mount, a project switch that emptied the slot. A read the switch dropped is read
  // again by `ensure` itself. A failure is not asked again by this hook (an event or the caller's `refreshKey` does), so a host that is down is not read in a loop.
  // A reader that mounts on a list whose read failed asks once more.
  useEffect(() => {
    if (store && enabled && store.getState().errors.chapters !== undefined && store.getState().slots.chapters === undefined)
      void store.load('chapters').catch(() => undefined);
  }, [store, enabled]);
  // A reset while a read is out changes neither `held` nor `error`: the generation is what asks again for the new project after `ensure` gave up its three reads.
  const generation = useSyncExternalStore(
    store ? store.subscribe : noSubscribe,
    () => store?.generation() ?? 0,
    () => 0,
  );
  useEffect(() => {
    if (!store || !enabled || held !== undefined || error !== undefined) return;
    void store.ensure('chapters').catch(() => undefined);
  }, [store, enabled, held, error, generation]);
  useEffect(() => {
    if (store && enabled && refreshKey > 0) void store.load('chapters').catch(() => undefined);
  }, [store, enabled, refreshKey]);
  useEffect(() => {
    if (store || !enabled) return;
    let live = true;
    manuscript
      .manuscriptChapters()
      .then((chapters) => live && (setOwn(chapters), setOwnError(undefined)))
      .catch((e: unknown) => live && setOwnError(e instanceof Error ? e : new Error(String(e))));
    return () => {
      live = false;
    };
  }, [store, manuscript, enabled, refreshKey]);
  return { chapters: store ? held : own, error: store ? error : ownError };
}

/**
 * One read of the chapter list for a page that works on what it read (the Editor, the Booth, Master, Proof, a dialog), from the same store slot as `useChapters`:
 * `read()` serves what the store holds, or waits for the read of it in flight, and `read(true)` (a Retry, a Check again, a refresh after a take) reads it now.
 * A page that keys its own state by the project (the Editor's saved chapter) passes its project folder: the list it gets was read for that project, or the
 * read fails with "The project changed while its chapters were being read." A re-read of a held list that failed is a failure of the read, as before the store.
 * `settled` (the default) waits for a re-read in flight and fails when it failed; a page that only shows the list (Production's pipeline cells) passes false and keeps
 * the held list. Without a <StudioProvider> it reads the port, as every reader did before the slot.
 */
export function useReadChapters(project?: string, settled = true): (fresh?: boolean) => Promise<ManuscriptChapter[]> {
  const store = useOptionalStoreHandle();
  const manuscript = usePort('manuscript');
  return useCallback(
    async (fresh = false) => {
      if (!store) return manuscript.manuscriptChapters();
      await (fresh ? store.load('chapters', { project }) : store.ensure('chapters', { project, settled }));
      const held = store.getState().slots.chapters;
      if (!held) throw store.getState().errors.chapters ?? new Error('The chapter list could not be read just now. Try again.');
      return [...held];
    },
    [store, manuscript, project, settled],
  );
}
