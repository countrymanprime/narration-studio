/** How long the Booth waits for a host answer before a press goes on without it or says it got none (the host's own limit is shorter). */
export const HOST_WAIT_MS = 8000;

/** `work`, or `fallback` when it has not answered within `ms`; a rejection is the caller's to catch. The timer is always let go. */
export function within<T>(work: Promise<T>, fallback: T, ms: number = HOST_WAIT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const slow = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
  });
  return Promise.race([work, slow]).finally(() => clearTimeout(timer));
}
