import { useState } from 'react';
import type { MarkType } from '../../../../api/contracts/marks';
import { Button } from '../../../primitives/Button';
import { Field } from '../../../primitives/Field';
import { FIELD_LABEL_CLASSES } from '../../../primitives/Field';
import { Select } from '../../../primitives/Select';

/**
 * "Add a note" (the mock's `NoteDialog`): the kind of mark, from the kinds that do not ask a question, and the note. Save refuses an empty note
 * and keeps the dialog open; Cancel and Escape close it with nothing written. `onSave` runs the Script page's mark command and answers
 * whether it marked, and the dialog closes only then.
 */
export function NoteDialog({
  kinds,
  onSave,
  onClose,
}: {
  kinds: readonly MarkType[];
  onSave: (type: string, text: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const [kind, setKind] = useState(kinds[0]?.key ?? '');
  const [text, setText] = useState('');
  const [problem, setProblem] = useState<string>();
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!text.trim()) {
      setProblem('Write the note first.');
      return;
    }
    setBusy(true);
    try {
      if (await onSave(kind, text)) onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <div>
        <label className={FIELD_LABEL_CLASSES} htmlFor="note-kind">
          Kind of mark
        </label>
        <Select id="note-kind" label="Kind of mark" value={kind} onChange={setKind} options={kinds.map((k) => ({ value: k.key, label: k.name }))} fullWidth />
      </div>
      <Field
        label="Note"
        textarea
        autoFocus
        value={text}
        onChange={(value) => {
          setText(value);
          setProblem(undefined);
        }}
        {...(problem ? { error: problem } : {})}
      />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" pending={busy} disabled={!kind}>
          Save note
        </Button>
      </div>
    </form>
  );
}
