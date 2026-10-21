// @vitest-environment jsdom
import fc from 'fast-check';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExtractionSuggestion } from '../../api/contracts/extraction';
import type { GuideEntity } from '../../types';
import {
  ENTRY_SORT_STORAGE_KEY,
  DEFAULT_SORT,
  chooseSort,
  filterEntries,
  foldText,
  kindCounts,
  loadEntrySort,
  saveEntrySort,
  sortAria,
  sortRows,
  statusOf,
  type ColumnKey,
  type EntrySort,
} from './entryTable';

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
const alias = (text: string) => ({ text, pronunciation: { ipa: '', source: '', confidence: '' }, occurrences: [] });
const inChapters = (...ids: string[]) => ids.map((chapterId, sceneIndex) => ({ chapterId, chapter: chapterId, sceneIndex }));
const ids = (list: readonly GuideEntity[]) => list.map((row) => row.id);
const KINDS = ['Character', 'Place', 'Organization', 'Lore', 'Item', 'Event'];
const none: readonly ExtractionSuggestion[] = [];
const asc = (column: ColumnKey): EntrySort => [{ column, dir: 'asc' }];
const sorted = (rows: GuideEntity[], sort: EntrySort, suggestions = none) => sortRows(rows, sort, { kinds: KINDS, suggestions });

describe('folding-text-for-sort-and-filter', () => {
  it('ignores case and accents', () => {
    expect(foldText('Éowyn')).toBe(foldText('eowyn'));
    expect(foldText('Zoë')).toBe('zoe');
  });
  it('keeps emoji and right-to-left text intact', () => {
    expect(foldText('🐇 White Rabbit')).toBe('🐇 white rabbit');
    expect(foldText('أليس')).toBe('أليس');
  });
});

describe('sorting-by-a-clicked-header', () => {
  const rows = [
    entry('a', 'Zed', { category: 'Place', appearances: inChapters('1', '2', '3'), occurrence_count: 4 }),
    entry('b', 'alice', { category: 'Character', appearances: inChapters('1'), occurrence_count: 9 }),
    entry('c', 'Bob', { category: 'Character', appearances: inChapters('1', '2'), occurrence_count: 9 }),
    entry('d', 'Acme', { category: 'Organization', aliases: [alias('Acme Inc')] }),
  ];
  it('sorts by name ignoring case and accents', () => {
    const accented = [entry('1', 'Émile'), entry('2', 'Eve'), entry('3', 'adam')];
    expect(ids(sorted(accented, asc('name')))).toEqual(['3', '1', '2']);
  });
  it('sorts descending', () => expect(ids(sorted(rows, [{ column: 'name', dir: 'desc' }]))).toEqual(['a', 'c', 'b', 'd']));
  it('sorts kind in the order of the kinds the host lists, an unknown kind last', () => {
    const withUnknown = [...rows, entry('u', 'Aaa', { category: 'Mystery' })];
    expect(ids(sorted(withUnknown, asc('kind')))).toEqual(['b', 'c', 'a', 'd', 'u']);
  });
  it('sorts numbers as numbers, not text', () => {
    const many = [entry('x', 'X', { occurrence_count: 10 }), entry('y', 'Y', { occurrence_count: 9 })];
    expect(ids(sorted(many, asc('mentions')))).toEqual(['y', 'x']);
  });
  it('sorts chapters and breaks a tie by name', () => expect(ids(sorted(rows, [{ column: 'chapters', dir: 'desc' }]))).toEqual(['a', 'c', 'b', 'd']));
  it('sorts the aliases column by how many names then by the text', () => {
    const named = [
      entry('p', 'P', { aliases: [alias('b')] }),
      entry('q', 'Q', { aliases: [alias('a'), alias('c')] }),
      entry('r', 'R', { aliases: [alias('a')] }),
    ];
    expect(ids(sorted(named, asc('aliases')))).toEqual(['r', 'p', 'q']);
  });
  it('sorts status: verify first, then review, then locked, then clear', () => {
    const flagged = [
      entry('ok', 'Ok'),
      entry('lock', 'Lock', { locked: true }),
      entry('rev', 'Rev', { review_state: 'needs review', review: { entry: true, aliases: [] } }),
      entry('ver', 'Ver'),
    ];
    const pending = [
      { id: 's', entryId: 'ver', status: 'needs-verification', payload: { kind: 'property', entry: 'ver', key: 'k', value: 'v' }, confidence: 0.5 },
    ] as unknown as ExtractionSuggestion[];
    expect(ids(sorted(flagged, [{ column: 'status', dir: 'desc' }], pending))).toEqual(['ver', 'rev', 'lock', 'ok']);
  });
  it('orders the text of two entries that differ only by id', () =>
    expect(ids(sorted([entry('2', 'Same'), entry('1', 'Same')], asc('name')))).toEqual(['1', '2']));

  const rowArb = fc.record({
    id: fc.uuid(),
    name: fc.string({ maxLength: 6 }),
    category: fc.constantFrom('Character', 'Place', 'Lore', 'Item', 'Event', 'Organization', 'Needs Review'),
    chapters: fc.array(fc.constantFrom('1', '2', '3', '4'), { maxLength: 4 }),
    mentions: fc.nat(30),
  });
  const colArb = fc.constantFrom<ColumnKey>('name', 'kind', 'aliases', 'mentions', 'chapters', 'status');
  const dirArb = fc.constantFrom<'asc' | 'desc'>('asc', 'desc');
  it('is stable, total, and does not mutate its input', () => {
    fc.assert(
      fc.property(fc.array(rowArb, { maxLength: 12 }), fc.array(fc.record({ column: colArb, dir: dirArb }), { maxLength: 2 }), (specs, sort) => {
        const input = specs.map((s) => entry(s.id, s.name, { category: s.category, appearances: inChapters(...s.chapters), occurrence_count: s.mentions }));
        const snapshot = ids(input);
        const once = sorted(input, sort);
        expect(ids(input)).toEqual(snapshot);
        expect(once).toHaveLength(input.length);
        expect(ids(sorted([...input].reverse(), sort))).toEqual(ids(once));
        expect(ids(sorted(once, sort))).toEqual(ids(once));
      }),
    );
  });
});

