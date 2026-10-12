// Where a bookmark sits in the Booth's text (ADR 0820). A bookmark is a paragraph and a character offset; the Booth reads by paragraph and
// word number (`ReadingPosition`), so these turn one into the other. A bookmark is always at the start of a word when the Booth makes it.
import type { Bookmark } from '../../../api/contracts/bookmarks';
import type { BookmarkSpot } from '../../../studio/commands/bookmarks';
import { wordCount, type BoothUnit, type ReadingParagraph } from '../reading/boothUnits';
import type { ReadingPosition } from '../reading/readingPosition';

/** The offset where the nth word of a paragraph starts, or null when it has fewer words. */
function wordStart(text: string, word: number): number | null {
  return [...text.matchAll(/\S+/g)][word]?.index ?? null;
}

/** The spot of the word being read: the start of that word. Null when there is no position or no such word. */
export function spotAtPosition(chapterId: string, paragraphs: readonly ReadingParagraph[], position: ReadingPosition | undefined): BookmarkSpot | null {
  const paragraph = position && paragraphs.find((p) => p.id === position.paragraphId);
  const offset = paragraph && position ? wordStart(paragraph.text, position.word) : null;
  return paragraph && offset !== null ? { chapterId, paragraphId: paragraph.id, offset } : null;
}

/**
 * The word a bookmark is on, or null when it has none to be drawn at: a stale bookmark is never placed on a guessed word, and a line
 * that is not in this chapter's text has no word here.
 */
export function positionOfBookmark(paragraphs: readonly ReadingParagraph[], bookmark: Bookmark): ReadingPosition | null {
  if (bookmark.stale) return null;
  const paragraph = paragraphs.find((p) => p.id === bookmark.paragraphId);
  if (!paragraph) return null;
  const words = [...paragraph.text.matchAll(/\S+/g)];
  // The word whose characters hold the offset, else the one the offset falls before.
  const at = words.findIndex((match) => bookmark.offset < match.index + match[0].length);
  return { paragraphId: paragraph.id, word: at === -1 ? Math.max(0, words.length - 1) : at };
}

/** The spot of a clicked word (`[data-word]` inside its sentence's `[data-unit]`), or null when the target is not a word of the text. */
export function spotOfWord(chapterId: string, paragraphs: readonly ReadingParagraph[], units: readonly BoothUnit[], target: Element): BookmarkSpot | null {
  const word = target.closest<HTMLElement>('[data-word]');
  const sentence = word?.closest<HTMLElement>('[data-unit]');
  const unit = sentence && units[Number(sentence.dataset.unit)];
  const paragraph = unit && paragraphs[unit.paragraphIndex];
  if (!word || !unit || !paragraph) return null;
  return spotAtPosition(chapterId, paragraphs, { paragraphId: paragraph.id, word: wordCount(paragraph.text.slice(0, unit.start)) + Number(word.dataset.word) });
}
