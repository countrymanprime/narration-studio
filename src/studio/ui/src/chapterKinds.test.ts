import { describe, expect, it } from 'vitest';
import { lastReadOrFirstTextChapter } from './chapterKinds';

describe('lastReadOrFirstTextChapter', () => {
  const chapters = [
    { id: 'credits-opening', title: 'Opening credits', isCredits: true },
    { id: 'a', title: 'b' },
    { id: 'b', title: 'Chapter B' },
  ];

  it('matches an id before a title: a chapter titled like another chapter id does not take its place', () => {
    expect(lastReadOrFirstTextChapter(chapters, 'b')?.id).toBe('b');
  });

  it('matches a title when no id fits', () => {
    expect(lastReadOrFirstTextChapter(chapters, 'Chapter B')?.id).toBe('b');
  });

  it.each([
    ['not set', undefined],
    ['empty', ''],
    ['not in the list', 'zzz'],
  ])('falls to the first chapter with text, not the opening credits, when the last read is %s', (_name, lastRead) => {
    expect(lastReadOrFirstTextChapter(chapters, lastRead)?.id).toBe('a');
  });

  it('falls to the first chapter of a book that has only credits', () => {
    expect(lastReadOrFirstTextChapter([chapters[0]!], undefined)?.id).toBe('credits-opening');
  });

  it('has nothing for an empty book', () => {
    expect(lastReadOrFirstTextChapter([], 'a')).toBeUndefined();
  });
});
