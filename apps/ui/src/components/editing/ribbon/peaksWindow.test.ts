import { describe, expect, it, vi } from 'vitest';
import { shiftPeaks } from './docClock';
import type { WorkspacePeaks } from '../../../api/contracts/workspace';
import { peaksWindow } from './peaksWindow';

/** 10 buckets per second from 2 s, `values` as [min, max] pairs. */
function entry(values: number[][]): WorkspacePeaks {
  const bytes = new Int8Array(values.flat());
  return {
    startSeconds: 2,
    bucketsPerSecond: 10,
    buckets: values.length,
    minMax: btoa(String.fromCharCode(...new Uint8Array(bytes.buffer))),
    sampleRate: 48000,
    channels: 1,
  };
}

describe('peaksWindow', () => {
  const peaks = entry([
    [-10, 10],
    [-20, 20],
    [-30, 30],
    [-40, 40],
    [-50, 50],
    [-60, 60],
    [-70, 70],
    [-80, 80],
    [-90, 90],
    [-100, 100],
  ]);

  it('cuts the window of the span, one column per pixel', () => {
    const w = peaksWindow(shiftPeaks(peaks, 0), 2.2, 2.6, 4);
    expect(w).not.toBeNull();
    expect(w!.map((c) => c[1])).toEqual([30, 40, 50, 60]);
    expect(w![0][0]).toBe(-30);
  });

  it('is null when the span lies outside the entry', () => {
    expect(peaksWindow(shiftPeaks(peaks, 0), 5, 6, 4)).toBeNull();
    expect(peaksWindow(shiftPeaks(peaks, 0), 0, 1.5, 4)).toBeNull();
  });

  it('draws the covered part only when the span overlaps the entry edge', () => {
    const w = peaksWindow(shiftPeaks(peaks, 0), 2.8, 3.2, 4);
    expect(w![0][1]).toBe(90);
    expect(w![3]).toEqual([0, 0]);
  });

  it('is null for an empty span or no columns', () => {
    expect(peaksWindow(shiftPeaks(peaks, 0), 3, 3, 4)).toBeNull();
    expect(peaksWindow(shiftPeaks(peaks, 0), 2, 3, 0)).toBeNull();
  });
});

describe('peaksWindow decoding', () => {
  it('decodes an entry once however many windows are taken from it', () => {
    const peaks = entry([
      [-10, 10],
      [-20, 20],
      [-30, 30],
      [-40, 40],
    ]);
    const atob = vi.spyOn(globalThis, 'atob');
    const a = peaksWindow(shiftPeaks(peaks, 0), 2, 2.4, 4);
    const b = peaksWindow(shiftPeaks(peaks, 0), 2, 2.4, 2);
    const c = peaksWindow(shiftPeaks(peaks, 0), 2.1, 2.4, 3);
    expect(atob).toHaveBeenCalledTimes(1);
    expect(a).toEqual([
      [-10, 10],
      [-20, 20],
      [-30, 30],
      [-40, 40],
    ]);
    expect(b).toEqual([
      [-20, 20],
      [-40, 40],
    ]);
    expect(c).not.toBeNull();
    atob.mockRestore();
  });

  it('decodes a new entry object again, so a changed chapter is never drawn from a stale cache', () => {
    const atob = vi.spyOn(globalThis, 'atob');
    peaksWindow(shiftPeaks(entry([[-1, 1]]), 0), 2, 2.1, 1);
    peaksWindow(shiftPeaks(entry([[-2, 2]]), 0), 2, 2.1, 1);
    expect(atob).toHaveBeenCalledTimes(2);
    atob.mockRestore();
  });
});
