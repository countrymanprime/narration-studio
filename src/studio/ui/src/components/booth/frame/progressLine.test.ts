// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { WPH } from '../../schedule/estimates';
import { progressLine, timerText } from './progressLine';

describe('the-progress-line-of-a-chapter-recorded-to-the-end', () => {
  it('says only where the reading is: a share and a time left would read as recording work, beside "Complete" (#2633)', () => {
    expect(progressLine({ paragraph: 1, paragraphs: 24, wordsRead: 0, words: 400, complete: true })).toBe('At ¶ 1 of 24');
    expect(progressLine({ paragraph: 1200, paragraphs: 1200, wordsRead: 5, words: 400, complete: true })).toBe('At ¶ 1,200 of 1,200');
  });
});

describe('the-progress-line-reads-paragraph-percent-and-time-left', () => {
  it('reads paragraph n of N, the share of the words and the time left at the standard rate', () => {
    const words = WPH / 6; // ten finished minutes
    expect(progressLine({ paragraph: 38, paragraphs: 71, wordsRead: Math.round(words * 0.59), words })).toBe('¶ 38 of 71 · 59% · ~4:06 of audio left');
  });
  it('is 0% and the whole time at the start, and 100% and 0:00 at the end', () => {
    expect(progressLine({ paragraph: 1, paragraphs: 2, wordsRead: 0, words: WPH / 60 })).toBe('¶ 1 of 2 · 0% · ~1:00 of audio left');
    expect(progressLine({ paragraph: 2, paragraphs: 2, wordsRead: 99, words: 50 })).toBe('¶ 2 of 2 · 100% · ~0:00 of audio left');
  });
  it('does not divide by an empty chapter', () => {
    expect(progressLine({ paragraph: 0, paragraphs: 0, wordsRead: 0, words: 0 })).toBe('¶ 0 of 0 · 0% · ~0:00 of audio left');
  });
  it('writes the take timer as mm:ss', () => {
    expect(timerText(402)).toBe('06:42');
    expect(timerText(3725)).toBe('1:02:05');
  });
});
