import { describe, expect, it } from 'vitest';
import type { WorkspacePeaks } from '../../../api/contracts/workspace';
import { peaksWindowAll } from './peaksWindow';
import { pickEntries, type RibbonPeaks } from './useRibbonPeaks';

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
    const w = peaksWindowAll([first, second], 1, 5, 4)!;
    expect(w.map((c) => c[1])).toEqual([20, 30, 40, 50]);
  });

  it('leaves silence where no item has audio between two that do', () => {
    const later = entry(5, [70, 80]); // 5 to 7 s, with 3 to 5 s empty
    const w = peaksWindowAll([first, later], 2, 6, 4)!;
    expect(w.map((c) => c[1])).toEqual([30, 0, 0, 70]);
  });

  it('covers the whole window when one item covers it, as peaksWindow does', () => {
    const w = peaksWindowAll([first, second], 0, 3, 3)!;
    expect(w.map((c) => c[1])).toEqual([10, 20, 30]);
  });

  it('is null when nothing overlaps or the window is empty', () => {
    expect(peaksWindowAll([first], 4, 5, 4)).toBeNull();
    expect(peaksWindowAll([], 0, 5, 4)).toBeNull();
    expect(peaksWindowAll([first], 1, 1, 4)).toBeNull();
  });
});

describe('pickEntries', () => {
  const ready = (...peaks: WorkspacePeaks[]): RibbonPeaks => ({
    status: 'ready',
    result: { chapterId: 'c-1', items: peaks.map((p, index) => ({ index, peaks: p })) },
  });

  it('returns every item the window touches, earliest first', () => {
    const state = ready(entry(3, [1, 2, 3]), entry(0, [1, 2, 3]), entry(10, [1, 2, 3]));
    const got = pickEntries(state, 1, 5);
    expect('peaks' in got && got.peaks.map((p) => p.startSeconds)).toEqual([0, 3]);
  });

  it('says why there is none, as before', () => {
    expect(pickEntries({ status: 'loading' }, 0, 1)).toEqual({ reason: 'Reading the waveform.' });
    expect(pickEntries(ready(entry(0, [1])), 5, 6)).toEqual({ reason: 'This line lies outside the audio the host read.' });
  });
});

// Two items can have the same stretch of their own recording, so time alone cannot say which item's audio a line is: the line's item does.
describe("pickEntries by the line's item", () => {
  const state: RibbonPeaks = {
    status: 'ready',
    result: {
      chapterId: 'c-1',
      items: [
        { index: 0, peaks: entry(0, [10, 10, 10, 10]) },
        { index: 1, peaks: entry(0, [90, 90, 90, 90]) },
        { index: 2, reason: "this item's source audio was not found" },
      ],
    },
  };

  it("uses the line's own item and not another that covers the same time", () => {
    const got = pickEntries(state, 1, 3, 1);
    expect('peaks' in got && got.peaks.map((p) => p.startSeconds)).toEqual([0]);
    expect('peaks' in got && peaksWindowAll(got.peaks, 1, 3, 2)!.map((c) => c[1])).toEqual([90, 90]);
  });

  it("says why when the line's item has no waveform, rather than drawing another item's", () => {
    expect(pickEntries(state, 1, 3, 2)).toEqual({ reason: "this item's source audio was not found" });
  });

  it("says the line is outside the item's audio when the window misses it", () => {
    expect(pickEntries(state, 10, 12, 0)).toEqual({ reason: 'This line lies outside the audio the host read.' });
  });

  it('keeps the time match when the line has no known item', () => {
    const got = pickEntries(state, 1, 3);
    expect('peaks' in got && got.peaks).toHaveLength(2);
  });
});
