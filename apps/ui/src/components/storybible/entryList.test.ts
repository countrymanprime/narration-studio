// @vitest-environment jsdom
import { describe, expect, it, beforeEach, vi } from 'vitest';
import fc from 'fast-check';
import type { GuideEntity } from '../../types';
import { aliasCount, chapterCount, ENTRY_SORT_STORAGE_KEY, loadEntrySort, saveEntrySort, sortEntries, type EntrySortKey } from './entryList';

const entry = (id: string, name: string, over: Partial<GuideEntity> = {}): GuideEntity => ({
  id,
  canonical_name: name,
  aliases: [],
  category: 'Character',
  occurrences: [],
  occurrence_count: 0,
  pronunciation: { ipa: '', source: '', confidence: '' },
  description: { text: '', evidence: {} },
  personality_notes: [],
  relationships: [],
  properties: [],
  locked: false,
  review_state: 'reviewed',
  ...over,
});
const inChapters = (...ids: string[]) => ids.map((chapterId, sceneIndex) => ({ chapterId, chapter: chapterId, sceneIndex }));
const ids = (list: GuideEntity[]) => list.map((row) => row.id);

describe('sort-by-name-type-and-chapters-with-name-as-the-tie-break', () => {
  const rows = [
    entry('a', 'Zed', { category: 'Place', appearances: inChapters('1', '2', '3') }),
    entry('b', 'alice', { category: 'Character', appearances: inChapters('1') }),
    entry('c', 'Bob', { category: 'Character', appearances: inChapters('1', '2') }),
    entry('d', 'Acme', { category: 'Organization' }),
  ];

  it('sorts by name ignoring case', () => expect(ids(sortEntries(rows, 'name'))).toEqual(['d', 'b', 'c', 'a']));
  it('sorts by type in the tab order, then name', () => expect(ids(sortEntries(rows, 'type'))).toEqual(['b', 'c', 'a', 'd']));
  it('sorts by chapter count, most first, then name', () => expect(ids(sortEntries(rows, 'chapters'))).toEqual(['a', 'c', 'b', 'd']));
  it('puts an unknown category after the known ones', () => {
    expect(ids(sortEntries([entry('x', 'A', { category: 'Mystery' }), entry('y', 'B', { category: 'Event' })], 'type'))).toEqual(['y', 'x']);
  });

  const keyArb = fc.constantFrom<EntrySortKey>('name', 'type', 'chapters');
  const rowArb = fc.record({
    id: fc.uuid(),
    name: fc.string({ maxLength: 6 }),
    category: fc.constantFrom('Character', 'Place', 'Lore', 'Item', 'Event', 'Organization', 'Needs Review'),
    chapters: fc.array(fc.constantFrom('1', '2', '3', '4'), { maxLength: 4 }),
  });
  const build = (specs: { id: string; name: string; category: string; chapters: string[] }[]) =>
    specs.map((s) => entry(s.id, s.name, { category: s.category, appearances: inChapters(...s.chapters) }));

  it('is stable, total and does not mutate its input', () => {
    fc.assert(
      fc.property(fc.array(rowArb, { maxLength: 12 }), keyArb, (specs, key) => {
        const input = build(specs);
        const snapshot = ids(input);
        const once = sortEntries(input, key);
        expect(ids(input)).toEqual(snapshot);
        expect(once).toHaveLength(input.length);
        expect(ids(sortEntries([...input].reverse(), key))).toEqual(ids(once));
        expect(ids(sortEntries(once, key))).toEqual(ids(once));
      }),
    );
  });
});

describe('each-row-shows-its-names-and-its-chapters-and-no-mention-counts', () => {
  it('counts aliases', () => expect(aliasCount(entry('a', 'A', { aliases: [{ text: 'x' }, { text: 'y' }] as GuideEntity['aliases'] }))).toBe(2));
  it('counts distinct chapters of the appearances', () => {
    expect(chapterCount(entry('a', 'A', { appearances: [...inChapters('1', '2'), { chapterId: '1', chapter: '1', sceneIndex: 5 }] }))).toBe(2);
  });
  it('falls back to the chapters of the evidence when the file predates appearances', () => {
    const occ = (chapterId: string, paragraph: number) => ({ chapter: chapterId, chapterId, paragraph, excerpt: '' });
    expect(chapterCount(entry('a', 'A', { occurrences: [occ('1', 1), occ('1', 2), occ('2', 1)] }))).toBe(2);
  });
});

describe('the-control-sorts-the-list-and-the-choice-is-kept', () => {
  beforeEach(() => window.localStorage.clear());
  it('defaults to name', () => expect(loadEntrySort()).toBe('name'));
  it('restores a saved choice', () => {
    saveEntrySort('chapters');
    expect(loadEntrySort()).toBe('chapters');
  });
  it('ignores a stored value that is not a key', () => {
    window.localStorage.setItem(ENTRY_SORT_STORAGE_KEY, 'occurrences');
    expect(loadEntrySort()).toBe('name');
  });
  it('survives storage that throws', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(loadEntrySort()).toBe('name');
    spy.mockRestore();
  });
});
