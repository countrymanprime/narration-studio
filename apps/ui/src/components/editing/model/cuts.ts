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

/** How far the words of a take after `off` (seconds from the take's start) moved up because of cuts made in that take. */
export function takeShift(cuts: readonly DocCut[], takeId: string | undefined, off: number): number {
  return cuts.filter((c) => c.mode === 'close' && c.takeId === takeId && c.off1 <= off + 1e-9).reduce((a, c) => a + (c.b - c.a), 0);
}
