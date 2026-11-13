import { useCallback, useRef } from 'react';
import { useGuardedAction } from '../../../../studio/drafts/unsavedDrafts';
import type { ScriptViewState } from './scriptView';
import { useScriptView } from './useScriptData';

/**
 * Shows something in the Script rail (a word, an entry, a note, another tab). The rail holds typed text in its cards (a pronunciation, a reply, an edit), and
 * showing another tab, word or entry unmounts the card that holds it, so a change like that asks first and `then` runs once it goes ahead (#3404).
 * Showing what is already there asks nothing.
 */
export function useShowInRail(): (patch: Partial<ScriptViewState>, then?: () => void) => void {
  const guarded = useGuardedAction();
  const [tab, update] = useScriptView((state) => state.tab);
  const [word] = useScriptView((state) => state.word);
  const [entryId] = useScriptView((state) => state.entryId);
  const now = useRef({ tab, word, entryId });
  now.current = { tab, word, entryId };
  return useCallback(
    (patch, then) => {
      const shown = now.current;
      const replaces =
        (patch.tab !== undefined && patch.tab !== shown.tab) ||
        (patch.word !== undefined && patch.word !== shown.word) ||
        (patch.entryId !== undefined && patch.entryId !== shown.entryId);
      const show = () => {
        update(patch);
        then?.();
      };
      if (replaces) guarded(show);
      else show();
    },
    [guarded, update],
  );
}
