import { useSyncExternalStore } from 'react';

/**
 * How long a Master & QC request to the host (planning and starting the export, saving the mastering chain) waits before it is freed and says
 * the host did not answer. Each only checks and records (the export's work runs after the answer), so a real host answers well
 * inside it; the same bound as the log-folder button's wait (`LOG_FOLDER_WAIT_MS`).
 */
export const MASTER_REQUEST_WAIT_MS = 15_000;

/** What became of one request. */
type HostRequestHandlers<T> = {
  /** The host answered. */
  answered: (value: T) => void;
  /** The host refused: its words are the failure. */
  refused: (failure: unknown) => void;
  /** No answer within `MASTER_REQUEST_WAIT_MS`: the request is freed, and its answer, if one comes, is not taken. */
  timedOut: () => void;
  /** An answer, either way, that came after `timedOut`: what the host did is unknown here, so the caller reads it again. */
  late: () => void;
};

/**
 * One request at a time to the host, held outside any component, so a control drawn again (the page left and opened again, a
 * dialog closed and opened) still knows a request is on its way and cannot send a second one. `useWaiting` says whether one waits;
 * `send` sends unless one waits, and says which happened. Each request carries its own number, so an answer that arrives after its
 * wait ran out goes to `late`, never to `answered` or `refused`.
 */
function createHostRequest() {
  let waiting = false;
  let current = 0;
  const listeners = new Set<() => void>();
  const setWaiting = (value: boolean) => {
    waiting = value;
    for (const listener of listeners) listener();
  };
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };
  return {
    useWaiting: (): boolean => useSyncExternalStore(subscribe, () => waiting),
    send<T>(request: () => Promise<T>, handlers: HostRequestHandlers<T>): boolean {
      if (waiting) return false;
      current += 1;
      const token = current;
      setWaiting(true);
      const timer = setTimeout(() => {
        if (token !== current || !waiting) return;
        current += 1;
        setWaiting(false);
        handlers.timedOut();
      }, MASTER_REQUEST_WAIT_MS);
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
    },
  };
}

// One lock for every Master & QC request that decides how the book is mastered: Master & encode's read of the plan, the approval
// dialog's start, and the chain card's save of the mastering row. A save that lands while an export is being planned or started
// would export with one row and then show another, so neither runs while the other waits (qa on #2929).
const masteringLock = createHostRequest();

/** Whether a plan, a start or a save of the mastering row is waiting for the host. */
export const useExportStarting = masteringLock.useWaiting;

/** Sends a request to plan or start the export unless any request of the lock waits (`createHostRequest`). */
export const startExportRequest = masteringLock.send;

/** Whether a plan, a start or a save of the mastering row is waiting for the host: the chain card holds its rows while it is. */
export const useMasteringChoiceSaving = masteringLock.useWaiting;

/** Sends a save of the project's mastering row unless any request of the lock waits (`createHostRequest`). */
export const saveMasteringChoiceRequest = masteringLock.send;
