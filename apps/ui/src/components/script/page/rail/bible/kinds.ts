import { useMemo } from 'react';
import { useEntries } from '../../data/useScriptData';
import { entryColour, FAINT_COLOUR, type EntityColour } from '../../../../../kinds/entityColour';
import type { SwatchColour } from '../../../../primitives/Swatch';

/** A kind a selection can be added to the Story Bible as: a type's name and the colour the registry draws it in. */
export type BibleKind = { name: string; colour: EntityColour };

/** The kinds the tab offers for a name that has no entry until the host's types are read, in the order the Story Bible lists them. */
export const BIBLE_KINDS: readonly string[] = ['Character', 'Place', 'Organization', 'Lore', 'Item', 'Event'];

/** The swatch of a colour: its line token, which `styles.css` declares for every entry colour (the Swatch test reads the file). */
export const swatchOf = (colour: EntityColour): SwatchColour => colour.line.slice(2) as SwatchColour;

/**
 * The kinds a selection can be added to the Story Bible as: the host's own types (`GuideTypes`, so a type the narrator added in the
 * Story Bible is offered too), as the mock reads `bibleTypes`; the built-in six until they are read.
 */
export function useBibleKinds(): readonly string[] {
  const { types } = useEntries();
  return useMemo(() => (types.length ? types.map((type) => type.name) : BIBLE_KINDS), [types]);
}

/** The same kinds, each with the colour its type is drawn in; the built-in six are undrawn (faint) until the types are read. */
export function useBibleKindChoices(): readonly BibleKind[] {
  const { types } = useEntries();
  return useMemo(
    () =>
      types.length
        ? types.map((type) => ({ name: type.name, colour: entryColour(types, type.name) }))
        : BIBLE_KINDS.map((name) => ({ name, colour: FAINT_COLOUR })),
    [types],
  );
}
