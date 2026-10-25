import { useRef, useState, type FormEvent } from 'react';
import { VOICE_SAMPLE_LABEL_MAX, VOICE_SAMPLE_NOTE_MAX, type VoiceSample } from '../../../api/contracts/voiceSamples';
import { Button } from '../../primitives/Button';
import { Dialog } from '../../primitives/Dialog';
import { FIELD_LABEL_CLASSES } from '../../primitives/Field';
import { TextField } from '../../primitives/TextField';

export type SaveAnswer = { ok: true } | { ok: false; message: string };

const alert = 'm-0 rounded-lg bg-[var(--warn-soft)] px-3 py-2.5 text-sm';

/**
 * Rename a voice sample: its label and its note, the two things a narrator writes about it. Save stays on a failure with the host's sentence;
 * a second press while it saves does nothing. Enter saves from the label, Esc and Cancel close.
 */
export function EditVoiceSampleDialog({
  sample,
  onSave,
  onCancel,
}: {
  sample: VoiceSample;
  onSave: (label: string, note: string) => Promise<SaveAnswer>;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState(sample.label);
  const [note, setNote] = useState(sample.note);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState('');
  const busy = useRef(false);

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    setFailure('');
    try {
      const answer = await onSave(label.trim(), note.trim());
      if (!answer.ok) setFailure(answer.message);
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };

  return (
    <Dialog
      title="Rename voice sample"
      onClose={onCancel}
      dismissOnOutsidePress={false}
      actions={
        <>
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" form="rename-voice-sample" variant="primary" pending={saving}>
            Save
          </Button>
        </>
      }
    >
      <form id="rename-voice-sample" className="flex flex-col gap-3" onSubmit={(event) => void submit(event)}>
        <div className="flex flex-col gap-1">
          <label htmlFor="rename-voice-sample-label" className={FIELD_LABEL_CLASSES}>
            Label
          </label>
          <TextField
            id="rename-voice-sample-label"
            dir="auto"
            autoFocus
            maxLength={VOICE_SAMPLE_LABEL_MAX}
            value={label}
            onChange={setLabel}
            placeholder="Furious, to the court"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="rename-voice-sample-note" className={FIELD_LABEL_CLASSES}>
            Note
          </label>
          {/* native-control-ok: Field's textarea has no length limit or text direction, and no primitive offers a bare textarea */}
          <textarea
            id="rename-voice-sample-note"
            dir="auto"
            rows={3}
            maxLength={VOICE_SAMPLE_NOTE_MAX}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="How you did it: pitch up, clipped, no breaths"
            className="box-border min-h-20 w-full rounded-[var(--control-radius)] border border-[var(--line-strong)] bg-[var(--surface)] px-3 py-[0.6rem] text-[0.88rem] leading-[1.35] text-[var(--text)]"
          />
        </div>
        {failure ? (
          <p className={alert} role="alert">
            {failure}
          </p>
        ) : null}
      </form>
    </Dialog>
  );
}
