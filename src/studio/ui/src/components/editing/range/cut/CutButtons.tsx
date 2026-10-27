import { SelectionActionButton } from '../../bar/SelectionActionButton';

/** Mute (M): the same question as Delete, worded for muting. With a `reason` it stays, disabled, and says why. */
export const MuteButton = ({ reason, onClick }: { reason?: string; onClick: () => void }) => (
  <SelectionActionButton icon="hideExample" label="Mute, keep the audio" hint="Mute, keep the audio (M)" reason={reason} onClick={onClick} />
);

/**
 * Delete words and audio (Del): an icon-only danger button (owner rule, #2251: the one text button on the toolbars became an icon with a
 * tooltip). It opens the question and nothing is cut until it is answered. `separated` puts the toolbar's rule before it. With a `reason` it
 * stays, focusable but disabled, and says why.
 */
export function DeleteButton({ reason, separated = false, onClick }: { reason?: string; separated?: boolean; onClick: () => void }) {
  return (
    <>
      {separated ? <span aria-hidden="true" className="mx-1 h-5 w-px bg-current opacity-30" /> : null}
      <SelectionActionButton
        icon="delete"
        label="Delete words and audio"
        hint="Delete words and audio (Del)"
        shortcut="Delete"
        danger
        reason={reason}
        onClick={onClick}
      />
    </>
  );
}

/** Restore these words: takes the cut back through the history, or says where to undo it. */
export const RestoreButton = ({ onClick }: { onClick: () => void }) => <SelectionActionButton icon="undo" label="Restore these words" onClick={onClick} />;
