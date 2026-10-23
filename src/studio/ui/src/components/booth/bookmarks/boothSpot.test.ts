// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { Bookmark } from '../../../api/contracts/bookmarks';
import { sampleParagraphs } from '../reading/fixture';
import { boothUnits } from '../reading/boothUnits';
import { positionOfBookmark, spotAtPosition, spotOfWord } from './boothSpot';

const bookmark = (over: Partial<Bookmark> = {}): Bookmark => ({
  id: 'b1',
  chapterId: 'c1',
  paragraphId: 'p1',
  paragraph: 0,
  offset: 0,
  label: '',
  note: '',
  createdAt: '2026-10-11T10:00:00Z',
  stale: false,
  ...over,
});

// p1: "The garden was quiet. Nobody had come down since the morning." Word 4 is "Nobody", starting at offset 22.
describe('spotAtPosition', () => {
  it('b-bookmarks-the-reading-position: the spot is the start of the word being read', () => {
    expect(spotAtPosition('c1', sampleParagraphs, { paragraphId: 'p1', word: 4 })).toEqual({ chapterId: 'c1', paragraphId: 'p1', offset: 22 });
    expect(spotAtPosition('c1', sampleParagraphs, { paragraphId: 'p1', word: 0 })).toEqual({ chapterId: 'c1', paragraphId: 'p1', offset: 0 });
  });

  it('keeps a quotation mark with its word, so the offset is where the word is drawn from', () => {
    const at = sampleParagraphs[1].text.indexOf('said');
    expect(spotAtPosition('c1', sampleParagraphs, { paragraphId: 'p2', word: 4 })).toEqual({ chapterId: 'c1', paragraphId: 'p2', offset: at });
  });

  it('is null with no position, an unknown paragraph, or a word past the end', () => {
    expect(spotAtPosition('c1', sampleParagraphs, undefined)).toBeNull();
    expect(spotAtPosition('c1', sampleParagraphs, { paragraphId: 'nope', word: 0 })).toBeNull();
    expect(spotAtPosition('c1', sampleParagraphs, { paragraphId: 'p3', word: 99 })).toBeNull();
  });
});

describe('positionOfBookmark', () => {
  it('puts a bookmark on the word its offset is at', () => {
    expect(positionOfBookmark(sampleParagraphs, bookmark({ offset: 22 }))).toEqual({ paragraphId: 'p1', word: 4 });
    expect(positionOfBookmark(sampleParagraphs, bookmark({ offset: 0 }))).toEqual({ paragraphId: 'p1', word: 0 });
  });

  it('a-stale-bookmark-is-drawn-flagged-not-moved: a stale bookmark has no word, and a line outside the chapter has none either', () => {
    expect(positionOfBookmark(sampleParagraphs, bookmark({ stale: true, staleReason: 'offset_out_of_range', offset: 400 }))).toBeNull();
    expect(positionOfBookmark(sampleParagraphs, bookmark({ paragraphId: 'elsewhere' }))).toBeNull();
  });
});

describe('spotOfWord', () => {
  const units = boothUnits(sampleParagraphs);
  const word = (unit: number, index: number): Element => {
    const host = document.createElement('div');
    host.innerHTML = `<span data-unit="${unit}"><span data-word="${index}">x</span></span>`;
    return host.querySelector('[data-word]')!;
  };

  it('right-click-offers-bookmark-here-on-the-clicked-word: a word of the second sentence counts the first sentence’s words', () => {
    // Unit 1 is "Nobody had come down since the morning." of p1; its word 2 is "come", the 7th word of the paragraph.
    expect(spotOfWord('c1', sampleParagraphs, units, word(1, 2))).toEqual({
      chapterId: 'c1',
      paragraphId: 'p1',
      offset: sampleParagraphs[0].text.indexOf('come'),
    });
  });

  it('is null for a target that is not a word', () => {
    const plain = document.createElement('p');
    expect(spotOfWord('c1', sampleParagraphs, units, plain)).toBeNull();
    expect(spotOfWord('c1', sampleParagraphs, units, word(99, 0))).toBeNull();
  });
});
