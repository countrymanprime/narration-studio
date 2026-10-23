// Pure selectors for the Story Bible entries: the alias and chapter counts a row shows, what needs review, and the colour of a kind. The sort
// and the filter over the table's columns are entryTable.ts.

import type { ExtractionSuggestion } from '../../api/contracts/extraction';
import type { GuideEntity, GuideReview, GuideType } from '../../types';
import type { SwatchColour } from '../primitives/Swatch';
import { entryColour } from '../../kinds/entityColour';
import { verifyOf } from './suggested/row/selectors';

/** The names the app links in the text for an entry, as the detail lists them: its own name and each alias (the mock's "1 name"). */
export const nameCount = (entry: GuideEntity): number => 1 + entry.aliases.length;

/** The host could not tell what type the entry is (`Needs Review` is a state, never a type): the row says so and still asks for review. */
export const typeUnknown = (entry: GuideEntity): boolean => entry.category === 'Needs Review';

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

/** The swatch of a category's type colour, so a row and a chip follow what the narrator set in Settings. The colour is the registry's (`entryColour`): a Needs Review or Draft entry is amber (D7), a type nobody defines is faint. */
export const kindSwatch = (types: readonly GuideType[], category: string): SwatchColour => entryColour(types, category).line.slice(2) as SwatchColour;
