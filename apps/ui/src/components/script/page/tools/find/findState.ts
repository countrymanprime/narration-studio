// The Script search's state changes: show a search the jump menu chose, close it, step through its matches with wrap. Each returns the patch
// for the Script view store (`ScriptView.update`), so they are pure and the page decides when to apply them. The state itself (`find`) lives in
// `scriptView.ts`. `find.open` means a search is showing in the reader: every match marked, the current one in view.

import type { ScriptViewState } from '../../data/scriptView';

/** The search showing in the reader. */
export type FindState = { open: boolean; q: string; i: number };

type Patch = (state: ScriptViewState) => Partial<ScriptViewState>;

/** Shows the search for `term` with the match at `index` current. */
export const openFind =
  (term: string, index = 0): Patch =>
  (state) => ({ find: { ...state.find, open: true, q: term, i: index } });

export const closeFind: Patch = (state) => ({ find: { ...state.find, open: false } });

/** Moves to the next (1) or previous (-1) of `count` matches, wrapping at either end. */
export const stepFind =
  (delta: number, count: number): Patch =>
  (state) =>
    count === 0 ? {} : { find: { ...state.find, i: (Math.min(state.find.i, count - 1) + delta + count) % count } };

/**
 * Whether Escape closes the search: only when nothing else is open. A menu or popover takes the key first, then a drawer; the page's
 * Escape handler asks this and, when it is false, lets that layer close instead.
 */
export const escapeClosesFind = (state: ScriptViewState, otherLayerOpen: boolean): boolean => state.find.open && !otherLayerOpen && state.drawer === null;
