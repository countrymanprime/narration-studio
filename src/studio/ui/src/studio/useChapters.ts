import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { ManuscriptChapter } from '../types';
import { usePort } from '../ports/usePort';
import { useOptionalStoreHandle } from './StudioProvider';

const noSubscribe = () => () => undefined;

/**
 * The chapter list every page reads, from the store's `chapters` slot (#3658): loaded once, shared by whoever mounts, and read again when what it holds
 * changes (a job ends, a chapter's status or kind, a track link, a layout, a DAW, a sync, a record end, or the window gaining focus). Mounting a page
 * does not read it again. `undefined` until the first read answers; a failed read keeps the last list and sets `error`.
 *
 * A caller that asks for the list again (a dialog's Check again) bumps `refreshKey`: the slot is read now, not served. `refreshing` is true while a read it asked
 * for (that, or the one a reader mounted on a failed list makes) is out, so a page shows its loading state and not the failure it already knows; `generation` counts
 * the project switches the store has seen.
 *
 * Without a <StudioProvider> (a component rendered alone in a test) it reads the port itself, once per mount, as every reader did before the slot.
 */
export function useChapters(
  enabled = true,
  refreshKey = 0,
): { chapters: readonly ManuscriptChapter[] | undefined; error: Error | undefined; refreshing: boolean; generation: number } {
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
  // A reset while a read is out changes neither `held` nor `error`: the generation is what makes the effect below ask again for the new project.
  const generation = useSyncExternalStore(
    store ? store.subscribe : noSubscribe,
    () => store?.generation() ?? 0,
    () => 0,
  );
  const [own, setOwn] = useState<readonly ManuscriptChapter[]>();
  // The reads this hook asked for that are still out: a mount on a failed list and each `refreshKey` bump.
  const [refreshing, setRefreshing] = useState(() =>
    Boolean(store && enabled && store.getState().errors.chapters !== undefined && store.getState().slots.chapters === undefined),
  );
  const pending = useRef(0);
  // A project switch drops the reads asked for the old project: they no longer count as out, and their answers change nothing.
  const epoch = useRef(generation);
  if (epoch.current !== generation) {
    epoch.current = generation;
    pending.current = 0;
  }
  const readNow = (target: NonNullable<typeof store>) => {
    const mine = epoch.current;
    pending.current += 1;
    setRefreshing(true);
    void target
      .load('chapters')
      .catch(() => undefined)
      .then(() => {
        if (mine !== epoch.current) return;
        pending.current -= 1;
        if (pending.current === 0) setRefreshing(false);
      });
  };
  // Ask when the list is not held and no read of it has failed: first mount, a project switch that emptied the slot, a read the switch dropped. A failure is
  // not asked again by this hook (an event or the caller's `refreshKey` does), so a host that is down is not read in a loop.
  // A read that a project switch dropped answers with nothing held and no failure: ask once more (at most three times in a row, so a slot that keeps
  // being emptied is not read in a loop).
  const [again, setAgain] = useState(0);
  const retries = useRef(0);
  useEffect(() => {
    if (held !== undefined) retries.current = 0;
  }, [held]);
  // A reader that mounts on a list whose read failed asks once more.
  useEffect(() => {
    if (store && enabled && store.getState().errors.chapters !== undefined && store.getState().slots.chapters === undefined) readNow(store);
    // `readNow` only counts the reads in flight.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, enabled]);
  useEffect(() => {
    if (!store || !enabled || held !== undefined || error !== undefined) return;
    let live = true;
    void store
      .ensure('chapters')
      .catch(() => undefined)
      .then(() => {
        const now = store.getState();
        if (live && now.slots.chapters === undefined && now.errors.chapters === undefined && retries.current < 3) {
          retries.current += 1;
          setAgain((n) => n + 1);
        }
      });
    return () => {
      live = false;
    };
  }, [store, enabled, held, error, again, generation]);
  useEffect(() => {
    if (store && enabled && refreshKey > 0) readNow(store);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  return { chapters: store ? held : own, error, refreshing: refreshing && pending.current > 0, generation };
}
