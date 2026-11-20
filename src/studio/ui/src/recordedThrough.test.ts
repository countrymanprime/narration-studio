import { describe, expect, it } from 'vitest';
import type { RecordedThrough } from './api/contracts/manuscript';
import { chapterRecordedDetail, recordedPercent, recordedThroughLabel } from './recordedThrough';

const PARAGRAPHS = [
  { id: 'p1', text: 'Alice was beginning to get very tired.' },
  { id: 'p2', text: 'So she was considering in her own mind.' },
];

const through = (over: Partial<RecordedThrough> = {}): RecordedThrough => ({
  paragraphId: 'p2',
  word: 3,
  percent: 45,
  complete: false,
  source: 'booth',
  confident: true,
  ...over,
});

describe('what the Booth says about how far a chapter is recorded', () => {
  it('quotes the last recorded line and the share', () => {
    expect(recordedThroughLabel(through(), PARAGRAPHS)).toEqual({
      short: '45%',
      text: 'Recorded through “So she was considering” (45%)',
      complete: false,
    });
  });

  it('says Complete for the whole chapter', () => {
    expect(recordedThroughLabel(through({ percent: 100, complete: true }), PARAGRAPHS)).toEqual({
      short: 'Complete',
      text: 'Recorded: complete',
      complete: true,
    });
  });

  it('says about for an estimate from the track’s length', () => {
    expect(recordedThroughLabel(through({ word: 5, source: 'daw', confident: false, percent: 30 }), PARAGRAPHS)).toMatchObject({
      short: '~30%',
      text: 'Recorded through about “…was considering in her” (~30%, from the track’s length)',
    });
    expect(recordedThroughLabel(through({ source: 'daw', confident: false, percent: 100, complete: true }), PARAGRAPHS)).toMatchObject({
      short: 'Complete?',
      text: 'Recorded: about complete (from the track’s length)',
    });
  });

  it('says only the share when the line is not in the text any more, and nothing with nothing recorded', () => {
    expect(recordedThroughLabel(through({ paragraphId: 'gone' }), PARAGRAPHS)).toMatchObject({ text: 'Recorded through 45% of the chapter' });
    expect(recordedThroughLabel(undefined, PARAGRAPHS)).toBeNull();
  });

  it('keeps emoji and right-to-left words whole in the quote', () => {
    const rtl = [{ id: 'r1', text: 'שלום 👋🏽 עולם יפה מאוד' }];
    expect(recordedThroughLabel(through({ paragraphId: 'r1', word: 2 }), rtl)?.text).toBe('Recorded through “שלום 👋🏽 עולם” (45%)');
  });

  it('gives a chapter list the short note, the same for every page', () => {
    expect(chapterRecordedDetail({ recordedThrough: through() })).toBe('45%');
    expect(chapterRecordedDetail({ recordedThrough: through({ complete: true, percent: 100 }) })).toBe('Complete');
    expect(chapterRecordedDetail({ recordedThrough: through({ confident: false, source: 'daw', percent: 30 }) })).toBe('~30%');
    expect(chapterRecordedDetail({})).toBeUndefined();
  });
});

// #3443: the one percent the Record cell and Next up show. 0 only with no measured audio; any audio is at least 1; only the host's complete is 100.
describe('recordedPercent', () => {
  const chapter = (recordedSeconds: number | null, recordedThrough?: RecordedThrough) => ({ recordedSeconds, wordCount: 9300, recordedThrough });
  it('any measured audio is at least 1%, and none is 0%', () => {
    for (const [seconds, percent] of [
      [0, 0],
      [0.001, 1],
      [1, 1],
      [18, 1],
      [35.99, 1],
      [36, 1],
      [72, 2],
      [3599, 99],
      [3600, 99],
      [7200, 99],
    ] as const)
      expect(recordedPercent(chapter(seconds), 9300), `${seconds} s of 3600 s`).toBe(percent);
  });
  it('is null when nothing is measured', () => {
    expect(recordedPercent(chapter(null), 9300)).toBeNull();
    expect(recordedPercent({ recordedSeconds: 10, wordCount: 0 }, 9300)).toBeNull();
  });
  it("takes the host's percent, 100 only when it says complete; a host 0 is 0 with no audio and 1 with audio on the track", () => {
    expect(recordedPercent(chapter(null, through({ percent: 40 })), 9300)).toBe(40);
    expect(recordedPercent(chapter(null, through({ percent: 100, complete: false })), 9300)).toBe(99);
    expect(recordedPercent(chapter(null, through({ percent: 100, complete: true })), 9300)).toBe(100);
    expect(recordedPercent(chapter(0, through({ percent: 0 })), 9300)).toBe(0);
    expect(recordedPercent(chapter(null, through({ percent: 0 })), 9300)).toBe(0);
    expect(recordedPercent(chapter(12, through({ percent: 0 })), 9300)).toBe(1);
  });
});
