import { useSyncExternalStore } from 'react';

/**
 * How long the log-folder button waits for the host before it is freed and says the host did not answer. The same bound as the
 * Schedule page's wait for an unanswered write (`WRITE_WAIT_MS`); opening the folder only starts the file manager, so a real host answers
 * well inside it.
 */
export const LOG_FOLDER_WAIT_MS = 15_000;

// Kept outside the button so the button drawn again after leaving the category, or after search hid the row, is still busy (issue 2730, B1).
let waiting = false;
const listeners = new Set<() => void>();

function setWaiting(value: boolean) {
  waiting = value;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Whether a request to open the log folder is waiting for the host. */
export function useLogFolderWaiting(): boolean {
  return useSyncExternalStore(subscribe, () => waiting);
}

/**
 * Runs `request` unless one is already waiting. While it waits, `useLogFolderWaiting` is true. A refusal goes to `onRefused`. A request
 * unanswered after `LOG_FOLDER_WAIT_MS` goes to `onTimeout`, frees the button, and its late answer is ignored.
 */
export function startLogFolderRequest(request: () => Promise<void>, onRefused: (failure: unknown) => void, onTimeout: () => void): void {
  if (waiting) return;
  setWaiting(true);
  let settled = false;
  const finish = () => {
    if (settled) return false;
    settled = true;
    setWaiting(false);
    return true;
  };
  const timer = setTimeout(() => {
    if (finish()) onTimeout();
  }, LOG_FOLDER_WAIT_MS);
  request().then(
    () => {
      clearTimeout(timer);
      finish();
    },
    (failure: unknown) => {
      clearTimeout(timer);
      if (finish()) onRefused(failure);
    },
  );
}
