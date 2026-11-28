import { useContext } from 'react';
import { createPortal } from 'react-dom';
import { HeaderChip } from '../primitives/HeaderChip';
import { HeaderStatusSlotContext } from './HeaderStatusSlot';

/**
 * The quiet mark that stands where the red banner stood: a neutral chip with the condition in a few words, which reopens the dialog that
 * explains it and offers the fix. It never draws more than one line and is not a live region: the dialog is what says it. It has no reserved width: a slot wide enough for the
 * longest label (the connecting one) squeezed the Editing legend at 1024 px, so the controls beside it move a few pixels when the label changes (#3668).
 * With `inHeader` the chip is drawn in the app shell's header slot (`HeaderStatusSlot`) when there is one, so it takes no room from the page and
 * its coming and going moves nothing (#4060).
 */
export function ConnectionIndicator({ label, onOpen, id, inHeader = false }: { label: string; onOpen: () => void; id?: string; inHeader?: boolean }) {
  const slot = useContext(HeaderStatusSlotContext);
  const chip = (
    <span id={id} className="inline-flex flex-none">
      <HeaderChip dot="var(--warn)" onClick={onOpen} title="Show what is wrong and how to fix it" aria-label={`${label}. Show details`}>
        {label}
      </HeaderChip>
    </span>
  );
  return inHeader && slot ? createPortal(chip, slot) : chip;
}
