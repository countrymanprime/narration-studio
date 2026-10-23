import type { WorkspaceItem } from '../../../api/contracts/workspace';
import type { PlaylistSegment } from '../../proof/playlist';

/**
 * The two clocks of the Editing page, as one pure two-way mapping.
 *
 * The document's clock (`state.playT`, the ribbon, every word's `t0`) is the chapter's elapsed time over the stretches the page plays: one
 * `PlaylistSegment` for each heard paragraph, laid end to end on the playlist's `elapsedStart..elapsedEnd`, each over a stretch of one item's
 * source file. The DAW's clock is project seconds. A document second becomes a project second through the segment it falls in (to a second of
 * the source), then through the item that plays that source (its `position`, `sourceStart` offset, `length` and `playRate`).
 * A closing cut takes source seconds out of the document, and the DAW closed the gap, so later audio is that much earlier on both clocks.
 *
 * Nothing is guessed: a second with no segment (the gap between paragraphs), an item that is not live or whose place was not read, a source
 * second the item's trim has cut off, and a project second no item covers all map to null.
 */

/** A closing cut, in the source seconds of one item: those seconds are gone from the document and from the project. */
export interface ClosedCut {
  itemGuid: string;
  from: number;
  to: number;
}

export interface ClockMap {
  playlist: readonly PlaylistSegment[];
  items: readonly WorkspaceItem[];
  /** The closing cuts (mode `close` only: a cut that leaves a gap moves nothing on either clock). */
  cuts?: readonly ClosedCut[];
}

const EPS = 1e-9;

interface Placed {
  itemGuid: string;
  position: number;
  length: number;
  sourceStart: number;
  rate: number;
}

const placed = (it: WorkspaceItem): Placed | null =>
  it.live && it.position !== undefined && it.length !== undefined
    ? { itemGuid: it.itemGuid, position: it.position, length: it.length, sourceStart: it.sourceStart ?? 0, rate: it.playRate || 1 }
    : null;

const usable = (t: number): boolean => Number.isFinite(t) && t >= 0;

/** The cuts of one item that lie at or after `from` (in source seconds), in order. */
const cutsOf = (cuts: readonly ClosedCut[] | undefined, itemGuid: string, from: number): ClosedCut[] =>
  (cuts ?? []).filter((c) => c.itemGuid === itemGuid && c.to > c.from && c.from >= from - EPS).sort((a, b) => a.from - b.from);

/** Seconds into a stretch with its cuts left in, for `x` seconds into it with them taken out. */
function putCutsBack(x: number, origin: number, cuts: readonly ClosedCut[]): number {
  let added = 0;
  for (const c of cuts) if (x + EPS >= c.from - origin - added) added += c.to - c.from;
  return x + added;
}

/** Seconds into a stretch with its cuts taken out, for `y` seconds into it with them left in. */
function takeCutsOut(y: number, origin: number, cuts: readonly ClosedCut[]): number {
  let removed = 0;
  for (const c of cuts) if (y + EPS >= c.to - origin) removed += c.to - c.from;
  return y - removed;
}

/** The project second the document second `docT` plays at, or null when nothing in the project plays it. */
export function projectAt(map: ClockMap, docT: number): number | null {
  if (!usable(docT)) return null;
  const seg = map.playlist.find((s) => docT >= s.elapsedStart - EPS && docT < s.elapsedEnd - EPS);
  if (!seg) return null;
  const found = map.items.find((it) => it.itemGuid === seg.itemGuid);
  const item = found ? placed(found) : null;
  if (!item) return null;
  const cuts = cutsOf(map.cuts, item.itemGuid, seg.sourceStart);
  const source = seg.sourceStart + putCutsBack(Math.max(0, docT - seg.elapsedStart), seg.sourceStart, cuts);
  const itemCuts = cutsOf(map.cuts, item.itemGuid, item.sourceStart);
  const into = takeCutsOut(source - item.sourceStart, item.sourceStart, itemCuts);
  if (source < item.sourceStart - EPS || into < -EPS) return null;
  const project = item.position + Math.max(0, into) / item.rate;
  return project < item.position + item.length - EPS ? project : null;
}

/** The document second that plays at the project second `projectT`, or null when no item plays there or the page has no segment for what does. */
export function docAt(map: ClockMap, projectT: number): number | null {
  if (!usable(projectT)) return null;
  // When items overlap, the one that starts latest plays.
  let item: Placed | null = null;
  for (const it of map.items) {
    const p = placed(it);
    if (!p || projectT < p.position - EPS || projectT >= p.position + p.length - EPS) continue;
    if (!item || p.position >= item.position) item = p;
  }
  if (!item) return null;
  const itemCuts = cutsOf(map.cuts, item.itemGuid, item.sourceStart);
  const source = item.sourceStart + putCutsBack((projectT - item.position) * item.rate, item.sourceStart, itemCuts);
  for (const seg of map.playlist) {
    if (seg.itemGuid !== item.itemGuid || source < seg.sourceStart - EPS) continue;
    const x = takeCutsOut(source - seg.sourceStart, seg.sourceStart, cutsOf(map.cuts, item.itemGuid, seg.sourceStart));
    if (x >= -EPS && x < seg.elapsedEnd - seg.elapsedStart - EPS) return seg.elapsedStart + Math.max(0, x);
  }
  return null;
}
