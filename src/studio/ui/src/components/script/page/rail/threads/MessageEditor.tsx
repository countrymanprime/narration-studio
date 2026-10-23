import { useState } from 'react';
import { Button } from '../../../../primitives/Button';
import { NoteTextarea } from './NoteTextarea';

/** One message of a thread being edited: a labelled box with Save and Cancel. It keeps its own draft until Save. */
export function MessageEditor({ initial, onSave, onCancel }: { initial: string; onSave: (text: string) => unknown; onCancel: () => void }) {
  const [text, setText] = useState(initial);
  return (
    <div className="flex flex-col gap-1.5">
      <NoteTextarea aria-label="Edit message" autoFocus value={text} onChange={(event) => setText(event.target.value)} />
      <div className="flex gap-1.5">
        <Button variant="secondary" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" onClick={() => void onSave(text.trim())}>
          Save
        </Button>
      </div>
    </div>
  );
}
