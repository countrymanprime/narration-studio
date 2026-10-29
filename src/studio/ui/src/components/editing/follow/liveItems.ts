import type { WorkspaceItem } from '../../../api/contracts/workspace';
import type { PlaylistSegment } from '../../proof/playlist';
import type { ClosedCut } from './clockMap';

/**
 * Follow-along over the live project. The alignment says which stretch of which source file each heard paragraph is, and the saved project
 * said which item played it and where. Once the narrator edits in the DAW (a move, a trim, a rate, a deleted section closed up, a split, which
 * gives the right half a GUID the alignment never saw) that saved place is wrong, and the play head lands on the wrong sentence or on none.
 *
 * `relocate` puts the playlist back on what the DAW has now: each segment is cut at the edges of the live pieces that play its source file, and
 * each cut-off part is owned by the piece that plays it. A part of a segment no piece plays (a section taken out) belongs to nobody.
 */

/** One media item as the DAW has it now. */
export interface LiveItem {
  guid: string;
  sourceFile: string;
  position: number;
  length: number;
  /** Where the item starts in its source file, in source seconds. */
  sourceStart: number;
  playRate: number;
}

const EPS = 1e-6;

const norm = (path: string): string => path.replace(/\\/g, '/').toLowerCase();
const same = (a: string, b: string): boolean => norm(a) === norm(b);
const base = (path: string): string => norm(path).slice(norm(path).lastIndexOf('/') + 1);

const sourceEnd = (it: LiveItem): number => it.sourceStart + it.length * (it.playRate || 1);

export interface Relocated {
  playlist: PlaylistSegment[];
  items: WorkspaceItem[];
  cuts: ClosedCut[];
}

/** The playlist, its items and the closing cuts, moved onto the DAW's live items. The cuts are named for the item their paragraph was heard on. */
export function relocate(playlist: readonly PlaylistSegment[], live: readonly LiveItem[], cuts: readonly ClosedCut[] = []): Relocated {
  const items: WorkspaceItem[] = live.map((it, index) => ({
    index,
    itemGuid: it.guid,
    live: true,
    sourceStart: it.sourceStart,
    playRate: it.playRate || 1,
    position: it.position,
    length: it.length,
  }));
  const out: PlaylistSegment[] = [];
  for (const seg of playlist) {
    const covering = (it: LiveItem): boolean => it.sourceStart < seg.sourceEnd - EPS && sourceEnd(it) > seg.sourceStart + EPS;
    // The file by its whole path; only when no item plays that path, by its name (the saved project may spell a path the DAW spells otherwise).
    const named = live.filter((it) => it.sourceFile !== '' && same(it.sourceFile, seg.sourceFile));
    const pieces = (named.length ? named : live.filter((it) => it.sourceFile !== '' && base(it.sourceFile) === base(seg.sourceFile)))
      .filter(covering)
      .sort((a, b) => a.sourceStart - b.sourceStart);
    for (const piece of pieces) {
      const from = Math.max(seg.sourceStart, piece.sourceStart);
      const to = Math.min(seg.sourceEnd, sourceEnd(piece));
      out.push({
        itemGuid: piece.guid,
        sourceFile: seg.sourceFile,
        sourceStart: from,
        sourceEnd: to,
        elapsedStart: seg.elapsedStart + (from - seg.sourceStart),
        elapsedEnd: seg.elapsedStart + (to - seg.sourceStart),
        overlapsPrevious: seg.overlapsPrevious,
      });
    }
  }
  const files = new Map(playlist.map((s) => [s.itemGuid, s.sourceFile]));
  const moved: ClosedCut[] = [];
  for (const cut of cuts) {
    const file = files.get(cut.itemGuid);
    if (file === undefined) continue;
    for (const piece of live) {
      if (piece.sourceFile === '' || (!same(piece.sourceFile, file) && base(piece.sourceFile) !== base(file))) continue;
      const from = Math.max(cut.from, piece.sourceStart);
      const to = Math.min(cut.to, sourceEnd(piece));
      if (to > from + EPS) moved.push({ itemGuid: piece.guid, from, to });
    }
  }
  return { playlist: out, items, cuts: moved };
}
