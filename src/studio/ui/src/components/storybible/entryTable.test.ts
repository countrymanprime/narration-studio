// @vitest-environment jsdom
import fc from 'fast-check';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExtractionSuggestion } from '../../api/contracts/extraction';
import type { GuideEntity } from '../../types';
import {
  ENTRY_SORT_STORAGE_KEY,
  DEFAULT_SORT,
  chooseSort,
  filterCount,
  filterEntries,
  foldText,
  kindCounts,
  markedParts,
  matchedAlias,
  searchWords,
  loadEntrySort,
  pickSort,
  saveEntrySort,
  sortAria,
  sortRows,
  type ColumnKey,
  type EntryFilter,
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
const CHAPTER_ORDER = new Map([
  ['1', 0],
  ['2', 1],
  ['3', 2],
]);
const KINDS = ['Character', 'Place', 'Organization', 'Lore', 'Item', 'Event'];
const none: readonly ExtractionSuggestion[] = [];
const asc = (column: ColumnKey): EntrySort => [{ column, dir: 'asc' }];
const sorted = (rows: GuideEntity[], sort: EntrySort, suggestions = none) => sortRows(rows, sort, { kinds: KINDS, suggestions, chapterOrder: CHAPTER_ORDER });

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
  // The chapter-count, aliases and status sorts are gone with SNB-D3: no control reached them, only a sort an earlier version saved.
  it('sorts in book order: by the chapter each entry first appears in, the most mentioned first within a chapter, an entry in no chapter last', () => {
    const book = [
      entry('late', 'Late', { appearances: inChapters('3'), occurrence_count: 50 }),
      entry('few', 'Few', { appearances: inChapters('2', '1'), occurrence_count: 2 }),
      entry('many', 'Many', { appearances: inChapters('1'), occurrence_count: 9 }),
      entry('none', 'None'),
      entry('old', 'Old', { occurrences: [{ chapterId: '2', chapter: 'Two', paragraph: 0 }] as unknown as GuideEntity['occurrences'] }),
    ];
    expect(ids(sortRows(book, asc('book'), { kinds: KINDS, suggestions: none, chapterOrder: CHAPTER_ORDER }))).toEqual(['many', 'few', 'old', 'late', 'none']);
  });
  it('sorts by most mentioned, then by name', () => {
    expect(ids(sorted(rows, [{ column: 'mentions', dir: 'desc' }]))).toEqual(['b', 'c', 'a', 'd']);
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
  const colArb = fc.constantFrom<ColumnKey>('name', 'kind', 'book', 'mentions');
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
    const next = chooseSort(chooseSort(asc('name'), 'kind'), 'mentions');
    expect(next).toEqual([
      { column: 'mentions', dir: 'desc' },
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
    expect(sortAria(sort, 'book')).toBeUndefined();
  });
});

describe('the-sort-choice-is-kept', () => {
  beforeEach(() => window.localStorage.clear());
  it('defaults to name', () => expect(loadEntrySort()).toEqual(DEFAULT_SORT));
  it('restores a saved choice', () => {
    const sort: EntrySort = [
      { column: 'book', dir: 'asc' },
      { column: 'name', dir: 'asc' },
    ];
    saveEntrySort(sort);
    expect(loadEntrySort()).toEqual(sort);
  });
  it('reads the three words the old sort menu stored', () => {
    window.localStorage.setItem(ENTRY_SORT_STORAGE_KEY, 'chapters');
    expect(loadEntrySort()).toEqual([{ column: 'book', dir: 'asc' }]);
    window.localStorage.setItem(ENTRY_SORT_STORAGE_KEY, 'type');
    expect(loadEntrySort()).toEqual([{ column: 'kind', dir: 'asc' }]);
  });
  it('ignores a stored value that is not a sort', () => {
    for (const bad of [
      'occurrences',
      '[{"column":"nope","dir":"asc"}]',
      '[{"column":"status","dir":"asc"}]',
      '{',
      '[]',
      '[{"column":"name","dir":"sideways"}]',
    ]) {
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
  const base: EntryFilter = { kinds: [], pron: 'any', show: 'all', query: '', suggestions: none };
  const found = (over: Partial<EntryFilter>) => ids(filterEntries(rows, { ...base, ...over }));

  it('keeps every row with no filter', () => expect(found({})).toEqual(['h', 'w', 'e', 'r', 'z']));
  it('matches the name or an alias, ignoring case and accents', () => {
    expect(found({ query: 'tarr' })).toEqual(['h']);
    expect(found({ query: 'eowyn' })).toEqual(['e']);
  });
  // A row found by text it does not draw would show no reason for being there: the kind and the status words are not searched.
  it('matches the name and the other names only, not the kind or the status', () => {
    expect(found({ query: 'place' })).toEqual([]);
    expect(found({ query: 'character' })).toEqual([]);
    expect(found({ query: 'verify' })).toEqual([]);
  });
  it('needs every word to match, in the name or an alias', () => {
    expect(found({ query: 'hatter' })).toEqual(['h']);
    expect(found({ query: 'hatter eowyn' })).toEqual([]);
  });
  it('finds right-to-left and emoji text', () => {
    expect(found({ query: 'أليس' })).toEqual(['r']);
    expect(found({ query: '🐇' })).toEqual(['z']);
  });
  it('matches nothing for text nobody has, and everything for blank text', () => {
    expect(found({ query: 'zzz' })).toEqual([]);
    expect(found({ query: '   ' })).toHaveLength(5);
  });
  // The Filter menu keeps several kinds at once (SNB-D3); none chosen keeps every kind.
  it('filters by one kind or several, and none chosen keeps every kind', () => {
    expect(found({ kinds: ['Place'] })).toEqual(['w']);
    expect(found({ kinds: ['Place', 'Lore'] })).toEqual(['w', 'r', 'z']);
    expect(found({ kinds: ['Place'], query: 'hatter' })).toEqual([]);
    expect(found({ kinds: [] })).toHaveLength(5);
  });
  it('filters by whether the entry has a pronunciation', () => {
    const said = { ipa: 'ˈhætə', source: 'manual', confidence: '' };
    const two = [entry('s', 'Said', { pronunciation: said }), entry('n', 'Not said'), entry('b', 'Blank', { pronunciation: { ...said, ipa: '  ' } })];
    expect(ids(filterEntries(two, { ...base, pron: 'set' }))).toEqual(['s']);
    expect(ids(filterEntries(two, { ...base, pron: 'none' }))).toEqual(['n', 'b']);
    expect(ids(filterEntries(two, { ...base, pron: 'any' }))).toEqual(['s', 'n', 'b']);
  });
  it('filters to the entries that need review or have something to verify', () => {
    const flagged = [entry('f', 'F', { review: { entry: true, aliases: [] } }), entry('g', 'G')];
    expect(ids(filterEntries(flagged, { ...base, show: 'review' }))).toEqual(['f']);
    expect(ids(filterEntries(flagged, { ...base, show: 'verify' }))).toEqual([]);
  });
  it('counts the filters on, the text aside', () => {
    expect(filterCount(base)).toBe(0);
    expect(filterCount({ ...base, query: 'x' })).toBe(0);
    expect(filterCount({ ...base, kinds: ['Place', 'Lore'], pron: 'none', show: 'review' })).toBe(4);
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

describe('a-search-says-why-a-row-is-there', () => {
  const hatter = entry('h', 'The Hatter', { aliases: [alias('Mad Hatter'), alias('Tarrant Hightopp')] });
  const marks = (text: string, query: string) =>
    markedParts(text, searchWords(query))
      .map((part) => (part.marked ? `[${part.text}]` : part.text))
      .join('');

  it('splits the query into folded words', () => expect(searchWords('  Tarr  ÉO ')).toEqual(['tarr', 'eo']));
  it('names the alias that matched when the name alone does not hold every word', () => {
    expect(matchedAlias(hatter, searchWords('tarr'))).toBe('Tarrant Hightopp');
    expect(matchedAlias(hatter, searchWords('hatter tarr'))).toBe('Tarrant Hightopp');
  });
  it('names no alias when the name holds every word, or nothing is typed', () => {
    expect(matchedAlias(hatter, searchWords('hatt'))).toBeUndefined();
    expect(matchedAlias(hatter, [])).toBeUndefined();
  });
  it('marks every place a word is found, ignoring case and accents', () => {
    expect(marks('The Hatter', 'hat')).toBe('The [Hat]ter');
    expect(marks('Éowyn of Éomer', 'eo')).toBe('[Éo]wyn of [Éo]mer');
    expect(marks('Tarrant', 'ta an')).toBe('[Ta]rr[an]t');
  });
  it('joins overlapping matches and marks nothing for no words', () => {
    expect(marks('aaaa', 'aa')).toBe('[aaaa]');
    expect(marks('Alice', '')).toBe('Alice');
  });
  it('keeps right-to-left and emoji text whole', () => {
    expect(marks('🐇 Rabbit', '🐇')).toBe('[🐇] Rabbit');
    expect(marks('أليس', 'لي')).toBe('أ[لي]س');
  });
  it('gives back the text it was given, marked or not', () =>
    fc.assert(
      fc.property(fc.string(), fc.string(), (text, query) => {
        expect(
          markedParts(text, searchWords(query))
            .map((part) => part.text)
            .join(''),
        ).toBe(text);
      }),
    ));
});

describe('a-choice-in-the-sort-menu', () => {
  it('puts the chosen order first in its own direction, the old first breaking ties, and keeps a choice already first as it is', () => {
    expect(pickSort(DEFAULT_SORT, 'mentions')).toEqual([
      { column: 'mentions', dir: 'desc' },
      { column: 'name', dir: 'asc' },
    ]);
    expect(pickSort(DEFAULT_SORT, 'book')[0]).toEqual({ column: 'book', dir: 'asc' });
    const down: EntrySort = [{ column: 'name', dir: 'desc' }];
    expect(pickSort(down, 'name')).toBe(down);
  });
});
