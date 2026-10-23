import { useEffect } from 'react';
import type { OverlayService } from '../overlay/overlayService';
import type { Journal } from './journal/createJournal';

/**
 * Keeps an Undo toast true. It offers to take a change back, so it goes when the change is no longer there to take back (undone from
 * the header, the keys or History; cleared by a project switch) and when the narrator leaves what it was about: `scope` names where they
 * are (the page and chapter the address names), and a change of it takes away every Undo toast. One place for every call site of
 * `toastUndo`; a site that journals its change passes the entry (`{ entry }`), one that does not is covered by `scope` alone.
 */
export function useUndoToastLifetime(
  journal: Pick<Journal, 'has' | 'subscribe'>,
  overlay: Pick<OverlayService, 'settleUndo' | 'dismissUndo'>,
  scope: string,
): void {
  useEffect(() => journal.subscribe(() => overlay.settleUndo(journal.has)), [journal, overlay]);
  useEffect(() => {
    overlay.dismissUndo();
  }, [overlay, scope]);
}
