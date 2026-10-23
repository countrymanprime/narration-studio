import type { WordFx } from '../../../../api/contracts/wordFx';
import { Icon } from '../../../primitives/Icon';
import { Menu } from '../../../primitives/Menu';
import { SelectionActionButton } from '../../bar/SelectionActionButton';

/** Add FX (F): opens the DAW's own list at the button. With a `reason` it stays, disabled, and says why. */
export const AddFxButton = ({ reason, onClick }: { reason?: string; onClick: (element: HTMLElement) => void }) => (
  <SelectionActionButton icon="addFx" label="Add FX" hint="Add FX (F)" reason={reason} onClick={onClick} />
);

/**
 * The marker at the end of the words an effect is on (the mock's `.fxmark`): a control that names the chain and the words, and offers to
 * select the words or take the effect off. The script draws the underline; this is the control that follows the last underlined word.
 */
export function FxMarker({ fx, onSelect, onRemove }: { fx: WordFx; onSelect: (fx: WordFx) => void; onRemove: (fx: WordFx) => void }) {
  return (
    <Menu
      label={`${fx.chainName} on ${fx.text}. Options`}
      triggerClassName="mx-[0.15em] cursor-pointer rounded-full border border-[var(--accent-strong)] bg-transparent px-1.5 align-[0.2em] font-mono text-[11px] text-[var(--accent-strong)]"
      items={[
        { key: 'select', label: 'Select the words', onSelect: () => onSelect(fx) },
        { key: 'remove', label: 'Remove the effect', onSelect: () => onRemove(fx) },
      ]}
    >
      <span data-fx-marker={fx.id}>
        <Icon name="addFx" />
      </span>
    </Menu>
  );
}
