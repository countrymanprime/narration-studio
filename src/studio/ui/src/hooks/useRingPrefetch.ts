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
  /** True for an id whose data is already kept: it is passed over without a read or a wait. Without it every run reads every id. */
  kept?: (id: string) => boolean;
  /** False when the caller has no room for `id`'s data (its memory budget is spent): the ring stops there, since every later id is
   * further away, and starts again from the next `current`. */
  room?: (id: string) => boolean;
  /** The wait after each read, so a read the narrator is waiting for is never queued behind a run of these. */
  gapMs?: number;
  /** `RING_STALL_MS` unless set. */
  stallMs?: number;
};

/** The wait between two background reads unless the caller sets its own. */
const RING_GAP_MS = 150;
/** How long a new run waits for the read an earlier run left out before it goes on beside it: a read that never ends must not end the
 * background reading for as long as the page is open. */
const RING_STALL_MS = 20_000;

/**
 * Reads the data of every id in the background, nearest to `current` first (`ringOrder`), one read at a time with a wait between, so the
 * page the narrator is on is never behind these and the pages next to it are ready first. A change of `current` (a navigation) or of the
 * list stops the run where it is and starts a new one from the new place: a read already out is left to finish, the new run waits for it (for
 * `stallMs` at most), and no other is started for the old place. The page closing stops it. `current`'s own read is the first of the run, shared with the page's own when `read` shares.
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
      const asked = new Set<string>();
      for (const id of ringOrder(ids, current)) {
        await Promise.race([flight.current, new Promise((resolve) => setTimeout(resolve, latest.current.stallMs ?? RING_STALL_MS))]);
        if (!live) return;
        const { read, kept, room, gapMs = RING_GAP_MS } = latest.current;
        if (asked.has(id) || kept?.(id)) continue;
        asked.add(id);
        if (id !== current && room && !room(id)) return;
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
