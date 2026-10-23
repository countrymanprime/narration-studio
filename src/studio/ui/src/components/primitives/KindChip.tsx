import type { ReactNode } from 'react';
import type { EntityColour } from '../../kinds/entityColour';
import { kindChipColors, kindDef, type KindId } from '../../kinds/kindMap';
import { Badge, type BadgeShape } from './StatusBadge';

// A kind of highlighted thing as a chip, drawn from the registry (kinds/kindMap.ts): the tone, the shape and the label come from
// the kind, so a misread is the same chip on Proof, Pickups and the Editing legend. A `StatusBadge` for kinds instead of tones.
type Props = {
  kind: KindId;
  /** The words on the chip; the kind's own label when omitted. An entry's chip is labelled with its type or name. */
  label?: ReactNode;
  /** The entry's colour (`entryColour`, `speakerColour`), for the `entity` and `speaker` kinds. */
  colour?: EntityColour;
  /** Overrides the kind's chip shape (a `tag` in a header, a `pill` in a list). */
  shape?: BadgeShape;
  icon?: ReactNode;
  onClick?: () => void;
  /** Placement only (a margin): the look is the kind's. */
  className?: string;
};

export function KindChip({ kind, label, colour, shape, icon, onClick, className }: Props) {
  const def = kindDef(kind);
  return (
    <Badge
      label={label ?? def.label}
      colors={kindChipColors(kind, colour)}
      shape={shape ?? def.chip}
      look={def.dashed ? 'dashed' : 'soft'}
      icon={icon}
      onClick={onClick}
      className={className}
    />
  );
}
