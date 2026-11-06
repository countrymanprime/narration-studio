// The mock host's manuscript search: the host's manuscript.Service.Search (src/studio/desktop/internal/manuscript/search.go)
// in TypeScript. tests/fixtures/manuscript-search/parity-cases.json holds both to the same matches and caps.
import {
  MANUSCRIPT_SEARCH_TERM_MAX,
  type ManuscriptChapter,
  type ManuscriptParagraph,
  type ManuscriptSearchMatch,
  type ManuscriptSearchResult,
} from './contracts/manuscript';

/** The most matches one result sends: the host's maxSearchMatches. */
export const MOCK_SEARCH_MATCHES_MAX = 1000;
/** The host's ErrSearchTermTooLong. */
export const SEARCH_TERM_TOO_LONG = `the search term is longer than ${MANUSCRIPT_SEARCH_TERM_MAX} characters`;

/** Go's unicode.ToLower of one code point: a lowercase that is several code points (U+0130 to "i̇") keeps only its first. */
function foldPoint(point: string): string {
  const lower = point.toLowerCase();
  return String.fromCodePoint(lower.codePointAt(0) ?? 0);
}

/** Every non-overlapping place the term appears in text, ignoring case, as UTF-16 indices into text itself. */
function findMatches(text: string, needle: string): ManuscriptSearchMatch[] {
  let folded = '';
  // at[i] is the index in text of the code point that folded unit i came from; at[folded.length] is text's length.
  const at: number[] = [];
  let index = 0;
  for (const point of text) {
    const lower = foldPoint(point);
    folded += lower;
    for (let unit = 0; unit < lower.length; unit += 1) at.push(index);
    index += point.length;
  }
  at.push(index);
  const matches: ManuscriptSearchMatch[] = [];
  for (let found = folded.indexOf(needle); found >= 0; found = folded.indexOf(needle, found + needle.length)) {
    matches.push({ start: at[found] ?? 0, end: at[found + needle.length] ?? 0 });
  }
  return matches;
}

const fold = (value: string): string => Array.from(value, foldPoint).join('');

/** The whole book's matches as the host answers them: front matter and reference chapters skipped, capped, the total exact. */
export function searchMockManuscript(
  chapters: readonly Pick<ManuscriptChapter, 'id' | 'contentKind'>[],
  paragraphs: readonly Pick<ManuscriptParagraph, 'id' | 'chapterId' | 'chapter' | 'index' | 'text'>[],
  query: string,
): ManuscriptSearchResult {
  const result: ManuscriptSearchResult = { hits: [], total: 0, truncated: false };
  const term = query.trim();
  if (!term) return result;
  if (term.length > MANUSCRIPT_SEARCH_TERM_MAX) throw new Error(SEARCH_TERM_TOO_LONG);
  const needle = fold(term);
  const hidden = new Set(chapters.filter((chapter) => chapter.contentKind === 'opening' || chapter.contentKind === 'reference').map((chapter) => chapter.id));
  let sent = 0;
  for (const paragraph of paragraphs) {
    if (hidden.has(paragraph.chapterId)) continue;
    const found = findMatches(paragraph.text, needle);
    if (!found.length) continue;
    result.total += found.length;
    const room = MOCK_SEARCH_MATCHES_MAX - sent;
    if (room <= 0) continue;
    const matches = found.slice(0, room);
    sent += matches.length;
    result.hits.push({
      chapter: paragraph.chapter,
      chapterId: paragraph.chapterId,
      paragraph: paragraph.index,
      paragraphId: paragraph.id,
      excerpt: paragraph.text,
      matches,
    });
  }
  result.truncated = sent < result.total;
  return result;
}
