import { describe, expect, it } from 'vitest';
import type { Bookmark } from '../../../../api/contracts/bookmarks';
import {
  bookmarksByChapter,
  bookmarkSnippet,
  bookmarkTip,
  bookmarkTitle,
  sortedBookmarks,
  stepBookmarks,
  stepBookmarksWrapped,
  type LineText,
} from './selectors';

const chapters = [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }];
const make = (id: string, chapterId: string, paragraph: number | null, offset: number, extra: Partial<Bookmark> = {}): Bookmark => ({
  id,
  chapterId,
  paragraphId: `p${paragraph}`,
  paragraph,
  offset,
  label: '',
  note: '',
  createdAt: '2026-10-11T00:00:00Z',
  stale: false,
  ...extra,
});
const text: LineText = () => 'The rose-tree stood in the middle of the garden and was painted red by the gardeners';
const at = (b: Bookmark | null) => b && `${b.chapterId}:${b.paragraph}:${b.offset}`;

describe('lists-in-reading-order-by-chapter', () => {
  const list = [make('a', 'c1', 2, 5), make('b', 'c1', 2, 40), make('c', 'c3', 1, 0)];
  it('keeps the host order and groups by chapter, skipping chapters with none', () => {
    expect(sortedBookmarks(list).map((b) => b.id)).toEqual(['a', 'b', 'c']);
    expect(sortedBookmarks(list)).not.toBe(list);
    expect(bookmarksByChapter(list, chapters).map((g) => [g.chapter.id, g.items.map((b) => b.id)])).toEqual([
      ['c1', ['a', 'b']],
      ['c3', ['c']],
    ]);
  });
});

describe('names-by-label-else-the-words-it-sits-on', () => {
  it('titles by label, else the line from the start of the word at the offset', () => {
    const b = make('a', 'c1', 1, 8);
    expect(bookmarkSnippet(b, text)).toMatch(/^rose-tree stood/);
    expect(bookmarkTitle(b, text)).toBe(bookmarkSnippet(b, text));
    expect(bookmarkSnippet(b, text, 20).endsWith('…')).toBe(true);
    expect(bookmarkTitle({ ...b, label: ' Roses ' }, text)).toBe('Roses');
  });
  it('the tip says label and note, else the title', () => {
    const b = make('a', 'c1', 1, 8);
    expect(bookmarkTip({ ...b, label: 'Roses', note: 'Painting scene' }, text)).toBe('Roses: Painting scene');
    expect(bookmarkTip(b, text)).toBe(bookmarkTitle(b, text));
  });
  it('a stale bookmark is its label or "Line changed" and has no snippet', () => {
    const stale = make('a', 'c1', null, 8, { stale: true, staleReason: 'paragraph_missing' });
    expect(bookmarkSnippet(stale, text)).toBe('');
    expect(bookmarkTitle(stale, text)).toBe('Line changed');
    expect(bookmarkTitle({ ...stale, label: 'Gardeners' }, text)).toBe('Gardeners');
  });
});

describe('steps-forward-and-back-wrapping', () => {
  const list = [make('a', 'c1', 2, 0), make('b', 'c2', 1, 40), make('c', 'c3', 3, 5)];
  const from = (b: Bookmark) => ({ chapterId: b.chapterId, paragraph: b.paragraph, offset: b.offset });
  it('with no place, the first or the last', () => {
    expect(at(stepBookmarks(list, chapters, 1, null))).toBe('c1:2:0');
    expect(at(stepBookmarks(list, chapters, -1, null))).toBe('c3:3:5');
  });
  it('steps on, wraps round the book, and never lands where it is', () => {
    expect(at(stepBookmarks(list, chapters, 1, from(list[0])))).toBe('c2:1:40');
    expect(at(stepBookmarks(list, chapters, 1, from(list[2])))).toBe('c1:2:0');
    expect(at(stepBookmarks(list, chapters, -1, from(list[0])))).toBe('c3:3:5');
    expect(at(stepBookmarks(list, chapters, 1, { chapterId: 'c1', paragraph: 2, offset: -1 }))).toBe('c1:2:0');
    expect(stepBookmarks([list[0]], chapters, 1, from(list[0]))).toBeNull();
  });
  it('says when a step went round the book, and only then', () => {
    expect(stepBookmarksWrapped(list, chapters, 1, from(list[0]))?.wrapped).toBe(false);
    expect(stepBookmarksWrapped(list, chapters, 1, from(list[2]))?.wrapped).toBe(true);
    expect(stepBookmarksWrapped(list, chapters, -1, from(list[0]))?.wrapped).toBe(true);
    expect(stepBookmarksWrapped(list, chapters, -1, from(list[2]))?.wrapped).toBe(false);
    expect(stepBookmarksWrapped(list, chapters, 1, null)?.wrapped).toBe(false);
    expect(stepBookmarksWrapped([], chapters, 1, null)).toBeNull();
  });
  it('does nothing with no bookmarks, and skips stale ones', () => {
    expect(stepBookmarks([], chapters, 1, null)).toBeNull();
    const stale = make('s', 'c2', null, 0, { stale: true });
    expect(at(stepBookmarks([list[0], stale, list[2]], chapters, 1, from(list[0])))).toBe('c3:3:5');
    expect(stepBookmarks([stale], chapters, 1, null)).toBeNull();
  });
});
