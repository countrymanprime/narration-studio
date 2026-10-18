// The colour pairs the registry draws, as data: paletteContrast.test.ts measures every row in both themes, and kindMap.test.ts
// fails when a kind has no row (docs/research/finding-colours-and-chips.md section 5.2, rule 5). Derived from the same functions the
// primitives draw with, so a recipe that changes changes its pair.
import { ALL_ENTITY_COLOURS, type EntityColour } from './entityColour';
import { KIND_IDS, kindChipColors, kindColour, kindDef, kindFill, type KindId } from './kindMap';
import { kindMarkStyle } from './markStyle';

export type KindPairRow = {
  id: string;
  kind: KindId;
  role: 'mark-text' | 'mark-line' | 'chip-text' | 'chip-line';
  fg: string;
  /** The fill behind the foreground; undefined when it sits on the surface itself. */
  bg?: string;
  /** `reading` rows are measured over the reader's surfaces, `chip` rows over the card and the table's, `card` rows over the card only (`--line-strong` is held to 3:1 there). */
  scope: 'reading' | 'chip' | 'card';
  where: string;
};

/** The colours a kind is drawn in: the entry colours for an entity or speaker kind, else the one fixed hue. */
const coloursOf = (id: KindId): (EntityColour | undefined)[] => (kindDef(id).hue === 'entity' ? ALL_ENTITY_COLOURS : [undefined]);

const unwrap = (value: unknown): string => (typeof value === 'string' && value !== 'transparent' ? value : '');

export function kindPairRows(): KindPairRow[] {
  const rows: KindPairRow[] = [];
  for (const kind of KIND_IDS) {
    const def = kindDef(kind);
    for (const colour of coloursOf(kind)) {
      const suffix = colour ? `${kind}-${colour.hue}` : kind;
      const style = kindMarkStyle(kind, colour);
      if (style) {
        const fill = def.mark?.fill ? kindFill(kind, colour) : undefined;
        rows.push({
          id: `kind-mark-text-${suffix}`,
          kind,
          role: 'mark-text',
          fg: unwrap(style.color) || 'var(--text)',
          bg: fill,
          scope: 'reading',
          where: `the ${def.label} text mark: its words on its own fill`,
        });
        rows.push({
          id: `kind-mark-line-${suffix}`,
          kind,
          role: 'mark-line',
          fg: `var(${kindColour(kind, colour).line})`,
          bg: fill,
          scope: 'reading',
          where: `the ${def.label} text mark's ${def.mark?.shape} line, a 3:1 mark on the reading surfaces and on its own fill`,
        });
      }
      const chip = kindChipColors(kind, colour);
      rows.push({
        id: `kind-chip-text-${suffix}`,
        kind,
        role: 'chip-text',
        fg: chip.text,
        bg: chip.fill,
        scope: 'chip',
        where: `the ${def.label} chip: its label on its fill`,
      });
      if (def.dashed)
        rows.push({
          id: `kind-chip-line-${suffix}`,
          kind,
          role: 'chip-line',
          fg: chip.line,
          scope: 'card',
          where: `the ${def.label} chip's dashed border on the card`,
        });
    }
  }
  return rows;
}
