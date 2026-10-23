import { useRef, useState } from 'react';
import type { VoiceSample } from '../../../api/contracts/voiceSamples';
import { Button } from '../../primitives/Button';
import { Dialog } from '../../primitives/Dialog';
import { FIELD_LABEL_CLASSES } from '../../primitives/Field';
import { Select } from '../../primitives/Select';
import type { SaveAnswer } from './EditVoiceSampleDialog';

export type MoveChoice = { id: string; name: string };

const alert = 'm-0 rounded-lg bg-[var(--warn-soft)] px-3 py-2.5 text-sm';

/**
 * Move a voice sample to another character, or to Narration. The count of the character chosen is said, and at the limit Move is off with the
 * same sentence the Voice sample dialog uses; a refusal from the host stays in the dialog.
 */
export function MoveVoiceSampleDialog({
  sample,
  choices,
  counts,
  limit,
  onMove,
  onCancel,
}: {
  sample: VoiceSample;
  /** Every character the sample could move to, not the one it is with. */
  choices: readonly MoveChoice[];
  /** How many samples each character has, by id. */
  counts: Readonly<Record<string, number>>;
  limit: number;
  onMove: (characterId: string) => Promise<SaveAnswer>;
  onCancel: () => void;
}) {
  const [target, setTarget] = useState(choices[0]?.id ?? '');
  const [moving, setMoving] = useState(false);
  const [failure, setFailure] = useState('');
  const busy = useRef(false);
  const chosen = choices.find((choice) => choice.id === target);
  const count = counts[target] ?? 0;
  const full = count >= limit;

  const submit = async (): Promise<void> => {
    if (busy.current || !chosen || full) return;
    busy.current = true;
    setMoving(true);
    setFailure('');
    try {
      const answer = await onMove(target);
      if (!answer.ok) setFailure(answer.message);
    } finally {
      busy.current = false;
      setMoving(false);
    }
  };

  return (
    <Dialog
      title="Move voice sample"
      onClose={onCancel}
      dismissOnOutsidePress={false}
      actionsAlign="end"
      description={sample.label.trim() === '' ? undefined : `Move “${sample.label}” to another character.`}
      actions={
        <>
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" variant="primary" pending={moving} disabled={!chosen || full} onClick={() => void submit()}>
            Move
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="move-voice-sample-character" className={FIELD_LABEL_CLASSES}>
            Move to
          </label>
          <Select
            id="move-voice-sample-character"
            fullWidth
            autoFocus
            value={target}
            onChange={(next) => {
              setTarget(next);
              setFailure('');
            }}
            options={choices.map((choice) => ({ value: choice.id, label: choice.name }))}
          />
          <span className="text-sm text-[var(--text-muted)]">
            {full ? `${chosen?.name ?? 'This character'} has ${limit} samples. Delete one first.` : `${count} of ${limit} samples`}
          </span>
        </div>
        {failure ? (
          <p className={alert} role="alert">
            {failure}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
