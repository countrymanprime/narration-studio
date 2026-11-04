// Find in the manuscript (SNB-7h): the search over the chapters' paragraph text, ported from the mock's `selectors/search.ts`.
// Pure: it takes the paragraphs it is given and returns where a term appears, so a story or a test needs no host. The Booth searches
// its chapter with it; the Script page searches the whole book on the host and reads the answer with `bookMatches`.

import type { ManuscriptParagraph, ManuscriptSearchResult } from '../../../../../api/contracts/manuscript';

/** A term shorter than this (after trimming) searches nothing. */
const MIN_FIND_LENGTH = 2;

/** Text around a match, split so the match can be marked. */
export type FindSnippet = { pre: string; hit: string; post: string };

/** One place a term appears: UTF-16 offsets into a paragraph's text, with the text around it. */
export type FindMatch = { paragraphId: string; chapterId: string; start: number; end: number; snippet: FindSnippet };

const BEFORE = 30;
const AFTER = 40;

export function snippetAround(text: string, start: number, end: number): FindSnippet {
  const from = Math.max(0, start - BEFORE);
  const to = Math.min(text.length, end + AFTER);
  return {
    pre: (from > 0 ? '…' : '') + text.slice(from, start),
    hit: text.slice(start, end),
    post: text.slice(end, to) + (to < text.length ? '…' : ''),
  };
}

/** Every place the term appears, ignoring case, in the paragraphs' order. A term under two characters finds nothing. */
export function searchManuscript(paragraphs: readonly Pick<ManuscriptParagraph, 'id' | 'chapterId' | 'text'>[], query: string): FindMatch[] {
  const term = query.trim().toLowerCase();
  if (term.length < MIN_FIND_LENGTH) return [];
  return paragraphs.flatMap((paragraph) => {
    const lower = paragraph.text.toLowerCase();
    const found: FindMatch[] = [];
    for (let at = lower.indexOf(term); at >= 0; at = lower.indexOf(term, at + term.length)) {
      found.push({
        paragraphId: paragraph.id,
        chapterId: paragraph.chapterId,
        start: at,
        end: at + term.length,
        snippet: snippetAround(paragraph.text, at, at + term.length),
      });
    }
    return found;
  });
}

/**
 * The host's whole-book answer (`manuscriptSearch`) as Find's matches, in book order: the hits in order, then each hit's matches in
 * order. The jump menu's rows and Find's steps both come from this list, so the menu's row n is Find's match n.
 */
export function bookMatches(result: Pick<ManuscriptSearchResult, 'hits'>): FindMatch[] {
  return result.hits.flatMap((hit) =>
    hit.matches.map(({ start, end }) => ({
      paragraphId: hit.paragraphId,
      chapterId: hit.chapterId,
      start,
      end,
      snippet: snippetAround(hit.excerpt, start, end),
    })),
  );
}
