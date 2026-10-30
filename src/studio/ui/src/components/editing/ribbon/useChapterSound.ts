import { useCallback, useRef } from 'react';
import type { Envelope } from '../model/audioTail';
import { peaksWindowAll } from './peaksWindow';
import type { DocPeaks, ItemClocks } from './docClock';
import { pickEntries, useRibbonPeaks } from './useRibbonPeaks';

/** The chapter's levels over `[from, to]` on the document's clock, or undefined when the audio's peaks are not read (yet) or do not cover it. */
export type SoundAt = (from: number, to: number) => Envelope | undefined;

const FULL_SCALE = 127;
/** The share of a chapter's levels that are taken to be the room (the quietest tenth). */
const ROOM_SHARE = 0.1;

const rooms = new WeakMap<object, number>();
/** The level of the room in `peaks`: the quietest tenth of its buckets, from the whole chapter so a window with no pause in it still knows it. */
function roomLevel(entry: DocPeaks): number {
  const known = rooms.get(entry.peaks);
  if (known !== undefined) return known;
  const bytes = Uint8Array.from(atob(entry.peaks.minMax), (c) => c.charCodeAt(0));
  const counts = new Array<number>(FULL_SCALE + 1).fill(0);
  const buckets = bytes.length >> 1;
  for (let k = 0; k < buckets; k += 1) {
    const lo = bytes[2 * k] > 127 ? 256 - bytes[2 * k] : bytes[2 * k];
    const hi = bytes[2 * k + 1] > 127 ? 256 - bytes[2 * k + 1] : bytes[2 * k + 1];
    counts[Math.min(FULL_SCALE, Math.max(lo, hi))] += 1;
  }
  let seen = 0;
  let level = 0;
  while (level < FULL_SCALE && seen + counts[level] < ROOM_SHARE * buckets) {
    seen += counts[level];
    level += 1;
  }
  const room = level / FULL_SCALE;
  rooms.set(entry.peaks, room);
  return room;
}

/**
 * The levels of `entries` over `[from, to]` on the document's clock, one level for each of the first entry's buckets. The window is widened to
 * the bucket grid: a level read across two half buckets takes the louder, which fills the dip between two words and hides where one ends.
 */
export function envelopeOf(entries: readonly DocPeaks[], from: number, to: number): Envelope | undefined {
  if (!(to > from) || entries.length === 0) return undefined;
  const { peaks, piece } = entries[0];
  const rate = peaks.bucketsPerSecond;
  if (!(rate > 0)) return undefined;
  const origin = peaks.startSeconds + piece.shift;
  const first = Math.floor((from - origin) * rate + 1e-9);
  const columns = Math.max(1, Math.ceil((to - origin) * rate - 1e-9) - first);
  const start = origin + first / rate;
  const window = peaksWindowAll(entries, start, start + columns / rate, columns);
  if (!window) return undefined;
  return { start, step: 1 / rate, level: window.map(([lo, hi]) => Math.max(Math.abs(lo), Math.abs(hi)) / FULL_SCALE), floor: roomLevel(entries[0]) };
}

/**
 * What a play needs to end a word where its sound dies away (`audioTail`): the levels of the chapter's audio, from the peaks the ribbon has read
 * (one shared read per chapter, so asking costs nothing more). The function is stable and reads the latest peaks when called.
 */
export function useChapterSound(chapterId: string | undefined, clocks: ItemClocks): SoundAt {
  const peaks = useRibbonPeaks(chapterId);
  const live = useRef({ peaks, clocks });
  live.current = { peaks, clocks };
  return useCallback((from, to) => {
    if (!(to > from)) return undefined;
    const picked = pickEntries(live.current.peaks, live.current.clocks, from, to);
    return 'reason' in picked ? undefined : envelopeOf(picked.peaks, from, to);
  }, []);
}
