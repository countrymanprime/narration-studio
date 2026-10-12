// The one place the UI asks what a Story Bible entry's type is, whether it speaks and what colour it is drawn in (SN-B95). Each
// reads the host's list of types (`guideTypes`), so a type the narrator renamed, recoloured or set to speak is followed everywhere.
import type { GuideType, GuideTypeColour } from './types';

/** The CSS colour of each type colour: the kind hue it names in styles.css. */
export const TYPE_COLOUR_VAR: Record<GuideTypeColour, string> = {
  green: 'var(--character)',
  blue: 'var(--place)',
  violet: 'var(--org)',
  amber: 'var(--lore)',
  teal: 'var(--item)',
  rose: 'var(--event)',
};

/** The Story Bible's own states, never a type: an entry a build was unsure of, and one written by hand and not classified yet. They
 * are drawn in the review hue, as before. */
const SYSTEM_CATEGORIES = new Set(['Needs Review', 'Draft']);

/** The type an entry's `category` names, or undefined for a system state or a name no type has. */
export function typeOf(types: readonly GuideType[], category: string): GuideType | undefined {
  return types.find((row) => row.name === category);
}

/** Whether an entry of this category speaks: it can be a quoted line's speaker and have a speaker colour. An unknown type is silent. */
export function canSpeak(types: readonly GuideType[], category: string): boolean {
  return typeOf(types, category)?.speaks ?? false;
}

/** The colour an entry of this category is drawn in: its type's, `review` for a system state, `faint` for a name no type has. */
export function typeColour(types: readonly GuideType[], category: string): GuideTypeColour | 'review' | 'faint' {
  if (SYSTEM_CATEGORIES.has(category)) return 'review';
  return typeOf(types, category)?.colour ?? 'faint';
}
