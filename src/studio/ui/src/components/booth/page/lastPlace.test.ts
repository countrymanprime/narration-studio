// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadLastPlace, saveLastPlace } from './lastPlace';

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
