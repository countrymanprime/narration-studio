import type { WorkspacePeaks } from '../../../api/contracts/workspace';

/** One column of the window: the lowest and highest sample, each -127..127. */
export type PeakColumn = readonly [min: number, max: number];

/** Decodes a peaks entry's base64 minMax into signed bytes: index 2k and 2k+1 are bucket k's minimum and maximum (ADR 0520). */
function decodeEntry(peaks: Pick<WorkspacePeaks, 'minMax'>): Int8Array {
  const binary = atob(peaks.minMax);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Int8Array(bytes.buffer);
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
