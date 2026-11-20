import { useEffect, useRef } from 'react';

/** `ids` in the order a reader moving from `current` is likely to want them: `current`, the one after it, the one before, then two
 * away on each side, and so on to both ends. Empty when `current` is not in `ids`. */
export function ringOrder<T>(ids: readonly T[], current: T): T[] {
  const at = ids.indexOf(current);
  if (at < 0) return [];
  const order = [ids[at]];
  for (let ring = 1; at + ring < ids.length || at - ring >= 0; ring += 1) {
    if (at + ring < ids.length) order.push(ids[at + ring]);
    if (at - ring >= 0) order.push(ids[at - ring]);
  }
  return order;
}

export type RingPrefetch = {
  /** Reads one id's data and keeps it wherever the caller keeps it. A failure is the caller's to record; the ring goes on. */
  read: (id: string) => Promise<unknown>;
  /** True for an id whose data is already kept: it is passed over without a read or a wait. */
  kept?: (id: string) => boolean;
  /** False once the caller's memory budget is spent: the ring stops there, and starts again from the next `current`. */
  room?: () => boolean;
  /** The wait after each read, so a read the narrator is waiting for is never queued behind a run of these. */
  gapMs?: number;
};

/** The wait between two background reads unless the caller sets its own. */
export const RING_GAP_MS = 150;

/**
 * Reads the data of every id in the background, nearest to `current` first (`ringOrder`), one read at a time with a wait between, so the
 * page the narrator is on is never behind these and the pages next to it are ready first. A change of `current` (a navigation) or of the
 * list stops the run where it is and starts a new one from the new place: a read already out is left to finish, the new run waits for it, and
 * no other is started for the old place. The page closing stops it. `current`'s own read is the first of the run, shared with the page's own when `read` shares.
 */
export function useRingPrefetch(ids: readonly string[], current: string | undefined, prefetch: RingPrefetch): void {
  const latest = useRef(prefetch);
  latest.current = prefetch;
  // The read that is out, whichever run made it: a new run waits for it, so there are never two of these reads at once.
  const flight = useRef<Promise<unknown>>(Promise.resolve());
  const key = ids.join('\0');
  useEffect(() => {
    if (current === undefined || ids.length < 2) return;
    let live = true;
    void (async () => {
      for (const id of ringOrder(ids, current)) {
        await flight.current;
        if (!live) return;
        const { read, kept, room, gapMs = RING_GAP_MS } = latest.current;
        if (kept?.(id)) continue;
        if (id !== current && room && !room()) return;
        flight.current = read(id).catch(() => undefined);
        await flight.current;
        if (live) await new Promise((resolve) => setTimeout(resolve, gapMs));
      }
    })();
    return () => {
      live = false;
    };
    // The list's contents are the dependency: a new array with the same ids is not a new run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, current]);
}
