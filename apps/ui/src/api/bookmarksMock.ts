// The browser mock's bookmarks. It keeps them in memory and checks each one against the mock manuscript's current text the
// way apps/desktop/internal/bookmarks does: a spot the manuscript lacks is refused, the same spot twice is one bookmark, the
// list is in reading order, and a bookmark whose line is gone or whose offset no longer fits comes back stale, never moved.
import { BOOKMARK_LABEL_MAX, BOOKMARK_NOTE_MAX } from './contracts/bookmarks';
import type { Bookmark, BookmarksApi, ManuscriptChapter, ManuscriptParagraph } from '../types';
import { wireClone } from './mockFixtures';

type Stored = Omit<Bookmark, 'paragraph' | 'stale' | 'staleReason'>;

/** Whether a UTF-16 offset is a place in the text: from 0 to its length, never between the halves of a surrogate pair. */
const fits = (text: string, offset: number) => {
  if (!Number.isInteger(offset) || offset < 0 || offset > text.length) return false;
  const before = text.charCodeAt(offset - 1);
  return !(offset > 0 && offset < text.length && before >= 0xd800 && before <= 0xdbff);
};

// eslint-disable-next-line no-control-regex -- the point is to find control characters
const controlCharacters = /[\u0000-\u001f\u007f-\u009f]/;

function checkText(text: string, name: string, limit: number, multiline: boolean) {
  if (text.length > limit) throw new Error(`a bookmark's ${name} can be at most ${limit} characters`);
  const checked = multiline ? text.replace(/[\n\t]/g, '') : text;
  if (controlCharacters.test(checked)) {
    throw new Error(multiline ? `a bookmark's ${name} can hold only text, line breaks and tabs` : `a bookmark's ${name} is one line of text`);
  }
}

export function createBookmarksMock(ready: Promise<unknown>, chapters: () => ManuscriptChapter[], paragraphs: () => ManuscriptParagraph[]): BookmarksApi {
  let nextId = 1;
  let stored: Stored[] = [];

  const lineOf = (bookmark: Pick<Stored, 'chapterId' | 'paragraphId'>) =>
    paragraphs().find((paragraph) => paragraph.id === bookmark.paragraphId && paragraph.chapterId === bookmark.chapterId);

  const resolve = (bookmark: Stored): Bookmark => {
    const line = lineOf(bookmark);
    if (!line) return { ...bookmark, paragraph: null, stale: true, staleReason: 'paragraph_missing' };
    return fits(line.text, bookmark.offset)
      ? { ...bookmark, paragraph: line.index, stale: false }
      : { ...bookmark, paragraph: line.index, stale: true, staleReason: 'offset_out_of_range' };
  };

  const list = (): Bookmark[] => {
    const position = new Map(paragraphs().map((paragraph, index) => [`${paragraph.chapterId}\u0000${paragraph.id}`, index]));
    const at = (bookmark: Bookmark) => position.get(`${bookmark.chapterId}\u0000${bookmark.paragraphId}`) ?? Number.MAX_SAFE_INTEGER;
    return wireClone(
      stored.map(resolve).sort((a, b) => at(a) - at(b) || a.offset - b.offset || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)),
    );
  };

  return {
    bookmarksList: async () => {
      await ready;
      return list();
    },
    bookmarksAdd: async (chapterId, paragraphId, offset) => {
      await ready;
      if (!chapters().some((chapter) => chapter.id === chapterId)) throw new Error('that chapter is not in the manuscript');
      const line = lineOf({ chapterId, paragraphId });
      if (!line) throw new Error('that line is not in this chapter');
      if (!fits(line.text, offset)) throw new Error('that place is not in the line');
      const existing = stored.find((bookmark) => bookmark.chapterId === chapterId && bookmark.paragraphId === paragraphId && bookmark.offset === offset);
      if (existing) return wireClone(resolve(existing));
      const bookmark: Stored = { id: `bookmark-${nextId++}`, chapterId, paragraphId, offset, label: '', note: '', createdAt: new Date().toISOString() };
      stored = [...stored, bookmark];
      return wireClone(resolve(bookmark));
    },
    bookmarksUpdate: async (id, label, note) => {
      await ready;
      const cleanLabel = label.trim();
      const cleanNote = note.replaceAll('\r\n', '\n').trim();
      checkText(cleanLabel, 'label', BOOKMARK_LABEL_MAX, false);
      checkText(cleanNote, 'note', BOOKMARK_NOTE_MAX, true);
      const current = stored.find((bookmark) => bookmark.id === id);
      if (!current) throw new Error('that bookmark is no longer there');
      const updated = { ...current, label: cleanLabel, note: cleanNote };
      stored = stored.map((bookmark) => (bookmark.id === id ? updated : bookmark));
      return wireClone(resolve(updated));
    },
    bookmarksRemove: async (id) => {
      await ready;
      stored = stored.filter((bookmark) => bookmark.id !== id);
      return list();
    },
  };
}
