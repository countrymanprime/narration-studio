import { toneColors, type BadgeColors } from '../../../../primitives/StatusBadge';
import type { SwatchColour } from '../../../../primitives/Swatch';

/** The hue token of each Story Bible kind the narrator can create from a selection of text. */
const KIND_HUE = { Character: 'character', Place: 'place', Organization: 'org', Lore: 'lore', Item: 'item', Event: 'event' } as const satisfies Record<
  string,
  SwatchColour
>;

/** The kinds the tab offers for a name that has no entry, in the order the Story Bible lists them. */
export const BIBLE_KINDS: readonly string[] = Object.keys(KIND_HUE);

const hueOf = (kind: string): SwatchColour | null => (Object.hasOwn(KIND_HUE, kind) ? KIND_HUE[kind as keyof typeof KIND_HUE] : null);

/** The swatch hue of a kind; a kind with no hue of its own (a draft, a note) is the note hue. */
export const kindSwatch = (kind: string): SwatchColour => hueOf(kind) ?? 'note';

/** A kind's pill colours: its soft fill under its derived text colour, and the neutral pill for a kind with no hue. */
export function kindColours(kind: string): BadgeColors {
  const hue = hueOf(kind);
  if (!hue) return toneColors('neutral');
  return { fill: `color-mix(in srgb, var(--${hue}) 18%, var(--surface))`, text: `var(--${hue}-text)`, line: `var(--${hue})` };
}
