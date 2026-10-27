import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { createDawSession } from '../daw/dawSession';
import { DawSessionContext } from '../daw/useDawSession';
import type { NarrationApi } from '../types';

// The single injection point for the backend service layer: every component
// that needs data calls useApi() instead of importing a transport directly. Swapping the
// whole app onto a mock is then a one-line change at the provider, in tests
// or in the browser-only dev mode (see main.tsx).
const ApiContext = createContext<NarrationApi | undefined>(undefined);

export function ApiProvider({ api, children }: { api: NarrationApi; children: ReactNode }) {
  // The app's one DAW session lives as long as the api does: started here, so it is reading before any screen mounts, and stopped with it.
  const session = useMemo(() => createDawSession(api), [api]);
  useEffect(() => {
    session.start();
    return () => session.stop();
  }, [session]);
  return (
    <ApiContext.Provider value={api}>
      <DawSessionContext.Provider value={session}>{children}</DawSessionContext.Provider>
    </ApiContext.Provider>
  );
}

export function useApi(): NarrationApi {
  const api = useContext(ApiContext);
  if (!api) throw new Error('useApi() called outside an <ApiProvider>.');
  return api;
}
