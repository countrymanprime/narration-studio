import { createContext, useContext, useEffect, useMemo, useReducer, type Dispatch, type ReactNode } from 'react';
import type { ChapterDoc } from '../model';
import { initialPageState, isStale, pageReducer, selectedKeysOf, type PageAction, type PageState } from './scriptState';

interface EditingPage {
  doc: ChapterDoc;
  state: PageState;
  dispatch: Dispatch<PageAction>;
  /** The keys selected, or the cursor's word alone. */
  selected: string[];
}

const Ctx = createContext<EditingPage | null>(null);

/** Holds the page state for one document, and lets all of it go when a key no longer belongs to the document. */
export function EditingPageProvider({ doc, children }: { doc: ChapterDoc; children: ReactNode }) {
  const [state, dispatch] = useReducer(pageReducer, initialPageState);
  const stale = isStale(doc, state);
  useEffect(() => {
    if (stale) dispatch({ type: 'reset' });
  }, [stale]);
  const selected = useMemo(() => selectedKeysOf(doc, state), [doc, state]);
  const value = useMemo(() => ({ doc, state, dispatch, selected }), [doc, state, selected]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** The cursor, selection, flag and playhead, and the dispatch that changes them; the selection bar and the key rows read the page through this. */
export function useEditingPage(): EditingPage {
  const v = useContext(Ctx);
  if (!v) throw new Error('useEditingPage needs an <EditingPageProvider>.');
  return v;
}
