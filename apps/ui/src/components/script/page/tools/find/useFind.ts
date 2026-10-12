// Binds Find's state changes to the Script view store, for the page to spread onto `FindBar`. `openFind(term?)` is what the page
// registers for `script.find` (Ctrl+F opens Find with the selection as the term).

import { useMemo } from 'react';
import { useScriptView } from '../../data/useScriptData';
import { closeFind, openFind, pickFind, setFindQuery, stepFind, toggleFindList } from './findState';

/** `matchCount` is the number of matches the page found for the current query, which stepping wraps around. */
export function useFind(matchCount: number) {
  const [find, update] = useScriptView((state) => state.find);
  const [nonce] = useScriptView((state) => state.findNonce);
  return useMemo(
    () => ({
      find,
      nonce,
      openFind: (term?: string) => update(openFind(term)),
      onQuery: (q: string) => update(setFindQuery(q)),
      onStep: (delta: number) => update(stepFind(delta, matchCount)),
      onPick: (i: number) => update(pickFind(i)),
      onToggleList: () => update(toggleFindList),
      onClose: () => update(closeFind),
    }),
    [find, nonce, update, matchCount],
  );
}
