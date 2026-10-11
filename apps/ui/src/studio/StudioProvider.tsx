import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { usePort } from '../ports/usePort';
import type { DawKind } from '../api/contracts/daw';
import { useDawKind } from '../useDawKind';
import { createJournal, type Journal } from './journal/createJournal';
import { createHostEvents, createSlots, StudioStoreProvider, useStudio, type StudioRegistry } from './slots';
import { createStudioStore, type StudioStore } from './store/createStudioStore';

export { useStudio };

/** The DAW as the header chip and the journal's sentences name it. `none` is the built-in recorder. */
export function dawShortName(daw: DawKind): string {
  return daw === 'none' ? 'Built-in' : daw;
}

const StudioContext = createContext<Journal | null>(null);
const StoreContext = createContext<StudioStore<StudioRegistry> | null>(null);

/**
 * The composition root of the command journal and the read-model store for the shell (ADR 0770, 0771). It creates the one journal
 * the header's Undo and History read and the one store the slots live in, starts the store and stops it on unmount. A project
 * switch empties both: what was loaded for the old project is dropped and a load still in flight for it is ignored. The DAW's
 * name comes from the DAW capabilities; its last action is not reportable yet, so it answers 'unknown'. A test passes its own
 * `journal` and `store`.
 */
export function StudioProvider({
  journal: provided,
  store: providedStore,
  children,
}: {
  journal?: Journal;
  store?: StudioStore<StudioRegistry>;
  children: ReactNode;
}) {
  const daw = useDawKind();
  const manuscript = usePort('manuscript');
  const bookmarks = usePort('bookmarks');
  const system = usePort('system');
  const nameRef = useRef('the DAW');
  nameRef.current = daw ? dawShortName(daw) : 'the DAW';
  const [created] = useState(() => createJournal({ dawName: () => nameRef.current, dawLastAction: async () => 'unknown' }));
  const [createdStore] = useState(() => createStudioStore({ registry: createSlots(manuscript, bookmarks), subscribe: createHostEvents(system) }));
  const journal = provided ?? created;
  const store = providedStore ?? createdStore;
  useEffect(() => store.start(), [store]);
  useEffect(
    () =>
      system.subscribeProjectAttach((state) => {
        if (!state.attached) return;
        store.reset();
        journal.clear();
      }),
    [system, store, journal],
  );
  return (
    <StudioContext.Provider value={journal}>
      <StoreContext.Provider value={store}>
        <StudioStoreProvider store={store}>{children}</StudioStoreProvider>
      </StoreContext.Provider>
    </StudioContext.Provider>
  );
}

export function useJournal(): Journal {
  const journal = useContext(StudioContext);
  if (!journal) throw new Error('useJournal needs a <StudioProvider> above it.');
  return journal;
}

/** The store itself, for a caller that asks a slot to load (`load('chapters')`); a page reads a slot with `useStudio`. */
export function useStoreHandle(): StudioStore<StudioRegistry> {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useStoreHandle needs a <StudioProvider> above it.');
  return store;
}
