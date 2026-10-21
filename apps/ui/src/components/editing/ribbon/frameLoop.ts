/**
 * The one `requestAnimationFrame` loop every playing ribbon and strip draws from. It runs only while something is subscribed, so a page with
 * no playback schedules no frames, and a ribbon and a strip playing together share a single callback per frame.
 */
type FrameCallback = (nowMs: number) => void;

const subscribers = new Set<FrameCallback>();
let handle: number | null = null;

function tick(now: number): void {
  handle = null;
  // Copied: a callback may unsubscribe itself while the set is walked.
  for (const cb of [...subscribers]) cb(now);
  if (subscribers.size > 0) handle = requestAnimationFrame(tick);
}

/** Calls `cb` on every frame until the returned function is called. */
export function subscribeFrames(cb: FrameCallback): () => void {
  subscribers.add(cb);
  if (handle === null) handle = requestAnimationFrame(tick);
  return () => {
    subscribers.delete(cb);
    if (subscribers.size === 0 && handle !== null) {
      cancelAnimationFrame(handle);
      handle = null;
    }
  };
}

/** How many callbacks are waiting for frames. For tests. */
export const frameSubscribers = (): number => subscribers.size;
