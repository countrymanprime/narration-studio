// The Script page's search sources for the jump menu: text in the manuscript, the narrator's marks and flagged words. Each is a pure
// builder over what the page has loaded and answers from memory; the registry sets the minimum term length, and choosing a hit calls a
// handler the page passes. The manuscript is searched with the search the page always used (`searchManuscript`), so a match is the same
// match, and choosing one marks every match in the reader and scrolls to it. The Story Bible entries and the mark types are page items
// (`useScriptRegistry`), not hits, so a name is listed once. Nothing here names a mark type or a Story Bible kind.

import type { Mark, MarkType } from '../../../../api/contracts/marks';
import type { ScriptWord } from '../../../../api/contracts/scriptPrep';
import type { SearchHit, SearchSource } from '../../../../registries/search';
import { searchManuscript, type FindMatch } from '../tools/find/searchManuscript';

const MANUSCRIPT_GROUP = 'In the script';
const MARKS_GROUP = 'My marks';
const WORDS_GROUP = 'My words';

/** Matches the menu lists before one row says how many more there are. */
const MANUSCRIPT_SHOWN = 50;
const MARKS_SHOWN = 5;
/** Characters of a mark's note kept in its title. */
const NOTE_SHOWN = 48;

export type ManuscriptLine = { chapterId: string; id: string; index: number; text: string };

const has = (text: string, needle: string): boolean => text.toLowerCase().includes(needle);

export type ManuscriptSourceOptions = {
  /** The lines of every chapter read so far. */
  lines: () => readonly ManuscriptLine[];
  /** Where a match is, for its muted line ("Chapter 3 · ¶ 12"). */
  locationOf: (match: Pick<FindMatch, 'chapterId' | 'paragraphId'>) => string;
  /** Marks every match of the term in the reader, with the one at `index` current and in view. */
  onFind: (term: string, index: number) => void;
  /** The menu heading and where the row for the rest sends the narrator; the Script's ("In the script", "the script") when omitted. */
  group?: string;
  showIn?: string;
};

/** The first matches with their place and the matched part marked, then a row for the rest. */
export function manuscriptSource({ lines, locationOf, onFind, group = MANUSCRIPT_GROUP, showIn = 'the script' }: ManuscriptSourceOptions): SearchSource {
  return (term) => {
    const found = searchManuscript(lines(), term);
    const hits: SearchHit[] = found.slice(0, MANUSCRIPT_SHOWN).map((match, index) => ({
      group,
      title: `${match.snippet.pre}${match.snippet.hit}${match.snippet.post}`,
      sub: locationOf(match),
      snippet: match.snippet,
      run: () => onFind(term, index),
    }));
    if (found.length > MANUSCRIPT_SHOWN) {
      hits.push({
        group,
        title: `${found.length - MANUSCRIPT_SHOWN} more matches. Show them in ${showIn}.`,
        run: () => onFind(term, MANUSCRIPT_SHOWN),
      });
    }
    return hits;
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

/** Flagged words whose text or say-value holds the term. */
export function wordsSource(words: () => readonly ScriptWord[], onShow: (word: string) => void): SearchSource {
  return (term) => {
    const needle = term.toLowerCase();
    return words()
      .filter((row) => has(row.word, needle) || has(row.say, needle))
      .map((row) => ({ group: WORDS_GROUP, title: row.word, sub: row.say ? `Say: ${row.say}` : undefined, run: () => onShow(row.word) }));
  };
}
