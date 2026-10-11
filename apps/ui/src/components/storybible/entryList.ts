// Pure selectors for the Story Bible list: the sort, the alias and chapter counts a row shows, and what needs review. The list shows no line or mention
// counts (the Studio Next mock has none). The sort choice is a per-viewer convenience in browser storage, like readerPreferences.ts;
// storage can be missing or blocked, so every access is guarded and the list sorts by name when it fails.

import type { ExtractionSuggestion } from '../../api/contracts/extraction';
import type { GuideEntity, GuideReview } from '../../types';
import { STORY_BIBLE_TABS } from '../../state';
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

// Category tabs after "All" and before "Needs Review" give the order of types; an unknown category sorts last.
const TYPE_ORDER = STORY_BIBLE_TABS.filter((tab) => tab !== 'All' && tab !== 'Needs Review');
const typeIndex = (entry: GuideEntity): number => {
  const label = entry.category === 'Place' ? 'Location' : entry.category;
  const index = TYPE_ORDER.indexOf(label);
  return index === -1 ? TYPE_ORDER.length : index;
};
const byName = (a: GuideEntity, b: GuideEntity): number =>
  a.canonical_name.toLowerCase().localeCompare(b.canonical_name.toLowerCase()) || a.canonical_name.localeCompare(b.canonical_name) || a.id.localeCompare(b.id);

/** A sorted copy: name A to Z, type in tab order, chapters most first; the name breaks every tie, then the id, so the order is total. */
export function sortEntries(entries: readonly GuideEntity[], key: EntrySortKey): GuideEntity[] {
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
