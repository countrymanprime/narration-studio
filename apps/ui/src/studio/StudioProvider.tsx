import { createContext, useContext, useRef, useState, type ReactNode } from 'react';
import type { DawKind } from '../api/contracts/daw';
import { useDawKind } from '../useDawKind';
import { createJournal, type Journal } from './journal/createJournal';

/** The DAW as the header chip and the journal's sentences name it. `none` is the built-in recorder. */
export function dawShortName(daw: DawKind): string {
  return daw === 'none' ? 'Built-in' : daw;
}

const StudioContext = createContext<Journal | null>(null);

/**
 * The composition root of the command journal for the shell (ADR 0771). It creates the one journal the header's Undo and History read and
 * the pages will record into. The DAW's name comes from the DAW capabilities; its last action is not reportable yet, so it answers
 * 'unknown' (the journal's documented stand-in). A test passes its own `journal`. It clears nothing on a project switch and adds no command: the store composition extends it.
 */
export function StudioProvider({ journal: provided, children }: { journal?: Journal; children: ReactNode }) {
  const daw = useDawKind();
  const nameRef = useRef('the DAW');
  nameRef.current = daw ? dawShortName(daw) : 'the DAW';
  const [created] = useState(() => createJournal({ dawName: () => nameRef.current, dawLastAction: async () => 'unknown' }));
  const journal = provided ?? created;
  return <StudioContext.Provider value={journal}>{children}</StudioContext.Provider>;
}

export function useJournal(): Journal {
  const journal = useContext(StudioContext);
  if (!journal) throw new Error('useJournal needs a <StudioProvider> above it.');
  return journal;
}
