// Pure selectors for the Story Bible list: the sort, the alias and chapter counts a row shows, and what needs review. The list shows no line or mention
// counts (the Studio Next mock has none). The sort choice is a per-viewer convenience in browser storage, like readerPreferences.ts;
// storage can be missing or blocked, so every access is guarded and the list sorts by name when it fails.

import type { ExtractionSuggestion } from '../../api/contracts/extraction';
import type { GuideEntity, GuideReview, GuideType } from '../../types';
import type { SwatchColour } from '../primitives/Swatch';
import { typeColour } from '../../storyBibleTypes';
import { verifyOf } from './suggested/row/selectors';

export type EntrySortKey = 'name' | 'type' | 'chapters';

export const ENTRY_SORT_OPTIONS: readonly { value: EntrySortKey; label: string }[] = [
  { value: 'name', label: 'Name' },
  { value: 'type', label: 'Type' },
  { value: 'chapters', label: 'Chapters' },
];

export const ENTRY_SORT_STORAGE_KEY = 'narration.storyBible.sort';

const isEntrySortKey = (value: unknown): value is EntrySortKey => ENTRY_SORT_OPTIONS.some((option) => option.value === value);

/** The names an entry is also known by. */
export const aliasCount = (entry: GuideEntity): number => entry.aliases.length;

/** How many chapters the entry appears in: from `appearances`, or from its evidence on a file written before appearances existed. */
export function chapterCount(entry: GuideEntity): number {
  const chapters = entry.appearances
    ? entry.appearances.map((appearance) => appearance.chapterId)
    : entry.occurrences.map((occurrence) => occurrence.chapterId ?? occurrence.chapter);
  return new Set(chapters).size;
}

/** The host's review flags; a host that sends none is read from `review_state`, with no name flagged. */
export const reviewFlags = (entry: GuideEntity): GuideReview => entry.review ?? { entry: entry.review_state === 'needs review', aliases: [] };

/** The entry or one of its names carries a flag the narrator has not cleared (the Studio Next mock's `needsReview`). */
export const entryFlagged = (entry: GuideEntity): boolean => {
  const review = reviewFlags(entry);
  return review.entry || review.aliases.length > 0;
};

/** One name carries a flag (`aliasNeedsReview`). */
export const aliasFlagged = (entry: GuideEntity, aliasText: string): boolean => reviewFlags(entry).aliases.includes(aliasText);

/** Flagged, or a suggestion about it is still to be verified (`entryNeedsReview`). */
export const entryNeedsReview = (entry: GuideEntity, suggestions: readonly ExtractionSuggestion[]): boolean =>
  entryFlagged(entry) || verifyOf(suggestions, entry.id) > 0;

/** How many entries need review: what the chip counts and filters to (`reviewCount`). */
export const reviewCount = (entries: readonly GuideEntity[], suggestions: readonly ExtractionSuggestion[]): number =>
  entries.filter((entry) => entryNeedsReview(entry, suggestions)).length;

/** The row's pill: "Verify · N" while N suggestions wait, else "Review" for a flag; nothing when the entry needs neither. */
export function reviewPill(entry: GuideEntity, suggestions: readonly ExtractionSuggestion[]): string | undefined {
  const verify = verifyOf(suggestions, entry.id);
  if (verify > 0) return `Verify · ${verify}`;
  return entryFlagged(entry) ? 'Review' : undefined;
}

/** The swatch each type colour is drawn with: the kind hue it names in styles.css. */
const SWATCH_OF_COLOUR = {
  green: 'character',
  blue: 'place',
  violet: 'org',
  amber: 'lore',
  teal: 'item',
  rose: 'event',
  review: 'review',
  faint: 'non-text',
} as const satisfies Record<ReturnType<typeof typeColour>, SwatchColour>;

/** The swatch of a category's type colour, so a row and a chip follow what the narrator set in Settings (`typeColour`). */
export const kindSwatch = (types: readonly GuideType[], category: string): SwatchColour => SWATCH_OF_COLOUR[typeColour(types, category)];

/** Whether the entry's name or one of its other names contains the query, ignoring case; an empty query matches every entry. */
export function matchesQuery(entry: GuideEntity, query: string): boolean {
  const wanted = query.trim().toLowerCase();
  return wanted === '' || [entry.canonical_name, ...entry.aliases.map((alias) => alias.text)].some((name) => name.toLowerCase().includes(wanted));
}

/** The types a fresh Story Bible starts with, in their order: what the type sort uses until the host's list is read. */
const DEFAULT_KINDS: readonly string[] = ['Character', 'Place', 'Organization', 'Lore', 'Item', 'Event'];
const byName = (a: GuideEntity, b: GuideEntity): number =>
  a.canonical_name.toLowerCase().localeCompare(b.canonical_name.toLowerCase()) || a.canonical_name.localeCompare(b.canonical_name) || a.id.localeCompare(b.id);

/** A sorted copy: name A to Z, type in the order of `kinds` (an unknown one last), chapters most first; the name breaks every tie, then the id, so the order is total. */
export function sortEntries(entries: readonly GuideEntity[], key: EntrySortKey, kinds: readonly string[] = DEFAULT_KINDS): GuideEntity[] {
  const typeIndex = (entry: GuideEntity): number => {
    const index = kinds.indexOf(entry.category);
    return index === -1 ? kinds.length : index;
  };
  const compare =
    key === 'type'
      ? (a: GuideEntity, b: GuideEntity) => typeIndex(a) - typeIndex(b) || byName(a, b)
      : key === 'chapters'
        ? (a: GuideEntity, b: GuideEntity) => chapterCount(b) - chapterCount(a) || byName(a, b)
        : byName;
  return [...entries].sort(compare);
}

export function loadEntrySort(): EntrySortKey {
  try {
    const stored = window.localStorage.getItem(ENTRY_SORT_STORAGE_KEY);
    return isEntrySortKey(stored) ? stored : 'name';
  } catch {
    return 'name';
  }
}

export function saveEntrySort(key: EntrySortKey): void {
  try {
    window.localStorage.setItem(ENTRY_SORT_STORAGE_KEY, key);
  } catch {
    /* storage unavailable: the choice lasts until the page closes */
  }
}
