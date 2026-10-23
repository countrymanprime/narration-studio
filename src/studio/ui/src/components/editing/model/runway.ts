import type { ChapterDoc } from './doc';

/** Seconds of audio kept after the last word of a paragraph. The aligner's end time for a word can fall before the sound has died away. */
export const RUNWAY_SECONDS = 0.35;
/** Room left before the next paragraph's first word, so the runway never plays or draws part of it. */
const BEFORE_NEXT_SECONDS = 0.02;

const heard = (i: { t0: number | null; t1: number | null; st: string; cut?: unknown }): boolean => i.t0 != null && i.t1 != null && i.st !== 'miss' && !i.cut;

/**
 * Where a play or a drawn window that ends on the word `lastKey` at `end` should really end: the last word of a paragraph gets the runway
 * (never into the next paragraph's first word), and any other word, or an unknown one, ends where it did.
 */
export function runwayEnd(doc: ChapterDoc, lastKey: string, end: number): number {
  const at = doc.index.get(lastKey);
  if (at == null) return end;
  const word = doc.items[at];
  const next = doc.items.slice(at + 1).find(heard);
  if (next && next.pid === word.pid) return end;
  const limit = next?.t0 == null ? Number.POSITIVE_INFINITY : next.t0 - BEFORE_NEXT_SECONDS;
  return Math.min(end + RUNWAY_SECONDS, Math.max(end, limit));
}
