// The one quiet window after a press that moves what is under the pointer (a row linked, a chain starred, a button swapped for another in the
// same spot): a second press this soon is the second click of a double click, and lands on the thing that moved there. Walkthrough F1 (#2958),
// #3272. A control calls `start()` when its press takes effect and ignores a press while `quiet()` is true.
import { useRef } from 'react';

/** How long after a press that moves the next control under the pointer a press is ignored. */
export const QUIET_MS = 600;

export type QuietWindow = {
  /** Opens the window now. */
  start: () => void;
  /** Whether a press now is inside the window. */
  quiet: () => boolean;
  /** Closes it. Only for tests, where one test's press must not hold back the next test's. */
  reset: () => void;
};

/** A window on its own: for state that outlives a mount (a module-level guard). */
export function createQuietWindow(ms: number = QUIET_MS): QuietWindow {
  let until = 0;
  return {
    start: () => {
      until = Date.now() + ms;
    },
    quiet: () => Date.now() < until,
    reset: () => {
      until = 0;
    },
  };
}

/** A window for the life of one mount. */
export function useQuietWindow(ms: number = QUIET_MS): QuietWindow {
  const held = useRef<QuietWindow | null>(null);
  held.current ??= createQuietWindow(ms);
  return held.current;
}
