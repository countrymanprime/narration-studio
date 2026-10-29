import type { WordTimes, WordTimeRow } from '../../../api/contracts/daw';
import type { ChapterDoc } from '../model';

/**
 * A word table for a hand-built chapter, for the tests: the page's words get the alignment tokens 0, 1, 2... in order, and `place` says where each plays in the
 * project (null for a word the DAW does not play). The host makes the real table (internal/wordtimes); this stands in for it.
 */
export function wordTimesFor(
  doc: ChapterDoc,
  place: (word: { key: string; t0: number; t1: number }) => { start: number; end: number } | null,
  options: { version?: string; changeCount?: number } = {},
): { table: WordTimes; tokenOf: (key: string) => number | undefined } {
  const tokens = new Map<string, number>();
  const words: WordTimeRow[] = [];
  for (const item of doc.items) {
    if (item.kind !== 'w') continue;
    const i = tokens.size;
    tokens.set(item.key, i);
    const at = item.t0 != null && item.t1 != null ? place({ key: item.key, t0: item.t0, t1: item.t1 }) : null;
    words.push(
      at
        ? { i, state: 'placed', start: at.start, end: at.end, item: 0, clipped: false, misread: false }
        : { i, state: 'not_in_project', start: 0, end: 0, item: -1, clipped: false, misread: false },
    );
  }
  return {
    table: { available: true, version: options.version ?? 'test@1', changeCount: options.changeCount ?? 1, items: ['{item}'], words },
    tokenOf: (key) => tokens.get(key),
  };
}

/** One item at `position` seconds, the page's clock running at `rate` project seconds per document second less: project = position + (document - origin) / rate. */
export const linear =
  (position: number, origin = 0, rate = 1) =>
  (word: { t0: number; t1: number }): { start: number; end: number } => ({
    start: position + (word.t0 - origin) / rate,
    end: position + (word.t1 - origin) / rate,
  });
