/**
 * The time range on the Editing waveform as pure functions: drawing it, moving an edge or the whole range, snapping to word boundaries, and which
 * words it covers. Seconds are on the document's clock (`DocItem.t0`), so a range and a word compare directly.
 */
import type { DocItem } from '../model';

export interface Span {
  start: number;
  end: number;
}
export type Edge = 'start' | 'end';

/** The narrowest range, in seconds: 50 ms is a little over two of the host's 20 ms peaks, so the two handles always have a gap between them to grab. */
export const MIN_RANGE = 0.05;
/** A range edge within this many seconds of a word's edge counts as on it. */
export const EDGE_EPSILON = 0.005;
/** A word is in the selection when the range lies over at least this fraction of it. */
const SELECT_FRACTION = 0.5;

const clamp = (value: number, low: number, high: number): number => Math.max(low, Math.min(high, value));
const width = (bounds: Span): number => bounds.end - bounds.start;

/** The span with each edge kept inside `bounds` and the two at least `min` apart (or all of `bounds` when that is narrower). A too-narrow span grows forward, or back from the far end. */
export function clampSpan(span: Span, bounds: Span, min = MIN_RANGE): Span {
  if (width(bounds) <= min) return { start: bounds.start, end: bounds.end };
  const a = clamp(span.start, bounds.start, bounds.end);
  const b = clamp(span.end, bounds.start, bounds.end);
  const start = Math.min(a, b);
  const end = Math.max(a, b);
  if (end - start >= min) return { start, end };
  return start + min <= bounds.end ? { start, end: start + min } : { start: bounds.end - min, end: bounds.end };
}

/** The range a drag draws: from where the pointer went down to where it is, either way round, the minimum wide from the anchor outward, inside `bounds`. */
export function dragCreate(anchor: number, to: number, bounds: Span, min = MIN_RANGE): Span {
  if (width(bounds) <= min) return { start: bounds.start, end: bounds.end };
  const a = clamp(anchor, bounds.start, bounds.end);
  const b = clamp(to, bounds.start, bounds.end);
  if (b >= a) {
    if (b - a >= min) return { start: a, end: b };
    return a + min <= bounds.end ? { start: a, end: a + min } : { start: bounds.end - min, end: bounds.end };
  }
  if (a - b >= min) return { start: b, end: a };
  return a - min >= bounds.start ? { start: a - min, end: a } : { start: bounds.start, end: bounds.start + min };
}

/** One edge moved to a time: the other stays, they never come closer than `min`, and neither leaves `bounds`. */
export function moveEdge(span: Span, edge: Edge, to: number, bounds: Span, min = MIN_RANGE): Span {
  if (edge === 'start') return { start: clamp(to, bounds.start, Math.max(bounds.start, span.end - min)), end: span.end };
  return { start: span.start, end: clamp(to, Math.min(bounds.end, span.start + min), bounds.end) };
}

/** The whole range slid by `delta` seconds, keeping its width and stopping at either end of `bounds`. */
export function moveSpan(span: Span, delta: number, bounds: Span): Span {
  const len = span.end - span.start;
  const start = clamp(span.start + delta, bounds.start, Math.max(bounds.start, bounds.end - len));
  return { start, end: start + len };
}

/** An arrow key's step in seconds for a view `viewLen` seconds long: a hundredth of it to the hundredth, at least 10 ms, ten times that with Shift. */
export function nudgeStep(viewLen: number, big: boolean): number {
  const small = Math.max(0.01, Math.round(viewLen) / 100);
  return big ? Math.round(small * 10 * 1e6) / 1e6 : small;
}

/** One edge moved by `dir` steps of `step` seconds, under the rules of `moveEdge`. */
export function nudgeEdge(span: Span, edge: Edge, dir: -1 | 1, step: number, bounds: Span, min = MIN_RANGE): Span {
  return moveEdge(span, edge, span[edge] + dir * step, bounds, min);
}

/** A heard word that is still in the audio: it has times and neither a cut nor a miss took it. */
const audible = (i: DocItem): i is DocItem & { t0: number; t1: number } => i.t0 != null && i.t1 != null && !i.cut && i.st !== 'miss';

/** Every start and end of an audible word, once each, in order: where the snap rule can put an edge. */
export function wordBoundaries(items: readonly DocItem[]): number[] {
  const all = new Set<number>();
  for (const i of items) {
    if (!audible(i)) continue;
    all.add(i.t0);
    all.add(i.t1);
  }
  return [...all].sort((a, b) => a - b);
}

