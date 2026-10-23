import type { WorkspacePeaks } from '../../../api/contracts/workspace';
import { docSpan, type DocPeaks } from './docClock';
import { FULL_SCALE, type PeakScale } from './ribbonBars';
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

/** The share of the chapter's sounding buckets that may be louder than its reference level: a click or a plosive, not the speech. */
const REFERENCE_PERCENTILE = 0.99;

const scales = new WeakMap<object, PeakScale>();

/**
 * The chapter's display scale (`PeakScale`): its reference level is the bucket that 99% of its sounding buckets (those above the host's
 * 1/127 floor) stay at or under, over every item, so the lines keep their loudness against each other and one click does not make the rest
 * small. Full scale when there is nothing to measure.
 */
export function peakScale(state: RibbonPeaks): PeakScale {
  if (state.status !== 'ready') return FULL_SCALE;
  const kept = scales.get(state.result);
  if (kept !== undefined) return kept;
  const counts = new Array<number>(128).fill(0);
  let sounding = 0;
  for (const item of state.result.items) {
    if (!item.peaks || item.peaks.buckets < 1) continue;
    const data = decodeEntry(item.peaks);
    for (let k = 0; k + 1 < data.length; k += 2) {
      const v = Math.min(127, Math.max(Math.abs(data[k]), Math.abs(data[k + 1])));
      if (v <= 1) continue;
      counts[v] += 1;
      sounding += 1;
    }
  }
  let scale = FULL_SCALE;
  if (sounding > 0) {
    const want = Math.ceil(sounding * REFERENCE_PERCENTILE);
    let seen = 0;
    for (let v = 2; v < counts.length; v += 1) {
      seen += counts[v];
      if (seen >= want) {
        scale = { ref: v };
        break;
      }
    }
  }
  scales.set(state.result, scale);
  return scale;
}
