import type { WorkspaceItem } from '../../../api/contracts/workspace';
import type { PlaylistSegment } from '../../proof/playlist';
import type { ChapterDoc } from '../model';
import { playable, playingKey } from '../script/playing';

/** Where a project time falls in an item's source: the item and the second of its source. */
export interface SourcePoint {
  itemGuid: string;
  sourceTime: number;
}

/**
 * The live item that plays at `t` project seconds, and the second of its source it plays then: the item's source start plus the time into
 * the item times its play rate. When items overlap, the one that starts latest wins. Null in a gap, or for an item the read has no place for.
 */
export function sourceAt(items: readonly WorkspaceItem[], t: number): SourcePoint | null {
  let hit: SourcePoint | null = null;
  let start = -Infinity;
  for (const it of items) {
    if (!it.live || it.position == null || it.length == null) continue;
    if (t < it.position || t >= it.position + it.length || it.position < start) continue;
    start = it.position;
    hit = { itemGuid: it.itemGuid, sourceTime: (it.sourceStart ?? 0) + (t - it.position) * (it.playRate || 1) };
  }
  return hit;
}

/** The document's time for a point of an item's source, through the segments the page plays; null when no segment covers it. */
export function docTimeAt(playlist: readonly PlaylistSegment[], at: SourcePoint): number | null {
  const seg = playlist.find((s) => s.itemGuid === at.itemGuid && at.sourceTime >= s.sourceStart && at.sourceTime < s.sourceEnd);
  return seg ? seg.elapsedStart + (at.sourceTime - seg.sourceStart) : null;
}

/** The word heard at a document time: the one `playingKey` finds (ADR 0265), only while the time is inside it. */
function wordIn(doc: ChapterDoc, t: number): string | null {
  const key = playingKey(playable(doc), t);
  const it = key ? doc.items[doc.index.get(key) ?? -1] : undefined;
  return it?.t1 != null && t < it.t1 ? key : null;
}

/** The word and the document time a project time maps to, or null when it falls in a gap, before the first word or after the last. */
export function wordAtProject(
  doc: ChapterDoc,
  items: readonly WorkspaceItem[],
  playlist: readonly PlaylistSegment[],
  t: number,
): { key: string; t: number } | null {
  const at = sourceAt(items, t);
  const docT = at ? docTimeAt(playlist, at) : null;
  const key = docT == null ? null : wordIn(doc, docT);
  return key && docT != null ? { key, t: docT } : null;
}
