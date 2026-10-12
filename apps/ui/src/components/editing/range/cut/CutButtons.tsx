import { SelectionActionButton } from '../../bar/SelectionActionButton';

/** Mute (M): the same question as Delete, worded for muting. With a `reason` it stays, disabled, and says why. */
export const MuteButton = ({ reason, onClick }: { reason?: string; onClick: () => void }) => (
  <SelectionActionButton icon="hideExample" label="Mute, keep the audio" hint="Mute, keep the audio (M)" reason={reason} onClick={onClick} />
);

/** Delete words and audio (Del): opens the question; nothing is cut until it is answered. */
export const DeleteButton = ({ reason, onClick }: { reason?: string; onClick: () => void }) => (
  <SelectionActionButton icon="delete" label="Delete words and audio" hint="Delete words and audio (Del)" reason={reason} onClick={onClick} />
);

/** Restore these words: takes the cut back through the history, or says where to undo it. */
export const RestoreButton = ({ onClick }: { onClick: () => void }) => <SelectionActionButton icon="undo" label="Restore these words" onClick={onClick} />;
