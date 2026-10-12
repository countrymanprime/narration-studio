// Find's state changes, ported from the mock's `state/commands/script.ts` (open with an optional term, close, query, step with
// wrap, pick, toggle the list). Each returns the patch for the Script view store (`ScriptView.update`), so they are pure and
// the page decides when to apply them. The state itself (`find`, `findNonce`) lives in `scriptView.ts`.

import type { ScriptViewState } from '../../data/scriptView';
import { MIN_FIND_LENGTH } from './searchManuscript';

/** Find's state in the Script view store. */
export type FindState = { open: boolean; q: string; i: number; list: boolean };

type Patch = (state: ScriptViewState) => Partial<ScriptViewState>;

/** Opens Find, with the list showing; a term replaces the query and starts at the first match. The nonce moves focus into the box even when it is open. */
export const openFind =
  (term?: string): Patch =>
  (state) => ({
    find: { ...state.find, open: true, list: true, ...(term === undefined ? {} : { q: term, i: 0 }) },
    findNonce: state.findNonce + 1,
  });

export const closeFind: Patch = (state) => ({ find: { ...state.find, open: false } });

export const setFindQuery =
  (q: string): Patch =>
  (state) => ({ find: { ...state.find, q, list: true, i: 0 } });

/** Moves to the next (1) or previous (-1) of `count` matches, wrapping at either end. */
export const stepFind =
  (delta: number, count: number): Patch =>
  (state) =>
    count === 0 ? {} : { find: { ...state.find, i: (Math.min(state.find.i, count - 1) + delta + count) % count } };

/** Makes a result the current match and hides the list. */
export const pickFind =
  (i: number): Patch =>
  (state) => ({ find: { ...state.find, i, list: false } });

export const toggleFindList: Patch = (state) => ({ find: { ...state.find, list: !state.find.list } });

/** "3 of 12", "No matches", or nothing while the term is too short to search. */
export function findCountText(find: FindState, count: number): string {
  if (find.q.trim().length < MIN_FIND_LENGTH) return '';
  return count ? `${Math.min(find.i, count - 1) + 1} of ${count}` : 'No matches';
}

/**
 * Whether Escape closes Find: only when nothing else is open. A menu or popover takes the key first, then a drawer; the page's
 * Escape handler asks this and, when it is false, lets that layer close instead.
 */
export const escapeClosesFind = (state: ScriptViewState, otherLayerOpen: boolean): boolean => state.find.open && !otherLayerOpen && state.drawer === null;
