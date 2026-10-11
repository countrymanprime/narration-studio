// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { boothUnits, readingParagraphs, sentenceRanges, unitWords } from './boothUnits';
import { backPhrase, nextPhrase, positionOf, stepWord, unitAtPosition } from './readingPosition';
import { sampleParagraphs } from './fixture';

const units = boothUnits(sampleParagraphs);

describe('steps-by-word-and-phrase', () => {
  it('a word step past the end of a phrase starts the next one, and back again', () => {
    const last = units[0].words - 1;
    expect(stepWord(units, { cur: 0, wcur: last }, 1)).toEqual({ cur: 1, wcur: 0 });
    expect(stepWord(units, { cur: 1, wcur: 0 }, -1)).toEqual({ cur: 0, wcur: last });
    expect(stepWord(units, { cur: 0, wcur: 1 }, 1)).toEqual({ cur: 0, wcur: 2 });
  });

  it('stops at the ends of the chapter', () => {
    expect(stepWord(units, { cur: 0, wcur: 0 }, -1)).toEqual({ cur: 0, wcur: 0 });
    const end = { cur: units.length - 1, wcur: units.at(-1)!.words - 1 };
    expect(stepWord(units, end, 1)).toEqual(end);
  });

  it('nextPhrase and backPhrase clamp at the ends', () => {
    expect(backPhrase({ cur: 0, wcur: 3 })).toEqual({ cur: 0, wcur: 0 });
    expect(nextPhrase(units, { cur: units.length - 1, wcur: 2 })).toEqual({ cur: units.length - 1, wcur: 0 });
    expect(nextPhrase(units, { cur: 0, wcur: 2 })).toEqual({ cur: 1, wcur: 0 });
  });

  it('a position in the paragraphs and one in the sentences find each other', () => {
    for (const at of [
      { cur: 0, wcur: 2 },
      { cur: 3, wcur: 1 },
      { cur: units.length - 1, wcur: 0 },
    ]) {
      const position = positionOf(sampleParagraphs, units, at)!;
      expect(unitAtPosition(sampleParagraphs, units, position)).toEqual(at);
    }
    expect(unitAtPosition(sampleParagraphs, units, { paragraphId: 'nope', word: 0 })).toBeNull();
  });
});

describe('a-narration-paragraph-with-no-quotes-is-not-one-jump', () => {
  it('splits at sentence ends and covers the text exactly', () => {
    const text = 'One here. Two there! Three? Four…';
    const ranges = sentenceRanges(text, 0, text.length);
    expect(ranges.length).toBe(4);
    expect(ranges.map(([a, b]) => text.slice(a, b)).join('')).toBe(text);
  });

  it('does not split after an abbreviation', () => {
    const text = 'Dr. Smith came. Mr. Jones left.';
    expect(sentenceRanges(text, 0, text.length).map(([a, b]) => text.slice(a, b))).toEqual(['Dr. Smith came. ', 'Mr. Jones left.']);
  });

  it('marks the later sentences of a quotation as continued', () => {
    const quoted = units.filter((u) => u.quoted);
    expect(quoted.map((u) => u.cont)).toEqual([false, false, true]);
    expect(units.map((u) => u.text).join('')).toBe(sampleParagraphs.map((p) => p.text).join(''));
  });
});

describe('a-chapter-with-no-text-shows-the-placeholder', () => {
  it('is one paragraph', () => {
    const paragraphs = readingParagraphs([]);
    expect(paragraphs).toHaveLength(1);
    expect(paragraphs[0].text).toBe('Chapter text appears here.');
  });
});

describe('unitWords', () => {
  it('keeps the space after a word out of the word', () => {
    const { words, lead } = unitWords(sampleParagraphs[0], units[0]);
    expect(lead).toBe('');
    expect(words.map((w) => w.text)).toEqual(['The', 'garden', 'was', 'quiet.']);
    expect(words[0].gap).toBe(' ');
  });
});
