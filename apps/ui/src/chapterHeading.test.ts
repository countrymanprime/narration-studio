import { describe, expect, it } from 'vitest';
import type { ManuscriptChapter } from './api/contracts/manuscript';
import { cardLabel, chapterHeading, endedName } from './chapterHeading';

const chapter = (over: Partial<ManuscriptChapter>): ManuscriptChapter => ({
  id: 'c',
  title: 'Chapter 8',
  index: 0,
  wordCount: 1,
  status: 'not_started',
  contentKind: 'narration',
  ...over,
});

describe('chapter names come from the data in every heading style', () => {
  it('numbered: the label is the number, the title the second line', () => {
    expect(chapterHeading(chapter({ subtitle: "The Queen's Croquet-Ground" }))).toEqual({ label: 'Chapter 8', title: "The Queen's Croquet-Ground" });
  });

  it('a title that ends in a separator does not double it', () => {
    expect(chapterHeading(chapter({ title: 'CHAPTER VIII:', subtitle: 'Croquet' }))).toEqual({ label: 'CHAPTER VIII:', title: 'Croquet' });
  });

  it('titled: a chapter with one line has the title and no label', () => {
    expect(chapterHeading(chapter({ title: 'Prologue' }))).toEqual({ label: '', title: 'Prologue' });
  });

  it('a legacy title with its subtitle after a newline reads the same way', () => {
    expect(chapterHeading(chapter({ title: 'Chapter 2\nThe Pool of Tears' }))).toEqual({ label: 'Chapter 2', title: 'The Pool of Tears' });
  });

  it('credits: no label in the list, "Credits" on the card, lower case in the boundary', () => {
    const credits = chapter({ title: 'Opening Credits', contentKind: 'opening' });
    expect(chapterHeading(credits)).toEqual({ label: '', title: 'Opening Credits' });
    expect(cardLabel(credits)).toBe('Credits');
    expect(endedName(credits)).toBe('opening credits');
  });

  it('the boundary names a numbered chapter by its label', () => {
    expect(endedName(chapter({ subtitle: 'x' }))).toBe('Chapter 8');
    expect(cardLabel(chapter({ subtitle: 'x' }))).toBe('Chapter 8');
  });
});
