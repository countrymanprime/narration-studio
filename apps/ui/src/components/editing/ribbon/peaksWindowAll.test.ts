import { describe, expect, it } from 'vitest';
import type { WorkspacePeaks } from '../../../api/contracts/workspace';
import { peakGain, peaksWindowAll } from './peaksWindow';
import { PEAK_GAIN_LIMIT } from './peaksWindow';
import { sameClock, shiftPeaks } from './docClock';
import { pickEntries, type RibbonPeaks } from './useRibbonPeaks';

const clocks = sameClock([0, 1, 2, 3]);

/** One bucket per second from `start`, one [min, max] pair per value. */
function entry(start: number, values: number[]): WorkspacePeaks {
  const bytes = new Int8Array(values.flatMap((v) => [-v, v]));
  return {
    startSeconds: start,
    bucketsPerSecond: 1,
    buckets: values.length,
    minMax: btoa(String.fromCharCode(...new Uint8Array(bytes.buffer))),
    sampleRate: 48000,
    channels: 1,
  };
}

// A line can run across more than one audio item (a take, a cut): its waveform is all of them, not the first one's part of it.
describe('peaksWindowAll', () => {
  const first = entry(0, [10, 20, 30]); // 0 to 3 s
  const second = entry(3, [40, 50, 60]); // 3 to 6 s

  it('draws a window that crosses two items from both', () => {
    const w = peaksWindowAll([shiftPeaks(first, 0), shiftPeaks(second, 0)], 1, 5, 4)!;
    expect(w.map((c) => c[1])).toEqual([20, 30, 40, 50]);
  });

  it('leaves silence where no item has audio between two that do', () => {
    const later = entry(5, [70, 80]); // 5 to 7 s, with 3 to 5 s empty
    const w = peaksWindowAll([shiftPeaks(first, 0), shiftPeaks(later, 0)], 2, 6, 4)!;
    expect(w.map((c) => c[1])).toEqual([30, 0, 0, 70]);
  });

  it('covers the whole window when one item covers it, as peaksWindow does', () => {
    const w = peaksWindowAll([shiftPeaks(first, 0), shiftPeaks(second, 0)], 0, 3, 3)!;
    expect(w.map((c) => c[1])).toEqual([10, 20, 30]);
  });

  it('is null when nothing overlaps or the window is empty', () => {
    expect(peaksWindowAll([shiftPeaks(first, 0)], 4, 5, 4)).toBeNull();
    expect(peaksWindowAll([], 0, 5, 4)).toBeNull();
    expect(peaksWindowAll([shiftPeaks(first, 0)], 1, 1, 4)).toBeNull();
  });
});

describe('pickEntries', () => {
  const ready = (...peaks: WorkspacePeaks[]): RibbonPeaks => ({
    status: 'ready',
    result: { chapterId: 'c-1', items: peaks.map((p, index) => ({ index, peaks: p })) },
  });

  it('returns every item the window touches, earliest first', () => {
    const state = ready(entry(3, [1, 2, 3]), entry(0, [1, 2, 3]), entry(10, [1, 2, 3]));
    const got = pickEntries(state, clocks, 1, 5);
    expect('peaks' in got && got.peaks.map((p) => p.peaks.startSeconds)).toEqual([0, 3]);
  });

  it('says why there is none, as before', () => {
    expect(pickEntries({ status: 'loading' }, clocks, 0, 1)).toEqual({ reason: 'Reading the waveform.' });
    expect(pickEntries(ready(entry(0, [1])), clocks, 5, 6)).toEqual({ reason: 'This line lies outside the audio the host read.' });
  });
});

// Two items can have the same stretch of their own recording, so time alone cannot say which item's audio a line is: the line's item does.
describe("pickEntries by the line's items", () => {
  // A paragraph is often several REAPER items cut from one recording: each covers its own stretch of the same clock.
  const state: RibbonPeaks = {
    status: 'ready',
    result: {
      chapterId: 'c-1',
      items: [
        { index: 0, peaks: entry(0, [10, 10, 10, 10]) },
        { index: 1, peaks: entry(4, [20, 20, 20, 20]) },
        { index: 2, peaks: entry(0, [90, 90, 90, 90]) },
        { index: 3, reason: "this item's source audio was not found" },
      ],
    },
  };
  const starts = (got: ReturnType<typeof pickEntries>) => ('peaks' in got ? got.peaks.map((p) => p.peaks.startSeconds) : got);

  it("draws every one of the line's items the window touches, and no other item that covers the same time", () => {
    expect(starts(pickEntries(state, clocks, 2, 7, [0, 1]))).toEqual([0, 4]);
  });
  it('leaves out an item of the line that the window does not reach', () => {
    expect(starts(pickEntries(state, clocks, 1, 3, [0, 1]))).toEqual([0]);
  });
  it("says why when none of the line's items has a waveform, rather than drawing another item's", () => {
    expect(pickEntries(state, clocks, 1, 3, [3])).toEqual({ reason: "this item's source audio was not found" });
  });
  it("draws the items that have a waveform when another of the line's items has none", () => {
    expect(starts(pickEntries(state, clocks, 1, 3, [0, 3]))).toEqual([0]);
  });
  it('says the line is outside the audio when the window misses all of its items', () => {
    expect(pickEntries(state, clocks, 10, 12, [0, 1])).toEqual({ reason: 'This line lies outside the audio the host read.' });
  });
  it('keeps the time match when the line has no known item', () => {
    expect(pickEntries(state, clocks, 1, 3)).toEqual(pickEntries(state, clocks, 1, 3, []));
    const got = pickEntries(state, clocks, 1, 3);
    expect('peaks' in got && got.peaks).toHaveLength(2);
  });
});

// REAPER draws a quiet recording larger than its raw level (item gain, track height), and speech peaking near a quarter of full scale is a
// row of dots at the raw scale. The ribbon scales the whole chapter so its loudest bar fills the room, keeping the lines' loudness in step.
describe('peakGain', () => {
  const state = (...items: WorkspacePeaks[]): RibbonPeaks => ({
    status: 'ready',
    result: { chapterId: 'c-1', items: items.map((peaks, index) => ({ index, peaks })) },
  });

  it("scales the chapter's loudest bucket up to full scale", () => {
    // 30 of 127 is 0.236 of full scale: a gain of 127/30.
    expect(peakGain(state(entry(0, [5, 30, 10])))).toBeCloseTo(127 / 30, 6);
  });
  it('takes the loudest bucket over every item, so a quiet line stays quieter than a loud one', () => {
    expect(peakGain(state(entry(0, [10, 20]), entry(4, [60, 5])))).toBeCloseTo(127 / 60, 6);
  });
  it('never turns the waveform down', () => {
    expect(peakGain(state(entry(0, [127, 127])))).toBe(1);
  });
  it('stops at a limit, so near silence is not blown up into noise', () => {
    expect(peakGain(state(entry(0, [1, 1, 1])))).toBe(PEAK_GAIN_LIMIT);
  });
  it('is 1 with no peaks, while loading, or after a failure', () => {
    expect(peakGain({ status: 'loading' })).toBe(1);
    expect(peakGain({ status: 'failed', reason: 'x' })).toBe(1);
    expect(peakGain({ status: 'ready', result: { chapterId: 'c-1', items: [{ index: 0, reason: 'none' }] } })).toBe(1);
  });
});
