import type { Bookmark } from '../../../../api/contracts/bookmarks';

const LINES: Record<string, string> = {
  p1: 'The rose-tree stood against the wall, and the gardeners were busily painting its roses red.',
  p2: 'Alice began to feel very curious about the garden.',
};

export const lineText = (bookmark: Bookmark): string | undefined => LINES[bookmark.paragraphId];

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
