import { useState } from 'react';
import { MAX_REVIEW_NOTE_LENGTH, type FindingThreadAuthor, type FindingThreadChange, type FindingThreadMessage } from '../../../api/contracts/findings';
import { describeApiError } from '../../../api/errorMessage';
import { usePendingAction } from '../../../hooks/usePendingAction';
import { useOverlay } from '../../../overlay/OverlayProvider';
import type { Finding, NarrationApi } from '../../../types';
import { Button } from '../../primitives/Button';
import { Field } from '../../primitives/Field';
import { IconButton } from '../../primitives/IconButton';
import { SectionLabel } from '../../primitives/SectionLabel';
import { ToggleGroup } from '../../primitives/ToggleGroup';

/** The one host call the thread makes. */
export type FindingThreadApi = Pick<NarrationApi, 'findingsThread'>;

const WHO_LABEL: Record<FindingThreadAuthor, string> = { you: 'You', proofer: 'Proofer' };

/** When a note was written, as the narrator reads it: the day and the time in their own locale. */
function when(at: string): string {
  const date = new Date(at);
  return Number.isNaN(date.getTime()) ? at : date.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function Message({
  message,
  disabled,
  onEdit,
  onDelete,
}: {
  message: FindingThreadMessage;
  disabled: boolean;
  onEdit: (text: string) => Promise<boolean>;
  onDelete: () => void;
}) {
  const [draft, setDraft] = useState<string>();
  if (draft !== undefined)
    return (
      <div className="flex flex-col gap-1.5">
        <Field label="Edit note" textarea autoFocus value={draft} onChange={(value) => setDraft([...value].slice(0, MAX_REVIEW_NOTE_LENGTH).join(''))} />
        <div className="flex gap-1.5">
          <Button variant="secondary" size="sm" onClick={() => setDraft(undefined)}>
            Cancel
          </Button>
          <Button size="sm" disabled={disabled || draft.trim() === ''} onClick={() => void onEdit(draft).then((saved) => saved && setDraft(undefined))}>
            Save
          </Button>
        </div>
      </div>
    );
  return (
    <div
      data-message={message.id}
      className={`flex flex-col gap-0.5 rounded-[var(--radius-card)] border border-[var(--border)] px-2 py-1.5 text-sm ${message.who === 'proofer' ? 'bg-[var(--surface-2)]' : 'bg-[var(--surface)]'}`}
    >
      <span className="text-[0.72rem] font-semibold text-[var(--text-muted)] uppercase">{WHO_LABEL[message.who]}</span>
      <span className="[overflow-wrap:anywhere] whitespace-pre-wrap">{message.text}</span>
      <span className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
        {when(message.at)}
        {message.edited_at ? ' · edited' : ''}
        <span className="flex-1" />
        <IconButton action="edit" label="Edit this note" size="sm" disabled={disabled} onClick={() => setDraft(message.text)} />
        <IconButton action="delete" label="Delete note" size="sm" disabled={disabled} onClick={onDelete} />
      </span>
    </div>
  );
}

/**
 * "Notes on this finding" (mock Inspector thread, PF-1 part 7): the conversation about this spot, between the narrator and a proofer
 * or with themselves. A note is added as "My note" or "Proofer replied" (a reply pasted in), and each can be edited or deleted; a
 * delete offers Undo, which restores it in place. Every change is one append-only line on the host (`findingsThread`), so the thread
 * is kept with the decisions, is not a decision itself, and outlives a re-check. `onChanged` hands the page the finding as stored.
 */
export function FindingThread({ finding, api, onChanged }: { finding: Finding; api: FindingThreadApi; onChanged: (finding: Finding) => void }) {
  const overlay = useOverlay();
  const action = usePendingAction();
  // Pasting the proofer's reply is the common case (mock `who: 'proofer'`).
  const [who, setWho] = useState<FindingThreadAuthor>('proofer');
  const [reply, setReply] = useState('');
  const [failure, setFailure] = useState<string>();
  const thread = finding.review.thread ?? [];

  const send = async (change: FindingThreadChange): Promise<boolean> => {
    setFailure(undefined);
    try {
      onChanged(await api.findingsThread(finding.id, change));
      return true;
    } catch (error) {
      setFailure(`Not saved: ${describeApiError(error)}`);
      return false;
    }
  };
  const add = () =>
    action.run('add', async () => {
      if (await send({ op: 'add', who, text: reply })) setReply('');
    });
  const remove = (message: FindingThreadMessage) =>
    action.run(`delete-${message.id}`, async () => {
      if (!(await send({ op: 'delete', messageId: message.id }))) return;
      overlay.toastUndo('Deleted the note', async () => {
        try {
          onChanged(await api.findingsThread(finding.id, { op: 'restore', messageId: message.id }));
          return { ok: true };
        } catch (error) {
          return { ok: false, refusal: { reason: describeApiError(error) } };
        }
      });
    });

  return (
    <section aria-label="Notes on this finding" className="flex flex-col gap-2">
      <SectionLabel>Notes on this finding</SectionLabel>
      {thread.length ? (
        <div className="flex flex-col gap-1.5">
          {thread.map((message) => (
            <Message
              key={message.id}
              message={message}
              disabled={action.isPending(`delete-${message.id}`)}
              onEdit={(text) => send({ op: 'edit', messageId: message.id, text })}
              onDelete={() => void remove(message)}
            />
          ))}
        </div>
      ) : (
        <p className="text-sm text-[var(--text-muted)]">No notes yet.</p>
      )}
      <ToggleGroup
        label="Who wrote this"
        look="segmented"
        value={who}
        onChange={(value) => setWho(value as FindingThreadAuthor)}
        options={[
          { value: 'proofer', label: 'Proofer replied' },
          { value: 'you', label: 'My note' },
        ]}
      />
      <Field
        label="Add a note"
        textarea
        placeholder="Add a note or paste the proofer’s reply"
        value={reply}
        onChange={(value) => setReply([...value].slice(0, MAX_REVIEW_NOTE_LENGTH).join(''))}
      />
      <div className="flex">
        <Button variant="secondary" size="sm" disabled={reply.trim() === ''} pending={action.isPending('add')} onClick={() => void add()}>
          Add note
        </Button>
      </div>
      {failure && (
        <p role="alert" className="text-sm text-[var(--danger-text)]">
          {failure}
        </p>
      )}
    </section>
  );
}
