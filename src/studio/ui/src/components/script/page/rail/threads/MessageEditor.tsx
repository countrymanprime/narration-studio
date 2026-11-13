import { plural } from '../../../../../plural';
import { useState } from 'react';
import { useSharedSave, useUnsavedDraft } from '../../../../../studio/drafts/unsavedDrafts';
import { Button } from '../../../../primitives/Button';
import { NoteTextarea } from './NoteTextarea';

/** One message of a thread being edited: a labelled box with Save and Cancel. It keeps its own draft until Save. */
export function MessageEditor({ initial, onSave, onCancel }: { initial: string; onSave: (text: string) => unknown; onCancel: () => void }) {
  const [text, setText] = useState(initial);
  const save = useSharedSave(async () => (await onSave(text.trim())) !== false);
  // An edit not yet saved is held text: leaving the page asks first (#3400). An edit put back as it was holds nothing.
  useUnsavedDraft('script-note-edit', {
    dirty: text.trim() !== '' && text.trim() !== initial.trim(),
    label: 'your edit of a note',
    kind: 'script-note-edit',
    many: (n) => `${plural(n, 'edit')} of notes`,
    save,
    // The page is leaving, and cancelling would rewrite the address under the move that is about to run.
    discard: () => {},
  });
  return (
    <div className="flex flex-col gap-1.5">
      <NoteTextarea aria-label="Edit message" autoFocus value={text} onChange={(event) => setText(event.target.value)} />
      <div className="flex gap-1.5">
        <Button variant="secondary" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" onClick={() => void save()}>
          Save
        </Button>
      </div>
    </div>
  );
}
