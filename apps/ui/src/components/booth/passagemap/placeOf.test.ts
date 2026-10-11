import { describe, expect, it } from 'vitest';
import { boothUnits, type ReadingParagraph } from '../reading/boothUnits';
import { placeOf } from './placeOf';

const paragraphs: ReadingParagraph[] = [
  { id: 'p1', text: 'One two three. Four five six.' },
  { id: 'p2', text: 'Seven eight.' },
];
const units = boothUnits(paragraphs);

describe('placeOf', () => {
  it('placeOf-is-paragraph-and-word: a position is the paragraph id and the word number in it', () => {
    expect(units.map((u) => u.text.trim())).toEqual(['One two three.', 'Four five six.', 'Seven eight.']);
    expect(placeOf(paragraphs, units, { cur: 0, wcur: 0 })).toEqual({ pid: 'p1', word: 0 });
    expect(placeOf(paragraphs, units, { cur: 1, wcur: 0 })).toEqual({ pid: 'p1', word: 3 });
    expect(placeOf(paragraphs, units, { cur: 1, wcur: 2 })).toEqual({ pid: 'p1', word: 5 });
    expect(placeOf(paragraphs, units, { cur: 2, wcur: 1 })).toEqual({ pid: 'p2', word: 1 });
  });

  it('placeOf-is-paragraph-and-word: clamped to the chapter', () => {
    expect(placeOf(paragraphs, units, { cur: 99, wcur: 99 })).toEqual({ pid: 'p2', word: 2 });
    expect(placeOf(paragraphs, units, { cur: -4, wcur: -4 })).toEqual({ pid: 'p1', word: 0 });
  });

  it('is null when the chapter has no sentences', () => {
    expect(placeOf([], [], { cur: 0, wcur: 0 })).toBeNull();
  });
});
