import type { ChapterDoc } from '../../model';

/** The part of one line a menu action marks: the script words among the selected keys, as offsets into the line's text. */
export interface ScriptSpan {
  paragraphId: string;
  /** UTF-16 offsets into the line's text, from the first marked word to the end of the last. */
  start: number;
  end: number;
  /** The text of the span, as the Script page quotes it. */
  quote: string;
  /** Selected words the span does not hold: words that were only said, and script words of other lines (a mark stays in one line). */
  left: number;
}

/**
 * The span of the first line that has a selected script word, or null when the selection holds none. A word that was only said has no place
 * in the script, so it is left out and counted.
 */
export function scriptSpanOf(doc: ChapterDoc, keys: readonly string[]): ScriptSpan | null {
  const wanted = new Set(keys.filter((k) => doc.index.has(k)));
  let found: Omit<ScriptSpan, 'left'> | null = null;
  let inSpan = 0;
  for (const para of doc.paras) {
    let first = -1;
    let last = -1;
    let count = 0;
    for (const unit of para.units) {
      let at = unit.u.s + unit.lead.length;
      for (const item of unit.items) {
        if (item.kind !== 'w') continue;
        const to = at + item.text.length;
        if (wanted.has(item.key)) {
          if (first < 0) first = at;
          last = to;
          count += 1;
        }
        at = to + item.gap.length;
      }
    }
    if (count > 0 && !found) {
      found = { paragraphId: para.p.id, start: first, end: last, quote: para.p.text.slice(first, last) };
      inSpan = count;
    }
  }
  return found ? { ...found, left: wanted.size - inSpan } : null;
}
