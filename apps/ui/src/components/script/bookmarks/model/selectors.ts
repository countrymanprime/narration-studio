// The bookmarks model's pure selectors (ADR 0820). They take the host's list as it comes (already in reading order) and know nothing
// of the Script DOM, so the Booth's ribbons (SNO-8) can import them too.
import type { Bookmark } from '../../../../api/contracts/bookmarks';

/** A place in the manuscript. `paragraph` is the line's manuscript index, null when unknown. */
export type Spot = { chapterId: string; paragraph: number | null; offset: number };

/** The current text of a bookmark's line, or undefined when the line is gone. The caller owns where manuscript text lives. */
export type LineText = (bookmark: Bookmark) => string | undefined;

/** What a stale bookmark with no label is called. */
const STALE_TITLE = 'Line changed';

/** The bookmarks in reading order. The host sorts them; this keeps that order and copies, so a caller can't change the host's list. */
export const sortedBookmarks = (list: readonly Bookmark[]): Bookmark[] => [...list];

/** The bookmarks of each chapter that has any, chapters in the order given, bookmarks in the host's order. */
export function bookmarksByChapter<C extends { id: string }>(list: readonly Bookmark[], chapters: readonly C[]): Array<{ chapter: C; items: Bookmark[] }> {
  return chapters.map((chapter) => ({ chapter, items: list.filter((b) => b.chapterId === chapter.id) })).filter((g) => g.items.length > 0);
}

/** The words the mark sits on, from the start of its word, cut at `max` characters. Empty for a stale bookmark. */
export function bookmarkSnippet(bookmark: Bookmark, lineText: LineText, max = 56): string {
  if (bookmark.stale) return '';
  const text = lineText(bookmark) ?? '';
  let from = Math.min(bookmark.offset, text.length);
  while (from > 0 && /\S/.test(text[from - 1]) && /\S/.test(text[from] ?? ' ')) from--;
  const rest = text.slice(from).replace(/\s+/g, ' ').trim();
  if (rest.length <= max) return rest;
  const cut = rest.slice(0, max);
  return cut.slice(0, Math.max(cut.lastIndexOf(' '), Math.floor(max / 2))).trimEnd() + '…';
}

/** What the mark is called: its label, else the words it sits on, else "Line changed" for a stale one. */
export function bookmarkTitle(bookmark: Bookmark, lineText: LineText): string {
  return bookmark.label.trim() || (bookmark.stale ? STALE_TITLE : bookmarkSnippet(bookmark, lineText));
}

/** What its tooltip says: the label and the note, or the title when it has neither. */
export function bookmarkTip(bookmark: Bookmark, lineText: LineText): string {
  return [bookmark.label.trim(), bookmark.note.trim()].filter(Boolean).join(': ') || bookmarkTitle(bookmark, lineText);
}

const spotOf = (b: Bookmark): Spot => ({ chapterId: b.chapterId, paragraph: b.paragraph, offset: b.offset });

/**
 * The bookmark after (`dir` 1) or before (-1) `from`, wrapping round the book, and whether it wrapped (went past the last to the first,
 * or back from the first to the last). It never answers the place `from` already is, and skips stale ones (they have no place to go to).
 * With no `from`, the first (or last), which is not a wrap. Null when there is nowhere else to go.
 */
export function stepBookmarksWrapped(
  list: readonly Bookmark[],
  chapters: readonly { id: string }[],
  dir: 1 | -1,
  from: Spot | null,
): { bookmark: Bookmark; wrapped: boolean } | null {
  const live = list.filter((b) => !b.stale && b.paragraph !== null);
  if (live.length === 0) return null;
  if (!from) return { bookmark: dir > 0 ? live[0] : live[live.length - 1], wrapped: false };
  const chapterAt = new Map(chapters.map((c, i) => [c.id, i]));
  const key = (s: Spot): [number, number, number] => [chapterAt.get(s.chapterId) ?? -1, s.paragraph ?? -1, s.offset];
  const cmp = (a: Spot, b: Spot): number => {
    const x = key(a);
    const y = key(b);
    return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
  };
  const others = live.filter((b) => cmp(spotOf(b), from) !== 0);
  if (others.length === 0) return null;
  const ahead = dir > 0 ? others.find((b) => cmp(spotOf(b), from) > 0) : [...others].reverse().find((b) => cmp(spotOf(b), from) < 0);
  return ahead ? { bookmark: ahead, wrapped: false } : { bookmark: dir > 0 ? others[0] : others[others.length - 1], wrapped: true };
}

/** `stepBookmarksWrapped` without the wrap: the bookmark after or before `from`, or null. */
export function stepBookmarks(list: readonly Bookmark[], chapters: readonly { id: string }[], dir: 1 | -1, from: Spot | null): Bookmark | null {
  return stepBookmarksWrapped(list, chapters, dir, from)?.bookmark ?? null;
}
