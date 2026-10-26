import { describe, expect, it } from 'vitest';
import { boothUnits, type ReadingParagraph } from '../reading/boothUnits';
import { WORDS_PER_PAGE, pageBreaks, wordsPerPageOf } from './pageBreaks';

const words = (n: number, from = 0) => Array.from({ length: n }, (_, i) => `w${from + i}`).join(' ');
const para = (id: string, text: string): ReadingParagraph => ({ id, text });

describe('pageBreaks', () => {
  const at = (paragraphs: ReadingParagraph[], perPage: number) =>
    pageBreaks(paragraphs, boothUnits(paragraphs), perPage).map(({ page, paragraphId, word, offset }) => ({ page, paragraphId, word, offset }));

  it('breaks after the last word of the paragraph the count reaches the page size in, never inside it', () => {
    // Word 5 is p1's fifth of seven words: the page runs on to p1's end, and p2 starts page 2.
    const paragraphs = [para('p1', `${words(3)}. ${words(4, 3)}.`), para('p2', words(6, 7)), para('p3', words(2, 13))];
    expect(at(paragraphs, 5)).toEqual([
      { page: 2, paragraphId: 'p2', word: 0, offset: 0 },
      { page: 3, paragraphId: 'p3', word: 0, offset: 0 },
    ]);
    const units = boothUnits(paragraphs);
    const first = pageBreaks(paragraphs, units, 5)[0]!;
    // The break is drawn at p2's first sentence, first word.
    expect(units[first.cur]).toMatchObject({ paragraphId: 'p2', start: 0 });
    expect(first.wcur).toBe(0);
  });

  it('counts the chapter heading as the first words of the first page (#2251 item 7)', () => {
    const body = [para('p1', words(3)), para('p2', words(4, 3)), para('p3', words(2, 7))];
    const heading: ReadingParagraph[] = [
      { id: 'chapter-heading-title', text: 'Chapter 7', heading: 'title' },
      { id: 'chapter-heading-subtitle', text: 'The Road', heading: 'subtitle' },
    ];
    // Without the heading, p1 and p2 make the first page (7 words); with it, the title and subtitle bring the count to 7 by p1's end.
    expect(at(body, 6).map((b) => b.paragraphId)).toEqual(['p3']);
    expect(at([...heading, ...body], 6).map((b) => b.paragraphId)).toEqual(['p2']);
  });

  it('breaks right after a paragraph whose last word is the page’s last', () => {
    const paragraphs = [para('p1', words(3)), para('p2', words(2, 3)), para('p3', words(4, 5))];
    expect(at(paragraphs, 5).map((b) => b.paragraphId)).toEqual(['p3']);
  });

  it('runs a page to the end of a paragraph whose first word is the page’s last', () => {
    const paragraphs = [para('p1', words(4)), para('p2', words(6, 4)), para('p3', words(3, 10))];
    expect(at(paragraphs, 5).map((b) => b.paragraphId)).toEqual(['p3']);
  });

  it('restarts the count after each break, so every page holds at least the page size and ends on a paragraph', () => {
    const paragraphs = [para('p1', words(7)), para('p2', words(2, 7)), para('p3', words(2, 9)), para('p4', words(1, 11)), para('p5', words(1, 12))];
    // Page 1: p1 (7). Page 2: p2 + p3 + p4 (5). Page 3: p5 (1), the chapter's last, with no break after it.
    expect(at(paragraphs, 5).map((b) => [b.page, b.paragraphId])).toEqual([
      [2, 'p2'],
      [3, 'p5'],
    ]);
  });

  it('lets a paragraph longer than a page make one long page, with no break inside it', () => {
    const huge = [para('p1', words(5000))];
    expect(at(huge, 250)).toEqual([]);
    const paragraphs = [para('p1', words(10)), para('p2', words(3000, 10)), para('p3', words(10, 3010))];
    expect(at(paragraphs, 250).map((b) => [b.page, b.paragraphId])).toEqual([[2, 'p3']]);
  });

  it('counts from the chapter’s first word and puts no break after its last paragraph', () => {
    const short = [para('p1', words(249))];
    expect(at(short, 250)).toEqual([]);
    const exact = [para('p1', words(250))];
    expect(at(exact, 250)).toEqual([]);
    expect(pageBreaks([], [], 250)).toEqual([]);
    // Two full pages: one break, before p2; none after p2, the chapter's end.
    const two = [para('p1', words(250)), para('p2', words(250, 250))];
    expect(at(two, 250)).toEqual([{ page: 2, paragraphId: 'p2', word: 0, offset: 0 }]);
    // Empty paragraphs at the end add no page, and the break skips an empty paragraph to the next words.
    const empties = [para('p1', words(5)), para('p2', ''), para('p3', words(2, 5)), para('p4', ' ')];
    expect(at(empties, 5).map((b) => b.paragraphId)).toEqual(['p3']);
    expect(at([para('p1', words(5)), para('p2', '')], 5)).toEqual([]);
  });

  it('follows a new page size: the same chapter breaks again from its first word', () => {
    const paragraphs = [para('p1', words(3)), para('p2', words(3, 3)), para('p3', words(3, 6)), para('p4', words(3, 9))];
    expect(at(paragraphs, 3).map((b) => b.paragraphId)).toEqual(['p2', 'p3', 'p4']);
    expect(at(paragraphs, 6).map((b) => b.paragraphId)).toEqual(['p3']);
    expect(at(paragraphs, 50)).toEqual([]);
  });

  it('counts emoji and right-to-left words as the progress line does (runs of non-space), and offsets the break to the paragraph’s first word', () => {
    const paragraphs = [para('p1', ['שלום', 'עולם', '🎨'].join(' ')), para('p2', '  🎨 a b'), para('p3', 'c')];
    expect(at(paragraphs, 2)).toEqual([
      { page: 2, paragraphId: 'p2', word: 0, offset: 2 },
      { page: 3, paragraphId: 'p3', word: 0, offset: 0 },
    ]);
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
