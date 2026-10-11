// The Script page's view state, the mock's `ui.script` (`state/slices/ui.ts`) less the bookmark fields the bookmarks slices
// keep: the side panel's tab, the selected mark, the word and entry shown, Find, the drawer and the reader's scroll requests.
// It is not host data and is never journalled. One store per host (see `useScriptData.ts`), so the page's parts share it
// without a context each; a change replaces the state object, so a selector that returns a field is stable.

import type { LineRange } from './scriptCommands';

type ScriptTab = 'pron' | 'bible' | 'marks' | 'queries' | 'bookmarks';

export type ScriptViewState = {
  tab: ScriptTab;
  /** The selected mark's id. */
  sel: string | null;
  /** The word shown in the Words tab (its key). */
  word: string | null;
  /** The Story Bible entry shown in the side panel. */
  entryId: string | null;
  /** A looked-up text with no entry yet, and the selection it came from. */
  miss: string | null;
  missSel: LineRange | null;
  drawer: 'ch' | 'rail' | null;
  find: { open: boolean; q: string; i: number; list: boolean };
  /** Counts up each time Find is asked for, so the box takes focus again even when it is already open. */
  findNonce: number;
  /** Reader scroll requests, consumed once by the reader. */
  pendingJump: string | null;
  pendingPid: string | null;
  qfilter: 'open' | 'resolved' | 'all';
  /** "markId:messageIndex" being edited. */
  aedit: string | null;
  /** The chapter at the top of the reader. */
  spyAt: string | null;
};

const INITIAL_SCRIPT_VIEW: ScriptViewState = {
  tab: 'pron',
  sel: null,
  word: null,
  entryId: null,
  miss: null,
  missSel: null,
  drawer: null,
  find: { open: false, q: '', i: 0, list: true },
  findNonce: 0,
  pendingJump: null,
  pendingPid: null,
  qfilter: 'open',
  aedit: null,
  spyAt: null,
};

export type ScriptView = {
  getState(): ScriptViewState;
  subscribe(listener: () => void): () => void;
  /** Merges a patch, or the patch a function of the current state returns. */
  update(patch: Partial<ScriptViewState> | ((state: ScriptViewState) => Partial<ScriptViewState>)): void;
};

export function createScriptView(initial: ScriptViewState = INITIAL_SCRIPT_VIEW): ScriptView {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    update(patch) {
      state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) };
      listeners.forEach((listener) => listener());
    },
  };
}
