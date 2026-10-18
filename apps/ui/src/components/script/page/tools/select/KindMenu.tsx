import { Button } from '../../../../primitives/Button';
import { Menu } from '../../../../primitives/Menu';
import { Swatch } from '../../../../primitives/Swatch';
import { TooltipTarget } from '../../../../primitives/Tooltip';
import { swatchOf, type BibleKind } from '../../rail/bible/kinds';

/** The Story Bible menu: "Add to the Story Bible as" each kind. The kinds are the Story Bible's categories, passed in. */
export function KindMenu({ kinds, onChoose }: { kinds: readonly BibleKind[]; onChoose: (kind: string) => void }) {
  return (
    <TooltipTarget text="Add the selected words to the Story Bible as…">
      <Menu
        items={kinds.map((kind) => ({
          key: kind.name,
          label: kind.name,
          leading: <Swatch colour={swatchOf(kind.colour)} />,
          onSelect: () => onChoose(kind.name),
        }))}
        render={<Button variant="secondary" size="sm" />}
      >
        Story Bible
      </Menu>
    </TooltipTarget>
  );
}
