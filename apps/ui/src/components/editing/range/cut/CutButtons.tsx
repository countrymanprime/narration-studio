import { SelectionActionButton } from '../../bar/SelectionActionButton';
import { Button } from '../../../primitives/Button';
import { Icon } from '../../../primitives/Icon';
import { TooltipTarget } from '../../../primitives/Tooltip';

/** Mute (M): the same question as Delete, worded for muting. With a `reason` it stays, disabled, and says why. */
export const MuteButton = ({ reason, onClick }: { reason?: string; onClick: () => void }) => (
  <SelectionActionButton icon="hideExample" label="Mute, keep the audio" hint="Mute, keep the audio (M)" reason={reason} onClick={onClick} />
);

/**
 * Delete words and audio (Del), the mock's red text button: it opens the question and nothing is cut until it is answered. `short` reads
 * "Delete" (the floating toolbar, and the bar at 1280 and below); `separated` puts the toolbar's rule before it. With a `reason` it stays,
 * focusable but disabled, and says why.
 */
export function DeleteButton({
  reason,
  short = false,
  separated = false,
  onClick,
}: {
  reason?: string;
  short?: boolean;
  separated?: boolean;
  onClick: () => void;
}) {
  const hint = reason ? `Delete words and audio (Del) — ${reason}` : 'Delete words and audio (Del)';
  return (
    <>
      {separated ? <span aria-hidden="true" className="mx-1 h-5 w-px bg-current opacity-30" /> : null}
      <TooltipTarget text={hint}>
        <Button
          variant="danger"
          size="sm"
          aria-label="Delete words and audio"
          aria-keyshortcuts="Delete"
          aria-description={reason ? hint : undefined}
          aria-disabled={reason ? true : undefined}
          className="aria-disabled:cursor-not-allowed aria-disabled:opacity-55"
          onClick={reason ? (event) => event.preventDefault() : onClick}
        >
          <Icon name="delete" />
          {short ? 'Delete' : 'Delete words and audio'}
        </Button>
      </TooltipTarget>
    </>
  );
}

/** Restore these words: takes the cut back through the history, or says where to undo it. */
export const RestoreButton = ({ onClick }: { onClick: () => void }) => <SelectionActionButton icon="undo" label="Restore these words" onClick={onClick} />;
