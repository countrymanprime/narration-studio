import { plural } from '../../../../../plural';
import { useEffect, useState } from 'react';
import { useSharedSave, useUnsavedDraft } from '../../../../../studio/drafts/unsavedDrafts';
import { IconButton } from '../../../../primitives/IconButton';
import { NoteTextarea } from './NoteTextarea';

/** One message of a thread being edited: a labelled box with Discard edit and Save, as icon buttons like Proof's note editor. It keeps its own draft until Save. */
export function MessageEditor({
  initial,
  onSave,
  onCancel,
  onDirtyChange,
  onDiscarded,
}: {
  initial: string;
  onSave: (text: string) => unknown;
  onCancel: () => void;
  /** Whether the typed edit differs from the message, for the card around it (deleting the note over an edit asks). */
  onDirtyChange?: (dirty: boolean) => void;
  /** Discard & continue dropped the edit: the card stops showing this message as the one being edited, so its row reads the message again (#3458 Z1). */
  onDiscarded?: () => void;
}) {
  const [text, setText] = useState(initial);
  // Discard & continue over an in-page change (deleting another message) drops the edit: the editor closes and holds nothing (#3458 Y1).
  const [dropped, setDropped] = useState(false);
  // A blank edit is not a save: sending it would delete the message (the host replaces the text with nothing), and only the delete button deletes (#3458 qa round 5 B1).
  const blank = text.trim() === '';
  const save = useSharedSave(async () => !blank && (await onSave(text.trim())) !== false);
  const dirty = text.trim() !== '' && text.trim() !== initial.trim();
  useEffect(() => {
    onDirtyChange?.(dirty);
    return () => onDirtyChange?.(false);
  }, [dirty, onDirtyChange]);
  // An edit not yet saved is held text: leaving the page asks first (#3400). An edit put back as it was holds nothing.
  useUnsavedDraft('script-note-edit', {
    dirty: text.trim() !== '' && text.trim() !== initial.trim(),
    label: 'your edit of a note',
    kind: 'script-note-edit',
    many: (n) => `${plural(n, 'edit')} of notes`,
    save,
    // Closed here and not through `onCancel`: the page may be leaving, and cancelling would rewrite the address under the move that is about to run.
    discard: () => {
      setText(initial);
      setDropped(true);
      onDiscarded?.();
    },
  });
  if (dropped) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <NoteTextarea aria-label="Edit message" autoFocus value={text} onChange={(event) => setText(event.target.value)} />
      <div className="flex gap-1.5">
        <IconButton action="cancelEdit" label="Discard edit" size="sm" onClick={onCancel} />
        <IconButton action="saveNote" size="sm" variant="primary" disabledReason={blank ? 'Write the message first' : undefined} onClick={() => void save()} />
      </div>
    </div>
  );
}
