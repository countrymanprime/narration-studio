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

  // #3869 (delta qa N6): a chapter whose row reads 1% (a host 0 with a second or more on the track) adds to the recorded hours, so the tile and the stage bar agree with the row.
  describe('a chapter its row shows at 1% adds to the recorded hours', () => {
    const zero = { paragraphId: 'p1', paragraph: 1, word: 0, percent: 0, complete: false, source: 'booth' as const, confident: true };
    it('adds the measured hours for a host 0 with audio (as with no host percent), and nothing without', () => {
      const book = (recordedSeconds: number) =>
        bookFigures([chapter('c1', { status: 'recording', wordCount: WPH, recordedSeconds, recordedThrough: zero })], WPH);
      expect(book(36).recordedHours).toBeCloseTo(0.01, 6);
      expect(book(12).recordedHours).toBeCloseTo(12 / 3600, 6);
      expect(book(1).recordedHours).toBeGreaterThan(0);
      expect(book(0).recordedHours).toBe(0);
      expect(book(0.5).recordedHours).toBe(0);
    });
    it('one second on a ten-hour chapter adds the same hours with the host at 0 and with no host percent (qa B1)', () => {
      const hours = (recordedThrough?: typeof zero) =>
        bookFigures([chapter('c1', { status: 'recording', wordCount: WPH * 10, recordedSeconds: 1, recordedThrough })], WPH).recordedHours;
      expect(hours(zero)).toBe(hours(undefined));
      expect(hours(zero)).toBeLessThan(1 / 60);
    });
  });
});
