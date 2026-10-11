/**
 * The Editing page's own state: where the cursor is, what is selected, which word has its card open and what the playhead says. It is page state,
 * not cached host data (ADR 0770), so it lives in one pure reducer here; the bar and the key rows read it through `useEditingPage`.
 */
import { rangeKeys, type ChapterDoc, type Sel } from '../model';

export interface PageState {
  /** The word the cursor is on. */
  cursor: string | null;
  /** A run of whole words, from where it began to where the pointer or the keys took it. */
  sel: Sel | null;
  /** The word whose card is open, or `dup:<paragraph>` for a doubled read. */
  flag: string | null;
  /** Where the playhead is, seconds into the chapter as it stands now; null when nothing plays. */
  playT: number | null;
}

export type PageAction =
  | { type: 'place'; key: string }
  | { type: 'extend'; key: string }
  | { type: 'select'; anchor: string; head: string }
  | { type: 'clear' }
  | { type: 'openFlag'; key: string }
  | { type: 'closeFlag' }
  | { type: 'play'; t: number | null }
  | { type: 'reset' };

export const initialPageState: PageState = { cursor: null, sel: null, flag: null, playT: null };

const isDup = (flag: string): boolean => flag.startsWith('dup:');

/** Moving to `key` with `sel`: a card stays open only for the word it belongs to (or a doubled read). */
function move(s: PageState, key: string, sel: Sel | null): PageState {
  const flag = s.flag && s.flag !== key && !isDup(s.flag) ? null : s.flag;
  return { ...s, cursor: key, sel, flag };
}

export function pageReducer(s: PageState, a: PageAction): PageState {
  switch (a.type) {
    case 'place':
      return move(s, a.key, null);
    case 'extend': {
      const anchor = s.sel?.anchor ?? s.cursor;
      return anchor ? move(s, a.key, { anchor, head: a.key }) : move(s, a.key, null);
    }
    case 'select':
      return move(s, a.head, { anchor: a.anchor, head: a.head });
    case 'clear':
      // Escape closes the card first, then lets the selection go.
      if (s.flag) return { ...s, flag: null };
      if (s.sel) return { ...s, sel: null };
      return s;
    case 'openFlag':
      return { ...s, flag: a.key };
    case 'closeFlag':
      return s.flag ? { ...s, flag: null } : s;
    case 'play':
      return s.playT === a.t ? s : { ...s, playT: a.t };
    case 'reset':
      return initialPageState;
  }
}

/** A key the document no longer has: the chapter changed or the manuscript was replaced under the page. */
export function isStale(doc: ChapterDoc, s: PageState): boolean {
  const gone = (k: string | null | undefined): boolean => !!k && !doc.index.has(k);
  return gone(s.cursor) || gone(s.sel?.anchor) || gone(s.sel?.head);
}

/** The keys a state selects: the run, or the cursor's word alone. */
export function selectedKeysOf(doc: ChapterDoc, s: PageState): string[] {
  if (s.sel) return rangeKeys(doc, s.sel.anchor, s.sel.head);
  return s.cursor && doc.index.has(s.cursor) ? [s.cursor] : [];
}
