// Where the Booth's pages break: every `words_per_page` words of the chapter, counted from its first word with the progress line's
// word count (runs of non-space, `wordCount`). A break is a word, never a place on screen, so it stays put at any text size or width.
import { wordCount, type BoothUnit, type ReadingParagraph } from '../reading/boothUnits';

/** Booth.words_per_page: the default (a manuscript page) and the range the host accepts. */
export const WORDS_PER_PAGE = 250;
const WORDS_PER_PAGE_MIN = 50;
const WORDS_PER_PAGE_MAX = 1000;

/** One page break: the page that starts at this word, where the word is in the text (sentence and word for drawing, paragraph and offset
 * for a bookmark), and the word's number in its paragraph. */
export type PageBreak = { page: number; cur: number; wcur: number; paragraphId: string; word: number; offset: number };

/** The breaks of a chapter: before word n × perPage for every n ≥ 1 that is a word of it. A chapter of a page or less has none. */
export function pageBreaks(paragraphs: readonly ReadingParagraph[], units: readonly BoothUnit[], perPage: number): PageBreak[] {
  if (!(perPage >= 1)) return [];
  const breaks: PageBreak[] = [];
  let before = 0;
  units.forEach((unit, cur) => {
    let next = (Math.floor(before / perPage) + 1) * perPage;
    while (next < before + unit.words) {
      const text = paragraphs[unit.paragraphIndex]?.text ?? '';
      const wcur = next - before;
      const word = wordCount(text.slice(0, unit.start)) + wcur;
      const offset = [...text.matchAll(/\S+/g)][word]?.index ?? 0;
      breaks.push({ page: next / perPage + 1, cur, wcur, paragraphId: unit.paragraphId, word, offset });
      next += perPage;
    }
    before += unit.words;
  });
  return breaks;
}

/** The words per page a project settings answer holds; the default when it is absent or not a whole number from 50 to 1000, as the host reads it. */
export function wordsPerPageOf(fields: Record<string, readonly { key: string; effectiveValue: string }[]>): number {
  const field = fields.Booth?.find((f) => f.key === 'words_per_page');
  const value = Number(field?.effectiveValue);
  return field && field.effectiveValue !== '' && Number.isInteger(value) && value >= WORDS_PER_PAGE_MIN && value <= WORDS_PER_PAGE_MAX ? value : WORDS_PER_PAGE;
}
