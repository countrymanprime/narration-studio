import { useCallback, useRef } from 'react';
import type { Envelope } from '../model/audioTail';
import { peaksWindowAll } from './peaksWindow';
import type { ItemClocks } from './docClock';
import { pickEntries, useRibbonPeaks } from './useRibbonPeaks';

/** The chapter's levels over `[from, to]` on the document's clock, or undefined when the audio's peaks are not read (yet) or do not cover it. */
export type SoundAt = (from: number, to: number) => Envelope | undefined;

/** Seconds of one level: the host's peaks have one bucket per 20 ms (`measure.DefaultPeaksPerSecond`). */
const STEP_SECONDS = 0.02;
const FULL_SCALE = 127;

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
    if ('reason' in picked) return undefined;
    const columns = Math.max(1, Math.ceil((to - from) / STEP_SECONDS));
    const window = peaksWindowAll(picked.peaks, from, to, columns);
    if (!window) return undefined;
    return { start: from, step: (to - from) / columns, level: window.map(([lo, hi]) => Math.max(Math.abs(lo), Math.abs(hi)) / FULL_SCALE) };
  }, []);
}
