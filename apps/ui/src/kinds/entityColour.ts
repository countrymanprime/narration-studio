// The one resolver for the colour of a Story Bible entry, its type and its speaker (docs/research/finding-colours-and-chips.md
// section 4.2). A surface asks here and never keeps its own type-to-colour map. Every colour is a custom property name from
// styles.css, bare (`--place`), so a caller wraps it in `var()` itself or hands it to `tint`.
import { SPEAKER_COLOR_COUNT } from '../components/primitives/speakerColor';
import { typeColour } from '../storyBibleTypes';
import type { GuideType, GuideTypeColour } from '../types';

/** The six hues a Story Bible type can be set to, as the entity tokens of styles.css. */
export const ENTITY_HUES = ['character', 'place', 'org', 'lore', 'item', 'event'] as const;
type EntityHue = (typeof ENTITY_HUES)[number];

/** What an entry is drawn in: a type's hue, `warn` for an entry still to review (D7), `faint` for a type nobody defines, or a speaker colour. */
export type EntityColour = {
  hue: EntityHue | 'warn' | 'faint' | `speaker-${number}`;
  /** The pure colour: the underline, the tint, the chip's line. */
  line: string;
  /** The text colour on the tint, mixed toward `--text` so it clears 4.5:1. */
  text: string;
};

/** The hue each type colour of the Settings picker names. */
const TYPE_HUE: Record<GuideTypeColour, EntityHue> = {
  green: 'character',
  blue: 'place',
  violet: 'org',
  amber: 'lore',
  teal: 'item',
  rose: 'event',
};

const hueColour = (hue: EntityHue): EntityColour => ({ hue, line: `--${hue}`, text: `--${hue}-text` });

/** The colour of a type colour name (a Settings picker value), for a swatch that has no entry. */
export const typeHueColour = (colour: GuideTypeColour): EntityColour => hueColour(TYPE_HUE[colour]);

// The text is the page's own: `--warn-text` is the pure amber, which is 4.4:1 on a 20% amber tint, and the hues' mixed-toward-text recipe has no amber token.
export const WARN_COLOUR: EntityColour = { hue: 'warn', line: '--warn', text: '--text' };
export const FAINT_COLOUR: EntityColour = { hue: 'faint', line: '--non-text', text: '--text-muted' };

/** Every colour an entity mark or chip can be drawn in: the six hues, the review state and the fallback. */
export const ALL_ENTITY_COLOURS: readonly EntityColour[] = [...ENTITY_HUES.map(hueColour), WARN_COLOUR, FAINT_COLOUR];

/** The colour an entry of this category is drawn in: its type's, `warn` for Needs Review and Draft, `faint` for a type that does not exist (or was deleted). */
export function entryColour(types: readonly GuideType[], category: string): EntityColour {
  const colour = typeColour(types, category);
  if (colour === 'review') return WARN_COLOUR;
  if (colour === 'faint') return FAINT_COLOUR;
  return typeHueColour(colour);
}

/**
 * The colour of a speaker (D6): the entry's own `speaker_color` (1..7) when set, else its type's colour. No id hash, so a
 * character has one colour. A narrator or an unknown speaker (no entry) gets no hue: the caller draws the neutral dashed chip.
 */
export function speakerColour(types: readonly GuideType[], entry: { category: string; speakerColor?: number } | undefined): EntityColour | null {
  if (!entry) return null;
  const pick = entry.speakerColor;
  if (pick !== undefined && Number.isInteger(pick) && pick >= 1 && pick <= SPEAKER_COLOR_COUNT)
    return { hue: `speaker-${pick}`, line: `--speaker-${pick}`, text: `--speaker-${pick}-text` };
  return entryColour(types, entry.category);
}

/** A tint of a custom property over whatever is behind (D13: one helper, no `-soft` token per hue). Transparent, so it reads right on the reader's banded rows. */
export const tint = (token: string, percent: number): string => `color-mix(in srgb, var(${token}) ${percent}%, transparent)`;

/** The same tint made opaque over a surface token, for a chip that sits in a list or a card. */
export const tintOver = (token: string, percent: number, surface = '--surface'): string => `color-mix(in srgb, var(${token}) ${percent}%, var(${surface}))`;
