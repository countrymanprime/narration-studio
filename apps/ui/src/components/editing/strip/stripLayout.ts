import { itemAt, summarize, type ChapterDoc } from '../model';
import type { LineTake } from '../takes/types';

/** Seconds of room on each side of the line's words, as the mock leaves them. */
const PAD = 1.2;

interface StripLane {
  take: LineTake;
  /** Seconds on the document's clock where the lane's take begins, and how long it lasts. */
  start: number;
  length: number;
}

export interface StripLayout {
  pid: string;
  t0: number;
  t1: number;
  lanes: StripLane[];
  /** The selection on the line, as a span of the shared axis, and its length in seconds. */
  band: { t0: number; t1: number; length: number } | null;
  playhead: number | null;
}

/**
 * What the strip draws for one line: one axis wide enough for the line and every shown take, a lane for each take, the selection's band and the
 * playhead. A take with no entry in `starts` sits on the line's own start, so the takes of a stacked passage share one spot. Null when the line
 * has no audio span.
 */
export function stripLayout(
  doc: ChapterDoc,
  pid: string,
  takes: readonly LineTake[],
  starts: Readonly<Record<string, number>>,
  selected: readonly string[],
  playT: number | null,
): StripLayout | null {
  const para = doc.paras.find((p) => p.p.id === pid);
  if (!para || para.start == null || para.end == null || !(para.end > para.start)) return null;
  const lanes = takes.map((take) => ({ take, start: starts[take.id] ?? (para.start as number), length: take.sourceLength }));
  const t0 = Math.max(0, Math.min(para.start, ...lanes.map((l) => l.start)) - PAD);
  const t1 = Math.max(para.end, ...lanes.map((l) => l.start + l.length)) + PAD;
  const picked = selected.filter((k) => para.items.some((i) => i.key === k));
  const sum = picked.length ? summarize(doc, picked, [], (x) => x) : null;
  const band = sum && sum.audible.length ? { t0: sum.start, t1: sum.end, length: sum.len } : null;
  return { pid, t0, t1, lanes, band, playhead: playT != null && playT >= t0 && playT <= t1 ? playT : null };
}

/** The key of the word whose own span holds `t`, or null in a gap between words and outside the line. */
export function wordAtTime(doc: ChapterDoc, pid: string, t: number): string | null {
  const hit = itemAt(doc, t);
  if (!hit || hit.pid !== pid || hit.t1 == null || t > hit.t1) return null;
  return hit.key;
}
