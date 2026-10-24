import { describe, expect, it } from 'vitest';
import { boothUnits, type ReadingParagraph } from '../reading/boothUnits';
import { WORDS_PER_PAGE, pageBreaks, wordsPerPageOf } from './pageBreaks';

const words = (n: number, from = 0) => Array.from({ length: n }, (_, i) => `w${from + i}`).join(' ');
const para = (id: string, text: string): ReadingParagraph => ({ id, text });

describe('pageBreaks', () => {
  it('breaks before every nth word of the chapter, counted from its first word, across paragraphs and sentences', () => {
    const paragraphs = [para('p1', `${words(3)}. ${words(4, 3)}.`), para('p2', words(6, 7))];
    const breaks = pageBreaks(paragraphs, boothUnits(paragraphs), 5);
    // Words 5 and 10 of 13: p1's sixth word, then p2's fourth.
    expect(breaks.map(({ page, paragraphId, word }) => ({ page, paragraphId, word }))).toEqual([
      { page: 2, paragraphId: 'p1', word: 5 },
      { page: 3, paragraphId: 'p2', word: 3 },
    ]);
    const units = boothUnits(paragraphs);
    const first = breaks[0]!;
    expect(units[first.cur]?.paragraphId).toBe('p1');
    expect(first.wcur).toBe(5 - units.slice(0, first.cur).reduce((sum, unit) => sum + unit.words, 0));
    expect(first.offset).toBe(`${words(3)}. ${words(2, 3)} `.length);
  });

  it('draws no break in a chapter shorter than a page, or exactly one page long', () => {
    const short = [para('p1', words(249))];
    expect(pageBreaks(short, boothUnits(short), 250)).toEqual([]);
    const exact = [para('p1', words(250))];
    expect(pageBreaks(exact, boothUnits(exact), 250)).toEqual([]);
    expect(pageBreaks([], [], 250)).toEqual([]);
    const one = [para('p1', words(251))];
    expect(pageBreaks(one, boothUnits(one), 250)).toMatchObject([{ page: 2, word: 250 }]);
  });

  it('counts a very long paragraph, emoji and right-to-left words as the progress line does (runs of non-space)', () => {
    const text = ['שלום', 'עולם', '🎨', 'a', 'b', 'c'].join(' ');
    const paragraphs = [para('p1', text)];
    expect(pageBreaks(paragraphs, boothUnits(paragraphs), 2).map((b) => b.offset)).toEqual([text.indexOf('🎨'), text.indexOf('b')]);
    const long = [para('p1', words(5000))];
    expect(pageBreaks(long, boothUnits(long), 1000).map((b) => b.page)).toEqual([2, 3, 4, 5]);
  });
});

describe('wordsPerPageOf', () => {
  const answer = (effectiveValue: string) => ({ Booth: [{ key: 'words_per_page', effectiveValue }] });
  it('reads the project setting, and the default for an absent or bad value', () => {
    expect(wordsPerPageOf(answer('300'))).toBe(300);
    expect(wordsPerPageOf(answer('50'))).toBe(50);
    expect(wordsPerPageOf(answer('1000'))).toBe(1000);
    for (const bad of ['49', '1001', '250.5', 'many', '']) expect(wordsPerPageOf(answer(bad))).toBe(WORDS_PER_PAGE);
    expect(wordsPerPageOf({})).toBe(WORDS_PER_PAGE);
  });
});
