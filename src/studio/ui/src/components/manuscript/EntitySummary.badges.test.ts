// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { ENTITY_HUES, entryColour, typeHueColour } from '../../kinds/entityColour';
import { kindChipColors } from '../../kinds/kindMap';
import type { GuideType, GuideTypeColour } from '../../types';

// docs/design/colour-and-contrast.md: a badge's text is the derived `--<token>-text` of its kind (the kind colour mixed toward --text),
// on an 18% tint of the kind colour over the surface (D13: the helper, no `-soft` token per hue). The palette guard reads tokens, not
// component source, so this test ties the entry chip to the tokens it measures.
const TYPE = (name: string, colour: GuideTypeColour): GuideType => ({ name, colour, speaks: false });
const TYPES: GuideType[] = [
  TYPE('Character', 'green'),
  TYPE('Place', 'blue'),
  TYPE('Organization', 'violet'),
  TYPE('Lore', 'amber'),
  TYPE('Item', 'teal'),
  TYPE('Event', 'rose'),
];

describe('entry chip colours', () => {
  for (const [type, hue] of TYPES.map((row, index) => [row.name, ENTITY_HUES[index]] as const)) {
    it(`draws a ${type} chip in --${hue}-text on a tint of --${hue}`, () => {
      const colors = kindChipColors('entity', entryColour(TYPES, type));
      expect(colors.text).toBe(`var(--${hue}-text)`);
      expect(colors.line).toBe(`var(--${hue})`);
      expect(colors.fill).toBe(`color-mix(in srgb, var(--${hue}) 18%, var(--surface))`);
    });
  }

  it('draws a Needs Review or Draft entry amber (D7) and an entry of an unknown type faint', () => {
    expect(entryColour(TYPES, 'Needs Review').line).toBe('--warn');
    expect(entryColour(TYPES, 'Draft').line).toBe('--warn');
    expect(entryColour(TYPES, 'Gone').line).toBe('--non-text');
    expect(typeHueColour('green').line).toBe('--character');
  });
});
