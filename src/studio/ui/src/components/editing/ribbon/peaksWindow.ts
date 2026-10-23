import type { WorkspacePeaks } from '../../../api/contracts/workspace';
import { docSpan, type DocPeaks } from './docClock';
import type { RibbonPeaks } from './useRibbonPeaks';

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

/**
 * The window `[t0, t1]` of one entry on the document clock as `columns` columns. A column's range is the min and max over the buckets under it.
 * Null when the window does not overlap the entry (or is empty): the caller says there is no audio rather than drawing silence.
 * A column outside the entry, where the window runs over its edge, is `[0, 0]`.
 */
export const peaksWindow = (peaks: DocPeaks, t0: number, t1: number, columns: number): PeakColumn[] | null => peaksWindowAll([peaks], t0, t1, columns);

/**
 * The window `[t0, t1]` (the document's clock) as `columns` columns over every entry it touches: a line can run across several audio items (a
 * take, a cut), and its waveform is all of them. Each entry is read at its own place on the document clock (`DocPeaks`), so a bucket is drawn
 * where its audio is heard. A column no entry covers is `[0, 0]`. Null when no entry overlaps the window (or it is empty).
 */
export function peaksWindowAll(entries: readonly DocPeaks[], t0: number, t1: number, columns: number): PeakColumn[] | null {
  const span = t1 - t0;
  if (!(span > 0) || columns < 1) return null;
  const live = entries
    .filter((d) => d.peaks.buckets >= 1 && d.peaks.bucketsPerSecond > 0)
    .map((d) => {
      const [from, to] = docSpan(d);
      return { p: d.peaks, shift: d.piece.shift, data: decodeEntry(d.peaks), from, to };
    })
    .filter(({ from, to }) => t1 > from && t0 < to);
  if (live.length === 0) return null;
  const out: PeakColumn[] = [];
  for (let c = 0; c < columns; c += 1) {
    const a = t0 + (c / columns) * span;
    const b = t0 + ((c + 1) / columns) * span;
    let lo = 127;
    let hi = -127;
    let covered = false;
    for (const { p, shift, data, from, to } of live) {
      if (b <= from || a >= to) continue;
      // The column's seconds on the entry's own (source) clock, then its buckets.
      const first = Math.max(0, Math.floor((a - shift - p.startSeconds) * p.bucketsPerSecond + 1e-9));
      const last = Math.min(p.buckets - 1, Math.max(first, Math.ceil((b - shift - p.startSeconds) * p.bucketsPerSecond - 1e-9) - 1));
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

/** The most a waveform is scaled up for display: past this a recording is near silence and scaling it up only draws its noise. */
export const PEAK_GAIN_LIMIT = 12;

const gains = new WeakMap<object, number>();

/**
 * How much the chapter's waveform is scaled up for display: its loudest bucket, over every item, fills full scale. A recording that peaks near
 * a quarter of full scale is a row of dots at the raw level, where a DAW shows it larger. The lines keep their loudness against each other
 * (one gain for the chapter). 1 when there is nothing to draw, never below 1, never above `PEAK_GAIN_LIMIT`.
 */
export function peakGain(state: RibbonPeaks): number {
  if (state.status !== 'ready') return 1;
  const kept = gains.get(state.result);
  if (kept !== undefined) return kept;
  let loudest = 0;
  for (const item of state.result.items) {
    if (!item.peaks || item.peaks.buckets < 1) continue;
    const data = decodeEntry(item.peaks);
    for (let i = 0; i < data.length; i += 1) loudest = Math.max(loudest, Math.abs(data[i]));
  }
  const gain = loudest <= 0 ? 1 : Math.min(PEAK_GAIN_LIMIT, Math.max(1, 127 / loudest));
  gains.set(state.result, gain);
  return gain;
}
