// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import type { Mark, MarkType } from '../../../../api/contracts/marks';
import type { ScriptWord } from '../../../../api/contracts/scriptPrep';
import { createSearchRegistry } from '../../../../registries/search';
import { manuscriptSource, marksSource, wordsSource, type ManuscriptLine } from './searchSources';

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

  it('the words answer by word and by say-value', () => {
    const onShow = vi.fn();
    const words = [{ word: 'Caius', say: 'keys', source: 'manual', status: 'set', flags: [] } as unknown as ScriptWord];
    const source = wordsSource(() => words, onShow);
    expect(source('cai')[0]).toMatchObject({ group: 'My words', title: 'Caius', sub: 'Say: keys' });
    expect(source('keys')).toHaveLength(1);
    source('keys')[0].run();
    expect(onShow).toHaveBeenCalledWith('Caius');
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
