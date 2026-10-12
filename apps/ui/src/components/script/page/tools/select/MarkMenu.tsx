import type { MarkType } from '../../../../../api/contracts/marks';
import { Button } from '../../../../primitives/Button';
import { Menu, type MenuItem } from '../../../../primitives/Menu';
import { Swatch } from '../../../../primitives/Swatch';
import { TooltipTarget } from '../../../../primitives/Tooltip';
import { markSwatch } from '../../rail/threads/markSwatch';

const WORD_ITEM = 'Pronunciation (a word)';
const DEFINE_ITEM = 'Define marks…';

/** The Mark menu: the narrator's mark types with their swatches, "Pronunciation (a word)", and "Define marks…". The types come from the host, never from a literal. */
export function MarkMenu({
  types,
  onMark,
  onFlagWord,
  onDefine,
}: {
  types: readonly MarkType[];
  onMark: (type: string) => void;
  onFlagWord: () => void;
  onDefine: () => void;
}) {
  const items: MenuItem[] = [
    ...types.map((type) => ({
      key: `mark-${type.key}`,
      label: type.name,
      leading: <Swatch colour={markSwatch(type.colour)} />,
      onSelect: () => onMark(type.key),
    })),
    { key: 'word', label: WORD_ITEM, onSelect: onFlagWord },
    { key: 'define', label: DEFINE_ITEM, onSelect: onDefine },
  ];
  return (
    <TooltipTarget text="Mark the selected words with one of your marks">
      <Menu items={items} render={<Button variant="secondary" size="sm" />}>
        Mark
      </Menu>
    </TooltipTarget>
  );
}