describe('a-header-click-chooses-the-sort', () => {
  it('sorts a new column ascending, a count column most first', () => {
    expect(chooseSort(DEFAULT_SORT, 'kind')[0]).toEqual({ column: 'kind', dir: 'asc' });
    expect(chooseSort(DEFAULT_SORT, 'mentions')[0]).toEqual({ column: 'mentions', dir: 'desc' });
  });
  it('flips the direction of the column that is already first', () => {
    expect(chooseSort(asc('name'), 'name')[0]).toEqual({ column: 'name', dir: 'desc' });
    expect(chooseSort([{ column: 'name', dir: 'desc' }], 'name')[0]).toEqual({ column: 'name', dir: 'asc' });
  });
  it('keeps the previous first column as the tie-break, and no more than two keys', () => {
    const next = chooseSort(chooseSort(asc('name'), 'kind'), 'chapters');
    expect(next).toEqual([
      { column: 'chapters', dir: 'desc' },
      { column: 'kind', dir: 'asc' },
    ]);
  });
  it('breaks a tie on the first key with the second', () => {
    const rows = [entry('1', 'B', { category: 'Place' }), entry('2', 'A', { category: 'Place' }), entry('3', 'C', { category: 'Character' })];
    const sort = chooseSort(chooseSort([{ column: 'name', dir: 'desc' }], 'kind'), 'kind');
    // kind descending first, then name descending
    expect(
      ids(
        sorted(rows, [
          { column: 'kind', dir: 'desc' },
          { column: 'name', dir: 'desc' },
        ]),
      ),
    ).toEqual(['1', '2', '3']);
    expect(sort[0]).toEqual({ column: 'kind', dir: 'desc' });
  });
  it('says each header’s state for aria-sort', () => {
    const sort: EntrySort = [
      { column: 'kind', dir: 'desc' },
      { column: 'name', dir: 'asc' },
    ];
    expect(sortAria(sort, 'kind')).toBe('descending');
    expect(sortAria(sort, 'name')).toBeUndefined();
    expect(sortAria(sort, 'chapters')).toBeUndefined();
  });
});

