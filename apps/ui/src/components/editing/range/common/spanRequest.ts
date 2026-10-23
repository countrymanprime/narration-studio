import type { DocItem } from '../../model';
import { EDGE_EPSILON, fineClock, spanOfKeys, type Span } from '../../ribbon/rangeMath';

/**
 * A sub-word edge is the part of a range's edge that falls inside a word. The DAW takes a range as the alignment tokens of its first and last
 * word (`DeleteRangeRequest`, `FxRangeRequest`) and resolves the item and the times itself, so a cut or an effect acts on whole words. This is
 * the sentence that says so, with both ranges, wherever the narrator is asked or told what was done; '' when the range is on the words' edges.
 */
export function subWordNote(exact: Span, applied: Span | null): string {
  if (!applied) return '';
  if (Math.abs(exact.start - applied.start) <= EDGE_EPSILON && Math.abs(exact.end - applied.end) <= EDGE_EPSILON) return '';
  return `Sub-word edge, shown as a preview: your range runs ${fineClock(exact.start)} to ${fineClock(exact.end)}, and the DAW acts on the whole words, ${fineClock(applied.start)} to ${fineClock(applied.end)}.`;
}

/** The span of the whole words a cut or an effect works on: the first start to the last end of `items`. Null with no heard word. */
export const appliedSpan = (items: readonly DocItem[]): Span | null =>
  spanOfKeys(
    items,
    items.map((i) => i.key),
  );

/** The range drawn on the waveform when it belongs to `keys`: a word menu may ask about words other than the selection, and the range is not theirs then. */
export function spanForKeys(span: Span | null | undefined, keys: readonly string[], selected: readonly string[]): Span | undefined {
  if (!span || keys.length !== selected.length) return undefined;
  const picked = new Set(selected);
  return keys.every((k) => picked.has(k)) ? span : undefined;
}
