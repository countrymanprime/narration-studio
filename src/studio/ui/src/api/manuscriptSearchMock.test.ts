import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MANUSCRIPT_SEARCH_TERM_MAX } from './contracts/manuscript';
import { MOCK_SEARCH_MATCHES_MAX, SEARCH_TERM_TOO_LONG, searchMockManuscript } from './manuscriptSearchMock';
import { createMockApi } from './mockApi';
import { manuscriptSearchResultSchema } from './schemas/manuscript';

type Parity = {
  termMax: number;
  termTooLong: string;
  matchesMax: number;
  cases: { name: string; text: string; query: string; matches: [number, number][] }[];
};

// The host's search_test.go reads the same file.
const parity = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../../../../tests/fixtures/manuscript-search/parity-cases.json', import.meta.url)), 'utf8'),
) as Parity;

const line = (id: string, chapterId: string, index: number, text: string) => ({ id, chapterId, chapter: `Title ${chapterId}`, index, text });

describe('the mock manuscript search answers as the host does', () => {
  it('has the host caps', () => {
    expect([MANUSCRIPT_SEARCH_TERM_MAX, SEARCH_TERM_TOO_LONG, MOCK_SEARCH_MATCHES_MAX]).toEqual([parity.termMax, parity.termTooLong, parity.matchesMax]);
  });

  it.each(parity.cases)('$name', ({ text, query, matches }) => {
    const result = searchMockManuscript([], [line('p0', 'c1', 0, text)], query);
    expect(result.hits.flatMap((hit) => hit.matches.map((match) => [match.start, match.end]))).toEqual(matches);
    expect(result.total).toBe(matches.length);
    expect(result.truncated).toBe(false);
  });

  it('answers one hit per paragraph in book order, with its place', () => {
    const result = searchMockManuscript(
      [],
      [line('p0', 'c1', 0, 'The rabbit and the other rabbit.'), line('p1', 'c1', 1, 'No match here.'), line('p2', 'c2', 2, 'A rabbit.')],
      'rabbit',
    );
    expect(result).toEqual({
      total: 3,
      truncated: false,
      hits: [
        {
          chapter: 'Title c1',
          chapterId: 'c1',
          paragraph: 0,
          paragraphId: 'p0',
          excerpt: 'The rabbit and the other rabbit.',
          matches: [
            { start: 4, end: 10 },
            { start: 25, end: 31 },
          ],
        },
        { chapter: 'Title c2', chapterId: 'c2', paragraph: 2, paragraphId: 'p2', excerpt: 'A rabbit.', matches: [{ start: 2, end: 8 }] },
      ],
    });
  });

  it('skips front matter and reference chapters', () => {
    const chapters = [
      { id: 'front', contentKind: 'opening' as const },
      { id: 'ref', contentKind: 'reference' as const },
      { id: 'c1', contentKind: 'narration' as const },
      { id: 'c2' },
    ];
    const result = searchMockManuscript(
      chapters,
      [line('pf', 'front', 0, 'rabbit'), line('pr', 'ref', 1, 'rabbit'), line('p1', 'c1', 2, 'rabbit'), line('p2', 'c2', 3, 'rabbit')],
      'rabbit',
    );
    expect(result.hits.map((hit) => hit.paragraphId)).toEqual(['p1', 'p2']);
    expect(result.total).toBe(2);
  });

  it('caps the matches it sends, inside a paragraph if need be, but counts every one', () => {
    const paragraphs = Array.from({ length: MOCK_SEARCH_MATCHES_MAX / 2 + 10 }, (_, index) => line('p', 'c1', index, 'fox and fox'));
    const over = searchMockManuscript([], paragraphs, 'fox');
    expect(over.hits.reduce((count, hit) => count + hit.matches.length, 0)).toBe(MOCK_SEARCH_MATCHES_MAX);
    expect([over.total, over.truncated]).toEqual([2 * paragraphs.length, true]);
    expect(() => manuscriptSearchResultSchema.parse(over)).not.toThrow();
    const at = searchMockManuscript([], paragraphs.slice(0, MOCK_SEARCH_MATCHES_MAX / 2), 'fox');
    expect([at.total, at.truncated]).toEqual([MOCK_SEARCH_MATCHES_MAX, false]);
  });

  it('refuses a term over the cap, counted in UTF-16 units after trimming', () => {
    const long = 'a'.repeat(MANUSCRIPT_SEARCH_TERM_MAX);
    expect(searchMockManuscript([], [line('p0', 'c1', 0, long)], `  ${long}  `).total).toBe(1);
    for (const term of ['a'.repeat(MANUSCRIPT_SEARCH_TERM_MAX + 1), '🐇'.repeat(MANUSCRIPT_SEARCH_TERM_MAX / 2 + 1), 'x'.repeat(10_000)]) {
      expect(() => searchMockManuscript([], [], term)).toThrow(SEARCH_TERM_TOO_LONG);
    }
  });

  it('searches the whole mock book through the API and its schema', async () => {
    const result = manuscriptSearchResultSchema.parse(await createMockApi().manuscriptSearch('alice'));
    expect(result.total).toBeGreaterThan(0);
    expect(new Set(result.hits.map((hit) => hit.chapterId)).size).toBeGreaterThan(1);
    for (const hit of result.hits) for (const match of hit.matches) expect(hit.excerpt.slice(match.start, match.end).toLowerCase()).toBe('alice');
  });
});

describe('the search result schema', () => {
  const hit = { chapter: 'One', chapterId: 'c1', paragraph: 0, paragraphId: 'p0', excerpt: 'a rabbit', matches: [{ start: 2, end: 8 }] };
  it.each([
    ['a total that does not count the sent matches', { hits: [hit], total: 2, truncated: false }],
    ['truncated with every match sent', { hits: [hit], total: 1, truncated: true }],
    ['a match past its excerpt', { hits: [{ ...hit, matches: [{ start: 2, end: 9 }] }], total: 1, truncated: false }],
    ['an empty match', { hits: [{ ...hit, matches: [{ start: 2, end: 2 }] }], total: 1, truncated: false }],
    ['a hit with no match', { hits: [{ ...hit, matches: [] }], total: 0, truncated: false }],
  ])('refuses %s', (_, payload) => {
    expect(manuscriptSearchResultSchema.safeParse(payload).success).toBe(false);
  });

  it('takes a capped result and a null list of hits', () => {
    expect(manuscriptSearchResultSchema.safeParse({ hits: [hit], total: 5, truncated: true }).success).toBe(true);
    expect(manuscriptSearchResultSchema.parse({ hits: null, total: 0, truncated: false })).toEqual({ hits: [], total: 0, truncated: false });
  });
});
