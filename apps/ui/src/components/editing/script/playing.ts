import type { ChapterDoc, DocItem } from '../model';

/** The words that can be playing, in order of time: heard, not cut. */
export const playable = (doc: ChapterDoc): DocItem[] => doc.items.filter((i) => i.t0 != null && !i.cut && i.st !== 'miss');

/** The word playing at `t`, or the last one that began before it: a binary search over `playable` (ADR 0265), not a scan of every word. */
export function playingKey(words: readonly DocItem[], t: number | null): string | null {
  if (t == null || !words.length) return null;
  let lo = 0;
  let hi = words.length - 1;
  let hit = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if ((words[mid].t0 as number) <= t + 1e-6) {
      hit = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return hit < 0 ? null : words[hit].key;
}
