import { describe, expect, it } from 'vitest';
import type { WorkspaceItem, WorkspacePeaksResult } from '../../../api/contracts/workspace';
import type { PlaylistSegment } from '../playlist';
import { barsFor, joinedDuration, joinPeaks } from './peaksJoin';

const seg = (itemGuid: string, elapsedStart: number, elapsedEnd: number): PlaylistSegment => ({
  itemGuid,
  sourceFile: 'f.wav',
  sourceStart: 0,
  sourceEnd: elapsedEnd - elapsedStart,
  elapsedStart,
  elapsedEnd,
  overlapsPrevious: false,
});
const item = (itemGuid: string, index: number) => ({ itemGuid, index }) as WorkspaceItem;
// Two buckets: (-127, 127) then (-64, 64).
const minMax = btoa(String.fromCharCode(129, 127, 192, 64));
const peaks: WorkspacePeaksResult = {
  chapterId: 'c',
  items: [
    { index: 0, peaks: { startSeconds: 0, bucketsPerSecond: 1, buckets: 2, minMax, sampleRate: 48000, channels: 1 } },
    { index: 1, reason: 'no waveform' },
  ],
};

describe('joinPeaks', () => {
  const segments = joinPeaks([seg('a', 0, 10), seg('b', 10, 20), seg('x', 20, 30)], [item('a', 0), item('b', 1)], peaks);
  it('lays items end to start and keeps a slot for an item with no peaks', () => {
    expect(segments.map((s) => [s.start, s.end, !!s.entry?.peaks])).toEqual([
      [0, 10, true],
      [10, 20, false],
      [20, 30, false],
    ]);
    expect(joinedDuration(segments)).toBe(30);
  });
  it('draws bars from the buckets and a flat line elsewhere', () => {
    const bars = barsFor(segments, 0, 30, 30);
    expect(bars[2].flat).toBe(false);
    expect(bars[2].high).toBeCloseTo(1);
    expect(bars[7].high).toBeCloseTo(64 / 127);
    expect(bars[12].flat).toBe(true);
    expect(bars[25].flat).toBe(true);
  });
  it('is empty before the peaks load', () => {
    expect(joinPeaks([seg('a', 0, 10)], [item('a', 0)], undefined)[0].entry).toBeUndefined();
  });
});
