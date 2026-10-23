import { useMemo, useState, type ReactNode } from 'react';
import { describeApiError } from '../../../api/errorMessage';
import type { VoiceSample } from '../../../api/contracts/voiceSamples';
import { usePendingAction } from '../../../hooks/usePendingAction';
import { usePort } from '../../../ports/usePort';
import { ConfirmDialog } from '../../primitives/ConfirmDialog';
import type { Notify } from '../../primitives/Toast';
import { EditVoiceSampleDialog } from './EditVoiceSampleDialog';
import { MoveVoiceSampleDialog, type MoveChoice } from './MoveVoiceSampleDialog';
import { sampleName } from './voiceSampleModel';

export type SampleActions = {
  rename: (sample: VoiceSample) => void;
  makePrimary: (sample: VoiceSample) => void;
  move: (sample: VoiceSample) => void;
  remove: (sample: VoiceSample) => void;
};

type Open = { kind: 'rename' | 'move' | 'delete'; sample: VoiceSample };

/**
 * What the narrator can do to a voice sample in the Story Bible: rename it, make it its character's primary, move it to another
 * character, delete it. Each goes through the host and the page re-reads the list (the host's `voice_samples_changed` does it too). One action
 * runs at a time, so a double press does nothing. Move and Delete ask in a dialog first; a refusal or a failure stays in the dialog or is a
 * toast, never silence. `dialogs` is what to render beside the rows.
 */
export function useVoiceSampleActions({
  notify,
  refresh,
  choices,
  counts,
  limit,
  nameOf,
  onRemoved,
  onClosed,
}: {
  notify: Notify;
  refresh: () => Promise<void>;
  /** Every character a sample can move to, with Narration. */
  choices: readonly MoveChoice[];
  counts: Readonly<Record<string, number>>;
  limit: number;
  /** The name to say for a sample's character. */
  nameOf: (sample: VoiceSample) => string;
  /** A sample was deleted or moved away, and the list is about to be read again: where focus goes next. */
  onRemoved: (sample: VoiceSample) => void;
  /** A dialog closed without changing anything: where focus returns. */
  onClosed: (sample: VoiceSample) => void;
}): { actions: SampleActions; dialogs: ReactNode } {
  const port = usePort('voiceSamples');
  const mutation = usePendingAction();
  const { run } = mutation;
  const [open, setOpen] = useState<Open>();

  const actions = useMemo<SampleActions>(
    () => ({
      rename: (sample) => setOpen({ kind: 'rename', sample }),
      move: (sample) => setOpen({ kind: 'move', sample }),
      remove: (sample) => setOpen({ kind: 'delete', sample }),
      makePrimary: (sample) => {
        void run(`primary:${sample.id}`, async () => {
          try {
            await port.voiceSampleSetPrimary(sample.id);
            await refresh();
          } catch (error) {
            notify(describeApiError(error), 'error');
          }
        });
      },
    }),
    [port, refresh, notify, run],
  );

  const close = (sample: VoiceSample) => {
    setOpen(undefined);
    onClosed(sample);
  };

  let dialogs: ReactNode = null;
  if (open?.kind === 'rename') {
    const { sample } = open;
    dialogs = (
      <EditVoiceSampleDialog
        sample={sample}
        onCancel={() => close(sample)}
        onSave={async (label, note) => {
          try {
            const answer = await port.voiceSampleUpdate(sample.id, { label, note, characterId: sample.characterId });
            if (answer.status === 'refused') return { ok: false, message: answer.message };
            await refresh();
            close(sample);
            return { ok: true };
          } catch (error) {
            return { ok: false, message: describeApiError(error) };
          }
        }}
      />
    );
  } else if (open?.kind === 'move') {
    const { sample } = open;
    dialogs = (
      <MoveVoiceSampleDialog
        sample={sample}
        choices={choices.filter((choice) => choice.id !== sample.characterId)}
        counts={counts}
        limit={limit}
        onCancel={() => close(sample)}
        onMove={async (characterId) => {
          try {
            const answer = await port.voiceSampleUpdate(sample.id, { label: sample.label, note: sample.note, characterId });
            if (answer.status === 'refused') return { ok: false, message: answer.message };
            setOpen(undefined);
            onRemoved(sample);
            await refresh();
            notify(`Moved to ${choices.find((choice) => choice.id === characterId)?.name ?? 'the other character'}.`);
            return { ok: true };
          } catch (error) {
            return { ok: false, message: describeApiError(error) };
          }
        }}
      />
    );
  } else if (open?.kind === 'delete') {
    const { sample } = open;
    const name = sampleName(sample, nameOf(sample));
    dialogs = (
      <ConfirmDialog
        title="Delete voice sample"
        body={`Delete “${name}”? Its audio is removed from this project. The recording it was copied from is not touched.`}
        confirmLabel="Delete"
        confirmVariant="danger"
        pending={mutation.isPending(`delete:${sample.id}`)}
        cancel={() => close(sample)}
        confirm={() =>
          void mutation.run(`delete:${sample.id}`, async () => {
            try {
              const removed = await port.voiceSampleRemove(sample.id);
              setOpen(undefined);
              onRemoved(sample);
              await refresh();
              notify(removed.removed === 0 ? 'Already deleted.' : 'Voice sample deleted.');
            } catch (error) {
              notify(describeApiError(error), 'error');
            }
          })
        }
      />
    );
  }

  return { actions, dialogs };
}
