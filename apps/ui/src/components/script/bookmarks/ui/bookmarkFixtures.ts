import type { Bookmark } from '../../../../api/contracts/bookmarks';

const LINES: Record<string, string> = {
  p1: 'The rose-tree stood against the wall, and the gardeners were busily painting its roses red.',
  p2: 'Alice began to feel very curious about the garden.',
};

export const lineText = (bookmark: Bookmark): string | undefined => LINES[bookmark.paragraphId];

export const CHAPTERS = [
  { id: 'c1', name: 'Chapter 1' },
  { id: 'c2', name: 'Chapter 2' },
  { id: 'c3', name: 'Chapter 3' },
];

export const bookmark = (over: Partial<Bookmark> = {}): Bookmark => ({
  id: 'b1',
  chapterId: 'c1',
  paragraphId: 'p1',
  paragraph: 0,
  offset: 4,
  label: '',
  note: '',
  createdAt: '2026-10-11T10:00:00Z',
  stale: false,
  ...over,
});

export const NOTED = bookmark({ id: 'b2', label: 'Roses', note: 'Painting scene', offset: 40 });
export const STALE = bookmark({ id: 'b3', chapterId: 'c2', paragraphId: 'gone', paragraph: null, stale: true, staleReason: 'paragraph_missing' });
export const SEVERAL = [bookmark(), NOTED, bookmark({ id: 'b4', chapterId: 'c2', paragraphId: 'p2', offset: 6, note: 'Check the pace' }), STALE];
