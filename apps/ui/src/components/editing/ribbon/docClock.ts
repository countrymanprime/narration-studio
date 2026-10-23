import type { WorkspacePeaks } from '../../../api/contracts/workspace';
import type { HeardAnswer } from '../../../ports/alignment';
import { RUNWAY_SECONDS, type ChapterDoc } from '../model';

/**
 * Two clocks meet in the ribbon. The window, the word ticks, the range and the playhead are on the DOCUMENT clock: the timeline `buildDoc` lays the
 * paragraphs along (a pause of its own between lines, cuts closing their gaps). The host's peaks, and the heard words' `off0`/`off1`, are in
 * SOURCE seconds of the item's file. They agree only when nothing was laid out differently, and in a real chapter they drift apart (about 3.5 s
 * by the 5th line in the owner's project), so peaks windowed by their source seconds draw a line's speech in the wrong place.
 *
 * Everything that windows peaks takes `DocPeaks`: peaks already put on the document clock. The only ways to make one are in this file.
 */

/** A stretch of the document clock in which one item's source seconds sit at a fixed offset: `document = source + shift`. */
export interface ClockPiece {
  /** The stretch on the document clock; open-ended (±Infinity) at the ends of an item. */
  from: number;
  to: number;
  shift: number;
}

/** Each alignment item's (`WorkspaceItem.index`) pieces, in document order. An item no heard word sits on is absent: it has no place on the document clock. */
export type ItemClocks = ReadonlyMap<number, readonly ClockPiece[]>;

declare const onDocumentClock: unique symbol;

/** A peaks entry and the piece that places it on the document clock. Branded: a raw entry cannot be passed where one is wanted. */
export interface DocPeaks {
  readonly peaks: WorkspacePeaks;
  readonly piece: ClockPiece;
  readonly [onDocumentClock]: true;
}

const placed = (peaks: WorkspacePeaks, piece: ClockPiece): DocPeaks => ({ peaks, piece }) as DocPeaks;

/** `peaks` on the document clock at a constant `shift`, whatever the line is. Zero is the clock the entry is already on. */
export const shiftPeaks = (peaks: WorkspacePeaks, shift: number): DocPeaks => placed(peaks, { from: -Infinity, to: Infinity, shift });

/** The entry as one `DocPeaks` for each of the item's pieces: a take with a closed cut is two pieces at two shifts. */
export const placePeaks = (peaks: WorkspacePeaks, pieces: readonly ClockPiece[]): DocPeaks[] => pieces.map((piece) => placed(peaks, piece));

/** Clocks with no shift for each of `items`: every one lies on the document clock as it is (a chapter whose document is its recording; tests). */
export const sameClock = (items: Iterable<number>): ItemClocks => new Map([...items].map((i) => [i, [{ from: -Infinity, to: Infinity, shift: 0 }]]));

/** The entry's seconds on the document clock, before the piece clips it. */
export function docSpan(d: DocPeaks): readonly [number, number] {
  const { peaks, piece } = d;
  const from = peaks.startSeconds + piece.shift;
  return [Math.max(from, piece.from), Math.min(from + peaks.buckets / peaks.bucketsPerSecond, piece.to)];
}

/** Words whose shift differs by less than this are on one piece: the document rounds its times to a millisecond. */
const SAME_SHIFT = 0.005;
/** How far past its last word a piece runs before a cut or a re-laid pause: the runway the window keeps after a line's last word. */
const TAIL = RUNWAY_SECONDS;

interface Anchor {
  shift: number;
  from: number;
  to: number;
}

/**
 * Where each item's source seconds sit on the document clock. A heard script word has both: its source time (`off0`, on its item) and its
 * document time (`t0`, in the doc), so `shift = t0 - off0`; a run of words at one shift is one piece, running from its first word to the next
 * run's first word.
 *
 * Cuts: a closed cut makes the shift change inside a take, so the shift is not constant across it. The pieces split there, at the first word
 * after the cut, so nothing is drawn twice. The approximation is at that edge: the piece before it runs up to `TAIL` (0.35 s) past its last word
 * and the cut's own audio is not known here, so at most 0.35 s of audio next to the cut can be drawn where it is no longer heard (less when
 * the next word comes sooner), and the lead-in of the first word after the cut is not drawn. A word that was cut has no place of its own and is not an anchor.
 */
export function itemClocks(doc: ChapterDoc, answer: HeardAnswer): ItemClocks {
  const byItem = new Map<number, Anchor[]>();
  if (answer.heard) {
    for (const w of answer.heard.words) {
      if (w.paragraphId === undefined || w.ordinal === undefined) continue;
      const at = doc.index.get(`${w.paragraphId}:${w.ordinal}`);
      const it = at === undefined ? undefined : doc.items[at];
      if (!it || it.cut || it.st === 'miss' || it.t0 == null || it.t1 == null) continue;
      const list = byItem.get(w.item) ?? [];
      list.push({ shift: it.t0 - w.off0, from: it.t0, to: it.t1 });
      byItem.set(w.item, list);
    }
  }
  const out = new Map<number, ClockPiece[]>();
  for (const [item, anchors] of byItem) {
    anchors.sort((a, b) => a.from - b.from);
    const runs: Anchor[][] = [];
    for (const a of anchors) {
      const run = runs.at(-1);
      if (run && Math.abs(run[run.length - 1].shift - a.shift) < SAME_SHIFT) run.push(a);
      else runs.push([a]);
    }
    out.set(
      item,
      runs.map((run, k) => {
        const next = runs[k + 1];
        const last = run[run.length - 1];
        return {
          from: k === 0 ? -Infinity : run[0].from,
          to: Math.min(next ? next[0].from : Infinity, last.to + TAIL),
          shift: run.reduce((s, a) => s + a.shift, 0) / run.length,
        };
      }),
    );
  }
  return out;
}
