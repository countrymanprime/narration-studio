// Pure selectors for the Story Bible entry table: the columns, the sort a header click chooses (stable, with a tie-break), the filter over
// every column's text, and the sort kept in browser storage. The sort is a per-viewer convenience like readerPreferences.ts; storage can be
// missing or blocked, so every access is guarded and the table sorts by name when it fails.

import type { ExtractionSuggestion } from '../../api/contracts/extraction';
import type { GuideEntity } from '../../types';
import { chapterCount, entryFlagged, entryNeedsReview, nameCount, typeUnknown } from './entryList';
import { verifyOf } from './suggested/row/selectors';

export type ColumnKey = 'name' | 'kind' | 'aliases' | 'mentions' | 'chapters' | 'status';
type SortDirection = 'asc' | 'desc';
type SortKey = { column: ColumnKey; dir: SortDirection };
/** The header clicks in force, newest first: the first key sorts, the second breaks its ties. The name and then the id break the rest. */
export type EntrySort = readonly SortKey[];

/** The columns the table draws. The sort also knows the counts and the status, for a choice an earlier version saved. */
export const COLUMNS: readonly { key: ColumnKey; label: string; numeric: boolean }[] = [
  { key: 'name', label: 'Name', numeric: false },
  { key: 'kind', label: 'Kind', numeric: false },
];

/** The types a fresh Story Bible starts with, in their order: what the kind sort uses until the host's list is read. */
export const DEFAULT_KINDS: readonly string[] = ['Character', 'Place', 'Organization', 'Lore', 'Item', 'Event'];

export const DEFAULT_SORT: EntrySort = [{ column: 'name', dir: 'asc' }];
export const ENTRY_SORT_STORAGE_KEY = 'narration.storyBible.sort';
const MAX_KEYS = 2;

const SORTABLE: readonly ColumnKey[] = ['name', 'kind', 'aliases', 'mentions', 'chapters', 'status'];
const isColumn = (value: unknown): value is ColumnKey => SORTABLE.includes(value as ColumnKey);

/** Lower case with the Latin accents removed, so "Éowyn" and "eowyn" are one name. Emoji and right-to-left letters pass through whole (recomposed after the accents go). */
export const foldText = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .normalize('NFC')
    .toLowerCase();

const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

/** How the status column ranks an entry (verify, review, locked, clear) and the words it shows; an empty label draws nothing. */
export function statusOf(entry: GuideEntity, suggestions: readonly ExtractionSuggestion[]): { rank: number; label: string } {
  const verify = verifyOf(suggestions, entry.id);
  if (verify > 0) return { rank: 3, label: `Verify · ${verify}` };
  if (entryFlagged(entry) || typeUnknown(entry)) return { rank: 2, label: 'Review' };
  if (entry.locked) return { rank: 1, label: 'Locked' };
  return { rank: 0, label: '' };
}

/** What a sort or filter reads: the host's kinds in their order and the suggestions that decide the status. */
export type TableContext = { kinds: readonly string[]; suggestions: readonly ExtractionSuggestion[] };

const aliasText = (entry: GuideEntity): string => entry.aliases.map((alias) => alias.text).join(', ');
const byName = (a: GuideEntity, b: GuideEntity): number => collator.compare(a.canonical_name, b.canonical_name) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

function compareBy(column: ColumnKey, context: TableContext): (a: GuideEntity, b: GuideEntity) => number {
  const kindIndex = (entry: GuideEntity): number => {
    const index = context.kinds.indexOf(entry.category);
    return index === -1 ? context.kinds.length : index;
  };
  switch (column) {
    case 'name':
      return (a, b) => collator.compare(a.canonical_name, b.canonical_name);
    case 'kind':
      return (a, b) => kindIndex(a) - kindIndex(b);
    case 'aliases':
      return (a, b) => nameCount(a) - nameCount(b) || collator.compare(aliasText(a), aliasText(b));
    case 'mentions':
      return (a, b) => a.occurrence_count - b.occurrence_count;
    case 'chapters':
      return (a, b) => chapterCount(a) - chapterCount(b);
    case 'status':
      return (a, b) => statusOf(a, context.suggestions).rank - statusOf(b, context.suggestions).rank;
  }
}