describe('the-sort-choice-is-kept', () => {
  beforeEach(() => window.localStorage.clear());
  it('defaults to name', () => expect(loadEntrySort()).toEqual(DEFAULT_SORT));
  it('restores a saved choice', () => {
    const sort: EntrySort = [
      { column: 'chapters', dir: 'desc' },
      { column: 'name', dir: 'asc' },
    ];
    saveEntrySort(sort);
    expect(loadEntrySort()).toEqual(sort);
  });
  it('reads the three words the old sort menu stored', () => {
    window.localStorage.setItem(ENTRY_SORT_STORAGE_KEY, 'chapters');
    expect(loadEntrySort()).toEqual([{ column: 'chapters', dir: 'desc' }]);
    window.localStorage.setItem(ENTRY_SORT_STORAGE_KEY, 'type');
    expect(loadEntrySort()).toEqual([{ column: 'kind', dir: 'asc' }]);
  });
  it('ignores a stored value that is not a sort', () => {
    for (const bad of ['occurrences', '[{"column":"nope","dir":"asc"}]', '{', '[]', '[{"column":"name","dir":"sideways"}]']) {
      window.localStorage.setItem(ENTRY_SORT_STORAGE_KEY, bad);
      expect(loadEntrySort()).toEqual(DEFAULT_SORT);
    }
  });
  it('survives storage that throws', () => {
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full');
    });
    expect(loadEntrySort()).toEqual(DEFAULT_SORT);
    expect(() => saveEntrySort(asc('kind'))).not.toThrow();
    get.mockRestore();
    set.mockRestore();
  });
});

describe('the-filter-narrows-the-rows', () => {
  const hatter = entry('h', 'The Hatter', { aliases: [alias('Mad Hatter'), alias('Tarrant')], category: 'Character', appearances: inChapters('1') });
  const rows = [
    hatter,
    entry('w', 'Wonderland', { category: 'Place' }),
    entry('e', 'Éowyn', { category: 'Character' }),
    entry('r', 'أليس', { category: 'Lore' }),
    entry('z', '🐇 Rabbit', { category: 'Lore' }),
  ];
  const base = { kind: 'All', query: '', reviewOnly: false, verifyOnly: false, suggestions: none };
  const found = (over: Partial<typeof base>) => ids(filterEntries(rows, { ...base, ...over }));

  it('keeps every row with no filter', () => expect(found({})).toEqual(['h', 'w', 'e', 'r', 'z']));
  it('matches the name or an alias, ignoring case and accents', () => {
    expect(found({ query: 'tarr' })).toEqual(['h']);
    expect(found({ query: 'eowyn' })).toEqual(['e']);
  });
  it('matches the text of any column, kind included', () => {
    expect(found({ query: 'place' })).toEqual(['w']);
    expect(found({ query: 'character' })).toEqual(['h', 'e']);
  });
  it('needs every word to match, in any column', () => expect(found({ query: 'hatter character' })).toEqual(['h']));
  it('finds right-to-left and emoji text', () => {
    expect(found({ query: 'أليس' })).toEqual(['r']);
    expect(found({ query: '🐇' })).toEqual(['z']);
  });
  it('matches nothing for text nobody has, and everything for blank text', () => {
    expect(found({ query: 'zzz' })).toEqual([]);
    expect(found({ query: '   ' })).toHaveLength(5);
  });
  it('filters by kind, and a kind that is gone shows every row', () => {
    expect(found({ kind: 'Place' })).toEqual(['w']);
    expect(found({ kind: 'Place', query: 'hatter' })).toEqual([]);
  });
  it('filters to the entries that need review or have something to verify', () => {
    const flagged = [entry('f', 'F', { review: { entry: true, aliases: [] } }), entry('g', 'G')];
    expect(ids(filterEntries(flagged, { ...base, reviewOnly: true }))).toEqual(['f']);
  });
});

describe('the-status-column', () => {
  it('names verify, review, locked and nothing', () => {
    expect(statusOf(entry('a', 'A'), none)).toEqual({ rank: 0, label: '' });
    expect(statusOf(entry('a', 'A', { locked: true }), none).label).toBe('Locked');
    expect(statusOf(entry('a', 'A', { review: { entry: true, aliases: [] } }), none).label).toBe('Review');
    expect(statusOf(entry('a', 'A', { category: 'Needs Review' }), none).label).toBe('Review');
  });
});

describe('kind-counts-for-the-chips', () => {
  it('counts each kind and the total, ignoring a draft', () => {
    const rows = [entry('1', 'A'), entry('2', 'B', { category: 'Place' }), entry('3', 'C'), entry('4', 'D', { category: 'Draft' })];
    const counts = kindCounts(rows.filter((row) => row.category !== 'Draft'));
    expect(counts.get('All')).toBe(3);
    expect(counts.get('Character')).toBe(2);
    expect(counts.get('Place')).toBe(1);
    expect(counts.get('Event') ?? 0).toBe(0);
  });
});
