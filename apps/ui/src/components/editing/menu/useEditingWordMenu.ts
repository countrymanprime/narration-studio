import { useEffect, useMemo, useRef } from 'react';
import { overlay } from '../../../overlay/overlayService';
import { registerContextProvider, type ContextProvider } from '../../../registries/context';
import type { ContextMenuItem } from '../../primitives/ContextMenu';
import { summarize } from '../model';
import { useEditingPage } from '../script/EditingPageState';
import { registerPlayAndCopySections } from './playAndCopySections';
import { buildWordMenu } from './wordMenuRegistry';

const keyOf = (target: Element): string | undefined => target.closest<HTMLElement>('[data-k]')?.dataset.k;

/**
 * Registers the Editing page's one context provider while it is mounted. It matches only the words of the script, so other pages' menus are
 * untouched. A right click on a word outside the selection selects that word first; the items are always those of the whole selection. `play`
 * is the page's playback, which Play selection plays the words through.
 */
export function useEditingWordMenu(play?: (from: number, to?: number) => void): void {
  const page = useEditingPage();
  const latest = useRef(page);
  const player = useRef(play);
  useEffect(() => {
    latest.current = page;
    player.current = play;
  });
  useEffect(() => registerPlayAndCopySections(), []);

  const provider = useMemo<ContextProvider>(
    () => ({
      match: (target) => target.closest('[data-script]') !== null && keyOf(target) !== undefined,
      items: (target): ContextMenuItem[] => {
        const { doc, selected, dispatch } = latest.current;
        const key = keyOf(target);
        if (key === undefined) return [];
        const inside = selected.includes(key);
        if (!inside) dispatch({ type: 'select', anchor: key, head: key });
        const keys = inside ? selected : [key];
        const summary = summarize(doc, keys, [], (s) => s);
        const { heading, groups } = buildWordMenu({
          doc,
          keys,
          summary,
          // Play selection plays the words through the page's playback; without one it only moves the playing position.
          play: (start, end) => (player.current ? player.current(start, end) : dispatch({ type: 'play', t: start })),
          notify: (text) => overlay.toast(text),
        });
        if (groups.length === 0) return [];
        // The primitive draws no heading or separator yet, so the heading is a disabled row and the groups run on.
        return [{ key: 'heading', label: heading, unavailable: '', onSelect: () => {} }, ...groups.flat()];
      },
    }),
    [],
  );
  useEffect(() => registerContextProvider(provider), [provider]);
}
