// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import type { Mark, MarkType } from '../../../../api/contracts/marks';
import { createSearchRegistry } from '../../../../registries/search';
import type { ManuscriptSearchHit, ManuscriptSearchResult } from '../../../../api/contracts/manuscript';
import { bookMatches } from '../tools/find/searchManuscript';
import { bookSource, manuscriptSource, marksSource, type ManuscriptLine } from './searchSources';

const line = (index: number, text: string): ManuscriptLine => ({ chapterId: 'c1', id: `p${index}`, index, text });
const types: MarkType[] = [{ key: 'tone', name: 'Tone', colour: 'copper', style: 'underline', asks: false }];
const mark = (id: string, quote: string, text: string): Mark =>
  ({
    id,
    chapterId: 'c1',
    paragraphId: 'p0',
    paragraph: 0,
    start: 0,
    end: quote.length,
    quote,
    type: 'tone',
    text,
    thread: [],
    createdAt: '',
    stale: false,
  }) as Mark;

describe('search-sources', () => {
  it('the manuscript answers under In the script with each match marked, where it is, and the rest behind one row', () => {
    const onFind = vi.fn();
    const lines = Array.from({ length: 60 }, (_, i) => line(i, `Alice walked ${i}`));
    const locationOf = (spot: { chapterId: string; paragraphId: string }) => `One · ${spot.paragraphId}`;
    const hits = manuscriptSource({ lines: () => lines, locationOf, onFind })('alice');
    expect(hits).toHaveLength(51);
    expect(hits[0]).toMatchObject({
      group: 'In the script',
      title: 'Alice walked 0',
      sub: 'One · p0',
      snippet: { pre: '', hit: 'Alice', post: ' walked 0' },
    });
    expect(hits[50]).toMatchObject({ group: 'In the script', title: '10 more matches. Show them in the script.' });
    hits[2].run();
    expect(onFind).toHaveBeenCalledWith('alice', 2);
    hits[50].run();
    expect(onFind).toHaveBeenLastCalledWith('alice', 50);
  });

  it('the manuscript uses the Script page search: a one-letter term finds nothing, and a long line is cut around the match', () => {
    const text = `${'a '.repeat(40)}needle${' b'.repeat(40)}`;
    expect(manuscriptSource({ lines: () => [line(0, text)], locationOf: () => '', onFind: () => {} })('n')).toEqual([]);
    const [hit] = manuscriptSource({ lines: () => [line(0, text)], locationOf: () => '', onFind: () => {} })('needle');
    expect(hit.snippet!.pre.startsWith('…')).toBe(true);
    expect(hit.snippet!.post.endsWith('…')).toBe(true);
    expect(hit.snippet!.hit).toBe('needle');
    expect(hit.title).toBe(`${hit.snippet!.pre}${hit.snippet!.hit}${hit.snippet!.post}`);
  });

  it('the marks answer by quote and by note, with their type, and show five', () => {
    const onShow = vi.fn();
    const marks = [mark('m1', 'slowly', 'read it softer'), ...Array.from({ length: 6 }, (_, i) => mark(`n${i}`, `soft ${i}`, ''))];
    const source = marksSource(() => ({ types, marks }), onShow);
    expect(source('softer')[0]).toMatchObject({ group: 'My marks', title: 'slowly · read it softer', sub: 'Tone' });
    expect(source('soft')).toHaveLength(5);
    source('slowly')[0].run();
    expect(onShow).toHaveBeenCalledWith(marks[0]);
  });

  it('the minimum term length is the registry’s', () => {
    const registry = createSearchRegistry();
    const source = vi.fn(() => []);
    registry.register(source);
    registry.searchAll('a');
    expect(source).not.toHaveBeenCalled();
    registry.searchAll('al');
    expect(source).toHaveBeenCalledWith('al');
  });
});

describe('the book source (#2775)', () => {
  const hit = (paragraphId: string, excerpt: string, matches: [number, number][]): ManuscriptSearchHit => ({
    chapter: 'One',
    chapterId: paragraphId.startsWith('q') ? 'c2' : 'c1',
    paragraph: 0,
    paragraphId,
    excerpt,
    matches: matches.map(([start, end]) => ({ start, end })),
  });
  const answer = (hits: ManuscriptSearchHit[], total?: number): ManuscriptSearchResult => {
    const sent = hits.reduce((n, row) => n + row.matches.length, 0);
    return { hits, total: total ?? sent, truncated: (total ?? sent) > sent };
  };
  const source = (result: ManuscriptSearchResult, onFind = vi.fn()) =>
    bookSource({ search: () => Promise.resolve(result), locationOf: (spot) => `${spot.chapterId} · ${spot.paragraphId}`, onFind });

  it('lists one row per match in book order, a paragraph’s several matches in their order, and row n opens Find at match n', async () => {
    const onFind = vi.fn();
    const hits = await source(
      answer([
        hit('p1', 'rabbit and rabbit', [
          [0, 6],
          [11, 17],
        ]),
        hit('q1', 'one rabbit', [[4, 10]]),
      ]),
      onFind,
    )('rabbit', new AbortController().signal);
    expect(hits.map((row) => [row.sub, row.snippet?.pre, row.snippet?.hit])).toEqual([
      ['c1 · p1', '', 'rabbit'],
      ['c1 · p1', 'rabbit and ', 'rabbit'],
      ['c2 · q1', 'one ', 'rabbit'],
    ]);
    hits[1]!.run();
    expect(onFind).toHaveBeenCalledWith('rabbit', 1);
    // The same list Find marks: bookMatches gives match 1 the second match of the first paragraph.
    expect(
      bookMatches(
        answer([
          hit('p1', 'rabbit and rabbit', [
            [0, 6],
            [11, 17],
          ]),
        ]),
      )[1],
    ).toMatchObject({ paragraphId: 'p1', chapterId: 'c1', start: 11, end: 17 });
  });

  it('cuts a window around a match in a long paragraph, so a row never carries the whole paragraph', async () => {
    const excerpt = `${'a '.repeat(200)}needle${' b'.repeat(200)}`;
    const [row] = await source(answer([hit('p1', excerpt, [[400, 406]])]))('needle', new AbortController().signal);
    expect(row!.snippet!.pre.startsWith('…')).toBe(true);
    expect(row!.snippet!.post.endsWith('…')).toBe(true);
    expect(row!.title.length).toBeLessThan(90);
  });

  it('says the exact number of the rest, from the host’s total, even past the matches it sent', async () => {
    const many = Array.from({ length: 60 }, (_, i) => hit(`p${i}`, 'a rabbit', [[2, 8]]));
    const onFind = vi.fn();
    const rows = await source(answer(many, 4210), onFind)('rabbit', new AbortController().signal);
    expect(rows).toHaveLength(51);
    expect(rows[50]!.title).toBe('4160 more matches. Show them in the script.');
    rows[50]!.run();
    expect(onFind).toHaveBeenCalledWith('rabbit', 50);
    const one = await source(answer(many.slice(0, 51)))('rabbit', new AbortController().signal);
    expect(one[50]!.title).toBe('1 more match. Show them in the script.');
  });

  it('answers no rows when the book has no match, and passes a refusal on', async () => {
    expect(await source(answer([]))('zzz', new AbortController().signal)).toEqual([]);
    const refused = bookSource({
      search: () => Promise.reject(new Error('the search term is longer than 500 characters')),
      locationOf: () => '',
      onFind: () => {},
    });
    await expect(refused('x'.repeat(10_000), new AbortController().signal)).rejects.toThrow('longer than 500');
  });
});