/** The boundary nearest `t` (the earlier of two equally near), or `t` when there are none. This is the snap rule: nearest word boundary, no distance limit. */
export function snapTo(boundaries: readonly number[], t: number): number {
  let best = t;
  let gap = Infinity;
  for (const b of boundaries) {
    const d = Math.abs(b - t);
    if (d < gap - 1e-9) {
      best = b;
      gap = d;
    }
  }
  return best;
}

/** The next boundary strictly past `t` in a direction, or `t` where there is none. */
export function stepBoundary(boundaries: readonly number[], t: number, dir: -1 | 1): number {
  const next = dir > 0 ? boundaries.find((b) => b > t + 1e-9) : [...boundaries].reverse().find((b) => b < t - 1e-9);
  return next ?? t;
}

export interface WordCover {
  key: string;
  /** 0 to 1: how much of the word's time the range lies over. */
  fraction: number;
}

/** The fraction of each audible word the span covers, for the words it touches at all, in the order of the text. */
export function coverage(items: readonly DocItem[], span: Span): WordCover[] {
  const out: WordCover[] = [];
  for (const i of items) {
    if (!audible(i)) continue;
    const len = i.t1 - i.t0;
    if (len <= 0) {
      // A word with no length is covered when the range lies on it.
      if (i.t0 >= span.start - 1e-9 && i.t0 <= span.end + 1e-9) out.push({ key: i.key, fraction: 1 });
      continue;
    }
    const overlap = Math.min(span.end, i.t1) - Math.max(span.start, i.t0);
    if (overlap > 1e-9) out.push({ key: i.key, fraction: Math.min(1, overlap / len) });
  }
  return out;
}

export interface Covered {
  /** The words the range selects, in the order of the text. */
  keys: string[];
  /** The whole words' own span: what a cut or an effect works on today, since the DAW takes words and not times. Null with no words. */
  applied: Span | null;
  /** The word the start edge passes through, and how much of it the range covers; null where the edge sits in a gap or on a word's edge. */
  start: WordCover | null;
  end: WordCover | null;
}

/**
 * The words a range selects. A word is in when the range lies over at least half of it; a range inside one word selects that word, so the
 * selection is never empty over speech. An edge that passes through a word reports it with the fraction covered, whether or not the word is in,
 * so the page can say a word is only partly covered instead of hiding it.
 */
export function wordsCovered(items: readonly DocItem[], span: Span): Covered {
  const touched = coverage(items, span);
  if (!touched.length) return { keys: [], applied: null, start: null, end: null };
  let keys = touched.filter((c) => c.fraction >= SELECT_FRACTION - 1e-9).map((c) => c.key);
  if (!keys.length) keys = [touched.reduce((best, c) => (c.fraction > best.fraction ? c : best)).key];
  const byKey = new Map(items.map((i) => [i.key, i]));
  const through = (cover: WordCover, edge: number): WordCover | null => {
    const i = byKey.get(cover.key);
    return i && audible(i) && i.t1 > i.t0 && edge > i.t0 + EDGE_EPSILON && edge < i.t1 - EDGE_EPSILON ? cover : null;
  };
  return {
    keys,
    applied: spanOfKeys(items, keys),
    start: through(touched[0], span.start),
    end: through(touched[touched.length - 1], span.end),
  };
}

/** The audible word that sounds at `t` (the end of the last word counts as in it), or null in a gap or past the words. */
export function wordAtTime(items: readonly DocItem[], t: number): DocItem | null {
  const heard = items.filter(audible);
  const hit = heard.find((i) => t >= i.t0 && t < i.t1);
  if (hit) return hit;
  const last = heard[heard.length - 1];
  return last && t === last.t1 ? last : null;
}

/** The first start to the last end of the audible words among `keys`, or null when none is. */
export function spanOfKeys(items: readonly DocItem[], keys: readonly string[]): Span | null {
  const wanted = new Set(keys);
  const heard = items.filter(audible).filter((i) => wanted.has(i.key));
  if (!heard.length) return null;
  return { start: Math.min(...heard.map((i) => i.t0)), end: Math.max(...heard.map((i) => i.t1)) };
}

/** Seconds as `m:ss.ss`, to the hundredth, for the places a range is read out: the fine zoom needs more than whole seconds. */
export function fineClock(seconds: number): string {
  const hundredths = Math.max(0, Math.round(seconds * 100));
  const m = Math.floor(hundredths / 6000);
  const s = (hundredths % 6000) / 100;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** A range in words for a screen reader and the label: "0:05.54 to 0:06.30, 0.8 seconds, 2 words". */
export function rangeLabel(span: Span, words: number): string {
  return `${fineClock(span.start)} to ${fineClock(span.end)}, ${(span.end - span.start).toFixed(1)} seconds, ${plural(words, 'word', 'words')}`;
}
