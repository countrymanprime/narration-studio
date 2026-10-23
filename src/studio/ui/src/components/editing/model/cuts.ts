/**
 * Where a cut puts the audio. A cut that closes the gap moves everything after it up by its length; one that leaves a gap moves nothing.
 * A cut is kept in the chapter recording as it was before any cut (`a`, `b`), so the audio that follows can always be placed from the cuts
 * alone, however many there are. Pure functions of the cut list (DQ-8: a cut hides, nothing is deleted).
 */

/** The part of a cut the arithmetic needs: its place in the original recording and whether it closes the gap. */
export interface CutSpan {
  a: number;
  b: number;
  mode: 'close' | 'gap';
}

/** A cut as the document sees it: the words it took out and where, in the original recording and inside its take. */
export interface DocCut extends CutSpan {
  id: string;
  takeId?: string;
  keys: string[];
  /** Seconds from the start of the take (or of the paragraph) before any cut. */
  off0: number;
  off1: number;
}

const closing = <T extends CutSpan>(cuts: readonly T[]): T[] => cuts.filter((c) => c.mode === 'close').sort((x, y) => x.a - y.a);

/** Seconds in the recording as it was before any cut, to seconds now. A moment inside a cut is where the cut starts. */
export function curTime(cuts: readonly CutSpan[], orig: number): number {
  let shift = 0;
  for (const c of closing(cuts)) {
    if (orig >= c.b) shift += c.b - c.a;
    else if (orig > c.a) shift += orig - c.a;
  }
  return orig - shift;
}

/** Seconds now back to seconds before any cut. A moment where a cut was made is the moment after it. */
export function origTime(cuts: readonly CutSpan[], cur: number): number {
  let added = 0;
  for (const c of closing(cuts)) {
    if (cur + 1e-9 >= c.a - added) added += c.b - c.a;
  }
  return cur + added;
}

/** The total length the cuts took out of a chapter. */
export const cutLength = (cuts: readonly CutSpan[]): number => closing(cuts).reduce((a, c) => a + (c.b - c.a), 0);

/** A take as the cuts see it: its id, where it begins in the recording before any cut, and how long it is now. */
export interface TakeSpan {
  id: string | undefined;
  start: number;
  len: number;
}

const EPS = 1e-9;

/** A cut of no words that belongs to no take: a gap Clean up trimmed, placed only by its seconds. */
const wordless = (c: DocCut): boolean => c.keys.length === 0 && !c.takeId;

/**
 * The closing cuts that took time out of a take: those it owns by id, and the wordless ones that start inside it. A wordless cut has no take,
 * so it belongs to the take whose stretch of the recording (its length now, plus what the cuts in it took out) it starts in.
 */
function cutsIn(cuts: readonly DocCut[], take: TakeSpan): DocCut[] {
  const owned = cuts.filter((c) => c.mode === 'close' && c.takeId === take.id);
  const out = [...owned];
  let end = take.start + take.len + owned.reduce((a, c) => a + (c.b - c.a), 0);
  for (const c of cuts.filter((x) => x.mode === 'close' && wordless(x)).sort((x, y) => x.a - y.a)) {
    if (c.a < take.start - EPS || c.a >= end - EPS) continue;
    out.push(c);
    end += c.b - c.a;
  }
  return out;
}

/** The length of a take before any cut: what it is now plus what its cuts took out. */
export const takeLength = (cuts: readonly DocCut[], take: TakeSpan): number => take.len + cutsIn(cuts, take).reduce((a, c) => a + (c.b - c.a), 0);

/** How far the words of a take after `off` (seconds from the take's start before any cut) moved up because of cuts made inside that take. */
export function takeShift(cuts: readonly DocCut[], take: TakeSpan, off: number): number {
  return cutsIn(cuts, take)
    .filter((c) => (wordless(c) ? c.b - take.start : c.off1) <= off + EPS)
    .reduce((a, c) => a + (c.b - c.a), 0);
}
