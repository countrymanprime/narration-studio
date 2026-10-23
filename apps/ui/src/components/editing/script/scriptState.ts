/**
 * The Editing page's own state: where the cursor is, what is selected, which word has its card open and what the playhead says. It is page state,
 * not cached host data, so it lives in one pure reducer here; the bar and the key rows read it through `useEditingPage`.
 */
import { rangeKeys, type ChapterDoc, type Sel } from '../model';
import type { Span } from '../ribbon/rangeMath';

export interface PageState {
  /** The word the cursor is on. */
  cursor: string | null;
  /** A run of whole words, from where it began to where the pointer or the keys took it. */
  sel: Sel | null;
  /** The word whose card is open, or `dup:<paragraph>` for a doubled read. */
  flag: string | null;
  /** Where the playhead is, seconds into the chapter as it stands now; null when nothing plays. */
  playT: number | null;
  /**
   * The exact time range drawn on the waveform, seconds on the document's clock, when the selection came from it. It can start or end inside a
   * word; `sel` holds the words it covers. Any other way of moving the selection drops it, so it never outlives the words it was drawn for.
   */
  span?: Span | null;
  /**
   * The stretch the bottom waveform shows, seconds on the document's clock, while the narrator scrolls it by hand: the script marks the lines in
   * it and brings them into view. Moving the cursor or the selection lets it go, and the waveform follows the cursor's line again.
   */
  view?: { t0: number; t1: number } | null;
}

export type PageAction =
  | { type: 'place'; key: string }
  | { type: 'extend'; key: string }
  | { type: 'select'; anchor: string; head: string }
  /** A range drawn on the waveform: the words it covers (none: null) and the exact span. */
  | { type: 'selectSpan'; span: Span; anchor: string | null; head: string | null }
  /** The range and the words it selected let go, leaving a card open. */
  | { type: 'dropRange' }
  /** The words moved under the range (a cut re-timed the line), so the exact span no longer fits them: the words stay selected. */
  | { type: 'dropSpan' }
  | { type: 'clear' }
  | { type: 'openFlag'; key: string }
  | { type: 'closeFlag' }
  | { type: 'play'; t: number | null }
  /** The waveform was scrolled by hand to show `[t0, t1]`. */
  | { type: 'view'; t0: number; t1: number }
  | { type: 'reset' };

export const initialPageState: PageState = { cursor: null, sel: null, flag: null, playT: null };

const isDup = (flag: string): boolean => flag.startsWith('dup:');

/** Moving to `key` with `sel`: a card stays open only for the word it belongs to (or a doubled read). */
function move(s: PageState, key: string, sel: Sel | null): PageState {
  const flag = s.flag && s.flag !== key && !isDup(s.flag) ? null : s.flag;
  return { ...s, cursor: key, sel, flag, ...(s.span ? { span: null } : {}), ...(s.view ? { view: null } : {}) };
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
    case 'selectSpan':
      return a.head && a.anchor ? { ...move(s, a.head, { anchor: a.anchor, head: a.head }), span: a.span } : { ...s, sel: null, span: a.span };
    case 'dropSpan':
      return s.span ? { ...s, span: null } : s;
    case 'dropRange':
      return s.sel || s.span ? { ...s, sel: null, span: null } : s;
    case 'clear':
      // Escape closes the card first, then lets the selection (and the range drawn for it) go.
      if (s.flag) return { ...s, flag: null };
      if (s.sel || s.span) return { ...s, sel: null, span: null };
      return s;
    case 'openFlag':
      return { ...s, flag: a.key };
    case 'closeFlag':
      return s.flag ? { ...s, flag: null } : s;
    case 'view':
      return s.view && s.view.t0 === a.t0 && s.view.t1 === a.t1 ? s : { ...s, view: { t0: a.t0, t1: a.t1 } };
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
  // A range drawn over no words selects none, even with the cursor on a word.
  if (s.span && !s.sel) return [];
  if (s.sel) return rangeKeys(doc, s.sel.anchor, s.sel.head);
  return s.cursor && doc.index.has(s.cursor) ? [s.cursor] : [];
}
