import { useSyncExternalStore } from 'react';

/**
 * How long Master & encode waits for the host to start the export before it is freed and says the host did not answer. Starting
 * only checks the request and starts the job (the work runs after the answer), so a real host answers well inside it; the same
 * bound as the log-folder button's wait (`LOG_FOLDER_WAIT_MS`).
 */
export const EXPORT_START_WAIT_MS = 15_000;

/** What became of one request to start the export. */
export type ExportStartHandlers<T> = {
  /** The host started the job. */
  answered: (value: T) => void;
  /** The host refused: its words are the failure. */
  refused: (failure: unknown) => void;
  /** No answer within `EXPORT_START_WAIT_MS`: the request is freed, and its answer, if one comes, is not taken as the job. */
  timedOut: () => void;
  /** An answer, either way, that came after `timedOut`: what the host did is unknown here, so the caller reads the job again. */
  late: () => void;
};

// Kept outside Master to spec, so the panel drawn again (the page left and opened again, the approval dialog closed and opened)
// still knows a start is on its way and cannot send a second one.
let waiting = false;
// The request whose answer is still taken; one that timed out is not.
let current = 0;
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

/** Whether a request to start the export is waiting for the host. */
export function useExportStarting(): boolean {
  return useSyncExternalStore(subscribe, () => waiting);
}

/**
 * Sends `request` unless one is already waiting, and says which happened: false means a start was already on its way and nothing
 * was sent (a second press, a second approval). Each request carries its own number, so an answer that arrives after its wait ran
 * out goes to `late`, never to `answered` or `refused`.
 */
export function startExportRequest<T>(request: () => Promise<T>, handlers: ExportStartHandlers<T>): boolean {
  if (waiting) return false;
  current += 1;
  const token = current;
  setWaiting(true);
  const timer = setTimeout(() => {
    if (token !== current || !waiting) return;
    current += 1;
    setWaiting(false);
    handlers.timedOut();
  }, EXPORT_START_WAIT_MS);
  const settle = (onCurrent: () => void) => {
    clearTimeout(timer);
    if (token !== current) {
      handlers.late();
      return;
    }
    setWaiting(false);
    onCurrent();
  };
  request().then(
    (value) => settle(() => handlers.answered(value)),
    (failure: unknown) => settle(() => handlers.refused(failure)),
  );
  return true;
}
