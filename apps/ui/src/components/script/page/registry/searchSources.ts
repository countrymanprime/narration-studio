// The Script page's four search sources for the jump menu (the mock's `app/search-sources.tsx`): text in the manuscript, Story
// Bible entries, the narrator's marks and flagged words. Each is a pure builder over what the page has loaded and answers from memory;
// the registry sets the minimum term length, and choosing a hit calls a handler the page passes. Nothing here names a mark type
// or a Story Bible kind: the type names come from the loaded types.

import type { Mark, MarkType } from '../../../../api/contracts/marks';
import type { ScriptWord } from '../../../../api/contracts/scriptPrep';
import type { GuideEntity } from '../../../../api/contracts/storyBible';
import { chapterName, type ChapterNameInput } from '../../../../chapterName';
import type { SearchHit, SearchSource } from '../../../../registries/search';

const MANUSCRIPT_GROUP = 'In the manuscript';
const ENTRIES_GROUP = 'Story Bible';
const MARKS_GROUP = 'My marks';
const WORDS_GROUP = 'My words';

/** Matches the manuscript lists before a "Show all" row replaces the rest. */
const MANUSCRIPT_SHOWN = 6;
const MARKS_SHOWN = 5;
/** Characters of the line kept either side of a manuscript match. */
const CONTEXT = 28;
/** Characters of a mark's note kept in its title. */
const NOTE_SHOWN = 48;

export type ManuscriptLine = { chapterId: string; id: string; index: number; text: string };
export type ManuscriptMatch = { line: ManuscriptLine; start: number; end: number };

const has = (text: string, needle: string): boolean => text.toLowerCase().includes(needle);

/** Every case-insensitive occurrence of `term` in the lines, in reading order. */
export function findInManuscript(lines: readonly ManuscriptLine[], term: string): ManuscriptMatch[] {
  const needle = term.toLowerCase();
  if (!needle) return [];
  const out: ManuscriptMatch[] = [];
  for (const line of lines) {
    const lower = line.text.toLowerCase();
    for (let at = lower.indexOf(needle); at !== -1; at = lower.indexOf(needle, at + needle.length)) out.push({ line, start: at, end: at + needle.length });
  }
  return out;
}

/** The match with a little of its line either side, ellipses where it was cut. */
function snippet(match: ManuscriptMatch): string {
  const { text } = match.line;
  const from = Math.max(0, match.start - CONTEXT);
  const to = Math.min(text.length, match.end + CONTEXT);
  return `${from > 0 ? '…' : ''}${text.slice(from, to).replace(/\s+/g, ' ')}${to < text.length ? '…' : ''}`;
}

export type ManuscriptSourceOptions = {
  /** The lines of every chapter read so far. */
  lines: () => readonly ManuscriptLine[];
  chapters: readonly (ChapterNameInput & { id: string })[];
  /** Opens Find on the term with the match at `index` current. */
  onFind: (term: string, index: number) => void;
};

/** The first matches with their chapter and line, then a row that opens Find on all of them. */
export function manuscriptSource({ lines, chapters, onFind }: ManuscriptSourceOptions): SearchSource {
  return (term) => {
    const found = findInManuscript(lines(), term);
    const hits: SearchHit[] = found.slice(0, MANUSCRIPT_SHOWN).map((match, index) => {
      const chapter = chapters.find((row) => row.id === match.line.chapterId);
      return {
        group: MANUSCRIPT_GROUP,
        title: snippet(match),
        sub: `${chapter ? chapterName(chapter) : ''} · line ${match.line.index + 1}`.replace(/^ · /, ''),
        run: () => onFind(term, index),
      };
    });
    if (found.length > MANUSCRIPT_SHOWN) hits.push({ group: MANUSCRIPT_GROUP, title: `Show all ${found.length} matches`, run: () => onFind(term, 0) });
    return hits;
  };
}

/** Entries whose name or an alias holds the term, each with its kind. */
export function entriesSource(entries: () => readonly GuideEntity[], onShow: (entryId: string) => void): SearchSource {
  return (term) => {
    const needle = term.toLowerCase();
    return entries()
      .filter((entry) => has(entry.canonical_name, needle) || entry.aliases.some((alias) => has(alias.text, needle)))
      .map((entry) => ({ group: ENTRIES_GROUP, title: entry.canonical_name, sub: entry.category, run: () => onShow(entry.id) }));
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