/** A sorted copy by the keys in order; the name and then the id break every tie, so the order is total and the same however the rows arrive. */
export function sortRows(entries: readonly GuideEntity[], sort: EntrySort, context: TableContext): GuideEntity[] {
  const keys = sort.map((key) => {
    const compare = compareBy(key.column, context);
    return key.dir === 'asc' ? compare : (a: GuideEntity, b: GuideEntity) => compare(b, a);
  });
  return [...entries].sort((a, b) => {
    for (const compare of keys) {
      const order = compare(a, b);
      if (order !== 0) return order;
    }
    return byName(a, b);
  });
}

/** The sort after a click on a header: the column already first flips; another column becomes first (a count column most first) and the old first breaks its ties. */
export function chooseSort(sort: EntrySort, column: ColumnKey): EntrySort {
  const first = sort[0];
  if (first?.column === column) return [{ column, dir: first.dir === 'asc' ? 'desc' : 'asc' }, ...sort.slice(1)];
  const numeric = column === 'mentions' || column === 'chapters';
  const added: SortKey = { column, dir: numeric ? 'desc' : 'asc' };
  return [added, ...sort.filter((key) => key.column !== column)].slice(0, MAX_KEYS);
}

/** The `aria-sort` of a header: only the first key sorts the table, so every other column reads as unsorted. */
export const sortAria = (sort: EntrySort, column: ColumnKey): 'ascending' | 'descending' | undefined => {
  const first = sort[0];
  return first?.column === column ? (first.dir === 'asc' ? 'ascending' : 'descending') : undefined;
};

export type EntryFilter = { kind: string; query: string; reviewOnly: boolean; verifyOnly: boolean; suggestions: readonly ExtractionSuggestion[] };

/** The text the filter box matches against: the name and the other names, never a word the row does not draw (its kind or its status). */
const rowText = (entry: GuideEntity): string => foldText([entry.canonical_name, aliasText(entry)].join('\n'));

/** The rows that pass the kind chip, the review chips and the text: every word typed must be found in the name or an alias. */
export function filterEntries(entries: readonly GuideEntity[], filter: EntryFilter): GuideEntity[] {
  const words = foldText(filter.query).split(/\s+/).filter(Boolean);
  return entries.filter((entry) => {
    if (filter.kind !== 'All' && entry.category !== filter.kind) return false;
    if (filter.reviewOnly && !entryNeedsReview(entry, filter.suggestions)) return false;
    if (filter.verifyOnly && verifyOf(filter.suggestions, entry.id) === 0) return false;
    if (words.length === 0) return true;
    const text = rowText(entry);
    return words.every((word) => text.includes(word));
  });
}

/** How many entries each kind chip stands for, with the total under "All". */
export function kindCounts(entries: readonly GuideEntity[]): Map<string, number> {
  const counts = new Map<string, number>([['All', entries.length]]);
  for (const entry of entries) counts.set(entry.category, (counts.get(entry.category) ?? 0) + 1);
  return counts;
}

const LEGACY_SORTS: Record<string, EntrySort> = {
  name: DEFAULT_SORT,
  type: [{ column: 'kind', dir: 'asc' }],
  chapters: [{ column: 'chapters', dir: 'desc' }],
};

function parseSort(raw: string | null): EntrySort {
  if (raw === null) return DEFAULT_SORT;
  if (raw in LEGACY_SORTS) return LEGACY_SORTS[raw]!;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_SORT;
    const keys: SortKey[] = [];
    for (const item of parsed.slice(0, MAX_KEYS)) {
      const { column, dir } = (item ?? {}) as Record<string, unknown>;
      if (!isColumn(column) || (dir !== 'asc' && dir !== 'desc')) return DEFAULT_SORT;
      keys.push({ column, dir });
    }
    return keys;
  } catch {
    return DEFAULT_SORT;
  }
}

export function loadEntrySort(): EntrySort {
  try {
    return parseSort(window.localStorage.getItem(ENTRY_SORT_STORAGE_KEY));
  } catch {
    return DEFAULT_SORT;
  }
}

export function saveEntrySort(sort: EntrySort): void {
  try {
    window.localStorage.setItem(ENTRY_SORT_STORAGE_KEY, JSON.stringify(sort));
  } catch {
    /* storage unavailable: the choice lasts until the page closes */
  }
}
