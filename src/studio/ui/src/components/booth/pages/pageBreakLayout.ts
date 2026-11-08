// Where the Booth's pages break: at the end of the paragraph in which a page's count reaches `words_per_page`, never inside one, counted
// from the chapter's first word with the progress line's word count (runs of non-space, `wordCount`). A page is at least that many words
// and ends on a paragraph; a paragraph longer than a page makes one long page. A break is a word (the next paragraph's first), never a
// place on screen, so it stays put at any text size or width.
import { wordCount, type BoothUnit, type ReadingParagraph } from '../reading/boothUnits';

/** Booth.words_per_page: the default (a manuscript page) and the range the host accepts. */
export const WORDS_PER_PAGE = 250;
const WORDS_PER_PAGE_MIN = 50;
const WORDS_PER_PAGE_MAX = 1000;

/** One page break: the page that starts at this word, where the word is in the text (sentence and word for drawing, paragraph and offset
 * for a bookmark), and the word's number in its paragraph. */
export type PageBreak = { page: number; cur: number; wcur: number; paragraphId: string; word: number; offset: number };

/**
 * The breaks of a chapter: before the first word of the paragraph after the one that brings the page to `perPage` words, the count
 * starting again from that word. Paragraphs with no words take no part, and nothing breaks after the chapter's last words, so a chapter of
 * one page, or of one paragraph, has none.
 */
export function pageBreaks(paragraphs: readonly ReadingParagraph[], units: readonly BoothUnit[], perPage: number): PageBreak[] {
  if (!(perPage >= 1)) return [];
  const breaks: PageBreak[] = [];
  let count = 0;
  let paragraphIndex = -1;
  units.forEach((unit, cur) => {
    // An empty paragraph's unit counts as a word for stepping (`boothUnits`), but it has none to break before or to count.
    if (wordCount(unit.text) === 0) return;
    if (unit.paragraphIndex !== paragraphIndex && count >= perPage) {
      const text = paragraphs[unit.paragraphIndex]?.text ?? '';
      const word = wordCount(text.slice(0, unit.start));
      const offset = [...text.matchAll(/\S+/g)][word]?.index ?? 0;
      breaks.push({ page: breaks.length + 2, cur, wcur: 0, paragraphId: unit.paragraphId, word, offset });
      count = 0;
    }
    paragraphIndex = unit.paragraphIndex;
    count += unit.words;
  });
  return breaks;
}

/** The words per page a project settings answer holds; the default when it is absent or not a whole number from 50 to 1000, as the host reads it. */
export function wordsPerPageOf(fields: Record<string, readonly { key: string; effectiveValue: string }[]>): number {
  const field = fields.Booth?.find((f) => f.key === 'words_per_page');
  const value = Number(field?.effectiveValue);
  return field && field.effectiveValue !== '' && Number.isInteger(value) && value >= WORDS_PER_PAGE_MIN && value <= WORDS_PER_PAGE_MAX ? value : WORDS_PER_PAGE;
}
