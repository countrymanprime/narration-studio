/**
 * The order a page reads its neighbours in while the narrator works on one chapter (#3658): the chapter itself, then the next, then the previous, then two
 * ahead, two back, and so on, one ring at a time. `rings` bounds how far (Infinity reads the whole list). Next comes before previous because the narrator
 * moves forward more often than back.
 */
export function ringOrder(count: number, center: number, rings = Number.POSITIVE_INFINITY): number[] {
  if (!Number.isInteger(count) || count <= 0 || !Number.isInteger(center) || center < 0 || center >= count) return [];
  const order = [center];
  for (let ring = 1; ring <= rings && (center + ring < count || center - ring >= 0); ring += 1) {
    if (center + ring < count) order.push(center + ring);
    if (center - ring >= 0) order.push(center - ring);
  }
  return order;
}

type RingPrefetchOptions = {
  /** How many items the list has now; asked again at each move, so a list that grows or shrinks is walked as it is. */
  count: () => number;
  /** How many rings around the center to read (1 reads the center and its two neighbours). */
  rings: number;
  /** Whether the store already holds this index, so it is not read again. */
  held: (index: number) => boolean;
  /**
   * Reads one index. It gets a signal that aborts when the center moves or the scheduler is disposed: a read that can stop should, and an answer that
   * arrives after that is the caller's to drop. A rejection is skipped (the index is tried again at the next move), never thrown.
   */
  load: (index: number, signal: AbortSignal) => Promise<unknown>;
  /** How many reads run at once; one by default, so the background never competes with the page's own reads. */
  concurrency?: number;
  /** Runs the next step later, so a read does not start in the same task as the one before it (setTimeout 0 by default). */
  later?: (step: () => void) => void;
};

type RingPrefetch = {
  /** Starts reading around `center`, replacing any walk that is running. The center itself is read first when it is not held. */
  move(center: number): void;
  /** Stops the walk and aborts the reads in flight. Nothing starts after it. */
  dispose(): void;
};

/**
 * One low-priority background walk in `ringOrder`, shared by every page that reads ahead (Editing's waveforms, the chapter text). A new `move`
 * cancels the walk and starts again from the new center; what is held is skipped; a failed read is skipped until the next move.
 */
export function createRingPrefetch(options: RingPrefetchOptions): RingPrefetch {
  const { count, rings, held, load, concurrency = 1, later = (step) => void setTimeout(step, 0) } = options;
  let walk: { signal: AbortSignal; abort: () => void } | undefined;
  let disposed = false;

  const stop = () => {
    walk?.abort();
    walk = undefined;
  };

  return {
    move(center) {
      if (disposed) return;
      stop();
      const controller = new AbortController();
      const mine = { signal: controller.signal, abort: () => controller.abort() };
      walk = mine;
      const queue = ringOrder(count(), center, rings);
      const next = (): void => {
        if (mine.signal.aborted) return;
        let index: number | undefined;
        while (queue.length > 0) {
          const candidate = queue.shift()!;
          if (!held(candidate)) {
            index = candidate;
            break;
          }
        }
        if (index === undefined) return;
        const reading = index;
        const done = () => later(() => void next());
        Promise.resolve()
          .then(() => load(reading, mine.signal))
          .then(done, done);
      };
      // Each worker takes the next index when its read ends; `concurrency` workers start together.
      for (let worker = 0; worker < Math.max(1, concurrency); worker += 1) later(() => void next());
    },
    dispose() {
      disposed = true;
      stop();
    },
  };
}
