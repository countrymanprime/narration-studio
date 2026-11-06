/** The slice of `window` that {@link trackIntervals} wraps. */
export interface IntervalHost {
  setInterval: (...args: never[]) => unknown;
  clearInterval: (id: never) => void;
}

/**
 * Wraps `host.setInterval` so every interval started through it is remembered, and returns a function that clears the ones
 * still remembered and puts the original back. A test file that finishes while a library's start-up poll is still armed
 * (the Wails runtime polls from import for about 5 s) would otherwise see it fire after jsdom is gone.
 */
export function trackIntervals(host: IntervalHost): () => void {
  const original = host.setInterval;
  const started = new Set<unknown>();
  host.setInterval = ((...args: never[]) => {
    const id = (original as (...a: never[]) => unknown).apply(host, args);
    started.add(id);
    return id;
  }) as IntervalHost['setInterval'];
  return () => {
    for (const id of started) host.clearInterval(id as never);
    started.clear();
    host.setInterval = original;
  };
}
