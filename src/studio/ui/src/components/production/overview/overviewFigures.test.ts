// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { WPH } from '../../schedule/estimates';
import { chapter } from '../pipeline/pipelineFixtures';
import { bookFigures } from './overviewFigures';

// #3869 (delta qa N1): the "Recorded audio" tile and "Where the book stands" are made of the book's recorded hours; a chapter with under a second of audio adds nothing to them, as at 0 s.
describe('a chapter with under a second of audio adds nothing to the recorded hours', () => {
  const book = (recordedSeconds: number) => bookFigures([chapter('c1', { status: 'recording', wordCount: WPH, recordedSeconds })], WPH);
  it('reads as 0 s for 0.001, 0.5 and 0.999999 s', () => {
    const zero = book(0);
    expect(zero.recordedHours).toBe(0);
    for (const seconds of [0.001, 0.5, 0.999999]) expect(book(seconds), `${seconds} s`).toEqual(zero);
  });
  it('adds its share from one second', () => {
    expect(book(36).recordedHours).toBeCloseTo(0.01, 6);
    expect(book(1).recordedHours).toBeGreaterThan(0);
  });
});
