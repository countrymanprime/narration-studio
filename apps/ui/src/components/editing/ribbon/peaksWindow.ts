import type { WorkspacePeaks } from '../../../api/contracts/workspace';

/** One column of the window: the lowest and highest sample, each -127..127. */
export type PeakColumn = readonly [min: number, max: number];

/** Entries already decoded, so a resize or a new window over the same chapter does not decode its base64 again. Dropped with the entry. */
const decoded = new WeakMap<object, Int8Array>();

/** Decodes a peaks entry's base64 minMax into signed bytes: index 2k and 2k+1 are bucket k's minimum and maximum. */
function decodeEntry(peaks: Pick<WorkspacePeaks, 'minMax'>): Int8Array {
  const known = decoded.get(peaks);
  if (known) return known;
  const binary = atob(peaks.minMax);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  const out = new Int8Array(bytes.buffer);
  decoded.set(peaks, out);
  return out;
}

/** Seconds the entry covers, as `[from, to)` on the same clock as the document's word times. */
export const entrySpan = (p: WorkspacePeaks): readonly [number, number] => [p.startSeconds, p.startSeconds + p.buckets / p.bucketsPerSecond];

/**
 * The window `[t0, t1]` of a whole peaks entry as `columns` columns. A column's range is the min and max over the buckets under it.
 * Null when the window does not overlap the entry (or is empty): the caller says there is no audio rather than drawing silence.
 * A column outside the entry, where the window runs over its edge, is `[0, 0]`.
 */
export function peaksWindow(peaks: WorkspacePeaks, t0: number, t1: number, columns: number): PeakColumn[] | null {
  const span = t1 - t0;
  if (!(span > 0) || columns < 1 || peaks.buckets < 1 || peaks.bucketsPerSecond <= 0) return null;
  const [from, to] = entrySpan(peaks);
  if (t1 <= from || t0 >= to) return null;
  const data = decodeEntry(peaks);
  const out: PeakColumn[] = [];
  for (let c = 0; c < columns; c += 1) {
    const a = (t0 + (c / columns) * span - peaks.startSeconds) * peaks.bucketsPerSecond;
    const b = (t0 + ((c + 1) / columns) * span - peaks.startSeconds) * peaks.bucketsPerSecond;
    const first = Math.max(0, Math.floor(a + 1e-9));
    const last = Math.min(peaks.buckets - 1, Math.max(first, Math.ceil(b - 1e-9) - 1));
    if (b <= 0 || a >= peaks.buckets) {
      out.push([0, 0]);
      continue;
    }
    let lo = 127;
    let hi = -127;
    for (let k = first; k <= last; k += 1) {
      lo = Math.min(lo, data[2 * k]);
      hi = Math.max(hi, data[2 * k + 1]);
    }
    out.push([lo, hi]);
  }
  return out;
}

/**
 * The window `[t0, t1]` as `columns` columns over every entry it touches: a line can run across several audio items (a take, a cut), and its
 * waveform is all of them. A column no entry covers is `[0, 0]`. Null when no entry overlaps the window (or it is empty).
 */
export function peaksWindowAll(entries: readonly WorkspacePeaks[], t0: number, t1: number, columns: number): PeakColumn[] | null {
  const span = t1 - t0;
  if (!(span > 0) || columns < 1) return null;
  const live = entries
    .filter((p) => p.buckets >= 1 && p.bucketsPerSecond > 0)
    .map((p) => ({ p, data: decodeEntry(p), from: entrySpan(p)[0], to: entrySpan(p)[1] }))
    .filter(({ from, to }) => t1 > from && t0 < to);
  if (live.length === 0) return null;
  const out: PeakColumn[] = [];
  for (let c = 0; c < columns; c += 1) {
    const a = t0 + (c / columns) * span;
    const b = t0 + ((c + 1) / columns) * span;
    let lo = 127;
    let hi = -127;
    let covered = false;
    for (const { p, data, from, to } of live) {
      if (b <= from || a >= to) continue;
      const first = Math.max(0, Math.floor((a - p.startSeconds) * p.bucketsPerSecond + 1e-9));
      const last = Math.min(p.buckets - 1, Math.max(first, Math.ceil((b - p.startSeconds) * p.bucketsPerSecond - 1e-9) - 1));
      for (let k = first; k <= last; k += 1) {
        lo = Math.min(lo, data[2 * k]);
        hi = Math.max(hi, data[2 * k + 1]);
        covered = true;
      }
    }
    out.push(covered ? [lo, hi] : [0, 0]);
  }
  return out;
}
