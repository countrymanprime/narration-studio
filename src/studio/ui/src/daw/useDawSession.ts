import { createContext, useContext, useEffect, useSyncExternalStore } from 'react';
import type { DawSession, DawSessionState } from './dawSession';

export const DawSessionContext = createContext<DawSession | undefined>(undefined);

/**
 * The app's one DAW session (`createDawSession`), provided by `ApiProvider`. Every screen that shows DAW state reads it through the
 * hooks below; a component that calls the host for capabilities, transport, meters or FX by itself is refused by `dawSession.guard.test.ts`.
 */
export function useDawSession(): DawSession {
  const session = useContext(DawSessionContext);
  if (!session) throw new Error('useDawSession() called outside an <ApiProvider>.');
  return session;
}

/** One field of the session's state; `select` must return a value that is the same until that field changes. */
export function useDawState<T>(select: (state: DawSessionState) => T): T {
  const session = useDawSession();
  return useSyncExternalStore(session.subscribe, () => select(session.getState()));
}

/** Holds the DAW's meters being read while the caller is mounted: the Booth and the Levels menu both ask, neither depends on the other. */
export function useDawMeterLease(): void {
  const session = useDawSession();
  useEffect(() => session.leaseMeters(), [session]);
}
