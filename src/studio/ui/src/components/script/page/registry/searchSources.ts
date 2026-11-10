// The Script page's search sources for the jump menu: text in the whole book and the narrator's marks. The registry sets
// the minimum term length, and choosing a hit calls a handler the page passes. The book is searched on the host (`bookSource`, #2775),
// and Find reads the same answer, so the menu's row n is Find's match n and choosing it marks every match in the reader and scrolls to
// that one. The marks answer from memory. The Booth's chapter search (`manuscriptSource`) searches the lines it is given.
// The Story Bible entries and the mark types are page items (`useScriptRegistry`), not hits, so a name is listed once. Nothing here
// names a mark type or a Story Bible kind.

import type { Mark, MarkType } from '../../../../api/contracts/marks';
import type { ManuscriptSearchResult } from '../../../../api/contracts/manuscript';
import type { AsyncSearchSource, SearchHit, SearchSource } from '../../../../registries/search';
import { bookMatches, searchManuscript, type FindMatch } from '../tools/find/searchManuscript';
import { pluralWord } from '../../../../plural';

export const MANUSCRIPT_GROUP = 'In the script';
const MARKS_GROUP = 'My marks';

/** Matches the menu lists before one row says how many more there are. */
const MANUSCRIPT_SHOWN = 50;
const MARKS_SHOWN = 5;
/** Characters of a mark's note kept in its title. */
const NOTE_SHOWN = 48;

export type ManuscriptLine = { chapterId: string; id: string; index: number; text: string };

const has = (text: string, needle: string): boolean => text.toLowerCase().includes(needle);

export type ManuscriptSourceOptions = {
  /** The lines to search. */
  lines: () => readonly ManuscriptLine[];
  /** Where a match is, for its muted line ("Chapter 3 · ¶ 12"). */
  locationOf: (match: Pick<FindMatch, 'chapterId' | 'paragraphId'>) => string;
  /** Marks every match of the term in the reader, with the one at `index` current and in view. */
  onFind: (term: string, index: number) => void;
  /** The menu heading and where the row for the rest sends the narrator; the Script's ("In the script", "the script") when omitted. */
  group?: string;
  showIn?: string;
};

type MatchRows = Omit<ManuscriptSourceOptions, 'lines'>;

/** One row per match, the first MANUSCRIPT_SHOWN of `found` (in Find's order), then one row for the rest of `total`. Row n opens Find at match n. */
function matchRows(
  found: readonly FindMatch[],
  total: number,
  term: string,
  { locationOf, onFind, group = MANUSCRIPT_GROUP, showIn = 'the script' }: MatchRows,
): SearchHit[] {
  const hits: SearchHit[] = found.slice(0, MANUSCRIPT_SHOWN).map((match, index) => ({
    group,
    title: `${match.snippet.pre}${match.snippet.hit}${match.snippet.post}`,
    sub: locationOf(match),
    snippet: match.snippet,
    run: () => onFind(term, index),
  }));
  if (total > MANUSCRIPT_SHOWN) {
    const more = total - MANUSCRIPT_SHOWN;
    hits.push({ group, title: `${more} more ${pluralWord(more, 'match', 'matches')}. Show them in ${showIn}.`, run: () => onFind(term, MANUSCRIPT_SHOWN) });
  }
  return hits;
}

/** The first matches in the lines given, with their place and the matched part marked, then a row for the rest (the Booth's chapter). */
export function manuscriptSource({ lines, ...rows }: ManuscriptSourceOptions): SearchSource {
  return (term) => {
    const found = searchManuscript(lines(), term);
    return matchRows(found, found.length, term, rows);
  };
}

export type BookSourceOptions = MatchRows & {
  /** The host's whole-book search for a term (`manuscriptSearch`, cached per term). */
  search: (term: string, signal?: AbortSignal) => Promise<ManuscriptSearchResult>;
};

/**
 * The Script page's search of the whole book, on the host: one row per match in book order (`bookMatches`), the first ones with their
 * place, then a row for the rest. The host counts every match, so "N more" is exact even when it sent fewer than it found.
 */
export function bookSource({ search, ...rows }: BookSourceOptions): AsyncSearchSource {
  return async (term, signal) => {
    const result = await search(term, signal);
    return matchRows(bookMatches(result), result.total, term, rows);
  };
}

/** Marks whose quote or note holds the term, each with its type's name. */
export function marksSource(marks: () => { types: readonly MarkType[]; marks: readonly Mark[] }, onShow: (mark: Mark) => void): SearchSource {
  return (term) => {
    const needle = term.toLowerCase();
    const { types, marks: all } = marks();
    return all
      .filter((mark) => has(mark.quote, needle) || has(mark.text, needle))
      .slice(0, MARKS_SHOWN)
      .map((mark) => ({
        group: MARKS_GROUP,
        title: mark.quote + (mark.text ? ` · ${mark.text.slice(0, NOTE_SHOWN)}` : ''),
        sub: types.find((row) => row.key === mark.type)?.name ?? mark.type,
        run: () => onShow(mark),
      }));
  };
}
