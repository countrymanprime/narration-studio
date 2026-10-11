// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import type { Mark, MarkType } from '../../../../api/contracts/marks';
import type { ScriptWord } from '../../../../api/contracts/scriptPrep';
import type { GuideEntity } from '../../../../api/contracts/storyBible';
import { createSearchRegistry } from '../../../../registries/search';
import { entriesSource, findInManuscript, manuscriptSource, marksSource, wordsSource, type ManuscriptLine } from './searchSources';

const chapters = [{ id: 'c1', title: 'One', subtitle: 'The Fall' }];
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
  it('the manuscript answers with the first matches, their chapter and line, and a row for the rest', () => {
    const onFind = vi.fn();
    const lines = Array.from({ length: 8 }, (_, i) => line(i, `Alice walked ${i}`));
    const hits = manuscriptSource({ lines: () => lines, chapters, onFind })('alice');
    expect(hits).toHaveLength(7);
    expect(hits[0]).toMatchObject({ group: 'In the manuscript', title: 'Alice walked 0', sub: 'One — The Fall · line 1' });
    expect(hits[6]).toMatchObject({ group: 'In the manuscript', title: 'Show all 8 matches' });
    hits[2].run();
    expect(onFind).toHaveBeenCalledWith('alice', 2);
    hits[6].run();
    expect(onFind).toHaveBeenLastCalledWith('alice', 0);
  });

  it('a long line is cut around the match', () => {
    const text = `${'a '.repeat(40)}needle${' b'.repeat(40)}`;
    const [hit] = manuscriptSource({ lines: () => [line(0, text)], chapters, onFind: () => {} })('needle');
    expect(hit.title.startsWith('…')).toBe(true);
    expect(hit.title.endsWith('…')).toBe(true);
    expect(hit.title).toContain('needle');
  });

  it('finds every occurrence, ignoring case', () => {
    expect(findInManuscript([line(0, 'Tea, tea and TEA')], 'tea').map((m) => m.start)).toEqual([0, 5, 13]);
  });

  it('the entries answer by name and by alias, with their kind', () => {
    const onShow = vi.fn();
    const entry = { id: 'e1', canonical_name: 'Queen of Hearts', category: 'Character', aliases: [{ text: 'The Queen' }] } as GuideEntity;
    const source = entriesSource(() => [entry], onShow);
    expect(source('queen')[0]).toMatchObject({ group: 'Story Bible', title: 'Queen of Hearts', sub: 'Character' });
    expect(source('the queen')).toHaveLength(1);
    expect(source('rabbit')).toEqual([]);
    source('hearts')[0].run();
    expect(onShow).toHaveBeenCalledWith('e1');
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
