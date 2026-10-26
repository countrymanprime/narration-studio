// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CHAPTER_PLACES_KEPT, loadChapterPlace, loadLastPlace, saveLastPlace } from './lastPlace';

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe('the Booth remembers where the narrator left it, per project', () => {
  it('returns what was saved, for that project only', () => {
    saveLastPlace('/books/a', { chapterId: 'c2', paragraphId: 'p9', word: 4 });
    expect(loadLastPlace('/books/a')).toEqual({ chapterId: 'c2', paragraphId: 'p9', word: 4 });
    expect(loadLastPlace('/books/b')).toBeNull();
  });

  it('keeps projects with spaces, Unicode and a trailing dot apart', () => {
    saveLastPlace('/books/my book', { chapterId: 'c1', paragraphId: 'p1', word: 0 });
    saveLastPlace('/books/日本.', { chapterId: 'c3', paragraphId: 'p2', word: 1 });
    expect(loadLastPlace('/books/my book')?.chapterId).toBe('c1');
    expect(loadLastPlace('/books/日本.')?.chapterId).toBe('c3');
    expect(loadLastPlace('/books/日本')).toBeNull();
  });

  it.each([
    ['not JSON', '{'],
    ['a number', '5'],
    ['null', 'null'],
    ['an object with no chapter', '{"paragraphId":"p1","word":2}'],
    ['an empty chapter', '{"chapterId":"","word":2}'],
  ])('reads %s as nothing stored', (_, raw) => {
    window.localStorage.setItem('narration.booth.lastPlace./p', raw);
    expect(loadLastPlace('/p')).toBeNull();
  });

  it('takes a bad word number as the start of the paragraph', () => {
    window.localStorage.setItem('narration.booth.lastPlace./p', '{"chapterId":"c1","paragraphId":"p1","word":-3}');
    expect(loadLastPlace('/p')).toEqual({ chapterId: 'c1', paragraphId: 'p1', word: 0 });
  });

  it('survives storage that throws, on read and on write', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full');
    });
    expect(loadLastPlace('/p')).toBeNull();
    expect(() => saveLastPlace('/p', { chapterId: 'c1', paragraphId: 'p1', word: 0 })).not.toThrow();
  });
});

describe('the Booth remembers the place in every chapter, not only the last one', () => {
  it('keeps each chapter its own place when the narrator moves between chapters', () => {
    saveLastPlace('/books/a', { chapterId: 'c1', paragraphId: 'p4', word: 7 });
    saveLastPlace('/books/a', { chapterId: 'c2', paragraphId: 'p20', word: 1 });
    expect(loadChapterPlace('/books/a', 'c1')).toEqual({ paragraphId: 'p4', word: 7 });
    expect(loadChapterPlace('/books/a', 'c2')).toEqual({ paragraphId: 'p20', word: 1 });
    expect(loadChapterPlace('/books/a', 'c3')).toBeNull();
    expect(loadChapterPlace('/books/b', 'c1')).toBeNull();
    // The last chapter left is still the one the Booth opens on with no chapter asked for.
    expect(loadLastPlace('/books/a')?.chapterId).toBe('c2');
  });

  it('reads a place kept before places were kept per chapter as that chapter’s place', () => {
    window.localStorage.setItem('narration.booth.lastPlace./p', '{"chapterId":"c1","paragraphId":"p1","word":3}');
    expect(loadChapterPlace('/p', 'c1')).toEqual({ paragraphId: 'p1', word: 3 });
    expect(loadChapterPlace('/p', 'c2')).toBeNull();
  });

  it.each([
    ['not JSON', '{'],
    ['an array', '[1,2]'],
    ['a place with no paragraph', '{"c1":{"word":2}}'],
    ['a place that is a string', '{"c1":"p1"}'],
  ])('reads %s as nothing kept', (_, raw) => {
    window.localStorage.setItem('narration.booth.chapterPlaces./p', raw);
    expect(loadChapterPlace('/p', 'c1')).toBeNull();
  });

  it('keeps the most recent chapters when a project has more than it can hold', () => {
    for (let i = 0; i < CHAPTER_PLACES_KEPT + 5; i += 1) saveLastPlace('/big', { chapterId: `c${i}`, paragraphId: 'p', word: i });
    expect(loadChapterPlace('/big', 'c0')).toBeNull();
    expect(loadChapterPlace('/big', `c${CHAPTER_PLACES_KEPT + 4}`)).toEqual({ paragraphId: 'p', word: CHAPTER_PLACES_KEPT + 4 });
  });

  it('opens as it would without storage when storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => saveLastPlace('/p', { chapterId: 'c1', paragraphId: 'p1', word: 0 })).not.toThrow();
    expect(loadChapterPlace('/p', 'c1')).toBeNull();
  });
});
